import React from 'react';
import { Volume2, Wand2 } from 'lucide-react';
import type { RenderedPage } from '../services/pdfService';
import { AVAILABLE_VOICES } from '../services/ttsService';

export interface SlideData extends RenderedPage {
  script: string;
  audioUrl?: string;
  duration?: number;
  transition: 'fade' | 'slide' | 'zoom' | 'none';
  voice: string;
}

interface SlideEditorProps {
  slides: SlideData[];
  onUpdateSlide: (index: number, data: Partial<SlideData>) => void;
  onGenerateAudio: (index: number) => Promise<void>;
  isGeneratingAudio: boolean;
}

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
          <div 
            key={index} 
            className="group relative flex gap-6 p-6 rounded-2xl bg-branding-surface border border-white/10 hover:border-branding-primary/30 transition-all duration-300"
          >
            {/* Slide Preview */}
            <div className="w-1/3 aspect-video rounded-lg overflow-hidden border border-white/5 relative">
              <img 
                src={slide.dataUrl} 
                alt={`Slide ${index + 1}`} 
                className="w-full h-full object-cover"
              />
              <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-[10px] font-bold uppercase tracking-wider">
                Slide {index + 1}
              </div>
            </div>

            {/* Editing Controls */}
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Script (TTS Text)</label>
                <textarea
                  value={slide.script}
                  onChange={(e) => onUpdateSlide(index, { script: e.target.value })}
                  className="w-full h-32 px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-branding-primary focus:ring-1 focus:ring-branding-primary transition-all text-sm resize-none outline-none"
                  placeholder="Enter the text for this slide..."
                />
              </div>

              <div className="flex items-center gap-6">
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Voice</label>
                  <select
                    value={slide.voice}
                    onChange={(e) => onUpdateSlide(index, { voice: e.target.value })}
                    className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm outline-none cursor-pointer"
                  >
                    {AVAILABLE_VOICES.map(v => (
                      <option key={v.id} value={v.id} className="bg-branding-surface">{v.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 space-y-2">
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Transition</label>
                  <select
                    value={slide.transition}
                    onChange={(e) => onUpdateSlide(index, { transition: e.target.value as SlideData['transition'] })}
                    className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm outline-none cursor-pointer"
                  >
                    <option value="fade" className="bg-branding-surface">Fade</option>
                    <option value="slide" className="bg-branding-surface">Slide</option>
                    <option value="zoom" className="bg-branding-surface">Zoom</option>
                    <option value="none" className="bg-branding-surface">None</option>
                  </select>
                </div>

                <div className="pt-6">
                   <button
                    onClick={() => onGenerateAudio(index)}
                    disabled={isGeneratingAudio || !slide.script.trim()}
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
        ))}
      </div>
    </div>
  );
};
