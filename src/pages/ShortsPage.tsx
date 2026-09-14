import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Film,
  Image as ImageIcon,
  KeyRound,
  Mic,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

import backgroundImage from '../assets/images/background.jpg';
import { Footer } from '../components/Footer';
import { PageHeader } from '../components/PageHeader';
import { GlobalSettingsModal } from '../components/GlobalSettingsModal';
import { WebGPUInstructionsModal } from '../components/WebGPUInstructionsModal';
import { WebLLMLoadingModal } from '../components/WebLLMLoadingModal';
import { AiModeChoiceModal } from '../components/AiModeChoiceModal';
import { MusicPickerModal } from '../components/MusicPickerModal';
import { useBackgroundDownload } from '../context/BackgroundDownloadContext';
import { ShortsComposeStage } from '../components/shorts/ShortsComposeStage';
import { ShortsStoryboardStage } from '../components/shorts/ShortsStoryboardStage';
import { ShortsPreviewPlayer } from '../components/shorts/ShortsPreviewPlayer';
import { ShortsRenderModal } from '../components/shorts/ShortsRenderModal';
import { VoiceAuditionModal } from '../components/shorts/VoiceAuditionModal';
import { PollinationsInfoModal } from '../components/shorts/PollinationsInfoModal';
import { startPollinationsOAuth } from '../services/pollinationsAuth';
import { useModal } from '../context/ModalContext';
import { usePageMeta } from '../hooks/usePageMeta';

import { getWebLlmModelInfo } from '../services/webLlmService';
import { isFreePollinationsModel, resolvePollinationsKey } from '../services/pollinationsService';
import { composeVisualPrompt } from '../services/shortsScriptService';
import {
  createEmptyProject,
  createScene,
  formatDuration,
  isProjectRenderable,
  isSceneAudioStale,
  isSceneVisualStale,
  projectDuration,
  revokeProjectUrls,
  toPersistedProject,
  type ShortsProject,
  type ShortsScene,
} from '../services/shortsProject';
import {
  clearShortsProject,
  saveGlobalSettings,
  saveShortsProject,
  type GlobalSettings,
} from '../services/storage';
import { cn, buildTitleCardScene } from '../services/shortsUtils';
import { ReadyTrack } from '../components/shorts/ReadyTrack';
import { PrimaryAction } from '../components/shorts/PrimaryAction';
import { useShortsRender } from '../hooks/useShortsRender';
import { useShortsCloudSync } from '../hooks/useShortsCloudSync';
import { useShortsModals } from '../hooks/useShortsModals';
import { useShortsRuntimeSetup } from '../hooks/useShortsRuntimeSetup';
import { useShortsGeneration } from '../hooks/useShortsGeneration';
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

import { useAuth } from '../context/AuthContext';
import { Cloud } from 'lucide-react';

