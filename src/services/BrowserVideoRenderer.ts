import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { generateAutoZoomKeyframes } from '../utils/autoZoomGeneration';
import { easingFunctions, type EasingType } from '../utils/easingFunctions';

interface Slide {
  dataUrl?: string;
  mediaUrl?: string;
  audioUrl?: string;
  duration?: number;
  mediaDuration?: number;
  postAudioDelay?: number;
  type?: 'image' | 'video';
  transition?: 'none' | 'fade' | 'slide' | 'wipe' | 'blur' | 'zoom';
  isVideoMusicPaused?: boolean;
  isTtsDisabled?: boolean;
  isMusicDisabled?: boolean;
  videoNarrationAnalysis?: {
    scenes: Array<{
      audioUrl?: string;
      timestampStartSeconds: number;
      durationSeconds: number;
      effectiveStartSeconds: number;
      effectiveDurationSeconds: number;
      audioDurationSeconds?: number;
    }>;
  };
  zooms?: Array<{
    id: string;
    timestampStartSeconds: number;
    durationSeconds: number;
    type: 'fixed' | 'cursor';
    targetX?: number;
    targetY?: number;
    zoomLevel: number;
    easing?: string;
    transitionSmoothing?: number;
    cursorDamping?: number;
    predictiveCursor?: boolean;
    autoZoomOut?: boolean;
  }>;
  cursorTrack?: Array<{
    timeMs: number;
    x: number;
    y: number;
  }>;
  interactionData?: Array<{
    timeMs: number;
    type: string;
  }>;
  autoZoomConfig?: {
    enabled: boolean;
    minIdleDurationMs?: number;
    minCursorMovement?: number;
    zoomOutLevel?: number;
    transitionDurationMs?: number;
  };
}

interface MusicSettings {
  url?: string;
  blob?: Blob;
  volume: number;
  loop?: boolean;
}

export type RenderResolution = '1080p' | '720p';

export interface RenderOptions {
  slides: Slide[];
  musicSettings?: MusicSettings;
  ttsVolume?: number;
  enableIntroFadeIn?: boolean;
  introFadeInDurationSec?: number;
  resolution?: RenderResolution;
  onProgress?: (progress: number) => void;
  onLog?: (message: string) => void;
  signal?: AbortSignal;
}

export const videoEvents = new EventTarget();

export interface VideoProgressEventDetail {
  progress: number;
  status: string;
  file?: string;
}

interface ViewportState {
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
}

interface PreparedImageSlide {
  duration: number;
  transition: NonNullable<Slide['transition']>;
  canvas: HTMLCanvasElement | null;
  viewports: ViewportState[];
}

interface TimelineItem {
  start: number;
  duration: number;
  transitionDuration: number;
}

export class BrowserVideoRenderer {
  private ffmpeg: FFmpeg | null = null;
  private loaded: boolean = false;
  private aborted: boolean = false;
  private loadPromise: Promise<void> | null = null;

  private getSafeMediaExtension(mediaUrl: string, slideType?: Slide['type']): string {
    // blob: URLs and URLs with query strings can produce invalid virtual paths in FFmpeg FS.
    // Keep only a small whitelist of safe extensions and fall back by slide type.
    const fallback = slideType === 'video' ? 'mp4' : 'png';

    try {
      const parsed = new URL(mediaUrl, window.location.href);
      const pathname = parsed.pathname || '';
      const filename = pathname.split('/').pop() || '';
      const ext = filename.includes('.') ? filename.split('.').pop() || '' : '';
      const normalized = ext.toLowerCase().replace(/[^a-z0-9]/g, '');

      if (/^(mp4|webm|mov|mkv|avi|m4v|gif|png|jpg|jpeg|webp)$/.test(normalized)) {
        return normalized;
      }
    } catch {
      // If URL parsing fails, use fallback.
    }

    return fallback;
  }

  constructor() {
    // Lazy init
  }

