import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bug,
  CheckCircle2,
  Copy,
  Download,
  Loader2,
  Settings,
  Sparkles,
  Square,
  Video
} from 'lucide-react';

import backgroundImage from '../assets/images/background.png';
import orgIssueLogo from '../assets/images/orgissue.png';
import SoftAurora from '../components/SoftAurora';
import { DuplicateTabModal } from '../components/DuplicateTabModal';
import { Footer } from '../components/Footer';
import { GlobalSettingsModal } from '../components/GlobalSettingsModal';
import { MobileWarningModal } from '../components/MobileWarningModal';
import { useModal } from '../context/ModalContext';
import { useScreenRecorder } from '../hooks/useScreenRecorder';
import { PageHeader } from '../components/PageHeader';
import { analyzeIssueCaptureWithGemini, type IssueCaptureAnalysis } from '../services/aiService';
import type { GlobalSettings } from '../services/storage';
import { loadGlobalSettings, saveGlobalSettings } from '../services/storage';
import { decrypt } from '../utils/secureStorage';

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  isEnabled: true,
  voice: 'af_heart',
  delay: 0.5,
  transition: 'fade',
  introFadeInEnabled: true,
  introFadeInDurationSec: 1,
  previewMode: 'modal',
};

interface CaptureState {
  fileBase: string;
  recordedAt: number;
  durationSeconds: number;
  videoBlob: Blob;
  videoUrl: string;
}

const getConfiguredGeminiSettings = () => {
  const storedApiKey = localStorage.getItem('llm_api_key') || localStorage.getItem('gemini_api_key') || '';
  return {
    apiKey: decrypt(storedApiKey),
    baseUrl: localStorage.getItem('llm_base_url') || 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: localStorage.getItem('llm_model') || 'gemini-2.5-flash-lite',
  };
};

const buildFileBase = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  const hours = `${now.getHours()}`.padStart(2, '0');
  const minutes = `${now.getMinutes()}`.padStart(2, '0');
  const seconds = `${now.getSeconds()}`.padStart(2, '0');
  return `origami-issue-${year}${month}${day}-${hours}${minutes}${seconds}`;
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDuration = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
};

const readVideoDuration = (url: string): Promise<number> => (
  new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;

    video.onloadedmetadata = () => {
      if (video.duration === Infinity) {
        video.currentTime = 1e101;
        video.ondurationchange = () => {
          resolve(Number.isFinite(video.duration) ? video.duration : 0);
        };
      } else {
        resolve(Number.isFinite(video.duration) ? video.duration : 0);
      }
    };

    video.onerror = () => resolve(0);
  })
);

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
};

