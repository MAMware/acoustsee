import { structuredLog } from '../utils/logging.js';
import { dispatchEvent } from '../core/dispatcher.js';

export class AudioManager {
  constructor() {
    this.context = null;
    this.state = 'uninitialized';
  }

  async initialize(sampleRate = 44100) {
    if (this.state !== 'uninitialized') {
      structuredLog('WARN', 'AudioManager: Already initialized', { currentState: this.state });
      return this.context?.state === 'running';
    }

    try {
      this.state = 'initializing';
      this.context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate });
      
      if (this.context.state === 'suspended') {
        structuredLog('INFO', 'AudioManager: Resuming suspended context');
        await this.context.resume();
      }
      
      if (this.context.state !== 'running') {
        throw new Error(`AudioContext failed to reach running state: ${this.context.state}`);
      }
      
      this.state = 'ready';
      structuredLog('INFO', 'AudioManager: Initialized', { sampleRate, state: this.state });
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