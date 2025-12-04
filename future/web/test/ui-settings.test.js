// test/ui-settings.test.js
import { setupUISettings } from '../ui/ui-settings.js';
import { settings } from '../state.js';

jest.mock('../state.js', () => ({
  settings: { isSettingsMode: false, stream: null, micStream: null },
}));

describe('ui-settings', () => {
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

  test('binds button events', () => {
    const dispatchEvent = jest.fn();
    setupUISettings({ dispatchEvent, DOM: document });
    expect(document.getElementById('button1').ontouchstart).toBeDefined();
    expect(document.getElementById('button2').ontouchstart).toBeDefined();
  });

  test('toggles settings mode on button6', async () => {
    const dispatchEvent = jest.fn();
    setupUISettings({ dispatchEvent, DOM: document });
    await document.getElementById('button6').dispatchEvent(new Event('touchstart'));
    expect(settings.isSettingsMode).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledWith('updateUI', expect.any(Object));
  });
});
