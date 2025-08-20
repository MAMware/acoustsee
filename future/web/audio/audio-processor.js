// File: web/audio/audio-processor.js

import { settings } from '../core/state.js';
import { structuredLog } from '../utils/logging.js';

let audioManager = null;
const oscillatorPool = [];
const activeOscillators = new Map();
let masterGain = null;
// --- State for Microphone Pass-through ---
let micSourceNode = null;
let micGainNode = null;
let micPassThroughEnabled = false;
// Queue a mic stream if it's acquired before the audio subsystem is ready
let queuedMicStream = null;

export function bindAudioManager(manager) {
  audioManager = manager;
}

export async function initializeAudio(context) {
  if (!context) {
    structuredLog('ERROR', 'initializeAudio: AudioContext not provided.');
    return;
  }
  try {
    structuredLog('DEBUG', 'initializeAudio: starting', { state: context.state });
    // Attempt to collect available media device info for diagnostics
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        // Map to a compact shape to avoid serializing heavy objects
        const devInfo = devices.map(d => ({ kind: d.kind, label: d.label || '(hidden)', deviceId: d.deviceId }));
        structuredLog('DEBUG', 'initializeAudio: enumerateDevices result', { devices: devInfo });
      } catch (e) {
        structuredLog('WARN', 'initializeAudio: enumerateDevices failed', { error: e?.message || String(e) });
      }
    }
  } catch (e) {
    // Non-fatal diagnostic failure
    structuredLog('WARN', 'initializeAudio: diagnostic probe failed', { error: e?.message || String(e) });
  }
  masterGain = context.createGain();
  masterGain.gain.value = 2.0; // Boosted volume
  masterGain.connect(context.destination);
  // create mic gain node ready for pass-through routing
  micGainNode = context.createGain();
  micGainNode.gain.value = 1.0;
  resizeOscillatorPool(settings.maxNotes);

  // If a mic stream was queued before audio initialization, connect it now
  if (queuedMicStream) {
    try {
      structuredLog('INFO', 'Connecting previously queued microphone stream.');
      try {
        const tracks = queuedMicStream.getAudioTracks ? queuedMicStream.getAudioTracks().map(t => t.label || '(hidden)') : [];
        structuredLog('DEBUG', 'initializeAudio: queuedMicStream info', { trackCount: tracks.length, trackLabels: tracks });
      } catch (e) { /* best-effort */ }
      connectMicrophone(queuedMicStream);
      queuedMicStream = null;
    } catch (e) {
      structuredLog('WARN', 'Failed to connect queued mic stream', { error: e?.message || String(e) });
    }
  }
}

// --- Microphone Pass-through Feature ---
export function connectMicrophone(stream) {
  const context = audioManager?.context;
  if (!stream) return;

  // If audio context isn't ready yet, queue the stream for later
  if (!context) {
    queuedMicStream = stream;
    structuredLog('INFO', 'connectMicrophone: Audio context not ready, queued mic stream.');
    return;
  }

  if (micSourceNode) {
    structuredLog('WARN', 'connectMicrophone: mic already connected');
    return;
  }

  try {
    micSourceNode = context.createMediaStreamSource(stream);
    // Route the mic audio through the mic gain node; actual routing to main output
    // is controlled by micPassThroughEnabled.
    if (!micGainNode) micGainNode = context.createGain();
    micSourceNode.connect(micGainNode);
    if (micPassThroughEnabled && masterGain) {
      micGainNode.connect(masterGain);
      structuredLog('INFO', 'Microphone audio connected to main output.');
    } else {
      structuredLog('INFO', 'Microphone stream connected but pass-through is disabled.');
    }
  } catch (err) {
    structuredLog('ERROR', 'Failed to connect microphone stream to audio context', { error: err.message });
  }
}

export function disconnectMicrophone() {
  if (micSourceNode) {
    try {
      // disconnect source from mic gain
      micSourceNode.disconnect(micGainNode);
    } catch (e) {
      try { micSourceNode.disconnect(); } catch(_) {}
    }
    micSourceNode = null;
    // also disconnect mic gain from master if it was connected
    if (micGainNode && micPassThroughEnabled && masterGain) {
      try { micGainNode.disconnect(masterGain); } catch (e) { /* ignore */ }
    }
    structuredLog('INFO', 'Microphone audio disconnected.');
  }
  // clear any queued stream
  queuedMicStream = null;
}
// --- End Microphone Feature ---

// Toggle mic pass-through on/off. When enabled, the mic gain node is connected to master output.
export function setMicPassThrough(enabled) {
  const context = audioManager?.context;
  micPassThroughEnabled = !!enabled;
  if (!context || !micGainNode) return;

  if (micPassThroughEnabled) {
    try {
      micGainNode.connect(masterGain);
      structuredLog('INFO', 'Microphone pass-through enabled.');
      // If a source is already present, ensure it's routed
      if (micSourceNode) micSourceNode.connect(micGainNode);
    } catch (e) {
      structuredLog('ERROR', 'Failed to enable mic pass-through', { error: e.message });
    }
  } else {
    try {
      micGainNode.disconnect(masterGain);
      structuredLog('INFO', 'Microphone pass-through disabled.');
    } catch (e) { /* ignore */ }
  }
}

