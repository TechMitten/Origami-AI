import React, { useEffect, useRef, useState } from 'react';
import {
  GripVertical,
  ImageIcon,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Wand2,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { isSceneAudioStale, isSceneVisualStale, type ShortsGenerationMode, type ShortsScene } from '../../services/shortsProject';
import type { ShortsAspect } from '../../services/ShortsVideoRenderer';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ShortsSceneCardProps {
  scene: ShortsScene;
  index: number;
  aspect: ShortsAspect;
  generationMode: ShortsGenerationMode;
  disabled: boolean;
  onUpdate: (id: string, patch: Partial<ShortsScene>) => void;
  onRegenerateVisual: (id: string) => void;
  onRegenerateAudio: (id: string) => void;
  onRewritePrompt: (id: string) => void;
  onDelete: (id: string) => void;
}

const aspectClass: Record<ShortsAspect, string> = {
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-video',
  '1:1': 'aspect-square',
};

export const ShortsSceneCard: React.FC<ShortsSceneCardProps> = ({
  scene,
  index,
  aspect,
  generationMode,
  disabled,
  onUpdate,
  onRegenerateVisual,
  onRegenerateAudio,
  onRewritePrompt,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const narrationRef = useRef<HTMLTextAreaElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const isVideo = generationMode === 'video';
  const visualStatus = isVideo ? scene.videoStatus : scene.imageStatus;
  const visualUrl = isVideo ? scene.videoUrl : scene.imageUrl;
  const visualBusy = visualStatus === 'pending';
  const audioBusy = scene.audioStatus === 'pending';
  const audioStale = isSceneAudioStale(scene);
  const visualStale = isSceneVisualStale(scene, generationMode);

  // Automatically expose the prompt input field while reviewing the script before media is generated
  const [showPrompt, setShowPrompt] = useState(() => !visualUrl && visualStatus !== 'ready');

  const adjustTextareaHeight = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  };

  useEffect(() => {
    adjustTextareaHeight(narrationRef.current);
  }, [scene.narration]);

  useEffect(() => {
    if (showPrompt) {
      adjustTextareaHeight(promptRef.current);
    }
  }, [showPrompt, scene.imagePrompt]);

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const togglePlay = () => {
    if (!scene.audioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
    } else {
      void audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md transition-colors',
        !isDragging && 'hover:border-white/20',
      )}
    >
      <div className="flex gap-4">
        {/* Slate: cut order is real information here, so the number is the anchor
            and the drag handle sits under it. */}
        <div className="flex flex-col items-center gap-1.5 pt-0.5">
          <span className="font-display text-sm font-extrabold tabular-nums leading-none text-white/40">
            {String(index + 1).padStart(2, '0')}
          </span>
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder scene ${index + 1}`}
            className="focus-ring cursor-grab touch-none rounded-md p-1 text-white/25 transition-colors hover:text-white/70 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </div>

        {/* Thumbnail */}
        <div className={cn('relative w-24 shrink-0 overflow-hidden rounded-xl bg-black/40 sm:w-28', aspectClass[aspect])}>
          {visualUrl ? (
            isVideo ? (
              <video src={visualUrl} className="h-full w-full object-cover" muted loop autoPlay playsInline />
            ) : (
              <img src={visualUrl} alt="" className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/20">
              {visualStatus === 'error' ? (
                <TriangleAlert className="h-5 w-5 text-amber-400/70" />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
            </div>
          )}

          {visualBusy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
            </div>
          )}

          {visualStale && !visualBusy && (
            <span
              title={`Prompt edited since this ${isVideo ? 'video' : 'image'} was generated`}
              className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]"
            />
          )}

          <button
            type="button"
            onClick={() => onRegenerateVisual(scene.id)}
            disabled={disabled || visualBusy}
            title={isVideo ? 'Regenerate video' : 'Regenerate image'}
            className={cn(
              'focus-ring absolute bottom-1 right-1 rounded-md bg-black/70 p-1.5 text-white/70 transition-all hover:text-cyan-300 focus:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed',
              visualStale ? 'text-amber-300 opacity-100' : 'opacity-0',
            )}
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-3">
          <textarea
            ref={narrationRef}
            value={scene.narration}
            onChange={(e) => {
              adjustTextareaHeight(e.target);
              onUpdate(scene.id, { narration: e.target.value });
            }}
            disabled={disabled}
            rows={2}
            placeholder="Narration for this scene"
            className={cn(
              'focus-ring min-h-[64px] w-full resize-none overflow-hidden rounded-lg border bg-black/20 p-3 text-sm leading-relaxed text-white outline-none transition-all placeholder:text-white/25 focus:border-cyan-400/40 disabled:opacity-50',
              audioStale ? 'border-amber-400/40' : 'border-white/10',
            )}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!scene.audioUrl || disabled}
              className="focus-ring flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/70 transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {scene.audioDuration ? `${scene.audioDuration.toFixed(1)}s` : 'Preview'}
            </button>

            <button
              type="button"
              onClick={() => onRegenerateAudio(scene.id)}
              disabled={disabled || audioBusy}
              title={audioStale ? 'Narration edited — regenerate voiceover' : 'Regenerate voiceover for this scene'}
              className={cn(
                'focus-ring flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30',
                audioStale ? 'border-amber-400/40 text-amber-300' : 'border-white/10 text-white/60',
              )}
            >
              {audioBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Voice
              {audioStale && !audioBusy && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
            </button>

            <button
              type="button"
              onClick={() => setShowPrompt((v) => !v)}
              className={cn(
                'focus-ring flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors hover:border-white/25 hover:text-white',
                visualStale ? 'border-amber-400/40 text-amber-300' : 'border-white/10 text-white/60',
              )}
            >
              <ImageIcon className="h-3 w-3" />
              {showPrompt ? 'Hide prompt' : isVideo ? 'Video prompt' : 'Image prompt'}
              {visualStale && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
            </button>

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => onDelete(scene.id)}
              disabled={disabled}
              title="Delete scene"
              className="focus-ring rounded-lg p-1.5 text-white/40 transition-colors hover:text-red-300 disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {showPrompt && (
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
                  {isVideo ? 'Video prompt' : 'Image prompt'}
                </span>
                <div className="flex items-center gap-2">
                  {visualStale && (
                    <button
                      type="button"
                      onClick={() => onRegenerateVisual(scene.id)}
                      disabled={disabled || visualBusy}
                      className="focus-ring flex items-center gap-1.5 rounded-lg border border-amber-400/40 px-2.5 py-1 text-xs text-amber-300 transition-colors hover:border-amber-400/70 hover:text-amber-200 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {visualBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {isVideo ? 'Regenerate video' : 'Regenerate image'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onRewritePrompt(scene.id)}
                    disabled={disabled}
                    className="focus-ring flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-cyan-400/40 hover:text-white disabled:opacity-30"
                  >
                    <Wand2 className="h-3 w-3" />
                    Rewrite with AI
                  </button>
                </div>
              </div>
              <textarea
                ref={promptRef}
                value={scene.imagePrompt}
                onChange={(e) => {
                  adjustTextareaHeight(e.target);
                  onUpdate(scene.id, { imagePrompt: e.target.value });
                }}
                disabled={disabled}
                placeholder={isVideo ? 'Describe the video clip for this scene' : 'Describe the image for this scene'}
                className={cn(
                  'focus-ring min-h-[80px] w-full resize-none overflow-hidden rounded-lg border bg-black/25 p-3 text-xs leading-relaxed text-white/85 outline-none transition-all placeholder:text-white/25 focus:border-cyan-400/40 disabled:opacity-50',
                  visualStale ? 'border-amber-400/40' : 'border-white/10',
                )}
              />
              {visualStale && (
                <p className="text-[11px] text-amber-300/80">
                  Edited since the {isVideo ? 'video' : 'image'} was generated — regenerate to apply the change.
                </p>
              )}
            </div>
          )}

          {((isVideo ? scene.videoError : scene.imageError) || scene.audioError) && (
            <p className="flex items-start gap-2 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-200">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{(isVideo ? scene.videoError : scene.imageError) || scene.audioError}</span>
            </p>
          )}
        </div>
      </div>

      {scene.audioUrl && (
        <audio
          ref={audioRef}
          src={scene.audioUrl}
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
          className="hidden"
        />
      )}
    </div>
  );
};
