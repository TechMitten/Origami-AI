import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Navigation, Move, ZoomIn, ChevronDown } from 'lucide-react';

import type { ZoomKeyframe } from './SlideEditor';

interface ZoomTimelineEditorProps {
  currentTime: number;
  duration: number;
  zooms: ZoomKeyframe[];
  onUpdateZooms: (zooms: ZoomKeyframe[]) => void;
  onSeek: (time: number) => void;
}

export const ZoomTimelineEditor: React.FC<ZoomTimelineEditorProps> = ({
  currentTime,
  duration,
  zooms,
  onUpdateZooms,
  onSeek
}) => {
  const [selectedZoomId, setSelectedZoomId] = React.useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Create a sorted copy of zooms
  const sortedZooms = useMemo(() => [...zooms].sort((a, b) => a.timestampStartSeconds - b.timestampStartSeconds), [zooms]);

  // Find active zoom by selection ID
  const activeZoomIndex = sortedZooms.findIndex(z => z.id === selectedZoomId);
  const activeZoom = activeZoomIndex !== -1 ? sortedZooms[activeZoomIndex] : null;

  const handleAddZoom = () => {
    const newId = crypto.randomUUID();
    const newZoom: ZoomKeyframe = {
      id: newId,
      timestampStartSeconds: currentTime,
      durationSeconds: 1, // Default duration, not heavily used yet
      type: 'cursor', // Default to cursor since they wanted automatic zooming
      targetX: 0.5,
      targetY: 0.5,
      zoomLevel: 1.25,
      // New defaults for improved UX
      easing: 'easeInOutCubic', // Smooth easing by default
      transitionSmoothing: 0.15, // Reasonable transition smoothness
      cursorDamping: 0.01, // Smooth cursor following
      predictiveCursor: false, // Disabled by default (can be enabled if needed)
    };
    onUpdateZooms([...sortedZooms, newZoom].sort((a, b) => a.timestampStartSeconds - b.timestampStartSeconds));
    setSelectedZoomId(newId);
  };

  const handleUpdateActiveZoom = (updates: Partial<ZoomKeyframe>) => {
    if (activeZoomIndex === -1) return;
    const newZooms = [...sortedZooms];
    newZooms[activeZoomIndex] = { ...newZooms[activeZoomIndex], ...updates };
    onUpdateZooms(newZooms);
  };

  const handleDeleteZoom = (index: number) => {
    const newZooms = [...sortedZooms];
    newZooms.splice(index, 1);
    onUpdateZooms(newZooms);
  };

  return (
    <div className="w-full flex justify-between gap-4 p-4 bg-black/40 border border-white/10 rounded-2xl animate-fade-in shadow-xl select-none relative group mt-4">
      
      {/* Timeline Track */}
      <div className="flex-1 flex flex-col gap-2 relative mt-4 mb-2">
        <div 
          className="w-full h-3 bg-white/10 rounded-full cursor-pointer relative"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            onSeek(percent * duration);
            setSelectedZoomId(null); // Click empty timeline area to deselect
          }}
        >
          {/* Scrubber playback head */}
          <div 
            className="absolute top-1/2 -translate-y-1/2 w-1.5 h-6 bg-branding-accent rounded-full shadow-[0_0_8px_rgba(255,255,255,0.8)] pointer-events-none transition-all duration-75"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />

          {/* Zoom Keyframe Markers */}
          {sortedZooms.map((zoom) => (
            <div
              key={zoom.id}
              className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border border-white cursor-pointer transition-transform hover:scale-150 ${zoom.id === selectedZoomId ? 'bg-branding-accent scale-125' : 'bg-branding-primary'}`}
              style={{ left: `${(zoom.timestampStartSeconds / duration) * 100}%`, transform: `translate(-50%, -50%) ${zoom.id === selectedZoomId ? 'scale(1.25)' : ''}` }}
              onClick={(e) => {
                e.stopPropagation();
                onSeek(zoom.timestampStartSeconds);
                setSelectedZoomId(zoom.id);
              }}
              title={`Zoom at ${zoom.timestampStartSeconds.toFixed(1)}s (Scale: ${zoom.zoomLevel.toFixed(1)})`}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-white/50 font-bold tracking-wider px-1">
          <span>0:00</span>
          <span>{duration.toFixed(1)}s</span>
        </div>
      </div>

      {/* Editor Controls */}
      <div className="flex flex-col gap-2 min-w-50 border-l border-white/10 pl-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold tracking-widest text-white/60 uppercase">Zoom Keyframe</span>
          {activeZoom ? (
            <button 
              onClick={() => handleDeleteZoom(activeZoomIndex)}
              className="text-white/40 hover:text-red-400 p-1 rounded-md transition-colors"
              title="Delete this keyframe"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={handleAddZoom}
              className="text-branding-primary hover:text-white p-1 rounded-md hover:bg-branding-primary/20 transition-colors flex items-center gap-1 text-[10px] font-bold"
            >
              <Plus className="w-3 h-3" /> Add Zoom
            </button>
          )}
        </div>

        {activeZoom ? (
          <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-200">
            {/* Follow Cursor Toggle */}
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${activeZoom.type === 'cursor' ? 'bg-branding-accent border-branding-accent' : 'border-white/20 bg-black/40 group-hover:border-white/40'}`}>
                {activeZoom.type === 'cursor' && <Navigation className="w-2.5 h-2.5 text-white" />}
              </div>
              <input 
                type="checkbox" 
                className="hidden" 
                checked={activeZoom.type === 'cursor'} 
                onChange={(e) => handleUpdateActiveZoom({ type: e.target.checked ? 'cursor' : 'fixed' })} 
              />
              <span className="text-xs font-semibold text-white/80 group-hover:text-white">Follow Cursor</span>
            </label>

            {/* Scale Slider */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[10px] text-white/60">
                <span className="flex items-center gap-1"><ZoomIn className="w-3 h-3" /> Scale</span>
                <span className="font-mono">{activeZoom.zoomLevel.toFixed(1)}x</span>
              </div>
              <input 
                type="range" 
                min="1" max="4" step="0.1" 
                value={activeZoom.zoomLevel} 
                onChange={(e) => handleUpdateActiveZoom({ zoomLevel: parseFloat(e.target.value) })}
                className="w-full accent-branding-primary h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Manual X/Y if not following cursor */}
            {activeZoom.type === 'fixed' && (
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] text-white/60">
                  <span className="flex items-center gap-1"><Move className="w-3 h-3" /> Position</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="flex items-center bg-black/40 rounded px-2 py-1 border border-white/5">
                    <span className="text-[10px] text-white/40 mr-1 font-mono">X</span>
                    <input 
                      type="number" min="0" max="1" step="0.05" 
                      value={activeZoom.targetX ?? 0.5} 
                      onChange={(e) => handleUpdateActiveZoom({ targetX: parseFloat(e.target.value) })}
                      className="bg-transparent w-full text-xs font-mono text-white focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center bg-black/40 rounded px-2 py-1 border border-white/5">
                    <span className="text-[10px] text-white/40 mr-1 font-mono">Y</span>
                    <input 
                      type="number" min="0" max="1" step="0.05" 
                      value={activeZoom.targetY ?? 0.5} 
                      onChange={(e) => handleUpdateActiveZoom({ targetY: parseFloat(e.target.value) })}
                      className="bg-transparent w-full text-xs font-mono text-white focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Advanced Settings */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1 text-[10px] font-bold text-white/60 hover:text-white transition-colors group mt-2 pt-2 border-t border-white/10"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? '' : '-rotate-90'}`} />
              Advanced
            </button>

            {showAdvanced && (
              <div className="space-y-3 pt-2 border-t border-white/10 animate-in fade-in slide-in-from-top-1 duration-200">
                {/* Easing Function */}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/60 uppercase tracking-wider">Transition Easing</label>
                  <select
                    value={activeZoom.easing ?? 'linear'}
                    onChange={(e) => handleUpdateActiveZoom({ easing: e.target.value as any })}
                    className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-branding-accent text-left"
                  >
                    <option value="linear">Linear</option>
                    <option value="easeInQuad">Ease In (Slow Start)</option>
                    <option value="easeOutQuad">Ease Out (Slow End)</option>
                    <option value="easeInOutQuad">Ease In-Out (Smooth)</option>
                    <option value="easeInCubic">Ease In Cubic (Stronger)</option>
                    <option value="easeOutCubic">Ease Out Cubic</option>
                    <option value="easeInOutCubic">Ease In-Out Cubic</option>
                    <option value="easeOutElastic">Elastic (Bounce)</option>
                  </select>
                </div>

                {/* Transition Smoothing */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-white/60">
                    <span>Transition Smoothing</span>
                    <span className="font-mono">{(activeZoom.transitionSmoothing ?? 0.1).toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={activeZoom.transitionSmoothing ?? 0.1}
                    onChange={(e) => handleUpdateActiveZoom({ transitionSmoothing: parseFloat(e.target.value) })}
                    className="w-full accent-branding-accent h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                    title="Higher = smoother but slower transitions"
                  />
                  <div className="text-[9px] text-white/40">Higher = smoother transitions</div>
                </div>

                {/* Cursor Damping (only for cursor following) */}
                {activeZoom.type === 'cursor' && (
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] text-white/60">
                      <span>Cursor Smoothness</span>
                      <span className="font-mono">{(activeZoom.cursorDamping ?? 0.01).toFixed(3)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.001"
                      max="0.05"
                      step="0.001"
                      value={activeZoom.cursorDamping ?? 0.01}
                      onChange={(e) => handleUpdateActiveZoom({ cursorDamping: parseFloat(e.target.value) })}
                      className="w-full accent-branding-accent h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                      title="Controls how smoothly the zoom follows the cursor"
                    />
                    <div className="text-[9px] text-white/40">0.001 = instant, 0.05 = very slow</div>
                  </div>
                )}

                {/* Predictive Cursor (only for cursor following) */}
                {activeZoom.type === 'cursor' && (
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${activeZoom.predictiveCursor ? 'bg-branding-accent border-branding-accent' : 'border-white/20 bg-black/40 group-hover:border-white/40'}`}>
                      {activeZoom.predictiveCursor && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={activeZoom.predictiveCursor ?? false}
                      onChange={(e) => handleUpdateActiveZoom({ predictiveCursor: e.target.checked })}
                    />
                    <span className="text-[10px] font-semibold text-white/80 group-hover:text-white">Predictive Cursor Follow</span>
                  </label>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 p-2 border border-white/5 border-dashed rounded-lg">
            <span className="text-xs text-white/60">Move playhead &</span>
            <span className="text-xs font-bold text-white/80 mt-0.5">Click "Add Zoom"</span>
          </div>
        )}
      </div>

    </div>
  );
};
