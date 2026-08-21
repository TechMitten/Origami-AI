import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Play, Square, Loader2, Volume2, Check, Sparkles, Mic, Radio } from 'lucide-react';
import { DEFAULT_VOICES, generateTTS } from '../../services/ttsService';

interface VoiceAuditionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoice: string;
  onSelectVoice: (voiceId: string) => void;
}

export interface VoiceMeta {
  id: string;
  name: string;
  category: 'all' | 'af' | 'am' | 'bf' | 'bm';
  accent: 'American' | 'British';
  gender: 'Female' | 'Male';
  flag: string;
  tag: string;
}

const PRESET_SAMPLE_TEXTS = [
  {
    label: 'Shorts Hook',
    text: "You won't believe what happens next in this story. Watch until the very end!",
  },
  {
    label: 'Natural Sample',
    text: "Hello! This is a sample of how my voice sounds in your video shorts.",
  },
  {
    label: 'Fast-Paced Tip',
    text: "Here are three simple tips to supercharge your workflow starting today.",
  },
  {
    label: 'Dramatic Narrative',
    text: "Deep in the digital realm, a new kind of intelligence was about to awaken.",
  },
];

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All Voices', count: 28 },
  { id: 'af', label: '🇺🇸 US Female', count: 11 },
  { id: 'am', label: '🇺🇸 US Male', count: 9 },
  { id: 'bf', label: '🇬🇧 British Female', count: 4 },
  { id: 'bm', label: '🇬🇧 British Male', count: 4 },
] as const;

export const VOICE_METADATA: VoiceMeta[] = DEFAULT_VOICES.map((voice) => {
  let category: 'af' | 'am' | 'bf' | 'bm' = 'af';
  let accent: 'American' | 'British' = 'American';
  let gender: 'Female' | 'Male' = 'Female';
  let flag = '🇺🇸';

  if (voice.id.startsWith('af_')) {
    category = 'af';
    accent = 'American';
    gender = 'Female';
    flag = '🇺🇸';
  } else if (voice.id.startsWith('am_')) {
    category = 'am';
    accent = 'American';
    gender = 'Male';
    flag = '🇺🇸';
  } else if (voice.id.startsWith('bf_')) {
    category = 'bf';
    accent = 'British';
    gender = 'Female';
    flag = '🇬🇧';
  } else if (voice.id.startsWith('bm_')) {
    category = 'bm';
    accent = 'British';
    gender = 'Male';
    flag = '🇬🇧';
  }

  return {
    id: voice.id,
    name: voice.name,
    category,
    accent,
    gender,
    flag,
    tag: `${accent} ${gender}`,
  };
});

