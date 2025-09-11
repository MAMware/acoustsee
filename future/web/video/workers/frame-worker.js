// File: web/workers/frame-worker.js
// FINAL VERSION: Smart worker with adaptive thresholding and robust messaging.
// REVIEW: 2025-09-11=R11925: lets explain with a summary comment what this does and lets check we dont duplicate dutys with motion-detector.js and motion-worker.js

// This worker processes video frames to detect moving regions using a robust flood-fill algorithm.
// It adapts motion detection sensitivity based on region size and intensity, ensuring reliable detection
// even in noisy conditions. The worker communicates results back to the main thread efficiently.
// It maintains state between frames to improve detection accuracy over time. 

// State variables

let lastFrameData = null;
let regionCounter = 0;

// Helper: return grayscale intensity for pixel at index (0..w*h-1) R11925: dont we have the videoframe-helper.js for this? getGray for where? what about colorspace?
function getGrayAt(frameArr, idx) {
    const base = idx * 4;
    if (base + 2 >= frameArr.length) return 0;
    return (frameArr[base] + frameArr[base + 1] + frameArr[base + 2]) / 3;
}

// Robust flood-fill that returns region stats (R11925: we should explain the algorithm in a comment)
// Uses an explicit stack to avoid recursion limits and tracks visited pixels
// Returns region size, average intensity difference, and centroid coordinates (R11925: to check)
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

        const currentGray = getGrayAt(frameData, idx);
        const lastGray = getGrayAt(lastFrameData, idx);
        const diff = Math.abs(currentGray - lastGray);

        if (diff > threshold) {
            size++;
            totalIntensityDiff += diff;
            sumX += x;
            sumY += y;

            if (sp < maxStackSize - 4) {
                stackX[sp] = x + 1; stackY[sp] = y; sp++;
                stackX[sp] = x - 1; stackY[sp] = y; sp++;
                stackX[sp] = x;     stackY[sp] = y + 1; sp++;
                stackX[sp] = x;     stackY[sp] = y - 1; sp++;
            }
        }
    }

    const avgIntensity = size > 0 ? (totalIntensityDiff / size) : 0;
    const maxRegionCounter = Math.max(1024, width * height);
    if (regionCounter > maxRegionCounter) regionCounter = 0;

    return { id: regionId, size, avgIntensity, avgX: sumX, avgY: sumY };
}


// Main message handler R11925: we should explain the message protocol in a comment (what messages we expect, what we send back)    
self.onmessage = (e) => {
    const { frameBuffer, width, height, settings } = e.data || {};
    const frameData = new Uint8ClampedArray(frameBuffer);

    if (!lastFrameData) {
        // Keep a reference to avoid extra copy on first frame
        lastFrameData = frameData;
        // Return empty movingRegions in the envelope the manager expects
        self.postMessage({ type: 'result', result: { movingRegions: [] } });
        return;
    }

    const movingRegions = [];
    const visited = new Uint8Array(width * height);
    const motionThreshold = (settings && typeof settings.motionThreshold === 'number') ? settings.motionThreshold : 60;
    const MIN_REGION_SIZE = 10; //R11925: hardcoding?
    const SIZE_BONUS_FACTOR = 1.5; // R11925: hardcoding?

    // Scan through all pixels, initiating flood-fills for unvisited pixels with significant motion (R11925:check this claim) 

    for (let i = 0; i < width * height; i++) {
        if (!visited[i]) {
            const x = i % width;
            const y = Math.floor(i / width);
            const region = floodFill(x, y, width, height, frameData, lastFrameData, visited, motionThreshold);

            if (region.size > MIN_REGION_SIZE) {
                // Adaptive intensity + size bonus logic
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
    self.postMessage({ type: 'result', result: { movingRegions } });
};