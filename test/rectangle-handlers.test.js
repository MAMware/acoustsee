import { setupRectangleHandlers } from '../web/ui/rectangle-handlers.js';
import { stopAudio } from '../web/audio-processor.js';

jest.mock('../web/audio-processor.js', () => ({
    initializeAudio: jest.fn(),
    audioContext: { state: 'suspended', resume: jest.fn() },
    stopAudio: jest.fn()
}));

describe('rectangle-handlers', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button class="top-rectangle" id="settingsToggle">Settings</button>
            <div class="main-container">
                <div class="left-rectangle" id="modeBtn">Daylight</div>
                <div class="center-rectangle" id="centerRectangle">
                    <video id="videoFeed"></video>
                    <canvas id="imageCanvas"></canvas>
                </div>
                <div class="right-rectangle" id="languageBtn">Language</div>
            </div>
            <button class="bottom-rectangle" id="startStopBtn">Start/Stop</button>
        `;
    });

    test('binds rectangle button events', () => {
        const dispatchEvent = jest.fn();
        setupRectangleHandlers({ dispatchEvent });
        expect(document.getElementById('settingsToggle').ontouchstart).toBeDefined();
        expect(document.getElementById('modeBtn').ontouchstart).toBeDefined();
        expect(document.getElementById('languageBtn').ontouchstart).toBeDefined();
        expect(document.getElementById('startStopBtn').ontouchstart).toBeDefined();
    });

    test('stops audio when stopping stream', () => {
        const dispatchEvent = jest.fn();
        setupRectangleHandlers({ dispatchEvent });
        const startStopBtn = document.getElementById('startStopBtn');
        const mockStream = { getTracks: () => [{ stop: jest.fn() }] };
        require('../web/state.js').settings.stream = mockStream;
        startStopBtn.dispatchEvent(new Event('touchstart'));
        expect(stopAudio).toHaveBeenCalled();
    });
});
