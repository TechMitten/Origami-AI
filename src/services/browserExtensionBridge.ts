export interface BrowserExtensionSessionData {
  cursorData: Array<{
    timeMs: number;
    x: number;
    y: number;
  }>;
  interactionData: Array<{
    timeMs: number;
    type: 'click' | 'keypress' | 'scroll';
    x: number;
    y: number;
  }>;
  sourceTab?: {
    id?: number;
    title?: string;
    url?: string;
  };
}

export interface BrowserExtensionCaptureSource {
  streamId: string;
  sourceType: 'tab';
  sourceTab?: {
    id?: number;
    title?: string;
    url?: string;
  };
}

interface BrowserExtensionResponse<T = unknown> {
  ok: boolean;
  payload?: T;
  error?: string;
}

const REQUEST_SOURCE = 'origami-app-extension-bridge';
const RESPONSE_SOURCE = 'origami-extension-app-bridge';
const EVENT_SOURCE = 'origami-extension-app-event';

export interface BrowserExtensionStatus {
  active: boolean;
  recordingArmed?: boolean;
  recordingActive?: boolean;
}

export interface BrowserExtensionStartFailure {
  message: string;
}

export type BrowserExtensionEventType =
  | 'stop-recording-requested'
  | 'recording-source-ready'
  | 'recording-start-failed';

interface BrowserExtensionEventPayloadMap {
  'stop-recording-requested': undefined;
  'recording-source-ready': BrowserExtensionCaptureSource;
  'recording-start-failed': BrowserExtensionStartFailure;
}

function nextRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function sendBridgeRequest<T = unknown>(
  action: string,
  payload?: unknown,
  timeoutMs = 1200
): Promise<T> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Browser extension bridge is only available in the browser.'));
  }

  return new Promise((resolve, reject) => {
    const requestId = nextRequestId();
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      reject(new Error('Origami Chrome extension bridge timed out.'));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', handleMessage);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== RESPONSE_SOURCE || data.requestId !== requestId) return;

      cleanup();
      const response = data.response as BrowserExtensionResponse<T>;
      if (!response?.ok) {
        reject(new Error(response?.error || 'Origami Chrome extension request failed.'));
        return;
      }
      resolve(response.payload as T);
    };

    window.addEventListener('message', handleMessage);
    window.postMessage(
      {
        source: REQUEST_SOURCE,
        requestId,
        action,
        payload,
      },
      '*'
    );
  });
}

export async function getBrowserExtensionStatus(): Promise<BrowserExtensionStatus> {
  return sendBridgeRequest<BrowserExtensionStatus>('get-status');
}

export async function armBrowserExtensionRecording(): Promise<void> {
  await sendBridgeRequest('arm-recording');
}

export async function stopBrowserExtensionSession(): Promise<BrowserExtensionSessionData> {
  return sendBridgeRequest<BrowserExtensionSessionData>('stop-session', undefined, 2000);
}

export function addBrowserExtensionEventListener<T extends BrowserExtensionEventType>(
  eventType: T,
  listener: (payload: BrowserExtensionEventPayloadMap[T]) => void
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleMessage = (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== EVENT_SOURCE || data.eventType !== eventType) return;
    listener(data.payload as BrowserExtensionEventPayloadMap[T]);
  };

  window.addEventListener('message', handleMessage);
  return () => {
    window.removeEventListener('message', handleMessage);
  };
}
