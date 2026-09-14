import TTSWorker from './tts.worker?worker';

export interface TTSOptions {
  voice: string;
  speed: number;
  pitch: number;
}

export interface Voice {
  id: string;
  name: string;
}

// These are the 28 voices kokoro-js 1.2.1 actually ships. Its _validate_voice()
// throws for anything outside this set, so entries must match the package's
// frozen VOICES map exactly — a bad id rejects generateTTS() at call time.
export const DEFAULT_VOICES: Voice[] = [
  // American Female
  { id: 'af_heart', name: 'Heart (Default)' },
  { id: 'af_alloy', name: 'Alloy' },
  { id: 'af_aoede', name: 'Aoede' },
  { id: 'af_bella', name: 'Bella' },
  { id: 'af_jessica', name: 'Jessica' },
  { id: 'af_kore', name: 'Kore' },
  { id: 'af_nicole', name: 'Nicole' },
  { id: 'af_nova', name: 'Nova' },
  { id: 'af_river', name: 'River' },
  { id: 'af_sarah', name: 'Sarah' },
  { id: 'af_sky', name: 'Sky' },
  // American Male
  { id: 'am_adam', name: 'Adam' },
  { id: 'am_echo', name: 'Echo' },
  { id: 'am_eric', name: 'Eric' },
  { id: 'am_fenrir', name: 'Fenrir' },
  { id: 'am_liam', name: 'Liam' },
  { id: 'am_michael', name: 'Michael' },
  { id: 'am_onyx', name: 'Onyx' },
  { id: 'am_puck', name: 'Puck' },
  { id: 'am_santa', name: 'Santa' },
  // British Female
  { id: 'bf_alice', name: 'Alice (British)' },
  { id: 'bf_emma', name: 'Emma (British)' },
  { id: 'bf_isabella', name: 'Isabella (British)' },
  { id: 'bf_lily', name: 'Lily (British)' },
  // British Male
  { id: 'bm_daniel', name: 'Daniel (British)' },
  { id: 'bm_fable', name: 'Fable (British)' },
  { id: 'bm_george', name: 'George (British)' },
  { id: 'bm_lewis', name: 'Lewis (British)' },
];

/** Voice ids that are valid for the bundled kokoro-js build. */
export const isSupportedVoice = (voiceId: string | null | undefined): boolean =>
  !!voiceId && DEFAULT_VOICES.some((voice) => voice.id === voiceId);

/** Falls back to the default voice when a stale/invalid id is loaded from settings. */
export const resolveVoice = (voiceId: string | null | undefined): string =>
  isSupportedVoice(voiceId) ? (voiceId as string) : 'af_heart';

export const AVAILABLE_VOICES = DEFAULT_VOICES;

// Singleton worker instance
let worker: Worker | null = null;

interface PendingRequest {
  resolve: (value: Blob) => void;
  reject: (reason?: unknown) => void;
}
const pendingRequests = new Map<string, PendingRequest>();

let activeTTSKeepAwakeCount = 0;
let keepAwakeAudioContext: AudioContext | null = null;
let keepAwakeOscillator: OscillatorNode | null = null;
let keepAwakeGain: GainNode | null = null;
let wakeLockSentinel: WakeLockSentinel | null = null;

const requestScreenWakeLock = async () => {
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
  };
  if (!nav.wakeLock || document.visibilityState !== 'visible' || wakeLockSentinel) return;

  try {
    wakeLockSentinel = await nav.wakeLock.request('screen');
    wakeLockSentinel.addEventListener('release', () => {
      wakeLockSentinel = null;
    }, { once: true });
  } catch (error) {
    console.warn('[TTS] Screen wake lock unavailable during generation:', error);
  }
};

