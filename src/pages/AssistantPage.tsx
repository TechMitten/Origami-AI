import React, { useEffect, useRef, useState } from 'react';
import { BrainCircuit, MessageSquarePlus, PanelLeft, Plus, Trash2 } from 'lucide-react';
import backgroundImage from '../assets/images/background.png';
import { Footer } from '../components/Footer';
import { GlobalSettingsModal } from '../components/GlobalSettingsModal';
import { MobileWarningModal } from '../components/MobileWarningModal';
import { ModelSelectorModal } from '../components/ModelSelectorModal';
import { PageHeader } from '../components/PageHeader';
import { WebGPUInstructionsModal } from '../components/WebGPUInstructionsModal';
import { WebLLMLoadingModal } from '../components/WebLLMLoadingModal';
import { ChatComposer, type EngineState } from '../components/assistant/ChatComposer';
import { ChatEmptyState } from '../components/assistant/ChatEmptyState';
import { ChatMessages } from '../components/assistant/ChatMessages';
import { ChatRail } from '../components/assistant/ChatRail';
import { useModal } from '../context/ModalContext';
import type {
  AssistantChatAttachment,
  AssistantChatMessage,
  AssistantChatSession,
  GlobalSettings
} from '../services/storage';
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
  interruptWebLLMGeneration,
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
  aspectRatio: '16:9',
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

