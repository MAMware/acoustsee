/**
 * accessibility.js - Accessibility & A11y Utilities
 * 
 * Handles accessible announcements for screen readers and assistive technologies.
 * Manages ARIA live regions and announcement queueing.
 */

import { structuredLog } from './logging.js';
import { computeAnnounceDelay } from './performance.js';

// Configuration constant for announcement delay (milliseconds)
// Tune this if you see missed announcements on older/slow devices.
export const ANNOUNCE_REWRITE_DELAY_MS = 150;

/**
 * Announces a message to screen readers via ARIA live region.
 * Clears and re-sets text to force some screen readers to re-announce identical messages.
 * Includes optional visual toast for debugging.
 * 
 * @param {string} message - Message to announce
 * @param {Object} settings - Application settings (optional, for debugLogging flag)
 * 
 * @example
 * announceMessage("Navigation updated");
 * announceMessage("3 objects detected", { debugLogging: true });
 */
export function announceMessage(message, settings = {}) {
  const announcements = typeof document !== 'undefined' && document.getElementById 
    ? document.getElementById('announcements') 
    : null;
  
  // Compute a conservative delay based on device heuristics.
  const delay = computeAnnounceDelay(ANNOUNCE_REWRITE_DELAY_MS);

  if (announcements) {
    // Clear first to force re-announcement of identical messages
    try { announcements.textContent = ''; } catch (e) { /* ignore DOM errors */ }
    
    // Small async tick before setting text to ensure AT detects the change
    setTimeout(() => { 
      try { announcements.textContent = message; } catch (e) {} 
    }, delay);

    // Optional visible debug toast for manual testing on devices
    if (settings?.debugLogging) {
      try {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
          position: fixed; bottom: 10px; left: 10px; 
          background: #333; color: #fff; padding: 8px 12px; 
          border-radius: 4px; font-size: 12px; z-index: 10000;
          max-width: 250px; word-wrap: break-word;
        `;
        document.body.appendChild(toast);
        setTimeout(() => { 
          try { toast.remove(); } catch (e) {} 
        }, 3000);
      } catch (e) {
        // Silently fail if DOM mutation fails
      }
    }
  }
}

/**
 * Retrieves the announcements live region element.
 * Returns null if running in non-DOM environment.
 * 
 * @returns {Element|null} The announcements container or null
 * @internal
 */
export function getAnnouncementsElement() {
  return typeof document !== 'undefined' && document.getElementById 
    ? document.getElementById('announcements') 
    : null;
}

/**
 * Sets ARIA attributes for accessibility.
 * Helps define region roles and live behavior.
 * 
 * @param {Element} element - DOM element to configure
 * @param {Object} attrs - Map of ARIA attributes
 * 
 * @example
 * const region = document.getElementById('status');
 * setAriaAttrs(region, { 'aria-live': 'polite', 'aria-atomic': 'true' });
 */
export function setAriaAttrs(element, attrs = {}) {
  if (!element) return;
  Object.entries(attrs).forEach(([key, value]) => {
    try { element.setAttribute(key, value); } catch (e) { /* ignore */ }
  });
}
