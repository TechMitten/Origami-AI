import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX, Wand2, X, Play, Square, ZoomIn, Clock, GripVertical, Mic, Trash2, Upload, Sparkles, Loader2, Search, Video as VideoIcon, Clipboard, Check, Repeat, Music, Speech, Undo2, CheckSquare, Maximize2, Minimize2, ChevronDown, ChevronUp, Library, Settings as SettingsIcon, Wrench, Camera } from 'lucide-react';
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
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { RenderedPage } from '../services/pdfService';
import { AVAILABLE_VOICES, DEFAULT_VOICES, type Voice, generateTTS } from '../services/ttsService';
import { loadGlobalSettings, type GlobalSettings } from '../services/storage';
import { useModal } from '../context/ModalContext';

import { transformText } from '../services/aiService';
import { isWebLLMLoaded } from '../services/webLlmService';
import { Dropdown } from './Dropdown';
import { MusicPickerModal } from './MusicPickerModal';
import type { IncompetechCachedTrack } from '../types/music';
import { decrypt } from '../utils/secureStorage';
import { ZoomTimelineEditor } from './ZoomTimelineEditor';

export interface VideoNarrationSceneTrack {
  id: string;
  stepNumber: number;
  timestampStart: string;
  timestampStartSeconds: number;
  onScreenAction: string;
  narrationText: string;
  durationSeconds: number;
  effectiveStartSeconds: number;
  effectiveDurationSeconds: number;
  audioUrl?: string;
  audioDurationSeconds?: number;
}

export interface VideoNarrationAnalysisData {
  model: string;
  generatedAt: number;
  videoMetadata: {
    title: string;
    totalEstimatedDuration: string;
    totalEstimatedDurationSeconds: number;
  };
  scenes: VideoNarrationSceneTrack[];
  totalTimelineDurationSeconds: number;
  totalStretchSeconds: number;
  rawGeminiJson?: string;
}

export interface ZoomKeyframe {
  id: string;
  timestampStartSeconds: number;
  durationSeconds: number;
  type: 'fixed' | 'cursor';
  targetX?: number; // 0-1 percentage
  targetY?: number; // 0-1 percentage
  zoomLevel: number;
  // New: Easing and smoothing improvements
  easing?: 'linear' | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic' | 'easeInQuart' | 'easeOutQuart' | 'easeInOutQuart' | 'easeInExpo' | 'easeOutExpo' | 'easeInOutExpo' | 'easeOutElastic' | 'easeOutBounce';
  // Smoothing factor for the transition into this zoom (0 = instant, 1 = very slow)
  transitionSmoothing?: number;
  // Damping for cursor following (0.005-0.015, higher = slower/smoother)
  cursorDamping?: number;
  // Enable predictive cursor following (look ahead)
  predictiveCursor?: boolean;
  // Auto-zoom-out on inactivity
  autoZoomOut?: boolean; // Enable automatic zoom-out during idle periods
}

export interface AutoZoomConfig {
  enabled: boolean;
  minIdleDurationMs?: number; // Minimum idle time before zoom-out (default: 2000ms)
  minCursorMovement?: number; // Min cursor movement distance to not count as idle (default: 0.015)
  zoomOutLevel?: number; // Zoom level to return to during idle (default: 1.0)
  transitionDurationMs?: number; // Duration of zoom-out/in transitions (default: 500ms)
}

export interface SlideData extends Partial<RenderedPage> {
  id: string;
  type: 'image' | 'video';
  mediaUrl?: string;
  mediaDuration?: number;
  isVideoMusicPaused?: boolean;
  script: string;
  audioUrl?: string;
  audioDuration?: number;
  duration?: number;
  transition: 'fade' | 'slide' | 'zoom' | 'none';
  voice: string;
  postAudioDelay?: number;
  isTtsDisabled?: boolean;
  isMusicDisabled?: boolean;
  originalScript?: string;
  isSelected?: boolean;
  audioSourceType?: 'tts' | 'recorded';
  videoNarrationAnalysis?: VideoNarrationAnalysisData;
  cursorTrack?: { timeMs: number, x: number, y: number }[];
  interactionData?: { timeMs: number, type: string }[];
  zooms?: ZoomKeyframe[];
  autoZoomConfig?: AutoZoomConfig;
}

export interface MusicSettings {
  url?: string;
  blob?: Blob;
  volume: number;
  loop?: boolean;
  title?: string;
}

export type SlideEditorViewMode = 'list' | 'grid';

interface SlideAnalysisProgress {
  status: string;
  progress: number;
}

interface SlideEditorProps {
  slides: SlideData[];
  onUpdateSlide: (index: number, data: Partial<SlideData>) => void;
  onReplaceSlideImage: (index: number, file: File) => Promise<void>;
  onGenerateAudio: (index: number) => Promise<void>;
  onGenerateVideoSceneAudio: (index: number) => Promise<void>;
  onAnalyzeVideoNarration: (index: number) => Promise<void>;
  onOpenSceneAlignmentEditor: (index: number) => void;
  generatingSlides: Set<number>;
  analyzingSlides: Set<number>;
  analysisProgressBySlide: Record<number, SlideAnalysisProgress>;
  onReorderSlides: (slides: SlideData[]) => void;
  musicSettings: MusicSettings;
  onUpdateMusicSettings: (settings: MusicSettings) => void;
  ttsVolume?: number;
  onUpdateTtsVolume?: (volume: number) => void;
  globalSettings?: GlobalSettings | null;
  onUpdateGlobalSettings?: (settings: Partial<GlobalSettings>) => void;
  viewMode: SlideEditorViewMode;
  onViewModeChange: (mode: SlideEditorViewMode) => void;
  onOpenSettings?: () => void;
  onStartScreenRecord?: () => void;
}

