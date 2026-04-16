import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Bot,
  BrainCircuit,
  Film,
  ImagePlus,
  Loader2,
  MessageSquareText,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X
} from 'lucide-react';

import backgroundImage from '../assets/images/background.png';
import { DuplicateTabModal } from '../components/DuplicateTabModal';
import { Footer } from '../components/Footer';
import { GlobalSettingsModal } from '../components/GlobalSettingsModal';
import { MobileWarningModal } from '../components/MobileWarningModal';
import { WebGPUInstructionsModal } from '../components/WebGPUInstructionsModal';
import { WebLLMLoadingModal } from '../components/WebLLMLoadingModal';
import { useModal } from '../context/ModalContext';
import type {
  AssistantChatAttachment,
  AssistantChatMessage,
  AssistantChatSession,
  GlobalSettings
} from '../services/storage';
import { PageHeader } from '../components/PageHeader';
import {
  createAssistantChatTitle,
  loadAssistantChatWorkspace,
  loadGlobalSettings,
  saveAssistantChatWorkspace,
  saveGlobalSettings
} from '../services/storage';
import {
  AVAILABLE_WEB_LLM_MODELS,
  checkWebGPUSupport,
  DEFAULT_WEB_LLM_MODEL_ID,
  getCurrentWebLLMModel,
  getDefaultWebLlmModel,
  getWebLlmModelInfo,
  initWebLLM,
  isWebLLMLoaded,
  streamWebLLMChatResponse,
  webLlmModelSupportsVision,
  webLlmEvents,
  type WebLLMChatMessage
} from '../services/webLlmService';

const ASSISTANT_SYSTEM_PROMPT = `You are Origami Assistant, a helpful AI chatbot running locally in the browser through WebLLM.

Be clear, direct, and practical. You can help with writing, tutorials, presentations, product copy, coding questions, planning, and brainstorming.

Rules:
- Be honest when you are unsure.
- Prefer concise answers unless the user asks for depth.
- Use clean markdown when it improves readability.
- Do not claim to have internet access or live data unless the app explicitly provides it.`;

const EMPTY_STATE_PROMPTS = [
  'Rewrite this script so it sounds more confident and polished.',
  'Summarize these notes into clear action items.',
  'Help me outline a short tutorial video.',
  'Turn these bullets into a conversational explanation.',
];

const MAX_ASSISTANT_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_ASSISTANT_WEBM_BYTES = 20 * 1024 * 1024;

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  isEnabled: true,
  voice: 'af_heart',
  delay: 0.5,
  transition: 'fade',
  introFadeInEnabled: true,
  introFadeInDurationSec: 1,
  previewMode: 'modal',
};

const markWebLLMAsCached = () => {
  try {
    const current = JSON.parse(localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}');
    if (!current.webllm) {
      current.webllm = true;
      localStorage.setItem('resource_cache_status', JSON.stringify(current));
    }
  } catch {
    localStorage.setItem('resource_cache_status', '{"tts":false,"ffmpeg":false,"webllm":true}');
  }
};

const getModelName = (modelId: string | null | undefined): string | null => {
  if (!modelId) return null;
  return AVAILABLE_WEB_LLM_MODELS.find((model) => model.id === modelId)?.name || modelId;
};

const resolvePreferredAssistantModel = (
  configuredModelId: string | null | undefined,
  hasF16Support: boolean = true,
): string => {
  if (configuredModelId && AVAILABLE_WEB_LLM_MODELS.some((model) => model.id === configuredModelId)) {
    return configuredModelId;
  }
  return getDefaultWebLlmModel(hasF16Support);
};

const createEmptyAssistantChatSession = (): AssistantChatSession => {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title: 'New Chat',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
};

const sortAssistantSessions = (sessions: AssistantChatSession[]): AssistantChatSession[] => (
  [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
);

const createUserMessage = (content: string, attachment?: AssistantChatAttachment): AssistantChatMessage => ({
  id: crypto.randomUUID(),
  role: 'user',
  content,
  createdAt: Date.now(),
  attachment,
});

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      resolve(reader.result);
      return;
    }
    reject(new Error('Unable to read the selected attachment.'));
  };
  reader.onerror = () => reject(reader.error || new Error('Unable to read the selected attachment.'));
  reader.readAsDataURL(file);
});

