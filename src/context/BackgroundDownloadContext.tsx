import { createContext, useContext } from 'react';

export interface DownloadQueue {
  tts: boolean;
  ffmpeg: boolean;
  webllm: boolean;
}

interface BackgroundDownloadContextType {
  isBackgroundDownloadActive: boolean;
  activeDownloads: DownloadQueue;
  startBackgroundDownloads: (queue: DownloadQueue) => void;
  endBackgroundDownloads: () => void;
}

export const BackgroundDownloadContext = createContext<BackgroundDownloadContextType | undefined>(undefined);

export const useBackgroundDownload = () => {
  const context = useContext(BackgroundDownloadContext);
  if (!context) {
    throw new Error('useBackgroundDownload must be used within a BackgroundDownloadProvider');
  }
  return context;
};
