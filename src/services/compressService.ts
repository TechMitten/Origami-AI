/**
 * "Compress" mode for the Convert Studio: drop an image or an audio file and get
 * back the same format re-encoded so it is smaller, with no format picker — the
 * whole point is to shrink what you already have.
 *
 * Images go through the canvas path (`convertImage`) with a deliberately low
 * quality, and for lossy formats the quality is stepped down until the output is
 * actually smaller than the source (the old fixed 0.82 default could return a
 * bigger file). Audio goes through FFmpeg (`convertAudio`) at a low bitrate,
 * stepping down further if needed.
 *
 * Formats the browser cannot re-encode to themselves (GIF, BMP, SVG, ICO, HEIC,
 * etc.) fall back to WebP — the best universal "smaller" choice — and the note
 * tells the user the container changed. Same for audio with no matching target,
 * which falls back to MP3.
 */

import {
  AUDIO_TARGETS,
  convertAudio,
  looksLikeAudioSource,
  type AudioTarget,
} from './audioConvertService';
import {
  convertImage,
  getSupportedImageTargets,
  IMAGE_TARGETS,
  looksLikeImage,
  outputFilename,
  type ImageTarget,
} from './imageConvertService';

const COMPRESS_QUALITY = 0.6;
const COMPRESS_AUDIO_BITRATE = 128;
const COMPRESS_MIN_BITRATE = 64;
const MAX_COMPRESS_ATTEMPTS = 6;

export interface CompressOptions {
  /** Canvas fill colour for opaque targets (e.g. JPEG). */
  backgroundColor?: string;
  /** 0..1 FFmpeg progress. Images are synchronous and never fire this. */
  onProgress?: (progress: number) => void;
}

export interface CompressResult {
  blob: Blob;
  name: string;
  note?: string;
}

export function isCompressable(file: File): boolean {
  return looksLikeImage(file) || looksLikeAudioSource(file);
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

let supportedImageTargets: readonly ImageTarget[] | null = null;
function imageTargets(): readonly ImageTarget[] {
  if (!supportedImageTargets) supportedImageTargets = getSupportedImageTargets();
  return supportedImageTargets;
}

function imageTargetFor(file: File): { target: ImageTarget; changedFormat: boolean } {
  const ext = extensionOf(file.name);
  const byExt = new Map<string, ImageTarget>();
  for (const target of imageTargets()) byExt.set(target.extension, target);
  const jpeg = imageTargets().find((target) => target.id === 'jpeg');
  if (jpeg) byExt.set('.jpeg', jpeg);

  const match = byExt.get(ext);
  const target = match ?? imageTargets()[0] ?? IMAGE_TARGETS[0];
  return { target, changedFormat: match == null || target.extension !== ext };
}

async function compressImage(file: File, options: CompressOptions): Promise<CompressResult> {
  const { target, changedFormat } = imageTargetFor(file);
  const backgroundColor = options.backgroundColor ?? '#ffffff';

  let quality = COMPRESS_QUALITY;
  let result = await convertImage(file, target, { quality, backgroundColor });
  if (target.lossy) {
    let attempts = 0;
    while (result.blob.size >= file.size && quality > 0.05 && attempts < MAX_COMPRESS_ATTEMPTS) {
      attempts += 1;
      quality = Math.max(0.05, quality - 0.1);
      result = await convertImage(file, target, { quality, backgroundColor });
    }
  }

  const notes: string[] = [];
  if (result.truncatedAnimation) notes.push('Animated source — only the first frame was converted.');
  if (result.blob.size >= file.size) {
    notes.push(
      target.lossy
        ? 'Could not make this smaller — it is already compressed as far as this format allows.'
        : 'This image is already lossless, so re-compressing it cannot shrink the file.',
    );
  }
  if (changedFormat) notes.push(`Converted to ${target.label} for a smaller file.`);

  return {
    blob: result.blob,
    name: outputFilename(file.name, target.extension),
    note: notes.length > 0 ? notes.join(' ') : undefined,
  };
}

function audioTargetFor(file: File): { target: AudioTarget; changedFormat: boolean } {
  const ext = extensionOf(file.name);
  const byExt = new Map<string, AudioTarget>();
  for (const target of AUDIO_TARGETS) byExt.set(target.extension, target);

  const match = byExt.get(ext);
  const target = match ?? AUDIO_TARGETS[0];
  return { target, changedFormat: match == null || target.extension !== ext };
}

async function compressAudio(file: File, options: CompressOptions): Promise<CompressResult> {
  const { target, changedFormat } = audioTargetFor(file);

  let bitrate = COMPRESS_AUDIO_BITRATE;
  let blob = await convertAudio(file, target, {
    bitrateKbps: target.lossy ? bitrate : undefined,
    onProgress: options.onProgress,
  });
  if (target.lossy) {
    let attempts = 0;
    while (blob.size >= file.size && bitrate > COMPRESS_MIN_BITRATE && attempts < MAX_COMPRESS_ATTEMPTS) {
      attempts += 1;
      bitrate = Math.max(COMPRESS_MIN_BITRATE, bitrate - 32);
      blob = await convertAudio(file, target, {
        bitrateKbps: bitrate,
        onProgress: options.onProgress,
      });
    }
  }

  const notes: string[] = [];
  if (blob.size >= file.size) {
    notes.push(
      target.lossy
        ? 'Could not make this smaller — it is already compressed as far as this format allows.'
        : target.id === 'wav'
          ? 'WAV is uncompressed, so it cannot be shrunk without losing audio.'
          : 'This audio is already lossless and cannot be shrunk further.',
    );
  }
  if (changedFormat) notes.push(`Converted to ${target.label} for a smaller file.`);

  return {
    blob,
    name: outputFilename(file.name, target.extension),
    note: notes.length > 0 ? notes.join(' ') : undefined,
  };
}

export async function compressFile(file: File, options: CompressOptions = {}): Promise<CompressResult> {
  return looksLikeImage(file) ? compressImage(file, options) : compressAudio(file, options);
}
