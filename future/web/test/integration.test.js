// File: web/test/integration.test.js

// Mock the dependencies at the edges of our system
jest.mock('../utils/logging.js', () => ({ structuredLog: jest.fn() }));
jest.mock('../audio/audio-processor.js', () => ({
  // We need to mock the real module to spy on its methods
  ...jest.requireActual('../audio/audio-processor.js'),
  playCues: jest.fn(), // Mock the orchestrator so we can check if it's called
}));

import { createEngine } from '../core/engine.js';
import { processFrameWithState } from '../video/frame-processor.js';
import * as audioProcessor from '../audio/audio-processor.js';
import { settings } from '../core/state.js';

// Configure a minimal version of settings for the test
settings.availableGrids = [
  { 
    id: 'circle-of-fifths', 
    // In an integration test, we use the real map function
    mapFunction: jest.requireActual('../video/grids/circle-of-fifths.js').mapFrameToCues
  }
];
settings.gridType = 'circle-of-fifths';
settings.motionThreshold = 10;
settings.maxNotes = 4;

describe('End-to-End Integration: Video Frame to Audio Cue', () => {

  it('should process a frame, generate cues, and dispatch them to the audio orchestrator', async () => {
    // 1. ARRANGE
    const engine = createEngine();
    const playCuesSpy = jest.spyOn(audioProcessor, 'playCues');

    // Create a mock video frame with significant motion
    const width = 100;
    const height = 100;
    const frameData = new Uint8ClampedArray(width * height * 4).fill(50); // A gray frame
    const prevFrameData = new Uint8ClampedArray(width * height * 4).fill(150); // A much lighter gray frame

    // Simulate the engine's processFrame handler being called
    const mockPayload = {
      videoEl: { videoWidth: width, videoHeight: height, readyState: 4 },
      canvasEl: { 
        width: width, 
        height: height, 
        getContext: () => ({ 
          drawImage: () => {}, 
          getImageData: () => ({ data: frameData }) 
        }) 
      }
    };
    
    // Manually set the previous frame state for the frame processor
    // In a real scenario, this would be managed by the processor itself.
    // We import the non-exported function for testing purposes.
    const fpModule = require('../video/frame-processor.js');
    fpModule.__setPrevFrameDataForTest(
        new Uint8ClampedArray(width/2 * height * 4).fill(150),
        new Uint8ClampedArray(width/2 * height * 4).fill(150)
    );

    // 2. ACT
    // Dispatch the 'processFrame' command to the engine
    await engine.dispatch('processFrame', mockPayload);

    // 3. ASSERT
    // Assert that the audio orchestrator was called
    expect(playCuesSpy).toHaveBeenCalled();

    // Assert that it was called with a non-empty array of cues
    const calls = playCuesSpy.mock.calls;
    expect(calls[0][0].length).toBeGreaterThan(0);

    // Assert the structure of the first cue object
    const firstCue = calls[0][0][0];
    expect(firstCue).toHaveProperty('objectType', 'default_motion');
    expect(firstCue).toHaveProperty('intensity');
    expect(firstCue).toHaveProperty('position');
    expect(firstCue.position).toHaveProperty('x');
    expect(firstCue.position).toHaveProperty('y');
    expect(firstCue.position).toHaveProperty('z');
    
    // Cleanup the spy
    playCuesSpy.mockRestore();
  });
});
