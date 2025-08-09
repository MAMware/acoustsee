let domElements = null;
let dispatchEvent = null;

export function setDOM(dom) {
  domElements = dom;
}

export function getDOM() {
  if (!domElements) {
    console.error("domElements not initialized");
    throw new Error("domElements not initialized");
  }
  return domElements;
}

export function setDispatchEvent(dispatcher) {
  dispatchEvent = dispatcher;
}

export function getDispatchEvent() {
  if (!dispatchEvent) {
    console.error("dispatchEvent not initialized");
    throw new Error("dispatchEvent not initialized");
  }
  return dispatchEvent;
}