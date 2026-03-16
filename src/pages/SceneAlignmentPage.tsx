import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Clapperboard, Play, Pause, ChevronDown, ChevronUp, Loader2, Sparkles, Check } from 'lucide-react';
import backgroundImage from '../assets/images/background.png';
import type { SlideData, VideoNarrationSceneTrack, VideoNarrationAnalysisData } from '../components/SlideEditor';

interface SceneAlignmentPageProps {
  slide: SlideData;
  slideIndex: number;
  slideNumber: number;
  isGenerating: boolean;
  onClose: () => void;
  onUpdate: (index: number, data: Partial<SlideData>) => void;
  onGenerateSceneAudio: (index: number) => Promise<void>;
}

function formatMMSS(seconds: number): string {
  const clamped = Math.max(0, Math.round(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatSeconds(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0.00s';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
  return `${secs.toFixed(2)}s`;
}

function parseTimestampInput(value: string): number {
  const trimmed = value.trim();
  const mmss = /^(\d{1,2}):(\d{1,2})$/.exec(trimmed);
  if (mmss) return Math.max(0, Number(mmss[1]) * 60 + Number(mmss[2]));
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return Math.max(0, Math.round(numeric));
  return 0;
}

function rebuildAnalysis(
  analysis: VideoNarrationAnalysisData,
  updatedScenes: VideoNarrationSceneTrack[]
): Partial<SlideData> {
  const mergedScript = updatedScenes.map(s => s.narrationText.trim()).filter(Boolean).join(' ');
  const totalTimelineDurationSeconds = Math.max(
    analysis.videoMetadata.totalEstimatedDurationSeconds,
    updatedScenes.reduce((max, s) => Math.max(max, s.timestampStartSeconds + s.durationSeconds), 0)
  );
  return {
    script: mergedScript,
    audioUrl: undefined,
    audioDuration: undefined,
    videoNarrationAnalysis: {
      ...analysis,
      scenes: updatedScenes,
      totalStretchSeconds: 0,
      totalTimelineDurationSeconds,
    },
  };
}

export const SceneAlignmentPage: React.FC<SceneAlignmentPageProps> = ({
  slide,
  slideIndex,
  slideNumber,
  isGenerating,
  onClose,
  onUpdate,
  onGenerateSceneAudio,
}) => {
  const [showDebug, setShowDebug] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const analysis = slide.videoNarrationAnalysis;
  const scenes = analysis?.scenes ?? [];

  const handleSceneEdit = useCallback(
    (sceneId: string, patch: Partial<VideoNarrationSceneTrack>) => {
      if (!analysis) return;
      const updatedScenes = analysis.scenes.map((scene) => {
        if (scene.id !== sceneId) return scene;
        const merged = { ...scene, ...patch };
        return {
          ...merged,
          timestampStart: formatMMSS(merged.timestampStartSeconds),
          effectiveStartSeconds: merged.timestampStartSeconds,
          effectiveDurationSeconds: merged.durationSeconds,
          audioUrl: undefined as string | undefined,
          audioDurationSeconds: undefined as number | undefined,
        };
      });
      onUpdate(slideIndex, rebuildAnalysis(analysis, updatedScenes));
    },
    [analysis, slideIndex, onUpdate]
  );

  const handleTimestampChange = useCallback(
    (sceneId: string, value: string) => {
      const timestampStartSeconds = parseTimestampInput(value);
      handleSceneEdit(sceneId, {
        timestampStartSeconds,
        timestampStart: value, // keep raw input string while typing
      });
    },
    [handleSceneEdit]
  );

  const handleTimestampBlur = useCallback(
    (sceneId: string, value: string) => {
      const timestampStartSeconds = parseTimestampInput(value);
      handleSceneEdit(sceneId, {
        timestampStartSeconds,
        timestampStart: formatMMSS(timestampStartSeconds),
      });
    },
    [handleSceneEdit]
  );

  const toggleVideo = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().then(() => setVideoPlaying(true)).catch(() => {});
    } else {
      vid.pause();
      setVideoPlaying(false);
    }
  };

  const hasAudio = scenes.some(s => s.audioUrl);

  const pageContent = (
    <div className="fixed inset-0 z-[9999] text-white flex flex-col overflow-hidden" style={{ backgroundColor: '#09090b' }}>
      <img
        src={backgroundImage}
        alt=""
        aria-hidden="true"
        className="fixed inset-0 -z-10 w-full h-full object-cover opacity-30 blur-sm brightness-75 scale-105 pointer-events-none select-none"
      />

      {/* Header */}
      <header className="shrink-0 h-14 flex items-center gap-3 px-4 sm:px-6 border-b border-white/10 bg-black/30 backdrop-blur-sm">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all text-sm font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back to Editor</span>
        </button>

        <div className="flex items-center gap-2 ml-1">
          <Clapperboard className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="flex flex-col leading-none">
            <span className="text-xs font-black uppercase tracking-widest text-indigo-300">Scene Alignment Editor</span>
            <span className="text-[10px] text-white/40 mt-0.5">Slide {slideNumber} · {scenes.length} scene{scenes.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {hasAudio && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
              <Check className="w-3 h-3" /> Audio Ready
            </div>
          )}
          <button
            onClick={() => onGenerateSceneAudio(slideIndex)}
            disabled={isGenerating || !analysis}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-branding-primary/15 border border-branding-primary/30 text-branding-primary hover:bg-branding-primary/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm font-bold"
          >
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating TTS…</>
            ) : (
              <><Sparkles className="w-4 h-4" />{hasAudio ? 'Regenerate Scene TTS' : 'Generate Scene TTS'}</>
            )}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">

        {/* Left: Video preview + metadata */}
        <aside className="shrink-0 lg:w-80 xl:w-96 flex flex-col gap-4 p-4 border-b lg:border-b-0 lg:border-r border-white/10 overflow-y-auto">

          {/* Video preview */}
          {slide.mediaUrl && (
            <div className="relative rounded-xl overflow-hidden bg-black border border-white/10 aspect-video">
              <video
                ref={videoRef}
                src={slide.mediaUrl}
                className="w-full h-full object-contain"
                onEnded={() => setVideoPlaying(false)}
                muted
                playsInline
              />
              <button
                onClick={toggleVideo}
                className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors group"
              >
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  {videoPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
                </div>
              </button>
            </div>
          )}

          {/* Summary */}
          {analysis && (
            <div className="rounded-xl border border-white/10 bg-white/3 p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">Plan Summary</div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                <dt className="text-white/50">Total scenes</dt>
                <dd className="text-white font-bold">{scenes.length}</dd>
                <dt className="text-white/50">Video length</dt>
                <dd className="text-white font-bold">{formatSeconds(analysis.videoMetadata.totalEstimatedDurationSeconds)}</dd>
                <dt className="text-white/50">Timeline</dt>
                <dd className="text-white font-bold">{formatSeconds(analysis.totalTimelineDurationSeconds)}</dd>
                <dt className="text-white/50">TTS stretch</dt>
                <dd className={`font-bold ${analysis.totalStretchSeconds > 0 ? 'text-amber-300' : 'text-white'}`}>
                  {analysis.totalStretchSeconds > 0 ? `+${analysis.totalStretchSeconds.toFixed(2)}s` : 'None'}
                </dd>
                <dt className="text-white/50">Model</dt>
                <dd className="text-white/70 text-[10px] truncate col-span-1">{analysis.model}</dd>
              </dl>
            </div>
          )}

          {/* Timeline ruler */}
          {analysis && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">Timeline</div>
              <div className="relative h-10 rounded-lg bg-black/40 border border-white/10 overflow-hidden">
                {scenes.map((scene) => {
                  const total = Math.max(analysis.totalTimelineDurationSeconds, 0.001);
                  const left = (scene.effectiveStartSeconds / total) * 100;
                  const width = (Math.max(scene.audioDurationSeconds || scene.effectiveDurationSeconds, 0.05) / total) * 100;
                  return (
                    <div
                      key={scene.id}
                      className="absolute top-0 h-full bg-indigo-500/40 border-r border-indigo-300/50"
                      style={{ left: `${Math.max(0, Math.min(99, left))}%`, width: `${Math.max(0.5, Math.min(100, width))}%` }}
                      title={`Scene ${scene.stepNumber} · ${scene.timestampStart} · ${scene.durationSeconds}s`}
                    >
                      <span className="absolute left-1 top-1 text-[9px] font-bold text-indigo-100 leading-none">{scene.stepNumber}</span>
                      {scene.audioDurationSeconds && (
                        <span className="absolute bottom-1 left-1 text-[8px] text-emerald-300 leading-none">{scene.audioDurationSeconds.toFixed(1)}s</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[9px] text-white/30 font-mono">
                <span>0:00</span>
                <span>{formatSeconds(analysis.totalTimelineDurationSeconds)}</span>
              </div>
            </div>
          )}

          {/* Debug toggle */}
          <button
            onClick={() => setShowDebug(p => !p)}
            className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-white/3 border border-white/8 text-[10px] font-bold uppercase tracking-wider text-white/40 hover:text-white/70 transition-colors"
          >
            <span>Raw Gemini JSON</span>
            {showDebug ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showDebug && analysis?.rawGeminiJson && (
            <pre className="rounded-lg bg-black/50 border border-white/10 p-3 text-[9px] text-white/60 whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-mono">
              {analysis.rawGeminiJson}
            </pre>
          )}
        </aside>

        {/* Right: Editable scene list */}
        <div className="flex-1 overflow-y-auto p-4">
          {scenes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-white/30 text-sm">
              No scenes found. Try re-analyzing the video.
            </div>
          ) : (
            <div className="space-y-3 max-w-3xl mx-auto">
              <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 pb-1">
                Edit narration text, timestamps, or durations. Any edit resets scene audio.
              </div>

              {scenes.map((scene, i) => (
                <SceneCard
                  key={scene.id}
                  scene={scene}
                  sceneNumber={i + 1}
                  onEdit={handleSceneEdit}
                  onTimestampChange={handleTimestampChange}
                  onTimestampBlur={handleTimestampBlur}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(pageContent, document.body);
};

interface SceneCardProps {
  scene: VideoNarrationSceneTrack;
  sceneNumber: number;
  onEdit: (id: string, patch: Partial<VideoNarrationSceneTrack>) => void;
  onTimestampChange: (id: string, value: string) => void;
  onTimestampBlur: (id: string, value: string) => void;
}

const SceneCard: React.FC<SceneCardProps> = ({ scene, sceneNumber, onEdit, onTimestampChange, onTimestampBlur }) => {
  return (
    <div className="rounded-xl border border-white/10 bg-white/3 hover:border-white/20 transition-colors overflow-hidden">
      {/* Card header */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-white/3 border-b border-white/8">
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[10px] font-black text-indigo-300">
            {sceneNumber}
          </span>
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Step {scene.stepNumber}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[10px] text-white/50">Starts at</label>
          <input
            value={scene.timestampStart}
            onChange={(e) => onTimestampChange(scene.id, e.target.value)}
            onBlur={(e) => onTimestampBlur(scene.id, e.target.value)}
            className="w-20 h-7 px-2 rounded-lg bg-black/40 border border-white/15 text-[11px] text-white font-mono text-center focus:outline-none focus:border-indigo-400/60 focus:bg-indigo-500/5 transition-colors"
            placeholder="MM:SS"
            title="Scene start time in the video (MM:SS)"
          />

          <label className="text-[10px] text-white/50">Duration</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min="1"
              step="1"
              value={scene.durationSeconds}
              onChange={(e) => onEdit(scene.id, { durationSeconds: Math.max(1, Number(e.target.value) || 1) })}
              className="w-16 h-7 px-2 rounded-lg bg-black/40 border border-white/15 text-[11px] text-white font-mono text-center focus:outline-none focus:border-indigo-400/60 focus:bg-indigo-500/5 transition-colors"
              title="Scene duration in seconds"
            />
            <span className="text-[10px] text-white/40">s</span>
          </div>
        </div>

        {scene.audioDurationSeconds ? (
          <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-bold">
            <Check className="w-3 h-3" /> {scene.audioDurationSeconds.toFixed(2)}s audio
          </div>
        ) : (
          <div className="ml-auto text-[10px] text-white/30 font-bold uppercase tracking-wider">No audio yet</div>
        )}
      </div>

      {/* Narration */}
      <div className="px-4 py-3 space-y-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1.5">
            Narration script
          </label>
          <textarea
            value={scene.narrationText}
            onChange={(e) => onEdit(scene.id, { narrationText: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-400/50 focus:bg-indigo-500/3 transition-colors resize-y leading-relaxed"
            placeholder="What should the narrator say during this scene?"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1.5">
            On-screen action
          </label>
          <textarea
            value={scene.onScreenAction}
            onChange={(e) => onEdit(scene.id, { onScreenAction: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-[11px] text-white/70 focus:outline-none focus:border-indigo-400/50 focus:bg-indigo-500/3 transition-colors resize-y leading-relaxed"
            placeholder="What is happening visually in this scene?"
          />
        </div>
      </div>
    </div>
  );
};
