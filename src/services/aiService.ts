import { ensureWebLLMReady, generateWebLLMResponse, getCurrentWebLLMModel, isWebLLMLoaded, type WebLLMChatMessage } from './webLlmService';
import { DEFAULT_SYSTEM_PROMPT } from './prompts';

export { DEFAULT_SYSTEM_PROMPT, GEMINI_VIDEO_ANALYSIS_SYSTEM_PROMPT, GEMINI_ISSUE_CAPTURE_ANALYSIS_SYSTEM_PROMPT } from './prompts';

export interface LLMSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  useWebLLM?: boolean;
  webLlmModel?: string;
  openaiEndpoint?: string;
  openaiModel?: string;
  openaiApiKey?: string;
  openaiDisableThinking?: boolean;
  useOpenAIOcr?: boolean;
  useOpenAIFixScript?: boolean;
}

export interface VideoNarrationScene {
  stepNumber: number;
  timestampStart: string;
  timestampStartSeconds: number;
  onScreenAction: string;
  narrationText: string;
  durationSeconds: number;
}

export interface VideoNarrationAnalysis {
  videoMetadata: {
    title: string;
    totalEstimatedDuration: string;
    totalEstimatedDurationSeconds: number;
  };
  scenes: VideoNarrationScene[];
  rawJson?: string;
}

