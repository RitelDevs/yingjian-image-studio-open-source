export const IMAGE_SIZES = ['1K', '2K', '4K', 'A2', 'A3', 'A4', 'custom'];
export const PAPER_SIZES = Object.freeze({ A2: [420, 594], A3: [297, 420], A4: [210, 297] });
export const SIZE_OPTIONS = IMAGE_SIZES.map(value => ({ value, label: value === 'custom' ? '自定义' : value }));
export const draftPixelSize = draft => draft.size === 'custom' ? { width: Number(draft.pixelWidth), height: Number(draft.pixelHeight) } : undefined;
export const ASPECT_RATIOS = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16'];
const LONG_EDGE = { '1K': 1024, '2K': 2048, '4K': 4096 };
const gcd = (a, b) => b ? gcd(b, a % b) : a;

// This is the site's supported input range, not a guarantee about upstream output.
export function resolveImageGeometry(size, aspectRatio = 'auto', pixelSize) {
  if (!IMAGE_SIZES.includes(size)) throw new Error('请选择有效的图片尺寸。');
  if (PAPER_SIZES[size]) {
    if (typeof aspectRatio !== 'string' || !/^(auto|portrait|landscape|\d{1,5}:\d{1,5})$/.test(aspectRatio)) throw new Error('请选择有效的纸张方向。');
    const landscape = aspectRatio === 'landscape' || (/^\d+:\d+$/.test(aspectRatio) && Number(aspectRatio.split(':')[0]) > Number(aspectRatio.split(':')[1]));
    const mm = landscape ? [...PAPER_SIZES[size]].reverse() : PAPER_SIZES[size];
    const [width, height] = mm.map(v => Math.round(v / 25.4 * 150 / 16) * 16), factor = gcd(width, height);
    return { size, aspectRatio: `${width / factor}:${height / factor}`, width, height, requestSize: `${width}x${height}`, paper: { widthMM: mm[0], heightMM: mm[1], targetDpi: 150 } };
  }
  if (size === 'custom') {
    if (!pixelSize || typeof pixelSize !== 'object' || Array.isArray(pixelSize) || Object.keys(pixelSize).some(k => !['width','height'].includes(k)) || ['width','height'].some(k => !Number.isInteger(pixelSize[k]) || pixelSize[k] < 512 || pixelSize[k] > 4096)) throw new Error('自定义宽高须为 512～4096 的整数像素。');
    const width = Math.round(pixelSize.width / 16) * 16, height = Math.round(pixelSize.height / 16) * 16;
    if (width / height > 3 || height / width > 3) throw new Error('目前支持 1:3～3:1 的画面比例。');
    const factor = gcd(width, height);
    return { size, aspectRatio: `${width / factor}:${height / factor}`, width, height, requestSize: `${width}x${height}`, pixelSize: { width, height } };
  }
  if (aspectRatio === 'auto') return { aspectRatio: 'auto', size, requestSize: size, width: null, height: null };
  if (typeof aspectRatio !== 'string' || !/^\d{1,5}:\d{1,5}$/.test(aspectRatio)) throw new Error('请填写有效的宽高比，例如 16:9。');
  const [x, y] = aspectRatio.split(':').map(Number);
  if (x < 1 || y < 1 || x > 10000 || y > 10000) throw new Error('比例的宽和高须为 1～10000 的整数。');
  if (x / y > 3 || y / x > 3) throw new Error('目前支持 1:3～3:1 的画面比例。');
  const factor = gcd(x, y), edge = LONG_EDGE[size];
  // Pixel dimensions use 16-pixel steps and never exceed the chosen tier's long edge.
  const width = x >= y ? edge : Math.round(edge * x / y / 16) * 16;
  const height = y >= x ? edge : Math.round(edge * y / x / 16) * 16;
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
