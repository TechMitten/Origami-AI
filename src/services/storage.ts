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

interface StoredSlideData extends Omit<SlideData, 'dataUrl' | 'mediaUrl' | 'audioUrl' | 'videoNarrationAnalysis'> {
  dataUrl?: string | Blob;
  mediaUrl?: string | Blob;
  audioUrl?: string | Blob;
  videoNarrationAnalysis?: SlideData['videoNarrationAnalysis'] extends infer T
    ? T extends { scenes: Array<infer S> }
      ? Omit<T, 'scenes'> & { scenes: Array<Omit<S, 'audioUrl'> & { audioUrl?: string | Blob }> }
      : SlideData['videoNarrationAnalysis']
    : SlideData['videoNarrationAnalysis'];
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
  introFadeInEnabled?: boolean;
  introFadeInDurationSec?: number;
  music?: {
    blob?: Blob;
    volume: number;
    fileName?: string;
  };
  ttsQuantization?: 'q8' | 'q4';
  disableAudioNormalization?: boolean;
  useWebLLM?: boolean;
  webLlmModel?: string;
  aiFixScriptSystemPrompt?: string;
  aiFixScriptContext?: string;
  previewMode?: 'modal';
  recordingCountdownEnabled?: boolean;
  issueReporterRecordingPromptEnabled?: boolean;
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:3';
}

export interface AssistantChatAttachment {
  kind: 'image' | 'video';
  dataUrl: string;
  mimeType: string;
  name: string;
}

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  attachment?: AssistantChatAttachment;
}

export interface AssistantChatState {
  messages: AssistantChatMessage[];
  lastSaved: number;
}

export interface AssistantChatSession {
  id: string;
  title: string;
  messages: AssistantChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface AssistantChatSessionSummary {
  id: string;
  title: string;
  preview: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  hasAttachment: boolean;
}

export interface AssistantChatWorkspace {
  sessions: AssistantChatSession[];
  currentChatId: string | null;
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

      if (slide.videoNarrationAnalysis?.scenes?.length) {
        const processedScenes = await Promise.all(
          slide.videoNarrationAnalysis.scenes.map(async (scene) => ({
            ...scene,
            audioUrl: await processUrl(scene.audioUrl, 'videoNarrationScene.audioUrl')
          }))
        );

        newSlide.videoNarrationAnalysis = {
          ...slide.videoNarrationAnalysis,
          scenes: processedScenes
        } as StoredSlideData['videoNarrationAnalysis'];
      }

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

              if (slide.videoNarrationAnalysis?.scenes?.length) {
                newSlide.videoNarrationAnalysis = {
                  ...slide.videoNarrationAnalysis,
                  scenes: slide.videoNarrationAnalysis.scenes.map((scene) => ({
                    ...scene,
                    audioUrl: scene.audioUrl instanceof Blob ? URL.createObjectURL(scene.audioUrl) : scene.audioUrl,
                  }))
                } as SlideData['videoNarrationAnalysis'];
              }

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
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }

        const settings = request.result as GlobalSettings & { previewMode?: 'inline' | 'modal' };
        if (settings.previewMode === 'inline') {
          settings.previewMode = 'modal';
        }

        if (typeof settings.introFadeInEnabled !== 'boolean') {
          settings.introFadeInEnabled = true;
        }

        if (typeof settings.introFadeInDurationSec !== 'number' || !isFinite(settings.introFadeInDurationSec)) {
          settings.introFadeInDurationSec = 1;
        }

        settings.introFadeInDurationSec = Math.min(5, Math.max(0.1, settings.introFadeInDurationSec));

        resolve(settings);
      };
    });
  } catch (err) {
    console.error("[Storage] Failed to load global settings from IndexedDB", err);
    return null;
  }
};

const ASSISTANT_CHAT_SESSIONS_KEY = 'assistantChatSessions';
const ASSISTANT_CHAT_LIST_LOCAL_STORAGE_KEY = 'origami_assistant_chat_list_v1';
const ASSISTANT_CURRENT_CHAT_ID_LOCAL_STORAGE_KEY = 'origami_assistant_current_chat_id_v1';

