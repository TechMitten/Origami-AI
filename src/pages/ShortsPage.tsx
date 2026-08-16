import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Loader2, RotateCcw, Sparkles } from 'lucide-react';
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
import { ShortsPreviewPlayer } from '../components/shorts/ShortsPreviewPlayer';
import { ShortsRenderModal, type ShortsRenderPhase } from '../components/shorts/ShortsRenderModal';
import { useModal } from '../context/ModalContext';

import {
  checkWebGPUSupport,
  getCurrentWebLLMModel,
  getDefaultWebLlmModel,
  getWebLlmModelInfo,
  initWebLLM,
  isWebLLMLoaded,
} from '../services/webLlmService';
import { initTTS } from '../services/ttsService';
import { resolvePollinationsKey } from '../services/pollinationsService';
import { generateShortsScript, regenerateImagePrompt } from '../services/shortsScriptService';
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
 * The four stages a short passes through, and where each one actually runs.
 * Rendered in the hero so the single network hop is visible up front rather
 * than buried in a paragraph — and it tracks the configured script engine.
 */
const pipelineStages = (scriptIsLocal: boolean): Array<{ label: string; where: string; local: boolean }> => [
  { label: 'Script', where: scriptIsLocal ? 'on device' : 'your endpoint', local: scriptIsLocal },
  { label: 'Frames', where: 'Pollinations', local: false },
  { label: 'Voice', where: 'on device', local: true },
  { label: 'MP4', where: 'on device', local: true },
];

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
  const { showAlert, showConfirm } = useModal();

  const [project, setProject] = useState<ShortsProject>(() => createEmptyProject());
  const [stage, setStage] = useState<Stage>('compose');
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);

  const [isBusy, setIsBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState('');

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWebGPUModalOpen, setIsWebGPUModalOpen] = useState(false);
  const [isWebLLMLoadingOpen, setIsWebLLMLoadingOpen] = useState(false);
  const [isMusicPickerOpen, setIsMusicPickerOpen] = useState(false);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);

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

  const openAIConfigured = !!(
    globalSettings.openaiEndpoint &&
    globalSettings.openaiModel &&
    globalSettings.openaiApiKey
  );

  const useOpenAI = !!globalSettings.shortsUseOpenAI;

  const webLlmModelLabel =
    getWebLlmModelInfo(globalSettings.webLlmModel)?.name ?? globalSettings.webLlmModel ?? 'No model selected';

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
        initTTS(merged.ttsQuantization || 'q4');
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
        patchScene(scene.id, { imageBlob: blob, imageUrl: url, imageStatus: 'ready', imageError: null });
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
        patchScene(scene.id, { videoBlob: blob, videoUrl: url, videoStatus: 'ready', videoError: null });
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

      setBusyLabel(
        nextProject.generationMode === 'video'
          ? 'Generating videos and voiceover...'
          : 'Generating images and voiceover...',
      );

      // Visuals fan out (the service caps concurrency); TTS stays sequential
      // because the Kokoro worker handles one request at a time.
      const visuals = Promise.all(scenes.map((scene) => runSceneVisual(scene, nextProject, controller.signal)));

      const audio = (async () => {
        for (const scene of scenes) {
          if (controller.signal.aborted) return;
          await runSceneAudio(scene, nextProject.voice, controller.signal);
        }
      })();

      await Promise.all([visuals, audio]);
    } catch (e) {
      if (controller.signal.aborted) return;
      await showAlert(errorMessage(e), { type: 'error', title: 'Generation failed' });
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null;
      setIsBusy(false);
      setBusyLabel('');
    }
  }, [project.topic, project.targetDurationSec, project.visualStyle, project.tone, ensureScriptEngineReady, llmOptions, runSceneVisual, runSceneAudio, showAlert]);

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

      const ready = await ensureScriptEngineReady();
      if (!ready) return;

      const isVideo = current.generationMode === 'video';
      patchScene(id, isVideo ? { videoStatus: 'pending' } : { imageStatus: 'pending' });
      try {
        const prompt = await regenerateImagePrompt(
          scene.narration,
          { topic: current.topic, visualStyle: current.visualStyle },
          llmOptions(),
        );
        patchScene(id, {
          imagePrompt: prompt,
          ...(isVideo
            ? { videoStatus: scene.videoUrl ? 'ready' : 'idle' }
            : { imageStatus: scene.imageUrl ? 'ready' : 'idle' }),
        });
      } catch (e) {
        patchScene(id, isVideo ? { videoStatus: 'error', videoError: errorMessage(e) } : { imageStatus: 'error', imageError: errorMessage(e) });
      }
    },
    [ensureScriptEngineReady, llmOptions, patchScene],
  );

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
      scenes: [...prev.scenes, createScene('', `${prev.topic}, ${prev.visualStyle}`)],
    }));
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

  const readyScenes = project.scenes.filter((s) => s.audioStatus === 'ready').length;
  const canGenerate = project.topic.trim().length > 2 && !isBusy;

  return (
    <div className="isolate flex min-h-screen flex-col bg-[#0a0a0b] pt-8 text-white">
      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 h-lvh w-full scale-105 object-cover opacity-40 blur-[2px] brightness-50"
      />
      <div className="fixed inset-0 -z-40 h-lvh w-full bg-[#0a0a0b]/40" />

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
        {/* Hero: the pipeline itself, with the one network hop marked. */}
        <div className="mb-10 mt-4">
          <h1 className="font-display text-[clamp(1.75rem,4.5vw,2.5rem)] font-extrabold leading-[1.1] tracking-[-0.02em] text-white">
            From a topic to a finished short.
          </h1>

          <ul className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {pipelineStages(!useOpenAI).map((step, i) => (
              <li key={step.label} className="flex items-center gap-4">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={cn('h-1.5 w-1.5 rounded-full', step.local ? 'bg-cyan-400' : 'bg-amber-400')}
                  />
                  <span className="text-xs font-semibold text-white/75">{step.label}</span>
                  <span className="text-xs text-white/35">{step.where}</span>
                </span>
                {i < 3 && <span aria-hidden className="h-3 w-px bg-white/12" />}
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs leading-relaxed text-white/35">
            Only the image prompts leave this device. Everything else runs in the tab.
          </p>
        </div>

        {/* The bench: controls on the left, a live monitor on the right, in both stages. */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
          <div className="min-w-0">
            {stage === 'compose' ? (
              <ShortsComposer
                project={project}
                onChange={patchProject}
                onGenerate={handleGenerate}
                onPickMusic={() => setIsMusicPickerOpen(true)}
                onClearMusic={() => patchProject({ music: null })}
                onOpenSettings={() => setIsSettingsOpen(true)}
                isBusy={isBusy}
                hasImageKey={!!pollinationsKey}
                useOpenAI={useOpenAI}
                onToggleOpenAI={(value) => void saveSettings({ ...globalSettings, shortsUseOpenAI: value })}
                openAIConfigured={openAIConfigured}
                webLlmModelLabel={webLlmModelLabel}
                webLlmModel={globalSettings.webLlmModel}
                onChangeWebLlmModel={(modelId) => void saveSettings({ ...globalSettings, webLlmModel: modelId })}
              />
            ) : (
              <div className="space-y-5">
                <div className="flex items-baseline gap-3">
                  <button
                    type="button"
                    onClick={() => setStage('compose')}
                    className="focus-ring flex shrink-0 items-center gap-1.5 rounded text-[11px] font-bold uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Setup
                  </button>
                  <span aria-hidden className="h-px w-6 shrink-0 bg-white/12" />
                  <h2 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
                    Cut
                  </h2>
                  <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent" />
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
                  disabled={renderPhase === 'rendering'}
                  onReorder={(scenes) => patchProject({ scenes })}
                  onUpdateScene={patchScene}
                  onRegenerateVisual={handleRegenerateVisual}
                  onRegenerateAudio={handleRegenerateAudio}
                  onRewritePrompt={handleRewritePrompt}
                  onDeleteScene={handleDeleteScene}
                  onAddScene={handleAddScene}
                />
              </div>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit lg:self-start">
            <ShortsPreviewPlayer project={project} />

            {stage === 'compose' ? (
              <>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className={cn(
                    'focus-ring flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-4 text-sm font-bold transition-all',
                    canGenerate
                      ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-black shadow-[0_10px_40px_-12px_rgba(34,211,238,0.9)] hover:brightness-110'
                      : 'cursor-not-allowed border border-white/10 bg-white/5 text-white/30',
                  )}
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {busyLabel || 'Generating...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate short
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-white/35">
                  {isBusy
                    ? 'Keep this tab open while it works.'
                    : project.topic.trim().length > 2
                      ? `Aiming for about ${project.targetDurationSec} seconds.`
                      : 'Describe your topic to get started.'}
                </p>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-white/50">Voiced</span>
                    <span className="font-display text-xs tabular-nums text-white/70">
                      {readyScenes}/{project.scenes.length} · {formatDuration(totalDuration)}
                    </span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-cyan-400 transition-[width] duration-300"
                      style={{
                        width: project.scenes.length
                          ? `${(readyScenes / project.scenes.length) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRender}
                  disabled={!renderable || renderPhase === 'rendering' || isBusy}
                  className={cn(
                    'focus-ring flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-4 text-sm font-bold transition-all',
                    renderable && renderPhase !== 'rendering' && !isBusy
                      ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-black shadow-[0_10px_40px_-12px_rgba(34,211,238,0.9)] hover:brightness-110'
                      : 'cursor-not-allowed border border-white/10 bg-white/5 text-white/30',
                  )}
                >
                  <Download className="h-4 w-4" />
                  Export MP4
                </button>

                <p className="text-center text-xs leading-relaxed text-white/35">
                  {renderable
                    ? "Caption timing is estimated from each clip's length, so long words can drift."
                    : 'Every scene needs a voiceover before you can export.'}
                </p>
              </>
            )}
          </aside>
        </div>
      </main>

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
