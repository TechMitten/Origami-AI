import React, { useState, useEffect } from 'react';
import { X, Sparkles, Image as ImageIcon, Download, RefreshCw, Wand2, Loader2, Copy, Check } from 'lucide-react';
import { generateThumbnailPrompt } from '../services/aiService';
import { useModal } from '../context/ModalContext';
import type { SlideData } from './SlideEditor';
import type { GlobalSettings } from '../services/storage';

interface ThumbnailGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  slides: SlideData[];
  globalSettings: GlobalSettings | null;
}

export const ThumbnailGeneratorModal: React.FC<ThumbnailGeneratorModalProps> = ({ 
  isOpen, 
  onClose, 
  slides,
  globalSettings 
}) => {
  const [prompt, setPrompt] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [seed, setSeed] = useState<number>(Math.floor(Math.random() * 10000));
  const [isCopied, setIsCopied] = useState(false);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [overlayText, setOverlayText] = useState('');
  const [useSameSeed, setUseSameSeed] = useState(false);
  const { showAlert } = useModal();

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
        setPrompt('');
        setGeneratedImageUrl(null);
        setObjectUrl(null);
        setSeed(Math.floor(Math.random() * 10000));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGeneratePrompt = async () => {
    const useWebLLM = globalSettings?.useWebLLM;
    const webLlmModel = globalSettings?.webLlmModel;
    const apiKey = localStorage.getItem('llm_api_key') || localStorage.getItem('gemini_api_key');
    const baseUrl = localStorage.getItem('llm_base_url') || 'https://generativelanguage.googleapis.com/v1beta/openai/';
    const model = localStorage.getItem('llm_model') || 'gemini-2.5-flash';

    if (!useWebLLM && !apiKey) {
      showAlert('Please configure your LLM settings (Base URL, Model, API Key) in Settings to use this feature.', { type: 'warning', title: 'Missing Configuration' });
      return;
    }

    if (useWebLLM && !webLlmModel) {
        showAlert('Please select and load a WebLLM model in Settings (WebLLM tab) to use this feature.', { type: 'warning', title: 'WebLLM Not Configured' });
        return;
    }

    // Aggregate slide text
    const fullText = slides
        .map(s => s.script)
        .join('\n')
        .trim();

    if (!fullText) {
        showAlert('No content found in slides to generate a prompt from.', { type: 'warning', title: 'No Content' });
        return;
    }

    setIsGeneratingPrompt(true);
    try {
      const generatedPrompt = await generateThumbnailPrompt({
        apiKey: apiKey || '',
        baseUrl,
        model,
        useWebLLM,
        webLlmModel
      }, fullText);
      
      setPrompt(generatedPrompt);
    } catch (error) {
       showAlert('Failed to generate prompt: ' + (error instanceof Error ? error.message : String(error)), { type: 'error', title: 'Generation Failed' });
    } finally {
       setIsGeneratingPrompt(false);
    }
  };

  const generateImage = async () => {
      if (!prompt) return;
      
      const pollApiKey = import.meta.env.VITE_POLLINATIONS_API_KEY;
      if (!pollApiKey || pollApiKey === 'YOUR_API_KEY_HERE') {
          showAlert('Please set your VITE_POLLINATIONS_API_KEY in the .env file to generate images.', { type: 'warning', title: 'API Key Missing' });
          return;
      }

      setIsGeneratingImage(true);
      
      let currentSeed = seed;
      if (!useSameSeed) {
          currentSeed = Math.floor(Math.random() * 100000);
          setSeed(currentSeed);
      }
      
      let finalPrompt = prompt;
      if (overlayText.trim()) {
          // Aggressive text shaping prompt for Flux
          finalPrompt += `, THE FOLLOWING IS EXTREMELY IMPORTANT! ITS CRITICAL THAT YOU SPELL EVERYTHING CORRECT: (perfect typography:1.5), title text ""${overlayText.trim().toUpperCase()}"" written in massive bold sans-serif font, CRYSTAL CLEAR AND HIGHLY LEGIBLE, high contrast text, PERFECT SPELLING IS MANDATORY, centered composition, text isolated from background, no overlap with main subject, no gibberish, no duplicate text, professional poster design`;
      }

      const encodedPrompt = encodeURIComponent(finalPrompt);
      // Added enhance=false to prevent Pollinations' prompt-rewriter from messing up the specific text instruction
      // kept nologo=true
      const url = `https://gen.pollinations.ai/image/${encodedPrompt}?width=1920&height=1080&nologo=true&enhance=false&model=flux&seed=${currentSeed}`;
      
      try {
          const response = await fetch(url, {
              headers: {
                  'Authorization': `Bearer ${pollApiKey}`
              }
          });

          if (!response.ok) {
              const errorText = await response.text().catch(() => 'Unknown error');
              throw new Error(`Failed to generate image: ${response.status} ${errorText}`);
          }

          const blob = await response.blob();
          const objUrl = window.URL.createObjectURL(blob);
          
          if (objectUrl) {
            window.URL.revokeObjectURL(objectUrl);
          }
          
          setObjectUrl(objUrl);
          setGeneratedImageUrl(objUrl);
          // Note: setIsGeneratingImage(false) will be handled by handleImageLoad in the <img> tag
          // but since we already have the blob, we can also just set it here.
          // Let's keep it consistent with the <img> tag's onLoad.
      } catch (error) {
          console.error("Image generation failed", error);
          setIsGeneratingImage(false);
          showAlert('Failed to generate image: ' + (error instanceof Error ? error.message : String(error)), { type: 'error', title: 'Generation Failed' });
      }
  };
  
  const handleImageLoad = () => {
      setIsGeneratingImage(false);
  };
  
  const handleImageError = () => {
      setIsGeneratingImage(false);
      showAlert('Failed to load image from provider. Please try again.', { type: 'error', title: 'Image Error' });
  };

  const handleDownload = async () => {
      if (!generatedImageUrl) return;

      try {
          const response = await fetch(generatedImageUrl);
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `thumbnail-${seed}.jpg`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
      } catch (e) {
          console.error("Download failed", e);
          // Fallback - just open in new tab
          window.open(generatedImageUrl, '_blank');
      }
  };

  const handleCopyPrompt = async () => {
      if (!prompt) return;
      try {
          await navigator.clipboard.writeText(prompt);
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
          console.error(err);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div 
        className="relative w-full max-w-5xl max-h-[90vh] bg-[#0F0F0F] rounded-3xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-linear-to-r from-branding-primary/10 to-transparent">
          <div className="space-y-1">
             <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
               <ImageIcon className="w-6 h-6 text-branding-primary" />
               AI Thumbnail Generator
             </h2>
             <p className="text-white/40 text-sm font-medium">Create stunning YouTube thumbnails using Flux AI</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 -mr-2 text-white/40 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 scroller">
            
            {/* Step 1: Prompt Generation */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        Generate Prompt
                    </h3>
                    <button
                        onClick={handleGeneratePrompt}
                        disabled={isGeneratingPrompt}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-branding-primary text-white font-bold hover:bg-branding-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm border border-white/20"
                    >
                        {isGeneratingPrompt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                        {isGeneratingPrompt ? 'Analyzing Slides...' : 'Generate Magic Prompt'}
                    </button>
                </div>
                
                <div className="relative group">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="AI generated prompt will appear here... You can also edit it manually."
                        className="w-full h-32 px-4 py-3 bg-black/40 rounded-xl border border-white/10 text-white text-sm focus:border-branding-primary/50 focus:ring-1 focus:ring-branding-primary/50 outline-none transition-all resize-none font-mono leading-relaxed"
                    />
                    {prompt && (
                         <button
                            onClick={handleCopyPrompt}
                            className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
                            title="Copy Prompt"
                        >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                    )}
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-bold text-white/70 uppercase tracking-wider">Overlay Text (Optional)</label>
                    <input 
                        type="text"
                        value={overlayText}
                        onChange={(e) => setOverlayText(e.target.value)}
                        placeholder="e.g. macOS On Linux?!"
                        className="w-full px-4 py-3 bg-black/40 rounded-xl border border-white/10 text-white text-sm focus:border-branding-primary/50 focus:ring-1 focus:ring-branding-primary/50 outline-none transition-all placeholder:text-white/50"
                    />
                    <p className="text-[10px] text-white/40">Text added here will be  rendered into the image by the AI.</p>
                </div>
            </div>

            {/* Step 2: Image Generation */}
            <div className={`space-y-4 transition-opacity duration-500 ${!prompt ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    </h3>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer group">
                            <input 
                                type="checkbox" 
                                checked={useSameSeed}
                                onChange={(e) => setUseSameSeed(e.target.checked)}
                                className="w-4 h-4 rounded border-white/20 bg-white/5 text-branding-primary focus:ring-branding-primary/50 transition-all cursor-pointer"
                            />
                            <span className="text-sm font-medium text-white/60 group-hover:text-white transition-colors">Lock Seed</span>
                        </label>
                        <button
                            onClick={generateImage}
                            disabled={!prompt || isGeneratingImage}
                            className="flex items-center gap-2 px-6 py-2 rounded-lg bg-white text-black font-bold hover:bg-gray-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_-5px_rgba(255,255,255,0.5)]"
                        >
                             {isGeneratingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                             {generatedImageUrl && !useSameSeed ? 'Regenerate (New Seed)' : (generatedImageUrl && useSameSeed ? 'Regenerate (Same Seed)' : 'Generate Image')}
                        </button>
                    </div>
                </div>

                <div className="relative w-full aspect-video bg-black/50 rounded-2xl border border-white/10 overflow-hidden group flex items-center justify-center">
                    {!generatedImageUrl && !isGeneratingImage && (
                        <div className="text-center space-y-2 px-4">
                            <ImageIcon className="w-12 h-12 text-white/10 mx-auto" />
                            <p className="text-white/20 text-sm font-medium">Your generated thumbnail will appear here</p>
                        </div>
                    )}
                    
                    {isGeneratingImage && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-10 space-y-3">
                            <Loader2 className="w-10 h-10 text-branding-primary animate-spin" />
                            <p className="text-branding-primary font-bold text-sm tracking-wider animate-pulse">CREATING MASTERPIECE...</p>
                        </div>
                    )}

                    {generatedImageUrl && (
                        <>
                             <img 
                                src={generatedImageUrl} 
                                alt="Generated Thumbnail" 
                                className="w-full h-full object-contain"
                                onLoad={handleImageLoad}
                                onError={handleImageError}
                            />
                            
                            {/* Overlay Actions */}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-[2px]">
                                <button
                                    onClick={handleDownload}
                                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-black font-bold hover:scale-105 transition-transform shadow-xl"
                                >
                                    <Download className="w-5 h-5" />
                                    Download
                                </button>
                                <button
                                    onClick={generateImage}
                                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 backdrop-blur-md text-white border border-white/20 font-bold hover:bg-white/20 transition-all hover:scale-105"
                                >
                                    <RefreshCw className="w-5 h-5" />
                                    Try Another
                                </button>
                            </div>
                            
                            <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md text-xs font-mono text-white/50 border border-white/10 pointer-events-none">
                                Seed: {seed}
                            </div>
                        </>
                    )}
                </div>
                <p className="text-center text-xs text-white/30 italic">
                    Powered by Flux & Pollinations AI. Images are generated in 1920x1080 resolution.
                </p>
            </div>
            
        </div>
      </div>
    </div>
  );
};
