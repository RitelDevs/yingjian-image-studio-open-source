/** Alpha-aware luminance unsharp mask. Three rolling source rows keep memory O(width).
 * 3x3 binomial blur, one-level noise threshold and capped detail boost avoid strong halos.
 * Apply before synthetic grain; the alpha channel and hidden RGB are never changed.
 */
export function applySharpness(data, width, height, value) {
  if (!value) return data;
  const amount = value / 100 * 2;
  function row(y, target) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      target[x * 2] = .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
      target[x * 2 + 1] = data[i + 3] / 255;
    }
    return target;
  }
  let previous = row(0, new Float32Array(width * 2));
  let current = row(0, new Float32Array(width * 2));
  let next = row(Math.min(1, height - 1), new Float32Array(width * 2));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!data[i + 3]) continue;
      let blurred = 0, weight = 0;
      for (let dx = -1; dx <= 1; dx++) {
        const p = Math.max(0, Math.min(width - 1, x + dx)) * 2, wx = dx === 0 ? 2 : 1;
        const a = previous[p + 1] * wx, b = current[p + 1] * wx * 2, c = next[p + 1] * wx;
        blurred += previous[p] * a + current[p] * b + next[p] * c;
        weight += a + b + c;
      }
      const detail = current[x * 2] - blurred / weight;
      const delta = Math.sign(detail) * Math.min(32, Math.max(0, Math.abs(detail) - 1) * amount);
      data[i] += delta; data[i + 1] += delta; data[i + 2] += delta;
    }
    if (y < height - 1) {
      const reuse = previous; previous = current; current = next;
      next = row(Math.min(y + 2, height - 1), reuse);
    }
  }
  return data;
}
