import React, { useEffect, useState } from 'react';
import { BrainCircuit } from 'lucide-react';
import { webLlmEvents } from '../services/webLlmService';
import type { InitProgressReport } from '@mlc-ai/web-llm';

interface WebLLMLoadingModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

export const WebLLMLoadingModal: React.FC<WebLLMLoadingModalProps> = ({ isOpen, onComplete }) => {
  const [progress, setProgress] = useState<InitProgressReport | null>(null);
  const [maxPercent, setMaxPercent] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setProgress(null);
      setMaxPercent(0);
      return;
    }

    const handleWebLLMProgress = (e: Event) => {
      const report = (e as CustomEvent<InitProgressReport>).detail;
      setProgress(report);
      
      const newPercent = Math.round(report.progress * 100);
      setMaxPercent(prev => Math.max(prev, newPercent));

      if (report.progress === 1) {
         // Determine if we should wait or close immediately
         // We'll let the parent close it via the Promise resolution in App.tsx for speed,
         // but keep a fallback here just in case.
         setTimeout(onComplete, 500);
      }
    };

    webLlmEvents.addEventListener('webllm-init-progress', handleWebLLMProgress);
    // Also listen for pure completion just in case progress doesn't hit exactly 1 or event order is weird
    const handleComplete = () => {
        setTimeout(() => onComplete(), 500);
    };
    webLlmEvents.addEventListener('webllm-init-complete', handleComplete);

    return () => {
      webLlmEvents.removeEventListener('webllm-init-progress', handleWebLLMProgress);
      webLlmEvents.removeEventListener('webllm-init-complete', handleComplete);
    };
  }, [isOpen, onComplete]);
  if (!isOpen) return null;

  const text = progress?.text || 'Initializing AI Engine...';
  
  // Use tracked max progress to avoid flickering/jumping backwards
  const percent = maxPercent;

  // Extract a cleaner message for the user if possible
  let userMessage = text;
  // Common WebLLM strings to pretty print
  if (text.includes("Finish loading")) userMessage = "Finalizing AI engine...";
  else if (text.includes("Loading model")) userMessage = "Loading AI model into memory...";
  else if (text.includes("Fetching param")) userMessage = "Verifying model parameters...";

  return (
    <div className="fixed inset-0 z-60 flex sm:items-center items-start justify-center p-4 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300 overflow-y-auto">
      <div className="w-full max-w-md my-4 sm:my-0 bg-[#18181b] border border-white/10 rounded-2xl shadow-2xl p-6 flex flex-col items-center text-center">
        
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full animate-pulse" />
          <div className="relative p-4 bg-white/5 rounded-full border border-white/10">
            <BrainCircuit className="w-8 h-8 text-cyan-400" />
          </div>
        </div>

        <h3 className="text-xl font-bold text-white mb-2">
            Starting AI Assistant
        </h3>
        
        <p className="text-sm text-white/60 mb-6 max-w-[80%]">
            Loading the AI model into your device's graphics processor.
        </p>

        <div className="w-full space-y-2">
            <div className="flex justify-between text-xs font-medium text-white/50 uppercase tracking-wider">
                <span>{userMessage}</span>
                <span>{percent}%</span>
            </div>
            
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-cyan-400 transition-all duration-300 ease-out"
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
      </div>
    </div>
  );
};
