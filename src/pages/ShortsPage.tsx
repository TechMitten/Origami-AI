import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Film,
  Image as ImageIcon,
  KeyRound,
  Loader2,
  Mic,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import backgroundImage from '../assets/images/background.jpg';
import { Footer } from '../components/Footer';
import { PageHeader } from '../components/PageHeader';
import { GlobalSettingsModal } from '../components/GlobalSettingsModal';
import { MobileWarningModal } from '../components/MobileWarningModal';
import { WebGPUInstructionsModal } from '../components/WebGPUInstructionsModal';
import { WebLLMLoadingModal } from '../components/WebLLMLoadingModal';
import { RuntimeResourceModal } from '../components/RuntimeResourceModal';
import { MusicPickerModal } from '../components/MusicPickerModal';
import { useBackgroundDownload } from '../context/BackgroundDownloadContext';
import { ShortsComposer } from '../components/shorts/ShortsComposer';
import { ShortsStoryboard } from '../components/shorts/ShortsStoryboard';
import { Dropdown } from '../components/Dropdown';
import { ShortsPreviewPlayer } from '../components/shorts/ShortsPreviewPlayer';
import { ShortsRenderModal, type ShortsRenderPhase } from '../components/shorts/ShortsRenderModal';
import { VoiceAuditionModal } from '../components/shorts/VoiceAuditionModal';
import { PollinationsInfoModal } from '../components/shorts/PollinationsInfoModal';
import { useModal } from '../context/ModalContext';
import { usePageMeta } from '../hooks/usePageMeta';

import {
  checkWebGPUSupport,
  getCurrentWebLLMModel,
  getDefaultWebLlmModel,
  getWebLlmModelInfo,
  initWebLLM,
  isWebLLMLoaded,
} from '../services/webLlmService';
import { initTTS, DEFAULT_VOICES } from '../services/ttsService';
import { isFreePollinationsModel, listImageModels, POLLINATIONS_IMAGE_MODELS, resolvePollinationsKey } from '../services/pollinationsService';
import { listVideoModels, POLLINATIONS_VIDEO_MODELS } from '../services/pollinationsVideoService';
import { composeVisualPrompt, extendNarration, generateShortsScript, regenerateImagePrompt } from '../services/shortsScriptService';
import {
  ShortsRenderAbortedError,
  ShortsVideoRenderer,
  type ShortsRenderScene,
} from '../services/ShortsVideoRenderer';
import {
  createEmptyProject,
  createScene,
  formatDuration,
  fromPersistedProject,
  generateSceneAudio,
  generateSceneImage,
  generateSceneVideo,
  isProjectRenderable,
  isSceneAudioStale,
  isSceneVisualStale,
  projectDuration,
  revokeProjectUrls,
  sceneCaptions,
  toPersistedProject,
  type ShortsProject,
  type ShortsScene,
} from '../services/shortsProject';
import {
  clearShortsProject,
  loadGlobalSettings,
  loadShortsProject,
  saveGlobalSettings,
  saveShortsProject,
  type GlobalSettings,
} from '../services/storage';
import type { IncompetechCachedTrack } from '../types/music';

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  isEnabled: true,
  voice: 'af_heart',
  delay: 0.5,
  transition: 'fade',
  introFadeInEnabled: true,
  introFadeInDurationSec: 1,
  previewMode: 'modal',
  aspectRatio: '9:16',
};

type Stage = 'compose' | 'storyboard';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * One asset track in the monitor. The bar stays neutral while a track is part
 * way there and only turns cyan on the last scene, so "all of them" reads at a
 * glance rather than having to be counted.
 */
