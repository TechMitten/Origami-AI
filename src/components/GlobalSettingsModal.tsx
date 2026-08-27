import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Music, Trash2, Settings, Mic, Clock, ChevronRight, Sparkles, Play, Square, Activity, RefreshCw, Cpu, CheckCircle2, Timer, Loader2, ArrowDownCircle } from 'lucide-react';
import { AVAILABLE_WEB_LLM_MODELS, initWebLLM, checkWebGPUSupport, webLlmEvents, isWebLLMLoaded, isWebLLMInitializing, getCurrentWebLLMModel, unloadWebLLM, DEFAULT_WEB_LLM_MODEL_ID, getDefaultModelByPrecision } from '../services/webLlmService';
import { AVAILABLE_VOICES, generateTTS } from '../services/ttsService';
import { Dropdown } from './Dropdown';
import type { GlobalSettings } from '../services/storage';
import { useModal } from '../context/ModalContext';
import { useNotifications } from '../context/NotificationContext';

import type { InitProgressReport } from '@mlc-ai/web-llm';
import { DEFAULT_SYSTEM_PROMPT } from '../services/aiService';
import { isPollinationsTokenExpired, startPollinationsOAuth } from '../services/pollinationsAuth';


import { reloadTTS, ttsEvents, type ProgressEventDetail } from '../services/ttsService';

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: GlobalSettings | null;
  onSave: (settings: GlobalSettings) => Promise<void>;
  initialTab?: 'general' | 'tts' | 'webllm' | 'ai-prompt' | 'api';
  onShowWebGPUModal?: () => void;
}

import { ModelSelectorGrid, PrecisionInfoCard } from './ModelSelectorGrid';

