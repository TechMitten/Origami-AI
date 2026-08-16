import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { emitVideoProgress } from './videoEvents';

/**
 * Shared, process-wide FFmpeg.wasm singleton.
 *
 * Every consumer (the slide renderer and the Shorts renderer) shares one wasm
 * core instead of each downloading and instantiating its own ~30MB instance.
 *
 * Extracted verbatim from BrowserVideoRenderer.load() — including the
 * multithreaded-first strategy and the literal 'FFmpeg ready' status string,
 * which App.tsx and BackgroundDownloadToast.tsx both match on to decide that the
 * FFmpeg background download has finished.
 */

const MT_CORE_BASE = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';
const ST_CORE_BASE = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';

let instance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

/** True once the core has finished loading and the instance is usable. */
export const isFFmpegLoaded = (): boolean => instance !== null;

/**
 * Load (or return) the shared FFmpeg instance. Concurrent callers share a single
 * in-flight load rather than racing to instantiate separate cores.
 */
export const getFFmpeg = async (): Promise<FFmpeg> => {
  if (instance) return instance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    console.log('[FFmpeg] Loading core from CDN...');

    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');

    let ffmpeg = new FFmpeg();

    // Prefer the multithreaded core when the page is cross-origin isolated
    // (our COOP/COEP headers enable this). It can use real pthreads via
    // SharedArrayBuffer, which is dramatically faster for software H.264
    // encoding — especially at 1080p. Fall back to the single-threaded core
    // when isolation isn't available.
    const isIsolated = typeof globalThis !== 'undefined'
      && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;

    const loadCore = async (cdnBase: string, multithreaded: boolean) => {
      console.log(`[FFmpeg] Fetching ${multithreaded ? 'multithreaded' : 'single-threaded'} core from CDN:`, cdnBase);

      // toBlobURL handles caching and creates blob URLs for us
      const coreURL = await toBlobURL(`${cdnBase}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${cdnBase}/ffmpeg-core.wasm`, 'application/wasm');

      const loadArgs: { coreURL: string; wasmURL: string; workerURL?: string } = { coreURL, wasmURL };
      if (multithreaded) {
        // The MT core ships a dedicated pthread worker that must also be loaded.
        loadArgs.workerURL = await toBlobURL(`${cdnBase}/ffmpeg-core.worker.js`, 'text/javascript');
      }

      await ffmpeg.load(loadArgs);
    };

    try {
      emitVideoProgress({ progress: 0, status: 'Downloading FFmpeg from CDN...' });

      if (isIsolated) {
        try {
          await loadCore(MT_CORE_BASE, true);
        } catch (mtError) {
          console.warn('[FFmpeg] Multithreaded core failed to load, falling back to single-threaded.', mtError);
          // Re-create the instance: a partially-loaded FFmpeg can be in a bad state.
          ffmpeg = new FFmpeg();
          await loadCore(ST_CORE_BASE, false);
        }
      } else {
        console.log('[FFmpeg] Not cross-origin isolated; using single-threaded core.');
        await loadCore(ST_CORE_BASE, false);
      }

      console.log('[FFmpeg] Core loaded successfully from CDN');
      instance = ffmpeg;

      emitVideoProgress({ progress: 100, status: 'FFmpeg ready' });
      return ffmpeg;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error('[FFmpeg] Failed to load from CDN:', e);
      console.error('[FFmpeg] Error details:', errorMsg);
      throw new Error(`Failed to load FFmpeg from CDN: ${errorMsg}`);
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
};

/**
 * Drop the cached instance so the next getFFmpeg() rebuilds from scratch.
 * Call after terminate() — a terminated instance can never be reused.
 */
export const resetFFmpeg = (): void => {
  instance = null;
  loadPromise = null;
};

/**
 * Terminate the running core (killing any in-flight exec) and reset the cache.
 * Safe to call when nothing is loaded.
 */
export const terminateFFmpeg = (): void => {
  try {
    instance?.terminate();
  } catch (e) {
    console.warn('[FFmpeg] terminate() failed:', e);
  }
  resetFFmpeg();
};
