
import { useState, useEffect } from 'react';
import { Download, Lock } from 'lucide-react';

const MONO_STACK = 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace';

export interface RuntimeResourceModalProps {
  isOpen: boolean;
  onConfirm: (dontShowAgain?: boolean) => void;
}

export function RuntimeResourceModal({ isOpen, onConfirm }: RuntimeResourceModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const [isClosing, setIsClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(isOpen);
  const [scale, setScale] = useState(1);

  // auto-scale to fit viewport height, for a no-scroll experience
  useEffect(() => {
    const updateScale = () => {
      const availableHeight = window.innerHeight - 40; // more headroom for desktop bars
      const targetHeight = 380; // approximate modal height incl. badge header
      const scaleValue = Math.min(1, availableHeight / targetHeight);
      setScale(Math.max(0.85, scaleValue)); // do not shrink too far
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Sync state with props during render (Adjusting state during rendering)
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setDontShowAgain(false);
      setIsClosing(false);
    } else {
      setIsClosing(true);
    }
  }

  useEffect(() => {
    if (isClosing) {
      const timer = setTimeout(() => setIsClosing(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isClosing]);

  // Derived visibility state to avoid cascading renders
  const isVisible = isOpen || isClosing;

  if (!isVisible) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 transition-all duration-200 overflow-y-auto ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {/* Simple backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity" />

      {/* Modal Content */}
      <div className={`
        relative w-full max-h-[calc(100vh-1.5rem)] overflow-y-auto my-0.5 sm:my-0 bg-[#0F1115]
        border border-white/10 rounded-lg shadow-2xl
        transition-all duration-200 ease-out
      `}
        style={{
          width: 'min(100%, clamp(320px, 88vw, 32rem))',
          maxHeight: 'calc(100vh - 1.5rem)',
          transform: `${isOpen ? 'translateY(0)' : 'translateY(0.25rem)'} scale(${scale})`,
          fontFamily: '"Roboto", "Inter", system-ui, -apple-system, sans-serif',
        }}>

        {/* Header */}
        <div className="relative px-4 sm:px-5 pt-5 sm:pt-6 pb-4 sm:pb-5">
          {/* Logo, set in a faceted badge echoing the crane's folded planes */}
          <div className="relative flex items-center justify-center w-16 h-16 mb-3 mx-auto">
            <div className="absolute w-16 h-16 rounded-full bg-blue-500/20 blur-xl" />
            <div className="absolute w-12 h-12 rotate-45 rounded-[6px] border border-blue-400/25 bg-gradient-to-br from-sky-400/15 via-blue-500/10 to-transparent" />
            <img src="/favicon-32x32.png" alt="Origami" className="relative w-9 h-9" />
          </div>

          <div
            className="flex items-center justify-center gap-1.5 mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-blue-300/70"
            style={{ fontFamily: MONO_STACK }}
          >
            <Lock className="w-3 h-3" />
            Local &amp; private
          </div>

          <h2 className="text-xl sm:text-[1.375rem] font-bold text-white text-center tracking-tight">
            Initial setup
          </h2>
          <p className="text-xs text-white/45 text-center mt-1">
            One-time configuration
          </p>
        </div>

        {/* Crease — a seam of light across the fold, not a flat rule */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Body */}
        <div className="relative p-4 sm:p-5 space-y-3.5">
          <p className="text-[13.5px] sm:text-sm text-white/70 leading-relaxed">
            Origami downloads a few resources — <span className="text-white/90 font-medium">voice narration</span>,{' '}
            <span className="text-white/90 font-medium">video rendering</span>, and a local{' '}
            <a href="https://webllm.mlc.ai/" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-400 hover:text-blue-300 underline underline-offset-2">WebLLM</a>{' '}
            <span className="text-white/90 font-medium">AI assistant</span> — so everything runs on this device, with no cloud services or subscriptions.
          </p>
          <p className="text-[13.5px] sm:text-sm text-white/55 leading-relaxed">
            Click continue and these download <span className="text-white/80 font-medium">in the background</span> — keep browsing and using the app while it happens.
          </p>
        </div>

        {/* Crease */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {/* Footer */}
        <div className="relative p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/[0.02]">
          <label className="flex items-center gap-2 cursor-pointer group text-center sm:text-left">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50 focus:ring-offset-0"
            />
            <span className="text-xs text-white/45 group-hover:text-white/60 transition-colors">
              Don't show this setup again
            </span>
          </label>
          <button
            onClick={() => onConfirm(dontShowAgain)}
            className="group w-full sm:w-auto px-5 py-2 rounded-md bg-white text-black font-medium text-sm hover:bg-white/90 active:bg-white/95 transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            Continue
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
