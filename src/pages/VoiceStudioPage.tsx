import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Download, FileAudio, Gauge, Loader2, Mic, RotateCcw, Sparkles } from 'lucide-react';
import backgroundImage from '../assets/images/background.jpg';
import { Footer } from '../components/Footer';
import { GlobalSettingsModal } from '../components/GlobalSettingsModal';
import { MobileWarningModal } from '../components/MobileWarningModal';
import { PageHeader } from '../components/PageHeader';
import { DownloadBlockedModal } from '../components/DownloadBlockedModal';
import { VoiceAuditionModal, VOICE_METADATA } from '../components/shorts/VoiceAuditionModal';
import { useBackgroundDownload } from '../context/BackgroundDownloadContext';
import { useModal } from '../context/ModalContext';
import { usePageMeta } from '../hooks/usePageMeta';
import { triggerBlobDownload } from '../utils/downloadBlob';
import { encodeWavToMp3, isMp3EncoderReady, type Mp3Bitrate } from '../services/audioExportService';
import type { GlobalSettings } from '../services/storage';
import { loadGlobalSettings, saveGlobalSettings } from '../services/storage';
import {
  generateTTSBlob,
  getAudioDuration,
  initTTS,
  resolveVoice,
  ttsEvents,
  type ProgressEventDetail,
} from '../services/ttsService';

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  isEnabled: true,
  voice: 'af_heart',
  delay: 0.5,
  transition: 'fade',
  introFadeInEnabled: true,
  introFadeInDurationSec: 1,
  previewMode: 'modal',
  aspectRatio: '16:9',
};

/** Past this the wait gets noticeable — the worker generates ~300-char chunks serially on CPU. */
const LONG_TEXT_CHARS = 2000;
const MAX_CHARS = 5000;

const BITRATES: Mp3Bitrate[] = [128, 192, 320];

const SAMPLE_TEXT =
  'Origami AI turns your words into natural narration right here in your browser. ' +
  'Nothing is uploaded, nothing leaves this tab.';

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'voice-over';

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong.';

const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
};

const formatBytes = (bytes: number): string =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

interface Take {
  blob: Blob;
  url: string;
  duration: number;
  voice: string;
  speed: number;
  text: string;
}

