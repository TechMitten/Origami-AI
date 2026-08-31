import { ensureWebLLMReady, generateWebLLMResponse } from './webLlmService';
import { cleanLLMResponse, postChatCompletions, type ChatMessage, type LLMSettings } from './aiService';
import type { ShortsAspect } from './ShortsVideoRenderer';

/**
 * Script and visual prompt generation for Shorts.
 */

export type ShortsTone = 'punchy' | 'documentary' | 'story' | 'educational' | 'hype';

export type ShortsVisualMode = 'image' | 'video';

export interface ShortsScriptRequest {
  topic: string;
  targetDurationSec: number;
  visualStyle: string;
  tone: ShortsTone;
  /** Output framing — image prompts are composed for this shape. */
  aspect: ShortsAspect;
  /** Captions occupy the lower third, so subjects are kept clear of it. */
  captionsEnabled: boolean;
  /** Video mode gets motion cues appended; stills do not. */
  generationMode: ShortsVisualMode;
}

/** The subset of the request needed to compose a finished visual prompt. */
export type VisualPromptContext = Pick<
  ShortsScriptRequest,
  'visualStyle' | 'aspect' | 'captionsEnabled' | 'generationMode'
>;

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

/**
 * Scene duration target for short-form video pacing (TikTok, Shorts, Reels).
 * ~4.8s provides dynamic cuts without lingering too long on static frames:
 * - 15s -> 3-4 scenes
 * - 30s -> 6-7 scenes
 * - 60s -> 12-13 scenes
 * - 90s -> 18-20 scenes
 */
const SECONDS_PER_SCENE = 4.8;
const MIN_SCENES = 3;
const MAX_SCENES = 24;

const TONE_GUIDANCE: Record<ShortsTone, string> = {
  punchy:
    'Fast, punchy, high-energy. Short declarative sentences. Hook hard on the first line. '
    + 'Sentence fragments are allowed. Hard stops, no linking words between lines.',
  documentary:
    'Calm, authoritative documentary narration. Precise and factual. '
    + 'Even, measured line lengths. Let a specific detail carry each line rather than emphasis.',
  story:
    'Narrative storytelling with a clear beginning, turn, and payoff. '
    + 'End each line on an unresolved beat so the next one has to be heard; resolve only on the last line.',
  educational:
    'Clear and explanatory. Teach one idea per line, building in order. '
    + 'Each line depends on the one before it. Define a term the moment you use it.',
  hype:
    'Bold, dramatic, hype-driven. Big claims and momentum, but never false facts. '
    + 'Escalate line to line — each one must top the last. Superlatives must be earned by a real detail.',
};

export const clampSceneCount = (targetDurationSec: number): number =>
  Math.max(MIN_SCENES, Math.min(MAX_SCENES, Math.round(targetDurationSec / SECONDS_PER_SCENE)));

const MIN_WORDS_PER_SCENE = 10;

interface WordBudgets {
  /** Body beats between the intro and payoff. */
  body: number;
  intro: number;
  payoff: number;
}

const wordBudgets = (targetDurationSec: number, sceneCount: number): WordBudgets => {
  const totalWords = Math.round(targetDurationSec * WORDS_PER_SECOND);
  const evenShare = Math.max(MIN_WORDS_PER_SCENE, Math.round(totalWords / sceneCount));
  const intro = Math.max(7, Math.min(14, Math.round(evenShare * 0.75)));
  const payoff = Math.max(6, Math.min(14, Math.round(evenShare * 0.7)));
  const bodyBeats = Math.max(1, sceneCount - 2);
  const body = Math.max(
    MIN_WORDS_PER_SCENE,
    Math.round((totalWords - intro - payoff) / bodyBeats),
  );

  return { body, intro, payoff };
};

const sentenceBudget = (words: number): string => {
  if (words >= 30) return '2 to 3 sentences';
  if (words >= 16) return '1 to 2 sentences';
  return 'one punchy sentence';
};

// --- beat structure -----------------------------------------------------------

type BeatRole = 'INTRO' | 'CONTEXT' | 'ITEM' | 'PAYLOAD' | 'TURN' | 'PAYOFF';

interface Beat {
  role: BeatRole;
  brief: string;
}

