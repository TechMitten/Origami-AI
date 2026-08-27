import { useState, useEffect } from 'react';
import { Volume2, Film, Sparkles, Zap, ArrowRight, Check } from 'lucide-react';

export interface RuntimeResourceModalProps {
  isOpen: boolean;
  onConfirm: (dontShowAgain?: boolean) => void;
}

export function RuntimeResourceModal({ isOpen, onConfirm }: RuntimeResourceModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(isOpen);

  // Sync state with props during render
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
      const timer = setTimeout(() => setIsClosing(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isClosing]);

  // Derived visibility state to avoid cascading renders
  const isVisible = isOpen || isClosing;

  if (!isVisible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="initial-setup-title"
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 transition-all duration-250 ease-out overflow-y-auto ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Deep frosted backdrop */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-250" />

      {/* Modal Container */}
      <div
        className={`relative w-full max-w-[34rem] my-auto bg-[#0d111a]/95 border border-white/10 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_35px_rgba(34,211,238,0.06)] overflow-hidden transition-all duration-250 ease-out backdrop-blur-xl ${
          isOpen ? 'scale-100 translate-y-0 opacity-100' : 'scale-95 translate-y-2 opacity-0'
        }`}
        style={{
          fontFamily: '"Roboto", "Inter", system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Top ambient luminescent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/60 via-blue-500/40 to-transparent" />

        {/* Ambient soft glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 h-36 bg-cyan-500/10 blur-3xl pointer-events-none rounded-full" />

        {/* Header */}
        <div className="relative px-5 sm:px-6 pt-5 sm:pt-6 pb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* Origami Logo in Glass Pod */}
            <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/15 via-blue-500/10 to-transparent border border-cyan-400/30 shadow-[0_0_20px_rgba(34,211,238,0.15)] shrink-0">
              <div className="absolute inset-0 rounded-xl bg-cyan-400/5 blur-sm" />
              <img src="/favicon-32x32.png" alt="Origami" className="relative w-7 h-7 object-contain drop-shadow" />
            </div>

            <div>
              <h2 id="initial-setup-title" className="text-xl sm:text-[1.35rem] font-bold text-white tracking-tight leading-tight">
                Initial setup
              </h2>
              <p className="text-xs text-white/50 mt-0.5">
                One-time on-device configuration
              </p>
            </div>
          </div>
        </div>

        {/* Crease divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Body Content */}
        <div className="relative px-5 sm:px-6 py-4 space-y-3.5">
          <p className="text-[13px] text-white/70 leading-relaxed">
            Origami runs entirely in your browser with zero cloud dependencies or subscriptions. We need to prepare three local runtime resources:
          </p>

          {/* Resource Feature Breakdown Cards */}
          <div className="space-y-2">
            {/* Card 1: Kokoro TTS */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center shrink-0 text-cyan-400">
                  <Volume2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white/95">Voice Narration</div>
                  <div className="text-[11px] text-white/50 truncate">Neural speech synthesis (Kokoro TTS)</div>
                </div>
              </div>
            </div>

            {/* Card 2: Video Rendering */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-400/20 flex items-center justify-center shrink-0 text-blue-400">
                  <Film className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white/95">Video Rendering</div>
                  <div className="text-[11px] text-white/50 truncate">Hardware-accelerated composition (FFmpeg WASM)</div>
                </div>
              </div>
            </div>

            {/* Card 3: WebLLM */}
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.06] transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-400/20 flex items-center justify-center shrink-0 text-purple-400">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white/95">AI Assistant</div>
                  <div className="text-[11px] text-white/50 truncate">Private on-device intelligence (WebLLM)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Background Download Notice */}
          <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-cyan-500/[0.06] border border-cyan-500/15 text-[12px] text-cyan-200/90 leading-relaxed">
            <Zap className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              Resources download <strong className="text-white font-medium">in the background</strong> — you can start using the studio immediately.
            </span>
          </div>
        </div>

        {/* Crease divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Footer */}
        <div className="relative px-5 sm:px-6 py-4 flex flex-col-reverse sm:flex-row items-center justify-between gap-3.5 bg-black/30">
          <label className="flex items-center gap-2.5 cursor-pointer group select-none text-left w-full sm:w-auto">
            <div className="relative flex items-center">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="peer sr-only"
              />
              <div className="w-4 h-4 rounded border border-white/20 bg-white/5 peer-checked:bg-cyan-500 peer-checked:border-cyan-400 flex items-center justify-center transition-all group-hover:border-white/40">
                {dontShowAgain && <Check className="w-3 h-3 text-black stroke-[3]" />}
              </div>
            </div>
            <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors">
              Don't show this setup again
            </span>
          </label>

          <button
            onClick={() => onConfirm(dontShowAgain)}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm shadow-[0_0_20px_rgba(34,211,238,0.25)] hover:shadow-[0_0_25px_rgba(34,211,238,0.4)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group cursor-pointer"
          >
            <span>Continue</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
