import { useState, useEffect, useRef, useCallback } from 'react';

export interface VideoSceneTrack {
  audioUrl?: string;
  timestampStartSeconds: number;
  durationSeconds: number;
  effectiveStartSeconds: number;
  effectiveDurationSeconds: number;
  audioDurationSeconds?: number;
}

/**
 * Shared video + scene-audio sync hook.
 *
 * Uses the EXACT same state machine as SimplePreview:
 *   rAF delta loop → elapsedTime state → effects that drive <video> and <audio>
 *
 * If you ever change the sync logic in SimplePreview, mirror that change here,
 * and vice versa. This hook is the single source of truth for the algorithm so
 * that SceneAlignmentPage and SimplePreview can never diverge.
 */
export function useVideoSceneSync(scenes: VideoSceneTrack[], totalDuration: number) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);

  // Stable refs so onVideoLoadedMetadata doesn't need to re-create on every render
  const isPlayingRef = useRef(isPlaying);
  const elapsedTimeRef = useRef(elapsedTime);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { elapsedTimeRef.current = elapsedTime; }, [elapsedTime]);

  /**
   * Mirrors SimplePreview.mapEffectiveToOriginalVideoState exactly.
   * Maps a position on the stretched effective timeline back to the native
   * video timestamp, plus an `isFrozen` flag that is true while the video
   * should hold its last frame so TTS can finish speaking.
   */
  const mapEffectiveToOriginalVideoState = useCallback(
    (effectiveTime: number): { time: number; isFrozen: boolean } => {
      if (!scenes.length) return { time: Math.max(0, effectiveTime), isFrozen: false };

      const sorted = [...scenes].sort((a, b) => a.effectiveStartSeconds - b.effectiveStartSeconds);
      let previousEffectiveEnd = 0;
      let previousOriginalEnd = 0;

      for (const scene of sorted) {
        const effectiveStart = Math.max(0, scene.effectiveStartSeconds || 0);
        const effectiveDur = Math.max(0.05, scene.effectiveDurationSeconds || 0.05);
        const effectiveEnd = effectiveStart + effectiveDur;

        const originalStart = Math.max(0, scene.timestampStartSeconds || 0);
        const originalDur = Math.max(0.05, scene.durationSeconds || 0.05);
        const originalEnd = originalStart + originalDur;

        if (effectiveTime < effectiveStart) {
          return { time: Math.max(0, previousOriginalEnd + (effectiveTime - previousEffectiveEnd)), isFrozen: false };
        }

        if (effectiveTime >= effectiveStart && effectiveTime < effectiveEnd) {
          const localEffective = Math.max(0, effectiveTime - effectiveStart);

          // Prefer natural playback and freeze the last frame for extra time.
          if (effectiveDur > originalDur) {
            const played = Math.min(localEffective, originalDur);
            return { time: originalStart + played, isFrozen: localEffective >= originalDur };
          }

          // If a scene is shorter than source duration, compress proportionally.
          const local = localEffective / effectiveDur;
          return { time: originalStart + (local * originalDur), isFrozen: false };
        }

        previousEffectiveEnd = effectiveEnd;
        previousOriginalEnd = originalEnd;
      }

      return { time: Math.max(0, previousOriginalEnd + (effectiveTime - previousEffectiveEnd)), isFrozen: false };
    },
    [scenes]
  );

  // ── Main Animation Loop ── identical to SimplePreview ──────────────────────
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      lastFrameTimeRef.current = 0;
      return;
    }

    if (lastFrameTimeRef.current === 0) {
      lastFrameTimeRef.current = performance.now();
    }

    const animate = (timestamp: number) => {
      if (!isPlaying) return;

      const delta = (timestamp - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = timestamp;

      setElapsedTime(prev => {
        const nextTime = prev + delta;
        if (nextTime >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return nextTime;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, totalDuration]);

  // ── Video Sync Effect ── identical to SimplePreview ────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const mapped = mapEffectiveToOriginalVideoState(elapsedTime);
    if (Math.abs(video.currentTime - mapped.time) > 0.2) {
      video.currentTime = mapped.time;
    }

    // Freeze windows: hold the last frame with the video paused.
    if (mapped.isFrozen) {
      if (!video.paused) video.pause();
      return;
    }

    if (isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [elapsedTime, isPlaying, mapEffectiveToOriginalVideoState]);

  // ── Audio Sync Effect ── identical to SimplePreview's scene TTS section ────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const activeScene = scenes.find(scene => {
      const sceneEnd = scene.effectiveStartSeconds + scene.effectiveDurationSeconds;
      return elapsedTime >= scene.effectiveStartSeconds && elapsedTime < sceneEnd;
    });

    if (activeScene?.audioUrl) {
      const desiredSrc = activeScene.audioUrl;
      const currentSrc = audio.src;
      if (!currentSrc.endsWith(desiredSrc) && currentSrc !== desiredSrc) {
        audio.src = desiredSrc;
      }

      const localSceneTime = Math.max(0, elapsedTime - activeScene.effectiveStartSeconds);
      const sceneAudioDuration = activeScene.audioDurationSeconds ?? activeScene.effectiveDurationSeconds;

      if (localSceneTime < sceneAudioDuration) {
        if (Math.abs(audio.currentTime - localSceneTime) > 0.2) {
          audio.currentTime = localSceneTime;
        }
        if (isPlaying && audio.paused) {
          audio.play().catch(() => {});
        } else if (!isPlaying && !audio.paused) {
          audio.pause();
        }
      } else if (!audio.paused) {
        audio.pause();
      }
    } else {
      audio.pause();
      audio.src = '';
    }
  }, [elapsedTime, isPlaying, scenes]);

  // ── Controls ───────────────────────────────────────────────────────────────

  /** Toggle play/pause — mirrors SimplePreview.togglePlayPause */
  const togglePlayPause = useCallback(() => {
    setIsPlaying(prev => {
      lastFrameTimeRef.current = 0;
      return !prev;
    });
  }, []);

  /** Seek to an effective-timeline position */
  const seekTo = useCallback((effectiveSeconds: number) => {
    setElapsedTime(Math.max(0, Math.min(effectiveSeconds, totalDuration)));
  }, [totalDuration]);

  /** Skip forward 5 s — mirrors SimplePreview.skipForward */
  const skipForward = useCallback(() => {
    setElapsedTime(prev => Math.min(Math.max(0, totalDuration - 0.1), prev + 5));
  }, [totalDuration]);

  /** Skip back 5 s — mirrors SimplePreview.skipBack */
  const skipBack = useCallback(() => {
    setElapsedTime(prev => Math.max(0, prev - 5));
  }, []);

  /**
   * Pass as `onLoadedMetadata` to the <video> element.
   * Mirrors SimplePreview's onLoadedMetadata handler: initialises currentTime
   * and starts/pauses the video once its metadata is available.
   */
  const onVideoLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const mapped = mapEffectiveToOriginalVideoState(elapsedTimeRef.current);
    video.currentTime = mapped.time;
    if (isPlayingRef.current && !mapped.isFrozen) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [mapEffectiveToOriginalVideoState]);

  return {
    videoRef,
    audioRef,
    isPlaying,
    elapsedTime,
    seekTo,
    togglePlayPause,
    skipForward,
    skipBack,
    onVideoLoadedMetadata,
  };
}
