import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Music, Captions, Type, Cpu, Cloud, Play, Square, Loader2, Sparkles } from 'lucide-react';
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
 * A department of the shoot. The rule running out of the label is the divider —
 * these groups replace what used to be eight identically-weighted cards.
 */
const Department: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <section className="space-y-4">
    <div className="flex items-baseline gap-3">
      <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">{label}</h2>
      {hint && <span className="shrink-0 text-[11px] text-white/25">{hint}</span>}
      <span className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent" />
    </div>
    {children}
  </section>
);

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({
  label,
  children,
  className,
}) => (
  <div className={className}>
    <span className="mb-1.5 block text-xs font-medium text-white/45">{label}</span>
    {children}
  </div>
);

const Chip: React.FC<{
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ active, onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-pressed={active}
    className={cn(
      'focus-ring rounded-lg border px-3.5 py-2 text-sm transition-colors',
      active
        ? 'border-cyan-400/60 bg-cyan-400/10 font-semibold text-cyan-200'
        : 'border-white/10 bg-white/[0.03] font-medium text-white/65 hover:border-white/25 hover:text-white',
      disabled && 'cursor-not-allowed opacity-40',
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
}> = ({ name, options, value, onChange, disabled, label }) => (
  <fieldset
    disabled={disabled}
    className={cn(
      'inline-flex rounded-lg border border-white/10 bg-black/20 p-1',
      disabled && 'opacity-40',
    )}
  >
    <legend className="sr-only">{label}</legend>
    {options.map((option) => (
      <label
        key={option.value}
        className={cn(
          'cursor-pointer rounded-md px-3.5 py-1.5 text-sm transition-colors',
          'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cyan-400',
          value === option.value
            ? 'bg-cyan-400/15 font-semibold text-cyan-200'
            : 'font-medium text-white/50 hover:text-white',
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
  description: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}> = ({ checked, onChange, disabled, title, description, icon, children }) => (
  <div
    className={cn(
      'rounded-xl border p-4 transition-colors',
      checked ? 'border-white/[0.14] bg-white/[0.05]' : 'border-white/[0.08] bg-white/[0.02]',
    )}
  >
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className={checked ? 'text-cyan-300' : 'text-white/30'}>{icon}</span>
          {title}
        </span>
        <span className="mt-1 block text-xs leading-relaxed text-white/40">{description}</span>
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
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-400',
          checked ? 'border-cyan-400/60 bg-cyan-400/25' : 'border-white/15 bg-white/5',
          disabled && 'opacity-40',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full transition-all',
            checked ? 'left-[18px] bg-cyan-300' : 'left-[3px] bg-white/40',
          )}
        />
      </span>
    </label>
    {children}
  </div>
);

const Notice: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2 text-xs leading-relaxed text-amber-200/90">
    {children}
  </p>
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
    <div className="space-y-9">
      {/* --- Script ---------------------------------------------------------- */}
      <Department label="Topic">
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
          <Field label="Target length">
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

          <Field label="Narration tone">
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
      <Department label="Camera" hint="what is in frame">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-sm leading-relaxed text-white/45">
            {isVideo
              ? 'Each scene becomes a short generated clip.'
              : 'Each scene becomes a still, panned and zoomed on screen.'}
          </p>
          <ModeSwitch
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
        </div>

        {isVideo && <Notice>Clips take longer to generate and cost more per scene than stills.</Notice>}

        <Field label="Frame">
          <div className="flex flex-wrap gap-2">
            {ASPECT_OPTIONS.map((option) => {
              const isActive = project.aspect === option.id;
              return (
                <Chip
                  key={option.id}
                  active={isActive}
                  onClick={() => onChange({ aspect: option.id })}
                  disabled={isBusy}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className={cn(
                        'shrink-0 rounded-[2px] border transition-colors',
                        ratioGlyph[option.id],
                        isActive ? 'border-cyan-300 bg-cyan-400/20' : 'border-white/50 bg-white/5',
                      )}
                    />
                    <span className="text-left">
                      <span className={cn('block leading-tight font-semibold', isActive ? 'text-cyan-100' : 'text-white')}>
                        {option.label}
                      </span>
                      <span className={cn('block text-[11px] font-medium tabular-nums mt-0.5 transition-colors', isActive ? 'text-cyan-300/90' : 'text-white/70')}>
                        {option.hint}
                      </span>
                    </span>
                  </span>
                </Chip>
              );
            })}
          </div>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Visual style">
            <Dropdown
              options={VISUAL_STYLES.map((s) => ({ id: s.prompt, name: s.name }))}
              value={project.visualStyle}
              onChange={(value) => onChange({ visualStyle: value })}
              disabled={isBusy}
            />
          </Field>
          <Field label={isVideo ? 'Video model' : 'Image model'}>
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
          </Field>
        </div>
      </Department>

      {/* --- Sound ----------------------------------------------------------- */}
      <Department label="Sound">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Voice">
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
                      : 'border-white/10 bg-white/[0.05] text-cyan-300 hover:border-cyan-400/40 hover:bg-cyan-500/15'
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
                      <Play className="h-3.5 w-3.5 fill-current text-cyan-400" />
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
                  className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 bg-white/[0.02] py-1.5 text-xs font-medium text-white/60 transition-all hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200 disabled:opacity-40"
                >
                  <Sparkles className="h-3 w-3 text-cyan-400" />
                  Audition &amp; Compare All 28 Voices
                </button>
              )}
            </div>
          </Field>

          <Field label="Background music">
            {project.music ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-2">
                  <Music className="h-3.5 w-3.5 shrink-0 text-white/35" />
                  <p className="min-w-0 flex-1 truncate text-xs text-white/70" title={project.music.fileName}>
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
                    onClick={onClearMusic}
                    disabled={isBusy}
                    className="focus-ring rounded px-1.5 py-0.5 text-xs text-white/50 transition-colors hover:text-red-300 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-[11px] text-white/35" htmlFor="shorts-music-volume">
                    Level
                  </label>
                  <input
                    id="shorts-music-volume"
                    type="range"
                    min={0}
                    max={0.5}
                    step={0.01}
                    value={project.music.volume}
                    onChange={(e) => onChange({ music: { ...project.music!, volume: Number(e.target.value) } })}
                    disabled={isBusy}
                    className="focus-ring h-1 flex-1 accent-cyan-400"
                  />
                  <span className="w-9 text-right text-xs tabular-nums text-white/50">
                    {Math.round(project.music.volume * 100)}%
                  </span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={onPickMusic}
                disabled={isBusy}
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2.5 text-sm text-white/55 transition-colors hover:border-white/30 hover:text-white disabled:opacity-40"
              >
                <Music className="h-3.5 w-3.5" />
                Browse royalty-free tracks
              </button>
            )}
          </Field>
        </div>
      </Department>

      {/* --- Finish ---------------------------------------------------------- */}
      <Department label="Finish" hint="captions and titles">
        <div className="grid gap-4 sm:grid-cols-2">
          <Toggle
            checked={project.captionsEnabled}
            onChange={(value) => onChange({ captionsEnabled: value })}
            disabled={isBusy}
            title="Captions"
            description="Burned into the video, timed to the voiceover."
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
            description="Holds the title over the opening 1.6 seconds."
            icon={<Type className="h-4 w-4" />}
          />
        </div>
      </Department>

      {/* --- Engine ---------------------------------------------------------- */}
      <Department label="Engine" hint="what writes the script">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm text-white/45">
            {useOpenAI ? (
              <>
                <Cloud className="h-3.5 w-3.5 shrink-0 text-white/30" />
                Your own endpoint writes the script.
              </>
            ) : (
              <>
                <Cpu className="h-3.5 w-3.5 shrink-0 text-white/30" />
                <span className="min-w-0">
                  Runs on this machine via WebGPU · <span className="text-white/60">{webLlmModelLabel}</span>
                </span>
              </>
            )}
          </p>
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

        {!useOpenAI && (
          <p className="text-xs leading-relaxed text-white/35">
            Change the on-device model in{' '}
            <button
              type="button"
              onClick={onOpenSettings}
              className="focus-ring rounded font-semibold text-white/50 underline underline-offset-2 hover:text-white"
            >
              Settings
            </button>
            .
          </p>
        )}
      </Department>
    </div>
  );
};
