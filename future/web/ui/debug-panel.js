import { getDispatchEvent } from '../core/context.js';

function savePanelState(panel) {
  try {
    const rect = panel.getBoundingClientRect();
    const state = {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: panel.offsetWidth,
      height: panel.offsetHeight,
      collapsed: panel.querySelector('#debugPanelLogs')?.style.display === 'none'
    };
    localStorage.setItem('acoustsee.debugPanel', JSON.stringify(state));
  } catch (e) { /* ignore storage errors */ }
}

export async function showDebugPanel() {
  let debugPanel = document.getElementById('debugPanel');
  if (!debugPanel) {
    debugPanel = document.createElement('div');
    debugPanel.id = 'debugPanel';
    debugPanel.style.display = 'none';
    debugPanel.style.position = 'fixed';
    debugPanel.style.top = '10%';
    debugPanel.style.right = '10%';
    debugPanel.style.width = '420px';
    debugPanel.style.maxWidth = '80vw';
    debugPanel.style.minWidth = '220px';
    debugPanel.style.maxHeight = '80vh';
    debugPanel.style.minHeight = '120px';
    debugPanel.style.resize = 'both';
    debugPanel.style.overflow = 'auto';
    debugPanel.style.background = '#222';
    debugPanel.style.color = '#eee';
    debugPanel.style.border = '2px solid #444';
    debugPanel.style.padding = '12px';
    debugPanel.style.zIndex = '9999';
    debugPanel.style.boxShadow = '0 2px 12px rgba(0,0,0,0.5)';
    debugPanel.style.borderRadius = '6px';
    document.body.appendChild(debugPanel);
  }

  // restore saved panel state (position/size/collapsed)
  try {
    const raw = localStorage.getItem('acoustsee.debugPanel');
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.width) debugPanel.style.width = saved.width + 'px';
      if (saved.height) debugPanel.style.height = saved.height + 'px';
      if (typeof saved.left === 'number' && typeof saved.top === 'number') {
        debugPanel.style.left = saved.left + 'px';
        debugPanel.style.top = saved.top + 'px';
        debugPanel.style.right = 'auto';
      }
    }
  } catch (e) { /* ignore malformed storage */ }

  try {
    const dispatch = getDispatchEvent();
    const logs = await dispatch('inspectState');

    // build header and logs container
    debugPanel.innerHTML = '';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '8px';

    const dragHandle = document.createElement('div');
    dragHandle.style.width = '18px';
    dragHandle.style.height = '18px';
    dragHandle.style.marginRight = '8px';
    dragHandle.style.cursor = 'grab';
    dragHandle.title = 'Drag to move';

    const leftGroup = document.createElement('div');
    leftGroup.style.display = 'flex';
    leftGroup.style.alignItems = 'center';
    leftGroup.appendChild(dragHandle);

    const title = document.createElement('div');
    title.textContent = 'Debug Logs';
    title.style.fontWeight = '600';
    title.style.fontSize = '14px';
    leftGroup.appendChild(title);

    header.appendChild(leftGroup);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '8px';

    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.textContent = 'Hide Logs';
    collapseBtn.style.cursor = 'pointer';
    collapseBtn.style.padding = '4px 8px';
    collapseBtn.style.background = '#333';
    collapseBtn.style.color = '#eee';
    collapseBtn.style.border = '1px solid #444';
    collapseBtn.style.borderRadius = '4px';
    controls.appendChild(collapseBtn);

    const autoLabel = document.createElement('label');
    autoLabel.style.display = 'inline-flex';
    autoLabel.style.alignItems = 'center';
    autoLabel.style.cursor = 'pointer';
    autoLabel.style.gap = '6px';
    const autoCheckbox = document.createElement('input');
    autoCheckbox.type = 'checkbox';
    autoCheckbox.id = 'debugPanelAutoscroll';
    autoCheckbox.checked = true;
    autoCheckbox.style.margin = '0';
    const autoText = document.createElement('span');
    autoText.textContent = 'Autoscroll';
    autoText.style.fontSize = '13px';
    autoLabel.appendChild(autoCheckbox);
    autoLabel.appendChild(autoText);
    controls.appendChild(autoLabel);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.style.cursor = 'pointer';
    clearBtn.style.padding = '4px 8px';
    clearBtn.style.background = '#3b3b3b';
    clearBtn.style.color = '#eee';
    clearBtn.style.border = '1px solid #444';
    clearBtn.style.borderRadius = '4px';
    controls.appendChild(clearBtn);

    header.appendChild(controls);
    debugPanel.appendChild(header);

    const logsContainer = document.createElement('div');
    logsContainer.id = 'debugPanelLogs';
    logsContainer.style.maxHeight = '50vh';
    logsContainer.style.overflowY = 'auto';
    logsContainer.style.padding = '6px';
    logsContainer.style.borderTop = '1px solid rgba(255,255,255,0.04)';
    logsContainer.style.display = 'block';
    debugPanel.appendChild(logsContainer);

    // restore collapsed state if present
    try {
      const raw = localStorage.getItem('acoustsee.debugPanel');
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.collapsed) {
          logsContainer.style.display = 'none';
          collapseBtn.textContent = 'Show Logs';
        }
      }
    } catch (e) {}

    collapseBtn.addEventListener('click', () => {
      const isHidden = logsContainer.style.display === 'none';
      logsContainer.style.display = isHidden ? 'block' : 'none';
      collapseBtn.textContent = isHidden ? 'Hide Logs' : 'Show Logs';
      try { const raw = localStorage.getItem('acoustsee.debugPanel'); const saved = raw ? JSON.parse(raw) : {}; saved.collapsed = !isHidden; localStorage.setItem('acoustsee.debugPanel', JSON.stringify(saved)); } catch (e) {}
    });
    clearBtn.addEventListener('click', () => { logsContainer.innerHTML = ''; try { const raw = localStorage.getItem('acoustsee.debugPanel'); const saved = raw ? JSON.parse(raw) : {}; saved.clearedAt = Date.now(); localStorage.setItem('acoustsee.debugPanel', JSON.stringify(saved)); } catch(e){} });

    // render logs
    logs.forEach(log => {
      try { window.acoustseeDebugLog?.(log.level || 'INFO', `${log.message}${log.data ? ' ' + JSON.stringify(log.data) : ''}`); } catch (e) {}
      const logElement = document.createElement('div');
      logElement.className = `log-entry log-${(log.level || 'INFO').toLowerCase()}`;
      logElement.style.marginBottom = '10px';
      logElement.style.paddingBottom = '6px';
      logElement.style.borderBottom = '1px dotted rgba(255,255,255,0.04)';
      logElement.style.fontSize = '13px';

      const headerLine = document.createElement('div');
      headerLine.style.display = 'flex';
      headerLine.style.alignItems = 'center';
      headerLine.style.gap = '8px';
      const level = document.createElement('strong');
      level.textContent = `[${log.level || 'INFO'}]`;
      level.style.width = '72px';
      level.style.flex = '0 0 72px';
      const msg = document.createElement('span');
      msg.textContent = log.message || '';
      headerLine.appendChild(level);
      headerLine.appendChild(msg);

      const pre = document.createElement('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.margin = '8px 0 0 0';
      pre.style.fontSize = '12px';
      pre.style.background = 'rgba(255,255,255,0.02)';
      pre.style.padding = '8px';
      pre.style.borderRadius = '4px';
      pre.textContent = JSON.stringify(log.data, null, 2);

      logElement.appendChild(headerLine);
      if (pre.textContent && pre.textContent !== 'undefined' && pre.textContent !== '{}') {
        logElement.appendChild(pre);
      }
      logsContainer.appendChild(logElement);
    });

    // ensure panel visible
    debugPanel.style.display = 'block';

    // if autoscroll enabled on panel, scroll logs to bottom
    const autoscroll = document.getElementById('debugPanelAutoscroll')?.checked ?? true;
    if (autoscroll) {
      const logsEl = debugPanel.querySelector('#debugPanelLogs');
      if (logsEl) logsEl.scrollTop = logsEl.scrollHeight;
    }

    // make the header drag-handle functional and persist position/size
    (function enableDragAndPersist() {
      let isDragging = false;
      let startX = 0, startY = 0, startLeft = 0, startTop = 0;
      function saveState() { savePanelState(debugPanel); }

      dragHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        dragHandle.style.cursor = 'grabbing';
        startX = e.clientX; startY = e.clientY;
        const rect = debugPanel.getBoundingClientRect();
        startLeft = rect.left; startTop = rect.top;
        debugPanel.style.left = startLeft + 'px';
        debugPanel.style.top = startTop + 'px';
        debugPanel.style.right = 'auto';
        e.preventDefault();
      });
      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const newLeft = Math.max(0, startLeft + dx);
        const newTop = Math.max(0, startTop + dy);
        debugPanel.style.left = newLeft + 'px';
        debugPanel.style.top = newTop + 'px';
      });
      window.addEventListener('mouseup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        dragHandle.style.cursor = 'grab';
        saveState();
      });

      try {
        const ro = new ResizeObserver(() => { saveState(); });
        ro.observe(debugPanel);
      } catch (e) {
        window.addEventListener('mouseup', saveState);
      }
    })();

  } catch (error) {
    try {
      const m = await import('../utils/utils.js');
      const msg = await m.getText('debugPanel.failed').catch(() => null);
      const logsEl = debugPanel.querySelector('#debugPanelLogs');
      if (logsEl) logsEl.textContent = msg || 'Failed to load logs.';
      else debugPanel.textContent = msg || 'Failed to load logs.';
    } catch (e) {
      const logsEl = debugPanel.querySelector('#debugPanelLogs');
      if (logsEl) logsEl.textContent = 'Failed to load logs.';
      else debugPanel.textContent = 'Failed to load logs.';
    }
    debugPanel.style.display = 'block';
  }
}

export function setupDebugPanelLongPress(DOM) {
  const button6 = DOM.button6;
  if (!button6) return;
  let pressTimer;
  button6.addEventListener('mousedown', () => {
    pressTimer = setTimeout(() => {
      showDebugPanel();
    }, 800); // 800ms for long press
  });
  button6.addEventListener('mouseup', () => {
    clearTimeout(pressTimer);
  });
  button6.addEventListener('mouseleave', () => {
    clearTimeout(pressTimer);
  });
}
