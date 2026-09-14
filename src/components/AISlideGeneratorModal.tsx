import React, { useEffect, useState } from 'react';
import { X, Sparkles, Loader2, Minus, Plus, Settings as SettingsIcon, AlertTriangle } from 'lucide-react';
import { useAISlideGeneration } from '../hooks/useAISlideGeneration';
import type { SlideTone } from '../services/slidesScriptService';
import type { GlobalSettings } from '../services/storage';
import type { SlideData } from '../types/slides';

interface AISlideGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerated: (slides: SlideData[]) => void;
  globalSettings?: GlobalSettings | null;
  onOpenSettings?: () => void;
}

const TONE_OPTIONS: { id: SlideTone; label: string }[] = [
  { id: 'professional', label: 'Professional' },
  { id: 'casual', label: 'Casual' },
  { id: 'educational', label: 'Educational' },
  { id: 'persuasive', label: 'Persuasive' },
  { id: 'storytelling', label: 'Storytelling' },
];

const MIN_SLIDES = 3;
const MAX_SLIDES = 15;
const DEFAULT_SLIDES = 7;

export const AISlideGeneratorModal: React.FC<AISlideGeneratorModalProps> = ({
  isOpen,
  onClose,
  onGenerated,
  globalSettings,
  onOpenSettings,
}) => {
  const [topic, setTopic] = useState('');
  const [slideCount, setSlideCount] = useState(DEFAULT_SLIDES);
  const [tone, setTone] = useState<SlideTone>('professional');
  const [error, setError] = useState<string | null>(null);

  const { generate, cancel, isBusy, busyLabel } = useAISlideGeneration(globalSettings);

  const useOpenAI = !!globalSettings?.useOpenAIForSlideGen;
  const isConfigured = useOpenAI
    ? !!(globalSettings?.openaiEndpoint && globalSettings?.openaiModel && globalSettings?.openaiApiKey)
    : !!globalSettings?.webLlmModel;

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Escape closes, matching every other dismissal path
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isBusy]);

  useEffect(() => {
    if (!isOpen) {
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!topic.trim() || isBusy) return;
    setError(null);
    try {
      const slides = await generate({ topic: topic.trim(), slideCount, tone });
      onGenerated(slides);
      onClose();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to generate slides. Please try again.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create slides"
        className="relative w-full max-w-xl bg-[#14161B] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh] origami-unfold"
      >
        {/* Header */}
        <div className="px-6 sm:px-8 pt-6 sm:pt-7 pb-5 border-b border-white/5 flex items-start justify-between gap-4">
          <div>
            <span className="block text-[11px] font-mono uppercase tracking-[0.2em] text-white/35 mb-2">
              AI slide generator
            </span>
            <h2 className="font-display text-2xl font-bold text-white mb-2 tracking-tight">
              Create slides
            </h2>
            <p className="text-sm text-white/55 max-w-md">
              Describe a topic and get a full deck — narration and all — without leaving the app.
            </p>
          </div>
          <button
            onClick={() => !isBusy && onClose()}
            aria-label="Close"
            disabled={isBusy}
            className="shrink-0 p-2 -mr-2 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 sm:px-8 py-5 sm:py-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
          {!isConfigured && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25">
              <AlertTriangle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
              <div className="space-y-2 flex-1 min-w-0">
                <p className="text-xs text-amber-100/90 leading-relaxed">
                  {useOpenAI
                    ? 'Your OpenAI-compatible endpoint isn’t fully set up yet — add an endpoint, model, and API key in Settings.'
                    : 'No local model is selected. Choose a WebLLM model, or switch on "Use for Slide Generation" with an OpenAI-compatible endpoint in Settings.'}
                </p>
                {onOpenSettings && (
                  <button
                    onClick={onOpenSettings}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-200 hover:text-amber-100"
                  >
                    <SettingsIcon className="w-3.5 h-3.5" />
                    Open Settings
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Topic</label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isBusy}
              placeholder="e.g. Quarterly sales results for the Northeast region"
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white placeholder-white/30 focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all resize-none disabled:opacity-50"
            />
          </div>

          <div className="flex gap-4">
            <div className="space-y-1 flex-1">
              <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Slides</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSlideCount((c) => Math.max(MIN_SLIDES, c - 1))}
                  disabled={isBusy || slideCount <= MIN_SLIDES}
                  className="p-2.5 rounded-lg bg-black/20 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-10 text-center text-sm font-bold text-white">{slideCount}</span>
                <button
                  onClick={() => setSlideCount((c) => Math.min(MAX_SLIDES, c + 1))}
                  disabled={isBusy || slideCount >= MAX_SLIDES}
                  className="p-2.5 rounded-lg bg-black/20 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-1 flex-2">
              <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Tone</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as SlideTone)}
                disabled={isBusy}
                className="w-full px-4 py-3 rounded-xl bg-black/20 border border-white/10 text-white focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all disabled:opacity-50"
              >
                {TONE_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id} className="bg-[#14161B]">{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {isBusy && (
            <div role="status" className="flex items-center gap-3 rounded-xl border border-cyan-400/25 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-100">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              {busyLabel || 'Working...'}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-200 leading-relaxed">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 py-4 border-t border-white/5 flex items-center justify-end gap-3">
          {isBusy ? (
            <button
              onClick={cancel}
              className="px-5 py-2.5 rounded-xl border border-white/15 text-white/70 hover:text-white hover:bg-white/5 text-sm font-bold transition-colors"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={!topic.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-branding-primary text-white font-extrabold text-sm shadow-lg shadow-branding-primary/30 hover:bg-branding-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Sparkles className="w-4 h-4" />
              Generate Deck
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
