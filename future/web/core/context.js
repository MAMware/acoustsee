let domElements = null;
let dispatchEvent = null;

export function setDOM(dom) {
  domElements = dom;
}

export function getDOM() {
  if (!domElements) {
    try { console.error("domElements not initialized"); } catch (e) {}
    // Try to report to optional logger if available
  try { import('../utils/logging.js').then(l => { (l.default || l).logError && (l.default || l).logError(new Error('domElements not initialized')); }).catch(() => {}); } catch (e) {}
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
  try { import('../utils/logging.js').then(l => { (l.default || l).logError && (l.default || l).logError(new Error('dispatchEvent not initialized')); }).catch(() => {}); } catch (e) {}
    throw new Error("dispatchEvent not initialized");
  }
  return dispatchEvent;
}