// Small device capability utilities used across the app.
// Keep functions defensive so they work in non-DOM/test environments.

export function getUserAgent() {
  try { return (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : 'node'; } catch (e) { return 'node'; }
}

export function getPlatform() {
  try { return (typeof navigator !== 'undefined' && navigator.platform) ? navigator.platform : 'Unknown'; } catch (e) { return 'Unknown'; }
}

export function isMobile() {
  const ua = getUserAgent();
  return /Mobile|Android|iPhone|iPad/.test(ua);
}

export function getDeviceMemory() {
  try { return (typeof navigator !== 'undefined' && navigator.deviceMemory) ? navigator.deviceMemory : null; } catch (e) { return null; }
}

export function getHardwareConcurrency() {
  try { return (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : null; } catch (e) { return null; }
}

/**
 * Compute an announce rewrite delay based on device heuristics. Base should be the
 * configured default (e.g., 150ms). This centralizes the logic used in announceMessage.
 */
export function computeAnnounceDelay(base = 150) {
  let delay = base;
  try {
    const ua = getUserAgent();
    if (/Android|iPhone|iPad/.test(ua)) delay = Math.max(delay, 200);
    if (/Android\s?(8|9)|Android\/8|Android\/9|iPhone OS 12|iPhone OS 13/.test(ua)) delay = Math.max(delay, 300);
    const dm = getDeviceMemory();
    if (dm && dm < 2) delay = Math.max(delay, 300);
    const hc = getHardwareConcurrency();
    if (hc && hc < 2) delay = Math.max(delay, 350);
  } catch (e) {
    // swallow and return base
  }
  return delay;
}

export function deviceSummary() {
  return {
    userAgent: getUserAgent(),
    platform: getPlatform(),
    isMobile: isMobile(),
    deviceMemory: getDeviceMemory(),
    hardwareConcurrency: getHardwareConcurrency()
  };
}
