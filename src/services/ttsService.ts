import axios from 'axios';

const KOKOROS_API_URL = 'http://localhost:8880';

export interface TTSOptions {
  voice: string;
  speed: number;
  pitch: number;
}

export const AVAILABLE_VOICES = [
  { id: 'af_heart', name: 'Heart (Default)' },
  { id: 'af_bella', name: 'Bella' },
  { id: 'af_nicole', name: 'Nicole' },
  { id: 'am_adam', name: 'Adam' },
  { id: 'am_michael', name: 'Michael' },
  { id: 'bf_emma', name: 'Emma (British)' },
  { id: 'bm_george', name: 'George (British)' },
];

export async function generateTTS(text: string, options: TTSOptions): Promise<string> {
  try {
    const response = await axios.post(`${KOKOROS_API_URL}/v1/audio/speech`, {
      input: text,
      voice: options.voice,
      speed: options.speed,
      model: "kokoro",
      response_format: "mp3"
    }, {
      responseType: 'blob'
    });

    const base64Audio = await blobToBase64(response.data);
    return base64Audio;
  } catch (error) {
    console.error('TTS Generation failed:', error);
    throw new Error('Failed to generate audio. Is the Kokoros TTS server running?');
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.src = url;
    audio.addEventListener('loadedmetadata', () => {
      resolve(audio.duration);
    });
  });
}
