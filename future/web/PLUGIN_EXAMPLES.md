# Plugin examples and rationale

This document explains the starter plugin implemented (`karplus-strong-guitar.js`) and gives guidance for authors who want to build guitar- or piano-like plugins.

## Implemented starter: Karplus–Strong plucked guitar
- File: `future/web/audio/synths/karplus-strong-guitar.js`
- Algorithm: Karplus–Strong uses a short noise excitation fed into a short delay-line with feedback and a damping (lowpass) filter. The delay time is set to the fundamental period (1/frequency). The feedback gain controls sustain/decay.
- Why chosen: No external samples needed, computationally cheap, good for plucked-string timbres and a great learning example.

### Parameters supported by the starter plugin
- `frequency` (Hz) or `midi` (number) — primary pitch.
- `duration` (seconds) — how long the note sustains before envelope reaches near zero.
- `amplitude` (0..1) — overall gain for the note.
- `decay` (0..0.999) — feedback multiplier; values closer to 1 produce long sustain.
- `pan` (-1..1) — stereo pan.
- `when` (seconds offset relative to now) — schedule offset.

### Usage
Call the plugin via the application's normal play path; for example, `play([{ midi: 64, duration: 1.2, amplitude: 0.4 }], ctx)` where `ctx` is the audio runtime object provided by the app (see `future/web/README.md`).

## How to extend toward piano or more realism
- Piano (sample-based): use short multi-sampled attack samples (AudioBufferSourceNode) mapped by pitch. Optionally add a sustain-synthesis section for body resonance and release.
- Piano (physical modeling): implement modal synthesis or use multiple KS-style modes per note; higher complexity but possible.
- Hybrid: combine sample attack + Karplus-like or filtered harmonic sustain to reduce sample count.

## Performance & integration tips
- Use the provided `ctx.audioContext` and avoid creating your own context.
- Limit polyphony or implement voice stealing.
- For complex DSP, consider AudioWorklet (more complex to author but sample-accurate).
- For convolution body-resonance, use `ConvolverNode` with a short IR.

## Credits
Starter implemented by acoustsee dev tooling. Feel free to adapt and contribute back to `future/web/audio/synths/`.
