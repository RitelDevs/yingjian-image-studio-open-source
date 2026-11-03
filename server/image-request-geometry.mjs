import { resolveImageGeometry } from '../shared/image-geometry.mjs';

// Read dimensions only; never decode or alter the uploaded pixels. Malformed or
// unsupported headers fall back to a square, and all loops stay inside the file.
export function referenceDimensions(bytes) {
  if (!Buffer.isBuffer(bytes)) return null;
  const valid = (width, height) => width > 0 && height > 0 && width <= 100000 && height <= 100000 ? { width, height } : null;
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii', 12, 16) === 'IHDR') return valid(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const kind = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4), start = offset + 8;
      if (length > bytes.length - start) return null;
      if (kind === 'VP8X' && length >= 10) return valid(1 + bytes.readUIntLE(start + 4, 3), 1 + bytes.readUIntLE(start + 7, 3));
      if (kind === 'VP8L' && length >= 5 && bytes[start] === 0x2f) {
        const bits = bytes.readUInt32LE(start + 1);
        return valid((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      }
      if (kind === 'VP8 ' && length >= 10 && bytes.toString('hex', start + 3, start + 6) === '9d012a') return valid(bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff);
      offset = start + length + (length % 2);
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset < bytes.length;) {
      if (bytes[offset++] !== 0xff) return null;
      while (offset < bytes.length && bytes[offset] === 0xff) offset++;
      if (offset >= bytes.length) return null;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || length > bytes.length - offset) return null;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker) && length >= 7) return valid(bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3));
      offset += length;
    }
  }
  return null;
}

export function resolveImageRequestGeometry({ size, aspectRatio = 'auto', pixelSize, references = [] }) {
  const geometry = resolveImageGeometry(size, aspectRatio, pixelSize);
  if (geometry.requestSize !== 'auto') return geometry;
  const dimensions = references.map(item => referenceDimensions(item.bytes)).find(Boolean);
  // Auto follows the first readable reference, bounded to supported proportions.
  // Without a reference, select a deterministic square at the chosen tier.
  const ratio = dimensions ? Math.min(3, Math.max(1 / 3, dimensions.width / dimensions.height)) : 1;
  return resolveImageGeometry(size, `${Math.round(ratio * 3000)}:3000`);
}
