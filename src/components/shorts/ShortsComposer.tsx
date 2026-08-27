import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Music, Captions, Type, Cpu, Play, Square, Loader2, Sparkles, PenLine, Camera, AudioLines, Wand2, Timer, Gauge, Frame, Palette, Mic, Image as ImageIcon, Film, ChevronDown, Clapperboard, Upload } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Dropdown } from '../Dropdown';
import { DEFAULT_VOICES, generateTTS } from '../../services/ttsService';
import { POLLINATIONS_IMAGE_MODELS } from '../../services/pollinationsService';
import { POLLINATIONS_VIDEO_MODELS } from '../../services/pollinationsVideoService';
import {
  ASPECT_OPTIONS,
  CAPTION_STYLES,
  DURATION_OPTIONS,
  TONE_OPTIONS,
  VISUAL_STYLES,
  type ShortsProject,
} from '../../services/shortsProject';
import type { ShortsAspect } from '../../services/ShortsVideoRenderer';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ShortsComposerProps {
  project: ShortsProject;
  onChange: (patch: Partial<ShortsProject>) => void;
  onGenerate: () => void;
  onPickMusic: () => void;
  onClearMusic: () => void;
  onUploadMusic: (file: File) => void;
  onOpenSettings: () => void;
  onOpenVoiceAudition?: () => void;
  isBusy: boolean;
  useOpenAI: boolean;
  onToggleOpenAI: (value: boolean) => void;
  openAIConfigured: boolean;
  webLlmModelLabel: string;
  /** Live Pollinations catalogue; falls back to the static list when omitted. */
  imageModels?: Array<{ id: string; name: string }>;
  videoModels?: Array<{ id: string; name: string }>;
}

/**
 * A single-open accordion bay. Exactly one department is expanded at a time,
 * so the panel reads as a guided flow never as a wall of controls. Each bay
 * carries a coloured icon plate so the section is recognisable at a glance.
 */
type Accent = 'cyan' | 'blue' | 'emerald' | 'amber' | 'violet';

