const DEFAULT_SYSTEM_PROMPT = `You are an expert scriptwriter specializing in creating conversational scripts for Text-to-Speech (TTS) presentations. Your task is to transform fragmented text extracted from PDF slides—including titles, bullet points, and metadata—into a complete, natural-sounding spoken presentation.

Style and Tone Guidelines:

Write in a conversational, engaging, and professional style.`;

const customSystemPrompt = undefined;
const visionSystemPrompt = customSystemPrompt?.trim() || `You are a presentation narrator creating a Text-to-Speech script for a single slide.

STEP 1 — VISUAL ANALYSIS:
You will see an image of the slide. Examine it carefully to understand:

${DEFAULT_SYSTEM_PROMPT.split('IMPORTANT TTS INSTRUCTIONS:')[1]}`;

console.log("Made vision prompt!");
