import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Music, Trash2, Settings, Mic, Clock, ChevronRight, Sparkles, Play, Square, Activity, RefreshCw, Cpu, CheckCircle2, Timer, Loader2 } from 'lucide-react';
import { AVAILABLE_WEB_LLM_MODELS, initWebLLM, checkWebGPUSupport, webLlmEvents, isWebLLMLoaded, getCurrentWebLLMModel, unloadWebLLM, DEFAULT_WEB_LLM_MODEL_ID, type ModelInfo } from '../services/webLlmService';
import { AVAILABLE_VOICES, generateTTS } from '../services/ttsService';
import { Dropdown } from './Dropdown';
import type { GlobalSettings } from '../services/storage';
import { useModal } from '../context/ModalContext';

import type { InitProgressReport } from '@mlc-ai/web-llm';
import { DEFAULT_SYSTEM_PROMPT } from '../services/aiService';


import { reloadTTS, ttsEvents, type ProgressEventDetail } from '../services/ttsService';

interface GlobalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: GlobalSettings | null;
  onSave: (settings: GlobalSettings) => Promise<void>;
  initialTab?: 'general' | 'tts' | 'webllm' | 'ai-prompt';
  onShowWebGPUModal?: () => void;
}

const getWebLlmOptionLabel = (model: ModelInfo): string => {
  const capabilityLabel = model.capabilities?.includes('vision') ? 'Vision' : 'Text';
  const recommendedLabel = model.name.includes('Gemma 2')
    ? ' * Recommended'
    : (model.capabilities?.includes('vision') && model.precision === 'f16')
      ? ' * Best local vision'
      : '';

  return `${model.name} (${model.precision.toUpperCase()}) - ${model.size} - ${capabilityLabel}${recommendedLabel}`;
};