export const GlobalSettingsModal: React.FC<GlobalSettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onSave,
  initialTab = 'general',
  onShowWebGPUModal
}) => {
  const { showAlert } = useModal();
  const { refresh: refreshNotifications } = useNotifications();
  const [isEnabled, setIsEnabled] = useState(currentSettings?.isEnabled ?? false);
  const [voice, setVoice] = useState(currentSettings?.voice ?? AVAILABLE_VOICES[0].id);
  const [delay, setDelay] = useState(currentSettings?.delay ?? 0.5);
  const [transition, setTransition] = useState<GlobalSettings['transition']>(currentSettings?.transition ?? 'fade');
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicVolume, setMusicVolume] = useState(currentSettings?.music?.volume ?? 0.16);
  const [savedMusicName, setSavedMusicName] = useState<string | null>(currentSettings?.music?.fileName ?? null);
  const [activeTab, setActiveTab] = useState<'general' | 'tts' | 'webllm' | 'ai-prompt' | 'api'>(initialTab ?? 'general');
  const [ttsQuantization, setTtsQuantization] = useState<'q4' | 'q8'>(currentSettings?.ttsQuantization ?? 'q8');
  const [disableAudioNormalization, setDisableAudioNormalization] = useState(currentSettings?.disableAudioNormalization ?? false);
  
  // OpenAI Settings
  const [openaiEndpoint, setOpenaiEndpoint] = useState(currentSettings?.openaiEndpoint ?? '');
  const [openaiModel, setOpenaiModel] = useState(currentSettings?.openaiModel ?? '');
  const [openaiApiKey, setOpenaiApiKey] = useState(currentSettings?.openaiApiKey ?? '');
  const [useOpenAIOcr, setUseOpenAIOcr] = useState(currentSettings?.useOpenAIOcr ?? false);
  const [useOpenAIFixScript, setUseOpenAIFixScript] = useState(currentSettings?.useOpenAIFixScript ?? false);
  const [useOpenAIForSlideGen, setUseOpenAIForSlideGen] = useState(currentSettings?.useOpenAIForSlideGen ?? false);
  const [shortsUseOpenAI, setShortsUseOpenAI] = useState(currentSettings?.shortsUseOpenAI ?? false);
  const [assistantUseOpenAI, setAssistantUseOpenAI] = useState(currentSettings?.assistantUseOpenAI ?? false);

  // Pollinations (Shorts image generation)
  const [pollinationsApiKey, setPollinationsApiKey] = useState(currentSettings?.pollinationsApiKey ?? '');
  const [pollinationsTokenExpiresAt, setPollinationsTokenExpiresAt] = useState(currentSettings?.pollinationsTokenExpiresAt);
  const [pollinationsAccountName, setPollinationsAccountName] = useState(currentSettings?.pollinationsAccountName);
  const [pollinationsDisconnecting, setPollinationsDisconnecting] = useState(false);

  const handleDisconnectPollinations = async () => {
    setPollinationsDisconnecting(true);
    try {
      await onSave({
        ...currentSettings,
        pollinationsApiKey: undefined,
        pollinationsTokenExpiresAt: undefined,
        pollinationsAccountName: undefined,
      } as GlobalSettings);
      refreshNotifications();
      setPollinationsApiKey('');
      setPollinationsTokenExpiresAt(undefined);
      setPollinationsAccountName(undefined);
    } finally {
      setPollinationsDisconnecting(false);
    }
  };

  // Saved API Configs
  const [savedConfigs, setSavedConfigs] = useState<Array<{id: string, name: string, endpoint: string, model: string, apiKey: string}>>(() => {
    try {
      const saved = localStorage.getItem('savedApiConfigs');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [configName, setConfigName] = useState('');

  useEffect(() => {
    localStorage.setItem('savedApiConfigs', JSON.stringify(savedConfigs));
  }, [savedConfigs]);

  // WebLLM State
  const [useWebLLM, setUseWebLLM] = useState(currentSettings?.useWebLLM ?? false);
  const [webLlmModel, setWebLlmModel] = useState(currentSettings?.webLlmModel ?? DEFAULT_WEB_LLM_MODEL_ID);
  const [webLlmDownloadProgress, setWebLlmDownloadProgress] = useState<string>('');
  const [webLlmProgressPercent, setWebLlmProgressPercent] = useState(0);
  const [isDownloadingWebLlm, setIsDownloadingWebLlm] = useState(false);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [precisionFilter, setPrecisionFilter] = useState<'all' | 'f16' | 'f32'>('all');
  const [capabilityFilter, setCapabilityFilter] = useState<'all' | 'vision' | 'text'>('all');
  const [webGpuSupport, setWebGpuSupport] = useState<{ supported: boolean; hasF16: boolean; error?: string } | null>(null);
  const [webLlmPhase, setWebLlmPhase] = useState<'downloading' | 'loading' | 'shader' | 'complete'>('downloading');
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  // TTS Loading State
  const [isLoadingTTS, setIsLoadingTTS] = useState(false);
  const [ttsLoadProgress, setTtsLoadProgress] = useState('');
  const [ttsProgressPercent, setTtsProgressPercent] = useState(0);
  const [ttsLoadPhase, setTtsLoadPhase] = useState<'downloading' | 'loading' | 'complete'>('downloading');


  const [aiFixScriptSystemPrompt, setAiFixScriptSystemPrompt] = useState<string>(
    currentSettings?.aiFixScriptSystemPrompt ?? DEFAULT_SYSTEM_PROMPT
  );
  const [aiFixScriptContext, setAiFixScriptContext] = useState<string>(
    currentSettings?.aiFixScriptContext ?? ''
  );
  const [recordingCountdownEnabled, setRecordingCountdownEnabled] = useState(currentSettings?.recordingCountdownEnabled ?? true);
  const [introFadeInEnabled, setIntroFadeInEnabled] = useState(currentSettings?.introFadeInEnabled ?? true);
  const [introFadeInDurationSec, setIntroFadeInDurationSec] = useState(currentSettings?.introFadeInDurationSec ?? 1);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (activeTab === 'webllm' && webGpuSupport === null) {
      checkWebGPUSupport().then((info) => {
        setWebGpuSupport(info);
        if (info.supported && !info.hasF16) {
          const currentIsF16 = AVAILABLE_WEB_LLM_MODELS.find(m => m.id === webLlmModel)?.precision === 'f16';
          if (currentIsF16) {
            const f32Model = getDefaultModelByPrecision('f32');
            if (f32Model) setWebLlmModel(f32Model.id);
            setPrecisionFilter('f32');
            showAlert("Your GPU does not support f16 shaders. Switched to f32 mode for compatibility.", { type: 'info', title: 'WebGPU Compatibility' });
          }
        }
      });
    }

    // Check if a model is already loaded when switching to WebLLM tab or opening modal
    if (activeTab === 'webllm' && isOpen) {
      const loaded = isWebLLMLoaded();
      setIsModelLoaded(loaded);
    }
  }, [activeTab, isOpen, webGpuSupport, showAlert]);

  // Reset progress when model changes (only when not actively downloading)
  useEffect(() => {
    if (!isDownloadingWebLlm) {
      setWebLlmDownloadProgress('');
      setWebLlmProgressPercent(0);
      setWebLlmPhase('downloading');
    }
  }, [webLlmModel, isDownloadingWebLlm]);

  // Reset TTS download state when quantization changes


  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewAudio, setPreviewAudio] = useState<HTMLAudioElement | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);


  const filteredWebLlmModels = AVAILABLE_WEB_LLM_MODELS.filter((model) => {
    if (webGpuSupport?.supported && !webGpuSupport.hasF16 && model.precision === 'f16') return false;
    if (precisionFilter !== 'all' && model.precision !== precisionFilter) return false;
    if (capabilityFilter === 'vision') return !!model.capabilities?.includes('vision');
    if (capabilityFilter === 'text') return !model.capabilities?.includes('vision');
    return true;
  });





  const handleDownloadWebLlm = async () => {
    if (!webLlmModel) return;
    const modelToDownload = webLlmModel;
    setDownloadingModelId(modelToDownload);
    setIsDownloadingWebLlm(true);
    setWebLlmDownloadProgress('Initializing...');
    setWebLlmProgressPercent(0);
    setWebLlmPhase('downloading');

    // Listen for progress events
    const handleProgress = (e: Event) => {
      const report = (e as CustomEvent<InitProgressReport>).detail;
      const progress = Math.round(report.progress * 100);

      // Detect phase from text
      const text = report.text.toLowerCase();
      let phase: 'downloading' | 'loading' | 'shader' | 'complete' = 'downloading';

      if (text.includes('shader') || text.includes('gpu')) {
        phase = 'shader';
      } else if (text.includes('loading') || text.includes('initialize') || text.includes('prefill')) {
        phase = 'loading';
      } else if (text.includes('complete') || progress >= 100) {
        phase = 'complete';
      }

      setWebLlmPhase(phase);
      setWebLlmDownloadProgress(report.text);

      // Track max progress to prevent going backward
      if (phase !== 'shader') {
        setWebLlmProgressPercent(prev => Math.max(prev, progress));
      }
    };

    webLlmEvents.addEventListener('webllm-init-progress', handleProgress);

    try {
      await initWebLLM(modelToDownload, (progress) => {
        const progressPercent = Math.round(progress.progress * 100);

        // Detect phase from text
        const text = progress.text.toLowerCase();
        let phase: 'downloading' | 'loading' | 'shader' | 'complete' = 'downloading';

        if (text.includes('shader') || text.includes('gpu')) {
          phase = 'shader';
        } else if (text.includes('loading') || text.includes('initialize') || text.includes('prefill')) {
          phase = 'loading';
        } else if (text.includes('complete') || progressPercent >= 100) {
          phase = 'complete';
        }

        setWebLlmPhase(phase);
        setWebLlmDownloadProgress(progress.text);

        // Track max progress to prevent going backward
        if (phase !== 'shader') {
          setWebLlmProgressPercent(prev => Math.max(prev, progressPercent));
        }
      });

      setWebLlmDownloadProgress('Model loaded successfully!');
      setWebLlmPhase('complete');
      setWebLlmProgressPercent(100);
      setIsModelLoaded(true);
    } catch (e) {
      console.error(e);
      setWebLlmDownloadProgress(e instanceof Error ? e.message : 'Download failed.');
      setWebLlmPhase('downloading');
    } finally {
      setIsDownloadingWebLlm(false);
      setDownloadingModelId(null);
      // A failed or cancelled load leaves nothing resident; keep the "Loaded" chip honest.
      setIsModelLoaded(isWebLLMLoaded());
      webLlmEvents.removeEventListener('webllm-init-progress', handleProgress);
    }
  };



  const handlePlayPreview = async () => {
    if (isPreviewPlaying && previewAudio) {
      previewAudio.pause();
      setIsPreviewPlaying(false);
      return;
    }

    try {
      setIsGeneratingPreview(true);
      setIsPreviewPlaying(true);
      const text = "Hello! This is a sample of how I sound. I hope you enjoy listening to my voice. Thank you for choosing me!";

      const audioUrl = await generateTTS(text, {
        voice: voice,
        speed: 1.0,
        pitch: 1.0
      });

      setIsGeneratingPreview(false);

      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsPreviewPlaying(false);
        setPreviewAudio(null);
      };
      audio.onerror = () => {
        setIsPreviewPlaying(false);
        setPreviewAudio(null);
        showAlert("Failed to play audio preview.", { type: 'error', title: 'Playback Error' });
      };

      setPreviewAudio(audio);
      await audio.play();
    } catch (e) {
      console.error("Preview failed", e);
      setIsGeneratingPreview(false);
      setIsPreviewPlaying(false);
      showAlert("Failed to generate preview: " + (e instanceof Error ? e.message : String(e)), { type: 'error', title: 'Preview Error' });
    }
  };

  // Cleanup preview audio on unmount or tab change
  React.useEffect(() => {
    return () => {
      if (previewAudio) {
        previewAudio.pause();
      }
    }
  }, [previewAudio]);

  const [existingMusicBlob, setExistingMusicBlob] = useState<Blob | null>(currentSettings?.music?.blob ?? null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMusicFile(file);
      setSavedMusicName(file.name);
      setExistingMusicBlob(null); // Clear existing blob as we have a new file
    }
  };

  const handleSave = async () => {
    const musicBlob = musicFile ? musicFile : existingMusicBlob;

    // If enabled, validations could be added here if needed

    const settings: GlobalSettings = {
      ...currentSettings,
      isEnabled,
      voice,
      delay,
      transition,
      introFadeInEnabled,
      introFadeInDurationSec: Math.min(5, Math.max(0.1, introFadeInDurationSec || 1)),
      music: musicBlob && savedMusicName ? {
        blob: musicBlob,
        volume: musicVolume,
        fileName: savedMusicName
      } : undefined,

      ttsQuantization,
      disableAudioNormalization,

      useWebLLM,
      webLlmModel,
      aiFixScriptSystemPrompt: aiFixScriptSystemPrompt.trim() || undefined,
      aiFixScriptContext: aiFixScriptContext.trim() || undefined,
      previewMode: 'modal',
      recordingCountdownEnabled,
      aspectRatio: currentSettings?.aspectRatio ?? '16:9',
      openaiEndpoint,
      openaiModel,
      openaiApiKey,
      useOpenAIOcr,
      useOpenAIFixScript,
      useOpenAIForSlideGen,
      shortsUseOpenAI,
      assistantUseOpenAI,
      pollinationsApiKey: pollinationsApiKey.trim() || undefined,
      pollinationsTokenExpiresAt,
      pollinationsAccountName,
      pollinationsImageModel: currentSettings?.pollinationsImageModel,
    };

    // Check if quantization changed to reload model
    if (currentSettings?.ttsQuantization !== ttsQuantization) {
      if (ttsQuantization) {
        setIsLoadingTTS(true);
        setTtsLoadProgress('Initializing...');
        setTtsProgressPercent(0);
        setTtsLoadPhase('downloading');

        // Listen to real-time progress from the worker
        const handleTtsProgress = (e: Event) => {
          const detail = (e as CustomEvent<ProgressEventDetail>).detail;
          const pct = detail.progress >= 0 ? Math.round(detail.progress) : -1;
          const status = detail.status?.toLowerCase() ?? '';

          let phase: 'downloading' | 'loading' | 'complete' = 'downloading';
          if (status === 'done' || pct >= 100) phase = 'complete';
          else if (status === 'initiate' || status === 'progress') phase = 'downloading';
          else if (status === 'ready') phase = 'loading';

          setTtsLoadPhase(phase);
          setTtsLoadProgress(detail.file ? `${detail.file}` : (detail.status || 'Loading...'));
          if (pct >= 0) setTtsProgressPercent(prev => Math.max(prev, pct));
        };

        const handleTtsComplete = () => {
          setTtsLoadProgress('Model loaded successfully!');
          setTtsLoadPhase('complete');
          setTtsProgressPercent(100);
        };

        ttsEvents.addEventListener('tts-progress', handleTtsProgress);
        ttsEvents.addEventListener('tts-init-complete', handleTtsComplete);

        try {
          await reloadTTS(ttsQuantization);
          setTtsLoadProgress('Model loaded successfully!');
          setTtsLoadPhase('complete');
          setTtsProgressPercent(100);
        } catch (error) {
          console.error('Failed to reload TTS model:', error);
          setTtsLoadProgress('Failed to load model. Check console.');
        } finally {
          ttsEvents.removeEventListener('tts-progress', handleTtsProgress);
          ttsEvents.removeEventListener('tts-init-complete', handleTtsComplete);
          setIsLoadingTTS(false);
        }

        // Save settings and close after TTS reload
        await onSave(settings);
        refreshNotifications();
        onClose();
        return;
      }
    }

    // This modal is already loading something — never tear that load down from under itself.
    if (isDownloadingWebLlm) {
      showAlert("Model is currently loading. Please wait.", { type: 'info', title: 'Loading in progress' });
      return;
    }

    // Switching models: unload the resident one first. `isWebLLMInitializing()` matters as much
    // as `isWebLLMLoaded()` here — a load kicked off elsewhere (the background download queue,
    // the Assistant or Shorts page) has no engine yet but is already holding the GPU.
    const targetModelChanged = useWebLLM && webLlmModel && webLlmModel !== getCurrentWebLLMModel();
    if (targetModelChanged && (isWebLLMLoaded() || isWebLLMInitializing())) {
      setWebLlmDownloadProgress('Unloading current model...');
      await unloadWebLLM();
      setIsModelLoaded(false);
      setWebLlmDownloadProgress('');
    }

    // Only automatically load WebLLM model if WebLLM settings actually changed
    const webLlmSettingsChanged =
      useWebLLM !== (currentSettings?.useWebLLM ?? false) ||
      webLlmModel !== (currentSettings?.webLlmModel ?? DEFAULT_WEB_LLM_MODEL_ID);

    if (webLlmSettingsChanged && useWebLLM && webLlmModel && webLlmModel !== getCurrentWebLLMModel()) {
      await handleDownloadWebLlm();

      // If after attempting load, the model is still not the current one, it failed. Keep every
      // other edit, but leave the persisted model on the last one that actually worked, and keep
      // the modal open so the user sees the error.
      if (webLlmModel !== getCurrentWebLLMModel()) {
        await onSave({ ...settings, webLlmModel: currentSettings?.webLlmModel ?? DEFAULT_WEB_LLM_MODEL_ID });
        refreshNotifications();
        return;
      }
    }

    await onSave(settings);
    refreshNotifications();
    onClose();
  };

  const removeMusic = () => {
    setMusicFile(null);
    setExistingMusicBlob(null);
    setSavedMusicName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-2xl bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh] relative">
        {/* Top Border Progress Indicator */}
        {isDownloadingWebLlm && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-white/5 z-50 overflow-hidden">
            {webLlmPhase === 'shader' ? (
              <div className="h-full bg-linear-to-r from-purple-500 via-sky-400 to-purple-500 animate-pulse w-full shadow-[0_0_10px_rgba(168,85,247,0.7)]" />
            ) : (
              <div
                className="h-full bg-linear-to-r from-sky-500 via-purple-500 to-emerald-400 transition-all duration-300 shadow-[0_0_10px_rgba(56,189,248,0.7)]"
                style={{ width: `${webLlmProgressPercent}%` }}
              />
            )}
          </div>
        )}

        {/* Header */}
        <div className="px-4 py-4 sm:px-8 sm:py-6 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-branding-primary/20 text-branding-primary">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Settings</h2>
              <p className="text-xs text-white/70 font-medium">Apply configured settings to all future videos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>



        {/* Tabs */}
        <div className="flex items-center gap-1 p-2 bg-white/5 border-b border-white/5 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('general')}
            className={`flex-1 shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'general' ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Settings className="w-4 h-4" /> General
          </button>
          <button
            onClick={() => setActiveTab('tts')}
            className={`flex-1 shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'tts' ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Mic className="w-4 h-4" /> TTS Model
          </button>
          <button
            onClick={() => setActiveTab('webllm')}
            className={`flex-1 shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'webllm' ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Cpu className="w-4 h-4" /> WebLLM
          </button>
          <button
            onClick={() => setActiveTab('ai-prompt')}
            className={`flex-1 shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'ai-prompt' ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Sparkles className="w-4 h-4" /> AI Prompt
          </button>
          <button
            onClick={() => setActiveTab('api')}
            className={`flex-1 shrink-0 whitespace-nowrap flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'api' ? 'bg-white/10 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
          >
            <Cpu className="w-4 h-4" /> API
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden space-y-6 flex-1 w-full min-w-0">

          {activeTab === 'general' ? (
            <>
              {/* Master Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/10">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    Enable Global Defaults
                    {/* {isEnabled && <span className="text-[10px] bg-branding-primary text-black px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wide">Active</span>} */}
                  </div>
                  {/* <p className="text-xs text-white/50">Overrides individual slide settings upon creation</p> */}
                </div>
                <button
                  onClick={() => setIsEnabled(!isEnabled)}
                  className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${isEnabled ? 'bg-emerald-500' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-lg transform transition-transform duration-300 ${isEnabled ? 'translate-x-7' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/10">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                    <Play className="w-4 h-4" /> Intro Fade In
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold text-white/40 uppercase">{introFadeInEnabled ? 'On' : 'Off'}</span>
                  <button
                    onClick={() => setIntroFadeInEnabled(!introFadeInEnabled)}
                    className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${introFadeInEnabled ? 'bg-emerald-500' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white shadow-lg transform transition-transform duration-300 ${introFadeInEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-black/20 border border-white/10 space-y-3">
                <label className="flex items-center justify-between gap-3 text-xs font-bold text-white/40 uppercase tracking-widest">
                  <span>Intro Fade Length</span>
                  <span className="text-white/30">Seconds</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0.1"
                    max="5"
                    step="0.1"
                    value={introFadeInDurationSec}
                    onChange={(e) => setIntroFadeInDurationSec(parseFloat(e.target.value) || 1)}
                    className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all pr-12"
                    disabled={!introFadeInEnabled}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30 font-bold">SEC</span>
                </div>
              </div>

              <div className={`space-y-8 transition-opacity duration-300 ${isEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none grayscale'}`}>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">


                  {/* Delay */}
                  <div className="space-y-4">
                    <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                      <Clock className="w-4 h-4" /> Post-Audio Delay
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={delay}
                        onChange={(e) => setDelay(parseFloat(e.target.value) || 0)}
                        className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all pr-12"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30 font-bold">SEC</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/10">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                      <Activity className="w-4 h-4" /> Audio Normalization
                    </div>
                    {/* <p className="text-[10px] text-white/30">Automatically normalize audio to -14 LUFS (YouTube Standard)</p> */}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-white/40 uppercase">{disableAudioNormalization ? 'Off' : 'On'}</span>
                    <button
                      onClick={() => setDisableAudioNormalization(!disableAudioNormalization)}
                      className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${!disableAudioNormalization ? 'bg-emerald-500' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white shadow-lg transform transition-transform duration-300 ${!disableAudioNormalization ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/10">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                      <Timer className="w-4 h-4" /> Recording Countdown
                    </div>
                    {/* <p className="text-[10px] text-white/30">5-second countdown before recording starts</p> */}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-white/40 uppercase">{recordingCountdownEnabled ? 'On' : 'Off'}</span>
                    <button
                      onClick={() => setRecordingCountdownEnabled(!recordingCountdownEnabled)}
                      className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${recordingCountdownEnabled ? 'bg-emerald-500' : 'bg-white/10'}`}
                    >
                      <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white shadow-lg transform transition-transform duration-300 ${recordingCountdownEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>



                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Transition */}
                  <div className="space-y-4">
                    <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                      <ChevronRight className="w-4 h-4" /> Default Transition
                    </label>
                    <Dropdown
                      options={[
                        { id: 'fade', name: 'Fade' },
                        { id: 'slide', name: 'Slide' },
                        { id: 'zoom', name: 'Zoom' },
                        { id: 'none', name: 'None' },
                      ]}
                      value={transition}
                      onChange={(val) => setTransition(val as GlobalSettings['transition'])}
                      className="bg-black/20"
                    />
                  </div>

                  {/* Music */}
                  <div className="space-y-4">
                    <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                      <Music className="w-4 h-4" /> Default Music
                    </label>
                    <div className="p-4 rounded-xl bg-black/20 border border-white/10 space-y-4">
                      {savedMusicName ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between bg-white/5 p-2 rounded-lg">
                            <span className="text-sm text-white truncate max-w-37.5">{savedMusicName}</span>
                            <button onClick={removeMusic} className="text-white/40 hover:text-red-400">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-white/40 uppercase font-bold">
                              <span>Volume</span>
                              <span>{Math.round(musicVolume * 100)}%</span>
                            </div>
                            <div className="relative w-full flex items-center">
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.001"
                                value={Math.sqrt(musicVolume)}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setMusicVolume(val * val);
                                }}
                                style={{
                                  background: `linear-gradient(to right, hsl(var(--branding-primary)) 0%, hsl(var(--branding-primary)) ${Math.round(Math.sqrt(musicVolume) * 100)}%, rgba(255,255,255,0.1) ${Math.round(Math.sqrt(musicVolume) * 100)}%, rgba(255,255,255,0.1) 100%)`
                                }}
                                className="w-full h-1 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-branding-primary relative z-10"
                              />
                              {/* Ideal Level Marker (5% Volume -> ~22.4% Position) */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMusicVolume(0.03);
                                }}
                                className="absolute left-[17.3%] top-1/2 -translate-y-1/2 w-1.5 h-3 bg-white/30 hover:bg-white rounded-full z-20 transition-all hover:scale-125 cursor-pointer"
                                title="Set to Ideal Background Level (3%)"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-3 border border-dashed border-white/20 rounded-lg text-white/40 hover:text-white hover:border-white/40 hover:bg-white/5 transition-all text-sm font-medium flex items-center justify-center gap-2"
                          >
                            <Upload className="w-4 h-4" /> Upload Track
                          </button>
                        </div>
                      )}
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="audio/*"
                        onChange={handleMusicUpload}
                      />
                    </div>
                  </div>
                </div>

              </div>
            </>
          ) : activeTab === 'tts' ? (
            <div className="space-y-8">
              <div className="space-y-6">
                <div className="p-4 rounded-xl bg-black/20 border border-white/10 flex gap-4">
                  <div className="p-2 rounded-lg bg-white/10 text-white/60 h-fit">
                    <Mic className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">Kokoro TTS Configuration</h3>
                    {/* <p className="text-xs text-white/60 leading-relaxed">
                                Configure the local Text-to-Speech model. "q8" offers higher quality but is larger (~80MB),
                                while "q4" is faster and smaller (~45MB) with slightly reduced quality.
                            </p> */}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                      <Mic className="w-4 h-4" /> Default Voice
                    </label>

                    {/* Preview Button */}
                    <button
                      onClick={handlePlayPreview}
                      disabled={isGeneratingPreview}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${isPreviewPlaying ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : isGeneratingPreview ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-white/10 text-white/60 hover:text-white hover:bg-white/20'}`}
                    >
                      {isGeneratingPreview ? <Loader2 className="w-3 h-3 animate-spin" /> : isPreviewPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                      {isGeneratingPreview ? 'Generating...' : isPreviewPlaying ? 'Stop' : 'Test Voice'}
                    </button>
                  </div>

                  <Dropdown
                    options={AVAILABLE_VOICES}
                    value={voice}
                    onChange={setVoice}
                    className="bg-black/20"
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-4">
                    <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                      Model Quantization
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setTtsQuantization('q8')}
                        className={`p-2 rounded-lg border flex flex-col gap-1 transition-all ${ttsQuantization === 'q8' ? 'bg-sky-500/20 text-sky-300 border-sky-500 shadow-lg' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className="text-sm font-bold">q8 (High Quality)</span>
                        <span className={`text-[10px] ${ttsQuantization === 'q8' ? 'text-sky-400/70' : 'text-white/40'}`}>
                          Recommended for best audio output.
                        </span>
                      </button>
                      <button
                        onClick={() => setTtsQuantization('q4')}
                        className={`p-2 rounded-lg border flex flex-col gap-1 transition-all ${ttsQuantization === 'q4' ? 'bg-sky-500/20 text-sky-300 border-sky-500 shadow-lg' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className="text-sm font-bold">q4 (Fastest)</span>
                        <span className={`text-[10px] ${ttsQuantization === 'q4' ? 'text-sky-400/70' : 'text-white/40'}`}>
                          Faster inference, smaller download.
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* TTS Loading Progress (shown when reloading model on save) */}
                {isLoadingTTS && (
                  <div className="space-y-2 p-3 rounded-lg bg-black/20 border border-white/10">
                    <div className="flex items-center justify-between">
                      <p className={`font-mono text-xs leading-relaxed truncate max-w-full overflow-x-auto ${ttsLoadProgress === 'Model loaded successfully!' ? 'text-emerald-400 font-bold' : 'text-white/70'
                        }`}>
                        {ttsLoadProgress}
                      </p>
                      {ttsLoadPhase !== 'complete' && (
                        <span className="font-mono text-xs text-white/70">
                          {ttsProgressPercent >= 0 ? `${ttsProgressPercent}%` : ''}
                        </span>
                      )}
                    </div>
                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                      {ttsLoadPhase === 'complete' ? (
                        <div className="h-full bg-emerald-500 w-full transition-all duration-500" />
                      ) : ttsProgressPercent >= 0 ? (
                        <div
                          className="h-full bg-linear-to-r from-branding-primary to-purple-500 transition-all duration-300"
                          style={{ width: `${ttsProgressPercent}%` }}
                        />
                      ) : (
                        <div className="h-full bg-linear-to-r from-branding-primary/50 via-purple-500 to-branding-primary/50 animate-pulse w-full" />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : activeTab === 'webllm' ? (
            <div className="space-y-6">
              {/* WebLLM Toggle */}
              <div className="p-4 rounded-xl bg-black/20 border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Enable WebLLM
                      {/* {useWebLLM && <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wide">Active</span>} */}
                    </h3>
                    {/* <p className="text-xs text-white/60">
                                  Use browser-based AI instead of remote API for script fixes. Requires ~4GB+ VRAM and ~2GB download.
                              </p> */}
                  </div>
                  <button
                    onClick={async () => {
                      if (!useWebLLM) {
                        // User is trying to enable WebLLM - check WebGPU support first
                        const support = await checkWebGPUSupport();
                        if (!support.supported) {
                          onShowWebGPUModal?.();
                          return;
                        }
                      }
                      setUseWebLLM(!useWebLLM);
                    }}
                    className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${useWebLLM ? 'bg-emerald-500' : 'bg-white/10'}`}
                  >
                    <div className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow-lg transform transition-transform duration-300 ${useWebLLM ? 'translate-x-7' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              {useWebLLM && (
                <>
                  {/* Precision Filter */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs font-bold text-white/80 uppercase tracking-widest">
                          Model Precision
                        </label>
                        <PrecisionInfoCard
                          title="Float Precision in WebGPU"
                          description="f16 runs faster with ~50% less VRAM on modern GPUs. f32 provides universal compatibility for older or integrated graphics."
                          environment="f16 is auto-switched to f32 if unsupported."
                          side="bottom"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        onClick={() => setPrecisionFilter('all')}
                        className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${precisionFilter === 'all' ? 'bg-white/5 border-sky-400 text-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className={`text-sm font-bold ${precisionFilter === 'all' ? 'text-sky-300' : ''}`}>All Models</span>
                        <span className={`text-[10px] ${precisionFilter === 'all' ? 'text-sky-400/80 font-medium' : 'text-white/60'}`}>
                          Show both
                        </span>
                      </button>
                      <button
                        onClick={() => setPrecisionFilter('f16')}
                        disabled={webGpuSupport?.supported && !webGpuSupport.hasF16}
                        className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${precisionFilter === 'f16'
                          ? 'bg-white/5 border-sky-400 text-white'
                          : (webGpuSupport?.supported && !webGpuSupport.hasF16)
                            ? 'bg-white/5 border-white/5 text-white/20 cursor-not-allowed'
                            : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                          }`}
                      >
                        <div className="flex items-center justify-center">
                          <span className={`relative text-sm font-bold ${precisionFilter === 'f16' ? 'text-sky-300' : ''}`}>
                            f16 (Better)
                            <span className="absolute left-full top-1/2 -translate-y-1/2 ml-1 flex items-center">
                              <PrecisionInfoCard
                                title="f16 (Half-Precision)"
                                description="Uses ~50% less VRAM and generates tokens faster. Recommended for dedicated GPUs (RTX, Apple Silicon M-series)."
                                environment="Requires f16 shader support."
                                side="bottom"
                              />
                            </span>
                          </span>
                        </div>
                        <span className={`text-[10px] ${precisionFilter === 'f16' ? 'text-sky-400/80 font-medium' : 'text-white/60'}`}>
                          {(webGpuSupport?.supported && !webGpuSupport.hasF16) ? 'Not Supported' : 'Lower memory & faster'}
                        </span>
                      </button>
                      <button
                        onClick={() => setPrecisionFilter('f32')}
                        className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${precisionFilter === 'f32' ? 'bg-white/5 border-sky-400 text-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <div className="flex items-center justify-center">
                          <span className={`relative text-sm font-bold ${precisionFilter === 'f32' ? 'text-sky-300' : ''}`}>
                            f32 (Compatible)
                            <span className="absolute left-full top-1/2 -translate-y-1/2 ml-1 flex items-center">
                              <PrecisionInfoCard
                                title="f32 (Single-Precision)"
                                description="Universal hardware compatibility. Pick this for Intel Integrated graphics, older GPUs, or if f16 shaders fail."
                                environment="Uses ~2x more VRAM."
                                side="bottom"
                                align="right"
                              />
                            </span>
                          </span>
                        </div>
                        <span className={`text-[10px] ${precisionFilter === 'f32' ? 'text-sky-400/80 font-medium' : 'text-white/60'}`}>
                          Maximum compatibility
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white/80 uppercase tracking-widest">
                        Model Type
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        onClick={() => setCapabilityFilter('all')}
                        className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${capabilityFilter === 'all' ? 'bg-white/5 border-sky-400 text-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className={`text-sm font-bold ${capabilityFilter === 'all' ? 'text-sky-300' : ''}`}>All Types</span>
                        <span className={`text-[10px] ${capabilityFilter === 'all' ? 'text-sky-400/80 font-medium' : 'text-white/60'}`}>
                          Show everything
                        </span>
                      </button>
                      <button
                        onClick={() => setCapabilityFilter('vision')}
                        className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${capabilityFilter === 'vision' ? 'bg-white/5 border-sky-400 text-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className={`text-sm font-bold ${capabilityFilter === 'vision' ? 'text-sky-300' : ''}`}>Vision</span>
                        <span className={`text-[10px] ${capabilityFilter === 'vision' ? 'text-sky-400/80 font-medium' : 'text-white/60'}`}>
                          Image-capable
                        </span>
                      </button>
                      <button
                        onClick={() => setCapabilityFilter('text')}
                        className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${capabilityFilter === 'text' ? 'bg-white/5 border-sky-400 text-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className={`text-sm font-bold ${capabilityFilter === 'text' ? 'text-sky-300' : ''}`}>Text</span>
                        <span className={`text-[10px] ${capabilityFilter === 'text' ? 'text-sky-400/80 font-medium' : 'text-white/60'}`}>
                          Writing only
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Model Selection */}
                  <ModelSelectorGrid
                    models={filteredWebLlmModels}
                    value={webLlmModel}
                    onChange={setWebLlmModel}
                    loadedModelId={isModelLoaded ? getCurrentWebLLMModel() : null}
                    onUnload={async () => {
                      await unloadWebLLM();
                      setIsModelLoaded(false);
                      setWebLlmDownloadProgress('');
                    }}
                  />
                </>
              )}
            </div>
          ) : activeTab === 'ai-prompt' ? (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-black/20 border border-white/10 flex gap-4">
                <div className="p-2 rounded-lg bg-white/10 text-white/60 h-fit">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white">AI Fix Script System Prompt</h3>
                  <p className="text-xs text-white/60 leading-relaxed">
                    Customize the system prompt used for the AI Fix Script feature. This prompt applies to both WebLLM and remote API options.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-black/20 border border-white/10 space-y-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                    <Sparkles className="w-4 h-4" /> Presentation Context
                  </label>
                  <Dropdown
                    options={[
                      { id: '', name: 'None (Use standard system prompt)' },
                      { id: 'Learning course / education', name: 'Learning course / education' },
                      { id: 'Business / corporate', name: 'Business / corporate' },
                      { id: 'Training / onboarding', name: 'Training / onboarding' },
                      { id: 'Marketing / sales', name: 'Marketing / sales' },
                      { id: 'Technical / engineering', name: 'Technical / engineering' },
                      { id: 'Product demo / user guide', name: 'Product demo / user guide' },
                    ]}
                    value={aiFixScriptContext}
                    onChange={setAiFixScriptContext}
                    className="bg-black/20"
                    placeholder="None (Use standard system prompt)"
                  />
                  <p className="text-[10px] text-white/30">
                    Optional context to include in the system prompt (will be sent to the LLM along with the prompt text).
                  </p>
                </div>

                <textarea
                  value={aiFixScriptSystemPrompt}
                  onChange={(e) => setAiFixScriptSystemPrompt(e.target.value)}
                  className="w-full h-64 px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white outline-none transition-all text-sm font-mono resize-y focus:border-branding-primary focus:ring-1 focus:ring-branding-primary"
                  placeholder="Enter the system prompt for AI Fix Script..."
                />

                <div className="pt-2">
                  <button
                    onClick={() => {
                      setAiFixScriptSystemPrompt(DEFAULT_SYSTEM_PROMPT);
                    }}
                    className="text-[10px] font-bold text-white/40 hover:text-white transition-colors"
                  >
                    Reset to Default
                  </button>
                </div>

              </div>
            </div>
          ) : activeTab === 'api' ? (
            <div className="space-y-8">
              {/* Pollinations — powers Shorts image generation */}
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-black/20 border border-white/10 flex gap-4">
                  <div className="p-2 rounded-lg bg-white/10 text-white/60 h-fit">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">Pollinations (Shorts images)</h3>
                    <p className="text-xs text-white/60 leading-relaxed">
                      Used to generate the visuals on the Shorts page. Connect your Pollinations account to
                      generate under your own budget-capped, revocable access token. Without a connection,
                      image requests fall back to this server, which only works if it has a key configured.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">Pollinations Account</label>
                    {!pollinationsApiKey.trim() ? (
                      <button
                        type="button"
                        onClick={() => void startPollinationsOAuth(window.location.pathname)}
                        className="w-full px-4 py-3 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
                      >
                        Connect with Pollinations
                      </button>
                    ) : isPollinationsTokenExpired(pollinationsTokenExpiresAt) ? (
                      <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-amber-400/10 border border-amber-400/30">
                        <p className="text-xs text-amber-200/90 leading-relaxed">Your Pollinations connection expired.</p>
                        <button
                          type="button"
                          onClick={() => void startPollinationsOAuth(window.location.pathname)}
                          className="shrink-0 rounded-lg border border-amber-300/40 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-300/15"
                        >
                          Reconnect
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-black/20 border border-white/10">
                        <div className="space-y-0.5">
                          <p className="text-sm text-white flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            Connected as {pollinationsAccountName || 'Pollinations user'}
                          </p>
                          {pollinationsTokenExpiresAt ? (
                            <p className="text-[11px] text-white/35 pl-6">
                              Access expires in {Math.max(0, Math.ceil((pollinationsTokenExpiresAt - Date.now()) / 86_400_000))} days
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          disabled={pollinationsDisconnecting}
                          onClick={() => void handleDisconnectPollinations()}
                          className="shrink-0 text-xs font-semibold text-white/40 hover:text-white transition-colors disabled:opacity-50"
                        >
                          Disconnect
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="h-px bg-white/10" />

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-black/20 border border-white/10 flex gap-4">
                  <div className="p-2 rounded-lg bg-white/10 text-white/60 h-fit">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">OpenAI Compatible Endpoint (optional)</h3>
                    <p className="text-xs text-white/60 leading-relaxed">
                      Configure a custom OpenAI-compatible endpoint to replace local OCR and script fixing.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">Endpoint URL</label>
                    <input
                      type="text"
                      placeholder="e.g., https://api.openai.com/v1"
                      value={openaiEndpoint}
                      onChange={(e) => setOpenaiEndpoint(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-white/30 focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">Model Name</label>
                    <input
                      type="text"
                      placeholder="e.g., gpt-4o-mini"
                      value={openaiModel}
                      onChange={(e) => setOpenaiModel(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-white/30 focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">API Key</label>
                    <input
                      type="password"
                      placeholder="sk-..."
                      value={openaiApiKey}
                      onChange={(e) => setOpenaiApiKey(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-white/30 focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-black/20 border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">Saved Configurations</label>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Dropdown
                      options={[
                        { id: '', name: 'Load a saved configuration...' },
                        ...savedConfigs.map(c => ({ id: c.id, name: c.name }))
                      ]}
                      value={''}
                      onChange={(val) => {
                        const config = savedConfigs.find(c => c.id === val);
                        if (config) {
                          setOpenaiEndpoint(config.endpoint);
                          setOpenaiModel(config.model);
                          setOpenaiApiKey(config.apiKey);
                        }
                      }}
                      className="bg-black/20 flex-1"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Configuration name..."
                      value={configName}
                      onChange={(e) => setConfigName(e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-white/30 focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all"
                    />
                    <button
                      onClick={() => {
                        if (!configName.trim()) return;
                        const newConfig = {
                          id: Date.now().toString(),
                          name: configName.trim(),
                          endpoint: openaiEndpoint,
                          model: openaiModel,
                          apiKey: openaiApiKey
                        };
                        setSavedConfigs([...savedConfigs, newConfig]);
                        setConfigName('');
                      }}
                      className="px-4 py-3 rounded-xl bg-emerald-500/20 text-emerald-400 font-bold hover:bg-emerald-500/30 transition-colors whitespace-nowrap border border-emerald-500/30 text-sm"
                    >
                      Save Config
                    </button>
                  </div>

                  {savedConfigs.length > 0 && (
                    <div className="space-y-2 mt-4">
                      {savedConfigs.map(config => (
                        <div key={config.id} className="flex items-center justify-between bg-white/5 p-2 rounded-lg">
                          <span className="text-sm text-white">{config.name}</span>
                          <button
                            onClick={() => setSavedConfigs(savedConfigs.filter(c => c.id !== config.id))}
                            className="text-white/40 hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/10">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                      Use for OCR
                    </div>
                    <p className="text-[10px] text-white/30">Send slide snapshots to vision model instead of using local OCR</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-white/40 uppercase">{!useWebLLM && useOpenAIOcr ? 'On' : 'Off'}</span>
                    <button
                      onClick={() => setUseOpenAIOcr(!useOpenAIOcr)}
                      disabled={useWebLLM}
                      className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${useWebLLM ? 'bg-white/10 opacity-40 cursor-not-allowed' : (useOpenAIOcr ? 'bg-emerald-500' : 'bg-white/10')}`}
                    >
                      <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white shadow-lg transform transition-transform duration-300 ${useWebLLM ? 'translate-x-0' : (useOpenAIOcr ? 'translate-x-5' : 'translate-x-0')}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/10">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                      Use for Script Fixing
                    </div>
                    <p className="text-[10px] text-white/30">Use endpoint instead of local WebLLM for rewriting scripts</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-white/40 uppercase">{!useWebLLM && useOpenAIFixScript ? 'On' : 'Off'}</span>
                    <button
                      onClick={() => setUseOpenAIFixScript(!useOpenAIFixScript)}
                      disabled={useWebLLM}
                      className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${useWebLLM ? 'bg-white/10 opacity-40 cursor-not-allowed' : (useOpenAIFixScript ? 'bg-emerald-500' : 'bg-white/10')}`}
                    >
                      <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white shadow-lg transform transition-transform duration-300 ${useWebLLM ? 'translate-x-0' : (useOpenAIFixScript ? 'translate-x-5' : 'translate-x-0')}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/10">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                      Use for Slide Generation
                    </div>
                    <p className="text-[10px] text-white/30">Use this endpoint to generate slides with AI</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-white/40 uppercase">{!useWebLLM && useOpenAIForSlideGen ? 'On' : 'Off'}</span>
                    <button
                      onClick={() => setUseOpenAIForSlideGen(!useOpenAIForSlideGen)}
                      disabled={useWebLLM}
                      className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${useWebLLM ? 'bg-white/10 opacity-40 cursor-not-allowed' : (useOpenAIForSlideGen ? 'bg-emerald-500' : 'bg-white/10')}`}
                    >
                      <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white shadow-lg transform transition-transform duration-300 ${useWebLLM ? 'translate-x-0' : (useOpenAIForSlideGen ? 'translate-x-5' : 'translate-x-0')}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/10">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                      Use for Shorts
                    </div>
                    <p className="text-[10px] text-white/30">Use this endpoint for Shorts script and image-prompt writing instead of local WebLLM</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-white/40 uppercase">{!useWebLLM && shortsUseOpenAI ? 'On' : 'Off'}</span>
                    <button
                      onClick={() => setShortsUseOpenAI(!shortsUseOpenAI)}
                      disabled={useWebLLM}
                      className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${useWebLLM ? 'bg-white/10 opacity-40 cursor-not-allowed' : (shortsUseOpenAI ? 'bg-emerald-500' : 'bg-white/10')}`}
                    >
                      <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white shadow-lg transform transition-transform duration-300 ${useWebLLM ? 'translate-x-0' : (shortsUseOpenAI ? 'translate-x-5' : 'translate-x-0')}`} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-black/20 border border-white/10">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                      Use for Assistant
                    </div>
                    <p className="text-[10px] text-white/30">Use this endpoint for the AI Assistant chat instead of local WebLLM</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-white/40 uppercase">{!useWebLLM && assistantUseOpenAI ? 'On' : 'Off'}</span>
                    <button
                      onClick={() => setAssistantUseOpenAI(!assistantUseOpenAI)}
                      disabled={useWebLLM}
                      className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${useWebLLM ? 'bg-white/10 opacity-40 cursor-not-allowed' : (assistantUseOpenAI ? 'bg-emerald-500' : 'bg-white/10')}`}
                    >
                      <div className={`absolute top-1 left-1 w-3 h-3 rounded-full bg-white shadow-lg transform transition-transform duration-300 ${useWebLLM ? 'translate-x-0' : (assistantUseOpenAI ? 'translate-x-5' : 'translate-x-0')}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Sticky Download Progress Banner (Always visible without scrolling) */}
        {isDownloadingWebLlm && (
          <div className="px-6 py-3 bg-[#141414] border-t border-white/10 shadow-lg flex flex-col gap-2 z-20 animate-fade-in">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
                  {webLlmPhase === 'shader' ? (
                    <RefreshCw className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                  ) : (
                    <ArrowDownCircle className="w-3.5 h-3.5 text-sky-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white truncate">
                      {AVAILABLE_WEB_LLM_MODELS.find(m => m.id === (downloadingModelId || webLlmModel))?.name || 'WebLLM Model'}
                    </span>
                    <span className="text-[10px] text-white/50 px-1.5 py-0.5 rounded bg-white/10 font-medium">
                      {AVAILABLE_WEB_LLM_MODELS.find(m => m.id === (downloadingModelId || webLlmModel))?.size || 'Local AI'}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/70 font-mono truncate" title={webLlmDownloadProgress}>
                    {(() => {
                      if (webLlmPhase === 'shader' || webLlmDownloadProgress.toLowerCase().includes('shader')) {
                        return 'Compiling WebGPU shaders (first-time optimization)...';
                      }
                      if (webLlmDownloadProgress.includes('Finish loading') || webLlmDownloadProgress.includes('Loading model')) {
                        return 'Loading model into GPU memory...';
                      }
                      if (webLlmDownloadProgress.includes('Fetching param') || webLlmDownloadProgress.includes('fetch')) {
                        return 'Downloading model parameters...';
                      }
                      if (webLlmDownloadProgress.includes('Initializing')) {
                        return 'Initializing WebGPU engine...';
                      }
                      return webLlmDownloadProgress || 'Preparing model download...';
                    })()}
                  </p>
                </div>
              </div>

              <div className="shrink-0 text-right">
                {webLlmPhase === 'shader' ? (
                  <span className="text-xs font-semibold text-purple-300 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    Optimizing
                  </span>
                ) : (
                  <span className="text-xs font-mono font-bold text-sky-300">{webLlmProgressPercent}%</span>
                )}
              </div>
            </div>

            {/* Progress Track */}
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              {webLlmPhase === 'shader' ? (
                <div className="h-full bg-linear-to-r from-purple-500/60 via-sky-400 to-purple-500/60 animate-pulse w-full" />
              ) : (
                <div
                  className="h-full bg-linear-to-r from-sky-500 to-emerald-400 transition-all duration-300 rounded-full"
                  style={{ width: `${webLlmProgressPercent}%` }}
                />
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 bg-white/5 flex flex-wrap items-center justify-between gap-4 transition-colors">
          {/* Bottom Left VRAM info */}
          {activeTab === 'webllm' && AVAILABLE_WEB_LLM_MODELS.find(m => m.id === webLlmModel) ? (
            <div className="flex items-center gap-2 text-xs text-white/80 font-medium">
              <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/10">
                <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Est. VRAM Usage: <strong className="text-white font-semibold">{AVAILABLE_WEB_LLM_MODELS.find(m => m.id === webLlmModel)?.vram_required_MB} MB</strong></span>
              </div>
              <div className="hidden sm:flex items-center bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/10 text-white/70">
                <span>Mode: <strong className="text-white font-semibold">{AVAILABLE_WEB_LLM_MODELS.find(m => m.id === webLlmModel)?.capabilities?.includes('vision') ? 'Vision + text' : 'Text only'}</strong></span>
              </div>
            </div>
          ) : (
            <div />
          )}

          {/* Bottom Right Action Buttons */}
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoadingTTS || isDownloadingWebLlm}
              className="px-8 py-2.5 rounded-xl bg-white/10 text-white font-extrabold hover:bg-white/20 hover:scale-105 active:scale-95 transition-all text-sm border border-white/10 hover:border-white/20 shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
            >
              {isLoadingTTS ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Loading TTS...</span>
                </>
              ) : isDownloadingWebLlm ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
                  <span>
                    {webLlmPhase === 'shader'
                      ? 'Optimizing Shaders...'
                      : `Downloading (${webLlmProgressPercent}%)...`}
                  </span>
                </>
              ) : activeTab === 'webllm' ? (
                'Load Settings'
              ) : (
                'Save Settings'
              )}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};
