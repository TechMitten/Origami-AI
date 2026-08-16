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
  // Shorts
  pollinationsApiKey?: string;
  pollinationsImageModel?: string;
  shortsVoice?: string;
  shortsCaptionStyle?: 'bold-pop' | 'clean-lower' | 'karaoke';
  shortsUseOpenAI?: boolean;
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

/**
 * Slide fields that hold `blob:` object URLs. Object URLs are scoped to the
 * document that created them, so persisting the URL string alone leaves broken
 * media after a reload. We store the underlying Blob instead and mint a fresh
 * URL on load.
 */
const SLIDE_ASSET_FIELDS = ['dataUrl', 'mediaUrl', 'audioUrl'] as const;
type SlideAssetField = typeof SLIDE_ASSET_FIELDS[number];

interface PersistedSlide {
  slide: SlideData;
  assets?: Partial<Record<SlideAssetField, Blob>>;
}

interface PersistedMusicSettings {
  volume: number;
  loop?: boolean;
  title?: string;
  blob?: Blob;
}

// Maps a live object URL to its Blob so repeated autosaves don't re-read the
// same asset, and so rehydrated slides can be saved again without a fetch.
const objectUrlBlobs = new Map<string, Blob>();

async function resolveObjectUrlBlob(url: string): Promise<Blob | null> {
  const cached = objectUrlBlobs.get(url);
  if (cached) return cached;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    objectUrlBlobs.set(url, blob);
    return blob;
  } catch (e) {
    // The URL was already revoked; the asset is unrecoverable either way.
    console.warn('[Storage] Could not read asset for persistence:', e);
    return null;
  }
}

function createTrackedObjectURL(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  objectUrlBlobs.set(url, blob);
  return url;
}

function isPersistedSlide(value: unknown): value is PersistedSlide {
  return typeof value === 'object' && value !== null && typeof (value as PersistedSlide).slide === 'object';
}

async function toPersistedSlide(slide: SlideData): Promise<PersistedSlide> {
  const record: PersistedSlide = { slide: { ...slide } };

  for (const field of SLIDE_ASSET_FIELDS) {
    const url = slide[field];
    if (!url || !url.startsWith('blob:')) continue;

    // The URL is meaningless in the next session, so it never gets persisted.
    delete record.slide[field];

    const blob = await resolveObjectUrlBlob(url);
    if (blob) {
      record.assets = { ...record.assets, [field]: blob };
    }
  }

  return record;
}

function fromPersistedSlide(record: PersistedSlide): SlideData {
  const slide: SlideData = { ...record.slide };

  for (const field of SLIDE_ASSET_FIELDS) {
    const blob = record.assets?.[field];
    if (blob instanceof Blob) {
      slide[field] = createTrackedObjectURL(blob);
    } else if (slide[field]?.startsWith('blob:')) {
      // Written by an older build: the URL is dead, so drop it rather than
      // rendering a broken asset.
      delete slide[field];
    }
  }

  return slide;
}

// Keep only assets belonging to the state we just wrote, so revoked/replaced
// media doesn't pin memory for the life of the session.
function pruneObjectUrlBlobs(liveUrls: Set<string>): void {
  for (const url of objectUrlBlobs.keys()) {
    if (!liveUrls.has(url)) objectUrlBlobs.delete(url);
  }
}

export async function saveState(slides: SlideData[], musicSettings: MusicSettings): Promise<void> {
  const persistedSlides = await Promise.all(slides.map(toPersistedSlide));

  const persistedMusic: PersistedMusicSettings = {
    volume: musicSettings.volume,
    loop: musicSettings.loop,
    title: musicSettings.title,
  };

  if (musicSettings.blob instanceof Blob) {
    persistedMusic.blob = musicSettings.blob;
  } else if (musicSettings.url?.startsWith('blob:')) {
    persistedMusic.blob = (await resolveObjectUrlBlob(musicSettings.url)) || undefined;
  }

  await setVal('keyval', 'slides', persistedSlides);
  await setVal('keyval', 'musicSettings', persistedMusic);

  const liveUrls = new Set<string>();
  for (const slide of slides) {
    for (const field of SLIDE_ASSET_FIELDS) {
      const url = slide[field];
      if (url?.startsWith('blob:')) liveUrls.add(url);
    }
  }
  if (musicSettings.url?.startsWith('blob:')) liveUrls.add(musicSettings.url);
  pruneObjectUrlBlobs(liveUrls);
}

export async function loadState(): Promise<{ slides: SlideData[]; musicSettings?: MusicSettings } | null> {
  const storedSlides = await getVal<(PersistedSlide | SlideData)[]>('keyval', 'slides');
  const storedMusic = await getVal<PersistedMusicSettings | MusicSettings>('keyval', 'musicSettings');
  if (!storedSlides) return null;

  const slides = storedSlides.map(entry =>
    isPersistedSlide(entry) ? fromPersistedSlide(entry) : fromPersistedSlide({ slide: entry })
  );

  let musicSettings: MusicSettings | undefined;
  if (storedMusic) {
    musicSettings = {
      volume: storedMusic.volume,
      loop: storedMusic.loop,
      title: storedMusic.title,
    };

    if (storedMusic.blob instanceof Blob) {
      musicSettings.blob = storedMusic.blob;
      musicSettings.url = createTrackedObjectURL(storedMusic.blob);
    }
  }

  return { slides, musicSettings };
}

export async function clearState(): Promise<void> {
  objectUrlBlobs.clear();
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

/**
 * Shorts drafts.
 *
 * Scene assets are held as Blobs, not `blob:` URLs — an object URL is scoped to
 * the document that minted it, so a persisted URL string is dead on reload.
 * The page mints fresh URLs from these Blobs after loading, mirroring the
 * slide-asset approach above.
 */
export interface PersistedShortsScene {
  id: string;
  narration: string;
  imagePrompt: string;
  imageBlob?: Blob;
  videoBlob?: Blob;
  audioBlob?: Blob;
  audioDuration?: number;
  seed: number;
}

export interface PersistedShortsProject {
  topic: string;
  title: string;
  aspect: '9:16' | '16:9' | '1:1';
  targetDurationSec: number;
  voice: string;
  generationMode?: 'image' | 'video';
  imageModel: string;
  videoModel?: string;
  visualStyle: string;
  tone: string;
  captionsEnabled: boolean;
  captionStyle: 'bold-pop' | 'clean-lower' | 'karaoke';
  showTitleCard: boolean;
  musicBlob?: Blob;
  musicFileName?: string;
  musicVolume?: number;
  scenes: PersistedShortsScene[];
  savedAt: number;
}

export async function loadShortsProject(): Promise<PersistedShortsProject | null> {
  return getVal<PersistedShortsProject>('keyval', 'shortsProject');
}

export async function saveShortsProject(project: PersistedShortsProject): Promise<void> {
  await setVal('keyval', 'shortsProject', project);
}

export async function clearShortsProject(): Promise<void> {
  await deleteVal('keyval', 'shortsProject');
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
