const state = {
  active: false,
  startedAtMs: 0,
  controllerTabId: null,
  sessionsByTab: new Map(),
};

function resetState() {
  state.active = false;
  state.startedAtMs = 0;
  state.controllerTabId = null;
  state.sessionsByTab.clear();
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

  return state.sessionsByTab.get(tabId);
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'origami:get-status') {
    sendResponse({ ok: true, payload: { active: state.active } });
    return false;
  }

  if (message.type === 'origami:start-session') {
    resetState();
    state.active = true;
    state.startedAtMs = Date.now();
    state.controllerTabId = sender?.tab?.id ?? null;
    sendResponse({ ok: true, payload: { active: true } });
    return false;
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
    sendResponse({ ok: true, payload });
    return false;
  }

  if (!state.active) {
    return false;
  }

  const senderTabId = sender?.tab?.id;
  if (typeof senderTabId === 'number' && senderTabId === state.controllerTabId) {
    return false;
  }

  const session = getOrCreateTabSession(sender);
  if (!session) return false;

  if (message.type === 'origami:cursor-point') {
    session.cursorData.push({
      timeMs: toRelativeTime(message.payload?.timeMs ?? Date.now()),
      x: message.payload?.x ?? 0.5,
      y: message.payload?.y ?? 0.5,
    });
    session.lastEventAtMs = Date.now();
    return false;
  }

  if (message.type === 'origami:interaction-point') {
    session.interactionData.push({
      timeMs: toRelativeTime(message.payload?.timeMs ?? Date.now()),
      type: message.payload?.eventType || 'click',
      x: message.payload?.x ?? 0.5,
      y: message.payload?.y ?? 0.5,
    });
    session.lastEventAtMs = Date.now();
    return false;
  }

  return false;
});