const BEAT_BRIEF: Record<Exclude<BeatRole, 'ITEM'>, string> = {
  INTRO: 'what this video is about, stated clearly and hooking the viewer immediately',
  CONTEXT: 'essential background the viewer needs to understand the significance',
  PAYLOAD: 'a new concrete fact, mechanism, or striking detail that advances the topic',
  TURN: 'a surprising twist, counter-intuitive revelation, or unexpected complication',
  PAYOFF: 'the final resolution, consequence, or key takeaway for the viewer',
};

const MIN_SCENES_FOR_TURN = 5;

const narrativeBeats = (count: number): Beat[] => {
  const turnIndex = count >= MIN_SCENES_FOR_TURN ? Math.round(count * 0.65) : -1;

  const roleAt = (i: number): Exclude<BeatRole, 'ITEM'> => {
    if (i === 0) return 'INTRO';
    if (i === count - 1) return 'PAYOFF';
    if (i === 1) return 'CONTEXT';
    if (i === turnIndex) return 'TURN';
    return 'PAYLOAD';
  };

  return Array.from({ length: count }, (_, i) => {
    const role = roleAt(i);
    return { role, brief: BEAT_BRIEF[role] };
  });
};

// --- list topics --------------------------------------------------------------

const WORD_NUMBERS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15,
};

const NUMBER_TOKEN = `\\d{1,2}|${Object.keys(WORD_NUMBERS).join('|')}`;

const LIST_PATTERNS = [
  new RegExp(`\\btop\\s+(${NUMBER_TOKEN})\\b`, 'i'),
  new RegExp(`\\b(?:best|worst|greatest)\\s+(${NUMBER_TOKEN})\\b`, 'i'),
  new RegExp(`\\b(${NUMBER_TOKEN})\\s+(?:most|best|worst|biggest|craziest|weirdest|deadliest|greatest|scariest|strangest|rarest)\\b`, 'i'),
  new RegExp(
    `\\b(${NUMBER_TOKEN})\\s+(?:things|ways|reasons|facts|tips|tricks|mistakes|myths|secrets|rules|steps|signs|habits|lessons|places|moments|inventions|examples|questions|ideas|hacks|records|discoveries|creatures|animals|monsters)\\b`,
    'i',
  ),
];

const LIST_MIN_ITEMS = 2;
const LIST_MAX_ITEMS = 15;

const detectListCount = (topic: string): number | null => {
  for (const pattern of LIST_PATTERNS) {
    const raw = topic.match(pattern)?.[1];
    if (!raw) continue;
    const value = WORD_NUMBERS[raw.toLowerCase()] ?? Number.parseInt(raw, 10);
    if (Number.isFinite(value) && value >= LIST_MIN_ITEMS && value <= LIST_MAX_ITEMS) return value;
  }
  return null;
};

const itemBrief = (n: number, total: number, part: number, parts: number): string => {
  if (parts === 1) return `item ${n} of ${total} — name a unique real example, then state its most striking concrete detail`;
  return part === 1
    ? `item ${n} of ${total}, part 1 — name this specific entry and introduce what makes it remarkable`
    : `item ${n} of ${total}, part ${part} — reveal a key supporting detail or astonishing fact about it`;
};

const listBeats = (count: number, itemCount: number): Beat[] => {
  const hasPayoff = count >= itemCount + 2;
  const itemSlots = count - 1 - (hasPayoff ? 1 : 0);
  const base = Math.max(1, Math.floor(itemSlots / itemCount));
  const extra = itemSlots > itemCount ? itemSlots % itemCount : 0;

  const beats: Beat[] = [
    { role: 'INTRO', brief: `${BEAT_BRIEF.INTRO} — state that this video covers ${itemCount} items` },
  ];

  for (let n = 1; n <= itemCount; n += 1) {
    const parts = base + (n > itemCount - extra ? 1 : 0);
    for (let part = 1; part <= parts; part += 1) {
      beats.push({ role: 'ITEM', brief: itemBrief(n, itemCount, part, parts) });
    }
  }

  if (hasPayoff) beats.push({ role: 'PAYOFF', brief: BEAT_BRIEF.PAYOFF });
  return beats;
};

const buildBeats = (topic: string, targetDurationSec: number): Beat[] => {
  const sceneCount = clampSceneCount(targetDurationSec);
  const itemCount = detectListCount(topic);
  if (!itemCount) return narrativeBeats(sceneCount);

  return listBeats(Math.min(MAX_SCENES, Math.max(sceneCount, itemCount + 2)), itemCount);
};

// --- visual prompt composition ------------------------------------------------

