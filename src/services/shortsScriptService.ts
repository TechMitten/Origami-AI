import { ensureWebLLMReady, generateWebLLMResponse } from './webLlmService';
import { cleanLLMResponse, postChatCompletions, type ChatMessage, type LLMSettings } from './aiService';

/**
 * Script generation for Shorts.
 *
 * Runs in two passes rather than asking for one nested JSON blob. A 2B-class
 * local model (the WebLLM default) emits well-formed line lists far more
 * reliably than it emits well-formed JSON, and a malformed blob costs the whole
 * generation. Every pass has a deterministic fallback so the flow never
 * dead-ends on a weak model.
 */

export type ShortsTone = 'punchy' | 'documentary' | 'story' | 'educational' | 'hype';

export interface ShortsScriptRequest {
  topic: string;
  targetDurationSec: number;
  visualStyle: string;
  tone: ShortsTone;
}

export interface ShortsScriptScene {
  narration: string;
  imagePrompt: string;
}

export interface ShortsScript {
  title: string;
  scenes: ShortsScriptScene[];
}

export interface ShortsScriptOptions {
  /** Use an OpenAI-compatible endpoint instead of the local WebGPU model. */
  useOpenAI?: boolean;
  webLlmModel?: string;
  llmSettings?: LLMSettings;
  onStage?: (stage: string) => void;
  signal?: AbortSignal;
}

/** Kokoro at speed 1.0 lands around 2.6 words per second. */
export const WORDS_PER_SECOND = 2.6;

const SECONDS_PER_SCENE = 5;
const MIN_SCENES = 3;
const MAX_SCENES = 20;

const TONE_GUIDANCE: Record<ShortsTone, string> = {
  punchy: 'Fast, punchy, high-energy. Short declarative sentences. Hook hard on the first line.',
  documentary: 'Calm, authoritative documentary narration. Precise and factual.',
  story: 'Narrative storytelling with a clear beginning, turn, and payoff.',
  educational: 'Clear and explanatory. Teach one idea per line, building in order.',
  hype: 'Bold, dramatic, hype-driven. Big claims and momentum, but never false facts.',
};

export const clampSceneCount = (targetDurationSec: number): number =>
  Math.max(MIN_SCENES, Math.min(MAX_SCENES, Math.round(targetDurationSec / SECONDS_PER_SCENE)));

// --- parsing helpers ----------------------------------------------------------

