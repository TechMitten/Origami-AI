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
  // French
  { id: 'ff_siwis', name: 'Siwis (French)' },
  // High-pitched Female
  { id: 'hf_alpha', name: 'HF Alpha (High Pitch)' },
  { id: 'hf_beta', name: 'HF Beta (High Pitch)' },
  // High-pitched Male
  { id: 'hm_omega', name: 'HM Omega (High Pitch)' },
  { id: 'hm_psi', name: 'HM Psi (High Pitch)' },
];

export const AVAILABLE_VOICES = DEFAULT_VOICES;

// Singleton worker instance
let worker: Worker | null = null;
const pendingRequests = new Map<string, { resolve: (value: string) => void, reject: (reason?: unknown) => void }>();

export const ttsEvents = new EventTarget();

export interface ProgressEventDetail {
    progress: number;
    file: string;
    status: string;
}


function getWorker(quantization: 'q8' | 'q4' = 'q4'): Worker {
  if (!worker) {
    worker = new TTSWorker();
    worker!.onmessage = (e: MessageEvent) => {
      const { type, id, blob, error, progress, file, status } = e.data;
      
      if (type === 'generate-complete' && id) {
        const req = pendingRequests.get(id);
        if (req) {
          req.resolve(URL.createObjectURL(blob));
          pendingRequests.delete(id);
        }
      } else if (type === 'init-complete') {
        ttsEvents.dispatchEvent(new CustomEvent('tts-init-complete'));
      } else if (type === 'error' && id) {
        const req = pendingRequests.get(id);
        if (req) {
          req.reject(new Error(error));
          pendingRequests.delete(id);
        }
      } else if (type === 'status') {
         console.log("[TTS Service]", e.data.message);
      } else if (type === 'progress') {
         // Dispatch progress event
         const event = new CustomEvent<ProgressEventDetail>('tts-progress', { 
            detail: { progress, file, status } 
         });
         ttsEvents.dispatchEvent(event);
      }
    };
    
    // Initialize model eagerly with quantization
    worker.postMessage({ type: 'init', quantization });
  }
  return worker!;
}


export function initTTS(quantization: 'q8' | 'q4' = 'q4') {
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


export async function generateTTS(text: string, options: TTSOptions): Promise<string> {
  // Standard worker implementation
  const worker = getWorker();
  const id = crypto.randomUUID();
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    
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



export async function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.src = url;
    audio.addEventListener('loadedmetadata', () => {
      resolve(audio.duration);
    });
  });
}
