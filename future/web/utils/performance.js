// Consolidated performance utilities: device heuristics (DOM-free) and
// an optional DOM runtime benchmark. This replaces the older `device.js`.
// Note: Do not import from core/state.js here to respect subsystem boundaries.
// Any state required by these functions must be passed in by callers.

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

/**
 * Detect device tier for worker timeout adjustment
 * HAR analysis found: Workers timeout on low-end devices with standard SLAs
 * This function estimates device capability for latency budget scaling
 * 
 * Returns: 'low-end' | 'standard'
 * 
 * Detection criteria:
 * - Device memory <= 2GB
 * - CPU cores <= 2
 * - Old device patterns (iPhone 3-5, iPad 1-4, etc.)
 * - WebGL 1 only (no WebGL2 support)
 */
export function detectDeviceTier() {
  try {
    // Check device memory (if available)
    const dm = getDeviceMemory();
    if (dm && dm <= 2) return 'low-end';

    // Check processor count
    const hc = getHardwareConcurrency();
    if (hc && hc <= 2) return 'low-end';

    // Check if running on mobile
    const ua = getUserAgent();
    const isMobileDevice = isMobile();

    // Check if running on specific low-end device patterns
    const isOldMobile = /iPhone [0-9][ ;,]|iPad[ 1-4][ ;,]|Nexus 5|Nexus 5X|Moto G[0-9]|Samsung SM-J|LG-D|ZTE|Xiaomi Redmi|Honor [0-9]T/i.test(ua);
    if (isOldMobile) return 'low-end';

    // Check WebGL performance hints
    try {
      const hasWebGL = !!document.createElement('canvas').getContext('webgl');
      const hasWebGL2 = !!document.createElement('canvas').getContext('webgl2');
      const noModernGPU = !hasWebGL2 && isMobileDevice;
      if (noModernGPU) return 'low-end';
    } catch (e) {
      // If WebGL check fails, continue with other heuristics
    }

    // Mobile with limited concurrency
    if (isMobileDevice && (!hc || hc <= 4)) return 'low-end';

    return 'standard';
  } catch (e) {
    return 'standard'; // Safe default
  }
}

/**
 * Get worker timeout configuration based on device tier and video capture method.
 * 
 * CRITICAL FIX: Canvas fallback timeouts must be 3-4x longer than GPU-accelerated path.
 * 
 * The application uses two video capture methods:
 * 1. GPU-accelerated: MediaStreamTrackProcessor (Chrome, modern Edge)
 *    - High performance: 30-60 FPS, <33ms latency per frame
 *    - Timeout window: 100-200ms comfortable
 * 
 * 2. CPU-based fallback: Canvas 2D (Firefox, Safari, older browsers)
 *    - Lower performance: 4-10 FPS, 100-250ms latency per frame
 *    - Timeout window: 300-600ms needed
 * 
 * Low-end devices get additional 2x adjustment on top of base timeouts.
 * Canvas fallback detection happens in frame-processor.js and is stored in state.
 * 
 * Low-end devices get 2x adjustment:
 * - Flow: 200ms (accommodates 50-150ms actual performance)
 * - Focus: 400ms (accommodates slower depth/semantic workers)
 * - Hybrid: 20ms (still tight but more realistic)
 * 
 * Canvas fallback paths (CPU-bound) need 3x longer:
 * - Flow: 300ms (accommodates 100-250ms CPU motion detection)
 * - Focus: 600ms (accommodates slower CPU depth processing)
 * - Hybrid: 30ms (minimum for CPU, still tight)
 * 
 * Combined (low-end + canvas): 6x multiplier applied
 * 
 * @param {Object} state - Engine state (optional, contains videoCapture.usingCanvasFallback)
 * @returns {Object} Timeout configuration { flowTimeout, focusTimeout, hybridTimeout }
 */
export function getWorkerTimeoutConfig(state = null) {
  const tier = detectDeviceTier();
  const usingCanvas = state?.videoCapture?.usingCanvasFallback || false;
  
  // Base configuration for GPU-accelerated path
  const baseConfig = {
    flowTimeout: 100,      // 100ms - 1 frame at 10fps
    focusTimeout: 200,     // 200ms - comfortable for GPU
    hybridTimeout: 10,     // 10ms - ultra-tight for hybrid
  };

  // Apply low-end device 2x multiplier
  if (tier === 'low-end') {
    baseConfig.flowTimeout = 200;    // 2x adjustment
    baseConfig.focusTimeout = 400;
    baseConfig.hybridTimeout = 20;
  }

  // Apply canvas fallback 3x multiplier
  // Canvas is CPU-bound and significantly slower than GPU-accelerated path
  if (usingCanvas) {
    baseConfig.flowTimeout *= 3;      // 300ms or 600ms with low-end
    baseConfig.focusTimeout *= 3;     // 600ms or 1200ms with low-end
    baseConfig.hybridTimeout *= 3;    // 30ms or 60ms with low-end
    
    structuredLog('DEBUG', 'Canvas fallback detected - timeouts increased for CPU-bound workers', {
      tier,
      flowTimeout: baseConfig.flowTimeout,
      focusTimeout: baseConfig.focusTimeout,
      hybridTimeout: baseConfig.hybridTimeout,
      reason: 'Canvas capture is 3-4x slower than GPU-accelerated MediaStreamTrackProcessor'
    });
  }

  return baseConfig;
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
  // `settings` must be provided by the caller via closure or arguments.
  const scale = (typeof settings !== 'undefined' && settings && typeof settings.autoFpsDownscale === 'number') ? settings.autoFpsDownscale : 0.25;
  const samples = (typeof settings !== 'undefined' && settings && typeof settings.autoFpsSamples === 'number') ? Math.max(1, Math.min(4, settings.autoFpsSamples)) : 2;

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
    // Caller should attach a `_frameProcessor` to the provided settings object if available
    const proc = (typeof settings !== 'undefined' && settings && settings._frameProcessor) ? settings._frameProcessor : null;
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
