// File: web/ui/debug/debug-ui.controls.js
// Provides simple, reusable factory functions to create common DOM elements for the UI.

export function createControlGroup(label) {
  const wrapper = document.createElement('div');
  wrapper.className = 'control-group';
  if (label) {
    const lab = document.createElement('label');
    lab.textContent = label;
    wrapper.appendChild(lab);
  }
  return wrapper;
}

export function createButton(label) {
  const group = createControlGroup();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  group.appendChild(btn);
  return group;
}
