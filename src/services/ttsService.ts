import TTSWorker from './tts.worker?worker';
import { loadGlobalSettings } from './storage';

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
  { id: 'af_heart', name: 'Heart (Default)' },
  { id: 'af_bella', name: 'Bella' },
  { id: 'af_nicole', name: 'Nicole' },
  { id: 'am_adam', name: 'Adam' },
  { id: 'am_michael', name: 'Michael' },
  { id: 'bf_emma', name: 'Emma (British)' },
  { id: 'bm_george', name: 'George (British)' },
];

export const AVAILABLE_VOICES = DEFAULT_VOICES;

export async function fetchRemoteVoices(baseUrl: string): Promise<Voice[]> {
    let voicesUrl = baseUrl;
    try {
        // More robust URL construction
        if (baseUrl.includes('/audio/speech')) {
             voicesUrl = baseUrl.replace('/audio/speech', '/audio/voices');
        } else if (baseUrl.endsWith('/v1')) {
            voicesUrl = `${baseUrl}/audio/voices`;
        } else if (!baseUrl.endsWith('/voices')) {
             // Try to guess based on common patterns
             try {
                const url = new URL(baseUrl);
                if (url.port === '8880') {
                    // Kokoro Fast API default port
                    url.pathname = '/v1/audio/voices';
                    voicesUrl = url.toString();
                } else {
                    // fall back to replacing speech or appending
                     voicesUrl = baseUrl.replace(/\/speech$/, '/voices');
                }
             } catch {
                // Keep original if not parsable
             }
        }

        console.log(`[TTS Service] Fetching voices from ${voicesUrl}`);
        const res = await fetch(voicesUrl);
        if (!res.ok) {
            throw new Error(`Failed to fetch voices from ${voicesUrl} (Status: ${res.status})`);
        }
        
        const data = await res.json();
        
        let voices: Voice[] = [];

        // Handle various response formats
        if (data.voices && Array.isArray(data.voices)) {
             // Format: { voices: [...] }
             voices = data.voices;
        } else if (data.object === 'list' && Array.isArray(data.data)) {
             // OpenAI Format: { object: 'list', data: [...] }
             voices = data.data;
        } else if (Array.isArray(data)) {
             // Simple Array: [...]
             voices = data;
        } else {
            console.warn("[TTS Service] Unknown voice response format", data);
            return DEFAULT_VOICES;
        }

        // Normalize
        // Normalize
        return voices.map((v: string | { id: string; name?: string }) => ({ 
            id: typeof v === 'string' ? v : v.id, 
            name: typeof v === 'string' ? v : (v.name || v.id) 
        }));

    } catch (e) {
        console.error("[TTS Service] Voice fetch error:", e);
        throw e; // Re-throw to let UI handle the error state
    }
}

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
  // Check for local TTS override
  const settings = await loadGlobalSettings();
  
  if (settings?.useLocalTTS && settings?.localTTSUrl) {
    try {
      console.log(`[TTS Service] Using Local TTS at ${settings.localTTSUrl}`);
      const response = await fetch(settings.localTTSUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'kokoro',
          input: text,
          voice: options.voice,
          speed: options.speed,
          response_format: 'wav' // or mp3, wav is safer for uncompressed quality if local
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Local TTS API Error (${response.status}): ${errorText}`);
      }

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (err) {
      console.error("[TTS Service] Local TTS generation failed:", err);
      throw err; // Propagate error to UI
    }
  }

  // Fallback / Standard Worker Implementation
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
