import React, { useEffect, useRef, useState } from 'react';
import {
  Expand,
  GripVertical,
  ImageIcon,
  ListPlus,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Upload,
  Wand2,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { isSceneAudioStale, isSceneVisualStale, type ShortsGenerationMode, type ShortsScene } from '../../services/shortsProject';
import type { ShortsAspect } from '../../services/ShortsVideoRenderer';
import { ShortsVisualPreviewModal } from './ShortsVisualPreviewModal';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const aspectClass: Record<ShortsAspect, string> = {
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-video',
  '1:1': 'aspect-square',
};

interface ShortsSceneCardProps {
  scene: ShortsScene;
  index: number;
  aspect: ShortsAspect;
  generationMode: ShortsGenerationMode;
  /** Active image/video model id — a visual generated with another model reads as stale. */
  visualModel: string;
  disabled: boolean;
  isExtending: boolean;
  isRewritingPrompt?: boolean;
  onUpdate: (id: string, patch: Partial<ShortsScene>) => void;
  onRegenerateVisual: (id: string) => void;
  onRegenerateAudio: (id: string) => void;
  onRewritePrompt: (id: string) => void;
  onExtend: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ShortsSceneCard: React.FC<ShortsSceneCardProps> = ({
  scene,
  index,
  aspect,
  generationMode,
  visualModel,
  disabled,
  isExtending,
  isRewritingPrompt,
  onUpdate,
  onRegenerateVisual,
  onRegenerateAudio,
  onRewritePrompt,
  onExtend,
  onDelete,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const narrationRef = useRef<HTMLTextAreaElement | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const isVideo = generationMode === 'video';
  const visualStatus = isVideo ? scene.videoStatus : scene.imageStatus;
  const visualUrl = isVideo ? scene.videoUrl : scene.imageUrl;
  const visualBusy = visualStatus === 'pending';
  const audioBusy = scene.audioStatus === 'pending';
  const audioStale = isSceneAudioStale(scene);
  const visualStale = isSceneVisualStale(scene, generationMode, visualModel, aspect);

  const handleImageFile = (file: File) => {
    if (scene.imageUrl) URL.revokeObjectURL(scene.imageUrl);
    if (scene.videoUrl) URL.revokeObjectURL(scene.videoUrl);
    const url = URL.createObjectURL(file);
    onUpdate(scene.id, {
      imageBlob: file,
      imageUrl: url,
      imageStatus: 'ready',
      imageError: null,
      videoBlob: null,
      videoUrl: null,
      videoStatus: 'idle',
      isCustomUpload: true,
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageFile(file);
    }
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageFile(file);
    }
  };

  const [showPrompt, setShowPrompt] = useState(false);

  // Sets a min-height rather than a fixed height so the narration box can still
  // grow beyond its content via flex-1 (filling the space next to a tall
  // thumbnail) while shrinking back down whenever its own text gets shorter.
  const adjustTextareaHeight = (element: HTMLTextAreaElement | null) => {
    if (!element) return;
    element.style.minHeight = '0px';
    element.style.minHeight = `${element.scrollHeight}px`;
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
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'group relative rounded-2xl border bg-white/5 p-4 backdrop-blur-md transition-all',
        isDragOver
          ? 'border-cyan-400/80 bg-cyan-500/10 ring-2 ring-cyan-400/40'
          : !isDragging
            ? 'border-white/10 hover:border-white/20'
            : 'border-white/10',
      )}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

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

        {/* Thumbnail. A div, not a button — it hosts the real regenerate <button>
            below, and nesting interactive controls inside a <button> breaks both
            HTML validity and (when disabled) click delivery to the children. */}
        <div
          role={visualUrl ? 'button' : undefined}
          tabIndex={visualUrl ? 0 : undefined}
          onClick={() => {
            if (visualUrl) setIsPreviewOpen(true);
            else imageInputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (visualUrl) setIsPreviewOpen(true);
              else imageInputRef.current?.click();
            }
          }}
          title={visualUrl ? `View full-size ${isVideo ? 'clip' : 'image'}` : 'Click to upload image'}
          className={cn(
            'group/thumb relative w-32 shrink-0 self-start overflow-hidden rounded-xl bg-black/40 sm:w-40',
            aspectClass[aspect],
            visualUrl ? 'focus-ring cursor-zoom-in' : 'focus-ring cursor-pointer hover:bg-black/60',
          )}
        >
          {visualUrl ? (
            isVideo ? (
              <video src={visualUrl} className="h-full w-full object-cover" muted loop autoPlay playsInline />
            ) : (
              <img src={visualUrl} alt="" className="h-full w-full object-cover" />
            )
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-2 text-center text-white/30 transition-colors hover:text-white/80">
              {visualStatus === 'error' ? (
                <TriangleAlert className="h-5 w-5 text-amber-400/70" />
              ) : (
                <>
                  <Upload className="h-5 w-5 text-white/40 group-hover/thumb:text-cyan-300" />
                  <span className="text-[10px] font-semibold text-white/50 group-hover/thumb:text-white">Upload</span>
                </>
              )}
            </div>
          )}

          {visualBusy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
            </div>
          )}

          {visualUrl && !visualBusy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover/thumb:bg-black/30 group-hover/thumb:opacity-100">
              <Expand className="h-4 w-4 text-white/90 drop-shadow" />
            </div>
          )}

          {visualStale && !visualBusy && (
            <span
              title={`Prompt or model changed since this ${isVideo ? 'video' : 'image'} was generated`}
              className="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.9)]"
            />
          )}

          {visualUrl && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                imageInputRef.current?.click();
              }}
              disabled={disabled}
              title="Replace image with upload"
              className="focus-ring absolute bottom-1 left-1 rounded-md bg-black/70 p-1.5 text-white/70 opacity-0 transition-all hover:text-cyan-300 focus:opacity-100 group-hover/thumb:opacity-100 disabled:cursor-not-allowed"
            >
              <Upload className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRegenerateVisual(scene.id);
            }}
            disabled={disabled || visualBusy}
            title={isVideo ? 'Regenerate video' : 'Regenerate image'}
            className={cn(
              'focus-ring absolute bottom-1 right-1 rounded-md bg-black/70 p-1.5 text-white/70 transition-all hover:text-cyan-300 focus:opacity-100 group-hover/thumb:opacity-100 disabled:cursor-not-allowed',
              visualStale ? 'text-amber-300 opacity-100' : 'opacity-0',
            )}
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>

        <ShortsVisualPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          url={visualUrl ?? null}
          isVideo={isVideo}
          label={`Scene ${index + 1} ${isVideo ? 'clip' : 'image'}`}
        />

        {/* Body: a flex column stretched to the thumbnail's height, with the
            narration box (flex-1) absorbing whatever space the rest of the
            content doesn't need — so a tall portrait thumbnail next to a
            short caption doesn't read as dead space. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
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
              'focus-ring min-h-[64px] w-full flex-1 resize-none overflow-hidden rounded-lg border bg-black/20 p-3 text-sm leading-relaxed text-white outline-none transition-all placeholder:text-white/25 focus:border-cyan-400/40 disabled:opacity-50',
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
              onClick={() => imageInputRef.current?.click()}
              disabled={disabled}
              title="Upload or replace image for this scene"
              className="focus-ring flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/70 transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Upload className="h-3 w-3" />
              Upload
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

            <button
              type="button"
              onClick={() => onExtend(scene.id)}
              disabled={disabled || isExtending || !scene.narration.trim()}
              title="Add a few more sentences to this scene's narration"
              className={cn(
                'focus-ring flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed',
                // Loading is a disabled state too, but it should read as "working",
                // not as unavailable — the generic disabled:opacity-30 dims
                // text-white/60 down to the point of being unreadable.
                isExtending ? 'border-cyan-400/30 text-cyan-200' : 'border-white/10 text-white/60 disabled:opacity-30',
              )}
            >
              {isExtending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListPlus className="h-3 w-3" />}
              Extend
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
                  <button
                    type="button"
                    onClick={() => onRegenerateVisual(scene.id)}
                    disabled={disabled || visualBusy}
                    title={
                      visualStale
                        ? `Prompt or model changed — regenerate to apply`
                        : `Generate a new ${isVideo ? 'clip' : 'image'} with a fresh random seed`
                    }
                    className={cn(
                      'focus-ring flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30',
                      visualStale
                        ? 'border-amber-400/40 text-amber-300 hover:border-amber-400/70 hover:text-amber-200'
                        : 'border-white/10 text-white/60 hover:border-cyan-400/40 hover:text-white',
                    )}
                  >
                    {visualBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    {isVideo ? 'Regenerate video' : 'Regenerate image'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRewritePrompt(scene.id)}
                    disabled={disabled || isRewritingPrompt}
                    title="Rewrite this visual prompt with AI based on the current voiceover"
                    className="focus-ring flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {isRewritingPrompt ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                    AI rewrite prompt
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
                  Changed since the {isVideo ? 'video' : 'image'} was generated — regenerate to apply the change.
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
