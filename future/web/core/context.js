let domElements = null;
let dispatchEvent = null;

export function setDOM(dom) {
  domElements = dom;
}

export function getDOM() {
  if (!domElements) {
    try { console.error("domElements not initialized"); } catch (e) {}
    try {
      try { const r = require('./reporting.js'); r.reportError(new Error('domElements not initialized')); }
      catch (e) { import('./reporting.js').then(m => { m.reportError(new Error('domElements not initialized')); }).catch(() => {}); }
    } catch (e) {}
    throw new Error("domElements not initialized");
  }
  return domElements;
}

export function setDispatchEvent(dispatcher) {
  dispatchEvent = dispatcher;
}

export function getDispatchEvent() {
  if (!dispatchEvent) {
    try { console.error("dispatchEvent not initialized"); } catch (e) {}
    try {
      try { const r = require('./reporting.js'); r.reportError(new Error('dispatchEvent not initialized')); }
      catch (e) { import('./reporting.js').then(m => { m.reportError(new Error('dispatchEvent not initialized')); }).catch(() => {}); }
    } catch (e) {}
    throw new Error("dispatchEvent not initialized");
  }
  return dispatchEvent;
}