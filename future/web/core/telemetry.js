// File: future/web/core/telemetry.js

/**
 * Send telemetry events to your Wrangler Worker endpoint.
 * @param {string} event - The event name or level.
 * @param {{}} payload - Additional data to send.
 */
export async function trackFeatureUse(event, payload = {}) {
  try {
    await fetch('https://acoustsee-analytics.mamware.workers.dev', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        event,
        payload,
        timestamp: Date.now()
      })
    });
  } catch (err) {
    console.error('Telemetry send failed:', err);
  }
}
