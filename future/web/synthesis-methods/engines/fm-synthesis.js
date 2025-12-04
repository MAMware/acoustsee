import { audioContext, oscillators } from "../../audio-processor.js";

export function playFmSynthesis(notes) {
  let oscIndex = 0;
  const allNotes = notes.sort((a, b) => b.intensity - a.intensity);
  // Clean up any existing FM modulators from previous frames
  oscillators.forEach(oscData => {
    if (oscData.modulator) {
      oscData.modulator.stop();
      oscData.modulator.disconnect();
      oscData.modulator = null;
    }
    if (oscData.modGain) {
      oscData.modGain.disconnect();
      oscData.modGain = null;
    }
  });
  for (let i = 0; i < oscillators.length; i++) {
    const oscData = oscillators[i];
    if (oscIndex < allNotes.length && i < oscillators.length) {
      const { pitch, intensity, harmonics, pan } = allNotes[oscIndex];
      oscData.osc.type = "sine";
      oscData.osc.frequency.setTargetAtTime(
        pitch,
        audioContext.currentTime,
        0.015,
      );
      oscData.gain.gain.setTargetAtTime(
        intensity,
        audioContext.currentTime,
        0.015,
      );
      oscData.panner.pan.setTargetAtTime(pan, audioContext.currentTime, 0.015);
      oscData.active = true;
      if (harmonics.length && oscIndex + 1 < oscillators.length) {
        // Limitar a 1 modulador por nota
        oscIndex++;
        const modulator = audioContext.createOscillator();
        modulator.type = "sine";
        modulator.frequency.setTargetAtTime(
          pitch * 2,
          audioContext.currentTime,
          0.015,
        );
        const modGain = audioContext.createGain();
        modGain.gain.setTargetAtTime(
          intensity * 100,
          audioContext.currentTime,
          0.015,
        );
        modulator.connect(modGain).connect(oscData.osc.frequency);
        modulator.start();
        // Store references for cleanup
        oscData.modulator = modulator;
        oscData.modGain = modGain;
        // Usar el siguiente oscilador para el armónico principal
        if (oscIndex < oscillators.length) {
          const harmonicOsc = oscillators[oscIndex];
          harmonicOsc.osc.type = "sine";
          harmonicOsc.osc.frequency.setTargetAtTime(
            harmonics[0],
            audioContext.currentTime,
            0.015,
          );
          harmonicOsc.gain.gain.setTargetAtTime(
            intensity * 0.5,
            audioContext.currentTime,
            0.015,
          );
          harmonicOsc.panner.pan.setTargetAtTime(
            pan,
            audioContext.currentTime,
            0.015,
          );
          harmonicOsc.active = true;
        }
      }
      oscIndex++;
    } else {
      oscData.gain.gain.setTargetAtTime(0, audioContext.currentTime, 0.015);
      oscData.active = false;
    }
  }
}
