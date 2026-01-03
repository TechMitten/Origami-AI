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
  showVolumeOverlay?: boolean;
}

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
};

export const saveState = async (slides: SlideData[]): Promise<void> => {
  try {
    // Process slides to convert Blob URLs to Blobs BEFORE opening transaction
    // Transactions auto-commit if event loop spins (which await fetch does)
    const processedSlides = await Promise.all(slides.map(async (slide) => {
      const newSlide: StoredSlideData = { ...slide };

      // Helper to convert blob URL to Blob
      const processUrl = async (url?: string) => {
          if (url && url.startsWith('blob:')) {
              try {
                  const resp = await fetch(url);
                  return await resp.blob();
              } catch (e) {
                  console.error("Failed to fetch blob for storage", url, e);
                  return undefined;
              }
          }
          return url;
      };

      newSlide.dataUrl = await processUrl(slide.dataUrl);
      newSlide.mediaUrl = await processUrl(slide.mediaUrl);
      newSlide.audioUrl = await processUrl(slide.audioUrl);
      
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
  
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.error("Failed to save state to IndexedDB", err);
  }
};

export const loadState = async (): Promise<AppState | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get('current');
  
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
          if (!request.result) {
              resolve(null);
              return;
          }
          
          
          const state = request.result as StoredAppState;
          
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
    console.error("Failed to load state from IndexedDB", err);
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
    console.error("Failed to clear state from IndexedDB", err);
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
    console.error("Failed to save global settings to IndexedDB", err);
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
    console.error("Failed to load global settings from IndexedDB", err);
    return null;
  }
};
