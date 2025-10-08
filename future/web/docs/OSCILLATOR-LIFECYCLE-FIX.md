# Oscillator Lifecycle Management Fix

**Date:** October 8, 2025  
**Issue:** Synths playing < 1 second, silent synths, inconsistent behavior, sawtooth continuing after stop  
**Root Cause:** Oscillators were being reused after stopping, violating Web Audio API lifecycle rules

## The Problem

Web Audio API `OscillatorNode` objects can only call `.start()` **once** in their lifetime. Once stopped, they become dead and cannot be reused. The previous pool implementation tried to reuse oscillators by tracking them with an `active` flag, but this didn't prevent attempting to restart dead oscillators.

### Symptoms
1. **Short bursts** - Oscillators failed to restart, causing < 1 second playback
2. **Silent synths** - Pool full of dead oscillators, no fresh ones available
3. **Sawtooth continues** - Cleanup function couldn't identify which oscillators to stop
4. **Inconsistent behavior** - Race conditions from reusing dead oscillators

## The Solution: Three-State Lifecycle

Changed from two-state (`active: true/false`) to three-state (`state: 'fresh'|'active'|'dead'`):

- **`fresh`** - Never started, ready to use
- **`active`** - Currently playing sound
- **`dead`** - Stopped, must be garbage collected (cannot reuse)

## Changes Made

### 1. Pool Item Structure (audio-processor.js)

**Before:**
```javascript
{ osc, gain, panner, active: false }
```

**After:**
```javascript
{ osc, gain, panner, state: 'fresh' }
```

### 2. getOscillator() - Only Use Fresh Oscillators

**Before:**
```javascript
if (oscillatorPool.length > 0) {
  const oscObj = oscillatorPool.pop(); // Could be dead!
  return oscObj;
}
```

**After:**
```javascript
const freshIndex = oscillatorPool.findIndex(item => item.state === 'fresh');
if (freshIndex !== -1) {
  const oscObj = oscillatorPool[freshIndex];
  oscObj.state = 'active'; // Mark as now being used
  return oscObj;
}
// Create new if no fresh ones available
```

### 3. releaseOscillator() - Mark as Dead, Don't Recreate

**Before:**
```javascript
function releaseOscillator(oscObj) {
  // Stop and disconnect old oscillator
  oscObj.osc.stop();
  oscObj.osc.disconnect();
  
  // Create fresh oscillator and push back to pool
  const newOsc = context.createOscillator();
  oscillatorPool.push({ osc: newOsc, gain, panner, active: false });
}
```

**After:**
```javascript
function releaseOscillator(oscObj) {
  oscObj.state = 'dead'; // Mark as dead
  
  // Stop and disconnect
  oscObj.osc.stop();
  oscObj.osc.disconnect();
  
  // No longer creates new oscillator - that happens in refill
}
```

### 4. resizeOscillatorPool() - Garbage Collection

**Added:**
```javascript
// Garbage collect dead oscillators
oscillatorPool = oscillatorPool.filter(item => item.state !== 'dead');

// Count fresh oscillators
const freshCount = oscillatorPool.filter(item => item.state === 'fresh').length;

// Only refill if fresh count is low
if (freshCount < bufferedSize) {
  // Add fresh oscillators...
}
```

### 5. playCues() Refill Logic

**Before:**
```javascript
if (oscillatorPool.length < bufferedSize) {
  // Refill to bufferedSize
}
```

**After:**
```javascript
// Garbage collect first
oscillatorPool = oscillatorPool.filter(item => item.state !== 'dead');

// Count fresh oscillators
const freshCount = oscillatorPool.filter(item => item.state === 'fresh').length;

// Refill based on fresh count, not total pool size
if (freshCount < bufferedSize) {
  const toAdd = bufferedSize - freshCount;
  // ...
}
```

### 6. Sawtooth-Pad Cleanup (synths/sawtooth-pad.js)

**Before:**
```javascript
if (oscObj.active && oscObj.synthId === 'sawtooth-pad') {
  // Stop voice
  oscObj.active = false;
}
```

**After:**
```javascript
if (oscObj.state === 'active' && oscObj.synthId === 'sawtooth-pad') {
  // Stop voice
  releaseOscillator(oscObj); // Properly marks as dead
}
```

## Expected Behavior After Fix

### Logs
You should now see logs like:
```json
{
  "level": "DEBUG",
  "message": "Refilled oscillator pool",
  "added": 6,
  "newFreshCount": 18,
  "totalSize": 24,
  "bufferedSize": 18,
  "maxNotes": 12
}

{
  "level": "DEBUG",
  "message": "releaseOscillator: Marked oscillator as dead",
  "freshCount": 15,
  "activeCount": 3,
  "deadCount": 6,
  "totalPoolSize": 24
}
```

### Audio Behavior
1. **All synths audible** - Fresh oscillators always available
2. **Continuous playback** - No premature stopping from dead oscillator reuse
3. **Clean stops** - Sawtooth-pad stops all voices when camera stops
4. **Consistent behavior** - No race conditions

## Testing Checklist

- [ ] **Sine-wave synth** - Plays continuous sound until manual stop
- [ ] **Strings synth** - Plays continuous sound until manual stop  
- [ ] **FM-synthesis synth** - Plays continuous sound until manual stop
- [ ] **Sawtooth-pad synth** - Plays continuous sound, stops cleanly when camera stops
- [ ] **Pool metrics** - Logs show fresh/active/dead counts correctly
- [ ] **No warnings** - No "Pool empty" warnings after initial fill

## Architecture Notes

### Why Not Recreate in releaseOscillator()?

The previous implementation created fresh oscillators in `releaseOscillator()`, which caused:
1. **Synchronous overhead** - Creating oscillators on every release
2. **No batching** - Couldn't optimize creation
3. **Hidden pool growth** - Pool size could grow unbounded

The new approach:
1. **Deferred creation** - Only create when needed (refill)
2. **Batched creation** - Create multiple at once
3. **Bounded growth** - Garbage collection keeps pool size manageable

### Performance Characteristics

- **Memory:** Pool grows when needed, shrinks via garbage collection
- **CPU:** Oscillator creation is batched, not per-note
- **Latency:** Fresh oscillators always available (no create-on-demand delay)

## Related Files

- `future/web/audio/audio-processor.js` - Core pool management
- `future/web/audio/synths/sawtooth-pad.js` - Example cleanup implementation
- `future/web/audio/synths/*.js` - All synths benefit from this fix

## Migration Guide for Custom Synths

If you have custom synths that check `oscObj.active`:

**Before:**
```javascript
if (oscObj.active) { /* ... */ }
```

**After:**
```javascript
if (oscObj.state === 'active') { /* ... */ }
```

The `active` property no longer exists. Use `state` instead.
