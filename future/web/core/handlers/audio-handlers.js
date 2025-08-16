// File: web/core/handlers/audio-handlers.js

import { settings, setMicStream } from '../state.js';
import { structuredLog } from '../../utils/logging.js';
import { getText, speakText } from '../../utils/utils.js';
import { initializeAudio, initializeMicAudio, playAudio } from '../../audio/audio-processor.js';
import { applyHRTF as hrtfSpatialize } from '../../audio/hrtf-processor.js';
import { getAudioContext } from '../../audio/audio-manager.js'; // We'll need a way to get the context

export function createAudioHandlers(dispatch) {
  return {
    async toggleAudio({ settingsMode }) {
      try {
        if (settingsMode) {
          const { availableEngines } = settings;
          const currentIndex = availableEngines.findIndex(e => e.id === settings.synthesisEngine);
          const nextIndex = (currentIndex + 1) % availableEngines.length;
          settings.synthesisEngine = availableEngines[nextIndex].id;
          
          const msg = await getText('button2.tts.synthesisSelect', { state: settings.synthesisEngine });
          speakText(msg);

        } else {
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
        await dispatch('updateUI', { 
          settingsMode, 
          streamActive: !!settings.stream, 
          micActive: !!settings.micStream 
        });
      }
    },

    async playNote(note) {
      if (!note || typeof note.pitch !== 'number') {
        structuredLog('WARN', 'playNote: Invalid note object provided.', { note });
        return;
      }
      playAudio([note]);
    },

    applyHRTF(sourceNode, position) {
      const audioContext = getAudioContext();
      if (!settings.hrtfEnabled) {
        structuredLog('INFO', 'applyHRTF: HRTF is disabled in settings.');
        return sourceNode;
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
        return sourceNode;
      }
    }
  };
}