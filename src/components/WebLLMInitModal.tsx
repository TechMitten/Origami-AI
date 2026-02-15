import React, { useEffect, useState } from 'react';
import { Loader2, Cpu, CheckCircle2 } from 'lucide-react';
import { webLlmEvents } from '../services/webLlmService';
import type { InitProgressReport } from '@mlc-ai/web-llm';

interface WebLLMInitModalProps {
  isOpen: boolean;
  modelId: string;
  onComplete: () => void;
}

export const WebLLMInitModal: React.FC<WebLLMInitModalProps> = ({
  isOpen,
  modelId,
  onComplete,
}) => {
  const [progress, setProgress] = useState<InitProgressReport | null>(null);
  const [maxProgress, setMaxProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleProgress = (e: Event) => {
      const report = (e as CustomEvent<InitProgressReport>).detail;
      setProgress(report);

      // Track maximum progress to prevent going backward
      setMaxProgress((prev) => Math.max(prev, report.progress));

      // Check if initialization is complete
      if (report.progress === 1) {
        setIsComplete(true);
        // Auto-close after a short delay
        setTimeout(() => {
          onComplete();
        }, 1500);
      }
    };

    webLlmEvents.addEventListener('webllm-init-progress', handleProgress);

    return () => {
      webLlmEvents.removeEventListener('webllm-init-progress', handleProgress);
    };
  }, [isOpen, onComplete]);

  if (!isOpen) return null;

  const getProgressPercent = () => {
    return Math.round(maxProgress * 100);
  };

  const formatModelName = (modelId: string): string => {
    // Convert model ID to readable name
    return modelId
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl mx-4 bg-linear-to-b from-gray-900 to-gray-950 rounded-2xl border border-purple-500/30 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative px-8 py-7 bg-linear-to-r from-purple-500/10 to-blue-500/10 border-b border-white/5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full" />
              <Cpu className="relative w-12 h-12 text-emerald-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-white">
                {isComplete ? 'WebLLM Ready!' : 'Initializing WebLLM'}
              </h2>
              <p className="text-base text-white font-semibold mt-1.5">
                One-time setup for AI features
              </p>
            </div>
            {isComplete && (
              <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-in zoom-in duration-300" />
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-7 space-y-6">
          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-5">
            <p className="text-base text-white leading-relaxed">
              {isComplete ? (
                <>WebLLM has been successfully initialized and is ready to use!</>
              ) : (
                <>
                  WebLLM is being prepared for first use. This <strong className="text-white">one-time process</strong> downloads and
                  caches the AI model (~1-4GB) directly in your browser. Future uses will be instant.
                </>
              )}
            </p>
          </div>

          {/* Model Info */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-base">
              <span className="text-white/60 uppercase tracking-wider font-semibold">
                Model
              </span>
              <span className="text-white text-lg font-medium">
                {formatModelName(modelId)}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          {!isComplete && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-base">
                <span className="text-white/60 uppercase tracking-wider font-semibold">
                  Progress
                </span>
                <span className="text-white font-mono text-xl font-bold">
                  {getProgressPercent()}%
                </span>
              </div>

              <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden ring-1 ring-white/5">
                <div
                  className="h-full bg-linear-to-r from-purple-500 to-blue-500 transition-all duration-300 ease-out shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                  style={{ width: `${getProgressPercent()}%` }}
                />
              </div>

              {/* Status Text */}
              {progress && (
                <div className="flex items-start gap-2 text-sm text-white font-mono">
                  <Loader2 className="w-4 h-4 animate-spin mt-0.5 shrink-0" />
                  <span className="break-all">{progress.text}</span>
                </div>
              )}
            </div>
          )}

          {/* Complete Message */}
          {isComplete && (
            <div className="flex items-center gap-4 py-4 px-5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div className="flex-1">
                <p className="text-base font-semibold text-white">
                  Setup Complete!
                </p>
                <p className="text-sm text-white/70 mt-1">
                  You can now use AI features instantly
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 bg-white/5 border-t border-white/5">
          <p className="text-sm text-white text-center leading-relaxed">
            {isComplete ? (
              <>This window will close automatically...</>
            ) : (
              <>
                Please keep this tab open. This may take a few minutes depending on your connection speed.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
