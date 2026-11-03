export const IMAGE_SIZES = ['1K', '2K', '4K', 'A2', 'A3', 'A4', 'custom'];
export const PAPER_SIZES = Object.freeze({ A2: [420, 594], A3: [297, 420], A4: [210, 297] });
export const SIZE_OPTIONS = IMAGE_SIZES.map(value => ({ value, label: value === 'custom' ? '自定义' : value }));
export const draftPixelSize = draft => draft.size === 'custom' ? { width: Number(draft.pixelWidth), height: Number(draft.pixelHeight) } : undefined;
export const ASPECT_RATIOS = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16'];
const LONG_EDGE = { '1K': 1024, '2K': 2048, '4K': 3840 };
export const IMAGE_PIXEL_LIMITS = Object.freeze({ maxEdge: 3840, minPixels: 655360, maxPixels: 8294400 });
const gcd = (a, b) => b ? gcd(b, a % b) : a;

// Fit the target to the native image API limits before displaying or sending it.
// Search neighboring 16px steps so rounding cannot cross the area or 3:1 bounds.
function fitDimensions(width, height) {
  const ratio = width / height;
  const { maxEdge, minPixels, maxPixels } = IMAGE_PIXEL_LIMITS;
  const area = Math.min(Math.max(width * height, minPixels), maxPixels, maxEdge ** 2 / Math.max(ratio, 1 / ratio));
  const targetHeight = Math.sqrt(area / ratio), targetWidth = targetHeight * ratio;
  const candidates = [];
  for (let x = Math.floor(targetWidth / 16) - 2; x <= Math.ceil(targetWidth / 16) + 2; x++) {
    for (let y = Math.floor(targetHeight / 16) - 2; y <= Math.ceil(targetHeight / 16) + 2; y++) {
      const w = x * 16, h = y * 16, pixels = w * h;
      if (w < 16 || h < 16 || w > maxEdge || h > maxEdge || pixels < minPixels || pixels > maxPixels || w > h * 3 || h > w * 3) continue;
      candidates.push({ width: w, height: h, score: Math.abs(Math.log(w / h / ratio)) * 4 + Math.abs(Math.log(pixels / area)) });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.width * a.height - b.width * b.height);
  if (!candidates.length) throw new Error('无法为这个比例确定可用的生成尺寸，请调整宽高。');
  const best = candidates[0];
  return { width: best.width, height: best.height };
}

export function resolveImageGeometry(size, aspectRatio = 'auto', pixelSize) {
  if (!IMAGE_SIZES.includes(size)) throw new Error('请选择有效的图片尺寸。');
  if (PAPER_SIZES[size]) {
    if (typeof aspectRatio !== 'string' || !/^(auto|portrait|landscape|\d{1,5}:\d{1,5})$/.test(aspectRatio)) throw new Error('请选择有效的纸张方向。');
    const landscape = aspectRatio === 'landscape' || (/^\d+:\d+$/.test(aspectRatio) && Number(aspectRatio.split(':')[0]) > Number(aspectRatio.split(':')[1]));
    const mm = landscape ? [...PAPER_SIZES[size]].reverse() : PAPER_SIZES[size];
    const target = mm.map(v => Math.round(v / 25.4 * 150 / 16) * 16);
    const { width, height } = fitDimensions(...target), factor = gcd(width, height);
    return { size, aspectRatio: `${width / factor}:${height / factor}`, width, height, requestSize: `${width}x${height}`, paper: { widthMM: mm[0], heightMM: mm[1], targetDpi: 150 } };
  }
  if (size === 'custom') {
    if (!pixelSize || typeof pixelSize !== 'object' || Array.isArray(pixelSize) || Object.keys(pixelSize).some(k => !['width','height'].includes(k)) || ['width','height'].some(k => !Number.isInteger(pixelSize[k]) || pixelSize[k] < 512 || pixelSize[k] > 4096)) throw new Error('自定义宽高须为 512～4096 的整数像素。');
    if (pixelSize.width / pixelSize.height > 3 || pixelSize.height / pixelSize.width > 3) throw new Error('目前支持 1:3～3:1 的画面比例。');
    const { width, height } = fitDimensions(Math.round(pixelSize.width / 16) * 16, Math.round(pixelSize.height / 16) * 16);
    const factor = gcd(width, height);
    return { size, aspectRatio: `${width / factor}:${height / factor}`, width, height, requestSize: `${width}x${height}`, pixelSize: { width, height } };
  }
  if (aspectRatio === 'auto') return { aspectRatio: 'auto', size, requestSize: 'auto', width: null, height: null };
  if (typeof aspectRatio !== 'string' || !/^\d{1,5}:\d{1,5}$/.test(aspectRatio)) throw new Error('请填写有效的宽高比，例如 16:9。');
  const [x, y] = aspectRatio.split(':').map(Number);
  if (x < 1 || y < 1 || x > 10000 || y > 10000) throw new Error('比例的宽和高须为 1～10000 的整数。');
  if (x / y > 3 || y / x > 3) throw new Error('目前支持 1:3～3:1 的画面比例。');
  const factor = gcd(x, y), edge = LONG_EDGE[size];
  const { width, height } = fitDimensions(x >= y ? edge : edge * x / y, y >= x ? edge : edge * y / x);
  return { aspectRatio: `${x / factor}:${y / factor}`, size, requestSize: `${width}x${height}`, width, height };
}

export function draftAspectRatio(draft) {
  return draft.aspectRatio === 'custom' ? `${draft.ratioWidth || ''}:${draft.ratioHeight || ''}` : (draft.aspectRatio || 'auto');
}

export function imageSettingsForRetry(item) {
  const ratio = item.aspectRatio || 'auto';
  if (PAPER_SIZES[item.size]) return { size: item.size, aspectRatio: ratio };
  if (item.size === 'custom') { const dims = item.context?.pixelSize || item.pixelSize; return { size: 'custom', aspectRatio: ratio, pixelWidth: String(dims?.width || 1536), pixelHeight: String(dims?.height || 1024) }; }
  if (ratio === 'auto' || ASPECT_RATIOS.includes(ratio)) return { size: item.size, aspectRatio: ratio };
  const [ratioWidth, ratioHeight] = ratio.split(':');
  return { size: item.size, aspectRatio: 'custom', ratioWidth, ratioHeight };
}
