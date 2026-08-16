import React from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Download, Loader2, TriangleAlert, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ShortsRenderPhase = 'rendering' | 'done' | 'error';

interface ShortsRenderModalProps {
  isOpen: boolean;
  phase: ShortsRenderPhase;
  progress: number;
  status: string;
  error?: string | null;
  fileName: string;
  onCancel: () => void;
  onDownload: () => void;
  onClose: () => void;
}

export const ShortsRenderModal: React.FC<ShortsRenderModalProps> = ({
  isOpen,
  phase,
  progress,
  status,
  error,
  fileName,
  onCancel,
  onDownload,
  onClose,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-white">
            {phase === 'rendering' && 'Rendering your short'}
            {phase === 'done' && 'Your short is ready'}
            {phase === 'error' && 'Render failed'}
          </h2>
          {phase !== 'rendering' && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 text-white/40 transition-colors hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {phase === 'rendering' && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3 text-sm text-white/70">
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
              <span className="flex-1">{status || 'Working...'}</span>
              <span className="tabular-nums text-white/40">{Math.round(progress)}%</span>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-[width] duration-200"
                style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
              />
            </div>

            <p className="text-xs text-white/35">
              Keep this tab open and in the foreground. Encoding runs entirely on your device.
            </p>

            <button
              type="button"
              onClick={onCancel}
              className="w-full rounded-lg border border-white/10 py-2.5 text-sm text-white/60 transition-colors hover:border-red-400/40 hover:text-red-300"
            >
              Cancel render
            </button>
          </div>
        )}

        {phase === 'done' && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span className="truncate">{fileName}</span>
            </div>

            <button
              type="button"
              onClick={onDownload}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 py-3 text-sm font-bold text-black transition-all hover:brightness-110"
            >
              <Download className="h-4 w-4" />
              Download MP4
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-white/10 py-2.5 text-sm text-white/60 transition-colors hover:border-white/25 hover:text-white"
            >
              Back to storyboard
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span className={cn('break-words')}>{error || 'Something went wrong during rendering.'}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg border border-white/10 py-2.5 text-sm text-white/60 transition-colors hover:border-white/25 hover:text-white"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};
