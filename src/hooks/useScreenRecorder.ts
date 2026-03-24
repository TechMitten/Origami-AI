import { useState, useRef, useCallback } from 'react';
import {
  startBrowserExtensionSession,
  stopBrowserExtensionSession,
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

export function useScreenRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  
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

  const startRecording = useCallback(async (): Promise<void> => {
    try {
      const displayMediaOptions: DisplayMediaStreamOptions & {
        preferCurrentTab?: boolean;
        selfBrowserSurface?: 'include' | 'exclude';
        surfaceSwitching?: 'include' | 'exclude';
        monitorTypeSurfaces?: 'include' | 'exclude';
      } = {
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: true,
        preferCurrentTab: false,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'include',
        monitorTypeSurfaces: 'include',
      };

      const displayStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

      // Try to get microphone audio as well to mix
      let finalStream = displayStream;
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioTracks = [...displayStream.getAudioTracks(), ...micStream.getAudioTracks()];
        const audioContext = new AudioContext();
        const dest = audioContext.createMediaStreamDestination();
        
        audioTracks.forEach(track => {
          const sourceNode = audioContext.createMediaStreamSource(new MediaStream([track]));
          sourceNode.connect(dest);
        });
        
        const mixedTracks = [
          ...displayStream.getVideoTracks(),
          ...dest.stream.getAudioTracks()
        ];
        finalStream = new MediaStream(mixedTracks);
      } catch (e) {
        console.warn('Microphone not available for mixing, using display audio only.', e);
      }

      streamRef.current = finalStream;
      
      const mediaRecorder = new MediaRecorder(finalStream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      cursorDataRef.current = [];
      interactionDataRef.current = [];
      startTimeRef.current = performance.now();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      // Stop recording if the user clicks the browser's "Stop Sharing" button
      finalStream.getVideoTracks()[0].onended = () => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      };

      const handleMouseMove = (e: MouseEvent) => {
        if (!isRecording && mediaRecorderRef.current?.state !== 'recording') return;
        cursorDataRef.current.push({
          timeMs: performance.now() - startTimeRef.current,
          x: e.clientX / window.innerWidth,
          y: e.clientY / window.innerHeight
        });
      };

      const handleInteractionClick = (e: MouseEvent) => {
        if (!isRecording && mediaRecorderRef.current?.state !== 'recording') return;
        interactionDataRef.current.push({
          timeMs: performance.now() - startTimeRef.current,
          type: 'click',
          x: e.clientX / window.innerWidth,
          y: e.clientY / window.innerHeight
        });
      };

      const handleInteractionKey = () => {
        if (!isRecording && mediaRecorderRef.current?.state !== 'recording') return;
        let x = 0.5;
        let y = 0.5;
        
        // Try to get active element position for typing focus
        if (document.activeElement && document.activeElement.getBoundingClientRect) {
          const rect = document.activeElement.getBoundingClientRect();
          x = (rect.left + rect.width / 2) / window.innerWidth;
          y = (rect.top + rect.height / 2) / window.innerHeight;
        }

        interactionDataRef.current.push({
          timeMs: performance.now() - startTimeRef.current,
          type: 'keypress',
          x,
          y
        });
      };

      let lastScrollTime = 0;
      const handleInteractionWheel = () => {
        if (!isRecording && mediaRecorderRef.current?.state !== 'recording') return;
        const now = performance.now();
        if (now - lastScrollTime < 250) return; // Throttle wheel events
        lastScrollTime = now;
        
        interactionDataRef.current.push({
          timeMs: now - startTimeRef.current,
          type: 'scroll', // Still categorizing as 'scroll' internally for App to process
          x: 0.5,
          y: 0.5
        });
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mousedown', handleInteractionClick);
      window.addEventListener('keypress', handleInteractionKey);
      window.addEventListener('wheel', handleInteractionWheel, { capture: true, passive: true });

      mediaRecorder.onstop = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mousedown', handleInteractionClick);
        window.removeEventListener('keypress', handleInteractionKey);
        window.removeEventListener('wheel', handleInteractionWheel, { capture: true } as EventListenerOptions);
      };

      try {
        await startBrowserExtensionSession();
        extensionSessionActiveRef.current = true;
      } catch (error) {
        extensionSessionActiveRef.current = false;
        console.info('Origami Chrome extension not available; using local interaction tracking only.', error);
      }

      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (err) {
      await stopExtensionSessionSafely();
      console.error('Failed to start recording:', err);
      throw err;
    }
  }, [isRecording, stopExtensionSessionSafely]);

  const stopRecording = useCallback((): Promise<ScreenRecordResult> => {
    return new Promise((resolve, reject) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        reject(new Error('Recorder is not active'));
        return;
      }

      const recorder = mediaRecorderRef.current;
      
      const handleStop = async () => {
        setIsRecording(false);
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const extensionData = await stopExtensionSessionSafely();
        const resolvedCursorData = extensionData?.cursorData?.length
          ? extensionData.cursorData
          : [...cursorDataRef.current];
        const resolvedInteractionData = extensionData?.interactionData?.length
          ? extensionData.interactionData
          : [...interactionDataRef.current];
        
        // Cleanup tracks
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        
        resolve({
          blob,
          cursorData: resolvedCursorData,
          interactionData: resolvedInteractionData
        });
        
        recorder.removeEventListener('stop', handleStop);
      };

      recorder.addEventListener('stop', handleStop);
      recorder.stop();
    });
  }, [stopExtensionSessionSafely]);

  return {
    isRecording,
    startRecording,
    stopRecording
  };
}
