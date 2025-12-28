import React, { useRef } from 'react';
import { Volume2, VolumeX, Wand2, X, Play, Square, ZoomIn, Clock, GripVertical, Mic, Trash2, Upload, Sparkles, Loader2, Search, Video as VideoIcon, Plus, Clipboard, Check, Repeat, Music } from 'lucide-react';
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
import { AVAILABLE_VOICES, fetchRemoteVoices, DEFAULT_VOICES, type Voice } from '../services/ttsService';
import { loadGlobalSettings } from '../services/storage';

import { transformText } from '../services/aiService';
import { Dropdown } from './Dropdown';
import modernEdm from '../assets/music/modern edm.mp3';

const PREDEFINED_MUSIC = [
  { id: modernEdm, name: 'Modern EDM' }
];

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
  voices // Add voices to destructuring
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
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });

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
    const apiKey = localStorage.getItem('llm_api_key') || localStorage.getItem('gemini_api_key');
    const baseUrl = localStorage.getItem('llm_base_url') || 'https://generativelanguage.googleapis.com/v1beta/openai/';
    const model = localStorage.getItem('llm_model') || 'gemini-2.5-flash';

    if (!apiKey) {
      alert('Please configure your LLM settings (Base URL, Model, API Key) in Settings (API Keys tab) to use this feature.');
      return;
    }

    if (!slide.script.trim()) return;

    if (!window.confirm("This will replace the current script with an AI-enhanced version. Continue?")) {
        return; 
    }

    setIsTransforming(true);
    try {
      const transformed = await transformText({ apiKey, baseUrl, model }, slide.script);
      onUpdate(index, { script: transformed, selectionRanges: undefined });
    } catch (error) {
      alert('Transformation failed: ' + (error instanceof Error ? error.message : String(error)));
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
      className="group relative flex gap-6 p-6 rounded-2xl bg-linear-to-br from-white/10 to-white/5 border border-white/30 shadow-2xl shadow-black/40 ring-1 ring-inset ring-white/10 hover:border-branding-primary/60 hover:shadow-branding-primary/10 hover:ring-branding-primary/20 transition-[border-color,box-shadow] duration-300"
    >
      {/* Drag Handle */}
      <div 
        className="absolute left-2 top-1/2 -translate-y-1/2 p-2 cursor-grab active:cursor-grabbing text-white hover:text-branding-primary transition-colors z-20 touch-none"
        {...attributes} 
        {...listeners}
      >
        <GripVertical className="w-5 h-5" />
      </div>

      {/* Slide Preview */}
      {/* Slide Preview Column */}
      <div className="w-1/3 ml-6 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white/40 uppercase tracking-widest">
            Slide {index + 1} {slide.type === 'video' && '(Media)'}
          </span>
          <button 
             onClick={(e) => {
                 e.stopPropagation();
                 onDelete(index);
             }}
             className="p-1.5 text-white/20 hover:text-red-400 hover:bg-white/5 rounded-lg transition-all"
             title="Delete Slide"
          >
             <Trash2 className="w-4 h-4 opacity-70 hover:opacity-100" />
          </button>
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
          
          <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover/image:opacity-100">
             <ZoomIn className="w-8 h-8 text-white drop-shadow-md" />
          </div>
        </div>
      </div>

      {/* Editing Controls */}
      <div className="flex-1 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Script (TTS Text)</label>
            <div className="flex gap-2">
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
                className="flex items-center gap-1 text-[10px] uppercase font-bold text-white/40 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Copy script to clipboard"
              >
                {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Clipboard className="w-3 h-3" />}
                {isCopied ? 'Copied!' : 'Copy'}
              </button>
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
             <p className="text-[10px] text-branding-primary italic">
                Audio will be generated only from the highlighted sections.
             </p>
          )}
        </div>

        <div className="flex items-center gap-6">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Voice</label>
            <Dropdown
              options={voices}
              value={slide.voice}
              onChange={(val) => onUpdate(index, { voice: val })}
            />
          </div>

          <div className="flex-1 space-y-2">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Transition</label>
            <Dropdown
              options={[
                { id: 'fade', name: 'Fade' },
                { id: 'slide', name: 'Slide' },
                { id: 'zoom', name: 'Zoom' },
                { id: 'none', name: 'None' },
              ]}
              value={slide.transition}
              onChange={(val) => onUpdate(index, { transition: val as SlideData['transition'] })}
            />
          </div>

          <div className="w-24 space-y-2">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Delay (s)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={slide.postAudioDelay || 0}
              onChange={(e) => onUpdate(index, { postAudioDelay: parseFloat(e.target.value) || 0 })}
              className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all"
            />
          </div>

          
          <div className="pt-6 flex flex-col gap-2">
             <button
              onClick={() => onGenerate(index)}
              disabled={isGenerating || !slide.script.trim()}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-branding-primary/10 text-branding-primary hover:bg-branding-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm cursor-pointer justify-center"
            >
              {slide.audioUrl ? <Volume2 className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
              {slide.audioUrl ? 'Regenerate' : 'Generate Speech'}
            </button>

            {slide.audioUrl && (
              <button
                onClick={togglePlayback}
                disabled={isGenerating}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50 transition-all font-medium text-sm justify-center"
              >
                {isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                {isPlaying ? 'Stop' : 'Preview'}
              </button>
            )}

            {slide.type === 'video' && (
                <button
                    onClick={() => onUpdate(index, { isVideoMusicPaused: !slide.isVideoMusicPaused })}
                    className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-all font-medium text-sm justify-center border ${slide.isVideoMusicPaused ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-white/5 text-white/40 border-white/10 hover:text-white'}`}
                    title="Pause background music while this video plays"
                >
                    {slide.isVideoMusicPaused ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 opacity-50" />}
                    {slide.isVideoMusicPaused ? 'Music Paused' : 'Music Playing'}
                </button>
            )}


          </div>
        </div>

        {slide.duration && (
          <div className="text-[10px] text-white/40 font-medium">
            Audio Duration: {slide.duration.toFixed(2)}s
          </div>
        )}
      </div>
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
  onUpdateTtsVolume
}) => {
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = React.useState(false);
  const [globalDelay, setGlobalDelay] = React.useState(0.5);
  const [globalVoice, setGlobalVoice] = React.useState(AVAILABLE_VOICES[0].id);
  const [voices, setVoices] = React.useState<Voice[]>(AVAILABLE_VOICES);

  React.useEffect(() => {
    loadGlobalSettings().then(settings => {
      // Logic to fetch base voices
      const fetchPromise = (settings?.useLocalTTS && settings?.localTTSUrl) 
          ? fetchRemoteVoices(settings.localTTSUrl) 
          : Promise.resolve(DEFAULT_VOICES);

      fetchPromise.then(fetchedVoices => {
          let finalVoices = [...fetchedVoices];

          // Check if we have a custom hybrid voice in settings
          if (settings?.voice && settings.voice.includes('+')) {
              // It's a hybrid voice. We need to add it to the list if not already there (it won't be in standard list)
             
             // Try to parse names from IDs if possible, otherwise use IDs
             const match = settings.voice.match(/^([^(]+)(?:\((\d+)\))?\+([^(]+)(?:\((\d+)\))?$/);
             let name = "Custom Hybrid Voice";
             
             if (match) {
                 const [, idA, weightA, idB, weightB] = match;
                 // Try to find names in fetchedVoices
                 const nameA = fetchedVoices.find(v => v.id === idA)?.name || idA;
                 const nameB = fetchedVoices.find(v => v.id === idB)?.name || idB;
                 const wA = weightA || "50";
                 const wB = weightB || (weightA ? String(100 - parseInt(weightA)) : "50"); // approximation if B weight not explicit but A is
                 
                 name = `Hybrid: ${nameA} (${wA}%) + ${nameB} (${wB}%)`;
             } else {
                 // Fallback for simple A+B
                 const [idA, idB] = settings.voice.split('+');
                  const nameA = fetchedVoices.find(v => v.id === idA)?.name || idA;
                  const nameB = fetchedVoices.find(v => v.id === idB)?.name || idB;
                  name = `Hybrid: ${nameA} + ${nameB}`;
             }

             const hybridVoice: Voice = {
                 id: settings.voice,
                 name: name
             };

             // Prepend to list so user can see/select it
             finalVoices = [hybridVoice, ...finalVoices];
          }

          setVoices(finalVoices);
          
          if (settings?.delay) setGlobalDelay(settings.delay);
          if (settings?.voice) setGlobalVoice(settings.voice);
      });
    });
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = React.useState(false);

  const [findText, setFindText] = React.useState('');
  const [replaceText, setReplaceText] = React.useState('');

  const mediaInputRef = useRef<HTMLInputElement>(null);

  const getVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = url;
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
         resolve(video.duration);
      };
      video.onerror = () => resolve(5); 
    });
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4');
      const isGif = file.type === 'image/gif' || file.name.endsWith('.gif');
      
      if (!isVideo && !isGif) {
          alert("Please upload an MP4 video or a GIF.");
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
      onUpdateMusicSettings({ ...musicSettings, url, volume: musicSettings.volume || 0.5 });
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
      onUpdateMusicSettings({ ...musicSettings, url: undefined });
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

  const handleApplyGlobalDelay = () => {
    if (window.confirm(`Apply ${globalDelay}s delay to all ${slides.length} slides?`)) {
      slides.forEach((_, index) => {
        onUpdateSlide(index, { postAudioDelay: globalDelay });
      });
    }
  };

  const handleApplyGlobalVoice = () => {
    const voiceName = voices.find(v => v.id === globalVoice)?.name || globalVoice;
    if (window.confirm(`Apply "${voiceName}" voice to all ${slides.length} slides?`)) {
      slides.forEach((_, index) => {
        onUpdateSlide(index, { voice: globalVoice });
      });
    }
  };

  const handleGenerateAll = async () => {
    if (!window.confirm("This will generate audio for all slides, overwriting any existing audio. Continue?")) {
      return;
    }

    setIsBatchGenerating(true);
    try {
      for (let i = 0; i < slides.length; i++) {
        await onGenerateAudio(i);
      }
    } finally {
      setIsBatchGenerating(false);
    }
  };

  const handleFindAndReplace = () => {
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
        if (window.confirm(`Found ${matchCount} matches. Replace all occurrences of "${findText}" with "${replaceText}"?`)) {
             onReorderSlides(newSlides);
             alert(`Replaced ${matchCount} occurrences.`);
        }
    } else {
        alert("No matches found.");
    }
  };

  const handleDeleteSlide = (index: number) => {
    if (confirm("Are you sure you want to delete this slide?")) {
        const newSlides = [...slides];
        newSlides.splice(index, 1);
        onReorderSlides(newSlides);
    }
  };



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
            className="absolute top-4 right-4 z-10 p-2 text-white/60 hover:text-white transition-colors flex items-center gap-2 group"
          >
            <span className="uppercase text-xs font-bold tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">Close</span>
            <div className="bg-white/10 p-2 rounded-full group-hover:bg-white/20 transition-colors">
              <X className="w-6 h-6" />
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

      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-sm shadow-xl shadow-black/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <div className="w-1.5 h-6 rounded-full bg-branding-primary shadow-[0_0_12px_rgba(var(--branding-primary-rgb),0.5)]"></div>
              Configure Slides
            </h2>
            <p className="text-sm text-white/70 font-medium pl-4.5">
              Manage {slides.length} slides, voice settings, and audio generation
            </p>
          </div>


        </div>

        <div className="mt-6 pt-6 border-t border-white/5 grid grid-cols-1 lg:grid-cols-3 gap-6">
           {/* Section 1: Media & Assets */}
           <div className="space-y-4 p-5 rounded-xl bg-white/10 border border-white/10 hover:border-white/20 transition-colors">
              <h3 className="text-xs font-bold text-white/70 uppercase tracking-widest flex items-center gap-2 mb-4">
                <VideoIcon className="w-3 h-3" /> Media & Assets
              </h3>
              
              <div className="space-y-4">
                 {/* Add Media */}
                 <div>
                    <input
                      type="file"
                      ref={mediaInputRef}
                      className="hidden"
                      accept="video/mp4,image/gif"
                      onChange={handleMediaUpload}
                    />
                    <button
                      onClick={() => mediaInputRef.current?.click()}
                      className="h-10 px-4 rounded-lg bg-white/10 border border-white/20 hover:bg-branding-primary/20 hover:border-branding-primary/50 hover:text-white text-white/90 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 justify-center w-full"
                    >
                      <Plus className="w-3 h-3" />
                      Insert GIF/Video
                    </button>
                 </div>


                 {/* TTS Volume */}
                 <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-white/70 uppercase tracking-widest flex items-center gap-1.5">
                       <Volume2 className="w-3 h-3" /> TTS Volume
                     </label>
                     <div className="flex items-center gap-3 h-10 bg-white/5 rounded-lg px-3 border border-white/10">
                          <input
                              type="range"
                              min="0"
                              max="3"
                              step="0.1"
                              value={ttsVolume ?? 1}
                              onChange={(e) => onUpdateTtsVolume?.(parseFloat(e.target.value))}
                              style={{
                                  background: `linear-gradient(to right, var(--branding-primary-hex, #00f0ff) ${((ttsVolume ?? 1) / 3) * 100}%, rgba(255, 255, 255, 0.1) ${((ttsVolume ?? 1) / 3) * 100}%)`
                              }}
                              className="w-full h-1 rounded-lg appearance-none cursor-pointer bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-branding-primary [&::-webkit-slider-thumb]:hover:scale-125 [&::-webkit-slider-thumb]:transition-transform"
                          />
                          <span className="text-[10px] w-9 text-right font-mono font-bold text-white/60">
                            {Math.round((ttsVolume ?? 1) * 100)}%
                          </span>
                     </div>
                 </div>

                 {/* Background Music */}
                 <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="audio/*"
                      onChange={handleMusicUpload}
                    />
                    
                    {!musicSettings.url ? (
                        <div className="space-y-3">
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="h-10 px-4 rounded-lg bg-white/10 border border-white/20 hover:bg-branding-primary/20 hover:border-branding-primary/50 hover:text-white text-white/90 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 justify-center w-full"
                            >
                                <Upload className="w-3 h-3" /> Upload Background Music
                            </button>

                            <div className="flex items-center gap-3 py-1">
                                <div className="h-px flex-1 bg-white/10"></div>
                                <span className="text-[10px] font-bold text-white/30">OR</span>
                                <div className="h-px flex-1 bg-white/10"></div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-white/70 uppercase tracking-widest flex items-center gap-1.5">
                                    <Music className="w-3 h-3" /> Music Library
                                </label>
                                <Dropdown
                                    options={PREDEFINED_MUSIC}
                                    value=""
                                    onChange={(val) => {
                                        if (val) onUpdateMusicSettings({ ...musicSettings, url: val, volume: musicSettings.volume || 0.5 });
                                    }}
                                    className="bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-white text-xs"
                                />
                            </div>
                        </div>
                     ) : (
                        <div className="flex items-center gap-2 h-10 bg-white/5 rounded-lg p-1 border border-white/10">
                            <button
                                onClick={toggleMusicPlayback}
                                className="w-8 h-8 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
                            >
                                {isMusicPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                            </button>
                            
                            <div className="flex-1 px-2 flex items-center gap-2 min-w-0" title={`Volume: ${Math.round(musicSettings.volume * 100)}%`}>
                                <Volume2 className="w-3 h-3 text-white/40 shrink-0" />
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={musicSettings.volume}
                                    onChange={(e) => {
                                        const newVol = parseFloat(e.target.value);
                                        onUpdateMusicSettings({ ...musicSettings, volume: newVol });
                                        if(musicAudioRef.current) musicAudioRef.current.volume = newVol;
                                    }}
                                    style={{
                                        background: `linear-gradient(to right, var(--branding-primary-hex, #00f0ff) ${musicSettings.volume * 100}%, rgba(255, 255, 255, 0.1) ${musicSettings.volume * 100}%)`
                                    }}
                                    className="w-full h-1 rounded-lg appearance-none cursor-pointer bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-branding-primary [&::-webkit-slider-thumb]:hover:scale-125 [&::-webkit-slider-thumb]:transition-transform"
                                />
                            </div>

                            <button
                                onClick={() => onUpdateMusicSettings({ ...musicSettings, loop: !(musicSettings.loop ?? true) })}
                                className={`w-8 h-8 flex items-center justify-center rounded transition-colors shrink-0 ${(musicSettings.loop ?? true) ? 'bg-branding-primary/20 text-branding-primary' : 'bg-white/10 hover:bg-white/20 text-white/40'}`}
                                title={(musicSettings.loop ?? true) ? "Loop Enabled" : "Loop Disabled"}
                            >
                                <Repeat className="w-3 h-3" />
                            </button>

                            <button
                                onClick={handleRemoveMusic}
                                className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-500/20 text-white/40 hover:text-red-500 transition-colors shrink-0"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                     )}
                 </div>



              </div>
           </div>

           {/* Section 2: Global Configuration */}
           <div className="space-y-4 p-5 rounded-xl bg-white/10 border border-white/10 hover:border-white/20 transition-colors">
              <h3 className="text-xs font-bold text-white/70 uppercase tracking-widest flex items-center gap-2 mb-4">
                <Mic className="w-3 h-3" /> Global Settings
              </h3>

              <div className="space-y-4">
                 {/* Global Voice */}
                 <div className="flex items-end gap-2">
                    <div className="space-y-1.5 flex-1 min-w-0">
                       <label className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Voice Model</label>
                       <Dropdown
                         options={voices}
                         value={globalVoice}
                         onChange={setGlobalVoice}
                         className="bg-white/10 border border-white/20 hover:bg-white/20 transition-colors text-white text-sm"
                       />
                    </div>
                    <button
                       onClick={handleApplyGlobalVoice}
                       className="h-[42px] px-3 rounded-lg bg-white/10 border border-white/20 hover:bg-branding-primary/20 hover:border-branding-primary/50 text-white/90 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all"
                    >
                       Apply
                    </button>
                 </div>

                 {/* Global Delay */}
                 <div className="flex items-end gap-2">
                    <div className="space-y-1.5 flex-1">
                       <label className="text-[10px] font-bold text-white/70 uppercase tracking-widest flex items-center gap-1.5"><Clock className="w-3 h-3" /> Post-Slide Delay</label>
                       <div className="relative">
                         <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={globalDelay}
                          onChange={(e) => setGlobalDelay(parseFloat(e.target.value) || 0)}
                          className="w-full h-[42px] px-4 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all pr-8 hover:bg-white/20"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/50 pointer-events-none font-bold">SEC</span>
                       </div>
                    </div>
                    <button
                       onClick={handleApplyGlobalDelay}
                       className="h-[42px] px-3 rounded-lg bg-white/10 border border-white/20 hover:bg-branding-primary/20 hover:border-branding-primary/50 text-white/90 hover:text-white text-[10px] font-bold uppercase tracking-wider transition-all"
                    >
                       Apply
                    </button>
                 </div>
              </div>
           </div>

           {/* Section 3: Batch Tools */}
           <div className="space-y-4 p-5 rounded-xl bg-white/10 border border-white/10 hover:border-white/20 transition-colors">
              <h3 className="text-xs font-bold text-white/70 uppercase tracking-widest flex items-center gap-2 mb-4">
                <Wand2 className="w-3 h-3" /> Batch Operations
              </h3>

              <div className="space-y-4">
                 {/* Find & Replace */}
                 <div className="space-y-2">
                     <label className="text-[10px] font-bold text-white/70 uppercase tracking-widest flex items-center gap-1.5"><Search className="w-3 h-3" /> Find & Replace</label> 
                     <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center">
                       <input
                        type="text"
                        placeholder="Find"
                        value={findText}
                        onChange={(e) => setFindText(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-white/10 border border-white/20 text-white text-xs focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all placeholder:text-white/40 hover:bg-white/20"
                      />
                       <span className="text-white/30 text-[10px]">to</span>
                       <input
                        type="text"
                        placeholder="Replace"
                        value={replaceText}
                        onChange={(e) => setReplaceText(e.target.value)}
                        className="w-full h-9 px-3 rounded-lg bg-white/10 border border-white/20 text-white text-xs focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all placeholder:text-white/40 hover:bg-white/20"
                      />
                     </div>
                     <button
                       onClick={handleFindAndReplace}
                       disabled={!findText}
                       className="w-full h-8 rounded-lg bg-white/10 border border-white/20 hover:bg-branding-primary/20 hover:border-branding-primary/50 hover:text-white text-white/90 text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                       Replace All Instances
                    </button>
                 </div>

                 {/* Generate All */}
                 <div className="pt-2 border-t border-white/10">
                    <button
                      onClick={handleGenerateAll}
                      disabled={isGeneratingAudio || isBatchGenerating || slides.length === 0}
                      className="h-10 px-4 rounded-lg bg-branding-primary/10 border border-branding-primary/20 hover:bg-branding-primary/20 hover:border-branding-primary/50 text-branding-primary hover:text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed w-full justify-center"
                    >
                      <Wand2 className={`w-3 h-3 ${isBatchGenerating ? 'animate-spin' : ''}`} />
                      {isBatchGenerating ? 'Processing...' : 'Generate All Audio'}
                    </button>
                 </div>

              </div>
           </div>
        </div>

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
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};