export const AssistantPage: React.FC = () => {
  const { showAlert, showConfirm } = useModal();
  // Set while a reply is being stopped, so the token loop can bail between
  // chunks without unwinding the generator mid-write.
  const stopRequestedRef = useRef(false);

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
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWebGPUModalOpen, setIsWebGPUModalOpen] = useState(false);
  const [isWebLLMLoadingOpen, setIsWebLLMLoadingOpen] = useState(false);
  const [assistantModelSelection, setAssistantModelSelection] = useState(DEFAULT_WEB_LLM_MODEL_ID);
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);
  const [isRailOpen, setIsRailOpen] = useState(false);

  const currentSession = (
    currentChatId
      ? chatSessions.find((session) => session.id === currentChatId)
      : null
  ) || chatSessions[0] || null;
  const messages = currentSession?.messages || [];
  const hasConversation = messages.length > 0;

  const selectableAssistantModels = AVAILABLE_WEB_LLM_MODELS.filter((model) => {
    if (webGpuSupport?.supported && !webGpuSupport.hasF16 && model.precision === 'f16') return false;
    return true;
  });
  const activeAssistantSelection = selectableAssistantModels.some((model) => model.id === assistantModelSelection)
    ? assistantModelSelection
    : (selectableAssistantModels.find((model) => model.id === DEFAULT_WEB_LLM_MODEL_ID)?.id
      || selectableAssistantModels[0]?.id
      || assistantModelSelection);

  // The dock speaks about the model you would send to next: the selection,
  // which only reads "Ready" once those exact weights are the ones in memory.
  const dockModelId = activeAssistantSelection || globalSettings.webLlmModel || null;
  const dockModelInfo = getWebLlmModelInfo(dockModelId);
  const dockModelName = getModelName(dockModelId);
  const dockSupportsVision = webLlmModelSupportsVision(dockModelId);
  const engineState: EngineState = isSwitchingModel || isWebLLMLoadingOpen
    ? 'loading'
    : !dockModelId
      ? 'none'
      : loadedModelId === dockModelId
        ? 'ready'
        : 'idle';

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

  /**
   * Resolves the model a send should use. Sending is the request, so an unset
   * model is answered by loading the current selection rather than by bouncing
   * the message into a settings modal.
   */
  const ensureAssistantReady = async (): Promise<string | null> => {
    const support = webGpuSupport ?? await checkWebGPUSupport();
    setWebGpuSupport(support);

    if (!support.supported) {
      setIsWebGPUModalOpen(true);
      return null;
    }

    const modelId = globalSettings.webLlmModel || activeAssistantSelection;
    if (!modelId) {
      setIsModelModalOpen(true);
      return null;
    }

    if (isWebLLMLoaded() && getCurrentWebLLMModel() === modelId) {
      setLoadedModelId(modelId);
      return modelId;
    }

    if (globalSettings.webLlmModel !== modelId || !globalSettings.useWebLLM) {
      await saveAssistantSettings({ ...globalSettings, useWebLLM: true, webLlmModel: modelId });
    }

    const initialized = await initializeModel(modelId);
    return initialized ? modelId : null;
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

  useEffect(() => {
    if (!isRailOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsRailOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRailOpen]);

  const handleApplyAssistantModel = async (requestedModelId?: string) => {
    if (isSwitchingModel) return;

    const modelId = requestedModelId || activeAssistantSelection;
    if (!modelId) return;

    const support = webGpuSupport ?? await checkWebGPUSupport();
    setWebGpuSupport(support);

    if (!support.supported) {
      setIsWebGPUModalOpen(true);
      return;
    }

    const selectedModel = getWebLlmModelInfo(modelId);
    if (!support.hasF16 && selectedModel?.precision === 'f16') {
      await showAlert('This model needs f16 WebGPU support, which this device does not report. Choose an f32 model instead.', {
        type: 'warning',
        title: 'Model Not Compatible',
      });
      return;
    }

    setIsSwitchingModel(true);
    try {
      await saveAssistantSettings({
        ...globalSettings,
        useWebLLM: true,
        webLlmModel: modelId,
      });

      const initialized = await initializeModel(modelId);
      if (!initialized) return;

      setLoadedModelId(modelId);
    } finally {
      setIsSwitchingModel(false);
    }
  };

  const handleCreateChat = () => {
    if (isSending) return;
    setIsRailOpen(false);
    if (currentSession && currentSession.messages.length === 0 && !input.trim() && !pendingAttachment) return;

    const nextSession = createEmptyAssistantChatSession();
    setChatSessions((currentSessions) => sortAssistantSessions([nextSession, ...currentSessions]));
    setCurrentChatId(nextSession.id);
    setInput('');
    setPendingAttachment(null);
  };

  const handleSelectChat = (chatId: string) => {
    setIsRailOpen(false);
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

  const handleAttachFile = async (file: File) => {
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

  /**
   * Streams one reply into `assistantMessageId`. Kept separate from sending so
   * a failed reply can be run again from the transcript without re-posting the
   * question that produced it.
   */
  const streamAssistantReply = async (
    sessionId: string,
    history: AssistantChatMessage[],
    assistantMessageId: string,
  ) => {
    const chatMessages: WebLLMChatMessage[] = [
      { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
      ...history.map((message) => (
        message.role === 'user'
          ? { role: 'user', content: buildChatMessageContent(message) } as WebLLMChatMessage
          : { role: 'assistant', content: message.content } as WebLLMChatMessage
      )),
    ];

    stopRequestedRef.current = false;
    setIsSending(true);

    try {
      let fullResponse = '';

      for await (const chunk of streamWebLLMChatResponse(chatMessages, {
        temperature: 0.7,
        maxTokens: 768,
        resetChat: true,
      })) {
        if (stopRequestedRef.current) break;

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

      if (stopRequestedRef.current) {
        // Stopping before the first token leaves nothing worth keeping.
        if (!fullResponse.trim()) {
          mutateSession(sessionId, (session) => ({
            ...session,
            messages: session.messages.filter((message) => message.id !== assistantMessageId),
          }), false);
        }
        return;
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
            ? { ...entry, content: `This reply failed: ${message}`, isError: true }
            : entry
        )),
      }), false);
    } finally {
      setIsSending(false);
      stopRequestedRef.current = false;
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if ((!trimmed && !pendingAttachment) || isSending || isReadingAttachment || !currentSession) return;

    const modelId = await ensureAssistantReady();
    if (!modelId) return;

    if (pendingAttachment?.kind === 'image' && !webLlmModelSupportsVision(modelId)) {
      await showAlert('This model reads text only. Switch to a vision model, such as Phi 3.5 Vision, to send screenshots.', {
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

    const history = [...currentSession.messages, userMessage];
    mutateSession(sessionId, (session) => ({
      ...session,
      title: createAssistantChatTitle([...history, placeholderMessage]),
      messages: [...history, placeholderMessage],
      updatedAt: Date.now(),
    }));
    setInput('');
    setPendingAttachment(null);

    await streamAssistantReply(sessionId, history, assistantMessageId);
  };

  const handleStopGenerating = () => {
    if (!isSending) return;
    stopRequestedRef.current = true;
    interruptWebLLMGeneration();
  };

  const handleRetryMessage = async (messageId: string) => {
    if (isSending || !currentSession) return;

    const session = currentSession;
    const messageIndex = session.messages.findIndex((message) => message.id === messageId);
    if (messageIndex < 0) return;

    const modelId = await ensureAssistantReady();
    if (!modelId) return;

    mutateSession(session.id, (entry) => ({
      ...entry,
      messages: entry.messages.map((message) => (
        message.id === messageId
          ? { ...message, content: '', isError: undefined, createdAt: Date.now() }
          : message
      )),
    }), false);

    await streamAssistantReply(session.id, session.messages.slice(0, messageIndex), messageId);
  };

  const handleUsePrompt = (prompt: string) => {
    setInput(prompt);
    // The textarea lives in the composer; the label it is addressed by is its id.
    const composer = document.getElementById('assistant-composer') as HTMLTextAreaElement | null;
    composer?.focus();
  };

  return (
    <div className="isolate flex h-dvh flex-col overflow-hidden bg-[#0a0a0b] text-white">
      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 h-lvh w-full scale-105 object-cover opacity-40 blur-[2px] brightness-50"
      />
      <div className="fixed inset-0 -z-40 h-lvh w-full bg-[#0a0a0b]/50" />

      <PageHeader
        title="AI Assistant"
        onSettings={() => setIsSettingsOpen(true)}
        showHelp={false}
        // The page fills the viewport, so the header's usual breathing room
        // below it would come straight out of the transcript.
        className="mb-0!"
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
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden border-t border-white/[0.06]">
        <ChatRail
          className="hidden lg:flex"
          sessions={chatSessions}
          currentChatId={currentSession?.id ?? null}
          disabled={isSending}
          onSelect={handleSelectChat}
          onCreate={handleCreateChat}
          onDelete={(chatId) => void handleDeleteChat(chatId)}
        />

        {/* Below lg the rail slides over the transcript instead of stacking on
            top of it, so the chat itself keeps the whole screen. */}
        {isRailOpen && (
          <>
            <button
              type="button"
              aria-label="Close chat list"
              onClick={() => setIsRailOpen(false)}
              className="absolute inset-0 z-20 bg-black/60 backdrop-blur-sm lg:hidden"
            />
            <ChatRail
              className="absolute inset-y-0 left-0 z-30 shadow-2xl shadow-black/60 lg:hidden"
              sessions={chatSessions}
              currentChatId={currentSession?.id ?? null}
              disabled={isSending}
              onSelect={handleSelectChat}
              onCreate={handleCreateChat}
              onDelete={(chatId) => void handleDeleteChat(chatId)}
              onClose={() => setIsRailOpen(false)}
            />
          </>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2 lg:hidden">
            <button
              type="button"
              onClick={() => setIsRailOpen(true)}
              className="focus-ring flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-white/60 transition-colors hover:text-white"
            >
              <PanelLeft className="h-4 w-4" />
              Chats
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-xs text-white/40">
              {currentSession?.title || 'New Chat'}
            </p>
            <button
              type="button"
              onClick={handleCreateChat}
              disabled={isSending}
              className="focus-ring rounded-lg p-1.5 text-white/60 transition-colors hover:text-white disabled:opacity-40"
              aria-label="Start a new chat"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </button>
          </div>

          {/* Only a hard blocker earns a banner. A missing model is stated by the
              dock above the composer, next to the button that fixes it. */}
          {webGpuSupport && !webGpuSupport.supported && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-red-500/20 bg-red-500/[0.08] px-4 py-2.5 text-sm text-red-100 sm:px-6">
              <BrainCircuit className="h-4 w-4 shrink-0 text-red-300" />
              <p className="min-w-0 flex-1">
                <span className="font-semibold">This browser cannot run the assistant.</span>{' '}
                <span className="text-red-100/70">
                  {webGpuSupport.error || 'WebGPU is unavailable on this device.'}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setIsWebGPUModalOpen(true)}
                className="focus-ring rounded-lg border border-red-400/30 px-2.5 py-1 text-xs font-bold text-red-100 transition-colors hover:bg-red-500/15"
              >
                How to enable it
              </button>
            </div>
          )}

          <ChatMessages
            messages={messages}
            isStreaming={isSending}
            onRetry={(messageId) => void handleRetryMessage(messageId)}
            emptyState={
              isBootstrapping ? (
                <div className="flex h-full items-center justify-center text-sm text-white/40">
                  Restoring your chats...
                </div>
              ) : (
                <ChatEmptyState
                  modelName={dockModelName}
                  modelSize={dockModelInfo?.size}
                  supportsVision={dockSupportsVision}
                  isModelLoaded={engineState === 'ready'}
                  onUsePrompt={handleUsePrompt}
                />
              )
            }
          />

          <ChatComposer
            value={input}
            onChange={setInput}
            onSend={() => void handleSend()}
            onStop={handleStopGenerating}
            isStreaming={isSending}
            isDisabled={isBootstrapping}
            attachment={pendingAttachment}
            onAttachFile={(file) => void handleAttachFile(file)}
            onRemoveAttachment={() => setPendingAttachment(null)}
            isReadingAttachment={isReadingAttachment}
            acceptsImages={dockSupportsVision}
            engineState={engineState}
            modelName={dockModelName}
            modelSize={dockModelInfo?.size}
            supportsVision={dockSupportsVision}
            onChangeModel={() => setIsModelModalOpen(true)}
            onLoadModel={() => void handleApplyAssistantModel()}
          />
        </div>
      </div>

      <div className="shrink-0">
        <Footer />
      </div>

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

      <ModelSelectorModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        models={selectableAssistantModels}
        value={activeAssistantSelection}
        // Picking a model is the decision; loading it is what the pick meant.
        onChange={(modelId) => {
          setAssistantModelSelection(modelId);
          void handleApplyAssistantModel(modelId);
        }}
      />

      <MobileWarningModal />
    </div>
  );
};
