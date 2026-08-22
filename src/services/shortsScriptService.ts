import { ensureWebLLMReady, generateWebLLMResponse } from './webLlmService';
import { cleanLLMResponse, postChatCompletions, type ChatMessage, type LLMSettings } from './aiService';
import type { ShortsAspect } from './ShortsVideoRenderer';

/**
 * Script generation for Shorts.
 *
 * The narration pass asks the model for a line list (one NOTE + one
 * NARRATION line per beat) rather than one nested JSON blob. A 2B-class local
 * model (the WebLLM default) emits well-formed line lists far more reliably
 * than it emits well-formed JSON, and a malformed blob costs the whole
 * generation. It has a deterministic fallback so the flow never dead-ends on
 * a weak model. Image prompts are not model-written at all — see
 * narrationToImagePrompt.
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
 * in more, shorter-held cuts at the cost of thinner narration per line, and at
 * 4.5s the budget worked out at roughly eleven words: one bare sentence per
 * scene, which reads as a caption rather than as narration. 7.5s buys about
 * twenty — a claim plus the detail that backs it up — while still cutting
 * often enough that nothing sits on screen for long. Video-clip scenes loop
 * their clip to fill the extra time (see drawSceneImage).
 */
const SECONDS_PER_SCENE = 7.5;
const MIN_SCENES = 3;
/**
 * Above both what the 90s duration preset needs (90s / 7.5s = 12 scenes) and
 * the largest list skeleton (12 entries + intro + payoff) — this is a safety
 * ceiling for list topics whose item count pushes the scene count past the
 * duration-derived value (see buildBeats).
 */
const MAX_SCENES = 16;

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

/**
 * The floor on any line's word budget: what a spoken sentence carrying one
 * concrete detail costs. Below it a pass is being asked for a fragment, and a
 * list topic with many entries would otherwise drive the budget there.
 */
const MIN_WORDS_PER_SCENE = 12;

interface WordBudgets {
  /** Every beat between the intro and the payoff — where the substance goes. */
  body: number;
  intro: number;
  payoff: number;
}

/**
 * How the runtime is divided between the lines, shared by the outline and
 * narration passes so the notes carry enough material for the lines written
 * from them.
 *
 * Not an even split: an opener as long as a body line is the clearest tell of
 * an AI-written short, and a payoff that runs on stops landing. Both are held
 * to one tight sentence — and the runtime that frees up is handed to the body
 * beats rather than lost, so the finished script still fills the duration the
 * user asked for instead of coming in under it.
 */
const wordBudgets = (targetDurationSec: number, sceneCount: number): WordBudgets => {
  const evenShare = Math.max(MIN_WORDS_PER_SCENE, Math.round((targetDurationSec / sceneCount) * WORDS_PER_SECOND));
  const intro = Math.max(6, Math.min(12, Math.round(evenShare * 0.6)));
  const payoff = Math.max(5, Math.min(12, Math.round(evenShare * 0.55)));
  const bodyBeats = Math.max(1, sceneCount - 2);
  const body = Math.max(
    MIN_WORDS_PER_SCENE,
    Math.round((targetDurationSec * WORDS_PER_SECOND - intro - payoff) / bodyBeats),
  );

  return { body, intro, payoff };
};

/** How many sentences a word budget is actually asking for. */
const sentenceBudget = (words: number): string => {
  if (words >= 34) return '3 to 4 sentences';
  if (words >= 24) return '2 to 3 sentences';
  if (words >= 16) return '2 sentences';
  return 'one sentence';
};

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
 * Text-suppression tail appended to every visual prompt.
 *
 * Bare "no text" negations are largely ignored by image models; enumerating
 * the concrete forms (letters, signage, captions, UI) plus a positive
 * restatement ("a purely visual, textless image") suppresses far more
 * reliably.
 */
const TEXTLESS_CLAUSE =
  'no text, no words, no letters, no numbers, no typography, no captions, no subtitles, no signage, no logos, no watermarks, no speech bubbles, no user interface — a purely visual, textless image';

/**
 * Build the final prompt sent to Pollinations from a subject string.
 *
 * The style is applied here and ONLY here, so callers never need to bake a
 * second copy of it into the subject they pass in.
 */
