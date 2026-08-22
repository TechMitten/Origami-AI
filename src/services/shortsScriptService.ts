import { ensureWebLLMReady, generateWebLLMResponse } from './webLlmService';
import { cleanLLMResponse, postChatCompletions, type ChatMessage, type LLMSettings } from './aiService';
import type { ShortsAspect } from './ShortsVideoRenderer';

/**
 * Script generation for Shorts.
 *
 * Runs in three line-list passes (outline -> narration -> image prompts) rather
 * than asking for one nested JSON blob. A 2B-class local model (the WebLLM
 * default) emits well-formed line lists far more reliably than it emits
 * well-formed JSON, and a malformed blob costs the whole generation. Every pass
 * has a deterministic fallback so the flow never dead-ends on a weak model.
 */

export type ShortsTone = 'punchy' | 'documentary' | 'story' | 'educational' | 'hype';

/**
 * Declared locally rather than imported from shortsProject: that module already
 * imports ShortsTone from here, and a value-level cycle between the two would be
 * fragile. The union is identical to ShortsGenerationMode.
 */
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
 * Scene duration on screen is driven entirely by the measured TTS audio length
 * (see ShortsVideoRenderer), not by this constant — it only sets the scene
 * count and, through that, the per-line word budget below. A lower value packs
 * in more, shorter-held cuts at the cost of thinner narration per line; 4.5s
 * leaves enough room for a line to both name its subject and land a concrete
 * supporting detail, which is what the outline/narration prompts demand.
 */
const SECONDS_PER_SCENE = 4.5;
const MIN_SCENES = 3;
/**
 * Above what the 90s duration preset naturally needs (90s / 4.5s = 20 scenes) —
 * this is a safety ceiling for list topics whose item count pushes the scene
 * count past the duration-derived value (see buildBeats).
 */
const MAX_SCENES = 26;

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

// --- beat structure -----------------------------------------------------------

/**
 * The job each scene does. Assigned in code rather than asked for from the
 * model: a fixed skeleton is what stops a script from becoming a flat pile of
 * facts, and it keeps every pass parsing a plain line list.
 */
type BeatRole = 'INTRO' | 'CONTEXT' | 'ITEM' | 'PAYLOAD' | 'TURN' | 'PAYOFF';

interface Beat {
  role: BeatRole;
  /** What this beat has to deliver, phrased for the outline model. */
  brief: string;
}

const BEAT_BRIEF: Record<Exclude<BeatRole, 'ITEM'>, string> = {
  INTRO: 'what this whole video is about, named in plain terms, framed so it is impossible to scroll past',
  CONTEXT: 'the one piece of background the viewer needs before any detail lands',
  PAYLOAD: 'a new concrete fact that advances the story — never a restatement',
  TURN: 'the twist, complication, or counter-intuitive reversal',
  PAYOFF: 'the consequence, the resolution, or what it means for the viewer now',
};

/** A TURN only earns its place once there is a middle to turn against. */
const MIN_SCENES_FOR_TURN = 6;

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

/**
 * "Top 5 ..." topics need a different skeleton entirely. Run through the
 * narrative one, the outline plans a single arc and the finished script
 * elaborates on one entry instead of covering the list.
 */

const WORD_NUMBERS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const NUMBER_TOKEN = `\\d{1,2}|${Object.keys(WORD_NUMBERS).join('|')}`;

const LIST_PATTERNS = [
  new RegExp(`\\btop\\s+(${NUMBER_TOKEN})\\b`, 'i'),
  new RegExp(`\\b(?:best|worst|greatest)\\s+(${NUMBER_TOKEN})\\b`, 'i'),
  new RegExp(`\\b(${NUMBER_TOKEN})\\s+(?:most|best|worst|biggest|craziest|weirdest|deadliest|greatest|scariest|strangest|rarest)\\b`, 'i'),
  new RegExp(
    `\\b(${NUMBER_TOKEN})\\s+(?:things|ways|reasons|facts|tips|tricks|mistakes|myths|secrets|rules|steps|signs|habits|lessons|places|moments|inventions|examples|questions|ideas|hacks|records|discoveries)\\b`,
    'i',
  ),
];

/** Fewer than 2 is not a list; more than 12 will not fit in a short. */
const LIST_MIN_ITEMS = 2;
const LIST_MAX_ITEMS = 12;