export const VoiceAuditionModal: React.FC<VoiceAuditionModalProps> = ({
  isOpen,
  onClose,
  selectedVoice,
  onSelectVoice,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sampleText, setSampleText] = useState(PRESET_SAMPLE_TEXTS[0].text);
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Cache generated audio URLs: key is `${voiceId}:${sampleText}`
  const audioCacheRef = useRef<Map<string, string>>(new Map());

  const stopCurrentAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingVoiceId(null);
  }, []);

  // Cleanup on unmount or when modal closes
  useEffect(() => {
    if (!isOpen) {
      stopCurrentAudio();
      setLoadingVoiceId(null);
      setErrorNotice(null);
    }
  }, [isOpen, stopCurrentAudio]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handlePlayVoice = async (voiceId: string) => {
    if (playingVoiceId === voiceId) {
      stopCurrentAudio();
      return;
    }

    stopCurrentAudio();
    setErrorNotice(null);

    const cacheKey = `${voiceId}:${sampleText.trim()}`;
    const cachedUrl = audioCacheRef.current.get(cacheKey);

    if (cachedUrl) {
      try {
        const audio = new Audio(cachedUrl);
        audioRef.current = audio;
        audio.onended = () => {
          setPlayingVoiceId(null);
          audioRef.current = null;
        };
        audio.onerror = () => {
          setPlayingVoiceId(null);
          audioRef.current = null;
          setErrorNotice('Playback failed. Please try again.');
        };
        setPlayingVoiceId(voiceId);
        await audio.play();
      } catch (err) {
        console.error('Audio playback error', err);
        setPlayingVoiceId(null);
        setErrorNotice('Could not play audio. Please interact with the page first.');
      }
      return;
    }

    try {
      setLoadingVoiceId(voiceId);
      const textToSpeak = sampleText.trim() || PRESET_SAMPLE_TEXTS[0].text;
      const audioUrl = await generateTTS(textToSpeak, {
        voice: voiceId,
        speed: 1.0,
        pitch: 1.0,
      });

      audioCacheRef.current.set(cacheKey, audioUrl);
      setLoadingVoiceId(null);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingVoiceId(null);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setPlayingVoiceId(null);
        audioRef.current = null;
        setErrorNotice('Failed to play audio.');
      };
      setPlayingVoiceId(voiceId);
      await audio.play();
    } catch (err) {
      console.error('TTS Generation failed', err);
      setLoadingVoiceId(null);
      setPlayingVoiceId(null);
      setErrorNotice(err instanceof Error ? err.message : 'Failed to generate voice preview.');
    }
  };

  const filteredVoices = useMemo(() => {
    return VOICE_METADATA.filter((voice) => {
      const matchesCategory = activeCategory === 'all' || voice.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        voice.name.toLowerCase().includes(q) ||
        voice.id.toLowerCase().includes(q) ||
        voice.tag.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, searchQuery]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border border-white/15 bg-[#121316] text-white shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
                Audition TTS Voices
                <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30">
                  Kokoro 28 Voices
                </span>
              </h2>
              <p className="text-xs text-white/50">
                Preview and compare on-device voices before generating scene voiceovers
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Controls: Search & Presets */}
        <div className="p-6 pb-3 border-b border-white/10 space-y-4 shrink-0 bg-white/[0.01]">
          {/* Sample Text Input & Presets */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> Test Sentence / Preview Script
              </label>
              <span className="text-[10px] text-white/30">Used for generating sample audio</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={sampleText}
                onChange={(e) => {
                  setSampleText(e.target.value);
                  stopCurrentAudio();
                }}
                placeholder="Type a sample sentence to test..."
                className="flex-1 px-4 py-2 rounded-xl bg-black/40 border border-white/10 text-white text-xs sm:text-sm focus:outline-none focus:border-cyan-400/50 transition-colors"
              />
            </div>
            {/* Preset chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-semibold text-white/40 mr-1">Presets:</span>
              {PRESET_SAMPLE_TEXTS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setSampleText(preset.text);
                    stopCurrentAudio();
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                    sampleText === preset.text
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                      : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/5'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Search and Category Filter Tabs */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between pt-1">
            {/* Category tabs */}
            <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/10">
              {CATEGORY_FILTERS.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeCategory === cat.id
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/30 shadow-sm'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {cat.label}
                  <span className="ml-1.5 opacity-60 text-[10px]">({cat.count})</span>
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search voices..."
                className="w-full pl-8 pr-4 py-1.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs placeholder:text-white/30 focus:outline-none focus:border-cyan-400/50 transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-xs"
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Error notification banner if any */}
        {errorNotice && (
          <div className="px-6 py-2 bg-red-500/10 border-b border-red-500/20 text-red-300 text-xs flex items-center justify-between">
            <span>{errorNotice}</span>
            <button type="button" onClick={() => setErrorNotice(null)} className="text-white/40 hover:text-white">
              &times;
            </button>
          </div>
        )}

        {/* Voices Grid */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {filteredVoices.length === 0 ? (
            <div className="py-12 text-center text-white/40 space-y-2">
              <Mic className="w-8 h-8 mx-auto opacity-40" />
              <p className="text-sm">No voices found matching "{searchQuery}".</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('all');
                }}
                className="text-xs text-cyan-400 hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredVoices.map((voice) => {
                const isSelected = selectedVoice === voice.id;
                const isPlaying = playingVoiceId === voice.id;
                const isLoading = loadingVoiceId === voice.id;

                return (
                  <div
                    key={voice.id}
                    className={`relative p-3.5 rounded-2xl border transition-all duration-200 flex flex-col justify-between gap-3 ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-400/50 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                        : 'bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
                  >
                    {/* Top Row: Info & Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-sm">{voice.flag}</span>
                          <span className="font-bold text-sm text-white truncate" title={voice.name}>
                            {voice.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/10 text-white/70">
                            {voice.tag}
                          </span>
                          {voice.id === 'af_heart' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-400/15 text-amber-300 border border-amber-400/25">
                              Default
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Selected Indicator */}
                      {isSelected && (
                        <div className="px-2 py-0.5 rounded-full bg-cyan-400 text-black text-[10px] font-bold flex items-center gap-1 shrink-0">
                          <Check className="w-3 h-3 stroke-[3]" /> Active
                        </div>
                      )}
                    </div>

                    {/* Bottom Row: Preview Button & Select Action */}
                    <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                      {/* Play Preview Button */}
                      <button
                        type="button"
                        onClick={() => handlePlayVoice(voice.id)}
                        disabled={isLoading}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all ${
                          isPlaying
                            ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/25 animate-pulse'
                            : isLoading
                            ? 'bg-white/10 text-white/40 cursor-not-allowed'
                            : 'bg-white/10 hover:bg-white/20 text-white border border-white/10 hover:border-white/20'
                        }`}
                        title={isPlaying ? 'Stop audio' : 'Preview voice sample'}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Generating...</span>
                          </>
                        ) : isPlaying ? (
                          <>
                            <Square className="w-3 h-3 fill-current" />
                            <span>Stop</span>
                            {/* Equalizer animation */}
                            <span className="flex items-end gap-0.5 h-3 ml-1">
                              <span className="w-0.5 h-2 bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="w-0.5 h-3 bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                              <span className="w-0.5 h-1.5 bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                            </span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current text-cyan-400" />
                            <span>Preview</span>
                          </>
                        )}
                      </button>

                      {/* Select Voice Button */}
                      {!isSelected ? (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectVoice(voice.id);
                            stopCurrentAudio();
                          }}
                          className="px-3 py-2 rounded-xl bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-200 border border-white/10 hover:border-cyan-400/40 text-xs font-semibold text-white/80 transition-all active:scale-95 shrink-0"
                        >
                          Use Voice
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="px-3 py-2 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-xs font-semibold text-cyan-300 opacity-60 cursor-default shrink-0"
                        >
                          Selected
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 shrink-0 bg-white/[0.02]">
          <div className="text-xs text-white/50 flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-cyan-400" />
            <span>
              Active voice: <strong className="text-white">{VOICE_METADATA.find((v) => v.id === selectedVoice)?.name || selectedVoice}</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-white/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
