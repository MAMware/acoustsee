/* @ts-nocheck */
// future/web/core/dispatcher.js
// Central dispatcher core to break circular dependencies

let dispatchEvent = (eventName, payload) => {
  console.error(`dispatchEvent called before initialization: ${eventName}`, payload);
};

function setDispatcher(fn) {
  dispatchEvent = fn;
}

export { dispatchEvent, setDispatcher };
