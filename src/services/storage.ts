import type { SlideData, MusicSettings } from '../components/SlideEditor';

export interface GlobalSettings {
  isEnabled: boolean;
  voice: string;
  delay: number;
  transition: 'none' | 'fade' | 'slide' | 'zoom';
  introFadeInEnabled: boolean;
  introFadeInDurationSec: number;
  previewMode: string;
  aspectRatio: '16:9' | '9:16' | '4:3' | '1:1';
  music?: {
    blob: Blob | File;
    volume: number;
    fileName: string;
  };
  ttsQuantization?: 'q4' | 'q8';
  disableAudioNormalization?: boolean;
  useWebLLM?: boolean;
  webLlmModel?: string;
  aiFixScriptSystemPrompt?: string;
  aiFixScriptContext?: string;
  recordingCountdownEnabled?: boolean;
  openaiEndpoint?: string;
  openaiModel?: string;
  openaiApiKey?: string;
  useOpenAIOcr?: boolean;
  useOpenAIFixScript?: boolean;
  useOpenAIForSlideGen?: boolean;
  issueReporterRecordingPromptEnabled?: boolean;
}

export interface AssistantChatAttachment {
  kind: 'image' | 'video';
  dataUrl: string;
  name: string;
  mimeType: string;
}

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  createdAt: number;
  attachment?: AssistantChatAttachment;
}

export interface AssistantChatSession {
  id: string;
  title: string;
  messages: AssistantChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface AssistantChatWorkspace {
  sessions: AssistantChatSession[];
  currentChatId: string | null;
}

const DB_NAME = 'OrigamiDB';
const DB_VERSION = 1;

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('keyval')) {
        db.createObjectStore('keyval');
      }
      if (!db.objectStoreNames.contains('ocr_cache')) {
        db.createObjectStore('ocr_cache', { keyPath: 'key' });
      }
    };
  });
}

function getVal<T>(storeName: string, key: string): Promise<T | null> {
  return getDB().then(db => new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result !== undefined ? request.result as T : null);
  }));
}

function setVal<T>(storeName: string, key: string, value: T): Promise<void> {
  return getDB().then(db => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(value, key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  }));
}

function deleteVal(storeName: string, key: string): Promise<void> {
  return getDB().then(db => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  }));
}

export async function saveState(slides: SlideData[], musicSettings: MusicSettings): Promise<void> {
  await setVal('keyval', 'slides', slides);
  await setVal('keyval', 'musicSettings', musicSettings);
}

export async function loadState(): Promise<{ slides: SlideData[]; musicSettings?: MusicSettings } | null> {
  const slides = await getVal<SlideData[]>('keyval', 'slides');
  const musicSettings = await getVal<MusicSettings>('keyval', 'musicSettings');
  if (!slides) return null;
  return {
    slides,
    musicSettings: musicSettings || undefined,
  };
}

export async function clearState(): Promise<void> {
  await deleteVal('keyval', 'slides');
  await deleteVal('keyval', 'musicSettings');
}

export async function loadGlobalSettings(): Promise<GlobalSettings | null> {
  return getVal<GlobalSettings>('keyval', 'globalSettings');
}

export async function saveGlobalSettings(settings: GlobalSettings): Promise<void> {
  await setVal('keyval', 'globalSettings', settings);
}

export async function loadAssistantChatWorkspace(): Promise<AssistantChatWorkspace> {
  const ws = await getVal<AssistantChatWorkspace>('keyval', 'assistantWorkspace');
  return ws || { sessions: [], currentChatId: null };
}

export async function saveAssistantChatWorkspace(workspace: AssistantChatWorkspace): Promise<void> {
  await setVal('keyval', 'assistantWorkspace', workspace);
}

export function createAssistantChatTitle(messages: AssistantChatMessage[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) return 'New Chat';
  const content = firstUserMessage.content.trim();
  if (!content) {
    if (firstUserMessage.attachment) {
      return `Attachment (${firstUserMessage.attachment.kind})`;
    }
    return 'New Chat';
  }
  return content.length > 30 ? content.slice(0, 30) + '...' : content;
}

export async function generatePDFFingerprint(file: File): Promise<string> {
  const data = `${file.name}-${file.size}-${file.lastModified}`;
  try {
    const msgBuffer = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash << 5) - hash + data.charCodeAt(i);
      hash |= 0;
    }
    return `fb-${hash}`;
  }
}

interface OcrCacheItem {
  key: string;
  fingerprint: string;
  pageNumber: number;
  text: string;
  timestamp: number;
}

export async function getCachedOCRText(fingerprint: string, pageNumber: number): Promise<string | null> {
  const key = `${fingerprint}_${pageNumber}`;
  const entry = await getVal<OcrCacheItem>('ocr_cache', key);
  if (!entry) return null;

  // Update timestamp on hit so frequently used PDFs don't expire
  entry.timestamp = Date.now();
  await setVal('ocr_cache', key, entry);

  return entry.text;
}

export async function setCachedOCRText(fingerprint: string, pageNumber: number, text: string): Promise<void> {
  const key = `${fingerprint}_${pageNumber}`;
  const entry: OcrCacheItem = {
    key,
    fingerprint,
    pageNumber,
    text,
    timestamp: Date.now(),
  };
  await setVal('ocr_cache', key, entry);
}

export async function cleanExpiredOCRCache(): Promise<void> {
  const EXPIRATION_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const db = await getDB();
    const tx = db.transaction('ocr_cache', 'readwrite');
    const store = tx.objectStore('ocr_cache');
    const request = store.getAll();

    await new Promise<void>((resolve, reject) => {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const items = request.result as OcrCacheItem[];
        const deletePromises = items
          .filter(item => now - item.timestamp > EXPIRATION_MS)
          .map(item => {
            return new Promise<void>((res, rej) => {
              const delReq = store.delete(item.key);
              delReq.onsuccess = () => res();
              delReq.onerror = () => rej(delReq.error);
            });
          });

        Promise.all(deletePromises).then(() => resolve()).catch(reject);
      };
    });
  } catch (e) {
    console.error('Error cleaning expired OCR cache:', e);
  }
}
