// File: web/audio/audio-processor.js

import { structuredLog } from '../utils/logging.js';
import { soundProfileManifest } from './sound-profiles.js'; // <-- NEW IMPORT

let audioManager = null;
let _config = {};
let _audioApi = null;

export function setAudioApi(api) {
  _audioApi = api || null;
}

export function getAudioApi() {
  return _audioApi;
}
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

export async function initializeAudio(config = {}) {
  // Accept either an object with an `audioManager` or a raw AudioContext for compatibility.
  _config = Object.assign({}, _config, config || {});

  // If the caller provided an audioManager, use it. Otherwise fall back to previously bound one.
  if (_config.audioManager) audioManager = _config.audioManager;

  const context = audioManager?.context || _config.context;

  if (!context) {
    structuredLog('ERROR', 'initializeAudio: AudioContext (or audioManager) not provided.');
    throw new Error('initializeAudio requires { audioManager } or { context } in config');
  }

  try {
    structuredLog('DEBUG', 'initializeAudio: starting', { state: context.state });
    
    // Add audio context state change monitoring
    if (context.addEventListener) {
      context.addEventListener('statechange', () => {
        structuredLog('INFO', 'AudioContext state changed', { 
          newState: context.state,
          timestamp: Date.now()
        });
        
        // If context gets suspended, log warning
        if (context.state === 'suspended') {
          structuredLog('WARN', 'AudioContext was suspended - audio may stop playing');
        }
      });
    }
    
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
  // Use injected maxNotes, fall back to a safe default of 8
  resizeOscillatorPool(Number(_config.maxNotes) || 8);

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
/**
 * The audio "Conductor". This function orchestrates the translation of visual cues into sound.
 * It follows a multi-step process:
 * 1. Maps incoming cues to sound profiles defined in `sound-profiles.js`.
 * 2. Creates "note" objects by combining cue data with profile parameters.
 * 3. Groups notes by the synthesizer (`playFunction`) responsible for playing them.
 * 4. Invokes each required synthesizer once per frame with its list of notes and a shared audio context.
 *
 * This pattern ensures that synthesizers remain pure and decoupled from the core application logic.
 *
 * @param {Array<Object>} cues - An array of cue objects from the frame processor. Each cue
 *   should have `objectType`, `pitch`, `intensity`, and `position`.
 */
export async function playCues(payload) {
  const context = audioManager?.context;
  
  structuredLog('DEBUG', 'playCues called', { 
    hasContext: !!context, 
    contextState: context?.state,
    payloadType: Array.isArray(payload) ? 'array' : 'object',
    payload: payload 
  });
  
  if (!context || context.state !== 'running') {
    structuredLog('WARN', 'playCues: AudioContext not running', { 
      hasContext: !!context, 
      state: context?.state 
    });
    
    // Try to resume the context if it's suspended
    if (context && context.state === 'suspended') {
      structuredLog('INFO', 'playCues: Attempting to resume suspended AudioContext');
      try {
        await context.resume();
        structuredLog('INFO', 'playCues: AudioContext resumed successfully', { state: context.state });
        // Continue with audio processing after successful resume
      } catch (error) {
        structuredLog('ERROR', 'playCues: Failed to resume AudioContext', { error: error.message });
        return;
      }
    } else {
      return;
    }
  }

  // The new payload can be a simple array (for Flow mode) or a complex object (for Focus mode)
  const isFocusMode = payload.primaryCue && payload.secondaryCues;
  
  let primaryProfile, cuesToProcess;

  if (isFocusMode) {
    // In Focus Mode, the primary cue determines the instrument (timbre).
    primaryProfile = soundProfileManifest[payload.primaryCue.objectType];
    // The secondary cues are the "sheet music" that describes the object's form.
    cuesToProcess = payload.secondaryCues;
  } else {
    // In Flow Mode, the payload is just a simple array of cues.
    cuesToProcess = Array.isArray(payload) ? payload : [];
  }

  const notesBySynth = new Map();
  const maxNotes = Number(_config.maxNotes) || 12;

  for (const cue of cuesToProcess.slice(0, maxNotes)) {
    // If in Focus mode, we force the synth from the primary object's profile.
    // Otherwise, in Flow mode, we look up the profile for each individual cue.
    const profile = isFocusMode ? primaryProfile : (soundProfileManifest[cue.objectType] || soundProfileManifest['default_motion']);
    if (!profile || typeof profile.playFunction !== 'function') continue;

    if (!notesBySynth.has(profile.playFunction)) {
      notesBySynth.set(profile.playFunction, []);
    }

    const note = {
      ...profile.params,
      pitch: cue.pitch,
      intensity: cue.intensity,
      position: cue.position
    };
    notesBySynth.get(profile.playFunction).push(note);
  }

  // The rest of the function remains the same, executing the synths.
  for (const [playFunction, notes] of notesBySynth.entries()) {
    try {
      const synthContext = { audioContext: context, getOscillator, releaseOscillator, masterGain, settings: _config.settings };
      playFunction(notes, synthContext);
    } catch (e) {
      structuredLog('ERROR', `Synth function '${playFunction.name}' failed`, { error: e?.message });
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