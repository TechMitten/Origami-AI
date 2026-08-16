import React, { useRef, useState } from 'react';
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
import type { ShortsScene } from '../../services/shortsProject';
import type { ShortsAspect } from '../../services/ShortsVideoRenderer';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ShortsSceneCardProps {
  scene: ShortsScene;
  index: number;
  aspect: ShortsAspect;
  disabled: boolean;
  onUpdate: (id: string, patch: Partial<ShortsScene>) => void;
  onRegenerateImage: (id: string) => void;
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
  disabled,
  onUpdate,
  onRegenerateImage,
  onRegenerateAudio,
  onRewritePrompt,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

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

  const imageBusy = scene.imageStatus === 'pending';
  const audioBusy = scene.audioStatus === 'pending';

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
        {/* Drag handle + index */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder scene ${index + 1}`}
            className="cursor-grab touch-none rounded-md p-1 text-white/30 transition-colors hover:text-white/70 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="text-[11px] font-bold tabular-nums text-white/30">{index + 1}</span>
        </div>

        {/* Thumbnail */}
        <div className={cn('relative w-24 shrink-0 overflow-hidden rounded-xl bg-black/40 sm:w-28', aspectClass[aspect])}>
          {scene.imageUrl ? (
            <img src={scene.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/20">
              {scene.imageStatus === 'error' ? (
                <TriangleAlert className="h-5 w-5 text-amber-400/70" />
              ) : (
                <ImageIcon className="h-5 w-5" />
              )}
            </div>
          )}

          {imageBusy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
            </div>
          )}

          <button
            type="button"
            onClick={() => onRegenerateImage(scene.id)}
            disabled={disabled || imageBusy}
            title="Regenerate image"
            className="absolute bottom-1 right-1 rounded-md bg-black/70 p-1.5 text-white/70 opacity-0 transition-all hover:text-cyan-300 focus:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 space-y-3">
          <textarea
            value={scene.narration}
            onChange={(e) => onUpdate(scene.id, { narration: e.target.value })}
            disabled={disabled}
            rows={2}
            placeholder="Narration for this scene"
            className="w-full resize-none rounded-lg border border-white/10 bg-black/20 p-3 text-sm leading-relaxed text-white outline-none transition-all placeholder:text-white/25 focus:border-cyan-400/40 disabled:opacity-50"
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!scene.audioUrl || disabled}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/70 transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {scene.audioDuration ? `${scene.audioDuration.toFixed(1)}s` : 'Preview'}
            </button>

            <button
              type="button"
              onClick={() => onRegenerateAudio(scene.id)}
              disabled={disabled || audioBusy}
              title="Regenerate voiceover for this scene"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              {audioBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Voice
            </button>

            <button
              type="button"
              onClick={() => setShowPrompt((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:border-white/25 hover:text-white"
            >
              <ImageIcon className="h-3 w-3" />
              {showPrompt ? 'Hide prompt' : 'Image prompt'}
            </button>

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => onDelete(scene.id)}
              disabled={disabled}
              title="Delete scene"
              className="rounded-lg border border-white/10 p-1.5 text-white/40 transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-30"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {showPrompt && (
            <div className="space-y-2">
              <textarea
                value={scene.imagePrompt}
                onChange={(e) => onUpdate(scene.id, { imagePrompt: e.target.value })}
                disabled={disabled}
                rows={2}
                placeholder="Describe the image for this scene"
                className="w-full resize-none rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-relaxed text-white/80 outline-none transition-all placeholder:text-white/25 focus:border-cyan-400/40 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => onRewritePrompt(scene.id)}
                disabled={disabled}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/60 transition-colors hover:border-cyan-400/40 hover:text-white disabled:opacity-30"
              >
                <Wand2 className="h-3 w-3" />
                Rewrite with AI
              </button>
            </div>
          )}

          {(scene.imageError || scene.audioError) && (
            <p className="flex items-start gap-2 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-200">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{scene.imageError || scene.audioError}</span>
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
