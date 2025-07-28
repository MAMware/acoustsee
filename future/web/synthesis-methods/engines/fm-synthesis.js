import { audioContext, oscillators, modulators } from "../../audio-processor.js";

export function playFmSynthesis(notes) {
  let oscIndex = 0;
  let modIndex = 0;
  const allNotes = notes.sort((a, b) => b.intensity - a.intensity);
  for (let i = 0; i < oscillators.length; i++) {
    const oscData = oscillators[i];
    if (oscIndex < allNotes.length) {
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
      if (harmonics.length) {
        // handle one modulator per note, reuse or create
        let modData;
        if (modIndex < modulators.length) {
          modData = modulators[modIndex];
        } else {
          const mOsc = audioContext.createOscillator();
          const mGain = audioContext.createGain();
          modulators.push({ osc: mOsc, gain: mGain, started: false });
          modData = modulators[modulators.length - 1];
        }
        // configure modulator
        modData.osc.type = "sine";
        modData.osc.frequency.setTargetAtTime(
          pitch * 2,
          audioContext.currentTime,
          0.015,
        );
        modData.gain.gain.setTargetAtTime(
          intensity * 100,
          audioContext.currentTime,
          0.015,
        );
        // connect and start only once
        modData.osc.connect(modData.gain).connect(oscData.osc.frequency);
        if (!modData.started) {
          modData.osc.start();
          modData.started = true;
        }
        modIndex++;
        // Use next oscillator for main harmonic
        if (oscIndex + 1 < oscillators.length) {
          const harmonicOsc = oscillators[oscIndex + 1];
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
  // silence any unused modulators
  for (let i = modIndex; i < modulators.length; i++) {
    modulators[i].gain.gain.setTargetAtTime(0, audioContext.currentTime, 0.015);
  }
}
