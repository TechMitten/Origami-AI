import { getFFmpeg, isFFmpegLoaded } from './ffmpegLoader';

/**
 * Audio format conversion on the shared FFmpeg.wasm singleton.
 *
 * Unlike images, this genuinely needs the wasm core: no browser exposes an
 * MP3/AAC/FLAC encoder to script. Callers should therefore invoke it lazily, on
 * the user's convert click, so nobody pays the ~32MB core download just for
 * opening the page.
 *
 * The target matrix below is hardcoded rather than probed at runtime. Both
 * @ffmpeg/core@0.12.6 and @ffmpeg/core-mt@0.12.6 (the two CDN builds pinned in
 * ffmpegLoader.ts) report the same configuration:
 *
 *   --enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx
 *   --enable-libmp3lame --enable-libtheora --enable-libvorbis --enable-libopus
 *   --enable-zlib --enable-libwebp --enable-libfreetype --enable-libfribidi
 *   --enable-libass --enable-libzimg
 *
 * There is no --disable-everything, so the native aac/flac/pcm encoders and the
 * ogg/ipod/wav muxers are present too. A runtime `-encoders` probe could not
 * gate the UI anyway, since answering it requires the 32MB core to already be
 * loaded. Re-verify the configure line against the pinned URLs if the core is
 * ever bumped.
 */

export type AudioTargetId = 'mp3' | 'm4a' | 'ogg' | 'opus' | 'flac' | 'wav';

export interface AudioTarget {
  id: AudioTargetId;
  label: string;
  /** Includes the dot, e.g. '.mp3'. */
  extension: string;
  mime: string;
  lossy: boolean;
  /** One-line "when to pick this" shown under the chip row. */
  blurb: string;
  /** Codec and muxer flags only — the caller supplies -i, -vn and the output. */
  args: (bitrateKbps: number) => string[];
}

export const AUDIO_TARGETS: readonly AudioTarget[] = [
  {
    id: 'mp3',
    label: 'MP3',
    extension: '.mp3',
    mime: 'audio/mpeg',
    lossy: true,
    blurb: 'Plays on everything ever made. The safe default when you are not sure.',
    args: (kbps) => ['-c:a', 'libmp3lame', '-b:a', `${kbps}k`],
  },
  {
    id: 'm4a',
    label: 'AAC (M4A)',
    extension: '.m4a',
    mime: 'audio/mp4',
    lossy: true,
    blurb: 'Better quality than MP3 at the same bitrate. The Apple and podcast default.',
    args: (kbps) => ['-c:a', 'aac', '-b:a', `${kbps}k`, '-movflags', '+faststart', '-f', 'ipod'],
  },
  {
    id: 'ogg',
    label: 'Ogg Vorbis',
    extension: '.ogg',
    mime: 'audio/ogg',
    lossy: true,
    blurb: 'Royalty-free and well supported in browsers and game engines.',
    args: (kbps) => ['-c:a', 'libvorbis', '-b:a', `${kbps}k`, '-f', 'ogg'],
  },
  {
    id: 'opus',
    label: 'Opus',
    extension: '.opus',
    mime: 'audio/ogg',
    lossy: true,
    blurb: 'The best quality per kilobyte, especially for speech. Ideal for voice notes.',
    // Muxed as Ogg rather than through a dedicated 'opus' muxer alias: an Ogg
    // Opus stream written to a .opus file is the standard on-disk form.
    args: (kbps) => ['-c:a', 'libopus', '-b:a', `${Math.min(kbps, 256)}k`, '-vbr', 'on', '-f', 'ogg'],
  },
  {
    id: 'flac',
    label: 'FLAC',
    extension: '.flac',
    mime: 'audio/flac',
    lossy: false,
    blurb: 'Lossless compression — identical audio, roughly half the size of WAV.',
    args: () => ['-c:a', 'flac', '-compression_level', '5', '-f', 'flac'],
  },
  {
    id: 'wav',
    label: 'WAV',
    extension: '.wav',
    mime: 'audio/wav',
    lossy: false,
    blurb: 'Uncompressed PCM. Large files, but every editor opens them without fuss.',
    args: () => ['-c:a', 'pcm_s16le', '-f', 'wav'],
  },
] as const;

