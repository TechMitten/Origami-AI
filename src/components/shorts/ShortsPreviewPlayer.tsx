import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  Film,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  X,
} from 'lucide-react';
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

/** Viewfinder corner marks — the frame reads as a gate rather than a rounded box. */
const GateMarks: React.FC = () => (
  <div aria-hidden className="pointer-events-none absolute inset-0 z-[4]">
    {[
      'left-2 top-2 border-l border-t',
      'right-2 top-2 border-r border-t',
      'left-2 bottom-2 border-b border-l',
      'right-2 bottom-2 border-b border-r',
    ].map((position) => (
      <span key={position} className={cn('absolute h-3.5 w-3.5 border-white/35', position)} />
    ))}
  </div>
);

export const ShortsPreviewPlayer: React.FC<ShortsPreviewPlayerProps> = ({ project, className }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isEnlarged, setIsEnlarged] = useState(false);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [sceneTime, setSceneTime] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const fallbackStartRef = useRef<number>(0);

  const scenes = project.scenes;
  const scene = scenes[sceneIndex];

  // Background music plays underneath the whole preview, independent of scene
  // transitions — it should keep rolling (and looping) across cuts, not
  // restart per scene the way each scene's narration does.
  const musicBlob = project.music?.blob ?? null;
  const musicVolume = project.music?.volume ?? 0;
  const musicUrl = useMemo(() => (musicBlob ? URL.createObjectURL(musicBlob) : null), [musicBlob]);
  useEffect(() => {
    return () => {
      if (musicUrl) URL.revokeObjectURL(musicUrl);
    };
  }, [musicUrl]);
  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = clamp(musicVolume, 0, 1);
  }, [musicVolume]);
  useEffect(() => {
    const music = musicRef.current;
    if (!music) return;
    if (isPlaying) {
      void music.play().catch(() => {});
    } else {
      music.pause();
    }
  }, [isPlaying, musicUrl]);

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
    const music = musicRef.current;
    if (music) {
      music.pause();
      music.currentTime = 0;
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setSceneIndex(0);
    setSceneTime(0);
  }, [stop]);

  const jumpToScene = useCallback(
    (index: number) => {
      if (index < 0 || index >= scenes.length) return;
      setSceneIndex(index);
      setSceneTime(0);
      const targetScene = scenes[index];
      if (isPlaying && targetScene?.audioUrl && audioRef.current) {
        audioRef.current.currentTime = 0;
        void audioRef.current.play().catch(() => {});
      }
      fallbackStartRef.current = performance.now();
    },
    [isPlaying, scenes],
  );

  const prevScene = useCallback(() => {
    jumpToScene(Math.max(0, sceneIndex - 1));
  }, [jumpToScene, sceneIndex]);

  const nextScene = useCallback(() => {
    jumpToScene(Math.min(scenes.length - 1, sceneIndex + 1));
  }, [jumpToScene, scenes.length, sceneIndex]);

  // Lock body scrolling while enlarged modal is active
  useEffect(() => {
    if (!isEnlarged) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isEnlarged]);

  // Keyboard shortcuts when enlarged (Space: Play/Pause, Esc: Close, Arrows: Navigation)
  useEffect(() => {
    if (!isEnlarged) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsEnlarged(false);
      } else if (
        e.key === ' ' &&
        !['INPUT', 'TEXTAREA', 'BUTTON'].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        if (isPlaying) stop();
        else setIsPlaying(true);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextScene();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevScene();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnlarged, isPlaying, stop, nextScene, prevScene]);

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

  const sampleTitle = useMemo(() => {
    const source = project.title || project.topic;
    return source.trim();
  }, [project.title, project.topic]);

  // Before any scene exists the monitor still has something true to show: the
  // chosen frame, typeset with the user's own topic in the caption style they
  // picked. It turns two dropdowns into something they can actually judge.
  // But when the title card is already showing that same topic text centered
  // on the frame, echoing it again as the caption preview reads as a
  // duplicated title rather than two independent previews — so fall back to a
  // generic caption sample whenever the title card is covering that ground.
  const sampleWords = useMemo(() => {
    if (project.showTitleCard && sampleTitle) return ['Your', 'narration', 'lands', 'here'];
    const words = project.topic.trim().split(/\s+/).filter(Boolean);
    return words.length ? words : ['Your', 'narration', 'lands', 'here'];
  }, [project.topic, project.showTitleCard, sampleTitle]);

  // Renders the viewport frame (works in both inline and enlarged modes)
  const renderFrameContent = (isModal = false) => {
    if (!scenes.length) {
      return (
        <div
          className={cn(
            'monitor-gate @container group relative h-full w-full overflow-hidden rounded-2xl border border-white/10 shadow-2xl',
            'bg-[radial-gradient(120%_90%_at_50%_0%,#1b1b22_0%,#0c0c10_55%,#08080a_100%)]',
            aspectClass[project.aspect],
          )}
        >
          <GateMarks />

          {!isModal && (
            <button
              type="button"
              onClick={() => setIsEnlarged(true)}
              title="Enlarge preview"
              aria-label="Enlarge preview"
              className="focus-ring absolute right-2.5 top-2.5 z-[6] rounded-lg bg-black/60 p-1.5 text-white/60 opacity-0 backdrop-blur-md transition-all hover:bg-black/80 hover:text-cyan-300 focus:opacity-100 group-hover:opacity-100"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}

          {project.showTitleCard && sampleTitle && (
            <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center px-[10%] text-center">
              <p
                className="font-display text-[clamp(0.9rem,5cqw,1.7rem)] font-extrabold leading-tight text-white/90 max-w-full break-words"
                style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}
              >
                {sampleTitle}
              </p>
            </div>
          )}

          {project.captionsEnabled && (
            <div
              key={project.captionStyle}
              className={cn(
                'caption-restate pointer-events-none absolute inset-x-0 z-[2] flex justify-center px-[6%] text-center min-w-0 max-w-full overflow-hidden',
                project.captionStyle === 'clean-lower' ? 'bottom-[12%]' : 'bottom-[22%]',
              )}
            >
              {project.captionStyle === 'clean-lower' ? (
                <div className="inline-block max-w-full min-w-0 px-4 py-2 rounded-2xl bg-black/65 backdrop-blur-md border border-white/10 shadow-lg break-words">
                  <p className="text-[clamp(0.75rem,3.2cqw,1.05rem)] font-medium text-white/90 leading-[1.35] max-w-full min-w-0 break-words whitespace-normal">
                    {sampleWords.map((word, i) => {
                      const isMid = i === Math.floor(sampleWords.length / 2);
                      return (
                        <span key={`${word}-${i}`} className="break-words">
                          <span className={isMid ? 'text-cyan-200 font-semibold' : 'text-white'}>
                            {word}
                          </span>
                          {i < sampleWords.length - 1 ? ' ' : ''}
                        </span>
                      );
                    })}
                  </p>
                </div>
              ) : project.captionStyle === 'bold-pop' ? (
                <p
                  className="text-[clamp(0.85rem,4.4cqw,1.55rem)] font-black uppercase tracking-wide leading-[1.35] max-w-full min-w-0 break-words whitespace-normal"
                  style={{ textShadow: '0 3px 12px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,1)' }}
                >
                  {sampleWords.map((word, i) => {
                    const isPop = i === Math.floor(sampleWords.length / 2);
                    return (
                      <span key={`${word}-${i}`} className="break-words">
                        <span
                          className={cn(
                            'inline transition-transform duration-150 break-words',
                            isPop
                              ? 'text-yellow-400 font-black drop-shadow-[0_2px_10px_rgba(250,204,21,0.6)]'
                              : 'text-white font-extrabold'
                          )}
                        >
                          {word.toUpperCase()}
                        </span>
                        {i < sampleWords.length - 1 ? ' ' : ''}
                      </span>
                    );
                  })}
                </p>
              ) : (
                /* Karaoke Fill */
                <p className="text-[clamp(0.85rem,4.2cqw,1.5rem)] font-extrabold leading-[1.35] tracking-normal max-w-full min-w-0 break-words whitespace-normal">
                  {sampleWords.map((word, i) => {
                    const isSpoken = i < Math.ceil(sampleWords.length / 2);
                    return (
                      <span
                        key={`${word}-${i}`}
                        className={cn(
                          'transition-colors duration-150 break-words',
                          isSpoken
                            ? 'text-cyan-300 font-black drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]'
                            : 'text-white/35 font-semibold'
                        )}
                        style={
                          isSpoken
                            ? { textShadow: '0 0 12px rgba(34,211,238,0.7), 0 2px 8px rgba(0,0,0,0.9)' }
                            : { textShadow: '0 2px 6px rgba(0,0,0,0.7)' }
                        }
                      >
                        {word}
                        {i < sampleWords.length - 1 ? ' ' : ''}
                      </span>
                    );
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        className={cn(
          'monitor-gate @container group relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl',
          aspectClass[project.aspect],
        )}
      >
        <GateMarks />

        {!isModal && (
          <button
            type="button"
            onClick={() => setIsEnlarged(true)}
            title="Enlarge preview"
            aria-label="Enlarge preview"
            className="focus-ring absolute right-2.5 top-2.5 z-[6] rounded-lg bg-black/60 p-1.5 text-white/60 opacity-0 backdrop-blur-md transition-all hover:bg-black/80 hover:text-cyan-300 focus:opacity-100 group-hover:opacity-100"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}

        {project.generationMode === 'video' && scene?.videoUrl ? (
          <video
            key={scene.id}
            src={scene.videoUrl}
            className="h-full w-full object-cover"
            muted
            loop
            autoPlay
            playsInline
          />
        ) : scene?.imageUrl ? (
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-1/2 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
        )}

        {project.captionsEnabled && activeChunk && (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 z-[2] flex justify-center px-[6%] text-center min-w-0 max-w-full overflow-hidden',
              project.captionStyle === 'clean-lower' ? 'bottom-[12%]' : 'bottom-[22%]',
            )}
          >
            {project.captionStyle === 'clean-lower' ? (
              <div className="inline-block max-w-full min-w-0 px-4 py-2 rounded-2xl bg-black/65 backdrop-blur-md border border-white/10 shadow-lg break-words">
                <p className="text-[clamp(0.75rem,3.2cqw,1.05rem)] font-medium text-white/90 leading-[1.35] max-w-full min-w-0 break-words whitespace-normal">
                  {activeChunk.words.map((word, i) => {
                    const isActive = sceneTime >= word.start && sceneTime < word.end;
                    return (
                      <span key={`${word.text}-${i}`} className="break-words">
                        <span className={isActive ? 'text-cyan-200 font-semibold' : 'text-white'}>
                          {word.text}
                        </span>
                        {i < activeChunk.words.length - 1 ? ' ' : ''}
                      </span>
                    );
                  })}
                </p>
              </div>
            ) : project.captionStyle === 'bold-pop' ? (
              <p
                className="text-[clamp(0.85rem,4.4cqw,1.55rem)] font-black uppercase tracking-wide leading-[1.35] max-w-full min-w-0 break-words whitespace-normal"
                style={{ textShadow: '0 3px 12px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,1)' }}
              >
                {activeChunk.words.map((word, i) => {
                  const isActive = sceneTime >= word.start && sceneTime < word.end;
                  return (
                    <span key={`${word.text}-${i}`} className="break-words">
                      <span
                        className={cn(
                          'inline transition-transform duration-100 break-words',
                          isActive
                            ? 'text-yellow-400 font-black drop-shadow-[0_2px_10px_rgba(250,204,21,0.6)]'
                            : 'text-white font-extrabold'
                        )}
                      >
                        {word.text.toUpperCase()}
                      </span>
                      {i < activeChunk.words.length - 1 ? ' ' : ''}
                    </span>
                  );
                })}
              </p>
            ) : (
              /* Karaoke Fill */
              <p className="text-[clamp(0.85rem,4.2cqw,1.5rem)] font-extrabold leading-[1.35] tracking-normal max-w-full min-w-0 break-words whitespace-normal">
                {activeChunk.words.map((word, i) => {
                  const isSpoken = sceneTime >= word.start;
                  return (
                    <span
                      key={`${word.text}-${i}`}
                      className={cn(
                        'transition-colors duration-150 break-words',
                        isSpoken
                          ? 'text-cyan-300 font-black drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]'
                          : 'text-white/35 font-semibold'
                      )}
                      style={
                        isSpoken
                          ? { textShadow: '0 0 12px rgba(34,211,238,0.7), 0 2px 8px rgba(0,0,0,0.9)' }
                          : { textShadow: '0 2px 6px rgba(0,0,0,0.7)' }
                      }
                    >
                      {word.text}
                      {i < activeChunk.words.length - 1 ? ' ' : ''}
                    </span>
                  );
                })}
              </p>
            )}
          </div>
        )}

        {showTitle && (
          <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center bg-black/45 px-[10%] text-center">
            <p
              className="font-display text-[clamp(1rem,5cqw,1.8rem)] font-extrabold leading-tight text-white"
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.9)' }}
            >
              {project.title}
            </p>
          </div>
        )}

        {/* Scene ticks */}
        <div className="absolute inset-x-0 top-0 z-[5] flex gap-1 p-2">
          {scenes.map((s, i) => (
            <div key={s.id} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full bg-cyan-300 transition-[width] duration-100"
                style={{
                  width:
                    i < sceneIndex
                      ? '100%'
                      : i === sceneIndex
                        ? `${clamp((sceneTime / (sceneDurations[i] || 1)) * 100, 0, 100)}%`
                        : '0%',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const enlargedModal = isEnlarged && (
    createPortal(
      <div
        className="fixed inset-0 z-[9995] flex flex-col items-center justify-between bg-black/90 p-4 backdrop-blur-xl animate-fade-in sm:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsEnlarged(false);
        }}
      >
        {/* Top Header */}
        <div className="flex w-full max-w-5xl items-center justify-between gap-4 pb-2">
          <div className="flex min-w-0 items-center gap-3">
            <span className="truncate font-display text-sm font-bold text-white">
              {project.title || project.topic || 'Video Preview'}
            </span>
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/60">
              {project.aspect}
            </span>
            {scenes.length > 0 && (
              <span className="text-xs text-white/40">
                Scene {sceneIndex + 1} of {scenes.length}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEnlarged(false)}
              title="Minimize preview (Esc)"
              aria-label="Minimize preview"
              className="focus-ring flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:border-white/25 hover:text-white"
            >
              <Minimize2 className="h-4 w-4" />
              <span className="hidden sm:inline">Minimize</span>
            </button>
            <button
              type="button"
              onClick={() => setIsEnlarged(false)}
              title="Close (Esc)"
              aria-label="Close"
              className="focus-ring rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Central Expanded Viewport */}
        <div className="flex w-full flex-1 min-h-0 items-center justify-center py-2">
          <div
            className={cn(
              'relative max-h-full max-w-full',
              project.aspect === '9:16' && 'h-[min(72vh,700px)] aspect-[9/16]',
              project.aspect === '16:9' && 'w-[min(90vw,980px)] aspect-video max-h-[72vh]',
              project.aspect === '1:1' && 'h-[min(70vh,620px)] aspect-square',
            )}
          >
            {renderFrameContent(true)}
          </div>
        </div>

        {/* Bottom Control Bar */}
        <div className="flex w-full max-w-3xl flex-col items-center gap-3 pt-2">
          {/* Scene selector chips (when scenes exist) */}
          {scenes.length > 1 && (
            <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 overflow-x-auto py-1">
              {scenes.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jumpToScene(i)}
                  className={cn(
                    'focus-ring rounded-md px-2.5 py-1 text-xs font-semibold transition-all',
                    i === sceneIndex
                      ? 'border border-cyan-400/60 bg-cyan-400/20 text-cyan-200 shadow-sm'
                      : 'border border-white/10 bg-white/5 text-white/50 hover:border-white/20 hover:text-white',
                  )}
                >
                  Scene {i + 1}
                </button>
              ))}
            </div>
          )}

          <div className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={prevScene}
                disabled={sceneIndex === 0}
                title="Previous scene (Left Arrow)"
                aria-label="Previous scene"
                className="focus-ring rounded-lg p-2 text-white/60 transition-colors hover:text-white disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => (isPlaying ? stop() : setIsPlaying(true))}
                className="focus-ring flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-2 text-sm font-bold text-black shadow-md transition-all hover:brightness-110"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>

              <button
                type="button"
                onClick={nextScene}
                disabled={sceneIndex >= scenes.length - 1}
                title="Next scene (Right Arrow)"
                aria-label="Next scene"
                className="focus-ring rounded-lg p-2 text-white/60 transition-colors hover:text-white disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={reset}
                title="Restart preview"
                aria-label="Restart preview"
                className="focus-ring rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 transition-colors hover:border-white/25 hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-mono text-xs tabular-nums text-white/70">
                {formatDuration(elapsed)} / {formatDuration(totalDuration)}
              </span>
              <span className="hidden text-[11px] text-white/30 md:inline">
                Space to Play · Esc to Close · ←/→ to Skip
              </span>
            </div>
          </div>
        </div>
      </div>,
      document.body,
    )
  );

  if (!scenes.length) {
    return (
      <div className={cn('space-y-3', className)}>
        {renderFrameContent(false)}

        <div className="flex items-center justify-between gap-2">
          <p className="text-left text-[11px] leading-relaxed text-white/35">
            Framing and captions preview live.
          </p>
          <button
            type="button"
            onClick={() => setIsEnlarged(true)}
            title="Enlarge preview"
            aria-label="Enlarge preview"
            className="focus-ring flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-cyan-400/40 hover:text-white"
          >
            <Maximize2 className="h-3 w-3" />
            Enlarge
          </button>
        </div>

        {enlargedModal}
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {renderFrameContent(false)}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (isPlaying ? stop() : setIsPlaying(true))}
          className="focus-ring flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-sm text-white transition-colors hover:border-cyan-400/40"
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          onClick={reset}
          title="Restart"
          aria-label="Restart preview"
          className="focus-ring rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 transition-colors hover:border-white/25 hover:text-white"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setIsEnlarged(true)}
          title="Enlarge preview"
          aria-label="Enlarge preview"
          className="focus-ring flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white/70 transition-colors hover:border-cyan-400/40 hover:text-white"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Enlarge</span>
        </button>
        <span className="ml-auto font-mono text-xs tabular-nums text-white/45">
          {formatDuration(elapsed)} / {formatDuration(totalDuration)}
        </span>
      </div>

      {scene?.audioUrl && <audio ref={audioRef} src={scene.audioUrl} preload="auto" className="hidden" />}
      {musicUrl && <audio ref={musicRef} src={musicUrl} loop preload="auto" className="hidden" />}

      {enlargedModal}
    </div>
  );
};
