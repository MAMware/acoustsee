# Video Subsystem

This directory contains all logic for video capture, processing, and analysis.

## Key Files

- `frame-processor.js`: The main entry point and coordinator for video processing. It decides whether to process frames on the main thread or delegate to a worker.
- `workers/`: Contains Web Workers that perform computationally expensive tasks like motion detection off the main thread.
- `grids/`: Contains pluggable "grid" modules. Each grid is responsible for a specific strategy of mapping pixel data into abstract `cues` for the audio system.
- `motion-detector.js`: A fallback motion detection algorithm that runs on the main thread if the worker is unavailable.

## Data Flow

1. Input: `processFrameWithState` receives raw pixel data (`Uint8ClampedArray`), `width`, and `height` from the engine scheduler.
2. Delegation: It sends this data to `frame-worker.js` for analysis. The worker identifies moving regions.
3. Grid Mapping: Worker results (or fallback) are passed to the active grid's `mapFunction`.
4. Output: The grid's `mapFunction` returns an object containing an array of `cues`. Example cue:
```javascript
{
  objectType: 'default_motion',
  pitch: 440,
  intensity: 0.8,
  position: { x: -0.5, y: 0.2, z: 0 }
}
```
This `cues` array is the final output for the frame.
