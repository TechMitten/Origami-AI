import { useState, useRef, useCallback, useEffect } from 'react';
import {
  addBrowserExtensionEventListener,
  armBrowserExtensionRecording,
  stopBrowserExtensionSession,
  type BrowserExtensionCaptureSource,
  type BrowserExtensionStartFailure,
  type BrowserExtensionSessionData,
} from '../services/browserExtensionBridge';

export interface CursorPoint {
  timeMs: number;
  x: number;
  y: number;
}

export interface InteractionPoint {
  timeMs: number;
  type: 'click' | 'keypress' | 'scroll';
  x: number;
  y: number;
}

export interface ScreenRecordResult {
  blob: Blob;
  cursorData: CursorPoint[];
  interactionData: InteractionPoint[];
}

interface ChromeDesktopTrackConstraints extends MediaTrackConstraints {
  mandatory?: {
    chromeMediaSource: 'tab';
    chromeMediaSourceId: string;
    maxWidth?: number;
    maxHeight?: number;
    maxFrameRate?: number;
  };
}

interface UseScreenRecorderOptions {
  onRecordingComplete?: (result: ScreenRecordResult) => void | Promise<void>;
  onRecordingError?: (error: Error) => void;
  onRecordingPending?: () => void;
  onExtensionUnavailable?: () => void | Promise<void>;
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function isExtensionUnavailableError(error: Error): boolean {
  return /Origami Chrome extension|extension bridge|bridge timed out|extension request failed/i.test(error.message);
}

export function useScreenRecorder(options: UseScreenRecorderOptions = {}) {
  const { onRecordingComplete, onRecordingError, onRecordingPending, onExtensionUnavailable } = options;
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceStreamsRef = useRef<MediaStream[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioMonitorContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const stopPromiseRef = useRef<Promise<ScreenRecordResult> | null>(null);
  const localInteractionCleanupRef = useRef<(() => void) | null>(null);
  
  // Cursor tracking
  const cursorDataRef = useRef<CursorPoint[]>([]);
  const interactionDataRef = useRef<InteractionPoint[]>([]);
  const startTimeRef = useRef<number>(0);
  const extensionSessionActiveRef = useRef(false);

  const stopExtensionSessionSafely = useCallback(async (): Promise<BrowserExtensionSessionData | null> => {
    if (!extensionSessionActiveRef.current) return null;
    extensionSessionActiveRef.current = false;
    try {
      return await stopBrowserExtensionSession();
    } catch (error) {
      console.warn('Origami extension session stop failed, falling back to local interaction data.', error);
      return null;
    }
  }, []);

  const cleanupCaptureResources = useCallback(() => {
    localInteractionCleanupRef.current?.();
    localInteractionCleanupRef.current = null;

    const seenTracks = new Set<MediaStreamTrack>();
    const streams = [
      streamRef.current,
      ...sourceStreamsRef.current,
    ].filter((stream): stream is MediaStream => Boolean(stream));

    streams.forEach((stream) => {
      stream.getTracks().forEach((track) => {
        if (seenTracks.has(track)) return;
        seenTracks.add(track);
        track.stop();
      });
    });

    sourceStreamsRef.current = [];
    streamRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close().catch((error) => {
        console.warn('Failed to close recording audio context cleanly.', error);
      });
      audioContextRef.current = null;
    }

    if (audioMonitorContextRef.current) {
      void audioMonitorContextRef.current.close().catch((error) => {
        console.warn('Failed to close recording monitor audio context cleanly.', error);
      });
      audioMonitorContextRef.current = null;
    }
  }, []);

  const attachLocalInteractionListeners = useCallback(() => {
    const isRecorderActive = () => mediaRecorderRef.current?.state === 'recording';

    const handleMouseMove = (e: MouseEvent) => {
      if (!isRecorderActive()) return;
      cursorDataRef.current.push({
        timeMs: performance.now() - startTimeRef.current,
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };

    const handleInteractionClick = (e: MouseEvent) => {
      if (!isRecorderActive()) return;
      interactionDataRef.current.push({
        timeMs: performance.now() - startTimeRef.current,
        type: 'click',
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    };

    const handleInteractionKey = () => {
      if (!isRecorderActive()) return;
      let x = 0.5;
      let y = 0.5;

      if (document.activeElement && document.activeElement.getBoundingClientRect) {
        const rect = document.activeElement.getBoundingClientRect();
        x = (rect.left + rect.width / 2) / window.innerWidth;
        y = (rect.top + rect.height / 2) / window.innerHeight;
      }

      interactionDataRef.current.push({
        timeMs: performance.now() - startTimeRef.current,
        type: 'keypress',
        x,
        y,
      });
    };

    let lastScrollTime = 0;
    const handleInteractionWheel = () => {
      if (!isRecorderActive()) return;
      const now = performance.now();
      if (now - lastScrollTime < 250) return;
      lastScrollTime = now;

      interactionDataRef.current.push({
        timeMs: now - startTimeRef.current,
        type: 'scroll',
        x: 0.5,
        y: 0.5,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleInteractionClick, { capture: true });
    window.addEventListener('keypress', handleInteractionKey);
    window.addEventListener('wheel', handleInteractionWheel, { capture: true, passive: true });

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleInteractionClick, { capture: true });
      window.removeEventListener('keypress', handleInteractionKey);
      window.removeEventListener('wheel', handleInteractionWheel, { capture: true } as EventListenerOptions);
    };
  }, []);

  const mixWithMicrophone = useCallback(async (displayStream: MediaStream) => {
    const sourceStreams = [displayStream];

    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sourceStreams.push(micStream);

      const audioTracks = [...displayStream.getAudioTracks(), ...micStream.getAudioTracks()];
      if (audioTracks.length === 0) {
        return { finalStream: displayStream, sourceStreams, audioContext: null as AudioContext | null };
      }

      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();

      audioTracks.forEach((track) => {
        const sourceNode = audioContext.createMediaStreamSource(new MediaStream([track]));
        sourceNode.connect(destination);
      });

      const finalStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);

      return { finalStream, sourceStreams, audioContext };
    } catch (error) {
      console.warn('Microphone not available for mixing, using display audio only.', error);
      return { finalStream: displayStream, sourceStreams, audioContext: null as AudioContext | null };
    }
  }, []);

  const preserveCapturedTabAudioPlayback = useCallback((displayStream: MediaStream) => {
    if (displayStream.getAudioTracks().length === 0) return;

    try {
      const audioContext = new AudioContext();
      const sourceNode = audioContext.createMediaStreamSource(displayStream);
      sourceNode.connect(audioContext.destination);
      audioMonitorContextRef.current = audioContext;
    } catch (error) {
      console.warn('Failed to preserve captured tab audio playback.', error);
    }
  }, []);

  const createDisplayStreamFromExtension = useCallback(async (captureSource: BrowserExtensionCaptureSource): Promise<MediaStream> => {
    const videoConstraints: ChromeDesktopTrackConstraints = {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: captureSource.streamId,
        maxWidth: 1920,
        maxHeight: 1080,
        maxFrameRate: 60,
      },
    };

    const audioConstraints: ChromeDesktopTrackConstraints = {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: captureSource.streamId,
      },
    };

    return navigator.mediaDevices.getUserMedia({
      video: videoConstraints as MediaTrackConstraints,
      audio: audioConstraints as MediaTrackConstraints,
    });
  }, []);

  const waitForExtensionCaptureSource = useCallback((timeoutMs = 60000): Promise<BrowserExtensionCaptureSource> => {
    return new Promise((resolve, reject) => {
      const cleanupCallbacks: Array<() => void> = [];
      let settled = false;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        cleanupCallbacks.forEach((callback) => callback());
      };

      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for the Origami extension to start tab capture.'));
      }, timeoutMs);

      cleanupCallbacks.push(() => window.clearTimeout(timeoutId));
      cleanupCallbacks.push(
        addBrowserExtensionEventListener('recording-source-ready', (payload) => {
          cleanup();
          resolve(payload);
        })
      );
      cleanupCallbacks.push(
        addBrowserExtensionEventListener('recording-start-failed', (payload: BrowserExtensionStartFailure) => {
          cleanup();
          reject(new Error(payload?.message || 'Origami extension failed to start tab capture.'));
        })
      );
    });
  }, []);

  const stopRecording = useCallback((): Promise<ScreenRecordResult> => {
    if (stopPromiseRef.current) {
      return stopPromiseRef.current;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return Promise.reject(new Error('Recorder is not active'));
    }

    const stopPromise = new Promise<ScreenRecordResult>((resolve, reject) => {
      const handleStop = async () => {
        try {
          setIsRecording(false);
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          const extensionData = await stopExtensionSessionSafely();
          const resolvedCursorData = extensionData?.cursorData?.length
            ? extensionData.cursorData
            : [...cursorDataRef.current];
          const resolvedInteractionData = extensionData?.interactionData?.length
            ? extensionData.interactionData
            : [...interactionDataRef.current];

          cleanupCaptureResources();
          mediaRecorderRef.current = null;
          chunksRef.current = [];

          const result = {
            blob,
            cursorData: resolvedCursorData,
            interactionData: resolvedInteractionData,
          };

          await onRecordingComplete?.(result);
          resolve(result);
        } catch (error) {
          cleanupCaptureResources();
          mediaRecorderRef.current = null;
          reject(normalizeError(error));
        }
      };

      recorder.addEventListener('stop', handleStop, { once: true });

      try {
        recorder.stop();
      } catch (error) {
        reject(normalizeError(error));
      }
    });

    stopPromiseRef.current = stopPromise.finally(() => {
      stopPromiseRef.current = null;
    });

    return stopPromiseRef.current;
  }, [cleanupCaptureResources, onRecordingComplete, stopExtensionSessionSafely]);

  const finalizeExternalStop = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') {
      return;
    }

    try {
      await stopRecording();
    } catch (error) {
      onRecordingError?.(normalizeError(error));
    }
  }, [onRecordingError, stopRecording]);

  useEffect(() => {
    return addBrowserExtensionEventListener('stop-recording-requested', () => {
      void finalizeExternalStop();
    });
  }, [finalizeExternalStop]);

  useEffect(() => {
    return () => {
      cleanupCaptureResources();
      void stopExtensionSessionSafely();
    };
  }, [cleanupCaptureResources, stopExtensionSessionSafely]);

  const startRecording = useCallback(async (): Promise<void> => {
    try {
      cleanupCaptureResources();
      chunksRef.current = [];
      cursorDataRef.current = [];
      interactionDataRef.current = [];
      startTimeRef.current = performance.now();

      let displayStream: MediaStream | null = null;

      try {
        await armBrowserExtensionRecording();
        extensionSessionActiveRef.current = true;
        onRecordingPending?.();
        const captureSource = await waitForExtensionCaptureSource();
        displayStream = await createDisplayStreamFromExtension(captureSource);
      } catch (error) {
        const normalizedError = normalizeError(error);
        if (!isExtensionUnavailableError(normalizedError)) {
          throw normalizedError;
        }

        console.info('Origami Chrome extension not available.', normalizedError);

        // Trigger the extension unavailable callback instead of falling back
        await onExtensionUnavailable?.();

        // Throw an error to stop the recording process
        throw new Error('Browser extension not available. Please install the Origami extension to enable screen recording.');
      }

      if (extensionSessionActiveRef.current) {
        preserveCapturedTabAudioPlayback(displayStream);
      }

      const { finalStream, sourceStreams, audioContext } = await mixWithMicrophone(displayStream);
      streamRef.current = finalStream;
      sourceStreamsRef.current = sourceStreams;
      audioContextRef.current = audioContext;

      const mediaRecorder = new MediaRecorder(finalStream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      finalStream.getVideoTracks()[0].onended = () => {
        void finalizeExternalStop();
      };

      localInteractionCleanupRef.current = attachLocalInteractionListeners();
      mediaRecorder.onstop = () => {
        localInteractionCleanupRef.current?.();
        localInteractionCleanupRef.current = null;
      };

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (err) {
      setIsRecording(false);
      mediaRecorderRef.current = null;
      await stopExtensionSessionSafely();
      cleanupCaptureResources();
      console.error('Failed to start recording:', err);
      throw normalizeError(err);
    }
  }, [
    attachLocalInteractionListeners,
    cleanupCaptureResources,
    createDisplayStreamFromExtension,
    finalizeExternalStop,
    mixWithMicrophone,
    onRecordingPending,
    preserveCapturedTabAudioPlayback,
    stopExtensionSessionSafely,
    waitForExtensionCaptureSource,
  ]);

  return {
    isRecording,
    startRecording,
    stopRecording
  };
}
