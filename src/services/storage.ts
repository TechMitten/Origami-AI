import type { SlideData } from '../components/SlideEditor';

const DB_NAME = 'TechTutorialsDB';
const STORE_NAME = 'appState';
const DB_VERSION = 3; // Increment to ensure OCR cache store is created

export interface AppState {
  slides: SlideData[];
  lastSaved: number;
  musicSettings?: {
    url?: string;
    blob?: Blob;
    volume: number;
    title?: string;
  };
}

interface StoredSlideData extends Omit<SlideData, 'dataUrl' | 'mediaUrl' | 'audioUrl'> {
  dataUrl?: string | Blob;
  mediaUrl?: string | Blob;
  audioUrl?: string | Blob;
}

interface StoredMusicSettings {
  url?: string | Blob;
  blob?: Blob;
  volume: number;
  title?: string;
}

interface StoredAppState {
  slides: StoredSlideData[];
  lastSaved: number;
  musicSettings?: StoredMusicSettings;
}

export interface GlobalSettings {
  isEnabled: boolean;
  voice: string;
  delay: number;
  transition: 'fade' | 'slide' | 'zoom' | 'none';
  music?: {
    blob?: Blob;
    volume: number;
    fileName?: string;
  };
  ttsQuantization?: 'q8' | 'q4';
  useLocalTTS?: boolean;
  localTTSUrl?: string;
  disableAudioNormalization?: boolean;
  useWebLLM?: boolean;
  webLlmModel?: string;
  aiFixScriptSystemPrompt?: string;
  previewMode?: 'inline' | 'modal';
  recordingCountdownEnabled?: boolean;
}

// OCR Cache interfaces
export interface OCRCacheEntry {
  pdfFingerprint: string;
  pageNumber: number;
  ocrText: string;
  timestamp: number;
}

interface StoredOCRCache {
  entries: OCRCacheEntry[];
  lastCleaned: number;
}


let dbInstance: IDBDatabase | null = null;

const closeDB = () => {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log('[Storage] Database connection closed');
  }
};

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      // Verify the database has the required store
      if (dbInstance.objectStoreNames.contains(OCR_CACHE_STORE)) {
        resolve(dbInstance);
        return;
      }
      // Store is missing, close and reopen
      console.log('[Storage] Database missing OCR cache store, closing and reopening...');
      closeDB();
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
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

      console.log(`[Storage] Database upgrade: version ${oldVersion} → ${DB_VERSION}`);

      // Create main store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
        console.log('[Storage] Created main app state store');
      }

      // Create OCR cache store for versions < 3
      if (!db.objectStoreNames.contains(OCR_CACHE_STORE)) {
        db.createObjectStore(OCR_CACHE_STORE);
        console.log('[Storage] Created OCR cache store');
      }
    };
  });
};

/**
 * Ensures the OCR cache store exists. Creates it if missing.
 * This is a fallback for databases that were upgraded but didn't get the store created.
 */
async function ensureOCRCacheStore(): Promise<void> {
  try {
    const db = await openDB();

    if (db.objectStoreNames.contains(OCR_CACHE_STORE)) {
      return; // Store exists, nothing to do
    }

    console.log('[Storage] OCR cache store missing, attempting to create it...');

    // Close the database connection
    closeDB();

    // Delete and recreate the database to ensure all stores exist
    await new Promise<void>((resolve, reject) => {
      const deleteReq = indexedDB.deleteDatabase(DB_NAME);
      deleteReq.onsuccess = () => {
        console.log('[Storage] Old database deleted, will be recreated on next access');
        resolve();
      };
      deleteReq.onerror = () => reject(deleteReq.error);
    });

    // Force a reconnect on next access by nullifying the instance
    dbInstance = null;

  } catch (error) {
    console.error('[Storage] Failed to ensure OCR cache store:', error);
    throw error;
  }
}