/** Strip list markers, quotes and scene labels a model may prepend to a line. */
const stripLineDecoration = (line: string): string =>
  line
    // List markers first: "1.", "2)", "(3)", "-", "*", ">"
    .replace(/^\s*(?:[-*•>]+|\d+\s*[.):]|\(\d+\))\s*/, '')
    // Then scene labels the model may add: "Scene 5:", "Shot 2 -", "Line:"
    .replace(/^\s*(?:scene|shot|line|step|clip)\s*\d*\s*[:.\-–]\s*/i, '')
    .replace(/^\**\s*/, '')
    .replace(/\s*\**$/, '')
    // Wrapping quotes last, once the markers around them are gone.
    .replace(/^["'“”‘’]+\s*/, '')
    .replace(/\s*["'“”‘’]+$/, '')
    .trim();

/**
 * Blob-level cleanup that PRESERVES newlines.
 *
 * cleanLLMResponse cannot be used here: it ends by sentence-splitting and
 * re-joining with spaces, which collapses a line list into one paragraph. It is
 * still the right tool for a single narration line, so it is applied per line
 * after the split (see normalizeNarrationLine).
 */
const stripWrapper = (raw: string): string =>
  raw
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think\b[^>]*>/gi, '')
    .replace(/^\s*```[\w]*\s*$/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .trim();

const toLines = (raw: string): string[] =>
  stripWrapper(raw)
    .split(/\r?\n/)
    .map(stripLineDecoration)
    .filter((line) => line.length > 1);

/** Capitalise, punctuate and expand TTS-hostile symbols for one spoken line. */
const normalizeNarrationLine = (line: string): string => cleanLLMResponse(line).trim();

/** Sentence-split fallback for when the model ignores the one-per-line format. */
const splitIntoSentences = (text: string): string[] =>
  text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those',
  'as', 'by', 'not', 'you', 'your', 'they', 'their', 'we', 'our', 'can', 'will', 'just',
  'has', 'have', 'had', 'what', 'which', 'when', 'how', 'why', 'about', 'into', 'than', 'then',
]);

/** Last-resort image prompt derived from the narration's content words. */
const deriveImagePrompt = (narration: string, visualStyle: string): string => {
  const keywords = narration
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 7);

  const subject = keywords.length ? keywords.join(', ') : narration.slice(0, 80);
  return `${subject}, dramatic composition, ${visualStyle}`;
};

/** Force a line list to exactly `count` entries by trimming or recycling. */
const fitToCount = (lines: string[], count: number): string[] => {
  if (lines.length === count) return lines;
  if (lines.length > count) return lines.slice(0, count);

  const padded = [...lines];
  let i = 0;
  while (padded.length < count && lines.length > 0) {
    padded.push(lines[i % lines.length]);
    i += 1;
  }
  return padded;
};

// --- backends -----------------------------------------------------------------

const runPrompt = async (
  system: string,
  user: string,
  temperature: number,
  opts: ShortsScriptOptions,
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
    return postChatCompletions(settings, messages, temperature);
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
  );
};

// --- passes -------------------------------------------------------------------

const NARRATION_SYSTEM = `You write voiceover scripts for short-form vertical videos (TikTok, Reels, YouTube Shorts).

Rules you must follow exactly:
- Output ONLY the narration lines. No preamble, no numbering, no markdown, no scene labels, no quotes.
- One line per scene. Each line is one complete spoken sentence.
- The first line is a hook that makes the viewer stop scrolling.
- The last line lands the payoff or a closing thought.
- Write words a narrator says out loud. No stage directions, no emoji, no hashtags, no "In this video".
- Stay factually accurate. Do not invent statistics.`;

const generateNarrationLines = async (
  req: ShortsScriptRequest,
  sceneCount: number,
  opts: ShortsScriptOptions,
): Promise<string[]> => {
  const wordsPerScene = Math.max(6, Math.round((req.targetDurationSec / sceneCount) * WORDS_PER_SECOND));

  const user = `Topic: ${req.topic}

Write exactly ${sceneCount} narration lines for a ${req.targetDurationSec}-second video.
Each line must be roughly ${wordsPerScene} words.
Tone: ${TONE_GUIDANCE[req.tone]}

Output exactly ${sceneCount} lines and nothing else.`;

  opts.onStage?.('Writing the script...');

  /**
   * Parse one model response into narration lines.
   * If the model wrote a paragraph instead of a list, recover by sentence-splitting.
   */
  const parseAttempt = (raw: string): string[] => {
    let lines = toLines(raw);

    // Far fewer lines than asked for usually means prose, not a list.
    if (lines.length < Math.max(2, Math.floor(sceneCount / 2))) {
      const sentences = splitIntoSentences(stripWrapper(raw).replace(/\s*\n\s*/g, ' '));
      if (sentences.length > lines.length) lines = sentences.map(stripLineDecoration);
    }

    return lines.map(normalizeNarrationLine).filter((line) => line.length > 1);
  };

  let lines: string[] = [];
  try {
    lines = parseAttempt(await runPrompt(NARRATION_SYSTEM, user, 0.85, opts));
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    console.warn('[Shorts] Narration pass failed, retrying with a stricter prompt.', e);
  }

  // One retry when the model gave us almost nothing to work with.
  if (lines.length < 2) {
    opts.onStage?.('Retrying the script...');
    const retry = await runPrompt(
      NARRATION_SYSTEM,
      `${user}\n\nIMPORTANT: respond with ${sceneCount} plain lines separated by newlines. Nothing else.`,
      0.7,
      opts,
    );
    const retried = parseAttempt(retry);
    // Keep whichever attempt gave more usable lines.
    if (retried.length > lines.length) lines = retried;
  }

  // Only a completely empty result is fatal — a short response gets padded by
  // fitToCount rather than throwing away a usable script.
  if (lines.length === 0) {
    throw new Error('The model could not produce a usable script. Try a different topic or a larger model.');
  }

  return fitToCount(lines, sceneCount);
};

const IMAGE_PROMPT_SYSTEM = `You turn narration lines into text-to-image prompts.

Rules you must follow exactly:
- Output ONLY the prompts, one per line, in the same order as the input. No numbering, no markdown, no quotes, no commentary.
- Each prompt is a comma-separated list of visual nouns and adjectives describing a single still image.
- Describe only what is SEEN. Never include spoken words, narration, or text to render in the image.
- No people's names, no logos, no watermarks, no captions, no on-image text.
- Be concrete and cinematic: subject, setting, lighting, camera angle, mood.`;

const generateImagePrompts = async (
  narrationLines: string[],
  req: ShortsScriptRequest,
  opts: ShortsScriptOptions,
): Promise<string[]> => {
  opts.onStage?.('Designing the visuals...');

  const numbered = narrationLines.map((line, i) => `${i + 1}. ${line}`).join('\n');
  const user = `Visual style for every image: ${req.visualStyle}
Overall subject: ${req.topic}

Write exactly ${narrationLines.length} image prompts, one per line, matching these narration lines in order:

${numbered}`;

  let prompts: string[] = [];
  try {
    prompts = toLines(await runPrompt(IMAGE_PROMPT_SYSTEM, user, 0.7, opts));
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    console.warn('[Shorts] Image prompt pass failed; deriving prompts from narration.', e);
  }

  // Guard against the model echoing the narration back verbatim.
  const looksEchoed = prompts.length > 0
    && prompts.filter((p, i) => narrationLines[i] && p.trim() === narrationLines[i].trim()).length > prompts.length / 2;

  if (prompts.length !== narrationLines.length || looksEchoed) {
    const usable = looksEchoed ? [] : prompts;
    return narrationLines.map((line, i) => {
      const candidate = usable[i]?.trim();
      return candidate && candidate !== line.trim()
        ? `${candidate}, ${req.visualStyle}`
        : deriveImagePrompt(line, req.visualStyle);
    });
  }

  return prompts.map((p) => `${p}, ${req.visualStyle}`);
};

const deriveTitle = (topic: string, firstLine: string): string => {
  const base = topic.trim().replace(/\s+/g, ' ');
  if (base.length > 0 && base.length <= 60) {
    return base.charAt(0).toUpperCase() + base.slice(1);
  }
  const fallback = firstLine.replace(/[.!?]+$/, '').trim();
  return (fallback.length > 60 ? `${fallback.slice(0, 57)}...` : fallback) || 'Untitled Short';
};

// --- public API ---------------------------------------------------------------

export const generateShortsScript = async (
  req: ShortsScriptRequest,
  opts: ShortsScriptOptions = {},
): Promise<ShortsScript> => {
  const topic = req.topic.trim();
  if (!topic) throw new Error('Enter a topic or description first.');

  const sceneCount = clampSceneCount(req.targetDurationSec);
  const narrationLines = await generateNarrationLines({ ...req, topic }, sceneCount, opts);
  const imagePrompts = await generateImagePrompts(narrationLines, { ...req, topic }, opts);

  return {
    title: deriveTitle(topic, narrationLines[0] ?? ''),
    scenes: narrationLines.map((narration, i) => ({
      narration,
      imagePrompt: imagePrompts[i] ?? deriveImagePrompt(narration, req.visualStyle),
    })),
  };
};

/** Regenerate a single scene's image prompt without re-running the whole script. */
export const regenerateImagePrompt = async (
  narration: string,
  req: Pick<ShortsScriptRequest, 'topic' | 'visualStyle'>,
  opts: ShortsScriptOptions = {},
): Promise<string> => {
  try {
    const raw = await runPrompt(
      IMAGE_PROMPT_SYSTEM,
      `Visual style: ${req.visualStyle}\nOverall subject: ${req.topic}\n\nWrite ONE image prompt for this narration line:\n${narration}`,
      0.95,
      opts,
    );
    const [first] = toLines(raw);
    if (first && first.trim() !== narration.trim()) return `${first}, ${req.visualStyle}`;
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    console.warn('[Shorts] Image prompt regeneration failed; deriving from narration.', e);
  }
  return deriveImagePrompt(narration, req.visualStyle);
};
