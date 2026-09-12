import { setSyncedPreference } from '../services/preferences';
import React, { useRef, useState, useEffect } from 'react';
import { Volume2, Wand2, Mic, Video as VideoIcon, ChevronDown, ChevronUp, Settings as SettingsIcon, Wrench, LocateFixed } from 'lucide-react';
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
} from '@dnd-kit/sortable';
import { AVAILABLE_VOICES, DEFAULT_VOICES, type Voice } from '../services/ttsService';
import { loadGlobalSettings, type GlobalSettings } from '../services/storage';
import { useModal } from '../context/ModalContext';

import { WebLLMLoadingModal } from './WebLLMLoadingModal';
import { MusicPickerModal } from './MusicPickerModal';
import { DownloadBlockedModal } from './DownloadBlockedModal';
import { SortableSlideItem } from './slideEditor/SortableSlideItem';
import { VoiceTab } from './slideEditor/VoiceTab';
import { MixingTab } from './slideEditor/MixingTab';
import { ToolsTab } from './slideEditor/ToolsTab';
import { MediaTab } from './slideEditor/MediaTab';
import { SlidePreviewOverlay } from './slideEditor/SlidePreviewOverlay';
import { useMusicPlayer } from '../hooks/useMusicPlayer';
import { useBatchScriptOperations } from '../hooks/useBatchScriptOperations';
import { useSlidePreview } from '../hooks/useSlidePreview';
import type {
  SlideData,
  SlideEditorProps,
} from '../types/slides';
export type {
  VideoNarrationSceneTrack,
  VideoNarrationAnalysisData,
  ZoomKeyframe,
  AutoZoomConfig,
  SlideData,
  MusicSettings,
  SlideEditorViewMode,
} from '../types/slides';

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
  onStartScreenRecord,
  defaultToolsConfigTab = 'tools',
  aspectRatio = '16:9',
  isDownloading = false,
}) => {
  const { showAlert, showConfirm, showThreeWayConfirm } = useModal();
  const [downloadBlockedAction, setDownloadBlockedAction] = React.useState<string | null>(null);
  const batchOps = useBatchScriptOperations(
    slides,
    onUpdateSlide,
    onGenerateAudio,
    isDownloading,
    (action) => setDownloadBlockedAction(action),
    globalSettings,
    { showAlert, showConfirm, showThreeWayConfirm },
  );
  const {
    isBatchGenerating,
    isBatchFixing,
    batchProcessingIndex,
    isCancellingBatch,
    isWebLLMLoadingOpen,
    setIsWebLLMLoadingOpen,
    ensureWebLLMForFix,
    handleCancelWebLLMLoad,
  } = batchOps;

  const [globalDelay, setGlobalDelay] = React.useState(0.5);
  const [globalVoice, setGlobalVoice] = React.useState(AVAILABLE_VOICES[0].id);
  const [voices, setVoices] = React.useState<Voice[]>(AVAILABLE_VOICES);


  const [activeTab, setActiveTab] = React.useState<'overview' | 'voice' | 'mixing' | 'tools' | 'media'>(() => {
    const saved = localStorage.getItem('tools_config_active_tab');
    return saved === 'voice' || saved === 'mixing' || saved === 'tools' || saved === 'media'
      ? saved
      : defaultToolsConfigTab;
  });
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
    setSyncedPreference('configureSlidesExpanded', String(isConfigureSlidesExpanded));
  }, [isConfigureSlidesExpanded]);

  useEffect(() => {
    setSyncedPreference('tools_config_active_tab', activeTab);
  }, [activeTab]);

  // Sync global settings changes to parent




  const {
    previewIndex,
    setPreviewIndex,
    isPreviewTTSPlaying,
    togglePreviewTTS,
    previewVideoTime,
    setPreviewVideoTime,
    previewVideoDuration,
    setPreviewVideoDuration,
    previewVideoRef,
    previewZoomStyle,
    isGlobalPreviewPlaying,
    isGlobalPreviewGenerating,
    handleGlobalPreview,
  } = useSlidePreview(slides, ttsVolume, globalVoice, showAlert);

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

  const musicPlayer = useMusicPlayer(musicSettings, onUpdateMusicSettings, activeTab === 'mixing');
  const { showMusicPicker, setShowMusicPicker, incompetechTrack, handleSelectIncompetechTrack } = musicPlayer;

  const [findText, setFindText] = React.useState('');
  const [replaceText, setReplaceText] = React.useState('');
  const [transformingSlideIndex, setTransformingSlideIndex] = React.useState<number | null>(null);

  const firstGeneratingSlideIndex = React.useMemo(() => {
    const [first] = Array.from(generatingSlides).sort((a, b) => a - b);
    return typeof first === 'number' ? first : null;
  }, [generatingSlides]);

  const workingSlideIndex = batchProcessingIndex ?? transformingSlideIndex ?? firstGeneratingSlideIndex;

  const handleScrollToWorkingSlide = React.useCallback(() => {
    if (workingSlideIndex === null) return;
    const slide = slides[workingSlideIndex];
    if (!slide) return;
    document.getElementById(`slide-card-${slide.id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  }, [slides, workingSlideIndex]);

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
        mediaMimeType: isVideo ? file.type : (isGif ? file.type : undefined),
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
    const currentVoices = voices;



    const voiceName = currentVoices.find(v => v.id === globalVoice)?.name || globalVoice;
    if (await showConfirm(`Apply "${voiceName}" voice to all ${slides.length} slides?`, { title: 'Apply Voice', confirmText: 'Apply' })) {
      slides.forEach((_, index) => {
        onUpdateSlide(index, { voice: globalVoice });
      });
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

  return (
    <div className="space-y-8 animate-fade-in relative">
      {/* Expanded Slide Preview */}
      {previewIndex !== null && (
        <SlidePreviewOverlay
          isModal={(globalSettings?.previewMode ?? 'modal') === 'modal'}
          slides={slides}
          previewIndex={previewIndex}
          setPreviewIndex={setPreviewIndex}
          onUpdateSlide={onUpdateSlide}
          onGenerateAudio={onGenerateAudio}
          generatingSlides={generatingSlides}
          isPreviewTTSPlaying={isPreviewTTSPlaying}
          togglePreviewTTS={togglePreviewTTS}
          previewVideoRef={previewVideoRef}
          previewZoomStyle={previewZoomStyle}
          previewVideoTime={previewVideoTime}
          setPreviewVideoTime={setPreviewVideoTime}
          previewVideoDuration={previewVideoDuration}
          setPreviewVideoDuration={setPreviewVideoDuration}
          findText={findText}
        />
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-6 backdrop-blur-sm shadow-xl shadow-black/20">
        <button
          onClick={() => setIsConfigureSlidesExpanded(prev => !prev)}
          className="flex flex-col md:flex-row md:items-center justify-between gap-6 w-full text-left"
        >
          <div className="space-y-1 flex-1 min-w-0">
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
                className={`snap-start flex-1 md:flex-none px-3 sm:px-6 md:px-8 py-3 sm:py-5 md:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-2 sm:gap-3 md:gap-4 transition-all text-left whitespace-nowrap ${activeTab === 'tools'
                  ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                  : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                  }`}
              >
                <Wand2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Batch Tools
              </button>
              
              <button
                onClick={() => setActiveTab('voice')}
                className={`snap-start flex-1 md:flex-none px-3 sm:px-6 md:px-8 py-3 sm:py-5 md:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-2 sm:gap-3 md:gap-4 transition-all text-left whitespace-nowrap ${activeTab === 'voice'
                  ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                  : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                  }`}
              >
                <Mic className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Voice Settings
              </button>

              <button
                onClick={() => setActiveTab('mixing')}
                className={`snap-start flex-1 md:flex-none px-3 sm:px-6 md:px-8 py-3 sm:py-5 md:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-2 sm:gap-3 md:gap-4 transition-all text-left whitespace-nowrap ${activeTab === 'mixing'
                  ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                  : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                  }`}
              >
                <Volume2 className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Audio Mixing
              </button>
              
              <button
                onClick={() => setActiveTab('media')}
                className={`snap-start flex-1 md:flex-none px-3 sm:px-6 md:px-8 py-3 sm:py-5 md:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-2 sm:gap-3 md:gap-4 transition-all text-left whitespace-nowrap ${activeTab === 'media'
                  ? 'bg-branding-primary/10 text-branding-primary border-b-2 md:border-b-0 md:border-l-2 border-branding-primary'
                  : 'text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent'
                  }`}
              >
                <VideoIcon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Slide Media
              </button>
              <button
                onClick={() => onOpenSettings?.()}
                className={`snap-start flex-1 md:flex-none px-3 sm:px-6 md:px-8 py-3 sm:py-5 md:py-10 text-xs font-bold uppercase tracking-widest flex items-center gap-2 sm:gap-3 md:gap-4 transition-all text-left whitespace-nowrap text-white/40 hover:text-white hover:bg-white/5 border-b-2 md:border-b-0 md:border-l-2 border-transparent`}
              >
                <SettingsIcon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> Settings
              </button>
            </div>

            {/* Right Content */}
            <div className="flex-1 min-w-0 p-4 sm:p-6 md:p-10 bg-black/10 flex flex-col overflow-y-auto">
              {activeTab === 'voice' && (
                <VoiceTab
                  voices={voices}
                  globalVoice={globalVoice}
                  setGlobalVoice={setGlobalVoice}
                  onUpdateGlobalSettings={onUpdateGlobalSettings}
                  isGlobalPreviewPlaying={isGlobalPreviewPlaying}
                  isGlobalPreviewGenerating={isGlobalPreviewGenerating}
                  handleGlobalPreview={handleGlobalPreview}
                  handleApplyGlobalVoice={handleApplyGlobalVoice}
                />
              )}

              {activeTab === 'mixing' && (
                <MixingTab
                  ttsVolume={ttsVolume}
                  onUpdateTtsVolume={onUpdateTtsVolume}
                  globalDelay={globalDelay}
                  setGlobalDelay={setGlobalDelay}
                  onUpdateGlobalSettings={onUpdateGlobalSettings}
                  handleApplyGlobalDelay={handleApplyGlobalDelay}
                  musicSettings={musicSettings}
                  onUpdateMusicSettings={onUpdateMusicSettings}
                  musicPlayer={musicPlayer}
                />
              )}

              {activeTab === 'tools' && (
                <ToolsTab
                  slides={slides}
                  generatingSlides={generatingSlides}
                  findText={findText}
                  setFindText={setFindText}
                  replaceText={replaceText}
                  setReplaceText={setReplaceText}
                  handleFindAndReplace={handleFindAndReplace}
                  batchOps={batchOps}
                />
              )}

              {activeTab === 'media' && (
                <MediaTab
                  mediaInputRef={mediaInputRef}
                  handleMediaUpload={handleMediaUpload}
                  onStartScreenRecord={onStartScreenRecord}
                />
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
                isBatchRunning={isBatchGenerating || isBatchFixing}
                isBatchActiveSlide={batchProcessingIndex === index}
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
                isDownloading={isDownloading}
                onShowDownloadBlocked={(action) => setDownloadBlockedAction(action)}
                onEnsureWebLLMReady={ensureWebLLMForFix}
                onTransformStateChange={(slideIndex, active) => setTransformingSlideIndex(active ? slideIndex : null)}
                highlightText={findText}
                aspectRatio={aspectRatio}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {workingSlideIndex !== null && slides[workingSlideIndex] && (
        <button
          type="button"
          onClick={handleScrollToWorkingSlide}
          aria-label={`Scroll to slide ${workingSlideIndex + 1}`}
          className="group fixed bottom-6 right-6 z-50 inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#0b1720]/95 text-cyan-100 shadow-[0_12px_34px_rgba(255,255,255,0.22)] backdrop-blur-md transition-all hover:-translate-y-0.5 hover:bg-cyan-400/15 hover:shadow-[0_12px_40px_rgba(255,255,255,0.34)] focus:outline-none active:scale-95"
          title={`Scroll to slide ${workingSlideIndex + 1}`}
        >
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-cyan-400/15 shadow-inner shadow-white/10">
            <LocateFixed className="h-4.5 w-4.5" />
          </span>
        </button>
      )}

      {/* Local model download/compile progress for AI Fix Script */}
      <WebLLMLoadingModal
        isOpen={isWebLLMLoadingOpen}
        onComplete={() => setIsWebLLMLoadingOpen(false)}
        onCancel={handleCancelWebLLMLoad}
      />

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
      {/* Download blocked warning modal */}
      <DownloadBlockedModal
        isOpen={downloadBlockedAction !== null}
        onClose={() => setDownloadBlockedAction(null)}
        actionLabel={downloadBlockedAction ?? undefined}
      />
    </div>
  );
};
