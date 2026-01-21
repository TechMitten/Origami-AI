import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMP_DIR = path.resolve(__dirname, '../../temp_render');

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

interface Slide {
  dataUrl?: string;
  mediaUrl?: string;
  audioUrl?: string;
  duration?: number;
  postAudioDelay?: number;
  type?: 'image' | 'video';
  isVideoMusicPaused?: boolean;
  isTtsDisabled?: boolean; // If true, rely on postAudioDelay for duration
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
  outputLocation: string;
  publicDir: string; // The root 'public' directory to resolve relative paths
}

// Helper: Get media duration
const getDuration = (filePath: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration || 0);
    });
  });
};

export const renderVideoWithFfmpeg = async ({
  slides,
  musicSettings,
  ttsVolume = 1,
  outputLocation,
  publicDir
}: RenderOptions): Promise<void> => {
  const tempFiles: string[] = [];

  try {
    const cmd = ffmpeg();
    
    // We will build lists of input indices for the complex filter
    // e.g. [v0][a0][v1][a1]...concat...
    const videoStreamLabels: string[] = [];
    const audioStreamLabels: string[] = [];
    const videoFilterParts: string[] = [];
    const audioFilterParts: string[] = [];
    
    let currentInputIdx = 0;

    // We assume 30 FPS for standarization
    const FPS = 30;

    // 1. Process each slide to determine duration and prepare inputs
    for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        console.log(`Processing Slide ${i}`, { type: slide.type, hasData: !!slide.dataUrl, media: slide.mediaUrl });
        
        // --- Resolve Visual Path ---
        let visualPath = '';
        const isVideo = slide.type === 'video';
        let isLavfi = false;

        if (slide.dataUrl) {
            const trimmed = slide.dataUrl.trim();
            
            // Check if it's actually an HTTP URL (not a data URL)
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
                // It's a URL, use it directly as the visual path
                visualPath = trimmed;
                console.log(`Slide ${i}: dataUrl is an HTTP URL, using directly.`);
            } else {
                // Try explicit regex first (captures subtype)
                const matches = trimmed.match(/^data:image\/([a-zA-Z0-9+.-]+).*base64,(.+)$/);
            
            let ext = 'png';
            let buffer: Buffer | null = null;
            let success = false;

            if (matches) {
                ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
                buffer = Buffer.from(matches[2], 'base64');
                success = true;
            } else {
                // Manual fallback: split at comma
                const commaIdx = trimmed.indexOf(',');
                if (commaIdx > -1) {
                    const header = trimmed.substring(0, commaIdx);
                    const data = trimmed.substring(commaIdx + 1);
                    
                    // Guess extension from header
                    if (header.includes('jpeg') || header.includes('jpg')) ext = 'jpg';
                    else if (header.includes('png')) ext = 'png';
                    else if (header.includes('webp')) ext = 'webp';
                    
                    buffer = Buffer.from(data, 'base64');
                    success = true;
                    console.log(`Slide ${i}: Used manual parsing fallback. Detected ext: ${ext}`);
                }
            }

            if (success && buffer) {
                const p = path.join(TEMP_DIR, `slide_${i}_${randomUUID()}.${ext}`);
                fs.writeFileSync(p, buffer);
                tempFiles.push(p);
                visualPath = p;
            } else {
                console.warn(`Slide ${i}: Failed to parse dataUrl. Start: ${trimmed.substring(0, 50)}...`);
            }
            }
        } else if (slide.mediaUrl) {
            if (slide.mediaUrl.startsWith('http')) {
                visualPath = slide.mediaUrl;
            } else {
                // Remove leading slash
                const clean = slide.mediaUrl.startsWith('/') ? slide.mediaUrl.slice(1) : slide.mediaUrl;
                visualPath = path.resolve(publicDir, clean);
            }
        }

        if (!visualPath) {
            console.warn(`Slide ${i} has no visual content. Using black placeholder.`);
            // Use lavfi color source
            visualPath = 'color=c=black:s=1920x1080';
            isLavfi = true;
        }

        // --- Resolve Audio Path ---
        let audioPath = '';
        if (slide.audioUrl && !slide.isTtsDisabled) {
            if (slide.audioUrl.startsWith('http')) {
                audioPath = slide.audioUrl;
            } else {
                const clean = slide.audioUrl.startsWith('/') ? slide.audioUrl.slice(1) : slide.audioUrl;
                audioPath = path.resolve(publicDir, clean);
            }
        }

        // --- Calculate Duration ---
        let duration = slide.duration || 5;
        if (audioPath) {
            try {
                duration = await getDuration(audioPath);
            } catch (e) {
                console.error(`Failed to get duration for ${audioPath}`, e);
            }
        }
        // Add delay
        duration += (slide.postAudioDelay || 0);
        // Minimum safety duration
        duration = Math.max(duration, 0.1);

        // --- Add Inputs to FFmpeg ---
        
        // Visual Input
        cmd.input(visualPath);
        if (isLavfi) {
             cmd.inputFormat('lavfi');
             cmd.inputOption(`-t ${duration}`);
        } else if (!isVideo) {
            // Loop image
            cmd.inputOption('-loop 1');
            cmd.inputOption(`-t ${duration}`);
        } else {
            // Video input options if needed
        }
        const visualIdx = currentInputIdx++;

        // Audio Input (TTS)
        let hasAudioFile = false;
        if (audioPath) {
            cmd.input(audioPath);
            hasAudioFile = true;
            currentInputIdx++;
        }

        // --- Build Filter Chain for this Slide ---
        
        // 1. Video Filter
        const vLabel = `v${i}`;
        
        let vFilter = `[${visualIdx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS},format=yuv420p`;
        
        // Force duration via trim/setpts
        // For lavfi/images with -t, trim is redundant but safe.
        // For video, it is crucial.
        vFilter += `,trim=duration=${duration},setpts=PTS-STARTPTS`;
        
        vFilter += `[${vLabel}]`;
        videoStreamLabels.push(vLabel);
        videoFilterParts.push(vFilter);

        // 2. Audio Filter (TTS)
        const aLabel = `a${i}`;
        if (hasAudioFile) {
            // Index is visualIdx + 1
            const audioIdx = visualIdx + 1;
            audioFilterParts.push(`[${audioIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=duration=${duration}[${aLabel}]`);
        } else {
            // Generate silence match duration
            audioFilterParts.push(`anullsrc=r=44100:cl=stereo,atrim=duration=${duration}[${aLabel}]`);
        }
        audioStreamLabels.push(aLabel);
    

    }
    
    // --- Concatenate All Slides ---
    
    // We must explicitly list the streams for the concat filter
    const concatVParams = videoStreamLabels.map(l => `[${l}]`).join('');
    const concatAParams = audioStreamLabels.map(l => `[${l}]`).join('');
    
    // [v0][v1]...concat=n=N:v=1:a=0[vout]
    // [a0][a1]...concat=n=N:v=0:a=1[aout]
    
    const n = slides.length;
    
    // Only add concat filters if we actually have streams
    if (n > 0) {
        videoFilterParts.push(`${concatVParams}concat=n=${n}:v=1:a=0[vout_raw]`);
        audioFilterParts.push(`${concatAParams}concat=n=${n}:v=0:a=1[aout_speech]`);
    } else {
        // Handle edge case of 0 slides if necessary, or let it fail/warn earlier
    }
    
    // --- Background Music Mixing ---
    
    let finalAudioMap = '[aout_speech]';
    
    if (musicSettings && musicSettings.url) {
        // Resolve path
        let musicPath = '';
        if (musicSettings.url.startsWith('http')) {
            musicPath = musicSettings.url;
        } else {
            const clean = musicSettings.url.startsWith('/') ? musicSettings.url.slice(1) : musicSettings.url;
            musicPath = path.resolve(publicDir, clean);
        }

        // Add music input
        cmd.input(musicPath);
        if (musicSettings.loop) {
            cmd.inputOption('-stream_loop -1'); // Loop infinitely
        }
        
        const musicIdx = currentInputIdx++;
        
        // We need to trim music to match video duration, and adjust volume
        // We can't know total video duration easily in filter without complex logic,
        // BUT 'shortest=1' in amix or distinct trim.
        
        // Filter: Adjust volume of speech and music
        // [aout_speech]volume=TTS_VOL[speech_norm]
        // [music]volume=MUSIC_VOL[music_norm]
        // [speech_norm][music_norm]amix=inputs=2:duration=first[aout_final]
        // assuming speech is 'first' and defines duration.
        
        audioFilterParts.push(`[aout_speech]volume=${ttsVolume}[speech_vol]`);
        audioFilterParts.push(`[${musicIdx}:a]volume=${musicSettings.volume}[music_vol]`);
        
        // amix duration=first ensures result length matches the speech track (which matches video track)
        audioFilterParts.push(`[speech_vol][music_vol]amix=inputs=2:duration=first:dropout_transition=0.5[aout_mixed]`);
        finalAudioMap = '[aout_mixed]';
    } else {
        // Just normalize speech volume
        audioFilterParts.push(`[aout_speech]volume=${ttsVolume}[aout_mixed]`);
        finalAudioMap = '[aout_mixed]';
    }
    
    // --- Apply Complex Filter ---
    // Flatten the filter parts arrays
    const complexFilter = [...videoFilterParts, ...audioFilterParts];
    
    // Log the filter for debugging
    // console.log('FFmpeg Complex Filter:', complexFilter.join(';'));
    
    cmd.complexFilter(complexFilter);
    
    // --- Output Options ---
    cmd.outputOptions([
        '-map [vout_raw]',
        `-map ${finalAudioMap}`,
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset ultrafast', // Fast render for VPS
        '-crf 28',         // Reasonable quality/size balance
        '-c:a aac',
        '-b:a 192k',
        '-movflags +faststart',
        '-y' // Overwrite
    ]);
    
    cmd.save(outputLocation);
    
    // --- Execution ---
    await new Promise<void>((resolve, reject) => {
        cmd.on('start', (commandLine) => {
            console.log('Spawned Ffmpeg with command: ' + commandLine);
        });
        cmd.on('error', (err, stdout, stderr) => {
            console.error('An error occurred: ' + err.message);
            console.error('ffmpeg stdout: ' + stdout);
            console.error('ffmpeg stderr: ' + stderr);
            reject(err);
        });
        cmd.on('end', () => {
            console.log('Processing finished !');
            resolve();
        });
    });

  } catch (error) {
     console.error("FFmpeg Render Error", error);
     throw error;
  } finally {
     // Cleanup temps
     tempFiles.forEach(f => {
         try { fs.unlinkSync(f); } catch { /* ignore cleanup errors */ }
     });
  }
};