const isAssistantAttachment = (attachment: unknown): attachment is AssistantChatAttachment => (
  !!attachment
  && typeof attachment === 'object'
  && (((attachment as AssistantChatAttachment).kind === 'image') || ((attachment as AssistantChatAttachment).kind === 'video'))
  && typeof (attachment as AssistantChatAttachment).dataUrl === 'string'
  && typeof (attachment as AssistantChatAttachment).mimeType === 'string'
  && typeof (attachment as AssistantChatAttachment).name === 'string'
);

const sanitizeAssistantMessages = (messages: unknown): AssistantChatMessage[] => (
  Array.isArray(messages)
    ? messages
      .filter((message) =>
        message
        && typeof message === 'object'
        && typeof (message as AssistantChatMessage).id === 'string'
        && (((message as AssistantChatMessage).role === 'user') || ((message as AssistantChatMessage).role === 'assistant'))
        && typeof (message as AssistantChatMessage).content === 'string'
        && typeof (message as AssistantChatMessage).createdAt === 'number'
      )
      .map((message) => {
        const candidate = message as AssistantChatMessage & {
          imageAttachment?: { dataUrl?: string; mimeType?: string; name?: string };
        };
        const legacyImageAttachment = candidate.imageAttachment
          && typeof candidate.imageAttachment.dataUrl === 'string'
          && typeof candidate.imageAttachment.mimeType === 'string'
          && typeof candidate.imageAttachment.name === 'string'
          ? {
            kind: 'image' as const,
            dataUrl: candidate.imageAttachment.dataUrl,
            mimeType: candidate.imageAttachment.mimeType,
            name: candidate.imageAttachment.name,
          }
          : undefined;

        return {
          id: candidate.id,
          role: candidate.role,
          content: candidate.content,
          createdAt: candidate.createdAt,
          attachment: isAssistantAttachment(candidate.attachment)
            ? candidate.attachment
            : legacyImageAttachment,
        };
      })
    : []
);

export const createAssistantChatTitle = (messages: AssistantChatMessage[]): string => {
  const firstUserMessage = messages.find((message) => message.role === 'user' && (message.content.trim() || message.attachment));
  if (!firstUserMessage) return 'New Chat';

  const text = firstUserMessage.content.trim();
  if (text) {
    return text.length > 48 ? `${text.slice(0, 45).trimEnd()}...` : text;
  }

  if (firstUserMessage.attachment?.kind === 'video') {
    return `WebM: ${firstUserMessage.attachment.name}`;
  }

  if (firstUserMessage.attachment) {
    return `Image: ${firstUserMessage.attachment.name}`;
  }

  return 'New Chat';
};

const createAssistantChatPreview = (messages: AssistantChatMessage[]): string => {
  const firstFilledMessage = messages.find((message) => message.content.trim() || message.attachment);
  if (!firstFilledMessage) return 'Empty conversation';

  const text = firstFilledMessage.content.trim();
  if (text) {
    return text.length > 88 ? `${text.slice(0, 85).trimEnd()}...` : text;
  }

  if (firstFilledMessage.attachment?.kind === 'video') return `Attached WebM: ${firstFilledMessage.attachment.name}`;
  if (firstFilledMessage.attachment) return `Attached image: ${firstFilledMessage.attachment.name}`;
  return 'Empty conversation';
};

const sanitizeAssistantSession = (session: unknown): AssistantChatSession | null => {
  if (!session || typeof session !== 'object') return null;

  const candidate = session as AssistantChatSession;
  if (typeof candidate.id !== 'string') return null;

  const messages = sanitizeAssistantMessages(candidate.messages);
  const createdAt = typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now();
  const updatedAt = typeof candidate.updatedAt === 'number' ? candidate.updatedAt : createdAt;
  const title = typeof candidate.title === 'string' && candidate.title.trim()
    ? candidate.title.trim()
    : createAssistantChatTitle(messages);

  return {
    id: candidate.id,
    title,
    messages,
    createdAt,
    updatedAt,
  };
};

const buildAssistantChatSessionSummary = (session: AssistantChatSession): AssistantChatSessionSummary => ({
  id: session.id,
  title: session.title,
  preview: createAssistantChatPreview(session.messages),
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  messageCount: session.messages.length,
  hasAttachment: session.messages.some((message) => Boolean(message.attachment)),
});

