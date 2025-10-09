// Consolidated performance utilities: device heuristics (DOM-free) and
// an optional DOM runtime benchmark. This replaces the older `device.js`.
import { setAutoFpsBenchmark, settings } from '../core/state.js';

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

export function computeDefaultUpdateInterval(baseFps = 20) {
  try {
    let fps = baseFps;
    const dm = getDeviceMemory();
    const hc = getHardwareConcurrency();
    if (isMobile()) fps = Math.min(fps, 15);
    if (dm && dm < 2) fps = Math.min(fps, 10);
    if (hc && hc < 2) fps = Math.min(fps, 12);
    fps = Math.max(8, Math.floor(fps));
    return Math.round(1000 / fps);
  } catch (e) {
    return Math.round(1000 / baseFps);
  }
}

export function computeDefaultMaxNotes(base = 24, { isMobile: isMobileOverride, getDeviceMemory: getDeviceMemoryOverride, getHardwareConcurrency: getHardwareConcurrencyOverride } = {}) {
  try {
    let max = base;
    const dm = getDeviceMemoryOverride ? getDeviceMemoryOverride() : getDeviceMemory();
    const hc = getHardwareConcurrencyOverride ? getHardwareConcurrencyOverride() : getHardwareConcurrency();
    if (isMobileOverride ? isMobileOverride() : isMobile()) max = Math.min(max, 12);
    if (dm && dm < 2) max = Math.min(max, 6);
    if (hc && hc < 2) max = Math.min(max, 8);
    max = Math.max(1, Math.floor(max));
    return max;
  } catch (e) {
    return base;
  }
}

// DOM-dependent runtime benchmark (kept here for consolidation). It is
// guarded and will only run when a video/canvas/process function is provided.
export async function computeAutoIntervalBenchmark(video, canvas, processFrameWithState, DEFAULT_TARGET_FPS = 15) {
  try {
    if (!video || !canvas || !processFrameWithState) return 1000 / DEFAULT_TARGET_FPS;

    const waitForReady = (timeoutMs = 1000) => new Promise((resolve) => {
      const start = Date.now();
      (function check() {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) return resolve(true);
        if (Date.now() - start > timeoutMs) return resolve(false);
        requestAnimationFrame(check);
      })();
    });

    const ready = await waitForReady(1000);
    if (!ready) return 1000 / DEFAULT_TARGET_FPS;

    // Request a context optimized for repeated readbacks. We intentionally
    // do not fallback to a non-willReadFrequently context because Phase 1
    // targets speed / battery improvements only.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Configurable test scale and sample count (small values => much less CPU/battery)
    const scale = (settings && typeof settings.autoFpsDownscale === 'number') ? settings.autoFpsDownscale : 0.25;
    const samples = (settings && typeof settings.autoFpsSamples === 'number') ? Math.max(1, Math.min(4, settings.autoFpsSamples)) : 2;

    const testW = Math.max(64, Math.floor(canvas.width * scale));
    const testH = Math.max(48, Math.floor(canvas.height * scale));

    const N = samples;
    let totalMs = 0;
    let measuredCount = 0;

    // Allow the page to settle for two frames
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const useRvf = typeof video.requestVideoFrameCallback === 'function';

    // Reuse image data variable to avoid allocations inside the hot loop
    let img = null;

    for (let i = 0; i < N; i++) {
      try {
        // Draw downscaled to reduce pixel work
        ctx.drawImage(video, 0, 0, testW, testH);
      } catch (e) {
        break;
      }

      try {
        img = ctx.getImageData(0, 0, testW, testH);
      } catch (e) {
        break;
      }

      // If an external preallocated buffer exists, copy into it and pass that
      // to the processor to avoid creating additional per-iteration arrays.
      const expectedLen = testW * testH * 4;
      let frameBufferToUse = img.data;
      try {
        if (settings && settings._frameBuffer && settings._frameBuffer.length === expectedLen) {
          settings._frameBuffer.set(img.data);
          frameBufferToUse = settings._frameBuffer;
        }
      } catch (e) {
        // ignore and fall back to img.data
        frameBufferToUse = img.data;
      }

      const t0 = performance.now();
      try {
        // If processor supports smaller resolution or buffer reuse, prefer that to save CPU/battery
        await processFrameWithState(frameBufferToUse, testW, testH);
      } catch (e) {
        break;
      }
      const t1 = performance.now();
      totalMs += (t1 - t0);
      measuredCount += 1;

      if (useRvf) {
        // Align to the next actual video frame (more power efficient than busy rAF)
        await new Promise(r => video.requestVideoFrameCallback(() => r()));
      } else {
        await new Promise(r => requestAnimationFrame(r));
      }
    }

    if (!measuredCount) return 1000 / DEFAULT_TARGET_FPS;
    const avgMs = totalMs / measuredCount;
    const safetyFactor = 0.7;
    const effectiveMs = Math.max(avgMs / safetyFactor, 1000 / 30);
    const targetFps = Math.max(8, Math.min(Math.floor(1000 / effectiveMs), 30));

    // Return computed metadata; callers should persist via engine commands
    const computed = { intervalMs: Math.round(1000 / targetFps), sampleCount: measuredCount, safetyFactor, downscaleFactor: scale };
    return computed.intervalMs;

    return 1000 / targetFps;
  } catch (e) {
    return 1000 / DEFAULT_TARGET_FPS;
  }
}

