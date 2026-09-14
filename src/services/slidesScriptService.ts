import { ensureWebLLMReady, generateWebLLMResponse } from './webLlmService';
import { cleanLLMResponse, postChatCompletions, type ChatMessage, type LLMSettings } from './aiService';

/**
 * Script generation for AI-authored slide decks (title/bullets/narration/image prompt
 * per slide). Mirrors the request/parse/fallback shape of shortsScriptService.ts, which
 * solves the same problem (LLM writes narration + an image prompt) for short-form video.
 */

export type SlideTone = 'professional' | 'casual' | 'educational' | 'persuasive' | 'storytelling';

export interface SlidesScriptRequest {
  topic: string;
  slideCount: number;
  tone: SlideTone;
}

export interface SlidesScriptSlide {
  title: string;
  bullets: string[];
  narration: string;
  imagePrompt: string;
}

export interface SlidesScript {
  title: string;
  slides: SlidesScriptSlide[];
}

export interface SlidesScriptOptions {
  /** Use an OpenAI-compatible endpoint instead of the local WebGPU model. */
  useOpenAI?: boolean;
  webLlmModel?: string;
  llmSettings?: LLMSettings;
  onStage?: (stage: string) => void;
  signal?: AbortSignal;
}

const MIN_SLIDES = 3;
const MAX_SLIDES = 15;

export const clampSlideCount = (count: number): number =>
  Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.round(count)));

const TONE_GUIDANCE: Record<SlideTone, string> = {
  professional: 'Clear, confident, business-appropriate. Direct sentences, no filler.',
  casual: 'Warm and conversational, like explaining to a colleague over coffee.',
  educational: 'Teach one idea per slide, building in order. Define terms the moment you introduce them.',
  persuasive: 'Build a case: state a claim, back it with evidence, and drive toward a call to action.',
  storytelling: 'Carry a narrative thread across the deck — setup, development, and a resolution on the final slide.',
};

const IMAGE_STYLE_CLAUSE =
  'no text, no words, no letters, no numbers, no typography, no captions, no signage, no logos, no watermarks, textless image';

// --- parsing helpers ----------------------------------------------------------

