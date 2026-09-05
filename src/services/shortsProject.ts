import { generateTTS, getAudioDuration, resolveVoice } from './ttsService';
import { generateImage, DEFAULT_POLLINATIONS_IMAGE_MODEL } from './pollinationsService';
import { generateVideo, DEFAULT_POLLINATIONS_VIDEO_MODEL } from './pollinationsVideoService';
import { buildCaptionTimings, type CaptionChunk } from './shortsCaptions';
import type { ShortsAspect, ShortsCaptionPosition, ShortsCaptionSize, ShortsCaptionStyle } from './ShortsVideoRenderer';
import type { ShortsTone } from './shortsScriptService';
import type { PersistedShortsProject, PersistedShortsScene } from './storage';

export type { ShortsCaptionPosition, ShortsCaptionSize, ShortsCaptionStyle };

/**
 * Shorts project state and per-scene asset generation.
 *
 * Keeps the page component free of the image/TTS plumbing, and owns the mapping
 * between the live project (object URLs, in-flight status) and its persisted
 * form (Blobs only — object URLs do not survive a reload).
 */

export type SceneAssetStatus = 'idle' | 'pending' | 'ready' | 'error';

export interface ShortsScene {
  id: string;
  narration: string;
  imagePrompt: string;
  seed: number;

  imageBlob?: Blob | null;
  imageUrl?: string | null;
  imageStatus: SceneAssetStatus;
  imageError?: string | null;

  videoBlob?: Blob | null;
  videoUrl?: string | null;
  videoStatus: SceneAssetStatus;
  videoError?: string | null;

  audioBlob?: Blob | null;
  audioUrl?: string | null;
  audioDuration?: number;
  audioStatus: SceneAssetStatus;
  audioError?: string | null;

  /** True if the user manually uploaded or replaced the image for this scene. */
  isCustomUpload?: boolean;
  /** True if the user recorded custom audio with their microphone for this scene. */
  isCustomAudio?: boolean;
  /** True for the standalone title scene (scene 00) — otherwise a normal narrated scene. */
  isTitleCard?: boolean;

  /** narration text the current audioBlob was generated from — lets edits be detected as stale. */
  audioNarrationSnapshot?: string;
  /** imagePrompt text the current image/videoBlob was generated from. */
  visualPromptSnapshot?: string;
  /** model id the current image/videoBlob was generated with — lets model switches be detected as stale. */
  visualModelSnapshot?: string;
  /** aspect ratio the current image/videoBlob was generated with. */
  visualAspectSnapshot?: ShortsAspect;
}

export interface ShortsMusic {
  blob: Blob;
  fileName: string;
  volume: number;
}

export type ShortsGenerationMode = 'image' | 'video' | 'upload';
export type ShortsVoiceMode = 'tts' | 'record';

export interface ShortsRecordedAudio {
  blob: Blob;
  url: string;
  duration: number;
}

export interface ShortsProject {
  topic: string;
  title: string;
  aspect: ShortsAspect;
  targetDurationSec: number;
  voice: string;
  voiceMode?: ShortsVoiceMode;
  recordedAudio?: ShortsRecordedAudio | null;
  generationMode: ShortsGenerationMode;
  imageModel: string;
  videoModel: string;
  visualStyle: string;
  tone: ShortsTone;
  captionsEnabled: boolean;
  captionStyle: ShortsCaptionStyle;
  captionSize: ShortsCaptionSize;
  captionPosition: ShortsCaptionPosition;
  showTitleCard: boolean;
  music: ShortsMusic | null;
  scenes: ShortsScene[];
}

export const DURATION_OPTIONS = [15, 30, 60, 90] as const;

export const ASPECT_OPTIONS: Array<{ id: ShortsAspect; label: string; hint: string }> = [
  { id: '9:16', label: 'Portrait', hint: '1080 × 1920' },
  { id: '16:9', label: 'Landscape', hint: '1920 × 1080' },
  { id: '1:1', label: 'Square', hint: '1080 × 1080' },
];

