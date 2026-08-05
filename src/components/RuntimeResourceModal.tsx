
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
      const targetHeight = 320; // approximate modal height incl. horizontal header row
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
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm transition-opacity" />

      {/* Modal Content */}
      <div className={`
        relative w-full max-h-[calc(100vh-1.5rem)] overflow-y-auto my-0.5 sm:my-0
        bg-gradient-to-b from-[#222732] to-[#191D25]
        border border-white/15 rounded-lg shadow-2xl shadow-black/60 ring-1 ring-white/5
        transition-all duration-200 ease-out
      `}
        style={{
          width: 'min(100%, clamp(320px, 88vw, 32rem))',
          maxHeight: 'calc(100vh - 1.5rem)',
          transform: `${isOpen ? 'translateY(0)' : 'translateY(0.25rem)'} scale(${scale})`,
          fontFamily: '"Roboto", "Inter", system-ui, -apple-system, sans-serif',
        }}>

        {/* Header — logo and title sit side by side, so the row spans the panel
            instead of stacking into a narrow column with dead space either side */}
        <div className="relative px-4 sm:px-5 pt-4 sm:pt-5 pb-4">
          {/* Provenance pill, anchored to the far corner to bracket the row */}
          <div
            className="absolute top-4 right-4 sm:top-5 sm:right-5 flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full border border-blue-400/20 bg-blue-400/[0.07] text-[10px] font-medium uppercase tracking-[0.14em] text-blue-300/80"
            style={{ fontFamily: MONO_STACK }}
          >
            <Lock className="w-3 h-3 shrink-0" />
            <span className="hidden sm:inline">Local &amp; private</span>
          </div>

          <div className="flex items-center gap-3.5 sm:gap-4 pr-10 sm:pr-36">
            {/* Logo, set in a faceted badge echoing the crane's folded planes */}
            <div className="relative flex items-center justify-center w-14 h-14 shrink-0">
              <div className="absolute w-14 h-14 rounded-full bg-blue-500/20 blur-xl" />
              <div className="absolute w-11 h-11 rotate-45 rounded-[6px] border border-blue-400/25 bg-gradient-to-br from-sky-400/15 via-blue-500/10 to-transparent" />
              <img src="/favicon-32x32.png" alt="Origami" className="relative w-8 h-8" />
            </div>

            <div className="min-w-0">
              <h2 className="text-xl sm:text-[1.375rem] font-bold text-white tracking-tight leading-tight">
                Initial setup
              </h2>
              <p className="text-xs text-white/45 mt-1">
                One-time configuration
              </p>
            </div>
          </div>
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
        <div className="relative p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3 bg-black/20">
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