export const ShortsPage: React.FC = () => {
  usePageMeta({
    title: 'AI Shorts Generator — Origami AI',
    description:
      'Create faceless AI shorts with generated visuals, auto-captions, and local text-to-speech. Script, storyboard, and render short-form videos entirely in your browser.',
    path: '/shorts',
  });

  const { showAlert, showConfirm, showPrompt } = useModal();
  const { user } = useAuth();

  const pendingLibraryDownloadRef = useRef(false);

  const [project, setProject] = useState<ShortsProject>(() => createEmptyProject());
  const [stage, setStage] = useState<Stage>('compose');
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);

  const {
    isSettingsOpen,
    setIsSettingsOpen,
    isWebGPUModalOpen,
    setIsWebGPUModalOpen,
    isWebLLMLoadingOpen,
    setIsWebLLMLoadingOpen,
    isMusicPickerOpen,
    setIsMusicPickerOpen,
    isVoiceAuditionOpen,
    setIsVoiceAuditionOpen,
    isAiModeChoiceModalOpen,
    setIsAiModeChoiceModalOpen,
    isPollinationsInfoOpen,
    setIsPollinationsInfoOpen,
  } = useShortsModals();

  const { startBackgroundDownloads, endBackgroundDownloads } = useBackgroundDownload();

  const generationAbortRef = useRef<AbortController | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;

  const {
    renderPhase,
    setRenderPhase,
    renderProgress,
    renderStatus,
    renderError,
    renderAbortRef,
    handleRender,
    handleDownload,
    fileName,
  } = useShortsRender({ project, projectRef, showAlert, pendingLibraryDownloadRef });

  const { imageModels, videoModels, handleAiModeChoiceWebLLM, handleAiModeChoiceBYOK, handleAiModeChoiceSkip } = useShortsRuntimeSetup({
    defaultGlobalSettings: DEFAULT_GLOBAL_SETTINGS,
    globalSettings,
    setGlobalSettings,
    setProject,
    setStage,
    setIsAiModeChoiceModalOpen,
    setIsSettingsOpen,
    setIsWebGPUModalOpen,
    startBackgroundDownloads,
    endBackgroundDownloads,
    generationAbortRef,
    renderAbortRef,
  });

  const titleRef = useRef<HTMLTextAreaElement | null>(null);
  const adjustTitleHeight = useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const { isSavingToCloud, linkedCloudProjectId, setLinkedCloudProjectId, handleSaveToLibrary } = useShortsCloudSync({
    user,
    project,
    projectRef,
    setProject,
    setStage,
    pendingLibraryDownloadRef,
    autoSaveEnabled: globalSettings.autoSaveToLibrary ?? false,
    modal: { showAlert, showConfirm, showPrompt },
  });

  useEffect(() => {
    adjustTitleHeight();
  }, [project.title, adjustTitleHeight]);

  const pollinationsKey = useMemo(
    () => resolvePollinationsKey(globalSettings.pollinationsApiKey, globalSettings.pollinationsTokenExpiresAt),
    [globalSettings.pollinationsApiKey, globalSettings.pollinationsTokenExpiresAt],
  );

  const isUploadMode = project.generationMode === 'upload';
  const isVideoMode = project.generationMode === 'video';

  // The free image model runs against the keyless endpoint, so "not connected"
  // is not a dead end for stills the way it is for clips and paid models.
  const usingFreeImageModel =
    !isUploadMode && !isVideoMode && isFreePollinationsModel(project.imageModel);

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
  const hasTitleCard = project.scenes[0]?.isTitleCard === true;

  // --- load / persist ---------------------------------------------------------

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

  const {
    isBusy,
    busyLabel,
    isRegeneratingAllImages,
    isRegeneratingStale,
    extendingIds,
    isExtendingAll,
    rewritingPromptIds,
    handleBatchUploadImages,
    handleGenerate,
    handleGenerateVisuals,
    handleGenerateAudio,
    handleCancelGeneration,
    handleRegenerateStale,
    handleRegenerateVisual,
    handleRegenerateAllImages,
    handleRegenerateAudio,
    handleRewritePrompt,
    handleExtendScene,
    handleClearAllImages,
    handleExtendAllScenes,
    handleCancelExtendAll,
  } = useShortsGeneration({
    project,
    projectRef,
    setProject,
    setStage,
    patchProject,
    patchScene,
    pollinationsKey,
    globalSettings,
    useOpenAI,
    openAIConfigured,
    setIsSettingsOpen,
    setIsWebGPUModalOpen,
    setIsWebLLMLoadingOpen,
    generationAbortRef,
    modal: { showAlert, showConfirm },
  });

  const handleDeleteScene = useCallback((id: string) => {
    setProject((prev) => {
      const scene = prev.scenes.find((s) => s.id === id);
      if (scene?.imageUrl) URL.revokeObjectURL(scene.imageUrl);
      if (scene?.videoUrl) URL.revokeObjectURL(scene.videoUrl);
      if (scene?.audioUrl) URL.revokeObjectURL(scene.audioUrl);
      return {
        ...prev,
        showTitleCard: scene?.isTitleCard ? false : prev.showTitleCard,
        scenes: prev.scenes.filter((s) => s.id !== id),
      };
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

  // Scene 00 is a real scene living at the front of the array — toggling adds or
  // removes it there rather than flipping a rendering-only flag.
  const handleToggleTitleCard = useCallback(() => {
    setProject((prev) => {
      const existing = prev.scenes[0]?.isTitleCard ? prev.scenes[0] : null;
      if (existing) {
        if (existing.imageUrl) URL.revokeObjectURL(existing.imageUrl);
        if (existing.videoUrl) URL.revokeObjectURL(existing.videoUrl);
        if (existing.audioUrl) URL.revokeObjectURL(existing.audioUrl);
        return { ...prev, showTitleCard: false, scenes: prev.scenes.slice(1) };
      }
      return {
        ...prev,
        showTitleCard: true,
        scenes: [buildTitleCardScene(prev.title || prev.topic, prev), ...prev.scenes],
      };
    });
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
        captionSize: prev.captionSize,
        captionPosition: prev.captionPosition,
        showTitleCard: prev.showTitleCard,
      }),
    );
    setStage('compose');
    setLinkedCloudProjectId(null);
  }, [showConfirm, setLinkedCloudProjectId]);

  // --- music ------------------------------------------------------------------

  const handleSelectTrack = useCallback((track: IncompetechCachedTrack) => {
    setProject((prev) => ({
      ...prev,
      music: { blob: track.blob, fileName: track.title, volume: prev.music?.volume ?? 0.12 },
    }));
    setIsMusicPickerOpen(false);
  }, [setIsMusicPickerOpen]);

  const handleUploadMusic = useCallback((file: File) => {
    setProject((prev) => ({
      ...prev,
      music: { blob: file, fileName: file.name, volume: prev.music?.volume ?? 0.12 },
    }));
  }, []);

  // --- render -----------------------------------------------------------------

  const saveSettings = useCallback(async (next: GlobalSettings) => {
    await saveGlobalSettings(next);
    setGlobalSettings(next);
  }, []);

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
  const needsVisualGeneration = !isUploadMode && project.scenes.some((s) => ['idle', 'error'].includes(visualStatusOf(s)));
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
          ? project.voiceMode === 'record'
            ? {
                label: 'Record slide voiceovers',
                icon: <Mic className="h-4 w-4 shrink-0 text-red-400" />,
                onClick: () => {
                  const first = document.querySelector('[data-needs-recording="true"]');
                  if (first) {
                    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                },
                disabled: false,
                busy: false,
                hint: 'Use the Record button on each slide card above to record your narration with your microphone.',
              }
            : {
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


      <PageHeader
        title="Shorts"
        onSettings={() => setIsSettingsOpen(true)}
        showHelp={false}
        actionMenuContent={(closeMenu) => (
          <>
            <button
              onClick={() => { handleSaveToLibrary(); closeMenu(); }}
              disabled={!user || isSavingToCloud || project.scenes.length === 0}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
              title={!user ? 'Sign in to save to your library' : ''}
            >
              <Cloud className="w-4 h-4" /> {isSavingToCloud ? 'Saving to Library...' : linkedCloudProjectId ? 'Update Library Entry' : 'Save to Library'}
            </button>
            {project.scenes.length > 0 && <div className="my-1 h-px bg-white/10" />}
            {project.scenes.length > 0 && (
              <button
                onClick={() => {
                  void handleStartOver();
                  closeMenu();
                }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
              >
                <RotateCcw className="h-4 w-4" /> Start over
              </button>
            )}
          </>
        )}
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
              <textarea
                id="shorts-title"
                ref={titleRef}
                value={project.title ?? ''}
                onChange={(e) => patchProject({ title: e.target.value })}
                placeholder="Untitled short"
                rows={1}
                className="focus-ring -ml-2 block w-full resize-none overflow-hidden rounded-lg bg-transparent px-2 py-1 font-display text-[clamp(1.5rem,4vw,2.25rem)] font-extrabold leading-[1.15] tracking-[-0.02em] text-white outline-none transition-colors placeholder:text-white/25 hover:bg-white/4 focus:bg-white/6"
              />
            </div>
          )}
        </div>

        {!pollinationsKey && !isUploadMode && (
          <div
            role="status"
            className="mb-8 flex flex-col gap-3 rounded-xl border border-amber-400/25 bg-amber-400/8 p-4 sm:mb-10 sm:flex-row sm:items-center"
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
                onClick={() => void startPollinationsOAuth(window.location.pathname)}
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
              <ShortsComposeStage
                project={project}
                isBusy={isBusy}
                setStage={setStage}
                patchProject={patchProject}
                onGenerate={handleGenerate}
                onPickMusic={() => setIsMusicPickerOpen(true)}
                onUploadMusic={handleUploadMusic}
                onUploadImages={handleBatchUploadImages}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onOpenVoiceAudition={() => setIsVoiceAuditionOpen(true)}
                useOpenAI={useOpenAI}
                globalSettings={globalSettings}
                saveSettings={saveSettings}
                openAIConfigured={openAIConfigured}
                webLlmModelLabel={webLlmModelLabel}
                imageModelOptions={imageModelOptions}
                videoModelOptions={videoModelOptions}
              />
            ) : (
              <ShortsStoryboardStage
                project={project}
                isUploadMode={isUploadMode}
                isVideoMode={isVideoMode}
                activeVisualModel={activeVisualModel}
                visualStatusOf={visualStatusOf}
                imageModelOptions={imageModelOptions}
                videoModelOptions={videoModelOptions}
                patchProject={patchProject}
                patchScene={patchScene}
                renderPhase={renderPhase}
                isBusy={isBusy}
                busyLabel={busyLabel}
                hasTitleCard={hasTitleCard}
                isRegeneratingAllImages={isRegeneratingAllImages}
                isExtendingAll={isExtendingAll}
                extendingIds={extendingIds}
                rewritingPromptIds={rewritingPromptIds}
                handleBackToSetup={handleBackToSetup}
                handleRegenerateAllImages={handleRegenerateAllImages}
                handleToggleTitleCard={handleToggleTitleCard}
                setIsVoiceAuditionOpen={setIsVoiceAuditionOpen}
                handleRegenerateVisual={handleRegenerateVisual}
                handleRegenerateAudio={handleRegenerateAudio}
                handleRewritePrompt={handleRewritePrompt}
                handleExtendScene={handleExtendScene}
                handleExtendAllScenes={handleExtendAllScenes}
                handleCancelExtendAll={handleCancelExtendAll}
                handleDeleteScene={handleDeleteScene}
                handleAddScene={handleAddScene}
                handleBatchUploadImages={handleBatchUploadImages}
                handleClearAllImages={handleClearAllImages}
              />
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit lg:self-start">
            <ShortsPreviewPlayer project={project} />

            {stage === 'storyboard' && (
              <>
                {/* The monitor's readout: what exists, per asset track. Audio
                    alone used to stand in for readiness, which under-reported
                    it whenever the visuals were the ones still missing. */}
                <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3.5">
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
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-400/25 bg-amber-400/8 px-4 py-3 text-xs text-amber-100">
                    <span>
                      {staleCount} scene{staleCount > 1 ? 's' : ''} changed since generation.
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRegenerateStale()}
                      disabled={isRegeneratingStale}
                      className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/40 px-3 py-1.5 font-semibold text-amber-200 transition-colors hover:border-amber-400/70 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', isRegeneratingStale && 'animate-spin')} />
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
                onCancel={isBusy ? handleCancelGeneration : undefined}
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
          onCancel={isBusy ? handleCancelGeneration : undefined}
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

      <AiModeChoiceModal
        isOpen={isAiModeChoiceModalOpen}
        onSelectWebLLM={handleAiModeChoiceWebLLM}
        onSelectBYOK={handleAiModeChoiceBYOK}
        onSkip={handleAiModeChoiceSkip}
      />

      <WebGPUInstructionsModal isOpen={isWebGPUModalOpen} onClose={() => setIsWebGPUModalOpen(false)} />

      <VoiceAuditionModal
        isOpen={isVoiceAuditionOpen}
        onClose={() => setIsVoiceAuditionOpen(false)}
        selectedVoice={project.voice}
        onSelectVoice={(voiceId) => {
          patchProject({ voice: voiceId, voiceMode: 'tts' });
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

    </div>
  );
};
