import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, Download } from 'lucide-react';
import { webLlmEvents } from '../services/webLlmService';
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
  onComplete: (dontShowAgain?: boolean) => void;
}

interface ResourceStatus {
  tts: 'pending' | 'downloading' | 'ready';
  ffmpeg: 'pending' | 'loading' | 'ready';
  webllm: 'pending' | 'initializing' | 'ready';
}

export const UnifiedInitModal: React.FC<UnifiedInitModalProps> = ({
  isOpen,
  resources,
  onComplete,
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [status, setStatus] = useState<ResourceStatus>({
    tts: resources.tts ? 'ready' : 'pending',
    ffmpeg: resources.ffmpeg ? 'ready' : 'pending',
    webllm: resources.webllm ? 'ready' : 'pending',
  });

  const [ttsProgress, setTTSProgress] = useState<{ percent: number; file: string } | null>(null);
  const [ffmpegStatus, setFFmpegStatus] = useState<string>('');
  const [webllmProgress, setWebLLMProgress] = useState<InitProgressReport | null>(null);
  const [webllmMaxProgress, setWebLLMMaxProgress] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

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
      setWebLLMProgress(report);
      setWebLLMMaxProgress(prev => Math.max(prev, report.progress));
      setStatus(prev => ({ ...prev, webllm: 'initializing' }));

      if (report.progress === 1) {
        setTimeout(() => {
          setStatus(prev => ({ ...prev, webllm: 'ready' }));
          setWebLLMProgress(null);
        }, 500);
      }
    };

    ttsEvents.addEventListener('tts-progress', handleTTSProgress);
    videoEvents.addEventListener('video-progress', handleVideoProgress);
    webLlmEvents.addEventListener('webllm-init-progress', handleWebLLMProgress);

    return () => {
      ttsEvents.removeEventListener('tts-progress', handleTTSProgress);
      videoEvents.removeEventListener('video-progress', handleVideoProgress);
      webLlmEvents.removeEventListener('webllm-init-progress', handleWebLLMProgress);
    };
  }, [isOpen]);

  // Check if all resources are ready
  const allReady = status.tts === 'ready' && status.ffmpeg === 'ready' && status.webllm === 'ready';

  useEffect(() => {
    if (allReady && isOpen) {
      const timer = setTimeout(() => {
        onComplete(dontShowAgain);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [allReady, isOpen, onComplete, dontShowAgain]);

  if (!isOpen) return null;

  const getStatusIcon = (resourceStatus: ResourceStatus[keyof ResourceStatus]) => {
    if (resourceStatus === 'ready') {
      return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    }
    if (resourceStatus === 'downloading' || resourceStatus === 'loading' || resourceStatus === 'initializing') {
      return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
    }
    return <Download className="w-5 h-5 text-white/40" />;
  };

  const getProgressPercent = () => {
    return Math.round(webllmMaxProgress * 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl mx-4 bg-linear-to-b from-gray-900 to-gray-950 rounded-2xl border border-purple-500/30 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative px-8 py-7 bg-linear-to-r from-purple-500/10 to-blue-500/10 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full" />
              <Download className="relative w-12 h-12 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-white">
                {allReady ? 'Setup Complete!' : 'One-time Setup'}
              </h2>
              <p className="text-base text-white font-semibold mt-1.5">
                {allReady ? 'Everything is ready to use' : 'Downloading and initializing local resources'}
              </p>
            </div>
            {allReady && (
              <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-in zoom-in duration-300" />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-7 space-y-5">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5">
            <p className="text-base text-white leading-relaxed">
              {allReady ? (
                <>All resources have been successfully initialized! You can now use all features completely offline.</>
              ) : (
                <>
                  We're downloading some resources to your browser. This <strong className="text-white">one-time setup</strong> enables
                  everything to work offline and privately. Future visits will be instant.
                </>
              )}
            </p>
          </div>

          {/* Resource List */}
          <div className="space-y-3">
            {/* TTS */}
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
              {getStatusIcon(status.tts)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-semibold">Voice Narration (TTS)</span>
                  {status.tts === 'ready' && (
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 uppercase tracking-wider">Ready</span>
                  )}
                </div>
                {ttsProgress && status.tts === 'downloading' && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-white/70 mb-1">
                      <span className="font-mono truncate">{ttsProgress.file}</span>
                      <span className="font-mono">{Math.round(ttsProgress.percent)}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 transition-all duration-300"
                        style={{ width: `${Math.round(ttsProgress.percent)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* FFmpeg */}
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
              {getStatusIcon(status.ffmpeg)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-semibold">Video Creator (FFmpeg)</span>
                  {status.ffmpeg === 'ready' && (
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 uppercase tracking-wider">Ready</span>
                  )}
                </div>
                {ffmpegStatus && status.ffmpeg === 'loading' && (
                  <p className="text-xs text-white/70 mt-1 font-mono">{ffmpegStatus}</p>
                )}
              </div>
            </div>

            {/* WebLLM */}
            <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
              {getStatusIcon(status.webllm)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-semibold">AI Writing Assistant (WebLLM)</span>
                  {status.webllm === 'ready' && (
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 uppercase tracking-wider">Ready</span>
                  )}
                </div>
                {status.webllm === 'initializing' && (
                  <div className="mt-2">
                    {webllmProgress ? (
                      <>
                        <div className="flex items-center justify-end text-xs text-white/70 mb-1">
                          <span className="font-mono">{getProgressPercent()}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-linear-to-r from-purple-500 to-blue-500 transition-all duration-300"
                            style={{ width: `${getProgressPercent()}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-white/70">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span className="font-mono">Initializing...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-white/5 border-t border-white/5 space-y-3">
          {/* Don't show again checkbox */}
          {allReady && (
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-white/10 text-purple-500 focus:ring-purple-500 focus:ring-offset-0"
              />
              <span className="text-sm text-white/80 group-hover:text-white transition-colors">
                Don't show this setup modal again
              </span>
            </label>
          )}
          <p className="text-sm text-white text-center leading-relaxed">
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
