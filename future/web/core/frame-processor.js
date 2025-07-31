import { settings } from "./state.js";
import { dispatchEvent } from "./dispatcher.js";

export async function mapFrameToNotes(frameData, width, height, prevFrameDataLeft, prevFrameDataRight) {
  try {
    // Use cached grids loaded at startup
    const availableGrids = settings.availableGrids;
    const grid = availableGrids.find((g) => g.id === settings.gridType);
    if (!grid) {
      console.error(`Grid not found: ${settings.gridType}`);
      dispatchEvent("logError", { message: `Grid not found: ${settings.gridType}` });
      return { notes: [], prevFrameDataLeft, prevFrameDataRight };
    }
    const gridModule = await import(`../synthesis-grids/${grid.id}.js`);
    const mapFunction = gridModule[`mapFrameTo${grid.id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')}`];
    if (!mapFunction) {
      console.error(`Map function for ${grid.id} not found`);
      dispatchEvent("logError", { message: `Map function for ${grid.id} not found` });
      return { notes: [], prevFrameDataLeft, prevFrameDataRight };
    }
    // Determine split buffers and copy full RGBA pixels
    const halfWidth = Math.floor(width / 2);
    const frameSize = halfWidth * height * 4;
    const leftFrameData = new Uint8ClampedArray(frameSize);
    const rightFrameData = new Uint8ClampedArray(frameSize);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < halfWidth; x++) {
        const fullIdx = (y * width + x) * 4;
        const halfIdx = (y * halfWidth + x) * 4;
        // Copy left RGBA
        leftFrameData.set(frameData.subarray(fullIdx, fullIdx + 4), halfIdx);
        // Copy right RGBA
        const fullIdxR = (y * width + x + halfWidth) * 4;
        rightFrameData.set(frameData.subarray(fullIdxR, fullIdxR + 4), halfIdx);
      }
    }
    const leftResult = mapFunction(leftFrameData, halfWidth, height, prevFrameDataLeft, -1);
    const rightResult = mapFunction(rightFrameData, halfWidth, height, prevFrameDataRight, 1);
    const allNotes = [...(leftResult.notes || []), ...(rightResult.notes || [])];
    return {
      notes: allNotes,
      prevFrameDataLeft: leftResult.newFrameData,
      prevFrameDataRight: rightResult.newFrameData,
    };
  } catch (err) {
    console.error("mapFrameToNotes error:", err.message);
    dispatchEvent("logError", { message: `Frame mapping error: ${err.message}` });
    return { notes: [], prevFrameDataLeft, prevFrameDataRight };
  }
}