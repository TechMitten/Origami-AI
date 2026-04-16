import React, { useState, useMemo, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';

import { PDFUploader } from './components/PDFUploader';
import { SlideEditor, type SlideData, type MusicSettings } from './components/SlideEditor';
import { SimplePreview } from './components/SimplePreview';
import { generateTTS, getAudioDuration, ttsEvents, initTTS } from './services/ttsService';
import { renderPdfFirstPageToImage, type RenderedPage } from './services/pdfService';
import { GlobalSettingsModal } from './components/GlobalSettingsModal';
import { TutorialModal } from './components/TutorialModal';
import { Footer } from './components/Footer';
import { PrivacyPolicy } from './pages/PrivacyPolicy';
import { TermsOfService } from './pages/TermsOfService';

import { saveState, loadState, clearState, loadGlobalSettings, saveGlobalSettings, type GlobalSettings } from './services/storage';
import { Download, Loader2, RotateCcw, VolumeX, Settings, CircleHelp, XCircle, Trash2, Github, LayoutGrid, List, Upload, Check } from 'lucide-react';
import backgroundImage from './assets/images/background.png';
import { useModal } from './context/ModalContext';
import { BrowserVideoRenderer, videoEvents } from './services/BrowserVideoRenderer';
import { analyzeVideoNarrationWithGemini } from './services/aiService';
import { RuntimeResourceModal, type ResourceSelection } from './components/RuntimeResourceModal';
import { WebGPUInstructionsModal } from './components/WebGPUInstructionsModal';
import { UnifiedInitModal } from './components/UnifiedInitModal';
import { WebLLMLoadingModal } from './components/WebLLMLoadingModal';
import { initWebLLM, webLlmEvents, checkWebGPUSupport, getDefaultWebLlmModel, DEFAULT_WEB_LLM_MODEL_ID } from './services/webLlmService';
import { MobileWarningModal } from './components/MobileWarningModal';
import { DuplicateTabModal } from './components/DuplicateTabModal';
import { exportProjectArchive, importProjectArchive } from './services/projectArchiveService';
import { SceneAlignmentPage } from './pages/SceneAlignmentPage';
import { AssistantPage } from './pages/AssistantPage';
import { IssueReporterPage } from './pages/IssueReporterPage';
import { useScreenRecorder, type ScreenRecordResult } from './hooks/useScreenRecorder';
import { Video } from 'lucide-react';
import { PageHeader } from './components/PageHeader';
import chromeExtensionZip from './assets/extension/chrome-extension.zip?url';




function MainApp() {
  const navigate = useNavigate();
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [generatingSlides, setGeneratingSlides] = useState<Set<number>>(new Set());
  const [analyzingSlides, setAnalyzingSlides] = useState<Set<number>>(new Set());
  const [analysisProgressBySlide, setAnalysisProgressBySlide] = useState<Record<number, { status: string; progress: number }>>({});
  const [alignmentEditorSlideIndex, setAlignmentEditorSlideIndex] = useState<number | null>(null);
  const [isRenderingWithAudio, setIsRenderingWithAudio] = useState(false);
  const [isRenderingSilent, setIsRenderingSilent] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const [musicSettings, setMusicSettings] = useState<MusicSettings>({ volume: 0.36 });
  const [ttsVolume, setTtsVolume] = useState<number>(1.0);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState(false);
  const [isWebGPUModalOpen, setIsWebGPUModalOpen] = useState(false);
  const [isWebLLMInitModalOpen, setIsWebLLMInitModalOpen] = useState(false); // For first-time download/setup
  const [isWebLLMLoadingOpen, setIsWebLLMLoadingOpen] = useState(false); // For subsequent cached loading
  const [preinstalledResources, setPreinstalledResources] = useState({ tts: false, ffmpeg: false, webllm: false });
  const [activeDownloads, setActiveDownloads] = useState({ tts: false, ffmpeg: false, webllm: false });
  const [startupWebGpuSupport, setStartupWebGpuSupport] = useState<{ supported: boolean; hasF16: boolean; error?: string } | null>(null);
  const [renderResolution, setRenderResolution] = useState<'1080p' | '720p'>('720p');
  const [slideEditorViewMode, setSlideEditorViewMode] = useState<'list' | 'grid'>(() => {
    if (typeof window === 'undefined') {
      return 'list';
    }

    return localStorage.getItem('slide_editor_view_mode') === 'grid' ? 'grid' : 'list';
  });

  const [isRestoring, setIsRestoring] = useState(true);
  const [enteredEditorWithoutPdf, setEnteredEditorWithoutPdf] = useState(false);
  const { showAlert, showConfirm } = useModal();
  const [renderAbortController, setRenderAbortController] = useState<AbortController | null>(null);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const skipNextAutoSaveRef = useRef(false);

  const handleScreenRecordFinalizeError = React.useCallback((error: Error) => {
    console.error('Failed to save screen recording.', error);
    showAlert('Failed to save screen recording.', { type: 'error', title: 'Recording Failed' });
  }, [showAlert]);

  const handleScreenRecordingComplete = React.useCallback(async ({ blob, cursorData, interactionData }: ScreenRecordResult) => {
    const url = URL.createObjectURL(blob);
    
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    
    const duration = await new Promise<number>((resolve) => {
      video.onloadedmetadata = () => {
        if (video.duration === Infinity) {
          video.currentTime = 1e101;
          video.ondurationchange = () => {
            video.currentTime = 0;
            video.ondurationchange = null;
            resolve(video.duration);
          };
        } else {
          resolve(video.duration);
        }
      };
      video.onerror = () => resolve(5);
    });

    const autoZooms: NonNullable<SlideData['zooms']> = [];
    if (interactionData && interactionData.length > 0) {
      const KEYFRAME_LEAD_IN_SECONDS = 0.2;
      const CLICK_CLUSTER_GAP_MS = 3000; // 3-second window for clicks to trigger zoom
      const IDLE_ZOOM_OUT_MS = 1200;
      const CONTINUOUS_SCROLL_ZOOM_OUT_MS = 1000;
      const SCROLL_CHAIN_GAP_MS = 1500;
      const MIN_ZOOM_SEGMENT_MS = 150;
      const RESET_EPSILON_SECONDS = 0.001;
      const videoDurationMs = duration * 1000;

      let currentZoomStartMs: number | null = null;
      let lastInteractionMs: number | null = null;
      let clusterCount = 0;
      let zoomClickCount = 0; // Track clicks separately for 2+ click requirement
      let avgX = 0;
      let avgY = 0;

      let scrollStartMs: number | null = null;
      let lastScrollMs: number | null = null;

      const pushZoomSegment = (startMs: number, endMs: number, x: number, y: number, interactions: number, includeReset: boolean) => {
        const clampedStartMs = Math.max(0, startMs);
        const clampedEndMs = Math.max(clampedStartMs + MIN_ZOOM_SEGMENT_MS, Math.min(endMs, videoDurationMs));
        const startSec = Math.max(0, clampedStartMs / 1000 - KEYFRAME_LEAD_IN_SECONDS);
        const endSec = Math.max(startSec + 0.05, clampedEndMs / 1000);
        const zoomLvl = Math.min(2.0, 1.25 + (Math.max(interactions, 1) - 1) * 0.25);

        autoZooms.push({
          id: crypto.randomUUID(),
          timestampStartSeconds: startSec,
          durationSeconds: endSec - startSec,
          type: 'cursor',
          targetX: x,
          targetY: y,
          zoomLevel: zoomLvl
        });

        if (includeReset && endSec < duration) {
          autoZooms.push({
            id: crypto.randomUUID(),
            timestampStartSeconds: Math.max(0, endSec - RESET_EPSILON_SECONDS),
            durationSeconds: Math.max(0.05, duration - endSec),
            type: 'fixed',
            targetX: 0.5,
            targetY: 0.5,
            zoomLevel: 1
          });
        }
      };

      const finalizeCurrentZoom = (endMs: number, includeReset: boolean) => {
        if (currentZoomStartMs === null || lastInteractionMs === null || clusterCount === 0) return;

        pushZoomSegment(currentZoomStartMs, endMs, avgX, avgY, clusterCount, includeReset);
        currentZoomStartMs = null;
        lastInteractionMs = null;
        clusterCount = 0;
        zoomClickCount = 0;
        avgX = 0;
        avgY = 0;
        scrollStartMs = null;
        lastScrollMs = null;
      };

      for (let i = 0; i < interactionData.length; i++) {
        const point = interactionData[i];

        if (point.type === 'click' || point.type === 'keypress') {
          scrollStartMs = null;
          lastScrollMs = null;

          if (currentZoomStartMs === null || lastInteractionMs === null) {
            // Only start zoom attempt if this is a click (keypresses don't initiate zoom)
            if (point.type === 'click') {
              currentZoomStartMs = point.timeMs;
              lastInteractionMs = point.timeMs;
              clusterCount = 1;
              zoomClickCount = 1;
              avgX = point.x;
              avgY = point.y;
            }
            continue;
          }

          // Within 3-second clustering window: extend the potential zoom
          if (point.timeMs - lastInteractionMs < CLICK_CLUSTER_GAP_MS) {
            clusterCount++;
            if (point.type === 'click') {
              zoomClickCount++;
            }
            avgX = (avgX * (clusterCount - 1) + point.x) / clusterCount;
            avgY = (avgY * (clusterCount - 1) + point.y) / clusterCount;
            lastInteractionMs = point.timeMs;
            continue;
          }

          // Beyond 3-second window: finalize if we had 2+ clicks
          if (zoomClickCount >= 2) {
            finalizeCurrentZoom(Math.min(lastInteractionMs + IDLE_ZOOM_OUT_MS, point.timeMs), true);
          }

          // Reset zoom state
          currentZoomStartMs = null;
          lastInteractionMs = null;
          clusterCount = 0;
          zoomClickCount = 0;

          // Try to start a new zoom if this point is a click
          if (point.type === 'click') {
            currentZoomStartMs = point.timeMs;
            lastInteractionMs = point.timeMs;
            clusterCount = 1;
            zoomClickCount = 1;
            avgX = point.x;
            avgY = point.y;
          }
        } else if (point.type === 'scroll' && currentZoomStartMs !== null && lastInteractionMs !== null) {
          if (scrollStartMs === null) {
            scrollStartMs = point.timeMs;
            lastScrollMs = point.timeMs;
            continue;
          }

          if (lastScrollMs !== null && point.timeMs - lastScrollMs > SCROLL_CHAIN_GAP_MS) {
            scrollStartMs = point.timeMs;
          }
          lastScrollMs = point.timeMs;

          if (point.timeMs - scrollStartMs >= CONTINUOUS_SCROLL_ZOOM_OUT_MS) {
            finalizeCurrentZoom(Math.max(scrollStartMs + CONTINUOUS_SCROLL_ZOOM_OUT_MS, lastInteractionMs), true);
          }
        }
      }

      // Finalize pending zoom only if we have 2+ clicks
      if (currentZoomStartMs !== null && lastInteractionMs !== null && zoomClickCount >= 2) {
        finalizeCurrentZoom(lastInteractionMs + IDLE_ZOOM_OUT_MS, true);
      }

      autoZooms.sort((a, b) => a.timestampStartSeconds - b.timestampStartSeconds);
    }

    const newSlide: SlideData = {
      id: crypto.randomUUID(),
      type: 'video',
      mediaUrl: url,
      mediaMimeType: blob.type || 'video/webm',
      script: '',
      transition: 'fade',
      voice: globalSettings?.voice || 'af_heart',
      isVideoMusicPaused: false,
      isTtsDisabled: false,
      mediaDuration: duration,
      duration: duration,
      postAudioDelay: globalSettings?.delay ?? 0.5,
      cursorTrack: cursorData.length > 0 ? cursorData : undefined,
      interactionData: interactionData.length > 0 ? interactionData : undefined,
      autoZoomConfig: {
        enabled: false, // Users can enable this in UI
        minIdleDurationMs: 2000,
        minCursorMovement: 0.015,
        zoomOutLevel: 1.0,
        transitionDurationMs: 500,
      },
      zooms: autoZooms.length > 0 ? autoZooms : undefined
    };

    setSlides(prev => [...prev, newSlide]);
    setActiveTab('edit');
  }, [globalSettings]);

  const { isRecording, startRecording, stopRecording } = useScreenRecorder({
    onRecordingComplete: handleScreenRecordingComplete,
    onRecordingError: handleScreenRecordFinalizeError,
    onRecordingPending: () => {
      showAlert(
        'Switch to the browser tab you want to record, then click the Origami extension icon to begin. Click the extension again or use Stop in the app to finish.',
        { type: 'info', title: 'Ready To Record' }
      );
    },
    onExtensionUnavailable: async () => {
      const shouldRetry = await showConfirm(
        <div className="space-y-3">
          <p className="text-white/80">
            The Origami browser extension was not detected. Screen recording requires the extension to be installed and enabled.
          </p>
          <div className="bg-white/5 rounded-lg p-3 space-y-2">
            <p className="text-sm font-semibold text-white/90">To enable screen recording:</p>
            <ol className="text-sm text-white/70 space-y-1 list-decimal list-inside">
              <li>Install the Origami extension from the Chrome Web Store</li>
              <li>Make sure the extension is enabled in your browser</li>
              <li>Refresh this page and try again</li>
            </ol>
          </div>
          <p className="text-xs text-white/60">
            The extension enables enhanced screen recording with cursor tracking and interaction detection.
          </p>
        </div>,
        {
          type: 'warning',
          title: 'Extension Not Detected',
          confirmText: 'Refresh Page',
          cancelText: 'Cancel'
        }
      );

      if (shouldRetry) {
        window.location.reload();
      }
    },
  });

  const handleStartScreenRecord = async () => {
    try {
      await startRecording();
    } catch (err) {
      if (err instanceof Error && err.message !== 'Permission denied') {
        showAlert('Failed to start screen recording: ' + err.message, { type: 'error', title: 'Recording Failed' });
      }
    }
  };

  const handleStopScreenRecord = async () => {
    try {
      await stopRecording();
    } catch (err) {
      handleScreenRecordFinalizeError(err instanceof Error ? err : new Error('Failed to save screen recording.'));
    }
  };

  const renderer = useMemo(() => new BrowserVideoRenderer(), []);
  const waitForTTSInitialization = React.useCallback((quantization: 'q8' | 'q4'): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const handleInitComplete = () => {
        ttsEvents.removeEventListener('tts-init-complete', handleInitComplete);
        resolve();
      };

      ttsEvents.addEventListener('tts-init-complete', handleInitComplete);

      try {
        initTTS(quantization);
      } catch (error) {
        ttsEvents.removeEventListener('tts-init-complete', handleInitComplete);
        reject(error);
      }
    });
  }, []);

  const runInitialSetupQueue = React.useCallback(async (
    queue: { tts: boolean; ffmpeg: boolean },
    ttsQuantization: 'q8' | 'q4'
  ) => {
    if (queue.tts) {
      await waitForTTSInitialization(ttsQuantization);
    }

    if (queue.ffmpeg) {
      await renderer.load();
    }
  }, [renderer, waitForTTSInitialization]);

  const enforceTtsEnabled = React.useCallback((slide: SlideData): SlideData => {
    if (slide.isTtsDisabled === false) return slide;
    return { ...slide, isTtsDisabled: false };
  }, []);
  const triggerBlobDownload = React.useCallback((blob: Blob, filename: string) => {
    if (!blob || blob.size <= 0) {
      throw new Error('Rendered file was empty.');
    }

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Revoke after the browser has had time to start reading the blob.
    window.setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 30000);
  }, []);

  // Prevent accidental navigation during rendering
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRenderingWithAudio || isRenderingSilent) {
        // Show a confirmation dialog
        const message = 'Video rendering is in progress. Are you sure you want to leave? This will cancel the rendering process.';
        e.preventDefault();
        e.returnValue = message; // Required for Chrome
        return message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isRenderingWithAudio, isRenderingSilent]);

  const handleCancelRender = async () => {
    if (renderAbortController) {
      if (await showConfirm("Are you sure you want to cancel the rendering process?", { type: 'warning', title: 'Cancel Rendering', confirmText: 'Yes, Cancel' })) {
        renderAbortController.abort();
        setRenderAbortController(null);
      }
    }
  };

  // Listen for successful resource loading to update cache status
  useEffect(() => {
    const updateCacheStatus = (key: 'tts' | 'ffmpeg' | 'webllm') => {
      const current = JSON.parse(localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}');
      if (!current[key]) {
        current[key] = true;
        localStorage.setItem('resource_cache_status', JSON.stringify(current));
        console.log(`[Resources] Marked ${key} as cached/installed.`);
      }
    };

    const handleTTSInit = () => updateCacheStatus('tts');
    const handleVideoProgress = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.status === 'FFmpeg ready') {
        updateCacheStatus('ffmpeg');
      }
    };
    const handleWebLLMInit = () => updateCacheStatus('webllm');

    ttsEvents.addEventListener('tts-init-complete', handleTTSInit);
    videoEvents.addEventListener('video-progress', handleVideoProgress);
    webLlmEvents.addEventListener('webllm-init-complete', handleWebLLMInit);

    return () => {
      ttsEvents.removeEventListener('tts-init-complete', handleTTSInit);
      videoEvents.removeEventListener('video-progress', handleVideoProgress);
      webLlmEvents.removeEventListener('webllm-init-complete', handleWebLLMInit);
    };
  }, []);

  useEffect(() => {
    const handleWebLLMDeviceLost = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      showAlert(detail.message, { type: 'warning', title: 'WebLLM GPU Device Lost' });
    };

    webLlmEvents.addEventListener('webllm-device-lost', handleWebLLMDeviceLost);
    return () => {
      webLlmEvents.removeEventListener('webllm-device-lost', handleWebLLMDeviceLost);
    };
  }, [showAlert]);

  // Load state on mount
  React.useEffect(() => {
    const load = async () => {
      const state = await loadState();
      const settings = await loadGlobalSettings();
      setGlobalSettings(settings);

      if (state && state.slides.length > 0) {
        skipNextAutoSaveRef.current = true;
        setSlides(state.slides.map(enforceTtsEnabled));
      }

      // Restore music settings
      if (state?.musicSettings) {
        setMusicSettings(state.musicSettings);
      }

      setIsRestoring(false);

      // Check resource cache status
      const cached = JSON.parse(localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}');
      setPreinstalledResources(cached);

      // Always init preinstalled/cached resources immediately
      if (cached.tts) initTTS(settings?.ttsQuantization || 'q4');
      if (cached.ffmpeg) renderer.load().catch(console.error);

      // Check if WebLLM should be pre-initialized
      // legacy flag removed - we don't need to read this value here
      const hideSetupModal = localStorage.getItem('hide_setup_modal') === 'true';

      // Only init WebLLM if enabled specifically in settings AND cached
      // For first-time setup, wait for user to select model via UnifiedInitModal
      // Do not eagerly initialize WebLLM on startup.
      // Keeping a large GPU model resident while restoring projects and preparing render
      // resources has caused tab instability on some systems. WebLLM is initialized on demand.

      // Check startup preferences
      const storedPref = localStorage.getItem('startup_resource_pref');
      if (storedPref) { // User said "Remember my choice"
        try {
          const pref = JSON.parse(storedPref);
          const wantsInitialWebLLM = !!pref.enableWebLLM && !cached.webllm;
          let webgpuStatus: Awaited<ReturnType<typeof checkWebGPUSupport>> | null = null;
          let shouldEnableInitialWebLLM = wantsInitialWebLLM;

          if (wantsInitialWebLLM) {
            webgpuStatus = await checkWebGPUSupport();
            setStartupWebGpuSupport(webgpuStatus);

            if (!webgpuStatus.supported) {
              shouldEnableInitialWebLLM = false;
              setIsWebGPUModalOpen(true);
            }
          }

          // We only need to init things that were NOT cached but user WANTED.
          // However, redundant init is fine (initTTS handles single instance, renderer checks loaded flag).

          const queue = {
            tts: !cached.tts && !!pref.downloadTTS,
            ffmpeg: !cached.ffmpeg && !!pref.downloadFFmpeg,
            webllm: shouldEnableInitialWebLLM,
          };

          // Check if we need to show unified init modal
          const needsInit = queue.tts || queue.ffmpeg || queue.webllm;

          if (needsInit && !hideSetupModal) {
            setActiveDownloads(queue);
            setIsWebLLMInitModalOpen(true);
          }

          // Initialize strictly one-at-a-time: TTS -> FFmpeg.
          if (queue.tts || queue.ffmpeg) {
            try {
              await runInitialSetupQueue(
                { tts: queue.tts, ffmpeg: queue.ffmpeg },
                settings?.ttsQuantization || 'q4'
              );
            } catch (error) {
              console.error('Failed to complete queued setup resources:', error);
            }
          }

          // Configure WebLLM after earlier resources have been handled.
          // Note: Model selection will happen via UnifiedInitModal callback
          if (queue.webllm) {
            // WebLLM initialization deferred to model selection via UnifiedInitModal
            // Just ensure the preference is saved
            const model = settings?.webLlmModel || getDefaultWebLlmModel(webgpuStatus?.hasF16 ?? true);
            await handlePartialGlobalSettings({ useWebLLM: true, webLlmModel: model });
          }
        } catch (e) {
          console.error("Invalid startup pref", e);
          // If error, fall back to modal logic, considering cache
          if (!cached.tts || !cached.ffmpeg) {
            if (!hideSetupModal) {
              setIsResourceModalOpen(true);
            }
          }
        }
      } else {
        // No "Never show again" preference stored.
        // Show modal ONLY if something is missing
        if (!cached.tts || !cached.ffmpeg) {
          if (!hideSetupModal) {
            setIsResourceModalOpen(true);
          }
        }
      }
    };
    load();
  }, [renderer]);

  const handleResourceConfirm = async (selection: ResourceSelection, dontShowAgain?: boolean) => {
    setIsResourceModalOpen(false);

    const cached = JSON.parse(localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}');
    const hideSetupModal = localStorage.getItem('hide_setup_modal') === 'true';
    const wantsWebLLM = !!selection.enableWebLLM && !cached.webllm;
    let webgpuStatus: Awaited<ReturnType<typeof checkWebGPUSupport>> | null = null;
    let shouldEnableWebLLM = wantsWebLLM;

    if (wantsWebLLM) {
      webgpuStatus = await checkWebGPUSupport();
      setStartupWebGpuSupport(webgpuStatus);

      if (!webgpuStatus.supported) {
        shouldEnableWebLLM = false;
        setIsWebGPUModalOpen(true);
      }
    }

    // Save the "don't show again" preference
    if (dontShowAgain) {
      localStorage.setItem('hide_setup_modal', 'true');
    }

    const queue = {
      tts: !cached.tts && !!selection.downloadTTS,
      ffmpeg: !cached.ffmpeg && !!selection.downloadFFmpeg,
      webllm: shouldEnableWebLLM,
    };

    // Check if we need to show unified init modal
    const needsInit = queue.tts || queue.ffmpeg || queue.webllm;

    if (needsInit && !hideSetupModal) {
      setActiveDownloads(queue);
      setIsWebLLMInitModalOpen(true);
    }

    // Initialize strictly one-at-a-time: TTS -> FFmpeg.
    if (queue.tts || queue.ffmpeg) {
      try {
        await runInitialSetupQueue(
          { tts: queue.tts, ffmpeg: queue.ffmpeg },
          globalSettings?.ttsQuantization || 'q4'
        );
      } catch (error) {
        console.error('Failed to complete queued setup resources:', error);
      }
    }

    if (queue.webllm && webgpuStatus) {
      // Enable WebLLM in settings without starting initialization
      // Model selection and initialization will happen via UnifiedInitModal
      const defaultModel = getDefaultWebLlmModel(webgpuStatus.hasF16);
      await handlePartialGlobalSettings({ useWebLLM: true, webLlmModel: defaultModel });
    }
  };

  // Save state on changes
  React.useEffect(() => {
    if (slides.length === 0 && !isRestoring) {
      // If we just cleared slides, we might want to ensure storage is cleared too, 
      // though handleStartOver does it explicitly. 
      // We do nothing here to avoid re-saving empty array if not necessary,
      // but saving empty array is also fine (effectively clear).
      return;
    }

    if (isRestoring || slides.length === 0) return;

    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }

    const timeoutId = setTimeout(() => {
      saveState(slides, musicSettings);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [slides, isRestoring, musicSettings]);

  useEffect(() => {
    localStorage.setItem('slide_editor_view_mode', slideEditorViewMode);
  }, [slideEditorViewMode]);

  const handleStartOver = async () => {
    if (await showConfirm("Are you sure you want to start over? This will delete all current slides and progress.", { type: 'warning', title: 'Start Over', confirmText: 'Yes, Start Over' })) {
      await clearState();
      setSlides([]);
      setActiveTab('edit');
      setMusicSettings({ volume: 0.36 }); // Reset music settings on start over
    }
  };

  const handleWebLLMModelSelect = async (modelId: string) => {
    try {
      // Save selected model to settings
      await handlePartialGlobalSettings({ useWebLLM: true, webLlmModel: modelId });

      // Initialize WebLLM with the selected model and let the setup modal track progress.
      await initWebLLM(modelId, (progress) => console.log('WebLLM Init:', progress));
    } catch (error) {
      console.error('Error handling WebLLM model selection:', error);
      await showAlert(`Error selecting WebLLM model: ${error instanceof Error ? error.message : String(error)}`, { 
        type: 'error', 
        title: 'Model Selection Failed' 
      });
      throw error;
    }
  };

  const handleDeleteSelected = async () => {
    const selectedCount = slides.filter(s => s.isSelected).length;
    if (selectedCount === 0) return;

    if (await showConfirm(`Are you sure you want to delete the ${selectedCount} selected slides?`, { type: 'error', title: 'Delete Selected', confirmText: 'Delete' })) {
      setSlides(prev => prev.filter(s => !s.isSelected));
    }
  };

  const handleSelectAllSlides = () => {
    // Mark every slide as selected
    setSlides(prev => prev.map(s => ({ ...s, isSelected: true })));
  };

  const handleExportProject = async () => {
    if (isRenderingWithAudio || isRenderingSilent) {
      showAlert('Wait for video rendering to complete before exporting a project.', { type: 'warning', title: 'Export Blocked' });
      return;
    }

    try {
      const archiveBlob = await exportProjectArchive({
        slides,
        musicSettings,
        appVersion: import.meta.env.VITE_APP_VERSION || 'dev',
      });

      const dateString = new Date().toISOString().slice(0, 10);
      triggerBlobDownload(archiveBlob, `origami-project-${dateString}.origami`);

      showAlert('Project exported successfully.', { type: 'success', title: 'Export Complete' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Failed to export project.', { type: 'error', title: 'Export Failed' });
    }
  };

  const handleImportProjectClick = () => {
    importFileInputRef.current?.click();
  };

  const handleImportProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';

    if (!selectedFile) {
      return;
    }

    if (isRenderingWithAudio || isRenderingSilent) {
      showAlert('Wait for video rendering to complete before importing a project.', { type: 'warning', title: 'Import Blocked' });
      return;
    }

    const shouldReplace = await showConfirm(
      'Importing a project replaces your current slides and music settings. Continue?',
      { type: 'warning', title: 'Import Project', confirmText: 'Import and Replace' }
    );

    if (!shouldReplace) {
      return;
    }

    try {
      const imported = await importProjectArchive(selectedFile);

      const normalizedSlides = imported.slides.map(enforceTtsEnabled);
      setSlides(normalizedSlides);
      setMusicSettings(imported.musicSettings || { volume: 0.36 });
      setActiveTab('edit');

      await saveState(normalizedSlides, imported.musicSettings);

      showAlert(`Project imported successfully with ${imported.metadata.slideCount} slides.`, {
        type: 'success',
        title: 'Import Complete',
      });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Failed to import project.', { type: 'error', title: 'Import Failed' });
    }
  };

  const handleSaveGlobalSettings = async (settings: GlobalSettings) => {
    await saveGlobalSettings(settings);
    setGlobalSettings(settings);
  };

  const handlePartialGlobalSettings = async (updates: Partial<GlobalSettings>) => {
    const defaults: GlobalSettings = {
      isEnabled: true, // If interacting with settings, we assume enabled or effectively so for these values
      voice: 'af_heart',
      delay: 0.5,
      transition: 'fade',
      introFadeInEnabled: true,
      introFadeInDurationSec: 1,
      previewMode: 'modal',
    };

    // Merge against latest persisted settings to avoid stale in-memory state
    // overwriting fields during rapid multi-step setup flows.
    const persisted = await loadGlobalSettings();
    const current = persisted || globalSettings || defaults;
    const newSettings = { ...current, ...updates };

    await saveGlobalSettings(newSettings);
    setGlobalSettings(newSettings);
  };

  const onUploadComplete = async (pages: RenderedPage[]) => {
    setEnteredEditorWithoutPdf(false);

    // If global defaults are enabled, use them
    let voice = 'af_heart';
    let transition: SlideData['transition'] = 'fade';
    let postAudioDelay: number | undefined = undefined;

    if (globalSettings?.isEnabled) {
      voice = globalSettings.voice;
      transition = globalSettings.transition;
      postAudioDelay = globalSettings.delay;

      // Handle Music
      if (globalSettings.music) {
        try {
          const musicBlob = globalSettings.music.blob;
          const musicTitle = globalSettings.music.fileName;

          if (musicBlob) {
            const url = URL.createObjectURL(musicBlob);
            setMusicSettings({
              url,
              blob: musicBlob,
              volume: globalSettings.music.volume,
              title: musicTitle
            });
          }
        } catch (e) {
          console.error("Failed to create object URL for default music", e);
        }
      } else {
        setMusicSettings({ volume: 0.36 });
      }
    } else {
      // Reset music if not using defaults (or maybe keep it? prompt implies defaults override)
      setMusicSettings({ volume: 0.36 });
    }

    const initialSlides: SlideData[] = pages.map(page => ({
      ...page,
      id: crypto.randomUUID(),
      script: page.text,
      transition,
      voice,
      postAudioDelay,
      type: 'image'
    }));
    setSlides(initialSlides);
  };

  const updateSlide = (index: number, data: Partial<SlideData>) => {
    setSlides(prev => prev.map((s, i) => {
      if (i !== index) return s;
      return enforceTtsEnabled({ ...s, ...data });
    }));
  };

  const detectAudioTrackInVideo = async (sourceUrl: string): Promise<boolean | null> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      let settled = false;

      const finish = (value: boolean | null) => {
        if (settled) return;
        settled = true;
        video.src = '';
        resolve(value);
      };

      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const mediaVideo = video as HTMLVideoElement & {
          mozHasAudio?: boolean;
          webkitAudioDecodedByteCount?: number;
          audioTracks?: { length?: number };
        };

        if (typeof mediaVideo.mozHasAudio === 'boolean') {
          finish(mediaVideo.mozHasAudio);
          return;
        }
        if (typeof mediaVideo.webkitAudioDecodedByteCount === 'number') {
          finish(mediaVideo.webkitAudioDecodedByteCount > 0);
          return;
        }
        if (mediaVideo.audioTracks && typeof mediaVideo.audioTracks.length === 'number') {
          finish(mediaVideo.audioTracks.length > 0);
          return;
        }

        finish(null);
      };
      video.onerror = () => finish(null);
      video.src = sourceUrl;
    });
  };

  const handleReplaceSlideImage = async (index: number, file: File) => {
    const fileName = file.name.toLowerCase();
    const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
    const isJpg = file.type === 'image/jpeg' || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg');
    const isPng = file.type === 'image/png' || fileName.endsWith('.png');

    if (!isPdf && !isJpg && !isPng) {
      showAlert('Please select a PDF, JPG, or PNG file.', { type: 'error', title: 'Invalid File' });
      return;
    }

    try {
      const nextDataUrl = isPdf
        ? await renderPdfFirstPageToImage(file)
        : URL.createObjectURL(file);

      setSlides((prev) => {
        const target = prev[index];
        if (!target) return prev;

        const oldDataUrl = target.dataUrl;
        const oldMediaUrl = target.mediaUrl;

        const nextSlides = [...prev];
        nextSlides[index] = {
          ...target,
          type: 'image',
          dataUrl: nextDataUrl,
          mediaUrl: undefined,
          mediaMimeType: undefined,
          mediaDuration: undefined,
          isVideoMusicPaused: undefined,
          duration: target.audioUrl ? (target.audioDuration ?? target.duration) : undefined,
        };

        const revokeIfUnused = (url?: string) => {
          if (!url || !url.startsWith('blob:')) return;
          const stillUsed = prev.some((slide, slideIndex) => {
            if (slideIndex === index) return false;
            return slide.dataUrl === url || slide.mediaUrl === url || slide.audioUrl === url;
          });
          if (!stillUsed) {
            URL.revokeObjectURL(url);
          }
        };

        if (oldDataUrl && oldDataUrl !== nextDataUrl) {
          revokeIfUnused(oldDataUrl);
        }
        if (oldMediaUrl) {
          revokeIfUnused(oldMediaUrl);
        }

        return nextSlides;
      });
    } catch (error) {
      console.error(error);
      showAlert(error instanceof Error ? error.message : 'Failed to replace slide image.', {
        type: 'error',
        title: 'Image Replace Failed',
      });
    }
  };

  const generateAudioForSlide = async (index: number) => {
    setGeneratingSlides(prev => { const next = new Set(prev); next.add(index); return next; });
    try {
      const slide = slides[index];
      if (slide?.type === 'video' && slide.videoNarrationAnalysis?.scenes?.length) {
        await generateVideoSceneAudioForSlide(index);
        return;
      }

      const textToSpeak = slide.script;

      if (!textToSpeak.trim()) return;

      const audioUrl = await generateTTS(textToSpeak, {
        voice: slide.voice,
        speed: 1.0,
        pitch: 1.0
      });
      const audioDuration = await getAudioDuration(audioUrl);
      const duration = slide.type === 'video'
        ? Math.max(slide.mediaDuration ?? slide.duration ?? 5, audioDuration)
        : audioDuration;

      updateSlide(index, { audioUrl, audioDuration, duration, audioSourceType: 'tts' });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Failed to generate audio', { type: 'error', title: 'Generation Failed' });
    } finally {
      setGeneratingSlides(prev => { const next = new Set(prev); next.delete(index); return next; });
    }
  };

  const generateVideoSceneAudioForSlide = async (index: number) => {
    setGeneratingSlides(prev => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });

    try {
      const slide = slides[index];
      if (!slide || slide.type !== 'video' || !slide.videoNarrationAnalysis?.scenes?.length) {
        throw new Error('Analyze the video first to generate scene-level TTS audio.');
      }

      const scenes = slide.videoNarrationAnalysis.scenes;
      let cumulativeStretch = 0;
      let totalNarrationDuration = 0;

      const scenesWithAudio: typeof scenes = [];
      for (const scene of scenes) {
        const sceneAudioUrl = await generateTTS(scene.narrationText, {
          voice: slide.voice,
          speed: 1.0,
          pitch: 1.0,
        });
        const sceneAudioDuration = await getAudioDuration(sceneAudioUrl);

        const effectiveStart = scene.timestampStartSeconds + cumulativeStretch;
        const effectiveDuration = Math.max(scene.durationSeconds, sceneAudioDuration);
        const stretchDelta = Math.max(0, sceneAudioDuration - scene.durationSeconds);
        cumulativeStretch += stretchDelta;
        totalNarrationDuration += sceneAudioDuration;

        scenesWithAudio.push({
          ...scene,
          effectiveStartSeconds: effectiveStart,
          effectiveDurationSeconds: effectiveDuration,
          audioUrl: sceneAudioUrl,
          audioDurationSeconds: sceneAudioDuration,
        });
      }

      const lastSceneEnd = scenesWithAudio.reduce((max, scene) => {
        return Math.max(max, scene.effectiveStartSeconds + scene.effectiveDurationSeconds);
      }, 0);

      const timelineDuration = Math.max(
        slide.mediaDuration || 0,
        slide.videoNarrationAnalysis.videoMetadata.totalEstimatedDurationSeconds + cumulativeStretch,
        lastSceneEnd
      );

      const mergedScript = scenesWithAudio.map(scene => scene.narrationText.trim()).filter(Boolean).join(' ');

      updateSlide(index, {
        script: mergedScript || slide.script,
        audioDuration: totalNarrationDuration,
        duration: timelineDuration,
        audioSourceType: 'tts',
        videoNarrationAnalysis: {
          ...slide.videoNarrationAnalysis,
          scenes: scenesWithAudio,
          totalTimelineDurationSeconds: timelineDuration,
          totalStretchSeconds: cumulativeStretch,
        }
      });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Failed to generate scene TTS audio.', {
        type: 'error',
        title: 'Scene TTS Generation Failed'
      });
    } finally {
      setGeneratingSlides(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const generateVideoSceneAudioForScene = async (slideIndex: number, sceneId: string) => {
    try {
      const slide = slides[slideIndex];
      if (!slide || slide.type !== 'video' || !slide.videoNarrationAnalysis?.scenes?.length) {
        throw new Error('No video scene analysis found for this slide.');
      }

      const scene = slide.videoNarrationAnalysis.scenes.find(s => s.id === sceneId);
      if (!scene) throw new Error('Scene not found.');

      const sceneAudioUrl = await generateTTS(scene.narrationText, {
        voice: slide.voice,
        speed: 1.0,
        pitch: 1.0,
      });
      const sceneAudioDuration = await getAudioDuration(sceneAudioUrl);

      // Patch this scene's audio then recalculate effective positions for all scenes
      const patchedScenes = slide.videoNarrationAnalysis.scenes.map(s =>
        s.id === sceneId
          ? { ...s, audioUrl: sceneAudioUrl, audioDurationSeconds: sceneAudioDuration }
          : s
      );

      let cumulativeStretch = 0;
      let totalNarrationDuration = 0;
      const scenesWithEffective = patchedScenes.map(s => {
        totalNarrationDuration += s.audioDurationSeconds ?? 0;
        const effectiveStart = s.timestampStartSeconds + cumulativeStretch;
        const effectiveDuration = s.audioDurationSeconds
          ? Math.max(s.durationSeconds, s.audioDurationSeconds)
          : s.durationSeconds;
        const stretchDelta = s.audioDurationSeconds
          ? Math.max(0, s.audioDurationSeconds - s.durationSeconds)
          : 0;
        cumulativeStretch += stretchDelta;
        return { ...s, effectiveStartSeconds: effectiveStart, effectiveDurationSeconds: effectiveDuration };
      });

      const lastSceneEnd = scenesWithEffective.reduce(
        (max, s) => Math.max(max, s.effectiveStartSeconds + s.effectiveDurationSeconds), 0
      );
      const timelineDuration = Math.max(
        slide.mediaDuration || 0,
        slide.videoNarrationAnalysis.videoMetadata.totalEstimatedDurationSeconds + cumulativeStretch,
        lastSceneEnd
      );
      const mergedScript = scenesWithEffective.map(s => s.narrationText.trim()).filter(Boolean).join(' ');

      updateSlide(slideIndex, {
        script: mergedScript || slide.script,
        audioDuration: totalNarrationDuration,
        duration: timelineDuration,
        audioSourceType: 'tts',
        videoNarrationAnalysis: {
          ...slide.videoNarrationAnalysis,
          scenes: scenesWithEffective,
          totalTimelineDurationSeconds: timelineDuration,
          totalStretchSeconds: cumulativeStretch,
        }
      });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Failed to generate scene TTS audio.', {
        type: 'error',
        title: 'Scene TTS Generation Failed'
      });
    }
  };

  const analyzeVideoNarrationForSlide = async (index: number) => {
    const updateAnalyzeProgress = (status: string, progress: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(progress)));
      setAnalysisProgressBySlide(prev => ({
        ...prev,
        [index]: { status, progress: clamped }
      }));
    };

    setAnalyzingSlides(prev => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });
    updateAnalyzeProgress('Preparing video', 2);

    try {
      const slide = slides[index];
      if (!slide || slide.type !== 'video') {
        throw new Error('Video analysis is only available for Slide Media video slides.');
      }

      if (!slide.mediaUrl) {
        throw new Error('Analyze Video is only available for MP4 Slide Media video uploads. GIF/image media is not supported.');
      }

      const apiKey = import.meta.env.VITE_LLM_API_KEY || '';
      const baseUrl = localStorage.getItem('llm_base_url') || import.meta.env.VITE_LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/';
      const configuredModel = localStorage.getItem('llm_model') || '';
      const model = configuredModel || import.meta.env.VITE_LLM_MODEL || 'gemini-2.5-flash-lite';

      if (!apiKey.trim()) {
        throw new Error('API key is not configured. Set VITE_LLM_API_KEY in your .env file.');
      }

      let mediaBlob: Blob | undefined;
      const mediaSourceUrl = slide.mediaUrl;
      if (mediaSourceUrl) {
        updateAnalyzeProgress('Loading media', 6);
        const mediaResp = await fetch(mediaSourceUrl);
        if (!mediaResp.ok) {
          throw new Error('Failed to read slide media for Gemini analysis.');
        }
        mediaBlob = await mediaResp.blob();
      }

      const mime = mediaBlob?.type?.toLowerCase() || '';
      if (!mime.startsWith('video/')) {
        throw new Error('Analyze Video requires a supported video format.');
      }

      // Check for audio track but don't strictly block it, as screen recordings may have mic/system audio.
      const hasAudioTrack = await detectAudioTrackInVideo(mediaSourceUrl);
      if (hasAudioTrack === true && mime !== 'video/webm') {
        console.warn('This video contains an audio track. TTS may play simultaneously with original audio.');
      }

      updateAnalyzeProgress('Sending to Gemini', 10);

      const analysis = await analyzeVideoNarrationWithGemini(
        {
          apiKey,
          baseUrl,
          model,
          useWebLLM: false,
        },
        {
          topicHint: slide.script?.trim() || `Slide Media tutorial for clip ${index + 1}`,
          mediaDurationSeconds: slide.mediaDuration,
          fileNameHint: `Slide-${index + 1}-Media`,
          mediaBlob,
          mediaMimeType: mediaBlob?.type || 'video/mp4',
          onProgress: ({ stage, progress }) => updateAnalyzeProgress(stage, progress),
        }
      );

      const scenesDraft = analysis.scenes.map(scene => ({
        id: crypto.randomUUID(),
        stepNumber: scene.stepNumber,
        timestampStart: scene.timestampStart,
        timestampStartSeconds: scene.timestampStartSeconds,
        onScreenAction: scene.onScreenAction,
        narrationText: scene.narrationText,
        durationSeconds: scene.durationSeconds,
        effectiveStartSeconds: scene.timestampStartSeconds,
        effectiveDurationSeconds: scene.durationSeconds,
        audioUrl: undefined,
        audioDurationSeconds: undefined,
      }));

      const lastSceneEnd = scenesDraft.reduce((max, scene) => {
        return Math.max(max, scene.timestampStartSeconds + scene.durationSeconds);
      }, 0);

      const timelineDuration = Math.max(
        slide.mediaDuration || 0,
        analysis.videoMetadata.totalEstimatedDurationSeconds,
        lastSceneEnd
      );

      const mergedScript = scenesDraft.map(scene => scene.narrationText.trim()).filter(Boolean).join(' ');

      updateSlide(index, {
        script: mergedScript || slide.script,
        audioDuration: undefined,
        duration: timelineDuration,
        audioUrl: undefined,
        audioSourceType: undefined,
        videoNarrationAnalysis: {
          model,
          generatedAt: Date.now(),
          videoMetadata: analysis.videoMetadata,
          scenes: scenesDraft,
          totalTimelineDurationSeconds: timelineDuration,
          totalStretchSeconds: 0,
          rawGeminiJson: analysis.rawJson,
        }
      });
      updateAnalyzeProgress('Review scenes, then generate TTS', 100);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Failed to analyze video slide.', {
        type: 'error',
        title: 'Video Analysis Failed'
      });
    } finally {
      setAnalyzingSlides(prev => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
      setAnalysisProgressBySlide(prev => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    }
  };





  const handleDownloadMP4 = async () => {
    if (!allAudioReady) {
      const confirmed = await showConfirm(
        'Some slides do not have audio generated yet. You can generate audio now or proceed with the video anyway (slides without audio will be silent or use default duration).',
        { type: 'warning', title: 'Audio Not Ready', confirmText: 'Proceed Anyway', cancelText: 'Cancel' }
      );
      if (!confirmed) return;
    }

    const controller = new AbortController();
    setRenderAbortController(controller);
    setIsRenderingWithAudio(true);
    setRenderProgress(0);

    try {
      const blob = await renderer.render({
        slides: slides.map(s => ({
          ...s,
          isTtsDisabled: false,
          // Ensure we use the raw blob/data URLs directly
          // No need to upload
        })),
        musicSettings,
        ttsVolume,
        enableIntroFadeIn: globalSettings?.introFadeInEnabled ?? true,
        introFadeInDurationSec: globalSettings?.introFadeInDurationSec ?? 1,
        resolution: renderResolution,
        signal: controller.signal,
        onProgress: (p) => setRenderProgress(p)
      });

      triggerBlobDownload(blob, 'tech-tutorial.mp4');
    } catch (error) {
      console.error(error);
      if ((error as Error).message === 'Render aborted') {
        showAlert('Rendering cancelled.', { type: 'info' });
      } else {
        showAlert(`Failed to render video: ${(error as Error).message}`, { type: 'error', title: 'Render Failed' });
      }
    } finally {
      setIsRenderingWithAudio(false);
      setRenderProgress(0);
      setRenderAbortController(null);
    }
  };


  const handleDownloadSilent = async () => {
    if (!await showConfirm("Render video without TTS audio? This will generate a video with 5s duration per slide (plus specified delays) unless otherwise configured.", { type: 'info', title: 'Render Silent Video', confirmText: 'Render' })) {
      return;
    }

    const controller = new AbortController();
    setRenderAbortController(controller);
    setIsRenderingSilent(true);
    setRenderProgress(0);
    try {
      const silentSlides = slides.map(s => ({
        ...s,
        audioUrl: undefined,
        duration: s.duration, // Keep duration? Or undefined? original code set undefined.
        // In browser renderer, if duration is undefined, it defaults to 5.
        // But 's.duration' from state is usually the AUDIO duration. 
        // If we remove audio, we might want to default to 5 or keep strict silence if video.
        // Let's pass undefined to force default behavior, OR keep loop video duration.
      }));

      const blob = await renderer.render({
        slides: silentSlides,
        musicSettings,
        ttsVolume,
        enableIntroFadeIn: globalSettings?.introFadeInEnabled ?? true,
        introFadeInDurationSec: globalSettings?.introFadeInDurationSec ?? 1,
        resolution: renderResolution,
        signal: controller.signal,
        onProgress: (p) => setRenderProgress(p)
      });

      triggerBlobDownload(blob, 'tech-tutorial-silent.mp4');
    } catch (error) {
      console.error(error);
      if ((error as Error).message === 'Render aborted') {
        showAlert('Rendering cancelled.', { type: 'info' });
      } else {
        showAlert(`Failed to render video: ${(error as Error).message}`, { type: 'error', title: 'Render Failed' });
      }
    } finally {
      setIsRenderingSilent(false);
      setRenderProgress(0);
    }
  };

  const allAudioReady = slides.length > 0 && slides.every((slide) => {
    // Slides added via the slide-media flow are self-timed media and don't require TTS audio.
    if (slide.type === 'video') {
      return true;
    }

    return !!slide.audioUrl;
  });

  const shouldShowEditor = slides.length > 0 || enteredEditorWithoutPdf;

  return (
    <div className={`page-zoom-130 min-h-screen bg-branding-dark text-white pt-4 sm:pt-8 pb-2 flex flex-col px-4 ${activeTab === 'preview' ? 'sm:px-4' : 'sm:px-8'}`}>
      <input
        ref={importFileInputRef}
        type="file"
        accept=".origami,application/zip"
        className="hidden"
        onChange={handleImportProject}
      />

      <PageHeader
        title="Origami"
        onHelp={() => setIsTutorialOpen(true)}
        onSettings={() => setIsSettingsOpen(true)}
        centerContent={slides.length > 0 ? (
          <div className="flex items-center p-1 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md">
            <button
              onClick={() => setActiveTab('edit')}
              className={`px-3 sm:px-4 md:px-6 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${activeTab === 'edit'
                ? 'bg-branding-primary/20 text-branding-primary shadow-sm'
                : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
            >
              Edit
            </button>
            <button
              onClick={() => setActiveTab('preview')}
              className={`px-3 sm:px-4 md:px-6 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${activeTab === 'preview'
                ? 'bg-branding-primary/20 text-branding-primary shadow-sm'
                : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
            >
              Preview
            </button>

            <div className="mx-1 h-5 w-px bg-white/10" />

            <button
              onClick={() => setSlideEditorViewMode('list')}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${slideEditorViewMode === 'list' && activeTab === 'edit' ? 'bg-branding-primary/20 text-branding-primary shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'} ${activeTab === 'preview' ? 'pointer-events-none opacity-40' : ''}`}
              title="List view"
              aria-disabled={activeTab === 'preview'}
            >
              <List className="w-4 h-4" /><span>List</span>
            </button>
            <button
              onClick={() => setSlideEditorViewMode('grid')}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all ${slideEditorViewMode === 'grid' && activeTab === 'edit' ? 'bg-branding-primary/20 text-branding-primary shadow-sm' : 'text-white/40 hover:text-white hover:bg-white/5'} ${activeTab === 'preview' ? 'pointer-events-none opacity-40' : ''}`}
              title="Grid view"
              aria-disabled={activeTab === 'preview'}
            >
              <LayoutGrid className="w-4 h-4" /><span>Grid</span>
            </button>
          </div>
        ) : undefined}
        actionMenuContent={(closeMenu) => (
          <>
            <a
              href={chromeExtensionZip}
              download="chrome-extension.zip"
              onClick={closeMenu}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Download className="w-4 h-4" /> Download Chrome Extension
            </a>
            {slides.length > 0 && <div className="my-1 h-px bg-white/10" />}
            {slides.length > 0 && (
              <>
                <button
                  onClick={() => { handleExportProject(); closeMenu(); }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <Download className="w-4 h-4" /> Export Project
                </button>
                <button
                  onClick={() => { handleImportProjectClick(); closeMenu(); }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <Upload className="w-4 h-4" /> Import Project
                </button>
                <div className="my-1 h-px bg-white/10" />
                <button
                  onClick={() => { handleStartOver(); closeMenu(); }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <RotateCcw className="w-4 h-4" /> Start Over
                </button>
                {slides.some((slide) => slide.isSelected) && (
                  <>
                    {slides.some((slide) => !slide.isSelected) && (
                      <>
                        <div className="my-1 h-px bg-white/10" />
                        <button
                          onClick={() => { handleSelectAllSlides(); closeMenu(); }}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                        >
                          <Check className="w-4 h-4" /> Select All ({slides.length})
                        </button>
                      </>
                    )}
                    <div className="my-1 h-px bg-white/10" />
                    <button
                      onClick={() => { handleDeleteSelected(); closeMenu(); }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-bold text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" /> Delete Selected ({slides.filter((slide) => slide.isSelected).length})
                    </button>
                  </>
                )}
              </>
            )}
          </>
        )}
      />

      <main className={`mx-auto fade-transition ${activeTab === 'preview' ? 'w-full max-w-6xl' : 'max-w-7xl'}`} key={activeTab}>
        {!shouldShowEditor ? (
          <div className="min-h-[60vh] flex flex-col items-center justify-center">
            <PDFUploader
              onUploadComplete={onUploadComplete}
              onImportProject={handleImportProjectClick}
              onStartScreenRecord={handleStartScreenRecord}
              onOpenAssistant={() => navigate('/assistant')}
              onOpenIssueReporter={() => navigate('/issue-reporter')}
              onOpenSlideEditor={() => {
                setActiveTab('edit');
                setEnteredEditorWithoutPdf(true);
              }}
            />
            {isRestoring && (
              <div className="mt-8 text-center text-white/40 animate-pulse">
                Checking for saved session...
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-8 animate-slide-up">
            {activeTab === 'preview' ? (
              <div className="space-y-8">
                <div className="aspect-video w-full max-w-5xl mx-auto rounded-3xl overflow-hidden shadow-2xl shadow-black/50 border border-white/5 bg-black">
                  <SimplePreview
                    slides={slides.map(s => ({
                      dataUrl: s.dataUrl,
                      audioUrl: s.audioUrl,
                      audioDuration: s.audioDuration,
                      duration: s.duration || 5,
                      postAudioDelay: s.postAudioDelay,
                      transition: s.transition,
                      type: s.type,
                      mediaUrl: s.mediaUrl,
                      isTtsDisabled: false,
                      zooms: s.zooms,
                      cursorTrack: s.cursorTrack,
                      videoNarrationAnalysis: s.videoNarrationAnalysis ? {
                        scenes: s.videoNarrationAnalysis.scenes.map(scene => ({
                          audioUrl: scene.audioUrl,
                          timestampStartSeconds: scene.timestampStartSeconds,
                          durationSeconds: scene.durationSeconds,
                          effectiveStartSeconds: scene.effectiveStartSeconds,
                          effectiveDurationSeconds: scene.effectiveDurationSeconds,
                          audioDurationSeconds: scene.audioDurationSeconds,
                        }))
                      } : undefined,
                    }))}
                    musicUrl={musicSettings?.url}
                    musicVolume={musicSettings?.volume || 0.36}
                    ttsVolume={ttsVolume}
                    enableIntroFadeIn={globalSettings?.introFadeInEnabled ?? true}
                    introFadeInDurationSec={globalSettings?.introFadeInDurationSec ?? 1}
                  />
                </div>

                {/* Resolution Selector */}
                <div className="flex justify-center">
                  <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-2">
                    <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Quality</span>
                    <div className="flex gap-1">
                      {(['1080p', '720p'] as const).map((res) => (
                        <button
                          key={res}
                          onClick={() => setRenderResolution(res)}
                          disabled={isRenderingWithAudio || isRenderingSilent}
                          className={`
                            px-4 py-1.5 rounded-lg text-xs font-bold transition-all
                            ${renderResolution === res
                              ? 'bg-white text-black'
                              : 'bg-white/10 text-white/60 hover:bg-white/20'
                            }
                            ${(isRenderingWithAudio || isRenderingSilent) ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                        >
                          {res}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-center flex-col items-center gap-6 w-full">
                  <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start w-full sm:w-auto">
                    <div className="flex flex-col gap-2 w-full sm:w-auto">
                      <button
                        onClick={handleDownloadMP4}
                        className="flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-white text-black font-extrabold hover:scale-105 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale w-full sm:w-auto"
                        disabled={isRenderingWithAudio || isRenderingSilent}
                      >
                        {isRenderingWithAudio ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                        {isRenderingWithAudio ? `Processing... ${Math.round(renderProgress)}%` : 'Render Video (With TTS)'}
                      </button>
                      {isRenderingWithAudio && (
                        <button
                          onClick={handleCancelRender}
                          className="flex items-center justify-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancel Rendering
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 w-full sm:w-auto">
                      <button
                        onClick={handleDownloadSilent}
                        className="flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-white/10 text-white font-bold hover:bg-white/20 hover:scale-105 transition-all active:scale-95 disabled:opacity-50 border border-white/10 w-full sm:w-auto"
                        disabled={isRenderingWithAudio || isRenderingSilent}
                      >
                        {isRenderingSilent ? <Loader2 className="w-5 h-5 animate-spin" /> : <VolumeX className="w-5 h-5" />}
                        {isRenderingSilent ? `Processing... ${Math.round(renderProgress)}%` : 'Render Silent Video'}
                      </button>
                      {!isRenderingWithAudio && !isRenderingSilent && (
                        <div className="text-[10px] text-center text-white/40 font-bold uppercase tracking-wider">
                          No TTS • 5s / slide
                        </div>
                      )}
                      {isRenderingSilent && (
                        <button
                          onClick={handleCancelRender}
                          className="flex items-center justify-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <SlideEditor
                slides={slides}
                onUpdateSlide={updateSlide}
                onReplaceSlideImage={handleReplaceSlideImage}
                onGenerateAudio={generateAudioForSlide}
                onGenerateVideoSceneAudio={generateVideoSceneAudioForSlide}
                onAnalyzeVideoNarration={analyzeVideoNarrationForSlide}
                onOpenSceneAlignmentEditor={setAlignmentEditorSlideIndex}
                generatingSlides={generatingSlides}
                analyzingSlides={analyzingSlides}
                analysisProgressBySlide={analysisProgressBySlide}
                onReorderSlides={setSlides}
                musicSettings={musicSettings}
                onUpdateMusicSettings={setMusicSettings}
                ttsVolume={ttsVolume}
                onUpdateTtsVolume={setTtsVolume}
                globalSettings={globalSettings}
                onUpdateGlobalSettings={handlePartialGlobalSettings}
                viewMode={slideEditorViewMode}
                onViewModeChange={setSlideEditorViewMode}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onStartScreenRecord={handleStartScreenRecord}
                defaultToolsConfigTab={enteredEditorWithoutPdf ? 'media' : 'tools'}
              />
            )}
          </div>
        )}
      </main>

      <Footer />

      {/* Scene Alignment Editor full-screen overlay */}
      {alignmentEditorSlideIndex !== null && slides[alignmentEditorSlideIndex]?.videoNarrationAnalysis && (
        <SceneAlignmentPage
          slide={slides[alignmentEditorSlideIndex]}
          slideIndex={alignmentEditorSlideIndex}
          slideNumber={alignmentEditorSlideIndex + 1}
          isGenerating={generatingSlides.has(alignmentEditorSlideIndex)}
          onClose={() => setAlignmentEditorSlideIndex(null)}
          onUpdate={updateSlide}
          onGenerateSceneAudio={async (index) => {
            await generateVideoSceneAudioForSlide(index);
          }}
          onGenerateSceneTTS={generateVideoSceneAudioForScene}
        />
      )}

      {/* Duplicate tab warning */}
      <DuplicateTabModal />

      {/* Mobile device warning */}
      <MobileWarningModal />

      {/* Global Settings Modal */}
      {isSettingsOpen && (
        <GlobalSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentSettings={globalSettings}
          onSave={handleSaveGlobalSettings}
          onShowWebGPUModal={() => setIsWebGPUModalOpen(true)}
        />
      )}

      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
      />

      <RuntimeResourceModal
        isOpen={isResourceModalOpen}
        onConfirm={handleResourceConfirm}
        preinstalled={preinstalledResources}
      />


      <WebGPUInstructionsModal
        isOpen={isWebGPUModalOpen}
        onClose={() => setIsWebGPUModalOpen(false)}
      />

      <WebLLMLoadingModal
        isOpen={isWebLLMLoadingOpen}
        onComplete={() => setIsWebLLMLoadingOpen(false)}
      />

      {isWebLLMInitModalOpen && (
        <UnifiedInitModal
          isOpen={isWebLLMInitModalOpen}
          resources={preinstalledResources}
          activeResources={activeDownloads}
          webGpuSupport={startupWebGpuSupport}
          onWebLLMModelSelect={handleWebLLMModelSelect}
          onComplete={() => {
            setIsWebLLMInitModalOpen(false);
            // Mark WebLLM as pre-initialized so we don't show this again
            localStorage.setItem('webllm_preinitialized', 'true');
            // Update the resource cache status
            const currentStatus = JSON.parse(localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}');
            if (!currentStatus.webllm) {
              currentStatus.webllm = true;
              localStorage.setItem('resource_cache_status', JSON.stringify(currentStatus));
              setPreinstalledResources(currentStatus);
            }
          }}
        />
      )}

      {/* Background Image */}
      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 w-full h-lvh object-cover opacity-40 blur-[2px] brightness-75 scale-105"
      />

      {/* Floating Recording Indicator/Stop Button */}
      {isRecording && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-100 animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="flex items-center gap-4 px-6 py-3 bg-red-500/20 backdrop-blur-xl border border-red-500/50 rounded-full shadow-2xl shadow-red-500/20">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              <span className="text-red-100 font-bold text-sm tracking-wider uppercase">Recording</span>
            </div>
            <div className="w-px h-6 bg-red-500/30" />
            <button
              onClick={handleStopScreenRecord}
              className="px-4 py-1.5 rounded-full bg-red-500 hover:bg-red-400 text-white font-extrabold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2 focus:ring-offset-transparent shadow-lg shadow-red-500/30 hover:scale-105 active:scale-95"
            >
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainApp />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/issue-reporter" element={<IssueReporterPage />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