export const AUDIO_BITRATES = [96, 128, 192, 256, 320] as const;
export type AudioBitrate = (typeof AUDIO_BITRATES)[number];

/**
 * Video containers are included on purpose: FFmpeg will happily demux one and
 * throw the picture away, which makes "rip the audio out of this MP4" fall out
 * of the same code path for free.
 */
export const AUDIO_INPUT_EXTENSIONS: readonly string[] = [
  '.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wma', '.aiff', '.aif', '.alac', '.amr', '.caf',
  '.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi',
];

/** `accept` map for react-dropzone. */
export const AUDIO_DROPZONE_ACCEPT: Record<string, string[]> = {
  'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wma', '.aiff', '.aif', '.amr', '.caf'],
  'video/*': ['.mp4', '.m4v', '.webm', '.mov', '.mkv', '.avi'],
};

export function looksLikeAudioSource(file: File): boolean {
  if (file.type.startsWith('audio/') || file.type.startsWith('video/')) return true;
  const name = file.name.toLowerCase();
  return AUDIO_INPUT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** True once the shared FFmpeg core is in memory, i.e. conversion starts instantly. */
export const isAudioEncoderReady = isFFmpegLoaded;

/**
 * Download and instantiate the core up front.
 *
 * Batch callers should await this once before their loop: letting the first
 * conversion trigger the load means a failed download is retried per file,
 * which turns one 32MB failure into forty.
 */
export async function ensureAudioEngine(): Promise<void> {
  await getFFmpeg();
}

export interface AudioConvertOptions {
  /** Constant bitrate for the lossy encoders. Ignored by FLAC and WAV. */
  bitrateKbps?: number;
  /** Forced output sample rate. Omit to preserve the source's. */
  sampleRateHz?: number;
  /** Extra FFmpeg args (metadata, filters) inserted before the output name. */
  extraArgs?: string[];
  /** Called with 0..1 as FFmpeg works through the file. */
  onProgress?: (progress: number) => void;
  /**
   * Checked before the job starts and between its stages. An FFmpeg exec that is
   * already running cannot be interrupted without tearing down the core that the
   * video renderers also share, so mid-exec aborts are not supported.
   */
  signal?: AbortSignal;
}

export class AudioConvertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioConvertError';
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException('Conversion cancelled.', 'AbortError');
}

function inputExtensionFor(input: Blob): string {
  if (input instanceof File) {
    const dot = input.name.lastIndexOf('.');
    if (dot > 0) return input.name.slice(dot).toLowerCase();
  }
  const subtype = input.type.split('/')[1];
  return subtype ? `.${subtype.split(';')[0]}` : '.bin';
}

// One singleton, one worker, one shared MEMFS — also used by the two video
// renderers. Jobs are chained rather than raced.
let jobTail: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = jobTail.then(job, job);
  // Keep the chain alive even when a job rejects.
  jobTail = run.catch(() => undefined);
  return run;
}

