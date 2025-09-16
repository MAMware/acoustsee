// Simple factory helpers for dev-panel controls (formerly debug-ui.controls.js)
export function createButton({ text = '', attrs = {}, onClick = null } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = text;
  Object.keys(attrs || {}).forEach(k => btn.setAttribute(k, attrs[k]));
  if (typeof onClick === 'function') btn.addEventListener('click', onClick);
  return btn;
}
