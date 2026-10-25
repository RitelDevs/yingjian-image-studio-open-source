import { EditorError, MAX_IMAGE_EDGE, MAX_IMAGE_PIXELS, validateEditorState } from '../../shared/editor-contract.mjs';
import { adjustPixels } from './pixels.mjs';
import { resolveRenderGeometry } from './geometry.mjs';

function canvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') {
    const result = document.createElement('canvas'); result.width = width; result.height = height; return result;
  }
  throw new EditorError('当前浏览器无法处理图片，请更新浏览器后重试。', 'canvas_unavailable');
}
async function decode(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
    catch { throw new EditorError('无法解码图片，请选择完整的 PNG、JPEG 或 WebP 文件。', 'invalid_image'); }
  }
  if (typeof Image === 'undefined') throw new EditorError('后台图片解码不可用。', 'worker_unavailable');
  const url = URL.createObjectURL(blob), image = new Image();
  try {
    image.src = url; await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, image, close() { image.src = ''; URL.revokeObjectURL(url); } };
  } catch { URL.revokeObjectURL(url); throw new EditorError('无法解码这张图片。', 'invalid_image'); }
}
async function encode(target, format, quality) {
  const type = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  const blob = typeof target.convertToBlob === 'function'
    ? await target.convertToBlob({ type, quality })
    : await new Promise((resolve, reject) => target.toBlob(value => value ? resolve(value) : reject(new EditorError('图片导出失败。', 'encoding_failed')), type, quality));
  if (!blob?.size || blob.type !== type) throw new EditorError('浏览器无法导出所选格式。', 'encoding_failed');
  return blob;
}
export function createImageRenderer() {
  const sources = new Map();
  let disposed = false;
  return {
    async load(sourceId, blob) {
      if (disposed) throw new EditorError('图片编辑器已关闭。', 'disposed');
      const bitmap = await decode(blob);
      if (disposed) { bitmap.close?.(); throw new EditorError('图片编辑器已关闭。', 'disposed'); }
      if (!bitmap.width || !bitmap.height || bitmap.width > MAX_IMAGE_EDGE || bitmap.height > MAX_IMAGE_EDGE || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
        bitmap.close?.(); throw new EditorError('图片不得超过 4000 万像素，单边不得超过 16384 像素。', 'image_too_large');
      }
      sources.get(sourceId)?.close?.(); sources.set(sourceId, bitmap);
      return { width: bitmap.width, height: bitmap.height };
    },
    async render({ sourceId, state: input, maxEdge = 0, format = 'png', quality = .92 }) {
      if (disposed) throw new EditorError('图片编辑器已关闭。', 'disposed');
      const source = sources.get(sourceId);
      if (!source) throw new EditorError('图片来源已变化，请重新打开图片。', 'stale_source');
      const state = validateEditorState(input);
      if (source.width !== state.width || source.height !== state.height) throw new EditorError('图片尺寸与编辑状态不一致。');
      if (!['png', 'jpeg', 'webp'].includes(format) || typeof quality !== 'number' || !Number.isFinite(quality) || quality < 0 || quality > 1) throw new EditorError('导出设置无效。');
      const g = resolveRenderGeometry(state, maxEdge), target = canvas(g.outputWidth, g.outputHeight);
      const context = target.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
      if (!context) throw new EditorError('浏览器无法创建图片画布。', 'canvas_unavailable');
      try {
        context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
        context.save();
        context.scale(g.outputWidth / g.cropWidth, g.outputHeight / g.cropHeight);
        context.translate(-g.cropX, -g.cropY);
        context.translate(g.transformedWidth / 2, g.transformedHeight / 2);
        context.scale(state.transform.flipX ? -1 : 1, state.transform.flipY ? -1 : 1);
        context.rotate(state.transform.rotation * Math.PI / 180);
        context.drawImage(source.image || source, -state.width / 2, -state.height / 2, state.width, state.height);
        context.restore();
        const pixels = context.getImageData(0, 0, g.outputWidth, g.outputHeight);
        adjustPixels(pixels.data, g.outputWidth, g.outputHeight, state.adjustments);
        context.putImageData(pixels, 0, 0);
        if (format === 'jpeg') {
          context.globalCompositeOperation = 'destination-over'; context.fillStyle = '#ffffff';
          context.fillRect(0, 0, g.outputWidth, g.outputHeight); context.globalCompositeOperation = 'source-over';
        }
        const blob = await encode(target, format, quality);
        return { blob, width: g.outputWidth, height: g.outputHeight };
      } finally { target.width = 1; target.height = 1; }
    },
    release(sourceId) { sources.get(sourceId)?.close?.(); sources.delete(sourceId); },
    dispose() { disposed = true; for (const value of sources.values()) value.close?.(); sources.clear(); }
  };
}
