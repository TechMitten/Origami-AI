import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  Copy,
  Gauge,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';

export interface TTSAudioPlayerProps {
  src: string;
  blob?: Blob;
  duration?: number;
  voiceName?: string;
  voiceFlag?: string;
  text?: string;
  fileSize?: number;
  className?: string;
  onEnded?: () => void;
}

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 2.0] as const;

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

async function extractWaveformPeaks(blobOrUrl: Blob | string, numBars = 56): Promise<number[]> {
  try {
    let arrayBuffer: ArrayBuffer;
    if (blobOrUrl instanceof Blob) {
      arrayBuffer = await blobOrUrl.arrayBuffer();
    } else {
      const res = await fetch(blobOrUrl);
      arrayBuffer = await res.arrayBuffer();
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('AudioContext not supported');
    }

    const audioCtx = new AudioContextClass();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const rawData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(rawData.length / numBars);
    const peaks: number[] = [];

    for (let i = 0; i < numBars; i++) {
      const start = i * blockSize;
      let sum = 0;
      const count = Math.min(blockSize, rawData.length - start);
      for (let j = 0; j < count; j++) {
        sum += Math.abs(rawData[start + j] || 0);
      }
      peaks.push(count > 0 ? sum / count : 0);
    }

    void audioCtx.close();

    const max = Math.max(...peaks, 0.001);
    return peaks.map((p) => Math.max(0.16, Math.min(1, Math.pow(p / max, 0.75))));
  } catch {
    // Fallback: organic visual wave pattern
    return Array.from({ length: numBars }, (_, i) => {
      const t = (i / numBars) * Math.PI * 4;
      const wave = Math.abs(Math.sin(t) * 0.5 + Math.cos(t * 1.5) * 0.3 + 0.4);
      return Math.max(0.18, Math.min(1, wave));
    });
  }
}

