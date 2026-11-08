import { PNG } from 'pngjs';

// Inspect a bounded PNG without re-encoding the upstream bytes.
export function transparencyWarning({ bytes, mime }) {
  if (mime !== 'image/png') return '上游未按透明背景要求返回 PNG，已保留返回图片；请勿立即重复提交。';
  try {
    if (bytes.length < 33) throw new Error('Invalid PNG');
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (!width || !height || width > 3840 || height > 3840 || width * height > 8294400) throw new Error('PNG dimensions exceed supported limits');
    const { data } = PNG.sync.read(bytes);
    for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return null;
    return '上游返回的图片没有透明像素，未达到透明背景要求，已保留图片；棋盘格也可能是图像内容。请勿立即重复提交。';
  } catch {
    return '未能核验上游图片的透明通道，已保留返回图片；请勿立即重复提交。';
  }
}
