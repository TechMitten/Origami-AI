import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { FileCog, Image as ImageIcon, Loader2, Music, Palette, Settings2, ShieldCheck, Shrink, StopCircle, Trash2 } from 'lucide-react';

import backgroundImage from '../assets/images/background.jpg';
import { Footer } from '../components/Footer';
import { GlobalSettingsModal } from '../components/GlobalSettingsModal';
import { MobileWarningModal } from '../components/MobileWarningModal';
import { PageHeader } from '../components/PageHeader';
import { DownloadBlockedModal } from '../components/DownloadBlockedModal';
import { ConverterDropzone } from '../components/converter/ConverterDropzone';
import { ConverterQueue } from '../components/converter/ConverterQueue';
import { TargetPicker, type PickerOption } from '../components/converter/TargetPicker';
import type { ConverterKind, QueueItem } from '../components/converter/converterTypes';
import { useBackgroundDownload } from '../context/BackgroundDownloadContext';
import { useModal } from '../context/ModalContext';
import { usePageMeta } from '../hooks/usePageMeta';
import {
  AUDIO_BITRATES,
  AUDIO_TARGETS,
  convertAudio,
  ensureAudioEngine,
  isAudioEncoderReady,
  looksLikeAudioSource,
  outputFilename,
} from '../services/audioConvertService';
import {
  convertImage,
  getSupportedImageTargets,
  looksLikeImage,
} from '../services/imageConvertService';
import { compressFile, isCompressable } from '../services/compressService';
import type { GlobalSettings } from '../services/storage';
import { loadGlobalSettings, saveGlobalSettings } from '../services/storage';
import { triggerBlobDownload } from '../utils/downloadBlob';

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

/** Enough to be useful in bulk without letting the tab run itself out of memory. */
const MAX_QUEUE = 40;
const MAX_FILE_BYTES = 300 * 1024 * 1024;
/** Where the "compress" path starts, so a same-type conversion actually shrinks. */
const COMPRESS_QUALITY = 0.6;

const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'Something went wrong.';

