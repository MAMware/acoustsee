let DOM = {
  settingsToggle: null,
  audioToggle: null,
  modeBtn: null,
  languageBtn: null,
  startStopBtn: null,
  videoFeed: null,
  imageCanvas: null,
  loadingIndicator: null,
  debug: null,
  closeDebug: null,
  emailDebug: null 
};

export function initDOM() {
  return new Promise((resolve) => {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      assignDOMElements();
      resolve(DOM);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        assignDOMElements();
        resolve(DOM);
      });
    }
  });
}

function assignDOMElements() {
  DOM.settingsToggle = document.getElementById('settingsToggle');
  DOM.audioToggle = document.getElementById('audioToggle');
  DOM.modeBtn = document.getElementById('modeBtn');
  DOM.languageBtn = document.getElementById('languageBtn');
  DOM.startStopBtn = document.getElementById('startStopBtn');
  DOM.videoFeed = document.getElementById('videoFeed');
  DOM.imageCanvas = document.getElementById('imageCanvas');
  DOM.loadingIndicator = document.getElementById('loadingIndicator');
  DOM.debug = document.getElementById('debug');
  DOM.closeDebug = document.getElementById('closeDebug');
  DOM.emailDebug = document.getElementById('emailDebug');

  Object.entries(DOM).forEach(([key, value]) => {
    if (!value) console.warn(`DOM element ${key} not found`);
  });
}
