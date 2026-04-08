import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bug,
  CheckCircle2,
  Copy,
  Download,
  Github,
  Loader2,
  Settings,
  Sparkles,
  Square,
  Video,
  WandSparkles
} from 'lucide-react';

import appLogo from '../assets/images/app-logo2.png';
import backgroundImage from '../assets/images/background.png';
import { AppModeSwitcher } from '../components/AppModeSwitcher';
import { DuplicateTabModal } from '../components/DuplicateTabModal';
import { Footer } from '../components/Footer';
import { GlobalSettingsModal } from '../components/GlobalSettingsModal';
import { MobileWarningModal } from '../components/MobileWarningModal';
import { useModal } from '../context/ModalContext';
import { useScreenRecorder } from '../hooks/useScreenRecorder';
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

  const geminiSettings = getConfiguredGeminiSettings();
  const isGeminiConfigured = geminiSettings.apiKey.trim().length > 0;
  const isGeminiEndpointValid = /generativelanguage\.googleapis\.com/i.test(geminiSettings.baseUrl);

  return (
    <div className="min-h-screen bg-branding-dark px-4 pb-2 pt-6 text-white sm:px-6 lg:px-8">
      <header className="relative z-50 mx-auto mb-4 flex w-full max-w-6xl flex-col gap-3 rounded-3xl border border-white/10 bg-black/20 px-4 py-4 backdrop-blur-xl sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl shadow-lg shadow-orange-500/10">
            <img src={appLogo} alt="Origami" className="h-full w-full rounded-xl object-cover" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-orange-300/70">Origami</p>
            <h1 className="text-2xl font-black tracking-tight text-white">Issue Reporter</h1>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <AppModeSwitcher className="self-start lg:self-center" />
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white/60">
              <Bug className="h-4 w-4 text-orange-300" />
              <span>{isGeminiConfigured ? geminiSettings.model : 'Setup required'}</span>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-white/70 transition-colors hover:text-white"
              title="Open Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
            <a
              href="https://github.com/IslandApps/Origami-AI"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-white/70 transition-colors hover:text-white"
              title="View on GitHub"
            >
              <Github className="h-5 w-5" />
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 pb-8">
        <section className="overflow-hidden rounded-[2rem] border border-orange-400/10 bg-[radial-gradient(circle_at_top_left,rgba(251,146,60,0.14),transparent_34%),linear-gradient(180deg,rgba(11,15,20,0.95),rgba(11,15,20,0.9))] shadow-2xl shadow-black/30 backdrop-blur-2xl">
          <div className="border-b border-white/10 px-5 py-5 sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-orange-300/65">Capture To Prompt</p>
            <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">Record the issue, generate the wording, paste it into your AI chat.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/60 sm:text-base">
              Origami records the visual bug as a WebM clip and asks Gemini to turn the behavior into a precise debugging prompt you can paste alongside the attachment.
            </p>
          </div>

          <div className="grid gap-4 border-b border-white/10 px-5 py-5 sm:grid-cols-3 sm:px-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 inline-flex rounded-xl border border-orange-300/20 bg-orange-400/10 p-2 text-orange-200">
                <Video className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-black text-white">1. Record the issue</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">Capture the exact browser behavior that is breaking so you do not have to translate it manually.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 inline-flex rounded-xl border border-cyan-300/20 bg-cyan-400/10 p-2 text-cyan-200">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-black text-white">2. Let Gemini analyze</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">Gemini watches the WebM clip, extracts the visible problem, and writes a structured explanation.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="mb-3 inline-flex rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-2 text-emerald-200">
                <WandSparkles className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-black text-white">3. Paste the finished prompt</h3>
              <p className="mt-2 text-sm leading-6 text-white/60">Copy the generated prompt, attach the WebM clip, and drop both into your agentic AI chat.</p>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[1.1fr_0.9fr] sm:px-6">
            <div className="space-y-6">
              {!isGeminiConfigured || !isGeminiEndpointValid ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-50">
                  <p className="font-semibold">Configure Gemini in Settings before analyzing issue recordings.</p>
                  <p className="mt-2 text-amber-50/75">
                    This feature uses Gemini file uploads, so you need a Gemini API key and the Google Gemini base URL selected in the API tab.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/8 px-4 py-4 text-sm text-emerald-50">
                  <p className="font-semibold">Gemini is ready.</p>
                  <p className="mt-2 text-emerald-50/75">
                    Current model: <span className="font-mono text-emerald-100">{geminiSettings.model}</span>
                  </p>
                </div>
              )}

              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 shadow-inner shadow-black/20">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/45">Capture</p>
                    <h3 className="mt-1 text-xl font-black text-white">Record a full screen, window, or tab</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleStartRecording}
                      disabled={isRecording}
                      className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-black transition-all disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Video className="h-4 w-4" />
                      {capture ? 'Record Again' : 'Record Issue'}
                    </button>
                    {isRecording && (
                      <button
                        onClick={handleStopRecording}
                        className="inline-flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-2.5 text-sm font-black text-red-100 transition-colors hover:bg-red-500/20"
                      >
                        <Square className="h-4 w-4" />
                        Stop
                      </button>
                    )}
                  </div>
                </div>

                <p className="mt-3 text-sm leading-7 text-white/55">
                  Use the browser picker to capture your full screen, a specific app window, or a browser tab. Short clips work best for AI analysis and keep the WebM upload lightweight.
                </p>

                {capture && (
                  <div className="mt-5 grid gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/40">Duration</p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatDuration(capture.durationSeconds)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/40">WebM Size</p>
                      <p className="mt-1 text-sm font-semibold text-white">{formatBytes(capture.videoBlob.size)}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 shadow-inner shadow-black/20">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/45">Optional Context</p>
                <h3 className="mt-1 text-xl font-black text-white">Help Gemini understand the intent</h3>
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                      What were you trying to do?
                    </label>
                    <textarea
                      value={userGoal}
                      onChange={(event) => setUserGoal(event.target.value)}
                      placeholder="Example: Save the settings form and stay on the same page."
                      className="min-h-[92px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white outline-none transition-colors placeholder:text-white/30 focus:border-orange-300/40"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                      Relevant stack or extra notes
                    </label>
                    <textarea
                      value={extraContext}
                      onChange={(event) => setExtraContext(event.target.value)}
                      placeholder="Example: React app, happens after optimistic update, only in Chrome."
                      className="min-h-[92px] w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-7 text-white outline-none transition-colors placeholder:text-white/30 focus:border-orange-300/40"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 shadow-inner shadow-black/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/45">Preview</p>
                    <h3 className="mt-1 text-xl font-black text-white">Recorded WebM attachment</h3>
                  </div>
                  <div className="flex gap-2">
                    {capture?.videoBlob && (
                      <button
                        onClick={() => downloadBlob(capture.videoBlob, `${capture.fileBase}.webm`)}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white/70 transition-colors hover:text-white"
                      >
                        <Download className="h-4 w-4" />
                        WebM
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/40">
                  {capture?.videoUrl ? (
                    <video src={capture.videoUrl} controls className="aspect-video w-full bg-black object-contain" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-white/45">
                      Record an issue and Origami will render the WebM preview here.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 shadow-inner shadow-black/20">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/45">Analysis</p>
                    <h3 className="mt-1 text-xl font-black text-white">Generate the debugging prompt</h3>
                  </div>
                  <button
                    onClick={handleAnalyze}
                    disabled={!capture?.videoBlob || isAnalyzing}
                    className="inline-flex items-center gap-2 rounded-2xl bg-orange-300 px-4 py-2.5 text-sm font-black text-slate-950 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {analysis ? 'Regenerate Prompt' : 'Analyze Recording'}
                  </button>
                </div>

                {analysisProgress && (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">{analysisProgress.stage}</p>
                      <span className="text-xs font-mono text-white/55">{analysisProgress.progress}%</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-cyan-300 via-emerald-300 to-orange-300 transition-all duration-300"
                        style={{ width: `${analysisProgress.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {analysis ? (
                  <div className="mt-5 space-y-5">
                    <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/8 p-4">
                      <div className="flex items-center gap-2 text-emerald-100">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-xs font-bold uppercase tracking-[0.18em]">Prompt Ready</span>
                      </div>
                      <h4 className="mt-2 text-lg font-black text-white">{analysis.issueTitle}</h4>
                      <p className="mt-2 text-sm leading-7 text-white/70">{analysis.issueSummary}</p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/40">Observed</p>
                        <p className="mt-2 text-sm leading-7 text-white/75">{analysis.observedBehavior}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/40">Expected</p>
                        <p className="mt-2 text-sm leading-7 text-white/75">{analysis.expectedBehavior}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/40">Reproduction Steps</p>
                      <div className="mt-3 space-y-2">
                        {analysis.reproductionSteps.map((step, index) => (
                          <div key={`${step}-${index}`} className="rounded-xl bg-white/[0.03] px-3 py-2 text-sm text-white/75">
                            <span className="mr-2 font-black text-orange-200">{index + 1}.</span>
                            {step}
                          </div>
                        ))}
                      </div>
                    </div>

                    {analysis.technicalClues.length > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/40">Visual Clues</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {analysis.technicalClues.map((clue, index) => (
                            <span
                              key={`${clue}-${index}`}
                              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/75"
                            >
                              {clue}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-7 text-white/50">
                    Once the recording is ready, Origami will ask Gemini to describe the visible bug and build a paste-ready prompt for your AI debugger.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[#0b0f14]/90 p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/45">Paste-Ready Output</p>
              <h2 className="mt-1 text-2xl font-black text-white">Final prompt for your agentic AI</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleCopyPrompt}
                disabled={!promptDraft.trim()}
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-black transition-all disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Copy className="h-4 w-4" />
                {copiedPrompt ? 'Copied' : 'Copy Prompt'}
              </button>
              {capture?.videoBlob && (
                <button
                  onClick={() => downloadBlob(capture.videoBlob, `${capture.fileBase}.webm`)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white/70 transition-colors hover:text-white"
                >
                  <Download className="h-4 w-4" />
                  Download WebM
                </button>
              )}
            </div>
          </div>

          <textarea
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
            placeholder="Your generated debugging prompt will appear here."
            className="mt-5 min-h-[240px] w-full rounded-[1.75rem] border border-white/10 bg-black/20 px-5 py-4 text-sm leading-7 text-white outline-none transition-colors placeholder:text-white/30 focus:border-cyan-300/35"
          />

          <p className="mt-4 text-sm leading-7 text-white/50">
            Suggested flow: click <span className="font-semibold text-white/75">Copy Prompt</span>, attach the downloaded WebM clip in your AI chat, then paste this message so the agent sees both the exact visual behavior and a clear written description.
          </p>
        </section>
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

      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 h-lvh w-full scale-105 object-cover opacity-40 blur-[2px] brightness-75"
      />

      {isRecording && (
        <div className="fixed left-1/2 top-6 z-100 -translate-x-1/2 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-4 rounded-full border border-red-500/50 bg-red-500/20 px-6 py-3 shadow-2xl shadow-red-500/20 backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full animate-pulse bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              <span className="text-sm font-bold uppercase tracking-wider text-red-100">Recording</span>
            </div>
            <div className="h-6 w-px bg-red-500/30" />
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