const startTTSKeepAwake = async () => {
  activeTTSKeepAwakeCount++;
  await requestScreenWakeLock();

  if (keepAwakeAudioContext) {
    if (keepAwakeAudioContext.state === 'suspended') {
      await keepAwakeAudioContext.resume().catch(() => { });
    }
    return;
  }

  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    keepAwakeAudioContext = new AudioContextCtor();
    keepAwakeOscillator = keepAwakeAudioContext.createOscillator();
    keepAwakeGain = keepAwakeAudioContext.createGain();

    keepAwakeOscillator.frequency.value = 18;
    keepAwakeGain.gain.value = 0.00001;
    keepAwakeOscillator.connect(keepAwakeGain);
    keepAwakeGain.connect(keepAwakeAudioContext.destination);
    keepAwakeOscillator.start();

    if (keepAwakeAudioContext.state === 'suspended') {
      await keepAwakeAudioContext.resume().catch(() => { });
    }
  } catch (error) {
    console.warn('[TTS] Audio keep-awake unavailable during generation:', error);
    keepAwakeAudioContext = null;
    keepAwakeOscillator = null;
    keepAwakeGain = null;
  }
};

const stopTTSKeepAwake = () => {
  activeTTSKeepAwakeCount = Math.max(0, activeTTSKeepAwakeCount - 1);
  if (activeTTSKeepAwakeCount > 0) return;

  keepAwakeOscillator?.stop();
  keepAwakeOscillator?.disconnect();
  keepAwakeGain?.disconnect();
  keepAwakeAudioContext?.close().catch(() => { });
  keepAwakeAudioContext = null;
  keepAwakeOscillator = null;
  keepAwakeGain = null;

  wakeLockSentinel?.release().catch(() => { });
  wakeLockSentinel = null;
};

document.addEventListener('visibilitychange', () => {
  if (activeTTSKeepAwakeCount > 0 && document.visibilityState === 'visible') {
    void requestScreenWakeLock();
  }
});

export const ttsEvents = new EventTarget();

export interface ProgressEventDetail {
    progress: number;
    file: string;
    status: string;
    currentChunk?: number;
    totalChunks?: number;
}


function getWorker(quantization: 'q8' | 'q4' = 'q8'): Worker {
  if (!worker) {
    worker = new TTSWorker();
    worker!.onmessage = (e: MessageEvent) => {
      const { type, id, blob, error, progress, file, status, currentChunk, totalChunks } = e.data;
      
      if (type === 'generate-complete' && id) {
        const req = pendingRequests.get(id);
        if (req) {
          req.resolve(blob);
        }
      } else if (type === 'init-complete') {
        ttsEvents.dispatchEvent(new CustomEvent('tts-init-complete'));
      } else if (type === 'error' && id) {
        const req = pendingRequests.get(id);
        if (req) {
          req.reject(new Error(error));
        }
      } else if (type === 'progress') {
         // Dispatch progress event
         const event = new CustomEvent<ProgressEventDetail>('tts-progress', { 
            detail: { progress, file, status, currentChunk, totalChunks } 
         });
         ttsEvents.dispatchEvent(event);
      }
    };
    
    // Initialize model eagerly with quantization
    worker.postMessage({ type: 'init', quantization });
  }
  return worker!;
}


export function initTTS(quantization: 'q8' | 'q4' = 'q8') {
    getWorker(quantization);
}

export function reloadTTS(quantization: 'q8' | 'q4'): Promise<void> {
    if (worker) {
        worker.terminate();
        worker = null;
    }
    // Create a fresh worker and return a promise that resolves on init-complete
    return new Promise<void>((resolve, reject) => {
        const w = getWorker(quantization);
        const onMessage = (e: MessageEvent) => {
            if (e.data.type === 'init-complete') {
                w.removeEventListener('message', onMessage);
                resolve();
            } else if (e.data.type === 'error' && !e.data.id) {
                // top-level init error (no request id)
                w.removeEventListener('message', onMessage);
                reject(new Error(e.data.error));
            }
        };
        w.addEventListener('message', onMessage);
    });
}


