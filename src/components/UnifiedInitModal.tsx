import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Download, Info } from 'lucide-react';
import { webLlmEvents, AVAILABLE_WEB_LLM_MODELS, type ModelInfo } from '../services/webLlmService';
import { ttsEvents, type ProgressEventDetail } from '../services/ttsService';
import { videoEvents } from '../services/BrowserVideoRenderer';
import type { InitProgressReport } from '@mlc-ai/web-llm';

interface UnifiedInitModalProps {
  isOpen: boolean;
  resources: {
    tts: boolean;
    ffmpeg: boolean;
    webllm: boolean;
  };
  /** Which resources are actually being initialized (not skipped). Defaults to all. */
  activeResources?: {
    tts: boolean;
    ffmpeg: boolean;
    webllm: boolean;
  };
  onComplete: () => void;
  /** Called when user selects a WebLLM model (before initialization) */
  onWebLLMModelSelect?: (modelId: string) => void | Promise<void>;
  webGpuSupport?: {
    supported: boolean;
    hasF16: boolean;
    error?: string;
  } | null;
}

interface ResourceStatus {
  tts: 'pending' | 'downloading' | 'ready';
  ffmpeg: 'pending' | 'loading' | 'ready';
  webllm: 'pending' | 'initializing' | 'ready';
}

