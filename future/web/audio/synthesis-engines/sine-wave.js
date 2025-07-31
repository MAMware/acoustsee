import { audioContext, oscillators } from "../../audio-processor.js";

export function playSineWave(notes) {
  let oscIndex = 0;
  const allNotes = notes.sort((a, b) => b.intensity - a.intensity);
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
      if (
        harmonics.length &&
        oscIndex + harmonics.length < oscillators.length
      ) {
        for (
          let h = 0;
          h < harmonics.length && oscIndex + h < oscillators.length;
          h++
        ) {
          oscIndex++;
          const harmonicOsc = oscillators[oscIndex];
          harmonicOsc.osc.type = "sine";
          harmonicOsc.osc.frequency.setTargetAtTime(
            harmonics[h],
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