const ScriptEditorModal = ({
  isOpen,
  onClose,
  script,
  onUpdate,
  highlightText
}: {
  isOpen: boolean;
  onClose: () => void;
  script: string;
  onUpdate: (data: Partial<SlideData>) => void;
  highlightText?: string;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const syncScroll = () => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const renderBackdrop = () => {
    if (!highlightText) {
      return script;
    }

    // Use regex-based highlighting for simpler, more reliable results
    const regex = new RegExp(`(${highlightText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = script.split(regex);

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

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full h-full sm:h-[85vh] sm:w-200 bg-[#121212] sm:rounded-2xl border-white/10 sm:border flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white/5 border-b border-white/5">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Maximize2 className="w-5 h-5 text-branding-primary" />
              Focus Mode
            </h3>
            <p className="text-xs text-white/40">Edit your script with a distraction-free view</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <Minimize2 className="w-6 h-6" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-white/5 bg-black/20 flex items-center justify-between">
          <span className="text-xs font-bold text-white/30 uppercase tracking-widest">Script Editor</span>
          <span className="text-[10px] uppercase font-bold text-white/30 tracking-widest">Auto-save enabled</span>
        </div>

        {/* Editor Area */}
        <div className="relative flex-1 bg-[#1a1a1a]">
          <div className="absolute inset-0 overflow-hidden">
            {/* Backdrop */}
            <div
              ref={backdropRef}
              className="absolute inset-0 w-full h-full m-0 px-6 py-6 text-[16px]! sm:text-[18px]! font-sans! tracking-normal! leading-relaxed! whitespace-pre-wrap overflow-y-auto wrap-break-word text-transparent pointer-events-none border border-transparent no-scrollbar outline-none"
              style={{ paddingRight: '1.5rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
              aria-hidden="true"
              dir="ltr"
            >
              {renderBackdrop()}
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={script}
              onChange={(e) => onUpdate({ script: e.target.value })}
              onScroll={syncScroll}
              className="absolute inset-0 w-full h-full m-0 px-6 py-6 bg-transparent text-white text-[16px]! sm:text-[18px]! font-sans! tracking-normal! leading-relaxed! whitespace-pre-wrap resize-none outline-none border border-transparent focus:ring-0 selection:bg-branding-primary/30 overflow-y-auto wrap-break-word no-scrollbar"
              style={{ paddingRight: '1.5rem', wordBreak: 'break-word', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}
              placeholder="Enter your script here..."
              spellCheck={false}
              dir="ltr"
            />
          </div>
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 bg-white/5 border-t border-white/5">
          <div className="flex items-center gap-2 text-xs text-white/30">
            <span className="w-1.5 h-1.5 rounded-full bg-branding-primary animate-pulse" />
            Changes are saved automatically.
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

const SortableSlideItem = ({
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
  onExpand,
  highlightText,
  onDelete,
  ttsVolume,
  voices, // Add voices to destructuring
  globalSettings, // Add globalSettings to destructuring
  isMobile, // Add isMobile to destructuring
  slidesLength, // Add slidesLength to destructuring
  viewMode
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
  onExpand: (i: number) => void,
  highlightText?: string,
  onDelete: (index: number) => void;
  ttsVolume?: number;
  voices: Voice[]; // Add voices prop
  globalSettings?: GlobalSettings | null; // Add globalSettings prop
  isMobile: boolean; // Add isMobile prop
  slidesLength: number; // Add slidesLength prop
  viewMode: SlideEditorViewMode;
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

  const doStartRecording = async () => {
    try {
      // Ensure any existing stream is cleaned up before starting a new one
      cleanupMediaStream();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
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

    // Check if countdown is disabled in settings
    if (globalSettings?.recordingCountdownEnabled === false) {
      // Start recording immediately without countdown
      doStartRecording();
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
            doStartRecording();
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
    const useWebLLM = globalSettings?.useWebLLM;
    const webLlmModel = globalSettings?.webLlmModel;

    const storedApiKey = localStorage.getItem('llm_api_key') || localStorage.getItem('gemini_api_key') || '';
    const apiKey = decrypt(storedApiKey);
    const baseUrl = localStorage.getItem('llm_base_url') || 'https://generativelanguage.googleapis.com/v1beta/openai/';
    const model = localStorage.getItem('llm_model') || 'gemini-2.5-flash';

    if (!useWebLLM && !apiKey) {
      showAlert('Please configure your LLM settings (Base URL, Model, API Key) in Settings (API Keys tab) to use this feature.', { type: 'warning', title: 'Missing Usage' });
      return;
    }

    if (useWebLLM && !webLlmModel) {
      showAlert('Please select and load a WebLLM model in Settings (WebLLM tab) to use this feature.', { type: 'warning', title: 'WebLLM Not Configured' });
      return;
    }

    if (!slide.script.trim()) return;

    if (!await showConfirm("This will replace the current script with an AI-enhanced version. Continue?", { title: 'AI Enhancement', confirmText: 'Enhance' })) {
      return;
    }

    setIsTransforming(true);

    // Yield to event loop to prevent React state batching from blocking WebLLM
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      console.log('[AI Fix] Starting transformation for slide', index);
      let transformed = await transformText({
        apiKey: apiKey || '',
        baseUrl,
        model,
        useWebLLM,
        webLlmModel
      }, slide.script, globalSettings?.aiFixScriptSystemPrompt, globalSettings?.aiFixScriptContext);

      // Sometimes small models (like 2B) return the exact same text or fail to elaborate.
      // Automatically retry once if the text is identical (ignoring whitespace/punctuation).
      const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (normalize(transformed) === normalize(slide.script)) {
        console.log('[AI Fix] Output was identical to input, retrying once automatically...');
        transformed = await transformText({
          apiKey: apiKey || '',
          baseUrl,
          model,
          useWebLLM,
          webLlmModel
        }, slide.script, globalSettings?.aiFixScriptSystemPrompt, globalSettings?.aiFixScriptContext);
      }

      onUpdate(index, { script: transformed, originalScript: slide.script });
    } catch (error) {
      console.error("[SlideEditor] Transformation Error:", error);
      showAlert('Transformation failed: ' + (error instanceof Error ? error.message : String(error)), { type: 'error', title: 'Transformation Failed' });
    } finally {
      setIsTransforming(false);
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
      style={style}
      className={`group relative flex flex-col ${isGridView ? 'gap-4 h-full' : 'sm:flex-row gap-4 sm:gap-6'} p-4 sm:p-5 rounded-2xl bg-linear-to-br from-white/10 to-white/5 border border-white/30 shadow-2xl shadow-black/40 ring-1 ring-inset ring-white/10 hover:border-branding-primary/60 hover:shadow-branding-primary/10 hover:ring-branding-primary/20 transition-[border-color,box-shadow] duration-300`}
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
            <span className="text-2xl font-bold text-branding-primary">{index + 1}</span>
            <span className="text-sm font-medium text-white/30">/ {slidesLength}</span>
          </div>
        </div>

        <div
          className="w-full aspect-video rounded-2xl overflow-hidden border border-white/10 ring-1 ring-white/5 shadow-2xl shadow-black/40 relative bg-black group/image"
        >
          {slide.type === 'video' ? (
            <video
              src={slide.mediaUrl}
              className="w-full h-full object-contain rounded-2xl"
              muted
              onClick={() => onExpand(index)}
            />
          ) : (
            <img
              src={slide.dataUrl}
              alt={`Slide ${index + 1}`}
              className="w-full h-full object-contain transition-transform duration-500 group-hover/image:scale-105 rounded-2xl"
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
                  className="flex items-center justify-center gap-2 min-h-11 px-4 text-sm font-semibold bg-linear-to-r from-branding-accent/20 to-branding-primary/20 hover:from-branding-accent/30 hover:to-branding-primary/30 border border-branding-accent/30 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                  className="flex items-center justify-center gap-2 min-h-11 px-4 text-sm font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl transition-all active:scale-[0.98]"
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
                      className="flex items-center gap-1 text-[10px] uppercase font-bold text-branding-accent hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      title="Use AI to transform raw PDF text into natural sentences"
                    >
                      {isTransforming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      {isTransforming ? 'Fixing...' : 'AI Fix Script'}
                    </button>
                    <button
                      onClick={handleCopyScript}
                      disabled={!slide.script.trim()}
                      className="flex items-center gap-1 text-[10px] uppercase font-bold text-white hover:text-white/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Copy script to clipboard"
                    >
                      {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Clipboard className="w-3 h-3" />}
                      {isCopied ? 'Copied!' : 'Copy'}
                    </button>
                    {slide.originalScript && (
                      <button
                        onClick={handleRevertScript}
                        className="flex items-center gap-1 text-[10px] uppercase font-bold text-amber-400 hover:text-amber-300 transition-colors"
                        title="Revert to original script"
                      >
                        <Undo2 className="w-3 h-3" /> Revert
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(index);
                      }}
                      className="flex items-center gap-1 text-[10px] uppercase font-bold text-red-500 hover:text-red-400 hover:bg-red-500/10 px-2 rounded transition-colors"
                      title="Delete Slide"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
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
                  className="flex items-center gap-1 text-[10px] uppercase font-bold text-branding-accent hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  title="Use AI to transform raw PDF text into natural sentences"
                >
                  {isTransforming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {isTransforming ? 'Fixing...' : 'AI Fix Script'}
                </button>
                <button
                  onClick={handleCopyScript}
                  disabled={!slide.script.trim()}
                  className="flex items-center gap-1 text-[10px] uppercase font-bold text-white hover:text-white/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Copy script to clipboard"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Clipboard className="w-3 h-3" />}
                  {isCopied ? 'Copied!' : 'Copy'}
                </button>
                {slide.originalScript && (
                  <button
                    onClick={handleRevertScript}
                    className="flex items-center gap-1 text-[10px] uppercase font-bold text-amber-400 hover:text-amber-300 transition-colors"
                    title="Revert to original script"
                  >
                    <Undo2 className="w-3 h-3" /> Revert
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(index);
                  }}
                  className="flex items-center gap-1 text-[10px] uppercase font-bold text-red-500 hover:text-red-400 hover:bg-red-500/10 px-2 rounded transition-colors"
                  title="Delete Slide"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
                </>
              )}
            </div>
          )}

          <div className={`relative w-full ${isGridView ? 'h-24' : 'h-32'} rounded-xl bg-white/5 border border-white/10 focus-within:border-branding-primary focus-within:ring-1 focus-within:ring-branding-primary transition-all overflow-hidden`}>
            {/* Backdrop (Highlights) */}
            <div
              ref={backdropRef}
              className="absolute inset-0 w-full h-full m-0 px-4 py-3 font-sans! text-[16px]! tracking-normal! leading-[1.6]! whitespace-pre-wrap overflow-y-auto wrap-break-word text-transparent pointer-events-none border border-transparent no-scrollbar outline-none"
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
              className="absolute inset-0 w-full h-full m-0 px-4 py-3 font-sans! text-[16px]! tracking-normal! leading-[1.6]! whitespace-pre-wrap bg-transparent text-white resize-none outline-none border border-transparent focus:ring-0 selection:bg-branding-primary/20 overflow-y-auto wrap-break-word no-scrollbar"
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
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-branding-primary/10 border border-branding-primary/20 text-branding-primary hover:bg-branding-primary/20 hover:border-branding-primary/40 disabled:opacity-40 disabled:grayscale transition-all font-bold text-[10px] uppercase tracking-wider cursor-pointer shadow-lg shadow-branding-primary/5 h-9 whitespace-nowrap"
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
                className={`${useCompactMediaToolbar ? '' : 'flex-1 sm:flex-none'} px-3 py-2 rounded-lg border transition-all font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-2 h-9 ${!slide.isMusicDisabled ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20' : 'bg-white/5 text-white/40 border-white/10 hover:text-white hover:bg-white/10'}`}
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

export const SlideEditor: React.FC<SlideEditorProps> = ({
  slides,
  onUpdateSlide,
  onReplaceSlideImage,
  onGenerateAudio,
  onGenerateVideoSceneAudio,
  onAnalyzeVideoNarration,
  onOpenSceneAlignmentEditor,
  generatingSlides,
  analyzingSlides,
  analysisProgressBySlide,
  onReorderSlides,
  musicSettings,
  onUpdateMusicSettings,
  ttsVolume,
  onUpdateTtsVolume,
  globalSettings, // Destructure globalSettings
  onUpdateGlobalSettings,
  viewMode,
  onOpenSettings,
  onStartScreenRecord
}) => {
  const { showAlert, showConfirm } = useModal();
  const [previewIndex, setPreviewIndex] = React.useState<number | null>(null);
  const [isPreviewTTSPlaying, setIsPreviewTTSPlaying] = React.useState(false);
  const previewAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const [previewVideoTime, setPreviewVideoTime] = React.useState(0);
  const [previewVideoDuration, setPreviewVideoDuration] = React.useState(1);
  const previewVideoRef = React.useRef<HTMLVideoElement>(null);
  const [isBatchGenerating, setIsBatchGenerating] = React.useState(false);
  const [isBatchFixing, setIsBatchFixing] = React.useState(false);
  const batchGeneratingCancelledRef = React.useRef(false);
  const batchFixingCancelledRef = React.useRef(false);
  const [isCancellingBatch, setIsCancellingBatch] = React.useState<'generate' | 'fix' | null>(null);

  const previewZoomStyle = React.useMemo(() => {
    if (previewIndex === null || !slides[previewIndex]) return {};
    const slide = slides[previewIndex];
    if (slide.type !== 'video' || !slide.zooms || slide.zooms.length === 0) return {};

    // Find the most recently-started zoom keyframe at or before the current time.
    // A zoom persists from its start until the NEXT zoom begins (not just its duration).
    const sorted = [...slide.zooms].sort((a, b) => a.timestampStartSeconds - b.timestampStartSeconds);
    const z = sorted.filter(k => k.timestampStartSeconds <= previewVideoTime).pop();

    if (!z) return { transform: 'scale(1)', transition: 'transform 0.3s ease-out' };

    let tx = z.targetX ?? 0.5;
    let ty = z.targetY ?? 0.5;

    if (z.type === 'cursor' && slide.cursorTrack && slide.cursorTrack.length > 0) {
      const cp = slide.cursorTrack.find(c => c.timeMs / 1000 >= previewVideoTime) || slide.cursorTrack[slide.cursorTrack.length - 1];
      tx = cp.x;
      ty = cp.y;
    }

    return {
      transform: `scale(${z.zoomLevel})`,
      transformOrigin: `${tx * 100}% ${ty * 100}%`,
      transition: 'transform 1.0s cubic-bezier(0.25, 1, 0.5, 1), transform-origin 0.5s ease-out'
    };
  }, [previewIndex, slides, previewVideoTime]);

  const [batchProgress, setBatchProgress] = React.useState<{ current: number; total: number } | null>(null);
  const [globalDelay, setGlobalDelay] = React.useState(0.5);
  const [globalVoice, setGlobalVoice] = React.useState(AVAILABLE_VOICES[0].id);
  const [voices, setVoices] = React.useState<Voice[]>(AVAILABLE_VOICES);


  const [activeTab, setActiveTab] = React.useState<'overview' | 'voice' | 'mixing' | 'tools' | 'media'>('tools');
  const [isMobile, setIsMobile] = useState(false);
  const [isConfigureSlidesExpanded, setIsConfigureSlidesExpanded] = useState(() => {
    const saved = localStorage.getItem('configureSlidesExpanded');
    return saved !== null ? saved === 'true' : true; // Default to expanded
  });

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Persist configure slides expanded state
  useEffect(() => {
    localStorage.setItem('configureSlidesExpanded', String(isConfigureSlidesExpanded));
  }, [isConfigureSlidesExpanded]);

  // Clear cancelling state when batch operations complete
  useEffect(() => {
    if (!isBatchGenerating && !isBatchFixing && isCancellingBatch) {
      setIsCancellingBatch(null);
    }
  }, [isBatchGenerating, isBatchFixing, isCancellingBatch]);

  // Sync global settings changes to parent




  // Global Preview for Sidebar
  const [isGlobalPreviewPlaying, setIsGlobalPreviewPlaying] = React.useState(false);
  const [globalPreviewAudio, setGlobalPreviewAudio] = React.useState<HTMLAudioElement | null>(null);
  const [isGlobalPreviewGenerating, setIsGlobalPreviewGenerating] = React.useState(false);
  const globalAudioContextRef = useRef<AudioContext | null>(null);
  const globalGainNodeRef = useRef<GainNode | null>(null);

  const handleGlobalPreview = async () => {
    if (isGlobalPreviewPlaying && globalPreviewAudio) {
      globalPreviewAudio.pause();
      setIsGlobalPreviewPlaying(false);
      return;
    }

    try {
      setIsGlobalPreviewGenerating(true);
      setIsGlobalPreviewPlaying(true);
      const text = "Hello! This is a sample of how I sound. I hope you enjoy listening to my voice. Thank you for choosing me!";

      const audioUrl = await generateTTS(text, {
        voice: globalVoice,
        speed: 1.0,
        pitch: 1.0
      });

      setIsGlobalPreviewGenerating(false);

      const audio = new Audio(audioUrl);
      const vol = ttsVolume ?? 1;

      // Helper to setup amplification
      if (vol > 1) {
        try {
          audio.volume = 1;
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioContextClass();
          const source = ctx.createMediaElementSource(audio);
          const gainNode = ctx.createGain();

          gainNode.gain.value = vol;
          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          globalAudioContextRef.current = ctx;
          globalGainNodeRef.current = gainNode;
        } catch (e) {
          console.error("Global preview amplification failed", e);
          audio.volume = 1;
        }
      } else {
        audio.volume = Math.max(0, vol);
      }

      audio.onended = () => {
        setIsGlobalPreviewPlaying(false);
        setGlobalPreviewAudio(null);
        if (globalAudioContextRef.current) {
          globalAudioContextRef.current.close().catch(console.error);
          globalAudioContextRef.current = null;
        }
        globalGainNodeRef.current = null;
      };
      audio.onerror = () => {
        setIsGlobalPreviewPlaying(false);
        setGlobalPreviewAudio(null);
        showAlert("Failed to play audio preview.", { type: 'error' });
      };

      setGlobalPreviewAudio(audio);
      await audio.play();
    } catch (e) {
      console.error("Preview failed", e);
      setIsGlobalPreviewGenerating(false);
      setIsGlobalPreviewPlaying(false);
      showAlert("Failed to generate preview", { type: 'error' });
    }
  };

  React.useEffect(() => {
    return () => {
      if (globalPreviewAudio) {
        globalPreviewAudio.pause();
      }
      if (globalAudioContextRef.current) {
        globalAudioContextRef.current.close().catch(console.error);
      }
    }
  }, [globalPreviewAudio]);

  // Live volume adjustment for Global Preview
  React.useEffect(() => {
    if (isGlobalPreviewPlaying && globalPreviewAudio) {
      const vol = ttsVolume ?? 1;
      const audio = globalPreviewAudio;

      // Upgrade to Web Audio if needed
      if (vol > 1 && !globalAudioContextRef.current) {
        try {
          const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ctx = new AudioContextClass();
          const source = ctx.createMediaElementSource(audio);
          const gainNode = ctx.createGain();

          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          globalAudioContextRef.current = ctx;
          globalGainNodeRef.current = gainNode;

          audio.volume = 1;
        } catch (e) {
          console.error("Global preview amplification upgrade failed", e);
        }
      }

      // Apply volume
      if (globalAudioContextRef.current && globalGainNodeRef.current) {
        globalGainNodeRef.current.gain.value = vol;
        if (audio.volume !== 1) audio.volume = 1;
      } else {
        audio.volume = Math.max(0, vol);
      }
    }
  }, [ttsVolume, isGlobalPreviewPlaying, globalPreviewAudio]);

  // Effect to handle voice updates based on globalSettings
  React.useEffect(() => {
    // Helper to process settings and update state
    const processSettings = (settings: GlobalSettings | null) => {
      const finalVoices = [...DEFAULT_VOICES];



      setVoices(finalVoices);

      if (settings?.delay) setGlobalDelay(settings.delay);
      if (settings?.voice) setGlobalVoice(settings.voice);
    };

    if (globalSettings !== undefined) {
      // If prop is provided (even if null), use it
      processSettings(globalSettings);
    } else {
      // Fallback to loading from storage if prop not passed (legacy/safety)
      loadGlobalSettings().then(processSettings);
    }
  }, [globalSettings]); // React to globalSettings changes

  const fileInputRef = useRef<HTMLInputElement>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = React.useState(false);
  const [musicCurrentTime, setMusicCurrentTime] = React.useState(0);
  const [musicDuration, setMusicDuration] = React.useState(0);
  const [isMusicDragging, setIsMusicDragging] = React.useState(false);

  // Audio Visualizer State
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const visualizerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Music Picker State
  const [showMusicPicker, setShowMusicPicker] = React.useState(false);
  const [incompetechTrack, setIncompetechTrack] = React.useState<IncompetechCachedTrack | null>(null);

  const [findText, setFindText] = React.useState('');
  const [replaceText, setReplaceText] = React.useState('');

  // Helper function to highlight matching text in preview
  const highlightPreviewText = (text: string, search: string) => {
    if (!search) return text;

    const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) => {
      // When using split() with a capturing group, matches are at odd indices
      if (index % 2 === 1 && part) {
        return (
          <mark key={index} className="bg-yellow-400/80 text-black rounded-sm px-0.5 py-0.5 font-bold">
            {part}
          </mark>
        );
      }
      return part;
    });
  };

  const mediaInputRef = useRef<HTMLInputElement>(null);

  const getVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      // Validate URL protocol to prevent potential DOM XSS (CodeQL fix)
      try {
        if (!url) throw new Error("Empty URL");

        const parsed = new URL(url, window.location.href); // Handle relative URLs by providing base
        if (!['http:', 'https:', 'blob:'].includes(parsed.protocol)) {
          throw new Error("Invalid protocol");
        }

        const video = document.createElement('video');
        video.src = parsed.href; // Use sanitized URL from URL parser
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          resolve(video.duration);
        };
        video.onerror = () => resolve(5);
      } catch {
        resolve(5);
      }
    });
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4');
      const isGif = file.type === 'image/gif' || file.name.endsWith('.gif');

      if (!isVideo && !isGif) {
        showAlert("Please upload an MP4 video or a GIF.", { type: 'error', title: 'Invalid File' });
        return;
      }

      let duration = 5;
      if (isVideo) {
        duration = await getVideoDuration(url);
      }

      const newSlide: SlideData = {
        id: crypto.randomUUID(),
        type: 'video',
        mediaUrl: isVideo ? url : undefined,
        script: '', // Default empty script
        transition: 'fade',
        voice: AVAILABLE_VOICES[0].id,
        dataUrl: isGif ? url : undefined, // Quick hack for GIF preview if it works as image
        isVideoMusicPaused: false,
        isTtsDisabled: false,
        mediaDuration: duration,
        duration: duration,
        postAudioDelay: 0
      };

      onReorderSlides([newSlide, ...slides]);
    }
    // Reset
    if (mediaInputRef.current) mediaInputRef.current.value = '';
  };

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setIncompetechTrack(null); // Clear incompetech track when uploading
      onUpdateMusicSettings({ ...musicSettings, url, blob: undefined, volume: musicSettings.volume || 0.36, title: file.name });
    }
  };

  const handleSelectIncompetechTrack = (track: IncompetechCachedTrack) => {
    const url = URL.createObjectURL(track.blob);
    setIncompetechTrack(track);
    onUpdateMusicSettings({
      ...musicSettings,
      url,
      blob: track.blob,
      volume: musicSettings.volume || 0.36,
      title: track.title
    });
    setShowMusicPicker(false);
  };

  const toggleMusicPlayback = () => {
    if (isMusicPlaying && musicAudioRef.current) {
      musicAudioRef.current.pause();
      setIsMusicPlaying(false);
      stopVisualizer();
    } else if (musicSettings.url) {
      const audio = new Audio(musicSettings.url);
      audio.volume = musicSettings.volume;
      audio.loop = musicSettings.loop ?? true;
      audio.crossOrigin = "anonymous";
      audio.onloadedmetadata = () => {
        setMusicDuration(audio.duration);
        setMusicCurrentTime(audio.currentTime);
      };
      audio.onended = () => {
        setIsMusicPlaying(false);
        stopVisualizer();
      };
      audio.play().then(() => {
        setIsMusicPlaying(true);
        // Setup visualizer after audio starts playing
        setTimeout(() => setupAudioVisualizer(audio), 100);
      }).catch(e => {
        console.error("Music playback failed", e);
        setIsMusicPlaying(false);
        stopVisualizer();
      });
      musicAudioRef.current = audio;
    }
  };

  const setupAudioVisualizer = (audio: HTMLAudioElement) => {
    if (!visualizerCanvasRef.current) {
      console.log('[Visualizer] Canvas not ready');
      return;
    }

    // Clean up any existing audio context
    stopVisualizer();

    // Set canvas size to match display size
    const canvas = visualizerCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    try {
      // Create Audio Context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128; // Fewer bars for background effect (64 bars)

      console.log('[Visualizer] Setting up audio context and analyser...');

      // Connect audio element to analyser
      const source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      sourceRef.current = source;

      console.log('[Visualizer] Connected, starting visualization...');

      // Start visualization
      drawVisualizer();
    } catch (e) {
      console.error('[Visualizer] Failed to setup audio visualizer:', e);
    }
  };

  const stopVisualizer = () => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };

  // Stop background music when switching away from the mixing tab
  React.useEffect(() => {
    if (activeTab !== 'mixing' && isMusicPlaying) {
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
        musicAudioRef.current.currentTime = 0;
      }
      setIsMusicPlaying(false);
      stopVisualizer();
    }
  }, [activeTab]);

  const drawVisualizer = () => {
    if (!analyserRef.current || !visualizerCanvasRef.current) return;

    const canvas = visualizerCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      if (!analyserRef.current || !canvas) return;

      animationRef.current = requestAnimationFrame(renderFrame);

      analyserRef.current.getByteFrequencyData(dataArray);

      // Clear canvas with transparent background
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Use only the lower 2/3 of frequency spectrum (where most music energy is)
      // and scale it to fill the entire canvas width
      const usableBins = Math.floor(bufferLength * 0.6); // Use first 60% of bins
      const barCount = usableBins;
      const totalGapWidth = barCount * 1;
      const barWidth = (canvas.width - totalGapWidth) / barCount;

      let barHeight;
      let x = 0;

      for (let i = 0; i < usableBins; i++) {
        barHeight = (dataArray[i] / 255) * canvas.height;

        // Vibrant gradient for visibility
        const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(0, 240, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(0, 240, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(0, 240, 255, 0.2)');

        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    renderFrame();
  };

  // Cleanup visualizer on unmount
  React.useEffect(() => {
    return () => {
      stopVisualizer();
    };
  }, []);

  // Handle window resize for canvas
  React.useEffect(() => {
    if (!visualizerCanvasRef.current) return;

    const resizeCanvas = () => {
      if (visualizerCanvasRef.current) {
        const canvas = visualizerCanvasRef.current;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
      }
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(visualizerCanvasRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (musicAudioRef.current) {
        musicAudioRef.current.pause();
      }
      // Reset playback state when URL changes
      setMusicCurrentTime(0);
      setMusicDuration(0);
      setIsMusicPlaying(false);
    }
  }, [musicSettings.url]);

  React.useEffect(() => {
    if (musicAudioRef.current) {
      musicAudioRef.current.loop = musicSettings.loop ?? true;
    }
  }, [musicSettings.loop]);

  // Format time for display (seconds to mm:ss)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Music seek handler
  const handleMusicSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setMusicCurrentTime(newTime);
    if (musicAudioRef.current) {
      musicAudioRef.current.currentTime = newTime;
    }
  };

  const handleMusicSeekStart = () => {
    setIsMusicDragging(true);
  };

  const handleMusicSeekEnd = () => {
    setIsMusicDragging(false);
  };

  // Update music playback time
  React.useEffect(() => {
    if (!musicAudioRef.current || !isMusicPlaying) {
      return;
    }

    const audio = musicAudioRef.current;

    // Set up timeupdate listener
    const handleTimeUpdate = () => {
      if (!isMusicDragging) {
        setMusicCurrentTime(audio.currentTime);
      }
    };

    // Set up loadedmetadata listener to get duration
    const handleLoadedMetadata = () => {
      setMusicDuration(audio.duration);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);

    // Set initial duration if already loaded
    if (audio.readyState >= 1) {
      setMusicDuration(audio.duration);
      setMusicCurrentTime(audio.currentTime);
    }

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [isMusicPlaying, isMusicDragging]);

  const handleRemoveMusic = () => {
    setIncompetechTrack(null); // Clear incompetech track
    onUpdateMusicSettings({ ...musicSettings, url: undefined, blob: undefined, title: undefined });
    if (isMusicPlaying && musicAudioRef.current) {
      musicAudioRef.current.pause();
      setIsMusicPlaying(false);
      stopVisualizer();
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = slides.findIndex((slide) => slide.id === active.id);
      const newIndex = slides.findIndex((slide) => slide.id === over?.id);

      onReorderSlides(arrayMove(slides, oldIndex, newIndex));
    }
  };

  const handleApplyGlobalDelay = async () => {
    if (await showConfirm(`Apply ${globalDelay}s delay to all ${slides.length} slides?`, { title: 'Apply Delay', confirmText: 'Apply' })) {
      slides.forEach((_, index) => {
        onUpdateSlide(index, { postAudioDelay: globalDelay });
      });
    }
  };

  const handleApplyGlobalVoice = async () => {
    let currentVoices = voices;



    const voiceName = currentVoices.find(v => v.id === globalVoice)?.name || globalVoice;
    if (await showConfirm(`Apply "${voiceName}" voice to all ${slides.length} slides?`, { title: 'Apply Voice', confirmText: 'Apply' })) {
      slides.forEach((_, index) => {
        onUpdateSlide(index, { voice: globalVoice });
      });
    }
  };

  const handleCancelBatchGenerate = () => {
    batchGeneratingCancelledRef.current = true;
    setIsCancellingBatch('generate');
  };

  const isSlideMediaVideo = (slide: SlideData) => slide.type === 'video' && Boolean(slide.mediaUrl);

  const handleGenerateAll = async () => {
    const eligibleSlideIndexes = slides
      .map((slide, index) => ({ slide, index }))
      .filter(({ slide }) => !isSlideMediaVideo(slide))
      .map(({ index }) => index);

    if (eligibleSlideIndexes.length === 0) {
      showAlert('No eligible slides found. Slide Media video slides are excluded from batch TTS.', { type: 'info', title: 'Nothing to Generate' });
      return;
    }

    if (!await showConfirm(`This will generate audio for ${eligibleSlideIndexes.length} eligible slide(s), overwriting any existing audio. Slide Media video slides are excluded. Continue?`, { title: 'Batch Generate', confirmText: 'Generate All' })) {
      return;
    }

    batchGeneratingCancelledRef.current = false;
    setIsBatchGenerating(true);
    setBatchProgress({ current: 0, total: eligibleSlideIndexes.length });
    let cancelled = false;
    let processedCount = 0;
    try {
      for (let i = 0; i < eligibleSlideIndexes.length; i++) {
        if (batchGeneratingCancelledRef.current) {
          cancelled = true;
          break;
        }
        const slideIndex = eligibleSlideIndexes[i];
        setBatchProgress({ current: i + 1, total: eligibleSlideIndexes.length });
        await onGenerateAudio(slideIndex);
        processedCount++;
      }
      if (cancelled) {
        showAlert(`Batch generation cancelled. ${processedCount} slide(s) were processed.`, { type: 'info', title: 'Cancelled' });
        setIsCancellingBatch(null);
      } else {
        showAlert('Batch audio generation completed successfully!', { type: 'success', title: 'Batch Complete' });
      }
    } finally {
      setIsBatchGenerating(false);
      setBatchProgress(null);
      batchGeneratingCancelledRef.current = false;
    }
  };

  const handleCancelBatchFix = () => {
    batchFixingCancelledRef.current = true;
    setIsCancellingBatch('fix');
  };

  const handleFixAllScripts = async () => {
    const useWebLLM = globalSettings?.useWebLLM;
    const webLlmModel = globalSettings?.webLlmModel;
    const eligibleSlideIndexes = slides
      .map((slide, index) => ({ slide, index }))
      .filter(({ slide }) => !isSlideMediaVideo(slide))
      .map(({ index }) => index);

    const storedApiKey = localStorage.getItem('llm_api_key') || localStorage.getItem('gemini_api_key') || '';
    const apiKey = decrypt(storedApiKey);
    const baseUrl = localStorage.getItem('llm_base_url') || 'https://generativelanguage.googleapis.com/v1beta/openai/';
    const model = localStorage.getItem('llm_model') || 'gemini-2.5-flash';

    if (eligibleSlideIndexes.length === 0) {
      showAlert('No eligible slides found. Slide Media video slides are excluded from batch AI fix.', { type: 'info', title: 'Nothing to Process' });
      return;
    }

    if (!useWebLLM && !apiKey) {
      showAlert('Please configure your LLM settings (Base URL, Model, API Key) in Settings (API Keys tab) to use this feature.', { type: 'warning' });
      return;
    }

    if (useWebLLM && !webLlmModel) {
      showAlert('Please select and load a WebLLM model in Settings (WebLLM tab) to use this feature.', { type: 'warning', title: 'WebLLM Not Configured' });
      return;
    }

    // Check if WebLLM is actually loaded (not just configured)
    if (useWebLLM && webLlmModel) {
      if (!isWebLLMLoaded()) {
        showAlert('WebLLM model is not loaded. Please initialize it in Settings (WebLLM tab) first.', { type: 'warning', title: 'WebLLM Not Ready' });
        return;
      }
    }

    if (!await showConfirm(`This will sequentially update ${eligibleSlideIndexes.length} eligible slide script(s) using AI. Slide Media video slides are excluded. Continue?`, { title: 'Batch AI Fix', confirmText: 'Start Processing' })) {
      return;
    }

    batchFixingCancelledRef.current = false;
    setIsBatchFixing(true);
    setBatchProgress({ current: 0, total: eligibleSlideIndexes.length });
    let cancelled = false;
    let processedCount = 0;

    try {
      for (let i = 0; i < eligibleSlideIndexes.length; i++) {
        if (batchFixingCancelledRef.current) {
          cancelled = true;
          break;
        }
        const slideIndex = eligibleSlideIndexes[i];
        setBatchProgress({ current: i + 1, total: eligibleSlideIndexes.length });
        const slide = slides[slideIndex];
        if (!slide.script.trim()) continue;

        try {
          let transformed = await transformText({
            apiKey: apiKey || '',
            baseUrl,
            model,
            useWebLLM,
            webLlmModel
          }, slide.script, globalSettings?.aiFixScriptSystemPrompt, globalSettings?.aiFixScriptContext);

          const normalize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          if (normalize(transformed) === normalize(slide.script)) {
            console.log(`[AI Fix Batch] Output was identical to input for slide ${slideIndex + 1}, retrying once automatically...`);
            transformed = await transformText({
              apiKey: apiKey || '',
              baseUrl,
              model,
              useWebLLM,
              webLlmModel
            }, slide.script, globalSettings?.aiFixScriptSystemPrompt, globalSettings?.aiFixScriptContext);
          }
          onUpdateSlide(slideIndex, { script: transformed, originalScript: slide.script });
          processedCount++;
        } catch (error) {
          console.error(`Failed to fix slide ${slideIndex + 1}`, error);
        }

        // Delay 5s to prevent rate limiting only when using cloud API (API imposes 15 RPM ~ 4s/req)
        // Skip delay for WebLLM since it runs locally without rate limits
        if (!useWebLLM && i < eligibleSlideIndexes.length - 1) {
          // Check cancellation during the delay using a polling loop
          const delayEnd = Date.now() + 5000;
          while (Date.now() < delayEnd) {
            if (batchFixingCancelledRef.current) break;
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }
      if (cancelled) {
        showAlert(`Batch AI fix cancelled. ${processedCount} slide(s) were processed.`, { type: 'info', title: 'Cancelled' });
        setIsCancellingBatch(null);
      } else {
        showAlert('Batch script fixing completed successfully!', { type: 'success', title: 'Batch Complete' });
      }
    } finally {
      setIsBatchFixing(false);
      setBatchProgress(null);
      batchFixingCancelledRef.current = false;
    }
  };

  const handleRevertAllScripts = async () => {
    const slidesWithOriginals = slides.filter(slide => slide.originalScript);

    if (slidesWithOriginals.length === 0) {
      showAlert('No slides with original scripts found to revert.', { type: 'info', title: 'Nothing to Revert' });
      return;
    }

    if (!await showConfirm(`This will revert ${slidesWithOriginals.length} slide(s) to their original scripts, discarding all current changes. Continue?`, { title: 'Bulk Revert', confirmText: 'Revert All', type: 'warning' })) {
      return;
    }

    try {
      let revertedCount = 0;
      for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        if (slide.originalScript) {
          onUpdateSlide(i, { script: slide.originalScript, originalScript: undefined });
          revertedCount++;
        }
      }
      showAlert(`Successfully reverted ${revertedCount} slide(s) to original scripts!`, { type: 'success', title: 'Bulk Revert Complete' });
    } catch (error) {
      showAlert('Failed to revert some scripts: ' + (error instanceof Error ? error.message : String(error)), { type: 'error', title: 'Revert Failed' });
    }
  };

  const handleFindAndReplace = async () => {
    if (!findText) return;

    let matchCount = 0;
    const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    
    const newSlides = slides.map(s => {
      const matches = s.script.match(regex);
      const occurrences = matches ? matches.length : 0;
      if (occurrences > 0) {
        matchCount += occurrences;
        return {
          ...s,
          script: s.script.replace(regex, replaceText)
        };
      }
      return s;
    });

    if (matchCount > 0) {
      if (await showConfirm(`Found ${matchCount} matches. Replace all occurrences of "${findText}" with "${replaceText}"?`, { title: 'Replace Text', confirmText: 'Replace All' })) {
        onReorderSlides(newSlides);
        showAlert(`Replaced ${matchCount} occurrences.`, { type: 'success' });
      }
    } else {
      showAlert("No matches found.", { type: 'info' });
    }
  };

  const handleDeleteSlide = async (index: number) => {
    if (await showConfirm("Are you sure you want to delete this slide?", { type: 'error', title: 'Delete Slide', confirmText: 'Delete' })) {
      const newSlides = [...slides];
      newSlides.splice(index, 1);
      onReorderSlides(newSlides);
    }
  };



  // Effect to sync local global settings changes back to parent/storage

  // Effect to handle preview audio playback
  React.useEffect(() => {
    // Cleanup when preview closes
    if (previewIndex === null) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
        previewAudioRef.current = null;
      }
      setIsPreviewTTSPlaying(false);
      return;
    }

    const slide = slides[previewIndex];
    if (!slide?.audioUrl) {
      setIsPreviewTTSPlaying(false);
      return;
    }

    // Create or update audio element
    if (!previewAudioRef.current) {
      const audio = new Audio(slide.audioUrl);
      audio.volume = ttsVolume || 1.0;
      audio.onended = () => setIsPreviewTTSPlaying(false);
      audio.onplay = () => setIsPreviewTTSPlaying(true);
      audio.onpause = () => {
        // Only update state if we didn't just finish playing
        if (!audio.ended) setIsPreviewTTSPlaying(false);
      };
      previewAudioRef.current = audio;
    } else if (previewAudioRef.current.src !== slide.audioUrl && !previewAudioRef.current.src.endsWith(slide.audioUrl)) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      previewAudioRef.current.src = slide.audioUrl;
      previewAudioRef.current.volume = ttsVolume || 1.0;
    }

    // Cleanup
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      }
    };
  }, [previewIndex, slides]); // Remove ttsVolume and isPreviewTTSPlaying from dependencies

  // Update volume when ttsVolume changes
  React.useEffect(() => {
    if (previewAudioRef.current && ttsVolume !== undefined) {
      previewAudioRef.current.volume = ttsVolume;
    }
  }, [ttsVolume]);

  // Cleanup audio on unmount
  React.useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const togglePreviewTTS = () => {
    if (previewIndex === null || !slides[previewIndex]?.audioUrl) return;

    const slide = slides[previewIndex];
    let audio = previewAudioRef.current;

    // Create audio element if it doesn't exist
    if (!audio) {
      audio = new Audio(slide.audioUrl);
      audio.volume = ttsVolume || 1.0;
      audio.onended = () => setIsPreviewTTSPlaying(false);
      audio.onplay = () => setIsPreviewTTSPlaying(true);
      audio.onpause = () => {
        if (!audio!.ended) setIsPreviewTTSPlaying(false);
      };
      previewAudioRef.current = audio;
    }

    // Toggle playback
    if (audio.paused) {
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  };

  return (
    <div className="space-y-8 animate-fade-in relative">
      {/* Expanded Slide Preview */}
      {previewIndex !== null && (globalSettings?.previewMode ?? 'modal') === 'modal' ? (
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md p-4 sm:p-8 flex items-center justify-center animate-fade-in"
            onClick={() => setPreviewIndex(null)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreviewIndex(null);
              }}
              className="absolute top-4 right-4 z-50 p-2 text-white/60 hover:text-white transition-colors flex items-center gap-2 group"
              title="Close Preview"
            >
              <div className="transition-colors">
                <X className="w-8 h-8 drop-shadow-md" />
              </div>
            </button>

            <div className="relative flex flex-col w-full h-[calc(100dvh-2rem)] sm:h-[calc(100dvh-4rem)] gap-4 pt-10 pb-2" onClick={(e) => e.stopPropagation()}>
              <div className="w-[min(96vw,1800px)] mx-auto shrink-0 z-10 bg-[#121212]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 sm:px-6 sm:py-5 shadow-2xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-branding-primary drop-shadow-sm">{previewIndex + 1}</span>
                    <span className="text-xs font-bold text-white/30 uppercase tracking-widest">of {slides.length}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {slides[previewIndex].audioUrl ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePreviewTTS();
                        }}
                        className="flex items-center justify-center flex-1 sm:flex-none gap-2 px-4 py-2 rounded-xl bg-branding-primary/10 hover:bg-branding-primary/20 border border-branding-primary/20 text-branding-primary font-bold text-sm transition-all hover:scale-105 active:scale-95 shadow-lg shadow-branding-primary/5"
                      >
                        {isPreviewTTSPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                        {isPreviewTTSPlaying ? 'Pause TTS' : 'Play TTS'}
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onGenerateAudio(previewIndex);
                        }}
                        disabled={generatingSlides.has(previewIndex)}
                        className="flex items-center justify-center flex-1 sm:flex-none gap-2 px-4 py-2 rounded-xl bg-branding-accent/10 hover:bg-branding-accent/20 border border-branding-accent/20 text-branding-accent font-bold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-branding-accent/5"
                      >
                        {generatingSlides.has(previewIndex) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Speech className="w-4 h-4" />}
                        {generatingSlides.has(previewIndex) ? 'Generating...' : 'Generate TTS'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="w-[min(96vw,1800px)] mx-auto flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem] gap-4">
                <div className="relative min-h-[52dvh] lg:min-h-0 w-full flex items-center justify-center overflow-hidden rounded-2xl bg-black/50 border border-white/10 shadow-2xl shadow-black/40 p-2 sm:p-3">
                  {slides[previewIndex].type === 'video' ? (
                    <video
                      ref={previewVideoRef}
                      src={slides[previewIndex].mediaUrl}
                      className="w-full h-full object-contain rounded-xl"
                      style={previewZoomStyle}
                      controls

                      autoPlay
                      onTimeUpdate={(e) => setPreviewVideoTime(e.currentTarget.currentTime)}
                      onLoadedMetadata={(e) => {
                        const vid = e.currentTarget;
                        if (vid.duration === Infinity) {
                          vid.currentTime = 1e101;
                          const onDurChange = () => {
                            vid.currentTime = 0;
                            vid.removeEventListener('durationchange', onDurChange);
                            setPreviewVideoDuration(vid.duration);
                          };
                          vid.addEventListener('durationchange', onDurChange);
                        } else {
                          setPreviewVideoDuration(vid.duration);
                        }
                      }}
                    />
                  ) : (
                    <img
                      src={slides[previewIndex].dataUrl}
                      alt={`Slide ${previewIndex + 1}`}
                      className="w-full h-full object-contain rounded-xl"
                    />
                  )}
                </div>

                <aside className="min-h-0 flex flex-col rounded-2xl bg-[#121212]/95 backdrop-blur-2xl border border-white/10 shadow-2xl p-4 sm:p-5">
                  <div className="flex items-center justify-between pb-3 border-b border-white/10">
                    <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Script</span>
                    <span className="text-[11px] text-white/35">{slides[previewIndex].script.length} chars</span>
                  </div>
                  <div className="mt-4 min-h-0 flex-1">
                    <textarea
                      value={slides[previewIndex].script}
                      onChange={(e) => onUpdateSlide(previewIndex, { script: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                        className="w-full h-full min-h-55 resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm md:text-base text-white/85 font-medium leading-relaxed placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-branding-primary/40 focus:border-branding-primary/40"
                      placeholder="Write or edit your narration script..."
                    />
                  </div>
                </aside>
              </div>

              {slides[previewIndex].type === 'video' && (
                <div className="w-[min(96vw,1800px)] mx-auto shrink-0 mb-4" onClick={(e) => e.stopPropagation()}>
                  <ZoomTimelineEditor
                    currentTime={previewVideoTime}
                    duration={previewVideoDuration}
                    zooms={slides[previewIndex].zooms || []}
                    onUpdateZooms={(zooms) => onUpdateSlide(previewIndex, { zooms })}
                    onSeek={(time) => {
                      if (previewVideoRef.current && Number.isFinite(time)) {
                        previewVideoRef.current.currentTime = time;
                        setPreviewVideoTime(time);
                      }
                    }}
                    autoZoomConfig={slides[previewIndex].autoZoomConfig}
                    onUpdateAutoZoomConfig={(config) => onUpdateSlide(previewIndex, { autoZoomConfig: config })}
                    cursorData={slides[previewIndex].cursorTrack}
                    interactionData={slides[previewIndex].cursorTrack ? [] : undefined}
                  />
                </div>
              )}
            </div>
          </div>,
          document.body
        )
      ) : previewIndex !== null ? (
        <div
          className="relative w-full mb-8 bg-black/40 p-8 rounded-3xl border border-white/10 flex flex-col items-center animate-fade-in"
          onClick={() => setPreviewIndex(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPreviewIndex(null);
            }}
            className="absolute top-10 right-10 z-50 p-2 text-white/60 hover:text-white transition-colors flex items-center gap-2 group"
            title="Close Preview"
          >
            <div className="transition-colors">
              <X className="w-8 h-8 drop-shadow-md" />
            </div>
          </button>

          <div className="relative flex flex-col w-full min-h-[50vh] max-h-[85dvh] gap-4" onClick={(e) => e.stopPropagation()}>
            {/* Unified Slide Panel */}
            <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 shrink-0 z-10 bg-[#121212]/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 sm:p-6 shadow-2xl">
              {/* Header Row: Slide Number & TTS Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-4 gap-4 sm:gap-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-branding-primary drop-shadow-sm">{previewIndex + 1}</span>
                  <span className="text-xs font-bold text-white/30 uppercase tracking-widest">of {slides.length}</span>
                </div>
                <div className="flex items-center gap-3">
                  {slides[previewIndex].audioUrl ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePreviewTTS();
                      }}
                      className="flex items-center justify-center flex-1 sm:flex-none gap-2 px-4 py-2 rounded-xl bg-branding-primary/10 hover:bg-branding-primary/20 border border-branding-primary/20 text-branding-primary font-bold text-sm transition-all hover:scale-105 active:scale-95 shadow-lg shadow-branding-primary/5"
                    >
                      {isPreviewTTSPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                      {isPreviewTTSPlaying ? 'Pause TTS' : 'Play TTS'}
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onGenerateAudio(previewIndex);
                      }}
                      disabled={generatingSlides.has(previewIndex)}
                      className="flex items-center justify-center flex-1 sm:flex-none gap-2 px-4 py-2 rounded-xl bg-branding-accent/10 hover:bg-branding-accent/20 border border-branding-accent/20 text-branding-accent font-bold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-branding-accent/5"
                    >
                      {generatingSlides.has(previewIndex) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Speech className="w-4 h-4" />}
                      {generatingSlides.has(previewIndex) ? 'Generating...' : 'Generate TTS'}
                    </button>
                  )}
                </div>
              </div>

              {/* Script Content */}
              {slides[previewIndex].script.trim() && (
                <div className="text-sm md:text-base text-white/80 w-full max-h-[25dvh] overflow-y-auto pr-2 font-medium leading-relaxed text-left [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
                  <p className="whitespace-pre-wrap">{highlightPreviewText(slides[previewIndex].script, findText)}</p>
                </div>
              )}
            </div>

            <div className="relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
              {slides[previewIndex].type === 'video' ? (
                <div className="flex flex-col w-full h-full">
                  <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-visible">
                    <video
                      ref={previewVideoRef}
                      src={slides[previewIndex].mediaUrl}
                      className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl shadow-black ring-1 ring-white/10"
                      style={previewZoomStyle}
                      controls
                      autoPlay
                      onTimeUpdate={(e) => setPreviewVideoTime(e.currentTarget.currentTime)}
                      onLoadedMetadata={(e) => {
                        const vid = e.currentTarget;
                        if (vid.duration === Infinity) {
                          vid.currentTime = 1e101;
                          const onDurChange = () => {
                            vid.currentTime = 0;
                            vid.removeEventListener('durationchange', onDurChange);
                            setPreviewVideoDuration(vid.duration);
                          };
                          vid.addEventListener('durationchange', onDurChange);
                        } else {
                          setPreviewVideoDuration(vid.duration);
                        }
                      }}
                    />
                  </div>
                  <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                    <ZoomTimelineEditor
                      currentTime={previewVideoTime}
                      duration={previewVideoDuration}
                      zooms={slides[previewIndex].zooms || []}
                      onUpdateZooms={(zooms) => onUpdateSlide(previewIndex, { zooms })}
                      onSeek={(time) => {
                        if (previewVideoRef.current && Number.isFinite(time)) {
                          previewVideoRef.current.currentTime = time;
                          setPreviewVideoTime(time);
                        }
                      }}
                      autoZoomConfig={slides[previewIndex].autoZoomConfig}
                      onUpdateAutoZoomConfig={(config) => onUpdateSlide(previewIndex, { autoZoomConfig: config })}
                      cursorData={slides[previewIndex].cursorTrack}
                      interactionData={slides[previewIndex].cursorTrack ? [] : undefined}
                    />
                  </div>
                </div>
              ) : (
                <img
                  src={slides[previewIndex].dataUrl}
                  alt={`Slide ${previewIndex + 1}`}
                  className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl shadow-black ring-1 ring-white/10"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 backdrop-blur-sm shadow-xl shadow-black/20">
        <button
          onClick={() => setIsConfigureSlidesExpanded(prev => !prev)}
          className="flex flex-col md:flex-row md:items-center justify-between gap-6 w-full text-left"
        >
          <div className="space-y-1 flex-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-3">
              <div className="w-1.5 h-6 rounded-full bg-branding-primary shadow-[0_0_12px_rgba(var(--branding-primary-rgb),0.5)]"></div>
              <Wrench className="w-5 h-5 text-branding-primary" />
              Tools & Config
            </h2>
            <p className="text-sm text-white/70 font-medium pl-4.5">
              Manage {slides.length} slides, voice settings, and audio generation
            </p>
          </div>
          <div className="flex items-center text-branding-primary">
            {isConfigureSlidesExpanded ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
          </div>
        </button>

        {isConfigureSlidesExpanded && (
          <div className={`mt-8 border-t border-white/5 bg-black/20 rounded-2xl overflow-hidden flex flex-col md:flex-row`}>
            {/* Left Navigation */}
            <div className="md:w-72 border-b md:border-b-0 md:border-r border-white/5 bg-white/5 flex flex-row md:flex-col shrink-0 overflow-x-auto md:overflow-visible py-4 sm:py-6 no-scrollbar snap-x">
              {/* Overview tab removed */}
              <button
                onClick={() => setActiveTab('tools')}
                className={`snap-start flex-1 md:flex-none px-6 sm:px-8 py-8 sm:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-3 sm:gap-4 transition-all text-left whitespace-nowrap ${activeTab === 'tools'
                  ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                  : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                  }`}
              >
                <Wand2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Batch Tools
              </button>
              
              <button
                onClick={() => setActiveTab('voice')}
                className={`snap-start flex-1 md:flex-none px-6 sm:px-8 py-8 sm:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-3 sm:gap-4 transition-all text-left whitespace-nowrap ${activeTab === 'voice'
                  ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                  : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                  }`}
              >
                <Mic className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Voice Settings
              </button>

              <button
                onClick={() => setActiveTab('mixing')}
                className={`snap-start flex-1 md:flex-none px-6 sm:px-8 py-8 sm:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-3 sm:gap-4 transition-all text-left whitespace-nowrap ${activeTab === 'mixing'
                  ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                  : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                  }`}
              >
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Audio Mixing
              </button>
              
              <button
                onClick={() => setActiveTab('media')}
                className={`snap-start flex-1 md:flex-none px-6 sm:px-8 py-8 sm:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-3 sm:gap-4 transition-all text-left whitespace-nowrap ${activeTab === 'media'
                  ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                  : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                  }`}
              >
                <VideoIcon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Slide Media
              </button>
              <button
                onClick={() => onOpenSettings?.()}
                className={`snap-start flex-1 md:flex-none px-6 sm:px-8 py-8 sm:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-3 sm:gap-4 transition-all text-left whitespace-nowrap text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent`}
              >
                <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Settings
              </button>
            </div>

            {/* Right Content */}
            <div className="flex-1 p-6 sm:p-10 bg-black/10 flex flex-col overflow-y-auto">
              {activeTab === 'voice' && (
                <div className="max-w-4xl w-full mx-auto h-full flex flex-col space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 shrink-0">
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-white flex items-center gap-3">
                        <Mic className="w-6 h-6" />
                        Voice Configuration
                      </h3>
                      <p className="text-base text-white/50 leading-relaxed">Choose the narrator voice for all slides.</p>
                    </div>
                    {/* Hybrid Toggle */}

                  </div>

                  <div className="flex-1 space-y-6 sm:space-y-8 p-6 sm:p-10 rounded-3xl bg-white/5 border border-white/10 flex flex-col justify-center">
                    <div className="space-y-3">
                      <label className="text-xs font-bold text-white/40 uppercase tracking-wider">Select Voice</label>
                      <Dropdown
                        options={voices}
                        value={globalVoice}
                        onChange={(val) => { setGlobalVoice(val); onUpdateGlobalSettings?.({ voice: val }); }}
                        className="h-14 text-base px-6"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 pt-4">
                      <button onClick={handleGlobalPreview} disabled={isGlobalPreviewGenerating} className={`flex-1 h-12 sm:h-14 rounded-xl font-bold text-sm uppercase tracking-wider transition-all flex items-center justify-center gap-3 ${isGlobalPreviewPlaying ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : isGlobalPreviewGenerating ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 hover:text-white'}`} title="Listen to the selected voice">
                        {isGlobalPreviewGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : isGlobalPreviewPlaying ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />} {isGlobalPreviewGenerating ? 'Generating...' : isGlobalPreviewPlaying ? 'Stop' : 'Preview Voice'}
                      </button>
                      <button onClick={handleApplyGlobalVoice} className="flex-1 h-12 sm:h-14 rounded-xl bg-branding-primary/20 border border-branding-primary/30 hover:bg-branding-primary/30 text-white font-bold text-sm uppercase tracking-wider transition-all">
                        Apply to All Slides
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'mixing' && (
                <div className="max-w-7xl w-full mx-auto h-full flex flex-col space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0 space-y-2">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                      <Music className="w-6 h-6" />
                      Audio Mixing
                    </h3>
                    <p className="text-base text-white/50">Control global volume levels and background music.</p>
                  </div>

                  <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="flex flex-col gap-8 h-full">
                      {/* TTS Volume */}
                      <div className="flex-1 space-y-4 p-8 rounded-3xl bg-white/5 border border-white/10 flex flex-col justify-center">
                        <label className="text-xs font-bold text-white/60 uppercase tracking-widest flex items-center gap-3">
                          <Speech className="w-4 h-4" /> Narrator Volume
                        </label>
                        <div className="space-y-4">
                          <div className="flex justify-between items-end">
                            <span className="text-4xl font-light text-white">{Math.round((ttsVolume ?? 1) * 50)}%</span>
                            {ttsVolume !== 1 && (
                              <button onClick={() => onUpdateTtsVolume?.(1)} className="text-xs text-branding-primary hover:underline font-bold uppercase tracking-wider">Reset</button>
                            )}
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.05"
                            value={ttsVolume ?? 1}
                            onChange={(e) => onUpdateTtsVolume?.(parseFloat(e.target.value))}
                            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-black/20 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-branding-primary [&::-webkit-slider-thumb]:hover:scale-110"
                            style={{ background: `linear-gradient(to right, var(--branding-primary-hex, #00f0ff) ${((ttsVolume ?? 1) / 2) * 100}%, rgba(0, 0, 0, 0.2) ${((ttsVolume ?? 1) / 2) * 100}%)` }}
                          />
                        </div>
                      </div>

                      {/* Global Delay */}
                      <div className="flex-1 space-y-4 p-8 rounded-3xl bg-white/5 border border-white/10 flex flex-col justify-center">
                        <label className="text-xs font-bold text-white/60 uppercase tracking-widest flex items-center gap-3">
                          <Clock className="w-4 h-4" /> Slide Pacing
                        </label>
                        <div className="space-y-4">
                          <div className="flex gap-4">
                            <div className="relative flex-1">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={globalDelay}
                                onChange={(e) => { const val = parseFloat(e.target.value) || 0; setGlobalDelay(val); onUpdateGlobalSettings?.({ delay: val }); }}
                                className="w-full h-14 px-6 rounded-xl bg-black/20 border border-white/10 text-white text-base focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all pr-12"
                              />
                              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40 font-bold">SEC</span>
                            </div>
                            <button onClick={handleApplyGlobalDelay} className="px-6 h-14 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 hover:text-white text-xs font-bold uppercase tracking-wider transition-all">
                              Apply
                            </button>
                          </div>
                          <p className="text-xs text-white/40 leading-relaxed">
                            Amount of silence added after each slide's narration finishes.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Background Music */}
                    <div className="h-full space-y-4 p-8 rounded-3xl bg-white/5 border border-white/10 flex flex-col justify-center">
                      <div className="flex items-center justify-between shrink-0 mb-4">
                        <label className="text-xs font-bold text-white/60 uppercase tracking-widest flex items-center gap-3">
                          <Music className="w-4 h-4" /> Background Music
                        </label>
                        {musicSettings.url && (
                          <button onClick={handleRemoveMusic} className="text-red-400 hover:text-red-300 transition-colors p-2 hover:bg-red-500/10 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex-1 flex flex-col justify-center space-y-6">
                        <input type="file" ref={fileInputRef} className="hidden" accept="audio/*" onChange={handleMusicUpload} />

                        {/* Volume Control - ALWAYS VISIBLE */}
                        <div className="space-y-4" title="Adjust background music volume">
                          <div className="flex justify-between items-center text-xs font-bold text-white/60 uppercase">
                            <span>Music Volume</span>
                            <span>{Math.round(Math.sqrt(musicSettings.volume || 0.36) * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.001"
                            value={Math.sqrt(musicSettings.volume || 0.36)}
                            onChange={(e) => {
                              const newVol = parseFloat(e.target.value);
                              const squaredVol = newVol * newVol;
                              onUpdateMusicSettings({ ...musicSettings, volume: squaredVol });
                              if (musicAudioRef.current) musicAudioRef.current.volume = squaredVol;
                            }}
                            style={{
                              background: `linear-gradient(to right, hsl(var(--branding-primary)) 0%, hsl(var(--branding-primary)) ${Math.round(Math.sqrt(musicSettings.volume || 0.36) * 100)}%, rgba(255,255,255,0.1) ${Math.round(Math.sqrt(musicSettings.volume || 0.36) * 100)}%, rgba(255,255,255,0.1) 100%)`
                            }}
                            className="w-full h-2 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-branding-primary [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:border [&::-webkit-slider-runnable-track]:border-white/20 [&::-moz-range-track]:w-full [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border [&::-moz-range-track]:border-white/20"
                          />
                        </div>

                        {/* Music Selection or Track Info */}
                        {!musicSettings.url ? (
                          <div className="space-y-4">
                            <button onClick={() => setShowMusicPicker(true)} className="w-full h-16 rounded-2xl bg-branding-primary/10 border border-branding-primary/30 hover:bg-branding-primary/20 hover:border-branding-primary/50 text-branding-primary text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-3" title="Choose from royalty-free music">
                              <Library className="w-5 h-5" /> Browse Music Library
                            </button>
                            <button onClick={() => fileInputRef.current?.click()} className="w-full h-16 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 hover:text-white text-white/50 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-3" title="Upload your own audio file">
                              <Upload className="w-5 h-5" /> Upload Custom Track
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <div className="relative p-8 rounded-2xl bg-black/20 border border-white/5 text-center overflow-hidden">
                              {/* Audio Visualizer Background */}
                              {isMusicPlaying && (
                                <canvas
                                  ref={visualizerCanvasRef}
                                  width={800}
                                  height={96}
                                  className="absolute inset-0 w-full h-full"
                                />
                              )}

                              {/* Track Info Overlay */}
                              <div className="relative z-10">
                                <Music className="w-12 h-12 text-white/20 mx-auto mb-4" />
                                <p className="text-lg font-medium text-white/90 truncate">{musicSettings.title || 'Unknown Track'}</p>
                              </div>
                            </div>

                            {/* Seek Slider */}
                            {musicDuration > 0 && (
                              <div className="space-y-3">
                                <div className="flex justify-between items-center text-xs font-bold text-white/40 uppercase">
                                  <span>Progress</span>
                                  <span>{formatTime(musicCurrentTime)} / {formatTime(musicDuration)}</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max={musicDuration || 1}
                                  step="0.1"
                                  value={musicCurrentTime}
                                  onChange={handleMusicSeek}
                                  onMouseDown={handleMusicSeekStart}
                                  onMouseUp={handleMusicSeekEnd}
                                  onTouchStart={handleMusicSeekStart}
                                  onTouchEnd={handleMusicSeekEnd}
                                  style={{
                                    background: `linear-gradient(to right, hsl(var(--branding-primary)) 0%, hsl(var(--branding-primary)) ${((musicCurrentTime / (musicDuration || 1)) * 100)}%, rgba(255,255,255,0.1) ${((musicCurrentTime / (musicDuration || 1)) * 100)}%, rgba(255,255,255,0.1) 100%)`
                                  }}
                                  className="w-full h-2 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-branding-primary [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-runnable-track]:w-full [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:border [&::-webkit-slider-runnable-track]:border-white/20 [&::-moz-range-track]:w-full [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:border [&::-moz-range-track]:border-white/20"
                                />
                              </div>
                            )}

                            <div className="flex items-center gap-6">
                              <button onClick={toggleMusicPlayback} className="w-14 h-14 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0">
                                {isMusicPlaying ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                              </button>
                              <button
                                onClick={() => onUpdateMusicSettings({ ...musicSettings, loop: !(musicSettings.loop ?? true) })}
                                className={`flex-1 py-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-3 ${(musicSettings.loop ?? true) ? 'bg-branding-primary/10 text-branding-primary' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                              >
                                <Repeat className="w-4 h-4" /> {(musicSettings.loop ?? true) ? 'Looping' : 'Not Looping'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'tools' && (
                <div className="max-w-5xl w-full mx-auto h-full flex flex-col justify-center space-y-10 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0 space-y-2">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                      Batch Tools
                    </h3>
                    <p className="text-base text-white/50">Apply specific actions to all slides at once.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {/* AI Fix */}
                    <div className="relative">
                      <button
                        onClick={handleFixAllScripts}
                        disabled={isBatchFixing || isBatchGenerating || slides.length === 0}
                        className="group relative w-full min-h-52 sm:h-52 p-6 rounded-3xl bg-linear-to-br from-branding-accent/10 to-transparent border border-branding-accent/20 hover:border-branding-accent/50 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-branding-accent/5 overflow-hidden"
                      >
                        <div className="absolute top-2 right-2 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Sparkles className="w-24 h-24" />
                        </div>
                        <div className="relative z-10 flex flex-col h-full space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-branding-accent/20 flex items-center justify-center">
                              {isBatchFixing ? <Loader2 className="w-5 h-5 text-branding-accent animate-spin" /> : <Sparkles className="w-5 h-5 text-branding-accent" />}
                            </div>
                            <h4 className="text-lg font-bold text-white">AI Script Fixer</h4>
                          </div>
                          <p className="text-sm text-white/60 flex-1">Automatically rewrite all slide scripts to be more natural and engaging.</p>
                          <div className="flex items-center justify-between pt-2">
                            <div className="text-xs font-bold text-branding-accent uppercase tracking-widest">
                              {isBatchFixing ? `Processing ${batchProgress?.current || 0}/${batchProgress?.total || 0}...` : 'Start Process'}
                            </div>
                          </div>
                        </div>
                      </button>
                      {isBatchFixing && (
                        <button
                          onClick={handleCancelBatchFix}
                          className="absolute bottom-6 right-6 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all text-[10px] font-bold uppercase tracking-wider z-10"
                          title="Cancel batch AI fix"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                      )}
                    </div>

                    {/* Generate All */}
                    <div className="relative">
                      <button
                        onClick={handleGenerateAll}
                        disabled={generatingSlides.size > 0 || isBatchGenerating || slides.length === 0}
                        className="group relative w-full min-h-52 sm:h-52 p-6 rounded-3xl bg-linear-to-br from-branding-primary/10 to-transparent border border-branding-primary/20 hover:border-branding-primary/50 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-branding-primary/5 overflow-hidden"
                      >
                        <div className="absolute top-2 right-2 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Wand2 className="w-24 h-24" />
                        </div>
                        <div className="relative z-10 flex flex-col h-full space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-branding-primary/20 flex items-center justify-center">
                              {isBatchGenerating ? <Loader2 className="w-5 h-5 text-branding-primary animate-spin" /> : <Wand2 className="w-5 h-5 text-branding-primary" />}
                            </div>
                            <h4 className="text-lg font-bold text-white">Generate All Audio</h4>
                          </div>
                          <p className="text-sm text-white/60 flex-1">Generate or regenerate TTS audio for all slides sequentially.</p>
                          <div className="flex items-center justify-between pt-2">
                            <div className="text-xs font-bold text-branding-primary uppercase tracking-widest">
                              {isBatchGenerating ? `Generating ${batchProgress?.current || 0}/${batchProgress?.total || 0}...` : 'Start Process'}
                            </div>
                          </div>
                        </div>
                      </button>
                      {isBatchGenerating && (
                        <button
                          onClick={handleCancelBatchGenerate}
                          className="absolute bottom-6 right-6 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 hover:text-red-300 transition-all text-[10px] font-bold uppercase tracking-wider z-10"
                          title="Cancel batch TTS generation"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                      )}
                    </div>

                    {/* Bulk Revert */}
                    <button
                      onClick={handleRevertAllScripts}
                      disabled={slides.filter(s => s.originalScript).length === 0}
                      className="group relative min-h-52 sm:h-52 p-6 rounded-3xl bg-linear-to-br from-branding-primary/10 to-transparent border border-branding-primary/20 hover:border-branding-primary/50 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-branding-primary/5 overflow-hidden"
                    >
                      <div className="absolute top-2 right-2 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Undo2 className="w-24 h-24" />
                      </div>
                      <div className="relative z-10 flex flex-col h-full space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-branding-primary/20 flex items-center justify-center">
                            <Undo2 className="w-5 h-5 text-branding-primary" />
                          </div>
                          <h4 className="text-lg font-bold text-white">Bulk Revert Scripts</h4>
                        </div>
                        <p className="text-sm text-white/60 flex-1">Revert all modified scripts back to their original state at once.</p>
                        <div className="text-xs font-bold text-branding-primary uppercase tracking-widest pt-2">
                          {slides.filter(s => s.originalScript).length} Slide(s) Available
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Find and Replace */}
                  <div className="p-8 rounded-3xl bg-white/5 border border-white/10 space-y-6">
                    <h4 className="text-xs font-bold text-white/70 uppercase tracking-widest flex items-center gap-3">
                      <Search className="w-4 h-4" /> Find & Replace
                    </h4>
                    <div className="flex flex-col md:flex-row gap-4">
                      <input
                        type="text"
                        placeholder="Find..."
                        value={findText}
                        onChange={(e) => setFindText(e.target.value)}
                        className="flex-1 h-12 px-6 rounded-xl bg-black/20 border border-white/10 text-white text-sm focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all placeholder:text-white/30"
                      />
                      <input
                        type="text"
                        placeholder="Replace with..."
                        value={replaceText}
                        onChange={(e) => setReplaceText(e.target.value)}
                        className="flex-1 h-12 px-6 rounded-xl bg-black/20 border border-white/10 text-white text-sm focus:border-branding-primary focus:ring-1 focus:ring-branding-primary outline-none transition-all placeholder:text-white/30"
                      />
                      <button
                        onClick={handleFindAndReplace}
                        disabled={!findText}
                        className="px-8 h-12 rounded-xl bg-white/10 border border-white/10 hover:bg-white/20 text-white font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        Replace All
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'media' && (
                <div className="max-w-4xl w-full mx-auto flex flex-col space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="shrink-0 space-y-2">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                      <Camera className="w-6 h-6" />
                      Slide Media
                    </h3>
                    <p className="text-base text-white/50">Manage assets and insert special slide types.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-8 rounded-3xl bg-white/5 border border-white/10 border-dashed flex flex-col items-center justify-center text-center space-y-5">
                      <div className="w-16 h-16 rounded-full bg-branding-primary/10 flex items-center justify-center">
                        <VideoIcon className="w-8 h-8 text-branding-primary" />
                      </div>
                      <div className="space-y-2 max-w-sm">
                        <h4 className="text-lg font-bold text-white">Upload Media File</h4>
                        <p className="text-sm text-white/60 leading-relaxed">
                          Insert an MP4 video or animated GIF as a standalone slide.
                        </p>
                      </div>

                      <input type="file" ref={mediaInputRef} className="hidden" accept="video/mp4,image/gif" onChange={handleMediaUpload} />
                      <button
                        onClick={() => mediaInputRef.current?.click()}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/25 bg-branding-primary text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-branding-primary/30 hover:bg-branding-primary/90 hover:border-white/40 hover:shadow-xl hover:shadow-branding-primary/40 active:scale-[0.98] transition-all"
                      >
                        <Upload className="w-4 h-4" />
                        Select File
                      </button>
                    </div>

                    <div className="p-8 rounded-3xl bg-white/5 border border-white/10 border-dashed flex flex-col items-center justify-center text-center space-y-5">
                      <div className="w-16 h-16 rounded-full bg-branding-accent/10 flex items-center justify-center">
                        <VideoIcon className="w-8 h-8 text-branding-accent" />
                      </div>
                      <div className="space-y-2 max-w-sm">
                        <h4 className="text-lg font-bold text-white">Record Screen</h4>
                        <p className="text-sm text-white/60 leading-relaxed">
                          Capture your screen to create a new video slide instantly.
                        </p>
                      </div>

                      <button
                        onClick={() => onStartScreenRecord && onStartScreenRecord()}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-branding-accent text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-branding-accent/30 hover:bg-branding-accent/90 focus:outline-none focus:ring-2 focus:ring-white/60 transition-all active:scale-[0.98]"
                      >
                        <VideoIcon className="w-4 h-4" />
                        Start Recording
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={slides.map(s => s.id)}
          strategy={viewMode === 'grid' ? rectSortingStrategy : verticalListSortingStrategy}
        >
          <div className={`grid gap-6 ${viewMode === 'grid' ? 'md:grid-cols-2 2xl:grid-cols-3 items-start' : ''}`}>
            {slides.map((slide, index) => (
              <SortableSlideItem
                key={slide.id}
                slide={slide}
                index={index}
                onUpdate={onUpdateSlide}
                onReplaceImage={onReplaceSlideImage}
                onGenerate={onGenerateAudio}
                onGenerateSceneAudio={onGenerateVideoSceneAudio}
                onAnalyzeVideo={onAnalyzeVideoNarration}
                onOpenSceneEditor={onOpenSceneAlignmentEditor}
                analysisProgress={analysisProgressBySlide[index]}
                isGenerating={generatingSlides.has(index) || isBatchGenerating}
                isAnalyzing={analyzingSlides.has(index)}
                isAnyGenerating={generatingSlides.size > 0 || isBatchGenerating}
                onExpand={(i) => {
                  setPreviewIndex(prev => prev === i ? null : i);
                }}
                onDelete={handleDeleteSlide}
                ttsVolume={ttsVolume}
                voices={voices}
                globalSettings={globalSettings}
                isMobile={isMobile}
                slidesLength={slides.length}
                viewMode={viewMode}
                highlightText={findText}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Music Picker Modal */}
      <MusicPickerModal
        isOpen={showMusicPicker}
        onClose={() => setShowMusicPicker(false)}
        onSelectTrack={handleSelectIncompetechTrack}
        currentTrack={incompetechTrack}
      />

      {/* Cancel Batch Modal */}
      {isCancellingBatch && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 animate-fade-in">
          {/* Backdrop */}
          <div className="absolute inset-0 z-0 bg-black/60 backdrop-blur-sm pointer-events-none" />

          {/* Modal Content */}
          <div className="relative z-10 w-full max-w-sm bg-[#1a1a1a] border border-amber-500/30 rounded-2xl shadow-2xl shadow-amber-500/20 animate-in fade-in scale-100 duration-300">
            {/* Header */}
            <div className="px-6 py-4 border-b border-amber-500/10 bg-amber-500/5">
              <h3 className="text-lg font-bold text-white tracking-tight">
                Stopping {isCancellingBatch === 'generate' ? 'Generation' : 'Processing'}...
              </h3>
            </div>

            {/* Body */}
            <div className="p-8 flex flex-col items-center justify-center gap-4">
              <div className="relative w-16 h-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-amber-500/20" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-amber-500 animate-spin" />
              </div>
              <p className="text-white/60 text-sm text-center">
                {isCancellingBatch === 'generate' 
                  ? 'Please wait while the current slide finishes processing...'
                  : 'Please wait while the current script finishes processing...'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
