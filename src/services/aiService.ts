import { generateWebLLMResponse, isWebLLMLoaded } from './webLlmService';

interface LLMSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  useWebLLM?: boolean;
  webLlmModel?: string;
}

/**
 * Expands common TTS-hostile symbols into their spoken equivalents
 */
const expandTTSSymbols = (text: string): string => {
  const replacements: [RegExp, string][] = [
    [/\s\+\s/g, ' plus '],           // + → plus
    [/\s&\s/g, ' and '],             // & → and
    [/\s@\s/g, ' at '],              // @ → at
    [/\s%\s/g, ' percent '],         // % → percent
    [/\$\s?/g, ' dollars '],         // $ → dollars
    [/=/g, ' equals '],              // = → equals
  ];

  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
};

/**
 * Splits text into sentences, handling fragments without punctuation
 */
const splitIntoSentences = (text: string): string[] => {
  const sentences: string[] = [];

  // First split by newlines to respect structural breaks
  const lines = text.split(/\n+/);

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Split line by sentence-ending punctuation followed by space
    const chunks = trimmedLine.split(/(?<=[.!?])\s+/);

    for (const chunk of chunks) {
      if (!chunk.trim()) continue;

      // Apply heuristic if there's no terminal punctuation in the chunk
      if (!/[.!?]$/.test(chunk.trim())) {
        // Split on capital letters that might indicate new sentences
        const parts = chunk.split(/(?<=[a-z])\s+(?=[A-Z])/);
        sentences.push(...parts.map(p => p.trim()).filter(Boolean));
      } else {
        sentences.push(chunk.trim());
      }
    }
  }

  return sentences;
};

const cleanLLMResponse = (text: string): string => {
  let cleaned = text.trim();

  // Remove common conversational prefixes
  const prefixes = [
    /^Here is the (transformed )?text:?\s*/i,
    /^Here is the (transformed )?script:?\s*/i,
    /^Transformed text:?\s*/i,
    /^Output:?\s*/i,
    /^Sure,? here is (the )?(transformed )?(text|script)( you requested)?:?\s*/i,
    /^Okay,? here is (the )?(transformed )?text:?\s*/i
  ];

  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, '');
  }

  // Remove markdown code blocks if present (handle both with and without language specifiers)
  cleaned = cleaned.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');

  // Remove other markdown formatting
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, '$1'); // Bold **text**
  cleaned = cleaned.replace(/\*(.+?)\*/g, '$1'); // Italic *text*
  cleaned = cleaned.replace(/`(.+?)`/g, '$1'); // Inline code `text`
  cleaned = cleaned.replace(/__(.+?)__/g, '$1'); // Bold __text__
  cleaned = cleaned.replace(/_(.+?)_/g, '$1'); // Italic _text_
  cleaned = cleaned.replace(/~~(.+?)~~/g, '$1'); // Strikethrough
  cleaned = cleaned.replace(/^#{1,6}\s+/gm, ''); // Headers ###

  // Remove markdown links but keep the text [text](url) -> text
  cleaned = cleaned.replace(/\[(.+?)\]\(.+?\)/g, '$1');

  // Remove list markers but keep content
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, '');
  cleaned = cleaned.replace(/^[\s]*\d+\.\s+/gm, '');

  // Re-trim after prefix removal
  cleaned = cleaned.trim();

  // Remove wrapping quotes if they appear on both ends
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.substring(1, cleaned.length - 1);
  }

  // NEW: Expand TTS-hostile symbols
  cleaned = expandTTSSymbols(cleaned);

  // NEW: Enhanced sentence boundary detection and punctuation
  const sentences = splitIntoSentences(cleaned);

  // Apply punctuation and capitalization
  const finalSentences = sentences.map(sentence => {
    let s = sentence.trim();
    if (!s) return '';

    // Ensure first letter is capitalized
    if (s[0] && s[0] === s[0].toLowerCase()) {
      s = s.charAt(0).toUpperCase() + s.slice(1);
    }

    // Add period if no terminal punctuation
    if (!/[.!?]$/.test(s)) {
      s = s + '.';
    }

    return s;
  }).filter(Boolean);

  return finalSentences.join(' ');
};

