import { generateWebLLMResponse, isWebLLMLoaded, getCurrentWebLLMModel, isVisionModel } from './webLlmService';

interface LLMSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  useWebLLM?: boolean;
  webLlmModel?: string;
  useVision?: boolean;
}

// Type for multimodal content (text + images)
type MultimodalContent = string | Array<{ type: string; text?: string; image_url?: { url: string } }>;

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: MultimodalContent;
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

  // Enforce terminal punctuation on every sentence.
  // Split on sentence boundaries (. ! ?), keeping the delimiter, then re-join.
  // Any non-empty chunk that doesn't end with .  !  ? gets a period appended.
  // This catches titles, short bullet-point sentences, and other cases where
  // the AI (especially smaller WebLLM models) forgets the terminal period.
  cleaned = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(sentence => {
      const s = sentence.trim();
      if (!s) return '';
      // If the sentence already ends with terminal punctuation, leave it alone
      if (/[.!?]$/.test(s)) return s;
      return s + '.';
    })
    .filter(Boolean)
    .join(' ');

  return cleaned.trim();
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

/**
 * Helper function to optimize an image URL (blob or data string) into a resized base64 data URL
 * This reduces memory usage for WebLLM vision operations
 * @param imageUrl The blob URL or data URL to convert and optimize
 * @returns Promise resolving to an optimized base64 data URL (JPEG format)
 */
const getOptimizedBase64Image = async (imageUrl: string): Promise<string> => {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        // Reduce to 224x224 (WebLLM minimum typical stable vision size without blowing the 29MB buffer)
        // Phi-3.5-vision patches are 336x336. If we give it an image SMALLER than 336x336, it only requires exactly 1 patch.
        // Let's use 224x224 to fit squarely inside 1 patch token size
        const MAX_DIMENSION = 224;
        let width = img.width;
        let height = img.height;

        // Force scale down proportionally
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
          return;
        }

        // Fill background
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Export at 0.5 quality to brutally compress the payload data
        resolve(canvas.toDataURL('image/jpeg', 0.5));
      };

      img.onerror = () => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      };
      img.src = URL.createObjectURL(blob);
    });
  } catch (error) {
    console.error("[AI Service] Failed to optimize image:", error);
    throw new Error("Failed to optimize image for vision model");
  }
};

/**
 * Transform text with vision-based script generation
 * Uses the Phi-3.5-vision model to analyze slide images along with extracted text
 * @param settings LLM settings including vision enablement
 * @param text Extracted text from the slide
 * @param imageUrl Optional dataUrl of the slide image for vision analysis
 * @param customSystemPrompt Optional custom system prompt
 * @returns Generated script text
 */
export const transformTextWithVision = async (
  settings: LLMSettings,
  text: string,
  imageUrl?: string,
  customSystemPrompt?: string
): Promise<string> => {
  const visionSystemPrompt = customSystemPrompt?.trim() || `You are an expert presentation narrator.
Examine this slide image.
Create a natural, spoken Text-to-Speech narration script.

RULES:
1. ALWAYS start with the slide title. The title sentence MUST end with a period (.).
2. Every sentence MUST end with a period (.). No exceptions — not the title, not short phrases, not any sentence.
3. Describe important charts/diagrams clearly in complete sentences.
4. Expand abbreviations ("GB" -> "gigabytes") and URLs fully ("https://" -> "h t t p s colon slash slash").
5. Output plain narrative text ONLY. No formatting, no markdown, no filler intros.`;

  if (settings.useVision && imageUrl && settings.useWebLLM) {
    // Check if WebLLM is already initialized (it should be from the setup modal)
    if (!isWebLLMLoaded()) {
      throw new Error("WebLLM is not initialized. Please wait for it to load, or select a model in Settings (WebLLM tab).");
    }

    // Check if loaded model is a vision model
    const currentModel = getCurrentWebLLMModel();

    if (!isVisionModel(currentModel)) {
      throw new Error(`Vision-based generation is enabled, but the loaded model (${currentModel}) is not a vision model. Please load 'Phi 3.5 Vision' in settings.`);
    }

    try {
      // Always optimize the image to prevent WebLLM out-of-memory errors
      console.log("[AI Service] Optimizing image for vision model");
      const processedImageUrl = await getOptimizedBase64Image(imageUrl);
      console.log("[AI Service] Image optimized, base64 length:", processedImageUrl.length);

      // Use vision model with image only, avoiding extracted text insertion
      const messages: LLMMessage[] = [
        { role: "system", content: visionSystemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: `Analyze this slide image and generate a narration script.` },
            { type: "image_url", image_url: { url: processedImageUrl } }
          ]
        }
      ];

      console.log("[AI Service] Using vision-based generation", { model: currentModel, hasImage: !!imageUrl });
      const response = await generateWebLLMResponse(messages);
      console.log("[AI Service] Raw Vision Response:", response);

      const cleaned = cleanLLMResponse(response);
      console.log("[AI Service] Cleaned Vision Response:", cleaned);
      return cleaned;
    } catch (error) {
      console.error("[AI Service] Vision Generation Error:", error);
      throw error;
    }
  }

  // Fall back to text-only
  return await transformText(settings, text, customSystemPrompt);
};

