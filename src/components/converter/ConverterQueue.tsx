import React from 'react';
import { AlertTriangle, Check, Download, FileWarning, Loader2, Package, X } from 'lucide-react';

import { triggerBlobDownload } from '../../utils/downloadBlob';
import type { QueueItem } from './converterTypes';

interface ConverterQueueProps {
  items: QueueItem[];
  isRunning: boolean;
  isZipping: boolean;
  onRemove: (id: string) => void;
  onClear: () => void;
  onDownloadAll: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

/** Signed size delta, e.g. '-87%'. Null when the change is not worth reporting. */
const sizeDelta = (before: number, after: number): string | null => {
  if (before <= 0) return null;
  const change = Math.round(((after - before) / before) * 100);
  if (change === 0) return null;
  return change < 0 ? `${change}%` : `+${change}%`;
};

const StatusIcon: React.FC<{ item: QueueItem }> = ({ item }) => {
  switch (item.status) {
    case 'converting':
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-cyan-300" />;
    case 'done':
      return <Check className="h-4 w-4 shrink-0 text-emerald-400" />;
    case 'error':
      return <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />;
    default:
      return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" aria-hidden />;
  }
};

export const ConverterQueue: React.FC<ConverterQueueProps> = ({
  items,
  isRunning,
  isZipping,
  onRemove,
  onClear,
  onDownloadAll,
}) => {
  const done = items.filter((item) => item.status === 'done');
  const failed = items.filter((item) => item.status === 'error').length;

  return (
    <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-white/50">
          {done.length} of {items.length} converted{failed > 0 ? ` · ${failed} failed` : ''}
        </span>
        <button
          type="button"
          onClick={onClear}
          disabled={isRunning}
          className="focus-ring rounded-lg px-2 py-1 text-xs font-semibold text-white/45 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear all
        </button>
      </div>

      <div className="mb-2 grid grid-cols-2 gap-3 px-0.5">
        <span className="font-mono text-sm font-bold uppercase tracking-wider text-white/85">
          Uploaded files
        </span>
        <span className="font-mono text-sm font-bold uppercase tracking-wider text-white/85">
          Converted files
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const delta = item.output ? sizeDelta(item.file.size, item.output.blob.size) : null;
          return (
            <li
              key={item.id}
              className="grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-black/30 px-3.5 py-3"
            >
              {/* Left: the original, user-uploaded file. */}
              <div className="flex min-w-0 items-center gap-2">
                <StatusIcon item={item} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white/85">{item.file.name}</p>
                  <p className="text-xs font-semibold text-white/85">{formatBytes(item.file.size)}</p>
                </div>
              </div>

              {/* Right: what conversion produces. */}
              <div className="flex min-w-0 items-center justify-between gap-2">
                <div className="min-w-0">
                  {item.output ? (
                    <>
                      <p className="truncate text-sm font-medium text-white/85">{item.output.name}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="font-semibold text-white/85">{formatBytes(item.output.blob.size)}</span>
                        {delta && (
                          <span
                            className={
                              delta.startsWith('-')
                                ? 'font-semibold text-emerald-400'
                                : 'font-semibold text-amber-300'
                            }
                          >
                            {delta}
                          </span>
                        )}
                      </div>
                    </>
                  ) : item.status === 'converting' ? (
                    <>
                      <p className="text-sm font-medium text-white/50">Converting…</p>
                      {item.progress > 0 && (
                        <p className="text-xs text-cyan-300">{Math.round(item.progress * 100)}%</p>
                      )}
                    </>
                  ) : item.status === 'error' ? (
                    <p className="text-xs leading-relaxed text-red-400/90">{item.error}</p>
                  ) : (
                    <p className="text-xs text-white/40">Waiting</p>
                  )}
                  {item.note && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-300/90">
                      <FileWarning className="h-3.5 w-3.5 shrink-0" />
                      {item.note}
                    </p>
                  )}
                </div>

                {item.output && (
                  <button
                    type="button"
                    onClick={() => triggerBlobDownload(item.output!.blob, item.output!.name)}
                    aria-label={`Download ${item.output.name}`}
                    className="focus-ring shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  disabled={item.status === 'converting'}
                  aria-label={`Remove ${item.file.name}`}
                  className="focus-ring shrink-0 rounded-lg p-2 text-white/30 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {done.length > 1 && (
        <button
          type="button"
          onClick={onDownloadAll}
          disabled={isZipping}
          className="focus-ring mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isZipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
          {isZipping ? 'Building archive…' : `Download all ${done.length} (.zip)`}
        </button>
      )}
    </section>
  );
};
