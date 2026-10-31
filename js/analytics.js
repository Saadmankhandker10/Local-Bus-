// Lightweight Client Analytics Dispatcher for Local Bus: Dhaka Route.
// Tracks funnel events: game_ready, run_start, run_end, install_offer, share_click, dare_created, email_subscribed.

const SESSION_KEY = "localbus.analytics_session";
let sessionId = null;

function getSessionId() {
  if (!sessionId) {
    try {
      sessionId = sessionStorage.getItem(SESSION_KEY);
      if (!sessionId) {
        sessionId = "s_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
        sessionStorage.setItem(SESSION_KEY, sessionId);
      }
    } catch {
      sessionId = "s_" + Math.random().toString(36).substring(2, 9);
    }
  }
  return sessionId;
}

/**
 * Dispatches an analytics event to console, dataLayer, and gtag.
 * @param {string} eventName
 * @param {object} params
 */
export function trackEvent(eventName, params = {}) {
  const payload = {
    event: eventName,
    session_id: getSessionId(),
    timestamp: new Date().toISOString(),
    ...params
  };

  // 1. Diagnostics console
  if (typeof window !== "undefined" && window.__localBusDebug) {
    console.log("[Analytics]", eventName, payload);
  }

  // 2. Google Tag Manager / dataLayer integration
  if (typeof window !== "undefined" && Array.isArray(window.dataLayer)) {
    window.dataLayer.push(payload);
  }

  // 3. Google Analytics 4 (gtag) integration
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
  }

  return payload;
}
