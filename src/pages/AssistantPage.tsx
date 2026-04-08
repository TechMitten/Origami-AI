import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  BrainCircuit,
  Github,
  ImagePlus,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  X
} from 'lucide-react';

import appLogo from '../assets/images/app-logo2.png';
import backgroundImage from '../assets/images/background.png';
import { AppModeSwitcher } from '../components/AppModeSwitcher';
import { DuplicateTabModal } from '../components/DuplicateTabModal';
import { Footer } from '../components/Footer';
import { GlobalSettingsModal } from '../components/GlobalSettingsModal';
import { MobileWarningModal } from '../components/MobileWarningModal';
import { WebGPUInstructionsModal } from '../components/WebGPUInstructionsModal';
import { WebLLMLoadingModal } from '../components/WebLLMLoadingModal';
import { useModal } from '../context/ModalContext';
import type { AssistantChatMessage, AssistantImageAttachment, GlobalSettings } from '../services/storage';
import {
  loadAssistantChatState,
  loadGlobalSettings,
  saveAssistantChatState,
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

const createUserMessage = (content: string, imageAttachment?: AssistantImageAttachment): AssistantChatMessage => ({
  id: crypto.randomUUID(),
  role: 'user',
  content,
  createdAt: Date.now(),
  imageAttachment,
});

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === 'string') {
      resolve(reader.result);
      return;
    }
    reject(new Error('Unable to read the selected image.'));
  };
  reader.onerror = () => reject(reader.error || new Error('Unable to read the selected image.'));
  reader.readAsDataURL(file);
});

