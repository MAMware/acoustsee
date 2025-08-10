
export function playSineWave(notes) {
  // Deactivate all oscillators first
  oscillatorPool.forEach(o => {
    o.gain.gain.setTargetAtTime(0, audioContext.currentTime, 0.015);
    o.active = false;
  });
  const allNotes = notes.sort((a, b) => b.intensity - a.intensity);
  for (let i = 0; i < allNotes.length; i++) {
    const { pitch, intensity, harmonics = [], pan = 0 } = allNotes[i];
    const oscData = getOscillator();
    oscData.osc.type = "sine";
    oscData.osc.frequency.setTargetAtTime(pitch, audioContext.currentTime, 0.015);
    oscData.gain.gain.setTargetAtTime(intensity, audioContext.currentTime, 0.015);
    oscData.panner.pan.setTargetAtTime(pan, audioContext.currentTime, 0.015);
    oscData.active = true;
    // Harmonics: use additional oscillators from pool
    for (let h = 0; h < harmonics.length; h++) {
      const harmonicOsc = getOscillator();
      harmonicOsc.osc.type = "sine";
      harmonicOsc.osc.frequency.setTargetAtTime(harmonics[h], audioContext.currentTime, 0.015);
      harmonicOsc.gain.gain.setTargetAtTime(intensity * 0.5, audioContext.currentTime, 0.015);
      harmonicOsc.panner.pan.setTargetAtTime(pan, audioContext.currentTime, 0.015);
      harmonicOsc.active = true;
    }
  }
}
