// File: web/audio/audio-processor.js

import { settings } from '../core/state.js';
import { structuredLog } from '../utils/logging.js';
import { soundProfileManifest } from './sound-profiles.js'; // <-- NEW IMPORT

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
  // Use a safe default volume. Previously this was 2.0 which can be
  // unexpectedly loud or cause clipped signals in some environments.
  masterGain.gain.value = 1.0;
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

// --- NEW "CONDUCTOR" VERSION of playCues ---
// This function is a significant rewrite.
export async function playCues(cues) {
  const context = audioManager?.context;
  if (!context || context.state !== 'running') return;

  // 1. Map the incoming cues to a list of "notes" ready for the synthesizers.
  const notes = cues.map(cue => {
    // Look up the sound profile for this cue's objectType, falling back to default.
    const profile = soundProfileManifest[cue.objectType] || soundProfileManifest['default_motion'];
    
    // Combine the static parameters from the profile with the dynamic properties from the cue.
    return {
      ...profile.params,  // Base sound design (e.g., duration, attack).
      pitch: cue.pitch,
      intensity: cue.intensity,
      position: cue.position
    };
  }).slice(0, settings.maxNotes); // Enforce the polyphony limit.

  // 2. Group the notes by the synthesizer function they need to use.
  // This is an optimization to call each synth only once per frame.
  const notesBySynth = {};
  notes.forEach((note, i) => {
    const cueObjectType = cues[i].objectType || 'default_motion';
    const profile = soundProfileManifest[cueObjectType] || soundProfileManifest['default_motion'];
    const synthFunctionName = profile.playFunction.name;
    
    if (!notesBySynth[synthFunctionName]) {
      notesBySynth[synthFunctionName] = [];
    }
    notesBySynth[synthFunctionName].push(note);
  });

  // 3. Call each synthesizer with its corresponding batch of notes.
  for (const synthFunctionName in notesBySynth) {
    const synthProfile = Object.values(soundProfileManifest).find(p => p.playFunction.name === synthFunctionName);
    if (synthProfile) {
      // Create a context object for the synth, providing necessary resources.
      const synthContext = {
        audioContext: context,
        getOscillator,
        oscillatorPool
        // We can pass more shared resources here in the future.
      };
      // Dispatch the notes to the correct synth function.
      synthProfile.playFunction(notesBySynth[synthFunctionName], synthContext);
    }
  }
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
  structuredLog('WARN', 'resumeAudioContext: No AudioContext available');
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