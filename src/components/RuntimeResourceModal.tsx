
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
          width: 'min(100%, clamp(320px, 88vw, 40rem))',
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

          <div className="space-y-1">
            <p className="text-xs sm:text-sm text-white/80 leading-relaxed text-center">
              Origami uses <a href="https://webllm.mlc.ai/" target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-2">WebLLM</a> for local AI processing. No cloud services or subscriptions required.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="relative p-4 space-y-2">
          {/* TTS Option */}
          <div
            onClick={toggleTTS}
            className={`
              group border transition-all duration-150
              ${preinstalled.tts
                ? 'bg-green-500/5 border-green-500/20 cursor-default'
                : selection.downloadTTS
                  ? 'bg-blue-500/5 border-blue-500/30 hover:border-blue-500/40 cursor-pointer'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/15 cursor-pointer'
              }
            `}
            style={{ borderRadius: '6px' }}
          >
            <div className="flex items-start gap-3 p-3">
              <div className={`p-2 ${preinstalled.tts ? 'bg-green-500/10 text-green-400' : (selection.downloadTTS ? 'bg-blue-500/10 text-blue-400' : 'bg-white/10 text-gray-500')} transition-colors duration-150`} style={{ borderRadius: '4px' }}>
                {preinstalled.tts ? <CheckSquare className="w-4 h-4" /> : <Cpu className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`font-medium text-sm ${preinstalled.tts ? 'text-green-300' : (selection.downloadTTS ? 'text-blue-300' : 'text-gray-300')} flex items-center gap-2`}>
                    <span className="text-white/30 text-xs">1.</span> Voice Narration
                  </h3>
                  {preinstalled.tts && (
                    <span className="text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 border border-green-500/20 font-medium">
                      Ready
                    </span>
                  )}
                  {!preinstalled.tts && (
                    <div className="flex items-center gap-1.5">
                      {selection.downloadTTS ? (
                        <div className="p-0.5 bg-blue-500/10" style={{ borderRadius: '3px' }}>
                          <CheckSquare className="w-3 h-3 text-blue-400" />
                        </div>
                      ) : (
                        <div className="p-0.5 bg-white/10" style={{ borderRadius: '3px' }}>
                          <Square className="w-3 h-3 text-gray-600" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className={`text-xs leading-relaxed ${preinstalled.tts ? 'text-green-200/70' : 'text-white/60'}`}>
                  {preinstalled.tts
                    ? "Already installed and ready to use!"
                    : "Generate natural voiceovers for your tutorials entirely offline. Multiple voices included."
                  }
                </p>
                {!preinstalled.tts && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-white/40">
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
              group border transition-all duration-150
              ${preinstalled.ffmpeg
                ? 'bg-green-500/5 border-green-500/20 cursor-default'
                : selection.downloadFFmpeg
                  ? 'bg-blue-500/5 border-blue-500/30 hover:border-blue-500/40 cursor-pointer'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/15 cursor-pointer'
              }
            `}
            style={{ borderRadius: '6px' }}
          >
            <div className="flex items-start gap-3 p-3">
              <div className={`p-2 ${preinstalled.ffmpeg ? 'bg-green-500/10 text-green-400' : (selection.downloadFFmpeg ? 'bg-blue-500/10 text-blue-400' : 'bg-white/10 text-gray-500')} transition-colors duration-150`} style={{ borderRadius: '4px' }}>
                {preinstalled.ffmpeg ? <CheckSquare className="w-4 h-4" /> : <HardDrive className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`font-medium text-sm ${preinstalled.ffmpeg ? 'text-green-300' : (selection.downloadFFmpeg ? 'text-blue-300' : 'text-gray-300')} flex items-center gap-2`}>
                    <span className="text-white/30 text-xs">2.</span> Video Creator
                  </h3>
                  {preinstalled.ffmpeg && (
                    <span className="text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 border border-green-500/20 font-medium">
                      Ready
                    </span>
                  )}
                  {!preinstalled.ffmpeg && (
                    <div className="flex items-center gap-1.5">
                      {selection.downloadFFmpeg ? (
                        <div className="p-0.5 bg-blue-500/10" style={{ borderRadius: '3px' }}>
                          <CheckSquare className="w-3 h-3 text-blue-400" />
                        </div>
                      ) : (
                        <div className="p-0.5 bg-white/10" style={{ borderRadius: '3px' }}>
                          <Square className="w-3 h-3 text-gray-600" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className={`text-xs leading-relaxed ${preinstalled.ffmpeg ? 'text-green-200/70' : 'text-white/60'}`}>
                  {preinstalled.ffmpeg
                    ? "Already installed and ready to use!"
                    : "Combines your slides, audio, and music into a final MP4 video right in your browser."
                  }
                </p>
                {!preinstalled.ffmpeg && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-white/40">
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
              group border transition-all duration-150
              ${preinstalled.webllm
                ? 'bg-green-500/5 border-green-500/20 cursor-default'
                : selection.enableWebLLM
                  ? 'bg-blue-500/5 border-blue-500/30 hover:border-blue-500/40 cursor-pointer'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/15 cursor-pointer'
              }
            `}
            style={{ borderRadius: '6px' }}
          >
            <div className="flex items-start gap-3 p-3">
              <div className={`p-2 ${preinstalled.webllm ? 'bg-green-500/10 text-green-400' : (selection.enableWebLLM ? 'bg-blue-500/10 text-blue-400' : 'bg-white/10 text-gray-500')} transition-colors duration-150`} style={{ borderRadius: '4px' }}>
                {preinstalled.webllm ? <CheckSquare className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`font-medium text-sm ${preinstalled.webllm ? 'text-green-300' : (selection.enableWebLLM ? 'text-blue-300' : 'text-gray-300')} flex items-center gap-2`}>
                    <span className="text-white/30 text-xs">3.</span> Smart Writing Assistant
                    <span className="text-[10px] bg-white/5 text-white/40 px-1.5 py-0.5 border border-white/10 font-normal">
                      Optional
                    </span>
                  </h3>
                  {preinstalled.webllm && (
                    <span className="text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 border border-green-500/20 font-medium">
                      Ready
                    </span>
                  )}
                  {!preinstalled.webllm && (
                    <div className="flex items-center gap-1.5">
                      {selection.enableWebLLM ? (
                        <div className="p-0.5 bg-blue-500/10" style={{ borderRadius: '3px' }}>
                          <CheckSquare className="w-3 h-3 text-blue-400" />
                        </div>
                      ) : (
                        <div className="p-0.5 bg-white/10" style={{ borderRadius: '3px' }}>
                          <Square className="w-3 h-3 text-gray-600" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className={`text-xs leading-relaxed ${preinstalled.webllm ? 'text-green-200/70' : 'text-white/60'}`}>
                  {preinstalled.webllm
                    ? "Already installed and ready to use!"
                    : "AI assistant helps improve your tutorial script, suggests improvements, and enhances clarity. Runs entirely locally with no API fees."
                  }
                </p>
                {!preinstalled.webllm && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-white/40">
                    <HardDrive className="w-3 h-3" />
                    <span>~1-2GB download • Runs locally</span>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="relative p-4 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10 bg-white/[0.02]">
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-white/50 text-center sm:text-left flex items-center gap-1.5 whitespace-nowrap">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Uncheck to skip download</span>
            </p>
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
          </div>
          <button
            onClick={() => onConfirm(selection, dontShowAgain)}
            className="group w-full sm:w-auto px-5 py-2 bg-white text-black font-medium text-sm hover:bg-white/90 active:bg-white/95 transition-colors shadow-sm flex items-center justify-center gap-2"
            style={{ borderRadius: '4px' }}
          >
            {!selection.downloadTTS && !selection.downloadFFmpeg && !selection.enableWebLLM ? 'Continue' : 'Download'}
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
