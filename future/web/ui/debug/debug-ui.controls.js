// Lightweight helper factory functions for debug UI (moved from root-level file)
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

export function createSelect(label, options = []) {
  const group = createControlGroup(label);
  const select = document.createElement('select');
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    select.appendChild(opt);
  });
  group.appendChild(select);
  return group;
}

export function createSlider(label, min = 0, max = 100, step = 1) {
  const group = createControlGroup(label);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = min;
  const value = document.createElement('span');
  value.className = 'slider-value';
  value.textContent = input.value;
  group.appendChild(input);
  group.appendChild(value);
  return group;
}

export function createCheckbox(label) {
  const group = createControlGroup(label);
  const input = document.createElement('input');
  input.type = 'checkbox';
  group.appendChild(input);
  return group;
}

export function createButton(label) {
  const group = createControlGroup();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  group.appendChild(btn);
  return group;
}

// Debug helpers: keep minimal and dependency-free.
