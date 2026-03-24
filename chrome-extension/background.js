const STATE_STORAGE_KEY = 'origami-session-state';
const CONTENT_SCRIPT_FILE = 'content-script.js';
const PERSIST_DEBOUNCE_MS = 750;
const DEFAULT_ACTION_TITLE = 'Origami AI Browser Recorder Bridge';
const ARMED_ACTION_TITLE = 'Origami AI is ready. Click this icon on the tab you want to record.';
const RECORDING_ACTION_TITLE = 'Origami AI is recording this tab. Click the extension to stop.';
const STOP_RECORDING_MESSAGE_TYPE = 'origami:stop-recording-requested';
const RECORDING_SOURCE_READY_MESSAGE_TYPE = 'origami:recording-source-ready';
const RECORDING_START_FAILED_MESSAGE_TYPE = 'origami:recording-start-failed';

const state = {
  active: false,
  recordingArmed: false,
  recordingActive: false,
  startedAtMs: 0,
  controllerTabId: null,
  targetTabId: null,
  sessionsByTab: new Map(),
};

let persistTimer = null;

function resetState() {
  state.active = false;
  state.recordingArmed = false;
  state.recordingActive = false;
  state.startedAtMs = 0;
  state.controllerTabId = null;
  state.targetTabId = null;
  state.sessionsByTab.clear();
}

function toSerializableState() {
  return {
    active: state.active,
    recordingArmed: state.recordingArmed,
    recordingActive: state.recordingActive,
    startedAtMs: state.startedAtMs,
    controllerTabId: state.controllerTabId,
    targetTabId: state.targetTabId,
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

async function updateActionUi() {
  try {
    let title = DEFAULT_ACTION_TITLE;
    let badgeText = '';

    if (state.recordingActive) {
      title = RECORDING_ACTION_TITLE;
      badgeText = 'REC';
      await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
    } else if (state.recordingArmed) {
      title = ARMED_ACTION_TITLE;
      badgeText = 'ARM';
      await chrome.action.setBadgeBackgroundColor({ color: '#2563eb' });
    }

    await chrome.action.setBadgeText({ text: badgeText });
    await chrome.action.setTitle({ title });
  } catch (error) {
    console.warn('Origami bridge failed to update extension action UI.', error);
  }
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

async function resetAndPersistState() {
  resetState();
  await clearPersistedState();
  await updateActionUi();
}

async function hydrateState() {
  try {
    const stored = await chrome.storage.session.get(STATE_STORAGE_KEY);
    const saved = stored?.[STATE_STORAGE_KEY];
    if (!saved) return;

    resetState();
    state.active = saved.active === true;
    state.recordingArmed = saved.recordingArmed === true;
    state.recordingActive = saved.recordingActive === true;
    state.startedAtMs = Number.isFinite(saved.startedAtMs) ? saved.startedAtMs : 0;
    state.controllerTabId = typeof saved.controllerTabId === 'number' ? saved.controllerTabId : null;
    state.targetTabId = typeof saved.targetTabId === 'number' ? saved.targetTabId : null;

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

const hydrateStatePromise = hydrateState().finally(() => updateActionUi());

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

async function sendControllerMessage(message) {
  if (typeof state.controllerTabId !== 'number') return;

  try {
    await chrome.tabs.sendMessage(state.controllerTabId, message);
  } catch (error) {
    console.warn('Origami bridge failed to message the app tab.', error);
  }
}

async function armRecordingForController(controllerTabId) {
  resetState();
  state.controllerTabId = controllerTabId;
  state.recordingArmed = true;
  await persistState();
  await injectContentScriptsIntoExistingTabs(controllerTabId);
  await updateActionUi();
}

async function startRecordingFromAction(tab) {
  const targetTabId = tab?.id;
  if (typeof targetTabId !== 'number') {
    return;
  }

  if (targetTabId === state.controllerTabId) {
    await sendControllerMessage({
      type: RECORDING_START_FAILED_MESSAGE_TYPE,
      payload: {
        message: 'Click the Origami extension on the tab you want to record, not on the Origami app tab.',
      },
    });
    return;
  }

  try {
    const streamId = await chrome.tabCapture.getMediaStreamId({
      consumerTabId: state.controllerTabId,
      targetTabId,
    });

    state.active = true;
    state.recordingArmed = false;
    state.recordingActive = true;
    state.startedAtMs = Date.now();
    state.targetTabId = targetTabId;
    state.sessionsByTab.clear();

    await persistState();
    await updateActionUi();

    await sendControllerMessage({
      type: RECORDING_SOURCE_READY_MESSAGE_TYPE,
      payload: {
        streamId,
        sourceType: 'tab',
        sourceTab: {
          id: targetTabId,
          title: tab.title || '',
          url: tab.url || '',
        },
      },
    });
  } catch (error) {
    console.warn('Origami bridge failed to start tab capture.', error);
    await sendControllerMessage({
      type: RECORDING_START_FAILED_MESSAGE_TYPE,
      payload: {
        message: error?.message || 'Failed to start tab capture.',
      },
    });
  }
}

async function requestControllerStop() {
  await sendControllerMessage({ type: STOP_RECORDING_MESSAGE_TYPE });
}

async function handleMessage(message, sender, sendResponse) {
  await ensureStateHydrated();

  if (message.type === 'origami:get-status') {
    sendResponse({
      ok: true,
      payload: {
        active: state.active,
        recordingArmed: state.recordingArmed,
        recordingActive: state.recordingActive,
      },
    });
    return;
  }

  if (message.type === 'origami:arm-recording') {
    const controllerTabId = sender?.tab?.id;
    if (typeof controllerTabId !== 'number') {
      throw new Error('Origami bridge could not determine the app tab.');
    }

    await armRecordingForController(controllerTabId);
    sendResponse({ ok: true, payload: { armed: true } });
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
          sourceTab: state.targetTabId
            ? {
                id: state.targetTabId,
              }
            : undefined,
        };

    await resetAndPersistState();
    sendResponse({ ok: true, payload });
    return;
  }

  if (!state.recordingActive || typeof state.targetTabId !== 'number') {
    return;
  }

  const senderTabId = sender?.tab?.id;
  if (senderTabId !== state.targetTabId) {
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
  const expectsResponse =
    message.type === 'origami:get-status' ||
    message.type === 'origami:arm-recording' ||
    message.type === 'origami:stop-session';

  void handleMessage(message, sender, sendResponse).catch((error) => {
    console.warn('Origami bridge message handler failed.', error);
    if (expectsResponse) {
      sendResponse({ ok: false, error: error?.message || 'Origami bridge failed.' });
    }
  });

  return expectsResponse;
});

chrome.action.onClicked.addListener((tab) => {
  void ensureStateHydrated()
    .then(async () => {
      if (state.recordingActive) {
        await requestControllerStop();
        return;
      }

      if (state.recordingArmed) {
        await startRecordingFromAction(tab);
      }
    })
    .catch((error) => {
      console.warn('Origami bridge action click failed.', error);
    });
});

chrome.runtime.onInstalled.addListener(() => {
  void injectContentScriptsIntoExistingTabs(null);
  void updateActionUi();
});

chrome.runtime.onStartup.addListener(() => {
  void injectContentScriptsIntoExistingTabs(null);
  void updateActionUi();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === state.controllerTabId) {
    void resetAndPersistState();
    return;
  }

  if (tabId === state.targetTabId && state.recordingActive) {
    void requestControllerStop();
  }

  if (!state.sessionsByTab.has(tabId)) return;
  state.sessionsByTab.delete(tabId);
  if (state.active) {
    schedulePersist();
  }
});