const readAssistantChatListFromLocalStorage = (): {
  summaries: AssistantChatSessionSummary[];
  currentChatId: string | null;
} => {
  try {
    const rawList = localStorage.getItem(ASSISTANT_CHAT_LIST_LOCAL_STORAGE_KEY);
    const rawCurrentChatId = localStorage.getItem(ASSISTANT_CURRENT_CHAT_ID_LOCAL_STORAGE_KEY);
    const parsedList = rawList ? JSON.parse(rawList) : [];

    const summaries = Array.isArray(parsedList)
      ? parsedList
        .filter((summary) =>
          summary
          && typeof summary === 'object'
          && typeof (summary as AssistantChatSessionSummary).id === 'string'
          && typeof (summary as AssistantChatSessionSummary).title === 'string'
          && typeof (summary as AssistantChatSessionSummary).preview === 'string'
          && typeof (summary as AssistantChatSessionSummary).createdAt === 'number'
          && typeof (summary as AssistantChatSessionSummary).updatedAt === 'number'
          && typeof (summary as AssistantChatSessionSummary).messageCount === 'number'
          && typeof (summary as AssistantChatSessionSummary).hasAttachment === 'boolean'
        )
        .map((summary) => summary as AssistantChatSessionSummary)
      : [];

    return {
      summaries,
      currentChatId: rawCurrentChatId || null,
    };
  } catch (error) {
    console.warn('[Storage] Failed to read assistant chat list from localStorage', error);
    return {
      summaries: [],
      currentChatId: null,
    };
  }
};

const writeAssistantChatListToLocalStorage = (
  summaries: AssistantChatSessionSummary[],
  currentChatId: string | null,
) => {
  try {
    localStorage.setItem(ASSISTANT_CHAT_LIST_LOCAL_STORAGE_KEY, JSON.stringify(summaries));
    if (currentChatId) {
      localStorage.setItem(ASSISTANT_CURRENT_CHAT_ID_LOCAL_STORAGE_KEY, currentChatId);
    } else {
      localStorage.removeItem(ASSISTANT_CURRENT_CHAT_ID_LOCAL_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('[Storage] Failed to write assistant chat list to localStorage', error);
  }
};

const reorderAssistantSessions = (
  sessions: AssistantChatSession[],
  summaries: AssistantChatSessionSummary[],
): AssistantChatSession[] => {
  if (!summaries.length) {
    return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const orderedSessions: AssistantChatSession[] = [];

  summaries.forEach((summary) => {
    const match = sessionsById.get(summary.id);
    if (!match) return;
    orderedSessions.push(match);
    sessionsById.delete(summary.id);
  });

  const remainingSessions = [...sessionsById.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  return [...orderedSessions, ...remainingSessions];
};

const loadAssistantChatSessionsFromIndexedDb = async (): Promise<AssistantChatSession[]> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(ASSISTANT_CHAT_SESSIONS_KEY);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const storedSessions = Array.isArray(request.result) ? request.result : [];
      resolve(
        storedSessions
          .map((session) => sanitizeAssistantSession(session))
          .filter((session): session is AssistantChatSession => Boolean(session))
      );
    };
  });
};

const persistAssistantChatSessionsToIndexedDb = async (sessions: AssistantChatSession[]): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(sessions, ASSISTANT_CHAT_SESSIONS_KEY);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

const removeLegacyAssistantChatState = async (): Promise<void> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete('assistantChatState');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

const loadLegacyAssistantChatState = async (): Promise<AssistantChatState | null> => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get('assistantChatState');

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (!request.result) {
        resolve(null);
        return;
      }

      const state = request.result as AssistantChatState;
      resolve({
        ...state,
        messages: sanitizeAssistantMessages(state.messages),
      });
    };
  });
};

export const saveAssistantChatWorkspace = async (workspace: AssistantChatWorkspace): Promise<void> => {
  try {
    const sessions = workspace.sessions
      .map((session) => sanitizeAssistantSession(session))
      .filter((session): session is AssistantChatSession => Boolean(session))
      .sort((a, b) => b.updatedAt - a.updatedAt);

    const validCurrentChatId = sessions.some((session) => session.id === workspace.currentChatId)
      ? workspace.currentChatId
      : (sessions[0]?.id ?? null);

    await persistAssistantChatSessionsToIndexedDb(sessions);
    writeAssistantChatListToLocalStorage(
      sessions.map(buildAssistantChatSessionSummary),
      validCurrentChatId,
    );
  } catch (err) {
    console.error('[Storage] Failed to save assistant chat workspace', err);
  }
};