const stripWrapper = (raw: string): string =>
  raw
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*?<\/think>/i, '')
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
    .replace(/<\/?think\b[^>]*>/gi, '')
    .replace(/^\s*```[\w]*\s*$/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim();

const stripLineDecoration = (line: string): string =>
  line
    .replace(/^\s*(?:[-*•>]+|\d+\s*[.):]|\(\d+\))\s*/, '')
    .replace(/^\s*(?:slide|scene|step)\s*\d*\s*[:.\-–]\s*/i, '')
    .replace(/^\**\s*/, '')
    .replace(/\s*\**$/, '')
    .replace(/^["'“”‘’]+\s*/, '')
    .replace(/\s*["'“”‘’]+$/, '')
    .trim();

const normalizeLine = (line: string): string => cleanLLMResponse(line).trim();

// --- backend ------------------------------------------------------------------

const runPrompt = async (
  system: string,
  user: string,
  temperature: number,
  opts: SlidesScriptOptions,
  maxTokens: number,
): Promise<string> => {
  if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (opts.useOpenAI) {
    const settings = opts.llmSettings;
    if (!settings?.baseUrl || !settings?.model) {
      throw new Error('No OpenAI-compatible endpoint configured. Add one in Settings, or switch back to the local model.');
    }
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    return postChatCompletions(settings, messages, temperature, undefined, opts.signal, maxTokens);
  }

  const modelId = opts.webLlmModel;
  if (!modelId) throw new Error('No local model selected. Choose a WebLLM model in Settings.');

  await ensureWebLLMReady(modelId);
  return generateWebLLMResponse(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    false,
    opts.signal,
    maxTokens,
  );
};

const TOKENS_PER_SLIDE = 260;
const MIN_TOKEN_BUDGET = 1024;
const MAX_TOKEN_BUDGET = 8192;

const tokenBudget = (slideCount: number): number =>
  Math.max(MIN_TOKEN_BUDGET, Math.min(MAX_TOKEN_BUDGET, slideCount * TOKENS_PER_SLIDE + 400));

// --- prompt ---------------------------------------------------------------------

const COMBINED_SYSTEM = `You write the content for a slide presentation deck.

For every slide you produce four lines, in order: a short title, the bullet points, the spoken narration, and an image prompt for a decorative background.

Rules:
- TITLE: a short slide heading (up to 8 words).
- BULLETS: 2 to 4 short bullet points for the slide, separated by " | ". Each bullet is a few words, not a full sentence.
- NARRATION: the complete spoken voiceover for this slide (2 to 4 sentences), expanding on the bullets in natural spoken language.
- IMAGE: an image generation prompt for the slide's background. Depict a concrete scene that visually represents this slide's specific content — real subjects, objects, settings, or actions recognizably tied to the deck topic, not generic abstract art. Name the subject, setting, lighting, and style. ${IMAGE_STYLE_CLAUSE}
- The first slide introduces the topic. The last slide wraps up with a takeaway or conclusion.
- Never repeat the same bullet or narration across slides.

Output format — for every slide N, output exactly these four lines and nothing else, in order:
N. TITLE: <slide title>
N. BULLETS: <bullet one> | <bullet two> | <bullet three>
N. NARRATION: <the spoken narration>
N. IMAGE: <the image prompt>

No commentary, no headers, no markdown, no blank lines between slides.`;

type ParsedSlide = Partial<SlidesScriptSlide>;

const parseCombinedSlides = (raw: string): Map<number, ParsedSlide> => {
  const lines = stripWrapper(raw).split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const byIndex = new Map<number, ParsedSlide>();
  let currentSlide = 0;

  const setField = <K extends keyof SlidesScriptSlide>(idx: number, field: K, value: SlidesScriptSlide[K]) => {
    const existing = byIndex.get(idx) ?? {};
    byIndex.set(idx, { ...existing, [field]: value });
  };

  for (const line of lines) {
    const titleMatch = line.match(/^(?:.*?slide\s*)?(\d+)?.*?TITLE.*?[:.\-–]\s*(.+)$/i);
    if (titleMatch) {
      currentSlide = titleMatch[1] ? Number(titleMatch[1]) : currentSlide + 1;
      setField(currentSlide, 'title', stripLineDecoration(titleMatch[2]));
      continue;
    }

    const bulletsMatch = line.match(/^(?:.*?slide\s*)?(\d+)?.*?BULLETS?.*?[:.\-–]\s*(.+)$/i);
    if (bulletsMatch) {
      const idx = bulletsMatch[1] ? Number(bulletsMatch[1]) : currentSlide;
      const bullets = bulletsMatch[2]
        .split(/\s*[|•]\s*|\s*;\s*/)
        .map(stripLineDecoration)
        .filter((b) => b.length > 0);
      setField(idx, 'bullets', bullets);
      continue;
    }

    const narrationMatch = line.match(/^(?:.*?slide\s*)?(\d+)?.*?NARRATION.*?[:.\-–]\s*(.+)$/i);
    if (narrationMatch) {
      const idx = narrationMatch[1] ? Number(narrationMatch[1]) : currentSlide;
      setField(idx, 'narration', normalizeLine(narrationMatch[2]));
      continue;
    }

    const imageMatch = line.match(/^(?:.*?slide\s*)?(\d+)?.*?(?:IMAGE|VISUAL|PROMPT).*?[:.\-–]\s*(.+)$/i);
    if (imageMatch) {
      const idx = imageMatch[1] ? Number(imageMatch[1]) : currentSlide;
      setField(idx, 'imagePrompt', stripLineDecoration(imageMatch[2]));
      continue;
    }
  }

  // Drop slides the model never gave any real content for.
  for (const [idx, slide] of byIndex) {
    if (!slide.title && !slide.narration) byIndex.delete(idx);
  }

  return byIndex;
};

const RENDERS_TEXT = /["“”]|\btext\s+(?:reading|that\s+says|saying)\b/i;

const isUsableImagePrompt = (candidate: string | undefined, title: string): candidate is string => {
  if (!candidate) return false;
  const trimmed = candidate.trim();
  if (trimmed.length < 10) return false;
  if (trimmed.toLowerCase() === title.trim().toLowerCase()) return false;
  if (RENDERS_TEXT.test(trimmed)) return false;
  return true;
};

const MAX_TOPIC_ANCHOR_CHARS = 60;

const resolveImagePrompt = (candidate: string | undefined, title: string, topic: string): string => {
  const subject = isUsableImagePrompt(candidate, title)
    ? candidate
    : `background illustration representing ${title || topic}, soft natural lighting, modern composition`;
  const cleanSubject = subject.trim().replace(/[.,;\s]+$/, '');
  const anchor = topic.trim().replace(/[^\p{L}\p{N}\s-]/gu, '').slice(0, MAX_TOPIC_ANCHOR_CHARS);
  const themed = anchor && !cleanSubject.toLowerCase().includes(anchor.toLowerCase())
    ? `${cleanSubject}, in the context of ${anchor}`
    : cleanSubject;
  return [themed, IMAGE_STYLE_CLAUSE].join(', ');
};

const fitSlidesToCount = (slides: SlidesScriptSlide[], count: number): SlidesScriptSlide[] => {
  if (slides.length === 0 || slides.length === count) return slides;
  if (slides.length > count) return slides.slice(0, count);

  const padded = [...slides];
  let i = 0;
  while (padded.length < count) {
    padded.push(slides[i % slides.length]);
    i += 1;
  }
  return padded;
};

const deriveTitle = (topic: string, firstSlideTitle: string): string => {
  const base = topic.trim().replace(/\s+/g, ' ');
  if (base.length > 0 && base.length <= 60) return base.charAt(0).toUpperCase() + base.slice(1);
  return firstSlideTitle.trim() || 'Untitled Deck';
};

/**
 * `fetch` throws a bare TypeError for both a network outage and a CORS rejection, with no
 * detail attached. aiService's postChatCompletions already retries a blocked direct call
 * through the same-origin LLM proxy automatically, so a raw TypeError escaping to here
 * means even that proxy path failed — i.e. the app's own server is unreachable. Without
 * this, the generic "model could not produce a deck" message wrongly blames the model for
 * what is actually a transport failure that never reached it.
 */
const describeRequestError = (e: unknown, opts: SlidesScriptOptions): string => {
  const isNetworkError = e instanceof TypeError;
  if (opts.useOpenAI && isNetworkError) {
    const endpoint = opts.llmSettings?.baseUrl?.trim() || '(no endpoint set)';
    return `Couldn't reach ${endpoint} — the direct browser request was blocked (CORS or offline) and the app's server proxy was unreachable too. Check your connection and that the app's server is running.`;
  }
  return e instanceof Error ? e.message : 'Failed to generate the slide script.';
};

