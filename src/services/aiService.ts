import { generateWebLLMResponse, isWebLLMLoaded } from './webLlmService';

export interface LLMSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  useWebLLM?: boolean;
  webLlmModel?: string;
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

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GeminiFileResource {
  name: string;
  uri: string;
  mimeType?: string;
  state?: string;
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

export const GEMINI_VIDEO_ANALYSIS_SYSTEM_PROMPT = `### Improved Tutorial Script Prompt

Act as a professional technical scriptwriter for a high-end YouTube tutorial channel. 

**Task:** Generate a step-by-step narration script for a tutorial on [INSERT YOUR TOPIC HERE]. The script is intended for a Text-to-Speech (TTS) engine and must be synchronized with on-screen actions.

**Script Requirements:**
* **Tone:** Helpful, concise, and professional (think "Apple Support" or "Modern SaaS" style). 
* **Structure:** Each step must include a visual description of what is happening on screen and the corresponding narration.
* **Clarity:** Use action-oriented language (e.g., "Click the gear icon" instead of "The gear icon is clicked").
* **Timestamps:** Estimate logical durations for each step based on average speaking speed (approx. 150 words per minute).

**Output Format:** Provide the response strictly in valid JSON format with the following structure:

{
  "video_metadata": {
    "title": "String",
    "total_estimated_duration": "MM:SS"
  },
  "scenes": [
    {
      "step_number": 1,
      "timestamp_start": "MM:SS",
      "on_screen_action": "Detailed description of the visual movement or UI element shown.",
      "narration_text": "The exact words the TTS should read.",
      "duration_seconds": 10
    }
  ]
}`;

const toChatCompletionsEndpoint = (baseUrl: string): string => {
  let endpoint = baseUrl;
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = endpoint.replace(/\/+$/, '');
    endpoint = `${endpoint}/chat/completions`;
  }
  return endpoint;
};

