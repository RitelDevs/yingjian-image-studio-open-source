export const IMAGE_SIZES = ['1K', '2K', '4K'];
export const ASPECT_RATIOS = ['1:1', '4:3', '3:4', '3:2', '2:3', '16:9', '9:16'];
const LONG_EDGE = { '1K': 1024, '2K': 2048, '4K': 4096 };
const gcd = (a, b) => b ? gcd(b, a % b) : a;

// This is the site's supported input range, not a guarantee about upstream output.
export function resolveImageGeometry(size, aspectRatio = 'auto') {
  if (!IMAGE_SIZES.includes(size)) throw new Error('请选择 1K、2K 或 4K 清晰度。');
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
  if (ratio === 'auto' || ASPECT_RATIOS.includes(ratio)) return { size: item.size, aspectRatio: ratio };
  const [ratioWidth, ratioHeight] = ratio.split(':');
  return { size: item.size, aspectRatio: 'custom', ratioWidth, ratioHeight };
}