  async load() {
    if (this.loaded && this.ffmpeg) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      console.log('[FFmpeg] Loading core from CDN...');

      // Dynamic import
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { toBlobURL } = await import('@ffmpeg/util');

      this.ffmpeg = new FFmpeg();

      // Use unpkg ESM build
      const cdnBase = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

      try {
        // Emit loading event
        videoEvents.dispatchEvent(new CustomEvent<VideoProgressEventDetail>('video-progress', {
          detail: { progress: 0, status: 'Downloading FFmpeg from CDN...' }
        }));

        console.log('[FFmpeg] Fetching from CDN:', cdnBase);

        // toBlobURL handles caching and creates blob URLs for us
        const coreURL = await toBlobURL(`${cdnBase}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${cdnBase}/ffmpeg-core.wasm`, 'application/wasm');

        console.log('[FFmpeg] CDN files cached, loading...');
        console.log('[FFmpeg] Core URL:', coreURL);
        console.log('[FFmpeg] WASM URL:', wasmURL);

        await this.ffmpeg.load({
          coreURL,
          wasmURL,
        });

        console.log('[FFmpeg] Core loaded successfully from CDN');
        this.loaded = true;

        videoEvents.dispatchEvent(new CustomEvent<VideoProgressEventDetail>('video-progress', {
          detail: { progress: 100, status: 'FFmpeg ready' }
        }));
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error('[FFmpeg] Failed to load from CDN:', e);
        console.error('[FFmpeg] Error details:', errorMsg);
        throw new Error(`Failed to load FFmpeg from CDN: ${errorMsg}`);
      } finally {
        this.loadPromise = null;
      }
    })();

    return this.loadPromise;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
  }

  private getSlideDuration(slide: Slide): number {
    let duration = slide.duration || 5;
    duration += slide.postAudioDelay || 0;
    return Math.max(duration, 0.1);
  }

  private emitProgress(progress: number, status: string, onProgress?: (progress: number) => void) {
    const safeProgress = this.clamp(progress, 0, 100);
    onProgress?.(safeProgress);
    videoEvents.dispatchEvent(new CustomEvent<VideoProgressEventDetail>('video-progress', {
      detail: { progress: safeProgress, status }
    }));
  }

  private ensureNotAborted(signal?: AbortSignal) {
    if (this.aborted || signal?.aborted) {
      throw new Error('Render aborted');
    }
  }

  private isWebCodecsSupported(): boolean {
    return typeof window !== 'undefined'
      && typeof document !== 'undefined'
      && typeof VideoEncoder !== 'undefined'
      && typeof VideoFrame !== 'undefined'
      && typeof OfflineAudioContext !== 'undefined'
      && typeof createImageBitmap !== 'undefined';
  }

  private isWebCodecsExplicitlyEnabled(): boolean {
    if (typeof window === 'undefined') {
      return true;
    }

    try {
      return window.localStorage.getItem('origami_disable_webcodecs_renderer') !== '1';
    } catch {
      return true;
    }
  }

  private shouldUseLegacyRenderer(slides: Slide[]): boolean {
    if (!this.isWebCodecsSupported() || !this.isWebCodecsExplicitlyEnabled()) {
      return true;
    }

    return slides.some((slide) => {
      if (slide.type === 'video') {
        return true;
      }

      const visualUrl = slide.mediaUrl ?? slide.dataUrl;
      if (!visualUrl) {
        return false;
      }

      if (slide.dataUrl?.startsWith('data:image/gif')) {
        return true;
      }

      const ext = this.getSafeMediaExtension(visualUrl, slide.type);
      return !['png', 'jpg', 'jpeg', 'webp'].includes(ext);
    });
  }

  private getTransitionDuration(previousDuration: number, currentDuration: number): number {
    const safeTransition = Math.min(0.5, previousDuration / 2, currentDuration / 2);
    return Math.max(safeTransition, 0.05);
  }

  private resolveEasing(easing?: string): (t: number) => number {
    const key = (easing ?? 'linear') as EasingType;
    return easingFunctions[key] ?? easingFunctions.linear;
  }

  private getCursorPointAtTime(cursorTrack: NonNullable<Slide['cursorTrack']>, timeSeconds: number): { x: number; y: number } {
    const timeMs = timeSeconds * 1000;
    const trackIndex = cursorTrack.findIndex((point) => point.timeMs >= timeMs);

    if (trackIndex === 0) {
      return { x: cursorTrack[0].x, y: cursorTrack[0].y };
    }

    if (trackIndex === -1) {
      const finalPoint = cursorTrack[cursorTrack.length - 1];
      return { x: finalPoint.x, y: finalPoint.y };
    }

    const before = cursorTrack[trackIndex - 1];
    const after = cursorTrack[trackIndex];
    const span = Math.max(1, after.timeMs - before.timeMs);
    const progress = this.clamp((timeMs - before.timeMs) / span, 0, 1);

    return {
      x: this.lerp(before.x, after.x, progress),
      y: this.lerp(before.y, after.y, progress),
    };
  }

  private getZoomTargetAtTime(
    slide: Slide,
    activeZooms: NonNullable<Slide['zooms']>,
    timeSeconds: number,
    duration: number
  ): { zoom: number; x: number; y: number; damping: number } {
    if (!activeZooms.length) {
      return { zoom: 1, x: 0.5, y: 0.5, damping: 0.01 };
    }

    const sortedZooms = [...activeZooms].sort((a, b) => a.timestampStartSeconds - b.timestampStartSeconds);
    const zoomTimelineEnd = Math.max(0.05, duration);

    let activeIndex = -1;
    for (let i = 0; i < sortedZooms.length; i++) {
      const zoom = sortedZooms[i];
      const nextZoom = sortedZooms[i + 1];
      const fallbackEnd = zoom.timestampStartSeconds + Math.max(zoom.durationSeconds, 1);
      const naturalEnd = nextZoom ? nextZoom.timestampStartSeconds : Math.max(zoomTimelineEnd, fallbackEnd);
      const end = Math.max(zoom.timestampStartSeconds + 0.001, naturalEnd);

      if (timeSeconds >= zoom.timestampStartSeconds && timeSeconds <= end) {
        activeIndex = i;
      }

      if (timeSeconds < zoom.timestampStartSeconds) {
        break;
      }
    }

    if (activeIndex < 0) {
      return { zoom: 1, x: 0.5, y: 0.5, damping: 0.01 };
    }

    const activeZoom = sortedZooms[activeIndex];
    const previousZoom = sortedZooms[activeIndex - 1];
    const easing = this.resolveEasing(activeZoom.easing);
    const transitionDuration = Math.max(0.05, Math.min(activeZoom.durationSeconds || 0.5, 0.5));
    const transitionProgress = this.clamp((timeSeconds - activeZoom.timestampStartSeconds) / transitionDuration, 0, 1);
    const easedProgress = easing(transitionProgress);

    let targetX = activeZoom.targetX ?? 0.5;
    let targetY = activeZoom.targetY ?? 0.5;

    if (activeZoom.type === 'cursor' && slide.cursorTrack && slide.cursorTrack.length > 0) {
      const cursorPoint = this.getCursorPointAtTime(slide.cursorTrack, timeSeconds);
      targetX = cursorPoint.x;
      targetY = cursorPoint.y;
    }

    let previousX = previousZoom?.targetX ?? 0.5;
    let previousY = previousZoom?.targetY ?? 0.5;
    if (previousZoom?.type === 'cursor' && slide.cursorTrack && slide.cursorTrack.length > 0) {
      const previousCursor = this.getCursorPointAtTime(slide.cursorTrack, Math.max(0, activeZoom.timestampStartSeconds - (1 / 30)));
      previousX = previousCursor.x;
      previousY = previousCursor.y;
    }

    return {
      zoom: this.lerp(previousZoom?.zoomLevel ?? 1, activeZoom.zoomLevel, easedProgress),
      x: activeZoom.type === 'cursor' ? targetX : this.lerp(previousX, targetX, easedProgress),
      y: activeZoom.type === 'cursor' ? targetY : this.lerp(previousY, targetY, easedProgress),
      damping: this.clamp(activeZoom.cursorDamping ?? activeZoom.transitionSmoothing ?? 0.08, 0.01, 0.35),
    };
  }

  private async loadImageBitmap(url: string): Promise<ImageBitmap> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load image asset: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    return createImageBitmap(blob);
  }

  private async prepareImageSlide(
    slide: Slide,
    width: number,
    height: number,
    fps: number
  ): Promise<PreparedImageSlide> {
    const duration = this.getSlideDuration(slide);
    let canvas: HTMLCanvasElement | null = null;

    if (slide.dataUrl || slide.mediaUrl) {
      const bitmap = await this.loadImageBitmap(slide.dataUrl ?? slide.mediaUrl!);
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        bitmap.close();
        throw new Error('Failed to create canvas context for WebCodecs rendering');
      }

      context.fillStyle = 'black';
      context.fillRect(0, 0, width, height);

      const scale = Math.min(width / bitmap.width, height / bitmap.height);
      const drawWidth = bitmap.width * scale;
      const drawHeight = bitmap.height * scale;
      const dx = (width - drawWidth) / 2;
      const dy = (height - drawHeight) / 2;
      context.drawImage(bitmap, dx, dy, drawWidth, drawHeight);
      bitmap.close();
    }

    let activeZooms = slide.zooms ?? [];
    if (slide.autoZoomConfig?.enabled && slide.cursorTrack && slide.interactionData) {
      activeZooms = generateAutoZoomKeyframes(
        activeZooms,
        slide.cursorTrack,
        slide.interactionData,
        Math.floor((slide.duration ?? 5) * 1000),
        {
          enabled: true,
          minIdleDurationMs: slide.autoZoomConfig.minIdleDurationMs ?? 2000,
          minCursorMovement: slide.autoZoomConfig.minCursorMovement ?? 0.015,
          zoomOutLevel: slide.autoZoomConfig.zoomOutLevel ?? 1.0,
          transitionDurationMs: slide.autoZoomConfig.transitionDurationMs ?? 500,
        }
      );
    }

    const frameCount = Math.max(2, Math.ceil(duration * fps) + 2);
    const viewports: ViewportState[] = [];
    let currentZoom = 1;
    let currentX = 0.5;
    let currentY = 0.5;

    for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
      const timeSeconds = Math.min(duration, frameIndex / fps);
      const target = this.getZoomTargetAtTime(slide, activeZooms, timeSeconds, duration);

      currentZoom = Math.max(
        1,
        currentZoom + ((target.zoom - currentZoom) * (target.zoom > currentZoom ? target.damping * 2 : target.damping))
      );
      currentX += (target.x - currentX) * target.damping;
      currentY += (target.y - currentY) * target.damping;

      const sourceWidth = width / currentZoom;
      const sourceHeight = height / currentZoom;
      const sourceX = this.clamp((currentX * width) - (sourceWidth / 2), 0, width - sourceWidth);
      const sourceY = this.clamp((currentY * height) - (sourceHeight / 2), 0, height - sourceHeight);

      viewports.push({ sourceX, sourceY, sourceWidth, sourceHeight });
    }

    return {
      duration,
      transition: slide.transition || 'fade',
      canvas,
      viewports,
    };
  }

  private drawSlideAtTime(
    context: CanvasRenderingContext2D,
    slide: PreparedImageSlide,
    localTime: number,
    fps: number,
    outputWidth: number,
    outputHeight: number,
    alpha = 1,
    destX = 0,
    destY = 0,
    destWidth = outputWidth,
    destHeight = outputHeight
  ) {
    context.save();
    context.globalAlpha *= alpha;

    if (!slide.canvas) {
      context.fillStyle = 'black';
      context.fillRect(destX, destY, destWidth, destHeight);
      context.restore();
      return;
    }

    const frameIndex = this.clamp(Math.floor(localTime * fps), 0, slide.viewports.length - 1);
    const viewport = slide.viewports[frameIndex];
    context.drawImage(
      slide.canvas,
      viewport.sourceX,
      viewport.sourceY,
      viewport.sourceWidth,
      viewport.sourceHeight,
      destX,
      destY,
      destWidth,
      destHeight
    );
    context.restore();
  }

  private drawTransitionFrame(
    context: CanvasRenderingContext2D,
    previousSlide: PreparedImageSlide,
    currentSlide: PreparedImageSlide,
    transition: PreparedImageSlide['transition'],
    localTime: number,
    progress: number,
    fps: number,
    outputWidth: number,
    outputHeight: number
  ) {
    const clampedProgress = this.clamp(progress, 0, 1);
    const previousTime = previousSlide.duration;

    switch (transition) {
      case 'none':
        this.drawSlideAtTime(context, currentSlide, localTime, fps, outputWidth, outputHeight);
        return;
      case 'slide':
        this.drawSlideAtTime(context, previousSlide, previousTime, fps, outputWidth, outputHeight, 1, -clampedProgress * outputWidth, 0);
        this.drawSlideAtTime(context, currentSlide, localTime, fps, outputWidth, outputHeight, 1, outputWidth - (clampedProgress * outputWidth), 0);
        return;
      case 'wipe':
        this.drawSlideAtTime(context, previousSlide, previousTime, fps, outputWidth, outputHeight);
        context.save();
        context.beginPath();
        context.rect(outputWidth * (1 - clampedProgress), 0, outputWidth * clampedProgress, outputHeight);
        context.clip();
        this.drawSlideAtTime(context, currentSlide, localTime, fps, outputWidth, outputHeight);
        context.restore();
        return;
      case 'blur': {
        this.drawSlideAtTime(context, previousSlide, previousTime, fps, outputWidth, outputHeight);
        const radius = Math.hypot(outputWidth / 2, outputHeight / 2) * clampedProgress;
        context.save();
        context.beginPath();
        context.arc(outputWidth / 2, outputHeight / 2, radius, 0, Math.PI * 2);
        context.clip();
        this.drawSlideAtTime(context, currentSlide, localTime, fps, outputWidth, outputHeight);
        context.restore();
        return;
      }
      case 'zoom': {
        this.drawSlideAtTime(context, previousSlide, previousTime, fps, outputWidth, outputHeight, 1 - clampedProgress);
        const scale = 1.12 - (0.12 * clampedProgress);
        const drawWidth = outputWidth * scale;
        const drawHeight = outputHeight * scale;
        const dx = (outputWidth - drawWidth) / 2;
        const dy = (outputHeight - drawHeight) / 2;
        this.drawSlideAtTime(context, currentSlide, localTime, fps, outputWidth, outputHeight, clampedProgress, dx, dy, drawWidth, drawHeight);
        return;
      }
      case 'fade':
      default:
        this.drawSlideAtTime(context, previousSlide, previousTime, fps, outputWidth, outputHeight, 1 - clampedProgress);
        this.drawSlideAtTime(context, currentSlide, localTime, fps, outputWidth, outputHeight, clampedProgress);
        return;
    }
  }

  private buildTimeline(slides: PreparedImageSlide[]): { items: TimelineItem[]; totalDuration: number } {
    const items: TimelineItem[] = [];
    let start = 0;

    for (let index = 0; index < slides.length; index++) {
      const slide = slides[index];
      const previous = slides[index - 1];
      const transitionDuration = index === 0 || slide.transition === 'none'
        ? 0
        : this.getTransitionDuration(previous.duration, slide.duration);

      items.push({
        start,
        duration: slide.duration,
        transitionDuration,
      });

      start += slide.duration;
    }

    return { items, totalDuration: start };
  }

  private async getSupportedVideoEncoderConfig(width: number, height: number, fps: number): Promise<VideoEncoderConfig> {
    const candidates: VideoEncoderConfig[] = [
      {
        codec: 'avc1.42E01F',
        width,
        height,
        bitrate: width >= 1920 ? 10_000_000 : 5_000_000,
        framerate: fps,
        avc: { format: 'annexb' },
        hardwareAcceleration: 'prefer-software',
        bitrateMode: 'variable',
        latencyMode: 'quality',
        alpha: 'discard'
      },
      {
        codec: 'avc1.4D401F',
        width,
        height,
        bitrate: width >= 1920 ? 10_000_000 : 5_000_000,
        framerate: fps,
        avc: { format: 'annexb' },
        hardwareAcceleration: 'prefer-software',
        bitrateMode: 'variable',
        latencyMode: 'quality',
        alpha: 'discard'
      },
      {
        codec: 'avc1.42E01F',
        width,
        height,
        bitrate: width >= 1920 ? 10_000_000 : 5_000_000,
        framerate: fps,
        avc: { format: 'annexb' },
        hardwareAcceleration: 'no-preference',
        bitrateMode: 'variable',
        latencyMode: 'quality',
        alpha: 'discard'
      },
      {
        codec: 'avc1.4D401F',
        width,
        height,
        bitrate: width >= 1920 ? 10_000_000 : 5_000_000,
        framerate: fps,
        avc: { format: 'annexb' },
        hardwareAcceleration: 'no-preference',
        bitrateMode: 'variable',
        latencyMode: 'quality',
        alpha: 'discard'
      }
    ];

    for (const candidate of candidates) {
      const support = await VideoEncoder.isConfigSupported(candidate);
      if (support.supported) {
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
    const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;

    for (const part of parts) {
      merged.set(part, offset);
      offset += part.byteLength;
    }

    return merged;
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
      for (let i = 0; i < value.length; i++) {
        view.setUint8(offset + i, value.charCodeAt(i));
      }
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

    const channels = Array.from({ length: numberOfChannels }, (_, index) => buffer.getChannelData(index));
    let offset = 44;
    for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex++) {
      for (let channelIndex = 0; channelIndex < numberOfChannels; channelIndex++) {
        const sample = this.clamp(channels[channelIndex][sampleIndex] || 0, -1, 1);
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Uint8Array(wavBuffer);
  }

  private async decodeAudioBuffer(
    source: string | Blob,
    context: OfflineAudioContext,
    cache: Map<string, AudioBuffer>
  ): Promise<AudioBuffer> {
    const cacheKey = typeof source === 'string' ? source : `blob:${source.size}:${source.type}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const arrayBuffer = typeof source === 'string'
      ? await fetch(source).then(async (response) => {
          if (!response.ok) {
            throw new Error(`Failed to load audio asset: ${response.status} ${response.statusText}`);
          }
          return response.arrayBuffer();
        })
      : await source.arrayBuffer();

    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    cache.set(cacheKey, decoded);
    return decoded;
  }

  private async renderAudioMixToWav(
    slides: Slide[],
    totalDuration: number,
    ttsVolume: number,
    musicSettings?: MusicSettings,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const sampleRate = 44_100;
    const frameCount = Math.max(1, Math.ceil(totalDuration * sampleRate));
    const audioContext = new OfflineAudioContext(2, frameCount, sampleRate);
    const speechGain = audioContext.createGain();
    speechGain.gain.value = ttsVolume;
    speechGain.connect(audioContext.destination);

    const audioCache = new Map<string, AudioBuffer>();
    let currentOffset = 0;

    for (const slide of slides) {
      this.ensureNotAborted(signal);

      const duration = this.getSlideDuration(slide);
      const timedScenes = slide.videoNarrationAnalysis?.scenes?.filter((scene) => !!scene.audioUrl) ?? [];

      if (!slide.isTtsDisabled && timedScenes.length > 0) {
        for (const scene of timedScenes) {
          const audioBuffer = await this.decodeAudioBuffer(scene.audioUrl!, audioContext, audioCache);
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(speechGain);
          source.start(
            currentOffset + Math.max(0, scene.effectiveStartSeconds || 0),
            0,
            Math.min(
              Math.max(0.05, scene.audioDurationSeconds || scene.effectiveDurationSeconds || 0.1),
              audioBuffer.duration
            )
          );
        }
      } else if (!slide.isTtsDisabled && slide.audioUrl) {
        const audioBuffer = await this.decodeAudioBuffer(slide.audioUrl, audioContext, audioCache);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(speechGain);
        source.start(currentOffset, 0, Math.min(duration, audioBuffer.duration));
      }

      currentOffset += duration;
    }

    if ((musicSettings?.blob || musicSettings?.url) && totalDuration > 0) {
      const musicBuffer = await this.decodeAudioBuffer(musicSettings.blob ?? musicSettings.url!, audioContext, audioCache);
      if (musicBuffer.duration > 0) {
        let musicOffset = 0;
        while (musicOffset < totalDuration) {
          this.ensureNotAborted(signal);

          const source = audioContext.createBufferSource();
          const gain = audioContext.createGain();
          source.buffer = musicBuffer;
          gain.gain.value = musicSettings.volume;
          source.connect(gain);
          gain.connect(audioContext.destination);
          source.start(musicOffset, 0, Math.min(musicBuffer.duration, totalDuration - musicOffset));
          musicOffset += musicBuffer.duration;
        }
      }
    }

    const rendered = await audioContext.startRendering();
    return this.audioBufferToWav(rendered);
  }

  private async encodeImageTimelineToH264(
    slides: PreparedImageSlide[],
    timeline: TimelineItem[],
    totalDuration: number,
    fps: number,
    width: number,
    height: number,
    enableIntroFadeIn: boolean,
    introFadeInDurationSec: number,
    onProgress?: (progress: number) => void,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Failed to create output canvas for WebCodecs rendering');
    }

    const config = await this.getSupportedVideoEncoderConfig(width, height, fps);
    const chunks: Uint8Array[] = [];
    let encoderError: Error | null = null;

    const encoder = new VideoEncoder({
      output: (chunk) => {
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        chunks.push(bytes);
      },
      error: (error) => {
        encoderError = error instanceof Error ? error : new Error(String(error));
      }
    });

    encoder.configure(config);
    const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
    const maxQueueSize = 8;
    const flushIntervalFrames = Math.max(fps * 2, 60);

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      this.ensureNotAborted(signal);
      if (encoderError) {
        throw encoderError;
      }

      const timeSeconds = frameIndex / fps;
      const slideIndex = timeline.findIndex((item, index) => {
        const nextStart = timeline[index + 1]?.start ?? totalDuration + 1;
        return timeSeconds >= item.start && timeSeconds < nextStart;
      });
      const resolvedIndex = slideIndex === -1 ? slides.length - 1 : slideIndex;
      const timelineItem = timeline[resolvedIndex];
      const slide = slides[resolvedIndex];

      context.fillStyle = 'black';
      context.fillRect(0, 0, width, height);

      const localTime = Math.max(0, timeSeconds - timelineItem.start);
      const isTransitionFrame = resolvedIndex > 0
        && slide.transition !== 'none'
        && timelineItem.transitionDuration > 0
        && timeSeconds < (timelineItem.start + timelineItem.transitionDuration);

      if (isTransitionFrame) {
        const transitionProgress = (timeSeconds - timelineItem.start) / timelineItem.transitionDuration;
        this.drawTransitionFrame(
          context,
          slides[resolvedIndex - 1],
          slide,
          slide.transition,
          localTime,
          transitionProgress,
          fps,
          width,
          height
        );
      } else {
        this.drawSlideAtTime(context, slide, localTime, fps, width, height);
      }

      if (enableIntroFadeIn) {
        const introFadeDuration = Math.max(0.05, Math.min(Math.max(0.1, introFadeInDurationSec || 1), totalDuration / 2));
        if (timeSeconds < introFadeDuration) {
          context.save();
          context.globalAlpha = 1 - this.clamp(timeSeconds / introFadeDuration, 0, 1);
          context.fillStyle = 'black';
          context.fillRect(0, 0, width, height);
          context.restore();
        }
      }

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(timeSeconds * 1_000_000),
        duration: Math.round((1 / fps) * 1_000_000)
      });
      await this.waitForEncoderQueueBelow(encoder, maxQueueSize, signal);
      encoder.encode(frame, { keyFrame: frameIndex === 0 || frameIndex % (fps * 2) === 0 });
      frame.close();

      if ((frameIndex + 1) % flushIntervalFrames === 0) {
        await encoder.flush();
      }

      this.emitProgress(((frameIndex + 1) / totalFrames) * 85, 'Rendering Video...', onProgress);

      if (frameIndex % 12 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    await encoder.flush();
    encoder.close();

    if (encoderError) {
      throw encoderError;
    }

    return this.concatUint8Arrays(chunks);
  }

  private async muxEncodedVideoWithAudio(
    videoData: Uint8Array,
    audioData: Uint8Array,
    fps: number,
    onProgress?: (progress: number) => void
  ): Promise<Blob> {
    if (!this.loaded || !this.ffmpeg) {
      await this.load();
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg failed to initialize');
    }

    const ffmpeg = this.ffmpeg;
    const cleanupFiles: string[] = ['webcodecs_video.h264', 'webcodecs_audio.wav', 'output.mp4'];

    ffmpeg.on('progress', ({ progress }) => {
      this.emitProgress(85 + (progress * 15), 'Muxing MP4...', onProgress);
    });

    await ffmpeg.writeFile('webcodecs_video.h264', videoData);
    await ffmpeg.writeFile('webcodecs_audio.wav', audioData);

    try {
      await ffmpeg.exec([
        '-f', 'h264',
        '-framerate', String(fps),
        '-i', 'webcodecs_video.h264',
        '-i', 'webcodecs_audio.wav',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        'output.mp4'
      ]);

      const data = await ffmpeg.readFile('output.mp4');
      return new Blob([data as BlobPart], { type: 'video/mp4' });
    } finally {
      for (const file of cleanupFiles) {
        try { await ffmpeg.deleteFile(file); } catch { /* ignore */ }
      }
    }
  }

  private async renderWithWebCodecs({
    slides,
    musicSettings,
    ttsVolume = 1,
    enableIntroFadeIn = true,
    introFadeInDurationSec = 1,
    resolution = '720p',
    onProgress,
    signal
  }: RenderOptions): Promise<Blob> {
    this.aborted = false;

    const abortHandler = () => {
      this.aborted = true;
      try {
        this.ffmpeg?.terminate();
      } catch {
        // ignore termination noise during mux cancellation
      }
      this.loaded = false;
    };

    if (signal?.aborted) {
      throw new Error('Render aborted');
    }

    signal?.addEventListener('abort', abortHandler);

    try {
      const fps = 30;
      const width = resolution === '720p' ? 1280 : 1920;
      const height = resolution === '720p' ? 720 : 1080;

      try {
        await this.getSupportedVideoEncoderConfig(width, height, fps);
      } catch (error) {
        console.warn('[WebCodecs] No stable encoder config found, falling back to FFmpeg.', error);
        return this.renderWithFFmpeg({
          slides,
          musicSettings,
          ttsVolume,
          enableIntroFadeIn,
          introFadeInDurationSec,
          resolution,
          onProgress,
          signal
        });
      }

      this.emitProgress(0, 'Preparing WebCodecs render...', onProgress);
      const preparedSlides = await Promise.all(slides.map((slide) => this.prepareImageSlide(slide, width, height, fps)));
      this.ensureNotAborted(signal);

      const { items: timeline, totalDuration } = this.buildTimeline(preparedSlides);
      this.emitProgress(5, 'Mixing audio...', onProgress);
      const audioData = await this.renderAudioMixToWav(slides, totalDuration, ttsVolume, musicSettings, signal);
      this.ensureNotAborted(signal);

      const videoData = await this.encodeImageTimelineToH264(
        preparedSlides,
        timeline,
        totalDuration,
        fps,
        width,
        height,
        enableIntroFadeIn,
        introFadeInDurationSec,
        onProgress,
        signal
      );

      this.ensureNotAborted(signal);
      const blob = await this.muxEncodedVideoWithAudio(videoData, audioData, fps, onProgress);
      this.emitProgress(100, 'Rendering complete', onProgress);
      return blob;
    } catch (error) {
      if (this.aborted) {
        throw new Error('Render aborted');
      }
      throw error;
    } finally {
      signal?.removeEventListener('abort', abortHandler);
    }
  }

  async render(options: RenderOptions): Promise<Blob> {
    if (this.shouldUseLegacyRenderer(options.slides)) {
      return this.renderWithFFmpeg(options);
    }

    return this.renderWithWebCodecs(options);
  }

  private async renderWithFFmpeg({
    slides,
    musicSettings,
    ttsVolume = 1,
    enableIntroFadeIn = true,
    introFadeInDurationSec = 1,
    resolution = '720p',
    onProgress,
    onLog,
    signal
  }: RenderOptions): Promise<Blob> {
    // Reset aborted state for new render
    this.aborted = false;

    if (!this.loaded || !this.ffmpeg) {
      await this.load();
    }

    // Ensure ffmpeg is available
    if (!this.ffmpeg) throw new Error("FFmpeg failed to initialize");
    const ffmpeg = this.ffmpeg;
    const { fetchFile } = await import('@ffmpeg/util');

    // Attach listeners
    ffmpeg.on('log', ({ message }) => {
      if (onLog) onLog(message);
      console.log('[FFmpeg Log]:', message);
    });

    ffmpeg.on('progress', ({ progress, time }) => {
      // Prefer time-based calculation if we have a valid estimated duration
      let p = 0;

      if (typeof time === 'number' && estimatedTotalDuration > 0) {
        // time is usually in microseconds in recent ffmpeg.wasm versions
        // estimatedTotalDuration is in seconds
        const timeInSeconds = time / 1000000;
        p = (timeInSeconds / estimatedTotalDuration) * 100;
      } else {
        // Fallback to progress (0-1)
        p = progress * 100;
      }

      // Clamp
      p = Math.max(0, Math.min(100, p));

      if (isNaN(p) || !isFinite(p)) p = 0;

      if (onProgress) onProgress(p);

      videoEvents.dispatchEvent(new CustomEvent<VideoProgressEventDetail>('video-progress', {
        detail: { progress: p, status: 'Rendering Video...' }
      }));
    });

    // Handle Abort Signal
    if (signal) {
      if (signal.aborted) {
        throw new Error('Render aborted');
      }
      signal.addEventListener('abort', () => {
        console.log('[FFmpeg] Render aborted by user. Terminating worker...');
        this.aborted = true;
        try {
          this.ffmpeg?.terminate();
        } catch (e) {
          // FFmpeg.terminate() throws an error, which is expected
          // We'll handle this in the catch block below
          console.error("Error terminating ffmpeg:", e);
        }
        this.loaded = false; // Force reload next time
      });
    }

    const videoStreamLabels: string[] = [];
    const audioStreamLabels: string[] = [];
    const videoFilterParts: string[] = [];
    const audioFilterParts: string[] = [];

    let currentInputIdx = 0;
    const FPS = 30;

    const cleanupFiles: string[] = [];

    // Track estimated duration for progress calculation
    let estimatedTotalDuration = 0;

    try {
      const renderSlides: Slide[] = [...slides];

      // Input Arguments Construction
      const inputArgs: string[] = [];
      const VIDEO_WIDTH = resolution === '720p' ? 1280 : 1920;
      const VIDEO_HEIGHT = resolution === '720p' ? 720 : 1080;

      for (let i = 0; i < renderSlides.length; i++) {
        const slide = renderSlides[i];
        const visualIdx = currentInputIdx;

        let duration = slide.duration || 5;
        duration += (slide.postAudioDelay || 0);
        duration = Math.max(duration, 0.1);




        if (slide.dataUrl) {
          const fname = `visual_${i}.png`; // Simplify ext
          try {
            const fileData = await fetchFile(slide.dataUrl);
            // Verify data validity
            if (!fileData || fileData.byteLength === 0) {
              throw new Error(`Image data is empty for slide ${i + 1}`);
            }
            await ffmpeg.writeFile(fname, fileData);
            cleanupFiles.push(fname);

            inputArgs.push('-loop', '1', '-t', duration.toString(), '-i', fname);
            currentInputIdx++;
          } catch (err) {
            console.error(`Failed to load slide ${i} image:`, err);
            throw new Error(`Failed to load image for slide ${i + 1}. Please try re-uploading the PDF. Details: ${(err as Error).message}`);
          }
        } else if (slide.mediaUrl) {
          const ext = this.getSafeMediaExtension(slide.mediaUrl, slide.type);
          const fname = `visual_${i}.${ext}`;
          await ffmpeg.writeFile(fname, await fetchFile(slide.mediaUrl));
          cleanupFiles.push(fname);

          if (slide.type !== 'video') {
            inputArgs.push('-loop', '1', '-t', duration.toString(), '-i', fname);
          } else {
            // Video
            inputArgs.push('-i', fname);
          }
          currentInputIdx++;
        } else {
          // Black background
          // Use lavfi input.
          inputArgs.push('-f', 'lavfi', '-i', `color=c=black:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration}`);
          currentInputIdx++;
        }

        // 3. Prepare Audio Input (TTS)
        let hasAudio = false;
        let singleAudioIdx: number | null = null;
        const segmentAudioInputs: Array<{ idx: number; startSeconds: number; durationSeconds: number; label: string }> = [];

        const timedScenes = slide.videoNarrationAnalysis?.scenes?.filter(scene => !!scene.audioUrl) ?? [];
        if (timedScenes.length > 0 && !slide.isTtsDisabled) {
          for (let j = 0; j < timedScenes.length; j++) {
            const scene = timedScenes[j];
            const fname = `speech_${i}_${j}.mp3`;
            await ffmpeg.writeFile(fname, await fetchFile(scene.audioUrl!));
            cleanupFiles.push(fname);

            inputArgs.push('-i', fname);
            segmentAudioInputs.push({
              idx: currentInputIdx,
              startSeconds: Math.max(0, scene.effectiveStartSeconds || 0),
              durationSeconds: Math.max(0.05, scene.audioDurationSeconds || scene.effectiveDurationSeconds || 0.1),
              label: `seg_${i}_${j}`
            });
            currentInputIdx++;
          }
          hasAudio = segmentAudioInputs.length > 0;
        } else if (slide.audioUrl && !slide.isTtsDisabled) {
          const fname = `speech_${i}.mp3`;
          await ffmpeg.writeFile(fname, await fetchFile(slide.audioUrl));
          cleanupFiles.push(fname);

          inputArgs.push('-i', fname);
          hasAudio = true;
          singleAudioIdx = currentInputIdx;
          currentInputIdx++;
        }

        // 4. Build Filter Chain
        const vLabel = `v${i}`;
        const aLabel = `a${i}`;

        // 1. Standardize dimensions first to prevent Zoom distortion
        const preLabel = `vPre_${i}`;
        videoFilterParts.push(`[${visualIdx}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1[${preLabel}]`);
        let baseVideoLabel = preLabel;

        // AUTO-ZOOM: Generate auto-zoom-out keyframes for idle periods if enabled
        let activeZooms = slide.zooms ?? [];
        if (slide.autoZoomConfig?.enabled && slide.cursorTrack && slide.interactionData) {
          activeZooms = generateAutoZoomKeyframes(
            activeZooms,
            slide.cursorTrack,
            slide.interactionData,
            Math.floor((slide.duration ?? 5) * 1000),
            {
              enabled: true,
              minIdleDurationMs: slide.autoZoomConfig.minIdleDurationMs ?? 2000,
              minCursorMovement: slide.autoZoomConfig.minCursorMovement ?? 0.015,
              zoomOutLevel: slide.autoZoomConfig.zoomOutLevel ?? 1.0,
              transitionDurationMs: slide.autoZoomConfig.transitionDurationMs ?? 500,
            }
          );
        }

        // 2. Apply Zooms first - IMPROVED VERSION with easing and better interpolation
        if (activeZooms && activeZooms.length > 0) {
          const zExprs: string[] = [];
          const xExprs: string[] = [];
          const yExprs: string[] = [];
          const sortedZooms = [...activeZooms].sort((a, b) => a.timestampStartSeconds - b.timestampStartSeconds);
          const zoomTimelineEnd = Math.max(
            0.05,
            slide.type === 'video'
              ? (slide.mediaDuration ?? duration)
              : duration
          );
          
          // Helper: Generate easing expression for FFmpeg
          // This creates a smooth transition between zoom keyframes
          const generateEasingExpr = (easing: string = 'linear'): string => {
            // FFmpeg expressions for common easing functions
            // t normalized to 0-1 for the transition duration
            switch (easing) {
              case 'easeOutQuad': return '1-pow(1-t,2)';
              case 'easeInQuad': return 't*t';
              case 'easeInOutQuad': return 'if(lt(t,0.5),2*t*t,1-pow(-2*t+2,2)/2)';
              case 'easeOutCubic': return '1-pow(1-t,3)';
              case 'easeInCubic': return 't*t*t';
              case 'easeInOutCubic': return 'if(lt(t,0.5),4*t*t*t,1-pow(-2*t+2,3)/2)';
              case 'easeOutExpo': return 'if(eq(t,1),1,1-pow(2,-10*t))';
              case 'easeInExpo': return 'if(eq(t,0),0,pow(2,10*t-10))';
              case 'easeOutElastic': return 'pow(2,-10*t)*sin((t*10-0.75)*6.28/4.5)+1';
              default: return 't'; // linear
            }
          };
          
          for (let zoomIndex = 0; zoomIndex < sortedZooms.length; zoomIndex++) {
            const z = sortedZooms[zoomIndex];
            const t1 = z.timestampStartSeconds;
            const nextZoom = sortedZooms[zoomIndex + 1];
            const fallbackEnd = t1 + Math.max(z.durationSeconds, 1);
            const naturalEnd = nextZoom ? nextZoom.timestampStartSeconds : Math.max(zoomTimelineEnd, fallbackEnd);
            const t2 = Math.max(t1 + 0.001, naturalEnd);
            
            // Zoom with easing transition
            const easing = z.easing ?? 'linear';
            const transitionSmoothing = z.transitionSmoothing ?? 0.1;
            const easingExpr = generateEasingExpr(easing);
            
            // Create smooth zoom transition using easing
            zExprs.push(`if(between(it,${t1},${t2}),${z.zoomLevel}+if(eq(it,${t1}),0,(lt(it,${t1}+0.5)?${easingExpr}*${transitionSmoothing}:${transitionSmoothing}))`);
             
            let txExpr = `${z.targetX ?? 0.5}`;
            let tyExpr = `${z.targetY ?? 0.5}`;
             
            // IMPROVED: Higher cursor sampling rate (20 times per second instead of 4)
            // This provides much smoother cursor following
            if (z.type === 'cursor' && slide.cursorTrack && slide.cursorTrack.length > 0) {
              const samplesX: string[] = [];
              const samplesY: string[] = [];
              const step = 0.05; // 20 samples per second for smooth continuous panning (was 0.25)
              const sampleEnd = Math.min(t2, Math.max(zoomTimelineEnd, t1 + step));
              
              // Improved cursor interpolation: linear interpolation between cursor points
              const getCursorAtTime = (timeSeconds: number) => {
                const timeMs = timeSeconds * 1000;
                const trackIndex = slide.cursorTrack.findIndex(c => c.timeMs >= timeMs);
                
                if (trackIndex === 0) return slide.cursorTrack[0];
                if (trackIndex === -1) return slide.cursorTrack[slide.cursorTrack.length - 1];
                
                const before = slide.cursorTrack[trackIndex - 1];
                const after = slide.cursorTrack[trackIndex];
                
                // Linear interpolation between cursor points
                const progress = (timeMs - before.timeMs) / (after.timeMs - before.timeMs);
                return {
                  x: before.x + (after.x - before.x) * progress,
                  y: before.y + (after.y - before.y) * progress,
                };
              };
              
              for (let t = t1; t < sampleEnd; t += step) {
                const cp = getCursorAtTime(t);
                samplesX.push(`if(between(it,${t},${t+step}),${cp.x}`);
                samplesY.push(`if(between(it,${t},${t+step}),${cp.y}`);
              }
              const finalCp = slide.cursorTrack[slide.cursorTrack.length - 1];
              txExpr = samplesX.join(',') + `,${finalCp.x}` + ')'.repeat(samplesX.length);
              tyExpr = samplesY.join(',') + `,${finalCp.y}` + ')'.repeat(samplesY.length);
            }
             
            xExprs.push(`if(between(it,${t1},${t2}),${txExpr}`);
            yExprs.push(`if(between(it,${t1},${t2}),${tyExpr}`);
          }
          
          const targetZ = zExprs.join(',') + ',1' + ')'.repeat(zExprs.length);
          const targetX = xExprs.join(',') + ',0.5' + ')'.repeat(xExprs.length);
          const targetY = yExprs.join(',') + ',0.5' + ')'.repeat(yExprs.length);

          // IMPROVED: Use configurable damping per keyframe
          // Get the active zoom at any point to determine damping
          const dampingExpr = (() => {
            if (sortedZooms.length === 0) return '0.01';
            let expr = '';
            for (let i = 0; i < sortedZooms.length; i++) {
              const z = sortedZooms[i];
              const t1 = z.timestampStartSeconds;
              const nextZoom = sortedZooms[i + 1];
              const t2 = nextZoom ? nextZoom.timestampStartSeconds : zoomTimelineEnd;
              const damping = z.cursorDamping ?? 0.01;
              expr += `if(between(it,${t1},${t2}),${damping},`;
            }
            expr += '0.01' + ')'.repeat(sortedZooms.length);
            return expr;
          })();

          // Exponential smoothing with zoom-specific damping
          const zFormula = `max(1, pzoom + (${targetZ} - pzoom)*if(gt(${targetZ},pzoom),${dampingExpr}*2,${dampingExpr}))`;
          // Panning with configurable damping
          const xFormula = `px + (((iw - iw/zoom)*${targetX}) - px)*${dampingExpr}`;
          const yFormula = `py + (((ih - ih/zoom)*${targetY}) - py)*${dampingExpr}`;

          const zoomLabel = `vZoom_${i}`;
          videoFilterParts.push(`[${baseVideoLabel}]zoompan=z='${zFormula}':x='${xFormula}':y='${yFormula}':d=1:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${FPS}[${zoomLabel}]`);
          baseVideoLabel = zoomLabel;
        }

        // Video Filter
        const allTimedScenes = (slide.videoNarrationAnalysis?.scenes ?? [])
          .filter(scene => Number.isFinite(scene.timestampStartSeconds) && Number.isFinite(scene.durationSeconds) && Number.isFinite(scene.effectiveDurationSeconds))
          .sort((a, b) => a.effectiveStartSeconds - b.effectiveStartSeconds);

        if (slide.type === 'video' && allTimedScenes.length > 0) {
          const sceneLabels: string[] = [];

          for (let j = 0; j < allTimedScenes.length; j++) {
            const scene = allTimedScenes[j];
            const originalStart = Math.max(0, scene.timestampStartSeconds || 0);
            const originalDuration = Math.max(0.05, scene.durationSeconds || 0.05);
            const originalEnd = originalStart + originalDuration;
            const effectiveDuration = Math.max(0.05, scene.effectiveDurationSeconds || originalDuration);

            const baseLabel = `vSceneBase_${i}_${j}`;
            const sceneLabel = `vScene_${i}_${j}`;
            sceneLabels.push(sceneLabel);

            videoFilterParts.push(
              `[${baseVideoLabel}]trim=start=${originalStart}:end=${originalEnd},setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p[${baseLabel}]`
            );

            if (effectiveDuration > originalDuration) {
              const freezeDuration = Math.max(0.01, effectiveDuration - originalDuration);
              videoFilterParts.push(
                `[${baseLabel}]tpad=stop_mode=clone:stop_duration=${freezeDuration},trim=duration=${effectiveDuration},setpts=PTS-STARTPTS[${sceneLabel}]`
              );
            } else {
              videoFilterParts.push(
                `[${baseLabel}]trim=duration=${effectiveDuration},setpts=PTS-STARTPTS[${sceneLabel}]`
              );
            }
          }

          const stitchedLabel = `vStitched_${i}`;
          if (sceneLabels.length === 1) {
            videoFilterParts.push(`[${sceneLabels[0]}]copy[${stitchedLabel}]`);
          } else {
            const concatInputs = sceneLabels.map(label => `[${label}]`).join('');
            videoFilterParts.push(`${concatInputs}concat=n=${sceneLabels.length}:v=1:a=0[${stitchedLabel}]`);
          }

          const renderedSceneEnd = allTimedScenes.reduce((max, scene) => {
            return Math.max(max, (scene.effectiveStartSeconds || 0) + (scene.effectiveDurationSeconds || 0));
          }, 0);
          const tailPad = Math.max(0, duration - renderedSceneEnd);

          if (tailPad > 0.01) {
            videoFilterParts.push(`[${stitchedLabel}]tpad=stop_mode=clone:stop_duration=${tailPad},trim=duration=${duration},setpts=PTS-STARTPTS[${vLabel}]`);
          } else {
            videoFilterParts.push(`[${stitchedLabel}]trim=duration=${duration},setpts=PTS-STARTPTS[${vLabel}]`);
          }
        } else {
          // No timed scenes just trim
          let vFilter = `[${baseVideoLabel}]fps=${FPS},format=yuv420p`;
          vFilter += `,trim=duration=${duration},setpts=PTS-STARTPTS[${vLabel}]`;
          videoFilterParts.push(vFilter);
        }
        videoStreamLabels.push(vLabel);

        // Audio Filter
        if (hasAudio) {
          if (segmentAudioInputs.length > 0) {
            const delayedLabels: string[] = [];

            for (const seg of segmentAudioInputs) {
              const delayMs = Math.max(0, Math.round(seg.startSeconds * 1000));
              const outLabel = `${seg.label}_d`;
              audioFilterParts.push(
                `[${seg.idx}:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=duration=${seg.durationSeconds},adelay=${delayMs}|${delayMs}[${outLabel}]`
              );
              delayedLabels.push(`[${outLabel}]`);
            }

            const mixedLabel = `segMix_${i}`;
            audioFilterParts.push(`${delayedLabels.join('')}amix=inputs=${delayedLabels.length}:duration=longest:dropout_transition=0[${mixedLabel}]`);
            audioFilterParts.push(`[${mixedLabel}]aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=duration=${duration}[${aLabel}]`);
            audioStreamLabels.push(aLabel);
          } else if (singleAudioIdx !== null) {
            audioFilterParts.push(`[${singleAudioIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=duration=${duration}[${aLabel}]`);
            audioStreamLabels.push(aLabel);
          }
        }

        if (!hasAudio) {
          // Silence
          audioFilterParts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${duration}[${aLabel}]`);
          audioStreamLabels.push(aLabel);
        }
      }

      // 5. Chain Transition Filters
      // Re-calculate durations as we need them for offset calculations
      const calcDuration = (s: Slide) => Math.max((s.duration || 5) + (s.postAudioDelay || 0), 0.1);

      let lastV = videoStreamLabels[0];
      let currentDuration = calcDuration(renderSlides[0]);

      if (renderSlides.length > 1) {
        for (let i = 1; i < renderSlides.length; i++) {
          const slide = renderSlides[i];
          const transType = slide.transition || 'fade';

          let ffmpegTrans = 'fade';
          switch (transType) {
            case 'slide': ffmpegTrans = 'slideleft'; break;
            case 'wipe': ffmpegTrans = 'wipeleft'; break;
            case 'blur': ffmpegTrans = 'circleopen'; break;
            case 'zoom': ffmpegTrans = 'zoomin'; break;
            case 'none': ffmpegTrans = 'fade'; break;
            default: ffmpegTrans = 'fade';
          }

          const dCurrent = calcDuration(slide);
          const nextV = `vMerged${i}`;

          if (transType === 'none') {
            videoFilterParts.push(`[${lastV}][${videoStreamLabels[i]}]concat=n=2:v=1:a=0[${nextV}]`);
          } else {
            let transDur = 0.5;
            const safeTransDur = Math.min(transDur, currentDuration / 2, dCurrent / 2);
            transDur = Math.max(safeTransDur, 0.05);

            const paddedPrev = `vPad${i}`;
            videoFilterParts.push(`[${lastV}]tpad=stop_mode=clone:stop_duration=${transDur}[${paddedPrev}]`);
            videoFilterParts.push(`[${paddedPrev}][${videoStreamLabels[i]}]xfade=transition=${ffmpegTrans}:duration=${transDur}:offset=${currentDuration}[${nextV}]`);
          }

          lastV = nextV;
          currentDuration += dCurrent;
        }
      }

      // Store the final calculated duration for progress reporting
      estimatedTotalDuration = currentDuration;

      // Output mapping
      if (renderSlides.length > 0) {
        // Rename final output to standard labels expected by footer
        if (enableIntroFadeIn) {
          const introFadeDuration = Math.max(0.05, Math.min(Math.max(0.1, introFadeInDurationSec || 1), currentDuration / 2));
          videoFilterParts.push(`[${lastV}]fade=t=in:st=0:d=${introFadeDuration},format=yuv420p[vout_raw]`);
        } else {
          videoFilterParts.push(`[${lastV}]format=yuv420p[vout_raw]`);
        }
        if (audioStreamLabels.length === 1) {
          audioFilterParts.push(`[${audioStreamLabels[0]}]volume=1.0[aout_speech]`);
        } else {
          const concatAudioInputs = audioStreamLabels.map(label => `[${label}]`).join('');
          audioFilterParts.push(`${concatAudioInputs}concat=n=${audioStreamLabels.length}:v=0:a=1[aout_speech_concat]`);
          audioFilterParts.push(`[aout_speech_concat]volume=1.0[aout_speech]`);
        }
      } else {
        videoFilterParts.push(`color=black:${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=1[vout_raw]`);
        audioFilterParts.push(`anullsrc[aout_speech]`);
      }

      // Background Music
      let finalAudioMap = '[aout_speech]';
      if (musicSettings?.url || musicSettings?.blob) {
        const musicFname = 'bg_music.mp3';

        // Fetch music from URL or Blob
        if (musicSettings.blob) {
          // Write blob directly to FFmpeg
          const arrayBuffer = await musicSettings.blob.arrayBuffer();
          await ffmpeg.writeFile(musicFname, new Uint8Array(arrayBuffer));
        } else if (musicSettings.url) {
          // Fetch from URL
          await ffmpeg.writeFile(musicFname, await fetchFile(musicSettings.url));
        }

        cleanupFiles.push(musicFname);

        // Add music input
        inputArgs.push('-stream_loop', '-1', '-i', musicFname);
        const musicIdx = currentInputIdx++;

        audioFilterParts.push(`[aout_speech]volume=${ttsVolume}[speech_vol]`);
        audioFilterParts.push(`[${musicIdx}:a]volume=${musicSettings.volume}[music_vol]`);
        audioFilterParts.push(`[speech_vol][music_vol]amix=inputs=2:duration=first:dropout_transition=0.5[aout_mixed]`);
        finalAudioMap = '[aout_mixed]';
      } else {
        // Ensure we have the mixed map even if no music
        audioFilterParts.push(`[aout_speech]volume=${ttsVolume}[aout_mixed]`);
        finalAudioMap = '[aout_mixed]';
      }

      const complexFilter = [...videoFilterParts, ...audioFilterParts].join(';');


      // Run FFmpeg
      await ffmpeg.exec([
        ...inputArgs,
        '-filter_complex', complexFilter,
        '-map', '[vout_raw]',
        '-map', finalAudioMap,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-threads', '0',
        '-tune', 'fastdecode',
        '-c:a', 'aac',
        '-b:a', '192k',
        'output.mp4'
      ]);

      // Read result
      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
      return blob;

    } catch (e) {
      console.error('Render failed', e);
      // If we were aborted, throw a clean error instead of the FFmpeg termination error
      if (this.aborted) {
        throw new Error('Render aborted');
      }
      throw e;
    } finally {
      // Cleanup
      for (const file of cleanupFiles) {
        try { await ffmpeg.deleteFile(file); } catch { /* ignore */ }
      }
      try { await ffmpeg.deleteFile('output.mp4'); } catch { /* ignore */ }
    }
  }  // end render()

  /**
   * Pre-renders a single video slide with its zoom/pan/cursor-follow effects baked in.
   * Returns a processed Blob containing the zoomed/panned video (no audio).
   * The caller should replace slide.mediaUrl with URL.createObjectURL(result).
   */
  async renderClip(slide: Slide, resolution: RenderResolution = '720p', onProgress?: (p: number) => void): Promise<Blob> {
    if (!this.loaded || !this.ffmpeg) {
      await this.load();
    }
    if (!this.ffmpeg) throw new Error('FFmpeg failed to initialize');
    const ffmpeg = this.ffmpeg;
    const { fetchFile } = await import('@ffmpeg/util');

    const VIDEO_WIDTH = resolution === '720p' ? 1280 : 1920;
    const VIDEO_HEIGHT = resolution === '720p' ? 720 : 1080;
    const FPS = 30;
    const cleanupFiles: string[] = [];

    ffmpeg.on('progress', ({ progress }) => {
      if (onProgress) onProgress(Math.round(progress * 100));
    });

    try {
      if (!slide.mediaUrl) throw new Error('Slide has no mediaUrl to process');

      // Write input video to FFmpeg FS
      const ext = this.getSafeMediaExtension(slide.mediaUrl, 'video');
      const inputFile = `clip_input.${ext}`;
      await ffmpeg.writeFile(inputFile, await fetchFile(slide.mediaUrl));
      cleanupFiles.push(inputFile);

      const filterParts: string[] = [];

      // 1. Scale to target resolution
      filterParts.push(`[0:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1[vPre]`);

      let baseLabel = 'vPre';

      // 2. Apply zoompan if there are zoom keyframes
      if (slide.zooms && slide.zooms.length > 0) {
        const zExprs: string[] = [];
        const xExprs: string[] = [];
        const yExprs: string[] = [];
        const sortedZooms = [...slide.zooms].sort((a, b) => a.timestampStartSeconds - b.timestampStartSeconds);
        const zoomTimelineEnd = Math.max(0.05, slide.mediaDuration ?? slide.duration ?? 5);

        for (let zoomIndex = 0; zoomIndex < sortedZooms.length; zoomIndex++) {
          const z = sortedZooms[zoomIndex];
          const t1 = z.timestampStartSeconds;
          // A zoom keyframe persists until the *next* one starts — for the clip render we use a large end sentinel
          const nextZoom = sortedZooms[zoomIndex + 1];
          const fallbackEnd = t1 + Math.max(z.durationSeconds, 1);
          const naturalEnd = nextZoom ? nextZoom.timestampStartSeconds : Math.max(zoomTimelineEnd, fallbackEnd);
          const t2 = Math.max(t1 + 0.001, naturalEnd);

          zExprs.push(`if(between(it,${t1},${t2}),${z.zoomLevel}`);

          let txExpr = `${z.targetX ?? 0.5}`;
          let tyExpr = `${z.targetY ?? 0.5}`;

          if (z.type === 'cursor' && slide.cursorTrack && slide.cursorTrack.length > 0) {
            const samplesX: string[] = [];
            const samplesY: string[] = [];
            const step = 0.25;
            const sampleEnd = Math.min(t2, Math.max(zoomTimelineEnd, t1 + step));
            for (let t = t1; t < sampleEnd; t += step) {
              const cp = slide.cursorTrack.find(c => c.timeMs / 1000 >= t) || slide.cursorTrack[slide.cursorTrack.length - 1];
              samplesX.push(`if(between(it,${t.toFixed(3)},${(t + step).toFixed(3)}),${cp.x}`);
              samplesY.push(`if(between(it,${t.toFixed(3)},${(t + step).toFixed(3)}),${cp.y}`);
            }
            const finalCp = slide.cursorTrack[slide.cursorTrack.length - 1];
            txExpr = samplesX.join(',') + `,${finalCp.x}` + ')'.repeat(samplesX.length);
            tyExpr = samplesY.join(',') + `,${finalCp.y}` + ')'.repeat(samplesY.length);
          }

          xExprs.push(`if(between(it,${t1},${t2}),${txExpr}`);
          yExprs.push(`if(between(it,${t1},${t2}),${tyExpr}`);
        }

        const targetZ = zExprs.join(',') + ',1' + ')'.repeat(zExprs.length);
        const targetX = xExprs.join(',') + ',0.5' + ')'.repeat(xExprs.length);
        const targetY = yExprs.join(',') + ',0.5' + ')'.repeat(yExprs.length);

        const zFormula = `max(1, pzoom + (${targetZ} - pzoom)*if(gt(${targetZ},pzoom),0.010,0.005))`;
        const xFormula = `px + (((iw - iw/zoom)*${targetX}) - px)*0.005`;
        const yFormula = `py + (((ih - ih/zoom)*${targetY}) - py)*0.005`;

        filterParts.push(`[${baseLabel}]zoompan=z='${zFormula}':x='${xFormula}':y='${yFormula}':d=1:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${FPS}[vZoom]`);
        baseLabel = 'vZoom';
      }

      // 3. Final format pass — ensure output is compatible
      filterParts.push(`[${baseLabel}]format=yuv420p[vout]`);

      const complexFilter = filterParts.join(';');

      await ffmpeg.exec([
        '-i', inputFile,
        '-filter_complex', complexFilter,
        '-map', '[vout]',
        '-an',              // strip audio — will be handled by the full render
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-threads', '0',
        'clip_output.mp4'
      ]);

      const data = await ffmpeg.readFile('clip_output.mp4');
      return new Blob([data as BlobPart], { type: 'video/mp4' });

    } finally {
      for (const f of cleanupFiles) {
        try { await ffmpeg.deleteFile(f); } catch { /* ignore */ }
      }
      try { await ffmpeg.deleteFile('clip_output.mp4'); } catch { /* ignore */ }
    }
  }
}
