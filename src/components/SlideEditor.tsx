import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX, Wand2, X, Play, Square, ZoomIn, Clock, GripVertical, Mic, Trash2, Upload, Sparkles, Loader2, Search, Video as VideoIcon, Clipboard, Check, Repeat, Music, MicOff, AlertCircle, Speech, Undo2, CheckSquare, Maximize2, Minimize2, Info, ChevronDown, ChevronUp } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { RenderedPage } from '../services/pdfService';
import { AVAILABLE_VOICES, fetchRemoteVoices, DEFAULT_VOICES, type Voice, generateTTS } from '../services/ttsService';
import { loadGlobalSettings, type GlobalSettings } from '../services/storage';
import { useModal } from '../context/ModalContext';

import { transformText } from '../services/aiService';
import { isWebLLMLoaded } from '../services/webLlmService';
import { Dropdown } from './Dropdown';

export interface SlideData extends Partial<RenderedPage> {
  id: string;
  type: 'image' | 'video';
  mediaUrl?: string;
  isVideoMusicPaused?: boolean;
  script: string;
  audioUrl?: string;
  duration?: number;
  transition: 'fade' | 'slide' | 'zoom' | 'none';
  voice: string;
  selectionRanges?: { start: number; end: number }[];
  postAudioDelay?: number;
  isTtsDisabled?: boolean;
  isMusicDisabled?: boolean;
  lastGeneratedSelection?: { start: number; end: number }[];
  originalScript?: string;
  isSelected?: boolean;
}

function mergeRanges(ranges: { start: number; end: number }[]) {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [];
  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (current.end >= sorted[i].start) {
      current.end = Math.max(current.end, sorted[i].end);
    } else {
      merged.push(current);
      current = sorted[i];
    }
  }
  merged.push(current);
  return merged;
}

export interface MusicSettings {
  url?: string;
  volume: number;
  loop?: boolean;
  title?: string;
}

interface SlideEditorProps {
  slides: SlideData[];
  onUpdateSlide: (index: number, data: Partial<SlideData>) => void;
  onGenerateAudio: (index: number) => Promise<void>;
  isGeneratingAudio: boolean;
  onReorderSlides: (slides: SlideData[]) => void;
  musicSettings: MusicSettings;
  onUpdateMusicSettings: (settings: MusicSettings) => void;
  ttsVolume?: number;
  onUpdateTtsVolume?: (volume: number) => void;
  globalSettings?: GlobalSettings | null;
  onUpdateGlobalSettings?: (settings: Partial<GlobalSettings>) => void;
}

function getMatchRanges(text: string, term: string) {
  if (!term) return [];
  const ranges = [];
  let pos = 0;
  while (true) {
    const idx = text.indexOf(term, pos);
    if (idx === -1) break;
    ranges.push({ start: idx, end: idx + term.length });
    pos = idx + term.length;
  }
  return ranges;
}



