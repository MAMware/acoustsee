// File: web/audio/audio-processor.js

import { structuredLog, shouldSample } from '../utils/logging.js';
import { soundProfileManifest } from './sound-profiles.js'; // <-- NEW IMPORT
import { 
  executeCriticalOperation, 
  AccessibilityError, 
  showCriticalError,
  showAudioFailureIndicator
} from '../utils/error-handling.js';
import { availableEnginesData } from './synths/available-synths.js';

let audioManager = null;
let _config = {};
let _selectedSynthPlayFn = null;
let _profileOverrides = new Map();

// OPTIMIZATION: Module-level reusable Map for synth organization (avoids per-frame allocation)
const notesBySynth = new Map();

// Allow UI/commands to select a global synth engine to apply to notes
export function setSelectedSynthEngine(engineId) {
  try {
    const entry = (availableEnginesData || []).find(e => e.id === engineId);
    _selectedSynthPlayFn = entry ? entry.playFunction : null;
    structuredLog('INFO', 'audio: selected synth engine', { engineId, hasPlayFn: !!_selectedSynthPlayFn });
  } catch (e) {
    structuredLog('WARN', 'audio: setSelectedSynthEngine failed', { error: e?.message || String(e) });
    _selectedSynthPlayFn = null;
  }
}

// Allow UI to override the synth for a specific object type (Granular Override)
export function setSoundProfileOverride(objectType, synthId) {
  try {
    if (!synthId) {
      _profileOverrides.delete(objectType);
      structuredLog('INFO', 'audio: cleared sound profile override', { objectType });
      return;
    }
    
    const entry = (availableEnginesData || []).find(e => e.id === synthId);
    if (entry) {
      _profileOverrides.set(objectType, entry.playFunction);
      structuredLog('INFO', 'audio: set sound profile override', { objectType, synthId });
    } else {
      structuredLog('WARN', 'audio: failed to set override, synth not found', { objectType, synthId });
    }
  } catch (e) {
    structuredLog('ERROR', 'audio: setSoundProfileOverride failed', { error: e?.message });
  }
}

let oscillatorPool = [];
const activeOscillators = new Map();
let masterGain = null;
// --- State for Microphone Pass-through ---
let micSourceNode = null;
let micGainNode = null;
let micPassThroughEnabled = false;
// Queue a mic stream if it's acquired before the audio subsystem is ready
let queuedMicStream = null;

