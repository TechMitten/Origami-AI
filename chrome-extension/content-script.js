if (window.top === window && !window.__origamiAiBridgeInstalled) {
  window.__origamiAiBridgeInstalled = true;
  const REQUEST_SOURCE = 'origami-app-extension-bridge';
  const RESPONSE_SOURCE = 'origami-extension-app-bridge';
  const SHARE_REMINDER_MESSAGE_TYPE = 'origami:show-share-reminder';
  const REMINDER_BANNER_ID = 'origami-extension-share-reminder';
  const REMINDER_BANNER_STYLE_ID = 'origami-extension-share-reminder-style';
  const REMINDER_HIDE_DELAY_MS = 6500;
  let lastScrollAt = 0;
  let reminderHideTimer = null;

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

  function ensureReminderStyle() {
    if (document.getElementById(REMINDER_BANNER_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = REMINDER_BANNER_STYLE_ID;
    style.textContent = `
      #${REMINDER_BANNER_ID} {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        max-width: min(92vw, 680px);
        padding: 12px 16px;
        border-radius: 14px;
        background: rgba(10, 10, 10, 0.92);
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, 0.18);
        box-shadow: 0 14px 32px rgba(0, 0, 0, 0.35);
        font: 600 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0.01em;
        backdrop-filter: blur(10px);
      }

      #${REMINDER_BANNER_ID}[hidden] {
        display: none !important;
      }

      #${REMINDER_BANNER_ID} strong {
        color: #ffd54f;
        font-weight: 700;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function ensureReminderBanner() {
    ensureReminderStyle();

    let banner = document.getElementById(REMINDER_BANNER_ID);
    if (banner) return banner;

    banner = document.createElement('div');
    banner.id = REMINDER_BANNER_ID;
    banner.hidden = true;
    banner.innerHTML = `If Chrome shows <strong>"Start sharing this tab"</strong>, click it to keep recording this tab.`;
    (document.body || document.documentElement).appendChild(banner);
    return banner;
  }

  function hideShareReminder() {
    const banner = document.getElementById(REMINDER_BANNER_ID);
    if (banner) {
      banner.hidden = true;
    }
    if (reminderHideTimer !== null) {
      window.clearTimeout(reminderHideTimer);
      reminderHideTimer = null;
    }
  }

  function showShareReminder() {
    const banner = ensureReminderBanner();
    banner.hidden = false;

    if (reminderHideTimer !== null) {
      window.clearTimeout(reminderHideTimer);
    }

    reminderHideTimer = window.setTimeout(() => {
      hideShareReminder();
    }, REMINDER_HIDE_DELAY_MS);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== 'string') return;
    if (message.type !== SHARE_REMINDER_MESSAGE_TYPE) return;
    showShareReminder();
  });

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
