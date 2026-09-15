import React, { useRef } from 'react';
import {
  Volume2, VolumeX, X, Play, Square, ZoomIn, GripVertical, Mic, Trash2, Upload, Sparkles,
  Loader2, Video as VideoIcon, Clipboard, Check, Music, Speech, Undo2, CheckSquare, Maximize2,
  RotateCcw, RotateCw,
} from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useModal } from '../../context/ModalContext';
import { transformText } from '../../services/aiService';
import type { GlobalSettings } from '../../services/storage';
import type { Voice } from '../../services/ttsService';
import { Dropdown } from '../Dropdown';
import { ScriptEditorModal } from './ScriptEditorModal';
import type { SlideData, SlideAnalysisProgress, SlideEditorViewMode } from '../../types/slides';

export const SortableSlideItem = ({
  slide,
  index,
  onUpdate,
  onReplaceImage,
  onGenerate,
  onGenerateSceneAudio,
  onAnalyzeVideo,
  onOpenSceneEditor,
  analysisProgress,
  isGenerating,
  isAnalyzing,
  isAnyGenerating,
  isBatchRunning,
  isBatchActiveSlide,
  onExpand,
  highlightText,
  onDelete,
  ttsVolume,
  voices, // Add voices to destructuring
  globalSettings, // Add globalSettings to destructuring
  isMobile,
  slidesLength,
  viewMode,
  aspectRatio,
  isDownloading = false,
  onShowDownloadBlocked,
  onEnsureWebLLMReady,
  onTransformStateChange,
}: {
  slide: SlideData,
  index: number,
  onUpdate: (i: number, d: Partial<SlideData>) => void,
  onReplaceImage: (i: number, file: File) => Promise<void>,
  onGenerate: (i: number) => Promise<void>,
  onGenerateSceneAudio: (i: number) => Promise<void>,
  onAnalyzeVideo: (i: number) => Promise<void>,
  onOpenSceneEditor: (i: number) => void,
  analysisProgress?: SlideAnalysisProgress,
  isGenerating: boolean,
  isAnalyzing: boolean,
  isAnyGenerating: boolean,
  /** True while any batch operation (TTS or AI fix) is running, across any slide. */
  isBatchRunning: boolean,
  /** True only for the single slide a batch operation is actively processing right now. */
  isBatchActiveSlide: boolean,
  onExpand: (i: number) => void,
  highlightText?: string,
  onDelete: (index: number) => void;
  ttsVolume?: number;
  voices: Voice[];
  globalSettings?: GlobalSettings | null;
  isMobile: boolean;
  slidesLength: number;
  viewMode: SlideEditorViewMode;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3';
  isDownloading?: boolean;
  onShowDownloadBlocked?: (action: string) => void;
  /** Loads the local WebLLM model with visible progress. Resolves false if the fix should abort. */
  onEnsureWebLLMReady?: (modelId: string) => Promise<boolean>;
  onTransformStateChange?: (index: number, isTransforming: boolean) => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });

  const { showAlert, showConfirm } = useModal();
  const isGridView = viewMode === 'grid';
  const isUploadedVideoMediaSlide = slide.type === 'video' && Boolean(slide.mediaUrl);
  const useCompactMediaToolbar = isUploadedVideoMediaSlide;

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [isReplacingImage, setIsReplacingImage] = React.useState(false);
  const [isTransforming, setIsTransforming] = React.useState(false);
  const [isCopied, setIsCopied] = React.useState(false);
  const [showScriptEditor, setShowScriptEditor] = React.useState(false);
  const replaceImageInputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Recording State
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingDuration, setRecordingDuration] = React.useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [isCountingDown, setIsCountingDown] = React.useState(false);
  const [countdownValue, setCountdownValue] = React.useState(5);
  const countdownTimerRef = useRef<number | null>(null);

  // Cleanup audio on unmount or if slide changes
  React.useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }
      gainNodeRef.current = null;

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }

      // Stop media stream tracks to release microphone
      cleanupMediaStream();
    };
  }, [slide.audioUrl]);

  const togglePlayback = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }
      gainNodeRef.current = null;
    } else if (slide.audioUrl) {
      const audio = new Audio(slide.audioUrl);
      const vol = ttsVolume ?? 1;

      // Handle volume > 100% using Web Audio API
      if (vol > 1) {
        try {
          // Fallback for safety if AudioContext fails
          audio.volume = 1;

          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioContextClass();
          const source = ctx.createMediaElementSource(audio);
          const gainNode = ctx.createGain();

          gainNode.gain.value = vol;
          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          audioContextRef.current = ctx;
          gainNodeRef.current = gainNode;
        } catch (e) {
          console.error("Audio amplification failed", e);
          audio.volume = 1; // Fallback to max normal volume
        }
      } else {
        audio.volume = Math.max(0, vol);
      }

      audio.onended = () => {
        setIsPlaying(false);
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(console.error);
          audioContextRef.current = null;
        }
        gainNodeRef.current = null;
      };

      audio.play().catch(e => {
        console.error("Audio playback failed", e);
        setIsPlaying(false);
      });
      audioRef.current = audio;
      setIsPlaying(true);
    }
  };

  // Live volume adjustment effect
  React.useEffect(() => {
    if (isPlaying && audioRef.current) {
      const vol = ttsVolume ?? 1;
      const audio = audioRef.current;

      // If volume exceeds 100% and we haven't set up Web Audio yet, do it now
      if (vol > 1 && !audioContextRef.current) {
        try {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioContextClass();
          const source = ctx.createMediaElementSource(audio);
          const gainNode = ctx.createGain();

          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          audioContextRef.current = ctx;
          gainNodeRef.current = gainNode;

          // Reset element volume to 1 so gain node controls full range
          audio.volume = 1;
        } catch (e) {
          console.error("Audio amplification upgrade failed", e);
        }
      }

      // Apply volume
      if (audioContextRef.current && gainNodeRef.current) {
        // Web Audio API control
        gainNodeRef.current.gain.value = vol;
        if (audio.volume !== 1) audio.volume = 1;
      } else {
        // Standard Audio API control
        audio.volume = Math.max(0, vol);
      }
    }
  }, [ttsVolume, isPlaying]);

  const cleanupMediaStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping media track:', e);
        }
      });
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  const doStartRecording = async (useExistingStream = false) => {
    try {
      let stream;
      if (useExistingStream && mediaStreamRef.current) {
        stream = mediaStreamRef.current;
      } else {
        // Ensure any existing stream is cleaned up before starting a new one
        cleanupMediaStream();
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // IMMEDIATE cleanup first - stop tracks to release microphone
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(track => {
            track.stop();
          });
          mediaStreamRef.current = null;
        }

        // Then process the recorded audio
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);

        // Find duration
        const tempAudio = new Audio(url);
        tempAudio.onloadedmetadata = () => {
          const audioDuration = tempAudio.duration;
          const nextDuration = slide.type === 'video'
            ? Math.max(slide.mediaDuration ?? slide.duration ?? 5, audioDuration)
            : audioDuration;

          onUpdate(index, {
            audioUrl: url,
            audioDuration,
            duration: nextDuration,
            audioSourceType: 'recorded'
          });
        };
        // fallback if loadedmetadata doesn't fire nicely
        setTimeout(() => {
          if (!tempAudio.duration || tempAudio.duration === Infinity) {
            const audioDuration = recordingDuration;
            const nextDuration = slide.type === 'video'
              ? Math.max(slide.mediaDuration ?? slide.duration ?? 5, audioDuration)
              : audioDuration;

            onUpdate(index, {
              audioUrl: url,
              audioDuration,
              duration: nextDuration,
              audioSourceType: 'recorded'
            });
          }
        }, 500);

        // Clear the media recorder ref
        mediaRecorderRef.current = null;
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      // Clear any existing recording interval before starting a new one
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      showAlert("Microphone access denied or unavailable.", { type: 'error', title: 'Microphone Error' });
    }
  };

  const startRecording = async () => {
    // Check if there's existing recorded audio
    if (slide.audioSourceType === 'recorded' && slide.audioUrl) {
      const confirmed = await showConfirm(
        "This slide already has a recorded voice. Do you want to overwrite it with a new recording?",
        { type: 'warning', title: 'Overwrite Recording?', confirmText: 'Overwrite' }
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      // Request microphone access first so we don't count down if they deny or don't have one
      cleanupMediaStream();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
    } catch (err) {
      console.error("Error accessing microphone:", err);
      showAlert("Microphone access denied or unavailable.", { type: 'error', title: 'Microphone Error' });
      return;
    }

    // Check if countdown is disabled in settings
    if (globalSettings?.recordingCountdownEnabled === false) {
      // Start recording immediately without countdown
      doStartRecording(true);
    } else {
      // Start the countdown
      setIsCountingDown(true);
      setCountdownValue(5);
      // Clear any existing countdown interval before starting a new one
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
      countdownTimerRef.current = window.setInterval(() => {
        setCountdownValue(prev => {
          if (prev <= 1) {
            clearInterval(countdownTimerRef.current!);
            countdownTimerRef.current = null;
            setIsCountingDown(false);
            doStartRecording(true);
            return 5;
          }
          return prev - 1;
        });
      }, 1000);
    }
  };

  const cancelCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setIsCountingDown(false);
    setCountdownValue(5);
    cleanupMediaStream();
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    // ALWAYS attempt cleanup, regardless of MediaRecorder state
    cleanupMediaStream();

    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const handleTransform = async () => {
    if (isDownloading) {
      onShowDownloadBlocked?.('AI Fix Script');
      return;
    }
    const useWebLLM = globalSettings?.useWebLLM;
    const webLlmModel = globalSettings?.webLlmModel;

    const apiKey = import.meta.env.VITE_LLM_API_KEY || '';
    const baseUrl = localStorage.getItem('llm_base_url') || import.meta.env.VITE_LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
    const model = localStorage.getItem('llm_model') || import.meta.env.VITE_LLM_MODEL || 'gemini-2.5-flash';

    if (useWebLLM && !webLlmModel) {
      showAlert('Please select and load a WebLLM model in Settings (WebLLM tab) to use this feature.', { type: 'warning', title: 'WebLLM Not Configured' });
      return;
    }

    if (!slide.script.trim()) return;

    if (!await showConfirm("This will replace the current script with an AI-enhanced version. Continue?", { title: 'AI Enhancement', confirmText: 'Enhance' })) {
      return;
    }

    // Load the local model up front so its download/compile shows real progress instead of
    // hiding behind a "Fixing..." label. Once resident, transformText's own
    // ensureWebLLMReady short-circuits.
    if (useWebLLM && webLlmModel && onEnsureWebLLMReady) {
      if (!await onEnsureWebLLMReady(webLlmModel)) return;
    }

    setIsTransforming(true);
    onTransformStateChange?.(index, true);

    // Yield to event loop to prevent React state batching from blocking WebLLM
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      let transformed = await transformText({
        apiKey: apiKey || '',
        baseUrl,
        model,
        useWebLLM,
        webLlmModel,
        openaiEndpoint: globalSettings?.openaiEndpoint,
        openaiModel: globalSettings?.openaiModel,
        openaiApiKey: globalSettings?.openaiApiKey,
        openaiDisableThinking: globalSettings?.openaiDisableThinking !== false,
        useOpenAIFixScript: globalSettings?.useOpenAIFixScript
      }, slide.script, globalSettings?.aiFixScriptSystemPrompt, globalSettings?.aiFixScriptContext);

      // Sometimes small models (like 2B) return the exact same text or fail to elaborate.
      // Automatically retry once if the text is identical (ignoring whitespace/punctuation).
      // Skipped for WebLLM: local 2B models return near-identical text often enough that this
      // fires routinely, and a second local generation doubles the GPU work for little gain.
      const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (!useWebLLM && normalize(transformed) === normalize(slide.script)) {
        transformed = await transformText({
          apiKey: apiKey || '',
          baseUrl,
          model,
          useWebLLM,
          webLlmModel,
          openaiEndpoint: globalSettings?.openaiEndpoint,
          openaiModel: globalSettings?.openaiModel,
          openaiApiKey: globalSettings?.openaiApiKey,
          openaiDisableThinking: globalSettings?.openaiDisableThinking !== false,
          useOpenAIFixScript: globalSettings?.useOpenAIFixScript
        }, slide.script, globalSettings?.aiFixScriptSystemPrompt, globalSettings?.aiFixScriptContext);
      }

      onUpdate(index, { script: transformed, originalScript: slide.script });
    } catch (error) {
      console.error("[SlideEditor] Transformation Error:", error);
      showAlert('Transformation failed: ' + (error instanceof Error ? error.message : String(error)), { type: 'error', title: 'Transformation Failed' });
    } finally {
      setIsTransforming(false);
      onTransformStateChange?.(index, false);
    }
  };

  const handleCopyScript = async () => {
    if (!slide.script) return;
    try {
      await navigator.clipboard.writeText(slide.script);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const handleRevertScript = async () => {
    if (slide.originalScript) {
      if (await showConfirm("Revert to original script? This will discard current changes.", { type: 'warning', title: 'Revert Script', confirmText: 'Revert' })) {
        onUpdate(index, { script: slide.originalScript, originalScript: undefined });
      }
    }
  };

  const syncScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleTextChange = (newText: string) => {
    onUpdate(index, { script: newText });
  };

  const handleReplaceImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsReplacingImage(true);
    try {
      await onReplaceImage(index, file);
    } finally {
      setIsReplacingImage(false);
      event.target.value = '';
    }
  };

  // Render the backdrop content
  const renderBackdrop = () => {
    if (!highlightText) {
      return slide.script;
    }

    // Use regex-based highlighting for simpler, more reliable results
    const regex = new RegExp(`(${highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = slide.script.split(regex);

    return parts.map((part, index) => {
      // When using split() with a capturing group, matches are at odd indices
      if (index % 2 === 1 && part) {
        return (
          <mark key={`${index}-${part}`} className="bg-yellow-500/60 text-transparent rounded-sm p-0 m-0 border-none inline">
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  return (
    <div
      ref={setNodeRef}
      id={`slide-card-${slide.id}`}
      style={style}
      className={`group relative flex flex-col ${isGridView ? 'gap-4 h-full' : 'sm:flex-row gap-4 sm:gap-6'} p-4 sm:p-5 rounded-2xl bg-linear-to-br from-white/10 to-white/5 border shadow-2xl shadow-black/40 ring-1 ring-inset transition-[border-color,box-shadow] duration-300 ${
        // While a batch operation is running, only the slide it's actively working on should
        // get the highlighted/animated border — isGenerating is blanket-true for every slide
        // for the duration of a batch TTS run, so it can't be used to pick out just one card.
        (isBatchRunning ? isBatchActiveSlide : isGenerating) || isTransforming
          ? 'border-2 border-branding-primary shadow-[0_0_36px_rgba(56,189,248,0.38)] ring-4 ring-branding-primary/35 animate-border-flow'
          : 'border-white/30 ring-white/10 hover:border-branding-primary/60 hover:shadow-branding-primary/10 hover:ring-branding-primary/20'
      }`}
    >
      {/* Drag Handle */}
      <div
        className={`absolute cursor-grab active:cursor-grabbing text-white hover:text-branding-primary transition-colors z-20 touch-none bg-[#18181b] rounded-full border border-white/10 ${isGridView ? 'left-1/2 top-3 -translate-x-1/2 p-1.5 bg-transparent' : 'left-1/2 -top-3 sm:left-0 sm:top-1/2 -translate-x-1/2 sm:translate-x-0 sm:-translate-y-1/2 p-1.5 sm:p-1 sm:bg-transparent sm:border-transparent'}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className={`w-5 h-5 ${isGridView ? 'rotate-90' : 'rotate-90 sm:rotate-0'}`} />
      </div>

      {/* Slide Preview */}
      {/* Slide Preview Column */}
      <div className={`w-full flex flex-col gap-3 justify-center ${isGridView ? '' : 'sm:w-[45%] sm:ml-2 mt-4 sm:mt-0'}`}>
        {/* Enhanced slide number header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdate(index, { isSelected: !slide.isSelected });
              }}
              className={`p-1 rounded-md transition-all ${slide.isSelected ? 'text-branding-primary' : 'text-white/40 hover:text-white/70'}`}
              title={slide.isSelected ? "Deselect Slide" : "Select Slide"}
            >
              {slide.isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
            </button>
            <span className="text-xs font-bold text-white/40 uppercase tracking-widest">
              {slide.type === 'video' ? 'Media' : 'Slide'}
            </span>
          </div>
          {/* Prominent slide number display */}
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-branding-primary">{index + 1}</span>
            <span className="text-sm font-medium text-white/30">/ {slidesLength}</span>
          </div>
        </div>

        <div
          className="w-full rounded-2xl overflow-hidden border border-white/10 ring-1 ring-white/5 shadow-2xl shadow-black/40 relative bg-black group/image"
          style={{ aspectRatio: aspectRatio.replace(':', '/') }}
        >
          <div className="absolute top-2 left-2 z-10 flex gap-1.5 opacity-0 pointer-events-none transition-all duration-200 group-hover/image:opacity-100 group-hover/image:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
            <button
              type="button"
              data-no-expand="true"
              onClick={(e) => {
                e.stopPropagation();
                const newRotation = (slide.rotation || 0) - 90;
                onUpdate(index, { rotation: newRotation });
              }}
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-black/60 p-1.5 text-white/90 hover:bg-black/80 transition-colors cursor-pointer"
              title="Rotate Counter-Clockwise"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              data-no-expand="true"
              onClick={(e) => {
                e.stopPropagation();
                const newRotation = (slide.rotation || 0) + 90;
                onUpdate(index, { rotation: newRotation });
              }}
              className="inline-flex items-center justify-center rounded-md border border-white/20 bg-black/60 p-1.5 text-white/90 hover:bg-black/80 transition-colors cursor-pointer"
              title="Rotate Clockwise"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {slide.type === 'video' ? (
            <video
              src={slide.mediaUrl}
              className="w-full h-full object-contain rounded-2xl transition-transform duration-500"
              style={{ transform: `rotate(${slide.rotation || 0}deg)` }}
              muted
              onClick={() => onExpand(index)}
            />
          ) : (
            <img
              src={slide.dataUrl}
              alt={`Slide ${index + 1}`}
              className="w-full h-full object-contain transition-transform duration-500 rounded-2xl"
              style={{ transform: `rotate(${slide.rotation || 0}deg)` }}
              onClick={() => onExpand(index)}
            />
          )}

          <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover/image:opacity-100 pointer-events-none">
            <ZoomIn className="w-8 h-8 text-white drop-shadow-md" />
          </div>

          {slide.type === 'image' && (
            <>
              <input
                ref={replaceImageInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                className="hidden"
                onChange={handleReplaceImageUpload}
              />
              <button
                type="button"
                data-no-expand="true"
                onClick={(e) => {
                  e.stopPropagation();
                  replaceImageInputRef.current?.click();
                }}
                disabled={isReplacingImage}
                className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-black/60 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/90 opacity-0 pointer-events-none transition-all duration-200 group-hover/image:opacity-100 group-hover/image:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-60"
                title="Replace slide image (PDF/JPG/PNG)"
              >
                {isReplacingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                {isReplacingImage ? 'Replacing...' : 'Replace'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Editing Controls */}
      <div className={`flex-1 ${isGridView ? 'space-y-3' : 'space-y-4'}`}>
        <div className="space-y-2">
          {isMobile ? (
            <>
              <div className="flex flex-col w-full gap-3">
                {isMobile && (
                  <button
                    onClick={() => setShowScriptEditor(true)}
                    className="flex items-center justify-center gap-2 min-h-11 px-4 text-sm font-semibold text-branding-primary bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all active:scale-[0.98] cursor-pointer"
                    title="Open Focus Mode Editor"
                  >
                    <Maximize2 className="w-4 h-4" /> Focus Mode
                  </button>
                )}
                <button
                  onClick={handleTransform}
                  disabled={isTransforming || !slide.script.trim()}
                  className="flex items-center justify-center gap-2 min-h-11 px-4 text-sm font-semibold text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  title="Use AI to transform raw PDF text into natural sentences"
                >
                  {isTransforming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isTransforming ? 'Fixing...' : 'AI Fix Script'}
                </button>
                <button
                  onClick={handleCopyScript}
                  disabled={!slide.script.trim()}
                  className="flex items-center justify-center gap-2 min-h-11 px-4 text-sm font-semibold text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Copy script to clipboard"
                >
                  {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Clipboard className="w-4 h-4" />}
                  {isCopied ? 'Copied!' : 'Copy'}
                </button>
                {slide.originalScript && (
                  <button
                    onClick={handleRevertScript}
                    className="flex items-center justify-center gap-2 min-h-11 px-4 text-sm font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-xl transition-all active:scale-[0.98]"
                    title="Revert to original script"
                  >
                    <Undo2 className="w-4 h-4" /> Revert
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(index);
                  }}
                  className="flex items-center justify-center gap-2 min-h-11 px-4 text-sm font-semibold text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all active:scale-[0.98]"
                  title="Delete Slide"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              </div>
              <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Script (TTS Text)</label>
            </>
          ) : (
            <div className={`flex ${isGridView ? 'flex-col gap-2 items-start' : 'items-center justify-between'}`}>
              {isGridView ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleTransform}
                      disabled={isTransforming || !slide.script.trim()}
                      className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
                      title="Use AI to transform raw PDF text into natural sentences"
                    >
                      {isTransforming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={handleCopyScript}
                      disabled={!slide.script.trim()}
                      className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                      title="Copy script to clipboard"
                    >
                      {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Clipboard className="w-4 h-4" />}
                    </button>
                    {slide.originalScript && (
                      <button
                        onClick={handleRevertScript}
                        className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 transition-colors flex items-center justify-center"
                        title="Revert to original script"
                      >
                        <Undo2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(index);
                      }}
                      className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
                      title="Delete Slide"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <label className="mt-1 text-xs font-bold text-white/40 uppercase tracking-widest">Script (TTS Text)</label>
                </>
              ) : (
                <>
                  <label className="text-xs font-bold text-white/40 uppercase tracking-widest">Script (TTS Text)</label>
                  <div className="flex flex-wrap gap-2 sm:gap-3">
                <button
                  onClick={handleTransform}
                  disabled={isTransforming || !slide.script.trim()}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
                  title="Use AI to transform raw PDF text into natural sentences"
                >
                  {isTransforming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleCopyScript}
                  disabled={!slide.script.trim()}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                  title="Copy script to clipboard"
                >
                  {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Clipboard className="w-4 h-4" />}
                </button>
                {slide.originalScript && (
                  <button
                    onClick={handleRevertScript}
                    className="p-1.5 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-400/10 transition-colors flex items-center justify-center"
                    title="Revert to original script"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(index);
                  }}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
                  title="Delete Slide"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
                </>
              )}
            </div>
          )}

          <div className={`relative w-full ${isGridView ? 'h-24' : 'h-32'} rounded-xl bg-white/5 border border-white/10 transition-all overflow-hidden`}>
            {/* Backdrop (Highlights) */}
            <div
              ref={backdropRef}
              className="absolute inset-0 w-full h-full m-0 px-4 py-3 font-sans! text-[16px]! tracking-normal! leading-[1.6]! whitespace-pre-wrap overflow-y-auto wrap-break-word text-transparent pointer-events-none border border-transparent outline-none"
              style={{ paddingRight: '1.5rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
              aria-hidden="true"
              dir="ltr"
            >
              {renderBackdrop()}
            </div>

            {/* Actual Textarea */}
            <textarea
              ref={textareaRef}
              value={slide.script}
              onChange={(e) => handleTextChange(e.target.value)}
              onScroll={syncScroll}
              className="absolute inset-0 w-full h-full m-0 px-4 py-3 font-sans! text-[16px]! tracking-normal! leading-[1.6]! whitespace-pre-wrap bg-transparent text-white resize-none outline-none border border-transparent focus:ring-0 selection:bg-branding-primary/20 overflow-y-auto wrap-break-word cursor-auto"
              style={{ paddingRight: '1.5rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
              placeholder="Write or edit your narration script..."
              spellCheck={false}
              dir="ltr"
            />
          </div>
        </div>

        <div className={`pt-2 ${isGridView ? 'space-y-4' : 'space-y-6'}`}>
          {/* Inputs Grid */}
          <div className={`grid grid-cols-1 gap-4 ${isGridView ? 'xl:grid-cols-2' : 'sm:grid-cols-3'}`}>
            <div className="space-y-1.5" title="Select the AI voice for narration">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-0.5">Voice</label>
              <Dropdown
                options={voices}
                value={slide.voice}
                onChange={(val) => onUpdate(index, { voice: val })}
                className="bg-white/5 border border-white/10 hover:border-white/20 backdrop-blur-sm transition-all focus:border-branding-primary/50 text-sm h-10 rounded-lg"
              />
            </div>

            <div className="space-y-1.5" title="Choose the animation between slides">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-0.5">Transition</label>
              <Dropdown
                options={[
                  { id: 'fade', name: 'Fade' },
                  { id: 'slide', name: 'Slide' },
                  { id: 'zoom', name: 'Zoom' },
                  { id: 'none', name: 'None' },
                ]}
                value={slide.transition}
                onChange={(val) => onUpdate(index, { transition: val as SlideData['transition'] })}
                className="bg-white/5 border border-white/10 hover:border-white/20 backdrop-blur-sm transition-all focus:border-branding-primary/50 text-sm h-10 rounded-lg"
              />
            </div>

            <div className="space-y-1.5" title="Pause duration after audio finishes">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-0.5">
                Delay (s)
              </label>
              <div className="relative group/input">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={slide.postAudioDelay || 0}
                  onChange={(e) => onUpdate(index, { postAudioDelay: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 h-10 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:border-branding-primary/50 focus:ring-1 focus:ring-branding-primary/50 outline-none transition-all backdrop-blur-sm group-hover/input:bg-white/10"
                />
              </div>
            </div>
          </div>

          {/* Actions Toolbar */}
          <div className={`flex flex-wrap items-center gap-2 ${isGridView ? '' : 'sm:gap-3'} ${useCompactMediaToolbar ? 'sm:flex-nowrap' : ''} p-2 rounded-xl bg-black/20 border border-white/5 backdrop-blur-sm overflow-x-auto`}>
            {/* Generate Button - hide if audio was recorded */}
            {slide.audioSourceType !== 'recorded' && (
              <button
                onClick={() => (slide.type === 'video' && slide.videoNarrationAnalysis?.scenes?.length
                  ? onGenerateSceneAudio(index)
                  : onGenerate(index))}
                disabled={isGenerating || (!slide.script.trim() && !slide.videoNarrationAnalysis?.scenes?.length) || isRecording}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20 disabled:opacity-40 disabled:grayscale transition-all font-bold text-[10px] uppercase tracking-wider cursor-pointer h-9 whitespace-nowrap"
                title={slide.type === 'video' && slide.videoNarrationAnalysis?.scenes?.length ? 'Generate scene-level TTS using the current alignment plan' : 'Generate AI narration from script text'}
              >
                {slide.audioUrl ? <Volume2 className="w-3.5 h-3.5" /> : <Speech className="w-3.5 h-3.5" />}
                {slide.type === 'video' && slide.videoNarrationAnalysis?.scenes?.length ? (slide.audioUrl ? 'Regenerate Scene TTS' : 'Generate Scene TTS') : (slide.audioUrl ? 'Regenerate' : 'Generate TTS Audio')}
              </button>
            )}

            {/* Analyze Video button moved to the scene summary panel below for uploaded media slides */}

            {/* Record Button */}
            <button
              onClick={() => isRecording ? stopRecording() : startRecording()}
              disabled={isGenerating}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all font-bold text-[10px] uppercase tracking-wider cursor-pointer h-9 whitespace-nowrap ${isRecording
                ? 'bg-red-500/20 border-red-500/40 text-red-500'
                : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20 disabled:opacity-40 disabled:grayscale'}`}
              title="Record your own voice directly"
            >
              <Mic className="w-3.5 h-3.5" />
              {isRecording ? `Stop Recording (${Math.floor(recordingDuration / 60)}:${(recordingDuration % 60).toString().padStart(2, '0')})` : 'Record Voice'}
            </button>

            {slide.audioUrl && (
              <button
                onClick={togglePlayback}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all font-bold text-[10px] uppercase tracking-wider h-9 ${isPlaying ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/40'}`}
                title="Play the slide audio"
              >
                {isPlaying ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                {isPlaying ? 'Stop' : 'Preview'}
              </button>
            )}

            {/* Show a subtle indicator when this slide is queued/generating */}
            {isGenerating && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-branding-primary/80 uppercase tracking-wider animate-pulse ml-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Generating...
              </span>
            )}
            {isAnalyzing && analysisProgress && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-200/80 uppercase tracking-wider ml-1">
                <Loader2 className="w-3 h-3 animate-spin" /> {analysisProgress.progress}%
              </span>
            )}
            {!isGenerating && isAnyGenerating && !slide.audioUrl && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-white/30 uppercase tracking-wider ml-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Queued
              </span>
            )}
            {slide.type === 'video' && slide.videoNarrationAnalysis && !isAnalyzing && !isUploadedVideoMediaSlide && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-200/80 uppercase tracking-wider ml-1">
                <Check className="w-3 h-3" /> {slide.videoNarrationAnalysis.scenes.length} Scene{slide.videoNarrationAnalysis.scenes.length !== 1 ? 's' : ''}
              </span>
            )}

            <div className={`w-px h-5 bg-white/10 mx-1 ${useCompactMediaToolbar ? 'hidden' : (isGridView ? 'hidden xl:block' : 'hidden sm:block')}`} />

            {/* Controls Group */}
            <div className={`${useCompactMediaToolbar ? 'ml-auto flex items-center gap-2 shrink-0' : `flex items-center gap-2 w-full ${isGridView ? '' : 'ml-auto sm:w-auto'}`}`}>
              {slide.type === 'video' && (
                <button
                  onClick={() => onUpdate(index, { isVideoMusicPaused: !slide.isVideoMusicPaused })}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all h-9 ${slide.isVideoMusicPaused ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:bg-white/10'}`}
                  title="Toggle the embedded video's audio on/off for this slide"
                >
                  {slide.isVideoMusicPaused ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  <span className={`${useCompactMediaToolbar ? 'hidden md:inline ml-2' : 'hidden sm:inline ml-2'} text-[10px] font-bold uppercase tracking-wider`}>{useCompactMediaToolbar ? 'VIDEO' : 'VIDEO AUDIO'}</span>
                </button>
              )}

              <button
                onClick={() => onUpdate(index, { isMusicDisabled: !slide.isMusicDisabled })}
                className={`${useCompactMediaToolbar ? '' : 'flex-1 sm:flex-none'} px-3 py-2 rounded-lg border transition-all font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 h-9 ${!slide.isMusicDisabled ? 'bg-white/10 text-white border-white/20 hover:bg-white/15' : 'bg-white/5 text-white/40 border-white/10 hover:text-white hover:bg-white/10'}`}
                title="Toggle the project's background music for this slide (global music track)"
              >
                {!slide.isMusicDisabled ? <Music className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                <span className={`${useCompactMediaToolbar ? 'hidden md:inline' : 'hidden sm:inline'}`}>{useCompactMediaToolbar ? 'BG MUSIC' : 'BACKGROUND MUSIC'}</span>
              </button>
            </div>
          </div>
          {isAnalyzing && analysisProgress && (
            <div className="px-2 pt-1 pb-0.5 w-full">
              <div className="h-1.5 w-full rounded-full bg-indigo-500/20 overflow-hidden">
                <div
                  className="h-full bg-indigo-400 transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, analysisProgress.progress))}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {(slide.audioDuration ?? slide.duration) && (
          <div className="text-[10px] text-white/40 font-medium">
            Audio Duration: {(slide.audioDuration ?? slide.duration ?? 0).toFixed(2)}s
          </div>
        )}

        {slide.type === 'video' && (slide.videoNarrationAnalysis || isUploadedVideoMediaSlide) && (
          <div className="mt-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2.5 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {slide.videoNarrationAnalysis ? (
                <>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                    {slide.videoNarrationAnalysis.scenes.length} Scene{slide.videoNarrationAnalysis.scenes.length !== 1 ? 's' : ''}
                  </span>
                  {slide.videoNarrationAnalysis.scenes.some(s => s.audioUrl) ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-300 font-bold">
                      <Check className="w-3 h-3" /> Audio ready
                    </span>
                  ) : (
                    <span className="text-[10px] text-white/40">No audio yet — open editor to review &amp; generate</span>
                  )}
                </>
              ) : (
                <span className="text-[10px] text-white/40">No analysis yet — analyze video to generate narration</span>
              )}
            </div>
            <button
              onClick={() => onAnalyzeVideo(index)}
              disabled={isAnalyzing || isGenerating || isRecording}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/40 disabled:opacity-40 disabled:grayscale transition-all text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
              title="Analyze video and build editable timestamped narration plan"
            >
              {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <VideoIcon className="w-3.5 h-3.5" />}
              {isAnalyzing ? (analysisProgress?.status || 'Analyzing Video...') : 'Analyze Video'}
            </button>
            {slide.videoNarrationAnalysis && (
              <button
                onClick={() => onOpenSceneEditor(index)}
                disabled={isAnalyzing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-all text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                title="Open the full-screen scene alignment editor"
              >
                <Maximize2 className="w-3.5 h-3.5" /> Edit Scenes
              </button>
            )}
          </div>
        )}
      </div>

      <ScriptEditorModal
        isOpen={showScriptEditor}
        onClose={() => setShowScriptEditor(false)}
        script={slide.script}
        onUpdate={(data) => onUpdate(index, data)}
        highlightText={highlightText}
      />

      {/* Recording Countdown Modal */}
      {isCountingDown && (
        <div className="fixed inset-0 z-100 isolation:isolate flex items-center justify-center p-4 animate-fade-in">
          {/* Backdrop */}
          <div
            className="absolute inset-0 z-0 bg-black/60 backdrop-blur-sm"
            onClick={cancelCountdown}
          />

          {/* Modal Content */}
          <div className="relative z-10 w-full max-w-sm bg-[#1a1a1a] border border-branding-primary/30 rounded-2xl shadow-2xl shadow-branding-primary/20 animate-in fade-in slide-in-from-bottom-4 duration-300 opacity-100">
            {/* Header */}
            <div className="px-6 py-4 flex items-center gap-3 rounded-t-2xl border-b border-branding-primary/10 bg-branding-primary/5">
              <Mic className="w-6 h-6 text-branding-primary" />
              <h3 className="text-lg font-bold text-white tracking-tight">
                Get Ready to Record
              </h3>
              <button
                onClick={cancelCountdown}
                className="ml-auto p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-w-11 min-h-11 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-8 flex flex-col items-center justify-center">
              <div className="relative w-32 h-32 flex items-center justify-center mb-4">
                {/* Circular progress indicator */}
                <svg className="absolute inset-0 w-full h-full -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-white/10"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 56}`}
                    strokeDashoffset={`${2 * Math.PI * 56 * (1 - countdownValue / 5)}`}
                    className="text-branding-primary transition-all duration-300 ease-out"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="text-5xl font-bold text-white">
                  {countdownValue}
                </span>
              </div>
              <p className="text-white/60 text-sm text-center">
                Recording will start in {countdownValue} second{countdownValue !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-white/5 rounded-b-2xl border-t border-white/5">
              <button
                onClick={cancelCountdown}
                className="w-full px-4 py-2 rounded-lg text-sm font-bold text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
