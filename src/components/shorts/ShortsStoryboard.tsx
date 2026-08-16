import React from 'react';
import { Plus } from 'lucide-react';
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
import type { ShortsScene } from '../../services/shortsProject';
import type { ShortsAspect } from '../../services/ShortsVideoRenderer';

interface ShortsStoryboardProps {
  scenes: ShortsScene[];
  aspect: ShortsAspect;
  disabled: boolean;
  onReorder: (scenes: ShortsScene[]) => void;
  onUpdateScene: (id: string, patch: Partial<ShortsScene>) => void;
  onRegenerateImage: (id: string) => void;
  onRegenerateAudio: (id: string) => void;
  onRewritePrompt: (id: string) => void;
  onDeleteScene: (id: string) => void;
  onAddScene: () => void;
}

export const ShortsStoryboard: React.FC<ShortsStoryboardProps> = ({
  scenes,
  aspect,
  disabled,
  onReorder,
  onUpdateScene,
  onRegenerateImage,
  onRegenerateAudio,
  onRewritePrompt,
  onDeleteScene,
  onAddScene,
}) => {
  const sensors = useSensors(
    // A small activation distance keeps the handle from stealing text-selection
    // drags inside the narration textarea.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {scenes.map((scene, index) => (
              <ShortsSceneCard
                key={scene.id}
                scene={scene}
                index={index}
                aspect={aspect}
                disabled={disabled}
                onUpdate={onUpdateScene}
                onRegenerateImage={onRegenerateImage}
                onRegenerateAudio={onRegenerateAudio}
                onRewritePrompt={onRewritePrompt}
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
