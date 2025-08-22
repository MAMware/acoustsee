
/* PLUGIN-META
{
  "id": "sine-wave",
  "displayName": "Sine Wave",
  "description": "Simple sine-wave engine using the shared oscillator pool",
  "maxNotes": 16,
  "version": "0.1.0"
}
*/

export function playSineWave(notes, ctx = {}) {
  const audioContext = ctx.audioContext || (typeof window !== 'undefined' && window.audioContext) || globalThis.audioContext;
  const getOscillator = ctx.getOscillator || (typeof window !== 'undefined' && window.getOscillator) || globalThis.getOscillator;
  const oscillatorPool = ctx.oscillatorPool || (typeof window !== 'undefined' && window.oscillatorPool) || globalThis.oscillatorPool || [];
  if (!audioContext || !getOscillator) {
    console.warn('playSineWave: missing audioContext or getOscillator in context');
    return;
  }
  // Deactivate all oscillators first with a short fade-out to avoid clicks
  const now = audioContext.currentTime;
  const releaseTime = 0.05; // seconds
  oscillatorPool.forEach(o => {
    // cancel any scheduled values and ramp down gain
    try { o.gain.gain.cancelScheduledValues(now); o.gain.gain.linearRampToValueAtTime(0, now + releaseTime); } catch(e){}
    o.active = false;
  });
  const allNotes = notes.slice().sort((a, b) => b.intensity - a.intensity);
  for (let i = 0; i < allNotes.length; i++) {
    const { pitch, intensity, harmonics = [], position } = allNotes[i];
    const pan = position ? position.x : 0;
    const oscData = getOscillator();
    if (!oscData) continue;
    oscData.osc.type = "sine";
    oscData.osc.frequency.setTargetAtTime(pitch, audioContext.currentTime, 0.015);
    oscData.gain.gain.setTargetAtTime(intensity, audioContext.currentTime, 0.015);
    oscData.panner.pan.setTargetAtTime(pan, audioContext.currentTime, 0.015);
    oscData.active = true;
    // Harmonics: use additional oscillators from pool
    for (let h = 0; h < harmonics.length; h++) {
      const harmonicOsc = getOscillator();
      if (!harmonicOsc) continue;
      harmonicOsc.osc.type = "sine";
      harmonicOsc.osc.frequency.setTargetAtTime(harmonics[h], audioContext.currentTime, 0.015);
      harmonicOsc.gain.gain.setTargetAtTime(intensity * 0.5, audioContext.currentTime, 0.015);
      harmonicOsc.panner.pan.setTargetAtTime(pan, audioContext.currentTime, 0.015);
      harmonicOsc.active = true;
    }
  }
}

export const synthMeta = {
  id: 'sine-wave',
  name: 'Sine Wave',
  author: 'acoustsee',
  description: 'Simple sine-wave engine using the shared oscillator pool',
  version: '0.1.0',
  maxNotes: 16
};
