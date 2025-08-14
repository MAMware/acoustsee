// File: web/core/handlers/audio-handlers.js

import { settings, setMicStream } from '../state.js';
import { dispatchEvent } from '../dispatcher.js';
import { structuredLog } from '../../utils/logging.js';
import { getText, speakText } from '../../utils/utils.js';
import { initializeAudio, initializeMicAudio, playAudio } from '../../audio/audio-processor.js';
import { applyHRTF as hrtfSpatialize } from '../../audio/hrtf-processor.js';
import { getAudioContext } from '../../audio/audio-manager.js'; // We'll need a way to get the context

/**
 * Handles UI actions for toggling microphone or synthesis engine.
 */
export async function toggleAudio({ settingsMode }) {
  try {
    if (settingsMode) {
      // Logic for selecting the next synthesis engine
      const { availableEngines } = settings;
      const currentIndex = availableEngines.findIndex(e => e.id === settings.synthesisEngine);
      const nextIndex = (currentIndex + 1) % availableEngines.length;
      settings.synthesisEngine = availableEngines[nextIndex].id;
      
      const msg = await getText('button2.tts.synthesisSelect', { state: settings.synthesisEngine });
      speakText(msg);

    } else {
      // Logic for toggling the microphone on and off
      if (!settings.micStream) {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setMicStream(micStream);
        initializeMicAudio(micStream);
        
        const msg = await getText('button2.tts.micToggle', { state: 'turningOn' });
        speakText(msg);
      } else {
        settings.micStream.getTracks().forEach(track => track.stop());
        setMicStream(null);
        initializeMicAudio(null);
        
        const msg = await getText('button2.tts.micToggle', { state: 'turningOff' });
        speakText(msg);
      }
    }
  } catch (err) {
    structuredLog('ERROR', 'toggleAudio error', { message: err.message, stack: err.stack });
    const errorMsg = await getText('button2.tts.micError');
    speakText(errorMsg);
  } finally {
    dispatchEvent('updateUI', { 
      settingsMode, 
      streamActive: !!settings.stream, 
      micActive: !!settings.micStream 
    });
  }
}

/**
 * Plays a single, discrete note. Useful for UI feedback or specific events.
 * This is distinct from the continuous sonification loop.
 * @param {object} note - A note object, e.g., { pitch: 440, intensity: 0.5 }
 */
export async function playNote(note) {
    if (!note || typeof note.pitch !== 'number') {
        structuredLog('WARN', 'playNote: Invalid note object provided.', { note });
        return;
    }
    // The main playAudio function in audio-processor already handles the synthesis engine.
    // We can simply wrap it.
    playAudio([note]);
}

/**
 * Applies HRTF spatialization to a given audio source node.
 * This is a forward-looking function for when you integrate 3D audio.
 * @param {AudioNode} sourceNode - The audio node to be spatialized.
 * @param {object} position - The position in 3D space, e.g., { x: 1, y: 0, z: -1 }
 * @returns {AudioNode} The new panner node that is connected to the destination.
 */
export function applyHRTF(sourceNode, position) {
    const audioContext = getAudioContext(); // Assumes audio-manager exposes a getter for the context
    if (!settings.hrtfEnabled) {
      structuredLog('INFO', 'applyHRTF: HRTF is disabled in settings.');
      return sourceNode; // Return the original node if HRTF is off
    }
    if (!audioContext || !sourceNode || !position) {
        structuredLog('ERROR', 'applyHRTF: Missing audioContext, sourceNode, or position.');
        return sourceNode;
    }
    
    try {
        const panner = hrtfSpatialize(audioContext, sourceNode, position);
        structuredLog('DEBUG', 'applyHRTF: HRTF applied.', { position });
        return panner;
    } catch (err) {
        structuredLog('ERROR', 'applyHRTF: Failed to apply HRTF.', { error: err.message });
        return sourceNode; // Return original node on failure
    }
}