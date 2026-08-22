import React, { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { NotificationContext, type AppNotification } from '../context/NotificationContext';
import { useBackgroundDownload } from '../context/BackgroundDownloadContext';
import { checkWebGPUSupport, initWebLLM, getDefaultWebLlmModel, webLlmEvents } from '../services/webLlmService';
import { initTTS, ttsEvents } from '../services/ttsService';
import { videoEvents } from '../services/BrowserVideoRenderer';
import { getFFmpeg } from '../services/ffmpegLoader';
import { loadGlobalSettings } from '../services/storage';
import { isPollinationsTokenExpired, startPollinationsOAuth } from '../services/pollinationsAuth';
import { WebGPUInstructionsModal } from './WebGPUInstructionsModal';
import { PollinationsInfoModal } from './shorts/PollinationsInfoModal';

interface AssetsCache {
  tts: boolean;
  ffmpeg: boolean;
  webllm: boolean;
}

interface WebGPUStatus {
  supported: boolean;
  hasF16: boolean;
  error?: string;
}

interface PollinationsStatus {
  hasKey: boolean;
  expired: boolean;
}

const readAssetsCache = (): AssetsCache =>
  JSON.parse(localStorage.getItem('resource_cache_status') || '{"tts":false,"ffmpeg":false,"webllm":false}');

/**
 * Owns app-wide system-status notifications (WebGPU, asset downloads, Pollinations
 * connection) and renders above the router so the bell/panel work from every route,
 * unlike App.tsx's equivalent checks which only run while MainApp ('/') is mounted.
 */
export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isBackgroundDownloadActive, startBackgroundDownloads, endBackgroundDownloads } = useBackgroundDownload();

  const [webgpu, setWebgpu] = useState<WebGPUStatus | null>(null);
  const [assetsCache, setAssetsCache] = useState<AssetsCache>(() => readAssetsCache());
  const [pollinations, setPollinations] = useState<PollinationsStatus | null>(null);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [isWebGPUModalOpen, setIsWebGPUModalOpen] = useState(false);
  const [isPollinationsInfoOpen, setIsPollinationsInfoOpen] = useState(false);

  useEffect(() => {
    checkWebGPUSupport().then(setWebgpu);
  }, []);

  const refresh = useCallback(() => {
    loadGlobalSettings().then((settings) => {
      setPollinations({
        hasKey: !!settings?.pollinationsApiKey,
        expired: isPollinationsTokenExpired(settings?.pollinationsTokenExpiresAt),
      });
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Writes through to the same 'resource_cache_status' key App.tsx maintains, so a
  // download completed from any route (not just '/') is recorded and clears the notification.
  const markCached = useCallback((key: keyof AssetsCache) => {
    const current = readAssetsCache();
    if (!current[key]) {
      current[key] = true;
      localStorage.setItem('resource_cache_status', JSON.stringify(current));
    }
    setAssetsCache(current);
  }, []);

  useEffect(() => {
    const handleTTSInit = () => markCached('tts');
    const handleVideoProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ status: string }>).detail;
      if (detail.status === 'FFmpeg ready') markCached('ffmpeg');
    };
    const handleWebLLMInit = () => markCached('webllm');

    ttsEvents.addEventListener('tts-init-complete', handleTTSInit);
    videoEvents.addEventListener('video-progress', handleVideoProgress);
    webLlmEvents.addEventListener('webllm-init-complete', handleWebLLMInit);

    return () => {
      ttsEvents.removeEventListener('tts-init-complete', handleTTSInit);
      videoEvents.removeEventListener('video-progress', handleVideoProgress);
      webLlmEvents.removeEventListener('webllm-init-complete', handleWebLLMInit);
    };
  }, [markCached]);

  const handleDownloadAssets = useCallback(async () => {
    if (isBackgroundDownloadActive) return;

    const cached = readAssetsCache();
    const queue = { tts: !cached.tts, ffmpeg: !cached.ffmpeg, webllm: !cached.webllm };
    if (!queue.tts && !queue.ffmpeg && !queue.webllm) return;

    startBackgroundDownloads(queue);
    try {
      // Downloads run one at a time (TTS -> FFmpeg -> WebLLM), matching App.tsx's setup flow.
      if (queue.tts) {
        await new Promise<void>((resolve, reject) => {
          const handleInitComplete = () => {
            ttsEvents.removeEventListener('tts-init-complete', handleInitComplete);
            resolve();
          };
          ttsEvents.addEventListener('tts-init-complete', handleInitComplete);
          try {
            initTTS();
          } catch (error) {
            ttsEvents.removeEventListener('tts-init-complete', handleInitComplete);
            reject(error);
          }
        });
      }

      if (queue.ffmpeg) {
        await getFFmpeg();
      }

      if (queue.webllm) {
        const webgpuStatus = await checkWebGPUSupport();
        if (webgpuStatus.supported) {
          // v1 simplification: unlike App.tsx's full setup flow, this always downloads the
          // device-appropriate default model and never writes useWebLLM/webLlmModel into
          // settings, so this passive notification action never silently opts the user
          // into the local-LLM feature.
          await initWebLLM(getDefaultWebLlmModel(webgpuStatus.hasF16), () => {});
        } else {
          setIsWebGPUModalOpen(true);
        }
      }
    } catch (error) {
      console.error('[Notifications] Failed to complete asset downloads:', error);
    } finally {
      endBackgroundDownloads();
    }
  }, [isBackgroundDownloadActive, startBackgroundDownloads, endBackgroundDownloads]);

  const notifications = useMemo<AppNotification[]>(() => {
    const list: AppNotification[] = [];

    if (webgpu && !webgpu.supported) {
      list.push({
        id: 'webgpu-unsupported',
        severity: 'error',
        title: 'WebGPU unavailable',
        message: webgpu.error || 'WebGPU is required for local AI features and is not available in this browser.',
        actionLabel: 'View Setup Help',
        onAction: () => setIsWebGPUModalOpen(true),
      });
    }

    if (!assetsCache.tts || !assetsCache.ffmpeg || !assetsCache.webllm) {
      const missing = [
        !assetsCache.tts && 'narration voices',
        !assetsCache.ffmpeg && 'the video renderer',
        !assetsCache.webllm && 'the local AI model',
      ].filter(Boolean).join(', ');
      list.push({
        id: 'assets-missing',
        severity: 'warning',
        title: 'Setup incomplete',
        message: `Some required assets haven't been downloaded yet: ${missing}. Download them now so rendering and local AI features work.`,
        actionLabel: 'Download Now',
        onAction: handleDownloadAssets,
      });
    }

    if (pollinations && (!pollinations.hasKey || pollinations.expired)) {
      list.push({
        id: 'pollinations-disconnected',
        severity: 'warning',
        title: pollinations.expired ? 'Pollinations connection expired' : 'Not connected to Pollinations',
        message: pollinations.expired
          ? 'Your Pollinations sign-in has expired. Reconnect to keep generating Shorts images and video.'
          : 'Connect your Pollinations account to generate images and video for Shorts.',
        actionLabel: pollinations.expired ? 'Reconnect' : 'Connect',
        onAction: () => void startPollinationsOAuth(window.location.pathname),
        learnMoreLabel: 'Learn more',
        onLearnMore: () => setIsPollinationsInfoOpen(true),
      });
    }

    return list;
  }, [webgpu, assetsCache, pollinations, handleDownloadAssets]);

  const hasUnread = useMemo(
    () => notifications.some((n) => !seenIds.has(n.id)),
    [notifications, seenIds],
  );

  const markAllSeen = useCallback(() => {
    setSeenIds(new Set(notifications.map((n) => n.id)));
  }, [notifications]);

  const value = useMemo(
    () => ({ notifications, hasUnread, markAllSeen, refresh }),
    [notifications, hasUnread, markAllSeen, refresh],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <WebGPUInstructionsModal isOpen={isWebGPUModalOpen} onClose={() => setIsWebGPUModalOpen(false)} />
      <PollinationsInfoModal
        isOpen={isPollinationsInfoOpen}
        onClose={() => setIsPollinationsInfoOpen(false)}
        onConnect={() => {
          setIsPollinationsInfoOpen(false);
          void startPollinationsOAuth(window.location.pathname);
        }}
      />
    </NotificationContext.Provider>
  );
};
