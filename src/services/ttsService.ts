import TTSWorker from './tts.worker?worker';

export interface TTSOptions {
  voice: string;
  speed: number;
  pitch: number;
}

export const AVAILABLE_VOICES = [
  { id: 'af_heart', name: 'Heart (Default)' },
  { id: 'af_bella', name: 'Bella' },
  { id: 'af_nicole', name: 'Nicole' },
  { id: 'am_adam', name: 'Adam' },
  { id: 'am_michael', name: 'Michael' },
  { id: 'bf_emma', name: 'Emma (British)' },
  { id: 'bm_george', name: 'George (British)' },
];

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
          blobToBase64(blob).then(req.resolve).catch(req.reject);
          pendingRequests.delete(id);
        }
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

export function reloadTTS(quantization: 'q8' | 'q4') {
    if (worker) {
        worker.terminate();
        worker = null;
    }
    initTTS(quantization);
}


export async function generateTTS(text: string, options: TTSOptions): Promise<string> {
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
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
