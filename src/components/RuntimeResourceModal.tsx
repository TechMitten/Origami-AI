
import { useState, useEffect } from 'react';
import { Download, HardDrive, Cpu, CheckSquare, Square, Zap } from 'lucide-react';

export interface ResourceSelection {
  downloadTTS: boolean;
  downloadFFmpeg: boolean;
  enableWebLLM: boolean;
}

export interface RuntimeResourceModalProps {
  isOpen: boolean;
  onConfirm: (selection: ResourceSelection, dontShowAgain?: boolean) => void;
  preinstalled: { tts: boolean; ffmpeg: boolean; webllm: boolean };
}

export function RuntimeResourceModal({ isOpen, onConfirm, preinstalled }: RuntimeResourceModalProps) {
  // Use a combined state for selection
  const [selection, setSelection] = useState<ResourceSelection>({
    downloadTTS: true,
    downloadFFmpeg: true,
    enableWebLLM: true
  });
  const [dontShowAgain, setDontShowAgain] = useState(false);


  const [isClosing, setIsClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(isOpen);
  const [scale, setScale] = useState(1);

  // auto-scale to fit viewport height, for a no-scroll experience
  useEffect(() => {
    const updateScale = () => {
      const availableHeight = window.innerHeight - 40; // more headroom for desktop bars
      const targetHeight = 560; // narrower/taller reduced target
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
      // Opening
      setSelection({
        downloadTTS: true,
        downloadFFmpeg: true,
        enableWebLLM: true
      });
      setIsClosing(false);
    } else {
      // Closing
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

  const toggleTTS = () => {
    if (!preinstalled.tts) {
      setSelection(prev => ({ ...prev, downloadTTS: !prev.downloadTTS }));
    }
  };

  const toggleFFmpeg = () => {
    if (!preinstalled.ffmpeg) {
      setSelection(prev => ({ ...prev, downloadFFmpeg: !prev.downloadFFmpeg }));
    }
  };

  const toggleWebLLM = () => {
    setSelection(prev => ({ ...prev, enableWebLLM: !prev.enableWebLLM }));
  };

  return (
<div className={`fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 transition-all duration-300 overflow-y-auto ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {/* Backdrop with animated gradient */}
      <div
        className="absolute inset-0 bg-linear-to-br from-black/80 via-black/70 to-black/80 backdrop-blur-md transition-opacity"
      />

      {/* Modal Content */}
      <div className={`
        relative w-full max-h-[calc(100vh-1.5rem)] overflow-y-auto my-0.5 sm:my-0 bg-linear-to-br from-[#0F1115] via-[#12151A] to-[#0A0C0F]
        border border-white/8 rounded-2xl shadow-xl
        transition-all duration-300 ease-out
      `}
        style={{
          width: 'min(100%, clamp(320px, 88vw, 40rem))',
          maxHeight: 'calc(100vh - 1.5rem)',
          transform: `${isOpen ? 'translateY(0)' : 'translateY(0.25rem)'} scale(${scale})`,
        }}>
        {/* Decorative gradient border */}
        <div className="absolute inset-0 rounded-3xl bg-linear-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 opacity-0 blur-xl transition-opacity duration-500" />
        <div className={`absolute inset-0 rounded-3xl bg-linear-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 transition-opacity duration-700 ${isOpen ? 'opacity-100' : 'opacity-0'}`} />

        {/* Header */}
        <div className="relative p-3 sm:p-4 border-b border-white/5">
          {/* Decorative icon */}
          <div className="flex justify-center mb-3">
            <div className="relative">
              <div className="absolute inset-0 bg-linear-to-r from-blue-500/30 via-purple-500/30 to-pink-500/30 rounded-2xl blur-xl animate-pulse" />
              <div className="relative bg-linear-to-br from-blue-500/20 to-purple-500/20 p-3 rounded-2xl border border-white/10">
                <img src="/favicon-32x32.png" alt="Origami" className="w-8 h-8" />
              </div>
            </div>
          </div>

          <h2 className="text-base sm:text-lg font-bold text-white text-center mb-1.5 tracking-tight">
            Let's Get You Set Up
          </h2>
          <p className="text-xs sm:text-sm text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400 text-center mb-3 uppercase tracking-wider font-medium">
            One-time setup
          </p>

          <div className="space-y-1.5">
            <p className="text-xs sm:text-sm text-white/90 leading-tight text-center">
              Origami uses <a href="https://webllm.mlc.ai/" target="_blank" rel="noopener noreferrer" className="font-semibold text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400 no-underline hover:no-underline focus:no-underline">WebLLM</a> — small, powerful in-browser AI. No cloud or subscription.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="relative p-2.5 sm:p-3 space-y-1 sm:space-y-1.5">
          {/* TTS Option */}
          <div
            onClick={toggleTTS}
            className={`
              group relative overflow-hidden rounded-2xl border transition-all duration-200
              ${preinstalled.tts
                ? 'bg-linear-to-br from-green-500/10 to-green-500/5 border-green-500/20 cursor-default'
                : selection.downloadTTS
                  ? 'bg-linear-to-br from-blue-500/15 to-blue-500/5 border-blue-500/30 hover:border-blue-500/50 cursor-pointer shadow-lg shadow-blue-500/5'
                  : 'bg-white/3 border-white/5 hover:bg-white/5 hover:border-white/10 cursor-pointer'
              }
            `}
          >
            {/* Glow effect for selected state */}
            {selection.downloadTTS && !preinstalled.tts && (
              <div className="absolute inset-0 bg-linear-to-r from-blue-500/10 to-cyan-500/10 blur-xl opacity-50" />
            )}

            <div className="relative flex items-start gap-2.5 p-2.5 sm:p-3">
              <div className={`p-2 rounded-xl ${preinstalled.tts ? 'bg-green-500/20 text-green-400' : (selection.downloadTTS ? 'bg-linear-to-br from-blue-500/20 to-cyan-500/20 text-blue-300' : 'bg-white/5 text-gray-500')} transition-all duration-200`}>
                {preinstalled.tts ? <CheckSquare className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className={`font-semibold ${preinstalled.tts ? 'text-green-300' : (selection.downloadTTS ? 'text-blue-300' : 'text-gray-300')} flex items-center gap-2`}>
                    <span className="text-white/40 text-sm">1.</span> Voice Narration
                  </h3>
                  {preinstalled.tts && (
                    <span className="text-[10px] bg-green-500/20 text-green-400 px-2.5 py-1 rounded-lg border border-green-500/20 uppercase tracking-wider font-semibold">
                      Ready
                    </span>
                  )}
                  {!preinstalled.tts && (
                    <div className="flex items-center gap-2">
                      {selection.downloadTTS ? (
                        <div className="p-1 rounded-lg bg-blue-500/20">
                          <CheckSquare className="w-3 h-3 text-blue-400" />
                        </div>
                      ) : (
                        <div className="p-1.5 rounded-lg bg-white/5">
                          <Square className="w-4 h-4 text-gray-600" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className={`text-sm leading-relaxed ${preinstalled.tts ? 'text-green-200/80' : 'text-white/50'}`}>
                  {preinstalled.tts
                    ? "Already installed and ready to use!"
                    : "Generate natural voiceovers for your tutorials entirely offline. Multiple voices included."
                  }
                </p>
                {!preinstalled.tts && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-white/40">
                    <HardDrive className="w-3 h-3" />
                    <span>~80MB download • Runs locally</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* FFmpeg Option */}
          <div
            onClick={toggleFFmpeg}
            className={`
              group relative overflow-hidden rounded-2xl border transition-all duration-200
              ${preinstalled.ffmpeg
                ? 'bg-linear-to-br from-green-500/10 to-green-500/5 border-green-500/20 cursor-default'
                : selection.downloadFFmpeg
                  ? 'bg-linear-to-br from-purple-500/15 to-purple-500/5 border-purple-500/30 hover:border-purple-500/50 cursor-pointer shadow-lg shadow-purple-500/5'
                  : 'bg-white/3 border-white/5 hover:bg-white/5 hover:border-white/10 cursor-pointer'
              }
            `}
          >
            {/* Glow effect for selected state */}
            {selection.downloadFFmpeg && !preinstalled.ffmpeg && (
              <div className="absolute inset-0 bg-linear-to-r from-purple-500/10 to-pink-500/10 blur-xl opacity-50" />
            )}

            <div className="relative flex items-start gap-2.5 p-2.5 sm:p-3">
              <div className={`p-2 rounded-xl ${preinstalled.ffmpeg ? 'bg-green-500/20 text-green-400' : (selection.downloadFFmpeg ? 'bg-linear-to-br from-purple-500/20 to-pink-500/20 text-purple-300' : 'bg-white/5 text-gray-500')} transition-all duration-200`}>
                {preinstalled.ffmpeg ? <CheckSquare className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className={`font-semibold ${preinstalled.ffmpeg ? 'text-green-300' : (selection.downloadFFmpeg ? 'text-purple-300' : 'text-gray-300')} flex items-center gap-2`}>
                    <span className="text-white/40 text-sm">2.</span> Video Creator
                  </h3>
                  {preinstalled.ffmpeg && (
                    <span className="text-[10px] bg-green-500/20 text-green-400 px-2.5 py-1 rounded-lg border border-green-500/20 uppercase tracking-wider font-semibold">
                      Ready
                    </span>
                  )}
                  {!preinstalled.ffmpeg && (
                    <div className="flex items-center gap-2">
                      {selection.downloadFFmpeg ? (
                        <div className="p-1 rounded-lg bg-purple-500/20">
                          <CheckSquare className="w-3 h-3 text-purple-400" />
                        </div>
                      ) : (
                        <div className="p-1 rounded-lg bg-white/5">
                          <Square className="w-3 h-3 text-gray-600" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className={`text-sm leading-relaxed ${preinstalled.ffmpeg ? 'text-green-200/80' : 'text-white/50'}`}>
                  {preinstalled.ffmpeg
                    ? "Already installed and ready to use!"
                    : "Combines your slides, audio, and music into a final MP4 video right in your browser."
                  }
                </p>
                {!preinstalled.ffmpeg && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-white/40">
                    <HardDrive className="w-3 h-3" />
                    <span>~30MB download • Runs locally</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* WebLLM Option */}
          <div
            onClick={toggleWebLLM}
            className={`
              group relative overflow-hidden rounded-2xl border transition-all duration-200
              ${preinstalled.webllm
                ? 'bg-linear-to-br from-green-500/10 to-green-500/5 border-green-500/20 cursor-default'
                : selection.enableWebLLM
                  ? 'bg-linear-to-br from-orange-500/15 to-amber-500/5 border-orange-500/30 hover:border-orange-500/50 cursor-pointer shadow-lg shadow-orange-500/5'
                  : 'bg-white/3 border-white/5 hover:bg-white/5 hover:border-white/10 cursor-pointer'
              }
            `}
          >
            {/* Glow effect for selected state */}
            {selection.enableWebLLM && !preinstalled.webllm && (
              <div className="absolute inset-0 bg-linear-to-r from-orange-500/10 to-amber-500/10 blur-xl opacity-50" />
            )}

            <div className="relative flex items-start gap-2.5 p-2.5 sm:p-3">
              <div className={`p-2 rounded-xl ${preinstalled.webllm ? 'bg-green-500/20 text-green-400' : (selection.enableWebLLM ? 'bg-linear-to-br from-orange-500/20 to-amber-500/20 text-orange-400' : 'bg-white/5 text-gray-500')} transition-all duration-200`}>
                {preinstalled.webllm ? <CheckSquare className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <h3 className={`font-semibold ${preinstalled.webllm ? 'text-green-300' : (selection.enableWebLLM ? 'text-orange-300' : 'text-gray-300')} flex items-center gap-2`}>
                    <span className="text-white/40 text-sm">3.</span> Smart Writing Assistant
                    <span className="text-[10px] bg-white/5 text-white/40 px-2 py-0.5 rounded-md border border-white/10 uppercase tracking-wider font-normal">
                      Optional
                    </span>
                  </h3>
                  {preinstalled.webllm && (
                    <span className="text-[10px] bg-green-500/20 text-green-400 px-2.5 py-1 rounded-lg border border-green-500/20 uppercase tracking-wider font-semibold">
                      Ready
                    </span>
                  )}
                  {!preinstalled.webllm && (
                    <div className="flex items-center gap-2">
                      {selection.enableWebLLM ? (
                        <div className="p-1 rounded-lg bg-orange-500/20">
                          <CheckSquare className="w-3 h-3 text-orange-400" />
                        </div>
                      ) : (
                        <div className="p-1 rounded-lg bg-white/5">
                          <Square className="w-3 h-3 text-gray-600" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className={`text-sm leading-relaxed ${preinstalled.webllm ? 'text-green-200/80' : 'text-white/50'}`}>
                  {preinstalled.webllm
                    ? "Already installed and ready to use!"
                    : "AI assistant helps improve your tutorial script, suggests improvements, and enhances clarity. Runs entirely locally with no API fees."
                  }
                </p>
                {!preinstalled.webllm && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-white/40">
                    <HardDrive className="w-3 h-3" />
                    <span>~1-2GB download • Runs locally</span>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="relative p-2.5 sm:p-3 pt-2 sm:pt-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-2.5 border-t border-white/5 bg-linear-to-b from-transparent to-black/20">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-white/40 text-center sm:text-left flex items-center gap-1.5 whitespace-nowrap">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Uncheck to skip download</span>
            </p>
            <label className="flex items-center gap-2 cursor-pointer group text-center sm:text-left">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-xs text-white/40 group-hover:text-white/50 transition-colors">
                Don't show this setup again
              </span>
            </label>
          </div>
          <button
            onClick={() => onConfirm(selection, dontShowAgain)}
            className="group w-full sm:w-auto px-4 py-1.5 bg-linear-to-r from-white to-gray-100 text-black font-semibold rounded-lg hover:scale-105 active:scale-95 transition-all duration-200 shadow-sm shadow-white/10 hover:shadow-white/20 hover:shadow-md flex items-center justify-center gap-1"
          >
            {!selection.downloadTTS && !selection.downloadFFmpeg && !selection.enableWebLLM ? 'Continue' : 'Download'}
            <Download className="w-4 h-4 group-hover:translate-y-px transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
}
