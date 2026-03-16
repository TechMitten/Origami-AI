import type { FFmpeg } from '@ffmpeg/ffmpeg';

interface Slide {
  dataUrl?: string;
  mediaUrl?: string;
  audioUrl?: string;
  duration?: number;
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

export class BrowserVideoRenderer {
  private ffmpeg: FFmpeg | null = null;
  private loaded: boolean = false;
  private aborted: boolean = false;

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
    }
  }

  async render({
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
      // Add mandatory outro slide
      const renderSlides: Slide[] = [...slides, {
        mediaUrl: window.location.origin + '/outro-slide.jpg',
        duration: 5,
        postAudioDelay: 0,
        type: 'image',
        transition: 'fade',
        isTtsDisabled: true,
      }];

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
              `[${visualIdx}:v]trim=start=${originalStart}:end=${originalEnd},setpts=PTS-STARTPTS,scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},format=yuv420p[${baseLabel}]`
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
          // Scale and Pad
          let vFilter = `[${visualIdx}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

          // FPS & Format
          vFilter += `,fps=${FPS},format=yuv420p`;

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
      let lastA = audioStreamLabels[0];
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

          let transDur = 0.5;
          if (transType === 'none') transDur = 0.1;

          const dCurrent = calcDuration(slide);
          const safeTransDur = Math.min(transDur, currentDuration / 2, dCurrent / 2);
          transDur = Math.max(safeTransDur, 0.05);

          const offset = currentDuration - transDur;

          const nextV = `vMerged${i}`;
          const nextA = `aMerged${i}`;

          videoFilterParts.push(`[${lastV}][${videoStreamLabels[i]}]xfade=transition=${ffmpegTrans}:duration=${transDur}:offset=${offset}[${nextV}]`);
          audioFilterParts.push(`[${lastA}][${audioStreamLabels[i]}]acrossfade=d=${transDur}:c1=tri:c2=tri[${nextA}]`);

          lastV = nextV;
          lastA = nextA;
          currentDuration = offset + dCurrent;
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
        audioFilterParts.push(`[${lastA}]volume=1.0[aout_speech]`);
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
  }
}
