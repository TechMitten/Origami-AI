import React, { useRef } from 'react';
import { Volume2, Wand2, X, Play, Square, ZoomIn, Clock, Eraser, GripVertical, Mic, Music, Trash2, Upload } from 'lucide-react';
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
import { AVAILABLE_VOICES } from '../services/ttsService';
import { Dropdown } from './Dropdown';

export interface SlideData extends RenderedPage {
  id: string;
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
}

interface SlideEditorProps {
  slides: SlideData[];
  onUpdateSlide: (index: number, data: Partial<SlideData>) => void;
  onGenerateAudio: (index: number) => Promise<void>;
  isGeneratingAudio: boolean;
  onReorderSlides: (slides: SlideData[]) => void;
  musicSettings: MusicSettings;
  onUpdateMusicSettings: (settings: MusicSettings) => void;
}

const SortableSlideItem = ({ 
  slide, 
  index, 
  onUpdate, 
  onGenerate, 
  isGenerating,
  onExpand
}: { 
  slide: SlideData, 
  index: number, 
  onUpdate: (i: number, d: Partial<SlideData>) => void, 
  onGenerate: (i: number) => Promise<void>, 
  isGenerating: boolean,
  onExpand: (i: number) => void
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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio on unmount or if slide changes
  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [slide.audioUrl]);

  const togglePlayback = () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    } else if (slide.audioUrl) {
      const audio = new Audio(slide.audioUrl);
      audio.onended = () => setIsPlaying(false);
      audio.play().catch(e => {
        console.error("Audio playback failed", e);
        setIsPlaying(false);
      });
      audioRef.current = audio;
      setIsPlaying(true);
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
    if (!slide.selectionRanges || slide.selectionRanges.length === 0) return slide.script;

    const ranges = slide.selectionRanges;
    const parts = [];
    let lastIndex = 0;

    ranges.forEach((range, i) => {
      // Text before this range
      if (range.start > lastIndex) {
        parts.push(slide.script.slice(lastIndex, range.start));
      }
      
      // The highlighted range
      parts.push(
        <mark key={i} className="bg-teal-500/30 text-transparent rounded px-0 py-0">
          {slide.script.slice(range.start, range.end)}
        </mark>
      );
      
      lastIndex = range.end;
    });

    // Remaining text
    if (lastIndex < slide.script.length) {
      parts.push(slide.script.slice(lastIndex));
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
      <div 
        className="w-1/3 aspect-video rounded-lg overflow-hidden border border-white/5 relative bg-black cursor-pointer group/image ml-6"
        onClick={() => onExpand(index)}
      >
        <img 
          src={slide.dataUrl} 
          alt={`Slide ${index + 1}`} 
          className="w-full h-full object-contain transition-transform duration-500 group-hover/image:scale-105"
        />
        <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover/image:opacity-100">
           <ZoomIn className="w-8 h-8 text-white drop-shadow-md" />
        </div>
        <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm">
          Slide {index + 1}
        </div>
      </div>

      {/* Editing Controls */}
      <div className="flex-1 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Script (TTS Text)</label>
            <div className="flex gap-2">
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
              options={AVAILABLE_VOICES}
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

          <div className="pt-6 flex items-center gap-2">
             <button
              onClick={() => onGenerate(index)}
              disabled={isGenerating || !slide.script.trim()}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-branding-primary/10 text-branding-primary hover:bg-branding-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm"
            >
              {slide.audioUrl ? <Volume2 className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
              {slide.audioUrl ? 'Regenerate' : 'Generate'}
            </button>

            {slide.audioUrl && (
              <button
                onClick={togglePlayback}
                disabled={isGenerating}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50 transition-all font-medium text-sm"
              >
                {isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                {isPlaying ? 'Stop' : 'Preview'}
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
  onUpdateMusicSettings
}) => {
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = React.useState(false);
  const [globalDelay, setGlobalDelay] = React.useState(0.5);
  const [globalVoice, setGlobalVoice] = React.useState(AVAILABLE_VOICES[0].id);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = React.useState(false);

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
    const voiceName = AVAILABLE_VOICES.find(v => v.id === globalVoice)?.name;
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

  const handleResetAllHighlights = () => {
    if (window.confirm("Are you sure you want to remove ALL text highlighting from every slide?")) {
      slides.forEach((_, index) => {
        onUpdateSlide(index, { selectionRanges: undefined });
      });
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
             <img 
               src={slides[previewIndex].dataUrl} 
               alt={`Slide ${previewIndex + 1}`} 
               className="max-w-[95vw] max-h-[85vh] object-contain rounded-lg shadow-2xl shadow-black ring-1 ring-white/10"
             />
             
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
            <p className="text-sm text-white/40 font-medium pl-4.5">
              Manage {slides.length} slides, voice settings, and audio generation
            </p>
          </div>

          <div className="flex items-center gap-3 pl-4.5 md:pl-0">
             <button
              onClick={handleResetAllHighlights}
              className="group flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all font-medium text-sm"
              title="Remove highlighting from all slides"
            >
              <Eraser className="w-4 h-4 transition-transform group-hover:-rotate-12" />
              <span>Reset Highlights</span>
            </button>

            <button
              onClick={handleGenerateAll}
              disabled={isGeneratingAudio || isBatchGenerating || slides.length === 0}
              className="group flex items-center gap-2 px-5 py-2.5 rounded-xl bg-branding-primary text-white hover:bg-branding-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold text-sm shadow-lg shadow-branding-primary/20 hover:shadow-branding-primary/40 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Wand2 className={`w-4 h-4 ${isBatchGenerating ? 'animate-spin' : 'group-hover:rotate-12 transition-transform'}`} />
              {isBatchGenerating ? 'Processing...' : 'Generate All Audio'}
            </button>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-white/5 flex flex-wrap items-center gap-x-8 gap-y-6 pl-4.5 md:pl-0">
           {/* Global Voice Control */}
           <div className="flex items-end gap-3 group relative">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest group-focus-within:text-branding-primary transition-colors">
                  <Mic className="w-3 h-3" /> Global Voice
                </label>
                <div className="w-64">
                  <Dropdown
                    options={AVAILABLE_VOICES}
                    value={globalVoice}
                    onChange={setGlobalVoice}
                    className="bg-black/20 hover:bg-black/30 transition-colors"
                  />
                </div>
              </div>
              <button
                 onClick={handleApplyGlobalVoice}
                 className="mb-[2px] px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-branding-primary/10 hover:border-branding-primary/30 hover:text-branding-primary text-white/60 text-xs font-bold uppercase tracking-wider transition-all"
              >
                 Apply All
              </button>
           </div>

           <div className="w-px h-10 bg-white/5 hidden md:block" />

           {/* Global Delay Control */}
           <div className="flex items-end gap-3 group">
              <div className="space-y-2">
                 <label className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest group-focus-within:text-branding-primary transition-colors">
                    <Clock className="w-3 h-3" /> Global Delay
                 </label>
                 <div className="relative">
                   <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={globalDelay}
                    onChange={(e) => setGlobalDelay(parseFloat(e.target.value) || 0)}
                    className="w-28 px-4 py-2.5 rounded-lg bg-black/20 border border-white/10 text-white text-sm focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all pr-8 hover:bg-black/30"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30 pointer-events-none font-bold">SEC</span>
                 </div>
              </div>
              <button
                 onClick={handleApplyGlobalDelay}
                 className="mb-[2px] px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-branding-primary/10 hover:border-branding-primary/30 hover:text-branding-primary text-white/60 text-xs font-bold uppercase tracking-wider transition-all"
              >
                 Apply All
              </button>
           </div>

           <div className="w-px h-10 bg-white/5 hidden md:block" />

           {/* Background Music Control */}
           <div className="flex items-end gap-3 group relative">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="audio/*"
                onChange={handleMusicUpload}
              />
              <div className="space-y-2">
                 <label className="flex items-center gap-2 text-[10px] font-bold text-white/40 uppercase tracking-widest group-focus-within:text-branding-primary transition-colors">
                    <Music className="w-3 h-3" /> Background Music
                 </label>
                 
                 {!musicSettings.url ? (
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="h-10 px-4 rounded-lg bg-white/5 border border-white/10 hover:bg-branding-primary/10 hover:border-branding-primary/30 hover:text-branding-primary text-white/60 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2"
                    >
                        <Upload className="w-3 h-3" /> Upload Track
                    </button>
                 ) : (
                    <div className="flex items-center gap-2 h-10 bg-black/20 rounded-lg p-1 border border-white/10">
                        <button
                            onClick={toggleMusicPlayback}
                            className="w-8 h-8 flex items-center justify-center rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                            {isMusicPlaying ? <Square className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                        </button>
                        
                        <div className="w-24 px-2 flex items-center gap-2" title={`Volume: ${Math.round(musicSettings.volume * 100)}%`}>
                            <Volume2 className="w-3 h-3 text-white/40" />
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
                                    background: `linear-gradient(to right, var(--primary) ${musicSettings.volume * 100}%, rgba(255, 255, 255, 0.1) ${musicSettings.volume * 100}%)`
                                }}
                                className="w-full h-1 rounded-lg appearance-none cursor-pointer bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-branding-primary [&::-webkit-slider-thumb]:hover:scale-125 [&::-webkit-slider-thumb]:transition-transform"
                            />
                        </div>

                        <button
                            onClick={handleRemoveMusic}
                            className="w-8 h-8 flex items-center justify-center rounded hover:bg-red-500/20 text-white/40 hover:text-red-500 transition-colors"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
                 )}
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
                 onExpand={(i) => setPreviewIndex(prev => prev === i ? null : i)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
};
