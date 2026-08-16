import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clapperboard, Download, Film, RotateCcw, Sparkles } from 'lucide-react';

import backgroundImage from '../assets/images/background.jpg';
import { Footer } from '../components/Footer';
import { PageHeader } from '../components/PageHeader';
import { GlobalSettingsModal } from '../components/GlobalSettingsModal';
import { MobileWarningModal } from '../components/MobileWarningModal';
import { WebGPUInstructionsModal } from '../components/WebGPUInstructionsModal';
import { WebLLMLoadingModal } from '../components/WebLLMLoadingModal';
import { MusicPickerModal } from '../components/MusicPickerModal';
import { ShortsComposer } from '../components/shorts/ShortsComposer';
import { ShortsStoryboard } from '../components/shorts/ShortsStoryboard';
import { ShortsPreviewPlayer } from '../components/shorts/ShortsPreviewPlayer';
import { ShortsRenderModal, type ShortsRenderPhase } from '../components/shorts/ShortsRenderModal';
import { useModal } from '../context/ModalContext';

import {
  checkWebGPUSupport,
  getCurrentWebLLMModel,
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
    () => resolvePollinationsKey(globalSettings.pollinationsApiKey),
    [globalSettings.pollinationsApiKey],
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

  return (
    <div className="isolate flex min-h-screen flex-col bg-[#0a0a0b] pt-8 text-white">
      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 h-lvh w-full scale-105 object-cover opacity-25 blur-[2px] brightness-50"
      />
      <div className="fixed inset-0 -z-40 h-lvh w-full bg-[#0a0a0b]/60" />

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
        {/* Hero */}
        <div className="mb-10 mt-4">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200">
            <Clapperboard className="h-3 w-3" />
            Shorts
          </div>
          <h1 className="font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            Turn a topic into a faceless short
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50">
            A local WebGPU model writes the script, Pollinations generates the visuals, and Kokoro voices it —
            then it all renders to MP4 in your browser. Nothing but the image prompts leaves your device.
          </p>
        </div>

        {stage === 'compose' ? (
          <ShortsComposer
            project={project}
            onChange={patchProject}
            onGenerate={handleGenerate}
            onPickMusic={() => setIsMusicPickerOpen(true)}
            onClearMusic={() => patchProject({ music: null })}
            onOpenSettings={() => setIsSettingsOpen(true)}
            isBusy={isBusy}
            busyLabel={busyLabel}
            hasImageKey={!!pollinationsKey}
            useOpenAI={useOpenAI}
            onToggleOpenAI={(value) => void saveSettings({ ...globalSettings, shortsUseOpenAI: value })}
            openAIConfigured={openAIConfigured}
            webLlmModelLabel={webLlmModelLabel}
          />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* Storyboard */}
            <div className="min-w-0 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStage('compose')}
                  className="flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to setup
                </button>
                <span className="text-xs text-white/40">
                  {readyScenes}/{project.scenes.length} scenes ready · {formatDuration(totalDuration)}
                </span>
              </div>

              {isBusy && (
                <div className="flex items-center gap-3 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 px-5 py-3 text-sm text-cyan-100">
                  <Sparkles className="h-4 w-4 animate-pulse" />
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

            {/* Preview rail */}
            <aside className="lg:sticky lg:top-24 lg:h-fit">
              <ShortsPreviewPlayer project={project} />

              <button
                type="button"
                onClick={handleRender}
                disabled={!renderable || renderPhase === 'rendering' || isBusy}
                className={
                  renderable && renderPhase !== 'rendering' && !isBusy
                    ? 'mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-4 text-sm font-bold text-black shadow-[0_10px_40px_-12px_rgba(34,211,238,0.9)] transition-all hover:brightness-110'
                    : 'mt-5 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-4 text-sm font-bold text-white/30'
                }
              >
                <Download className="h-4 w-4" />
                Export MP4
              </button>

              {!renderable && !isBusy && (
                <p className="mt-3 text-center text-xs text-white/35">
                  Every scene needs a voiceover before export.
                </p>
              )}

              <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-white/30">
                <Film className="mt-0.5 h-3 w-3 shrink-0" />
                Caption timings are estimated from each clip's measured length — Kokoro does not provide
                word-level timestamps.
              </p>
            </aside>
          </div>
        )}
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
