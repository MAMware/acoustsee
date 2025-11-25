/**
 * haptics.js - Haptic Feedback Module
 * 
 * Generates vibration patterns for tactile feedback.
 * Uses the Vibration API with safe fallbacks.
 */

/**
 * Triggers a haptic pulse pattern based on count.
 * Creates multiple short vibrations for user feedback.
 * 
 * @param {number} count - Number of vibration pulses to generate
 * 
 * @example
 * hapticCount(1);  // Single vibration
 * hapticCount(3);  // Three quick pulses
 */
export function hapticCount(count) {
  if (navigator.vibrate) {
    const pattern = Array(count * 2 - 1)
      .fill(30)
      .map((v, i) => i % 2 === 0 ? 30 : 50);  // Alternating on/off: 30ms on, 50ms off
    navigator.vibrate(pattern);
  }
}

/**
 * Generates a custom vibration pattern.
 * 
 * @param {number[]} pattern - Array of vibration timings in milliseconds
 *                             [on1, off1, on2, off2, ...]
 * 
 * @example
 * vibrate([50, 100, 50]);  // 50ms on, 100ms off, 50ms on
 */
export function vibrate(pattern) {
  if (navigator.vibrate && Array.isArray(pattern)) {
    navigator.vibrate(pattern);
  }
}

/**
 * Cancels any ongoing vibration.
 * 
 * @example
 * cancelVibration();
 */
export function cancelVibration() {
  if (navigator.vibrate) {
    navigator.vibrate(0);
  }
}