// --- Utility: Create a panner node with fallback for environments lacking StereoPanner ---
function createPannerNode(context) {
  try {
    if (typeof context.createStereoPanner === 'function') {
      return context.createStereoPanner();
    }
  } catch (_) { /* ignore */ }
  // Fallback: use a GainNode and attach a minimal .pan interface
  const fallback = context.createGain();
  // Attach a stub pan AudioParam-like object
  const panParam = {
    value: 0,
    setTargetAtTime(v) { this.value = v; },
    setValueAtTime(v) { this.value = v; }
  };
  try { Object.defineProperty(fallback, 'pan', { value: panParam, writable: false }); } catch (_) {
    // If defineProperty fails, set directly
    fallback.pan = panParam;
  }
  return fallback;
}

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
    throw new AccessibilityError(
      'Audio system is required for visual-to-audio conversion',
      'AUDIO_CONTEXT_UNAVAILABLE',
      { providedAudioManager: !!_config.audioManager, providedContext: !!_config.context }
    );
  }

  return await executeCriticalOperation('audio-synthesis', async () => {
    structuredLog('DEBUG', 'initializeAudio: starting', { state: context.state });
    
    // Check if audio context is in a usable state
    if (context.state === 'suspended') {
      // Try to resume the context
      try {
        await context.resume();
        structuredLog('INFO', 'Successfully resumed suspended AudioContext');
      } catch (resumeError) {
        throw new AccessibilityError(
          'Audio system is suspended and cannot be resumed. Try clicking on the page or reloading.',
          'AUDIO_CONTEXT_SUSPENDED',
          { contextState: context.state, resumeError: resumeError.message }
        );
      }
    }
    
    // Add audio context state change monitoring
    if (context.addEventListener) {
      context.addEventListener('statechange', () => {
        structuredLog('INFO', 'AudioContext state changed', { 
          newState: context.state,
          timestamp: Date.now()
        });
        
        // If context gets suspended, show audio failure indicator
        if (context.state === 'suspended') {
          structuredLog('WARN', 'AudioContext was suspended - audio may stop playing');
          showAudioFailureIndicator('Audio Suspended - Click to Resume');
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
        // Non-fatal diagnostic failure
        structuredLog('WARN', 'initializeAudio: enumerateDevices failed', { error: e?.message || String(e) });
      }
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
        const tracks = queuedMicStream.getAudioTracks ? queuedMicStream.getAudioTracks().map(t => t.label || '(hidden)') : [];
        structuredLog('DEBUG', 'initializeAudio: queuedMicStream info', { trackCount: tracks.length, trackLabels: tracks });
        connectMicrophone(queuedMicStream);
        queuedMicStream = null;
      } catch (e) {
        structuredLog('WARN', 'Failed to connect queued mic stream', { error: e?.message || String(e) });
      }
    }
    
    structuredLog('INFO', 'Audio system initialized successfully');
    // Return the initialized API surface so callers can invoke playCues
    // and allow commands to adjust runtime settings such as pool size.
    return { playCues, resizeOscillatorPool, setSelectedSynthEngine, setSoundProfileOverride };
  }, {
    contextState: context?.state,
    hasAudioManager: !!audioManager
  });
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
  
  // CRITICAL FIX: Add 50% buffer to handle bursts without pool depletion
  const bufferedSize = Math.ceil(size * 1.5);
  
  // First, garbage collect dead oscillators
  const beforeGC = oscillatorPool.length;
  oscillatorPool = oscillatorPool.filter(item => item.state !== 'dead');
  const afterGC = oscillatorPool.length;
  
  // Count fresh oscillators
  let freshCount = oscillatorPool.filter(item => item.state === 'fresh').length;
  
  structuredLog('DEBUG', 'Resizing oscillator pool', { 
    requestedSize: size, 
    bufferedSize,
    beforeGC,
    afterGC,
    freshCount,
    activeCount: oscillatorPool.filter(item => item.state === 'active').length
  });
  
  // Add fresh oscillators if needed
  if (freshCount < bufferedSize) {
    const toAdd = bufferedSize - freshCount;
    for (let i = 0; i < toAdd; i++) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const panner = createPannerNode(context);
      
      // DO NOT connect or start yet - synths will do that!
      // State tracking: 'fresh' = never used, 'active' = currently playing, 'dead' = stopped (cannot reuse)
      oscillatorPool.push({ osc, gain, panner, state: 'fresh' });
    }
    
    freshCount = oscillatorPool.filter(item => item.state === 'fresh').length;
    structuredLog('DEBUG', 'Resized oscillator pool', { 
      added: toAdd,
      newFreshCount: freshCount,
      totalSize: oscillatorPool.length 
    });
  }
  
  // Remove excess fresh oscillators if pool is too large (recalculate freshCount each iteration)
  while (freshCount > bufferedSize) {
    const freshIndex = oscillatorPool.findIndex(item => item.state === 'fresh');
    if (freshIndex === -1) break;  // Safety check: no more fresh oscillators
    
    const oscObj = oscillatorPool.splice(freshIndex, 1)[0];
    // Clean up the removed oscillator
    if (oscObj && oscObj.osc) {
      try { oscObj.osc.disconnect(); } catch (e) { /* ignore */ }
    }
    if (oscObj && oscObj.gain) {
      try { oscObj.gain.disconnect(); } catch (e) { /* ignore */ }
    }
    if (oscObj && oscObj.panner) {
      try { oscObj.panner.disconnect(); } catch (e) { /* ignore */ }
    }
    // Recalculate freshCount for next iteration to avoid infinite loop
    freshCount = oscillatorPool.filter(item => item.state === 'fresh').length;
  }
}

/**
 * Retrieves an oscillator from the pool for use in audio synthesis.
 * 
 * Returns an oscillator object from the pool of fresh (unused) oscillators.
 * If no fresh oscillators are available, creates a new one and logs an error.
 * 
 * @returns {Object|null} Returns an oscillator object with the following shape:
 *   - {OscillatorNode} osc - The Web Audio API OscillatorNode (pre-configured but not started)
 *   - {GainNode} gain - A GainNode connected to osc for volume control
 *   - {PannerNode} panner - A PannerNode for spatial panning
 *   - {string} state - Current state: 'fresh', 'active', or 'dead'
 *   - {string} id - Unique identifier for tracking in logs (format: 'osc_RANDOM')
 *   
 *   Returns null ONLY if audioContext is not available (context?.destroy() called).
 *   
 * @example
 *   const oscData = getOscillator();
 *   if (!oscData) {
 *     console.error('Audio system not initialized');
 *     return;
 *   }
 *   oscData.osc.connect(oscData.gain);
 *   oscData.gain.connect(masterGain);
 *   oscData.osc.start(audioContext.currentTime);
 * 
 * @throws {Error} Throws if osc, gain, or panner nodes fail to create (internal Web Audio error)
 * 
 * @see releaseOscillator - Call when oscillator is no longer needed
 * @see oscillatorPool - Internal pool tracked by oscillator state
 */
