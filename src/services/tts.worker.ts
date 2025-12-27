import { KokoroTTS } from 'kokoro-js';

// Types for worker messages
export type TTSWorkerRequest = 
  | { type: 'init', quantization?: 'q8' | 'q4' }
  | { type: 'generate', text: string, options: { voice: string, speed: number }, id: string };

export type TTSWorkerResponse =
  | { type: 'init-complete' }
  | { type: 'generate-complete', blob: Blob, id: string }
  | { type: 'error', error: string, id?: string };

let ttsModel: KokoroTTS | null = null;
let initPromise: Promise<void> | null = null;
import { env } from '@huggingface/transformers';

// Configure transformers.js to cache models in IndexedDB
env.allowLocalModels = false; // We are loading from HF Hub, so this should strictly be false or default. However, useBrowserCache=true enables the persistence.
// Actually, for ONNX runtime web, just enabling browser cache is usually enough.
env.useBrowserCache = true;

const ctx = self as unknown as Worker;

async function getModel(quantization: 'q8' | 'q4' = 'q4'): Promise<KokoroTTS> {
  // If model exists but quantization is different, we'd ideally reload. 
  // For simplicity in this worker pattern, we assume 'init' is called only once or we assume the worker is terminated and recreated on change.
  // However, let's support minimal re-init if ttsModel is null.
  if (ttsModel) return ttsModel;
  
  if (!initPromise) {
      initPromise = (async () => {
          console.log(`Worker: Initializing KokoroTTS with ${quantization}...`);
          ctx.postMessage({ type: 'status', message: `Loading model (${quantization})...` });
          ttsModel = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-ONNX', {
            dtype: quantization, // Quantized for speed/size
            progress_callback: (p: unknown) => {
                const pObj = p as { progress?: number; file?: string; status?: string };
                // If progress is missing or NaN, treat as indeterminate (-1)
                let safeProgress = (typeof pObj.progress === 'number' && isFinite(pObj.progress)) ? pObj.progress : -1;
                // If status is done, force 100
                if (pObj.status === 'done') safeProgress = 100;

                ctx.postMessage({ 
                    type: 'progress', 
                    progress: safeProgress, 
                    file: pObj.file || '', 
                    status: pObj.status || ''
                });
            }
          });
          console.log("Worker: KokoroTTS initialized");
          ctx.postMessage({ type: 'init-complete' });
      })();
  }
  
  await initPromise;
  if (!ttsModel) throw new Error("Failed to initialize model");
  return ttsModel;
}

// Helper to encode WAV since we can't always rely on toBlob in worker context or strict mode
function encodeWAV(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write PCM samples
  floatTo16BitPCM(view, 44, samples);

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

ctx.onmessage = async (e: MessageEvent<TTSWorkerRequest>) => {


  try {
    if (e.data.type === 'init') {
      await getModel(e.data.quantization || 'q4');
    } else if (e.data.type === 'generate') {
      const { text, options, id } = e.data;
      const model = await getModel();
      
      // Signal start of generation (indeterminate progress)
      ctx.postMessage({ 
          type: 'progress', 
          progress: -1, 
          file: 'Neural Inference...', 
          status: 'Generating Audio' 
      });

      const audio = await model.generate(text, {
        voice: options.voice as unknown as "af_heart", 
        speed: options.speed,
      });

      let blob: Blob;
      const audioObj = audio as unknown as { toBlob?: () => Promise<Blob>, audio: Float32Array, sampling_rate: number };
      if (typeof audioObj.toBlob === 'function') {
           blob = await audioObj.toBlob();
      } else {
           blob = encodeWAV(audioObj.audio, audioObj.sampling_rate);
      }
      
      ctx.postMessage({ 
          type: 'progress', 
          progress: 100, 
          file: 'Complete', 
          status: 'done' 
      });

      ctx.postMessage({ type: 'generate-complete', blob, id });
    }
  } catch (error) {
    console.error("Worker Error:", error);
    ctx.postMessage({ 
      type: 'error', 
      error: error instanceof Error ? error.message : String(error),
      id: (e.data as { id?: string }).id 
    });
  }
};
