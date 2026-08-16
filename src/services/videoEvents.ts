/**
 * Shared progress bus for anything that renders or loads video tooling.
 *
 * This lives in its own module (rather than inside BrowserVideoRenderer) so the
 * FFmpeg loader, the slide renderer and the Shorts renderer can all publish to
 * the same channel without importing each other. BrowserVideoRenderer re-exports
 * these so existing `from './services/BrowserVideoRenderer'` imports keep working.
 */

export interface VideoProgressEventDetail {
  progress: number;
  status: string;
  file?: string;
}

export const videoEvents = new EventTarget();

export const emitVideoProgress = (detail: VideoProgressEventDetail): void => {
  videoEvents.dispatchEvent(new CustomEvent<VideoProgressEventDetail>('video-progress', { detail }));
};
