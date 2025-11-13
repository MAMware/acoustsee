// filepath: future/web/video/grids/hex-tonnetz.js
// UPDATED - This grid's sole responsibility is to map motion to the hexagonal tonnetz network.

export const meta = {
  id: 'hex-tonnetz',
  name: 'Hex Tonnetz',
  description: 'Maps motion to a hexagonal tonnetz network representing harmonic relationships in just intonation.'
};

// Tonnetz network: each hexagon represents a note in just intonation
// Based on the traditional tonnetz with major and minor thirds
const tonnetzNetwork = {
  // Each entry: [x, y] -> frequency ratio from fundamental
  nodes: [
    { x: 0, y: 0, ratio: 1.0 },       // C (1:1)
    { x: 1, y: 0, ratio: 5/4 },       // E (5:4 major third)
    { x: -1, y: 0, ratio: 4/5 },      // Ab (4:5)
    { x: 0, y: 1, ratio: 3/2 },       // G (3:2 perfect fifth)
    { x: 1, y: 1, ratio: 15/8 },      // B (15:8)
    { x: -1, y: 1, ratio: 6/5 },      // Eb (6:5 minor third)
    { x: 0, y: -1, ratio: 2/3 },      // F (2:3)
    { x: 1, y: -1, ratio: 5/6 },      // D (5:6)
    { x: -1, y: -1, ratio: 8/15 },    // Bb (8:15)
    { x: 2, y: 0, ratio: 25/16 },     // G# (25:16)
    { x: -2, y: 0, ratio: 16/25 },    // Db (16:25)
    { x: 0, y: 2, ratio: 9/4 },       // D (9:4 - octave displaced)
  ]
};

export function mapFunction(frameData, width, height, prevFrameData, opts = {}) {
  const movingRegions = opts.movingRegions || [];
  const cues = [];
  const maxNotes = 8; // Limit for harmonic clarity
  
  const fundamental = 220; // A3 as fundamental frequency
  
  // Map screen to tonnetz grid
  const gridWidth = 4; // How many hexagons across
  const gridHeight = 4; // How many hexagons tall
  
  for (const region of movingRegions.slice(0, maxNotes)) {
    const { x, y, intensity } = region;
    
    // Convert screen coordinates to tonnetz grid coordinates
    const tonnetzX = Math.floor((x / width) * gridWidth) - Math.floor(gridWidth / 2);
    const tonnetzY = Math.floor((y / height) * gridHeight) - Math.floor(gridHeight / 2);
    
    // Find the closest node in our tonnetz network
    let closestNode = tonnetzNetwork.nodes[0];
    let minDistance = Infinity;
    
    for (const node of tonnetzNetwork.nodes) {
      const distance = Math.sqrt(
        Math.pow(node.x - tonnetzX, 2) + 
        Math.pow(node.y - tonnetzY, 2)
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestNode = node;
      }
    }
    
    // Calculate frequency using just intonation ratios
    const pitch = fundamental * closestNode.ratio;
    
    cues.push({
      objectType: 'default_motion',
      pitch,
      intensity: Math.min(1.0, intensity / 255),  // Normalize uint8 (0-255) to float (0-1)
      position: {
        x: (x / width) * 2 - 1,
        y: -((y / height) * 2 - 1),
        z: 0.0
      },
      // Add tonnetz-specific metadata
      tonnetz: {
        gridX: tonnetzX,
        gridY: tonnetzY,
        ratio: closestNode.ratio,
        fundamental: fundamental
      }
    });
  }
  
  return { cues };
}

// Legacy functions removed — this module now exposes only `meta` and
// `mapFunction` and expects analysis results via opts.movingRegions.
