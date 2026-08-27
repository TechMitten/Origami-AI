import { isFFmpegLoaded } from './ffmpegLoader';
import { AUDIO_TARGETS, convertAudio, type AudioTarget } from './audioConvertService';

/**
 * Downloadable-audio encoding for Voice Studio.
 *
 * Kokoro already hands back a playable `audio/wav` blob, so previewing needs no
 * encoder at all. Only the "save this to disk as an MP3" step comes through
 * here — which is why callers should invoke it lazily, on the download click,
 * rather than warming FFmpeg up front: a user who is only auditioning voices
 * should never pay the ~32MB core download.
 *
 * The FFmpeg mechanics live in audioConvertService; this module is the narrow,
 * Kokoro-shaped preset on top of them.
 */

export type Mp3Bitrate = 128 | 192 | 320;

export interface Mp3EncodeOptions {
  /** Constant bitrate handed to libmp3lame. Defaults to 192 kbps. */
  bitrateKbps?: Mp3Bitrate;
  /** Written into the ID3 title tag. */
  title?: string;
  /** Called with 0..1 as FFmpeg works through the file. */
  onProgress?: (progress: number) => void;
}

/** True once the shared FFmpeg core is in memory, i.e. encoding starts instantly. */
export const isMp3EncoderReady = isFFmpegLoaded;

const MP3_TARGET: AudioTarget = AUDIO_TARGETS.find((t) => t.id === 'mp3')!;

/**
 * Re-encode a WAV blob to MP3. Resolves with an `audio/mpeg` blob.
 *
 * Output is resampled to 44.1kHz — Kokoro renders at 24kHz, which is a valid but
 * less universally-supported MPEG-2 LSF rate — and left mono. The rate is forced
 * here rather than in convertAudio because it is specific to this source.
 */
export async function encodeWavToMp3(wav: Blob, options: Mp3EncodeOptions = {}): Promise<Blob> {
  const { bitrateKbps = 192, title, onProgress } = options;

  return convertAudio(wav, MP3_TARGET, {
    bitrateKbps,
    sampleRateHz: 44100,
    onProgress,
    extraArgs: ['-metadata', 'artist=Origami AI', ...(title ? ['-metadata', `title=${title}`] : [])],
  });
}
