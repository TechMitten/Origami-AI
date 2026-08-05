import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import { BackgroundDownloadToast } from './BackgroundDownloadToast';
import { BackgroundDownloadContext, type DownloadQueue } from '../context/BackgroundDownloadContext';

/**
 * Owns the background download state and renders the progress toast above the
 * router, so the toast survives navigation (e.g. opening /assistant while
 * resources are still downloading) instead of unmounting with the page.
 */
export const BackgroundDownloadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isBackgroundDownloadActive, setIsBackgroundDownloadActive] = useState(false);
  const [activeDownloads, setActiveDownloads] = useState<DownloadQueue>({ tts: false, ffmpeg: false, webllm: false });

  const startBackgroundDownloads = useCallback((queue: DownloadQueue) => {
    setActiveDownloads(queue);
    setIsBackgroundDownloadActive(true);
  }, []);

  const endBackgroundDownloads = useCallback(() => {
    setIsBackgroundDownloadActive(false);
  }, []);

  const value = useMemo(
    () => ({ isBackgroundDownloadActive, activeDownloads, startBackgroundDownloads, endBackgroundDownloads }),
    [isBackgroundDownloadActive, activeDownloads, startBackgroundDownloads, endBackgroundDownloads]
  );

  return (
    <BackgroundDownloadContext.Provider value={value}>
      {children}
      <BackgroundDownloadToast active={isBackgroundDownloadActive} queue={activeDownloads} />
    </BackgroundDownloadContext.Provider>
  );
};
