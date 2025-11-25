/**
 * AUDIO_CONSTANTS.js
 * 
 * Centralized DSP parameter repository for all synths.
 * Replaces magic numbers with named constants for tuning and maintainability.
 * 
 * All constants follow the naming pattern:
 *   SYNTH_TYPE_PARAM_NAME (e.g., STRINGS_AMPLITUDE_CAP, FM_MODULATION_INDEX)
 * 
 * Values are grouped by synth type for easy discovery and modification.
 */

// ============================================================================
// STRINGS SYNTH (Karplus–Strong Plucked-String Guitar)
// ============================================================================

/**
 * Maximum amplitude multiplier for individual notes.
 * Hard cap prevents clipping and runaway levels.
 * Range: 0.0 - 0.3 (typical: 0.15)
 */
export const STRINGS_AMPLITUDE_CAP = 0.15;

/**
 * Default amplitude when note.intensity is not provided.
 * Used in fallback logic for missing parameters.
 * Range: 0.01 - 0.15
 */
export const STRINGS_AMPLITUDE_DEFAULT = 0.08;

/**
 * Initial noise excitation amplitude multiplier.
 * Controls the "pluck" character and transient response.
 * Range: 0.1 - 0.5 (typical: 0.3)
 */
export const STRINGS_EXCITATION_AMPLITUDE = 0.3;

/**
 * Feedback decay coefficient for the Karplus-Strong feedback loop.
 * Determines sustain length and resonance character.
 * Safe range enforced: 0.85 - 0.95 (prevents runaway or immediate decay)
 * Default: 0.90 (balanced sustain)
 */
export const STRINGS_DECAY_FEEDBACK_MIN = 0.85;
export const STRINGS_DECAY_FEEDBACK_MAX = 0.95;
export const STRINGS_DECAY_FEEDBACK_DEFAULT = 0.90;

/**
 * Duration of noise excitation burst (seconds).
 * Defines the pluck transient length.
 * Range: 0.01 - 0.1s (typical: 0.03s)
 */
export const STRINGS_NOISE_DURATION = 0.03;

/**
 * Minimum safe delay time (seconds).
 * Prevents zero or negative feedback delays.
 * Range: 0.001 - 0.005s
 */
export const STRINGS_MIN_DELAY_TIME = 0.002;

/**
 * Damping filter frequency calculation offset.
 * Formula: Math.min(12000, 800 + frequency * 6)
 * Ensures smooth damping across frequency range.
 */
export const STRINGS_FILTER_FREQ_BASE = 800;
export const STRINGS_FILTER_FREQ_MULTIPLIER = 6;
export const STRINGS_FILTER_FREQ_MAX = 12000;

/**
 * Attack and release envelope times for output gain shaping.
 * Envelope ramps from zero to final amplitude over duration.
 */
export const STRINGS_ENVELOPE_ATTACK_TIME = 0;      // Immediate attack
export const STRINGS_ENVELOPE_RELEASE_VALUE = 0.0001; // Near-silent tail
export const STRINGS_EXTRA_SUSTAIN_TIME = 1.0;      // Additional sustain after note duration

// ============================================================================
// SAWTOOTH PAD SYNTH (Polyphonic Filtered Pad)
// ============================================================================

/**
 * Attack envelope time (seconds).
 * Slow attack creates the characteristic "pad" swelling effect.
 * Range: 0.05 - 0.5s (typical: 0.1s)
 */
export const SAWTOOTH_ATTACK_TIME = 0.1;

/**
 * Release envelope time (seconds).
 * Sustain tail after note ends for smooth decay.
 * Range: 0.2 - 1.0s (typical: 0.5s)
 */
export const SAWTOOTH_RELEASE_TIME = 0.5;

/**
 * Low-pass filter cutoff frequency (Hz).
 * Makes sawtooth wave less harsh; good starting point.
 * Range: 500 - 3000Hz (typical: 1200Hz)
 */
export const SAWTOOTH_FILTER_CUTOFF = 1200;

/**
 * Amplitude scaling for pad notes.
 * Pads are typically quieter than other synths.
 * Range: 0.3 - 0.7 (typical: 0.5 multiplier applied to intensity)
 */
export const SAWTOOTH_AMPLITUDE_SCALE = 0.5;

/**
 * Default note duration (seconds).
 * Used when note.duration is not provided.
 * Range: 0.1 - 1.0s (typical: 0.5s)
 */
export const SAWTOOTH_DEFAULT_DURATION = 0.5;

/**
 * Filter and frequency smoothing time constant (seconds).
 * Exponential ramp for smooth parameter transitions.
 * Range: 0.01 - 0.1s (typical: 0.01s)
 */
export const SAWTOOTH_SMOOTHING_TIME = 0.01;

// ============================================================================
// FM SYNTHESIS SYNTH (Frequency Modulation)
// ============================================================================

/**
 * Default modulation index (deviation ratio).
 * Controls the intensity of frequency modulation.
 * Range: 1 - 500 (typical: 50 for musical timbre)
 * Higher values = more harmonics and brightness
 */
export const FM_MODULATION_INDEX_DEFAULT = 50;

/**
 * Release fade-out time (seconds).
 * Quick release allows notes to be cut cleanly.
 * Range: 0.01 - 0.2s (typical: 0.05s)
 */
export const FM_RELEASE_TIME = 0.05;

/**
 * Frequency/parameter smoothing time constant (seconds).
 * Exponential ramp to avoid harsh parameter jumps.
 * Range: 0.01 - 0.05s (typical: 0.015s)
 */
export const FM_SMOOTHING_TIME = 0.015;

/**
 * Default note duration (seconds).
 * Used when note.duration is not provided.
 * Range: 0.1 - 1.0s (typical: 0.5s)
 */
