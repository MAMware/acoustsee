import { structuredLog } from '../utils/logging.js';
import { dispatchEvent } from '../core/dispatcher.js';

let globalAudioManager = null;

export class AudioManager {
  constructor() {
    this.context = null;
    this.state = 'uninitialized';
    if (!globalAudioManager) {
      globalAudioManager = this;
    }
  }

  // Initialize optionally accepts a pre-created AudioContext
  async initialize(preCreatedContext = null) {
    if (this.state !== 'uninitialized') {
      structuredLog('WARN', 'AudioManager: Already initialized', { currentState: this.state });
      return this.context?.state === 'running';
    }

    try {
      this.state = 'initializing';
      // Use preCreatedContext if provided, otherwise create new AudioContext
      this.context = preCreatedContext || new (window.AudioContext || window.webkitAudioContext)();
      
      if (this.context.state === 'suspended') {
        structuredLog('INFO', 'AudioManager: Resuming suspended context');
        await this.context.resume();
      }
      
      if (this.context.state !== 'running') {
        throw new Error(`AudioContext failed to reach running state: ${this.context.state}`);
      }
      
      this.state = 'ready';
      structuredLog('INFO', 'AudioManager: Initialized', { sampleRate: this.context.sampleRate, state: this.state });
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

/**
 * Provides access to the singleton AudioContext instance.
 * @returns {AudioContext|null} The global AudioContext, or null if not initialized.
 */
export function getAudioContext() {
    return globalAudioManager ? globalAudioManager.context : null;
}