export const loadAssistantChatWorkspace = async (): Promise<AssistantChatWorkspace> => {
  try {
    const [{ summaries, currentChatId }, sessionsFromDb] = await Promise.all([
      Promise.resolve(readAssistantChatListFromLocalStorage()),
      loadAssistantChatSessionsFromIndexedDb(),
    ]);

    if (sessionsFromDb.length > 0) {
      const orderedSessions = reorderAssistantSessions(sessionsFromDb, summaries);
      const normalizedCurrentChatId = orderedSessions.some((session) => session.id === currentChatId)
        ? currentChatId
        : (orderedSessions[0]?.id ?? null);

      writeAssistantChatListToLocalStorage(
        orderedSessions.map(buildAssistantChatSessionSummary),
        normalizedCurrentChatId,
      );

      return {
        sessions: orderedSessions,
        currentChatId: normalizedCurrentChatId,
      };
    }

    const legacyState = await loadLegacyAssistantChatState();
    if (legacyState?.messages?.length) {
      const migratedSession: AssistantChatSession = {
        id: crypto.randomUUID(),
        title: createAssistantChatTitle(legacyState.messages),
        messages: legacyState.messages,
        createdAt: legacyState.messages[0]?.createdAt ?? legacyState.lastSaved,
        updatedAt: legacyState.lastSaved,
      };

      const workspace = {
        sessions: [migratedSession],
        currentChatId: migratedSession.id,
      } satisfies AssistantChatWorkspace;

      await saveAssistantChatWorkspace(workspace);
      await removeLegacyAssistantChatState();
      return workspace;
    }

    return {
      sessions: [],
      currentChatId: null,
    };
  } catch (err) {
    console.error('[Storage] Failed to load assistant chat workspace', err);
    return {
      sessions: [],
      currentChatId: null,
    };
  }
};

export const saveAssistantChatState = async (messages: AssistantChatMessage[]): Promise<void> => {
  try {
    const now = Date.now();
    const workspace = await loadAssistantChatWorkspace();
    const existingSession = workspace.currentChatId
      ? workspace.sessions.find((session) => session.id === workspace.currentChatId)
      : null;
    const sessionId = existingSession?.id || crypto.randomUUID();
    const nextSession: AssistantChatSession = {
      id: sessionId,
      title: createAssistantChatTitle(messages),
      messages,
      createdAt: existingSession?.createdAt ?? now,
      updatedAt: now,
    };

    await saveAssistantChatWorkspace({
      sessions: [
        nextSession,
        ...workspace.sessions.filter((session) => session.id !== sessionId),
      ],
      currentChatId: sessionId,
    });
  } catch (err) {
    console.error('[Storage] Failed to save assistant chat state', err);
  }
};

export const loadAssistantChatState = async (): Promise<AssistantChatState | null> => {
  try {
    const workspace = await loadAssistantChatWorkspace();
    const currentSession = workspace.currentChatId
      ? workspace.sessions.find((session) => session.id === workspace.currentChatId)
      : workspace.sessions[0];

    if (!currentSession) return null;

    return {
      messages: currentSession.messages,
      lastSaved: currentSession.updatedAt,
    };
  } catch (err) {
    console.error('[Storage] Failed to load assistant chat state', err);
    return null;
  }
};

export const clearAssistantChatState = async (): Promise<void> => {
  try {
    const workspace = await loadAssistantChatWorkspace();
    if (!workspace.currentChatId) return;

    const now = Date.now();
    const nextSessions = workspace.sessions.map((session) => (
      session.id === workspace.currentChatId
        ? {
          ...session,
          title: 'New Chat',
          messages: [],
          updatedAt: now,
        }
        : session
    ));

    await saveAssistantChatWorkspace({
      sessions: nextSessions,
      currentChatId: workspace.currentChatId,
    });
  } catch (err) {
    console.error('[Storage] Failed to clear assistant chat state', err);
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

