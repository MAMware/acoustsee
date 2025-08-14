import { structuredLog } from '../utils/logging.js';
import { dispatchEvent } from '../core/dispatcher.js';

let globalAudioManager = null;

export class AudioManager {
  constructor() {
    this.context = null;
    this.state = 'uninitialized';
    // Create the context immediately, it will be in a suspended state.
    try {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.state = 'error';
      structuredLog('ERROR', 'AudioContext creation failed.', { message: e.message });
    }

    if (!globalAudioManager) {
      globalAudioManager = this;
    }
  }

  /**
   * This is a synchronous function designed to be called directly
   * from a user gesture event listener (e.g., 'pointerdown').
   */
  unlockAudio() {
    if (!this.context) return Promise.reject(new Error("AudioContext not created."));
    if (this.context.state === 'suspended') {
      structuredLog('INFO', 'AudioManager: Attempting to resume suspended context.');
      return this.context.resume(); // This returns a promise
    }
    // If it's already running or closed, resolve immediately.
    return Promise.resolve();
  }

  async initialize() {
    if (this.state === 'ready') {
      structuredLog('WARN', 'AudioManager: Already initialized.');
      return true;
    }
    if (!this.context) {
      throw new Error("Cannot initialize, AudioContext creation failed.");
    }

    this.state = 'initializing';
    try {
      // The context is already created. We just check its state.
      if (this.context.state !== 'running') {
        throw new Error(`AudioContext is not in a running state after unlock attempt. State: ${this.context.state}`);
      }

      this.state = 'ready';
      structuredLog('INFO', 'AudioManager: Initialized.', { sampleRate: this.context.sampleRate, state: this.state });
      return true;
    } catch (error) {
      this.state = 'error';
      structuredLog('ERROR', 'AudioManager init error', { message: error.message });
      dispatchEvent('logError', { message: `Audio init error: ${error.message}` });
      throw error;
    }
  }

  async cleanup() {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.state = 'uninitialized';
      structuredLog('INFO', 'AudioManager: Cleaned up');
    }
  }

  getState() {
    return { state: this.state, contextState: this.context?.state };
  }
}

export function getAudioContext() {
  return globalAudioManager ? globalAudioManager.context : null;
}