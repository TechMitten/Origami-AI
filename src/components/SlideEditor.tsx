import React, { useRef } from 'react';
import { Volume2, Wand2, X } from 'lucide-react';
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
  isGenerating 
}: { 
  slide: SlideData, 
  index: number, 
  onUpdate: (i: number, d: Partial<SlideData>) => void, 
  onGenerate: (i: number) => Promise<void>, 
  isGenerating: boolean 
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);


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
    <div className="group relative flex gap-6 p-6 rounded-2xl bg-branding-surface border border-white/10 hover:border-branding-primary/30 transition-all duration-300">
      {/* Slide Preview */}
      <div className="w-1/3 aspect-video rounded-lg overflow-hidden border border-white/5 relative bg-black">
        <img 
          src={slide.dataUrl} 
          alt={`Slide ${index + 1}`} 
          className="w-full h-full object-contain"
        />
        <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-[10px] font-bold uppercase tracking-wider">
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

          <div className="pt-6">
             <button
              onClick={() => onGenerate(index)}
              disabled={isGenerating || !slide.script.trim()}
              className="flex items-center gap-2 px-6 py-2 rounded-lg bg-branding-primary/10 text-branding-primary hover:bg-branding-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium text-sm"
            >
              {slide.audioUrl ? <Volume2 className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
              {slide.audioUrl ? 'Regenerate Audio' : 'Generate Audio'}
            </button>
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
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Configure Slides</h2>
        <div className="flex items-center gap-4">
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
             isGenerating={isGeneratingAudio}
          />
        ))}
      </div>
    </div>
  );
};