function getOscillator() {
  const context = audioManager?.context;
  if (!context) return null;

  // Find a fresh oscillator (never used before)
  const freshIndex = oscillatorPool.findIndex(item => item.state === 'fresh');
  
  if (freshIndex !== -1) {
    const oscObj = oscillatorPool[freshIndex];
    if (!oscObj.id) {
      oscObj.id = `osc_${Math.random().toString(36).substring(2, 9)}`;
    }
    structuredLog('DEBUG', `OSC_LIFECYCLE: GET`, { id: oscObj.id, state: oscObj.state, synth: _selectedSynthPlayFn?.name || 'unknown' });
    oscObj.state = 'active'; // Mark as now being used
    
    // Very aggressive sampling to reduce dev panel spam - only log ~1% of calls
    if (shouldSample('frameProcessing')) {
      const freshCount = oscillatorPool.filter(item => item.state === 'fresh').length;
      structuredLog('DEBUG', 'getOscillator: Retrieved fresh oscillator from pool', { 
        freshCount,
        totalPoolSize: oscillatorPool.length 
      });
    }
    return oscObj;
  }
  
  // No fresh oscillators available. THIS IS A CRITICAL FAILURE SIGN.
  structuredLog('ERROR', 'OSCILLATOR_POOL_EXHAUSTED', {
    message: 'Pool has no fresh oscillators. This indicates a leak. Creating a fallback oscillator.',
    poolSize: oscillatorPool.length,
    freshCount: 0,
    activeCount: oscillatorPool.filter(item => item.state === 'active').length,
    deadCount: oscillatorPool.filter(item => item.state === 'dead').length
  });
  
  const osc = context.createOscillator();
  const gain = context.createGain();
  const panner = createPannerNode(context);
  
  // DO NOT connect or start - synths will do that
  const newOscObj = { osc, gain, panner, state: 'active' };
  if (!newOscObj.id) {
    newOscObj.id = `osc_${Math.random().toString(36).substring(2, 9)}`;
  }
  structuredLog('DEBUG', `OSC_LIFECYCLE: GET`, { id: newOscObj.id, state: newOscObj.state, synth: _selectedSynthPlayFn?.name || 'unknown' });
  
  // Add to pool for tracking
  oscillatorPool.push(newOscObj);
  
  return newOscObj;
}

