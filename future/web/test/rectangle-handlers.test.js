import { setupRectangleHandlers } from '../ui/rectangle-handlers.js';
import { initializeAudio, cleanupAudio } from '../audio-processor.js';

jest.mock('../audio-processor.js', () => ({
  initializeAudio: jest.fn(),
  cleanupAudio: jest.fn(),
  audioContext: { state: 'suspended', resume: jest.fn(), suspend: jest.fn(), close: jest.fn() }
}));

describe('rectangle-handlers', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="splashScreen">
        <button id="powerOn">Power On (⏻)</button>
      </div>
      <div id="mainContainer">
        <button id="button1" class="video-container">
          <video id="videoFeed"></video>
          <span class="button-text">Start</span>
        </button>
        <button id="button2">Mic On</button>
        <button id="button3">30 FPS</button>
        <button id="button4">Save Settings</button>
        <button id="button5">Load Settings</button>
        <button id="button6">Settings</button>
        <div id="loadingIndicator">Loading...</div>
      </div>
      <div id="debug" class="debug-panel">
        <pre></pre>
        <button id="emailDebug">Email Log</button>
        <button id="closeDebug">Close</button>
      </div>
    `;
  });

  test('binds button events', () => {
    const dispatchEvent = jest.fn();
    setupRectangleHandlers({ dispatchEvent });
    expect(document.getElementById('powerOn').onclick).toBeDefined();
    expect(document.getElementById('button1').onclick).toBeDefined();
    expect(document.getElementById('button2').onclick).toBeDefined();
  });

  test('initializes audio on powerOn click', async () => {
    const dispatchEvent = jest.fn();
    setupRectangleHandlers({ dispatchEvent });
    const powerOn = document.getElementById('powerOn');
    await powerOn.click();
    expect(initializeAudio).toHaveBeenCalled();
    expect(document.getElementById('splashScreen').style.display).toBe('none');
    expect(document.getElementById('mainContainer').style.display).toBe('grid');
  });

  test('toggles stream on button1 click', async () => {
    const dispatchEvent = jest.fn();
    setupRectangleHandlers({ dispatchEvent });
    const button1 = document.getElementById('button1');
    await button1.click();
    expect(dispatchEvent).toHaveBeenCalledWith('toggleStream');
    expect(dispatchEvent).toHaveBeenCalledWith('updateUI', { settingsMode: false, streamActive: expect.any(Boolean), micActive: expect.any(Boolean) });
  });

  test('toggles mic on button2 click', async () => {
    const dispatchEvent = jest.fn();
    setupRectangleHandlers({ dispatchEvent });
    const button2 = document.getElementById('button2');
    await button2.click();
    expect(dispatchEvent).toHaveBeenCalledWith('toggleMic', { settingsMode: false });
  });
});