const ACCENT: Record<Accent, { tile: string; border: string; active: string; strip: string }> = {
  cyan: { tile: 'bg-cyan-400/15 text-cyan-300 ring-cyan-400/30', border: 'border-cyan-400/25', active: 'border-cyan-400/50', strip: 'bg-cyan-300' },
  blue: { tile: 'bg-blue-400/15 text-blue-300 ring-blue-400/30', border: 'border-blue-400/25', active: 'border-blue-400/50', strip: 'bg-blue-300' },
  emerald: { tile: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30', border: 'border-emerald-400/25', active: 'border-emerald-400/50', strip: 'bg-emerald-300' },
  amber: { tile: 'bg-amber-400/15 text-amber-300 ring-amber-400/30', border: 'border-amber-400/25', active: 'border-amber-400/50', strip: 'bg-amber-300' },
  violet: { tile: 'bg-violet-400/15 text-violet-300 ring-violet-400/30', border: 'border-violet-400/25', active: 'border-violet-400/50', strip: 'bg-violet-200' },
};

type AccentTheme = {
  icon: string;
  chipActive: string;
  modeActive: string;
  modeFocus: string;
  toggleIcon: string;
  toggleFocus: string;
  toggleTrack: string;
  toggleKnob: string;
  ratioGlyph: string;
  ratioLabel: string;
  ratioHint: string;
  btnText: string;
  btnIcon: string;
  btnHover: string;
  range: string;
  chevronOpen: string;
};

const THEME: Record<Accent, AccentTheme> = {
  cyan: {
    icon: 'text-cyan-300/90', chipActive: 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200', modeActive: 'bg-cyan-400/15 text-cyan-200', modeFocus: 'outline-cyan-400', toggleIcon: 'text-cyan-300', toggleFocus: 'outline-cyan-400', toggleTrack: 'border-cyan-400/60 bg-cyan-400/25', toggleKnob: 'bg-cyan-300', ratioGlyph: 'border-cyan-300 bg-cyan-400/20', ratioLabel: 'text-cyan-100', ratioHint: 'text-cyan-300/90', btnText: 'text-cyan-300', btnIcon: 'text-cyan-400', btnHover: 'hover:border-cyan-400/40 hover:bg-cyan-500/15 hover:text-cyan-200', range: 'accent-cyan-400', chevronOpen: 'text-cyan-300',
  },
  blue: {
    icon: 'text-blue-300/90', chipActive: 'border-blue-400/60 bg-blue-400/10 text-blue-200', modeActive: 'bg-blue-400/15 text-blue-200', modeFocus: 'outline-blue-400', toggleIcon: 'text-blue-300', toggleFocus: 'outline-blue-400', toggleTrack: 'border-blue-400/60 bg-blue-400/25', toggleKnob: 'bg-blue-300', ratioGlyph: 'border-blue-300 bg-blue-400/20', ratioLabel: 'text-blue-100', ratioHint: 'text-blue-300/90', btnText: 'text-blue-300', btnIcon: 'text-blue-400', btnHover: 'hover:border-blue-400/40 hover:bg-blue-500/15 hover:text-blue-200', range: 'accent-blue-400', chevronOpen: 'text-blue-300',
  },
  emerald: {
    icon: 'text-emerald-300/90', chipActive: 'border-emerald-400/60 bg-emerald-400/10 text-emerald-200', modeActive: 'bg-emerald-400/15 text-emerald-200', modeFocus: 'outline-emerald-400', toggleIcon: 'text-emerald-300', toggleFocus: 'outline-emerald-400', toggleTrack: 'border-emerald-400/60 bg-emerald-400/25', toggleKnob: 'bg-emerald-300', ratioGlyph: 'border-emerald-300 bg-emerald-400/20', ratioLabel: 'text-emerald-100', ratioHint: 'text-emerald-300/90', btnText: 'text-emerald-300', btnIcon: 'text-emerald-400', btnHover: 'hover:border-emerald-400/40 hover:bg-emerald-500/15 hover:text-emerald-200', range: 'accent-emerald-400', chevronOpen: 'text-emerald-300',
  },
  amber: {
    icon: 'text-amber-300/90', chipActive: 'border-amber-400/60 bg-amber-400/10 text-amber-200', modeActive: 'bg-amber-400/15 text-amber-200', modeFocus: 'outline-amber-400', toggleIcon: 'text-amber-300', toggleFocus: 'outline-amber-400', toggleTrack: 'border-amber-400/60 bg-amber-400/25', toggleKnob: 'bg-amber-300', ratioGlyph: 'border-amber-300 bg-amber-400/20', ratioLabel: 'text-amber-100', ratioHint: 'text-amber-300/90', btnText: 'text-amber-300', btnIcon: 'text-amber-400', btnHover: 'hover:border-amber-400/40 hover:bg-amber-500/15 hover:text-amber-200', range: 'accent-amber-400', chevronOpen: 'text-amber-300',
  },
  violet: {
    icon: 'text-violet-300/90', chipActive: 'border-violet-400/60 bg-violet-400/10 text-violet-200', modeActive: 'bg-violet-400/15 text-violet-200', modeFocus: 'outline-violet-400', toggleIcon: 'text-violet-300', toggleFocus: 'outline-violet-400', toggleTrack: 'border-violet-400/60 bg-violet-400/25', toggleKnob: 'bg-violet-300', ratioGlyph: 'border-violet-300 bg-violet-400/20', ratioLabel: 'text-violet-100', ratioHint: 'text-violet-300/90', btnText: 'text-violet-300', btnIcon: 'text-violet-400', btnHover: 'hover:border-violet-400/40 hover:bg-violet-500/15 hover:text-violet-200', range: 'accent-violet-400', chevronOpen: 'text-violet-300',
  },
};

const AccentContext = React.createContext<Accent>('cyan');
const useAccent = () => React.useContext(AccentContext);
const useAccentTheme = () => THEME[useAccent()];

/** Render-prop helper so inline JSX can pick up the current section's accent theme. */
const AccentTheme: React.FC<{ children: (theme: AccentTheme) => React.ReactNode }> = ({ children }) => (
  <>{children(THEME[useAccent()])}</>
);

const Department: React.FC<{
  id: string;
  label: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: Accent;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ id, label, subtitle, icon, accent = 'cyan', isOpen, onToggle, children }) => (
  <AccentContext.Provider value={accent}>
    <section
      className={cn(
        'overflow-hidden rounded-[6px] border shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.55)]',
        isOpen ? cn('bg-[#161a22]', ACCENT[accent].active) : cn('bg-[#12151c]', ACCENT[accent].border),
      )}
    >
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={`shorts-department-${id}`}
      onClick={onToggle}
      className={cn(
        'relative flex w-full items-center gap-3 px-4 py-4 text-left transition-colors focus-ring',
        isOpen
          ? cn('border-b', ACCENT[accent].border, 'bg-[linear-gradient(180deg,#212937,#181e2a)]')
          : 'border-b border-white/[0.08] bg-[linear-gradient(180deg,#171a20,#121419)] hover:bg-[linear-gradient(180deg,#1c2027,#14161b)]',
      )}
    >
      {isOpen && (
        <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px]', ACCENT[accent].strip)} />
      )}
      <span
        aria-hidden
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 transition-all',
          ACCENT[accent].tile,
          isOpen ? '' : 'opacity-55 saturate-[.55]',
        )}
      >
        {icon}
      </span>
      <span className={cn('shrink-0 text-[11px] font-bold uppercase tracking-[0.22em] transition-colors', isOpen ? 'text-white' : 'text-white/55')}>
        {label}
      </span>
      {subtitle && (
        <span className={cn('min-w-0 flex-1 truncate text-xs transition-colors', isOpen ? 'text-white/55' : 'text-white/30')}>
          <span className={cn('mr-1.5', isOpen ? 'text-white/40' : 'text-white/20')}>–</span>
          {subtitle}
        </span>
      )}
      <ChevronDown
        className={cn(
          'ml-auto h-4 w-4 shrink-0 transition-all duration-300',
          isOpen ? cn('rotate-180', THEME[accent].chevronOpen) : 'text-white/35',
        )}
      />
    </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-500 ease-in-out',
          isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div id={`shorts-department-${id}`} className="space-y-4 p-3.5 sm:p-4">
            {children}
          </div>
        </div>
      </div>
    </section>
    </AccentContext.Provider>
);