/** The number of entries a "Top N" style topic promises, or null. */
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
  if (parts === 1) return `list entry ${n} of ${total} — a different real one from every other entry; name it, then its single most striking concrete detail`;
  return part === 1
    ? `list entry ${n} of ${total}, part 1 of ${parts} — a different real one from every other entry; name it and say what it is`
    : `list entry ${n} of ${total}, part ${part} of ${parts} — one further concrete detail about that same entry, never a restatement`;
};

/**
 * Intro, then every list entry in order, then the payoff.
 *
 * Spare beats go to the LAST entries: in a countdown those are the ones the
 * viewer stayed for, so they earn the extra screen time.
 */
const listBeats = (count: number, itemCount: number): Beat[] => {
  const hasPayoff = count >= itemCount + 2;
  const itemSlots = count - 1 - (hasPayoff ? 1 : 0);
  const base = Math.floor(itemSlots / itemCount);
  const extra = itemSlots % itemCount;

  const beats: Beat[] = [
    { role: 'INTRO', brief: `${BEAT_BRIEF.INTRO} — say outright that this is a list of ${itemCount}` },
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

/**
 * Pick the skeleton, and the scene count that can actually carry it.
 *
 * A list topic overrides the duration-derived scene count when that count is
 * too small to reach every entry — a "Top 10" that covers three of them is a
 * broken video, and running long is the lesser cost.
 */
const buildBeats = (topic: string, targetDurationSec: number): Beat[] => {
  const sceneCount = clampSceneCount(targetDurationSec);
  const itemCount = detectListCount(topic);
  if (!itemCount) return narrativeBeats(sceneCount);

  return listBeats(Math.min(MAX_SCENES, Math.max(sceneCount, itemCount + 2)), itemCount);
};

// --- visual prompt composition ------------------------------------------------

/**
 * Framing the image model needs but the LLM should not be asked to invent.
 *
 * Both are output facts, not creative choices: the render is vertical far more
 * often than not, and captions are burned into the lower third by
 * ShortsVideoRenderer, so a subject placed down there gets covered.
 */
const framingClause = (req: VisualPromptContext): string => {
  const parts: string[] = [];

  switch (req.aspect) {
    case '9:16':
      parts.push('vertical 9:16 portrait composition, single clear subject centred with headroom');
      break;
    case '16:9':
      parts.push('wide 16:9 landscape composition, subject placed off-centre');
      break;
    case '1:1':
      parts.push('square 1:1 composition, subject centred');
      break;
  }

  if (req.captionsEnabled) parts.push('lower third kept clear of important detail');
  if (req.generationMode === 'video') parts.push('slow camera push in, subtle natural motion');

  return parts.join(', ');
};

/**
 * Build the final prompt sent to Pollinations from a model-written subject.
 *
 * The style is applied here and ONLY here — the image-prompt pass is deliberately
 * never told what the style is, so it cannot bake a second copy into its answer.
 */
export const composeVisualPrompt = (subject: string, req: VisualPromptContext): string =>
  [subject.trim().replace(/[.\s]+$/, ''), framingClause(req), req.visualStyle, 'no text, no watermark, no caption']
    .filter(Boolean)
    .join(', ');

// --- parsing helpers ----------------------------------------------------------

/** Strip list markers, quotes and scene labels a model may prepend to a line. */
const stripLineDecoration = (line: string): string =>
  line
    // List markers first: "1.", "2)", "(3)", "-", "*", ">"
    .replace(/^\s*(?:[-*•>]+|\d+\s*[.):]|\(\d+\))\s*/, '')
    // Then labels the model may add: "Scene 5:", "Shot 2 -", "Line:". "Prompt:"
    // and "Narration:" are here because the image-prompt few-shot examples use
    // them, and models echo the example's shape back.
    .replace(/^\s*(?:scene|shot|line|step|clip|prompt|narration)\s*\d*\s*[:.\-–]\s*/i, '')
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
    // Reasoning models like DeepSeek R1 inject the opening <think> into the
    // prompt, so the reply contains only the closing </think> after the
    // reasoning text. Drop everything up to and including that closing tag.
    .replace(/^[\s\S]*?<\/think>/i, '')
    // max_tokens can cut generation off mid-reasoning, before a closing tag
    // ever appears. Drop an unclosed <think> and everything after it.
    .replace(/<think\b[^>]*>[\s\S]*$/gi, '')
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

/**
 * Last-resort image prompt derived from the narration's content words.
 *
 * Anchored on the topic rather than the narration alone: content words pulled
 * from one line drift off-subject badly on abstract lines, and the topic keeps
 * the fallback image recognisably part of the same video.
 */
const deriveImagePrompt = (narration: string, topic: string, req: VisualPromptContext): string => {
  const keywords = narration
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 6);

  const anchor = topic.trim().replace(/\s+/g, ' ').slice(0, 60);
  const detail = keywords.length ? keywords.join(', ') : narration.slice(0, 80);
  return composeVisualPrompt(`${anchor}, ${detail}, dramatic composition`, req);
};