const ReadyTrack: React.FC<{
  label: string;
  icon: React.ReactNode;
  ready: number;
  total: number;
}> = ({ label, icon, ready, total }) => {
  const complete = total > 0 && ready === total;
  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden className={cn('shrink-0', complete ? 'text-cyan-300' : 'text-white/30')}>
          {icon}
        </span>
        <span className="min-w-0 flex-1 text-xs text-white/55">{label}</span>
        <span className={cn('font-mono text-xs tabular-nums', complete ? 'text-cyan-200' : 'text-white/70')}>
          {ready}/{total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} ready`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={ready}
        className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500',
            complete ? 'bg-cyan-400' : 'bg-white/40',
          )}
          style={{ width: total ? `${(ready / total) * 100}%` : '0%' }}
        />
      </div>
    </div>
  );
};

/**
 * The page has exactly one next action at any moment — write the script,
 * generate the media, or export. All three share this button so the step you
 * are on is always in the same place, in the same shape.
 */
const PrimaryAction: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  busy: boolean;
  className?: string;
}> = ({ onClick, icon, label, disabled, busy, className }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled || busy}
    aria-busy={busy || undefined}
    className={cn(
      'focus-ring flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-4 text-sm font-bold transition-all',
      busy
        ? 'animate-pulse-glow cursor-wait border border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
        : disabled
          ? 'cursor-not-allowed border border-white/10 bg-white/[0.06] text-white/40'
          : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-black shadow-[0_10px_40px_-12px_rgba(34,211,238,0.9)] hover:brightness-110 active:brightness-95',
      className,
    )}
  >
    {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : icon}
    <span className="truncate">{label}</span>
  </button>
);

const markWebLLMAsCached = () => {
  try {
    const current = JSON.parse(
      localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}',
    );
    current.webllm = true;
    localStorage.setItem('resource_cache_status', JSON.stringify(current));
  } catch {
    localStorage.setItem('resource_cache_status', '{"tts":false,"ffmpeg":false,"webllm":true}');
  }
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'short';

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong.';

export const ShortsPage: React.FC = () => {
  usePageMeta({
    title: 'AI Shorts Generator — Origami AI',
    description:
      'Create faceless AI shorts with generated visuals, auto-captions, and local text-to-speech. Script, storyboard, and render short-form videos entirely in your browser.',
    path: '/shorts',
  });

  const { showAlert, showConfirm } = useModal();

  const [project, setProject] = useState<ShortsProject>(() => createEmptyProject());
  const [stage, setStage] = useState<Stage>('compose');
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);
  const [splashPhase, setSplashPhase] = useState<'fade-in' | 'fade-out' | 'done'>('fade-in');

  // The static list renders instantly; the live catalogue (a public,
  // unauthenticated read) replaces it on mount so every model the Pollinations
  // API offers is selectable, not just the ones baked into the bundle.
  const [imageModels, setImageModels] = useState(POLLINATIONS_IMAGE_MODELS);
  const [videoModels, setVideoModels] = useState(POLLINATIONS_VIDEO_MODELS);

  const [isBusy, setIsBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');

  // Per-scene "extend narration" requests in flight, plus whether the current
  // batch is the "extend every scene" bulk action rather than a single card.
  const [extendingIds, setExtendingIds] = useState<Set<string>>(new Set());
  const [isExtendingAll, setIsExtendingAll] = useState(false);
  const [rewritingPromptIds, setRewritingPromptIds] = useState<Set<string>>(new Set());

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWebGPUModalOpen, setIsWebGPUModalOpen] = useState(false);
  const [isWebLLMLoadingOpen, setIsWebLLMLoadingOpen] = useState(false);
  const [isMusicPickerOpen, setIsMusicPickerOpen] = useState(false);
  const [isVoiceAuditionOpen, setIsVoiceAuditionOpen] = useState(false);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [isPollinationsInfoOpen, setIsPollinationsInfoOpen] = useState(false);

  const { startBackgroundDownloads, endBackgroundDownloads } = useBackgroundDownload();

  const [renderPhase, setRenderPhase] = useState<ShortsRenderPhase | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatus, setRenderStatus] = useState('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);

  const generationAbortRef = useRef<AbortController | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);
  const rendererRef = useRef(new ShortsVideoRenderer());
  const projectRef = useRef(project);
  projectRef.current = project;

  const pollinationsKey = useMemo(
    () => resolvePollinationsKey(globalSettings.pollinationsApiKey, globalSettings.pollinationsTokenExpiresAt),
    [globalSettings.pollinationsApiKey, globalSettings.pollinationsTokenExpiresAt],
  );

  // The free image model runs against the keyless endpoint, so "not connected"
  // is not a dead end for stills the way it is for clips and paid models.
  const usingFreeImageModel =
    project.generationMode !== 'video' && isFreePollinationsModel(project.imageModel);

  const openAIConfigured = !!(
    globalSettings.openaiEndpoint &&
    globalSettings.openaiModel &&
    globalSettings.openaiApiKey
  );

  const useOpenAI = !!globalSettings.shortsUseOpenAI;

  const webLlmModelLabel =
    getWebLlmModelInfo(globalSettings.webLlmModel)?.name ?? globalSettings.webLlmModel ?? 'No model selected';

  // Show the branded splash on every /shorts visit, fading in on mount and
  // fading back out before it unmounts. Each phase owns its own timer so a
  // skip mid-fade still lands on 'done'.
  useEffect(() => {
    if (splashPhase === 'fade-in') {
      const timer = window.setTimeout(() => setSplashPhase('fade-out'), 1000);
      return () => window.clearTimeout(timer);
    }
    if (splashPhase === 'fade-out') {
      const timer = window.setTimeout(() => setSplashPhase('done'), 500);
      return () => window.clearTimeout(timer);
    }
  }, [splashPhase]);

  const skipSplash = useCallback(() => {
    setSplashPhase((phase) => (phase === 'fade-in' ? 'fade-out' : phase));
  }, []);

  // A splash nobody can dismiss is a three-second wall in front of the work.
  useEffect(() => {
    if (splashPhase !== 'fade-in') return;
    window.addEventListener('keydown', skipSplash);
    return () => window.removeEventListener('keydown', skipSplash);
  }, [splashPhase, skipSplash]);

  const totalDuration = useMemo(() => projectDuration(project.scenes), [project.scenes]);
  const renderable = isProjectRenderable(project);

  // --- load / persist ---------------------------------------------------------

  useEffect(() => {
    let mounted = true;

    (async () => {
      const [settings, draft] = await Promise.all([loadGlobalSettings(), loadShortsProject()]);
      if (!mounted) return;

      const merged = { ...DEFAULT_GLOBAL_SETTINGS, ...(settings ?? {}) };
      setGlobalSettings(merged);

      if (draft?.scenes?.length) {
        const restored = fromPersistedProject(draft);
        setProject(restored);
        setStage('storyboard');
      } else {
        setProject((prev) => ({
          ...prev,
          voice: merged.shortsVoice || merged.voice || prev.voice,
          imageModel: merged.pollinationsImageModel || prev.imageModel,
          captionStyle: merged.shortsCaptionStyle || prev.captionStyle,
        }));
      }

      // The TTS worker downloads ~80MB on first use; start it while the user types.
      try {
        initTTS(merged.ttsQuantization || 'q8');
      } catch (e) {
        console.warn('[Shorts] TTS init could not be started:', e);
      }

      // Landing on /shorts directly skips the landing page's one-time WebGPU/WebLLM
      // setup prompt, so check for it here too or a local model never gets installed
      // until the user hits an alert mid-generation.
      if (!merged.shortsUseOpenAI) {
        const cached = JSON.parse(
          localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}',
        );
        const hideSetupModal = localStorage.getItem('hide_setup_modal') === 'true';
        if (!cached.webllm && !hideSetupModal) {
          setIsResourceModalOpen(true);
        }
      }
    })();

    // listImageModels/listVideoModels never reject; they resolve the static
    // fallback on failure.
    void listImageModels().then((models) => {
      if (mounted) setImageModels(models);
    });
    void listVideoModels().then((models) => {
      if (mounted) setVideoModels(models);
    });

    return () => {
      mounted = false;
      generationAbortRef.current?.abort();
      renderAbortRef.current?.abort();
    };
  }, []);

  // Autosave the draft. Debounced so typing in a narration box does not thrash
  // IndexedDB with full-project writes (each carries every image and audio Blob).
  useEffect(() => {
    if (!project.scenes.length) return;

    const timer = window.setTimeout(() => {
      void saveShortsProject(toPersistedProject(project)).catch((e) =>
        console.warn('[Shorts] Draft could not be saved:', e),
      );
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [project]);

  const patchProject = useCallback((patch: Partial<ShortsProject>) => {
    setProject((prev) => ({ ...prev, ...patch }));

    // Persist the image model choice to global settings immediately (rather than relying
    // on the project autosave, which only kicks in once scenes exist) so it survives a
    // refresh even from the composer stage, before anything has been generated yet.
    if (patch.imageModel) {
      setGlobalSettings((prev) => {
        if (prev.pollinationsImageModel === patch.imageModel) return prev;
        const next = { ...prev, pollinationsImageModel: patch.imageModel };
        void saveGlobalSettings(next).catch((e) =>
          console.warn('[Shorts] Could not persist default image model:', e),
        );
        return next;
      });
    }
  }, []);

  const patchScene = useCallback((id: string, patch: Partial<ShortsScene>) => {
    setProject((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) => (scene.id === id ? { ...scene, ...patch } : scene)),
    }));
  }, []);

  // --- model readiness --------------------------------------------------------

  const ensureScriptEngineReady = useCallback(async (): Promise<boolean> => {
    if (useOpenAI) {
      if (!openAIConfigured) {
        setIsSettingsOpen(true);
        return false;
      }
      return true;
    }

    const support = await checkWebGPUSupport();
    if (!support.supported) {
      setIsWebGPUModalOpen(true);
      return false;
    }

    if (!globalSettings.webLlmModel) {
      await showAlert('Choose a local model in Settings first, or switch the script engine to an API endpoint.', {
        type: 'warning',
        title: 'No model selected',
      });
      setIsSettingsOpen(true);
      return false;
    }

    if (isWebLLMLoaded() && getCurrentWebLLMModel() === globalSettings.webLlmModel) return true;

    setIsWebLLMLoadingOpen(true);
    try {
      await initWebLLM(globalSettings.webLlmModel, () => {});
      markWebLLMAsCached();
      return true;
    } catch (e) {
      await showAlert(errorMessage(e), { type: 'error', title: 'Model load failed' });
      return false;
    } finally {
      setIsWebLLMLoadingOpen(false);
    }
  }, [useOpenAI, openAIConfigured, globalSettings.webLlmModel, showAlert]);

  // Mirrors the landing page's one-time setup: pick a WebGPU-compatible default
  // model and download it in the background, so a direct /shorts visit doesn't
  // skip the check entirely and only surface it as a mid-generation dead end.
  const handleResourceSetupConfirm = useCallback(
    async (dontShowAgain?: boolean) => {
      setIsResourceModalOpen(false);
      if (dontShowAgain) {
        localStorage.setItem('hide_setup_modal', 'true');
      }

      const cached = JSON.parse(
        localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}',
      );
      if (cached.webllm) return;

      startBackgroundDownloads({ tts: false, ffmpeg: false, webllm: true });
      try {
        const webgpuStatus = await checkWebGPUSupport();
        if (!webgpuStatus.supported) {
          setIsWebGPUModalOpen(true);
          return;
        }

        const configuredModel = getWebLlmModelInfo(globalSettings.webLlmModel);
        const isConfiguredModelCompatible =
          configuredModel && (webgpuStatus.hasF16 || configuredModel.precision === 'f32');
        const model = isConfiguredModelCompatible ? configuredModel!.id : getDefaultWebLlmModel(webgpuStatus.hasF16);

        const next = { ...globalSettings, useWebLLM: true, webLlmModel: model };
        await saveGlobalSettings(next);
        setGlobalSettings(next);

        await initWebLLM(model, () => {});
        markWebLLMAsCached();
      } catch (e) {
        console.warn('[Shorts] Background WebLLM setup failed:', e);
      } finally {
        endBackgroundDownloads();
      }
    },
    [globalSettings, startBackgroundDownloads, endBackgroundDownloads],
  );

  const llmOptions = useCallback(
    (signal?: AbortSignal) => ({
      useOpenAI,
      webLlmModel: globalSettings.webLlmModel,
      llmSettings: {
        apiKey: globalSettings.openaiApiKey ?? '',
        baseUrl: globalSettings.openaiEndpoint ?? '',
        model: globalSettings.openaiModel ?? '',
      },
      signal,
    }),
    [useOpenAI, globalSettings.webLlmModel, globalSettings.openaiApiKey, globalSettings.openaiEndpoint, globalSettings.openaiModel],
  );

  // --- asset generation -------------------------------------------------------

  const runSceneImage = useCallback(
    async (scene: ShortsScene, target: ShortsProject, signal: AbortSignal) => {
      patchScene(scene.id, { imageStatus: 'pending', imageError: null });
      try {
        const { blob, url } = await generateSceneImage(scene, target, { apiKey: pollinationsKey, signal });
        // Release the previous URL now that a replacement exists.
        if (scene.imageUrl) URL.revokeObjectURL(scene.imageUrl);
        patchScene(scene.id, {
          imageBlob: blob,
          imageUrl: url,
          imageStatus: 'ready',
          imageError: null,
          visualPromptSnapshot: scene.imagePrompt,
          visualModelSnapshot: target.imageModel,
          visualAspectSnapshot: target.aspect,
        });
      } catch (e) {
        if (signal.aborted) return;
        patchScene(scene.id, { imageStatus: 'error', imageError: errorMessage(e) });
      }
    },
    [patchScene, pollinationsKey],
  );

  const runSceneVideo = useCallback(
    async (scene: ShortsScene, target: ShortsProject, signal: AbortSignal) => {
      patchScene(scene.id, { videoStatus: 'pending', videoError: null });
      try {
        const { blob, url } = await generateSceneVideo(scene, target, { apiKey: pollinationsKey, signal });
        if (scene.videoUrl) URL.revokeObjectURL(scene.videoUrl);
        patchScene(scene.id, {
          videoBlob: blob,
          videoUrl: url,
          videoStatus: 'ready',
          videoError: null,
          visualPromptSnapshot: scene.imagePrompt,
          visualModelSnapshot: target.videoModel,
          visualAspectSnapshot: target.aspect,
        });
      } catch (e) {
        if (signal.aborted) return;
        patchScene(scene.id, { videoStatus: 'error', videoError: errorMessage(e) });
      }
    },
    [patchScene, pollinationsKey],
  );

  const runSceneVisual = useCallback(
    (scene: ShortsScene, target: ShortsProject, signal: AbortSignal) =>
      target.generationMode === 'video'
        ? runSceneVideo(scene, target, signal)
        : runSceneImage(scene, target, signal),
    [runSceneImage, runSceneVideo],
  );

  const runSceneAudio = useCallback(
    async (scene: ShortsScene, voice: string, signal: AbortSignal) => {
      patchScene(scene.id, { audioStatus: 'pending', audioError: null });
      try {
        const { blob, url, duration } = await generateSceneAudio(scene, voice);
        if (signal.aborted) {
          URL.revokeObjectURL(url);
          return;
        }
        if (scene.audioUrl) URL.revokeObjectURL(scene.audioUrl);
        patchScene(scene.id, {
          audioBlob: blob,
          audioUrl: url,
          audioDuration: duration,
          audioStatus: 'ready',
          audioError: null,
          audioNarrationSnapshot: scene.narration,
        });
      } catch (e) {
        if (signal.aborted) return;
        patchScene(scene.id, { audioStatus: 'error', audioError: errorMessage(e) });
      }
    },
    [patchScene],
  );

  // --- main generation flow ---------------------------------------------------

  const handleGenerate = useCallback(async () => {
    if (!project.topic.trim()) return;

    const ready = await ensureScriptEngineReady();
    if (!ready) return;

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    setIsBusy(true);
    setBusyLabel('Writing the script...');

    try {
      const script = await generateShortsScript(
        {
          topic: project.topic,
          targetDurationSec: project.targetDurationSec,
          visualStyle: project.visualStyle,
          tone: project.tone,
          aspect: project.aspect,
          captionsEnabled: project.captionsEnabled,
          generationMode: project.generationMode,
        },
        { ...llmOptions(controller.signal), onStage: setBusyLabel },
      );

      if (controller.signal.aborted) return;

      // Discard any previous run's assets before replacing the scene list.
      revokeProjectUrls(projectRef.current);

      const scenes = script.scenes.map((s) => createScene(s.narration, s.imagePrompt));
      const nextProject: ShortsProject = { ...projectRef.current, title: script.title, scenes };
      setProject(nextProject);
      setStage('storyboard');
      
      // Stop here to allow the user to approve the script before generating media.
    } catch (e) {
      if (controller.signal.aborted) return;
      await showAlert(errorMessage(e), { type: 'error', title: 'Generation failed' });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsBusy(false);
      setBusyLabel('');
    }
  }, [
    project.topic,
    project.targetDurationSec,
    project.visualStyle,
    project.tone,
    project.aspect,
    project.captionsEnabled,
    project.generationMode,
    ensureScriptEngineReady,
    llmOptions,
    showAlert,
  ]);

  const handleGenerateVisuals = useCallback(async () => {
    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    const isVideo = projectRef.current.generationMode === 'video';
    setIsBusy(true);
    setBusyLabel(isVideo ? 'Generating clips...' : 'Generating images...');

    try {
      const scenes = projectRef.current.scenes;
      await Promise.all(scenes.map((scene) => {
        const needsVisual = ['idle', 'error'].includes(isVideo ? scene.videoStatus : scene.imageStatus);
        return needsVisual ? runSceneVisual(scene, projectRef.current, controller.signal) : Promise.resolve();
      }));
    } catch (e) {
      if (controller.signal.aborted) return;
      await showAlert(errorMessage(e), {
        type: 'error',
        title: isVideo ? 'Clip generation failed' : 'Image generation failed',
      });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsBusy(false);
      setBusyLabel('');
    }
  }, [runSceneVisual, showAlert]);

  const handleGenerateAudio = useCallback(async () => {
    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    setIsBusy(true);
    setBusyLabel('Generating voiceover...');

    try {
      const scenes = projectRef.current.scenes;
      for (const scene of scenes) {
        if (controller.signal.aborted) return;
        const needsAudio = ['idle', 'error'].includes(scene.audioStatus);
        if (needsAudio) {
          await runSceneAudio(scene, projectRef.current.voice, controller.signal);
        }
      }
    } catch (e) {
      if (controller.signal.aborted) return;
      await showAlert(errorMessage(e), { type: 'error', title: 'Voiceover generation failed' });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsBusy(false);
      setBusyLabel('');
    }
  }, [runSceneAudio, showAlert]);

  // Re-renders only the audio/visuals whose scripted text or prompt has drifted
  // from what was actually used to generate the asset currently on the scene.
  const handleRegenerateStale = useCallback(async () => {
    const current = projectRef.current;
    const activeVisualModel =
      current.generationMode === 'video' ? current.videoModel : current.imageModel;
    const staleVisualScenes = current.scenes.filter((s) =>
      isSceneVisualStale(s, current.generationMode, activeVisualModel, current.aspect),
    );
    const staleAudioScenes = current.scenes.filter((s) => isSceneAudioStale(s));
    if (!staleVisualScenes.length && !staleAudioScenes.length) return;

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    setIsBusy(true);
    setBusyLabel('Regenerating edited scenes...');

    try {
      const visuals = Promise.all(
        staleVisualScenes.map((scene) => runSceneVisual(scene, current, controller.signal)),
      );

      const audio = (async () => {
        for (const scene of staleAudioScenes) {
          if (controller.signal.aborted) return;
          await runSceneAudio(scene, current.voice, controller.signal);
        }
      })();

      await Promise.all([visuals, audio]);
    } catch (e) {
      if (controller.signal.aborted) return;
      await showAlert(errorMessage(e), { type: 'error', title: 'Regeneration failed' });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsBusy(false);
      setBusyLabel('');
    }
  }, [runSceneVisual, runSceneAudio, showAlert]);

  // --- per-scene actions ------------------------------------------------------

  const handleRegenerateImage = useCallback(
    (id: string) => {
      const current = projectRef.current;
      const scene = current.scenes.find((s) => s.id === id);
      if (!scene) return;

      // New seed so a re-roll actually produces a different image; Pollinations
      // returns the cached result for an identical prompt+seed.
      const reseeded = { ...scene, seed: Math.floor(Math.random() * 2_147_483_000) };
      patchScene(id, { seed: reseeded.seed });
      void runSceneImage(reseeded, current, new AbortController().signal);
    },
    [patchScene, runSceneImage],
  );

  const handleRegenerateVideo = useCallback(
    (id: string) => {
      const current = projectRef.current;
      const scene = current.scenes.find((s) => s.id === id);
      if (!scene) return;

      // New seed so a re-roll actually produces a different clip; Pollinations
      // returns the cached result for an identical prompt+seed.
      const reseeded = { ...scene, seed: Math.floor(Math.random() * 2_147_483_000) };
      patchScene(id, { seed: reseeded.seed });
      void runSceneVideo(reseeded, current, new AbortController().signal);
    },
    [patchScene, runSceneVideo],
  );

  const handleRegenerateVisual = useCallback(
    (id: string) => {
      if (projectRef.current.generationMode === 'video') {
        handleRegenerateVideo(id);
      } else {
        handleRegenerateImage(id);
      }
    },
    [handleRegenerateImage, handleRegenerateVideo],
  );

  const handleRegenerateAudio = useCallback(
    (id: string) => {
      const current = projectRef.current;
      const scene = current.scenes.find((s) => s.id === id);
      if (!scene) return;
      void runSceneAudio(scene, current.voice, new AbortController().signal);
    },
    [runSceneAudio],
  );

  const handleRewritePrompt = useCallback(
    async (id: string) => {
      const current = projectRef.current;
      const scene = current.scenes.find((s) => s.id === id);
      if (!scene) return;

      setRewritingPromptIds((prev) => new Set(prev).add(id));
      try {
        const prompt = await regenerateImagePrompt(
          scene.narration,
          {
            topic: current.topic,
            visualStyle: current.visualStyle,
            aspect: current.aspect,
            captionsEnabled: current.captionsEnabled,
            generationMode: current.generationMode,
          },
          llmOptions(),
        );
        patchScene(id, { imagePrompt: prompt });
      } catch (e) {
        console.warn('[Shorts] Rewrite prompt failed:', e);
      } finally {
        setRewritingPromptIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [llmOptions, patchScene],
  );

  const handleExtendScene = useCallback(
    async (id: string) => {
      const current = projectRef.current;
      const scene = current.scenes.find((s) => s.id === id);
      if (!scene) return;

      const ready = await ensureScriptEngineReady();
      if (!ready) return;

      setExtendingIds((prev) => new Set(prev).add(id));
      try {
        const extended = await extendNarration(
          scene.narration,
          { topic: current.topic, tone: current.tone },
          llmOptions(),
        );
        patchScene(id, { narration: extended });
      } catch (e) {
        await showAlert(errorMessage(e), { type: 'error', title: 'Could not extend line' });
      } finally {
        setExtendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [ensureScriptEngineReady, llmOptions, patchScene, showAlert],
  );

  // Sequential, not parallel: extendNarration goes through the same single
  // WebLLM engine as every other script pass (see shortsScriptService), which
  // resetChat()s per call and cannot serve concurrent requests.
  const handleExtendAllScenes = useCallback(async () => {
    const current = projectRef.current;
    if (!current.scenes.length) return;

    const ready = await ensureScriptEngineReady();
    if (!ready) return;

    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;

    setIsExtendingAll(true);
    let failures = 0;
    try {
      for (const scene of current.scenes) {
        if (controller.signal.aborted) return;
        if (!scene.narration.trim()) continue;

        setExtendingIds((prev) => new Set(prev).add(scene.id));
        try {
          const extended = await extendNarration(
            scene.narration,
            { topic: current.topic, tone: current.tone },
            llmOptions(controller.signal),
          );
          patchScene(scene.id, { narration: extended });
        } catch (e) {
          if (controller.signal.aborted) return;
          failures += 1;
          console.warn('[Shorts] Failed to extend scene', scene.id, e);
        } finally {
          setExtendingIds((prev) => {
            const next = new Set(prev);
            next.delete(scene.id);
            return next;
          });
        }
      }

      if (failures > 0) {
        await showAlert(`Could not extend ${failures} of ${current.scenes.length} scene${current.scenes.length > 1 ? 's' : ''}. Try those individually.`, {
          type: 'warning',
          title: 'Some scenes were not extended',
        });
      }
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsExtendingAll(false);
    }
  }, [ensureScriptEngineReady, llmOptions, patchScene, showAlert]);

  const handleDeleteScene = useCallback((id: string) => {
    setProject((prev) => {
      const scene = prev.scenes.find((s) => s.id === id);
      if (scene?.imageUrl) URL.revokeObjectURL(scene.imageUrl);
      if (scene?.videoUrl) URL.revokeObjectURL(scene.videoUrl);
      if (scene?.audioUrl) URL.revokeObjectURL(scene.audioUrl);
      return { ...prev, scenes: prev.scenes.filter((s) => s.id !== id) };
    });
  }, []);

  const handleAddScene = useCallback(() => {
    setProject((prev) => ({
      ...prev,
      // Same composer the script pass uses, so a hand-added scene inherits the
      // project's framing and no-text clauses rather than just the raw style.
      scenes: [...prev.scenes, createScene('', composeVisualPrompt(prev.topic, prev))],
    }));
  }, []);

  const handleBackToSetup = useCallback(() => {
    setStage('compose');
  }, []);

  const handleStartOver = useCallback(async () => {
    const confirmed = await showConfirm('Discard this short and start a new one?', {
      title: 'Start over',
      confirmText: 'Discard',
    });
    if (!confirmed) return;

    generationAbortRef.current?.abort();
    revokeProjectUrls(projectRef.current);
    await clearShortsProject();

    setProject((prev) =>
      createEmptyProject({
        aspect: prev.aspect,
        targetDurationSec: prev.targetDurationSec,
        voice: prev.voice,
        generationMode: prev.generationMode,
        imageModel: prev.imageModel,
        videoModel: prev.videoModel,
        visualStyle: prev.visualStyle,
        tone: prev.tone,
        captionsEnabled: prev.captionsEnabled,
        captionStyle: prev.captionStyle,
        showTitleCard: prev.showTitleCard,
      }),
    );
    setStage('compose');
  }, [showConfirm]);

  // --- music ------------------------------------------------------------------

  const handleSelectTrack = useCallback((track: IncompetechCachedTrack) => {
    setProject((prev) => ({
      ...prev,
      music: { blob: track.blob, fileName: track.title, volume: prev.music?.volume ?? 0.12 },
    }));
    setIsMusicPickerOpen(false);
  }, []);

  // --- render -----------------------------------------------------------------

  const handleRender = useCallback(async () => {
    const current = projectRef.current;
    if (!current.scenes.length) return;

    const missingAudio = current.scenes.filter((s) => s.audioStatus !== 'ready');
    if (missingAudio.length) {
      await showAlert(
        `${missingAudio.length} scene${missingAudio.length > 1 ? 's are' : ' is'} still missing a voiceover. Regenerate the voice on those scenes first.`,
        { type: 'warning', title: 'Not ready to render' },
      );
      return;
    }

    const controller = new AbortController();
    renderAbortRef.current = controller;

    setRenderedBlob(null);
    setRenderError(null);
    setRenderProgress(0);
    setRenderStatus('Preparing scenes...');
    setRenderPhase('rendering');

    const renderScenes: ShortsRenderScene[] = current.scenes.map((scene) => ({
      imageBlob: scene.imageBlob ?? null,
      videoBlob: scene.videoBlob ?? null,
      audioUrl: scene.audioUrl ?? null,
      audioDuration: scene.audioDuration ?? 0,
      narration: scene.narration,
      captions: sceneCaptions(scene),
    }));

    try {
      const blob = await rendererRef.current.render({
        scenes: renderScenes,
        aspect: current.aspect,
        title: current.title,
        showTitleCard: current.showTitleCard,
        captionsEnabled: current.captionsEnabled,
        captionStyle: current.captionStyle,
        music: current.music ? { blob: current.music.blob, volume: current.music.volume } : null,
        signal: controller.signal,
        onProgress: (progress, status) => {
          setRenderProgress(progress);
          setRenderStatus(status);
        },
      });

      setRenderedBlob(blob);
      setRenderPhase('done');
    } catch (e) {
      if (e instanceof ShortsRenderAbortedError || controller.signal.aborted) {
        setRenderPhase(null);
        return;
      }
      setRenderError(errorMessage(e));
      setRenderPhase('error');
    } finally {
      if (renderAbortRef.current === controller) renderAbortRef.current = null;
    }
  }, [showAlert]);

  const fileName = `${slugify(project.title || project.topic)}-${project.aspect.replace(':', 'x')}.mp4`;

  const handleDownload = useCallback(() => {
    if (!renderedBlob) return;
    const url = URL.createObjectURL(renderedBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }, [renderedBlob, fileName]);

  // Guard against losing an in-flight render to an accidental reload.
  useEffect(() => {
    if (renderPhase !== 'rendering') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [renderPhase]);

  const saveSettings = useCallback(async (next: GlobalSettings) => {
    await saveGlobalSettings(next);
    setGlobalSettings(next);
  }, []);

  const isVideoMode = project.generationMode === 'video';
  const activeVisualModel = isVideoMode ? project.videoModel : project.imageModel;
  const visualStatusOf = (scene: ShortsScene) => (isVideoMode ? scene.videoStatus : scene.imageStatus);

  // A saved project can reference a model the live catalogue no longer lists
  // (or the fetch failed); keep it selectable so the label never goes blank
  // and stale-visual detection still has an id to compare against.
  const imageModelOptions = useMemo(() => {
    if (imageModels.some((m) => m.id === project.imageModel)) return imageModels;
    return [{ id: project.imageModel, name: project.imageModel }, ...imageModels];
  }, [imageModels, project.imageModel]);

  const videoModelOptions = useMemo(() => {
    if (videoModels.some((m) => m.id === project.videoModel)) return videoModels;
    return [{ id: project.videoModel, name: project.videoModel }, ...videoModels];
  }, [videoModels, project.videoModel]);

  const sceneCount = project.scenes.length;
  const readyScenes = project.scenes.filter((s) => s.audioStatus === 'ready').length;
  const readyVisuals = project.scenes.filter((s) => visualStatusOf(s) === 'ready').length;
  const canGenerate = project.topic.trim().length > 2 && !isBusy;
  const needsVisualGeneration = project.scenes.some((s) => ['idle', 'error'].includes(visualStatusOf(s)));
  const needsAudioGeneration = project.scenes.some((s) => ['idle', 'error'].includes(s.audioStatus));
  const staleCount = project.scenes.filter(
    (s) => isSceneAudioStale(s) || isSceneVisualStale(s, project.generationMode, activeVisualModel),
  ).length;

  // One next action at a time, shown in the rail on desktop and in the docked
  // bar on narrow screens where the rail sits below a long form.
  const primary =
    stage === 'compose'
      ? {
          label: isBusy ? busyLabel || 'Generating...' : 'Generate short',
          icon: <Sparkles className="h-4 w-4 shrink-0" />,
          onClick: handleGenerate,
          disabled: !canGenerate,
          busy: isBusy,
          hint: isBusy
            ? 'Keep this tab open while it works.'
            : project.topic.trim().length > 2
              ? `Aiming for about ${project.targetDurationSec} seconds.`
              : 'Describe your topic to get started.',
        }
      : needsVisualGeneration
        ? {
            label: isBusy
              ? busyLabel || (isVideoMode ? 'Generating clips...' : 'Generating images...')
              : isVideoMode
                ? 'Generate video clips'
                : 'Generate images',
            icon: isVideoMode ? <Film className="h-4 w-4 shrink-0" /> : <ImageIcon className="h-4 w-4 shrink-0" />,
            onClick: handleGenerateVisuals,
            disabled: isBusy,
            busy: isBusy,
            hint: isBusy
              ? 'Keep this tab open while it works.'
              : `Read the script through first — this step generates every scene's ${isVideoMode ? 'clip' : 'image'}.`,
          }
        : needsAudioGeneration
          ? {
              label: isBusy ? busyLabel || 'Generating voiceover...' : 'Generate voiceover',
              icon: <Mic className="h-4 w-4 shrink-0" />,
              onClick: handleGenerateAudio,
              disabled: isBusy,
              busy: isBusy,
              hint: isBusy
                ? 'Keep this tab open while it works.'
                : 'Local text-to-speech reads each scene’s narration aloud, on device.',
            }
          : {
              label: 'Export MP4',
              icon: <Download className="h-4 w-4 shrink-0" />,
              onClick: handleRender,
              disabled: !renderable || renderPhase === 'rendering' || isBusy,
              busy: renderPhase === 'rendering',
              hint: renderable
                ? "Caption timing is estimated from each clip's length, so long words can drift."
                : 'Every scene needs a voiceover before you can export.',
            };

  return (
    <div className="isolate flex min-h-screen flex-col bg-[#0a0a0b] pb-36 pt-8 text-white lg:pb-0">
      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 h-lvh w-full scale-105 object-cover opacity-40 blur-[2px] brightness-50"
      />
      <div className="fixed inset-0 -z-40 h-lvh w-full bg-[#0a0a0b]/40" />

      {splashPhase !== 'done' && (
        <div
          onClick={skipSplash}
          // The backdrop itself must be opaque from the very first frame — animating
          // its own opacity would let the page underneath flash through while it fades in.
          className="fixed inset-0 z-[100] cursor-pointer bg-[#0a0a0b]"
        >
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center p-6 sm:p-12',
              splashPhase === 'fade-out' ? 'animate-fade-out' : 'animate-fade-in',
            )}
          >
            <img
              src="/shortsplash.png"
              alt="Shorts"
              className="max-h-full max-w-full rounded-2xl object-contain"
            />
            <button
              type="button"
              onClick={skipSplash}
              className="focus-ring absolute bottom-6 right-6 rounded px-2 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      <PageHeader
        title="Shorts"
        onSettings={() => setIsSettingsOpen(true)}
        showHelp={false}
        actionMenuContent={
          project.scenes.length
            ? (closeMenu) => (
                <button
                  onClick={() => {
                    void handleStartOver();
                    closeMenu();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <RotateCcw className="h-4 w-4" /> Start over
                </button>
              )
            : undefined
        }
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-20 sm:px-8">
        {/* Hero: the heading gives way to the short's own title in Edit, where
            the title is the thing being worked on. */}
        <div className="mb-8 mt-4 sm:mb-10">
          {stage === 'compose' ? (
            <h1 className="font-display text-[clamp(1.75rem,4.5vw,2.5rem)] font-extrabold leading-[1.1] tracking-[-0.02em] text-white">
              From a topic to a finished short.
            </h1>
          ) : (
            <div>
              <h1 className="sr-only">Editing {project.title || project.topic || 'your short'}</h1>
              <label
                htmlFor="shorts-title"
                className="mb-2 block text-[11px] font-bold uppercase tracking-[0.18em] text-white/45"
              >
                Title
              </label>
              <input
                id="shorts-title"
                value={project.title ?? ''}
                onChange={(e) => patchProject({ title: e.target.value })}
                placeholder="Untitled short"
                className="focus-ring -ml-2 w-full rounded-lg bg-transparent px-2 py-1 font-display text-[clamp(1.5rem,4vw,2.25rem)] font-extrabold leading-[1.15] tracking-[-0.02em] text-white outline-none transition-colors placeholder:text-white/25 hover:bg-white/[0.04] focus:bg-white/[0.06]"
              />
            </div>
          )}
        </div>

        {!pollinationsKey && (
          <div
            role="status"
            className="mb-8 flex flex-col gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] p-4 sm:mb-10 sm:flex-row sm:items-center"
          >
            <KeyRound className="h-4 w-4 shrink-0 text-amber-300/80" />
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-amber-100/90">
              {usingFreeImageModel
                ? 'You are not connected to Pollinations. The Free (slow) model needs no key, but images are queued behind everyone else\u2019s \u2014 expect a long wait per scene.'
                : 'You are not connected to Pollinations. Images and clips will be requested through this server, which works only if it has its own key.'}
            </p>
            <div className="flex shrink-0 items-center gap-4">
              <button
                type="button"
                onClick={() => setIsPollinationsInfoOpen(true)}
                className="focus-ring rounded text-sm font-semibold text-amber-200/80 underline underline-offset-2 transition-colors hover:text-amber-100"
              >
                Learn more
              </button>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="focus-ring rounded-lg border border-amber-300/40 px-3 py-1.5 text-xs font-semibold text-amber-100 transition-colors hover:bg-amber-300/15"
              >
                Connect
              </button>
            </div>
          </div>
        )}

        {/* The bench: controls on the left, a live monitor on the right, in both stages. */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
          <div className="min-w-0">
            {stage === 'compose' ? (
              <div className="space-y-5">
                {/* Mirror of the Edit header's "← Build" crumb: once scenes
                    exist, Build is not a one-way door — Edit stays one tap
                    away with every scene and asset intact. No confirmation
                    needed, unlike the reverse trip, because nothing is at
                    risk of being replaced. */}
                {project.scenes.length > 0 && (
                  <div className="flex items-baseline gap-3">
                    <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                      Build
                    </h2>
                    <span aria-hidden className="h-px w-6 shrink-0 bg-white/20" />
                    <button
                      type="button"
                      onClick={() => setStage('storyboard')}
                      disabled={isBusy}
                      className="focus-ring flex shrink-0 items-center gap-1.5 rounded text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300 transition-colors hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Edit
                      <ArrowRight className="h-3 w-3" />
                    </button>
                    <span className="text-[11px] text-white/35">
                      {project.scenes.length} scene{project.scenes.length > 1 ? 's' : ''} in progress
                    </span>
                  </div>
                )}

                <ShortsComposer
                  project={project}
                  onChange={patchProject}
                  onGenerate={handleGenerate}
                  onPickMusic={() => setIsMusicPickerOpen(true)}
                  onClearMusic={() => patchProject({ music: null })}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onOpenVoiceAudition={() => setIsVoiceAuditionOpen(true)}
                  isBusy={isBusy}
                  useOpenAI={useOpenAI}
                  onToggleOpenAI={(value) => void saveSettings({ ...globalSettings, shortsUseOpenAI: value })}
                  openAIConfigured={openAIConfigured}
                  webLlmModelLabel={webLlmModelLabel}
                  imageModels={imageModelOptions}
                  videoModels={videoModelOptions}
                />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-baseline gap-3">
                    <button
                      type="button"
                      onClick={handleBackToSetup}
                      className="focus-ring flex shrink-0 items-center gap-1.5 rounded text-[11px] font-bold uppercase tracking-[0.18em] text-white/70 transition-colors hover:text-white"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Build
                    </button>
                    <span aria-hidden className="h-px w-6 shrink-0 bg-white/20" />
                    <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                      Edit
                    </h2>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    {/* Same model selector as Build, so a mid-project switch
                        doesn't cost a round trip back to the composer. Changing
                        it marks ready visuals stale (see isSceneVisualStale) and
                        they regenerate through the usual stale flow. */}
                    <div className="w-44">
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
                        {isVideoMode ? 'Video model' : 'Image model'}
                      </span>
                      <Dropdown
                        options={(isVideoMode ? videoModelOptions : imageModelOptions).map(
                          (m) => ({ id: m.id, name: m.name }),
                        )}
                        value={activeVisualModel}
                        onChange={(value) =>
                          patchProject(isVideoMode ? { videoModel: value } : { imageModel: value })
                        }
                        disabled={renderPhase === 'rendering' || isBusy}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsVoiceAuditionOpen(true)}
                      className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/80 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200 transition-all"
                      title="Audition or switch voice"
                    >
                      <Mic className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Voice: <strong className="text-white">{DEFAULT_VOICES.find(v => v.id === project.voice)?.name || project.voice}</strong></span>
                    </button>
                  </div>
                </div>

                {isBusy && (
                  <div
                    role="status"
                    className="flex items-center gap-3 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.08] px-4 py-3 text-sm text-cyan-100"
                  >
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    {busyLabel || 'Working...'}
                  </div>
                )}

                <ShortsStoryboard
                  scenes={project.scenes}
                  aspect={project.aspect}
                  generationMode={project.generationMode}
                  visualModel={activeVisualModel}
                  disabled={renderPhase === 'rendering' || isExtendingAll}
                  extendingIds={extendingIds}
                  isExtendingAll={isExtendingAll}
                  rewritingPromptIds={rewritingPromptIds}
                  onReorder={(scenes) => patchProject({ scenes })}
                  onUpdateScene={patchScene}
                  onRegenerateVisual={handleRegenerateVisual}
                  onRegenerateAudio={handleRegenerateAudio}
                  onRewritePrompt={handleRewritePrompt}
                  onExtendScene={handleExtendScene}
                  onExtendAll={handleExtendAllScenes}
                  onDeleteScene={handleDeleteScene}
                  onAddScene={handleAddScene}
                />
              </div>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit lg:self-start">
            <ShortsPreviewPlayer project={project} />

            {stage === 'storyboard' && (
              <>
                {/* The monitor's readout: what exists, per asset track. Audio
                    alone used to stand in for readiness, which under-reported
                    it whenever the visuals were the ones still missing. */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
                      Ready
                    </span>
                    <span className="font-mono text-xs tabular-nums text-white/60">
                      {formatDuration(totalDuration)}
                    </span>
                  </div>

                  <div className="mt-3 space-y-3">
                    <ReadyTrack
                      label={isVideoMode ? 'Clips' : 'Frames'}
                      icon={
                        isVideoMode ? <Film className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />
                      }
                      ready={readyVisuals}
                      total={sceneCount}
                    />
                    <ReadyTrack
                      label="Voice"
                      icon={<Mic className="h-3.5 w-3.5" />}
                      ready={readyScenes}
                      total={sceneCount}
                    />
                  </div>
                </div>

                {staleCount > 0 && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-4 py-3 text-xs text-amber-100">
                    <span>
                      {staleCount} scene{staleCount > 1 ? 's' : ''} changed since generation.
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRegenerateStale()}
                      disabled={isBusy}
                      className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/40 px-3 py-1.5 font-semibold text-amber-200 transition-colors hover:border-amber-400/70 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', isBusy && 'animate-spin')} />
                      Regenerate
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Narrow screens get this same action docked at the bottom instead,
                where it stays reachable without scrolling past the whole form. */}
            <div className="hidden lg:block">
              <PrimaryAction
                onClick={primary.onClick}
                icon={primary.icon}
                label={primary.label}
                disabled={primary.disabled}
                busy={primary.busy}
              />
              <p className="mt-3 text-center text-xs leading-relaxed text-white/45">{primary.hint}</p>
            </div>
          </aside>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0a0a0b]/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
        <PrimaryAction
          onClick={primary.onClick}
          icon={primary.icon}
          label={primary.label}
          disabled={primary.disabled}
          busy={primary.busy}
          className="py-3.5"
        />
        <p className="mt-2 text-center text-[11px] leading-relaxed text-white/40">{primary.hint}</p>
      </div>

      <Footer />

      {isSettingsOpen && (
        <GlobalSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentSettings={globalSettings}
          onSave={saveSettings}
          initialTab="api"
          onShowWebGPUModal={() => setIsWebGPUModalOpen(true)}
        />
      )}

      <MusicPickerModal
        isOpen={isMusicPickerOpen}
        onClose={() => setIsMusicPickerOpen(false)}
        onSelectTrack={handleSelectTrack}
      />

      <RuntimeResourceModal isOpen={isResourceModalOpen} onConfirm={handleResourceSetupConfirm} />

      <WebGPUInstructionsModal isOpen={isWebGPUModalOpen} onClose={() => setIsWebGPUModalOpen(false)} />

      <VoiceAuditionModal
        isOpen={isVoiceAuditionOpen}
        onClose={() => setIsVoiceAuditionOpen(false)}
        selectedVoice={project.voice}
        onSelectVoice={(voiceId) => {
          patchProject({ voice: voiceId });
        }}
      />

      <PollinationsInfoModal
        isOpen={isPollinationsInfoOpen}
        onClose={() => setIsPollinationsInfoOpen(false)}
        onConnect={() => {
          setIsPollinationsInfoOpen(false);
          setIsSettingsOpen(true);
        }}
      />

      <WebLLMLoadingModal
        isOpen={isWebLLMLoadingOpen}
        onComplete={() => setIsWebLLMLoadingOpen(false)}
      />

      <ShortsRenderModal
        isOpen={renderPhase !== null}
        phase={renderPhase ?? 'rendering'}
        progress={renderProgress}
        status={renderStatus}
        error={renderError}
        fileName={fileName}
        onCancel={() => renderAbortRef.current?.abort()}
        onDownload={handleDownload}
        onClose={() => setRenderPhase(null)}
      />

      <MobileWarningModal />
    </div>
  );
};
