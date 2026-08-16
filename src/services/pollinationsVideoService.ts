/**
 * Pollinations video generation client.
 *
 * Mirrors pollinationsService.ts (same two transports, same retry/backoff
 * shape) but targets the /video/{prompt} endpoint. Kept as a separate module
 * rather than folded into the image client because video generation has
 * different, much larger timeouts, a lower concurrency cap, and its own
 * parameter shape (aspectRatio instead of exact pixels for non-square
 * output, no per-request duration — see generateVideo for why).
 */

import { resolvePollinationsKey, POLLINATIONS_BASE_URL, PollinationsError } from './pollinationsService';

export { resolvePollinationsKey };

export const POLLINATIONS_VIDEO_PROXY_URL = '/api/pollinations/video';

/** Curated, roughly fast-to-slow / cheap-to-premium spread of video models. */
export const POLLINATIONS_VIDEO_MODELS: Array<{ id: string; name: string }> = [
  { id: 'wan-fast', name: 'Wan Fast (default, quickest)' },
  { id: 'wan', name: 'Wan' },
  { id: 'seedance-2.0-fast', name: 'Seedance 2.0 Fast' },
  { id: 'seedance-pro', name: 'Seedance Pro (higher quality)' },
  { id: 'veo', name: 'Veo (premium)' },
];

export const DEFAULT_POLLINATIONS_VIDEO_MODEL = 'wan-fast';

export interface PollinationsVideoRequest {
  prompt: string;
  model: string;
  /** '9:16' | '16:9' | '1:1' — 1:1 has no aspectRatio equivalent upstream, so it is sent as explicit width/height instead. */
  aspect: '9:16' | '16:9' | '1:1';
  width: number;
  height: number;
  seed: number;
}

export interface PollinationsVideoRequestOptions {
  apiKey?: string;
  signal?: AbortSignal;
}

const MAX_ATTEMPTS = 2;
const MAX_CONCURRENT = 2;
/** Video generation is far slower than stills — Veo/Seedance clips can take minutes. */
const REQUEST_TIMEOUT_MS = 300_000;

// --- concurrency gate (separate from the image client's — video is heavier) ---

let active = 0;
const waiters: Array<() => void> = [];

const acquire = async (): Promise<void> => {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active += 1;
};

const release = (): void => {
  active -= 1;
  const next = waiters.shift();
  if (next) next();
};

// --- helpers ------------------------------------------------------------------

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });

const parseRetryAfter = (response: Response): number | null => {
  const header = response.headers.get('Retry-After');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) return Math.min(Math.max(asDate - Date.now(), 0), 30_000);
  return null;
};

const describeFailure = async (response: Response): Promise<PollinationsError> => {
  let detail = '';
  try {
    const text = await response.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
        const fromObject = typeof parsed.error === 'object' ? parsed.error?.message : parsed.error;
        detail = fromObject || parsed.message || text;
      } catch {
        detail = text;
      }
    }
  } catch {
    // body already consumed or unreadable — fall through to the status message
  }

  const trimmed = detail.slice(0, 300);

  switch (response.status) {
    case 401:
      return new PollinationsError('Invalid Pollinations API key. Check the key saved in Settings.', 401);
    case 402:
      return new PollinationsError(
        'Pollinations account balance exhausted. Top up your account or use a key with remaining budget.',
        402,
      );
    case 403:
      return new PollinationsError(
        `This Pollinations key is not permitted to use that video model.${trimmed ? ` (${trimmed})` : ''}`,
        403,
      );
    case 429:
      return new PollinationsError('Pollinations rate limit reached.', 429, true);
    case 500:
    case 502:
    case 503:
    case 504:
      return new PollinationsError(
        `Pollinations is temporarily unavailable (${response.status}).`,
        response.status,
        true,
      );
    default:
      return new PollinationsError(
        `Video generation failed (${response.status})${trimmed ? `: ${trimmed}` : ''}`,
        response.status,
      );
  }
};

const applyAspectParams = (url: URL, req: PollinationsVideoRequest): void => {
  // aspectRatio only covers 16:9 / 9:16 upstream; 1:1 has to fall back to
  // explicit equal width/height, which the video endpoint also accepts.
  if (req.aspect === '1:1') {
    url.searchParams.set('width', String(Math.round(req.width)));
    url.searchParams.set('height', String(Math.round(req.height)));
  } else {
    url.searchParams.set('aspectRatio', req.aspect);
  }
};

const buildDirectUrl = (req: PollinationsVideoRequest): string => {
  const url = new URL(`${POLLINATIONS_BASE_URL}/video/${encodeURIComponent(req.prompt)}`);
  url.searchParams.set('model', req.model);
  url.searchParams.set('seed', String(Math.round(req.seed)));
  url.searchParams.set('audio', 'false');
  applyAspectParams(url, req);
  return url.toString();
};

/**
 * One network attempt. No `duration` param is sent — per-model duration
 * constraints vary too much (some models only accept one fixed value) to
 * validate client-side, so every model just uses its own default duration
 * and the renderer loops/trims the resulting clip to fit the scene.
 */
const attemptFetch = async (
  req: PollinationsVideoRequest,
  apiKey: string | undefined,
  signal: AbortSignal,
): Promise<Response> => {
  if (apiKey) {
    return fetch(buildDirectUrl(req), {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
  }

  return fetch(POLLINATIONS_VIDEO_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: req.prompt,
      model: req.model,
      aspect: req.aspect,
      width: Math.round(req.width),
      height: Math.round(req.height),
      seed: Math.round(req.seed),
    }),
    signal,
  });
};

// --- public API ---------------------------------------------------------------

/**
 * Generate a single video clip. Resolves to the raw video Blob; callers own
 * the object URL lifecycle.
 */
export const generateVideo = async (
  req: PollinationsVideoRequest,
  opts: PollinationsVideoRequestOptions = {},
): Promise<Blob> => {
  const prompt = req.prompt.trim();
  if (!prompt) throw new PollinationsError('Video prompt is empty.', 400);

  await acquire();
  try {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
      const onOuterAbort = () => timeoutController.abort();
      opts.signal?.addEventListener('abort', onOuterAbort, { once: true });

      try {
        const response = await attemptFetch({ ...req, prompt }, opts.apiKey, timeoutController.signal);

        if (response.ok) {
          const blob = await response.blob();
          if (blob.size === 0) {
            throw new PollinationsError('Pollinations returned an empty video.', 502, true);
          }
          return blob;
        }

        const error = await describeFailure(response);
        if (!error.retryable || attempt === MAX_ATTEMPTS) throw error;

        lastError = error;
        const wait = parseRetryAfter(response) ?? Math.min(2000 * 2 ** (attempt - 1), 15_000);
        await sleep(wait, opts.signal);
      } catch (e) {
        if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        if (e instanceof PollinationsError && !e.retryable) throw e;
        if (attempt === MAX_ATTEMPTS) throw e;

        lastError = e;
        await sleep(Math.min(2000 * 2 ** (attempt - 1), 15_000), opts.signal);
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onOuterAbort);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new PollinationsError('Video generation failed after several attempts.', 500);
  } finally {
    release();
  }
};