export const FM_DEFAULT_DURATION = 0.5;

/**
 * Maximum gain value (normalized).
 * Clamps intensity to prevent clipping.
 * Range: 0.7 - 1.0 (typical: 1.0)
 */
export const FM_MAX_GAIN = 1;

// ============================================================================
// SINE WAVE SYNTH (Simple Sine Tone Generator)
// ============================================================================

/**
 * Attack envelope time (seconds).
 * Smooth onset for sine tones.
 * Range: 0.01 - 0.2s (typical: 0.01s)
 */
export const SINE_ATTACK_TIME = 0.01;

/**
 * Release envelope time (seconds).
 * Tail for natural decay.
 * Range: 0.1 - 0.5s (typical: 0.1s)
 */
export const SINE_RELEASE_TIME = 0.1;

/**
 * Default note duration (seconds).
 * Range: 0.1 - 2.0s (typical: 1.0s)
 */
export const SINE_DEFAULT_DURATION = 1.0;

// ============================================================================
// SHARED / GLOBAL SYNTH PARAMETERS
// ============================================================================

/**
 * Maximum polyphony (voice count) per synth.
 * Desktop/tablet: higher, Mobile: lower per device-aware pool sizing.
 * These are fallback defaults; actual pool size is device-aware.
 */
export const SYNTH_MAX_VOICES_DEFAULT = 16;
export const SYNTH_MAX_VOICES_DESKTOP = 32;
export const SYNTH_MAX_VOICES_TABLET = 24;
export const SYNTH_MAX_VOICES_MOBILE = 16;

/**
 * Minimum frequency (Hz).
 * Prevents sub-sonic frequencies that consume CPU without audible effect.
 * Range: 20 - 50Hz (typical: 20Hz for human hearing limit)
 */
export const SYNTH_MIN_FREQUENCY = 50;

/**
 * Maximum frequency (Hz).
 * Prevents aliasing and ultra-sonic frequencies.
 * Range: 15000 - 20000Hz (typical: 15000Hz accounting for Nyquist)
 */
export const SYNTH_MAX_FREQUENCY = 15000;

/**
 * Pan (stereo positioning) range.
 * Normalized to [-1, +1] where -1 = left, 0 = center, +1 = right.
 * Used with StereoPanner node constraints.
 */
export const SYNTH_PAN_MIN = -1;
export const SYNTH_PAN_MAX = 1;
export const SYNTH_PAN_CENTER = 0;

/**
 * Amplitude (gain) range for normalized intensity values.
 * Prevents clipping and ensures consistent dynamics.
 */
export const SYNTH_AMPLITUDE_MIN = 0;
export const SYNTH_AMPLITUDE_MAX = 1;

/**
 * MIDI note range mapping.
 * Standard MIDI range: 0 - 127
 * A4 (MIDI 69) = 440 Hz (concert pitch reference)
 */
export const MIDI_A4_NOTE = 69;
export const MIDI_A4_FREQUENCY = 440;
export const MIDI_NOTE_MIN = 0;
export const MIDI_NOTE_MAX = 127;

/**
 * Exponential ramp minimum value.
 * Prevents log(0) errors in exponential ramps.
 * Range: 1e-5 - 1e-3 (typical: 0.0001)
 */
export const EXPONENTIAL_RAMP_MIN = 0.0001;

export default {
  // Strings
  STRINGS_AMPLITUDE_CAP,
  STRINGS_AMPLITUDE_DEFAULT,
  STRINGS_EXCITATION_AMPLITUDE,
  STRINGS_DECAY_FEEDBACK_MIN,
  STRINGS_DECAY_FEEDBACK_MAX,
  STRINGS_DECAY_FEEDBACK_DEFAULT,
  STRINGS_NOISE_DURATION,
  STRINGS_MIN_DELAY_TIME,
  STRINGS_FILTER_FREQ_BASE,
  STRINGS_FILTER_FREQ_MULTIPLIER,
  STRINGS_FILTER_FREQ_MAX,
  STRINGS_ENVELOPE_ATTACK_TIME,
  STRINGS_ENVELOPE_RELEASE_VALUE,
  STRINGS_EXTRA_SUSTAIN_TIME,
  // Sawtooth Pad
  SAWTOOTH_ATTACK_TIME,
  SAWTOOTH_RELEASE_TIME,
  SAWTOOTH_FILTER_CUTOFF,
  SAWTOOTH_AMPLITUDE_SCALE,
  SAWTOOTH_DEFAULT_DURATION,
  SAWTOOTH_SMOOTHING_TIME,
  // FM Synthesis
  FM_MODULATION_INDEX_DEFAULT,
  FM_RELEASE_TIME,
  FM_SMOOTHING_TIME,
  FM_DEFAULT_DURATION,
  FM_MAX_GAIN,
  // Sine Wave
  SINE_ATTACK_TIME,
  SINE_RELEASE_TIME,
  SINE_DEFAULT_DURATION,
  // Shared/Global
  SYNTH_MAX_VOICES_DEFAULT,
  SYNTH_MAX_VOICES_DESKTOP,
  SYNTH_MAX_VOICES_TABLET,
  SYNTH_MAX_VOICES_MOBILE,
  SYNTH_MIN_FREQUENCY,
  SYNTH_MAX_FREQUENCY,
  SYNTH_PAN_MIN,
  SYNTH_PAN_MAX,
  SYNTH_PAN_CENTER,
  SYNTH_AMPLITUDE_MIN,
  SYNTH_AMPLITUDE_MAX,
  MIDI_A4_NOTE,
  MIDI_A4_FREQUENCY,
  MIDI_NOTE_MIN,
  MIDI_NOTE_MAX,
  EXPONENTIAL_RAMP_MIN
};
