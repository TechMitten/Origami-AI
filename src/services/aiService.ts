import { generateWebLLMResponse, isWebLLMLoaded, getCurrentWebLLMModel } from './webLlmService';

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
  // Common abbreviations that should NOT end a sentence
  const abbreviations = /\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Ave|Blvd|Rd|U\.S\.A|U\.S|U\.K|E\.U|etc|vs|e\.g|i\.e)\.?$/i;

  // First, try to split on existing punctuation
  const withPunctuation: string[] = [];
  const withoutPunctuation: string[] = [];

  text.split(/(?<=[.!?])\s+/).forEach(chunk => {
    if (/[.!?]$/.test(chunk)) {
      withPunctuation.push(chunk);
    } else if (chunk.trim()) {
      withoutPunctuation.push(chunk);
    }
  });

  // For chunks without punctuation, apply heuristics
  const processed = withoutPunctuation.flatMap(chunk => {
    // Split on capital letters that might indicate new sentences
    // (e.g., "Title Here Subtitle Here" → "Title Here", "Subtitle Here")
    const parts = chunk.split(/(?<=[a-z])\s+(?=[A-Z])/);

    // If that didn't split anything, keep the chunk as-is
    if (parts.length === 1) return [chunk];

    return parts.map(p => p.trim()).filter(Boolean);
  });

  return [...withPunctuation, ...processed].filter(Boolean);
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
export const DEFAULT_SYSTEM_PROMPT = `You are an expert scriptwriter specializing in creating conversational scripts for Text-to-Speech (TTS) presentations. Your task is to transform fragmented text extracted from PDF slides—including titles, bullet points, and metadata—into a complete, natural-sounding spoken presentation.

CRITICAL RULE: STRICT SENTENCE BOUNDARIES
Slide text, headers, and bullet points almost never have ending punctuation. You MUST add periods (.) at the end of every single complete thought.
- THE VERY FIRST SENTENCE (the title sentence) MUST end with a period. Never omit this.
- If you do not add periods, the TTS engine will not pause and will read the entire slide as one breathless, run-on sentence.
- Keep your sentences short and digestible.
- Break long lists or complex ideas into multiple short sentences, each ending with a hard period (.).
- Use commas (,) frequently within sentences to force natural mid-sentence breathing pauses.

Style and Tone Guidelines:
- Write in a conversational, engaging, and professional style.
- Use natural transitions and signposting phrases. Start new sentences with phrases like:
  - "Welcome..." or "Let's begin by..."
  - "As you can see..." or "Notice how..."
  - "Let's explore..." or "Now we'll look at..."
  - "This is important because..."
  - "In other words..." or "To put it simply..."
- Connect fragmented text into coherent, flowing sentences. Add connecting words to "fill in the blanks" and create a smooth narrative arc.
- Never hallucinate new facts. Stick strictly to the information provided in the input text.

Mandatory TTS Formatting Rules:

1. Abbreviation Expansion: Spell out all technical abbreviations and symbols into their full spoken forms.
   - "MiB/s" -> "mebibytes per second"
   - "GB" -> "gigabytes"
   - "vs." -> "versus"
   - "etc." -> "et cetera"
   - "&" -> "and"

2. URLs and Web Addresses: Always expand URLs into their exact spoken equivalents, spelling out punctuation.
   - Replace "://" with "colon slash slash".
   - Replace "/" with "slash" or "forward slash".
   - Replace "." with "dot".
   - "https://example.com" -> "h t t p s colon slash slash example dot com"
   - "github.com/user/repo" -> "github dot com slash user slash repo"

3. Terminal Commands: Explain commands clearly as instructions in their own separate sentences.
   - Ignore leading prompt symbols like "$", ">", or "%".
   - Spell out spaces and punctuation marks so the listener knows exactly what to type.
   - "$ git commit -m 'msg'" -> "Type git commit space dash m, then include your message in quotes."
   - "$ npm install ." -> "Type npm install space period."

4. Email Addresses: Spell out the at sign and dots.
   - "user@example.com" -> "user at example dot com"

Output Constraints:
- Raw Text Only: Output the final script as plain text.
- No Conversational Filler: Do not include introductory or concluding remarks like "Here is the script" or "Let me know if you need anything else."
- No Markdown: Do not use code blocks, bold text (**), italic text (*), headers (#), or quotation marks around the final output.

Example Input:
"How to Install Visual Studio Code on Windows A Complete Beginner's Guide Step-by-Step Instructions for First-Time Users Windows 10/11 ~5 Minutes Free & Open Source Download: [https://code.visualstudio.com](https://code.visualstudio.com) Download size: 85 MiB $ npm install ."

Example Output:
Welcome to this guide on How to Install Visual Studio Code on Windows. This is a complete beginner's guide. It provides step-by-step instructions designed especially for first-time users. As we will see, this process works for both Windows 10 and Windows 11 operating systems. It should only take about 5 minutes of your time. Visual Studio Code is a free and open-source tool. You can download it by visiting h t t p s colon slash slash code dot visualstudio dot com. The download size is approximately 85 mebibytes. Once you have it set up, you can install dependencies. To do this, open your terminal and type npm install space period. Let's begin.`;

export const transformText = async (settings: LLMSettings, text: string, customSystemPrompt?: string): Promise<string> => {
  const systemPrompt = customSystemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

  const userPrompt = `Slide Content (full text extracted from the slide):
"${text}"

Read all of the above content. Start the narration with the slide's title/topic. End EVERY sentence — including the very first title sentence — with a period. Then present the rest of the content as complete sentences, each ending with a period.`;

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
