/**
 * Wraps any async function in a standardized try/catch boundary.
 * @param {Function} fn - The async function to execute.
 * @param {...any} args - Arguments to pass to the function.
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export async function withErrorBoundary(fn, ...args) {
  try {
    const data = await fn(...args);
    return { data, error: null };
  } catch (error) {
    console.error(`${fn.name} error:`, error);
    return { data: null, error };
  }
}

/**
 * Debounce function for throttling UI updates and frame processing
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function}
 */
export function debounce(fn, delay) {
  let timer = null;
  return function(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * requestAnimationFrame-based throttle for autoFPS
 * @param {Function} fn - Function to throttle
 * @returns {Function}
 */
export function rafThrottle(fn) {
  let running = false;
  return function(...args) {
    if (!running) {
      running = true;
      requestAnimationFrame(() => {
        fn.apply(this, args);
        running = false;
      });
    }
  };
}