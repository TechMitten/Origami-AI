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

// Suppress specific harmless warning from onnxruntime/transformers
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Unable to determine content-length')) {
        return;
    }
    originalConsoleWarn.apply(console, args);
};

const ctx = self as unknown as Worker;

async function getModel(quantization: 'q8' | 'q4' = 'q4'): Promise<KokoroTTS> {
  // If model exists but quantization is different, we'd ideally reload. 
  // For simplicity in this worker pattern, we assume 'init' is called only once or we assume the worker is terminated and recreated on change.
  // However, let's support minimal re-init if ttsModel is null.
  if (ttsModel) return ttsModel;
  
  if (!initPromise) {
      initPromise = (async () => {
          const progressCallback = (p: unknown) => {
              const pObj = p as { progress?: number; file?: string; status?: string };
              let safeProgress = (typeof pObj.progress === 'number' && isFinite(pObj.progress)) ? pObj.progress : -1;
              if (pObj.status === 'done') safeProgress = 100;
              ctx.postMessage({ 
                  type: 'progress', 
                  progress: safeProgress, 
                  file: pObj.file || '', 
                  status: pObj.status || ''
              });
          };

          // Use CPU (WASM) for inference — WebGPU causes distorted/static audio
          // due to a known upstream bug in kokoro-js where GPU tensor output is not
          // properly synced back to CPU memory before WAV encoding.
          console.log(`Worker: Initializing KokoroTTS with ${quantization} on CPU (WASM)...`);
          ctx.postMessage({ type: 'status', message: `Loading model (${quantization})...` });
          ttsModel = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-ONNX', {
              dtype: quantization,
              progress_callback: progressCallback,
          });
          console.log("Worker: KokoroTTS initialized on CPU (WASM)");

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
      
      const chunks = chunkText(text);
      const audioChunks: Float32Array[] = [];
      let totalLength = 0;
      let sampleRate = 24000;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk.trim()) continue;

        // Signal progress
        ctx.postMessage({ 
            type: 'progress', 
            progress: Math.round(((i + 0.5) / chunks.length) * 100), 
            file: `Generating chunk ${i + 1}/${chunks.length} ...`, 
            status: 'Processing' 
        });

        const audio = await model.generate(chunk, {
          voice: options.voice as unknown as "af_heart", 
          speed: options.speed,
        });

        const audioObj = audio as unknown as { audio: Float32Array, sampling_rate: number };
        
        if (audioObj.audio) {
            audioChunks.push(audioObj.audio);
            totalLength += audioObj.audio.length;
            sampleRate = audioObj.sampling_rate;
        }
      }
      
      const finalAudio = new Float32Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunks) {
          finalAudio.set(chunk, offset);
          offset += chunk.length;
      }

      ctx.postMessage({ 
          type: 'progress', 
          progress: 100, 
          file: 'Complete', 
          status: 'done' 
      });

      const blob = encodeWAV(finalAudio, sampleRate);
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

function chunkText(text: string): string[] {
    // Split by simple punctuation, keeping the punctuation
    const parts = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];
    const chunks: string[] = [];
    let currentChunk = "";
    
    // Combine short sentences to reduce calls, but keep under 300 chars
    for (const part of parts) {
        if (currentChunk.length + part.length < 300) {
            currentChunk += part;
        } else {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = part;
        }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    
    // Final safety check for any remaining massive chunks (e.g. no punctuation)
    return chunks.flatMap(c => {
        if (c.length < 400) return [c];
        
        // Split by comma if too long
        if (c.includes(',')) {
             const sub = c.split(',');
             const subChunks = [];
             let subCurr = "";
             for (const s of sub) {
                 if (subCurr.length + s.length < 300) {
                     subCurr += (subCurr ? ',' : '') + s;
                 } else {
                     if (subCurr) subChunks.push(subCurr.trim() + ',');
                     subCurr = s;
                 }
             }
             if (subCurr) subChunks.push(subCurr.trim());
             return subChunks;
        }
        
        // Last resort: hard split
        const smaller = [];
        let rem = c;
        while (rem.length > 400) {
            const split = rem.substring(0, 400).lastIndexOf(' ');
            const idx = split > 0 ? split : 400;
            smaller.push(rem.substring(0, idx));
            rem = rem.substring(idx).trim();
        }
        if (rem) smaller.push(rem);
        return smaller;
    });
}