const makeId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const ConvertStudioPage: React.FC = () => {
  usePageMeta({
    title: 'Convert Studio — Origami AI',
    description:
      'Convert images and audio between formats right in your browser, or drop a file on the Compress tab to shrink it in place. Nothing is uploaded.',
    path: '/convert',
  });

  const { isBackgroundDownloadActive } = useBackgroundDownload();
  const { showAlert, showConfirm } = useModal();

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBlockedModalOpen, setIsBlockedModalOpen] = useState(false);

  const [tab, setTab] = useState<ConverterKind>('image');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isLoadingEngine, setIsLoadingEngine] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Encoder support varies per browser, so the format chips come from a probe
  // rather than from the full list.
  const imageTargets = useMemo(() => getSupportedImageTargets(), []);

  const [imageTargetId, setImageTargetId] = useState<string>('webp');
  const [imageQuality, setImageQuality] = useState(0.82);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [audioTargetId, setAudioTargetId] = useState<string>('mp3');
  const [bitrate, setBitrate] = useState<number>(192);

  const cancelRef = useRef(false);
  // Kept in a ref so the unmount cleanup always sees the live URLs.
  const itemsRef = useRef<QueueItem[]>([]);
  itemsRef.current = items;

  const imageTarget = imageTargets.find((t) => t.id === imageTargetId) ?? imageTargets[0];
  const audioTarget = AUDIO_TARGETS.find((t) => t.id === audioTargetId) ?? AUDIO_TARGETS[0];
  const activeTarget = tab === 'image' ? imageTarget : audioTarget;

  // The queue holds both kinds; each tab only shows and acts on its own.
  const visibleItems = items.filter((item) => item.kind === tab);
  // Re-running picks failures back up, so a transient error is retryable.
  const pending = visibleItems.filter((item) => item.status === 'queued' || item.status === 'error');
  // Audio (and video, and anything in the Compress tab that is not an image) is
  // re-encoded with FFmpeg, so it needs the ~32MB wasm core.
  const enginePending = pending.some((item) => !looksLikeImage(item.file));

  // --- load / persist ---------------------------------------------------------

  useEffect(() => {
    let mounted = true;

    (async () => {
      const settings = await loadGlobalSettings();
      if (!mounted) return;

      const merged = { ...DEFAULT_GLOBAL_SETTINGS, ...(settings ?? {}) };
      setGlobalSettings(merged);

      if (merged.converterImageTarget && getSupportedImageTargets().some((t) => t.id === merged.converterImageTarget)) {
        setImageTargetId(merged.converterImageTarget);
      }
      if (typeof merged.converterImageQuality === 'number') setImageQuality(merged.converterImageQuality);
      if (merged.converterAudioTarget && AUDIO_TARGETS.some((t) => t.id === merged.converterAudioTarget)) {
        setAudioTargetId(merged.converterAudioTarget);
      }
      if (typeof merged.converterAudioBitrate === 'number') setBitrate(merged.converterAudioBitrate);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // Release every output URL when the page goes away.
  useEffect(() => {
    return () => {
      cancelRef.current = true;
      for (const item of itemsRef.current) {
        if (item.output) URL.revokeObjectURL(item.output.url);
      }
    };
  }, []);

  const persist = useCallback((patch: Partial<GlobalSettings>) => {
    setGlobalSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveGlobalSettings(next).catch((e) => console.warn('[ConvertStudio] Failed to persist settings:', e));
      return next;
    });
  }, []);

  const saveSettings = useCallback(async (next: GlobalSettings) => {
    setGlobalSettings(next);
    await saveGlobalSettings(next);
  }, []);

  // --- queue management -------------------------------------------------------

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const handleFiles = useCallback(
    (files: File[], rejectedCount: number) => {
      setError(null);

      const matches = tab === 'image' ? looksLikeImage : tab === 'audio' ? looksLikeAudioSource : isCompressable;
      const skipped: string[] = [];

      const accepted = files.filter((file) => {
        if (!matches(file)) return false;
        if (file.size > MAX_FILE_BYTES) {
          skipped.push(`${file.name} is over 300 MB`);
          return false;
        }
        return true;
      });

      const wrongKind = files.length - accepted.length - skipped.length + rejectedCount;

      // itemsRef mirrors the committed state, so the room check can happen out
      // here and keep the setItems updater free of side effects.
      const room = Math.max(0, MAX_QUEUE - itemsRef.current.length);
      const added = accepted.slice(0, room).map<QueueItem>((file) => ({
        id: makeId(),
        file,
        kind: tab,
        status: 'queued',
        progress: 0,
      }));

      const messages: string[] = [];
      if (wrongKind > 0) {
        const hint =
          tab === 'compress'
            ? 'only image and audio files are supported here.'
            : `switch to the ${tab === 'image' ? 'Audio' : 'Image'} tab for those.`;
        messages.push(`${wrongKind} file${wrongKind === 1 ? '' : 's'} ignored — ${hint}`);
      }
      if (skipped.length > 0) messages.push(`Skipped: ${skipped.join(', ')}.`);
      if (accepted.length > room) {
        messages.push(`The queue holds ${MAX_QUEUE} files at a time, so ${accepted.length - room} were left out.`);
      }
      setNotice(messages.length > 0 ? messages.join(' ') : null);

      if (added.length > 0) setItems((prev) => [...prev, ...added.slice(0, MAX_QUEUE - prev.length)]);
    },
    [tab],
  );

  const handleRemove = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.output) URL.revokeObjectURL(target.output.url);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const handleClear = useCallback(() => {
    setItems((prev) => {
      for (const item of prev) {
        if (item.kind === tab && item.output) URL.revokeObjectURL(item.output.url);
      }
      return prev.filter((item) => item.kind !== tab);
    });
    setNotice(null);
    setError(null);
  }, [tab]);

  const handleStop = useCallback(() => {
    cancelRef.current = true;
    setIsStopping(true);
    setNotice('Stopping after the current file — anything already converted is still listed below.');
  }, []);

  const handleTabChange = useCallback(
    (next: ConverterKind) => {
      if (isRunning || next === tab) return;
      setTab(next);
      setNotice(null);
      setError(null);
    },
    [isRunning, tab],
  );

  // --- conversion -------------------------------------------------------------

  const handleConvert = useCallback(async () => {
    if (isRunning || pending.length === 0) return;

    // Audio needs the ~32MB wasm core; a model download in flight would contend
    // for bandwidth and stall it. Images convert on the canvas with no download
    // at all, so they are never blocked.
    if (enginePending && isBackgroundDownloadActive) {
      setIsBlockedModalOpen(true);
      return;
    }

    cancelRef.current = false;
    setIsStopping(false);
    setIsRunning(true);
    setError(null);
    setNotice(null);

    try {
      // Load the core once, up front. Letting the first file trigger it would
      // mean a failed download is retried for every file in the batch.
      if (enginePending && !isAudioEncoderReady()) {
        setIsLoadingEngine(true);
        await ensureAudioEngine();
        setIsLoadingEngine(false);
      }

      // Strictly serial: FFmpeg is a single shared worker, and running canvas
      // encodes in parallel just fights the main thread for the same cycles.
      let toConvert = pending;
      const compressItemIds = new Set<string>();
      if (tab === 'image' && imageTarget) {
        const targetExt = imageTarget.extension.toLowerCase();
        const sameType = pending.filter(
          (item) =>
            item.kind === 'image' &&
            (item.file.name.includes('.')
              ? `.${item.file.name.split('.').pop()!.toLowerCase()}`
              : '') === targetExt,
        );
        if (sameType.length > 0) {
          const srcName = sameType[0].file.name;
          const srcLabel = srcName.includes('.')
            ? srcName.slice(srcName.lastIndexOf('.') + 1).toUpperCase()
            : imageTarget.label;
          const proceed = await showConfirm(
            `You are trying to convert a ${srcLabel} into a ${imageTarget.label}. Would you like to compress the image to make the file size smaller?`,
            { title: 'Same file type', confirmText: 'Yes', cancelText: 'Cancel', type: 'confirm' },
          );
          if (proceed) {
            for (const item of sameType) compressItemIds.add(item.id);
          } else {
            toConvert = pending.filter((item) => !sameType.includes(item));
            for (const item of sameType) {
              updateItem(item.id, {
                note: 'Not converted — converting a file to its own format would not change anything. Pick a different output format, or let it be compressed by choosing Yes.',
              });
            }
          }
        }
      }

      for (const queued of toConvert) {
        if (cancelRef.current) break;

        if (queued.output) URL.revokeObjectURL(queued.output.url);
        updateItem(queued.id, {
          status: 'converting',
          progress: 0,
          output: undefined,
          error: undefined,
          note: undefined,
        });

        try {
          if (queued.kind === 'image') {
            if (!imageTarget) throw new Error('Your browser exposes no usable image encoder.');
            const compress = compressItemIds.has(queued.id);
            let quality = compress ? Math.min(imageQuality, COMPRESS_QUALITY) : imageQuality;
            let result = await convertImage(queued.file, imageTarget, {
              quality,
              backgroundColor,
            });
            // The whole point of "compress" is a smaller file. For lossy formats
            // the old 0.82 default could come out bigger than the source, so keep
            // lowering the quality until the output is actually under the original
            // size rather than silently handing back a re-encoded bigger file.
            let compressTargetMet = !compress;
            if (compress && imageTarget.lossy) {
              while (result.blob.size >= queued.file.size && quality > 0.05) {
                quality = Math.max(0.05, quality - 0.1);
                result = await convertImage(queued.file, imageTarget, {
                  quality,
                  backgroundColor,
                });
              }
              compressTargetMet = result.blob.size < queued.file.size;
            } else if (compress) {
              // Lossless (PNG): quality is ignored by the encoder, so a re-encode
              // can't be relied on to shrink; report truthfully if it did not.
              compressTargetMet = result.blob.size < queued.file.size;
            }
            const name = outputFilename(queued.file.name, imageTarget.extension);
            const notes: string[] = [];
            if (result.truncatedAnimation) notes.push('Animated source — only the first frame was converted.');
            if (compress && !compressTargetMet) {
              notes.push(
                imageTarget.lossy
                  ? 'Could not make this smaller without losing more quality — it is already too compressed to shrink further.'
                  : 'This image is already lossless, so converting it to its own format cannot shrink the file.',
              );
            }
            updateItem(queued.id, {
              status: 'done',
              progress: 1,
              output: { blob: result.blob, url: URL.createObjectURL(result.blob), name },
              note: notes.length > 0 ? notes.join(' ') : undefined,
            });
          } else if (queued.kind === 'audio') {
            const blob = await convertAudio(queued.file, audioTarget, {
              bitrateKbps: bitrate,
              onProgress: (p) => updateItem(queued.id, { progress: p }),
            });
            const name = outputFilename(queued.file.name, audioTarget.extension);
            updateItem(queued.id, {
              status: 'done',
              progress: 1,
              output: { blob, url: URL.createObjectURL(blob), name },
            });
          } else {
            const { blob, name, note } = await compressFile(queued.file, {
              backgroundColor,
              onProgress: (p) => updateItem(queued.id, { progress: p }),
            });
            updateItem(queued.id, {
              status: 'done',
              progress: 1,
              output: { blob, url: URL.createObjectURL(blob), name },
              note,
            });
          }
        } catch (e) {
          // One bad file should not take the rest of the batch down with it.
          console.error('[ConvertStudio] Conversion failed:', e);
          updateItem(queued.id, { status: 'error', progress: 0, error: errorMessage(e) });
        }
      }
    } catch (e) {
      // Only a failure to obtain the engine itself lands here — the per-file
      // catch above keeps one bad file from stopping the batch.
      console.error('[ConvertStudio] Conversion run aborted:', e);
      setError(
        `${errorMessage(e)}\n\nThe conversion engine could not be loaded, so nothing was converted. Check your connection and try again.`,
      );
    } finally {
      setIsLoadingEngine(false);
      setIsRunning(false);
      setIsStopping(false);
    }
  }, [
    audioTarget,
    backgroundColor,
    bitrate,
    imageQuality,
    imageTarget,
    isBackgroundDownloadActive,
    isRunning,
    pending,
    tab,
    updateItem,
  ]);

  const handleDownloadAll = useCallback(async () => {
    const done = itemsRef.current.filter((item) => item.kind === tab && item.output);
    if (done.length === 0) return;

    setIsZipping(true);
    try {
      const zip = new JSZip();

      const seen = new Map<string, number>();
      for (const item of done) {
        const name = item.output!.name;
        const count = seen.get(name) ?? 0;
        seen.set(name, count + 1);

        const dot = name.lastIndexOf('.');
        const unique =
          count === 0
            ? name
            : dot > 0
              ? `${name.slice(0, dot)}-${count}${name.slice(dot)}`
              : `${name}-${count}`;
        zip.file(unique, item.output!.blob);
      }

      // STORE, not DEFLATE: WebP, MP3 and AAC are already compressed, so
      // deflating them burns seconds to save roughly nothing.
      const archive = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      triggerBlobDownload(archive, `origami-converted-${Date.now()}.zip`);
    } catch (e) {
      console.error('[ConvertStudio] Failed to build the archive:', e);
      await showAlert(
        `${errorMessage(e)}\n\nYou can still download each file individually from the list.`,
        { title: 'Could not build the ZIP', type: 'error' },
      );
    } finally {
      setIsZipping(false);
    }
  }, [showAlert, tab]);

  // --- render -----------------------------------------------------------------

  const formatOptions: PickerOption[] =
    tab === 'image'
      ? imageTargets.map((t) => ({ id: t.id, label: t.label }))
      : AUDIO_TARGETS.map((t) => ({ id: t.id, label: t.label }));

  const bitrateOptions: PickerOption[] = AUDIO_BITRATES.map((rate) => ({
    id: String(rate),
    label: `${rate} kbps`,
    // Opus tops out well below 320; offering it would only mislead.
    disabled: audioTarget.id === 'opus' && rate > 256,
  }));

  const showBitrate = tab === 'audio' && audioTarget.lossy;
  const showQuality = tab === 'image' && !!imageTarget?.lossy;
  const showBackground = tab === 'image' && !!imageTarget?.opaque;

  return (
    <div className="isolate flex min-h-screen flex-col bg-[#0a0a0b] pt-8 text-white">
      <img
        src={backgroundImage}
        alt=""
        className="fixed inset-0 -z-50 h-lvh w-full scale-105 object-cover opacity-40 blur-[2px] brightness-50"
      />
      <div className="fixed inset-0 -z-40 h-lvh w-full bg-[#0a0a0b]/40" />

      <PageHeader
        title="Convert Studio"
        onSettings={() => setIsSettingsOpen(true)}
        showHelp={false}
        actionMenuContent={(closeMenu) => (
          <button
            onClick={() => {
              handleClear();
              closeMenu();
            }}
            disabled={isRunning || visibleItems.length === 0}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> Clear queue
          </button>
        )}
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pb-20 sm:px-8">
        <div className="mb-8">
          <span className="mb-3 block font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">
            File conversion
          </span>
          <h1 className="font-display mb-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Convert Studio
          </h1>
          <p className="max-w-xl text-sm text-white/55 sm:text-base">
            Turn PNGs and JPGs into WebP, or any common audio format into another. Everything runs in this tab —
            your files are never uploaded anywhere.
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex gap-2" role="tablist" aria-label="Conversion type">
          {(['image', 'audio', 'compress'] as const).map((kind) => {
            const isActive = tab === kind;
            const Icon = kind === 'image' ? ImageIcon : kind === 'audio' ? Music : Shrink;
            return (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabChange(kind)}
                disabled={isRunning}
                className={[
                  'focus-ring flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold transition-colors',
                  isActive
                    ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-200'
                    : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
                  isRunning && !isActive ? 'cursor-not-allowed opacity-40' : '',
                ].join(' ')}
              >
                <Icon className="h-4 w-4" />
                {kind === 'image' ? 'Images' : kind === 'audio' ? 'Audio' : 'Compress'}
              </button>
            );
          })}
        </div>

        <section className="mb-5">
          <ConverterDropzone kind={tab} disabled={isRunning} onFiles={handleFiles} />
        </section>

        {notice && (
          <p className="mb-5 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200/90">
            {notice}
          </p>
        )}

        {/* Output settings */}
        {tab !== 'compress' && (
          <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <Settings2 className="h-3.5 w-3.5 text-cyan-400" />
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white/50">
              Convert to
            </span>
          </div>

          <TargetPicker
            ariaLabel="Output format"
            options={formatOptions}
            value={tab === 'image' ? imageTargetId : audioTargetId}
            disabled={isRunning}
            onChange={(id) => {
              if (tab === 'image') {
                setImageTargetId(id);
                persist({ converterImageTarget: id });
              } else {
                setAudioTargetId(id);
                const patch: Partial<GlobalSettings> = { converterAudioTarget: id };
                if (id === 'opus' && bitrate > 256) {
                  setBitrate(256);
                  patch.converterAudioBitrate = 256;
                }
                persist(patch);
              }
            }}
          />

          {activeTarget && <p className="mt-3 text-xs leading-relaxed text-white/45">{activeTarget.blurb}</p>}

          {showQuality && (
            <div className="mt-5 border-t border-white/5 pt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white/50">
                  Quality
                </span>
                <span className="font-mono text-xs text-cyan-300">{Math.round(imageQuality * 100)}</span>
              </div>
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={Math.round(imageQuality * 100)}
                disabled={isRunning}
                onChange={(e) => {
                  const next = Number(e.target.value) / 100;
                  setImageQuality(next);
                  persist({ converterImageQuality: next });
                }}
                aria-label="Output quality"
                className="focus-ring w-full accent-cyan-400 disabled:opacity-40"
              />
              <p className="mt-2 text-xs text-white/40">
                Around 80 is the sweet spot — visually identical to most eyes at a fraction of the size.
              </p>
            </div>
          )}

          {showBackground && (
            <div className="mt-5 border-t border-white/5 pt-5">
              <div className="mb-2 flex items-center gap-2">
                <Palette className="h-3.5 w-3.5 text-cyan-400" />
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white/50">
                  Background
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={backgroundColor}
                  disabled={isRunning}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  aria-label="Background colour for transparent areas"
                  className="focus-ring h-9 w-14 cursor-pointer rounded-lg border border-white/10 bg-black/40 disabled:opacity-40"
                />
                <p className="text-xs text-white/45">
                  {activeTarget?.label} has no transparency, so transparent areas are filled with this colour.
                </p>
              </div>
            </div>
          )}

          {showBitrate && (
            <div className="mt-5 border-t border-white/5 pt-5">
              <div className="mb-2 flex items-center gap-2">
                <Music className="h-3.5 w-3.5 text-cyan-400" />
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white/50">
                  Bitrate
                </span>
              </div>
              <TargetPicker
                ariaLabel="Output bitrate"
                options={bitrateOptions}
                value={String(bitrate)}
                disabled={isRunning}
                onChange={(id) => {
                  const next = Number(id);
                  setBitrate(next);
                  persist({ converterAudioBitrate: next });
                }}
              />
            </div>
          )}
        </section>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleConvert}
            disabled={isRunning || pending.length === 0}
            className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3.5 text-sm font-bold text-black transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:from-white/10 disabled:to-white/10 disabled:text-white/40"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCog className="h-4 w-4" />}
            {isRunning
              ? tab === 'compress'
                ? 'Compressing…'
                : 'Converting…'
              : pending.length === 0
                ? tab === 'compress'
                  ? 'Add files to compress'
                  : 'Add files to convert'
                : tab === 'compress'
                  ? `Compress ${pending.length} file${pending.length === 1 ? '' : 's'}`
                  : `Convert ${pending.length} file${pending.length === 1 ? '' : 's'} to ${activeTarget?.label ?? ''}`}
          </button>

          {isRunning && (
            <button
              type="button"
              onClick={handleStop}
              disabled={isStopping}
              className="focus-ring flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <StopCircle className="h-4 w-4" /> {isStopping ? 'Stopping…' : 'Stop'}
            </button>
          )}
        </div>

        {/* The loader only reports start and finish, so this stays indeterminate. */}
        {isLoadingEngine && (
          <p className="mt-3 flex items-center justify-center gap-2 text-center text-xs text-cyan-200/80">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Downloading the conversion engine — about 32 MB, one time only.
          </p>
        )}
        {!isRunning && enginePending && !isAudioEncoderReady() && (
          <p className="mt-3 text-center text-xs text-white/35">
            The first audio conversion downloads a ~32 MB engine. Image conversions never need it.
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-center text-xs text-red-400">
            {error}
          </p>
        )}

        {visibleItems.length > 0 && (
          <div className="mt-6">
            <ConverterQueue
              items={visibleItems}
              isRunning={isRunning}
              isZipping={isZipping}
              onRemove={handleRemove}
              onClear={handleClear}
              onDownloadAll={handleDownloadAll}
            />
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-white/30">
          <ShieldCheck className="h-3.5 w-3.5" />
          Converted on your device. Images also come out with their EXIF and GPS data stripped.
        </p>
      </main>

      <Footer />

      <DownloadBlockedModal
        isOpen={isBlockedModalOpen}
        onClose={() => setIsBlockedModalOpen(false)}
        actionLabel={tab === 'compress' ? 'Compress Files' : 'Convert Audio'}
      />

      {isSettingsOpen && (
        <GlobalSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentSettings={globalSettings}
          onSave={saveSettings}
        />
      )}

      <MobileWarningModal />
    </div>
  );
};
