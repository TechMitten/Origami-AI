if (window.top === window && !window.__origamiAiBridgeInstalled) {
  window.__origamiAiBridgeInstalled = true;
  const REQUEST_SOURCE = 'origami-app-extension-bridge';
  const RESPONSE_SOURCE = 'origami-extension-app-bridge';
  const EVENT_SOURCE = 'origami-extension-app-event';
  let lastScrollAt = 0;
  let runtimeAvailable = true;
  let runtimeUnavailableLogged = false;

  function markRuntimeUnavailable(error) {
    runtimeAvailable = false;
    if (runtimeUnavailableLogged) return;
    runtimeUnavailableLogged = true;
    console.debug('Origami extension runtime is unavailable; refresh the page after reloading the extension.', error);
  }

  function canUseRuntime() {
    return runtimeAvailable && !!chrome?.runtime?.id;
  }

  function normalizePoint(clientX, clientY) {
    const width = Math.max(window.innerWidth || 1, 1);
    const height = Math.max(window.innerHeight || 1, 1);
    return {
      x: clientX / width,
      y: clientY / height,
    };
  }

  function sendRuntimeMessage(type, payload) {
    if (!canUseRuntime()) return;
    try {
      chrome.runtime.sendMessage({ type, payload });
    } catch (error) {
      markRuntimeUnavailable(error);
    }
  }

  function getRelativeWallClockMs() {
    if (typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin) && Number.isFinite(performance.now())) {
      return performance.timeOrigin + performance.now();
    }
    return Date.now();
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== REQUEST_SOURCE || typeof data.action !== 'string') return;

    const respond = (response) => {
      window.postMessage(
        {
          source: RESPONSE_SOURCE,
          requestId: data.requestId,
          response,
        },
        '*'
      );
    };

    const messageType =
      data.action === 'get-status' ? 'origami:get-status'
      : data.action === 'arm-recording' ? 'origami:arm-recording'
      : data.action === 'stop-session' ? 'origami:stop-session'
      : null;

    if (!messageType) {
      respond({ ok: false, error: `Unknown action: ${data.action}` });
      return;
    }

    if (!canUseRuntime()) {
      respond({ ok: false, error: 'Origami extension bridge unavailable. Reload the page after reloading the extension.' });
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: messageType, payload: data.payload }, (response) => {
        if (chrome.runtime.lastError) {
          markRuntimeUnavailable(chrome.runtime.lastError.message);
          respond({ ok: false, error: chrome.runtime.lastError.message || 'Origami extension bridge unavailable.' });
          return;
        }
        respond(response || { ok: false, error: 'No response from Origami extension.' });
      });
    } catch (error) {
      markRuntimeUnavailable(error);
      respond({ ok: false, error: 'Origami extension bridge unavailable. Reload the page after reloading the extension.' });
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'origami:stop-recording-requested') {
      window.postMessage(
        {
          source: EVENT_SOURCE,
          eventType: 'stop-recording-requested',
        },
        '*'
      );
      return;
    }

    if (message?.type === 'origami:recording-source-ready') {
      window.postMessage(
        {
          source: EVENT_SOURCE,
          eventType: 'recording-source-ready',
          payload: message.payload,
        },
        '*'
      );
      return;
    }

    if (message?.type === 'origami:recording-start-failed') {
      window.postMessage(
        {
          source: EVENT_SOURCE,
          eventType: 'recording-start-failed',
          payload: message.payload,
        },
        '*'
      );
    }
  });

  window.addEventListener('mousemove', (event) => {
    const point = normalizePoint(event.clientX, event.clientY);
    sendRuntimeMessage('origami:cursor-point', {
      timeMs: getRelativeWallClockMs(),
      x: point.x,
      y: point.y,
    });
  });

  window.addEventListener('mousedown', (event) => {
    const point = normalizePoint(event.clientX, event.clientY);
    sendRuntimeMessage('origami:interaction-point', {
      timeMs: getRelativeWallClockMs(),
      eventType: 'click',
      x: point.x,
      y: point.y,
    });
  });

  window.addEventListener('keypress', () => {
    let point = { x: 0.5, y: 0.5 };
    const active = document.activeElement;
    if (active && typeof active.getBoundingClientRect === 'function') {
      const rect = active.getBoundingClientRect();
      point = normalizePoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2));
    }

    sendRuntimeMessage('origami:interaction-point', {
      timeMs: getRelativeWallClockMs(),
      eventType: 'keypress',
      x: point.x,
      y: point.y,
    });
  });

  window.addEventListener('wheel', () => {
    const now = performance.now();
    if (now - lastScrollAt < 250) return;
    lastScrollAt = now;

    sendRuntimeMessage('origami:interaction-point', {
      timeMs: getRelativeWallClockMs(),
      eventType: 'scroll',
      x: 0.5,
      y: 0.5,
    });
  }, { capture: true, passive: true });
}
