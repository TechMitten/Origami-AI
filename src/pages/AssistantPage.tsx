import React, { useEffect, useRef, useState } from 'react';
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
  getCurrentWebLLMModel,
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

      setGlobalSettings(savedSettings ? { ...DEFAULT_GLOBAL_SETTINGS, ...savedSettings } : DEFAULT_GLOBAL_SETTINGS);
      setChatSessions(sortAssistantSessions(initialSessions));
      setCurrentChatId(initialCurrentChatId);
      setWebGpuSupport(support);
      setLoadedModelId(getCurrentWebLLMModel());
      setIsBootstrapping(false);
    };

    loadPage().catch(() => {
      if (!isMounted) return;
      const initialSession = createEmptyAssistantChatSession();
      setGlobalSettings(DEFAULT_GLOBAL_SETTINGS);
      setChatSessions([initialSession]);
      setCurrentChatId(initialSession.id);
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
        <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/8 px-4 py-3 text-sm text-white/85">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
            <div className="space-y-2">
              <p className="font-semibold">Choose and load a WebLLM model in Settings to start chatting.</p>
              <p className="text-white/60">Once configured, the assistant runs locally on your device with the existing WebLLM setup.</p>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-100 transition-colors hover:bg-cyan-400/20"
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
    <div className="page-zoom-130 flex h-dvh flex-col overflow-hidden bg-branding-dark text-white">
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
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white/60">
            <Bot className="h-4 w-4 text-cyan-300" />
            <span>{loadedModelName || configuredModelName || 'Setup required'}</span>
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-8">
        <div className="flex-1 min-h-0 px-4 pb-2 sm:px-6 lg:px-8">
          <main className="mx-auto flex h-full min-h-0 max-w-6xl flex-1 flex-col pb-8">
          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0f14]/90 shadow-2xl shadow-black/30 backdrop-blur-2xl">
          <div className="border-b border-white/10 px-5 py-4 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300/60">Local Chat</p>
                <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">A streamlined WebLLM assistant</h2>
              </div>
              <div className="text-xs text-white/45">
                {chatSessions.length} saved {chatSessions.length === 1 ? 'chat' : 'chats'} on this device
              </div>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <aside className="flex min-h-0 w-full shrink-0 flex-col border-b border-white/10 bg-black/10 lg:w-[300px] lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/40">Saved Chats</p>
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
                      <button
                        key={session.id}
                        onClick={() => handleSelectChat(session.id)}
                        disabled={isSending}
                        className={`w-full rounded-2xl border px-3 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                          isActive
                            ? 'border-cyan-400/30 bg-cyan-400/12 shadow-lg shadow-cyan-500/5'
                            : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{session.title}</p>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/50">
                              {previewMessage?.content.trim()
                                || (previewMessage?.attachment?.kind === 'video'
                                  ? `Attached WebM: ${previewMessage.attachment.name}`
                                  : previewMessage?.attachment
                                    ? `Attached image: ${previewMessage.attachment.name}`
                                    : 'Empty conversation')}
                            </p>
                          </div>
                          {session.messages.some((message) => message.attachment) && (
                            <span className="rounded-full border border-white/10 bg-white/5 p-1 text-white/50">
                              {session.messages.some((message) => message.attachment?.kind === 'video')
                                ? <Film className="h-3.5 w-3.5" />
                                : <ImagePlus className="h-3.5 w-3.5" />}
                            </span>
                          )}
                        </div>
                        <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-white/35">
                          <span>{session.messages.length} msg</span>
                          <span>{formatChatTimestamp(session.updatedAt)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6" ref={messagesContainerRef}>
            {isBootstrapping ? (
              <div className="flex h-full items-center justify-center">
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm text-white/70">
                  <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
                  Restoring your assistant workspace...
                </div>
              </div>
            ) : (
              <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
                <div className="mb-4">
                  {renderSetupBanner()}
                </div>

                {!hasConversation ? (
                  <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/10">
                      <MessageSquareText className="h-7 w-7 text-cyan-300" />
                    </div>
                    <h3 className="text-3xl font-black tracking-tight text-white">How can I help?</h3>
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
                          className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-left text-sm text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
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
                          <div className={`max-w-[92%] rounded-[1.75rem] border px-4 py-3 sm:max-w-[80%] ${isAssistant
                            ? 'border-white/10 bg-white/[0.05] text-white'
                            : 'border-cyan-400/20 bg-cyan-400/10 text-cyan-50'
                            }`}
                          >
                            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-white/45">
                              {isAssistant ? <Bot className="h-3.5 w-3.5" /> : <MessageSquareText className="h-3.5 w-3.5" />}
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
                                  <div className="whitespace-pre-wrap text-sm leading-7 text-white/90">
                                    {message.content}
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

              <div className="border-t border-white/10 bg-black/20 p-4 sm:p-5">
                <div className="mx-auto w-full max-w-4xl rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-3 shadow-inner shadow-black/20">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/webm,.webm"
                onChange={handleAttachmentSelection}
                className="hidden"
              />

              {pendingAttachment && (
                <div className="mb-3 flex items-start gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3">
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
                    <p className="truncate text-sm font-semibold text-cyan-50">{pendingAttachment.name}</p>
                    <p className="mt-1 text-xs text-cyan-100/70">
                      {pendingAttachment.kind === 'image'
                        ? 'This image will be sent to the local vision model with your message.'
                        : 'This WebM clip will be saved with the chat. The model can only respond to the written description you provide about it.'}
                    </p>
                  </div>
                  <button
                    onClick={() => setPendingAttachment(null)}
                    className="rounded-lg border border-cyan-300/20 bg-black/20 p-2 text-cyan-100/70 transition-colors hover:text-cyan-50"
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
                    : 'Open Settings to choose and load a WebLLM model first.'
                }
                disabled={isBootstrapping || isSending || isReadingAttachment}
                className="max-h-[220px] min-h-[60px] w-full resize-none bg-transparent px-2 py-1 text-sm leading-7 text-white outline-none placeholder:text-white/35"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-white/40">
                  {loadedModelName
                    ? `Running locally with ${loadedModelName}${activeModelInfo?.capabilities?.includes('vision') ? ' (vision enabled).' : '.'}`
                    : configuredModelName
                      ? `${configuredModelName} is selected. Send a message to load it.`
                      : 'No WebLLM model selected yet.'}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSending || isBootstrapping || isReadingAttachment}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/80 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                    title="Attach an image or WebM clip"
                  >
                    {isReadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    Attach
                  </button>
                  <button
                    onClick={() => void handleSend()}
                    disabled={(!input.trim() && !pendingAttachment) || isSending || isBootstrapping || isReadingAttachment}
                    className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-black transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send
                  </button>
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
