PLUGIN metadata and plugin template

Goal
- Plugins (grids, synths, etc.) should be lightweight JS modules with a small top-of-file PLUGIN-META comment block. The indexing script will read this block without executing the module.

PLUGIN-META format (recommended)
- Place a JSON object inside a block comment at the top of the file. Start the block with the literal string `PLUGIN-META` so the indexer can find it.

Example (minimal):
/* PLUGIN-META
{
  "id": "sine-wave",
  "displayName": "Sine Wave",
  "description": "Simple sine-wave engine using the shared oscillator pool",
  "maxNotes": 16,
  "version": "0.1.0"
}
*/

-Engine contract (synths)
- Export a play function with signature: `export function playXxx(notes, ctx = {})`.
- `notes` is an array of note objects: each item SHOULD include `{ pitch: number, intensity: number, harmonics?: number[], position?: { x, y, z } }` where `position.x` is used for azimuth/panning.
- `ctx` will contain at least:
  - `audioContext` (AudioContext)
  - `getOscillator()` function
  - `oscillatorPool` (array) and `modulators` (array) when applicable
- Engines MUST NOT create their own AudioContext or global oscillator pools.

Grid contract (video grids)
 - Export a map function: `export function mapFrameToX(frameData, ctx = {})`.
 - The map function should return an object shaped like `{ cues: [ { objectType, intensity, position } ] }` where `position` is normalized to [-1..1] and `objectType` is a string describing the detected object type.
 - `frameData` is a simple object with pixel/image data to analyze.
 - `ctx` can contain canvas, width/height, and any runtime config.

Indexing
- Run `node future/scripts/file-indexer.js` to regenerate `available-synths.js` and `available-grids.js`.

Notes
- Keep plugin files dependency-free and side-effect free at import-time if possible.
- The PLUGIN-META comment block avoids executing plugin code during indexing.
