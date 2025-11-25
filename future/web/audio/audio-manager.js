// Robust AudioManager
import { structuredLog } from '../utils/logging.js';
import { trackFeatureUse } from '../core/ingest.js';
// - Call unlockAudio(event) from a real user gesture (tap/click/pointerdown).
// - After unlock succeeds, call initialize() to build any audio graph nodes.

export class AudioManager {
  constructor(opts = {}) {
    this.opts = opts;
    const AudioCtxClass = (window.AudioContext || window.webkitAudioContext);
    
    // PRODUCTION GRADE: Audio is required. Create AudioContext immediately.
    // The app's sole purpose is video-to-audio conversion. No lazy initialization.
    if (!AudioCtxClass) {
      throw new Error('Web Audio API not supported. This application requires audio.');
    }
    
    // Create AudioContext NOW. It starts in 'suspended' state (browser security).
    // Power-on gesture will resume it.
    this._ctx = new AudioCtxClass();
    this.state = 'created'; // created | unlocked | running | suspended | closed
    this._unlocked = false;
    this._listeners = new Map();
    this._resumeRetries = 0;
    this._maxRetries = opts.maxRetries || 5;
    this._retryDelayBase = opts.retryDelayBase || 200; // ms

    structuredLog('INFO', 'AudioManager: AudioContext created', { 
      state: this._ctx.state,
      sampleRate: this._ctx.sampleRate 
    });

    this._bindVisibility();
  }

  // --- Events ---
  on(name, cb) { if (!this._listeners.has(name)) this._listeners.set(name, []); this._listeners.get(name).push(cb); }
  off(name, cb) { const arr = this._listeners.get(name); if (!arr) return; const i = arr.indexOf(cb); if (i >= 0) arr.splice(i, 1); }
  _emit(name, ...args) { const arr = this._listeners.get(name) || []; arr.slice().forEach(cb => { try { cb(...args); } catch(e){ console.error(e); } }); }

  // Public getter for external code
  get context() { return this._ctx; }

  // Public: call from a user gesture. Returns true if unlocked.
  // This RESUMES the AudioContext (which was already created in constructor).
  async unlockAudio(userEvent = null) {
    if (this._unlocked) return true;
    
    try {
      structuredLog('INFO', 'AudioManager: unlockAudio called', { 
        hasEvent: !!userEvent,
        currentState: this._ctx.state 
      });
      
      // Verify we have a real user gesture
      const powerFlag = !!(typeof window !== 'undefined' && window.__acoustseePowerGesture);
      if (userEvent && typeof userEvent.isTrusted === 'boolean' && !userEvent.isTrusted && !powerFlag) {
        structuredLog('WARN', 'AudioManager: unlockAudio rejected - event not trusted and no power flag');
        return false;
      }

      // Resume the AudioContext (browser requires user gesture)
      if (this._ctx.state === 'suspended') {
        await this._ctx.resume();
      }

      // Do a minimal silent buffer hit to maximize unlock coverage
      this._trySilentHit(this._ctx);

      if (this._ctx.state === 'running') {
        this._unlocked = true;
        this.state = 'unlocked';
        try { sessionStorage.setItem('audio-unlocked', '1'); } catch(e){}
        structuredLog('INFO', 'AudioManager: AudioContext running after unlock');
        try { trackFeatureUse('audio-unlock', { success: true, ua: navigator.userAgent }); } catch(e){}
        this._emit('unlocked');
        return true;
      }

      // If still suspended, try a controlled retry strategy
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
    // AudioContext already exists (created in constructor)
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
    // Note: We DON'T try to resume on visibility change because:
    // 1. Browser requires a user gesture to resume AudioContext
    // 2. Visibility change is NOT a user gesture, so resume() will fail
    // 3. Attempting resume triggers unhelpful browser warnings
    // Real unlock happens only after user interaction via unlockAudio()
    this._onVisibility = () => {
      // This could be extended to handle other visibility-related logic
      // but should NOT attempt to resume AudioContext
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
