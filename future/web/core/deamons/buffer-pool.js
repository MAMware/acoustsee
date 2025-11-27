/**
 * BufferPool - Reusable typed array object pool to reduce GC pressure
 * 
 * Problem: Creating new Uint8Array, Float32Array for every frame causes GC pauses
 * which manifest as audio stutters in real-time applications.
 * 
 * Solution: Pool buffers at initialization; reuse and reset them each frame.
 * 
 * Usage:
 *   const pool = new BufferPool({
 *     Uint8Array: 2,    // Keep 2 Uint8Array buffers in pool (each 1MB)
 *     Float32Array: 2
 *   });
 *   
 *   const buffer = pool.acquire(Uint8Array, 1024 * 1024);
 *   // Use buffer...
 *   pool.release(Uint8Array, buffer);  // Reset and return to pool
 */

export class BufferPool {
  constructor(config = {}) {
    this.config = config;
    this.pools = new Map(); // poolMap[TypedArrayClass] = [buffer1, buffer2, ...]
    this.sizes = new Map();  // track sizes of pooled buffers
    
    // Pre-allocate pools
    for (const [TypedArrayClass, count] of Object.entries(config)) {
      try {
        const ctor = globalThis[TypedArrayClass] || eval(TypedArrayClass);
        this.pools.set(ctor, []);
        // Don't pre-allocate; allocate on first acquire
      } catch (e) {
        console.warn(`BufferPool: Invalid TypedArray class: ${TypedArrayClass}`, e);
      }
    }
  }

  /**
   * Acquire a buffer from the pool or create a new one
   * @param {TypedArrayConstructor} TypedArrayClass - e.g., Uint8Array, Float32Array
   * @param {number} size - Required size in elements
   * @returns {TypedArray} Buffer instance
   */
  acquire(TypedArrayClass, size) {
    if (!this.pools.has(TypedArrayClass)) {
      return new TypedArrayClass(size);
    }

    const pool = this.pools.get(TypedArrayClass);
    const sizeKey = `${TypedArrayClass.name}:${size}`;

    // Try to find a buffer with matching size
    for (let i = 0; i < pool.length; i++) {
      if (pool[i].byteLength === size * TypedArrayClass.BYTES_PER_ELEMENT) {
        const buffer = pool.splice(i, 1)[0];
        // Reset buffer (fill with zeros)
        buffer.fill(0);
        return buffer;
      }
    }

    // No matching buffer in pool; create new one
    const newBuffer = new TypedArrayClass(size);
    return newBuffer;
  }

  /**
   * Release a buffer back to the pool for reuse
   * @param {TypedArrayConstructor} TypedArrayClass
   * @param {TypedArray} buffer
   */
  release(TypedArrayClass, buffer) {
    if (!this.pools.has(TypedArrayClass)) {
      return; // Not managed by this pool
    }

    const pool = this.pools.get(TypedArrayClass);
    const maxPoolSize = this.config[TypedArrayClass.name] || 2;

    if (pool.length < maxPoolSize) {
      pool.push(buffer);
    }
  }

  /**
   * Clear all pools (call on cleanup/shutdown)
   */
  clear() {
    this.pools.clear();
    this.sizes.clear();
  }

  /**
   * Get pool statistics for debugging
   */
  getStats() {
    const stats = {};
    for (const [ctor, pool] of this.pools.entries()) {
      stats[ctor.name] = {
        pooled: pool.length,
        maxSize: this.config[ctor.name] || 0,
        totalBytes: pool.reduce((sum, b) => sum + b.byteLength, 0)
      };
    }
    return stats;
  }
}

export default BufferPool;
