import { getFFmpeg, resetFFmpeg, terminateFFmpeg } from './ffmpegLoader';
import type { CaptionChunk } from './shortsCaptions';

/**
 * Renderer for AI-generated short-form video.
 *
 * Pipeline: still images are animated on a 2D canvas (Ken Burns + crossfade +
 * burned-in captions), encoded to an H.264 elementary stream with WebCodecs, and
 * muxed against an OfflineAudioContext mix of the Kokoro voiceover and optional
 * background music by FFmpeg.wasm.
 *
 * WebCodecs is faster than realtime and frame-exact. Where VideoEncoder is
 * unavailable (currently Firefox and older Safari) it falls back to
 * MediaRecorder, which is realtime-bound but still produces a valid MP4 after
 * an FFmpeg transcode.
 *
 * This is deliberately separate from BrowserVideoRenderer: that renderer's
 * WebCodecs path hardcodes landscape 720p/1080p and ignores aspectRatio, and
 * retrofitting portrait output into 2000 lines of slide-specific timeline code
 * would risk the existing slide export.
 */

export type ShortsAspect = '9:16' | '16:9' | '1:1';
export type ShortsCaptionStyle = 'bold-pop' | 'clean-lower' | 'karaoke';

export interface ShortsRenderScene {
  /** Generated still. When absent a styled gradient placeholder is drawn. */
  imageBlob?: Blob | null;
  /** Generated AI video clip. Takes priority over imageBlob when present. */
  videoBlob?: Blob | null;
  /** Object URL of the Kokoro WAV for this scene. */
  audioUrl?: string | null;
  /** Measured audio duration in seconds. */
  audioDuration: number;
  narration: string;
  captions: CaptionChunk[];
}

export interface ShortsRenderOptions {
  scenes: ShortsRenderScene[];
  aspect: ShortsAspect;
  title?: string;
  showTitleCard?: boolean;
  captionsEnabled?: boolean;
  captionStyle?: ShortsCaptionStyle;
  accentColor?: string;
  music?: { blob: Blob; volume: number } | null;
  voiceVolume?: number;
  onProgress?: (progress: number, status: string) => void;
  signal?: AbortSignal;
}

export const shortsEvents = new EventTarget();

export interface ShortsProgressEventDetail {
  progress: number;
  status: string;
}

export const SHORTS_DIMENSIONS: Record<ShortsAspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};

const FPS = 30;
const AUDIO_SAMPLE_RATE = 48_000;
/** Silence appended after each scene's narration so lines do not collide. */
const SCENE_TAIL_SEC = 0.28;
const MIN_SCENE_SEC = 1.2;
const CROSSFADE_SEC = 0.4;
const TITLE_CARD_SEC = 1.6;
const DEFAULT_ACCENT = '#22d3ee';

interface PreparedScene {
  bitmap: ImageBitmap | null;
  /** Pre-sampled, output-cropped frames for a video-clip scene. Takes priority over `bitmap` when set. */
  videoFrames: ImageBitmap[] | null;
  videoFrameIntervalSec: number;
  videoClipDuration: number;
  start: number;
  duration: number;
  captions: CaptionChunk[];
  /** Ken Burns endpoints, alternating per scene so motion does not feel looped. Unused for video-clip scenes. */
  zoomFrom: number;
  zoomTo: number;
  panFromX: number;
  panToX: number;
  panFromY: number;
  panToY: number;
}

/** Video clips are pre-sampled at a low, fixed rate rather than seeked live per output
 * frame — an HTMLVideoElement seek costs tens of ms, which is far too slow to pay once
 * per encoded frame. Sampling once during preparation keeps the hot encode loop a plain
 * bitmap blit, identical in cost to the existing still-image path. */
const VIDEO_SAMPLE_FPS = 8;
const MAX_VIDEO_SAMPLE_FRAMES = 24;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export class ShortsRenderAbortedError extends Error {
  constructor() {
    super('Render aborted');
    this.name = 'ShortsRenderAbortedError';
  }
}

export class ShortsVideoRenderer {
  private aborted = false;

  // --- progress ---------------------------------------------------------------

  private emit(progress: number, status: string, onProgress?: ShortsRenderOptions['onProgress']) {
    const safe = clamp(progress, 0, 100);
    onProgress?.(safe, status);
    shortsEvents.dispatchEvent(
      new CustomEvent<ShortsProgressEventDetail>('shorts-progress', {
        detail: { progress: safe, status },
      }),
    );
  }

  private ensureNotAborted(signal?: AbortSignal) {
    if (this.aborted || signal?.aborted) throw new ShortsRenderAbortedError();
  }

