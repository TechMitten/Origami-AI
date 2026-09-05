import React, { useRef } from 'react';
import { ListPlus, Plus, Square, Upload, Trash2 } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { ShortsSceneCard } from './ShortsSceneCard';
import type { ShortsGenerationMode, ShortsScene, ShortsVoiceMode } from '../../services/shortsProject';
import type { ShortsAspect } from '../../services/ShortsVideoRenderer';
import { useModal } from '../../context/ModalContext';

interface ShortsStoryboardProps {
  scenes: ShortsScene[];
  aspect: ShortsAspect;
  generationMode: ShortsGenerationMode;
  /** Active image/video model id, so cards can flag visuals made with a different one. */
  visualModel: string;
  voiceMode?: ShortsVoiceMode;
  disabled: boolean;
  extendingIds: Set<string>;
  isExtendingAll: boolean;
  rewritingPromptIds?: Set<string>;
  onReorder: (scenes: ShortsScene[]) => void;
  onUpdateScene: (id: string, patch: Partial<ShortsScene>) => void;
  onRegenerateVisual: (id: string) => void;
  onRegenerateAudio: (id: string) => void;
  onRewritePrompt: (id: string) => void;
  onExtendScene: (id: string) => void;
  onExtendAll: () => void;
  onCancelExtendAll?: () => void;
  onDeleteScene: (id: string) => void;
  onAddScene: () => void;
  onBatchUploadImages?: (files: File[]) => void;
  onClearAllImages?: () => void;
}

export const ShortsStoryboard: React.FC<ShortsStoryboardProps> = ({
  scenes,
  aspect,
  generationMode,
  visualModel,
  voiceMode,
  disabled,
  extendingIds,
  isExtendingAll,
  rewritingPromptIds,
  onReorder,
  onUpdateScene,
  onRegenerateVisual,
  onRegenerateAudio,
  onRewritePrompt,
  onExtendScene,
  onExtendAll,
  onCancelExtendAll,
  onDeleteScene,
  onAddScene,
  onBatchUploadImages,
  onClearAllImages,
}) => {
  const { showConfirm } = useModal();
  const batchInputRef = useRef<HTMLInputElement | null>(null);

  const sensors = useSensors(
    // A small activation distance keeps the handle from stealing text-selection
    // drags inside the narration textarea.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleBatchFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length && onBatchUploadImages) {
      onBatchUploadImages(files);
    }
    e.target.value = '';
  };

  const hasTitleCard = scenes[0]?.isTitleCard === true;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    let newIndex = scenes.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // The title card is pinned at position 0 (its own drag is disabled), so
    // nothing else may land ahead of it either.
    if (hasTitleCard) newIndex = Math.max(newIndex, 1);

    onReorder(arrayMove(scenes, oldIndex, newIndex));
  };

  const hasGeneratedImages = scenes.some((s) => s.imageUrl && !s.isCustomUpload);
  const narratedCount = hasTitleCard ? scenes.length - 1 : scenes.length;

  return (
    <div className="space-y-4">
      <input
        ref={batchInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleBatchFileChange}
      />

      {scenes.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <p className="text-xs text-white/60">
            {narratedCount} scene{narratedCount === 1 ? '' : 's'}
            {hasTitleCard && ' + title card'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {onClearAllImages && hasGeneratedImages && generationMode !== 'upload' && (
              <button
                type="button"
                onClick={async () => {
                  const confirmed = await showConfirm(
                    'Are you sure you want to clear all generated visuals? This cannot be undone.',
                    {
                      title: 'Clear generated visuals',
                      confirmText: 'Clear Visuals',
                      type: 'danger'
                    }
                  );
                  if (confirmed) {
                    onClearAllImages();
                  }
                }}
                disabled={disabled}
                title="Clear all AI-generated images/videos"
                className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-1.5 text-xs text-red-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear visuals
              </button>
            )}
            {onBatchUploadImages && (
              <button
                type="button"
                onClick={() => batchInputRef.current?.click()}
                disabled={disabled}
                title="Upload multiple images to populate your scenes"
                className="focus-ring flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload images
              </button>
            )}
            <button
              type="button"
              onClick={isExtendingAll ? onCancelExtendAll : onExtendAll}
              // While extending, this button flips into a cancel trigger — it must
              // stay clickable even though the rest of the storyboard (`disabled`)
              // locks up for the duration of the run.
              disabled={isExtendingAll ? !onCancelExtendAll : disabled}
              title={isExtendingAll ? 'Stop extending scripts' : "Add a few more sentences to every scene's narration"}
              className={
                isExtendingAll
                  ? 'focus-ring flex shrink-0 items-center gap-1.5 rounded-lg border border-red-400/30 px-3 py-1.5 text-xs text-red-300 transition-colors hover:border-red-400/60 hover:bg-red-500/10 hover:text-red-200'
                  : 'focus-ring flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'
              }
            >
              {isExtendingAll ? <Square className="h-3.5 w-3.5 fill-current" /> : <ListPlus className="h-3.5 w-3.5" />}
              {isExtendingAll ? 'Cancel extending' : 'Extend all scripts'}
            </button>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {scenes.map((scene, index) => (
              <ShortsSceneCard
                key={scene.id}
                scene={scene}
                index={hasTitleCard ? index : index + 1}
                isTitleCard={scene.isTitleCard === true}
                aspect={aspect}
                generationMode={generationMode}
                visualModel={visualModel}
                voiceMode={voiceMode}
                disabled={disabled}
                isExtending={extendingIds.has(scene.id)}
                isRewritingPrompt={rewritingPromptIds?.has(scene.id)}
                onUpdate={onUpdateScene}
                onRegenerateVisual={onRegenerateVisual}
                onRegenerateAudio={onRegenerateAudio}
                onRewritePrompt={onRewritePrompt}
                onExtend={onExtendScene}
                onDelete={onDeleteScene}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={onAddScene}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 py-4 text-sm text-white/50 transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
        Add a scene
      </button>
    </div>
  );
};
