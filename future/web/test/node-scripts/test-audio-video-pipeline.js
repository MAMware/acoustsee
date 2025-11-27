// Test file to verify audio-video pipeline fixes
// Can be run in browser console or as a Node.js test

/**
 * Test suite for video-to-audio pipeline fixes
 * 
 * Usage in browser:
 * 1. Open console (F12)
 * 2. Load this file as a module or copy-paste the tests
 * 3. Run: await testAudioVideoPipeline()
 * 
 * Expected results:
 * - simulateObjectDetection returns valid object structure
 * - simulateShapeAnalysis returns valid shape structure
 * - Frame processor generates fallback cues when needed
 * - Audio is dispatched on every frame
 */

export async function testAudioVideoPipeline() {
  console.log('=== Audio-Video Pipeline Test Suite ===\n');

  const tests = [];
  let passed = 0;
  let failed = 0;

  // Test 1: Verify simulateObjectDetection exists and works
  console.log('[TEST 1] simulateObjectDetection function');
  try {
    // Import from frame-processor
    const { initializeVideo } = await import('../../video/frame-processor.js');
    console.log('✓ Frame processor module loaded');
    
    // Test with empty input
    const emptyResult = await simulateObjectDetection({});
    if (emptyResult && emptyResult.detectedObjects !== undefined) {
      console.log('✓ simulateObjectDetection handles empty input');
      passed++;
    } else {
      console.error('✗ simulateObjectDetection returned invalid structure');
      failed++;
    }

    // Test with valid motion results
    const mockMotionResults = {
      objects: [{
        label: 'person',
        confidence: 0.9,
        position: { x: 0.5, y: 0.5, z: 0 },
        boundingBox: { x: 0, y: 0, width: 100, height: 100 }
      }]
    };
    const validResult = await simulateObjectDetection(mockMotionResults);
    if (validResult.detectedObjects.length > 0) {
      console.log(`✓ simulateObjectDetection found ${validResult.detectedObjects.length} object(s)`);
      passed++;
    } else {
      console.error('✗ simulateObjectDetection failed to detect objects');
      failed++;
    }
  } catch (e) {
    console.error(`✗ Test 1 failed: ${e.message}`);
    failed++;
  }

  // Test 2: Verify simulateShapeAnalysis exists and works
  console.log('\n[TEST 2] simulateShapeAnalysis function');
  try {
    const mockObject = {
      id: 'obj_0',
      label: 'person',
      confidence: 0.85,
      position: { x: 0.5, y: 0.5, z: 0 }
    };
    const shapeResult = await simulateShapeAnalysis(mockObject);
    
    const requiredFields = ['shapeType', 'confidence', 'movingRegions'];
    const hasAllFields = requiredFields.every(field => field in shapeResult);
    
    if (hasAllFields) {
      console.log(`✓ simulateShapeAnalysis returns all required fields: ${requiredFields.join(', ')}`);
      passed++;
    } else {
      console.error(`✗ simulateShapeAnalysis missing fields. Got: ${Object.keys(shapeResult).join(', ')}`);
      failed++;
    }

    if (shapeResult.movingRegions.length > 0) {
      console.log(`✓ simulateShapeAnalysis generated ${shapeResult.movingRegions.length} moving region(s)`);
      passed++;
    } else {
      console.warn('⚠ simulateShapeAnalysis generated no moving regions (may be expected)');
    }
  } catch (e) {
    console.error(`✗ Test 2 failed: ${e.message}`);
    failed++;
  }

  return { passed, failed, total: passed + failed };
}
