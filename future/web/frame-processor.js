// future/web/ui/frame-processor.js
// This module processes video frames and maps them to musical notes using a grid synthesis method.
import { settings } from "./state.js";
import { dispatchEvent } from "./ui/event-dispatcher.js";

export async function mapFrameToNotes(frameData, width, height, prevFrameDataLeft, prevFrameDataRight) {
  try {
    const gridsResponse = await fetch("./synthesis-methods/grids/availableGrids.json");
    if (!gridsResponse.ok) throw new Error(`Failed to load availableGrids.json: ${gridsResponse.status}`);
    const availableGrids = await gridsResponse.json();
    const grid = availableGrids.find((g) => g.id === settings.gridType);
    if (!grid) {
      console.error(`Grid not found: ${settings.gridType}`);
      dispatchEvent("logError", { message: `Grid not found: ${settings.gridType}` });
      return { notes: [], prevFrameDataLeft, prevFrameDataRight };
    }
    const gridModule = await import(`./synthesis-methods/grids/${grid.id}.js`);
    const mapFunction = gridModule[`mapFrameTo${grid.id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')}`];
    if (!mapFunction) {
      console.error(`Map function for ${grid.id} not found`);
      dispatchEvent("logError", { message: `Map function for ${grid.id} not found` });
      return { notes: [], prevFrameDataLeft, prevFrameDataRight };
    }
    const halfWidth = width / 2;
    const leftFrame = new Uint8ClampedArray(halfWidth * height);
    const rightFrame = new Uint8ClampedArray(halfWidth * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < halfWidth; x++) {
        leftFrame[y * halfWidth + x] = frameData[y * width + x];
        rightFrame[y * halfWidth + x] = frameData[y * width + x + halfWidth];
      }
    }
    const leftResult = mapFunction(leftFrame, halfWidth, height, prevFrameDataLeft, -1);
    const rightResult = mapFunction(rightFrame, halfWidth, height, prevFrameDataRight, 1);
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