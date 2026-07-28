import { Download, Loader2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface DownloadBlockedModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The action the user attempted, shown in the modal body. */
  actionLabel?: string;
}

export function DownloadBlockedModal({ isOpen, onClose, actionLabel }: DownloadBlockedModalProps) {
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (isOpen) {
      setIsRendered(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setIsVisible(true)));
    } else {
      setIsVisible(false);
      timerRef.current = setTimeout(() => setIsRendered(false), 300);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen]);

  if (!isRendered) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center p-4 transition-all duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-md bg-[#111318] border border-white/10 rounded-2xl shadow-2xl overflow-hidden transform transition-all duration-300 ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-6'}`}
        style={{ fontFamily: '"Inter", "Roboto", system-ui, sans-serif' }}
      >
        {/* Amber header strip */}
        <div className="px-6 py-4 flex items-center gap-3 bg-amber-500/10 border-b border-amber-500/20">
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 shrink-0">
            <Download className="w-4 h-4 text-amber-400" />
          </div>
          <h3 className="text-base font-bold text-white tracking-tight flex-1">
            Downloads In Progress
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/80 hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-start gap-3">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0 mt-0.5" />
            <p className="text-sm text-white/70 leading-relaxed">
              {actionLabel
                ? <><span className="text-white font-semibold">{actionLabel}</span> requires resources that are still being downloaded.</>
                : <>This feature requires resources that are still being downloaded.</>}
              {' '}Please wait for the setup to finish before trying again.
            </p>
          </div>

          <div className="rounded-xl bg-white/5 border border-white/8 px-4 py-3">
            <p className="text-xs text-white/40 leading-relaxed">
              You can monitor the download progress in the{' '}
              <span className="text-white/60 font-medium">Downloading resources…</span>{' '}
              notification in the bottom-right corner of the screen. This is a one-time download — it will be much faster on subsequent visits.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-all shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-95"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