const buildChatMessageContent = (message: AssistantChatMessage) => {
  if (message.attachment?.kind === 'image') {
    return [
      {
        type: 'text' as const,
        text: message.content || 'Please analyze this screenshot and help me with what is shown.',
      },
      {
        type: 'image_url' as const,
        image_url: {
          url: message.attachment.dataUrl,
        },
      },
    ];
  }

  if (message.attachment?.kind === 'video') {
    const baseText = message.content.trim() || `Please help me with the attached WebM clip "${message.attachment.name}".`;
    return `${baseText}

Attached file: ${message.attachment.name} (${message.attachment.mimeType}).
Important: you cannot directly inspect WebM or video attachments in this local chat interface. If the user asks you to analyze the clip itself, say that limitation plainly and then help based on their written description.`;
  }

  return message.content;
};

const formatChatTimestamp = (timestamp: number): string => (
  new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
);

export const AssistantPage: React.FC = () => {
  const { showAlert, showConfirm } = useModal();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageCountRef = useRef(0);

  const [chatSessions, setChatSessions] = useState<AssistantChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState<AssistantChatAttachment | null>(null);
  const [isReadingAttachment, setIsReadingAttachment] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);
  const [webGpuSupport, setWebGpuSupport] = useState<{ supported: boolean; hasF16: boolean; error?: string } | null>(null);
  const [loadedModelId, setLoadedModelId] = useState<string | null>(() => getCurrentWebLLMModel());
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWebGPUModalOpen, setIsWebGPUModalOpen] = useState(false);
  const [isWebLLMLoadingOpen, setIsWebLLMLoadingOpen] = useState(false);
  const [assistantModelSelection, setAssistantModelSelection] = useState(DEFAULT_WEB_LLM_MODEL_ID);
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);

  const configuredModelId = globalSettings.webLlmModel || null;
  const configuredModelName = getModelName(configuredModelId);
  const loadedModelName = getModelName(loadedModelId);
  const activeModelInfo = getWebLlmModelInfo(loadedModelId || configuredModelId);
  const activeModelSupportsVision = webLlmModelSupportsVision(loadedModelId || configuredModelId);
  const currentSession = (
    currentChatId
      ? chatSessions.find((session) => session.id === currentChatId)
      : null
  ) || chatSessions[0] || null;
  const messages = currentSession?.messages || [];
  const hasConversation = messages.length > 0;
  const isConfiguredForAssistant = Boolean(globalSettings.useWebLLM && configuredModelId);
  const selectableAssistantModels = AVAILABLE_WEB_LLM_MODELS.filter((model) => {
    if (webGpuSupport?.supported && !webGpuSupport.hasF16 && model.precision === 'f16') return false;
    return true;
  });
  const activeAssistantSelection = selectableAssistantModels.some((model) => model.id === assistantModelSelection)
    ? assistantModelSelection
    : (selectableAssistantModels[0]?.id || assistantModelSelection);

  const mutateSession = (
    sessionId: string,
    updater: (session: AssistantChatSession) => AssistantChatSession,
    shouldSort = true,
  ) => {
    setChatSessions((currentSessions) => {
      const nextSessions = currentSessions.map((session) => (
        session.id === sessionId ? updater(session) : session
      ));
      return shouldSort ? sortAssistantSessions(nextSessions) : nextSessions;
    });
  };

  const saveAssistantSettings = async (settings: GlobalSettings) => {
    await saveGlobalSettings(settings);
    setGlobalSettings(settings);
    setLoadedModelId(getCurrentWebLLMModel());
  };

  const initializeModel = async (modelId: string) => {
    setIsWebLLMLoadingOpen(true);
    try {
      await initWebLLM(modelId, () => { });
      setLoadedModelId(modelId);
      markWebLLMAsCached();
      return true;
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : 'Failed to initialize WebLLM.', {
        type: 'error',
        title: 'Model Load Failed',
      });
      return false;
    } finally {
      setIsWebLLMLoadingOpen(false);
    }
  };

  const ensureAssistantReady = async () => {
    const support = webGpuSupport ?? await checkWebGPUSupport();
    setWebGpuSupport(support);

    if (!support.supported) {
      setIsWebGPUModalOpen(true);
      return null;
    }

    if (!globalSettings.useWebLLM || !globalSettings.webLlmModel) {
      setIsSettingsOpen(true);
      return null;
    }

    if (isWebLLMLoaded() && getCurrentWebLLMModel() === globalSettings.webLlmModel) {
      setLoadedModelId(globalSettings.webLlmModel);
      return globalSettings.webLlmModel;
    }

    const initialized = await initializeModel(globalSettings.webLlmModel);
    return initialized ? globalSettings.webLlmModel : null;
  };

  useEffect(() => {
    let isMounted = true;

    const loadPage = async () => {
      const [savedSettings, savedWorkspace, support] = await Promise.all([
        loadGlobalSettings(),
        loadAssistantChatWorkspace(),
        checkWebGPUSupport(),
      ]);

      if (!isMounted) return;

      const initialSessions = savedWorkspace.sessions.length > 0
        ? savedWorkspace.sessions
        : [createEmptyAssistantChatSession()];
      const initialCurrentChatId = (
        savedWorkspace.currentChatId
        && initialSessions.some((session) => session.id === savedWorkspace.currentChatId)
      )
        ? savedWorkspace.currentChatId
        : initialSessions[0].id;

      const mergedSettings = savedSettings ? { ...DEFAULT_GLOBAL_SETTINGS, ...savedSettings } : DEFAULT_GLOBAL_SETTINGS;
      setGlobalSettings(mergedSettings);
      setChatSessions(sortAssistantSessions(initialSessions));
      setCurrentChatId(initialCurrentChatId);
      setWebGpuSupport(support);
      setLoadedModelId(getCurrentWebLLMModel());
      setAssistantModelSelection(resolvePreferredAssistantModel(mergedSettings.webLlmModel, support.hasF16));
      setIsBootstrapping(false);
    };

    loadPage().catch(() => {
      if (!isMounted) return;
      const initialSession = createEmptyAssistantChatSession();
      setGlobalSettings(DEFAULT_GLOBAL_SETTINGS);
      setChatSessions([initialSession]);
      setCurrentChatId(initialSession.id);
      setAssistantModelSelection(DEFAULT_WEB_LLM_MODEL_ID);
      setIsBootstrapping(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isBootstrapping) return;
    if (chatSessions.length === 0) {
      const initialSession = createEmptyAssistantChatSession();
      setChatSessions([initialSession]);
      setCurrentChatId(initialSession.id);
      return;
    }

    if (!currentChatId || !chatSessions.some((session) => session.id === currentChatId)) {
      setCurrentChatId(chatSessions[0].id);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveAssistantChatWorkspace({
        sessions: chatSessions,
        currentChatId,
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [chatSessions, currentChatId, isBootstrapping]);

  useEffect(() => {
    // Only scroll when a new message is added to the conversation, not when existing message content updates
    // This prevents scroll jank during streaming text generation
    if (messages.length > messageCountRef.current) {
      messageCountRef.current = messages.length;
      // Scroll the chat panel directly so sending a message does not move the full page.
      const timeoutId = window.setTimeout(() => {
        const container = messagesContainerRef.current;
        if (!container) return;
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'auto',
        });
      }, 0);
      return () => window.clearTimeout(timeoutId);
    } else if (messages.length === 0) {
      messageCountRef.current = 0;
    }
  }, [messages.length]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [input]);

  useEffect(() => {
    const handleInitComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ modelId?: string }>).detail;
      if (detail?.modelId) {
        setLoadedModelId(detail.modelId);
      } else {
        setLoadedModelId(getCurrentWebLLMModel());
      }
      markWebLLMAsCached();
    };

    const handleDeviceLost = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      setLoadedModelId(null);
      showAlert(detail.message, { type: 'warning', title: 'WebLLM Unloaded' });
    };

    webLlmEvents.addEventListener('webllm-init-complete', handleInitComplete);
    webLlmEvents.addEventListener('webllm-device-lost', handleDeviceLost);

    return () => {
      webLlmEvents.removeEventListener('webllm-init-complete', handleInitComplete);
      webLlmEvents.removeEventListener('webllm-device-lost', handleDeviceLost);
    };
  }, [showAlert]);

  useEffect(() => {
    setAssistantModelSelection(resolvePreferredAssistantModel(globalSettings.webLlmModel, webGpuSupport?.hasF16 ?? true));
  }, [globalSettings.webLlmModel, webGpuSupport?.hasF16]);

  const handleApplyAssistantModel = async () => {
    if (isSwitchingModel) return;

    const modelId = activeAssistantSelection;
    if (!modelId) return;

    const support = webGpuSupport ?? await checkWebGPUSupport();
    setWebGpuSupport(support);

    if (!support.supported) {
      setIsWebGPUModalOpen(true);
      return;
    }

    const selectedModel = getWebLlmModelInfo(modelId);
    if (!support.hasF16 && selectedModel?.precision === 'f16') {
      await showAlert('This model requires f16 WebGPU support. Choose an f32 model for compatibility.', {
        type: 'warning',
        title: 'Model Not Compatible',
      });
      return;
    }

    setIsSwitchingModel(true);
    try {
      const nextSettings: GlobalSettings = {
        ...globalSettings,
        useWebLLM: true,
        webLlmModel: modelId,
      };

      await saveAssistantSettings(nextSettings);

      const initialized = await initializeModel(modelId);
      if (!initialized) return;

      setLoadedModelId(modelId);
    } finally {
      setIsSwitchingModel(false);
    }
  };

  const handleCreateChat = () => {
    if (isSending) return;
    if (currentSession && currentSession.messages.length === 0 && !input.trim() && !pendingAttachment) return;

    const nextSession = createEmptyAssistantChatSession();
    setChatSessions((currentSessions) => sortAssistantSessions([nextSession, ...currentSessions]));
    setCurrentChatId(nextSession.id);
    setInput('');
    setPendingAttachment(null);
  };

  const handleSelectChat = (chatId: string) => {
    if (isSending || chatId === currentChatId) return;
    setCurrentChatId(chatId);
    setInput('');
    setPendingAttachment(null);
  };

  const handleClearChat = async () => {
    if (!currentSession || messages.length === 0) return;

    const confirmed = await showConfirm('Clear the messages in this chat? The saved chat entry will stay in your list.', {
      type: 'warning',
      title: 'Clear Chat',
      confirmText: 'Clear Messages',
    });

    if (!confirmed) return;

    mutateSession(currentSession.id, (session) => ({
      ...session,
      title: 'New Chat',
      messages: [],
      updatedAt: Date.now(),
    }));
    setInput('');
    setPendingAttachment(null);
  };

  const handleDeleteChat = async (chatId: string) => {
    if (isSending) return;

    const sessionToDelete = chatSessions.find((session) => session.id === chatId);
    if (!sessionToDelete) return;

    const confirmed = await showConfirm(`Delete "${sessionToDelete.title}"? This cannot be undone.`, {
      type: 'warning',
      title: 'Delete Saved Chat',
      confirmText: 'Delete Chat',
    });

    if (!confirmed) return;

    const deletingCurrentSession = currentChatId === chatId;
    setChatSessions((currentSessions) => {
      const remainingSessions = currentSessions.filter((session) => session.id !== chatId);
      if (remainingSessions.length === 0) {
        const fallbackSession = createEmptyAssistantChatSession();
        setCurrentChatId(fallbackSession.id);
        return [fallbackSession];
      }
      if (deletingCurrentSession) {
        setCurrentChatId(remainingSessions[0].id);
      }
      return remainingSessions;
    });

    if (deletingCurrentSession) {
      setInput('');
      setPendingAttachment(null);
    }
  };

  const handleAttachmentSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isWebm = file.type === 'video/webm' || file.name.toLowerCase().endsWith('.webm');

    if (!isImage && !isWebm) {
      await showAlert('Choose an image file or a WebM clip.', {
        type: 'warning',
        title: 'Unsupported File',
      });
      return;
    }

    if (isImage && file.size > MAX_ASSISTANT_IMAGE_BYTES) {
      await showAlert('Choose an image under 8 MB so it can be sent to the local vision model reliably.', {
        type: 'warning',
        title: 'Image Too Large',
      });
      return;
    }

    if (isWebm && file.size > MAX_ASSISTANT_WEBM_BYTES) {
      await showAlert('Choose a WebM clip under 20 MB so it stays lightweight in the browser.', {
        type: 'warning',
        title: 'WebM Too Large',
      });
      return;
    }

    setIsReadingAttachment(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setPendingAttachment({
        kind: isImage ? 'image' : 'video',
        dataUrl,
        mimeType: file.type || (isImage ? 'image/png' : 'video/webm'),
        name: file.name,
      });
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : 'Unable to load that attachment.', {
        type: 'error',
        title: 'Attachment Load Failed',
      });
    } finally {
      setIsReadingAttachment(false);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if ((!trimmed && !pendingAttachment) || isSending || isReadingAttachment || !currentSession) return;

    const modelId = await ensureAssistantReady();
    if (!modelId) return;

    if (pendingAttachment?.kind === 'image' && !webLlmModelSupportsVision(modelId)) {
      await showAlert('The selected WebLLM model is text-only. Switch to Phi 3.5 Vision to analyze screenshots locally.', {
        type: 'warning',
        title: 'Vision Model Required',
      });
      return;
    }

    const sessionId = currentSession.id;
    const userMessage = createUserMessage(trimmed, pendingAttachment || undefined);
    const assistantMessageId = crypto.randomUUID();
    const placeholderMessage: AssistantChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
    };

    const nextMessages = [...currentSession.messages, userMessage, placeholderMessage];
    mutateSession(sessionId, (session) => ({
      ...session,
      title: createAssistantChatTitle(nextMessages),
      messages: nextMessages,
      updatedAt: Date.now(),
    }));
    setInput('');
    setPendingAttachment(null);
    setIsSending(true);

    const chatMessages: WebLLMChatMessage[] = [
      { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
      ...nextMessages
        .filter((message) => message.id !== assistantMessageId)
        .map((message) => {
          if (message.role === 'user') {
            return { role: 'user', content: buildChatMessageContent(message) } as WebLLMChatMessage;
          }

          // assistant messages should have simple string content
          return { role: 'assistant', content: message.content } as WebLLMChatMessage;
        }),
    ];

    try {
      let fullResponse = '';

      for await (const chunk of streamWebLLMChatResponse(chatMessages, {
        temperature: 0.7,
        maxTokens: 768,
        resetChat: true,
      })) {
        fullResponse += chunk;
        mutateSession(sessionId, (session) => ({
          ...session,
          messages: session.messages.map((message) => (
            message.id === assistantMessageId
              ? { ...message, content: fullResponse }
              : message
          )),
        }), false);
      }

      if (!fullResponse.trim()) {
        throw new Error('The model returned an empty response.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The assistant could not generate a response.';
      mutateSession(sessionId, (session) => ({
        ...session,
        messages: session.messages.map((entry) => (
          entry.id === assistantMessageId
            ? { ...entry, content: `I hit an error while responding: ${message}` }
            : entry
        )),
      }), false);
    } finally {
      setIsSending(false);
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const renderSetupBanner = () => {
    if (!webGpuSupport?.supported) {
      return (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <div className="flex items-start gap-3">
            <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-2">
              <p className="font-semibold">WebGPU is required for the local assistant.</p>
              <p className="text-red-100/80">{webGpuSupport?.error || 'This browser or device does not currently support WebGPU.'}</p>
              <button
                onClick={() => setIsWebGPUModalOpen(true)}
                className="rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-red-100 transition-colors hover:bg-red-500/20"
              >
                View Setup Help
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (!isConfiguredForAssistant) {
      return (
        <div className="rounded-2xl border border-branding-primary/15 bg-branding-primary/8 px-4 py-3 text-sm text-branding-primary/90">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-branding-primary" />
            <div className="space-y-2">
              <p className="font-semibold">Choose a WebLLM model from the picker below to start chatting.</p>
              <p className="text-branding-primary/70">You can also open Settings for advanced WebLLM options. The assistant runs locally on your device.</p>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="rounded-xl border border-branding-primary/20 bg-branding-primary/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-branding-primary/90 transition-colors hover:bg-branding-primary/20"
              >
                Open Settings
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-branding-dark text-white">
      <PageHeader
        title="AI Assistant"
        onSettings={() => setIsSettingsOpen(true)}
        showHelp={false}
        actionMenuContent={(closeMenu) => (
          <>
            <button
              onClick={() => { handleCreateChat(); closeMenu(); }}
              disabled={isSending}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="h-4 w-4" /> New Chat
            </button>
            <button
              onClick={() => { void handleClearChat(); closeMenu(); }}
              disabled={!hasConversation || isSending}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" /> Clear Chat
            </button>
          </>
        )}
        rightContent={
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-branding-primary/60">
            <Bot className="h-4 w-4 text-branding-primary" />
            <span>{loadedModelName || configuredModelName || 'Setup required'}</span>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 min-h-0 px-2 sm:px-3 md:px-4 lg:px-6 xl:px-8">
          <main className="mx-auto flex h-full min-h-0 w-full flex-1 flex-col">
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden glass rounded-3xl border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/30 backdrop-blur-2xl">
          <div className="border-b border-white/10 bg-white/5 px-5 py-5 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-branding-primary/60">Local Chat</p>
                <h2 className="mt-1 text-xl font-black text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-500 to-purple-600 sm:text-2xl">AI Assistant</h2>
              </div>
              <div className="text-xs text-white/45">
                {chatSessions.length} saved {chatSessions.length === 1 ? 'chat' : 'chats'} on this device
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-white/10 bg-white/[0.02] lg:w-[300px] lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-branding-primary/50">Saved Chats</p>
                  <p className="mt-1 text-sm text-white/70">Recent local conversations</p>
                </div>
                <button
                  onClick={handleCreateChat}
                  disabled={isSending}
                  className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  title="Start a new chat"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="custom-scrollbar max-h-[260px] overflow-y-auto px-3 py-3 lg:max-h-none lg:min-h-0 lg:flex-1">
                <div className="space-y-2">
                  {chatSessions.map((session) => {
                    const isActive = session.id === currentSession?.id;
                    const previewMessage = session.messages.find((message) => message.content.trim() || message.attachment);

                    return (
                      <div
                        key={session.id}
                        className={`w-full rounded-2xl border px-3 py-3 transition-all ${
                          isActive
                            ? 'border-branding-primary/30 bg-branding-primary/10 shadow-lg shadow-branding-primary/5'
                            : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            onClick={() => handleSelectChat(session.id)}
                            disabled={isSending}
                            className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <p className="truncate text-sm font-semibold text-white">{session.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">
                              {previewMessage?.content.trim()
                                || (previewMessage?.attachment?.kind === 'video'
                                  ? `Attached WebM: ${previewMessage.attachment.name}`
                                  : previewMessage?.attachment
                                    ? `Attached image: ${previewMessage.attachment.name}`
                                    : 'Empty conversation')}
                            </p>
                            <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-white/35">
                              <span>{session.messages.length} msg</span>
                              <span>{formatChatTimestamp(session.updatedAt)}</span>
                            </div>
                          </button>

                          <div className="flex items-center gap-1">
                            {session.messages.some((message) => message.attachment) && (
                              <span className="rounded-full border border-white/10 bg-white/5 p-1 text-white/50">
                                {session.messages.some((message) => message.attachment?.kind === 'video')
                                  ? <Film className="h-3.5 w-3.5" />
                                  : <ImagePlus className="h-3.5 w-3.5" />}
                              </span>
                            )}
                            <button
                              onClick={() => void handleDeleteChat(session.id)}
                              disabled={isSending}
                              className="rounded-full border border-white/10 bg-white/5 p-1.5 text-white/45 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
                              title="Delete saved chat"
                              aria-label={`Delete chat ${session.title}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </aside>

            <div className="flex min-h-0 flex-1 flex-col">
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6" ref={messagesContainerRef}>
            {isBootstrapping ? (
              <div className="flex h-full items-center justify-center">
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
                  <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
                  Restoring your assistant workspace...
                </div>
              </div>
            ) : (
              <div className="mx-auto flex h-full w-full max-w-7xl flex-col">
                <div className="mb-4">
                  {renderSetupBanner()}
                </div>

                {!hasConversation ? (
                  <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-branding-primary/15 bg-branding-primary/10">
                      <MessageSquareText className="h-7 w-7 text-branding-primary" />
                    </div>
                    <h3 className="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-500 to-purple-600">How can I help?</h3>
                    <p className="mt-3 max-w-2xl text-sm text-white/55 sm:text-base">
                      Ask for rewrites, summaries, brainstorming, planning, or help drafting tutorials and presentations.
                      {activeModelSupportsVision
                        ? ' You can also attach a screenshot or a WebM clip to keep it with the chat.'
                        : ' You can also attach a WebM clip to keep it with the chat.'}
                    </p>

                    <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
                      {EMPTY_STATE_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => {
                            setInput(prompt);
                            textareaRef.current?.focus();
                          }}
                          className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left text-sm text-white/80 transition-colors hover:border-branding-primary/20 hover:bg-branding-primary/5 hover:text-white"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {messages.map((message, index) => {
                      const isAssistant = message.role === 'assistant';
                      const isEmptyStreamingMessage = isAssistant && !message.content && isSending && index === messages.length - 1;

                      return (
                        <div
                          key={message.id}
                          className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
                        >
                          <div className={`max-w-[95%] rounded-2xl border px-4 py-3 sm:max-w-[85%] lg:max-w-[65%] ${isAssistant
                            ? 'border-white/10 bg-white/[0.05] text-white'
                            : 'border-branding-primary/20 bg-branding-primary/10 text-branding-primary/95'
                            }`}
                          >
                            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-branding-primary/60">
                              {isAssistant ? <Bot className="h-3.5 w-3.5 text-branding-primary" /> : <MessageSquareText className="h-3.5 w-3.5 text-branding-primary" />}
                              {isAssistant ? 'Assistant' : 'You'}
                            </div>
                            {isEmptyStreamingMessage ? (
                              <div className="flex items-center gap-2 text-sm text-white/60">
                                <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                                Thinking...
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {message.attachment?.kind === 'image' && (
                                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                                    <img
                                      src={message.attachment.dataUrl}
                                      alt={message.attachment.name}
                                      className="max-h-80 w-full object-contain"
                                    />
                                    <div className="border-t border-white/10 px-3 py-2 text-[11px] text-white/50">
                                      {message.attachment.name}
                                    </div>
                                  </div>
                                )}
                                {message.attachment?.kind === 'video' && (
                                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                                    <video
                                      src={message.attachment.dataUrl}
                                      controls
                                      className="max-h-80 w-full bg-black"
                                    />
                                    <div className="border-t border-white/10 px-3 py-2 text-[11px] text-white/50">
                                      {message.attachment.name}
                                    </div>
                                  </div>
                                )}
                                {message.content ? (
                                  <div className="prose prose-invert max-w-none text-sm leading-7 text-white/90">
                                    <ReactMarkdown
                                      components={{
                                        p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                                        ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-2 space-y-1" {...props} />,
                                        ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-2 space-y-1" {...props} />,
                                        li: ({ node, ...props }) => <li className="ml-0" {...props} />,
                                        blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-cyan-400/30 pl-3 italic text-white/75 mb-2" {...props} />,
                                        code: ({ node, inline, ...props }) => 
                                          inline 
                                            ? <code className="bg-black/30 rounded px-1.5 py-0.5 font-mono text-xs text-cyan-200" {...props} />
                                            : <code className="block bg-black/30 rounded px-3 py-2 font-mono text-xs text-cyan-200 overflow-x-auto mb-2" {...props} />,
                                        pre: ({ node, ...props }) => <pre className="bg-black/30 rounded p-3 overflow-x-auto mb-2" {...props} />,
                                        h1: ({ node, ...props }) => <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0" {...props} />,
                                        h2: ({ node, ...props }) => <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0" {...props} />,
                                        h3: ({ node, ...props }) => <h3 className="text-base font-bold mb-2 mt-2 first:mt-0" {...props} />,
                                        strong: ({ node, ...props }) => <strong className="font-bold text-white" {...props} />,
                                        em: ({ node, ...props }) => <em className="italic" {...props} />,
                                        a: ({ node, ...props }) => <a className="text-cyan-300 underline hover:text-cyan-200" {...props} />,
                                        hr: ({ node, ...props }) => <hr className="border-white/10 my-3" {...props} />,
                                      }}
                                    >
                                      {message.content}
                                    </ReactMarkdown>
                                  </div>
                                ) : message.attachment ? (
                                  <div className="text-sm text-white/60">
                                    {message.attachment.kind === 'video' ? 'Attached WebM clip' : 'Attached screenshot'}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

              <div className="border-t border-white/10 bg-white/[0.02] p-3 sm:p-4">
                <div className="mx-auto w-full max-w-7xl rounded-2xl border border-white/10 bg-white/[0.04] p-3 shadow-inner shadow-black/20">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/webm,.webm"
                onChange={handleAttachmentSelection}
                className="hidden"
              />

              {pendingAttachment && (
                <div className="mb-3 flex items-start gap-3 rounded-2xl border border-branding-primary/20 bg-branding-primary/10 p-3">
                  {pendingAttachment.kind === 'image' ? (
                    <img
                      src={pendingAttachment.dataUrl}
                      alt={pendingAttachment.name}
                      className="h-20 w-24 rounded-xl object-cover"
                    />
                  ) : (
                    <video
                      src={pendingAttachment.dataUrl}
                      className="h-20 w-24 rounded-xl bg-black object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-branding-primary/95">{pendingAttachment.name}</p>
                    <p className="mt-1 text-xs text-branding-primary/70">
                      {pendingAttachment.kind === 'image'
                        ? 'This image will be sent to the local vision model with your message.'
                        : 'This WebM clip will be saved with the chat. The model can only respond to the written description you provide about it.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setPendingAttachment(null)}
                    className="rounded-lg border border-branding-primary/20 bg-black/20 p-2 text-branding-primary/70 transition-colors hover:text-branding-primary"
                    title="Remove attachment"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  isConfiguredForAssistant
                    ? activeModelSupportsVision
                      ? 'Message Origami Assistant or attach an image/WebM clip...'
                      : 'Message Origami Assistant or attach a WebM clip...'
                    : 'Pick a WebLLM model below, then click Download / Use.'
                }
                disabled={isBootstrapping || isSending || isReadingAttachment}
                className="max-h-[220px] min-h-[60px] w-full resize-none bg-transparent px-2 py-1 text-sm leading-7 text-white outline-none placeholder:text-white/35"
              />

              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">Model</span>
                    <select
                      value={activeAssistantSelection}
                      onChange={(event) => setAssistantModelSelection(event.target.value)}
                      disabled={isBootstrapping || isSending || isReadingAttachment || isSwitchingModel || selectableAssistantModels.length === 0}
                      className="h-8 w-full max-w-[260px] min-w-[160px] rounded-lg border border-white/10 bg-black px-2.5 text-xs text-white outline-none transition-all focus:border-branding-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {selectableAssistantModels.map((model) => (
                        <option key={model.id} value={model.id} className="bg-black text-white">
                          {`${model.name} (${model.precision.toUpperCase()})`}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => void handleApplyAssistantModel()}
                      disabled={isBootstrapping || isSending || isReadingAttachment || isSwitchingModel || selectableAssistantModels.length === 0}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-branding-primary/25 bg-branding-primary/10 px-3 text-xs font-bold text-branding-primary transition-all hover:bg-branding-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSwitchingModel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {isSwitchingModel
                        ? 'Loading'
                        : (loadedModelId === activeAssistantSelection ? 'Ready' : 'Use')}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isSending || isBootstrapping || isReadingAttachment || isSwitchingModel}
                      className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/80 transition-all hover:border-branding-primary/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      title="Attach an image or WebM clip"
                    >
                      {isReadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                      Attach
                    </button>
                    <button
                      onClick={() => void handleSend()}
                      disabled={(!input.trim() && !pendingAttachment) || isSending || isBootstrapping || isReadingAttachment || isSwitchingModel}
                      className="inline-flex items-center gap-2 rounded-2xl bg-branding-primary px-4 py-2.5 text-sm font-black text-black transition-all hover:bg-branding-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Send
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-white/40">
                  {loadedModelName
                    ? `Running locally with ${loadedModelName}${activeModelInfo?.capabilities?.includes('vision') ? ' (vision enabled).' : '.'}`
                    : configuredModelName
                      ? `${configuredModelName} is selected. Send a message to load it.`
                      : 'No WebLLM model selected yet.'}
                </div>
                <div className="text-[11px] text-white/30">
                  {activeModelInfo
                    ? `${activeModelInfo.size ?? 'Unknown size'}${activeModelInfo.capabilities?.includes('vision') ? ' • Vision + text' : ' • Text only'}`
                    : ''}
                </div>
              </div>
              </div>
            </div>
              </div>
            </div>
          </div>
          </section>
        </main>
        </div>
      </div>

      <Footer />

      <WebLLMLoadingModal
        isOpen={isWebLLMLoadingOpen}
        onComplete={() => setIsWebLLMLoadingOpen(false)}
      />

      {isSettingsOpen && (
        <GlobalSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentSettings={globalSettings}
          onSave={saveAssistantSettings}
          initialTab="webllm"
          onShowWebGPUModal={() => setIsWebGPUModalOpen(true)}
        />
      )}

      <WebGPUInstructionsModal
        isOpen={isWebGPUModalOpen}
        onClose={() => setIsWebGPUModalOpen(false)}
      />

      <DuplicateTabModal />
      <MobileWarningModal />

      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 h-lvh w-full scale-105 object-cover opacity-40 blur-[2px] brightness-75"
      />
    </div>
  );
};