export const UnifiedInitModal: React.FC<UnifiedInitModalProps> = ({
  isOpen,
  resources,
  activeResources,
  onComplete,
  onWebLLMModelSelect,
  webGpuSupport,
}) => {
  const [status, setStatus] = useState<ResourceStatus>({
    // Pre-installed OR not being actively downloaded → already 'ready'
    tts: (resources.tts || !(activeResources?.tts ?? true)) ? 'ready' : 'pending',
    ffmpeg: (resources.ffmpeg || !(activeResources?.ffmpeg ?? true)) ? 'ready' : 'pending',
    webllm: (resources.webllm || !(activeResources?.webllm ?? true)) ? 'ready' : 'pending',
  });

  const [ttsProgress, setTTSProgress] = useState<{ percent: number; file: string } | null>(null);
  const [ffmpegStatus, setFFmpegStatus] = useState<string>('');
  const [webllmProgress, setWebLLMProgress] = useState<InitProgressReport | null>(null);
  const [webllmMaxProgress, setWebLLMMaxProgress] = useState(0);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null);
  const [webllmError, setWebllmError] = useState<string | null>(null);
  const [capabilityFilter, setCapabilityFilter] = useState<'all' | 'vision' | 'text'>('all');

  const compatibleModels = AVAILABLE_WEB_LLM_MODELS.filter((model) => {
    if (!webGpuSupport) return true;
    if (!webGpuSupport.supported) return false;
    if (!webGpuSupport.hasF16 && model.precision === 'f16') return false;
    return true;
  });
  const filteredCompatibleModels = compatibleModels.filter((model) => {
    if (capabilityFilter === 'vision') return !!model.capabilities?.includes('vision');
    if (capabilityFilter === 'text') return !model.capabilities?.includes('vision');
    return true;
  });
  const groupedCompatibleModels = [
    {
      title: 'Vision Models',
      models: filteredCompatibleModels.filter((model) => model.capabilities?.includes('vision')),
    },
    {
      title: 'Text Models',
      models: filteredCompatibleModels.filter((model) => !model.capabilities?.includes('vision')),
    },
  ].filter((group) => group.models.length > 0);

  const normalizeWebLLMProgress = (progress: number) => {
    if (!Number.isFinite(progress)) return 0;
    // WebLLM reports progress in [0,1], but some paths may surface percentage-like values.
    if (progress > 1) return Math.min(progress / 100, 1);
    return Math.max(progress, 0);
  };

  useEffect(() => {
    if (!isOpen) {
      setSelectedModel(null);
      setShowModelSelector(false);
      setWebLLMProgress(null);
      setWebLLMMaxProgress(0);
      setWebllmError(null);
      setCapabilityFilter('all');
      return;
    }

    // Show model selector if WebLLM is being initialized and no model is selected
    if (activeResources?.webllm && !selectedModel) {
      setShowModelSelector(true);
    }

    // TTS Progress
    const handleTTSProgress = (e: Event) => {
      const detail = (e as CustomEvent<ProgressEventDetail>).detail;
      setTTSProgress({
        percent: detail.progress,
        file: detail.file
      });
      setStatus(prev => ({ ...prev, tts: 'downloading' }));

      if (detail.status === 'done' || detail.progress >= 100) {
        setTimeout(() => {
          setStatus(prev => ({ ...prev, tts: 'ready' }));
          setTTSProgress(null);
        }, 500);
      }
    };

    // FFmpeg Progress
    const handleVideoProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ status: string }>).detail;
      setFFmpegStatus(detail.status);
      if (detail.status === 'FFmpeg ready') {
        setStatus(prev => ({ ...prev, ffmpeg: 'ready' }));
      } else {
        setStatus(prev => ({ ...prev, ffmpeg: 'loading' }));
      }
    };

    // WebLLM Progress
    const handleWebLLMProgress = (e: Event) => {
      const report = (e as CustomEvent<InitProgressReport>).detail;
      const normalizedProgress = normalizeWebLLMProgress(report.progress);
      const reportText = report.text?.toLowerCase?.() || '';
      const isComplete = normalizedProgress >= 1 || reportText.includes('complete');

      setWebLLMProgress(report);
      setWebLLMMaxProgress(prev => Math.max(prev, normalizedProgress));
      setWebllmError(null);
      setStatus(prev => ({ ...prev, webllm: 'initializing' }));

      if (isComplete) {
        setTimeout(() => {
          setStatus(prev => ({ ...prev, webllm: 'ready' }));
          setWebLLMProgress(null);
        }, 500);
      }
    };

    const handleWebLLMComplete = () => {
      setStatus(prev => ({ ...prev, webllm: 'ready' }));
      setWebLLMProgress(null);
      setWebLLMMaxProgress(1);
    };

    ttsEvents.addEventListener('tts-progress', handleTTSProgress);
    videoEvents.addEventListener('video-progress', handleVideoProgress);
    webLlmEvents.addEventListener('webllm-init-progress', handleWebLLMProgress);
    webLlmEvents.addEventListener('webllm-init-complete', handleWebLLMComplete);

    return () => {
      ttsEvents.removeEventListener('tts-progress', handleTTSProgress);
      videoEvents.removeEventListener('video-progress', handleVideoProgress);
      webLlmEvents.removeEventListener('webllm-init-progress', handleWebLLMProgress);
      webLlmEvents.removeEventListener('webllm-init-complete', handleWebLLMComplete);
    };
  }, [isOpen, activeResources?.webllm, selectedModel]);

  // Check if all *active* resources are ready (inactive/skipped ones are already 'ready' from init)
  // For WebLLM with model selection, we need to wait for both model selection AND initialization
  const isWebLLMReady = !activeResources?.webllm || status.webllm === 'ready';
  const isWebLLMWaiting = activeResources?.webllm && !selectedModel;
  const allReady = !isWebLLMWaiting && status.tts === 'ready' && status.ffmpeg === 'ready' && isWebLLMReady;

  const handleModelSelect = async (modelId: string) => {
    setSelectedModel(modelId);
    setShowModelSelector(false);
    setWebllmError(null);
    setStatus(prev => ({ ...prev, webllm: 'initializing' }));

    try {
      await onWebLLMModelSelect?.(modelId);
    } catch (error) {
      setStatus(prev => ({ ...prev, webllm: 'pending' }));
      setSelectedModel(null);
      setShowModelSelector(true);
      setWebllmError(error instanceof Error ? error.message : 'Failed to initialize the selected model.');
    }
  };

  const getModelDetails = (modelId: string): ModelInfo | undefined => {
    return AVAILABLE_WEB_LLM_MODELS.find(m => m.id === modelId);
  };

  useEffect(() => {
    if (allReady && isOpen) {
      const timer = setTimeout(() => {
        onComplete();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [allReady, isOpen, onComplete]);

  if (!isOpen) return null;

  const getStatusIcon = (resourceStatus: ResourceStatus[keyof ResourceStatus]) => {
    if (resourceStatus === 'ready') {
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    }
    if (resourceStatus === 'downloading' || resourceStatus === 'loading' || resourceStatus === 'initializing') {
      return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
    }
    return <Download className="w-5 h-5 text-white/30" />;
  };

  const getProgressPercent = () => {
    return Math.round(webllmMaxProgress * 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex sm:items-center items-start justify-center p-4 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div className="my-4 sm:my-0 bg-[#0F1115] rounded-lg border border-white/10 shadow-2xl max-h-[90dvh] overflow-y-auto"
        style={{
          width: 'min(100%, clamp(320px, 90vw, 42rem))',
          fontFamily: '"Roboto", "Inter", system-ui, -apple-system, sans-serif',
        }}>
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img src="/favicon-32x32.png" alt="Origami" className="w-10 h-10" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl sm:text-2xl font-semibold text-white">
                {allReady ? 'Setup Complete!' : 'Initial Setup'}
              </h2>
              <p className="text-sm text-white/60 mt-1">
                {allReady ? 'Everything is ready to use' : 'Downloading and initializing local resources'}
              </p>
            </div>
            {allReady && (
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          <div className="bg-blue-500/5 border border-blue-500/10 p-4" style={{ borderRadius: '6px' }}>
            <p className="text-sm text-white/80 leading-relaxed">
              {allReady ? (
                <>All resources have been successfully initialized! You can now use all features completely offline.</>
              ) : (
                <>
                  We're downloading some resources to your browser. This <strong className="text-white">one-time setup</strong> enables
                  everything to work offline and privately. Future visits will be much faster.
                </>
              )}
            </p>
          </div>

          {/* Resource List */}
          <div className="space-y-2">
            {/* TTS */}
            <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10" style={{ borderRadius: '6px' }}>
              {getStatusIcon(status.tts)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-medium text-sm">Voice Narration (TTS)</span>
                  {status.tts === 'ready' && (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 border border-emerald-500/20 font-medium">Ready</span>
                  )}
                </div>
                {ttsProgress && status.tts === 'downloading' && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-white/60 mb-1">
                      <span className="font-mono truncate">{ttsProgress.file}</span>
                      <span className="font-mono">{Math.round(ttsProgress.percent)}%</span>
                    </div>
                    <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 transition-all duration-300"
                        style={{ width: `${Math.round(ttsProgress.percent)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* FFmpeg */}
            <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10" style={{ borderRadius: '6px' }}>
              {getStatusIcon(status.ffmpeg)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-medium text-sm">Video Creator (FFmpeg)</span>
                  {status.ffmpeg === 'ready' && (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 border border-emerald-500/20 font-medium">Ready</span>
                  )}
                </div>
                {ffmpegStatus && status.ffmpeg === 'loading' && (
                  <p className="text-xs text-white/60 mt-1 font-mono">{ffmpegStatus}</p>
                )}
              </div>
            </div>

            {/* WebLLM */}
            <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/10" style={{ borderRadius: '6px' }}>
              {getStatusIcon(status.webllm)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-medium text-sm">AI Writing Assistant (WebLLM)</span>
                  {status.webllm === 'ready' && (
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 border border-emerald-500/20 font-medium">Ready</span>
                  )}
                </div>
                {showModelSelector && !selectedModel ? (
                  <div className="mt-3 space-y-2">
                    {webGpuSupport && !webGpuSupport.supported && (
                      <div className="rounded border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-100">
                        {webGpuSupport.error || 'WebGPU is not available on this device.'}
                      </div>
                    )}
                    {webllmError && (
                      <div className="rounded border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-100">
                        {webllmError}
                      </div>
                    )}
                    <p className="text-xs text-white/60 mb-2">Select a model to download:</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <button
                        onClick={() => setCapabilityFilter('all')}
                        className={`rounded border px-3 py-2 text-left transition-colors ${capabilityFilter === 'all' ? 'border-white bg-white text-black' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                      >
                        <span className="block text-xs font-bold uppercase tracking-[0.18em]">All</span>
                        <span className={`block text-[10px] ${capabilityFilter === 'all' ? 'text-black/60' : 'text-white/40'}`}>Show everything</span>
                      </button>
                      <button
                        onClick={() => setCapabilityFilter('vision')}
                        className={`rounded border px-3 py-2 text-left transition-colors ${capabilityFilter === 'vision' ? 'border-white bg-white text-black' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                      >
                        <span className="block text-xs font-bold uppercase tracking-[0.18em]">Vision</span>
                        <span className={`block text-[10px] ${capabilityFilter === 'vision' ? 'text-black/60' : 'text-white/40'}`}>Image-capable</span>
                      </button>
                      <button
                        onClick={() => setCapabilityFilter('text')}
                        className={`rounded border px-3 py-2 text-left transition-colors ${capabilityFilter === 'text' ? 'border-white bg-white text-black' : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'}`}
                      >
                        <span className="block text-xs font-bold uppercase tracking-[0.18em]">Text</span>
                        <span className={`block text-[10px] ${capabilityFilter === 'text' ? 'text-black/60' : 'text-white/40'}`}>Writing only</span>
                      </button>
                    </div>
                    {groupedCompatibleModels.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {groupedCompatibleModels.map((group) => (
                          <span
                            key={group.title}
                            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/45"
                          >
                            {group.title}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="max-h-48 overflow-y-auto space-y-1.5">
                      {filteredCompatibleModels.map((model) => (
                        <div
                          key={model.id}
                          onClick={() => void handleModelSelect(model.id)}
                          className="p-2 bg-white/10 hover:bg-white/15 border border-white/10 cursor-pointer transition-all group"
                          style={{ borderRadius: '4px' }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-white group-hover:text-blue-300 transition-colors truncate">
                                {model.name} ({model.precision})
                              </p>
                              <p className="text-xs text-white/50">{model.size} • {model.vram_required_MB}MB VRAM</p>
                              <p className="text-[11px] text-white/35">
                                {model.capabilities?.includes('vision') ? 'Vision + text' : 'Text only'}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedInfo(expandedInfo === model.id ? null : model.id);
                              }}
                              className="ml-2 text-white/40 hover:text-white/70"
                            >
                              <Info className="w-3 h-3" />
                            </button>
                          </div>
                          {expandedInfo === model.id && (
                            <div className="mt-1 pt-1 border-t border-white/10 text-xs text-white/60">
                              <p className="mb-1">Model ID: {model.id}</p>
                              <p className="text-white/50 text-xs">Click to select this model</p>
                            </div>
                          )}
                        </div>
                      ))}
                      {filteredCompatibleModels.length === 0 && (
                        <div className="rounded border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                          No compatible WebLLM models match the current capability filter.
                        </div>
                      )}
                    </div>
                  </div>
                ) : selectedModel ? (
                  <div className="mt-2">
                    <p className="text-xs text-white/60 mb-2">
                      Selected: <span className="text-white font-medium">{getModelDetails(selectedModel)?.name} ({getModelDetails(selectedModel)?.precision})</span>
                    </p>
                    {webllmError && (
                      <div className="mb-2 rounded border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-100">
                        {webllmError}
                      </div>
                    )}
                    {status.webllm === 'initializing' && (
                      <>
                        <div className="flex items-center justify-end text-xs text-white/60 mb-1">
                          <span className="font-mono">{getProgressPercent()}%</span>
                        </div>
                        <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-400 transition-all duration-300"
                            style={{ width: `${getProgressPercent()}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-white/60">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="font-mono">Initializing...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/10">
          <p className="text-xs text-white/60 text-center leading-relaxed">
            {allReady ? (
              <>This window will close automatically...</>
            ) : (
              <>Keep this tab open. Downloads may take a few minutes depending on your connection speed.</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