const normalizeModelForRequest = (model: string): string => model.replace(/^models\//, '');

const postChatCompletions = async (settings: LLMSettings, messages: ChatMessage[], temperature = 0.3, modelOverride?: string): Promise<string> => {
  const endpoint = toChatCompletionsEndpoint(settings.baseUrl);
  const normalizedModel = normalizeModelForRequest((modelOverride || settings.model || '').trim());
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: normalizedModel,
      messages,
      temperature
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to generate content: ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
};

const parseMMSS = (value: string): number => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid timestamp format: ${value}. Expected MM:SS.`);
  }

  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) {
    throw new Error(`Invalid timestamp value: ${value}.`);
  }

  return (minutes * 60) + seconds;
};

const parseTimestampFlexible = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  const text = String(value ?? '').trim();
  if (!text) {
    throw new Error('Empty timestamp');
  }

  // Supports HH:MM:SS and MM:SS in addition to strict MM:SS.
  const hmsMatch = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(text);
  if (hmsMatch) {
    const h = Number(hmsMatch[1]);
    const m = Number(hmsMatch[2]);
    const s = Number(hmsMatch[3]);
    if (m < 60 && s < 60) {
      return (h * 3600) + (m * 60) + s;
    }
  }

  return parseMMSS(text);
};

const stripCodeFence = (input: string): string => {
  const trimmed = input.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```[\w-]*\s*/, '').replace(/\s*```$/, '').trim();
  }
  return trimmed;
};

const formatMMSS = (totalSeconds: number): string => {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const estimateDurationFromNarration = (text: string): number => {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words === 0) return 4;
  // 150 words/minute ~= 2.5 words/second
  return Math.max(2, Math.round(words / 2.5));
};

const pickFirstDefined = <T = unknown>(source: Record<string, any>, keys: string[]): T | undefined => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key] as T;
    }
  }
  return undefined;
};

const parseVideoNarrationAnalysis = (rawContent: string): VideoNarrationAnalysis => {
  const cleaned = stripCodeFence(rawContent);

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Gemini returned invalid JSON for video analysis.');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Video analysis payload is not a JSON object.');
  }

  const metadata = (parsed.video_metadata || parsed.videoMetadata || parsed.metadata || {}) as Record<string, any>;
  const scenes = (parsed.scenes || parsed.steps || parsed.segments || parsed.timeline || []) as any[];

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Missing video_metadata in Gemini output.');
  }
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('Missing or empty scenes array in Gemini output.');
  }

  const title = String(
    pickFirstDefined(metadata, ['title', 'video_title', 'name']) ||
    'Video Tutorial'
  ).trim();
  const totalEstimatedDurationRaw = String(
    pickFirstDefined(metadata, ['total_estimated_duration', 'totalEstimatedDuration', 'duration', 'total_duration']) ||
    ''
  ).trim();
  if (!title) {
    throw new Error('video_metadata.title is required.');
  }

  const normalizedScenes: VideoNarrationScene[] = [];
  let inferredCursor = 0;

  for (let idx = 0; idx < scenes.length; idx++) {
    const scene = (scenes[idx] && typeof scenes[idx] === 'object') ? scenes[idx] : {};
    const rawTimestampValue = pickFirstDefined(scene, [
      'timestamp_start',
      'timestampStart',
      'start',
      'start_time',
      'startTime',
      'time'
    ]);
    let onScreenAction = String(
      pickFirstDefined(scene, [
        'on_screen_action',
        'onScreenAction',
        'screen_action',
        'screenAction',
        'visual',
        'action'
      ]) ||
      ''
    ).trim();
    let narrationText = String(
      pickFirstDefined(scene, [
        'narration_text',
        'naration_text',
        'narrationText',
        'narration',
        'voiceover',
        'voice_over',
        'script',
        'tts'
      ]) ||
      ''
    ).trim();
    const stepNumberRaw = Number(pickFirstDefined(scene, ['step_number', 'stepNumber', 'step', 'index', 'order']) ?? idx + 1);
    const stepNumber = Number.isFinite(stepNumberRaw) ? stepNumberRaw : idx + 1;

    // Never drop a scene row. Fill placeholders if the model omitted fields.

    if (!onScreenAction) {
      onScreenAction = `Continue to step ${stepNumber} on screen.`;
    }
    if (!narrationText) {
      narrationText = `Now, continue with step ${stepNumber}.`;
    }

    let durationSecondsRaw = Number(
      pickFirstDefined(scene, ['duration_seconds', 'durationSeconds', 'duration', 'seconds', 'length']) ?? 0
    );
    if (!Number.isFinite(durationSecondsRaw) || durationSecondsRaw <= 0) {
      durationSecondsRaw = estimateDurationFromNarration(narrationText);
    }
    const durationSeconds = Math.max(1, Math.round(durationSecondsRaw));

    let timestampStartSeconds: number;
    let timestampStart: string;
    try {
      if (rawTimestampValue === undefined || rawTimestampValue === null || String(rawTimestampValue).trim() === '') {
        throw new Error('missing');
      }
      timestampStartSeconds = parseTimestampFlexible(rawTimestampValue);
      timestampStart = formatMMSS(timestampStartSeconds);
    } catch {
      timestampStartSeconds = Math.max(0, Math.round(inferredCursor));
      timestampStart = formatMMSS(timestampStartSeconds);
    }

    normalizedScenes.push({
      stepNumber,
      timestampStart,
      timestampStartSeconds,
      onScreenAction,
      narrationText,
      durationSeconds,
    });

    inferredCursor = Math.max(inferredCursor, timestampStartSeconds + durationSeconds);
  }

  if (normalizedScenes.length === 0) {
    throw new Error('Gemini returned no usable scenes.');
  }

  normalizedScenes.sort((a, b) => a.timestampStartSeconds - b.timestampStartSeconds || a.stepNumber - b.stepNumber);

  for (let i = 1; i < normalizedScenes.length; i++) {
    if (normalizedScenes[i].timestampStartSeconds < normalizedScenes[i - 1].timestampStartSeconds) {
      throw new Error('Scene timestamps are not in non-decreasing order.');
    }
  }

  const inferredTotalDurationSeconds = Math.max(
    1,
    Math.ceil(normalizedScenes.reduce((max, scene) => Math.max(max, scene.timestampStartSeconds + scene.durationSeconds), 0))
  );

  let totalEstimatedDurationSeconds = inferredTotalDurationSeconds;
  let totalEstimatedDuration = formatMMSS(inferredTotalDurationSeconds);
  if (totalEstimatedDurationRaw) {
    try {
      totalEstimatedDurationSeconds = parseMMSS(totalEstimatedDurationRaw);
      totalEstimatedDuration = totalEstimatedDurationRaw;
    } catch {
      // Keep inferred duration when metadata timestamp is invalid.
    }
  }

  return {
    videoMetadata: {
      title,
      totalEstimatedDuration,
      totalEstimatedDurationSeconds,
    },
    scenes: normalizedScenes,
  };
};

const isGoogleGeminiEndpoint = (baseUrl: string): boolean => {
  return /generativelanguage\.googleapis\.com/i.test(baseUrl);
};

const getGeminiApiKey = (settings: LLMSettings): string => {
  const apiKey = settings.apiKey?.trim();
  if (!apiKey) {
    throw new Error('Missing API key for Gemini video analysis.');
  }
  return apiKey;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const uploadGeminiFile = async (
  apiKey: string,
  file: Blob,
  mimeType: string,
  displayName: string,
  onProgress?: (update: VideoAnalysisProgress) => void
): Promise<GeminiFileResource> => {
  onProgress?.({ stage: 'Uploading video', progress: 12 });
  const startResp = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(file.size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file: {
        display_name: displayName,
      }
    })
  });

  if (!startResp.ok) {
    const errorData = await startResp.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to start Gemini file upload: ${startResp.statusText}`);
  }

  const uploadUrl = startResp.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    throw new Error('Gemini upload URL was not returned by the API.');
  }

  onProgress?.({ stage: 'Uploading video', progress: 20 });

  const finalizeResp = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Command': 'upload, finalize',
      'X-Goog-Upload-Offset': '0',
      'Content-Type': mimeType,
    },
    body: file,
  });

  if (!finalizeResp.ok) {
    const errorData = await finalizeResp.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to upload Gemini file: ${finalizeResp.statusText}`);
  }

  const finalizeData = await finalizeResp.json();
  const uploaded = (finalizeData.file ?? finalizeData) as GeminiFileResource;
  if (!uploaded?.name || !uploaded?.uri) {
    throw new Error('Gemini upload response did not include file metadata.');
  }

  onProgress?.({ stage: 'Video uploaded', progress: 28 });

  return uploaded;
};

const waitForGeminiFileActive = async (
  apiKey: string,
  fileName: string,
  onProgress?: (update: VideoAnalysisProgress) => void
): Promise<GeminiFileResource> => {
  const cleanName = fileName.startsWith('files/') ? fileName : fileName.replace(/^\/+/, '');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${encodeURIComponent(apiKey)}`;

  const maxAttempts = 45;
  onProgress?.({ stage: 'Processing video', progress: 30 });
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const resp = await fetch(endpoint);
    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `Failed to check Gemini file state: ${resp.statusText}`);
    }

    const data = await resp.json();
    const resource = (data.file ?? data) as GeminiFileResource;
    const state = (resource.state || '').toUpperCase();

    if (state === 'ACTIVE') {
      onProgress?.({ stage: 'Video processed', progress: 70 });
      return resource;
    }
    if (state === 'FAILED') {
      throw new Error('Gemini failed to process the uploaded video file.');
    }

    const processProgress = Math.min(69, 30 + Math.floor(((attempt + 1) / maxAttempts) * 39));
    onProgress?.({ stage: 'Processing video', progress: processProgress });
    await sleep(2000);
  }

  throw new Error('Gemini video processing timed out. Try a shorter clip and retry.');
};

