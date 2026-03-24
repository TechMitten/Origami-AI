const STATE_STORAGE_KEY = 'origami-session-state';
const CONTENT_SCRIPT_FILE = 'content-script.js';
const PERSIST_DEBOUNCE_MS = 750;
const SHARE_REMINDER_MESSAGE_TYPE = 'origami:show-share-reminder';

const state = {
  active: false,
  startedAtMs: 0,
  controllerTabId: null,
  sessionsByTab: new Map(),
};

let persistTimer = null;

function resetState() {
  state.active = false;
  state.startedAtMs = 0;
  state.controllerTabId = null;
  state.sessionsByTab.clear();
}

function toSerializableState() {
  return {
    active: state.active,
    startedAtMs: state.startedAtMs,
    controllerTabId: state.controllerTabId,
    sessionsByTab: [...state.sessionsByTab.values()],
  };
}

function sanitizePoint(value, fallback = 0.5) {
  return Number.isFinite(value) ? value : fallback;
}

function sanitizeSession(session) {
  return {
    tabId: session?.tabId,
    title: session?.title || '',
    url: session?.url || '',
    cursorData: Array.isArray(session?.cursorData) ? session.cursorData : [],
    interactionData: Array.isArray(session?.interactionData) ? session.interactionData : [],
    lastEventAtMs: Number.isFinite(session?.lastEventAtMs) ? session.lastEventAtMs : 0,
  };
}

async function persistState() {
  try {
    await chrome.storage.session.set({
      [STATE_STORAGE_KEY]: toSerializableState(),
    });
  } catch (error) {
    console.warn('Origami bridge failed to persist session state.', error);
  }
}

function schedulePersist() {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
  }

  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistState();
  }, PERSIST_DEBOUNCE_MS);
}

async function clearPersistedState() {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }

  try {
    await chrome.storage.session.remove(STATE_STORAGE_KEY);
  } catch (error) {
    console.warn('Origami bridge failed to clear persisted session state.', error);
  }
}

async function hydrateState() {
  try {
    const stored = await chrome.storage.session.get(STATE_STORAGE_KEY);
    const saved = stored?.[STATE_STORAGE_KEY];
    if (!saved || !saved.active) return;

    resetState();
    state.active = true;
    state.startedAtMs = Number.isFinite(saved.startedAtMs) ? saved.startedAtMs : 0;
    state.controllerTabId = typeof saved.controllerTabId === 'number' ? saved.controllerTabId : null;

    const sessions = Array.isArray(saved.sessionsByTab) ? saved.sessionsByTab : [];
    for (const rawSession of sessions) {
      const session = sanitizeSession(rawSession);
      if (typeof session.tabId === 'number') {
        state.sessionsByTab.set(session.tabId, session);
      }
    }
  } catch (error) {
    console.warn('Origami bridge failed to restore session state.', error);
  }
}

const hydrateStatePromise = hydrateState();

async function ensureStateHydrated() {
  await hydrateStatePromise;
}

function getOrCreateTabSession(sender) {
  const tabId = sender?.tab?.id;
  if (typeof tabId !== 'number') return null;

  if (!state.sessionsByTab.has(tabId)) {
    state.sessionsByTab.set(tabId, {
      tabId,
      title: sender.tab?.title || '',
      url: sender.tab?.url || '',
      cursorData: [],
      interactionData: [],
      lastEventAtMs: 0,
    });
  }

  const session = state.sessionsByTab.get(tabId);
  session.title = sender.tab?.title || session.title || '';
  session.url = sender.tab?.url || session.url || '';
  return session;
}

function getPrimarySession() {
  const sessions = [...state.sessionsByTab.values()];
  if (sessions.length === 0) return null;

  return sessions.sort((a, b) => {
    const aWeight = (a.interactionData.length * 10) + a.cursorData.length;
    const bWeight = (b.interactionData.length * 10) + b.cursorData.length;
    if (bWeight !== aWeight) return bWeight - aWeight;
    return b.lastEventAtMs - a.lastEventAtMs;
  })[0];
}

