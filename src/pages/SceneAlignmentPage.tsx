import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Clapperboard, Code2, Loader2, Sparkles, Check, X, LocateFixed, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import backgroundImage from '../assets/images/background.png';
import type { SlideData, VideoNarrationSceneTrack, VideoNarrationAnalysisData } from '../components/SlideEditor';
import { useVideoSceneSync } from '../hooks/useVideoSceneSync';

interface SceneAlignmentPageProps {
  slide: SlideData;
  slideIndex: number;
  slideNumber: number;
  isGenerating: boolean;
  onClose: () => void;
  onUpdate: (index: number, data: Partial<SlideData>) => void;
  onGenerateSceneAudio: (index: number) => Promise<void>;
  onGenerateSceneTTS: (slideIndex: number, sceneId: string) => Promise<void>;
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
  onGenerateSceneTTS,
}) => {
  const [showDebug, setShowDebug] = useState(false);
  const [generatingSceneId, setGeneratingSceneId] = useState<string | null>(null);

  const analysis = slide.videoNarrationAnalysis;
  const scenes = analysis?.scenes ?? [];

  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const totalDuration = analysis?.totalTimelineDurationSeconds ?? 0;

  const { videoRef, audioRef, isPlaying, elapsedTime, seekTo, togglePlayPause, skipForward, skipBack, onVideoLoadedMetadata } = useVideoSceneSync(scenes, totalDuration);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

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

  const handleGenerateSceneTTS = useCallback(async (sceneId: string) => {
    setGeneratingSceneId(sceneId);
    try {
      await onGenerateSceneTTS(slideIndex, sceneId);
    } finally {
      setGeneratingSceneId(null);
    }
  }, [onGenerateSceneTTS, slideIndex]);

  const handleProgressSeek = useCallback((e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || totalDuration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    seekTo(ratio * totalDuration);
  }, [seekTo, totalDuration]);

  // Progress bar window-level drag — mirrors SimplePreview
  useEffect(() => {
    const handleWindowMouseUp = () => setIsDragging(false);
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!progressBarRef.current) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekTo(ratio * totalDuration);
    };
    if (isDragging) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDragging, seekTo, totalDuration]);

  const hasAudio = scenes.some(s => s.audioUrl);
  const progressPercent = totalDuration > 0 ? (elapsedTime / totalDuration) * 100 : 0;

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
          <button
            onClick={() => setShowDebug(true)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/55 hover:text-white hover:bg-white/10 transition-all text-xs font-bold uppercase tracking-wider"
            title="Open raw Gemini JSON debug view"
          >
            <Code2 className="w-3.5 h-3.5" /> Debug
          </button>
          {hasAudio && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
              <Check className="w-3 h-3" /> Audio Ready
            </div>
          )}
          <button
            onClick={() => onGenerateSceneAudio(slideIndex)}
            disabled={isGenerating || generatingSceneId !== null || !analysis}
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

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:items-start">

            <section className="xl:sticky xl:top-6 self-start">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Slide Media</div>
              {slide.mediaUrl ? (
                <div className="rounded-xl overflow-hidden bg-black border border-white/10 shadow-2xl shadow-black/30 max-w-5xl">
                  <div className="aspect-video bg-black">
                    <video
                      ref={videoRef}
                      src={slide.mediaUrl}
                      className="w-full h-full object-contain"
                      muted
                      playsInline
                      preload="metadata"
                      onLoadedMetadata={onVideoLoadedMetadata}
                    />
                  </div>
                  <audio ref={audioRef} preload="none" />
                  {/* Player controls — mirrors SimplePreview */}
                  <div className="px-4 py-3 bg-black/60 border-t border-white/10">
                    {/* Seek bar */}
                    <div
                      ref={progressBarRef}
                      className="mb-3 group/timeline relative py-2 cursor-pointer"
                      onMouseDown={(e) => { setIsDragging(true); handleProgressSeek(e); }}
                      onTouchStart={handleProgressSeek}
                    >
                      <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden group-hover/timeline:h-2.5 transition-all">
                        <div
                          className="h-full bg-cyan-400 relative"
                          style={{ width: `${progressPercent}%` }}
                        >
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover/timeline:opacity-100 scale-0 group-hover/timeline:scale-100 transition-all" />
                        </div>
                      </div>
                    </div>
                    {/* Controls row */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={skipBack}
                        className="p-1.5 rounded-full text-white/70 hover:bg-white/10 hover:text-white transition-all"
                        title="-5s"
                      >
                        <SkipBack className="w-4 h-4" />
                      </button>
                      <button
                        onClick={togglePlayPause}
                        className="p-2.5 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black transition-all hover:scale-105 active:scale-95 shadow-lg shadow-cyan-500/20"
                      >
                        {isPlaying
                          ? <Pause className="w-5 h-5 fill-current" />
                          : <Play className="w-5 h-5 fill-current ml-0.5" />}
                      </button>
                      <button
                        onClick={skipForward}
                        className="p-1.5 rounded-full text-white/70 hover:bg-white/10 hover:text-white transition-all"
                        title="+5s"
                      >
                        <SkipForward className="w-4 h-4" />
                      </button>
                      <span className="ml-2 text-xs font-mono text-white/50">
                        {formatMMSS(elapsedTime)} / {formatMMSS(totalDuration)}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/3 aspect-video flex items-center justify-center text-sm text-white/35 max-w-5xl">
                  No video media available for this slide.
                </div>
              )}
            </section>

            <section className="min-w-0 xl:max-w-[420px] xl:justify-self-end">
              {scenes.length === 0 ? (
                <div className="flex items-center justify-center min-h-[40vh] rounded-xl border border-dashed border-white/10 bg-white/3 text-white/30 text-sm">
                  No scenes found. Try re-analyzing the video.
                </div>
              ) : (
                <div className="space-y-3">
                  {analysis && (
                    <div className="rounded-xl border border-white/10 bg-white/3 p-3 space-y-3">
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

                      <div className="space-y-1.5 pt-1">
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
                    </div>
                  )}

                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/40 pb-1">
                    Edit narration text, timestamps, or durations. Any edit resets scene audio.
                  </div>

                  {scenes.map((scene, i) => (
                    <SceneCard
                      key={scene.id}
                      scene={scene}
                      sceneNumber={i + 1}
                      onJumpToTimestamp={seekTo}
                      onEdit={handleSceneEdit}
                      onTimestampChange={handleTimestampChange}
                      onTimestampBlur={handleTimestampBlur}
                      onGenerateSceneTTS={handleGenerateSceneTTS}
                      isGeneratingTTS={generatingSceneId === scene.id}
                      anyGenerating={isGenerating || generatingSceneId !== null}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {showDebug && analysis?.rawGeminiJson && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          <button
            aria-label="Close debug modal"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowDebug(false)}
          />
          <div className="relative w-full max-w-4xl max-h-[85vh] rounded-2xl border border-white/10 bg-[#0c0c10] shadow-2xl shadow-black/50 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-white/5">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-white/70">Raw Gemini JSON</div>
                <div className="text-[11px] text-white/35">Technical output from video scene analysis</div>
              </div>
              <button
                onClick={() => setShowDebug(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-colors text-sm font-bold"
              >
                <X className="w-4 h-4" /> Close
              </button>
            </div>
            <pre className="overflow-auto max-h-[calc(85vh-64px)] p-4 text-[11px] leading-relaxed text-white/70 whitespace-pre-wrap break-words font-mono">
              {analysis.rawGeminiJson}
            </pre>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(pageContent, document.body);
};

interface SceneCardProps {
  scene: VideoNarrationSceneTrack;
  sceneNumber: number;
  onJumpToTimestamp: (seconds: number) => void;
  onEdit: (id: string, patch: Partial<VideoNarrationSceneTrack>) => void;
  onTimestampChange: (id: string, value: string) => void;
  onTimestampBlur: (id: string, value: string) => void;
  onGenerateSceneTTS: (sceneId: string) => Promise<void>;
  isGeneratingTTS: boolean;
  anyGenerating: boolean;
}

const SceneCard: React.FC<SceneCardProps> = ({ scene, sceneNumber, onJumpToTimestamp, onEdit, onTimestampChange, onTimestampBlur, onGenerateSceneTTS, isGeneratingTTS, anyGenerating }) => {
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

        <button
          onClick={() => onJumpToTimestamp(scene.effectiveStartSeconds)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 transition-colors text-[10px] font-bold uppercase tracking-wider"
          title={`Jump video preview to ${scene.timestampStart}`}
        >
          <LocateFixed className="w-3 h-3" /> Jump
        </button>

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

        <div className="flex justify-end pt-0.5">
          <button
            onClick={() => onGenerateSceneTTS(scene.id)}
            disabled={anyGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-branding-primary/10 border border-branding-primary/25 text-branding-primary hover:bg-branding-primary/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-[11px] font-bold"
            title={scene.audioUrl ? 'Regenerate TTS audio for this scene only' : 'Generate TTS audio for this scene only'}
          >
            {isGeneratingTTS ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</>
            ) : (
              <><Sparkles className="w-3 h-3" />{scene.audioUrl ? 'Regenerate TTS' : 'Generate TTS'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