export const GlobalSettingsModal: React.FC<GlobalSettingsModalProps> = ({
  isOpen,
  onClose,
  currentSettings,
  onSave,
  initialTab = 'general',
  onShowWebGPUModal
}) => {
  const { showAlert } = useModal();
  const [isEnabled, setIsEnabled] = useState(currentSettings?.isEnabled ?? false);
  const [voice, setVoice] = useState(currentSettings?.voice ?? AVAILABLE_VOICES[0].id);
  const [delay, setDelay] = useState(currentSettings?.delay ?? 0.5);
  const [transition, setTransition] = useState<GlobalSettings['transition']>(currentSettings?.transition ?? 'fade');
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicVolume, setMusicVolume] = useState(currentSettings?.music?.volume ?? 0.36);
  const [savedMusicName, setSavedMusicName] = useState<string | null>(currentSettings?.music?.fileName ?? null);
  const [activeTab, setActiveTab] = useState<'general' | 'tts' | 'webllm' | 'ai-prompt'>(initialTab ?? 'general');
  const [ttsQuantization, setTtsQuantization] = useState<'q4' | 'q8'>(currentSettings?.ttsQuantization ?? 'q4');
  const [disableAudioNormalization, setDisableAudioNormalization] = useState(currentSettings?.disableAudioNormalization ?? false);
  const [aspectRatio, setAspectRatio] = useState<NonNullable<GlobalSettings['aspectRatio']>>(currentSettings?.aspectRatio ?? '16:9');


  // WebLLM State
  const [useWebLLM, setUseWebLLM] = useState(currentSettings?.useWebLLM ?? false);
  const [webLlmModel, setWebLlmModel] = useState(currentSettings?.webLlmModel ?? DEFAULT_WEB_LLM_MODEL_ID);
  const [webLlmDownloadProgress, setWebLlmDownloadProgress] = useState<string>('');
  const [webLlmProgressPercent, setWebLlmProgressPercent] = useState(0);
  const [isDownloadingWebLlm, setIsDownloadingWebLlm] = useState(false);
  const [precisionFilter, setPrecisionFilter] = useState<'all' | 'f16' | 'f32'>('all');
  const [capabilityFilter, setCapabilityFilter] = useState<'all' | 'vision' | 'text'>('all');
  const [webGpuSupport, setWebGpuSupport] = useState<{ supported: boolean; hasF16: boolean; error?: string } | null>(null);
  const [webLlmPhase, setWebLlmPhase] = useState<'downloading' | 'loading' | 'shader' | 'complete'>('downloading');
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [currentLoadedModel, setCurrentLoadedModel] = useState<string | null>(null);
  // Reload modal state — shown when the user switches WebLLM models
  const [showReloadModal, setShowReloadModal] = useState(false);
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
            const f32Model = AVAILABLE_WEB_LLM_MODELS.find(m => m.precision === 'f32');
            if (f32Model) setWebLlmModel(f32Model.id);
            setPrecisionFilter('f32');
            showAlert("Your GPU does not support f16 shaders. Switched to f32 mode for compatibility.", { type: 'info', title: 'WebGPU Compatibility' });
          }
        }
      });
    }

    // Check if a model is already loaded when switching to WebLLM tab
    if (activeTab === 'webllm') {
      setIsModelLoaded(isWebLLMLoaded());
      const currentModelId = getCurrentWebLLMModel();
      if (currentModelId) {
        const modelInfo = AVAILABLE_WEB_LLM_MODELS.find(m => m.id === currentModelId);
        setCurrentLoadedModel(modelInfo ? getWebLlmOptionLabel(modelInfo) : currentModelId);
        setWebLlmModel(currentModelId);
      } else {
        setCurrentLoadedModel(null);
      }
    }
  }, [activeTab, webGpuSupport, webLlmModel, showAlert]);

  // Reset progress when model changes
  useEffect(() => {
    setWebLlmDownloadProgress('');
    setWebLlmProgressPercent(0);
    setWebLlmPhase('downloading');
  }, [webLlmModel]);

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
      await initWebLLM(webLlmModel, (progress) => {
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
      const modelInfo = AVAILABLE_WEB_LLM_MODELS.find(m => m.id === webLlmModel);
      setCurrentLoadedModel(modelInfo ? `${modelInfo.name} (${modelInfo.precision})` : webLlmModel);
    } catch (e) {
      console.error(e);
      setWebLlmDownloadProgress(e instanceof Error ? e.message : 'Download failed.');
      setWebLlmPhase('downloading');
    } finally {
      setIsDownloadingWebLlm(false);
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
      aspectRatio
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
        onClose();
        return;
      }
    }

    // If WebLLM was already loaded with a different model, unload first
    const currentWebLlmModel = getCurrentWebLLMModel();
    const shouldUnloadBeforeSwitch = useWebLLM && currentWebLlmModel && webLlmModel && webLlmModel !== currentWebLlmModel && isWebLLMLoaded();
    if (shouldUnloadBeforeSwitch) {
      setWebLlmDownloadProgress('Unloading current model...');
      await unloadWebLLM();
      setIsModelLoaded(false);
      setCurrentLoadedModel(null);
      setWebLlmDownloadProgress('');
    }

    // Only automatically load WebLLM model if WebLLM settings actually changed
    const webLlmSettingsChanged = 
      useWebLLM !== (currentSettings?.useWebLLM ?? false) || 
      webLlmModel !== (currentSettings?.webLlmModel ?? DEFAULT_WEB_LLM_MODEL_ID);

    if (webLlmSettingsChanged && useWebLLM && webLlmModel && webLlmModel !== getCurrentWebLLMModel()) {
      if (isDownloadingWebLlm) {
        showAlert("Model is currently loading. Please wait.", { type: 'info', title: 'Loading in progress' });
        return;
      }

      await handleDownloadWebLlm();

      // If after attempting load, the model is still not the current one, it failed.
      // Don't close the modal so the user sees the error.
      if (webLlmModel !== getCurrentWebLLMModel()) {
        return;
      }
    }

    await onSave(settings);

    // If the WebLLM model was changed while one was already loaded, prompt the user to reload the browser
    const modelChangedAndLoaded =
      useWebLLM &&
      webLlmModel !== (currentSettings?.webLlmModel ?? DEFAULT_WEB_LLM_MODEL_ID) &&
      isWebLLMLoaded();

    if (modelChangedAndLoaded) {
      setShowReloadModal(true);
    } else {
      onClose();
    }
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
      <div className="w-full max-w-180 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[90dvh] sm:h-[78vh] max-h-196">
        {/* Header */}
        <div className="px-4 py-4 sm:px-8 sm:py-6 border-b border-white/5 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-branding-primary/20 text-branding-primary">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Settings</h2>
              <p className="text-xs text-white/40 font-medium">Apply configured settings to all future videos</p>
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
        </div>

        {/* Content */}
        <div className="p-4 sm:p-8 overflow-y-auto space-y-6 sm:space-y-8 flex-1">

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

                  {/* Aspect Ratio */}
                  <div className="space-y-4">
                    <label className="flex items-center gap-2 text-xs font-bold text-white/40 uppercase tracking-widest">
                      <RefreshCw className="w-4 h-4" /> Default Aspect Ratio
                    </label>
                    <Dropdown
                      options={[
                        { id: '16:9', name: '16:9 Landscape' },
                        { id: '9:16', name: '9:16 Portrait' },
                        { id: '1:1', name: '1:1 Square' },
                        { id: '4:3', name: '4:3 Standard' },
                      ]}
                      value={aspectRatio}
                      onChange={(val) => setAspectRatio(val as NonNullable<GlobalSettings['aspectRatio']>)}
                      className="bg-black/20"
                    />
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
                        className={`p-2 rounded-lg border flex flex-col gap-1 transition-all ${ttsQuantization === 'q8' ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className="text-sm font-bold">q8 (High Quality)</span>
                        <span className={`text-[10px] ${ttsQuantization === 'q8' ? 'text-black/60' : 'text-white/40'}`}>
                          Recommended for best audio output.
                        </span>
                      </button>
                      <button
                        onClick={() => setTtsQuantization('q4')}
                        className={`p-2 rounded-lg border flex flex-col gap-1 transition-all ${ttsQuantization === 'q4' ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className="text-sm font-bold">q4 (Fastest)</span>
                        <span className={`text-[10px] ${ttsQuantization === 'q4' ? 'text-black/60' : 'text-white/40'}`}>
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
                      <label className="text-xs font-bold text-white/40 uppercase tracking-widest">
                        Model Precision
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        onClick={() => setPrecisionFilter('all')}
                        className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${precisionFilter === 'all' ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className="text-sm font-bold">All Models</span>
                        <span className={`text-[10px] ${precisionFilter === 'all' ? 'text-black/60' : 'text-white/40'}`}>
                          Show both
                        </span>
                      </button>
                      <button
                        onClick={() => setPrecisionFilter('f16')}
                        disabled={webGpuSupport?.supported && !webGpuSupport.hasF16}
                        className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${precisionFilter === 'f16'
                          ? 'bg-white text-black border-white shadow-lg'
                          : (webGpuSupport?.supported && !webGpuSupport.hasF16)
                            ? 'bg-white/5 border-white/5 text-white/20 cursor-not-allowed'
                            : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                          }`}
                      >
                          <span className="text-sm font-bold">f16 (Better)</span>
                        <span className={`text-[10px] ${precisionFilter === 'f16' ? 'text-black/60' : 'text-white/40'}`}>
                          {(webGpuSupport?.supported && !webGpuSupport.hasF16) ? 'Not Supported' : 'Lower memory'}
                        </span>
                      </button>
                      <button
                        onClick={() => setPrecisionFilter('f32')}
                        className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${precisionFilter === 'f32' ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className="text-sm font-bold">f32 (Compatible)</span>
                        <span className={`text-[10px] ${precisionFilter === 'f32' ? 'text-black/60' : 'text-white/40'}`}>
                          Better support
                        </span>
                      </button>
                    </div>

                    {/* Precision Explanation */}
                    {/* Precision Explanation - Removed per user request */}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white/40 uppercase tracking-widest">
                        Model Type
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        onClick={() => setCapabilityFilter('all')}
                        className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${capabilityFilter === 'all' ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className="text-sm font-bold">All Types</span>
                        <span className={`text-[10px] ${capabilityFilter === 'all' ? 'text-black/60' : 'text-white/40'}`}>
                          Show everything
                        </span>
                      </button>
                      <button
                        onClick={() => setCapabilityFilter('vision')}
                        className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${capabilityFilter === 'vision' ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className="text-sm font-bold">Vision</span>
                        <span className={`text-[10px] ${capabilityFilter === 'vision' ? 'text-black/60' : 'text-white/40'}`}>
                          Image-capable
                        </span>
                      </button>
                      <button
                        onClick={() => setCapabilityFilter('text')}
                        className={`p-3 rounded-xl border flex flex-col gap-1 transition-all ${capabilityFilter === 'text' ? 'bg-white text-black border-white shadow-lg' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                      >
                        <span className="text-sm font-bold">Text</span>
                        <span className={`text-[10px] ${capabilityFilter === 'text' ? 'text-black/60' : 'text-white/40'}`}>
                          Writing only
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Model Selection */}
                  <div className="p-4 rounded-xl bg-black/20 border border-white/10 flex gap-4">
                    <div className="p-2 rounded-lg bg-white/10 text-white/60 h-fit">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="space-y-4">
                        <Dropdown
                          options={filteredWebLlmModels
                            .map(m => ({
                              id: m.id,
                              group: m.capabilities?.includes('vision') ? 'Vision Models' : 'Text Models',
                              name: `${m.name} (${m.precision.toUpperCase()}) - ${m.size}${m.name.includes('Gemma 2') ? ' ★ (Recommended)' : ''}`
                            }))}
                          value={webLlmModel}
                          onChange={(val) => {
                            setWebLlmModel(val);
                          }}
                          className="bg-black/20"
                        />

                        {filteredWebLlmModels.length === 0 && (
                          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/60">
                            No WebLLM models match the current precision and capability filters.
                          </div>
                        )}

                        {AVAILABLE_WEB_LLM_MODELS.find(m => m.id === webLlmModel) && (
                          <div className="flex flex-wrap items-center gap-3 text-[10px] text-white/40">
                            <div className="flex items-center gap-2">
                              <Activity className="w-3 h-3" />
                              Est. VRAM Usage: {AVAILABLE_WEB_LLM_MODELS.find(m => m.id === webLlmModel)?.vram_required_MB} MB
                            </div>
                            <div>
                              Mode: {AVAILABLE_WEB_LLM_MODELS.find(m => m.id === webLlmModel)?.capabilities?.includes('vision') ? 'Vision + text' : 'Text only'}
                            </div>
                          </div>
                        )}

                        {/* Status / Loaded Model Info */}
                        <div className="space-y-3">
                          {/* Always show loaded status if loaded */}
                          {isModelLoaded && currentLoadedModel && (
                            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row items-center justify-between gap-3">
                              <div className="flex items-center gap-3 w-full sm:w-auto">
                                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                                <div>
                                  <p className="text-xs font-bold text-emerald-200 uppercase tracking-wide">Currently Loaded</p>
                                  <p className="text-sm font-medium text-white">{currentLoadedModel}</p>
                                </div>
                              </div>
                              <button
                                onClick={async () => {
                                  await unloadWebLLM();
                                  setIsModelLoaded(false);
                                  setCurrentLoadedModel(null);
                                  setWebLlmDownloadProgress('');
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors uppercase tracking-wider font-bold text-[10px] sm:self-center shrink-0 w-full sm:w-auto justify-center"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Unload AI
                              </button>
                            </div>
                          )}

                          {/* Progress Bar (Visible during automatic load) */}
                          {webLlmDownloadProgress && (
                            <div className="p-3 rounded-lg bg-black/20 border border-white/10 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className={`font-mono text-xs leading-relaxed ${webLlmDownloadProgress === 'Model loaded successfully!' ? 'text-emerald-400 font-bold' : 'text-white/70'}`}>
                                  {webLlmDownloadProgress}
                                </p>
                                {isDownloadingWebLlm && webLlmPhase !== 'shader' && (
                                  <span className="font-mono text-xs text-white/70">
                                    {webLlmProgressPercent}%
                                  </span>
                                )}
                                {isDownloadingWebLlm && webLlmPhase === 'shader' && (
                                  <span className="text-xs text-purple-400 font-semibold flex items-center gap-1">
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    Optimizing
                                  </span>
                                )}
                              </div>
                              {isDownloadingWebLlm && webLlmPhase !== 'shader' && (
                                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-linear-to-r from-purple-500 to-blue-500 transition-all duration-300"
                                    style={{ width: `${webLlmProgressPercent}%` }}
                                  />
                                </div>
                              )}
                              {isDownloadingWebLlm && webLlmPhase === 'shader' && (
                                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                                  <div className="h-full bg-linear-to-r from-purple-500/50 via-blue-500 to-purple-500/50 animate-pulse w-full" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  </div>

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
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-white/5 flex justify-end gap-3 transition-colors">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-white/60 hover:text-white hover:bg-white/5 transition-all text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoadingTTS || isDownloadingWebLlm}
            className="px-8 py-2.5 rounded-xl bg-white/10 text-white font-extrabold hover:bg-white/20 hover:scale-105 active:scale-95 transition-all text-sm border border-white/10 hover:border-white/20 shadow-lg shadow-black/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {isLoadingTTS ? 'Loading TTS...' : (isDownloadingWebLlm && (activeTab === 'webllm' || useWebLLM)) ? 'Loading Model...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Reload Browser Confirmation Modal */}
      {showReloadModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
            {/* Icon + Title */}
            <div className="px-6 pt-7 pb-4 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white tracking-tight">Reload browser?</h3>
                <p className="text-xs text-white/50 mt-1 leading-relaxed">
                  Switching WebLLM models requires a page reload to fully take effect. Would you like to reload now?
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 flex flex-col gap-2 mt-1">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-sm transition-all hover:scale-[1.02] active:scale-95 shadow-lg shadow-amber-500/20"
              >
                Reload Now
              </button>
              <button
                onClick={() => {
                  setShowReloadModal(false);
                  onClose();
                }}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-bold text-sm transition-all border border-white/10"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
