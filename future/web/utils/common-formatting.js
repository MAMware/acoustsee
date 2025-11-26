// utils/common-formatting.js
// Pure formatting utility functions with NO imports (leaf node).
// Safe to import from any module without creating circular dependencies.
// Created as part of ADR-0011 Hexagonal Purity Remediation (Violation 9).

/**
 * Format timestamp to ISO 8601 string.
 * @param {number|Date} ts - Timestamp in milliseconds or Date object
 * @returns {string} ISO 8601 formatted string (e.g., "2025-11-26T15:30:00.000Z")
 */
export function formatTimestamp(ts) {
  try {
    return new Date(ts).toISOString();
  } catch (e) {
    return new Date().toISOString(); // Fallback to current time
  }
}

/**
 * Format bytes to human-readable memory size.
 * @param {number} bytes - Memory size in bytes
 * @returns {string} Formatted string (e.g., "42.50 MB")
 */
export function formatMemory(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes)) return '0.00 MB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

/**
 * Truncate string to maximum length with ellipsis.
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length (default: 100)
 * @returns {string} Truncated string with "..." if needed
 */
export function truncateString(str, maxLength = 100) {
  if (typeof str !== 'string') return String(str);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Safely stringify objects, handling circular references and Error instances.
 * @param {*} obj - Object to stringify
 * @param {number} indent - Indentation spaces (default: 0 for compact)
 * @returns {string} JSON string with circular refs replaced by "[Circular]"
 */
export function safeStringify(obj, indent = 0) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    if (val instanceof Error) {
      return { message: val.message, stack: val.stack };
    }
    return val;
  }, indent);
}
