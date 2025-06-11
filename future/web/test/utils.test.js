import { speak } from '../ui/utils.js';
import { settings } from '../state.js';

jest.mock('../state.js', () => ({
  settings: { language: 'en-US' }
}));

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ testMessage: 'Test message' })
  })
);

global.SpeechSynthesisUtterance = jest.fn();
global.speechSynthesis = { speak: jest.fn() };

describe('speak', () => {
  it('speaks a message with correct language', async () => {
    await speak('testMessage');
    expect(global.fetch).toHaveBeenCalledWith('./languages/en-US.json');
    expect(SpeechSynthesisUtterance).toHaveBeenCalledWith('Test message');
    expect(speechSynthesis.speak).toHaveBeenCalled();
  });
});
