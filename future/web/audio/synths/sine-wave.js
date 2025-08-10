
export function playSineWave(notes) {
  // Deactivate all oscillators first with a short fade-out to avoid clicks
  const now = audioContext.currentTime;
  const releaseTime = 0.05; // seconds
  oscillatorPool.forEach(o => {
    // cancel any scheduled values and ramp down gain
    o.gain.gain.cancelScheduledValues(now);
    o.gain.gain.linearRampToValueAtTime(0, now + releaseTime);
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
