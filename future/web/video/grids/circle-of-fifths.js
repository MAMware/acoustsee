// filepath: future/web/video/grids/circle-of-fifths.js
// This grid's sole responsibility is to map radial motion to the circle of fifths.

export const meta = {
  id: 'circle-of-fifths',
  name: 'Circle of Fifths',
  description: 'Maps the angle of motion around the center of the screen to a 12-note scale based on the circle of fifths.'
};

const circleOfFifthsScale = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // MIDI note offsets from root

// NOTE: analysis logic removed. Grids are sonic sculptors and should
// receive analysis results via opts.movingRegions. Legacy detection and
// deprecated mapping helpers were removed to enforce the proper contract.

// Backwards-compatible adapter: prefer `mapFunction` as the canonical export
// contract used by available-grids.js. This adapter delegates to existing
// legacy mappers while preserving their original exports for external users.
export const mapFunction = function(frameData, width, height, prevFrameData, opts = {}) {
  const movingRegions = opts.movingRegions || [];
  const cues = [];
  const maxNotes = 12;

  // Center of the screen
  const cx = width / 2;
  const cy = height / 2;
  const rootMidiNote = 60; // Middle C

  for (const region of movingRegions.slice(0, maxNotes)) {
    const { x, y, intensity } = region;
    
    // Calculate the angle of the motion relative to the center
    const dx = x - cx;
    const dy = y - cy;
    const angle = Math.atan2(dy, dx); // Angle in radians from -PI to PI
    
    // Normalize angle to a 0-1 range
    const normalizedAngle = (angle + Math.PI) / (2 * Math.PI);
    
    // Map the angle to one of the 12 bins
    const bin = Math.floor(normalizedAngle * 12) % 12;
    const midiNote = rootMidiNote + circleOfFifthsScale[bin];
    
    // Convert MIDI note number to frequency (Hz)
    const pitch = 440 * Math.pow(2, (midiNote - 69) / 12);

    cues.push({
      objectType: 'default_motion', // This grid still produces a generic motion type
      pitch,
      intensity: Math.min(1.0, intensity / 255),  // Normalize uint8 (0-255) to float (0-1)
      position: {
        x: (x / width) * 2 - 1,
        y: -((y / height) * 2 - 1),
        z: 0.0
      }
    });
  }
  
  return { cues };
};