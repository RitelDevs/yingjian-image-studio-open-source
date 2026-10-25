import { EditorError, MAX_IMAGE_BYTES, IMAGE_MIME_TYPES } from '../../shared/editor-contract.mjs';

export async function validateImageBlob(blob) {
  if (!(blob instanceof Blob) || !blob.size) throw new EditorError('请选择有效的图片文件。', 'invalid_image');
  if (blob.size > MAX_IMAGE_BYTES) throw new EditorError('单张图片不能超过 8 MB。', 'image_too_large');
  const bytes = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  let mime = '';
  if (bytes.length >= 24 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) mime = 'image/png';
  else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = 'image/jpeg';
  else if (bytes.length >= 16 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') mime = 'image/webp';
  if (!mime || (blob.type && blob.type !== 'application/octet-stream' && blob.type.toLowerCase() !== mime)) throw new EditorError('图片格式与文件内容不符，仅支持 PNG、JPEG、WebP。', 'invalid_image');
  return { blob: blob.type === mime ? blob : new Blob([blob], { type: mime }), mime };
}
export function normalizeImageName(name) {
  return String(name || '图片').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 255) || '图片';
}
export function assertSupportedMime(mime) {
  if (!IMAGE_MIME_TYPES.includes(mime)) throw new EditorError('图片格式无效。', 'invalid_image');
}