function toRelativeTime(timeMs) {
  return Math.max(0, Math.round(timeMs - state.startedAtMs));
}

function isInjectableUrl(url) {
  return typeof url === 'string' && /^(https?:|file:)/i.test(url);
}

async function injectContentScriptsIntoExistingTabs(controllerTabId) {
  const tabs = await chrome.tabs.query({});

  await Promise.allSettled(
    tabs
      .filter((tab) => typeof tab.id === 'number' && tab.id !== controllerTabId && isInjectableUrl(tab.url))
      .map((tab) =>
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: [CONTENT_SCRIPT_FILE],
        })
      )
  );
}

async function sendShareReminder(tabId) {
  if (typeof tabId !== 'number') return;

  try {
    await chrome.tabs.sendMessage(tabId, { type: SHARE_REMINDER_MESSAGE_TYPE });
  } catch {
    // The tab may still be loading or may not permit messaging yet.
  }
}

async function maybeRemindForTab(tabId) {
  await ensureStateHydrated();
  if (!state.active) return;
  if (typeof tabId !== 'number' || tabId === state.controllerTabId) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!isInjectableUrl(tab?.url)) return;
    await sendShareReminder(tabId);
  } catch {
    // Ignore tabs that disappear or are not accessible.
  }
}

async function handleMessage(message, sender, sendResponse) {
  await ensureStateHydrated();

  if (message.type === 'origami:get-status') {
    sendResponse({ ok: true, payload: { active: state.active } });
    return;
  }

  if (message.type === 'origami:start-session') {
    resetState();
    state.active = true;
    state.startedAtMs = Date.now();
    state.controllerTabId = sender?.tab?.id ?? null;
    await persistState();
    await injectContentScriptsIntoExistingTabs(state.controllerTabId);
    sendResponse({ ok: true, payload: { active: true } });
    return;
  }

  if (message.type === 'origami:stop-session') {
    const primary = getPrimarySession();
    const payload = primary
      ? {
          cursorData: primary.cursorData,
          interactionData: primary.interactionData,
          sourceTab: {
            id: primary.tabId,
            title: primary.title,
            url: primary.url,
          },
        }
      : {
          cursorData: [],
          interactionData: [],
          sourceTab: undefined,
        };

    resetState();
    await clearPersistedState();
    sendResponse({ ok: true, payload });
    return;
  }

  if (!state.active) {
    return;
  }

  const senderTabId = sender?.tab?.id;
  if (typeof senderTabId === 'number' && senderTabId === state.controllerTabId) {
    return;
  }

  const session = getOrCreateTabSession(sender);
  if (!session) return;

  if (message.type === 'origami:cursor-point') {
    session.cursorData.push({
      timeMs: toRelativeTime(message.payload?.timeMs ?? Date.now()),
      x: sanitizePoint(message.payload?.x),
      y: sanitizePoint(message.payload?.y),
    });
    session.lastEventAtMs = Date.now();
    schedulePersist();
    return;
  }

  if (message.type === 'origami:interaction-point') {
    session.interactionData.push({
      timeMs: toRelativeTime(message.payload?.timeMs ?? Date.now()),
      type: message.payload?.eventType || 'click',
      x: sanitizePoint(message.payload?.x),
      y: sanitizePoint(message.payload?.y),
    });
    session.lastEventAtMs = Date.now();
    schedulePersist();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  void handleMessage(message, sender, sendResponse).catch((error) => {
    console.warn('Origami bridge message handler failed.', error);
    if (
      message.type === 'origami:get-status' ||
      message.type === 'origami:start-session' ||
      message.type === 'origami:stop-session'
    ) {
      sendResponse({ ok: false, error: error?.message || 'Origami bridge failed.' });
    }
  });

  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  void injectContentScriptsIntoExistingTabs(null);
});

chrome.runtime.onStartup.addListener(() => {
  void injectContentScriptsIntoExistingTabs(null);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (!state.sessionsByTab.has(tabId)) return;
  state.sessionsByTab.delete(tabId);
  if (state.active) {
    schedulePersist();
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  void maybeRemindForTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.active) return;
  void maybeRemindForTab(tabId);
});