// --- public API -----------------------------------------------------------------

export const generateSlidesScript = async (
  req: SlidesScriptRequest,
  opts: SlidesScriptOptions = {},
): Promise<SlidesScript> => {
  const topic = req.topic.trim();
  if (!topic) throw new Error('Enter a topic or description first.');

  const slideCount = clampSlideCount(req.slideCount);
  const maxTokens = tokenBudget(slideCount);

  const user = `Topic: ${topic}
Tone: ${TONE_GUIDANCE[req.tone]}

Write exactly ${slideCount} slides for a presentation deck on this topic.`;

  opts.onStage?.('Writing the outline...');

  let raw: string;
  try {
    raw = await runPrompt(COMBINED_SYSTEM, user, 0.8, opts, maxTokens);
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    console.warn('[Slides] Script generation request failed.', e);
    throw new Error(describeRequestError(e, opts));
  }

  const parsed = parseCombinedSlides(raw);
  if (parsed.size === 0) {
    throw new Error('The model responded, but its output could not be turned into slides. Try a different topic, tone, or a larger model.');
  }

  const indices = Array.from(parsed.keys()).sort((a, b) => a - b);
  const rawSlides: SlidesScriptSlide[] = indices.map((i) => {
    const slide = parsed.get(i)!;
    const title = normalizeLine(slide.title || `Slide ${i}`);
    const bullets = (slide.bullets ?? []).map((b) => normalizeLine(b)).filter((b) => b.length > 0).slice(0, 5);
    const narration = normalizeLine(slide.narration || bullets.join('. ') || title);
    const imagePrompt = resolveImagePrompt(slide.imagePrompt, title, topic);
    return { title, bullets, narration, imagePrompt };
  });

  const slides = fitSlidesToCount(rawSlides, slideCount);

  return {
    title: deriveTitle(topic, slides[0]?.title ?? ''),
    slides,
  };
};
