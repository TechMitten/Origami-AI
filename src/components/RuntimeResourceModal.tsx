
import { useState, useEffect } from 'react';
import { Download, HardDrive, Cpu, CheckSquare, Square } from 'lucide-react';

export interface ResourceSelection {
  downloadTTS: boolean;
  downloadFFmpeg: boolean;
  enableWebLLM: boolean;
}

export interface RuntimeResourceModalProps {
  isOpen: boolean;
  onConfirm: (selection: ResourceSelection) => void;
  preinstalled: { tts: boolean; ffmpeg: boolean; webllm: boolean };
}

export function RuntimeResourceModal({ isOpen, onConfirm, preinstalled }: RuntimeResourceModalProps) {
  // Use a combined state for selection
  const [selection, setSelection] = useState<ResourceSelection>({
      downloadTTS: true,
      downloadFFmpeg: true,
      enableWebLLM: true
  });


  const [isClosing, setIsClosing] = useState(false);
  const [prevOpen, setPrevOpen] = useState(isOpen);

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
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" 
      />

      {/* Modal Content */}
      <div className={`
        relative w-full max-w-lg bg-[#0F1115] border border-white/10 rounded-2xl shadow-2xl overflow-hidden
        transform transition-all duration-300 ease-out
        ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
      `}>
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-linear-to-r from-blue-500/10 to-purple-500/10">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-400" />
            Let's Get You Set Up
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            Choose how to power each feature. You can download files to run everything locally, or skip downloads and use your own API keys.
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          
          {/* TTS Option */}
          <div 
            onClick={toggleTTS}
            className={`
              group items-start gap-4 p-4 rounded-xl border transition-all relative overflow-hidden
              ${preinstalled.tts
                ? 'bg-green-500/5 border-green-500/20 cursor-default'
                : selection.downloadTTS 
                    ? 'bg-blue-500/10 border-blue-500/50 hover:bg-blue-500/20 cursor-pointer' 
                    : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer'
              }
            `}
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${preinstalled.tts ? 'bg-green-500/20 text-green-400' : (selection.downloadTTS ? 'bg-blue-500/20 text-blue-300' : 'bg-white/10 text-gray-400')}`}>
                {preinstalled.tts ? <CheckSquare className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                    <h3 className={`font-bold ${preinstalled.tts ? 'text-green-100' : (selection.downloadTTS ? 'text-blue-100' : 'text-gray-300')}`}>
                         Voice Narration
                         {preinstalled.tts && <span className="ml-2 text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/20 uppercase tracking-wider">Ready</span>}
                    </h3>
                    {!preinstalled.tts && (
                        selection.downloadTTS
                        ? <CheckSquare className="w-5 h-5 text-blue-400" />
                        : <Square className="w-5 h-5 text-gray-600" />
                    )}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 ml-12 leading-relaxed">
              {preinstalled.tts
                ? "Already installed and ready to use!"
                : "Adds natural-sounding voice narration to your tutorials. (~80MB)"
              }
              {!preinstalled.tts && (
                <span className="block mt-1 text-white/30">Or skip and use Settings → TTS Model → Use Local TTS Instance</span>
              )}
            </p>
          </div>

          {/* FFmpeg Option */}
          <div 
            onClick={toggleFFmpeg}
            className={`
              group items-start gap-4 p-4 rounded-xl border transition-all relative overflow-hidden
              ${preinstalled.ffmpeg
                ? 'bg-green-500/5 border-green-500/20 cursor-default'
                : selection.downloadFFmpeg 
                    ? 'bg-purple-500/10 border-purple-500/50 hover:bg-purple-500/20 cursor-pointer' 
                    : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer'
              }
            `}
          >
             <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${preinstalled.ffmpeg ? 'bg-green-500/20 text-green-400' : (selection.downloadFFmpeg ? 'bg-purple-500/20 text-purple-300' : 'bg-white/10 text-gray-400')}`}>
                {preinstalled.ffmpeg ? <CheckSquare className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                    <h3 className={`font-bold ${preinstalled.ffmpeg ? 'text-green-100' : (selection.downloadFFmpeg ? 'text-purple-100' : 'text-gray-300')}`}>
                        Video Creator
                        {preinstalled.ffmpeg && <span className="ml-2 text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/20 uppercase tracking-wider">Ready</span>}
                    </h3>
                     {!preinstalled.ffmpeg && (
                        selection.downloadFFmpeg
                        ? <CheckSquare className="w-5 h-5 text-purple-400" />
                        : <Square className="w-5 h-5 text-gray-600" />
                     )}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 ml-12 leading-relaxed">
               {preinstalled.ffmpeg
                ? "Already installed and ready to use!"
                : "Required to create your tutorial video. (~30MB)"
              }
            </p>
          </div>

           {/* WebLLM Option */}
           <div 
            onClick={toggleWebLLM}
            className={`
              group items-start gap-4 p-4 rounded-xl border transition-all relative overflow-hidden
              ${preinstalled.webllm
                ? 'bg-green-500/5 border-green-500/20 cursor-default'
                : selection.enableWebLLM 
                    ? 'bg-orange-500/10 border-orange-500/50 hover:bg-orange-500/20 cursor-pointer' 
                    : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 cursor-pointer'
              }
            `}
          >
             <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${preinstalled.webllm ? 'bg-green-500/20 text-green-400' : (selection.enableWebLLM ? 'bg-orange-500/20 text-orange-400' : 'bg-white/10 text-gray-400')}`}>
                {preinstalled.webllm ? <CheckSquare className="w-5 h-5" /> : <Cpu className="w-5 h-5" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                    <h3 className={`font-bold ${preinstalled.webllm ? 'text-green-100' : (selection.enableWebLLM ? 'text-orange-100' : 'text-gray-300')}`}>
                         Smart Writing Assistant
                         {preinstalled.webllm && <span className="ml-2 text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded border border-green-500/20 uppercase tracking-wider">Ready</span>}
                    </h3>
                     {!preinstalled.webllm && (
                        selection.enableWebLLM
                        ? <CheckSquare className="w-5 h-5 text-orange-500" />
                        : <Square className="w-5 h-5 text-gray-600" />
                     )}
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 ml-12 leading-relaxed">
               {preinstalled.webllm
                ? "Already installed and ready to use!"
                : "AI that improves your script right in your browser. Optional - large download (~1-2GB)."
              }
              {!preinstalled.webllm && (
                <span className="block mt-1 text-white/30">Or skip and use Settings → API to connect Gemini, OpenRouter, or Ollama</span>
              )}
            </p>
          </div>

        </div>

        {/* Footer */}
        <div className="p-6 pt-2 flex items-center justify-end gap-3 border-t border-white/5 bg-black/20">
          <p className="text-xs text-white/30 hidden sm:block">
            Uncheck items to skip and configure alternatives in Settings
          </p>
          <button
            onClick={() => onConfirm(selection)}
            className="w-full sm:w-auto px-8 py-3 bg-white text-black font-bold rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg hover:shadow-white/20 flex items-center justify-center gap-2"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