const ScriptEditorModal = ({
  isOpen,
  onClose,
  script,
  selectionRanges,
  onUpdate,
  highlightText
}: {
  isOpen: boolean;
  onClose: () => void;
  script: string;
  selectionRanges?: { start: number; end: number }[];
  onUpdate: (data: Partial<SlideData>) => void;
  highlightText?: string;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    
    // Check if we have a valid selection that is not just a caret position
    if (el.selectionStart !== el.selectionEnd) {
      const newRange = { start: el.selectionStart, end: el.selectionEnd };
      const currentRanges = selectionRanges || [];
      const updatedRanges = mergeRanges([...currentRanges, newRange]);
      onUpdate({ selectionRanges: updatedRanges });
    }
  };

  const handleClearHighlight = () => {
    onUpdate({ selectionRanges: undefined });
  };

  const syncScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const renderBackdrop = () => {
    if ((!selectionRanges || selectionRanges.length === 0) && !highlightText) {
         return script; 
    }

    const selections = selectionRanges || [];
    const matches = getMatchRanges(script, highlightText || '');
    
    const boundaries = new Set<number>([0, script.length]);
    selections.forEach(r => { boundaries.add(r.start); boundaries.add(r.end); });
    matches.forEach(r => { boundaries.add(r.start); boundaries.add(r.end); });
    
    const points = Array.from(boundaries).sort((a, b) => a - b);
    const parts = [];
    
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i+1];
        const text = script.slice(start, end);
        
        if (!text) continue;
        
        const isSelected = selections.some(r => r.start <= start && r.end >= end);
        const isMatch = matches.some(r => r.start <= start && r.end >= end);
        
        let className = "";
        if (isSelected && isMatch) {
            className = "bg-emerald-500/60"; 
        } else if (isSelected) {
            className = "bg-teal-500/30"; 
        } else if (isMatch) {
            className = "bg-yellow-500/60"; 
        }
        
        if (className) {
            parts.push(<mark key={start} className={`${className} text-transparent rounded-sm px-0 py-0`}>{text}</mark>);
        } else {
            parts.push(text);
        }
    }
    
    return <>{parts}</>;
  };

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full h-full sm:h-[85vh] sm:w-200 bg-[#121212] sm:rounded-2xl border-white/10 sm:border flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white/5 border-b border-white/5">
           <div className="space-y-1">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                 <Maximize2 className="w-5 h-5 text-branding-primary" />
                 Focus Mode
              </h3>
              <p className="text-xs text-white/40">Select text ranges for targeted audio generation</p>
           </div>
           <button 
             onClick={onClose}
             className="p-2 -mr-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
           >
             <Minimize2 className="w-6 h-6" />
           </button>
        </div>
        
        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-white/5 bg-black/20 flex items-center justify-between">
           <span className="text-xs font-bold text-white/30 uppercase tracking-widest">Script Editor</span>
           {selectionRanges && selectionRanges.length > 0 && (
             <button
               onClick={handleClearHighlight}
               className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 text-xs font-bold uppercase tracking-wider transition-colors"
             >
               <X className="w-3.5 h-3.5" />
               Clear Highlights
             </button>
           )}
        </div>

        {/* Editor Area */}
        <div className="relative flex-1 bg-[#1a1a1a]">
           <div className="absolute inset-0 overflow-hidden">
             {/* Backdrop */}
             <div 
               ref={backdropRef}
               className="absolute inset-0 w-full h-full px-6 py-6 text-base sm:text-lg font-sans leading-relaxed whitespace-pre-wrap wrap-break-word overflow-hidden text-transparent pointer-events-none"
               aria-hidden="true"
             >
               {renderBackdrop()}
             </div>

             {/* Textarea */}
             <textarea
               ref={textareaRef}
               value={script}
               onChange={(e) => onUpdate({ script: e.target.value, selectionRanges: undefined })}
               onScroll={syncScroll}
               onSelect={handleSelection} // Using onSelect for better mobile support
               onTouchEnd={handleSelection} // Additional trigger for touch devices
               onTouchCancel={handleSelection}
               onBlur={handleSelection} // Ensure selection is captured on exit
               className="absolute inset-0 w-full h-full px-6 py-6 bg-transparent text-white text-base sm:text-lg font-sans leading-relaxed resize-none outline-none border-none focus:ring-0 selection:bg-branding-primary/30"
               placeholder="Enter your script here. Highlight text to select specific parts for audio generation..."
               spellCheck={false}
             />
           </div>
        </div>
        
        {/* Footer info */}
        <div className="px-6 py-3 bg-white/5 border-t border-white/5">
             <div className="flex items-center gap-2 text-xs text-white/30">
                <span className="w-1.5 h-1.5 rounded-full bg-branding-primary animate-pulse"/>
                Highlighting text automatically enables selective TTS generation. Changes are saved automatically.
             </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const SortableSlideItem = ({
  slide,
  index,
  onUpdate,
  onGenerate,
  isGenerating,
  onExpand,
  highlightText,
  onDelete,
  ttsVolume,
  voices, // Add voices to destructuring
  globalSettings, // Add globalSettings to destructuring
  isMobile // Add isMobile to destructuring
}: {
  slide: SlideData,
  index: number,
  onUpdate: (i: number, d: Partial<SlideData>) => void,
  onGenerate: (i: number) => Promise<void>,
  isGenerating: boolean,
  onExpand: (i: number) => void,
  highlightText?: string,
  onDelete: (index: number) => void;
  ttsVolume?: number;
  voices: Voice[]; // Add voices prop
  globalSettings?: GlobalSettings | null; // Add globalSettings prop
  isMobile: boolean; // Add isMobile prop
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });

  const { showAlert, showConfirm } = useModal();

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isTransforming, setIsTransforming] = React.useState(false);
  const [isCopied, setIsCopied] = React.useState(false);
  const [showScriptEditor, setShowScriptEditor] = React.useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Cleanup audio on unmount or if slide changes
  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioContextRef.current) {
         audioContextRef.current.close().catch(console.error);
         audioContextRef.current = null;
      }
      gainNodeRef.current = null;
    };
  }, [slide.audioUrl]);

  const togglePlayback = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      if (audioContextRef.current) {
         audioContextRef.current.close().catch(console.error);
         audioContextRef.current = null;
      }
      gainNodeRef.current = null;
    } else if (slide.audioUrl) {
      const audio = new Audio(slide.audioUrl);
      const vol = ttsVolume ?? 1;

      // Handle volume > 100% using Web Audio API
      if (vol > 1) {
          try {
             // Fallback for safety if AudioContext fails
             audio.volume = 1;
             
             const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
             const ctx = new AudioContextClass();
             const source = ctx.createMediaElementSource(audio);
             const gainNode = ctx.createGain();
             
             gainNode.gain.value = vol;
             source.connect(gainNode);
             gainNode.connect(ctx.destination);
             
             audioContextRef.current = ctx;
             gainNodeRef.current = gainNode;
          } catch (e) {
             console.error("Audio amplification failed", e);
             audio.volume = 1; // Fallback to max normal volume
          }
      } else {
          audio.volume = Math.max(0, vol);
      }

      audio.onended = () => {
          setIsPlaying(false);
          if (audioContextRef.current) {
             audioContextRef.current.close().catch(console.error);
             audioContextRef.current = null;
          }
          gainNodeRef.current = null;
      };
      
      audio.play().catch(e => {
        console.error("Audio playback failed", e);
        setIsPlaying(false);
      });
      audioRef.current = audio;
      setIsPlaying(true);
    }
  };

  // Live volume adjustment effect
  React.useEffect(() => {
    if (isPlaying && audioRef.current) {
        const vol = ttsVolume ?? 1;
        const audio = audioRef.current;

        // If volume exceeds 100% and we haven't set up Web Audio yet, do it now
        if (vol > 1 && !audioContextRef.current) {
             try {
                 const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                 const ctx = new AudioContextClass();
                 const source = ctx.createMediaElementSource(audio);
                 const gainNode = ctx.createGain();
                 
                 source.connect(gainNode);
                 gainNode.connect(ctx.destination);
                 
                 audioContextRef.current = ctx;
                 gainNodeRef.current = gainNode;
                 
                 // Reset element volume to 1 so gain node controls full range
                 audio.volume = 1;
             } catch (e) {
                 console.error("Audio amplification upgrade failed", e);
             }
        }

        // Apply volume
        if (audioContextRef.current && gainNodeRef.current) {
            // Web Audio API control
            gainNodeRef.current.gain.value = vol;
            if (audio.volume !== 1) audio.volume = 1;
        } else {
            // Standard Audio API control
            audio.volume = Math.max(0, vol);
        }
    }
  }, [ttsVolume, isPlaying]);


  const handleTransform = async () => {
    const useWebLLM = globalSettings?.useWebLLM;
    const webLlmModel = globalSettings?.webLlmModel;

    const apiKey = localStorage.getItem('llm_api_key') || localStorage.getItem('gemini_api_key');
    const baseUrl = localStorage.getItem('llm_base_url') || 'https://generativelanguage.googleapis.com/v1beta/openai/';
    const model = localStorage.getItem('llm_model') || 'gemini-2.5-flash';

    if (!useWebLLM && !apiKey) {
      showAlert('Please configure your LLM settings (Base URL, Model, API Key) in Settings (API Keys tab) to use this feature.', { type: 'warning', title: 'Missing Usage' });
      return;
    }

    if (useWebLLM && !webLlmModel) {
        showAlert('Please select and load a WebLLM model in Settings (WebLLM tab) to use this feature.', { type: 'warning', title: 'WebLLM Not Configured' });
        return;
    }

    if (!slide.script.trim()) return;

    if (!await showConfirm("This will replace the current script with an AI-enhanced version. Continue?", { title: 'AI Enhancement', confirmText: 'Enhance' })) {
        return; 
    }

    setIsTransforming(true);
    try {
      const transformed = await transformText({
          apiKey: apiKey || '',
          baseUrl,
          model,
          useWebLLM,
          webLlmModel
      }, slide.script, globalSettings?.aiFixScriptSystemPrompt);
      onUpdate(index, { script: transformed, selectionRanges: undefined, originalScript: slide.script });
    } catch (error) {
      console.error("[SlideEditor] Transformation Error:", error);
      showAlert('Transformation failed: ' + (error instanceof Error ? error.message : String(error)), { type: 'error', title: 'Transformation Failed' });
    } finally {
      setIsTransforming(false);
    }
  };

  const handleCopyScript = async () => {
    if (!slide.script) return;
    try {
      await navigator.clipboard.writeText(slide.script);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleRevertScript = async () => {
    if (slide.originalScript) {
      if (await showConfirm("Revert to original script? This will discard current changes.", { type: 'warning', title: 'Revert Script', confirmText: 'Revert' })) {
         onUpdate(index, { script: slide.originalScript, originalScript: undefined, selectionRanges: undefined });
      }
    }
  };

  const syncScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    
    // Only process if there's an actual selection
    if (el.selectionStart !== el.selectionEnd) {
      const newRange = { start: el.selectionStart, end: el.selectionEnd };
      const currentRanges = slide.selectionRanges || [];
      const updatedRanges = mergeRanges([...currentRanges, newRange]);
      
      onUpdate(index, { selectionRanges: updatedRanges });
    }
  };

  const handleClearHighlight = () => {
    onUpdate(index, { selectionRanges: undefined });
  };

  const handleTextChange = (newText: string) => {
    onUpdate(index, { script: newText, selectionRanges: undefined });
  };

  // Render the backdrop content
  const renderBackdrop = () => {
    // If no highlights at all, return generic.
    if ((!slide.selectionRanges || slide.selectionRanges.length === 0) && !highlightText) {
         return slide.script; 
    }

    const selections = slide.selectionRanges || [];
    const matches = getMatchRanges(slide.script, highlightText || '');
    
    // Collect all boundaries
    const boundaries = new Set<number>([0, slide.script.length]);
    selections.forEach(r => { boundaries.add(r.start); boundaries.add(r.end); });
    matches.forEach(r => { boundaries.add(r.start); boundaries.add(r.end); });
    
    // Sort
    const points = Array.from(boundaries).sort((a, b) => a - b);
    
    const parts = [];
    
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i+1];
        const text = slide.script.slice(start, end);
        
        if (!text) continue;
        
        // Check membership
        const isSelected = selections.some(r => r.start <= start && r.end >= end);
        const isMatch = matches.some(r => r.start <= start && r.end >= end);
        
        let className = "";
        if (isSelected && isMatch) {
            className = "bg-emerald-500/60"; // Mixed overlap
        } else if (isSelected) {
            className = "bg-teal-500/30"; 
        } else if (isMatch) {
            className = "bg-yellow-500/60"; 
        }
        
        if (className) {
            parts.push(<mark key={start} className={`${className} text-transparent rounded-sm px-0 py-0`}>{text}</mark>);
        } else {
            parts.push(text);
        }
    }
    
    return <>{parts}</>;
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className="group relative flex flex-col sm:flex-row gap-4 sm:gap-6 p-4 sm:p-6 rounded-2xl bg-linear-to-br from-white/10 to-white/5 border border-white/30 shadow-2xl shadow-black/40 ring-1 ring-inset ring-white/10 hover:border-branding-primary/60 hover:shadow-branding-primary/10 hover:ring-branding-primary/20 transition-[border-color,box-shadow] duration-300"
    >
      {/* Drag Handle */}
      <div 
        className="absolute left-1/2 -top-3 sm:left-2 sm:top-1/2 -translate-x-1/2 sm:translate-x-0 sm:-translate-y-1/2 p-1.5 sm:p-2 cursor-grab active:cursor-grabbing text-white hover:text-branding-primary transition-colors z-20 touch-none bg-[#18181b] sm:bg-transparent rounded-full border border-white/10 sm:border-transparent"
        {...attributes} 
        {...listeners}
      >
        <GripVertical className="w-5 h-5 rotate-90 sm:rotate-0" />
      </div>

      {/* Slide Preview */}
      {/* Slide Preview Column */}
      <div className="w-full sm:w-1/3 sm:ml-6 flex flex-col gap-2 mt-4 sm:mt-0">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={(e) => {
                e.stopPropagation();
                onUpdate(index, { isSelected: !slide.isSelected });
            }}
            className={`p-1 rounded-md transition-all ${slide.isSelected ? 'text-branding-primary' : 'text-white/40 hover:text-white/70'}`}
            title={slide.isSelected ? "Deselect Slide" : "Select Slide"}
          >
             {slide.isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
          </button>
          <span className="text-xs font-bold text-white/40 uppercase tracking-widest">
            Slide {index + 1} {slide.type === 'video' && '(Media)'}
          </span>
        </div>
        
        <div 
          className="w-full aspect-video rounded-lg overflow-hidden border border-white/5 relative bg-black cursor-pointer group/image"
          onClick={() => onExpand(index)}
        >
          {slide.type === 'video' ? (
              <video 
                src={slide.mediaUrl} 
                className="w-full h-full object-contain"
                muted
              />
          ) : (
            <img 
              src={slide.dataUrl} 
              alt={`Slide ${index + 1}`} 
              className="w-full h-full object-contain transition-transform duration-500 group-hover/image:scale-105"
            />
          )}
          


          <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover/image:opacity-100 pointer-events-none">
             <ZoomIn className="w-8 h-8 text-white drop-shadow-md" />
          </div>
        </div>
      </div>

      {/* Editing Controls */}
      <div className="flex-1 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Script (TTS Text)</label>
            <div className="flex gap-2 sm:gap-3">
              {isMobile && (
                <button
                  onClick={() => setShowScriptEditor(true)}
                  className="flex items-center gap-1 text-[10px] uppercase font-bold text-branding-primary hover:text-white transition-colors cursor-pointer"
                  title="Open Focus Mode Editor"
                >
                  <Maximize2 className="w-3 h-3" /> Focus Mode
                </button>
              )}
              <button
                onClick={handleTransform}
                disabled={isTransforming || !slide.script.trim()}
                className="flex items-center gap-1 text-[10px] uppercase font-bold text-branding-accent hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                title="Use AI to transform raw PDF text into natural sentences"
              >
                {isTransforming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {isTransforming ? 'Fixing...' : 'AI Fix Script'}
              </button>
              <button
                onClick={handleCopyScript}
                disabled={!slide.script.trim()}
                className="flex items-center gap-1 text-[10px] uppercase font-bold text-white hover:text-white/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Copy script to clipboard"
              >
                {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Clipboard className="w-3 h-3" />}
                {isCopied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(index);
                }}
                className="flex items-center gap-1 text-[10px] uppercase font-bold text-red-500 hover:text-red-400 hover:bg-red-500/10 px-2 rounded transition-colors"
                title="Delete Slide"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
              {slide.originalScript && (
                <button
                  onClick={handleRevertScript}
                  className="flex items-center gap-1 text-[10px] uppercase font-bold text-amber-400 hover:text-amber-300 transition-colors"
                  title="Revert to original script"
                >
                  <Undo2 className="w-3 h-3" /> Revert
                </button>
              )}
              {slide.selectionRanges && slide.selectionRanges.length > 0 && (
                <button
                  onClick={handleClearHighlight}
                  className="flex items-center gap-1 text-[10px] uppercase font-bold text-red-400 hover:text-red-300 transition-colors"
                >
                  <X className="w-3 h-3" /> Reset Highlights
                </button>
              )}
            </div>
          </div>
          
          <div className="relative w-full h-32 rounded-xl bg-white/5 border border-white/10 focus-within:border-branding-primary focus-within:ring-1 focus-within:ring-branding-primary transition-all overflow-hidden">
            {/* Backdrop (Highlights) */}
            <div 
              ref={backdropRef}
              className="absolute inset-0 w-full h-full px-4 py-3 text-sm font-sans whitespace-pre-wrap wrap-break-word overflow-hidden text-transparent pointer-events-none"
              aria-hidden="true"
            >
              {renderBackdrop()}
            </div>

            {/* Actual Textarea */}
            <textarea
              ref={textareaRef}
              value={slide.script}
              onChange={(e) => handleTextChange(e.target.value)}
              onScroll={syncScroll}
              onMouseUp={handleSelection} 
              className="absolute inset-0 w-full h-full px-4 py-3 bg-transparent text-white text-sm font-sans resize-none outline-none border-none focus:ring-0 selection:bg-branding-primary/20"
              placeholder="Highlight text to select specific parts for audio generation..."
              spellCheck={false}
            />
          </div>
          
          {slide.selectionRanges && slide.selectionRanges.length > 0 && (
            <div className="space-y-2 mt-2">
               <p className="text-[10px] text-branding-primary italic flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-branding-primary animate-pulse"/>
                  Audio will be generated only from the highlighted sections.
               </p>
               
               {slide.audioUrl && (!slide.lastGeneratedSelection || JSON.stringify(slide.selectionRanges) !== JSON.stringify(slide.lastGeneratedSelection)) && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 animate-in fade-in slide-in-from-top-1 duration-300">
                    <div className="flex items-start gap-2">
                       <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                       <div className="space-y-1">
                          <p className="text-xs font-medium text-amber-100">
                             Audio Update Required
                          </p>
                          <p className="text-[11px] leading-relaxed opacity-90">
                             You've selected specific text, but the current audio plays the full script. You must <span className="font-bold text-amber-100">Regenerate Speech</span> to apply these changes.
                          </p>
                          <p className="text-[10px] pt-1.5 mt-1 border-t border-amber-500/10 text-amber-300/70 italic">
                             <span className="font-semibold not-italic text-amber-300/90">Tip:</span> Highlighting your script <strong>before</strong> generating audio avoids having to regenerate!
                          </p>
                       </div>
                    </div>
                  </div>
               )}
            </div>
          )}
        </div>

        <div className="space-y-6 pt-2">
          {/* Inputs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-0.5">Voice</label>
              <Dropdown
                options={voices}
                value={slide.voice}
                onChange={(val) => onUpdate(index, { voice: val })}
                className="bg-white/5 border border-white/10 hover:border-white/20 backdrop-blur-sm transition-all focus:border-branding-primary/50 text-sm h-10 rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-0.5">Transition</label>
              <Dropdown
                options={[
                  { id: 'fade', name: 'Fade' },
                  { id: 'slide', name: 'Slide' },
                  { id: 'zoom', name: 'Zoom' },
                  { id: 'none', name: 'None' },
                ]}
                value={slide.transition}
                onChange={(val) => onUpdate(index, { transition: val as SlideData['transition'] })}
                className="bg-white/5 border border-white/10 hover:border-white/20 backdrop-blur-sm transition-all focus:border-branding-primary/50 text-sm h-10 rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-0.5">
                {slide.isTtsDisabled ? 'Duration (s)' : 'Delay (s)'}
              </label>
              <div className="relative group/input">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={slide.postAudioDelay || 0}
                    onChange={(e) => onUpdate(index, { postAudioDelay: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 h-10 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-branding-primary/50 focus:ring-1 focus:ring-branding-primary/50 outline-none transition-all backdrop-blur-sm group-hover/input:bg-white/10"
                  />
              </div>
            </div>
          </div>

          {/* Actions Toolbar */}
          <div className="flex flex-wrap items-center gap-3 p-2 rounded-xl bg-black/20 border border-white/5 backdrop-blur-sm">
             {/* Generate Button */}
             <button
              onClick={() => onGenerate(index)}
              disabled={isGenerating || !slide.script.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-branding-primary/10 border border-branding-primary/20 text-branding-primary hover:bg-branding-primary/20 hover:border-branding-primary/40 disabled:opacity-40 disabled:grayscale transition-all font-bold text-[10px] uppercase tracking-wider cursor-pointer shadow-lg shadow-branding-primary/5 h-9 whitespace-nowrap"
            >
              {slide.audioUrl ? <Volume2 className="w-3.5 h-3.5" /> : <Speech className="w-3.5 h-3.5" />}
              {slide.audioUrl ? 'Regenerate' : 'Generate TTS Audio'}
            </button>

            {slide.audioUrl && (
              <button
                onClick={togglePlayback}
                disabled={isGenerating}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all font-bold text-[10px] uppercase tracking-wider h-9 ${isPlaying ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40'}`}
              >
                {isPlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                {isPlaying ? 'Stop' : 'Preview'}
              </button>
            )}

            <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" />

            {/* Controls Group */}
            <div className="flex items-center gap-2 ml-auto w-full sm:w-auto">
                 {slide.type === 'video' && (
                    <button
                        onClick={() => onUpdate(index, { isVideoMusicPaused: !slide.isVideoMusicPaused })}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all h-9 ${slide.isVideoMusicPaused ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'}`}
                        title="Toggle Video Music"
                    >
                        {slide.isVideoMusicPaused ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                )}

                <button
                    onClick={() => {
                        const newDisabled = !slide.isTtsDisabled;
                        const updates: Partial<SlideData> = { isTtsDisabled: newDisabled };
                        if (newDisabled && (slide.postAudioDelay || 0) < 1) updates.postAudioDelay = 5;
                        onUpdate(index, updates);
                    }}
                    className={`flex-1 sm:flex-none px-3 py-2 rounded-lg border transition-all font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 h-9 ${!slide.isTtsDisabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-white/5 text-white/40 border-white/10 hover:text-white hover:bg-white/10'}`}
                >
                    {!slide.isTtsDisabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">TTS</span>
                </button>

                <button
                    onClick={() => onUpdate(index, { isMusicDisabled: !slide.isMusicDisabled })}
                    className={`flex-1 sm:flex-none px-3 py-2 rounded-lg border transition-all font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 h-9 ${!slide.isMusicDisabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-white/5 text-white/40 border-white/10 hover:text-white hover:bg-white/10'}`}
                >
                    {!slide.isMusicDisabled ? <Music className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                   <span className="hidden sm:inline">Music</span>
                </button>
            </div>
          </div>
        </div>

        {slide.duration && (
          <div className="text-[10px] text-white/40 font-medium">
            Audio Duration: {slide.duration.toFixed(2)}s
          </div>
        )}
      </div>

      <ScriptEditorModal
        isOpen={showScriptEditor}
        onClose={() => setShowScriptEditor(false)}
        script={slide.script}
        selectionRanges={slide.selectionRanges}
        onUpdate={(data) => onUpdate(index, data)}
        highlightText={highlightText}
      />
    </div>
  );
};

export const SlideEditor: React.FC<SlideEditorProps> = ({ 
  slides, 
  onUpdateSlide, 
  onGenerateAudio,
  isGeneratingAudio,
  onReorderSlides,
  musicSettings,
  onUpdateMusicSettings,
  ttsVolume,
  onUpdateTtsVolume,
  globalSettings, // Destructure globalSettings
  onUpdateGlobalSettings
}) => {
  const { showAlert, showConfirm } = useModal();
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = React.useState(false);
  const [isBatchFixing, setIsBatchFixing] = React.useState(false);
  const batchGeneratingCancelledRef = React.useRef(false);
  const batchFixingCancelledRef = React.useRef(false);

  const [batchProgress, setBatchProgress] = React.useState<{ current: number; total: number } | null>(null);
  const [globalDelay, setGlobalDelay] = React.useState(0.5);
  const [globalVoice, setGlobalVoice] = React.useState(AVAILABLE_VOICES[0].id);
  const [voices, setVoices] = React.useState<Voice[]>(AVAILABLE_VOICES);


  const [activeTab, setActiveTab] = React.useState<'overview' | 'voice' | 'mixing' | 'tools' | 'media'>('overview');
  const [isMobile, setIsMobile] = useState(false);
  const [isConfigureSlidesExpanded, setIsConfigureSlidesExpanded] = useState(() => {
    const saved = localStorage.getItem('configureSlidesExpanded');
    return saved !== null ? saved === 'true' : true; // Default to expanded
  });

  // Quick Start Guide collapse state
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({
    1: false, 2: false, 3: false, 4: false
  });

  // Quick Start Guide steps data
  const quickStartSteps = [
    {
      id: 1,
      title: 'Edit Scripts with AI',
      description: 'Refine slide scripts or use AI Fix Script to transform raw PDF text into natural, spoken sentences. Perfect for fixing fragmented text.',
      color: 'purple',
      icon: Wand2
    },
    {
      id: 2,
      title: 'Generate Voiceovers',
      description: 'Create TTS audio for each slide using the Generate Audio button. Or use Generate All Audio in Batch Tools to process all slides at once.',
      color: 'emerald',
      icon: Mic
    },
    {
      id: 3,
      title: 'Customize Settings',
      description: 'Optional: Configure voice selection, audio mixing, background music, and slide transitions using the tabs on the left.',
      color: 'orange',
      icon: Volume2
    },
    {
      id: 4,
      title: 'Export Your Video',
      description: 'Preview your video in the Preview tab, then render your final MP4 with voiceovers or silent for custom audio recording.',
      color: 'pink',
      icon: VideoIcon
    }
  ] as const;

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Persist configure slides expanded state
  useEffect(() => {
    localStorage.setItem('configureSlidesExpanded', String(isConfigureSlidesExpanded));
  }, [isConfigureSlidesExpanded]);

  // Sync global settings changes to parent

  


  // Global Preview for Sidebar
  const [isGlobalPreviewPlaying, setIsGlobalPreviewPlaying] = React.useState(false);
  const [globalPreviewAudio, setGlobalPreviewAudio] = React.useState<HTMLAudioElement | null>(null);
  const globalAudioContextRef = useRef<AudioContext | null>(null);
  const globalGainNodeRef = useRef<GainNode | null>(null);

  const handleGlobalPreview = async () => {
       if (isGlobalPreviewPlaying && globalPreviewAudio) {
           globalPreviewAudio.pause();
           setIsGlobalPreviewPlaying(false);
           return;
       }

       try {
           setIsGlobalPreviewPlaying(true);
           const text = "Hi there! This is a sample of how I sound. I hope you like it!";
           
           const audioUrl = await generateTTS(text, {
               voice: globalVoice, 
               speed: 1.0,
               pitch: 1.0
           });
           
           const audio = new Audio(audioUrl);
           const vol = ttsVolume ?? 1;

           // Helper to setup amplification
           if (vol > 1) {
               try {
                   audio.volume = 1;
                   const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                   const ctx = new AudioContextClass();
                   const source = ctx.createMediaElementSource(audio);
                   const gainNode = ctx.createGain();
                   
                   gainNode.gain.value = vol;
                   source.connect(gainNode);
                   gainNode.connect(ctx.destination);
                   
                   globalAudioContextRef.current = ctx;
                   globalGainNodeRef.current = gainNode;
               } catch (e) {
                   console.error("Global preview amplification failed", e);
                   audio.volume = 1;
               }
           } else {
               audio.volume = Math.max(0, vol);
           }

           audio.onended = () => {
               setIsGlobalPreviewPlaying(false);
               setGlobalPreviewAudio(null);
               if (globalAudioContextRef.current) {
                   globalAudioContextRef.current.close().catch(console.error);
                   globalAudioContextRef.current = null;
               }
               globalGainNodeRef.current = null;
           };
           audio.onerror = () => {
                setIsGlobalPreviewPlaying(false);
                setGlobalPreviewAudio(null);
                showAlert("Failed to play audio preview.", { type: 'error' });
           };

           setGlobalPreviewAudio(audio);
           await audio.play();
       } catch (e) {
           console.error("Preview failed", e);
           setIsGlobalPreviewPlaying(false);
           showAlert("Failed to generate preview", { type: 'error' });
       }
  };

  React.useEffect(() => {
      return () => {
          if (globalPreviewAudio) {
              globalPreviewAudio.pause();
          }
          if (globalAudioContextRef.current) {
               globalAudioContextRef.current.close().catch(console.error);
          }
      }
  }, [globalPreviewAudio]);

  // Live volume adjustment for Global Preview
  React.useEffect(() => {
    if (isGlobalPreviewPlaying && globalPreviewAudio) {
        const vol = ttsVolume ?? 1;
        const audio = globalPreviewAudio;

        // Upgrade to Web Audio if needed
        if (vol > 1 && !globalAudioContextRef.current) {
             try {
                 const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                 const ctx = new AudioContextClass();
                 const source = ctx.createMediaElementSource(audio);
                 const gainNode = ctx.createGain();
                 
                 source.connect(gainNode);
                 gainNode.connect(ctx.destination);
                 
                 globalAudioContextRef.current = ctx;
                 globalGainNodeRef.current = gainNode;
                 
                 audio.volume = 1;
             } catch (e) {
                 console.error("Global preview amplification upgrade failed", e);
             }
        }

        // Apply volume
        if (globalAudioContextRef.current && globalGainNodeRef.current) {
            globalGainNodeRef.current.gain.value = vol;
            if (audio.volume !== 1) audio.volume = 1;
        } else {
            audio.volume = Math.max(0, vol);
        }
    }
  }, [ttsVolume, isGlobalPreviewPlaying, globalPreviewAudio]);

  // Effect to handle voice updates based on globalSettings
  React.useEffect(() => {
    // Helper to process settings and update state
    const processSettings = (settings: GlobalSettings | null) => {
        // Logic to fetch base voices
        const fetchPromise = (settings?.useLocalTTS && settings?.localTTSUrl) 
            ? fetchRemoteVoices(settings.localTTSUrl) 
            : Promise.resolve(DEFAULT_VOICES);

        fetchPromise.then(fetchedVoices => {
            let finalVoices = [...fetchedVoices];



            setVoices(finalVoices);
            
            if (settings?.delay) setGlobalDelay(settings.delay);
            if (settings?.voice) setGlobalVoice(settings.voice);
        });
    };

    if (globalSettings !== undefined) {
        // If prop is provided (even if null), use it
        processSettings(globalSettings);
    } else {
        // Fallback to loading from storage if prop not passed (legacy/safety)
        loadGlobalSettings().then(processSettings);
    }
  }, [globalSettings]); // React to globalSettings changes

  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = React.useState(false);

  const [findText, setFindText] = React.useState('');
  const [replaceText, setReplaceText] = React.useState('');

  const mediaInputRef = useRef<HTMLInputElement>(null);

  const getVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      // Validate URL protocol to prevent potential DOM XSS (CodeQL fix)
      try {
        if (!url) throw new Error("Empty URL");
        
        const parsed = new URL(url, window.location.href); // Handle relative URLs by providing base
        if (!['http:', 'https:', 'blob:'].includes(parsed.protocol)) {
            throw new Error("Invalid protocol");
        }
        
        const video = document.createElement('video');
        video.src = parsed.href; // Use sanitized URL from URL parser
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
           resolve(video.duration);
        };
        video.onerror = () => resolve(5); 
      } catch {
         resolve(5);
      }
    });
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4');
      const isGif = file.type === 'image/gif' || file.name.endsWith('.gif');
      
      if (!isVideo && !isGif) {
          showAlert("Please upload an MP4 video or a GIF.", { type: 'error', title: 'Invalid File' });
          return;
      }

      let duration = 5;
      if (isVideo) {
         duration = await getVideoDuration(url);
      }

      const newSlide: SlideData = {
          id: crypto.randomUUID(),
          type: 'video',
          mediaUrl: isVideo ? url : undefined,
          script: '', // Default empty script
          transition: 'fade',
          voice: AVAILABLE_VOICES[0].id,
          dataUrl: isGif ? url : undefined, // Quick hack for GIF preview if it works as image
          isVideoMusicPaused: false,
          duration: duration,
          postAudioDelay: 0
      };
      
      onReorderSlides([newSlide, ...slides]);
    }
    // Reset
    if (mediaInputRef.current) mediaInputRef.current.value = '';
  };

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      onUpdateMusicSettings({ ...musicSettings, url, volume: musicSettings.volume || 0.03, title: file.name });
    }
  };

  const toggleMusicPlayback = () => {
    if (isMusicPlaying && musicAudioRef.current) {
      musicAudioRef.current.pause();
      setIsMusicPlaying(false);
    } else if (musicSettings.url) {
      const audio = new Audio(musicSettings.url);
      audio.volume = musicSettings.volume;
      audio.loop = musicSettings.loop ?? true;
      audio.onended = () => setIsMusicPlaying(false);
      audio.play().catch(e => {
        console.error("Music playback failed", e);
        setIsMusicPlaying(false);
      });
      musicAudioRef.current = audio;
      setIsMusicPlaying(true);
    }
  };
  
  React.useEffect(() => {
      return () => {
          if (musicAudioRef.current) {
              musicAudioRef.current.pause();
          }
      }
  }, [musicSettings.url]);

  React.useEffect(() => {
    if (musicAudioRef.current) {
      musicAudioRef.current.loop = musicSettings.loop ?? true;
    }
  }, [musicSettings.loop]);

  const handleRemoveMusic = () => {
      onUpdateMusicSettings({ ...musicSettings, url: undefined, title: undefined });
      if (isMusicPlaying && musicAudioRef.current) {
          musicAudioRef.current.pause();
          setIsMusicPlaying(false);
      }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (active.id !== over?.id) {
      const oldIndex = slides.findIndex((slide) => slide.id === active.id);
      const newIndex = slides.findIndex((slide) => slide.id === over?.id);
      
      onReorderSlides(arrayMove(slides, oldIndex, newIndex));
    }
  };

  const handleApplyGlobalDelay = async () => {
    if (await showConfirm(`Apply ${globalDelay}s delay to all ${slides.length} slides?`, { title: 'Apply Delay', confirmText: 'Apply' })) {
      slides.forEach((_, index) => {
        onUpdateSlide(index, { postAudioDelay: globalDelay });
      });
    }
  };

  const handleApplyGlobalVoice = async () => {
    let currentVoices = voices;
    


    const voiceName = currentVoices.find(v => v.id === globalVoice)?.name || globalVoice;
    if (await showConfirm(`Apply "${voiceName}" voice to all ${slides.length} slides?`, { title: 'Apply Voice', confirmText: 'Apply' })) {
      slides.forEach((_, index) => {
        onUpdateSlide(index, { voice: globalVoice });
      });
    }
  };

  const handleCancelBatchGenerate = () => {
    batchGeneratingCancelledRef.current = true;
  };

  const handleGenerateAll = async () => {
    if (!await showConfirm("This will generate audio for all slides, overwriting any existing audio. Continue?", { title: 'Batch Generate', confirmText: 'Generate All' })) {
      return;
    }

    batchGeneratingCancelledRef.current = false;
    setIsBatchGenerating(true);
    setBatchProgress({ current: 0, total: slides.length });
    let cancelled = false;
    let processedCount = 0;
    try {
      for (let i = 0; i < slides.length; i++) {
        if (batchGeneratingCancelledRef.current) {
          cancelled = true;
          break;
        }
        setBatchProgress({ current: i + 1, total: slides.length });
        await onGenerateAudio(i);
        processedCount++;
      }
      if (cancelled) {
        showAlert(`Batch generation cancelled. ${processedCount} slide(s) were processed.`, { type: 'info', title: 'Cancelled' });
      } else {
        showAlert('Batch audio generation completed successfully!', { type: 'success', title: 'Batch Complete' });
      }
    } finally {
      setIsBatchGenerating(false);
      setBatchProgress(null);
      batchGeneratingCancelledRef.current = false;
    }
  };

  const handleCancelBatchFix = () => {
    batchFixingCancelledRef.current = true;
  };

  const handleFixAllScripts = async () => {
    const useWebLLM = globalSettings?.useWebLLM;
    const webLlmModel = globalSettings?.webLlmModel;

    const apiKey = localStorage.getItem('llm_api_key') || localStorage.getItem('gemini_api_key');
    const baseUrl = localStorage.getItem('llm_base_url') || 'https://generativelanguage.googleapis.com/v1beta/openai/';
    const model = localStorage.getItem('llm_model') || 'gemini-2.5-flash';

    if (!useWebLLM && !apiKey) {
      showAlert('Please configure your LLM settings (Base URL, Model, API Key) in Settings (API Keys tab) to use this feature.', { type: 'warning' });
      return;
    }

    if (useWebLLM && !webLlmModel) {
        showAlert('Please select and load a WebLLM model in Settings (WebLLM tab) to use this feature.', { type: 'warning', title: 'WebLLM Not Configured' });
        return;
    }

    // Check if WebLLM is actually loaded (not just configured)
    if (useWebLLM && webLlmModel) {
        if (!isWebLLMLoaded()) {
            showAlert('WebLLM model is not loaded. Please initialize it in Settings (WebLLM tab) first.', { type: 'warning', title: 'WebLLM Not Ready' });
            return;
        }
    }

    if (!await showConfirm("This will sequentially update ALL slide scripts using AI. This process runs individually for each slide to respect API limits. Continue?", { title: 'Batch AI Fix', confirmText: 'Start Processing' })) {
      return;
    }

    batchFixingCancelledRef.current = false;
    setIsBatchFixing(true);
    setBatchProgress({ current: 0, total: slides.length });
    let cancelled = false;
    let processedCount = 0;

    try {
      for (let i = 0; i < slides.length; i++) {
        if (batchFixingCancelledRef.current) {
          cancelled = true;
          break;
        }
        setBatchProgress({ current: i + 1, total: slides.length });
        const slide = slides[i];
        if (!slide.script.trim()) continue;

        try {
            const transformed = await transformText({
                apiKey: apiKey || '',
                baseUrl,
                model,
                useWebLLM,
                webLlmModel
            }, slide.script, globalSettings?.aiFixScriptSystemPrompt);
            onUpdateSlide(i, { script: transformed, selectionRanges: undefined, originalScript: slide.script });
            processedCount++;
        } catch (error) {
            console.error(`Failed to fix slide ${i + 1}`, error);
        }

        // Delay 5s to prevent rate limiting only when using cloud API (API imposes 15 RPM ~ 4s/req)
        // Skip delay for WebLLM since it runs locally without rate limits
        if (!useWebLLM && i < slides.length - 1) {
            // Check cancellation during the delay using a polling loop
            const delayEnd = Date.now() + 5000;
            while (Date.now() < delayEnd) {
                if (batchFixingCancelledRef.current) break;
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
      }
      if (cancelled) {
        showAlert(`Batch AI fix cancelled. ${processedCount} slide(s) were processed.`, { type: 'info', title: 'Cancelled' });
      } else {
        showAlert('Batch script fixing completed successfully!', { type: 'success', title: 'Batch Complete' });
      }
    } finally {
      setIsBatchFixing(false);
      setBatchProgress(null);
      batchFixingCancelledRef.current = false;
    }
  };

  const handleRevertAllScripts = async () => {
    const slidesWithOriginals = slides.filter(slide => slide.originalScript);

    if (slidesWithOriginals.length === 0) {
      showAlert('No slides with original scripts found to revert.', { type: 'info', title: 'Nothing to Revert' });
      return;
    }

    if (!await showConfirm(`This will revert ${slidesWithOriginals.length} slide(s) to their original scripts, discarding all current changes. Continue?`, { title: 'Bulk Revert', confirmText: 'Revert All', type: 'warning' })) {
      return;
    }

    try {
      let revertedCount = 0;
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        if (slide.originalScript) {
          onUpdateSlide(i, { script: slide.originalScript, originalScript: undefined, selectionRanges: undefined });
          revertedCount++;
        }
      }
      showAlert(`Successfully reverted ${revertedCount} slide(s) to original scripts!`, { type: 'success', title: 'Bulk Revert Complete' });
    } catch (error) {
      showAlert('Failed to revert some scripts: ' + (error instanceof Error ? error.message : String(error)), { type: 'error', title: 'Revert Failed' });
    }
  };

  const handleFindAndReplace = async () => {
    if (!findText) return;

    let matchCount = 0;
    const newSlides = slides.map(s => {
        const occurrences = s.script.split(findText).length - 1;
        if (occurrences > 0) {
            matchCount += occurrences;
            return {
                ...s,
                script: s.script.split(findText).join(replaceText),
                selectionRanges: undefined // Clear highlights as they are likely invalid after text change
            };
        }
        return s;
    });

    if (matchCount > 0) {
        if (await showConfirm(`Found ${matchCount} matches. Replace all occurrences of "${findText}" with "${replaceText}"?`, { title: 'Replace Text', confirmText: 'Replace All' })) {
             onReorderSlides(newSlides);
             showAlert(`Replaced ${matchCount} occurrences.`, { type: 'success' });
        }
    } else {
        showAlert("No matches found.", { type: 'info' });
    }
  };

  const handleDeleteSlide = async (index: number) => {
    if (await showConfirm("Are you sure you want to delete this slide?", { type: 'error', title: 'Delete Slide', confirmText: 'Delete' })) {
        const newSlides = [...slides];
        newSlides.splice(index, 1);
        onReorderSlides(newSlides);
    }
  };



  // Effect to sync local global settings changes back to parent/storage


  return (
    <div className="space-y-8 animate-fade-in relative">
      {/* Expanded Slide Modal */}
      {previewIndex !== null && (
        <div 
          className="relative w-full mb-8 bg-black/40 p-8 rounded-3xl border border-white/10 flex flex-col items-center animate-fade-in"
          onClick={() => setPreviewIndex(null)}
        >
          <button 
            onClick={(e) => {
               e.stopPropagation();
               setPreviewIndex(null);
            }}
            className="absolute top-10 right-10 z-50 p-2 text-white/60 hover:text-white transition-colors flex items-center gap-2 group"
            title="Close Preview"
          >
            <span className="uppercase text-xs font-bold tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Close</span>
            <div className="transition-colors">
              <X className="w-8 h-8 drop-shadow-md" />
            </div>
          </button>

          <div className="relative flex flex-col items-center justify-center max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
             {slides[previewIndex].type === 'video' ? (
                <video 
                   src={slides[previewIndex].mediaUrl} 
                   className="max-w-[95vw] max-h-[85vh] object-contain rounded-lg shadow-2xl shadow-black ring-1 ring-white/10"
                   controls
                   autoPlay
                />
             ) : (
                <img 
                  src={slides[previewIndex].dataUrl} 
                  alt={`Slide ${previewIndex + 1}`} 
                  className="max-w-[95vw] max-h-[85vh] object-contain rounded-lg shadow-2xl shadow-black ring-1 ring-white/10"
                />
             )}
             
             <div className="mt-4 px-4 py-2 rounded-full bg-white/10 backdrop-blur border border-white/5 text-white/80 font-medium text-sm">
                Slide {previewIndex + 1} of {slides.length}
             </div>
          </div>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 backdrop-blur-sm shadow-xl shadow-black/20">
        <button
          onClick={() => setIsConfigureSlidesExpanded(prev => !prev)}
          className="flex flex-col md:flex-row md:items-center justify-between gap-6 w-full text-left"
        >
          <div className="space-y-1 flex-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <div className="w-1.5 h-6 rounded-full bg-branding-primary shadow-[0_0_12px_rgba(var(--branding-primary-rgb),0.5)]"></div>
              Configure Slides
            </h2>
            <p className="text-sm text-white/70 font-medium pl-4.5">
              Manage {slides.length} slides, voice settings, and audio generation
            </p>
          </div>
          <div className="flex items-center text-branding-primary">
            {isConfigureSlidesExpanded ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
          </div>
        </button>

        {isConfigureSlidesExpanded && (
        <div className={`mt-8 border-t border-white/5 bg-black/20 rounded-2xl overflow-hidden flex flex-col md:flex-row ${activeTab === 'overview' ? '' : 'max-h-175'}`}>
           {/* Left Navigation */}
           <div className="md:w-72 border-b md:border-b-0 md:border-r border-white/5 bg-white/5 flex flex-row md:flex-col shrink-0 overflow-x-auto md:overflow-visible py-4 sm:py-6 no-scrollbar snap-x">
              <button
                onClick={() => setActiveTab('overview')}
                className={`snap-start flex-1 md:flex-none px-6 sm:px-8 py-8 sm:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-3 sm:gap-4 transition-all text-left whitespace-nowrap ${
                  activeTab === 'overview'
                    ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                    : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                }`}
              >
                <Info className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Overview
              </button>
              <button
                onClick={() => setActiveTab('voice')}
                className={`snap-start flex-1 md:flex-none px-6 sm:px-8 py-8 sm:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-3 sm:gap-4 transition-all text-left whitespace-nowrap ${
                  activeTab === 'voice'
                    ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                    : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                }`}
              >
                <Mic className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Voice Settings
              </button>
              <button
                onClick={() => setActiveTab('mixing')}
                className={`snap-start flex-1 md:flex-none px-6 sm:px-8 py-8 sm:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-3 sm:gap-4 transition-all text-left whitespace-nowrap ${
                  activeTab === 'mixing'
                    ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                    : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                }`}
              >
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Audio Mixing
              </button>
              <button
                onClick={() => setActiveTab('tools')}
                className={`snap-start flex-1 md:flex-none px-6 sm:px-8 py-8 sm:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-3 sm:gap-4 transition-all text-left whitespace-nowrap ${
                  activeTab === 'tools'
                    ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                    : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                }`}
              >
                <Wand2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Batch Tools
              </button>
              <button
                onClick={() => setActiveTab('media')}
                className={`snap-start flex-1 md:flex-none px-6 sm:px-8 py-8 sm:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-3 sm:gap-4 transition-all text-left whitespace-nowrap ${
                  activeTab === 'media'
                    ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                    : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                }`}
              >
                <VideoIcon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Slide Media
              </button>
           </div>

           {/* Right Content */}
           <div className={`flex-1 p-6 sm:p-10 bg-black/10 flex flex-col ${activeTab === 'overview' ? 'overflow-visible' : 'overflow-y-auto'}`}>
             {activeTab === 'overview' && (
                <div className="max-w-4xl w-full mx-auto flex flex-col space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    {/* Compact Header */}
                    <div className="space-y-1.5">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                            <Sparkles className="w-5 h-5 text-branding-primary" /> Quick Start Guide
                        </h3>
                        <p className="text-sm text-white/60">Complete your video in 4 simple steps</p>
                    </div>

                    {/* Timeline Accordion */}
                    <div className="relative">
                        {/* Gradient timeline line with 4 color stops */}
                        <div
                            className="absolute left-4 sm:left-4 top-8 bottom-6 w-px opacity-30"
                            style={{
                                background: 'linear-gradient(to bottom, #a855f7 0%, #10b981 33%, #f97316 66%, #ec4899 100%)'
                            }}
                        />

                        {/* Step rows */}
                        <div className="space-y-2">
                            {quickStartSteps.map((step) => {
                                // Color mappings for each step
                                const colorClasses = {
                                    1: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
                                    2: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400' },
                                    3: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
                                    4: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-400' }
                                }[step.id];

                                return (
                                    <div key={step.id} className="relative">
                                        <button
                                            onClick={() => setExpandedCards(prev => ({ ...prev, [step.id]: !prev[step.id] }))}
                                            className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-left group"
                                            aria-expanded={expandedCards[step.id]}
                                            aria-controls={`step-description-${step.id}`}
                                        >
                                            {/* Compact number indicator */}
                                            <div className={`w-8 h-8 rounded-full ${colorClasses.bg} border ${colorClasses.border} flex items-center justify-center shrink-0 z-10`}>
                                                <span className={`${colorClasses.text} text-sm font-bold`}>{step.id}</span>
                                            </div>

                                            {/* Content area */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-base font-semibold text-white">{step.title}</h4>
                                                    <ChevronDown className={`w-4 h-4 ${colorClasses.text} ml-auto transition-transform shrink-0 ${expandedCards[step.id] ? 'rotate-180' : ''}`} />
                                                </div>
                                                <p
                                                    id={`step-description-${step.id}`}
                                                    className={`text-sm text-white/60 leading-relaxed mt-1 ${expandedCards[step.id] ? 'block' : 'hidden'}`}
                                                >
                                                    {step.description}
                                                </p>
                                            </div>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Minimal Footer */}
                    <div className="shrink-0 pt-4 border-t border-white/5">
                        <p className="text-xs text-white/40 text-center">
                            Need help? Check the tutorial or configure settings using the tabs above
                        </p>
                    </div>
                </div>
             )}

             {activeTab === 'voice' && (
                <div className="max-w-4xl w-full mx-auto h-full flex flex-col space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 shrink-0">
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                Voice Configuration
                            </h3>
                            <p className="text-base text-white/50 leading-relaxed">Choose the narrator voice for all slides.</p>
                        </div>
                        {/* Hybrid Toggle */}

                    </div>

                        <div className="flex-1 space-y-6 sm:space-y-8 p-6 sm:p-10 rounded-3xl bg-white/5 border border-white/10 flex flex-col justify-center">
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Select Voice</label>
                                <Dropdown
                                    options={voices}
                                    value={globalVoice}
                                    onChange={(val) => { setGlobalVoice(val); onUpdateGlobalSettings?.({ voice: val }); }}
                                    className="h-14 text-base px-6"
                                />
                            </div>
                            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 pt-4">
                                <button onClick={handleGlobalPreview} className={`flex-1 h-12 sm:h-14 rounded-xl font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-3 ${isGlobalPreviewPlaying ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 hover:text-white'}`}>
                                    {isGlobalPreviewPlaying ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />} Preview Voice
                                </button>
                                <button onClick={handleApplyGlobalVoice} className="flex-1 h-12 sm:h-14 rounded-xl bg-branding-primary/20 border border-branding-primary/30 hover:bg-branding-primary/30 text-white font-bold text-sm uppercase tracking-wider transition-all">
                                    Apply to All Slides
                                </button>
                            </div>
                        </div>
                </div>
             )}

             {activeTab === 'mixing' && (
                <div className="max-w-7xl w-full mx-auto h-full flex flex-col space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                     <div className="shrink-0 space-y-2">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                            Audio Mixing
                        </h3>
                        <p className="text-base text-white/50">Control global volume levels and background music.</p>
                    </div>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="flex flex-col gap-8 h-full">
                            {/* TTS Volume */}
                            <div className="flex-1 space-y-4 p-8 rounded-3xl bg-white/5 border border-white/10 flex flex-col justify-center">
                                <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-3">
                                    <Speech className="w-4 h-4" /> Narrator Volume
                                </label>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-end">
                                        <span className="text-4xl font-light text-white">{Math.round((ttsVolume ?? 1) * 50)}%</span>
                                        {ttsVolume !== 1 && (
                                            <button onClick={() => onUpdateTtsVolume?.(1)} className="text-xs text-branding-primary hover:underline font-bold uppercase tracking-wider">Reset</button>
                                        )}
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.05"
                                        value={ttsVolume ?? 1}
                                        onChange={(e) => onUpdateTtsVolume?.(parseFloat(e.target.value))}
                                        className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-black/20 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-branding-primary [&::-webkit-slider-thumb]:hover:scale-110"
                                        style={{ background: `linear-gradient(to right, var(--branding-primary-hex, #00f0ff) ${((ttsVolume ?? 1) / 2) * 100}%, rgba(0, 0, 0, 0.2) ${((ttsVolume ?? 1) / 2) * 100}%)` }}
                                    />
                                </div>
                            </div>
                            
                            {/* Global Delay */}
                            <div className="flex-1 space-y-4 p-8 rounded-3xl bg-white/5 border border-white/10 flex flex-col justify-center">
                                <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-3">
                                    <Clock className="w-4 h-4" /> Slide Pacing
                                </label>
                                <div className="space-y-4">
                                    <div className="flex gap-4">
                                        <div className="relative flex-1">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.5"
                                                value={globalDelay}
                                                onChange={(e) => { const val = parseFloat(e.target.value) || 0; setGlobalDelay(val); onUpdateGlobalSettings?.({ delay: val }); }}
                                                className="w-full h-14 px-6 rounded-xl bg-black/20 border border-white/10 text-white text-base focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all pr-12"
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40 font-bold">SEC</span>
                                        </div>
                                        <button onClick={handleApplyGlobalDelay} className="px-6 h-14 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 hover:text-white text-xs font-bold uppercase tracking-wider transition-all">
                                            Apply
                                        </button>
                                    </div>
                                    <p className="text-xs text-white/40 leading-relaxed">
                                        Amount of silence added after each slide's narration finishes.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Background Music */}
                        <div className="h-full space-y-4 p-8 rounded-3xl bg-white/5 border border-white/10 flex flex-col justify-center">
                             <div className="flex items-center justify-between shrink-0 mb-4">
                                <label className="text-xs font-bold text-white/40 uppercase tracking-widest flex items-center gap-3">
                                    <Music className="w-4 h-4" /> Background Music
                                </label>
                                {musicSettings.url && (
                                    <button onClick={handleRemoveMusic} className="text-red-400 hover:text-red-300 transition-colors p-2 hover:bg-red-500/10 rounded-lg">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                             </div>

                             <div className="flex-1 flex flex-col justify-center">
                                 <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleMusicUpload} />
                                
                                {!musicSettings.url ? (
                                    <div className="space-y-6">
                                        <button onClick={() => fileInputRef.current?.click()} className="w-full h-16 rounded-2xl bg-white/5 border border-white/10 hover:bg-branding-primary/10 hover:border-branding-primary/30 hover:text-white text-white/50 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-3">
                                            <Upload className="w-5 h-5" /> Upload Custom Track
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-8">
                                        <div className="p-8 rounded-2xl bg-black/20 border border-white/5 text-center">
                                            <Music className="w-12 h-12 text-white/20 mx-auto mb-4" />
                                            <p className="text-lg font-medium text-white/90 truncate">{musicSettings.title || 'Unknown Track'}</p>
                                        </div>
                                        
                                        <div className="space-y-6">
                                            <div className="flex items-center gap-6">
                                                <button onClick={toggleMusicPlayback} className="w-14 h-14 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0">
                                                    {isMusicPlaying ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                                                </button>
                                                <div className="flex-1 space-y-3">
                                                    <div className="flex justify-between items-center text-xs font-bold text-white/40 uppercase">
                                                        <span>Volume</span>
                                                        <span>{Math.round(Math.sqrt(musicSettings.volume) * 100)}%</span>
                                                    </div>
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="1"
                                                        step="0.001"
                                                        value={Math.sqrt(musicSettings.volume)}
                                                        onChange={(e) => {
                                                            const newVol = parseFloat(e.target.value);
                                                            const squaredVol = newVol * newVol;
                                                            onUpdateMusicSettings({ ...musicSettings, volume: squaredVol });
                                                            if(musicAudioRef.current) musicAudioRef.current.volume = squaredVol;
                                                        }}
                                                        className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-white/10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-branding-primary"
                                                    />
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => onUpdateMusicSettings({ ...musicSettings, loop: !(musicSettings.loop ?? true) })}
                                                className={`w-full py-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-3 ${(musicSettings.loop ?? true) ? 'bg-branding-primary/10 text-branding-primary' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                                            >
                                                <Repeat className="w-4 h-4" /> Loop Track
                                            </button>
                                        </div>
                                    </div>
                                )}
                             </div>
                        </div>
                    </div>
                </div>
             )}

             {activeTab === 'tools' && (
                <div className="max-w-5xl w-full mx-auto h-full flex flex-col justify-center space-y-10 animate-in fade-in slide-in-from-right-4 duration-300">
                     <div className="shrink-0 space-y-2">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                            Batch Tools
                        </h3>
                        <p className="text-base text-white/50">Apply specific actions to all slides at once.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* AI Fix */}
                        <div className="relative">
                            <button
                                onClick={handleFixAllScripts}
                                disabled={isBatchFixing || isBatchGenerating || slides.length === 0}
                                className="group relative w-full h-52 p-6 rounded-3xl bg-linear-to-br from-branding-accent/10 to-transparent border border-branding-accent/20 hover:border-branding-accent/50 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-branding-accent/5 overflow-hidden"
                            >
                                <div className="absolute top-2 right-2 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Sparkles className="w-24 h-24" />
                                </div>
                                <div className="relative z-10 flex flex-col h-full space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-branding-accent/20 flex items-center justify-center">
                                            {isBatchFixing ? <Loader2 className="w-5 h-5 text-branding-accent animate-spin" /> : <Sparkles className="w-5 h-5 text-branding-accent" />}
                                        </div>
                                        <h4 className="text-lg font-bold text-white">AI Script Fixer</h4>
                                    </div>
                                    <p className="text-sm text-white/60 flex-1">Automatically rewrite all slide scripts to be more natural and engaging.</p>
                                    <div className="flex items-center justify-between pt-2">
                                        <div className="text-xs font-bold text-branding-accent uppercase tracking-widest">
                                            {isBatchFixing ? `Processing ${batchProgress?.current || 0}/${batchProgress?.total || 0}...` : 'Start Process'}
                                        </div>
                                        {isBatchFixing && (
                                            <div
                                                role="button"
                                                onClick={(e) => { e.stopPropagation(); handleCancelBatchFix(); }}
                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                                                title="Cancel batch AI fix"
                                            >
                                                <X className="w-3 h-3" /> Cancel
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </button>
                        </div>

                        {/* Generate All */}
                        <div className="relative">
                            <button
                                onClick={handleGenerateAll}
                                disabled={isGeneratingAudio || isBatchGenerating || slides.length === 0}
                                className="group relative w-full h-52 p-6 rounded-3xl bg-linear-to-br from-branding-primary/10 to-transparent border border-branding-primary/20 hover:border-branding-primary/50 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-branding-primary/5 overflow-hidden"
                            >
                                <div className="absolute top-2 right-2 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Wand2 className="w-24 h-24" />
                                </div>
                                <div className="relative z-10 flex flex-col h-full space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-branding-primary/20 flex items-center justify-center">
                                            {isBatchGenerating ? <Loader2 className="w-5 h-5 text-branding-primary animate-spin" /> : <Wand2 className="w-5 h-5 text-branding-primary" />}
                                        </div>
                                        <h4 className="text-lg font-bold text-white">Generate All Audio</h4>
                                    </div>
                                    <p className="text-sm text-white/60 flex-1">Generate or regenerate TTS audio for all slides sequentially.</p>
                                    <div className="flex items-center justify-between pt-2">
                                        <div className="text-xs font-bold text-branding-primary uppercase tracking-widest">
                                            {isBatchGenerating ? `Generating ${batchProgress?.current || 0}/${batchProgress?.total || 0}...` : 'Start Process'}
                                        </div>
                                        {isBatchGenerating && (
                                            <div
                                                role="button"
                                                onClick={(e) => { e.stopPropagation(); handleCancelBatchGenerate(); }}
                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                                                title="Cancel batch TTS generation"
                                            >
                                                <X className="w-3 h-3" /> Cancel
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </button>
                        </div>

                        {/* Bulk Revert */}
                        <button
                            onClick={handleRevertAllScripts}
                            disabled={slides.filter(s => s.originalScript).length === 0}
                            className="group relative h-52 p-6 rounded-3xl bg-linear-to-br from-branding-primary/10 to-transparent border border-branding-primary/20 hover:border-branding-primary/50 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-branding-primary/5 overflow-hidden"
                        >
                            <div className="absolute top-2 right-2 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Undo2 className="w-24 h-24" />
                            </div>
                            <div className="relative z-10 flex flex-col h-full space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-branding-primary/20 flex items-center justify-center">
                                        <Undo2 className="w-5 h-5 text-branding-primary" />
                                    </div>
                                    <h4 className="text-lg font-bold text-white">Bulk Revert Scripts</h4>
                                </div>
                                <p className="text-sm text-white/60 flex-1">Revert all modified scripts back to their original state at once.</p>
                                <div className="text-xs font-bold text-branding-primary uppercase tracking-widest pt-2">
                                    {slides.filter(s => s.originalScript).length} Slide(s) Available
                                </div>
                            </div>
                        </button>
                    </div>

                    {/* Find and Replace */}
                    <div className="p-8 rounded-3xl bg-white/5 border border-white/10 space-y-6">
                        <h4 className="text-xs font-bold text-white/70 uppercase tracking-widest flex items-center gap-3">
                            <Search className="w-4 h-4" /> Find & Replace
                        </h4>
                        <div className="flex flex-col md:flex-row gap-4">
                             <input
                                type="text"
                                placeholder="Find..."
                                value={findText}
                                onChange={(e) => setFindText(e.target.value)}
                                className="flex-1 h-12 px-6 rounded-xl bg-black/20 border border-white/10 text-white text-sm focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all placeholder:text-white/30"
                            />
                             <input
                                type="text"
                                placeholder="Replace with..."
                                value={replaceText}
                                onChange={(e) => setReplaceText(e.target.value)}
                                className="flex-1 h-12 px-6 rounded-xl bg-black/20 border border-white/10 text-white text-sm focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all placeholder:text-white/30"
                            />
                            <button
                                onClick={handleFindAndReplace}
                                disabled={!findText}
                                className="px-8 h-12 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                            >
                                Replace All
                            </button>
                        </div>
                    </div>
                </div>
             )}

             {activeTab === 'media' && (
                <div className="max-w-4xl w-full mx-auto h-full flex flex-col space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                     <div className="shrink-0 space-y-2">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                            Slide Media
                        </h3>
                        <p className="text-base text-white/50">Manage assets and insert special slide types.</p>
                    </div>

                    <div className="flex-1 p-10 rounded-3xl bg-white/5 border border-white/10 border-dashed flex flex-col items-center justify-center text-center space-y-8">
                        <div className="w-24 h-24 rounded-full bg-branding-primary/10 flex items-center justify-center">
                            <VideoIcon className="w-12 h-12 text-branding-primary" />
                        </div>
                        <div className="space-y-3 max-w-md">
                            <h4 className="text-xl font-bold text-white">Insert Video or GIF Slide</h4>
                            <p className="text-base text-white/60 leading-relaxed">
                                Upload a video (MP4) or animated GIF to act as a standalone slide. Useful for intros, transitions, or visual demonstrations.
                            </p>
                        </div>
                        
                        <input type="file" ref={mediaInputRef} className="hidden" accept="video/mp4,image/gif" onChange={handleMediaUpload} />
                        <button
                            onClick={() => mediaInputRef.current?.click()}
                            className="px-10 py-4 rounded-2xl bg-branding-primary text-black font-bold text-sm uppercase tracking-wider hover:bg-branding-primary/90 hover:scale-105 transition-all shadow-lg shadow-branding-primary/20"
                        >
                            Select File to Insert
                        </button>
                    </div>
                </div>
             )}
           </div>
        </div>
        )}

      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext 
          items={slides.map(s => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="grid gap-6">
            {slides.map((slide, index) => (
              <SortableSlideItem
                 key={slide.id}
                 slide={slide}
                 index={index}
                 onUpdate={onUpdateSlide}
                 onGenerate={onGenerateAudio}
                 isGenerating={isGeneratingAudio || isBatchGenerating}
                 onExpand={(i) => {
                   setPreviewIndex(prev => prev === i ? null : i);
                   if (previewIndex !== i) {
                     window.scrollTo({ top: 0, behavior: 'smooth' });
                   }
                 }}
                 highlightText={findText}
                  onDelete={handleDeleteSlide}
                  ttsVolume={ttsVolume}
                  voices={voices}
                  globalSettings={globalSettings}
                  isMobile={isMobile}
               />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};
