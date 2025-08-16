import { dispatchEvent } from '../core/dispatcher.js';

export async function showDebugPanel() {
  let debugPanel = document.getElementById('debugPanel');
  if (!debugPanel) {
    debugPanel = document.createElement('div');
    debugPanel.id = 'debugPanel';
    debugPanel.style.display = 'none';
    debugPanel.style.position = 'fixed';
    debugPanel.style.top = '10%';
    debugPanel.style.right = '10%';
    debugPanel.style.width = '400px';
    debugPanel.style.maxHeight = '60vh';
    debugPanel.style.overflowY = 'auto';
    debugPanel.style.background = '#222';
    debugPanel.style.color = '#eee';
    debugPanel.style.border = '2px solid #444';
    debugPanel.style.padding = '16px';
    debugPanel.style.zIndex = '9999';
    debugPanel.style.boxShadow = '0 2px 12px rgba(0,0,0,0.5)';
    document.body.appendChild(debugPanel);
  }
  try {
  const logs = await dispatchEvent('inspectState');
    debugPanel.innerHTML = '';
    logs.forEach(log => {
      const logElement = document.createElement('div');
      logElement.className = `log-entry log-${log.level.toLowerCase()}`;
      logElement.style.marginBottom = '8px';
      logElement.innerHTML = `<strong>[${log.level}]</strong> <span>${log.message}</span><br><pre>${JSON.stringify(log.data, null, 2)}</pre>`;
      debugPanel.appendChild(logElement);
    });
    debugPanel.style.display = 'block';
  } catch (error) {
    // Try to localize the error message using the shared utils getText helper.
    // We import dynamically to avoid potential circular imports during runtime initialization.
    try {
      const m = await import('../utils/utils.js');
      const msg = await m.getText('debugPanel.failed').catch(() => null);
      debugPanel.textContent = msg || 'Failed to load logs.';
    } catch (e) {
      // Last-resort English fallback if translations or utils are unavailable.
      debugPanel.textContent = 'Failed to load logs.';
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