export interface IssueCaptureAnalysis {
  issueTitle: string;
  issueSummary: string;
  observedBehavior: string;
  expectedBehavior: string;
  reproductionSteps: string[];
  technicalClues: string[];
  recommendedPrompt: string;
  rawJson?: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface VideoAnalysisProgress {
  stage: string;
  progress: number;
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

export const cleanLLMResponse = (text: string): string => {
  let cleaned = text.trim();

  // Strip hidden reasoning blocks/tags that some models emit.
  cleaned = cleaned.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
  // Reasoning models like DeepSeek R1 inject the opening <think> into the
  // prompt, so the reply contains only the closing </think> after the reasoning
  // text. Drop everything up to and including that closing tag.
  cleaned = cleaned.replace(/^[\s\S]*?<\/think>/i, '');
  // max_tokens can cut generation off mid-reasoning, before a closing tag
  // ever appears. Drop an unclosed <think> and everything after it.
  cleaned = cleaned.replace(/<think\b[^>]*>[\s\S]*$/gi, '');
  cleaned = cleaned.replace(/<\/?think\b[^>]*>/gi, '');

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

const toChatCompletionsEndpoint = (baseUrl: string): string => {
  let endpoint = baseUrl;
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = endpoint.replace(/\/+$/, '');
    endpoint = `${endpoint}/chat/completions`;
  }
  return endpoint;
};

export const normalizeModelForRequest = (model: string): string => model.replace(/^models\//, '');

// Best-effort flags for OpenAI-compatible servers that support turning off a
// reasoning model's "thinking" step (Qwen3/vLLM's enable_thinking, OpenRouter's
// reasoning_effort, etc). Unsupported providers generally ignore unknown fields.
const REASONING_DISABLE_FIELDS: Record<string, unknown> = {
  reasoning_effort: 'none',
  enable_thinking: false,
  chat_template_kwargs: { enable_thinking: false },
};

interface ProxyChatPayload {
  baseUrl: string;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens?: number;
  /**
   * Optional client-supplied key. Only used so the server can retry a request the
   * browser couldn't make directly (CORS-blocked provider); it is forwarded to the
   * same-origin proxy, never stored there.
   */
  apiKey?: string;
}

const requestViaLLMProxy = async (payload: ProxyChatPayload, signal?: AbortSignal): Promise<string> => {
  const proxyResp = await fetch('/api/llm/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!proxyResp.ok) {
    const text = await proxyResp.text().catch(() => '');
    let errMsg = text || `LLM proxy failed: ${proxyResp.statusText}`;
    try {
      const parsed = JSON.parse(text || '{}');
      errMsg = parsed.error?.message || parsed.error || errMsg;
    } catch { /* ignore */ }
    throw new Error(errMsg);
  }

  const data = await proxyResp.json().catch(() => ({}));
  return data.choices?.[0]?.message?.content || data?.choices?.[0]?.message?.content || data?.content || '';
};

export const postChatCompletions = async (settings: LLMSettings, messages: ChatMessage[], temperature = 0.3, modelOverride?: string, signal?: AbortSignal, maxTokens?: number): Promise<string> => {
  const endpoint = toChatCompletionsEndpoint(settings.baseUrl);
  const normalizedModel = normalizeModelForRequest((modelOverride || settings.model || '').trim());

  // If no API key is provided to the client, proxy the request to the server so the secret stays server-side.
  if (typeof window !== 'undefined' && (!settings.apiKey || !settings.apiKey.trim())) {
    return requestViaLLMProxy(
      { baseUrl: settings.baseUrl, model: normalizedModel, messages, temperature, ...(maxTokens ? { maxTokens } : {}) },
      signal,
    );
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: normalizedModel,
        messages,
        temperature,
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        ...(settings.openaiDisableThinking ? REASONING_DISABLE_FIELDS : {}),
      }),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Failed to generate content: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (e) {
    // A browser-to-provider fetch rejects with a bare TypeError for both network
    // outages and CORS rejections, and CORS is the common case for OpenAI-compatible
    // providers (e.g. api.z.ai) that don't send Access-Control-Allow-Origin. Retry
    // once through the same-origin proxy, handing it the client's key for this single
    // upstream request. AbortErrors are DOMExceptions, so user cancels never retry.
    if (e instanceof TypeError && typeof window !== 'undefined') {
      try {
        return await requestViaLLMProxy(
          { baseUrl: settings.baseUrl, model: normalizedModel, messages, temperature, ...(maxTokens ? { maxTokens } : {}), apiKey: settings.apiKey },
          signal,
        );
      } catch (proxyErr) {
        if (proxyErr instanceof TypeError) {
          throw new Error(`Couldn't reach ${endpoint} from the browser (blocked by CORS or offline), and the app's LLM proxy is also unreachable. Check your connection and that the app's server is running.`);
        }
        throw proxyErr;
      }
    }
    throw e;
  }
};

export interface CustomApiStreamOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * Streams a chat completion from a user-configured OpenAI-compatible endpoint
 * via SSE. Only used with a client-supplied key (the endpoint is the user's
 * own), so unlike postChatCompletions there is no server-proxy fallback here.
 */
export async function* streamCustomApiChatResponse(
  settings: Pick<LLMSettings, 'apiKey' | 'baseUrl' | 'model' | 'openaiDisableThinking'>,
  messages: WebLLMChatMessage[],
  options: CustomApiStreamOptions = {},
): AsyncGenerator<string, void, void> {
  const { temperature = 0.7, maxTokens, signal } = options;
  const endpoint = toChatCompletionsEndpoint(settings.baseUrl);
  const normalizedModel = normalizeModelForRequest((settings.model || '').trim());

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: normalizedModel,
      messages,
      temperature,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(settings.openaiDisableThinking ? REASONING_DISABLE_FIELDS : {}),
      stream: true,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to generate content: ${response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            yield delta;
          }
        } catch {
          // Ignore malformed/partial SSE lines.
        }
      }
    }
  } finally {
    // Breaking the consumer's for-await loop resumes here, so cancelling the
    // reader on the way out stops the network read instead of draining it.
    reader.cancel().catch(() => {});
  }
}

