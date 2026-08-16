/**
 * Caption timing for Shorts.
 *
 * Kokoro exposes no word-level timestamps — only the finished WAV — so word
 * timings are ESTIMATED by distributing the measured clip duration across the
 * words proportionally to how long each takes to say. Longer words and words
 * followed by punctuation get more of the budget.
 *
 * This is approximate by construction. It tracks the voice closely enough for
 * karaoke highlighting, which is what the burned-in captions need.
 */

export interface CaptionWord {
  text: string;
  /** Seconds from the start of this scene. */
  start: number;
  end: number;
}

export interface CaptionChunk {
  words: CaptionWord[];
  start: number;
  end: number;
  /** Pre-joined text, so the renderer does not re-join on every frame. */
  text: string;
}

const MAX_WORDS_PER_CHUNK = 4;
const MAX_CHARS_PER_CHUNK = 24;

/** Relative "time cost" of speaking a word. */
const weighWord = (word: string): number => {
  // Letters dominate; a two-unit floor keeps "a"/"I" from flashing past.
  let weight = Math.max(2, word.replace(/[^\p{L}\p{N}]/gu, '').length);

  // Speakers pause at punctuation, so the preceding word holds the screen longer.
  if (/[,;:]$/.test(word)) weight += 2;
  if (/[.!?]$/.test(word)) weight += 4;
  if (/[—–-]$/.test(word)) weight += 2;

  return weight;
};

/**
 * Split narration into timed word groups spanning exactly `durationSec`.
 * Returns [] for empty narration or a non-positive duration.
 */
export const buildCaptionTimings = (narration: string, durationSec: number): CaptionChunk[] => {
  const words = narration.trim().split(/\s+/).filter(Boolean);
  if (!words.length || !(durationSec > 0)) return [];

  const weights = words.map(weighWord);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) return [];

  // Walk the words once, assigning each a slice of the duration.
  const timed: CaptionWord[] = [];
  let cursor = 0;
  words.forEach((text, i) => {
    const span = (weights[i] / totalWeight) * durationSec;
    timed.push({ text, start: cursor, end: cursor + span });
    cursor += span;
  });

  // Absorb float drift so the last word ends exactly on the clip boundary.
  if (timed.length) timed[timed.length - 1].end = durationSec;

  // Group into readable chunks, breaking early on sentence-ending punctuation.
  const chunks: CaptionChunk[] = [];
  let current: CaptionWord[] = [];
  let currentChars = 0;

  const flush = () => {
    if (!current.length) return;
    chunks.push({
      words: current,
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.text).join(' '),
    });
    current = [];
    currentChars = 0;
  };

  for (const word of timed) {
    const wouldExceed =
      current.length >= MAX_WORDS_PER_CHUNK ||
      (current.length > 0 && currentChars + word.text.length + 1 > MAX_CHARS_PER_CHUNK);

    if (wouldExceed) flush();

    current.push(word);
    currentChars += word.text.length + (current.length > 1 ? 1 : 0);

    // A sentence break is a natural place to swap the card.
    if (/[.!?]$/.test(word.text)) flush();
  }

  flush();
  return chunks;
};

/** The chunk visible at `time` (seconds into the scene), or null between chunks. */
export const chunkAt = (chunks: CaptionChunk[], time: number): CaptionChunk | null => {
  for (const chunk of chunks) {
    if (time >= chunk.start && time < chunk.end) return chunk;
  }
  return null;
};