/**
 * Decision helper: prefer persisted benchmark (if recent), otherwise run DOM benchmark
 * when allowed, and finally fall back to computeDefaultUpdateInterval.
 */
export async function getPreferredIntervalMs({ forceBenchmark = false, maxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  try {
    const baselineMs = computeDefaultUpdateInterval();
    if (!settings?.autoFPS) return baselineMs;

    const bench = settings.autoFpsBenchmark || {};
    const now = Date.now();
    if (!forceBenchmark && bench.lastIntervalMs && bench.measuredAt && (now - bench.measuredAt) < maxAgeMs) {
      return bench.lastIntervalMs;
    }

    // Try DOM benchmark if possible
    try {
      const video = (typeof document !== 'undefined') ? document.getElementById('videoFeed') : null;
      const canvas = (typeof document !== 'undefined') ? document.getElementById('frameCanvas') : null;
      const proc = settings._frameProcessor || null;
      if (video && canvas && proc) {
        const ms = await computeAutoIntervalBenchmark(video, canvas, proc);
      if (ms && Number.isFinite(ms)) return ms;
      }
    } catch (e) {
      // fall back to baseline
    }

    return baselineMs;
  } catch (e) {
    return computeDefaultUpdateInterval();
  }
}

// --- Session health helpers (lightweight, DOM-free state) ---
const sessionErrors = [];
const DEFAULT_MAX_BUFFER = 100;

/**
 * Add an error payload to the session buffer for later aggregation.
 */
export function addSessionError(errorPayload) {
  try {
    sessionErrors.push({ ...(errorPayload || {}), timestamp: Date.now() });
    if (sessionErrors.length > DEFAULT_MAX_BUFFER) sessionErrors.shift();
  } catch (e) {
    // swallow; health logging must not throw
  }
}

/**
 * Start a periodic health checker that aggregates recent session errors and
 * calls reportFn(eventName, payload) when thresholds are exceeded.
 * Returns a stop function.
 */
export function startHealthChecker({ reportFn, intervalMs = 60 * 1000, errorThreshold = 5, timeframeMs = 2 * 60 * 1000 } = {}) {
  if (typeof reportFn !== 'function') throw new Error('reportFn required');

  const id = setInterval(() => {
    try {
      const now = Date.now();
      const recent = sessionErrors.filter(e => now - e.timestamp < timeframeMs);

      const counts = {};
      for (const e of recent) counts[e.message] = (counts[e.message] || 0) + 1;
      const repeated = Object.entries(counts).filter(([_, c]) => c > 2);

      if (recent.length > errorThreshold || repeated.length > 0) {
        try {
          reportFn('session-health-degraded', {
            errorCount: recent.length,
            repeatedErrors: repeated,
            sample: recent.slice(-5).map(e => e.message),
            timeframeMinutes: timeframeMs / (60 * 1000),
            lastErrorMessage: recent[recent.length - 1]?.message
          });
        } catch (e) {
          // swallow; reporter may throw
        }
        sessionErrors.length = 0;
      }
    } catch (e) {
      // swallow - health checker should be resilient
    }
  }, intervalMs);

  return () => clearInterval(id);
}
