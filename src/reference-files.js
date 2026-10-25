// Share validation between the file picker and native file drops.
export const REFERENCE_LIMIT = 4;
export const REFERENCE_BYTES = 8 * 1024 * 1024;
export const REFERENCE_TOTAL_BYTES = 24 * 1024 * 1024;
export const REFERENCE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function selectReferenceFiles(files, references, directoryCount = 0) {
  const accepted = [], reasons = new Set();
  let total = references.reduce((bytes, item) => bytes + (item.file?.size || 0), 0);
  if (directoryCount) reasons.add('文件夹请打开后选择其中的图片');
  for (const source of files) {
    let type = source.type.toLowerCase();
    if (!type || type === 'application/octet-stream') {
      type = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' })[source.name.split('.').at(-1).toLowerCase()] || type;
    }
    if (!REFERENCE_TYPES.includes(type)) { reasons.add('仅支持 PNG、JPEG、WebP 图片'); continue; }
    if (!source.size) { reasons.add('空文件无法添加，请选择有效图片'); continue; }
    if (source.size > REFERENCE_BYTES) { reasons.add('单张图片不能超过 8 MB'); continue; }
    if (references.length + accepted.length >= REFERENCE_LIMIT) { reasons.add('参考图最多 4 张，请移除部分图片后再添加'); continue; }
    if (total + source.size > REFERENCE_TOTAL_BYTES) { reasons.add('参考图总量不能超过 24 MB'); continue; }
    accepted.push(type === source.type ? source : new File([source], source.name, { type, lastModified: source.lastModified }));
    total += source.size;
  }
  const notice = reasons.size ? `${accepted.length ? `已添加 ${accepted.length} 张，其余未添加：` : ''}${[...reasons].join('；')}。` : '';
  return { accepted, notice };
}