export const TTSAudioPlayer: React.FC<TTSAudioPlayerProps> = ({
  src,
  blob,
  duration: initialDuration = 0,
  voiceName,
  voiceFlag = '🎙️',
  text,
  fileSize,
  className = '',
  onEnded,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [speedIndex, setSpeedIndex] = useState(1); // default 1.0x
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [showRemaining, setShowRemaining] = useState(false);
  const [copied, setCopied] = useState(false);

  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [peaks, setPeaks] = useState<number[]>(() =>
    Array.from({ length: 56 }, () => 0.3),
  );

  const playbackSpeed = SPEED_OPTIONS[speedIndex];

  // Extract real waveform on mount or src change
  useEffect(() => {
    let active = true;
    void extractWaveformPeaks(blob || src, 56).then((extractedPeaks) => {
      if (active) setPeaks(extractedPeaks);
    });
    return () => {
      active = false;
    };
  }, [src, blob]);

  // Sync initial duration if provided
  useEffect(() => {
    if (initialDuration > 0) {
      setDuration(initialDuration);
    }
  }, [initialDuration]);

  // Handle Play/Pause
  const togglePlay = useCallback(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      void audioRef.current.play().catch((e) => console.warn('[TTSAudioPlayer] Play failed:', e));
    }
  }, [isPlaying]);

  // Handle Speed Change
  const cycleSpeed = useCallback(() => {
    setSpeedIndex((prev) => {
      const next = (prev + 1) % SPEED_OPTIONS.length;
      if (audioRef.current) {
        audioRef.current.playbackRate = SPEED_OPTIONS[next];
      }
      return next;
    });
  }, []);

  // Handle Jump
  const jumpTime = useCallback(
    (delta: number) => {
      if (!audioRef.current) return;
      const nextTime = Math.max(0, Math.min(duration || 0, audioRef.current.currentTime + delta));
      audioRef.current.currentTime = nextTime;
      setCurrentTime(nextTime);
    },
    [duration],
  );

  // Handle Seek from Waveform
  const handleSeekFromEvent = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | MouseEvent | React.TouchEvent<HTMLDivElement> | TouchEvent) => {
      if (!waveformRef.current || !duration) return;
      const rect = waveformRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const nextTime = pos * duration;

      if (audioRef.current) {
        audioRef.current.currentTime = nextTime;
      }
      setCurrentTime(nextTime);
    },
    [duration],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      isDraggingRef.current = true;
      handleSeekFromEvent(e);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (isDraggingRef.current) {
          handleSeekFromEvent(moveEvent);
        }
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [handleSeekFromEvent],
  );

  const handleWaveformMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!waveformRef.current) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPosition(pos);
  }, []);

  const handleWaveformMouseLeave = useCallback(() => {
    setHoverPosition(null);
  }, []);

  // Handle Volume
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = val === 0;
    }
    setIsMuted(val === 0);
  }, []);

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.muted = false;
      setIsMuted(false);
      audioRef.current.volume = volume || 1;
    } else {
      audioRef.current.muted = true;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const toggleLoop = useCallback(() => {
    setIsLooping((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.loop = next;
      }
      return next;
    });
  }, []);

  const handleCopyText = useCallback(() => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hoverTime = hoverPosition !== null && duration > 0 ? hoverPosition * duration : null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#0e1015]/90 p-5 shadow-2xl backdrop-blur-xl transition-all sm:p-6 ${className}`}
      role="region"
      aria-label="TTS Audio Player"
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={() => {
          if (audioRef.current && !isDraggingRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && (!duration || duration <= 0)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onDurationChange={() => {
          if (audioRef.current && audioRef.current.duration > 0) {
            setDuration(audioRef.current.duration);
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          onEnded?.();
        }}
        className="hidden"
      />

      {/* Header Info */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-300 shadow-inner shadow-cyan-500/10">
            {isPlaying ? (
              <span className="flex items-end gap-0.5">
                <span className="h-3 w-0.5 animate-pulse rounded-full bg-cyan-400" />
                <span className="h-4 w-0.5 animate-pulse rounded-full bg-cyan-300 [animation-delay:150ms]" />
                <span className="h-2.5 w-0.5 animate-pulse rounded-full bg-cyan-400 [animation-delay:300ms]" />
              </span>
            ) : (
              <AudioLines className="h-4.5 w-4.5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs">{voiceFlag}</span>
              <span className="text-sm font-bold text-white">
                {voiceName ? `${voiceName} Narration` : 'Generated Narration'}
              </span>
              <span className="rounded-md border border-cyan-400/30 bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-cyan-200">
                24 kHz WAV
              </span>
            </div>
            <p className="font-mono text-[11px] text-white/40">
              {formatTime(duration)}
              {fileSize ? ` · ${formatBytes(fileSize)}` : ''}
              {' · On-device TTS'}
            </p>
          </div>
        </div>

        {text && (
          <button
            type="button"
            onClick={handleCopyText}
            title="Copy narration script"
            className="focus-ring flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-300">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy script</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Interactive Waveform Scrubber */}
      <div className="group relative mb-5">
        {/* Hover Time Tooltip */}
        {hoverTime !== null && (
          <div
            className="pointer-events-none absolute -top-8 -translate-x-1/2 rounded-md border border-white/15 bg-black/90 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-300 shadow-xl backdrop-blur-md transition-opacity"
            style={{ left: `${(hoverPosition ?? 0) * 100}%` }}
          >
            {formatTime(hoverTime)}
          </div>
        )}

        <div
          ref={waveformRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleWaveformMouseMove}
          onMouseLeave={handleWaveformMouseLeave}
          className="relative flex h-16 w-full cursor-pointer select-none items-center justify-between gap-[2px] rounded-xl border border-white/5 bg-black/40 px-3 py-2 transition-colors hover:border-cyan-400/20 hover:bg-black/60 sm:gap-1"
          role="slider"
          aria-label="Audio seeker"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
        >
          {/* Waveform Bars */}
          {peaks.map((peak, index) => {
            const barPercent = (index / peaks.length) * 100;
            const isPlayed = barPercent <= progressPercent;
            const isHovered = hoverPosition !== null && barPercent <= hoverPosition * 100;

            return (
              <div
                key={index}
                className="relative flex h-full flex-1 items-center justify-center"
              >
                <div
                  className={`w-full max-w-[4px] rounded-full transition-all duration-100 ${
                    isPlayed
                      ? 'bg-gradient-to-t from-cyan-400 to-blue-400 shadow-[0_0_8px_rgba(34,211,238,0.4)]'
                      : isHovered
                        ? 'bg-white/40'
                        : 'bg-white/15 group-hover:bg-white/25'
                  }`}
                  style={{
                    height: `${Math.round(peak * 85 + 15)}%`,
                  }}
                />
              </div>
            );
          })}

          {/* Scrubber Playhead Line */}
          <div
            className="pointer-events-none absolute top-1 bottom-1 w-[2px] rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)] transition-all"
            style={{ left: `calc(${progressPercent}% - 1px)` }}
          >
            <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full border border-black bg-cyan-300 shadow-md" />
          </div>
        </div>
      </div>

      {/* Playback Controls & Status */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Play/Pause, Skips, & Time */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause narration' : 'Play narration'}
            className="focus-ring flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 font-bold text-black shadow-lg shadow-cyan-500/25 transition-all hover:scale-105 hover:brightness-110 active:scale-95 sm:h-12 sm:w-12 sm:rounded-2xl"
          >
            {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current pl-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => jumpTime(-5)}
            title="Skip backward 5s"
            aria-label="Skip backward 5 seconds"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => jumpTime(5)}
            title="Skip forward 5s"
            aria-label="Skip forward 5 seconds"
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white active:scale-95"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowRemaining((prev) => !prev)}
            title="Click to toggle remaining time"
            className="ml-1 flex items-center font-mono text-xs font-semibold tabular-nums text-white/80 transition-colors hover:text-cyan-300"
          >
            <span>{formatTime(currentTime)}</span>
            <span className="mx-1 text-white/30">/</span>
            <span>
              {showRemaining
                ? `-${formatTime(Math.max(0, duration - currentTime))}`
                : formatTime(duration)}
            </span>
          </button>
        </div>

        {/* Right: Speed, Loop, Volume */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Speed Toggle */}
          <button
            type="button"
            onClick={cycleSpeed}
            title="Cycle playback speed"
            aria-label={`Playback speed: ${playbackSpeed}x`}
            className="focus-ring flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-xs font-bold text-white/80 transition-colors hover:border-cyan-400/30 hover:bg-white/10 hover:text-cyan-200 active:scale-95"
          >
            <Gauge className="h-3.5 w-3.5 text-cyan-400" />
            <span>{playbackSpeed}×</span>
          </button>

          {/* Loop Toggle */}
          <button
            type="button"
            onClick={toggleLoop}
            title={isLooping ? 'Looping enabled' : 'Enable loop'}
            aria-label={isLooping ? 'Looping enabled' : 'Enable loop'}
            className={`focus-ring flex h-9 w-9 items-center justify-center rounded-xl border transition-colors active:scale-95 ${
              isLooping
                ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-300'
                : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Repeat className="h-4 w-4" />
          </button>

          {/* Volume Control */}
          <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2 py-1.5">
            <button
              type="button"
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              className="text-white/60 transition-colors hover:text-white"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4 text-red-400" />
              ) : volume < 0.5 ? (
                <Volume1 className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              aria-label="Volume slider"
              className="h-1 w-14 cursor-pointer accent-cyan-400 transition-opacity sm:w-18"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