export const composeVisualPrompt = (subject: string, req: VisualPromptContext): string =>
  [subject.trim().replace(/[.\s]+$/, ''), framingClause(req), req.visualStyle, TEXTLESS_CLAUSE]
    .filter(Boolean)
    .join(', ');

/**
 * The image prompt is seeded by the FIRST THREE WORDS of the voiceover line,
 * wrapped in a fixed instruction — no LLM call writes it. Replaces the
 * model-authored "subject" that used to feed composeVisualPrompt.
 *
 * Only the opening words are used because feeding the full narration line
 * gave the image model enough verbatim material to render it as text inside
 * the image; three words anchor the subject without inviting transcription.
 * They are embedded bare, never quoted: quoted strings are another big
 * trigger for diffusion models rendering the quoted words INTO the image.
 */
const narrationToImagePrompt = (narration: string): string => {
  const seed = narration.trim().replace(/\s+/g, ' ').split(' ').slice(0, 3).join(' ');
  return `Depict the following moment as one striking, purely visual scene told entirely through subject, composition, lighting and color — never through written or printed words: ${seed}. The scene must remain completely textless.`;
};
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

/**
 * Deal a sentence list into `count` scenes, in order.
 *
 * The prose fallback used to hand the sentences straight to fitToCount, which
 * keeps the first `count` of them — so a model that answered in a paragraph
 * lost most of its script and left every scene holding a single sentence. Every
 * sentence now lands in a scene instead. Spare sentences go to the body beats
 * first: the intro and the payoff are meant to be one line each.
 */
const groupSentences = (sentences: string[], count: number): string[] => {
  if (count <= 0 || sentences.length <= count) return sentences;

  const sizes = new Array<number>(count).fill(Math.floor(sentences.length / count));
  let extra = sentences.length % count;
  // Body beats first (1 .. count - 2), then wrap round to the intro and payoff.
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

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those',
  'as', 'by', 'not', 'you', 'your', 'they', 'their', 'we', 'our', 'can', 'will', 'just',
  'has', 'have', 'had', 'what', 'which', 'when', 'how', 'why', 'about', 'into', 'than', 'then',
]);

/** True when a candidate image prompt is just the narration line repeated back. */
const isEchoed = (candidate: string, narrationLine: string): boolean =>
  candidate.trim().toLowerCase() === narrationLine.trim().toLowerCase();

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

/**
 * Count the narration lines that are actually usable. Drives the retry: a
 * script can be perfectly well-formed and still be clichéd, repetitive or
 * badly paced, and those never used to trigger a second attempt.
 *
 * The intro and payoff caps are the same budgets the prompt handed those two
 * lines, passed in rather than fixed here so the two can never disagree — and
 * so the deliberately short payoff is not scored against the body-line floor.
 */