const Field: React.FC<{ label: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  label,
  icon,
  children,
  className,
}) => (
  <div className={className}>
    <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-white/70">
      {icon && <span className={THEME[useAccent()].icon}>{icon}</span>}
      {label}
    </span>
    {children}
  </div>
);

const Chip: React.FC<{
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ active, onClick, disabled, className, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={active}
    className={cn(
      'focus-ring rounded-lg border px-3.5 py-2 text-sm transition-colors',
      active
        ? cn('font-semibold', THEME[useAccent()].chipActive)
        : 'border-white/20 bg-white/[0.07] font-semibold text-white/90 hover:border-white/40 hover:text-white',
      disabled && 'cursor-not-allowed opacity-40',
      className,
    )}
  >
    {children}
  </button>
);

/**
 * Two mutually exclusive modes rendered as one track, so the pair reads as a
 * switch. Real radio inputs rather than buttons: arrow-key navigation between
 * the options then comes from the browser instead of hand-rolled ARIA.
 */
const ModeSwitch: React.FC<{
  name: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
  fullWidth?: boolean;
}> = ({ name, options, value, onChange, disabled, label, fullWidth }) => (
  <fieldset
    disabled={disabled}
    className={cn(
      'inline-flex rounded-lg border border-white/10 bg-black/20 p-1',
      fullWidth && 'flex w-full',
      disabled && 'opacity-40',
    )}
  >
    <legend className="sr-only">{label}</legend>
    {options.map((option) => (
      <label
        key={option.value}
        className={cn(
          'cursor-pointer rounded-md px-3.5 py-1.5 text-sm transition-colors',
          fullWidth && 'flex-1 text-center',
          `has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:${THEME[useAccent()].modeFocus}`,
          value === option.value
            ? cn('font-semibold', THEME[useAccent()].modeActive)
            : 'font-medium text-white/80 hover:text-white',
          disabled && 'cursor-not-allowed',
        )}
      >
        <input
          type="radio"
          name={name}
          value={option.value}
          checked={value === option.value}
          onChange={() => onChange(option.value)}
          className="sr-only"
        />
        {option.label}
      </label>
    ))}
  </fieldset>
);

