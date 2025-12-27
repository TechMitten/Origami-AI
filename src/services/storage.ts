import type { SlideData } from '../components/SlideEditor';

const DB_NAME = 'TechTutorialsDB';
const STORE_NAME = 'appState';
const DB_VERSION = 1;

export interface AppState {
  slides: SlideData[];
  lastSaved: number;
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
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const state: AppState = {
        slides,
        lastSaved: Date.now(),
      };
      
      // We store the entire state under a single key 'current'
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
      request.onsuccess = () => resolve(request.result ? (request.result as AppState) : null);
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