/** True when a candidate image prompt is just the narration line repeated back. */
const isEchoed = (candidate: string, narrationLine: string): boolean =>
  candidate.trim().toLowerCase() === narrationLine.trim().toLowerCase();

/** True when a candidate image prompt is too thin to describe a real scene. */
const isWeak = (candidate: string): boolean => {
  const trimmed = candidate.trim();
  if (trimmed.length < 12) return true;
  const terms = trimmed.split(',').map((t) => t.trim()).filter(Boolean);
  const words = trimmed.split(/\s+/).filter(Boolean);
  return terms.length < 2 && words.length < 4;
};

/**
 * Text-to-image models render quoted strings literally, so a prompt carrying one
 * produces an image with garbled words stamped across it.
 */
const RENDERS_TEXT = /["“”]|\btext\s+(?:reading|that\s+says|saying)\b|\bword[s]?\s+(?:reading|that\s+says)\b|\bwritten\s+(?:on|across)\b/i;

/**
 * The few-shot examples baked into IMAGE_PROMPT_SYSTEM. Weaker models
 * sometimes parrot one of these verbatim instead of writing a real prompt,
 * so an exact match to either one is always a failure, never a real answer.
 * Must be kept in sync with the Examples block in IMAGE_PROMPT_SYSTEM.
 */
const EXAMPLE_IMAGE_PROMPTS = [
  'lone anglerfish in black water, bioluminescent lure glowing pale blue, needle teeth catching the light, close-up, deep shadow',
  'apollo boot pressing into grey lunar dust, sharp tread print, harsh white sunlight, black sky above, low close-up',
].map((s) => s.toLowerCase());

/** True when a candidate is the literal few-shot example, not a real answer. */
const isExampleEcho = (candidate: string): boolean =>
  EXAMPLE_IMAGE_PROMPTS.includes(candidate.trim().toLowerCase());

/** True when a candidate repeats verbatim at another index — the model failed to vary the prompts per line. */
const isDuplicate = (candidates: string[], index: number): boolean => {
  const value = candidates[index]?.trim().toLowerCase();
  if (!value) return false;
  return candidates.some((other, i) => i !== index && other?.trim().toLowerCase() === value);
};

/** True when a candidate fails any of the usability checks above. */
const isUnusable = (candidate: string | undefined, narrationLine: string, allCandidates: string[], index: number): boolean =>
  !candidate
  || isEchoed(candidate, narrationLine)
  || isWeak(candidate)
  || isExampleEcho(candidate)
  || RENDERS_TEXT.test(candidate)
  || isDuplicate(allCandidates, index);

/** Count how many candidates at matching indices are usable (present, not echoed, not weak, not a duplicate/example echo). */
const scoreImagePrompts = (candidates: string[], narrationLines: string[]): number =>
  narrationLines.reduce((score, line, i) => {
    if (isUnusable(candidates[i]?.trim(), line, candidates, i)) return score;
    return score + 1;
  }, 0);

// --- narration quality --------------------------------------------------------

/**
 * Openers that mark a script as generic. Every one of these signals the model
 * fell back on short-form boilerplate instead of writing about the topic.
 */
const CLICHE_OPENERS = [
  'did you know',
  "you won't believe",
  'you will not believe',
  'buckle up',
  "here's the kicker",
  'here is the kicker',
  "let's dive in",
  'lets dive in',
  "let's talk about",
  'stay tuned',
  'in this video',
  'welcome back',
  'imagine this',
  'picture this',
  'get ready',
];

/**
 * Content words of a line, minus stop words and anything the topic already
 * contains. Topic words are expected to recur; anything else that recurs across
 * most lines is the model looping.
 */
const contentTokens = (text: string, exclude?: Set<string>): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w) && !exclude?.has(w)),
  );

/**
 * Tokens that recur across most of a line list without coming from the topic.
 *
 * A weak model asked for five distinct list entries will happily invent one
 * name and attach it to all five. Nothing else catches that: the lines differ,
 * so they are neither duplicates nor identical openings.
 */