const Toggle: React.FC<{
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  title: string;
  description?: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}> = ({ checked, onChange, disabled, title, description, icon, children }) => {
  const theme = useAccentTheme();
  return (
  <div
    className={cn(
      'rounded-xl border p-4 transition-colors',
      checked ? 'border-white/25 bg-white/[0.08]' : 'border-white/15 bg-white/[0.05]',
    )}
  >
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className={checked ? theme.toggleIcon : 'text-white/55'}>{icon}</span>
          {title}
        </span>
        {description && (
          <span className="mt-1 block text-xs leading-relaxed text-white/55">{description}</span>
        )}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors',
          `peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:${theme.toggleFocus}`,
          checked ? theme.toggleTrack : 'border-white/15 bg-white/5',
          disabled && 'opacity-40',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all',
            checked ? cn('left-[18px]', theme.toggleKnob) : 'left-[3px] bg-white/40',
          )}
        />
      </span>
    </label>
    {children}
  </div>
  );
};

const Notice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2 text-xs leading-relaxed text-amber-200/90">
    {children}
  </p>
);

/** A self-contained control with its own frame, so controls align into a tidy grid. */
const ControlCard: React.FC<{
  label: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ label, icon, className, children }) => (
  <div className={cn('rounded-lg border border-white/12 bg-white/[0.04] p-3.5', className)}>
    <span className="mb-2.5 flex items-center gap-1.5 text-xs font-medium text-white/70">
      {icon && <span className={THEME[useAccent()].icon}>{icon}</span>}
      {label}
    </span>
    {children}
  </div>
);

/** Proportional glyph so the aspect chips show their shape, not just name it. */
const ratioGlyph: Record<ShortsAspect, string> = {
  '9:16': 'h-4 w-[9px]',
  '16:9': 'h-[9px] w-4',
  '1:1': 'h-3.5 w-3.5',
};

