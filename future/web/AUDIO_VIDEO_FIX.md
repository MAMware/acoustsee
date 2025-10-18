# Audio-Visual Pipeline Fix: Video Makes No Sound

## Problem

When processing video in both **Flow** and **Focus** modes, the application was not producing any audio output despite successfully initializing the audio system and video pipeline.

## Root Causes Identified

### 1. **Missing Function Implementations** (Primary)
The `frame-processor.js` file was calling two functions in Focus mode that were never defined:
- `simulateObjectDetection()` - line 277
- `simulateShapeAnalysis()` - line 281

When these functions were called, they threw `ReferenceError` exceptions, causing the frame processor to crash silently and preventing audio cues from being dispatched.

### 2. **Missing Fallback Logic** (Secondary)
Even when functions existed, the code had no fallback when:
- **Flow mode**: Grid's `mapFunction` returned empty cues array
- **Focus mode**: Object detection found no objects
- In both cases, `dispatchPayload` remained `null` and no audio was generated

## Solution Implemented

### Part 1: Implemented Missing Functions

Added two new async functions to `frame-processor.js`:

```javascript
async function simulateObjectDetection(motionResults = {})
```
Converts motion analysis results into semantic object detections. In a real implementation, this would run a machine learning model. Currently, it extracts the first motion object and packages it as a detected object.

```javascript
async function simulateShapeAnalysis(detectedObject = {})
```
Analyzes the shape characteristics of a detected object and returns shape metadata (edges, texture, moving regions). Provides data that grids can use for refined sonification.

### Part 2: Added Comprehensive Fallback Logic

**Flow Mode Fallback:**
- If grid's `mapFunction` returns no cues → generate default cues from motion data
- If no grid exists → generate cues directly from motion regions
- Ensures audio plays whenever motion is detected

**Focus Mode Fallback:**
- If object detection finds no objects → fall back to flow mode grid mapping
- Uses motion data as fallback, ensuring continuity
- Prevents silent audio in scenarios where objects aren't detected

## Implementation Details

### simulateObjectDetection()
- Input: Motion analysis results (`motionResults.objects` array)
- Output: Array of detected objects with `{ id, label, confidence, position, boundingBox }`
- Behavior: Extracts first motion object as primary detection; handles empty input gracefully

### simulateShapeAnalysis()
- Input: A detected object with position and confidence data
- Output: Shape metadata with `{ shapeType, confidence, edges, texture, movingRegions }`
- Behavior: Creates simulated shape features; provides motion regions for grid mapping

### Fallback Cue Generation
- Uses `motionResults.movingRegions` to create basic audio cues
- Varies pitch based on vertical position: `440 + (region.y || 0) * 400`
- Intensity derived from motion magnitude
- Applies same mapping as Flow mode when primary methods fail

## Testing Checklist

- [ ] Video processing in Flow mode generates audio
- [ ] Video processing in Focus mode generates audio
- [ ] Audio continues even when motion detection fails
- [ ] Audio continues even when grid returns no cues
- [ ] No console errors with `ReferenceError`
- [ ] Both synth engines (strings, sine-wave) work with video
- [ ] Both depth paths (pseudo, cnn) work with video
- [ ] Audio plays continuously during video processing
- [ ] Dev panel shows "Dispatching audioCuesReady" logs
- [ ] Audio cue counts in logs are > 0

## Files Modified

- `/workspaces/acoustsee/future/web/video/frame-processor.js`
  - Added `simulateObjectDetection()` function
  - Added `simulateShapeAnalysis()` function
  - Added fallback cue generation in Flow mode
  - Added fallback logic in Focus mode

## Next Steps (Optional Enhancements)

1. **Implement Real Object Detection**: Replace `simulateObjectDetection()` with actual ML model (TensorFlow.js, ONNX, etc.)
2. **Implement Real Shape Analysis**: Add actual edge detection, texture analysis, corner detection
3. **Optimize Motion Region Extraction**: Currently placeholder; should extract actual motion vectors
4. **Add Configuration Options**: Allow users to enable/disable fallback behavior
5. **Add Performance Metrics**: Track when fallbacks are used; profile object detection performance
