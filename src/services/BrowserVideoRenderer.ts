import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

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
}

interface MusicSettings {
  url?: string;
  volume: number;
  loop?: boolean;
}

export interface RenderOptions {
  slides: Slide[];
  musicSettings?: MusicSettings;
  ttsVolume?: number;
  onProgress?: (progress: number) => void;
  onLog?: (message: string) => void;
}

export const videoEvents = new EventTarget();

export interface VideoProgressEventDetail {
  progress: number;
  status: string;
  file?: string;
}

export class BrowserVideoRenderer {
  private ffmpeg: FFmpeg;
  private loaded: boolean = false;

  constructor() {
    this.ffmpeg = new FFmpeg();
  }

  async load() {
    if (this.loaded) return;

    console.log('[FFmpeg] Loading core from CDN...');
    
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
    onProgress,
    onLog
  }: RenderOptions): Promise<Blob> {
    if (!this.loaded) {
      await this.load();
    }

    const { ffmpeg } = this;

    // Attach listeners
    ffmpeg.on('log', ({ message }) => {
        if (onLog) onLog(message);
        console.log('[FFmpeg Log]:', message);
    });

    ffmpeg.on('progress', ({ progress }) => {
        // progress is 0-1
        const p = progress * 100;
        if (onProgress) onProgress(p);
        
        videoEvents.dispatchEvent(new CustomEvent<VideoProgressEventDetail>('video-progress', {
            detail: { progress: p, status: 'Rendering Video...' }
        }));
    });

    const videoStreamLabels: string[] = [];
    const audioStreamLabels: string[] = [];
    const videoFilterParts: string[] = [];
    const audioFilterParts: string[] = [];
    
    let currentInputIdx = 0;
    const FPS = 30;

    const cleanupFiles: string[] = [];

    try {
      // Input Arguments Construction
      const inputArgs: string[] = [];
      const VIDEO_WIDTH = 1920;
      const VIDEO_HEIGHT = 1080;

      for (let i = 0; i < slides.length; i++) {
         const slide = slides[i];
         const visualIdx = currentInputIdx;
         
         // 1. Determine Duration
         // Ideally we probe audio here if needed.
         // Let's trust the input `slide.duration` for now. 
         // If we must probe, we need to run a separate exec call.
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
           const ext = slide.mediaUrl.split('.').pop() || 'mp4';
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
         if (slide.audioUrl && !slide.isTtsDisabled) {
             const fname = `speech_${i}.mp3`;
             await ffmpeg.writeFile(fname, await fetchFile(slide.audioUrl));
             cleanupFiles.push(fname);
             
             inputArgs.push('-i', fname);
             hasAudio = true;
             currentInputIdx++;
         }

         // 4. Build Filter Chain
         const vLabel = `v${i}`;
         const aLabel = `a${i}`;
         
         // Video Filter
         // Scale and Pad
         let vFilter = `[${visualIdx}:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
         
         // FPS & Format
         vFilter += `,fps=${FPS},format=yuv420p`;
         
         // Trim
         // For static images (looped), -t handles duration on input, but trim ensures filter chain matches.
         // For video, we definitely need to force duration if we want to sync with audio exactly, 
         // OR we let the video play out.
         // Let's enforce duration:
         vFilter += `,trim=duration=${duration},setpts=PTS-STARTPTS[${vLabel}]`;
         videoFilterParts.push(vFilter);
         videoStreamLabels.push(vLabel);

         // Audio Filter
         if (hasAudio) {
             // Audio is at visualIdx + 1
             const audioIdx = visualIdx + 1;
             audioFilterParts.push(`[${audioIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=duration=${duration}[${aLabel}]`);
             audioStreamLabels.push(aLabel);
         } else {
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
      let currentDuration = calcDuration(slides[0]);

      if (slides.length > 1) {
        for (let i = 1; i < slides.length; i++) {
            const slide = slides[i];
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

      // Output mapping
      if (slides.length > 0) {
         // Rename final output to standard labels expected by footer
         videoFilterParts.push(`[${lastV}]format=yuv420p[vout_raw]`);
         audioFilterParts.push(`[${lastA}]volume=1.0[aout_speech]`);
      } else {
         videoFilterParts.push(`color=black:1920x1080:d=1[vout_raw]`);
         audioFilterParts.push(`anullsrc[aout_speech]`);
      }

      // Background Music
      let finalAudioMap = '[aout_speech]';
      if (musicSettings?.url) {
          const musicFname = 'bg_music.mp3';
          await ffmpeg.writeFile(musicFname, await fetchFile(musicSettings.url));
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