const framingClause = (req: VisualPromptContext): string => {
  const parts: string[] = [];

  switch (req.aspect) {
    case '9:16':
      parts.push('vertical 9:16 portrait composition, single clear focal subject centred with headroom');
      break;
    case '16:9':
      parts.push('wide 16:9 landscape composition, cinematic framing');
      break;
    case '1:1':
      parts.push('square 1:1 composition, balanced subject');
      break;
  }

  if (req.captionsEnabled) parts.push('lower third kept clear of key action');
  if (req.generationMode === 'video') parts.push('slow camera push in, subtle natural cinematic motion');

  return parts.join(', ');
};

const TEXTLESS_CLAUSE =
  'no text, no words, no letters, no numbers, no typography, no captions, no subtitles, no signage, no logos, no watermarks, textless image';

export const composeVisualPrompt = (subject: string, req: VisualPromptContext): string => {
  const cleanSubject = subject.trim().replace(/[.,;\s]+$/, '');
  return [cleanSubject, framingClause(req), req.visualStyle, TEXTLESS_CLAUSE]
    .filter(Boolean)
    .join(', ');
};

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those',
  'as', 'by', 'not', 'you', 'your', 'they', 'their', 'we', 'our', 'can', 'will', 'just',
  'has', 'have', 'had', 'what', 'which', 'when', 'how', 'why', 'about', 'into', 'than', 'then',
  'there', 'here', 'more', 'most', 'some', 'all', 'one', 'two', 'also', 'even', 'over', 'after',
]);

const NUMBER_WORDS_PATTERN = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d+';

const FILLER_PHRASES = [
  /^did you know(?: that)?/i,
  /^you (?:won'?t|will not) believe/i,
  /^here'?s (?:the|a|why|what|how)/i,
  /^let'?s (?:dive in|talk about|explore|look at|check out)/i,
  /^imagine (?:this|a|if)/i,
  /^picture this/i,
  /^in this video/i,
  /^welcome back/i,
  new RegExp(`^(?:at )?number (?:${NUMBER_WORDS_PATTERN})(?: on (?:our|the) list)?(?: is)?`, 'i'),
  new RegExp(`^coming in at (?:number )?(?:${NUMBER_WORDS_PATTERN})`, 'i'),
  /^(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?: off| up| on our list)?(?: is)?/i,
  /^first off/i,
  /^next up/i,
  /^finally/i,
  /^meanwhile/i,
  /^because of this/i,
  /^if you look (?:closely|at)/i,
];

/**
 * Intelligent deterministic extractor that derives a vivid visual scene description
 * from a narration line when AI image prompt generation is offline or fails.
 */
export const deriveImagePrompt = (narration: string, topic: string, req: VisualPromptContext): string => {
  let cleaned = narration.trim();
  for (const pattern of FILLER_PHRASES) {
    cleaned = cleaned.replace(pattern, '').replace(/^[,\s-]+/, '');
  }

  // Extract meaningful visual keywords
  const words = cleaned
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));

  const keyDetail = words.slice(0, 8).join(' ');
  const anchor = topic.trim().replace(/[^\p{L}\p{N}\s-]/gu, '').slice(0, 50);

  const subject = keyDetail
    ? `cinematic scene of ${keyDetail}, detailed focal subject, atmospheric environment, in the context of ${anchor}`
    : `striking scene depicting ${anchor}, dramatic lighting, highly detailed subject`;

  return composeVisualPrompt(subject, req);
};

// --- parsing helpers ----------------------------------------------------------