  // --- preparation ------------------------------------------------------------

  /** Seek an offscreen video element to `time` and wait for the frame to be ready. */
  private seekVideoTo(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
      };
      const onSeeked = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('Video seek failed.')); };
      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
      video.currentTime = time;
    });
  }

  /**
   * Decode a generated video clip into a short sequence of output-cropped bitmaps.
   * The cover-fit crop is done once here (at sample time) rather than per output
   * frame, so the draw loop's video path is a plain blit like the image path.
   */
  private async sampleVideoFrames(
    blob: Blob,
    width: number,
    height: number,
    signal?: AbortSignal,
  ): Promise<{ frames: ImageBitmap[]; frameIntervalSec: number; clipDuration: number }> {
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          video.removeEventListener('loadedmetadata', onLoaded);
          video.removeEventListener('error', onError);
        };
        const onLoaded = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error('Could not load the generated video clip.')); };
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
        video.addEventListener('error', onError, { once: true });
      });

      const clipDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (!(clipDuration > 0) || !video.videoWidth || !video.videoHeight) {
        throw new Error('Generated video clip has no readable frames.');
      }

      const frameCount = Math.max(1, Math.min(MAX_VIDEO_SAMPLE_FRAMES, Math.ceil(clipDuration * VIDEO_SAMPLE_FPS)));
      const frameIntervalSec = clipDuration / frameCount;

      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = width;
      sampleCanvas.height = height;
      const sampleCtx = sampleCanvas.getContext('2d', { alpha: false });
      if (!sampleCtx) throw new Error('Could not create a 2D context to sample video frames.');

      // Cover-fit, matching the still-image draw path.
      const bw = video.videoWidth;
      const bh = video.videoHeight;
      const scale = Math.max(width / bw, height / bh);
      const dw = bw * scale;
      const dh = bh * scale;
      const dx = (width - dw) / 2;
      const dy = (height - dh) / 2;

      const frames: ImageBitmap[] = [];
      for (let i = 0; i < frameCount; i += 1) {
        if (signal?.aborted) throw new ShortsRenderAbortedError();
        const t = Math.min(clipDuration - 0.001, i * frameIntervalSec);
        await this.seekVideoTo(video, t);
        sampleCtx.drawImage(video, dx, dy, dw, dh);
        frames.push(await createImageBitmap(sampleCanvas));
      }

      return { frames, frameIntervalSec, clipDuration };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private async prepareScenes(
    options: ShortsRenderOptions,
    width: number,
    height: number,
  ): Promise<{ scenes: PreparedScene[]; totalDuration: number }> {
    const prepared: PreparedScene[] = [];
    let cursor = 0;

    for (let i = 0; i < options.scenes.length; i += 1) {
      this.ensureNotAborted(options.signal);
      const scene = options.scenes[i];

      let bitmap: ImageBitmap | null = null;
      let videoFrames: ImageBitmap[] | null = null;
      let videoFrameIntervalSec = 0;
      let videoClipDuration = 0;

      if (scene.videoBlob) {
        try {
          const sampled = await this.sampleVideoFrames(scene.videoBlob, width, height, options.signal);
          videoFrames = sampled.frames;
          videoFrameIntervalSec = sampled.frameIntervalSec;
          videoClipDuration = sampled.clipDuration;
        } catch (e) {
          if (e instanceof ShortsRenderAbortedError) throw e;
          // A single unreadable clip must not sink the whole render — the frame
          // loop falls back to a gradient card for this scene.
          console.warn(`[Shorts] Scene ${i + 1}: video clip could not be decoded, using a placeholder.`, e);
        }
      } else if (scene.imageBlob) {
        try {
          bitmap = await createImageBitmap(scene.imageBlob);
        } catch (e) {
          console.warn(`[Shorts] Scene ${i + 1}: image could not be decoded, using a placeholder.`, e);
        }
      }

      const duration = Math.max(MIN_SCENE_SEC, (scene.audioDuration || 0) + SCENE_TAIL_SEC);

      // Alternate zoom direction and pan axis so consecutive scenes read as
      // distinct shots rather than the same move repeated. Unused for video scenes.
      const zoomIn = i % 2 === 0;
      const horizontal = i % 4 < 2;
      const drift = 0.28;

      prepared.push({
        bitmap,
        videoFrames,
        videoFrameIntervalSec,
        videoClipDuration,
        start: cursor,
        duration,
        captions: scene.captions ?? [],
        zoomFrom: zoomIn ? 1.0 : 1.12,
        zoomTo: zoomIn ? 1.12 : 1.0,
        panFromX: horizontal ? -drift : 0,
        panToX: horizontal ? drift : 0,
        panFromY: horizontal ? 0 : -drift,
        panToY: horizontal ? 0 : drift,
      });

      cursor += duration;
    }

    return { scenes: prepared, totalDuration: cursor };
  }

  // --- drawing ----------------------------------------------------------------

  /** Draw one scene's background at local time `t` seconds, at the given alpha. */
  private drawSceneImage(
    ctx: CanvasRenderingContext2D,
    scene: PreparedScene,
    t: number,
    width: number,
    height: number,
    alpha: number,
    sceneIndex: number,
  ) {
    ctx.save();
    ctx.globalAlpha = alpha;

    if (scene.videoFrames && scene.videoFrames.length) {
      // Already output-cropped at sample time — no Ken Burns needed, the clip
      // supplies its own motion. Loop if the scene needs more time than the
      // clip provides; hold the last frame if the clip runs longer than needed.
      const localT = scene.videoClipDuration > 0 ? t % scene.videoClipDuration : 0;
      const index = clamp(
        Math.floor(localT / (scene.videoFrameIntervalSec || 1)),
        0,
        scene.videoFrames.length - 1,
      );
      ctx.drawImage(scene.videoFrames[index], 0, 0, width, height);
      ctx.restore();
      return;
    }

    if (!scene.bitmap) {
      // Placeholder: a deterministic dark gradient keyed to the scene index, so a
      // failed image still looks intentional rather than broken.
      const hue = (sceneIndex * 47) % 360;
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, `hsl(${hue}, 45%, 14%)`);
      gradient.addColorStop(1, `hsl(${(hue + 40) % 360}, 55%, 6%)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
      return;
    }

    const progress = easeInOutSine(clamp(scene.duration > 0 ? t / scene.duration : 0, 0, 1));
    const zoom = scene.zoomFrom + (scene.zoomTo - scene.zoomFrom) * progress;
    const panX = scene.panFromX + (scene.panToX - scene.panFromX) * progress;
    const panY = scene.panFromY + (scene.panToY - scene.panFromY) * progress;

    const bw = scene.bitmap.width;
    const bh = scene.bitmap.height;

    // Cover-fit, then apply the Ken Burns zoom on top.
    const scale = Math.max(width / bw, height / bh) * zoom;
    const dw = bw * scale;
    const dh = bh * scale;

    // Pan only within the overflow so we never expose an empty edge.
    const overflowX = Math.max(0, (dw - width) / 2);
    const overflowY = Math.max(0, (dh - height) / 2);
    const dx = (width - dw) / 2 + panX * overflowX;
    const dy = (height - dh) / 2 + panY * overflowY;

    ctx.drawImage(scene.bitmap, dx, dy, dw, dh);
    ctx.restore();
  }

  /** Bottom scrim so captions stay legible over bright imagery. */
  private drawScrim(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const gradient = ctx.createLinearGradient(0, height * 0.45, 0, height);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,0.35)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, height * 0.45, width, height * 0.55);
  }

  /** Split a chunk into rendered lines that fit the safe width. */
  private layoutCaptionLines(
    ctx: CanvasRenderingContext2D,
    words: CaptionChunk['words'],
    maxWidth: number,
  ): Array<CaptionChunk['words']> {
    const lines: Array<CaptionChunk['words']> = [];
    let current: CaptionChunk['words'] = [];

    for (const word of words) {
      const candidate = [...current, word].map((w) => w.text).join(' ');
      if (current.length > 0 && ctx.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = [word];
      } else {
        current.push(word);
      }
    }
    if (current.length) lines.push(current);
    return lines;
  }

  private drawCaptions(
    ctx: CanvasRenderingContext2D,
    chunk: CaptionChunk,
    localTime: number,
    width: number,
    height: number,
    style: ShortsCaptionStyle,
    accent: string,
  ) {
    const isClean = style === 'clean-lower';
    const isBoldPop = style === 'bold-pop';
    const isKaraoke = style === 'karaoke';

    const fontSize = Math.round(width * (isClean ? 0.048 : isBoldPop ? 0.076 : 0.072));
    const weight = isClean ? 600 : isBoldPop ? 900 : 800;
    ctx.font = `${weight} ${fontSize}px Roboto, "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxWidth = width * (isClean ? 0.80 : 0.84);
    // For bold-pop, format words in uppercase for measurement and rendering
    const wordsForLayout = isBoldPop
      ? chunk.words.map((w) => ({ ...w, text: w.text.toUpperCase() }))
      : chunk.words;
    const lines = this.layoutCaptionLines(ctx, wordsForLayout, maxWidth);
    const lineHeight = fontSize * (isClean ? 1.25 : 1.18);

    // Pop-in over the first 140ms of the chunk.
    const age = localTime - chunk.start;
    const popT = clamp(age / 0.14, 0, 1);
    const scale = isBoldPop ? 0.86 + easeOutBack(popT) * 0.14 : 1;
    const fadeIn = easeOutCubic(clamp(age / 0.1, 0, 1));

    const baselineY = isClean ? height * 0.84 : height * 0.72;
    const blockHeight = lines.length * lineHeight;
    const startY = baselineY - blockHeight / 2 + lineHeight / 2;

    ctx.save();
    ctx.globalAlpha = fadeIn;
    ctx.translate(width / 2, baselineY);
    ctx.scale(scale, scale);
    ctx.translate(-width / 2, -baselineY);

    // If clean-lower, draw a frosted pill background container behind the captions
    if (isClean) {
      let maxLineWidth = 0;
      lines.forEach((line) => {
        const lineText = line.map((w) => w.text).join(' ');
        const lw = ctx.measureText(lineText).width;
        if (lw > maxLineWidth) maxLineWidth = lw;
      });

      const padX = fontSize * 0.9;
      const padY = fontSize * 0.45;
      const pillW = maxLineWidth + padX * 2;
      const pillH = blockHeight + padY * 2;
      const pillX = width / 2 - pillW / 2;
      const pillY = baselineY - pillH / 2;
      const radius = Math.min(16, pillH / 2);

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(pillX, pillY, pillW, pillH, radius);
      } else {
        ctx.rect(pillX, pillY, pillW, pillH);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    lines.forEach((line, lineIndex) => {
      const y = startY + lineIndex * lineHeight;
      const lineText = line.map((w) => w.text).join(' ');
      const lineWidth = ctx.measureText(lineText).width;
      let x = width / 2 - lineWidth / 2;

      ctx.textAlign = 'left';

      line.forEach((word, wordIndex) => {
        const spacer = wordIndex === line.length - 1 ? '' : ' ';
        const wordWidth = ctx.measureText(word.text + spacer).width;
        const isActive = localTime >= word.start && localTime < word.end;
        const isSpoken = localTime >= word.start;

        if (isClean) {
          ctx.lineWidth = Math.max(3, fontSize * 0.08);
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
          ctx.shadowColor = 'transparent';
          ctx.strokeText(word.text, x, y);

          ctx.fillStyle = isActive ? (accent || '#67E8F9') : '#FFFFFF';
          ctx.fillText(word.text, x, y);
        } else if (isBoldPop) {
          // Bold Pop: punchy yellow active word with heavy black stroke
          if (isActive) {
            ctx.lineWidth = Math.max(8, fontSize * 0.18);
            ctx.strokeStyle = '#000000';
            ctx.shadowColor = 'rgba(250, 204, 21, 0.65)';
            ctx.shadowBlur = fontSize * 0.32;
            ctx.shadowOffsetY = fontSize * 0.04;
            ctx.strokeText(word.text, x, y);

            ctx.fillStyle = '#FACC15'; // Vibrant Yellow
            ctx.fillText(word.text, x, y);
          } else {
            ctx.lineWidth = Math.max(6, fontSize * 0.14);
            ctx.strokeStyle = '#000000';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
            ctx.shadowBlur = fontSize * 0.22;
            ctx.shadowOffsetY = fontSize * 0.05;
            ctx.strokeText(word.text, x, y);

            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(word.text, x, y);
          }
        } else {
          // Karaoke: glowing cyan for spoken words, softly dimmed for unspoken
          if (isSpoken) {
            ctx.lineWidth = Math.max(6, fontSize * 0.14);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.92)';
            ctx.shadowColor = 'rgba(34, 211, 238, 0.8)';
            ctx.shadowBlur = fontSize * 0.35;
            ctx.shadowOffsetY = fontSize * 0.04;
            ctx.strokeText(word.text, x, y);

            ctx.fillStyle = '#22D3EE'; // Electric Cyan
            ctx.fillText(word.text, x, y);
          } else {
            ctx.lineWidth = Math.max(4, fontSize * 0.09);
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            ctx.strokeText(word.text, x, y);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
            ctx.fillText(word.text, x, y);
          }
        }

        x += wordWidth;
      });
    });

    ctx.restore();
  }

  private drawTitleCard(
    ctx: CanvasRenderingContext2D,
    title: string,
    t: number,
    width: number,
    height: number,
    accent: string,
  ) {
    // Hold, then fade out over the final 0.4s.
    const fadeOut = t > TITLE_CARD_SEC - 0.4 ? 1 - (t - (TITLE_CARD_SEC - 0.4)) / 0.4 : 1;
    const alpha = clamp(easeOutCubic(clamp(t / 0.3, 0, 1)) * fadeOut, 0, 1);
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, width, height);

    const fontSize = Math.round(width * 0.085);
    ctx.font = `800 ${fontSize}px Unbounded, Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Wrap the title into at most three lines.
    const maxWidth = width * 0.82;
    const words = title.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    const shown = lines.slice(0, 3);

    const lineHeight = fontSize * 1.2;
    const startY = height / 2 - ((shown.length - 1) * lineHeight) / 2;

    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(8, fontSize * 0.12);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.fillStyle = '#ffffff';
    shown.forEach((line, i) => {
      const y = startY + i * lineHeight;
      ctx.strokeText(line, width / 2, y);
      ctx.fillText(line, width / 2, y);
    });

    // Accent rule under the title.
    const ruleWidth = width * 0.16;
    ctx.fillStyle = accent;
    ctx.fillRect(
      width / 2 - ruleWidth / 2,
      startY + shown.length * lineHeight - lineHeight * 0.1,
      ruleWidth,
      Math.max(4, width * 0.006),
    );

    ctx.restore();
  }

  /** Composite a single output frame at absolute time `time` (seconds). */
  private drawFrame(
    ctx: CanvasRenderingContext2D,
    scenes: PreparedScene[],
    time: number,
    width: number,
    height: number,
    options: ShortsRenderOptions,
  ) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    let index = scenes.findIndex((s) => time >= s.start && time < s.start + s.duration);
    if (index === -1) index = time < 0 ? 0 : scenes.length - 1;

    const scene = scenes[index];
    const localTime = clamp(time - scene.start, 0, scene.duration);

    // Crossfade in from the previous scene.
    const fadeSpan = Math.min(CROSSFADE_SEC, scene.duration / 2);
    if (index > 0 && localTime < fadeSpan) {
      const previous = scenes[index - 1];
      this.drawSceneImage(ctx, previous, previous.duration, width, height, 1, index - 1);
      this.drawSceneImage(ctx, scene, localTime, width, height, localTime / fadeSpan, index);
    } else {
      this.drawSceneImage(ctx, scene, localTime, width, height, 1, index);
    }

    if (options.captionsEnabled !== false) {
      this.drawScrim(ctx, width, height);

      const chunk = scene.captions.find((c) => localTime >= c.start && localTime < c.end);
      if (chunk) {
        this.drawCaptions(
          ctx,
          chunk,
          localTime,
          width,
          height,
          options.captionStyle ?? 'bold-pop',
          options.accentColor ?? DEFAULT_ACCENT,
        );
      }
    }

    if (options.showTitleCard && options.title && time < TITLE_CARD_SEC) {
      this.drawTitleCard(ctx, options.title, time, width, height, options.accentColor ?? DEFAULT_ACCENT);
    }
  }

  // --- audio ------------------------------------------------------------------

  private async decodeAudio(context: BaseAudioContext, source: Blob | string): Promise<AudioBuffer> {
    const arrayBuffer = source instanceof Blob
      ? await source.arrayBuffer()
      : await (await fetch(source)).arrayBuffer();
    return context.decodeAudioData(arrayBuffer.slice(0));
  }

  private audioBufferToWav(buffer: AudioBuffer): Uint8Array {
    const numberOfChannels = Math.min(2, buffer.numberOfChannels);
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = 2;
    const blockAlign = numberOfChannels * bytesPerSample;
    const dataSize = buffer.length * blockAlign;
    const wavBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(wavBuffer);

    const writeString = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channels = Array.from({ length: numberOfChannels }, (_, i) => buffer.getChannelData(i));
    let offset = 44;
    for (let sample = 0; sample < buffer.length; sample += 1) {
      for (let channel = 0; channel < numberOfChannels; channel += 1) {
        const value = clamp(channels[channel][sample] || 0, -1, 1);
        view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
        offset += 2;
      }
    }

    return new Uint8Array(wavBuffer);
  }

  private async renderAudioMix(
    options: ShortsRenderOptions,
    prepared: PreparedScene[],
    totalDuration: number,
  ): Promise<Uint8Array> {
    const frameCount = Math.max(1, Math.ceil(totalDuration * AUDIO_SAMPLE_RATE));
    const context = new OfflineAudioContext(2, frameCount, AUDIO_SAMPLE_RATE);

    const voiceGain = context.createGain();
    voiceGain.gain.value = options.voiceVolume ?? 1;
    voiceGain.connect(context.destination);

    for (let i = 0; i < options.scenes.length; i += 1) {
      this.ensureNotAborted(options.signal);
      const url = options.scenes[i].audioUrl;
      if (!url) continue;

      try {
        const buffer = await this.decodeAudio(context, url);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(voiceGain);
        source.start(prepared[i].start);
      } catch (e) {
        console.warn(`[Shorts] Scene ${i + 1}: narration audio could not be decoded; rendering it silent.`, e);
      }
    }

    if (options.music?.blob) {
      try {
        const musicBuffer = await this.decodeAudio(context, options.music.blob);
        const musicGain = context.createGain();
        musicGain.gain.value = options.music.volume;
        musicGain.connect(context.destination);

        // OfflineAudioContext has no live looping, so schedule repeats manually.
        let offset = 0;
        while (offset < totalDuration && musicBuffer.duration > 0.05) {
          const source = context.createBufferSource();
          source.buffer = musicBuffer;
          source.connect(musicGain);
          source.start(offset);
          offset += musicBuffer.duration;
        }

        // Fade the music out over the last 1.2s so the short does not cut dead.
        const fadeStart = Math.max(0, totalDuration - 1.2);
        musicGain.gain.setValueAtTime(options.music.volume, fadeStart);
        musicGain.gain.linearRampToValueAtTime(0.0001, totalDuration);
      } catch (e) {
        console.warn('[Shorts] Background music could not be decoded; rendering without it.', e);
      }
    }

    const rendered = await context.startRendering();
    return this.audioBufferToWav(rendered);
  }

  // --- video encode -----------------------------------------------------------

  private isWebCodecsSupported(): boolean {
    return typeof window !== 'undefined'
      && typeof (window as { VideoEncoder?: unknown }).VideoEncoder !== 'undefined'
      && typeof (window as { VideoFrame?: unknown }).VideoFrame !== 'undefined';
  }

  private async getSupportedVideoEncoderConfig(width: number, height: number, fps: number): Promise<VideoEncoderConfig> {
    // The H.264 level is the last byte of the codec string (hex) and must be high
    // enough for the frame size, or isConfigSupported rejects the config outright.
    const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
    const levelHex =
      macroblocks > 8192 ? '33' :   // level 5.1
      macroblocks > 3600 ? '28' :   // level 4.0 — covers 1080x1920@30
      '1F';                          // level 3.1

    const base = {
      width,
      height,
      bitrate: Math.max(width, height) >= 1920 ? 12_000_000 : 8_000_000,
      framerate: fps,
      avc: { format: 'annexb' as const },
      bitrateMode: 'variable' as const,
      latencyMode: 'quality' as const,
      alpha: 'discard' as const,
    };

    const mainCodec = `avc1.4D40${levelHex}`;
    const baselineCodec = `avc1.42E0${levelHex}`;

    const candidates: VideoEncoderConfig[] = [
      { ...base, codec: mainCodec, hardwareAcceleration: 'prefer-hardware' },
      { ...base, codec: baselineCodec, hardwareAcceleration: 'prefer-hardware' },
      { ...base, codec: mainCodec, hardwareAcceleration: 'no-preference' },
      { ...base, codec: baselineCodec, hardwareAcceleration: 'no-preference' },
      { ...base, codec: mainCodec, hardwareAcceleration: 'prefer-software' },
      { ...base, codec: baselineCodec, hardwareAcceleration: 'prefer-software' },
    ];

    for (const candidate of candidates) {
      const support = await VideoEncoder.isConfigSupported(candidate);
      if (support.supported && support.config) {
        console.log(`[Shorts] Encoder ${width}x${height}: ${candidate.codec} (${candidate.hardwareAcceleration})`);
        return support.config;
      }
    }

    throw new Error('No supported H.264 WebCodecs configuration was found');
  }

  private async waitForEncoderQueueBelow(encoder: VideoEncoder, maxQueueSize: number, signal?: AbortSignal): Promise<void> {
    while (encoder.encodeQueueSize > maxQueueSize) {
      this.ensureNotAborted(signal);
      await new Promise<void>((resolve) => {
        const onDequeue = () => {
          encoder.removeEventListener('dequeue', onDequeue);
          resolve();
        };
        encoder.addEventListener('dequeue', onDequeue, { once: true });
        window.setTimeout(() => {
          encoder.removeEventListener('dequeue', onDequeue);
          resolve();
        }, 16);
      });
    }
  }

  private concatUint8Arrays(parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      merged.set(part, offset);
      offset += part.byteLength;
    }
    return merged;
  }

  private async encodeWithWebCodecs(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    scenes: PreparedScene[],
    totalDuration: number,
    options: ShortsRenderOptions,
  ): Promise<Uint8Array> {
    const { width, height } = canvas;
    const config = await this.getSupportedVideoEncoderConfig(width, height, FPS);

    const chunks: Uint8Array[] = [];
    let encoderError: Error | null = null;

    const encoder = new VideoEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        chunks.push(data);
      },
      error: (e) => {
        encoderError = e instanceof Error ? e : new Error(String(e));
        console.error('[Shorts] VideoEncoder error:', e);
      },
    });

    encoder.configure(config);

    const totalFrames = Math.max(1, Math.ceil(totalDuration * FPS));
    const frameDurationUs = Math.round(1_000_000 / FPS);

    try {
      for (let frame = 0; frame < totalFrames; frame += 1) {
        this.ensureNotAborted(options.signal);
        if (encoderError) throw encoderError;

        this.drawFrame(ctx, scenes, frame / FPS, width, height, options);

        await this.waitForEncoderQueueBelow(encoder, 8, options.signal);

        const videoFrame = new VideoFrame(canvas, {
          timestamp: frame * frameDurationUs,
          duration: frameDurationUs,
        });

        try {
          // A keyframe every two seconds keeps the stream seekable.
          encoder.encode(videoFrame, { keyFrame: frame % (FPS * 2) === 0 });
        } finally {
          videoFrame.close();
        }

        // Periodic flush keeps encoder memory bounded on long renders.
        if (frame > 0 && frame % Math.max(FPS * 2, 60) === 0) {
          await encoder.flush();
        }

        // Yield so the tab stays responsive and progress actually paints.
        if (frame % 12 === 0) {
          this.emit(10 + (frame / totalFrames) * 75, 'Rendering frames...', options.onProgress);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      await encoder.flush();
      if (encoderError) throw encoderError;
    } finally {
      try {
        if (encoder.state !== 'closed') encoder.close();
      } catch {
        // closing an errored encoder is noisy but harmless
      }
    }

    if (!chunks.length) throw new Error('The encoder produced no video data.');
    return this.concatUint8Arrays(chunks);
  }

  /**
   * Realtime fallback for browsers without VideoEncoder. MediaRecorder timestamps
   * follow the wall clock, so this runs in realtime by design.
   */
  private async encodeWithMediaRecorder(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    scenes: PreparedScene[],
    totalDuration: number,
    options: ShortsRenderOptions,
  ): Promise<{ data: Uint8Array; mimeType: string }> {
    const candidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType = candidates.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('This browser cannot record canvas video.');

    const stream = canvas.captureStream(FPS);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12_000_000 });
    const parts: Blob[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) parts.push(event.data);
    };

    const finished = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = (event) => reject((event as unknown as { error?: Error }).error ?? new Error('Recording failed'));
    });

    recorder.start(1000);
    const startedAt = performance.now();

    try {
      // Drive the canvas in realtime; captureStream samples whatever is drawn.
      for (;;) {
        this.ensureNotAborted(options.signal);
        const elapsed = (performance.now() - startedAt) / 1000;
        if (elapsed >= totalDuration) break;

        this.drawFrame(ctx, scenes, elapsed, canvas.width, canvas.height, options);
        this.emit(10 + (elapsed / totalDuration) * 75, 'Recording frames (realtime)...', options.onProgress);

        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      // Hold the last frame briefly so the tail is not truncated.
      this.drawFrame(ctx, scenes, totalDuration - 1 / FPS, canvas.width, canvas.height, options);
      await new Promise((resolve) => setTimeout(resolve, 250));
    } finally {
      if (recorder.state !== 'inactive') recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
    }

    await finished;

    const blob = new Blob(parts, { type: mimeType });
    if (blob.size === 0) throw new Error('The recorder produced no video data.');
    return { data: new Uint8Array(await blob.arrayBuffer()), mimeType };
  }

  // --- mux --------------------------------------------------------------------

  private async mux(
    video: { data: Uint8Array; kind: 'h264' | 'webm' },
    audio: Uint8Array,
    options: ShortsRenderOptions,
  ): Promise<Blob> {
    const ffmpeg = await getFFmpeg();
    const videoName = video.kind === 'h264' ? 'shorts_video.h264' : 'shorts_video.webm';
    const audioName = 'shorts_audio.wav';
    const outputName = 'shorts_output.mp4';

    // Registered once and removed in finally — the slide renderer leaks one of
    // these per render, and long sessions should not accumulate handlers.
    const onFFmpegProgress = ({ progress }: { progress: number }) => {
      this.emit(85 + clamp(progress, 0, 1) * 15, 'Muxing MP4...', options.onProgress);
    };
    ffmpeg.on('progress', onFFmpegProgress);

    try {
      this.emit(85, 'Muxing MP4...', options.onProgress);

      await ffmpeg.writeFile(videoName, video.data);
      await ffmpeg.writeFile(audioName, audio);

      const args = video.kind === 'h264'
        ? [
            // Elementary Annex-B stream: remux without re-encoding the video.
            '-f', 'h264',
            '-framerate', String(FPS),
            '-i', videoName,
            '-i', audioName,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'copy',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            '-movflags', '+faststart',
            outputName,
          ]
        : [
            // MediaRecorder gave us VP8/VP9, which MP4 players will not take.
            '-i', videoName,
            '-i', audioName,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '21',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-shortest',
            '-movflags', '+faststart',
            outputName,
          ];

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile(outputName);
      if (!(data instanceof Uint8Array) || data.byteLength === 0) {
        throw new Error('FFmpeg produced an empty video.');
      }

      return new Blob([data as BlobPart], { type: 'video/mp4' });
    } finally {
      ffmpeg.off('progress', onFFmpegProgress);
      for (const name of [videoName, audioName, outputName]) {
        try {
          await ffmpeg.deleteFile(name);
        } catch {
          // file may not exist if exec failed early
        }
      }
    }
  }

  // --- entry point ------------------------------------------------------------

  async render(options: ShortsRenderOptions): Promise<Blob> {
    this.aborted = false;

    if (!options.scenes.length) throw new Error('There are no scenes to render.');
    if (options.signal?.aborted) throw new ShortsRenderAbortedError();

    const abortHandler = () => {
      this.aborted = true;
      // A terminated core cannot be reused; drop it so the next render reloads.
      terminateFFmpeg();
    };
    options.signal?.addEventListener('abort', abortHandler, { once: true });

    const { width, height } = SHORTS_DIMENSIONS[options.aspect];
    let prepared: PreparedScene[] = [];

    try {
      this.emit(0, 'Preparing scenes...', options.onProgress);

      // Captions are drawn with webfonts; without this the first frames can fall
      // back to a system font mid-render and visibly change weight.
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        await document.fonts.ready;
      }

      const result = await this.prepareScenes(options, width, height);
      prepared = result.scenes;
      const totalDuration = result.totalDuration;

      if (!(totalDuration > 0)) throw new Error('The scenes have no duration to render.');

      this.emit(5, 'Mixing audio...', options.onProgress);
      const audio = await this.renderAudioMix(options, prepared, totalDuration);
      this.ensureNotAborted(options.signal);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('Could not create a 2D rendering context.');

      this.emit(10, 'Rendering frames...', options.onProgress);

      let video: { data: Uint8Array; kind: 'h264' | 'webm' };
      if (this.isWebCodecsSupported()) {
        try {
          const data = await this.encodeWithWebCodecs(canvas, ctx, prepared, totalDuration, options);
          video = { data, kind: 'h264' };
        } catch (e) {
          if (e instanceof ShortsRenderAbortedError) throw e;
          console.warn('[Shorts] WebCodecs encoding failed; falling back to MediaRecorder.', e);
          const recorded = await this.encodeWithMediaRecorder(canvas, ctx, prepared, totalDuration, options);
          video = { data: recorded.data, kind: 'webm' };
        }
      } else {
        console.log('[Shorts] VideoEncoder unavailable; using the MediaRecorder fallback.');
        const recorded = await this.encodeWithMediaRecorder(canvas, ctx, prepared, totalDuration, options);
        video = { data: recorded.data, kind: 'webm' };
      }

      this.ensureNotAborted(options.signal);

      const blob = await this.mux(video, audio, options);
      this.emit(100, 'Render complete', options.onProgress);
      return blob;
    } catch (e) {
      if (this.aborted || options.signal?.aborted) throw new ShortsRenderAbortedError();
      // A failed exec can leave the core wedged; force a clean instance next time.
      resetFFmpeg();
      throw e;
    } finally {
      options.signal?.removeEventListener('abort', abortHandler);
      prepared.forEach((scene) => {
        scene.bitmap?.close();
        scene.videoFrames?.forEach((frame) => frame.close());
      });
    }
  }
}

export const shortsRenderer = new ShortsVideoRenderer();