function releaseOscillator(oscObj) {
  if (!oscObj) return;

  structuredLog('DEBUG', `OSC_LIFECYCLE: RELEASE`, { id: oscObj.id });
  // Mark as dead. An oscillator cannot be started more than once.
  oscObj.state = 'dead';

  // Disconnect all nodes to ensure garbage collection.
  try {
    if (oscObj.osc) oscObj.osc.disconnect();
    if (oscObj.gain) oscObj.gain.disconnect();
    if (oscObj.panner) oscObj.panner.disconnect();
    if (oscObj.filter) oscObj.filter.disconnect();
  } catch (e) {
    // This is expected if nodes are already disconnected.
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
export function playCues(cues) { // The argument is now just the cues array
  const context = audioManager?.context;

  // Lightweight debug: report that playCues has been entered and the AudioContext state
  try {
    structuredLog('DEBUG', 'playCues entered', { contextState: context?.state || 'no-context', receivedType: Array.isArray(cues) ? 'array' : typeof cues });
  } catch (e) { /* best-effort logging */ }

  // Very aggressive sampling to reduce dev panel spam - only log ~1% of calls
  if (shouldSample('audioSynthesis')) {
    structuredLog('DEBUG', 'playCues called', { 
      hasContext: !!context, 
      contextState: context?.state,
      payloadType: Array.isArray(cues) ? 'array' : 'invalid',
      cuesSample: Array.isArray(cues) ? cues.slice(0,3) : null
    });
  }

  if (!context || context.state !== 'running') {
    structuredLog('WARN', 'playCues: AudioContext not running. Skipping.', { state: context?.state });
    return;
  }

  // cues should be an array. Find the primary cue (if any) via isPrimary flag
  const cuesArray = Array.isArray(cues) ? cues : [];
  const primaryCue = cuesArray.find(c => c && c.isPrimary);
  
  // Resolve primary profile with overrides (Focus Mode)
  let resolvedPrimaryProfile = null;
  if (primaryCue) {
    const pType = primaryCue.objectType;
    const pManifest = soundProfileManifest[pType];
    const pOverride = _profileOverrides.get(pType);
    if (pManifest) {
      resolvedPrimaryProfile = pOverride ? { ...pManifest, playFunction: pOverride } : pManifest;
    }
  }

  // CLEAR the map instead of creating new Map() - OPTIMIZATION: avoids per-frame allocation
  notesBySynth.clear();
  const maxNotes = Number(_config.maxNotes) || 12;

  // Reuse synthContext across all synth calls to avoid per-frame allocation (~3600 allocations/min)
  const synthContext = { 
    audioContext: context, 
    getOscillator, 
    releaseOscillator, 
    masterGain, 
    oscillatorPool,
    settings: _config.settings 
  };

  for (const cue of cuesArray.slice(0, maxNotes)) {
    // Resolve individual profile from manifest
    let profile = soundProfileManifest[cue.objectType] || soundProfileManifest['default_motion'];
    
    // Apply granular override
    const overrideFn = _profileOverrides.get(cue.objectType);
    if (overrideFn && profile) {
      profile = { ...profile, playFunction: overrideFn };
    }

    // If in Focus mode (primaryCue exists), we force the synth from the primary object's profile.
    if (resolvedPrimaryProfile) {
      profile = resolvedPrimaryProfile;
    }

    if (!profile || typeof profile.playFunction !== 'function') continue;

    // Override with globally selected synth engine if provided (Debug/Master override)
    if (_selectedSynthPlayFn) {
      profile = { ...profile, playFunction: _selectedSynthPlayFn };
    }

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
    // Log if this is the test-note so we can trace successful playback
    try {
      if (cue && cue.id === 'test-note') {
        structuredLog('INFO', 'playCues: detected test-note cue', { pitch: cue.pitch, intensity: cue.intensity });
      }
    } catch (e) { /* ignore logging errors */ }
  }

  // The rest of the function remains the same, executing the synths.
  for (const [playFunction, notes] of notesBySynth.entries()) { // TODO R291025 Clarify "notesBySynth" implementatio we might not have proper documentation, check audio pipeline README.md and confirm.
    try {
      structuredLog('DEBUG', 'playCues: Calling synth function', { notesCount: notes.length, synthName: playFunction.name || 'anonymous' }, false, shouldSample('audioSynthesis'));
      playFunction(notes, synthContext);
      // Log that notes were handed to the synth. If any of the notes were the test-note,
      // log an INFO message indicating the test tone was passed to the synth.
      try {
        const hasTestNote = notes.some(n => n && n.id === 'test-note');
        if (hasTestNote) {
          structuredLog('INFO', 'playCues: test-note handed to synth', { synth: playFunction.name || 'anonymous', noteCount: notes.length });
        }
      } catch (e) { /* ignore logging errors */ }
    } catch (e) {
      structuredLog('ERROR', `Synth function '${playFunction.name}' failed`, { error: e?.message });
    }
  }

  // --- Garbage Collection and Pool Refill ---
  const freshCountBeforeGC = oscillatorPool.filter(item => item.state === 'fresh').length;

  // 1. Garbage Collect: Remove all 'dead' oscillators from the pool.
  oscillatorPool = oscillatorPool.filter(item => item.state !== 'dead');

  const activeCount = oscillatorPool.filter(item => item.state === 'active').length;
  const freshCountAfterGC = oscillatorPool.length - activeCount;

  // 2. Refill if needed: If the number of fresh oscillators is below the buffer, create new ones.
  const bufferedSize = Math.ceil(maxNotes * 1.5);
  if (freshCountAfterGC < bufferedSize) {
    const toAdd = bufferedSize - freshCountAfterGC;
    for (let i = 0; i < toAdd; i++) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const panner = createPannerNode(context);
      oscillatorPool.push({ osc, gain, panner, state: 'fresh' });
    }
    if (shouldSample('audioSynthesis')) { // Sample this log
      structuredLog('DEBUG', 'Refilled oscillator pool', { 
          added: toAdd, 
          newTotalSize: oscillatorPool.length,
          freshCount: freshCountAfterGC + toAdd,
          activeCount: activeCount
      });
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

export function registerAudioListeners(engine) {
  // Defensive check: ensure engine is valid
  if (!engine) {
    structuredLog('WARN', 'registerAudioListeners: engine is null, listeners not registered');
    return;
  }
  
  let bpm = 100;
  let cueInterval = 60000 / bpm / 4; // 4 cues/beat
  let cueSchedulerId = null;
  let lastBpmUpdate = 0;

  const startCueScheduler = () => {
    if (cueSchedulerId) cancelAnimationFrame(cueSchedulerId);
    let lastTime = 0;
    const scheduleCues = (timestamp) => {
      // Defensive: check engine state exists before accessing
      const state = engine?.getState?.();
      if (!state) return; // No state available, skip scheduling
      
      if (state.currentMode !== 'hybrid') { cueSchedulerId = null; return; } // Clear RAF if not rhythmic mode
      if (!state.cueBuffer || !state.cueBuffer.length) return; // Avoid RAF if empty
      // Limit cueBuffer to max 16 to prevent overflow
      if (state.cueBuffer.length > 16) state.cueBuffer = state.cueBuffer.slice(-16);
      if (timestamp - lastTime >= cueInterval) {
        // Play batch of up to 4 cues from state.cueBuffer
        const cues = (state.cueBuffer || []).splice(0, 4);
        if (cues.length > 0) playCues(cues);
        lastTime = timestamp;
      }
      cueSchedulerId = requestAnimationFrame(scheduleCues);
    };
    cueSchedulerId = requestAnimationFrame(scheduleCues);
  };

  // Mode-aware audio bridge: Handle Flow mode cues
  engine.onStateChange((state) => {
    if (!state.flowCuesReady) return;
    const flowCues = state.flowCuesReady;
    try {
      structuredLog('DEBUG', 'flowCuesReady: received flow cues', { 
        hasGridFlows: !!flowCues.gridFlows, 
        inferredBPM: flowCues.inferredBPM 
      }, false, shouldSample('audioSynthesis'));
      
      // Convert motion regions to audio cues using soundProfileManifest
      const cues = [];
      if (flowCues.gridFlows && Array.isArray(flowCues.gridFlows)) {
        flowCues.gridFlows.forEach((flowCell, idx) => {
          if (flowCell.mag > 0.1) {
            const profile = soundProfileManifest.flow?.motion || { profile: 'sine', freq: 440, gain: 0.3 };
            const pitch = 220 + (flowCell.mag * 440); // Motion magnitude scales frequency
            cues.push({ pitch, intensity: flowCell.mag, profile, cellIndex: idx });
          }
        });
      }
      
      if (cues.length > 0) {
        playCues(cues);
      }
    } catch (e) {
      structuredLog('WARN', 'flowCuesReady handler failed', { error: e?.message || String(e) });
    }
  });

  // Mode-aware audio bridge: Handle Focus mode depth cues
  engine.onStateChange((state) => {
    if (!state.depthCuesReady) return;
    const depthCues = state.depthCuesReady;
    try {
      structuredLog('DEBUG', 'depthCuesReady: received depth cues', { 
        hasGridDepths: !!depthCues.gridDepths,
        mode: depthCues.mode 
      }, false, shouldSample('audioSynthesis'));
      
      // Convert depth to audio using HRTF for spatial rendering
      const cues = [];
      if (depthCues.gridDepths && Array.isArray(depthCues.gridDepths)) {
        depthCues.gridDepths.forEach((depth, idx) => {
          if (depth > 0.1) {
            const profile = soundProfileManifest.focus?.spatial || { profile: 'pad', freq: 220, gain: 0.2 };
            const pitch = 110 + (depth * 220); // Depth maps to pitch range (110-330 Hz)
            cues.push({ pitch, intensity: depth, profile, cellIndex: idx, spatial: true });
          }
        });
      }
      
      if (cues.length > 0) {
        playCues(cues);
      }
    } catch (e) {
      structuredLog('WARN', 'depthCuesReady handler failed', { error: e?.message || String(e) });
    }
  });

  engine.onStateChange((state) => {
    if (!state.objectCuesReady) return;
    const cues = state.objectCuesReady;
    const { objects } = cues;
    objects.forEach(obj => {
      let profile;
      switch (obj) {
        case 'person': profile = { type: 'pluck', freq: 440, gain: 0.5 }; break;
        case 'tree': profile = { type: 'shimmer', freq: 220, gain: 0.3 }; break;
        case 'rough_ground': profile = { type: 'noise', freq: 100, gain: 0.7 }; break;
        case 'trash': profile = { type: 'crunch', freq: 300, gain: 0.6 }; break;
        case 'box': profile = { type: 'thud', freq: 150, gain: 0.5 }; break;
        default: return; // Skip unknown
      }
      // Play immediately for objects
      playCues([{ profile }]);
    });
  });

  engine.onStateChange((state) => {
    if (!state.bpmUpdate) return;
    const newBpm = state.bpmUpdate.bpm;
    if (Date.now() - lastBpmUpdate < 500) return; // Debounce
    lastBpmUpdate = Date.now();
    bpm = newBpm;
    cueInterval = 60000 / bpm / 4;
    startCueScheduler();
  });

  // Start initial scheduler
  startCueScheduler();
}