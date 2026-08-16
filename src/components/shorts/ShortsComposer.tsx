import React from 'react';
import { Sparkles, Music, Captions, Loader2, KeyRound, Wand2, Type } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Dropdown } from '../Dropdown';
import { DEFAULT_VOICES } from '../../services/ttsService';
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
  isBusy: boolean;
  busyLabel?: string;
  hasImageKey: boolean;
  useOpenAI: boolean;
  onToggleOpenAI: (value: boolean) => void;
  openAIConfigured: boolean;
  webLlmModelLabel: string;
}

const SegmentedGroup: React.FC<{
  label: string;
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className="space-y-2">
    <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">{label}</span>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

const SegmentedButton: React.FC<{
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ active, onClick, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      'rounded-lg border px-4 py-2 text-sm font-medium transition-all',
      active
        ? 'border-cyan-400/60 bg-cyan-400/10 text-cyan-200 shadow-[0_0_20px_-8px_rgba(34,211,238,0.8)]'
        : 'border-white/10 bg-white/5 text-white/70 hover:border-white/25 hover:text-white',
      disabled && 'cursor-not-allowed opacity-40',
    )}
  >
    {children}
  </button>
);

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.2em] text-white/40">{children}</span>
);

export const ShortsComposer: React.FC<ShortsComposerProps> = ({
  project,
  onChange,
  onGenerate,
  onPickMusic,
  onClearMusic,
  onOpenSettings,
  isBusy,
  busyLabel,
  hasImageKey,
  useOpenAI,
  onToggleOpenAI,
  openAIConfigured,
  webLlmModelLabel,
}) => {
  const canGenerate = project.topic.trim().length > 2 && !isBusy;

  return (
    <div className="space-y-8">
      {/* Topic */}
      <div>
        <FieldLabel>What is your short about?</FieldLabel>
        <div className="relative">
          <textarea
            value={project.topic}
            onChange={(e) => onChange({ topic: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canGenerate) onGenerate();
            }}
            rows={4}
            disabled={isBusy}
            placeholder="e.g. Why octopuses have three hearts — and what that means for how they move"
            className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-5 text-base text-white outline-none backdrop-blur-md transition-all placeholder:text-white/25 focus:border-cyan-400/40 focus:bg-white/[0.07] disabled:opacity-50"
          />
          <span className="pointer-events-none absolute bottom-3 right-4 text-[11px] text-white/25">
            {project.topic.trim().length > 2 ? 'Ctrl+Enter to generate' : ''}
          </span>
        </div>
      </div>

      {/* Visuals */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-sm font-semibold text-white">Visuals</span>
            <p className="mt-1 text-xs text-white/40">
              {project.generationMode === 'video'
                ? 'Pollinations generates a short AI video clip per scene.'
                : 'Pollinations generates a still image per scene, animated with Ken Burns.'}
            </p>
          </div>
          <div className="flex gap-2">
            <SegmentedButton
              active={project.generationMode !== 'video'}
              onClick={() => onChange({ generationMode: 'image' })}
              disabled={isBusy}
            >
              AI Images
            </SegmentedButton>
            <SegmentedButton
              active={project.generationMode === 'video'}
              onClick={() => onChange({ generationMode: 'video' })}
              disabled={isBusy}
            >
              AI Video
            </SegmentedButton>
          </div>
        </div>
        {project.generationMode === 'video' && (
          <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            Video generation is slower and typically costs more per scene than stills.
          </p>
        )}
      </div>

      {/* Format */}
      <div className="grid gap-6 sm:grid-cols-2">
        <SegmentedGroup label="Format">
          {ASPECT_OPTIONS.map((option) => (
            <SegmentedButton
              key={option.id}
              active={project.aspect === option.id}
              onClick={() => onChange({ aspect: option.id })}
              disabled={isBusy}
            >
              <span className="block">{option.label}</span>
              <span className="block text-[10px] font-normal text-white/40">{option.hint}</span>
            </SegmentedButton>
          ))}
        </SegmentedGroup>

        <SegmentedGroup label="Target length">
          {DURATION_OPTIONS.map((seconds) => (
            <SegmentedButton
              key={seconds}
              active={project.targetDurationSec === seconds}
              onClick={() => onChange({ targetDurationSec: seconds })}
              disabled={isBusy}
            >
              {seconds}s
            </SegmentedButton>
          ))}
        </SegmentedGroup>
      </div>

      {/* Look and voice */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <FieldLabel>Visual style</FieldLabel>
          <Dropdown
            options={VISUAL_STYLES.map((s) => ({ id: s.prompt, name: s.name }))}
            value={project.visualStyle}
            onChange={(value) => onChange({ visualStyle: value })}
            disabled={isBusy}
          />
        </div>
        <div>
          <FieldLabel>Narration tone</FieldLabel>
          <Dropdown
            options={TONE_OPTIONS.map((t) => ({ id: t.id, name: t.name }))}
            value={project.tone}
            onChange={(value) => onChange({ tone: value as ShortsProject['tone'] })}
            disabled={isBusy}
          />
        </div>
        <div>
          <FieldLabel>Voice</FieldLabel>
          <Dropdown
            options={DEFAULT_VOICES.map((v) => ({ id: v.id, name: v.name }))}
            value={project.voice}
            onChange={(value) => onChange({ voice: value })}
            disabled={isBusy}
          />
        </div>
        <div>
          <FieldLabel>{project.generationMode === 'video' ? 'Video model' : 'Image model'}</FieldLabel>
          {project.generationMode === 'video' ? (
            <Dropdown
              options={POLLINATIONS_VIDEO_MODELS.map((m) => ({ id: m.id, name: m.name }))}
              value={project.videoModel}
              onChange={(value) => onChange({ videoModel: value })}
              disabled={isBusy}
            />
          ) : (
            <Dropdown
              options={POLLINATIONS_IMAGE_MODELS.map((m) => ({ id: m.id, name: m.name }))}
              value={project.imageModel}
              onChange={(value) => onChange({ imageModel: value })}
              disabled={isBusy}
            />
          )}
        </div>
      </div>

      {/* Captions, title card, music */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <Captions className="h-4 w-4 text-cyan-300" />
              Captions
            </span>
            <input
              type="checkbox"
              checked={project.captionsEnabled}
              onChange={(e) => onChange({ captionsEnabled: e.target.checked })}
              disabled={isBusy}
              className="h-4 w-4 accent-cyan-400"
            />
          </label>
          <p className="mt-1 text-xs text-white/40">Burned into the video, timed to the voiceover.</p>
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
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <Type className="h-4 w-4 text-cyan-300" />
              Title card
            </span>
            <input
              type="checkbox"
              checked={project.showTitleCard}
              onChange={(e) => onChange({ showTitleCard: e.target.checked })}
              disabled={isBusy}
              className="h-4 w-4 accent-cyan-400"
            />
          </label>
          <p className="mt-1 text-xs text-white/40">Show the title over the first 1.6 seconds.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
          <span className="flex items-center gap-2 text-sm font-semibold text-white">
            <Music className="h-4 w-4 text-cyan-300" />
            Background music
          </span>
          {project.music ? (
            <div className="mt-2 space-y-3">
              <p className="truncate text-xs text-white/60" title={project.music.fileName}>
                {project.music.fileName}
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={0.5}
                  step={0.01}
                  value={project.music.volume}
                  onChange={(e) =>
                    onChange({ music: { ...project.music!, volume: Number(e.target.value) } })
                  }
                  disabled={isBusy}
                  className="flex-1 accent-cyan-400"
                />
                <span className="w-10 text-right text-xs tabular-nums text-white/50">
                  {Math.round(project.music.volume * 100)}%
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onPickMusic}
                  disabled={isBusy}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/25 hover:text-white disabled:opacity-40"
                >
                  Change
                </button>
                <button
                  type="button"
                  onClick={onClearMusic}
                  disabled={isBusy}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={onPickMusic}
              disabled={isBusy}
              className="mt-3 w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 transition-colors hover:border-cyan-400/40 hover:text-white disabled:opacity-40"
            >
              Browse royalty-free tracks
            </button>
          )}
        </div>
      </div>

      {/* Script engine */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="flex items-center gap-2 text-sm font-semibold text-white">
              <Wand2 className="h-4 w-4 text-cyan-300" />
              Script engine
            </span>
            <p className="mt-1 text-xs text-white/40">
              {useOpenAI
                ? 'Using your OpenAI-compatible endpoint.'
                : `Running locally on WebGPU · ${webLlmModelLabel}`}
            </p>
          </div>
          <div className="flex gap-2">
            <SegmentedButton active={!useOpenAI} onClick={() => onToggleOpenAI(false)} disabled={isBusy}>
              Local (WebLLM)
            </SegmentedButton>
            <SegmentedButton active={useOpenAI} onClick={() => onToggleOpenAI(true)} disabled={isBusy}>
              API endpoint
            </SegmentedButton>
          </div>
        </div>
        {useOpenAI && !openAIConfigured && (
          <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            No endpoint configured yet.{' '}
            <button type="button" onClick={onOpenSettings} className="underline underline-offset-2">
              Add a base URL, model and key in Settings
            </button>
            .
          </p>
        )}
      </div>

      {/* Image key notice */}
      {!hasImageKey && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-5 py-4 text-sm text-amber-100">
          <KeyRound className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Not connected to Pollinations. {project.generationMode === 'video' ? 'Video' : 'Image'} generation will
            go through this server, which only works if it has a key configured.
          </span>
          <button
            type="button"
            onClick={onOpenSettings}
            className="rounded-lg border border-amber-300/40 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-300/15"
          >
            Connect
          </button>
        </div>
      )}

      {/* Generate */}
      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
        className={cn(
          'group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl px-8 py-5 text-base font-bold transition-all',
          canGenerate
            ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-black shadow-[0_10px_40px_-12px_rgba(34,211,238,0.9)] hover:brightness-110'
            : 'cursor-not-allowed border border-white/10 bg-white/5 text-white/30',
        )}
      >
        {isBusy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            {busyLabel || 'Generating...'}
          </>
        ) : (
          <>
            <Sparkles className="h-5 w-5" />
            Generate short
          </>
        )}
      </button>
    </div>
  );
};
