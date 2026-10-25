// Native image effects inspired by pass ordering and look development guidance.
// No third-party shader or Python implementation is copied. See SKILL-ADAPTATION.md.
const linear = Float32Array.from({ length: 256 }, (_, value) => {
  const channel = value / 255;
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
});
// Lookup avoids a power operation per channel when exporting large images.
const encoded = Uint8ClampedArray.from({ length: 4097 }, (_, value) => {
  const channel = value / 4096;
  return (channel <= .0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - .055) * 255;
});
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };

function blurAxis(source, target, width, height, radius, vertical) {
  const major = vertical ? width : height, minor = vertical ? height : width;
  const step = vertical ? width * 3 : 3, lineStep = vertical ? 3 : width * 3;
  const divisor = radius * 2 + 1;
  for (let line = 0; line < major; line++) {
    const first = line * lineStep;
    for (let channel = 0; channel < 3; channel++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += source[first + Math.min(minor - 1, Math.max(0, k)) * step + channel];
      for (let at = 0; at < minor; at++) {
        target[first + at * step + channel] = sum / divisor;
        sum += source[first + Math.min(minor - 1, at + radius + 1) * step + channel]
          - source[first + Math.max(0, at - radius) * step + channel];
      }
    }
  }
}

/** Bright-pass diffusion in linear light. Work buffers have a maximum edge of 384. */
export function applyBloom(data, width, height, amount) {
  if (!amount) return data;
  const scale = Math.min(1, 384 / Math.max(width, height));
  const gw = Math.max(1, Math.round(width * scale)), gh = Math.max(1, Math.round(height * scale));
  const glow = new Float32Array(gw * gh * 3), samples = new Uint32Array(gw * gh);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(gh - 1, Math.floor(y * gh / height));
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, cell = gy * gw + Math.min(gw - 1, Math.floor(x * gw / width));
      samples[cell]++;
      if (!data[i + 3]) continue;
      const r = linear[data[i]], g = linear[data[i + 1]], b = linear[data[i + 2]];
      const luminance = .2126 * r + .7152 * g + .0722 * b;
      const weight = smooth((luminance - .3) / .5) * data[i + 3] / 255;
      glow[cell * 3] += r * weight; glow[cell * 3 + 1] += g * weight; glow[cell * 3 + 2] += b * weight;
    }
  }
  for (let i = 0; i < samples.length; i++) {
    const count = samples[i] || 1;
    glow[i * 3] /= count; glow[i * 3 + 1] /= count; glow[i * 3 + 2] /= count;
  }
  const intermediate = new Float32Array(glow.length), radius = Math.max(1, Math.round(Math.max(gw, gh) * .014));
  // Three separable box passes approximate a soft Gaussian without huge full-res buffers.
  for (let pass = 0; pass < 3; pass++) {
    blurAxis(glow, intermediate, gw, gh, radius, false);
    blurAxis(intermediate, glow, gw, gh, radius, true);
  }
  const strength = amount / 100 * .9;
  for (let y = 0; y < height; y++) {
    const gy = Math.max(0, Math.min(gh - 1, (y + .5) * gh / height - .5));
    const y0 = Math.floor(gy), y1 = Math.min(gh - 1, y0 + 1), fy = gy - y0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!data[i + 3]) continue;
      const gx = Math.max(0, Math.min(gw - 1, (x + .5) * gw / width - .5));
      const x0 = Math.floor(gx), x1 = Math.min(gw - 1, x0 + 1), fx = gx - x0;
      const a = (y0 * gw + x0) * 3, b = (y0 * gw + x1) * 3, c = (y1 * gw + x0) * 3, d = (y1 * gw + x1) * 3;
      for (let channel = 0; channel < 3; channel++) {
        const blurred = (glow[a + channel] * (1 - fx) + glow[b + channel] * fx) * (1 - fy)
          + (glow[c + channel] * (1 - fx) + glow[d + channel] * fx) * fy;
        const result = 1 - (1 - linear[data[i + channel]]) * (1 - Math.min(1, blurred * strength));
        data[i + channel] = encoded[Math.round(clamp(result) * 4096)];
      }
    }
  }
  return data;
}
function hash(x, y) {
  let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ 0x4f1bbcdc;
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295 * 2 - 1;
}
/** The grain field is fixed in normalized image coordinates, never frame time/random(). */
export function grainAt(x, y, width, height) {
  const scale = 1400 / Math.max(width, height);
  const px = (x + .5) * scale, py = (y + .5) * scale;
  const x0 = Math.floor(px), y0 = Math.floor(py), fx = smooth(px - x0), fy = smooth(py - y0);
  return (hash(x0, y0) * (1 - fx) + hash(x0 + 1, y0) * fx) * (1 - fy)
    + (hash(x0, y0 + 1) * (1 - fx) + hash(x0 + 1, y0 + 1) * fx) * fy;
}
export function finishPixels(data, width, height, { grain, vignette }) {
  if (!grain && !vignette) return data;
  const strength = grain / 100 * 30, edgeStrength = vignette / 100 * .85;
  for (let y = 0; y < height; y++) {
    const ny = 2 * (y + .5) / height - 1;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4; if (!data[i + 3]) continue;
      const luminance = (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) / 255;
      const noise = grain ? grainAt(x, y, width, height) * strength * (.35 + .65 * (1 - Math.abs(2 * luminance - 1))) : 0;
      const nx = 2 * (x + .5) / width - 1;
      const shade = 1 - edgeStrength * Math.pow(Math.min(1, (nx * nx + ny * ny) / 2), 1.2);
      data[i] = (data[i] + noise) * shade; data[i + 1] = (data[i + 1] + noise) * shade; data[i + 2] = (data[i + 2] + noise) * shade;
    }
  }
  return data;
}