export const transformText = async (
  settings: LLMSettings,
  text: string,
  customSystemPrompt?: string,
  presentationContext?: string
): Promise<string> => {
  let systemPrompt = customSystemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

  const ctx = presentationContext?.trim();

  const presentationContextDescriptions: Record<string, string> = {
    'Learning course / education': 'This slide is for an educational course that will be shown to students learning about the subject in the script.',
    'Business / corporate': 'This slide is for a business or corporate audience and should use professional, polished language.',
    'Training / onboarding': 'This slide is for employee training or onboarding and should be clear, supportive, and instructive.',
    'Marketing / sales': 'This slide is for marketing or sales content and should be persuasive while staying factual.',
    'Technical / engineering': 'This slide is for a technical or engineering audience and should use precise technical terminology.',
    'Product demo / user guide': 'This slide is part of a product demo or user guide and should focus on practical step-by-step guidance.'
  };

  if (ctx) {
    const ctxDescription = presentationContextDescriptions[ctx] || `Adapt tone and examples to match a ${ctx} presentation.`;
    systemPrompt += `\n\nPresentation context: ${ctx}. ${ctxDescription} Adapt tone, language, and examples to fit this context.`;
  }

  const userPrompt = `Slide Content:
"${text}"

Write a continuous, flowing narration script for the above content. Ensure every sentence ends with a period. Do not output a list of bullet points.

STRICT CONSTRAINTS:
- BREVITY IS MANDATORY. Your output must be roughly the same length as the input text.
- NO FILLER. Do not include "Welcome to this slide", "In this section", or "In conclusion".
- NO SLIDE REFERENCES. Do not use phrases like "This slide", "On this page", or "In this presentation".
- NO HEADERS. Do not include single words that act as titles or markers (e.g. "Introduction.", "Summary.", "Step 1.").
- NO HALLUCINATION. Do not add any advice, context, or details not found in the "Slide Content" quotes.
- RECONSTRUCT ONLY. Only fill in the missing words to make the fragments into complete, spoken sentences.
- If the input is 50 words, your output should be approximately 50-60 words.
`;

  if (settings.useOpenAIFixScript && settings.openaiEndpoint && settings.openaiModel && settings.openaiApiKey) {
    try {
      const customSettings: LLMSettings = {
        baseUrl: settings.openaiEndpoint,
        model: settings.openaiModel,
        apiKey: settings.openaiApiKey,
        openaiDisableThinking: settings.openaiDisableThinking
      };

      const textContent = await postChatCompletions(customSettings, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], 0.7);

      const cleaned = cleanLLMResponse(textContent);
      return cleaned;
    } catch (error) {
      console.error("Custom OpenAI Endpoint Error in aiService:", error);
      throw error;
    }
  }

  if (settings.useWebLLM) {
    if (!settings.webLlmModel) {
      throw new Error("WebLLM is enabled but no model is selected.");
    }

    if (!isWebLLMLoaded() || getCurrentWebLLMModel() !== settings.webLlmModel) {
      await ensureWebLLMReady(settings.webLlmModel);
    }

    try {
      const messages = [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userPrompt }
      ];

      const response = await generateWebLLMResponse(messages);

      const cleaned = cleanLLMResponse(response);
      return cleaned;
    } catch (error) {
      console.error("WebLLM Error in aiService:", error);
      throw error;
    }
  }

  try {
    const textContent = await postChatCompletions(settings, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], 0.7);

    return cleanLLMResponse(textContent);
  } catch (error) {
    console.error('LLM API Error:', error);
    throw error;
  }
};

export const performOpenAIOcr = async (
  canvas: HTMLCanvasElement,
  settings: LLMSettings
): Promise<string> => {
  if (!settings.openaiEndpoint || !settings.openaiModel || !settings.openaiApiKey) {
    throw new Error('OpenAI endpoint settings are missing.');
  }

  const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
  
  const systemPrompt = `You are a highly accurate OCR system. Your task is to extract all readable text from the provided image of a presentation slide.
Follow these rules strictly:
- Extract text exactly as it appears.
- Preserve paragraphs and lists as much as possible.
- Do NOT describe the image, only output the text found within it.
- If there is no text, simply return an empty string.`;

  const customSettings: LLMSettings = {
    baseUrl: settings.openaiEndpoint,
    model: settings.openaiModel,
    apiKey: settings.openaiApiKey,
    openaiDisableThinking: settings.openaiDisableThinking
  };

  const endpoint = toChatCompletionsEndpoint(customSettings.baseUrl);
  const normalizedModel = normalizeModelForRequest(customSettings.model);

  const payload = {
    model: normalizedModel,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          }
        ]
      }
    ],
    temperature: 0.1,
    ...(customSettings.openaiDisableThinking ? REASONING_DISABLE_FIELDS : {})
  };

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${customSettings.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to perform OCR via OpenAI endpoint: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return content.trim();
};