export const ShortsComposer: React.FC<ShortsComposerProps> = ({
  project,
  onChange,
  onGenerate,
  onPickMusic,
  onClearMusic,
  onUploadMusic,
  onOpenSettings,
  onOpenVoiceAudition,
  isBusy,
  useOpenAI,
  onToggleOpenAI,
  openAIConfigured,
  webLlmModelLabel,
  imageModels,
  videoModels,
}) => {
  const canGenerate = project.topic.trim().length > 2 && !isBusy;
  const isVideo = project.generationMode === 'video';
  const resolvedImageModels = imageModels ?? POLLINATIONS_IMAGE_MODELS;
  const resolvedVideoModels = videoModels ?? POLLINATIONS_VIDEO_MODELS;

  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isPreviewGenerating, setIsPreviewGenerating] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());
  const musicUploadInputRef = useRef<HTMLInputElement | null>(null);

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadMusic(file);
    }
    // Reset so selecting the same file again still fires onChange.
    e.target.value = '';
  };

  // Single-open accordion: exactly one department is expanded at a time,
  // starting with the script (Topic) so the flow opens short and friendly.
  const [openSection, setOpenSection] = useState<string>('topic');

  const stopVoicePreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setIsPreviewPlaying(false);
  }, []);

  useEffect(() => {
    return () => {
      stopVoicePreview();
    };
  }, [stopVoicePreview]);

  const handleToggleInlineVoicePreview = async () => {
    if (isPreviewPlaying) {
      stopVoicePreview();
      return;
    }

    const voice = project.voice || 'af_heart';
    const sampleText = "Hello! This is a sample preview of how my voice will sound in your video shorts.";
    const cacheKey = `${voice}:${sampleText}`;
    const cachedUrl = previewCacheRef.current.get(cacheKey);

    if (cachedUrl) {
      try {
        const audio = new Audio(cachedUrl);
        previewAudioRef.current = audio;
        audio.onended = () => {
          setIsPreviewPlaying(false);
          previewAudioRef.current = null;
        };
        audio.onerror = () => {
          setIsPreviewPlaying(false);
          previewAudioRef.current = null;
        };
        setIsPreviewPlaying(true);
        await audio.play();
      } catch (err) {
        console.error('Audio play error', err);
        setIsPreviewPlaying(false);
      }
      return;
    }

    try {
      setIsPreviewGenerating(true);
      const audioUrl = await generateTTS(sampleText, {
        voice,
        speed: 1.0,
        pitch: 1.0,
      });
      previewCacheRef.current.set(cacheKey, audioUrl);
      setIsPreviewGenerating(false);

      const audio = new Audio(audioUrl);
      previewAudioRef.current = audio;
      audio.onended = () => {
        setIsPreviewPlaying(false);
        previewAudioRef.current = null;
      };
      audio.onerror = () => {
        setIsPreviewPlaying(false);
        previewAudioRef.current = null;
      };
      setIsPreviewPlaying(true);
      await audio.play();
    } catch (err) {
      console.error('Inline voice preview error', err);
      setIsPreviewGenerating(false);
      setIsPreviewPlaying(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-black/80 bg-[linear-gradient(180deg,#101318_0%,#07080b_60%,#0a0b0e_100%)] shadow-[0_35px_70px_-25px_rgba(0,0,0,0.95)]">
      <div
        aria-hidden
        className="h-2.5 border-b border-black/70 bg-[#0a0c10]"
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0 1px, transparent 1px 4px)' }}
      />
      <div
        className="grid gap-2 bg-[#020304]/95 p-2.5 sm:p-3"
        style={{ boxShadow: 'inset 0 4px 16px rgba(0,0,0,0.8)' }}
      >
      {/* --- Script ---------------------------------------------------------- */}
      <Department
        id="topic"
        label="Topic"
        subtitle="describe your short video"
        accent="cyan"
        icon={<PenLine className="h-4 w-4" />}
        isOpen={openSection === 'topic'}
        onToggle={() => setOpenSection('topic')}
      >
        <div className="relative">
          <textarea
            value={project.topic}
            onChange={(e) => onChange({ topic: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canGenerate) onGenerate();
            }}
            rows={4}
            disabled={isBusy}
            aria-label="Topic for your short"
            placeholder="e.g. Why octopuses have three hearts — and what that means for how they move"
            className="focus-ring w-full resize-none rounded-2xl border border-white/[0.14] bg-white/[0.06] p-5 pb-9 text-base leading-relaxed text-white outline-none backdrop-blur-md transition-colors placeholder:text-white/25 focus:border-white/25 disabled:opacity-50"
          />
          {project.topic.trim().length > 2 && (
            <span className="pointer-events-none absolute bottom-3.5 right-4 text-[11px] text-white/25">
              Ctrl+Enter to generate
            </span>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
          <Field label="Target length" icon={<Timer className="h-3.5 w-3.5" />}>
            <div className="flex flex-wrap gap-2">
              {DURATION_OPTIONS.map((seconds) => (
                <Chip
                  key={seconds}
                  active={project.targetDurationSec === seconds}
                  onClick={() => onChange({ targetDurationSec: seconds })}
                  disabled={isBusy}
                >
                  <span className="tabular-nums">{seconds}s</span>
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="Tone" icon={<Gauge className="h-3.5 w-3.5" />}>
            <Dropdown
              options={TONE_OPTIONS.map((t) => ({ id: t.id, name: t.name }))}
              value={project.tone}
              onChange={(value) => onChange({ tone: value as ShortsProject['tone'] })}
              disabled={isBusy}
            />
          </Field>
        </div>
      </Department>

      {/* --- Camera ---------------------------------------------------------- */}
      <Department
        id="camera"
        label="Camera"
        subtitle="customize your visuals"
        accent="blue"
        icon={<Camera className="h-4 w-4" />}
        isOpen={openSection === 'camera'}
        onToggle={() => setOpenSection('camera')}
      >
        <div className="space-y-3">
          <ControlCard label="Visual source" icon={<Clapperboard className="h-3.5 w-3.5" />}>
            <ModeSwitch
              fullWidth
              name="shorts-visual-source"
              label="Visual source"
              value={project.generationMode}
              onChange={(value) => onChange({ generationMode: value as ShortsProject['generationMode'] })}
              disabled={isBusy}
              options={[
                { value: 'image', label: 'Stills' },
                { value: 'video', label: 'Clips' },
              ]}
            />
          </ControlCard>

          {isVideo && <Notice>Clips cost more and take longer than stills.</Notice>}

          <ControlCard label="Frame" icon={<Frame className="h-3.5 w-3.5" />}>
            <AccentTheme>
              {(theme) => (
                <div className="grid gap-2 sm:grid-cols-3">
                  {ASPECT_OPTIONS.map((option) => {
                    const isActive = project.aspect === option.id;
                    return (
                      <Chip
                        key={option.id}
                        active={isActive}
                        onClick={() => onChange({ aspect: option.id })}
                        disabled={isBusy}
                        className="w-full"
                      >
                        <span className="flex items-center justify-center gap-2.5">
                          <span
                            aria-hidden
                            className={cn(
                              'shrink-0 rounded-[2px] border transition-colors',
                              ratioGlyph[option.id],
                              isActive ? theme.ratioGlyph : 'border-white/50 bg-white/5',
                            )}
                          />
                          <span className="text-left">
                            <span className={cn('block leading-tight font-semibold', isActive ? theme.ratioLabel : 'text-white')}>
                              {option.label}
                            </span>
                            <span className={cn('block text-[11px] font-medium tabular-nums mt-0.5 transition-colors', isActive ? theme.ratioHint : 'text-white/70')}>
                              {option.hint}
                            </span>
                          </span>
                        </span>
                      </Chip>
                    );
                  })}
                </div>
              )}
            </AccentTheme>
          </ControlCard>

          <div className="grid gap-3 sm:grid-cols-2">
            <ControlCard label="Style" icon={<Palette className="h-3.5 w-3.5" />}>
              <Dropdown
                options={VISUAL_STYLES.map((s) => ({ id: s.prompt, name: s.name }))}
                value={project.visualStyle}
                onChange={(value) => onChange({ visualStyle: value })}
                disabled={isBusy}
              />
            </ControlCard>
            <ControlCard
              label={isVideo ? 'Video model' : 'Image model'}
              icon={isVideo ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
            >
              {isVideo ? (
                <Dropdown
                  options={resolvedVideoModels.map((m) => ({ id: m.id, name: m.name }))}
                  value={project.videoModel}
                  onChange={(value) => onChange({ videoModel: value })}
                  disabled={isBusy}
                />
              ) : (
                <Dropdown
                  options={resolvedImageModels.map((m) => ({ id: m.id, name: m.name }))}
                  value={project.imageModel}
                  onChange={(value) => onChange({ imageModel: value })}
                  disabled={isBusy}
                />
              )}
            </ControlCard>
          </div>
        </div>
      </Department>

      {/* --- Sound ----------------------------------------------------------- */}
      <Department
        id="sound"
        label="Sound"
        subtitle="voice & background music"
        accent="emerald"
        icon={<AudioLines className="h-4 w-4" />}
        isOpen={openSection === 'sound'}
        onToggle={() => setOpenSection('sound')}
      >
        <div className="space-y-3">
          <ControlCard label="Voice" icon={<Mic className="h-3.5 w-3.5" />}>
            <AccentTheme>
              {(theme) => (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <Dropdown
                        options={DEFAULT_VOICES.map((v) => ({ id: v.id, name: v.name }))}
                        value={project.voice}
                        onChange={(value) => {
                          stopVoicePreview();
                          onChange({ voice: value });
                        }}
                        disabled={isBusy}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleInlineVoicePreview}
                      disabled={isBusy || isPreviewGenerating}
                      className={cn(
                        'focus-ring flex shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-all',
                        isPreviewPlaying
                          ? 'border-emerald-400/50 bg-emerald-500 text-black shadow-lg shadow-emerald-500/25 animate-pulse'
                          : isPreviewGenerating
                          ? 'border-white/10 bg-white/5 text-white/40 cursor-not-allowed'
                          : cn('border-white/10 bg-white/[0.05]', theme.btnText, theme.btnHover),
                      )}
                      title={isPreviewPlaying ? 'Stop audio preview' : 'Quick preview voice'}
                    >
                      {isPreviewGenerating ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span className="hidden sm:inline">Loading...</span>
                        </>
                      ) : isPreviewPlaying ? (
                        <>
                          <Square className="h-3.5 w-3.5 fill-current" />
                          <span>Stop</span>
                        </>
                      ) : (
                        <>
                          <Play className={cn('h-3.5 w-3.5 fill-current', theme.btnIcon)} />
                          <span>Preview</span>
                        </>
                      )}
                    </button>
                  </div>

                  {onOpenVoiceAudition && (
                    <button
                      type="button"
                      onClick={() => {
                        stopVoicePreview();
                        onOpenVoiceAudition();
                      }}
                      disabled={isBusy}
                      className={cn(
                        'focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/20 bg-white/[0.04] py-1.5 text-xs font-medium text-white/85 transition-all disabled:opacity-40',
                        theme.btnHover,
                      )}
                    >
                      <Sparkles className={cn('h-3 w-3', theme.btnIcon)} />
                      Audition all voices
                    </button>
                  )}
                </div>
              )}
            </AccentTheme>
          </ControlCard>

          <ControlCard label="Music" icon={<Music className="h-3.5 w-3.5" />}>
            <input ref={musicUploadInputRef} type="file" accept="audio/*" className="hidden" onChange={handleMusicUpload} />
            {project.music ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Music className="h-3.5 w-3.5 shrink-0 text-white/50" />
                  <p className="min-w-0 flex-1 truncate text-xs text-white/85" title={project.music.fileName}>
                    {project.music.fileName}
                  </p>
                  <button
                    type="button"
                    onClick={onPickMusic}
                    disabled={isBusy}
                    className="focus-ring rounded px-1.5 py-0.5 text-xs text-white/50 transition-colors hover:text-white disabled:opacity-40"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => musicUploadInputRef.current?.click()}
                    disabled={isBusy}
                    className="focus-ring rounded px-1.5 py-0.5 text-xs text-white/50 transition-colors hover:text-white disabled:opacity-40"
                  >
                    Upload
                  </button>
                  <button
                    type="button"
                    onClick={onClearMusic}
                    disabled={isBusy}
                    className="focus-ring rounded px-1.5 py-0.5 text-xs text-white/50 transition-colors hover:text-red-300 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-[11px] text-white/35" htmlFor="shorts-music-volume">
                    Level
                  </label>
                  <AccentTheme>
                    {(theme) => (
                      <input
                        id="shorts-music-volume"
                        type="range"
                        min={0}
                        max={0.5}
                        step={0.01}
                        value={project.music!.volume}
                        onChange={(e) => onChange({ music: { ...project.music!, volume: Number(e.target.value) } })}
                        disabled={isBusy}
                        className={cn('focus-ring h-1 flex-1', theme.range)}
                      />
                    )}
                  </AccentTheme>
                  <span className="w-9 text-right text-xs tabular-nums text-white/50">
                    {Math.round(project.music.volume * 100)}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={onPickMusic}
                  disabled={isBusy}
                  className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-2.5 text-sm text-white/75 transition-colors hover:border-white/40 hover:text-white disabled:opacity-40"
                >
                  <Music className="h-3.5 w-3.5" />
                  Browse tracks
                </button>
                <button
                  type="button"
                  onClick={() => musicUploadInputRef.current?.click()}
                  disabled={isBusy}
                  className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 px-3 py-2.5 text-sm text-white/75 transition-colors hover:border-white/40 hover:text-white disabled:opacity-40"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload music
                </button>
              </div>
            )}
          </ControlCard>
        </div>
      </Department>

      {/* --- Finish ---------------------------------------------------------- */}
      <Department
        id="finish"
        label="Finish"
        subtitle="captions and title card"
        accent="amber"
        icon={<Wand2 className="h-4 w-4" />}
        isOpen={openSection === 'finish'}
        onToggle={() => setOpenSection('finish')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Toggle
            checked={project.captionsEnabled}
            onChange={(value) => onChange({ captionsEnabled: value })}
            disabled={isBusy}
            title="Captions"
            icon={<Captions className="h-4 w-4" />}
          >
            {project.captionsEnabled && (
              <div className="mt-3">
                <Dropdown
                  options={CAPTION_STYLES.map((s) => ({ id: s.id, name: s.name }))}
                  value={project.captionStyle}
                  onChange={(value) => onChange({ captionStyle: value as ShortsProject['captionStyle'] })}
                  disabled={isBusy}
                />
              </div>
            )}
          </Toggle>

          <Toggle
            checked={project.showTitleCard}
            onChange={(value) => onChange({ showTitleCard: value })}
            disabled={isBusy}
            title="Title card"
            icon={<Type className="h-4 w-4" />}
          />
        </div>
      </Department>

      {/* --- Engine ---------------------------------------------------------- */}
      <Department
        id="engine"
        label="Engine"
        subtitle="choose what writes the script"
        accent="violet"
        icon={<Cpu className="h-4 w-4" />}
        isOpen={openSection === 'engine'}
        onToggle={() => setOpenSection('engine')}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ModeSwitch
            name="shorts-script-engine"
            label="Script engine"
            value={useOpenAI ? 'api' : 'local'}
            onChange={(value) => onToggleOpenAI(value === 'api')}
            disabled={isBusy}
            options={[
              { value: 'local', label: 'On device' },
              { value: 'api', label: 'API endpoint' },
            ]}
          />
          {!useOpenAI && (
            <AccentTheme>
              {(theme) => (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  title="Change model in Settings"
                  className={cn(
                    'focus-ring flex items-center gap-2 rounded-md border border-white/15 bg-white/[0.05] px-2.5 py-1.5 text-xs font-medium text-white/80 transition-colors hover:text-white',
                    theme.btnHover,
                  )}
                >
                  <Cpu className={cn('h-3.5 w-3.5', theme.btnText)} />
                  <span className="max-w-[180px] truncate">{webLlmModelLabel}</span>
                </button>
              )}
            </AccentTheme>
          )}
        </div>

        {useOpenAI && !openAIConfigured && (
          <Notice>
            <span>
              No endpoint yet.{' '}
              <button
                type="button"
                onClick={onOpenSettings}
                className="focus-ring rounded font-semibold underline underline-offset-2"
              >
                Add a base URL, model and key
              </button>{' '}
              to use this option.
            </span>
          </Notice>
        )}
      </Department>
      </div>
    </div>
  );
};
