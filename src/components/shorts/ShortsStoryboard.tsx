import React, { useRef } from 'react';
import { ListPlus, Loader2, Plus, Upload } from 'lucide-react';
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
import type { ShortsGenerationMode, ShortsScene } from '../../services/shortsProject';
import type { ShortsAspect } from '../../services/ShortsVideoRenderer';

interface ShortsStoryboardProps {
  scenes: ShortsScene[];
  aspect: ShortsAspect;
  generationMode: ShortsGenerationMode;
  /** Active image/video model id, so cards can flag visuals made with a different one. */
  visualModel: string;
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
  onDeleteScene: (id: string) => void;
  onAddScene: () => void;
  onBatchUploadImages?: (files: File[]) => void;
}

export const ShortsStoryboard: React.FC<ShortsStoryboardProps> = ({
  scenes,
  aspect,
  generationMode,
  visualModel,
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
  onDeleteScene,
  onAddScene,
  onBatchUploadImages,
}) => {
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    const newIndex = scenes.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    onReorder(arrayMove(scenes, oldIndex, newIndex));
  };

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
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-white/40">
            {scenes.length} scene{scenes.length === 1 ? '' : 's'}
          </p>
          <div className="flex items-center gap-2">
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
              onClick={onExtendAll}
              disabled={disabled || isExtendingAll}
              title="Add a few more sentences to every scene's narration"
              className={
                // Loading is a disabled state too, but it should read as "working",
                // not as unavailable — the generic disabled:opacity-40 dims
                // text-white/70 down to the point of being unreadable.
                isExtendingAll
                  ? 'focus-ring flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-1.5 text-xs text-cyan-200 transition-colors'
                  : 'focus-ring flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40'
              }
            >
              {isExtendingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListPlus className="h-3.5 w-3.5" />}
              Extend all scripts
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
                index={index}
                aspect={aspect}
                generationMode={generationMode}
                visualModel={visualModel}
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