interface FFmpegJob {
  input: Blob;
  inputExtension: string;
  outputExtension: string;
  outputMime: string;
  /** Built fresh per attempt so a retry can vary the arguments. */
  buildArgs: (inputName: string, outputName: string, attempt: number) => string[];
  attempts: number;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

async function runFFmpegJob(job: FFmpegJob): Promise<Blob> {
  throwIfAborted(job.signal);

  const ffmpeg = await getFFmpeg();
  throwIfAborted(job.signal);

  // The singleton's virtual FS is shared with the video renderers, so stamp the
  // scratch names rather than risk stepping on a concurrent render's files.
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inputName = `convert_${stamp}${job.inputExtension}`;
  const outputName = `convert_${stamp}${job.outputExtension}`;

  const handleProgress = ({ progress }: { progress: number }) => {
    job.onProgress?.(Math.max(0, Math.min(1, progress)));
  };
  if (job.onProgress) ffmpeg.on('progress', handleProgress);

  // FFmpeg reports the real reason for a failure on its log, not in the exit
  // code, so keep a short tail to attach to the thrown error.
  const logTail: string[] = [];
  const handleLog = ({ message }: { message: string }) => {
    logTail.push(message);
    if (logTail.length > 8) logTail.shift();
  };
  ffmpeg.on('log', handleLog);

  try {
    await ffmpeg.writeFile(inputName, new Uint8Array(await job.input.arrayBuffer()));
    throwIfAborted(job.signal);

    let lastFailure = '';
    for (let attempt = 0; attempt < job.attempts; attempt++) {
      logTail.length = 0;

      // exec() resolves with the process exit code, which every other call site
      // in this repo discards. Checking it is what turns a silently empty output
      // into an error the user can act on.
      const code = await ffmpeg.exec(job.buildArgs(inputName, outputName, attempt));
      if (code === 0) {
        const data = await ffmpeg.readFile(outputName);
        if (!(data instanceof Uint8Array) || data.byteLength === 0) {
          lastFailure = 'FFmpeg reported success but produced an empty file.';
        } else {
          return new Blob([data as BlobPart], { type: job.outputMime });
        }
      } else {
        lastFailure = `FFmpeg exited with code ${code}.`;
      }

      console.error(`[AudioConvert] attempt ${attempt + 1} failed: ${lastFailure}`, logTail.join('\n'));
      throwIfAborted(job.signal);
    }

    const detail = logTail.filter((line) => /error|invalid|unsupported|could not|no such/i.test(line)).pop();
    throw new AudioConvertError(
      detail
        ? `This file could not be converted: ${detail.trim()}`
        : `This file could not be converted. ${lastFailure}`,
    );
  } finally {
    if (job.onProgress) ffmpeg.off('progress', handleProgress);
    ffmpeg.off('log', handleLog);
    for (const name of [inputName, outputName]) {
      try {
        await ffmpeg.deleteFile(name);
      } catch {
        // file may not exist if exec failed early
      }
    }
  }
}

/**
 * Re-encode any audio (or the audio track of a video) into `target`.
 *
 * The source sample rate is preserved rather than forced, so a 48kHz master
 * stays 48kHz. The one real failure mode that causes — libmp3lame rejecting a
 * rate outside its table, e.g. a 96kHz WAV — is handled by retrying once at
 * 44.1kHz rather than by resampling everything up front.
 */
export async function convertAudio(
  input: Blob,
  target: AudioTarget,
  options: AudioConvertOptions = {},
): Promise<Blob> {
  const { bitrateKbps = 192, sampleRateHz, extraArgs = [], onProgress, signal } = options;

  return enqueue(() =>
    runFFmpegJob({
      input,
      inputExtension: inputExtensionFor(input),
      outputExtension: target.extension,
      outputMime: target.mime,
      attempts: sampleRateHz ? 1 : 2,
      onProgress,
      signal,
      buildArgs: (inputName, outputName, attempt) => {
        const rate = sampleRateHz ?? (attempt > 0 ? 44100 : undefined);
        return [
          '-i', inputName,
          // Cover art in an MP3 is a video stream; without -vn the encoder tries
          // to re-encode the artwork and can fail outright.
          '-vn',
          ...target.args(bitrateKbps),
          ...(rate ? ['-ar', String(rate)] : []),
          ...extraArgs,
          outputName,
        ];
      },
    }),
  );
}

/** Swap a filename's extension for the target's, e.g. 'take.wav' -> 'take.mp3'. */
export function outputFilename(originalName: string, extension: string): string {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base}${extension}`;
}
