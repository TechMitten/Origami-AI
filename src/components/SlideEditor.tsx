import React, { useRef } from 'react';
import { Volume2, Wand2, X, Play, Square, ZoomIn, Clock, Eraser } from 'lucide-react';
import type { RenderedPage } from '../services/pdfService';
import { AVAILABLE_VOICES } from '../services/ttsService';
import { Dropdown } from './Dropdown';

export interface SlideData extends RenderedPage {
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

interface SlideEditorProps {
  slides: SlideData[];
  onUpdateSlide: (index: number, data: Partial<SlideData>) => void;
  onGenerateAudio: (index: number) => Promise<void>;
  isGeneratingAudio: boolean;
}

const SlideItem = ({ 
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
      
      // Optional: Clear native selection to indicate it's "moved" to the custom highlight, 
      // but keeping it might be better for UX. Let's keep it for now.
    }
  };

  const handleClearHighlight = () => {
    onUpdate(index, { selectionRanges: undefined });
  };

  // If text changes, we try to preserve ranges if they are before the change, 
  // but for simplicity and correctness, clearing highlights on text edit is safer.
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
    <div className="group relative flex gap-6 p-6 rounded-2xl bg-linear-to-br from-white/10 to-white/5 border border-white/30 shadow-2xl shadow-black/40 ring-1 ring-inset ring-white/10 hover:border-branding-primary/60 hover:shadow-branding-primary/10 hover:ring-branding-primary/20 transition-all duration-300">
      {/* Slide Preview */}
      <div 
        className="w-1/3 aspect-video rounded-lg overflow-hidden border border-white/5 relative bg-black cursor-pointer group/image"
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
              {slide.audioUrl ? 'Regenerate Audio' : 'Generate Audio'}
            </button>

            {slide.audioUrl && (
              <button
                onClick={togglePlayback}
                disabled={isGenerating}
                className="flex items-center gap-2 px-6 py-2 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50 transition-all font-medium text-sm"
              >
                {isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                {isPlaying ? 'Stop Preview' : 'Preview Audio'}
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
  isGeneratingAudio 
}) => {
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);
  const [isBatchGenerating, setIsBatchGenerating] = React.useState(false);
  const [globalDelay, setGlobalDelay] = React.useState(0.5);

  const handleApplyGlobalDelay = () => {
    if (window.confirm(`Apply ${globalDelay}s delay to all ${slides.length} slides?`)) {
      slides.forEach((_, index) => {
        onUpdateSlide(index, { postAudioDelay: globalDelay });
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

      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Configure Slides</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 p-1 rounded-lg bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 px-2 border-r border-white/10 pr-3">
              <Clock className="w-3.5 h-3.5 text-white/40" />
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Delay All</span>
            </div>
            <input
              type="number"
              min="0"
              step="0.5"
              value={globalDelay}
              onChange={(e) => setGlobalDelay(parseFloat(e.target.value) || 0)}
              className="w-14 px-2 py-1 rounded bg-black/20 text-white text-xs text-center focus:ring-1 focus:ring-branding-primary outline-none border border-white/5"
            />
            <button
               onClick={handleApplyGlobalDelay}
               className="px-3 py-1 rounded hover:bg-white/10 text-branding-primary text-[10px] font-bold uppercase tracking-wider transition-colors"
               title="Apply to all slides"
            >
               Set
            </button>
          </div>

          <button
            onClick={handleResetAllHighlights}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all font-bold text-sm"
            title="Remove highlighting from all slides"
          >
            <Eraser className="w-4 h-4" />
            <span className="hidden lg:inline">Reset Highlights</span>
          </button>

          <button
            onClick={handleGenerateAll}
            disabled={isGeneratingAudio || isBatchGenerating || slides.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-branding-primary/10 text-branding-primary hover:bg-branding-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold text-sm"
          >
            <Wand2 className="w-4 h-4" />
            {isBatchGenerating ? 'Generating All...' : 'Generate All Audio'}
          </button>
          <div className="w-px h-6 bg-white/10" />
          <span className="text-sm text-white/40">{slides.length} slides ready</span>
        </div>
      </div>

      <div className="grid gap-6">
        {slides.map((slide, index) => (
          <SlideItem
             key={index}
             slide={slide}
             index={index}
             onUpdate={onUpdateSlide}
             onGenerate={onGenerateAudio}
             isGenerating={isGeneratingAudio || isBatchGenerating}
             onExpand={(i) => setPreviewIndex(prev => prev === i ? null : i)}
          />
        ))}
      </div>
    </div>
  );
};