export const IssueReporterPage: React.FC = () => {
  const { showAlert } = useModal();
  const captureRef = useRef<CaptureState | null>(null);

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [capture, setCapture] = useState<CaptureState | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<{ stage: string; progress: number } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<IssueCaptureAnalysis | null>(null);
  const [promptDraft, setPromptDraft] = useState('');
  const [userGoal, setUserGoal] = useState('');
  const [extraContext, setExtraContext] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const clearCaptureUrls = useCallback((value: CaptureState | null) => {
    if (!value) return;
    URL.revokeObjectURL(value.videoUrl);
  }, []);

  const replaceCapture = useCallback((next: CaptureState | null) => {
    if (captureRef.current && captureRef.current !== next) {
      clearCaptureUrls(captureRef.current);
    }
    captureRef.current = next;
    setCapture(next);
  }, [clearCaptureUrls]);

  const resetAnalysis = useCallback(() => {
    setAnalysis(null);
    setPromptDraft('');
    setAnalysisProgress(null);
    setCopiedPrompt(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    loadGlobalSettings()
      .then((savedSettings) => {
        if (!isMounted) return;
        setGlobalSettings(savedSettings ? { ...DEFAULT_GLOBAL_SETTINGS, ...savedSettings } : DEFAULT_GLOBAL_SETTINGS);
      })
      .catch(() => {
        if (!isMounted) return;
        setGlobalSettings(DEFAULT_GLOBAL_SETTINGS);
      });

    return () => {
      isMounted = false;
      clearCaptureUrls(captureRef.current);
    };
  }, [clearCaptureUrls]);

  useEffect(() => {
    if (!copiedPrompt) return;
    const timeoutId = window.setTimeout(() => setCopiedPrompt(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copiedPrompt]);

  const saveIssueReporterSettings = async (settings: GlobalSettings) => {
    await saveGlobalSettings(settings);
    setGlobalSettings(settings);
  };

  const handleRecordingComplete = useCallback(async ({ blob }: { blob: Blob }) => {
    resetAnalysis();
    const videoUrl = URL.createObjectURL(blob);
    const durationSeconds = await readVideoDuration(videoUrl);
    const nextCapture: CaptureState = {
      fileBase: buildFileBase(),
      recordedAt: Date.now(),
      durationSeconds,
      videoBlob: blob,
      videoUrl,
    };

    replaceCapture(nextCapture);
  }, [replaceCapture, resetAnalysis]);

  const handleRecordingError = useCallback((error: Error) => {
    console.error('Failed to capture issue recording.', error);
    showAlert(error.message || 'Failed to capture the recording.', {
      type: 'error',
      title: 'Recording Failed',
    });
  }, [showAlert]);

  const { isRecording, startRecording, stopRecording } = useScreenRecorder({
    captureMode: 'display',
    onRecordingComplete: handleRecordingComplete,
    onRecordingError: handleRecordingError,
    onRecordingPending: () => {
      showAlert(
        'Choose Entire Screen, a window, or a browser tab in the system picker, then start the recording. Use Stop in Origami or your browser capture controls when you are done.',
        { type: 'info', title: 'Choose What To Record' }
      );
    },
  });

  const handleStartRecording = async () => {
    try {
      resetAnalysis();
      await startRecording();
    } catch (error) {
      if (error instanceof Error && error.message !== 'Permission denied') {
        showAlert(error.message, { type: 'error', title: 'Recording Failed' });
      }
    }
  };

  const handleStopRecording = async () => {
    try {
      await stopRecording();
    } catch (error) {
      handleRecordingError(error instanceof Error ? error : new Error('Failed to stop recording.'));
    }
  };

  const handleAnalyze = async () => {
    const currentCapture = captureRef.current;
    if (!currentCapture?.videoBlob) {
      showAlert('Record an issue before asking Gemini to analyze it.', {
        type: 'warning',
        title: 'Recording Required',
      });
      return;
    }

    const settings = getConfiguredGeminiSettings();
    if (!settings.apiKey.trim()) {
      showAlert('Add your Gemini API key in Settings before generating an issue prompt.', {
        type: 'warning',
        title: 'Gemini Not Configured',
      });
      return;
    }

    if (!/generativelanguage\.googleapis\.com/i.test(settings.baseUrl)) {
      showAlert('Issue video analysis uses Gemini file uploads, so the Base URL must point to the Google Gemini endpoint.', {
        type: 'warning',
        title: 'Gemini Endpoint Required',
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress({ stage: 'Preparing request', progress: 3 });
    setCopiedPrompt(false);

    try {
      const result = await analyzeIssueCaptureWithGemini(
        {
          apiKey: settings.apiKey,
          baseUrl: settings.baseUrl,
          model: settings.model,
          useWebLLM: false,
        },
        {
          mediaBlob: currentCapture.videoBlob,
          mediaMimeType: currentCapture.videoBlob.type || 'video/webm',
          fileNameHint: `${currentCapture.fileBase}.webm`,
          mediaDurationSeconds: currentCapture.durationSeconds,
          userGoal,
          extraContext,
          onProgress: (update) => {
            setAnalysisProgress({
              stage: update.stage,
              progress: Math.max(0, Math.min(100, Math.round(update.progress))),
            });
          },
        }
      );

      setAnalysis(result);
      setPromptDraft(result.recommendedPrompt);
      setAnalysisProgress({ stage: 'Prompt ready', progress: 100 });
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Failed to analyze the recording.', {
        type: 'error',
        title: 'Gemini Analysis Failed',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!promptDraft.trim()) return;

    try {
      await navigator.clipboard.writeText(promptDraft);
      setCopiedPrompt(true);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'Failed to copy the prompt.', {
        type: 'error',
        title: 'Copy Failed',
      });
    }
  };

  const handleStartOver = useCallback(() => {
    replaceCapture(null);
    setUserGoal('');
    setExtraContext('');
    resetAnalysis();
  }, [replaceCapture, resetAnalysis]);

  const geminiSettings = getConfiguredGeminiSettings();
  const isGeminiConfigured = geminiSettings.apiKey.trim().length > 0;
  const isGeminiEndpointValid = /generativelanguage\.googleapis\.com/i.test(geminiSettings.baseUrl);

  return (
    <div className="min-h-screen bg-branding-dark text-white pt-8">
      {/* Background */}
      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 h-lvh w-full scale-105 object-cover opacity-40 blur-[2px] brightness-75"
      />

      <PageHeader
        title="Issue Reporter"
        onSettings={() => setIsSettingsOpen(true)}
        showHelp={false}
        actionMenuContent={capture ? (closeMenu) => (
          <button
            onClick={() => { handleStartOver(); closeMenu(); }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Sparkles className="h-4 w-4" /> Start Over
          </button>
        ) : undefined}
        rightContent={
          <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 sm:inline-flex">
            <Bug className="h-3.5 w-3.5 text-orange-300" />
            <span className="text-xs font-bold text-white/70">
              {isGeminiConfigured ? geminiSettings.model : 'Not configured'}
            </span>
          </div>
        }
      />

      <main className="mx-auto max-w-5xl px-6 pb-20 sm:px-8">

        {/* Hero with animated background */}
        <div className="mb-10 relative rounded-3xl overflow-hidden shadow-2xl shadow-black/40" style={{
          boxShadow: '0 0 60px rgba(0, 0, 0, 0.5), inset 0 0 60px rgba(0, 0, 0, 0.3)'
        }}>
          {/* Animated background */}
          <div className="absolute inset-0 z-0">
            <SoftAurora
              speed={0.6}
              scale={1.5}
              brightness={1}
              color1="#f7f7f7"
              color2="#e100ff"
              noiseFrequency={2.5}
              noiseAmplitude={1}
              bandHeight={0.5}
              bandSpread={1}
              octaveDecay={0.1}
              layerOffset={0}
              colorSpeed={1}
              enableMouseInteraction
              mouseInfluence={0.25}
            />
          </div>

          {/* Dark overlay */}
          <div className="absolute inset-0 z-5 bg-black/70" />

          {/* Edge fade gradient - smoother transition */}
          <div className="absolute inset-0 z-6 rounded-3xl" style={{
            background: 'radial-gradient(ellipse 120% 120% at center, transparent 20%, rgba(0, 0, 0, 0.3) 60%, rgba(0, 0, 0, 0.7) 100%)'
          }} />

          {/* Content overlay */}
          <div className="relative z-10 flex items-start justify-between gap-6 lg:gap-10 p-8 lg:p-12">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/12 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-orange-300">
                <Bug className="h-3.5 w-3.5" />
                Capture · Analyze · Prompt
              </div>
              <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                Record the issue,<br />
                <span className="text-orange-400">generate the prompt.</span>
              </h2>
              <p className="mt-5 max-w-lg text-base leading-8 text-white/65">
                Origami records your visual bug as a video clip and uses AI to transform it into a precise debugging prompt — ready to paste alongside the attachment in any AI chat.
              </p>
            </div>
            <div className="hidden shrink-0 lg:flex">
              <img src={orgIssueLogo} alt="Issue Reporter" className="h-56 w-56 object-contain" />
            </div>
          </div>
        </div>

        {/* Config warning */}
        {(!isGeminiConfigured || !isGeminiEndpointValid) && (
          <div className="mb-6 flex items-start gap-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 p-5">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15">
              <Settings className="h-4 w-4 text-amber-300" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-100">Gemini API not configured</p>
              <p className="mt-1.5 text-sm leading-6 text-amber-200/70">
                This feature requires a Gemini API key and the Google Gemini base URL.{' '}
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="font-semibold text-amber-200 underline underline-offset-2 transition-colors hover:text-amber-100"
                >
                  Open Settings → API
                </button>
              </p>
            </div>
          </div>
        )}

        {/* ── Row 1: Describe + Record ── */}
        <div className="rounded-3xl border border-white/25 bg-black/30 p-7 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-md">
          <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">

            {/* Describe fields */}
            <div className="flex-1">
              <div className="mb-5 flex items-center gap-3.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-black text-white/70">
                  1
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-lg font-black text-white">Describe the bug</h3>
                    <span className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xs font-bold text-white/70">
                      Optional
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white/70">Give Origami context before it watches the recording</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="mb-2.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/75">
                    What should happen?
                  </label>
                  <textarea
                    aria-label="What should happen (optional)"
                    value={userGoal}
                    onChange={(event) => setUserGoal(event.target.value)}
                    placeholder="Example: Clicking Save should keep me on the page with my changes applied."
                    className="min-h-[108px] w-full resize-none rounded-2xl border border-white/30 bg-black/40 px-4 py-3.5 text-sm leading-7 text-white outline-none transition-all placeholder:text-white/40 focus:border-orange-300/50 focus:bg-black/50"
                  />
                </div>
                <div>
                  <label className="mb-2.5 block text-xs font-bold uppercase tracking-[0.18em] text-white/75">
                    What is happening instead?
                  </label>
                  <textarea
                    value={extraContext}
                    onChange={(event) => setExtraContext(event.target.value)}
                    placeholder="Example: The page reloads and all my changes are gone."
                    className="min-h-[108px] w-full resize-none rounded-2xl border border-white/30 bg-black/40 px-4 py-3.5 text-sm leading-7 text-white outline-none transition-all placeholder:text-white/40 focus:border-orange-300/50 focus:bg-black/50"
                  />
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden w-px self-stretch bg-white/[0.07] lg:block" />

            {/* Record */}
            <div className="flex w-full flex-col justify-between lg:w-64">
              <div>
                <div className="mb-4 flex items-center gap-3.5">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm font-black transition-all ${capture ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-white/70'}`}>
                    {capture ? <CheckCircle2 className="h-4 w-4" /> : '2'}
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">Record</h3>
                    <p className="mt-1 text-sm text-white/70">Screen, window, or tab</p>
                  </div>
                </div>

                <p className="mb-5 text-sm leading-7 text-white/70">
                  Use the browser screen-share picker. Click Stop once the issue is demonstrated.
                </p>
              </div>

              {/* Separator */}
              <div className="my-5 h-0.5 bg-gradient-to-r from-transparent via-white/40 to-transparent" />

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleStartRecording}
                  disabled={isRecording}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-black text-black transition-all hover:bg-orange-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Video className="h-4 w-4" />
                  {capture ? 'Re-record' : 'Record'}
                </button>
                {isRecording && (
                  <button
                    onClick={handleStopRecording}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/15 px-5 py-4 text-sm font-black text-red-200 transition-all hover:bg-red-500/25"
                  >
                    <Square className="h-4 w-4 fill-current" />
                    Stop
                  </button>
                )}
              </div>

              {capture && (
                <div className="mt-4 flex flex-col gap-1.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3.5">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-[0.15em]">Captured</span>
                  </div>
                  <p className="text-sm text-white/80">
                    {formatDuration(capture.durationSeconds)} · {formatBytes(capture.videoBlob.size)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 2: Recording preview + Analyze ── */}
        <div className="mt-5 rounded-3xl border border-white/25 bg-black/30 p-7 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-md">
          {/* Header */}
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-sm font-black transition-all ${analysis ? 'bg-orange-500/20 text-orange-300' : 'bg-white/10 text-white/70'}`}>
                {analysis ? <Sparkles className="h-4 w-4" /> : '3'}
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Recording preview</h3>
                <p className="mt-1 text-sm text-white/70">Review your capture, then analyze with Gemini</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2.5">
              {capture?.videoBlob && (
                <button
                  onClick={() => downloadBlob(capture.videoBlob, `${capture.fileBase}.webm`)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.07] px-4 py-2.5 text-sm font-bold text-white/70 transition-all hover:bg-white/12 hover:text-white"
                >
                  <Download className="h-4 w-4" />
                  WebM
                </button>
              )}
              <button
                onClick={handleAnalyze}
                disabled={!capture?.videoBlob || isAnalyzing}
                className="inline-flex items-center gap-2 rounded-2xl bg-orange-400 px-5 py-2.5 text-sm font-black text-slate-950 transition-all hover:bg-orange-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {analysis ? 'Regenerate' : 'Analyze'}
              </button>
            </div>
          </div>

          {/* Video player */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/50">
            {capture?.videoUrl ? (
              <video src={capture.videoUrl} controls className="aspect-video w-full bg-black object-contain" />
            ) : (
              <div className="flex aspect-video flex-col items-center justify-center gap-4 text-center">
                <div className="rounded-2xl bg-white/10 p-5">
                  <Video className="h-8 w-8 text-white/50" />
                </div>
                <p className="max-w-[200px] text-sm leading-6 text-white/65">
                  Record an issue and the preview will appear here
                </p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {analysisProgress && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{analysisProgress.stage}</p>
                <span className="font-mono text-xs font-bold text-white/75">{analysisProgress.progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-linear-to-r from-cyan-400 via-emerald-400 to-orange-400 transition-all duration-300"
                  style={{ width: `${analysisProgress.progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Analysis results */}
          {analysis && (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.08] p-6">
                <div className="mb-3 flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-[0.2em]">Analysis complete</span>
                </div>
                <h4 className="text-xl font-black text-white">{analysis.issueTitle}</h4>
                <p className="mt-2 text-sm leading-7 text-white/80">{analysis.issueSummary}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-white/70">Observed behavior</p>
                  <p className="text-sm leading-7 text-white/85">{analysis.observedBehavior}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-white/70">Expected behavior</p>
                  <p className="text-sm leading-7 text-white/85">{analysis.expectedBehavior}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-white/70">Reproduction steps</p>
                <div className="space-y-2.5">
                  {analysis.reproductionSteps.map((step, index) => (
                    <div key={`${step}-${index}`} className="flex items-start gap-3.5 rounded-xl bg-white/[0.05] px-4 py-3.5">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500/25 text-xs font-black text-orange-300">
                        {index + 1}
                      </span>
                      <span className="text-sm leading-6 text-white/85">{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              {analysis.technicalClues.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
                  <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-white/70">Visual clues</p>
                  <div className="flex flex-wrap gap-2">
                    {analysis.technicalClues.map((clue, index) => (
                      <span
                        key={`${clue}-${index}`}
                        className="rounded-full border border-white/15 bg-white/[0.07] px-3.5 py-1.5 text-sm font-semibold text-white/70"
                      >
                        {clue}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Row 3: Box 4 — Paste-ready prompt ── */}
        <div className="mt-5 rounded-3xl border border-white/25 bg-black/30 p-7 shadow-[0_0_0_1px_rgba(255,255,255,0.06)] backdrop-blur-md">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-black text-white/70">
                4
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Paste-ready AI prompt</h3>
                <p className="mt-1 text-sm text-white/70">Copy and paste alongside your WebM into any AI chat</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2.5">
              {capture?.videoBlob && (
                <button
                  onClick={() => downloadBlob(capture.videoBlob, `${capture.fileBase}.webm`)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.07] px-4 py-2.5 text-sm font-bold text-white/70 transition-all hover:bg-white/12 hover:text-white"
                >
                  <Download className="h-4 w-4" />
                  WebM
                </button>
              )}
              <button
                onClick={handleCopyPrompt}
                disabled={!promptDraft.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-2.5 text-sm font-black text-black transition-all hover:bg-orange-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Copy className="h-4 w-4" />
                {copiedPrompt ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
          <textarea
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
            placeholder="Your generated debugging prompt will appear here after analysis in step 3."
            className="min-h-[220px] w-full resize-none rounded-2xl border border-white/30 bg-black/40 px-5 py-4 text-sm leading-7 text-white outline-none transition-all placeholder:text-white/40 focus:border-orange-300/50 focus:bg-black/50"
          />
          <p className="mt-4 text-sm leading-7 text-white/65">
            Suggested flow: click <span className="font-semibold text-white/90">Copy</span>, attach the downloaded WebM in your AI chat, then paste this prompt so the agent sees both the visual behavior and a written description.
          </p>
        </div>

      </main>

      <Footer />

      {isSettingsOpen && (
        <GlobalSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentSettings={globalSettings}
          onSave={saveIssueReporterSettings}
          initialTab="api"
        />
      )}

      <DuplicateTabModal />
      <MobileWarningModal />

      {/* Recording indicator pill */}
      {isRecording && (
        <div className="fixed left-1/2 top-6 z-100 -translate-x-1/2 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-4 rounded-full border border-red-500/40 bg-red-500/15 px-6 py-3 shadow-2xl shadow-red-500/20 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              <span className="text-sm font-bold uppercase tracking-wider text-red-100">Recording</span>
            </div>
            <div className="h-5 w-px bg-red-500/25" />
            <button
              onClick={handleStopRecording}
              className="rounded-full bg-red-500 px-4 py-1.5 text-sm font-extrabold text-white shadow-lg shadow-red-500/30 transition-all hover:scale-105 hover:bg-red-400 active:scale-95"
            >
              Stop
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
