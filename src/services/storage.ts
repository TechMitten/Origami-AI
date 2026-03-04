import type { SlideData } from '../components/SlideEditor';

const DB_NAME = 'TechTutorialsDB';
const STORE_NAME = 'appState';
const DB_VERSION = 1;

export interface AppState {
  slides: SlideData[];
  lastSaved: number;
}

interface StoredSlideData extends Omit<SlideData, 'dataUrl' | 'mediaUrl' | 'audioUrl'> {
  dataUrl?: string | Blob;
  mediaUrl?: string | Blob;
  audioUrl?: string | Blob;
}

interface StoredAppState {
  slides: StoredSlideData[];
  lastSaved: number;
}

export interface GlobalSettings {
  isEnabled: boolean;
  voice: string;
  delay: number;
  transition: 'fade' | 'slide' | 'zoom' | 'none';
  music?: {
    blob: Blob;
    volume: number;
    fileName: string;
  };
  ttsQuantization?: 'q8' | 'q4';
  useLocalTTS?: boolean;
  localTTSUrl?: string;
  disableAudioNormalization?: boolean;
  useWebLLM?: boolean;
  webLlmModel?: string;
  aiFixScriptSystemPrompt?: string;
}


let dbInstance: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };
      
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

export const saveState = async (slides: SlideData[]): Promise<void> => {
  console.log(`[Storage] Saving state with ${slides.length} slides...`);
  try {
    // Process slides to convert Blob URLs to Blobs BEFORE opening transaction
    const processedSlides = await Promise.all(slides.map(async (slide, index) => {
      const newSlide: StoredSlideData = { ...slide };

      // Helper to convert blob URL to Blob
      const processUrl = async (url?: string, label?: string) => {
          if (url && url.startsWith('blob:')) {
              try {
                  const resp = await fetch(url);
                  if (!resp.ok) throw new Error(`Fetch failed: ${resp.statusText}`);
                  const blob = await resp.blob();
                  console.log(`[Storage] Slide ${index} ${label} processed: ${blob.size} bytes`);
                  return blob;
              } catch (e) {
                  console.error(`[Storage] Failed to fetch blob for storage (Slide ${index} ${label}):`, url, e);
                  return undefined;
              }
          }
          return url; // Return original string if not a blob URL
      };

      newSlide.dataUrl = await processUrl(slide.dataUrl, 'dataUrl');
      newSlide.mediaUrl = await processUrl(slide.mediaUrl, 'mediaUrl');
      newSlide.audioUrl = await processUrl(slide.audioUrl, 'audioUrl');
      
      return newSlide;
    }));

    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const state: StoredAppState = {
          slides: processedSlides,
          lastSaved: Date.now(),
      };
      
      const request = store.put(state, 'current');
  
      request.onerror = () => {
        console.error("[Storage] Failed to put state:", request.error);
        reject(request.error);
      };
      request.onsuccess = () => {
        console.log("[Storage] State saved successfully");
        resolve();
      };
    });
  } catch (err) {
    console.error("[Storage] Failed to save state to IndexedDB", err);
  }
};

export const loadState = async (): Promise<AppState | null> => {
  console.log("[Storage] Loading state...");
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get('current');
  
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
          if (!request.result) {
              console.log("[Storage] No saved state found");
              resolve(null);
              return;
          }
          
          const state = request.result as StoredAppState;
          console.log(`[Storage] Loaded state with ${state.slides.length} slides from ${new Date(state.lastSaved).toISOString()}`);
          
          // Hydrate blobs back to URLs
          const hydratedSlides = state.slides.map((slide) => {
              const newSlide: SlideData = { 
                  ...slide,
                  dataUrl: slide.dataUrl instanceof Blob ? URL.createObjectURL(slide.dataUrl) : slide.dataUrl,
                  mediaUrl: slide.mediaUrl instanceof Blob ? URL.createObjectURL(slide.mediaUrl) : slide.mediaUrl,
                  audioUrl: slide.audioUrl instanceof Blob ? URL.createObjectURL(slide.audioUrl) : slide.audioUrl,
              } as SlideData;

              return newSlide;
          });
          
          resolve({ ...state, slides: hydratedSlides });
      };
    });
  } catch (err) {
    console.error("[Storage] Failed to load state from IndexedDB", err);
    return null;
  }
};

export const clearState = async (): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete('current');
  
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error("[Storage] Failed to clear state from IndexedDB", err);
  }
};

export const saveGlobalSettings = async (settings: GlobalSettings): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(settings, 'globalDefaults');
  
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error("[Storage] Failed to save global settings to IndexedDB", err);
  }
};

export const loadGlobalSettings = async (): Promise<GlobalSettings | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get('globalDefaults');
  
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ? (request.result as GlobalSettings) : null);
    });
  } catch (err) {
    console.error("[Storage] Failed to load global settings from IndexedDB", err);
    return null;
  }
};

