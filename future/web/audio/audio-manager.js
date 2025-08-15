// Robust AudioManager
import { structuredLog } from '../utils/logging.js';
import { trackFeatureUse } from '../core/ingest.js';
// - Call unlockAudio(event) from a real user gesture (tap/click/pointerdown).
// - After unlock succeeds, call initialize() to build any audio graph nodes.

export class AudioManager {
  constructor(opts = {}) {
    this.opts = opts;
    this.AudioCtxClass = (window.AudioContext || window.webkitAudioContext);
    this._ctx = null;
    this.state = 'idle'; // idle | created | unlocked | running | suspended | closed
    this._unlocked = false;
    this._listeners = new Map();
    this._resumeRetries = 0;
    this._maxRetries = opts.maxRetries || 5;
    this._retryDelayBase = opts.retryDelayBase || 200; // ms

    this._bindVisibility();
  }

  // --- Events ---
  on(name, cb) { if (!this._listeners.has(name)) this._listeners.set(name, []); this._listeners.get(name).push(cb); }
  off(name, cb) { const arr = this._listeners.get(name); if (!arr) return; const i = arr.indexOf(cb); if (i >= 0) arr.splice(i, 1); }
  _emit(name, ...args) { const arr = this._listeners.get(name) || []; arr.slice().forEach(cb => { try { cb(...args); } catch(e){ console.error(e); } }); }

  // Public getter for external code
  get context() { return this._ctx; }

  // Lazily create AudioContext when needed
  _createContextIfNeeded() {
    if (!this._ctx) {
      if (!this.AudioCtxClass) {
        throw new Error('Web Audio API not supported');
      }
      this._ctx = new this.AudioCtxClass();
      this.state = 'created';
    }
    return this._ctx;
  }

  // Public: call from a user gesture. Returns true if unlocked.
  async unlockAudio(userEvent = null) {
    if (this._unlocked) return true;
    try {
  structuredLog('INFO', 'AudioManager: unlockAudio called', { hasEvent: !!userEvent });
      const ctx = this._createContextIfNeeded();

      if (ctx.state === 'suspended') {
        // Some browsers only allow resume inside a user gesture.
        await ctx.resume();
      }

      // Do a minimal silent buffer hit to maximize unlock coverage.
      this._trySilentHit(ctx);

      if (ctx.state === 'running') {
        this._unlocked = true;
        this.state = 'unlocked';
        try { sessionStorage.setItem('audio-unlocked', '1'); } catch(e){}
        structuredLog('INFO', 'AudioManager: AudioContext running after unlock');
  try { trackFeatureUse('audio-unlock', { success: true, ua: navigator.userAgent }); } catch(e){}
        this._emit('unlocked');
        return true;
      }

      // If still suspended, try a controlled retry strategy.
      return await this._retryResume();
    } catch (err) {
      console.warn('AudioManager: unlock failed', err && err.message);
      this._emit('unlock-failed', err);
      return false;
    }
  }

  _trySilentHit(ctx) {
    try {
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
      src.stop(0);
    } catch (e) {
      // non-fatal
    }
  }

  async _retryResume() {
    const ctx = this._ctx;
    while (this._resumeRetries < this._maxRetries) {
      const delay = Math.pow(2, this._resumeRetries) * this._retryDelayBase;
      await new Promise(r => setTimeout(r, delay));
      try {
        if (ctx.state === 'suspended') await ctx.resume();
        this._trySilentHit(ctx);
      } catch (e) {
        // ignore, keep retrying
      }
  structuredLog('INFO', 'AudioManager: retryResume attempt', { attempt: this._resumeRetries + 1, state: ctx.state });
  try { trackFeatureUse('audio-unlock-retry', { attempt: this._resumeRetries + 1, state: ctx.state }); } catch(e){}
      this._resumeRetries++;
      if (ctx.state === 'running') {
        this._unlocked = true;
        this.state = 'unlocked';
        try { sessionStorage.setItem('audio-unlocked', '1'); } catch(e){}
        this._emit('unlocked');
        return true;
      }
    }
  structuredLog('ERROR', 'AudioManager: resume retries exceeded');
  try { trackFeatureUse('audio-unlock', { success: false, reason: 'max-retries' }); } catch(e){}
  this._emit('unlock-failed', new Error('max resume retries exceeded'));
    return false;
  }

  // Initialize audio graph / nodes after context exists. Keep this lightweight.
  // Consumers should pass a builder function to create nodes and return a teardown.
  async initialize(builderFn = null) {
    this._createContextIfNeeded();
    if (typeof builderFn === 'function') {
      try {
        // allow builder to create nodes synchronously
        const teardown = builderFn(this._ctx);
        this._teardown = teardown;
      } catch (e) {
        this._emit('error', e);
        throw e;
      }
    }
    // mark running if context is running
    if (this._ctx.state === 'running') this.state = 'running';
  }

  async suspend() {
    if (!this._ctx) return;
    try {
      await this._ctx.suspend();
      this.state = 'suspended';
      this._emit('suspended');
    } catch (e) { this._emit('error', e); }
  }

  async resume() {
    if (!this._ctx) return;
    try {
      await this._ctx.resume();
      this.state = 'running';
      this._emit('resumed');
    } catch (e) { this._emit('error', e); }
  }

  async close() {
    if (!this._ctx) return;
    try {
      if (this._teardown) {
        try { this._teardown(); } catch(e){}
      }
      if (this._ctx.close) await this._ctx.close();
    } catch (e) { console.warn('AudioManager: close failed', e); }
    this._ctx = null;
    this._unlocked = false;
    this.state = 'closed';
    try { sessionStorage.removeItem('audio-unlocked'); } catch(e){}
    this._emit('closed');
  }

  _bindVisibility() {
    this._onVisibility = async () => {
      if (document.visibilityState === 'visible' && this._ctx && this._ctx.state === 'suspended') {
        try { await this._ctx.resume(); this._emit('resumed'); } catch(e){}
      }
    };
    document.addEventListener('visibilitychange', this._onVisibility);
  }

  destroy() {
    document.removeEventListener('visibilitychange', this._onVisibility);
  }
}

export default AudioManager;

// Compatibility helpers for modules that expect a module-level getter
export function getAudioManager() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.DOM && globalThis.DOM.audioManager) return globalThis.DOM.audioManager;
    if (typeof window !== 'undefined' && window.DOM && window.DOM.audioManager) return window.DOM.audioManager;
  } catch (e) {
    // ignore
  }
  return null;
}

export function getAudioContext() {
  const mgr = getAudioManager();
  return mgr ? mgr.context : null;
}
