// File: future/web/core/ingest.js

/**
 * Send ingest events to your Wrangler Worker endpoint.
 * @param {string} event - The event name or level.
 * @param {{}} payload - Additional data to send.
 */
import { settings } from './state.js';
import { deviceSummary } from '../utils/performance.js';

const INGEST_ENDPOINT = 'https://acoustsee-analytics.mamware.workers.dev';

// Detect obvious local/test environments to avoid noisy network calls during
// developer runs and headless tests. This is intentionally conservative.
const IS_LOCALHOST = (typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname))
  || (typeof process !== 'undefined' && process.env.NODE_ENV === 'test');

function shouldSendIngest() {
  try {
    if (!settings?.ingestEnabled) return false;
  } catch (e) {
    return false;
  }
  if (IS_LOCALHOST) return false;
  return true;
}

export async function trackFeatureUse(event, payload = {}) {
  // Fast-path: do not attempt network calls in local/test environments.
  if (!shouldSendIngest()) {
    try { if (settings?.debugLogging) console.debug('ingest: suppressed trackFeatureUse for', event); } catch (e) {}
    return;
  }

  try {
    // --- NEW LOGIC ---
    let finalPayload;
    if (event === 'user-report') {
      // For user reports, the payload is already perfectly formatted.
      finalPayload = payload;
    } else {
      // For automatic errors, we build the payload as before.
      const device = (() => {
        try { return deviceSummary(); } catch (e) { return { error: 'device-summary-failed' }; }
      })();
      const { message, source, stack, ...rest } = payload || {};
      finalPayload = {
        level: event,
        message: message || event,
        source: source ?? null,
        stack: stack ?? null,
        ...rest,
        device,
        timestamp_client: Date.now()
      };
    }
    // --- END NEW LOGIC ---

    await fetch(INGEST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(finalPayload) // Send the correct payload
    });
  } catch (err) {
    console.error('Ingest send failed:', err);
  }
}

/**
 * Best-effort emergency beacon. Uses sendBeacon when available.
 */
export function emergencyTrack(eventName, errorPayload = {}) {
  try {
    if (!shouldSendIngest()) {
      try { if (settings?.debugLogging) console.debug('ingest: suppressed emergencyTrack for', eventName); } catch (e) {}
      return;
    }
    const payload = {
      event: eventName,
      payload: errorPayload,
      timestamp: Date.now(),
      isEmergency: true
    };
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(INGEST_ENDPOINT, blob);
      return;
    }
    fetch(INGEST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (e) {
    // silent
  }
}

/**
 * Developer helper to ping the ingest endpoint from the console.
 */
export function pingIngest() {
  try {
    if (!shouldSendIngest()) {
      console.log('pingIngest: suppressed in local/test environment');
      return;
    }
    const endpoint = INGEST_ENDPOINT;
    const testPayload = {
      event: 'ingest-ping',
      payload: { message: 'Ping from client at ' + new Date().toISOString(), randomId: Math.random().toString(36).substring(7) },
      timestamp: Date.now()
    };
    console.log('Pinging ingest endpoint:', endpoint);
    console.log('Payload:', testPayload);
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(testPayload)
    }).then(r => {
      if (r.ok) console.log('%cIngest Ping Succeeded!', 'color: green; font-weight: bold;');
      else console.error('%cIngest Ping Failed!', 'color: red; font-weight: bold;');
      return r.text().catch(() => '');
    }).then(t => { if (t) console.log('Response Body:', t); }).catch(err => console.error('Fetch Error:', err));
  } catch (e) {
    // silent
  }
}

/**
 * Send enriched analytics event with traceId correlation support.
 * This is called by event-bus-analytics.js to forward events to D1.
 * 
 * @param {object} event - Event object from EventBus
 * @param {string} event.traceId - TraceId for correlation
 * @param {string} event.type - Event type (log, command, error)
 * @param {string} event.category - Event category (INFO, DEBUG, etc.)
 * @param {number} event.timestamp - Unix timestamp (ms)
 * @param {object} event.data - Event payload
 */
export async function sendToUnifiedAnalytics(event) {
  if (!shouldSendIngest()) {
    return;
  }

  try {
    // Extract action timestamp from traceId (first 13 chars are milliseconds)
    let actionTimestamp = null;
    if (event.traceId && !event.traceId.startsWith('frame-')) {
      const timestampStr = event.traceId.split('-')[0];
      actionTimestamp = parseInt(timestampStr, 10);
    }

    // Determine action type from event data
    const actionType = determineActionType(event);

    // Get device type from capabilities
    const deviceType = getDeviceType();

    // Get current mode from state
    const mode = getCurrentMode();

    // Get session ID (or generate one)
    const sessionId = getSessionId();

    const payload = {
      type: 'analytics', // Routes to unified_analytics table
      trace_id: event.traceId || null,
      session_id: sessionId,
      timestamp: Math.floor(event.timestamp / 1000), // Convert ms to seconds
      action_timestamp: actionTimestamp,
      event_type: event.type,
      category: event.category,
      action_type: actionType,
      device_type: deviceType,
      mode: mode,
      message: event.data?.message || null,
      data: event.data,
      filename: event.data?.filename || null,
      lineno: event.data?.lineno || null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
    };

    await fetch(INGEST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('Unified analytics send failed:', err);
  }
}

// --- Helper Functions ---

function determineActionType(event) {
  // Map event data to human-readable action types
  const message = event.data?.message || '';
  const category = event.category || '';

  if (message.includes('Synth') || message.includes('synth')) return 'synth_change';
  if (message.includes('Grid') || message.includes('grid')) return 'grid_change';
  if (message.includes('Mode') || message.includes('mode')) return 'mode_change';
  if (message.includes('Power') || message.includes('power')) return 'power_on';
  if (message.includes('Camera') || message.includes('camera')) return 'camera_action';
  if (message.includes('Motion threshold')) return 'threshold_change';
  if (message.includes('Ingest')) return 'analytics_setting';
  if (category === 'audioCuesReady') return 'audio_cues';
  if (event.type === 'error') return 'error';
  
  return event.type; // Fallback to event type
}

function getDeviceType() {
  try {
    const device = deviceSummary();
    if (device.isMobile) return 'mobile';
    if (device.isTablet) return 'tablet';
    return 'desktop';
  } catch (e) {
    return 'unknown';
  }
}

function getCurrentMode() {
  try {
    return settings?.mode || 'unknown';
  } catch (e) {
    return 'unknown';
  }
}

// Session ID management (persists across page reloads)
let sessionId = null;
function getSessionId() {
  if (sessionId) return sessionId;
  
  try {
    // Try to get from sessionStorage (persists across page reloads in same tab)
    if (typeof sessionStorage !== 'undefined') {
      sessionId = sessionStorage.getItem('acoustsee_session_id');
      if (!sessionId) {
        sessionId = generateSessionId();
        sessionStorage.setItem('acoustsee_session_id', sessionId);
      }
      return sessionId;
    }
  } catch (e) {
    // Fallback if sessionStorage not available
  }
  
  sessionId = generateSessionId();
  return sessionId;
}

function generateSessionId() {
  // Generate short session ID: timestamp + random
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}



