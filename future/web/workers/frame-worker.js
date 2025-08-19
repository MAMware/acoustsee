// File: web/workers/frame-worker.js
// This is the new, intelligent version of the worker.

// NOTE: We cannot use import/export syntax here directly in this simple worker.
// We'll define everything it needs within this one file.

let lastFrameData = null;
let regionCounter = 0;

// --- Helper functions (same as in our final frame-processor) ---

function getGrayAt(frameArr, idx, width, height) {
    const base = idx * 4;
    if (base + 2 >= frameArr.length) return 0;
    return (frameArr[base] + frameArr[base + 1] + frameArr[base + 2]) / 3;
}

function floodFill(startX, startY, width, height, frameData, lastFrameData, visited, motionThreshold) {
    const threshold = motionThreshold / 2;
    const regionId = ++regionCounter;
    const maxStackSize = width * height;
    const stackX = new Int32Array(maxStackSize);
    const stackY = new Int32Array(maxStackSize);
    let sp = 0;
    stackX[sp] = startX;
    stackY[sp] = startY;
    sp++;
    let size = 0;
    let totalIntensityDiff = 0;
    let sumX = 0;
    let sumY = 0;
    while (sp > 0) {
        sp--;
        const x = stackX[sp];
        const y = stackY[sp];
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const idx = y * width + x;
        if (visited[idx]) continue;
        visited[idx] = 1;
        const currentGray = getGrayAt(frameData, idx, width, height);
        const lastGray = getGrayAt(lastFrameData, idx, width, height);
        const diff = Math.abs(currentGray - lastGray);
        if (diff > threshold) {
            size++;
            totalIntensityDiff += diff;
            sumX += x;
            sumY += y;
            if (sp < maxStackSize - 4) {
                stackX[sp] = x + 1; stackY[sp] = y; sp++;
                stackX[sp] = x - 1; stackY[sp] = y; sp++;
                stackX[sp] = x; stackY[sp] = y + 1; sp++;
                stackX[sp] = x; stackY[sp] = y - 1; sp++;
            }
        }
    }
    const avgIntensity = size > 0 ? (totalIntensityDiff / size) : 0;
    const maxRegionCounter = Math.max(1024, width * height);
    if (regionCounter > maxRegionCounter) regionCounter = 0;
    return { id: regionId, size, avgIntensity, avgX: sumX, avgY: sumY };
}


// --- Main Worker Logic ---

self.onmessage = (e) => {
    const { frameBuffer, width, height, settings } = e.data || {};
    const frameData = new Uint8ClampedArray(frameBuffer);

    if (!lastFrameData) {
        lastFrameData = new Uint8ClampedArray(frameData);
        // On the first frame, just store it and send back an empty result envelope.
        self.postMessage({ type: 'result', result: { movingRegions: [] } });
        return;
    }

    const movingRegions = [];
    const visited = new Uint8Array(width * height);
    // Defensive: use passed-in motionThreshold or a sensible default
    const motionThreshold = (settings && typeof settings.motionThreshold === 'number') ? settings.motionThreshold : 60;
    const MIN_REGION_SIZE = 10;
    const SIZE_BONUS_FACTOR = 1.5;

    for (let i = 0; i < width * height; i++) {
        if (!visited[i]) {
            const x = i % width;
            const y = Math.floor(i / width);
            const region = floodFill(x, y, width, height, frameData, lastFrameData, visited, motionThreshold);
            if (region.size > MIN_REGION_SIZE) {
                const sizeBonus = 1.0 + (Math.log(region.size) * SIZE_BONUS_FACTOR);
                const effectiveIntensity = region.avgIntensity * sizeBonus;
                if (effectiveIntensity > motionThreshold) {
                    movingRegions.push({
                        id: region.id,
                        x: region.avgX / region.size,
                        y: region.avgY / region.size,
                        intensity: Math.min(1.0, (region.avgIntensity / 255.0) * 2.0),
                        size: region.size,
                    });
                }
            }
        }
    }

    lastFrameData = frameData;
    
    // Send the results back to the main thread in the envelope the main thread expects
    self.postMessage({ type: 'result', result: { movingRegions } });
};