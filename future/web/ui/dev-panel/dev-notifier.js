// Adapter to show translated, accessible notifications inside the Dev Panel.
import { getText, announceMessage, speakText } from '../../utils/utils.js';

export async function notifyDev({ key, params = {}, persistent = false, tts = true } = {}) {
  let text = key;
  try {
    text = await getText(key, params);
  } catch (e) {
    try { console.warn('notifyDev: getText failed', e); } catch (e2) {}
    text = key;
  }

  try { announceMessage(text); } catch (e) { try { console.warn('announceMessage failed', e); } catch (e2) {} }
  if (tts) {
    try { speakText(text, 'tts'); } catch (e) { try { console.warn('speakText failed', e); } catch (e2) {} }
  }

  try {
    if (typeof document !== 'undefined') {
      const panel = document.getElementById('acoustsee-dev-panel');
      if (panel) {
        let container = document.getElementById('acoustsee-dev-notifier');
        if (!container) {
          container = document.createElement('div');
          container.id = 'acoustsee-dev-notifier';
          Object.assign(container.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginTop: '8px',
            maxHeight: '40vh',
            overflowY: 'auto'
          });
          panel.insertBefore(container, panel.firstChild || null);
        }

        const el = document.createElement('div');
        el.className = 'acoustsee-dev-notice';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        Object.assign(el.style, {
          background: '#2c3e50',
          color: '#ecf0f1',
          padding: '8px 10px',
          borderRadius: '6px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          fontSize: '13px'
        });
        el.textContent = text;

        if (persistent) {
          const dismiss = document.createElement('button');
          dismiss.type = 'button';
          dismiss.textContent = 'Dismiss';
          Object.assign(dismiss.style, {
            marginLeft: '8px',
            background: 'transparent',
            color: '#9ad',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12px'
          });
          dismiss.addEventListener('click', () => { try { el.remove(); } catch (e) {} });
          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.appendChild(el);
          row.appendChild(dismiss);
          container.insertBefore(row, container.firstChild || null);
        } else {
          container.insertBefore(el, container.firstChild || null);
          setTimeout(() => { try { el.remove(); } catch (e) {} }, 4800);
        }

        return { shownInPanel: true, text };
      }
    }
  } catch (e) {
    try { console.warn('notifyDev panel update failed', e); } catch (e2) {}
  }

  return { shownInPanel: false, text };
}

export default notifyDev;
