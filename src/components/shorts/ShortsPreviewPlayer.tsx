import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Film } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { buildCaptionTimings } from '../../services/shortsCaptions';
import { formatDuration, type ShortsProject } from '../../services/shortsProject';
import type { ShortsAspect } from '../../services/ShortsVideoRenderer';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Live storyboard preview.
 *
 * Plays the real Kokoro audio against the real images with DOM captions, so the
 * user can judge pacing before committing to an encode. The Ken Burns and
 * caption maths mirror ShortsVideoRenderer so the preview reads like the export
 * (it is an approximation in DOM, not a frame-exact simulation).
 */

interface ShortsPreviewPlayerProps {
  project: ShortsProject;
  className?: string;
}

const aspectClass: Record<ShortsAspect, string> = {
  '9:16': 'aspect-[9/16]',
  '16:9': 'aspect-video',
  '1:1': 'aspect-square',
};

const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const ShortsPreviewPlayer: React.FC<ShortsPreviewPlayerProps> = ({ project, className }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [sceneTime, setSceneTime] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const fallbackStartRef = useRef<number>(0);

  const scenes = project.scenes;
  const scene = scenes[sceneIndex];

  // Caption timings are derived per scene; recompute only when text/duration move.
  const captionsByScene = useMemo(
    () => scenes.map((s) => buildCaptionTimings(s.narration, s.audioDuration ?? 0)),
    [scenes],
  );

  const sceneDurations = useMemo(
    () => scenes.map((s) => Math.max(1.2, (s.audioDuration ?? 0) + 0.28)),
    [scenes],
  );

  const totalDuration = useMemo(
    () => sceneDurations.reduce((sum, d) => sum + d, 0),
    [sceneDurations],
  );

  const elapsed = useMemo(
    () => sceneDurations.slice(0, sceneIndex).reduce((sum, d) => sum + d, 0) + sceneTime,
    [sceneDurations, sceneIndex, sceneTime],
  );

  const stop = useCallback(() => {
    setIsPlaying(false);
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setSceneIndex(0);
    setSceneTime(0);
  }, [stop]);

  // Editing the storyboard mid-playback would desync audio from the scene list.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes.length, project.aspect]);

  // Drive playback for the current scene.
  useEffect(() => {
    if (!isPlaying) return;

    const current = scenes[sceneIndex];
    if (!current) {
      stop();
      return;
    }

    const duration = sceneDurations[sceneIndex] ?? 1.2;
    const audio = audioRef.current;
    let cancelled = false;

    const advance = () => {
      if (cancelled) return;
      if (sceneIndex + 1 < scenes.length) {
        setSceneIndex((i) => i + 1);
        setSceneTime(0);
      } else {
        stop();
        setSceneIndex(0);
        setSceneTime(0);
      }
    };

    if (current.audioUrl && audio) {
      audio.currentTime = 0;
      void audio.play().catch(() => {
        // Autoplay blocked or a decode failure — fall back to the timer below.
      });
    }
    fallbackStartRef.current = performance.now();

    const tick = () => {
      if (cancelled) return;

      const usingAudio = !!current.audioUrl && !!audio && !audio.paused;
      const t = usingAudio
        ? audio.currentTime
        : (performance.now() - fallbackStartRef.current) / 1000;

      setSceneTime(t);

      if (t >= duration) {
        advance();
        return;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      audio?.pause();
    };
  }, [isPlaying, sceneIndex, scenes, sceneDurations, stop]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  // Ken Burns transform, mirroring the renderer's alternating move.
  const kenBurns = useMemo(() => {
    if (!scene) return { transform: 'scale(1)' };

    const duration = sceneDurations[sceneIndex] ?? 1.2;
    const progress = easeInOutSine(clamp(duration > 0 ? sceneTime / duration : 0, 0, 1));

    const zoomIn = sceneIndex % 2 === 0;
    const horizontal = sceneIndex % 4 < 2;
    const drift = 0.28;

    const zoom = zoomIn ? 1.0 + 0.12 * progress : 1.12 - 0.12 * progress;
    const pan = -drift + 2 * drift * progress;
    const panX = horizontal ? pan * 4 : 0;
    const panY = horizontal ? 0 : pan * 4;

    return { transform: `scale(${zoom}) translate(${panX}%, ${panY}%)` };
  }, [scene, sceneIndex, sceneTime, sceneDurations]);

  const activeChunk = useMemo(() => {
    const chunks = captionsByScene[sceneIndex];
    if (!chunks) return null;
    return chunks.find((c) => sceneTime >= c.start && sceneTime < c.end) ?? null;
  }, [captionsByScene, sceneIndex, sceneTime]);

  const showTitle = project.showTitleCard && sceneIndex === 0 && sceneTime < 1.6 && !!project.title;

  if (!scenes.length) {
    return (
      <div className={cn('rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-md', className)}>
        <Film className="mx-auto h-6 w-6 text-white/20" />
        <p className="mt-3 text-sm text-white/40">Your preview will appear here once scenes are generated.</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl',
          aspectClass[project.aspect],
        )}
      >
        {scene?.imageUrl ? (
          <img
            src={scene.imageUrl}
            alt=""
            className="h-full w-full object-cover will-change-transform"
            style={kenBurns}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
            <Film className="h-8 w-8 text-white/15" />
          </div>
        )}

        {project.captionsEnabled && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
        )}

        {project.captionsEnabled && activeChunk && (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 flex justify-center px-[8%] text-center',
              project.captionStyle === 'clean-lower' ? 'bottom-[14%]' : 'bottom-[24%]',
            )}
          >
            <p
              className={cn(
                'leading-tight',
                project.captionStyle === 'clean-lower'
                  ? 'text-[clamp(0.75rem,3.2cqw,1.1rem)] font-semibold'
                  : 'text-[clamp(0.9rem,4.4cqw,1.6rem)] font-extrabold',
              )}
              style={{ textShadow: '0 2px 10px rgba(0,0,0,0.9), 0 0 3px rgba(0,0,0,1)' }}
            >
              {activeChunk.words.map((word, i) => {
                const isActive = sceneTime >= word.start && sceneTime < word.end;
                const isPast = sceneTime >= word.start;
                const highlight =
                  project.captionStyle === 'karaoke' ? isPast : project.captionStyle === 'bold-pop' && isActive;
                return (
                  <span key={`${word.text}-${i}`} className={highlight ? 'text-cyan-300' : 'text-white'}>
                    {word.text}
                    {i < activeChunk.words.length - 1 ? ' ' : ''}
                  </span>
                );
              })}
            </p>
          </div>
        )}

        {showTitle && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 px-[10%] text-center">
            <p
              className="font-display text-[clamp(1rem,5cqw,1.8rem)] font-extrabold leading-tight text-white"
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}
            >
              {project.title}
            </p>
          </div>
        )}

        {/* Scene ticks */}
        <div className="absolute inset-x-0 top-0 flex gap-1 p-2">
          {scenes.map((s, i) => (
            <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full bg-cyan-300 transition-[width] duration-100"
                style={{
                  width: i < sceneIndex ? '100%' : i === sceneIndex
                    ? `${clamp((sceneTime / (sceneDurations[i] || 1)) * 100, 0, 100)}%`
                    : '0%',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (isPlaying ? stop() : setIsPlaying(true))}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition-colors hover:border-cyan-400/40"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {isPlaying ? 'Pause' : 'Preview'}
        </button>
        <button
          type="button"
          onClick={reset}
          title="Restart"
          className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 transition-colors hover:border-white/25 hover:text-white"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <span className="ml-auto text-xs tabular-nums text-white/40">
          {formatDuration(elapsed)} / {formatDuration(totalDuration)}
        </span>
      </div>

      {scene?.audioUrl && <audio ref={audioRef} src={scene.audioUrl} preload="auto" className="hidden" />}
    </div>
  );
};
