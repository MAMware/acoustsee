// File: future/web/core/telemetry.js

/**
 * Send telemetry events to your Wrangler Worker endpoint.
 * @param {string} event - The event name or level.
 * @param {{}} payload - Additional data to send.
 */
import { settings } from './state.js';
import { deviceSummary } from '../utils/device.js';

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

    await fetch('https://acoustsee-analytics.mamware.workers.dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event,
        payload: Object.assign({}, payload, { device }),
        timestamp: Date.now()
      })
    });
  } catch (err) {
    console.error('Telemetry send failed:', err);
  }
}