export const VISUAL_STYLES: Array<{ id: string; name: string; prompt: string }> = [
  { id: 'cinematic', name: 'Cinematic', prompt: 'cinematic photography, dramatic lighting, shallow depth of field, 35mm film still' },
  { id: 'photoreal', name: 'Photorealistic', prompt: 'photorealistic, ultra detailed, natural lighting, high dynamic range' },
  { id: 'render3d', name: '3D Render', prompt: '3d render, octane render, soft studio lighting, subsurface scattering, high detail' },
  { id: 'anime', name: 'Anime', prompt: 'anime illustration, vibrant colors, cel shaded, highly detailed background' },
  { id: 'documentary', name: 'Dark Documentary', prompt: 'moody documentary still, desaturated palette, high contrast, subtle film grain' },
  { id: 'retro', name: 'Retro Film', prompt: 'retro 1970s film still, warm grain, faded colors, vintage lens flare' },
  { id: 'digital', name: 'Digital Art', prompt: 'digital painting, dramatic concept art, rich color palette, detailed brushwork' },
  { id: 'minimal', name: 'Minimalist', prompt: 'minimalist composition, clean negative space, soft gradient background, studio lighting' },
];

export const TONE_OPTIONS: Array<{ id: ShortsTone; name: string }> = [
  { id: 'punchy', name: 'Punchy & fast' },
  { id: 'documentary', name: 'Documentary' },
  { id: 'story', name: 'Storytelling' },
  { id: 'educational', name: 'Educational' },
  { id: 'hype', name: 'Hype' },
];

export const CAPTION_STYLES: Array<{ id: ShortsCaptionStyle; name: string }> = [
  { id: 'bold-pop', name: 'Bold pop' },
  { id: 'highlighter', name: 'Highlighter box' },
  { id: 'neon-glow', name: 'Neon glow' },
  { id: 'karaoke', name: 'Karaoke fill' },
  { id: 'clean-lower', name: 'Clean lower third' },
  { id: 'classic-cinema', name: 'Classic cinema' },
];

export const CAPTION_SIZES: Array<{ id: ShortsCaptionSize; name: string }> = [
  { id: 'small', name: 'Small' },
  { id: 'medium', name: 'Medium' },
  { id: 'large', name: 'Large' },
];

export const CAPTION_POSITIONS: Array<{ id: ShortsCaptionPosition; name: string }> = [
  { id: 'top', name: 'Top' },
  { id: 'middle', name: 'Middle' },
  { id: 'bottom', name: 'Bottom' },
];

/**
 * Generation dimensions per user aspect ratio choice (Portrait 9:16, Landscape 16:9, Square 1:1).
 * Matches the 1080p full resolution specifications of the short video renderer.
 */
export const imageDimensionsFor = (aspect: ShortsAspect): { width: number; height: number } => {
  switch (aspect) {
    case '9:16':
      return { width: 1080, height: 1920 };
    case '16:9':
      return { width: 1920, height: 1080 };
    case '1:1':
      return { width: 1080, height: 1080 };
  }
};

const randomSeed = (): number => Math.floor(Math.random() * 2_147_483_000);