export const VoiceStudioPage: React.FC = () => {
  usePageMeta({
    title: 'Voice Studio — Origami AI',
    description:
      'Type anything and hear it spoken by 28 on-device voices, then download the narration as an MP3. Runs entirely in your browser — no account, no uploads.',
    path: '/voice',
  });

  const { showAlert } = useModal();
  const { isBackgroundDownloadActive } = useBackgroundDownload();

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVoicePickerOpen, setIsVoicePickerOpen] = useState(false);
  const [isBlockedModalOpen, setIsBlockedModalOpen] = useState(false);

  const [text, setText] = useState('');
  const [voice, setVoice] = useState('af_heart');
  const [speed, setSpeed] = useState(1);
  const [bitrate, setBitrate] = useState<Mp3Bitrate>(192);

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [isEncoding, setIsEncoding] = useState(false);
  const [encodeProgress, setEncodeProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [take, setTake] = useState<Take | null>(null);

  // Kept out of state so the unmount cleanup always sees the live URL.
  const takeUrlRef = useRef<string | null>(null);

  // Simulated-progress refs. The bar is animated here rather than driven by the
  // raw worker percentage, which reports 50+ instantly on a single-chunk script.
  const progressRef = useRef(10);
  const isFinishedRef = useRef(false);
  const progressTimerRef = useRef<number | null>(null);
  const pendingTakeRef = useRef<Take | null>(null);

  const voiceMeta = VOICE_METADATA.find((v) => v.id === voice);
  const trimmed = text.trim();
  const canGenerate = trimmed.length > 0 && !isGenerating && !isEncoding;

  // --- load / persist ---------------------------------------------------------

  useEffect(() => {
    let mounted = true;

    (async () => {
      const settings = await loadGlobalSettings();
      if (!mounted) return;

      const merged = { ...DEFAULT_GLOBAL_SETTINGS, ...(settings ?? {}) };
      setGlobalSettings(merged);
      setVoice(resolveVoice(merged.voiceStudioVoice || merged.voice));
      if (typeof merged.voiceStudioSpeed === 'number') setSpeed(merged.voiceStudioSpeed);
      if (merged.voiceStudioMp3Bitrate) setBitrate(merged.voiceStudioMp3Bitrate);

      // The TTS worker downloads ~80MB on first use; start it while the user types.
      try {
        initTTS(merged.ttsQuantization || 'q8');
      } catch (e) {
        console.warn('[VoiceStudio] TTS init could not be started:', e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Revoke the last preview URL when the page goes away.
  useEffect(() => {
    return () => {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
    };
  }, []);

  const stopProgressTimer = () => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const persist = useCallback((patch: Partial<GlobalSettings>) => {
    setGlobalSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveGlobalSettings(next).catch((e) => console.warn('[VoiceStudio] Failed to persist settings:', e));
      return next;
    });
  }, []);

  const saveSettings = useCallback(async (next: GlobalSettings) => {
    setGlobalSettings(next);
    await saveGlobalSettings(next);
  }, []);

  // --- generate ---------------------------------------------------------------

  const handleGenerate = useCallback(async () => {
    if (!trimmed) return;

    // A model download in flight would contend with the TTS worker for bandwidth
    // and stall the generation, so refuse rather than hang.
    if (isBackgroundDownloadActive) {
      setIsBlockedModalOpen(true);
      return;
    }

    setError(null);
    setIsGenerating(true);
    setTake(null);
    stopProgressTimer();
    progressRef.current = 10;
    isFinishedRef.current = false;
    pendingTakeRef.current = null;
    setProgress(10);
    setProgressLabel('Warming up the voice model…');

    // 'tts-progress' carries both the first-run model download and the
    // per-chunk generation, distinguishable by the status the worker sets.
    const handleProgress = (e: Event) => {
      const detail = (e as CustomEvent<ProgressEventDetail>).detail;
      const pct = Math.round(detail.progress);

      if (detail.status === 'Processing') {
        setProgressLabel(detail.file || 'Generating speech…');
      } else if (detail.status === 'done' || pct >= 100) {
        setProgressLabel('Finishing up…');
      } else {
        setProgressLabel(detail.file ? `Downloading voice model — ${detail.file}` : 'Downloading voice model…');
      }
    };
    ttsEvents.addEventListener('tts-progress', handleProgress);

    let completed = false;
    const stopAndCleanup = () => {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      ttsEvents.removeEventListener('tts-progress', handleProgress);
    };
    const revealResult = () => {
      if (completed) return;
      completed = true;
      stopAndCleanup();
      if (pendingTakeRef.current) setTake(pendingTakeRef.current);
      pendingTakeRef.current = null;
      setProgress(100);
      setIsGenerating(false);
    };

    try {
      // Animate the bar ourselves: start at 10%, creep toward a soft ceiling
      // while the worker churns, then sprint to 100% once the audio is actually
      // ready so the download controls only appear when the result exists.
      progressTimerRef.current = window.setInterval(() => {
        const current = progressRef.current;
        const finished = isFinishedRef.current;
        const ceiling = finished ? 100 : 90;

        const next = Math.min(
          ceiling,
          current + (finished ? Math.max(2, (100 - current) * 0.35) : Math.max(0.4, (ceiling - current) * 0.05)),
        );

        progressRef.current = next;
        setProgress(next);

        if (finished && next >= 99.5) revealResult();
      }, 120);

      const blob = await generateTTSBlob(trimmed, { voice, speed, pitch: 1.0 });
      const url = URL.createObjectURL(blob);
      const duration = await getAudioDuration(url);

      if (takeUrlRef.current) URL.revokeObjectURL(takeUrlRef.current);
      takeUrlRef.current = url;

      pendingTakeRef.current = { blob, url, duration, voice, speed, text: trimmed };
      isFinishedRef.current = true;
      setProgressLabel('Finishing up…');
    } catch (e) {
      console.error('[VoiceStudio] Generation failed:', e);
      setError(errorMessage(e));
      stopAndCleanup();
      setIsGenerating(false);
    }
  }, [trimmed, voice, speed, isBackgroundDownloadActive]);

  // --- download ---------------------------------------------------------------

  const handleDownloadMp3 = useCallback(async () => {
    if (!take) return;

    setIsEncoding(true);
    setEncodeProgress(0);

    try {
      const title = take.text.slice(0, 60);
      const mp3 = await encodeWavToMp3(take.blob, {
        bitrateKbps: bitrate,
        title,
        onProgress: (p) => setEncodeProgress(Math.round(p * 100)),
      });
      triggerBlobDownload(mp3, `${slugify(take.text)}.mp3`);
    } catch (e) {
      console.error('[VoiceStudio] MP3 encoding failed:', e);
      await showAlert(
        `${errorMessage(e)}\n\nYou can still download the original WAV instead — it plays everywhere, it is just a larger file.`,
        { title: 'Could not build the MP3', type: 'error' },
      );
    } finally {
      setIsEncoding(false);
      setEncodeProgress(0);
    }
  }, [take, bitrate, showAlert]);

  const handleDownloadWav = useCallback(() => {
    if (!take) return;
    triggerBlobDownload(take.blob, `${slugify(take.text)}.wav`);
  }, [take]);

  // --- render -----------------------------------------------------------------

  return (
    <div className="isolate flex min-h-screen flex-col bg-[#0a0a0b] pt-8 text-white">
      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 h-lvh w-full scale-105 object-cover opacity-40 blur-[2px] brightness-50"
      />
      <div className="fixed inset-0 -z-40 h-lvh w-full bg-[#0a0a0b]/40" />

      <PageHeader
        title="Voice Studio"
        onSettings={() => setIsSettingsOpen(true)}
        showHelp={false}
        actionMenuContent={(closeMenu) => (
          <button
            onClick={() => {
              setText('');
              setTake(null);
              setError(null);
              if (takeUrlRef.current) {
                URL.revokeObjectURL(takeUrlRef.current);
                takeUrlRef.current = null;
              }
              closeMenu();
            }}
            disabled={isGenerating || isEncoding}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-4 w-4" /> Start over
          </button>
        )}
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20 sm:px-8">
        {/* Intro */}
        <div className="mb-8">
          <span className="mb-3 block font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">
            Text to speech
          </span>
          <h1 className="font-display mb-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Voice Studio
          </h1>
          <p className="max-w-xl text-sm text-white/55 sm:text-base">
            Type anything, pick one of 28 on-device voices, and download the narration as an MP3.
            Generation runs in your browser — the text never leaves this tab.
          </p>
        </div>

        {/* Script */}
        <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <label
              htmlFor="voice-studio-text"
              className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-white/50"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-400" /> Script
            </label>
            <button
              type="button"
              onClick={() => setText(SAMPLE_TEXT)}
              disabled={isGenerating}
              className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Use sample text
            </button>
          </div>

          <textarea
            id="voice-studio-text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
            maxLength={MAX_CHARS}
            rows={8}
            disabled={isGenerating}
            placeholder="Paste or type the words you want spoken…"
            className="focus-ring w-full resize-y rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 transition-colors focus:border-cyan-400/50 focus:outline-none disabled:opacity-60"
          />

          <div className="mt-2 flex items-center justify-between gap-3 text-[11px]">
            <span className={trimmed.length > LONG_TEXT_CHARS ? 'text-amber-300' : 'text-white/35'}>
              {trimmed.length > LONG_TEXT_CHARS
                ? 'Long scripts are generated sentence by sentence — this one will take a few minutes.'
                : 'Punctuation guides the pacing.'}
            </span>
            <span className="shrink-0 font-mono text-white/65">
              {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
          </div>
        </section>

        {/* Voice + speed */}
        <section className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
            <span className="mb-3 flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-white/50">
              <Mic className="h-3.5 w-3.5 text-cyan-400" /> Voice
            </span>
            <button
              type="button"
              onClick={() => setIsVoicePickerOpen(true)}
              disabled={isGenerating}
              className="focus-ring flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-left transition-colors hover:border-cyan-400/40 hover:bg-black/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-bold text-white">
                  <span>{voiceMeta?.flag ?? '🇺🇸'}</span>
                  <span className="truncate">{voiceMeta?.name ?? voice}</span>
                </span>
                <span className="text-[11px] text-white/40">{voiceMeta?.tag ?? 'Kokoro voice'}</span>
              </span>
              <span className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70">
                Change
              </span>
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-white/50">
                <Gauge className="h-3.5 w-3.5 text-cyan-400" /> Speed
              </span>
              <span className="font-mono text-xs font-bold text-cyan-300">{speed.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={speed}
              disabled={isGenerating}
              onChange={(e) => {
                const next = Number(e.target.value);
                setSpeed(next);
                persist({ voiceStudioSpeed: next });
              }}
              className="focus-ring h-1 w-full accent-cyan-400 disabled:opacity-50"
            />
            <div className="mt-2 flex justify-between font-mono text-[10px] text-white/30">
              <span>0.5× slower</span>
              <button
                type="button"
                onClick={() => {
                  setSpeed(1);
                  persist({ voiceStudioSpeed: 1 });
                }}
                className="text-white/40 transition-colors hover:text-white"
              >
                reset
              </button>
              <span>2× faster</span>
            </div>
          </div>
        </section>

        {/* Generate */}
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={!canGenerate}
          className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3.5 text-sm font-bold text-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:from-white/10 disabled:to-white/10 disabled:text-white/40"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <AudioLines className="h-4 w-4" /> {take ? 'Regenerate audio' : 'Generate audio'}
            </>
          )}
        </button>

        {isGenerating && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-md">
            <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-400 to-violet-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="font-mono text-[11px] tracking-wide text-white/45">
              {progressLabel || 'Working…'}
            </p>
          </div>
        )}

        {error && !isGenerating && (
          <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Result */}
        {take && !isGenerating && (
          <section className="mt-6 rounded-2xl border border-cyan-400/25 bg-cyan-500/[0.06] p-5 backdrop-blur-md sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-cyan-200">
                <FileAudio className="h-3.5 w-3.5" /> Your narration
              </span>
              <span className="font-mono text-[11px] text-white/45">
                {formatDuration(take.duration)} · {VOICE_METADATA.find((v) => v.id === take.voice)?.name ?? take.voice}
                {' · '}
                {take.speed.toFixed(2)}× · {formatBytes(take.blob.size)} WAV
              </span>
            </div>

            <audio controls src={take.url} className="mb-5 w-full" />

            <div className="mb-4">
              <span className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-wider text-white/50">
                MP3 quality
              </span>
              <div className="flex flex-wrap gap-1.5">
                {BITRATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      setBitrate(rate);
                      persist({ voiceStudioMp3Bitrate: rate });
                    }}
                    disabled={isEncoding}
                    className={`rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                      bitrate === rate
                        ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-200'
                        : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {rate} kbps
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => void handleDownloadMp3()}
                disabled={isEncoding}
                className="focus-ring flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isEncoding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {encodeProgress > 0 ? `Encoding ${encodeProgress}%` : 'Encoding…'}
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" /> Download MP3
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadWav}
                disabled={isEncoding}
                className="focus-ring flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> WAV
              </button>

              {!isEncoding && !isMp3EncoderReady() && (
                <span className="text-[11px] text-white/35 sm:ml-1">
                  First MP3 downloads the ~32MB encoder — the WAV above is ready right now.
                </span>
              )}
            </div>
          </section>
        )}
      </main>

      <Footer />

      <VoiceAuditionModal
        isOpen={isVoicePickerOpen}
        onClose={() => setIsVoicePickerOpen(false)}
        selectedVoice={voice}
        onSelectVoice={(voiceId) => {
          setVoice(voiceId);
          persist({ voiceStudioVoice: voiceId });
        }}
      />

      <DownloadBlockedModal
        isOpen={isBlockedModalOpen}
        onClose={() => setIsBlockedModalOpen(false)}
        actionLabel="Generate Voice Audio"
      />

      {isSettingsOpen && (
        <GlobalSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentSettings={globalSettings}
          onSave={saveSettings}
          initialTab="tts"
        />
      )}

      <MobileWarningModal />
    </div>
  );
};