const stripLineDecoration = (line: string): string =>
  line
    // List markers first: "1.", "2)", "(3)", "-", "*", ">"
    .replace(/^\s*(?:[-*•>]+|\d+\s*[.):]|\(\d+\))\s*/, '')
    // Labels the model may add: "Scene 5:", "Shot 2 -", "Line:"
    .replace(/^\s*(?:scene|shot|line|step|clip|beat)\s*\d*\s*[:.\-–]\s*/i, '')
    .replace(/^\**\s*/, '')
    .replace(/\s*\**$/, '')
    // Wrapping quotes
    .replace(/^["'“”‘’]+\s*/, '')
    .replace(/\s*["'“”‘’]+$/, '')
    .trim();

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

const normalizeNarrationLine = (line: string): string => cleanLLMResponse(line).trim();

const splitIntoSentences = (text: string): string[] =>
  text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);

const groupSentences = (sentences: string[], count: number): string[] => {
  if (count <= 0 || sentences.length <= count) return sentences;

  const sizes = new Array<number>(count).fill(Math.floor(sentences.length / count));
  let extra = sentences.length % count;
  const order = [
    ...Array.from({ length: Math.max(0, count - 2) }, (_, i) => i + 1),
    ...(count >= 2 ? [count - 1] : []),
    0,
  ];
  for (let i = 0; extra > 0; i += 1) {
    sizes[order[i % order.length]] += 1;
    extra -= 1;
  }

  const grouped: string[] = [];
  let cursor = 0;
  for (const size of sizes) {
    grouped.push(sentences.slice(cursor, cursor + size).join(' '));
    cursor += size;
  }
  return grouped.filter((line) => line.length > 1);
};

const fitToCount = (lines: string[], count: number): string[] => {
  if (lines.length === count) return lines;
  if (lines.length > count) return lines.slice(0, count);

  // If fewer lines were produced, try splitting multi-sentence lines to expand scene count
  const result: string[] = [];
  for (const line of lines) {
    const sentences = splitIntoSentences(line);
    if (result.length + (lines.length - result.length) < count && sentences.length > 1) {
      result.push(sentences[0]);
      result.push(sentences.slice(1).join(' '));
    } else {
      result.push(line);
    }
  }

  if (result.length === count) return result;
  if (result.length > count) return result.slice(0, count);

  // Pad remaining by duplicating if absolutely necessary
  const padded = [...result];
  let i = 0;
  while (padded.length < count && result.length > 0) {
    padded.push(result[i % result.length]);
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
    return postChatCompletions(settings, messages, temperature, undefined, opts.signal);
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
  );
};

// --- narration generation -----------------------------------------------------

const NARRATION_SYSTEM = `You write voiceover scripts for engaging, high-retention short-form vertical videos (TikTok, Reels, YouTube Shorts).

Rules:
- Write ONE narration line per numbered scene.
- Each line contains the complete spoken voiceover for that scene (1-2 sentences on the SAME line).
- Spend the word budget for each scene: state the key fact, then explain it with concrete details (names, numbers, places, mechanisms).
- Scene 1 (INTRO): Hook the viewer immediately and state what the video is about.
- For list topics: Every list item must name a unique, real example. Never repeat names.
- The final scene lands the payoff or concluding takeaway.
- Speak directly to the viewer: second person, active voice, natural contractions.
- NEVER open a line with stock clichés: "Did you know", "You won't believe", "Let's dive in", "In this video".
- Output ONLY the numbered scenes (e.g. "1. [line]", "2. [line]"). No commentary, no meta-explanation, no extra headers.`;

const generateNarrationLines = async (
  req: ShortsScriptRequest,
  beats: Beat[],
  opts: ShortsScriptOptions,
): Promise<string[]> => {
  const sceneCount = beats.length;
  const { body: wordsPerScene, intro: introWords, payoff: payoffWords } = wordBudgets(
    req.targetDurationSec,
    sceneCount,
  );

  const budgetFor = (role: BeatRole): string => {
    if (role === 'INTRO') return `one hook sentence, ~${introWords} words`;
    if (role === 'PAYOFF') return `one payoff sentence, ~${payoffWords} words`;
    return `${sentenceBudget(wordsPerScene)}, ~${wordsPerScene} words`;
  };

  const beatPlan = beats
    .map((beat, i) => `${i + 1}. [${beat.role}, ${budgetFor(beat.role)}] ${beat.brief}`)
    .join('\n');

  const user = `Topic: ${req.topic}
Target Duration: ${req.targetDurationSec} seconds.
Tone: ${TONE_GUIDANCE[req.tone]}

Scene Plan:
${beatPlan}

Write exactly ${sceneCount} narration lines matching the scene plan above.
Output strictly ${sceneCount} numbered lines, one line per scene (e.g. "1. ...", "2. ..."). Write complete spoken sentences.`;

  opts.onStage?.('Writing the script...');

  const parseAttempt = (raw: string): string[] => {
    const rawClean = stripWrapper(raw);
    const rawLines = rawClean.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    // Check for NARRATION: prefix if present
    const narrationPrefixed = rawLines
      .filter((l) => /^NARRATION\s*\d*\s*[:.\-–]/i.test(l))
      .map((l) => l.replace(/^NARRATION\s*\d*\s*[:.\-–]\s*/i, ''));

    if (narrationPrefixed.length >= Math.max(2, Math.floor(sceneCount * 0.6))) {
      return narrationPrefixed.map(normalizeNarrationLine).filter((l) => l.length > 1);
    }

    // Filter out pure NOTE lines
    const nonNotes = rawLines.filter((l) => !/^NOTE\s*\d*\s*[:.\-–]/i.test(l));

    // Strip line numbers & decorations
    let lines = nonNotes.map(stripLineDecoration).filter((l) => l.length > 1);

    // If lines are far fewer than scenes, fallback to sentence splitting
    if (lines.length < Math.max(2, Math.floor(sceneCount * 0.6))) {
      const sentences = splitIntoSentences(rawClean.replace(/\s*\n\s*/g, ' '));
      if (sentences.length > lines.length) {
        lines = groupSentences(sentences.map(stripLineDecoration), sceneCount);
      }
    }

    return lines.map(normalizeNarrationLine).filter((line) => line.length > 1);
  };

  let lines: string[] = [];
  try {
    lines = parseAttempt(await runPrompt(NARRATION_SYSTEM, user, 0.8, opts));
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    console.warn('[Shorts] Narration pass failed, retrying with stricter prompt.', e);
  }

  if (lines.length < Math.ceil(sceneCount * 0.7)) {
    opts.onStage?.('Sharpening the script...');
    try {
      const retry = await runPrompt(
        NARRATION_SYSTEM,
        `${user}\n\nIMPORTANT: output exactly ${sceneCount} numbered lines. Each line must be a complete voiceover sentence with concrete details.`,
        0.6,
        opts,
      );
      const retried = parseAttempt(retry);
      if (retried.length > lines.length) lines = retried;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      console.warn('[Shorts] Narration retry failed; using first attempt.', e);
    }
  }

  if (lines.length === 0) {
    throw new Error('The model could not produce a usable script. Try a different topic or a larger model.');
  }

  return fitToCount(lines, sceneCount);
};

// --- visual prompt generation -------------------------------------------------

const IMAGE_PROMPT_SYSTEM = `You turn voiceover narration lines into text-to-image prompts for video scenes.

Rules:
- Output ONE image prompt per line matching the input lines in order.
- Each prompt must describe a single concrete visual still image: visible subject, action/pose, setting, lighting, and camera angle.
- Anchor directly on the most concrete physical subject named in that voiceover line.
- Describe ONLY what is visually seen in the frame.
- NO text, words, subtitles, signage, speech bubbles, or logos in the image.
- NO meta-chatter, numbering, or markdown formatting. Output one prompt per line.

Examples:
Narration: "Deep inside the Mariana Trench, bizarre bioluminescent creatures thrive in extreme pressure."
Prompt: glowing translucent deep-sea viperfish in pitch-black ocean water, bioluminescent organs shining cyan, detailed scales, close-up macro shot, dark cinematic lighting

Narration: "In 1969, Apollo 11 touched down on the lunar surface, marking history."
Prompt: astronaut in white Apollo spacesuit stepping onto powdery grey lunar surface, deep boot print in moon dust, harsh bright sunlight, black space with earth in distant background, low angle shot`;

const RENDERS_TEXT = /["“”]|\btext\s+(?:reading|that\s+says|saying)\b|\bword[s]?\s+(?:reading|that\s+says)\b|\bwritten\s+(?:on|across)\b/i;

const isUsablePrompt = (candidate: string, narrationLine: string): boolean => {
  const trimmed = candidate.trim();
  if (trimmed.length < 12) return false;
  if (trimmed.toLowerCase() === narrationLine.trim().toLowerCase()) return false;
  if (RENDERS_TEXT.test(trimmed)) return false;
  return true;
};

const generateImagePrompts = async (
  narrationLines: string[],
  req: ShortsScriptRequest,
  opts: ShortsScriptOptions,
): Promise<string[]> => {
  opts.onStage?.('Designing visual prompts...');

  const script = narrationLines.map((line, i) => `${i + 1}. ${line}`).join('\n');
  const user = `Video topic: ${req.topic}

Write exactly ${narrationLines.length} visual image prompts, one per line, matching these voiceover scenes in order:

${script}`;

  let candidates: string[] = [];
  try {
    const raw = await runPrompt(IMAGE_PROMPT_SYSTEM, user, 0.7, opts);
    candidates = stripWrapper(raw)
      .split(/\r?\n/)
      .map(stripLineDecoration)
      .filter((l) => l.length > 0);
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    console.warn('[Shorts] Image prompt pass failed; using intelligent fallback.', e);
  }

  return narrationLines.map((line, i) => {
    const candidate = candidates[i];
    if (candidate && isUsablePrompt(candidate, line)) {
      return composeVisualPrompt(candidate, req);
    }
    return deriveImagePrompt(line, req.topic, req);
  });
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

  const scoped = { ...req, topic };
  const beats = buildBeats(topic, req.targetDurationSec);

  const narrationLines = await generateNarrationLines(scoped, beats, opts);
  const imagePrompts = await generateImagePrompts(narrationLines, scoped, opts);

  return {
    title: deriveTitle(topic, narrationLines[0] ?? ''),
    scenes: narrationLines.map((narration, i) => ({
      narration,
      imagePrompt: imagePrompts[i] ?? deriveImagePrompt(narration, topic, scoped),
    })),
  };
};

/**
 * Regenerate a single scene's image prompt using AI with fallback to the smart extractor.
 */
export const regenerateImagePrompt = async (
  narration: string,
  req: Pick<ShortsScriptRequest, 'topic'> & VisualPromptContext,
  opts: ShortsScriptOptions = {},
): Promise<string> => {
  const trimmed = narration.trim();
  if (!trimmed) return deriveImagePrompt(narration, req.topic, req);

  const user = `Video subject: ${req.topic}\n\nWrite ONE image prompt for this voiceover line:\n"${trimmed}"`;

  try {
    const raw = await runPrompt(IMAGE_PROMPT_SYSTEM, user, 0.8, opts);
    const lines = stripWrapper(raw)
      .split(/\r?\n/)
      .map(stripLineDecoration)
      .filter((l) => l.length > 0);
    const candidate = lines[0];
    if (candidate && isUsablePrompt(candidate, trimmed)) {
      return composeVisualPrompt(candidate, req);
    }
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    console.warn('[Shorts] Single image prompt regeneration failed, using extractor fallback.', e);
  }

  return deriveImagePrompt(trimmed, req.topic, req);
};

const EXTEND_NARRATION_SYSTEM = `You extend one line of a short-form video voiceover script with more supporting detail, without rewriting what's already there.

Rules:
- Output ONLY the new sentences to append after the existing line. Do not repeat, rephrase or summarize the existing line.
- Add 1-2 new spoken sentences. Every sentence must carry a concrete detail the existing line doesn't already have — a number, name, place, date, mechanism, or comparison.
- Continue in the same voice, tense and person as the existing line.
- Do not open with a stock phrase: "Did you know", "Here's the thing", "And get this", "Buckle up".
- Write words a narrator says out loud. No stage directions, no emoji, no hashtags, no quotes.
- Stay factually accurate.`;

export const extendNarration = async (
  narration: string,
  req: Pick<ShortsScriptRequest, 'topic' | 'tone'>,
  opts: ShortsScriptOptions = {},
): Promise<string> => {
  const trimmed = narration.trim();
  if (!trimmed) throw new Error('Write or generate a narration line first.');

  const user = `Video topic: ${req.topic}
Tone: ${TONE_GUIDANCE[req.tone]}

Existing narration line:
"${trimmed}"

Write 1-2 additional spoken sentences that continue directly from it, each adding a new concrete detail. Output only the new sentences, nothing else.`;

  const attempt = async (temperature: number, extra = ''): Promise<string | null> => {
    try {
      const raw = await runPrompt(EXTEND_NARRATION_SYSTEM, `${user}${extra}`, temperature, opts);
      const addition = stripWrapper(raw)
        .split(/\r?\n/)
        .map(stripLineDecoration)
        .map(normalizeNarrationLine)
        .filter((line) => line.length > 1)
        .join(' ');
      if (addition && addition.toLowerCase() !== trimmed.toLowerCase()) return addition;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      console.warn('[Shorts] Narration extension attempt failed.', e);
    }
    return null;
  };

  const first = await attempt(0.85);
  if (first) return `${trimmed} ${first}`;

  const retry = await attempt(0.6, '\n\nIMPORTANT: respond with 1-2 plain spoken sentences only. Nothing else.');
  if (retry) return `${trimmed} ${retry}`;

  throw new Error('Could not extend this line. Try again, or add detail by hand.');
};

