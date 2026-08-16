interface Env {
  POLLINATIONS_API_KEY?: string;
}

interface ImageRequestBody {
  prompt?: unknown;
  model?: unknown;
  width?: unknown;
  height?: unknown;
  seed?: unknown;
}

const POLLINATIONS_BASE_URL = 'https://gen.pollinations.ai';

// Kept in sync with POLLINATIONS_IMAGE_MODELS in src/services/pollinationsService.ts.
// An allow-list keeps a compromised client from steering the server's key at
// arbitrary (and differently-priced) upstream models.
const ALLOWED_MODELS = new Set([
  'zimage',
  'flux',
  'seedream',
  'seedream5',
  'seedream5-pro',
  'seedream-pro',
  'nanobanana',
  'nanobanana-2',
  'krea',
  'dreamshaper',
  'gptimage',
  'qwen-image',
]);

const MAX_PROMPT_LENGTH = 2000;
const MIN_DIMENSION = 64;
const MAX_DIMENSION = 2048;

const jsonError = (message: string, status: number): Response =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const asDimension = (value: unknown, fallback: number): number | null => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  const rounded = Math.round(num);
  if (rounded < MIN_DIMENSION || rounded > MAX_DIMENSION) return null;
  return rounded;
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;
    const apiKey = env.POLLINATIONS_API_KEY;

    if (!apiKey) {
      return jsonError(
        'Image generation is not configured on this server. Add your Pollinations API key in Settings, or set POLLINATIONS_API_KEY on the host.',
        501,
      );
    }

    const body = (await request.json().catch(() => null)) as ImageRequestBody | null;
    if (!body) return jsonError('Invalid JSON body', 400);

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return jsonError('prompt is required', 400);
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return jsonError(`prompt exceeds ${MAX_PROMPT_LENGTH} characters`, 400);
    }

    const model = typeof body.model === 'string' ? body.model : 'zimage';
    if (!ALLOWED_MODELS.has(model)) return jsonError(`Unsupported model: ${model}`, 400);

    const width = asDimension(body.width, 1024);
    const height = asDimension(body.height, 1024);
    if (width === null || height === null) {
      return jsonError(`width and height must be between ${MIN_DIMENSION} and ${MAX_DIMENSION}`, 400);
    }

    const seedNum = typeof body.seed === 'number' ? body.seed : Number(body.seed);
    const seed = Number.isFinite(seedNum) ? Math.abs(Math.round(seedNum)) % 2147483647 : 0;

    const upstream = new URL(`${POLLINATIONS_BASE_URL}/image/${encodeURIComponent(prompt)}`);
    upstream.searchParams.set('model', model);
    upstream.searchParams.set('width', String(width));
    upstream.searchParams.set('height', String(height));
    upstream.searchParams.set('seed', String(seed));

    const response = await fetch(upstream.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return jsonError(
        detail?.slice(0, 300) || `Pollinations request failed (${response.status})`,
        response.status,
      );
    }

    const proxied = new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });

    return proxied;
  } catch (err) {
    console.error('[Pollinations Proxy] /api/pollinations/image error:', err);
    return jsonError('Failed to proxy image generation', 500);
  }
};