export const saveState = async (slides: SlideData[], musicSettings?: { url?: string; blob?: Blob; volume: number; title?: string }): Promise<void> => {
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

    // Process musicSettings blob URL to Blob
    let processedMusicSettings: StoredMusicSettings | undefined = undefined;
    if (musicSettings) {
      processedMusicSettings = {
        volume: musicSettings.volume,
        title: musicSettings.title,
      };

      // Convert blob URL to Blob for storage
      if (musicSettings.url && musicSettings.url.startsWith('blob:')) {
        try {
          const resp = await fetch(musicSettings.url);
          if (resp.ok) {
            processedMusicSettings.blob = await resp.blob();
            console.log("[Storage] Background music blob saved");
          }
        } catch (e) {
          console.error("[Storage] Failed to fetch music blob for storage:", e);
        }
      } else if (musicSettings.blob) {
        processedMusicSettings.blob = musicSettings.blob;
      }
    }

    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const state: StoredAppState = {
          slides: processedSlides,
          lastSaved: Date.now(),
          musicSettings: processedMusicSettings,
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

          // Hydrate music settings
          let hydratedMusicSettings: { url?: string; blob?: Blob; volume: number; title?: string } | undefined = undefined;
          if (state.musicSettings) {
            hydratedMusicSettings = {
              volume: state.musicSettings.volume,
              title: state.musicSettings.title,
            };

            if (state.musicSettings.blob) {
              hydratedMusicSettings.url = URL.createObjectURL(state.musicSettings.blob);
              hydratedMusicSettings.blob = state.musicSettings.blob;
              console.log("[Storage] Background music restored");
            }
          }

          resolve({ ...state, slides: hydratedSlides, musicSettings: hydratedMusicSettings });
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

// OCR Cache functions
const OCR_CACHE_STORE = 'ocrCache';
const CACHE_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Generate SHA-256 fingerprint of a PDF file for cache key.
 */
export async function generatePDFFingerprint(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Get cached OCR text for a specific PDF page.
 */
export async function getCachedOCRText(
  fingerprint: string,
  pageNumber: number
): Promise<string | null> {
  try {
    // Ensure the OCR cache store exists before trying to use it
    await ensureOCRCacheStore();

    const db = await openDB();

    // Check if store exists before trying to open transaction
    if (!db.objectStoreNames.contains(OCR_CACHE_STORE)) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(OCR_CACHE_STORE, 'readonly');
      const store = transaction.objectStore(OCR_CACHE_STORE);
      const request = store.get(fingerprint);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cache = request.result as StoredOCRCache | undefined;
        if (!cache) {
          resolve(null);
          return;
        }

        // Find entry for this page
        const entry = cache.entries.find(e => e.pageNumber === pageNumber);
        if (!entry) {
          resolve(null);
          return;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > CACHE_EXPIRY_MS) {
          console.log(`[OCR Cache] Entry expired for page ${pageNumber}`);
          resolve(null);
          return;
        }

        console.log(`[OCR Cache] Cache hit for page ${pageNumber}`);
        resolve(entry.ocrText);
      };
    });
  } catch (err) {
    console.error('[OCR Cache] Failed to get cached OCR text:', err);
    return null;
  }
}

/**
 * Set cached OCR text for a specific PDF page.
 */
export async function setCachedOCRText(
  fingerprint: string,
  pageNumber: number,
  text: string
): Promise<void> {
  try {
    // Ensure the OCR cache store exists before trying to use it
    await ensureOCRCacheStore();

    const db = await openDB();

    // Check if store exists before trying to open transaction
    if (!db.objectStoreNames.contains(OCR_CACHE_STORE)) {
      console.log('[OCR Cache] Store does not exist yet, skipping cache save');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(OCR_CACHE_STORE, 'readwrite');
      const store = transaction.objectStore(OCR_CACHE_STORE);

      // Get existing cache or create new
      const getRequest = store.get(fingerprint);
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const cache = getRequest.result as StoredOCRCache | undefined;

        // Remove existing entry for this page if it exists
        let entries = cache?.entries || [];
        entries = entries.filter(e => e.pageNumber !== pageNumber);

        // Add new entry
        entries.push({
          pdfFingerprint: fingerprint,
          pageNumber,
          ocrText: text,
          timestamp: Date.now(),
        });

        // Save updated cache
        const updatedCache: StoredOCRCache = {
          entries,
          lastCleaned: cache?.lastCleaned || Date.now(),
        };

        const putRequest = store.put(updatedCache, fingerprint);
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => {
          console.log(`[OCR Cache] Cached OCR text for page ${pageNumber}`);
          resolve();
        };
      };
    });
  } catch (err) {
    console.error('[OCR Cache] Failed to set cached OCR text:', err);
  }
}

/**
 * Clean expired OCR cache entries.
 */
export async function cleanExpiredOCRCache(): Promise<void> {
  try {
    const db = await openDB();

    // Check if store exists before trying to open transaction
    if (!db.objectStoreNames.contains(OCR_CACHE_STORE)) {
      console.log('[OCR Cache] Store does not exist yet, skipping cleanup');
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(OCR_CACHE_STORE, 'readwrite');
      const store = transaction.objectStore(OCR_CACHE_STORE);
      const request = store.getAllKeys();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const keys = request.result;
        let processed = 0;

        if (keys.length === 0) {
          resolve();
          return;
        }

        keys.forEach(key => {
          const getReq = store.get(key);
          getReq.onerror = () => reject(getReq.error);
          getReq.onsuccess = () => {
            const cache = getReq.result as StoredOCRCache | undefined;
            if (!cache) {
              processed++;
              if (processed === keys.length) resolve();
              return;
            }

            // Filter out expired entries
            const now = Date.now();
            const validEntries = cache.entries.filter(
              entry => now - entry.timestamp <= CACHE_EXPIRY_MS
            );

            if (validEntries.length === 0) {
              // All entries expired, delete entire cache
              store.delete(key);
            } else if (validEntries.length < cache.entries.length) {
              // Some entries expired, update cache
              const updatedCache: StoredOCRCache = {
                entries: validEntries,
                lastCleaned: now,
              };
              store.put(updatedCache, key);
            }

            processed++;
            if (processed === keys.length) resolve();
          };
        });
      };
    });
  } catch (err) {
    console.error('[OCR Cache] Failed to clean expired cache:', err);
  }
}

