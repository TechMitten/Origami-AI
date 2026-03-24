if (window.top === window && !window.__origamiAiBridgeInstalled) {
  window.__origamiAiBridgeInstalled = true;
  const REQUEST_SOURCE = 'origami-app-extension-bridge';
  const RESPONSE_SOURCE = 'origami-extension-app-bridge';
  let lastScrollAt = 0;

  function normalizePoint(clientX, clientY) {
    const width = Math.max(window.innerWidth || 1, 1);
    const height = Math.max(window.innerHeight || 1, 1);
    return {
      x: clientX / width,
      y: clientY / height,
    };
  }

  function sendRuntimeMessage(type, payload) {
    try {
      chrome.runtime.sendMessage({ type, payload });
    } catch (error) {
      console.debug('Origami bridge runtime message failed.', error);
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
      : data.action === 'start-session' ? 'origami:start-session'
      : data.action === 'stop-session' ? 'origami:stop-session'
      : null;

    if (!messageType) {
      respond({ ok: false, error: `Unknown action: ${data.action}` });
      return;
    }

    chrome.runtime.sendMessage({ type: messageType, payload: data.payload }, (response) => {
      if (chrome.runtime.lastError) {
        respond({ ok: false, error: chrome.runtime.lastError.message || 'Origami extension bridge unavailable.' });
        return;
      }
      respond(response || { ok: false, error: 'No response from Origami extension.' });
    });
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