// Adjust mic level (0.0 - 1.0)
export function setMicLevel(level) {
  const context = audioManager?.context;
  if (!context || !micGainNode) return;
  const v = Math.max(0, Math.min(1, Number(level) || 0));
  micGainNode.gain.value = v;
  structuredLog('DEBUG', 'Mic level set', { level: v });
}

// Returns true when the audio subsystem is initialized and ready to route mic audio
export function isAudioReady() {
  return !!(audioManager?.context && masterGain);
}

export function resizeOscillatorPool(size) {
  const context = audioManager?.context;
  if (!context) return;
  
  while (oscillatorPool.length < size) {
    const osc = context.createOscillator();
    oscillatorPool.push(osc);
  }
  while (oscillatorPool.length > size) {
    oscillatorPool.pop();
  }
  structuredLog('DEBUG', 'Resized oscillator pool', { size: oscillatorPool.length });
}

function getOscillator() {
  const context = audioManager?.context;
  if (!context) return null;

  if (oscillatorPool.length > 0) {
    const osc = oscillatorPool.pop();
    // --- LOG LEVEL CHANGED TO DEBUG ---
    structuredLog('DEBUG', 'getOscillator: Retrieved oscillator from pool', { poolSize: oscillatorPool.length });
    return osc;
  }
  
  // Fallback if pool is empty
  structuredLog('WARN', 'getOscillator: Pool empty, creating new oscillator.');
  return context.createOscillator();
}

function releaseOscillator(oscillator) {
  // Re-create the oscillator to reset its state before putting it back in the pool
  const context = audioManager?.context;
  if (context) {
    const newOsc = context.createOscillator();
    oscillatorPool.push(newOsc);
    // --- LOG LEVEL CHANGED TO DEBUG ---
    structuredLog('DEBUG', 'releaseOscillator: Returned oscillator to pool', { poolSize: oscillatorPool.length });
  }
}

export async function playCues(cues) {
  const context = audioManager?.context;
  if (!context || context.state !== 'running') return;
  
  const now = context.currentTime;
  const cuesToPlay = cues.slice(0, settings.maxNotes);
  
  // Clear oscillators that are no longer needed
  const activeIds = new Set(cuesToPlay.map(c => c.id));
  for (const [id, activeOsc] of activeOscillators.entries()) {
    if (!activeIds.has(id)) {
      clearTimeout(activeOsc.timeoutId);
      activeOsc.osc.stop();
      activeOsc.osc.disconnect();
      releaseOscillator(activeOsc.osc);
      activeOscillators.delete(id);
    }
  }

  cuesToPlay.forEach(cue => {
    if (activeOscillators.has(cue.id)) return;

    const osc = getOscillator();
    if (!osc) return;

    const panner = new PannerNode(context, {
      panningModel: 'equalpower',
      positionX: cue.pan,
      positionY: 0,
      positionZ: 1 - Math.abs(cue.pan)
    });

    osc.frequency.setValueAtTime(cue.pitch, now);
    osc.type = 'sine';
    
    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(cue.intensity * 0.5, now + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.2);

    osc.connect(gainNode).connect(panner).connect(masterGain);

    osc.start(now);
    
    const timeoutId = setTimeout(() => {
      try {
        osc.stop();
        osc.disconnect();
        releaseOscillator(osc);
        activeOscillators.delete(cue.id);
      } catch(e) { /* Already stopped */ }
    }, 250);

    activeOscillators.set(cue.id, { osc, panner, timeoutId });
  });
}

/**
 * Returns lightweight diagnostics about the audio subsystem for debugging.
 */
export function getAudioDiagnostics() {
  const context = audioManager?.context;
  return {
    audioContextState: context?.state || 'no-context',
    oscillatorPoolSize: oscillatorPool.length,
    activeOscillatorCount: activeOscillators.size,
    masterGainPresent: !!masterGain,
    micPassThroughEnabled: !!micPassThroughEnabled
  };
}

/**
 * Attempt to resume the underlying AudioContext if it's suspended.
 * Returns an object { ok: boolean, state: string, error?: string }
 */
export async function resumeAudioContext() {
  const context = audioManager?.context;
  if (!context) {
    return { ok: false, state: 'no-context', error: 'No AudioContext available' };
  }
  try {
    if (context.state === 'suspended') {
      await context.resume();
    }
    return { ok: true, state: context.state };
  } catch (e) {
    structuredLog('ERROR', 'resumeAudioContext failed', { error: e?.message || String(e) });
    return { ok: false, state: context.state || 'unknown', error: e?.message || String(e) };
  }
}