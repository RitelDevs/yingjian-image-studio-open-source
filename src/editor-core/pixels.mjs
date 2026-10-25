import { validateAdjustments, EditorError } from '../../shared/editor-contract.mjs';
import { applyBloom, finishPixels } from './effects.mjs';
import { applySharpness } from './sharpen.mjs';

const smoothstep = (low, high, value) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};
/** All passes start from the immutable source; existing six-control looks keep their math. */
export function adjustPixels(data, width, height, values) {
  if (!(data instanceof Uint8ClampedArray) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || data.length !== width * height * 4) throw new EditorError('图片像素缓冲区无效。');
  const adjustments = validateAdjustments(values);
  if (Object.values(adjustments).every(value => value === 0)) return data;
  const brightness = adjustments.brightness / 100;
  const contrast = 1 + adjustments.contrast / 100;
  const saturation = 1 + adjustments.saturation / 100;
  const temperature = adjustments.temperature / 100 * .16;
  const tint = adjustments.tint / 100;
  const highlights = adjustments.highlights / 100, shadows = adjustments.shadows / 100;
  const redOffset = temperature + tint * .07, greenOffset = -tint * .10, blueOffset = -temperature + tint * .07;
  const afterEffects = adjustments.bloom > 0 || adjustments.grain > 0 || adjustments.sharpness > 0;
  const vignette = afterEffects ? 0 : adjustments.vignette / 100 * .85;
  for (let y = 0; y < height; y++) {
    const ny = 2 * (y + .5) / height - 1, yy = ny * ny;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (!data[i + 3]) continue;
      let red = data[i] / 255 + redOffset + brightness;
      let green = data[i + 1] / 255 + greenOffset + brightness;
      let blue = data[i + 2] / 255 + blueOffset + brightness;
      if (highlights || shadows) {
        const luma = Math.max(0, Math.min(1, red * .2126 + green * .7152 + blue * .0722));
        const delta = .45 * (shadows * (1 - smoothstep(.05, .65, luma)) * (shadows > 0 ? 1 - luma : luma)
          + highlights * smoothstep(.35, .95, luma) * (highlights > 0 ? 1 - luma : luma));
        red += delta; green += delta; blue += delta;
      }
      red = (red - .5) * contrast + .5; green = (green - .5) * contrast + .5; blue = (blue - .5) * contrast + .5;
      const luminance = red * .2126 + green * .7152 + blue * .0722;
      red = luminance + (red - luminance) * saturation;
      green = luminance + (green - luminance) * saturation;
      blue = luminance + (blue - luminance) * saturation;
      let shade = 1;
      if (vignette) {
        const nx = 2 * (x + .5) / width - 1;
        shade -= vignette * Math.pow(Math.min(1, (nx * nx + yy) / 2), 1.2);
      }
      data[i] = red * shade * 255; data[i + 1] = green * shade * 255; data[i + 2] = blue * shade * 255;
    }
  }
  if (adjustments.bloom) applyBloom(data, width, height, adjustments.bloom);
  if (adjustments.sharpness) applySharpness(data, width, height, adjustments.sharpness);
  if (afterEffects) finishPixels(data, width, height, adjustments);
  return data;
}
