
import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';

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
      const targetHeight = 320; // shorter target for the simplified modal
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
        <div className="relative p-4 sm:p-5 border-b border-white/10">
          {/* Logo */}
          <div className="flex justify-center mb-3">
            <img src="/favicon-32x32.png" alt="Origami" className="w-8 h-8" />
          </div>

          <h2 className="text-lg sm:text-xl font-semibold text-white text-center mb-1">
            Initial Setup
          </h2>
          <p className="text-xs sm:text-sm text-white/60 text-center mb-3">
            One-time configuration
          </p>
        </div>

        {/* Body */}
        <div className="relative p-4 space-y-3">
          <p className="text-sm text-white/80 leading-relaxed text-center">
            Origami downloads a few resources — voice narration, video rendering, and a local{' '}
            <a href="https://webllm.mlc.ai/" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-2">WebLLM</a>{' '}
            AI assistant — so everything runs offline and privately, with no cloud services or subscriptions.
          </p>
          <p className="text-sm text-white/80 leading-relaxed text-center">
            Click continue and these will download <strong className="text-white">in the background</strong> — you can keep browsing and using the site while that happens.
          </p>
        </div>

        {/* Footer */}
        <div className="relative p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 bg-white/[0.02]">
          <label className="flex items-center gap-2 cursor-pointer group text-center sm:text-left">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-white/20 bg-white/5 text-blue-500 focus:ring-blue-500/50 focus:ring-offset-0"
            />
            <span className="text-xs text-white/50 group-hover:text-white/60 transition-colors">
              Don't show this setup again
            </span>
          </label>
          <button
            onClick={() => onConfirm(dontShowAgain)}
            className="group w-full sm:w-auto px-5 py-2 bg-white text-black font-medium text-sm hover:bg-white/90 active:bg-white/95 transition-colors shadow-sm flex items-center justify-center gap-2"
            style={{ borderRadius: '4px' }}
          >
            Continue
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
