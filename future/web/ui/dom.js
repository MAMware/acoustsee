// future/web/ui/dom.js
function assignDOMElements() {
  DOM.splashScreen = document.getElementById('splashScreen');
  DOM.powerOn = document.getElementById('powerOn');
  DOM.mainContainer = document.getElementById('mainContainer');
  DOM.button1 = document.getElementById('button1');
  DOM.button2 = document.getElementById('button2');
  DOM.button3 = document.getElementById('button3');
  DOM.button4 = document.getElementById('button4');
  DOM.button5 = document.getElementById('button5');
  DOM.button6 = document.getElementById('button6');
  DOM.emailDebug = document.getElementById('emailDebug');
  DOM.videoFeed = document.getElementById('videoFeed');
}

let DOM = {
  splashScreen: null,
  powerOn: null,
  mainContainer: null,
  button1: null,
  button2: null,
  button3: null,
  button4: null,
  button5: null,
  button6: null,
  videoFeed: null,
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