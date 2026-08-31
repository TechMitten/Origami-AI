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

export type ShortsGenerationMode = 'image' | 'video';

export interface ShortsProject {
  topic: string;
  title: string;
  aspect: ShortsAspect;
  targetDurationSec: number;
  voice: string;
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

export const createEmptyProject = (overrides: Partial<ShortsProject> = {}): ShortsProject => ({
  topic: '',
  title: '',
  aspect: '9:16',
  targetDurationSec: 30,
  voice: 'af_heart',
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
  project.scenes.forEach((scene) => {
    if (scene.imageUrl) URL.revokeObjectURL(scene.imageUrl);
    if (scene.videoUrl) URL.revokeObjectURL(scene.videoUrl);
    if (scene.audioUrl) URL.revokeObjectURL(scene.audioUrl);
  });
};
