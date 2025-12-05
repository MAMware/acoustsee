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