export const createSceneId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `scene-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const createScene = (narration: string, imagePrompt: string): ShortsScene => ({
  id: createSceneId(),
  narration,
  imagePrompt,
  seed: randomSeed(),
  imageStatus: 'idle',
  videoStatus: 'idle',
  audioStatus: 'idle',
});

/** Scene 00 — a real scene like any other (TTS, image/video, editable narration),
 *  just flagged so the renderer overlays the project title on top of it. */
export const createTitleCardScene = (narration: string, imagePrompt: string): ShortsScene => ({
  ...createScene(narration, imagePrompt),
  isTitleCard: true,
});

export const createEmptyProject = (overrides: Partial<ShortsProject> = {}): ShortsProject => ({
  topic: '',
  title: '',
  aspect: '9:16',
  targetDurationSec: 30,
  voice: 'af_heart',
  voiceMode: 'tts',
  recordedAudio: null,
  generationMode: 'image',
  imageModel: DEFAULT_POLLINATIONS_IMAGE_MODEL,
  videoModel: DEFAULT_POLLINATIONS_VIDEO_MODEL,
  visualStyle: VISUAL_STYLES[0].prompt,
  tone: 'punchy',
  captionsEnabled: true,
  captionStyle: 'bold-pop',
  captionSize: 'medium',
  captionPosition: 'bottom',
  showTitleCard: false,
  music: null,
  scenes: [],
  ...overrides,
});

// --- asset generation ---------------------------------------------------------

export interface SceneImageResult {
  blob: Blob;
  url: string;
}

export const generateSceneImage = async (
  scene: ShortsScene,
  project: Pick<ShortsProject, 'aspect' | 'imageModel'>,
  opts: { apiKey?: string; signal?: AbortSignal } = {},
): Promise<SceneImageResult> => {
  const { width, height } = imageDimensionsFor(project.aspect);
  const blob = await generateImage(
    {
      prompt: scene.imagePrompt,
      model: project.imageModel,
      width,
      height,
      seed: scene.seed,
    },
    opts,
  );
  return { blob, url: URL.createObjectURL(blob) };
};

export interface SceneVideoResult {
  blob: Blob;
  url: string;
}

export const generateSceneVideo = async (
  scene: ShortsScene,
  project: Pick<ShortsProject, 'aspect' | 'videoModel'>,
  opts: { apiKey?: string; signal?: AbortSignal } = {},
): Promise<SceneVideoResult> => {
  const { width, height } = imageDimensionsFor(project.aspect);
  const blob = await generateVideo(
    {
      prompt: scene.imagePrompt,
      model: project.videoModel,
      aspect: project.aspect,
      width,
      height,
      seed: scene.seed,
    },
    opts,
  );
  return { blob, url: URL.createObjectURL(blob) };
};

export interface SceneAudioResult {
  blob: Blob;
  url: string;
  duration: number;
}

export const generateSceneAudio = async (
  scene: ShortsScene,
  voice: string,
  opts: { signal?: AbortSignal } = {},
): Promise<SceneAudioResult> => {
  const url = await generateTTS(scene.narration, {
    voice: resolveVoice(voice),
    speed: 1.0,
    pitch: 1.0,
  }, opts.signal);

  const duration = await getAudioDuration(url);

  // generateTTS hands back an object URL; read the bytes so the draft can be
  // persisted and so the renderer's OfflineAudioContext can decode it directly.
  const blob = await (await fetch(url)).blob();

  return { blob, url, duration: Number.isFinite(duration) && duration > 0 ? duration : 2 };
};

// --- derived values -----------------------------------------------------------

export const sceneCaptions = (scene: ShortsScene): CaptionChunk[] =>
  buildCaptionTimings(scene.narration, scene.audioDuration ?? 0);

/** Total runtime, matching the renderer's per-scene floor and tail padding. */
export const projectDuration = (scenes: ShortsScene[]): number =>
  scenes.reduce((total, scene) => total + Math.max(1.2, (scene.audioDuration ?? 0) + 0.28), 0);

export const isProjectRenderable = (project: ShortsProject): boolean =>
  project.scenes.length > 0 && project.scenes.every((scene) => scene.audioStatus === 'ready');

/** True once a scene's narration has been edited since its voiceover was generated. */
export const isSceneAudioStale = (scene: ShortsScene): boolean =>
  scene.audioStatus === 'ready' &&
  scene.audioNarrationSnapshot !== undefined &&
  scene.audioNarrationSnapshot !== scene.narration;

/**
 * True once a scene's image/video prompt has been edited since its visual was
 * generated, or once the project's active model or aspect ratio no longer matches
 * the one that generated it.
 */
export const isSceneVisualStale = (
  scene: ShortsScene,
  mode: ShortsGenerationMode,
  activeModel?: string,
  activeAspect?: ShortsAspect,
): boolean => {
  if (scene.isCustomUpload || mode === 'upload') return false;
  const status = mode === 'video' ? scene.videoStatus : scene.imageStatus;
  if (status !== 'ready') return false;
  if (scene.visualPromptSnapshot !== undefined && scene.visualPromptSnapshot !== scene.imagePrompt) {
    return true;
  }
  if (
    activeModel !== undefined &&
    scene.visualModelSnapshot !== undefined &&
    scene.visualModelSnapshot !== activeModel
  ) {
    return true;
  }
  if (
    activeAspect !== undefined &&
    scene.visualAspectSnapshot !== undefined &&
    scene.visualAspectSnapshot !== activeAspect
  ) {
    return true;
  }
  return false;
};

export const formatDuration = (seconds: number): string => {
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : `${secs}s`;
};

// --- persistence --------------------------------------------------------------

export const toPersistedProject = (project: ShortsProject): PersistedShortsProject => ({
  topic: project.topic,
  title: project.title,
  aspect: project.aspect,
  targetDurationSec: project.targetDurationSec,
  voice: project.voice,
  voiceMode: project.voiceMode ?? 'tts',
  recordedAudioBlob: project.recordedAudio?.blob,
  recordedAudioDuration: project.recordedAudio?.duration,
  generationMode: project.generationMode,
  imageModel: project.imageModel,
  videoModel: project.videoModel,
  visualStyle: project.visualStyle,
  tone: project.tone,
  captionsEnabled: project.captionsEnabled,
  captionStyle: project.captionStyle,
  captionSize: project.captionSize ?? 'medium',
  captionPosition: project.captionPosition ?? 'bottom',
  showTitleCard: project.showTitleCard,
  musicBlob: project.music?.blob,
  musicFileName: project.music?.fileName,
  musicVolume: project.music?.volume,
  savedAt: Date.now(),
  scenes: project.scenes.map<PersistedShortsScene>((scene) => ({
    id: scene.id,
    narration: scene.narration,
    imagePrompt: scene.imagePrompt,
    seed: scene.seed,
    isCustomUpload: scene.isCustomUpload,
    isCustomAudio: scene.isCustomAudio,
    isTitleCard: scene.isTitleCard,
    imageBlob: scene.imageBlob ?? undefined,
    videoBlob: scene.videoBlob ?? undefined,
    audioBlob: scene.audioBlob ?? undefined,
    audioDuration: scene.audioDuration,
    audioNarrationSnapshot: scene.audioNarrationSnapshot,
    visualPromptSnapshot: scene.visualPromptSnapshot,
    visualModelSnapshot: scene.visualModelSnapshot,
    visualAspectSnapshot: scene.visualAspectSnapshot,
  })),
});

/** Rebuild a live project, minting fresh object URLs from the stored Blobs. */
export const fromPersistedProject = (persisted: PersistedShortsProject): ShortsProject => ({
  topic: persisted.topic,
  title: persisted.title,
  aspect: persisted.aspect,
  targetDurationSec: persisted.targetDurationSec,
  voice: resolveVoice(persisted.voice),
  voiceMode: (persisted.voiceMode as ShortsVoiceMode) || 'tts',
  recordedAudio: persisted.recordedAudioBlob
    ? {
        blob: persisted.recordedAudioBlob,
        url: URL.createObjectURL(persisted.recordedAudioBlob),
        duration: persisted.recordedAudioDuration ?? 0,
      }
    : null,
  generationMode: persisted.generationMode || 'image',
  imageModel: persisted.imageModel || DEFAULT_POLLINATIONS_IMAGE_MODEL,
  videoModel: persisted.videoModel || DEFAULT_POLLINATIONS_VIDEO_MODEL,
  visualStyle: persisted.visualStyle,
  tone: (persisted.tone as ShortsTone) || 'punchy',
  captionsEnabled: persisted.captionsEnabled,
  captionStyle: persisted.captionStyle,
  captionSize: persisted.captionSize || 'medium',
  captionPosition: persisted.captionPosition || 'bottom',
  showTitleCard: persisted.showTitleCard,
  music: persisted.musicBlob
    ? {
        blob: persisted.musicBlob,
        fileName: persisted.musicFileName ?? 'Background music',
        volume: persisted.musicVolume ?? 0.12,
      }
    : null,
  scenes: persisted.scenes.map<ShortsScene>((scene) => ({
    id: scene.id,
    narration: scene.narration,
    imagePrompt: scene.imagePrompt,
    seed: scene.seed,
    isCustomUpload: scene.isCustomUpload,
    isCustomAudio: scene.isCustomAudio,
    isTitleCard: scene.isTitleCard,
    imageBlob: scene.imageBlob ?? null,
    imageUrl: scene.imageBlob ? URL.createObjectURL(scene.imageBlob) : null,
    imageStatus: scene.imageBlob ? 'ready' : 'idle',
    videoBlob: scene.videoBlob ?? null,
    videoUrl: scene.videoBlob ? URL.createObjectURL(scene.videoBlob) : null,
    videoStatus: scene.videoBlob ? 'ready' : 'idle',
    audioBlob: scene.audioBlob ?? null,
    audioUrl: scene.audioBlob ? URL.createObjectURL(scene.audioBlob) : null,
    audioDuration: scene.audioDuration,
    audioStatus: scene.audioBlob ? 'ready' : 'idle',
    audioNarrationSnapshot: scene.audioNarrationSnapshot,
    visualPromptSnapshot: scene.visualPromptSnapshot,
    visualModelSnapshot: scene.visualModelSnapshot,
    visualAspectSnapshot: scene.visualAspectSnapshot,
  })),
});

/** Release every object URL a project holds. Call before discarding it. */
export const revokeProjectUrls = (project: ShortsProject): void => {
  if (project.recordedAudio?.url) URL.revokeObjectURL(project.recordedAudio.url);
  project.scenes.forEach((scene) => {
    if (scene.imageUrl) URL.revokeObjectURL(scene.imageUrl);
    if (scene.videoUrl) URL.revokeObjectURL(scene.videoUrl);
    if (scene.audioUrl) URL.revokeObjectURL(scene.audioUrl);
  });
};

/** Convert any decoded AudioBuffer to standard 16-bit PCM WAV bytes. */
export const audioBufferToWav = (buffer: AudioBuffer): Uint8Array => {
  const numberOfChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = numberOfChannels * bytesPerSample;
  const dataSize = buffer.length * blockAlign;
  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: numberOfChannels }, (_, i) => buffer.getChannelData(i));
  let offset = 44;
  for (let sample = 0; sample < buffer.length; sample += 1) {
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      const value = Math.max(-1, Math.min(1, channels[channel][sample] || 0));
      view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
      offset += 2;
    }
  }

  return new Uint8Array(wavBuffer);
};

/**
 * Distributes a single recorded voiceover audio Blob across a short's scenes,
 * proportioned by the length/word-count of each scene's narration.
 */
export const applyRecordedAudioToScenes = async (
  audioBlob: Blob,
  scenes: ShortsScene[],
): Promise<ShortsScene[]> => {
  if (!scenes.length) return scenes;

  const arrayBuffer = await audioBlob.arrayBuffer();
  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtxClass();

  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    const totalDuration = decoded.duration;
    const sampleRate = decoded.sampleRate;
    const numChannels = Math.min(2, decoded.numberOfChannels);

    // Compute weights based on word lengths in each scene's narration
    const weights = scenes.map((s) => {
      const words = s.narration.trim().split(/\s+/).filter(Boolean);
      return Math.max(1, words.reduce((acc, w) => acc + Math.max(2, w.length), 0));
    });
    const totalWeight = weights.reduce((acc, w) => acc + w, 0);

    let startSec = 0;
    const result: ShortsScene[] = [];

    for (let i = 0; i < scenes.length; i += 1) {
      const isLast = i === scenes.length - 1;
      const spanSec = isLast
        ? Math.max(0.2, totalDuration - startSec)
        : (weights[i] / totalWeight) * totalDuration;
      const endSec = isLast ? totalDuration : Math.min(totalDuration, startSec + spanSec);
      const actualDuration = Math.max(0.1, endSec - startSec);

      const startSample = Math.min(decoded.length - 1, Math.floor(startSec * sampleRate));
      const endSample = Math.min(
        decoded.length,
        Math.max(startSample + 1, Math.ceil(endSec * sampleRate)),
      );
      const sliceLength = Math.max(1, endSample - startSample);

      const sliceBuffer = audioCtx.createBuffer(numChannels, sliceLength, sampleRate);
      for (let ch = 0; ch < numChannels; ch += 1) {
        const channelData = decoded.getChannelData(ch).subarray(startSample, endSample);
        sliceBuffer.copyToChannel(channelData, ch);
      }

      const wavBytes = audioBufferToWav(sliceBuffer);
      const sliceBlob = new Blob([wavBytes], { type: 'audio/wav' });
      const sliceUrl = URL.createObjectURL(sliceBlob);

      if (scenes[i].audioUrl) {
        URL.revokeObjectURL(scenes[i].audioUrl!);
      }

      result.push({
        ...scenes[i],
        audioBlob: sliceBlob,
        audioUrl: sliceUrl,
        audioDuration: actualDuration,
        audioStatus: 'ready',
        audioError: null,
        audioNarrationSnapshot: scenes[i].narration,
      });

      startSec = endSec;
    }

    return result;
  } finally {
    void audioCtx.close().catch(() => {});
  }
};
