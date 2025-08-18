// File: future/web/core/ingest.js

/**
 * Send ingest events to your Wrangler Worker endpoint.
 * @param {string} event - The event name or level.
 * @param {{}} payload - Additional data to send.
 */
import { settings } from './state.js';
import { deviceSummary } from '../utils/performance.js';

const INGEST_ENDPOINT = 'https://acoustsee-analytics.mamware.workers.dev';

export async function trackFeatureUse(event, payload = {}) {
  try {
    if (!settings?.ingestEnabled) return;
  } catch (e) {
    // If settings can't be read, don't block the app; no telemetry sent.
    return;
  }

  try {
    const device = (() => {
      try { return deviceSummary(); } catch (e) { return { error: 'device-summary-failed' }; }
    })();

    // Build a D1-friendly payload. The Cloudflare Worker will expect at least
    // `level` and `message` (mapped from `event` and `payload.message`). Any
    // remaining properties will be sent along and stringified there.
    const { message, source, stack, ...rest } = payload || {};
    const logPayload = {
      level: event, // e.g. 'globalError', 'INFO', 'WARN', 'ERROR'
      message: message || event,
      source: source ?? null,
      stack: stack ?? null,
      ...rest,
      device,
      timestamp_client: Date.now()
    };

    await fetch(INGEST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(logPayload)
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


