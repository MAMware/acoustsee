let DOM = {
  settingsToggle: null,
  audioToggle: null,
  modeBtn: null,
  languageBtn: null,
  startStopBtn: null,
  fpsBtn: null,
  videoFeed: null,
  imageCanvas: null,
  loadingIndicator: null,
  debug: null,
  closeDebug: null,
  emailDebug: null
};

export function initDOM() {
  return new Promise((resolve, reject) => {
    const checkDOMReady = () => {
      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        assignDOMElements();
        const missingElements = Object.entries(DOM).filter(([_, value]) => !value);
        if (missingElements.length > 0) {
          const missingKeys = missingElements.map(([key]) => key).join(', ');
          console.error(`Critical DOM elements missing: ${missingKeys}. Check index.html IDs.`);
          reject(new Error(`Missing DOM elements: ${missingKeys}`));
        } else {
          resolve(DOM);
        }
      }
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      checkDOMReady();
    } else {
      document.addEventListener('DOMContentLoaded', checkDOMReady, { once: true });
    }
  });
}

function assignDOMElements() {
  DOM.settingsToggle = document.getElementById('settingsToggle');
  DOM.audioToggle = document.getElementById('audioToggle');
  DOM.modeBtn = document.getElementById('modeBtn');
  DOM.languageBtn = document.getElementById('languageBtn');
  DOM.startStopBtn = document.getElementById('startStopBtn');
  DOM.fpsBtn = document.getElementById('fpsBtn');
  DOM.videoFeed = document.getElementById('videoFeed');
  DOM.imageCanvas = document.getElementById('imageCanvas');
  DOM.loadingIndicator = document.getElementById('loadingIndicator');
  DOM.debug = document.getElementById('debug');
  DOM.closeDebug = document.getElementById('closeDebug');
  DOM.emailDebug = document.getElementById('emailDebug');
}
