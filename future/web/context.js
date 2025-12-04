let DOM = null;
let dispatchEvent = null;

export function setDOM(dom) {
  DOM = dom;
}

export function getDOM() {
  if (!DOM) {
    console.error("DOM not initialized");
    throw new Error("DOM not initialized");
  }
  return DOM;
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