const scoreNarration = (
  lines: string[],
  topic: string,
  sceneCount: number,
  wordsPerScene: number,
  hookMaxWords: number,
  payoffMaxWords: number,
): number => {
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
      if (words > hookMaxWords) return score;
    } else if (i === lines.length - 1) {
      // The payoff is capped, not floored: landing it in five words is the point.
      if (words > payoffMaxWords * 1.5) return score;
    } else if (words > wordsPerScene * 1.8 || words < wordsPerScene * 0.7) {
      // Below the floor the line stopped at the bare claim — a caption, not the
      // explanation the beat was budgeted for. Above it, the line overruns.
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

// Removed OUTLINE_SYSTEM and generateOutline as they are now merged into NARRATION_SYSTEM

const NARRATION_SYSTEM = `You write voiceover scripts for highly engaging, viral short-form vertical videos (TikTok, Reels, YouTube Shorts).

You are given a beat plan. You must plan the facts and write the spoken lines.

Rules you must follow exactly:
- For EACH beat, you must output EXACTLY two lines: a NOTE line and a NARRATION line.
- The NOTE line must start with "NOTE: " and contain the concrete facts (numbers, names, dates) you will use for that beat. For list entries, name the specific entry here.
- The NARRATION line must start with "NARRATION: " and contain the spoken voiceover.
- Never output any other text. No preamble, no markdown, no empty lines between beats.

Narration Rules:
- One NARRATION line per beat. A line is one beat's whole voiceover and may run to several sentences — write them on the SAME line, separated by spaces.
- Spend the word budget. Say the thing, then explain it.
- Every NARRATION line must carry the concrete details from its NOTE.
- Never restate the previous line.
- Line 1 is the INTRO. State plainly what the video is about and hook the viewer. Short, hard, no wind-up.
- When a beat is a list entry, the line must NAME that entry, and every entry must be a DIFFERENT thing. Never attach the same name to more than one entry.
- The last line lands the payoff and stops.
- Speak to the viewer: second person, present tense, active voice, contractions.
- NEVER open a line with dead phrases: "Did you know", "You won't believe", "Let's dive in".
- Write words a narrator says out loud. No stage directions.
- Stay factually accurate.

CRITICAL: You MUST use a <think>...</think> block to plan your response before outputting the requested lines. After the </think> tag, output ONLY the requested NOTE and NARRATION lines.`;

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
    if (role === 'INTRO') return `one sentence, at most ${introWords} words`;
    if (role === 'PAYOFF') return `one sentence, at most ${payoffWords} words`;
    return `${sentenceBudget(wordsPerScene)}, about ${wordsPerScene} words`;
  };

  const beatPlan = beats
    .map((beat, i) => `${i + 1}. [${beat.role}, ${budgetFor(beat.role)}] ${beat.brief}`)
    .join('\n');

  const user = `Topic: ${req.topic}

Beat plan for a ${req.targetDurationSec}-second video. Write one NOTE line and one NARRATION line per beat, in order:

${beatPlan}

Tone: ${TONE_GUIDANCE[req.tone]}
Respect each beat's word budget — the intro is one short sentence and the payoff is one short sentence; every beat in between gets ${sentenceBudget(wordsPerScene)} on ONE line.
Line 1 is the INTRO: it must say plainly what this video is about — the subject "${req.topic}" named outright.
Every ITEM beat must NAME its own entry, and the entries must all be different from each other.
Write full spoken sentences, not titles or fragments.

OUTPUT EXACTLY ${sceneCount * 2} LINES AFTER YOUR <think> BLOCK. NO PREAMBLE.`;

  opts.onStage?.('Writing the script...');

  /**
   * Parse one model response into narration lines.
   */
  const parseAttempt = (raw: string): string[] => {
    const rawLines = toLines(raw);
    let lines = rawLines
      .filter((l) => l.toUpperCase().startsWith('NARRATION:'))
      .map((l) => l.replace(/^NARRATION:\s*/i, ''));

    // Fallback if the model didn't use the NARRATION: prefix properly
    if (lines.length < Math.max(2, Math.floor(sceneCount / 2))) {
      lines = rawLines.filter((l) => !l.toUpperCase().startsWith('NOTE:'));
    }

    if (lines.length < Math.max(2, Math.floor(sceneCount / 2))) {
      const sentences = splitIntoSentences(stripWrapper(raw).replace(/\s*\n\s*/g, ' '));
      if (sentences.length > lines.length) {
        lines = groupSentences(sentences.map(stripLineDecoration), sceneCount);
      }
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

  const scoreOf = (candidate: string[]): number =>
    scoreNarration(candidate, req.topic, sceneCount, wordsPerScene, introWords, payoffWords);
  const passMark = Math.ceil(sceneCount * 0.75);

  if (scoreOf(lines) < passMark) {
    opts.onStage?.('Sharpening the script...');
    try {
      const retry = await runPrompt(
        NARRATION_SYSTEM,
        `${user}\n\nIMPORTANT: output exactly two lines per beat (NOTE: and NARRATION:). Every line must hit its word budget and contain concrete specifics. Do not open any line with a stock phrase.`,
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

  return {
    title: deriveTitle(topic, narrationLines[0] ?? ''),
    scenes: narrationLines.map((narration) => ({
      narration,
      imagePrompt: composeVisualPrompt(narrationToImagePrompt(narration), scoped),
    })),
  };
};

/**
 * Recompute a single scene's image prompt from its current narration —
 * deterministic, so this just reapplies narrationToImagePrompt rather than
 * calling a model.
 */
export const regenerateImagePrompt = (
  narration: string,
  req: Pick<ShortsScriptRequest, 'topic'> & VisualPromptContext,
): string => composeVisualPrompt(narrationToImagePrompt(narration), req);

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
