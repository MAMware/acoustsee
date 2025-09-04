// Adapter to show translated, accessible notifications inside the existing
// debug UI panel and to reuse the app i18n/TTS/announce mechanisms.
import { getText, announceMessage, speakText } from '../utils/utils.js';

/**
 * Show a debug notification using the existing debug panel when available.
 * Falls back to announceMessage/TTS when the panel is not present.
 * @param {{key:string, params?:Object, persistent?:boolean, tts?:boolean}} opts
 */
export async function notifyDebug({ key, params = {}, persistent = false, tts = true } = {}) {
  let text = key;
  try {
    text = await getText(key, params);
  } catch (e) {
    // getText may throw in rare cases; fall back to key as message
    try { console.warn('notifyDebug: getText failed', e); } catch (e2) {}
    text = key;
  }

  // Always call announceMessage so screen reader regions are updated.
  try { announceMessage(text); } catch (e) { try { console.warn('announceMessage failed', e); } catch (e2) {} }

  // Speak the message if requested. speakText is already guarded by settings and cooldown.
  if (tts) {
    try { speakText(text, 'tts'); } catch (e) { try { console.warn('speakText failed', e); } catch (e2) {} }
  }

  // Try to reuse the debug UI panel if present; create a small persistent area.
  try {
    if (typeof document !== 'undefined') {
      const panel = document.getElementById('acoustsee-debug-panel');
      if (panel) {
        let container = document.getElementById('acoustsee-debug-notifier');
        if (!container) {
          container = document.createElement('div');
          container.id = 'acoustsee-debug-notifier';
          // make it visually compact and high-contrast inside the debug panel
          Object.assign(container.style, {
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            marginTop: '8px',
            maxHeight: '40vh',
            overflowY: 'auto'
          });
          // insert at top of panel so it's visible immediately
          panel.insertBefore(container, panel.firstChild || null);
        }

        // Create the message element
        const el = document.createElement('div');
        el.className = 'acoustsee-debug-notice';
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
          // transient: auto-dismiss after a short timeout
          container.insertBefore(el, container.firstChild || null);
          setTimeout(() => { try { el.remove(); } catch (e) {} }, 4800);
        }

        return { shownInPanel: true, text };
      }
    }
  } catch (e) {
    try { console.warn('notifyDebug panel update failed', e); } catch (e2) {}
  }

  // Fallback: already announced / spoken above. Return for callers.
  return { shownInPanel: false, text };
}

export default notifyDebug;
