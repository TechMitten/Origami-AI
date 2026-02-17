import { generateWebLLMResponse, isWebLLMLoaded } from './webLlmService';

interface LLMSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  useWebLLM?: boolean;
  webLlmModel?: string;
}


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

  return cleaned.trim();
};

/* Shared System Prompt for both WebLLM and Remote API */
export const DEFAULT_SYSTEM_PROMPT = `You are creating a conversational script for Text-to-Speech presentation. Transform the following slide text into a complete, natural spoken presentation.

Write in a conversational, engaging style. Use natural transitions and phrases like:
- "Welcome" or "Let's begin" at the start
- "As you can see" or "Notice" when pointing out visual elements
- "Let's explore" or "Now we'll look at" when transitioning
- "This is important because" to highlight key concepts
- "In other words" or "To put it simply" when clarifying

The original text is often fragmented (titles, bullets, metadata) and needs to be connected into coherent, conversational sentences. Do not hallucinate new facts, but strictly "connect the dots" or "fill in the blanks" to make it flow naturally as a spoken presentation.

IMPORTANT TTS INSTRUCTIONS:
1. Expansion: Expand all technical abbreviations into their full spoken form to ensure correct pronunciation.
   - Example: "MiB/s" -> "mebibytes per second"
   - Example: "GB" -> "gigabytes"
   - Example: "vs." -> "versus"
   - Example: "etc." -> "et cetera"
2. URLs and Web Addresses: ALWAYS expand URLs into their spoken form.
   - Replace "://" with "colon slash slash" or simply spell out each part.
   - Replace "/" with "slash" or "forward slash".
   - Replace "." with "dot" or "period".
   - Example: "https://example.com" -> "https colon slash slash example dot com" or "h t t p s colon slash slash example dot com"
   - Example: "github.com/user/repo" -> "github dot com slash user slash repo"
   - Example: "www.website.com" -> "double-u double-u double-u dot website dot com"
   - NEVER read URLs as continuous words. Always spell them out clearly for TTS.
3. Terminal Commands:
   - Do NOT read the leading '$' prompt symbol.
   - Break down complex commands into clear, spoken steps.
   - Spell out important symbols to ensure the listener knows exactly what to type.
   - Example: "$ git commit -m 'msg'" -> "First type git commit space dash m, then include your message in quotes."
   - Example: "$ npm install ." -> "Type npm install space period."
   - Example: "ls -la" -> "Type ls space dash l a."
4. Email Addresses: Spell out the @ symbol and dots.
   - Example: "user@example.com" -> "user at example dot com"
5. Punctuation: Use proper punctuation to control pacing.
6. Clean Output: Return ONLY the raw string of the transformed text.
   - Do NOT wrap the output in quotation marks.
   - Do NOT include any prefixes like "Here is the transformed text:" or "Output:".
   - Do NOT use ANY Markdown formatting (no code blocks, no bold with **, no italic with *, no headers with #).
   - Output plain text only.

Example Input:
"How to Install Visual Studio Code on Windows A Complete Beginner's Guide Step-by-Step Instructions for First-Time Users  Windows 10/11  ~5 Minutes  Free & Open Source Download: https://code.visualstudio.com Download size: 85 MiB $ npm install ."

Example Output:
How to Install Visual Studio Code on Windows. This is a Complete Beginner's Guide including step-by-Step Instructions designed for First-Time Users. This guide is compatible with Windows 10 or Windows 11 operating systems. It will take around 5 minutes to complete. Visual Studio Code is free and open-source software. You can download it from https colon slash slash code dot visualstudio dot com. The download size is approximately 85 mebibytes. To install dependencies, type npm install space period.`;

export const transformText = async (settings: LLMSettings, text: string, customSystemPrompt?: string): Promise<string> => {
  const systemPrompt = customSystemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

  const userPrompt = `Input Text:
"${text}"`;

  if (settings.useWebLLM) {
    if (!settings.webLlmModel) {
        throw new Error("WebLLM is enabled but no model is selected.");
    }
    try {
        // Check if WebLLM is already initialized (it should be from the setup modal)
        if (!isWebLLMLoaded()) {
            throw new Error("WebLLM is not initialized. Please load a model in Settings (WebLLM tab) first.");
        }

        const messages = [
            { role: "system" as const, content: systemPrompt },
            { role: "user" as const, content: userPrompt }
        ];

        const response = await generateWebLLMResponse(messages);
        return cleanLLMResponse(response);
    } catch (error) {
        console.error("WebLLM Error:", error);
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

