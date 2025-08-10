export function playFmSynthesis(notes) {
  // Deactivate all oscillators first with short fade-out to prevent clicks
  const now = audioContext.currentTime;
  const releaseTime = 0.05; // seconds for fade-out
  oscillatorPool.forEach(o => {
    o.gain.gain.cancelScheduledValues(now);
    o.gain.gain.linearRampToValueAtTime(0, now + releaseTime);
    o.active = false;
  });
  let modIndex = 0;
  const allNotes = notes.sort((a, b) => b.intensity - a.intensity);
  for (let i = 0; i < allNotes.length; i++) {
    const { pitch, intensity, harmonics = [], pan = 0 } = allNotes[i];
    const oscData = getOscillator();
    oscData.osc.type = "sine";
    oscData.osc.frequency.setTargetAtTime(pitch, audioContext.currentTime, 0.015);
    oscData.gain.gain.setTargetAtTime(intensity, audioContext.currentTime, 0.015);
    oscData.panner.pan.setTargetAtTime(pan, audioContext.currentTime, 0.015);
    oscData.active = true;
    // FM: handle one modulator per note, reuse or create
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
    modData.osc.frequency.setTargetAtTime(pitch * 2, audioContext.currentTime, 0.015);
    modData.gain.gain.setTargetAtTime(intensity * 100, audioContext.currentTime, 0.015);
    // connect and start only once
    modData.osc.connect(modData.gain).connect(oscData.osc.frequency);
    if (!modData.started) {
      modData.osc.start();
      modData.started = true;
    }
    modIndex++;
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
  // Silence any unused modulators with fade-out
  for (let i = modIndex; i < modulators.length; i++) {
    const m = modulators[i];
    m.gain.gain.cancelScheduledValues(now);
    m.gain.gain.linearRampToValueAtTime(0, now + releaseTime);
  }
}
