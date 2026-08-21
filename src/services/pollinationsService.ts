/**
 * Pollinations image generation client.
 *
 * Two transports, chosen automatically:
 *   1. A user-supplied key (BYOK, stored in IndexedDB settings) → call
 *      gen.pollinations.ai directly with an Authorization header.
 *   2. No user key → POST /api/pollinations/image, where the server attaches its
 *      own POLLINATIONS_API_KEY. Mirrors the existing /api/llm/chat pattern.
 *
 * Images are always fetched as bytes and wrapped in a blob: URL rather than
 * pointed at with <img src="https://...">. That keeps the bitmap same-origin, so
 * drawing it into the render canvas does not taint it.
 */

import { isPollinationsTokenExpired } from './pollinationsAuth';

export const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai';

export const POLLINATIONS_PROXY_URL = '/api/pollinations/image';

/** Models that reliably accept width/height and produce usable stills for shorts. */
export const POLLINATIONS_IMAGE_MODELS: Array<{ id: string; name: string }> = [
  { id: 'zimage', name: 'Z-Image (fast)' },
  { id: 'flux', name: 'Flux (default, balanced)' },
  { id: 'seedream', name: 'Seedream (cinematic)' },
  { id: 'seedream5', name: 'Seedream 5' },
  { id: 'nanobanana', name: 'Nano Banana' },
  { id: 'krea', name: 'Krea (photoreal)' },
  { id: 'dreamshaper', name: 'Dreamshaper (stylised)' },
];

export const DEFAULT_POLLINATIONS_IMAGE_MODEL = 'flux';

export interface PollinationsImageRequest {
  prompt: string;
  model: string;
  width: number;
  height: number;
  seed: number;
}

export interface PollinationsRequestOptions {
  apiKey?: string;
  signal?: AbortSignal;
}

export class PollinationsError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable = false) {
    super(message);
    this.name = 'PollinationsError';
    this.status = status;
    this.retryable = retryable;
  }
}

const MAX_ATTEMPTS = 3;
const MAX_CONCURRENT = 3;
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * Resolve the key to use. A non-expired OAuth token (or legacy pasted key) saved in
 * settings always wins; an expired token is treated as absent so callers fall through
 * to the server-proxy transport instead of sending a token that will 401 upstream. The
 * VITE_ fallback exists purely as a local-dev convenience and is baked into the public
 * bundle, so it must never hold an `sk_` secret key in a real deployment.
 */
export const resolvePollinationsKey = (
  settingsKey?: string | null,
  tokenExpiresAt?: number | null,
): string | undefined => {
  const fromSettings = settingsKey?.trim();
  if (fromSettings && !isPollinationsTokenExpired(tokenExpiresAt)) return fromSettings;

  const fromEnv = import.meta.env?.VITE_POLLINATIONS_API_KEY?.trim();
  return fromEnv || undefined;
};

// --- concurrency gate ---------------------------------------------------------

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
      return new PollinationsError(
        'Invalid Pollinations API key. Check the key saved in Settings.',
        401,
      );
    case 402:
      return new PollinationsError(
        'Pollinations account balance exhausted. Top up your account or use a key with remaining budget.',
        402,
      );
    case 403:
      return new PollinationsError(
        `This Pollinations key is not permitted to use that model.${trimmed ? ` (${trimmed})` : ''}`,
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
        `Image generation failed (${response.status})${trimmed ? `: ${trimmed}` : ''}`,
        response.status,
      );
  }
};

const buildDirectUrl = (req: PollinationsImageRequest): string => {
  const url = new URL(`${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(req.prompt)}`);
  url.searchParams.set('model', req.model);
  url.searchParams.set('width', String(Math.round(req.width)));
  url.searchParams.set('height', String(Math.round(req.height)));
  url.searchParams.set('seed', String(Math.round(req.seed)));
  return url.toString();
};

/**
 * One network attempt. Kept separate so retries can re-issue the byte-identical
 * request — Pollinations joins an in-flight generation (or returns the cached
 * result) for an identical URL + seed rather than starting another billable run.
 */
const attemptFetch = async (
  req: PollinationsImageRequest,
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

  return fetch(POLLINATIONS_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: req.prompt,
      model: req.model,
      width: Math.round(req.width),
      height: Math.round(req.height),
      seed: Math.round(req.seed),
    }),
    signal,
  });
};

// --- public API ---------------------------------------------------------------

/**
 * Generate a single image. Resolves to the raw image Blob; callers own the
 * object URL lifecycle.
 */
export const generateImage = async (
  req: PollinationsImageRequest,
  opts: PollinationsRequestOptions = {},
): Promise<Blob> => {
  const prompt = req.prompt.trim();
  if (!prompt) throw new PollinationsError('Image prompt is empty.', 400);

  await acquire();
  try {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      // Per-attempt timeout, still cancellable by the caller's signal.
      const timeoutController = new AbortController();
      const timer = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
      const onOuterAbort = () => timeoutController.abort();
      opts.signal?.addEventListener('abort', onOuterAbort, { once: true });

      try {
        const response = await attemptFetch({ ...req, prompt }, opts.apiKey, timeoutController.signal);

        if (response.ok) {
          const blob = await response.blob();
          if (blob.size === 0) {
            throw new PollinationsError('Pollinations returned an empty image.', 502, true);
          }
          return blob;
        }

        const error = await describeFailure(response);
        if (!error.retryable || attempt === MAX_ATTEMPTS) throw error;

        lastError = error;
        const wait = parseRetryAfter(response) ?? Math.min(1000 * 2 ** (attempt - 1), 8000);
        await sleep(wait, opts.signal);
      } catch (e) {
        // The caller aborted — propagate immediately, never retry.
        if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        if (e instanceof PollinationsError && !e.retryable) throw e;
        if (attempt === MAX_ATTEMPTS) throw e;

        lastError = e;
        await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000), opts.signal);
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onOuterAbort);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new PollinationsError('Image generation failed after several attempts.', 500);
  } finally {
    release();
  }
};

/** Public, unauthenticated model catalogue. Falls back to the static list. */
export const listImageModels = async (): Promise<Array<{ id: string; name: string }>> => {
  try {
    const response = await fetch(`${POLLINATIONS_BASE_URL}/image/models`);
    if (!response.ok) return POLLINATIONS_IMAGE_MODELS;

    const data: unknown = await response.json();
    const ids = Array.isArray(data)
      ? data.map((entry) => (typeof entry === 'string' ? entry : (entry as { name?: string })?.name)).filter(Boolean)
      : [];

    if (!ids.length) return POLLINATIONS_IMAGE_MODELS;

    // Keep our curated ordering/labels first, then append anything new upstream.
    const curated = POLLINATIONS_IMAGE_MODELS.filter((m) => ids.includes(m.id));
    const extras = (ids as string[])
      .filter((id) => !POLLINATIONS_IMAGE_MODELS.some((m) => m.id === id))
      .map((id) => ({ id, name: id }));

    return [...(curated.length ? curated : POLLINATIONS_IMAGE_MODELS), ...extras];
  } catch {
    return POLLINATIONS_IMAGE_MODELS;
  }
};

/**
 * Verify a key without burning an image generation. /v1/models accepts (and
 * validates) a bearer token while remaining a cheap read.
 */
export const verifyPollinationsKey = async (apiKey: string): Promise<boolean> => {
  try {
    const response = await fetch(`${POLLINATIONS_BASE_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
    });
    return response.status !== 401;
  } catch {
    return false;
  }
};
