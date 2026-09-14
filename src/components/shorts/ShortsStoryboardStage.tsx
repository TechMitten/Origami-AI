import React from 'react';
import { ArrowLeft, Loader2, Mic, RefreshCw, Tag, Type } from 'lucide-react';
import { Dropdown } from '../Dropdown';
import { ShortsStoryboard } from './ShortsStoryboard';
import { DEFAULT_VOICES } from '../../services/ttsService';
import { cn } from '../../services/shortsUtils';
import type { ShortsProject, ShortsScene } from '../../services/shortsProject';
import type { ShortsRenderPhase } from './ShortsRenderModal';

interface ShortsStoryboardStageProps {
  project: ShortsProject;
  isUploadMode: boolean;
  isVideoMode: boolean;
  activeVisualModel: string;
  visualStatusOf: (scene: ShortsScene) => ShortsScene['imageStatus'] | ShortsScene['videoStatus'];
  imageModelOptions: Array<{ id: string; name: string }>;
  videoModelOptions: Array<{ id: string; name: string }>;
  patchProject: (patch: Partial<ShortsProject>) => void;
  patchScene: (id: string, patch: Partial<ShortsScene>) => void;
  renderPhase: ShortsRenderPhase | null;
  isBusy: boolean;
  busyLabel: string;
  hasTitleCard: boolean;
  isRegeneratingAllImages: boolean;
  isExtendingAll: boolean;
  extendingIds: Set<string>;
  rewritingPromptIds: Set<string>;
  handleBackToSetup: () => void;
  handleRegenerateAllImages: () => void | Promise<void>;
  handleToggleTitleCard: () => void;
  setIsVoiceAuditionOpen: (open: boolean) => void;
  handleRegenerateVisual: (id: string) => void;
  handleRegenerateAudio: (id: string) => void;
  handleRewritePrompt: (id: string) => void | Promise<void>;
  handleExtendScene: (id: string) => void | Promise<void>;
  handleExtendAllScenes: () => void | Promise<void>;
  handleCancelExtendAll: () => void;
  handleDeleteScene: (id: string) => void;
  handleAddScene: () => void;
  handleBatchUploadImages: (files: File[]) => void;
  handleClearAllImages: () => void;
}

export const ShortsStoryboardStage: React.FC<ShortsStoryboardStageProps> = ({
  project,
  isUploadMode,
  isVideoMode,
  activeVisualModel,
  visualStatusOf,
  imageModelOptions,
  videoModelOptions,
  patchProject,
  patchScene,
  renderPhase,
  isBusy,
  busyLabel,
  hasTitleCard,
  isRegeneratingAllImages,
  isExtendingAll,
  extendingIds,
  rewritingPromptIds,
  handleBackToSetup,
  handleRegenerateAllImages,
  handleToggleTitleCard,
  setIsVoiceAuditionOpen,
  handleRegenerateVisual,
  handleRegenerateAudio,
  handleRewritePrompt,
  handleExtendScene,
  handleExtendAllScenes,
  handleCancelExtendAll,
  handleDeleteScene,
  handleAddScene,
  handleBatchUploadImages,
  handleClearAllImages,
}) => {
  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-white/10 bg-white/2 px-3 py-2.5">
        {/* Same model selector as Build, so a mid-project switch
            doesn't cost a round trip back to the composer. Changing
            it marks ready visuals stale (see isSceneVisualStale) and
            they regenerate through the usual stale flow. */}
        {!isUploadMode && (
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
              {isVideoMode ? 'Video' : 'Image'}
            </span>
            <div className="w-48 sm:w-56">
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
            {!isVideoMode && (
              <a
                href="https://enter.pollinations.ai/models?category=image"
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/4 text-white/60 hover:border-white/40 hover:bg-white/8 hover:text-white transition-all"
                title="See pricing for each image model"
              >
                <Tag className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        )}

        {!isVideoMode && !isUploadMode && project.scenes.some((s) => visualStatusOf(s) === 'ready') && (
          <>
            <span aria-hidden className="hidden h-6 w-px shrink-0 bg-white/10 sm:block" />
            <button
              type="button"
              onClick={() => void handleRegenerateAllImages()}
              disabled={renderPhase === 'rendering' || isRegeneratingAllImages}
              className="focus-ring flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/4 text-white/80 hover:border-white/40 hover:bg-white/8 hover:text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
              title="Regenerate all images"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRegeneratingAllImages && 'animate-spin')} />
            </button>
          </>
        )}

        {!isUploadMode && (
          <span aria-hidden className="hidden h-6 w-px shrink-0 bg-white/10 sm:block" />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsVoiceAuditionOpen(true)}
            className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/4 px-3 py-1.5 text-xs text-white/80 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200 transition-all"
            title="Audition or switch voice"
          >
            <Mic className="h-3.5 w-3.5 text-cyan-400" />
            <span>Voice: <strong className="text-white">{project.voiceMode === 'record' ? 'Recorded Voice' : (DEFAULT_VOICES.find(v => v.id === project.voice)?.name || project.voice)}</strong></span>
          </button>

          <button
            type="button"
            onClick={handleToggleTitleCard}
            disabled={renderPhase === 'rendering' || isBusy}
            aria-pressed={hasTitleCard}
            className={cn(
              'focus-ring flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-all disabled:cursor-not-allowed disabled:opacity-40',
              hasTitleCard ? 'text-amber-200 hover:text-amber-100' : 'text-white/80 hover:text-white',
            )}
            title={hasTitleCard ? 'Scene 00 is a title card — click to remove it' : 'Add a title card as scene 00'}
          >
            <Type className={cn('h-3.5 w-3.5', hasTitleCard ? 'text-amber-400' : 'text-white/50')} />
            <span>Title card: <strong className={hasTitleCard ? 'text-amber-100' : 'text-white'}>{hasTitleCard ? 'On' : 'Off'}</strong></span>
          </button>
        </div>
      </div>

      {isBusy && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border border-cyan-400/25 bg-cyan-400/8 px-4 py-3 text-sm text-cyan-100"
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
        voiceMode={project.voiceMode}
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
        onCancelExtendAll={handleCancelExtendAll}
        onDeleteScene={handleDeleteScene}
        onAddScene={handleAddScene}
        onBatchUploadImages={handleBatchUploadImages}
        onClearAllImages={handleClearAllImages}
      />
    </div>
  );
};