/**
 * Generate speech and hand back the raw `audio/wav` Blob the worker produced.
 *
 * Prefer this over generateTTS() when you need the bytes (saving to disk,
 * persisting a draft, feeding a decoder) — generateTTS() wraps this and only
 * exposes an object URL, which callers then have to re-fetch to read back.
 *
 * Accepts an AbortSignal so long running generations can be cancelled from the
 * UI. Aborting posts a `cancel` message to the worker (stopping the decode so
 * it doesn't hold the single worker busy behind a reply nobody is waiting for)
 * and rejects the promise immediately.
 */
export async function generateTTSBlob(
  text: string,
  options: TTSOptions,
  signal?: AbortSignal,
): Promise<Blob> {
  await startTTSKeepAwake();

  // Standard worker implementation
  const worker = getWorker();
  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    let settled = false;

    const detach = () => {
      signal?.removeEventListener('abort', onAbort);
      pendingRequests.delete(id);
      stopTTSKeepAwake();
    };

    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      detach();
      handler();
    };

    const onAbort = () => {
      worker.postMessage({ type: 'cancel', id });
      finish(() => reject(new DOMException('Aborted', 'AbortError')));
    };

    pendingRequests.set(id, {
      resolve: (value) => finish(() => resolve(value)),
      reject: (reason) => finish(() => reject(reason)),
    });

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.postMessage({
      type: 'generate',
      text,
      options: {
        voice: options.voice,
        speed: options.speed
      },
      id
    });
  });
}


export async function generateTTS(text: string, options: TTSOptions, signal?: AbortSignal): Promise<string> {
  return URL.createObjectURL(await generateTTSBlob(text, options, signal));
}



const readAscii = (view: DataView, offset: number, length: number): string => {
  let value = '';
  for (let i = 0; i < length; i++) {
    value += String.fromCharCode(view.getUint8(offset + i));
  }
  return value;
};

const getWavDuration = async (blob: Blob): Promise<number | null> => {
  if (blob.size < 44) return null;

  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  if (readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    return null;
  }

  let offset = 12;
  let byteRate: number | null = null;
  let dataBytes: number | null = null;

  while (offset + 8 <= view.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === 'fmt ' && chunkDataOffset + 16 <= view.byteLength) {
      byteRate = view.getUint32(chunkDataOffset + 8, true);
    } else if (chunkId === 'data') {
      dataBytes = Math.min(chunkSize, view.byteLength - chunkDataOffset);
    }

    if (byteRate && dataBytes !== null) break;
    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (!byteRate || dataBytes === null) return null;
  return dataBytes / byteRate;
};

const getAudioElementDuration = (url: string, timeoutMs = 8000): Promise<number> => {
  return new Promise((resolve, reject) => {
    const audio = new Audio();

    const cleanup = () => {
      clearTimeout(timeoutId);
      audio.removeAttribute('src');
      audio.load();
    };

    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out while reading audio duration.'));
    }, timeoutMs);

    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', () => {
      const duration = audio.duration;
      cleanup();
      if (Number.isFinite(duration) && duration > 0) {
        resolve(duration);
      } else {
        reject(new Error('Audio duration metadata was unavailable.'));
      }
    }, { once: true });
    audio.addEventListener('error', () => {
      cleanup();
      reject(new Error('Failed to read audio duration metadata.'));
    }, { once: true });
    audio.src = url;
  });
};

export async function getAudioDuration(url: string): Promise<number> {
  try {
    const blob = await fetch(url).then((response) => {
      if (!response.ok) throw new Error('Failed to read generated audio.');
      return response.blob();
    });
    const wavDuration = await getWavDuration(blob);
    if (wavDuration !== null && Number.isFinite(wavDuration) && wavDuration > 0) {
      return wavDuration;
    }
  } catch (error) {
    console.warn('[TTS] Falling back to media metadata duration:', error);
  }

  return getAudioElementDuration(url);
}