/* Shared System Prompt for both WebLLM and Remote API */
export const DEFAULT_SYSTEM_PROMPT = `You are a professional voice-over scriptwriter. Your job is to transform fragmented, messy slide text (bullet points, short titles, isolated metrics) into a flowing, continuous narrative script intended to be read aloud by a Text-to-Speech (TTS) engine.

DO NOT JUST OUTPUT A LIST OF REFORMATTED BULLET POINTS OR FRAGMENTS. You must combine the ideas into a conversational paragraph that tells a story. Combine fragments into smooth sentences with connecting words ("Additionally,", "Next, we see that...", "Furthermore,").

CRITICAL RULE: STRICT SENTENCE BOUNDARIES
- EVERY SINGLE SENTENCE MUST end with a period (.). If you do not add periods, the TTS engine will not pause.
- THE VERY FIRST SENTENCE (the title or intro) MUST end with a period.
- Keep your sentences short, conversational, and digestible.
- Break long lists or complex ideas into multiple short, standalone sentences, each ending with a hard period (.).
- Use commas (,) within sentences to force natural mid-sentence breathing pauses.

Style and Tone Guidelines:
- Write exactly what the TTS should speak. Write as a continuous speech or narrative, like a podcast or a video voice-over.
- Start with a strong introductory phrase. e.g., "Welcome to this slide on [Topic]." or "Let's discuss [Topic]."
- Tie the fragmented concepts together. Instead of saying "Feature A. Feature B." say "First, we have Feature A. This is followed by Feature B."
- Never hallucinate facts. Stick to the provided input.

Mandatory TTS Formatting Rules:

1. Phonetics and Acronyms: Write for the EAR, not the EYE.
   - Separate acronyms with spaces: "A P I", "U S A", "A W S", "C E O".
   - Spell out large numbers if clarity is needed ("one thousand two hundred").

2. Abbreviation Expansion: Spell out all technical abbreviations.
   - "MiB/s" -> "mebibytes per second", "GB" -> "gigabytes", "vs." -> "versus", "etc." -> "et cetera", "&" -> "and".

3. URLs and Web Addresses: Expand URLs into spoken words, ignoring the https part if it's too long, or spell it out.
   - "example.com" -> "example dot com"
   - "github.com/user" -> "github dot com slash user"

4. Terminal Commands:
   - Spell out spaces and punctuation: "$ npm install ." -> "Type npm install space period."

5. Punctuation for TTS:
   - YOU MUST USE PERIODS. A TTS reads text literally. Every thought must end in a '.'.

Output Constraints:
- Output only the final voice-over script transcript.
- No Markdown (no **, no code blocks, no # headers, no bullet points).
- No conversational filler ("Here is the script:"). 

Example Input:
"Install VS Code Windows 10/11 ~5 Mins Free Download: code.visualstudio.com"

Example Output:
Welcome to this guide on how to install Visual Studio Code. This process works on both Windows 10 and Windows 11. It should take you approximately 5 minutes. The software works as a free download. You can get it by navigating to code dot visualstudio dot com.`;

export const transformText = async (settings: LLMSettings, text: string, customSystemPrompt?: string): Promise<string> => {
  const systemPrompt = customSystemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

  const userPrompt = `Slide Content:
"${text}"

Write a continuous, flowing narration script for the above content. Ensure every sentence ends with a period. Do not output a list of bullet points.`;

  if (settings.useWebLLM) {
    if (!settings.webLlmModel) {
      throw new Error("WebLLM is enabled but no model is selected.");
    }

    // Check if WebLLM is already initialized (it should be from the setup modal)
    if (!isWebLLMLoaded()) {
      throw new Error("WebLLM is not initialized. Please load a model in Settings (WebLLM tab) first.");
    }

    try {
      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userPrompt }
      ];

      console.log("[AI Service] Sending request to WebLLM...", { model: settings.webLlmModel, promptLength: userPrompt.length });
      const response = await generateWebLLMResponse(messages);
      console.log("[AI Service] Raw WebLLM Response:", response);

      const cleaned = cleanLLMResponse(response);
      console.log("[AI Service] Cleaned Response:", cleaned);
      return cleaned;
    } catch (error) {
      console.error("WebLLM Error in aiService:", error);
      throw error;
    }
  }

  let endpoint = settings.baseUrl;
  // Ensure we hit the chat completions endpoint if not provided
  if (!endpoint.endsWith('/chat/completions')) {
    // Remove trailing slash if present
    endpoint = endpoint.replace(/\/+$/, '');
    endpoint = `${endpoint}/chat/completions`;
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Failed to generate content: ${response.statusText}`);
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content || '';

    return cleanLLMResponse(textContent);
  } catch (error) {
    console.error('LLM API Error:', error);
    throw error;
  }
};
