export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const DEFAULT_VIEW = Object.freeze({ scale: 1, x: 0, y: 0 });
export function zoomAt(view, scale, anchor = { x: 0, y: 0 }) {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number.isFinite(scale) ? scale : view.scale));
  const factor = next / view.scale;
  return { scale: next, x: anchor.x - (anchor.x - view.x) * factor, y: anchor.y - (anchor.y - view.y) * factor };
}
export function fitImage(width, height, ratio) {
  const availableWidth = Math.max(1, width - 32), availableHeight = Math.max(1, height - 32);
  const imageWidth = Math.max(1, Math.min(availableWidth, availableHeight * (ratio || 1)));
  return { width: imageWidth, height: imageWidth / (ratio || 1) };
}