export const AssistantPage: React.FC = () => {
  const { showAlert, showConfirm } = useModal();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<AssistantImageAttachment | null>(null);
  const [isReadingImage, setIsReadingImage] = useState(false);
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
  const hasConversation = messages.length > 0;
  const isConfiguredForAssistant = Boolean(globalSettings.useWebLLM && configuredModelId);

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
      const [savedSettings, savedChat, support] = await Promise.all([
        loadGlobalSettings(),
        loadAssistantChatState(),
        checkWebGPUSupport(),
      ]);

      if (!isMounted) return;

      setGlobalSettings(savedSettings ? { ...DEFAULT_GLOBAL_SETTINGS, ...savedSettings } : DEFAULT_GLOBAL_SETTINGS);
      setMessages(savedChat?.messages || []);
      setWebGpuSupport(support);
      setLoadedModelId(getCurrentWebLLMModel());
      setIsBootstrapping(false);
    };

    loadPage().catch(() => {
      if (!isMounted) return;
      setGlobalSettings(DEFAULT_GLOBAL_SETTINGS);
      setMessages([]);
      setIsBootstrapping(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isBootstrapping) return;

    const timeoutId = window.setTimeout(() => {
      saveAssistantChatState(messages);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [messages, isBootstrapping]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

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

  const startFreshChat = async () => {
    if (messages.length > 0) {
      const confirmed = await showConfirm('Start a new chat? Your current assistant conversation will be cleared.', {
        type: 'warning',
        title: 'New Chat',
        confirmText: 'Start Fresh',
      });

      if (!confirmed) return;
    }

    setMessages([]);
    setInput('');
    setPendingImage(null);
    await saveAssistantChatState([]);
  };

  const handleImageSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      await showAlert('Choose a PNG, JPG, WebP, or another standard image format.', {
        type: 'warning',
        title: 'Unsupported File',
      });
      return;
    }

    if (file.size > MAX_ASSISTANT_IMAGE_BYTES) {
      await showAlert('Choose an image under 8 MB so it can be sent to the local vision model reliably.', {
        type: 'warning',
        title: 'Image Too Large',
      });
      return;
    }

    setIsReadingImage(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setPendingImage({
        dataUrl,
        mimeType: file.type || 'image/png',
        name: file.name,
      });
    } catch (error) {
      await showAlert(error instanceof Error ? error.message : 'Unable to load that image.', {
        type: 'error',
        title: 'Image Load Failed',
      });
    } finally {
      setIsReadingImage(false);
    }
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if ((!trimmed && !pendingImage) || isSending || isReadingImage) return;

    const modelId = await ensureAssistantReady();
    if (!modelId) return;

    if (pendingImage && !webLlmModelSupportsVision(modelId)) {
      await showAlert('The selected WebLLM model is text-only. Switch to Phi 3.5 Vision to analyze screenshots locally.', {
        type: 'warning',
        title: 'Vision Model Required',
      });
      return;
    }

    const userMessage = createUserMessage(trimmed, pendingImage || undefined);
    const assistantMessageId = crypto.randomUUID();
    const placeholderMessage: AssistantChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
    };

    const nextMessages = [...messages, userMessage, placeholderMessage];
    setMessages(nextMessages);
    setInput('');
    setPendingImage(null);
    setIsSending(true);

    const chatMessages: WebLLMChatMessage[] = [
      { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
      ...nextMessages
        .filter((message) => message.id !== assistantMessageId)
        .map((message) => ({
          role: message.role,
          content: message.imageAttachment
            ? [
              {
                type: 'text' as const,
                text: message.content || 'Please analyze this screenshot and help me with what is shown.',
              },
              {
                type: 'image_url' as const,
                image_url: {
                  url: message.imageAttachment.dataUrl,
                },
              },
            ]
            : message.content,
        })),
    ];

    try {
      let fullResponse = '';

      for await (const chunk of streamWebLLMChatResponse(chatMessages, {
        temperature: 0.7,
        maxTokens: 768,
        resetChat: true,
      })) {
        fullResponse += chunk;
        setMessages((currentMessages) => currentMessages.map((message) => (
          message.id === assistantMessageId
            ? { ...message, content: fullResponse }
            : message
        )));
      }

      if (!fullResponse.trim()) {
        throw new Error('The model returned an empty response.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The assistant could not generate a response.';
      setMessages((currentMessages) => currentMessages.map((entry) => (
        entry.id === assistantMessageId
          ? { ...entry, content: `I hit an error while responding: ${message}` }
          : entry
      )));
    } finally {
      setIsSending(false);
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
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
              <p className="text-red-100/80">{webGpuSupport.error || 'This browser or device does not currently support WebGPU.'}</p>
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
    <div className="min-h-screen bg-branding-dark px-4 pb-2 pt-6 text-white sm:px-6 lg:px-8">
      <header className="relative z-50 mx-auto mb-4 flex w-full max-w-6xl flex-col gap-3 rounded-3xl border border-white/10 bg-black/20 px-4 py-4 backdrop-blur-xl sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl shadow-lg shadow-cyan-500/10">
            <img src={appLogo} alt="Origami" className="h-full w-full rounded-xl object-cover" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-cyan-300/60">Origami</p>
            <h1 className="text-2xl font-black tracking-tight text-white">AI Assistant</h1>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <AppModeSwitcher className="self-start lg:self-center" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white/60">
              <Bot className="h-4 w-4 text-cyan-300" />
              <span>{loadedModelName || configuredModelName || 'Setup required'}</span>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-white/70 transition-colors hover:text-white"
              title="Open Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              onClick={startFreshChat}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white/70 transition-colors hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              New Chat
            </button>
            <a
              href="https://github.com/IslandApps/Origami-AI"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-white/70 transition-colors hover:text-white"
              title="View on GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col pb-8">
        <section className="flex min-h-[78vh] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0f14]/90 shadow-2xl shadow-black/30 backdrop-blur-2xl">
          <div className="border-b border-white/10 px-5 py-4 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-cyan-300/60">Local Chat</p>
            <h2 className="mt-1 text-xl font-black text-white sm:text-2xl">A streamlined WebLLM assistant</h2>
          </div>

          <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-5 sm:px-6">
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
                      {activeModelSupportsVision ? ' You can also attach a screenshot for the local vision model to inspect.' : ''}
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
                                {message.imageAttachment && (
                                  <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                                    <img
                                      src={message.imageAttachment.dataUrl}
                                      alt={message.imageAttachment.name}
                                      className="max-h-80 w-full object-contain"
                                    />
                                    <div className="border-t border-white/10 px-3 py-2 text-[11px] text-white/50">
                                      {message.imageAttachment.name}
                                    </div>
                                  </div>
                                )}
                                {message.content ? (
                                  <div className="whitespace-pre-wrap text-sm leading-7 text-white/90">
                                    {message.content}
                                  </div>
                                ) : message.imageAttachment ? (
                                  <div className="text-sm text-white/60">Attached screenshot</div>
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
                accept="image/*"
                onChange={handleImageSelection}
                className="hidden"
              />

              {pendingImage && (
                <div className="mb-3 flex items-start gap-3 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3">
                  <img
                    src={pendingImage.dataUrl}
                    alt={pendingImage.name}
                    className="h-20 w-24 rounded-xl object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-cyan-50">{pendingImage.name}</p>
                    <p className="mt-1 text-xs text-cyan-100/70">This screenshot will be sent to the local vision model with your message.</p>
                  </div>
                  <button
                    onClick={() => setPendingImage(null)}
                    className="rounded-lg border border-cyan-300/20 bg-black/20 p-2 text-cyan-100/70 transition-colors hover:text-cyan-50"
                    title="Remove screenshot"
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
                      ? 'Message Origami Assistant or attach a screenshot...'
                      : 'Message Origami Assistant...'
                    : 'Open Settings to choose and load a WebLLM model first.'
                }
                disabled={isBootstrapping || isSending || isReadingImage}
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
                    disabled={!activeModelSupportsVision || isSending || isBootstrapping || isReadingImage}
                    className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/80 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                    title={activeModelSupportsVision ? 'Attach a screenshot' : 'Select a vision-capable model to attach screenshots'}
                  >
                    {isReadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    Screenshot
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={(!input.trim() && !pendingImage) || isSending || isBootstrapping || isReadingImage}
                    className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-black transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

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
