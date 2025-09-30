// filepath: future/web/video/grids/linear-pitch.js
// A simple grid for generic motion that maps vertical position to pitch.

export const meta = {
  id: 'linear-pitch',
  name: 'Linear Pitch',
  description: 'Maps the vertical position of motion directly to musical pitch.'
};

export function mapFunction(frameData, width, height, prevFrameData, opts = {}) {
  const movingRegions = opts.movingRegions || [];
  const cues = [];
  const maxNotes = 12; 

  for (const region of movingRegions.slice(0, maxNotes)) {
    const { x, y, intensity } = region;
    
    // Map the vertical position (y) to a musical pitch.
    // Top of the screen (y=0) -> high pitch. Bottom (y=height) -> low pitch.
    const pitch = 200 + (1 - (y / height)) * 800;

    cues.push({
      objectType: 'default_motion',
      pitch,
      intensity: Math.min(1.0, intensity / 100),
      position: {
        x: (x / width) * 2 - 1,
        y: -((y / height) * 2 - 1),
        z: 0.0
      }
    });
  }

  return { cues };
}