// Helpers to extract luma (Y) and optional chroma planes from VideoFrame or ImageData.
// These provide a safe fallback so code can use Y-plane processing when available.
export function rgbaToY(frameData, width, height) {
  // frameData: Uint8ClampedArray RGBA
  const y = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < frameData.length; i += 4, j++) {
    const r = frameData[i] || 0;
    const g = frameData[i + 1] || 0;
    const b = frameData[i + 2] || 0;
    // integer luminance
    y[j] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
  }
  return y;
}

export async function extractYFromVideoFrame(videoFrame) {
  // Try WebCodecs VideoFrame.copyTo path first; fall back to createImageBitmap path.
  try {
    if (typeof VideoFrame !== 'undefined' && videoFrame && typeof videoFrame.copyTo === 'function') {
      // Attempt to copy to an I420 layout (Y plane + U + V). If format isn't I420,
      // the call will likely fail; we catch and fallback to bitmap path.
      const w = videoFrame.displayWidth || videoFrame.codedWidth || 0;
      const h = videoFrame.displayHeight || videoFrame.codedHeight || 0;
      if (!w || !h) throw new Error('VideoFrame missing dims');
      // Prepare a Y buffer only (fast path) — copyTo can write to the Y plane when layout provided.
      const y = new Uint8Array(w * h);
      try {
        await videoFrame.copyTo(y, { layout: [{ offset: 0, stride: w }] });
        return { y, width: w, height: h };
      } catch (e) {
        // Some implementations require a multi-plane layout; fallthrough to bitmap path
      }
    }
  } catch (e) {
    // ignore and fallback
  }

  // Fallback: draw to an OffscreenCanvas or ImageBitmap and extract RGBA -> Y
  try {
    const w = videoFrame.displayWidth || videoFrame.codedWidth || videoFrame.width || 0;
    const h = videoFrame.displayHeight || videoFrame.codedHeight || videoFrame.height || 0;
    const bitmap = await createImageBitmap(videoFrame);
    const off = new OffscreenCanvas(w, h);
    const ctx = off.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const id = ctx.getImageData(0, 0, w, h);
    bitmap.close?.();
    const y = rgbaToY(id.data, w, h);
    return { y, width: w, height: h };
  } catch (e) {
    // Final fallback: return null
    return null;
  }
}

export default { rgbaToY, extractYFromVideoFrame };
