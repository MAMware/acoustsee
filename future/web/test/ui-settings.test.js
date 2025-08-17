// test/ui-settings.test.js -> updated to test new input mapper wiring
import { setupInputMapper } from '../ui/ui-input-mapper.js';

describe('ui input mapper (button wiring)', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="mainContainer">
        <button id="button1"></button>
        <button id="button2"></button>
        <button id="button3"></button>
        <button id="button4"></button>
        <button id="button5"></button>
        <button id="button6"></button>
      </div>
    `;
  });

  test('binds button events (ontouchstart present)', () => {
    const fakeEngine = { dispatch: jest.fn(), getState: () => ({ isSettingsMode: false }) };
    const DOM = {
      button1: document.getElementById('button1'),
      button2: document.getElementById('button2'),
      button3: document.getElementById('button3'),
      button4: document.getElementById('button4'),
      button5: document.getElementById('button5'),
      button6: document.getElementById('button6'),
      videoFeed: null,
      frameCanvas: null
    };
    setupInputMapper(DOM, fakeEngine);
    // Verify we can trigger the mapped handlers by dispatching pointer events
    document.getElementById('button1').dispatchEvent(new Event('pointerdown'));
    document.getElementById('button2').dispatchEvent(new Event('pointerdown'));
    expect(fakeEngine.dispatch).toHaveBeenCalled();
  });

  test('button6 dispatches toggleSettingsMode and announceSettingsMode', () => {
    const fakeEngine = { dispatch: jest.fn(), getState: () => ({ isSettingsMode: false }) };
    const DOM = {
      button1: document.getElementById('button1'),
      button2: document.getElementById('button2'),
      button3: document.getElementById('button3'),
      button4: document.getElementById('button4'),
      button5: document.getElementById('button5'),
      button6: document.getElementById('button6'),
      videoFeed: null,
      frameCanvas: null
    };
    setupInputMapper(DOM, fakeEngine);
    const btn6 = DOM.button6;
    // Simulate pointerdown
    btn6.dispatchEvent(new Event('pointerdown'));
    expect(fakeEngine.dispatch).toHaveBeenCalledWith('toggleSettingsMode');
    expect(fakeEngine.dispatch).toHaveBeenCalledWith('announceSettingsMode');
  });
});
