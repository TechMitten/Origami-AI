import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { ttsEvents, type ProgressEventDetail } from '../services/ttsService';
import { videoEvents } from '../services/BrowserVideoRenderer';
import { webLlmEvents } from '../services/webLlmService';
import type { InitProgressReport } from '@mlc-ai/web-llm';

interface BackgroundDownloadToastProps {
  active: boolean;
  queue: { tts: boolean; ffmpeg: boolean; webllm: boolean };
}

type ResourceState = 'pending' | 'active' | 'ready';

const RESOURCE_LABELS: Record<'tts' | 'ffmpeg' | 'webllm', string> = {
  tts: 'Voice narration',
  ffmpeg: 'Video renderer',
  webllm: 'AI assistant',
};

export function BackgroundDownloadToast({ active, queue }: BackgroundDownloadToastProps) {
  const [dismissed, setDismissed] = useState(false);
  const [status, setStatus] = useState<Record<'tts' | 'ffmpeg' | 'webllm', ResourceState>>({
    tts: 'pending',
    ffmpeg: 'pending',
    webllm: 'pending',
  });
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!active) return;

    setDismissed(false);
    setStatus({
      tts: queue.tts ? 'active' : 'ready',
      ffmpeg: queue.ffmpeg ? 'pending' : 'ready',
      webllm: queue.webllm ? 'pending' : 'ready',
    });
    setPercent(0);

    const handleTTSProgress = (e: Event) => {
      const detail = (e as CustomEvent<ProgressEventDetail>).detail;
      setStatus(prev => ({ ...prev, tts: 'active' }));
      setPercent(Math.round(detail.progress));
    };
    const handleTTSComplete = () => {
      setStatus(prev => ({ ...prev, tts: 'ready' }));
      setPercent(0);
    };

    const handleVideoProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ status: string }>).detail;
      if (detail.status === 'FFmpeg ready') {
        setStatus(prev => ({ ...prev, ffmpeg: 'ready' }));
        setPercent(0);
      } else {
        setStatus(prev => ({ ...prev, ffmpeg: 'active' }));
      }
    };

    const handleWebLLMProgress = (e: Event) => {
      const report = (e as CustomEvent<InitProgressReport>).detail;
      const normalized = report.progress > 1 ? report.progress / 100 : report.progress;
      setStatus(prev => ({ ...prev, webllm: 'active' }));
      setPercent(Math.round(Math.max(0, Math.min(1, normalized)) * 100));
    };
    const handleWebLLMComplete = () => {
      setStatus(prev => ({ ...prev, webllm: 'ready' }));
      setPercent(0);
    };

    ttsEvents.addEventListener('tts-progress', handleTTSProgress);
    ttsEvents.addEventListener('tts-init-complete', handleTTSComplete);
    videoEvents.addEventListener('video-progress', handleVideoProgress);
    webLlmEvents.addEventListener('webllm-init-progress', handleWebLLMProgress);
    webLlmEvents.addEventListener('webllm-init-complete', handleWebLLMComplete);

    return () => {
      ttsEvents.removeEventListener('tts-progress', handleTTSProgress);
      ttsEvents.removeEventListener('tts-init-complete', handleTTSComplete);
      videoEvents.removeEventListener('video-progress', handleVideoProgress);
      webLlmEvents.removeEventListener('webllm-init-progress', handleWebLLMProgress);
      webLlmEvents.removeEventListener('webllm-init-complete', handleWebLLMComplete);
    };
  }, [active, queue.tts, queue.ffmpeg, queue.webllm]);

  if (!active || dismissed) return null;

  const activeKey = (['tts', 'ffmpeg', 'webllm'] as const).find(key => queue[key] && status[key] === 'active');
  const allReady = (['tts', 'ffmpeg', 'webllm'] as const).every(key => !queue[key] || status[key] === 'ready');

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-72 bg-[#0F1115] border border-white/10 rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
      style={{ fontFamily: '"Roboto", "Inter", system-ui, -apple-system, sans-serif' }}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
        {allReady ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
        ) : (
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
        )}
        <span className="text-xs font-medium text-white flex-1 truncate">
          {allReady ? 'Setup complete' : 'Downloading resources…'}
        </span>
        <button
          onClick={() => setDismissed(true)}
          className="text-white/40 hover:text-white/80 transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-2.5 space-y-1.5">
        {(['tts', 'ffmpeg', 'webllm'] as const).filter(key => queue[key]).map((key) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            {status[key] === 'ready' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : status[key] === 'active' ? (
              <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
            ) : (
              <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
            )}
            <span className={status[key] === 'ready' ? 'text-white/40' : 'text-white/80'}>
              {RESOURCE_LABELS[key]}
            </span>
            {key === activeKey && (
              <span className="ml-auto font-mono text-white/50">{percent}%</span>
            )}
          </div>
        ))}
      </div>

      {activeKey && (
        <div className="h-1 bg-black/40">
          <div
            className="h-full bg-blue-400 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