const repeatedEntities = (lines: string[], topic: string): string[] => {
  const present = lines.filter((line) => line && line.trim().length > 1);
  if (present.length < 3) return [];

  const fromTopic = contentTokens(topic);
  const counts = new Map<string, number>();
  for (const line of present) {
    for (const token of contentTokens(line, fromTopic)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  const limit = Math.max(2, Math.ceil(present.length * 0.5));
  return [...counts.entries()].filter(([, count]) => count > limit).map(([token]) => token);
};

const EMOJI_OR_DIRECTION = /[\p{Extended_Pictographic}]|^\s*[[(](?:cut|shot|scene|b-roll|music|sfx)/iu;

const wordCount = (line: string): number => line.trim().split(/\s+/).filter(Boolean).length;

/** First four words, normalised — enough to catch two lines opening identically. */
const openingSignature = (line: string): string =>
  line.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).slice(0, 4).join(' ');

const HOOK_MAX_WORDS = 12;

/**
 * Count the narration lines that are actually usable, the mirror of
 * scoreImagePrompts. Drives the retry: a script can be perfectly well-formed
 * and still be clichéd, repetitive or badly paced, and those never used to
 * trigger a second attempt.
 */
const scoreNarration = (lines: string[], topic: string, sceneCount: number, wordsPerScene: number): number => {
  const signatures = lines.map(openingSignature);
  const looped = repeatedEntities(lines, topic);

  const usable = lines.reduce((score, line, i) => {
    const lower = line.toLowerCase();
    if (CLICHE_OPENERS.some((phrase) => lower.startsWith(phrase))) return score;
    if (EMOJI_OR_DIRECTION.test(line)) return score;

    // The same invented name attached to every entry — the loop failure.
    if (looped.length > 0) {
      const tokens = contentTokens(line);
      if (looped.some((token) => tokens.has(token))) return score;
    }

    const words = wordCount(line);
    if (i === 0) {
      if (words > HOOK_MAX_WORDS) return score;
    } else if (words > wordsPerScene * 1.8 || words < wordsPerScene * 0.7) {
      // Below the floor the line is a title or a fragment, not a spoken sentence.
      return score;
    }

    // A repeated opening reads as a template even when the facts differ.
    if (signatures.some((sig, j) => j !== i && sig && sig === signatures[i])) return score;

    return score + 1;
  }, 0);

  // Short of the requested count means fitToCount will have to recycle lines.
  return usable - Math.max(0, sceneCount - lines.length);
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

const OUTLINE_SYSTEM = `You are a researcher for a viral short-form video channel. You plan what a video will SAY before anyone writes the voiceover.

Rules you must follow exactly:
- Output ONLY the beat notes, one per line, in order. No numbering, no markdown, no headings, no commentary, no preamble.
- Each line is a terse factual note, not narration. Write the fact, not a sentence a narrator would say.
- Every beat must carry something concrete and checkable: a number, a name, a place, a date, a mechanism, or a direct comparison.
- Every beat must be NEW information. Never restate an earlier beat in different words.
- Order the beats so each one earns the next. Front-load: the opening beat is the reason to keep watching, never a warm-up.
- Stay factually accurate. If you are not sure of a number, describe the fact without the number instead of inventing one.
- When a beat is assigned a list entry, that beat covers THAT entry and nothing else. Every entry the plan names must get its own beat — never let one entry swallow the video.
- List entries must be DIFFERENT real things. Never reuse a name, person, title, show or place across entries. If you cannot name enough distinct real entries, say what you do know about each one rather than repeating a name you already used.
- Never invent a name to fill a slot. A real entry described vaguely beats a made-up one described precisely.`;

/**
 * Pass 1: plan what the video actually says.
 *
 * Without this the narration pass has to invent structure and content at the
 * same time, and reliably chooses generic filler over specifics. The beats come
 * from buildBeats so the model only has to supply content.
 */
const generateOutline = async (
  req: ShortsScriptRequest,
  beats: Beat[],
  opts: ShortsScriptOptions,
): Promise<string[]> => {
  const itemCount = detectListCount(req.topic);

  const briefs = beats.map((beat, i) => `${i + 1}. ${beat.role} — ${beat.brief}`).join('\n');

  const user = `Topic: ${req.topic}

Plan exactly ${beats.length} beats for a ${req.targetDurationSec}-second video. Each beat has an assigned job:

${briefs}

Write one factual note per beat, in this exact order. Keep each note under 20 words.${
    itemCount
      ? `\nAll ${itemCount} list entries must be different from one another — different titles, different people, different places. Naming the same one twice is a failure.`
      : ''
  }

OUTPUT EXACTLY ${beats.length} LINES AND NOTHING ELSE. NO PREAMBLE, NO EXPLANATIONS, NO REASONING.`;

  opts.onStage?.('Researching the angle...');

  /** Models tend to echo the role label back ("HOOK — ..."); drop it. */
  const stripRoleLabel = (line: string): string =>
    line.replace(/^\s*(?:intro|hook|context|item|entry|payload|turn|payoff|beat)\s*\d*\s*(?:of\s*\d+)?\s*[:.\-–—]\s*/i, '').trim();

  const parseAttempt = (raw: string): string[] =>
    toLines(raw).map(stripRoleLabel).filter((line) => line.length > 1);

  /** The list entries this attempt produced, for distinctness checking. */
  const entryNotes = (lines: string[]): string[] =>
    beats.map((beat, i) => (beat.role === 'ITEM' ? lines[i] : '')).filter(Boolean);

  const enough = (lines: string[]): boolean => lines.length >= Math.max(2, Math.floor(beats.length / 2));

  /**
   * Retry only on a real defect — too few beats, or one entity looping across
   * the list entries. Scoring every outline out of a perfect score would retry
   * almost every generation, and each retry is a full model call.
   */
  const defects = (lines: string[]): number => {
    if (!enough(lines)) return 99;
    const scope = itemCount ? entryNotes(lines) : lines;
    return repeatedEntities(scope, req.topic).length;
  };

  let best: string[] = [];
  try {
    best = parseAttempt(await runPrompt(OUTLINE_SYSTEM, user, 0.8, opts));
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    console.warn('[Shorts] Outline pass failed; retrying.', e);
  }

  if (defects(best) > 0) {
    try {
      const retry = parseAttempt(
        await runPrompt(
          OUTLINE_SYSTEM,
          `${user}\n\nIMPORTANT: respond with exactly ${beats.length} plain lines, one note per line, nothing else. Each line must be about a different thing — do not reuse a name, title or person across lines.`,
          0.6,
          opts,
        ),
      );
      if (defects(retry) < defects(best)) best = retry;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      console.warn('[Shorts] Outline retry failed; using the first attempt.', e);
    }
  }

  // A near-complete outline is still useful; fitToCount handles the shortfall.
  if (enough(best)) return fitToCount(best, beats.length);

  console.warn('[Shorts] Outline pass returned too few beats; falling back to role-only beats.');

  // Deterministic fallback: the narration pass still gets its skeleton, just
  // without researched content, which is exactly the old behaviour.
  return beats.map((beat) => `${beat.brief}, about ${req.topic}`);
};

const NARRATION_SYSTEM = `You write voiceover scripts for highly engaging, viral short-form vertical videos (TikTok, Reels, YouTube Shorts).

You are given a beat plan. Turn it into spoken lines. You keep the facts and choose how they land.

Rules you must follow exactly:
- Output ONLY the narration lines. NEVER include any preamble, explanations, reasoning, numbering, markdown, scene labels, or quotes.
- One line per beat, in the same order. Each line is one complete spoken sentence.
- Every line must carry the concrete detail from its beat — the number, name, place, date, or comparison. A line with no specific in it is a failed line.
- Never restate the previous line. Every line moves forward.
- Line 1 is the INTRO. It states plainly what the video is about — name the subject — and it hooks. Short, hard, no wind-up, no throat-clearing.
- When a beat is a list entry, the line must NAME that entry, and every entry must be a DIFFERENT thing. Never attach the same name, person, show, or place to more than one entry.
- Every line is a complete spoken sentence with a verb. A bare title, a name on its own, or a fragment is a failed line.
- Do not copy a beat note word for word. Rewrite it as something a person says out loud.
- The last line lands the payoff or the consequence, and it stops. Do not trail off.
- Vary sentence length on purpose. Never open two lines the same way.
- Speak to the viewer: second person, present tense, active voice, contractions.
- NEVER open a line with these dead phrases: "Did you know", "You won't believe", "Buckle up", "Here's the kicker", "Let's dive in", "Let's talk about", "Stay tuned", "In this video", "Welcome back", "Imagine this", "Picture this", "Get ready".
- Write words a narrator says out loud. No stage directions, no emoji, no hashtags, no sound effects.
- Stay factually accurate. Do not invent statistics.`;

const generateNarrationLines = async (
  req: ShortsScriptRequest,
  beats: Beat[],
  outline: string[],
  opts: ShortsScriptOptions,
): Promise<string[]> => {
  const sceneCount = beats.length;
  const wordsPerScene = Math.max(9, Math.round((req.targetDurationSec / sceneCount) * WORDS_PER_SECOND));

  /**
   * Per-line word budgets, not one flat number. An opener the same length as a
   * body line is the clearest tell of an AI-written short — real ones open fast
   * and close hard. The intro gets a little extra room because it has to name
   * the subject as well as hook.
   */
  const introWords = Math.max(6, Math.min(10, wordsPerScene + 2));
  const payoffWords = Math.max(5, Math.min(10, wordsPerScene));

  const budgetFor = (role: BeatRole): string => {
    if (role === 'INTRO') return `at most ${introWords} words`;
    if (role === 'PAYOFF') return `at most ${payoffWords} words`;
    return `about ${wordsPerScene} words`;
  };

  const beatPlan = outline
    .map((note, i) => `${i + 1}. [${beats[i].role}, ${budgetFor(beats[i].role)}] ${note}`)
    .join('\n');

  const user = `Topic: ${req.topic}

Beat plan for a ${req.targetDurationSec}-second video. Write one narration line per beat, in order:

${beatPlan}

Tone: ${TONE_GUIDANCE[req.tone]}
Respect each beat's word budget — the intro is short and the payoff is short; the middle lines run longer.
Line 1 is the INTRO: it must say plainly what this video is about — the subject "${req.topic}" named outright — and make it impossible to scroll past. Phrase it fresh for this exact topic.
Every ITEM beat must NAME its own entry, and the entries must all be different from each other. Never spend two ITEM beats on the same entry unless the beat says so, and never let one name or one entry take over the video.
Write full spoken sentences, not titles or fragments.

OUTPUT EXACTLY ${sceneCount} LINES AND NOTHING ELSE. NO PREAMBLE, NO EXPLANATIONS, NO REASONING.`;

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

  /**
   * Retry on quality, not just on emptiness. A script that parses cleanly but
   * opens on a cliché, repeats itself or ignores the word budgets used to sail
   * straight through; now it gets a second attempt and the better one wins.
   */
  const scoreOf = (candidate: string[]): number => scoreNarration(candidate, req.topic, sceneCount, wordsPerScene);
  const passMark = Math.ceil(sceneCount * 0.75);

  if (scoreOf(lines) < passMark) {
    opts.onStage?.('Sharpening the script...');
    try {
      const retry = await runPrompt(
        NARRATION_SYSTEM,
        `${user}

IMPORTANT: respond with ${sceneCount} plain lines separated by newlines. Nothing else.
Every line must contain a concrete specific from its beat. Do not open any line with a stock phrase, and do not open two lines the same way.`,
        0.7,
        opts,
      );
      const retried = parseAttempt(retry);
      if (scoreOf(retried) > scoreOf(lines)) lines = retried;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      console.warn('[Shorts] Narration retry failed; using the first attempt.', e);
    }
  }

  // Only a completely empty result is fatal — a short response gets padded by
  // fitToCount rather than throwing away a usable script.
  if (lines.length === 0) {
    throw new Error('The model could not produce a usable script. Try a different topic or a larger model.');
  }

  return fitToCount(lines, sceneCount);
};

/**
 * Deliberately says nothing about art style or framing — composeVisualPrompt
 * appends both afterwards. Asking the model for them too produced prompts with
 * the style listed twice, and with "wide-angle" framing on a vertical render.
 */
const IMAGE_PROMPT_SYSTEM = `You turn narration lines into text-to-image prompts. Each prompt becomes the single image on screen while that line is spoken.

Rules you must follow exactly:
- Output ONLY the prompts, one per line, in the same order as the input. No numbering, no markdown, no quotes, no commentary.
- Each prompt is a comma-separated list of visual nouns and adjectives describing ONE still image.
- ANCHOR ON THE LINE. Find the most concrete thing the line names — an animal, an object, a place, a machine, a moment in time — and make that thing the visible subject. If the line names it, the image shows it.
- If the line is abstract, pick a concrete physical stand-in drawn from the video's subject. Never a person at a desk, never a lightbulb, never a handshake, never a rising graph.
- Every image must be recognisably part of the same video about the stated subject.
- Change the camera distance and angle from the previous prompt — two neighbouring images must never be the same shot. When consecutive lines are about the same thing, keep that subject and change the view instead.
- Describe only what is SEEN. Never include spoken words, narration, quoted text, signage, or anything for the image to spell out.
- No people's real names, no logos, no watermarks.
- Do not name an art style, a film stock, a render engine, an aspect ratio, or a resolution — those are added afterwards.
- Give each prompt: subject, one telling detail, setting, light, camera distance.

Examples:
Narration: "Ninety percent of deep-sea species make their own light."
Prompt: lone anglerfish in black water, bioluminescent lure glowing pale blue, needle teeth catching the light, close-up, deep shadow

Narration: "In 1969, humanity took its first steps on the Moon."
Prompt: apollo boot pressing into grey lunar dust, sharp tread print, harsh white sunlight, black sky above, low close-up`;

/**
 * Prompts are requested in small batches. WebLLM caps every reply at 1024
 * tokens, so a 26-scene short asked for in one go truncates and the tail scenes
 * silently fall through to the keyword fallback.
 */
const IMAGE_PROMPT_BATCH = 6;

/** Build the user prompt for one batch, giving the whole script as context. */
const imagePromptUser = (
  narrationLines: string[],
  batch: { start: number; lines: string[] },
  req: ShortsScriptRequest,
): string => {
  const script = narrationLines.map((line, i) => `${i + 1}. ${line}`).join('\n');
  const asked = batch.lines.map((line, i) => `${batch.start + i + 1}. ${line}`).join('\n');

  return `Video subject: ${req.topic}

Full script, for context only:
${script}

Write exactly ${batch.lines.length} image prompts, one per line, for these lines and no others:

${asked}`;
};

const generateImagePrompts = async (
  narrationLines: string[],
  req: ShortsScriptRequest,
  opts: ShortsScriptOptions,
): Promise<string[]> => {
  opts.onStage?.('Designing the visuals...');

  const batches: Array<{ start: number; lines: string[] }> = [];
  for (let start = 0; start < narrationLines.length; start += IMAGE_PROMPT_BATCH) {
    batches.push({ start, lines: narrationLines.slice(start, start + IMAGE_PROMPT_BATCH) });
  }

  const best: string[] = [];

  // Sequential, not parallel: WebLLM is a single engine and resetChat()s per
  // call, so concurrent requests would interleave on the same context.
  for (const [batchIndex, batch] of batches.entries()) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (batches.length > 1) {
      opts.onStage?.(`Designing the visuals... (${batchIndex + 1}/${batches.length})`);
    }

    const user = imagePromptUser(narrationLines, batch, req);

    let candidates: string[] = [];
    try {
      candidates = toLines(await runPrompt(IMAGE_PROMPT_SYSTEM, user, 0.7, opts));
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      console.warn('[Shorts] Image prompt batch failed; deriving prompts from narration.', e);
    }

    // Retry this batch when it missed the line count or didn't produce enough
    // usable (non-echoed, non-thin, non-duplicate) prompts.
    if (scoreImagePrompts(candidates, batch.lines) < batch.lines.length) {
      try {
        const retry = toLines(
          await runPrompt(
            IMAGE_PROMPT_SYSTEM,
            `${user}\n\nIMPORTANT: respond with exactly ${batch.lines.length} plain lines, one prompt per line. Nothing else.`,
            0.6,
            opts,
          ),
        );
        if (scoreImagePrompts(retry, batch.lines) > scoreImagePrompts(candidates, batch.lines)) candidates = retry;
      } catch (e) {
        if (opts.signal?.aborted) throw e;
        console.warn('[Shorts] Image prompt batch retry failed; using first attempt.', e);
      }
    }

    best.push(...batch.lines.map((_, i) => candidates[i]?.trim() ?? ''));
  }

  // Fall back per line rather than discarding the whole batch: a weak or
  // echoed line at index i falls back to the keyword-derived prompt while
  // every other usable line still gets the LLM-authored one.
  return narrationLines.map((line, i) => {
    const candidate = best[i];
    return candidate && !isUnusable(candidate, line, best, i)
      ? composeVisualPrompt(candidate, req)
      : deriveImagePrompt(line, req.topic, req);
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

  const outline = await generateOutline(scoped, beats, opts);
  const narrationLines = await generateNarrationLines(scoped, beats, outline, opts);
  const imagePrompts = await generateImagePrompts(narrationLines, scoped, opts);

  return {
    title: deriveTitle(topic, narrationLines[0] ?? ''),
    scenes: narrationLines.map((narration, i) => ({
      narration,
      imagePrompt: imagePrompts[i] ?? deriveImagePrompt(narration, topic, scoped),
    })),
  };
};

/** Regenerate a single scene's image prompt without re-running the whole script. */
export const regenerateImagePrompt = async (
  narration: string,
  req: Pick<ShortsScriptRequest, 'topic'> & VisualPromptContext,
  opts: ShortsScriptOptions = {},
): Promise<string> => {
  const user = `Video subject: ${req.topic}\n\nWrite ONE image prompt for this narration line:\n${narration}`;

  const attempt = async (temperature: number, extra = ''): Promise<string | null> => {
    try {
      const raw = await runPrompt(IMAGE_PROMPT_SYSTEM, `${user}${extra}`, temperature, opts);
      const [first] = toLines(raw);
      if (first && !isEchoed(first, narration) && !isWeak(first) && !isExampleEcho(first) && !RENDERS_TEXT.test(first)) {
        return first;
      }
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      console.warn('[Shorts] Image prompt regeneration attempt failed.', e);
    }
    return null;
  };

  const first = await attempt(0.95);
  if (first) return composeVisualPrompt(first, req);

  const retry = await attempt(0.7, '\n\nIMPORTANT: respond with exactly ONE line, nothing else.');
  if (retry) return composeVisualPrompt(retry, req);

  return deriveImagePrompt(narration, req.topic, req);
};

const EXTEND_NARRATION_SYSTEM = `You extend one line of a short-form video voiceover script with more supporting detail, without rewriting what's already there.

Rules you must follow exactly:
- Output ONLY the new sentences to append after the existing line. Do not repeat, rephrase or summarize the existing line.
- Add 2-3 new spoken sentences. Every one must carry a concrete detail the existing line doesn't already have — a number, name, place, date, mechanism, or comparison. A sentence with no specific in it is a failed sentence.
- Continue in the same voice, tense and person as the existing line, and keep it flowing as if it were always one passage.
- Never contradict the existing line.
- Do not open with a stock phrase: "Did you know", "Here's the thing", "And get this", "Buckle up", "Here's the kicker", "Believe it or not".
- Write words a narrator says out loud. No stage directions, no emoji, no hashtags, no quotes.
- Stay factually accurate. Do not invent statistics.`;

/**
 * Extend one scene's narration in place by appending a few more spoken
 * sentences of concrete detail, rather than replacing it.
 *
 * Mirrors regenerateImagePrompt's shape (single call, one retry, throw on
 * total failure) but there is no deterministic fallback here — unlike an
 * image prompt, fabricated narration detail would be a factual claim, so a
 * failed extension has to surface as an error rather than silently degrade.
 */
export const extendNarration = async (
  narration: string,
  req: Pick<ShortsScriptRequest, 'topic' | 'tone'>,
  opts: ShortsScriptOptions = {},
): Promise<string> => {
  const trimmed = narration.trim();
  if (!trimmed) throw new Error('Write or generate a narration line first.');

  const user = `Video topic: ${req.topic}
Tone: ${TONE_GUIDANCE[req.tone]}

Existing narration line (do not repeat or rewrite it):
"${trimmed}"

Write 2-3 additional spoken sentences that continue directly from it, each adding a new concrete detail. Output only the new sentences, nothing else.`;

  const attempt = async (temperature: number, extra = ''): Promise<string | null> => {
    try {
      const raw = await runPrompt(EXTEND_NARRATION_SYSTEM, `${user}${extra}`, temperature, opts);
      const addition = toLines(raw).map(normalizeNarrationLine).filter((line) => line.length > 1).join(' ');
      if (addition && !isEchoed(addition, trimmed)) return addition;
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      console.warn('[Shorts] Narration extension attempt failed.', e);
    }
    return null;
  };

  const first = await attempt(0.85);
  if (first) return `${trimmed} ${first}`;

  const retry = await attempt(0.7, '\n\nIMPORTANT: respond with 2-3 plain spoken sentences only. Nothing else.');
  if (retry) return `${trimmed} ${retry}`;

  throw new Error('Could not extend this line. Try again, or add detail by hand.');
};
