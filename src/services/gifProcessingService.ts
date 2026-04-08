import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

const FFMPEG_CDN_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

const markFfmpegAsCached = () => {
  try {
    const current = JSON.parse(localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}');
    if (!current.ffmpeg) {
      current.ffmpeg = true;
      localStorage.setItem('resource_cache_status', JSON.stringify(current));
    }
  } catch {
    localStorage.setItem('resource_cache_status', '{"tts":false,"ffmpeg":true,"webllm":false}');
  }
};

async function getSharedFfmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) {
    return ffmpegInstance;
  }

  if (ffmpegLoadPromise) {
    return ffmpegLoadPromise;
  }

  ffmpegLoadPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');

    const ffmpeg = new FFmpeg();
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${FFMPEG_CDN_BASE}/ffmpeg-core.js`, 'text/javascript'),
      toBlobURL(`${FFMPEG_CDN_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    ]);

    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    markFfmpegAsCached();
    return ffmpeg;
  })().finally(() => {
    ffmpegLoadPromise = null;
  });

  return ffmpegLoadPromise;
}

export interface GifConversionOptions {
  fps?: number;
  width?: number;
  onProgress?: (update: { stage: string; progress: number }) => void;
}

export async function convertVideoBlobToGif(
  source: Blob,
  options: GifConversionOptions = {}
): Promise<Blob> {
  const ffmpeg = await getSharedFfmpeg();
  const fps = Math.max(4, Math.min(16, Math.round(options.fps ?? 12)));
  const width = Math.max(360, Math.min(960, Math.round(options.width ?? 900)));
  const inputFile = `issue-capture-${crypto.randomUUID()}.webm`;
  const paletteFile = `palette-${crypto.randomUUID()}.png`;
  const outputFile = `issue-capture-${crypto.randomUUID()}.gif`;

  const progressHandler = ({ progress }: { progress: number }) => {
    const normalized = Math.max(0, Math.min(100, Math.round(progress * 100)));
    options.onProgress?.({
      stage: normalized >= 100 ? 'GIF ready' : 'Converting to GIF',
      progress: normalized,
    });
  };

  ffmpeg.on('progress', progressHandler);

  try {
    options.onProgress?.({ stage: 'Loading recorder clip', progress: 5 });
    await ffmpeg.writeFile(inputFile, await fetchFile(source));

    options.onProgress?.({ stage: 'Building GIF palette', progress: 18 });
    await ffmpeg.exec([
      '-i', inputFile,
      '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen=max_colors=128`,
      paletteFile,
    ]);

    options.onProgress?.({ stage: 'Converting to GIF', progress: 42 });
    await ffmpeg.exec([
      '-i', inputFile,
      '-i', paletteFile,
      '-lavfi', `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=sierra2_4a`,
      '-loop', '0',
      outputFile,
    ]);

    const data = await ffmpeg.readFile(outputFile);
    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
      throw new Error('FFmpeg produced an empty GIF.');
    }

    options.onProgress?.({ stage: 'GIF ready', progress: 100 });
    return new Blob([data], { type: 'image/gif' });
  } finally {
    ffmpeg.off('progress', progressHandler);
    for (const file of [inputFile, paletteFile, outputFile]) {
      try {
        await ffmpeg.deleteFile(file);
      } catch {
        // Ignore cleanup issues from the in-memory filesystem.
      }
    }
  }
}
