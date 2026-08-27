export type ConverterKind = 'image' | 'audio' | 'compress';

export type QueueStatus = 'queued' | 'converting' | 'done' | 'error';

export interface QueueOutput {
  blob: Blob;
  /** Object URL for the preview/download link. Revoked when the item goes away. */
  url: string;
  name: string;
}

export interface QueueItem {
  id: string;
  file: File;
  kind: ConverterKind;
  status: QueueStatus;
  /** 0..1. Only meaningful while `status` is 'converting'. */
  progress: number;
  output?: QueueOutput;
  error?: string;
  /** Non-fatal warning, e.g. an animation that was flattened to one frame. */
  note?: string;
}