const deleteGeminiFile = async (apiKey: string, fileName: string): Promise<void> => {
  const cleanName = fileName.startsWith('files/') ? fileName : fileName.replace(/^\/+/, '');
  await fetch(`https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${encodeURIComponent(apiKey)}`, {
    method: 'DELETE'
  }).catch(() => undefined);
};

const generateGeminiVideoAnalysis = async (
  apiKey: string,
  model: string,
  fileUri: string,
  mimeType: string,
  userPrompt: string,
  onProgress?: (update: VideoAnalysisProgress) => void
): Promise<string> => {
  onProgress?.({ stage: 'Generating script JSON', progress: 76 });
  const normalizedModel = normalizeModelForRequest(model.trim());
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizedModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: GEMINI_VIDEO_ANALYSIS_SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: 'user',
          parts: [
            { text: userPrompt },
            { file_data: { mime_type: mimeType, file_uri: fileUri } }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      }
    })
  });

  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Gemini video analysis request failed: ${resp.statusText}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.find((p: any) => typeof p?.text === 'string')?.text || '';
  if (!text.trim()) {
    throw new Error('Gemini did not return any text output for video analysis.');
  }
  onProgress?.({ stage: 'Parsing JSON output', progress: 84 });
  return text;
};

export const analyzeVideoNarrationWithGemini = async (
  settings: LLMSettings,
  context: {
    topicHint: string;
    mediaDurationSeconds?: number;
    fileNameHint?: string;
    mediaBlob?: Blob;
    mediaMimeType?: string;
    onProgress?: (update: VideoAnalysisProgress) => void;
  }
): Promise<VideoNarrationAnalysis> => {
  if (!settings.apiKey?.trim()) {
    throw new Error('Missing API key for Gemini video analysis.');
  }

  const model = settings.model?.trim() || 'gemini-2.5-flash-lite';
  context.onProgress?.({ stage: 'Preparing request', progress: 5 });
  const userPrompt = [
    `Tutorial topic: ${context.topicHint || 'Video walkthrough'}`,
    context.fileNameHint ? `Video file hint: ${context.fileNameHint}` : '',
    Number.isFinite(context.mediaDurationSeconds) ? `Video length hint (seconds): ${context.mediaDurationSeconds}` : '',
    'Return strictly valid JSON only. Do not include markdown fences.',
    'Use EXACT keys: video_metadata.title, video_metadata.total_estimated_duration, and scenes[].{step_number,timestamp_start,on_screen_action,narration_text,duration_seconds}.',
  ].filter(Boolean).join('\n');

  if (!context.mediaBlob) {
    // Fallback path for callers that do not provide a media blob.
    const messages: ChatMessage[] = [
      { role: 'system', content: GEMINI_VIDEO_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    const first = await postChatCompletions(settings, messages, 0.2, model);
    context.onProgress?.({ stage: 'Parsing JSON output', progress: 84 });
    try {
      context.onProgress?.({ stage: 'Analysis ready', progress: 88 });
      return { ...parseVideoNarrationAnalysis(first), rawJson: stripCodeFence(first) };
    } catch {
      const repairMessages: ChatMessage[] = [
        ...messages,
        { role: 'assistant', content: first },
        { role: 'user', content: 'Your previous response was invalid. Return ONLY valid JSON matching the required schema. No markdown, no commentary.' }
      ];
      const repaired = await postChatCompletions(settings, repairMessages, 0.1, model);
      context.onProgress?.({ stage: 'Analysis ready', progress: 88 });
      return { ...parseVideoNarrationAnalysis(repaired), rawJson: stripCodeFence(repaired) };
    }
  }

  if (!isGoogleGeminiEndpoint(settings.baseUrl)) {
    throw new Error('Actual video analysis requires a Google Gemini endpoint. Set Base URL to generativelanguage.googleapis.com and retry.');
  }

  const apiKey = getGeminiApiKey(settings);
  const mimeType = context.mediaMimeType?.trim() || context.mediaBlob.type || 'video/mp4';
  let uploadedFile: GeminiFileResource | null = null;

  try {
    uploadedFile = await uploadGeminiFile(
      apiKey,
      context.mediaBlob,
      mimeType,
      context.fileNameHint || 'slide-media-video',
      context.onProgress
    );
    const activeFile = await waitForGeminiFileActive(apiKey, uploadedFile.name, context.onProgress);

    const first = await generateGeminiVideoAnalysis(apiKey, model, activeFile.uri, mimeType, userPrompt, context.onProgress);
    try {
      context.onProgress?.({ stage: 'Analysis ready', progress: 88 });
      return { ...parseVideoNarrationAnalysis(first), rawJson: stripCodeFence(first) };
    } catch {
      const repairPrompt = `${userPrompt}\n\nYour previous response was invalid JSON. Return only valid JSON matching the requested schema.`;
      const repaired = await generateGeminiVideoAnalysis(apiKey, model, activeFile.uri, mimeType, repairPrompt, context.onProgress);
      context.onProgress?.({ stage: 'Analysis ready', progress: 88 });
      return { ...parseVideoNarrationAnalysis(repaired), rawJson: stripCodeFence(repaired) };
    }
  } finally {
    if (uploadedFile?.name) {
      await deleteGeminiFile(apiKey, uploadedFile.name);
    }
  }
};

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
