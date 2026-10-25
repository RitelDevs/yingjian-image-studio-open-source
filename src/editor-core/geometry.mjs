import { validateEditorState, EditorError } from '../../shared/editor-contract.mjs';

export function resolveRenderGeometry(input, maxEdge = 0) {
  const state = validateEditorState(input);
  if (!Number.isFinite(maxEdge) || maxEdge < 0 || (maxEdge && maxEdge < 1)) throw new EditorError('预览尺寸无效。');
  const swapped = state.transform.rotation % 180 !== 0;
  const transformedWidth = swapped ? state.height : state.width, transformedHeight = swapped ? state.width : state.height;
  const crop = state.crop || { x: 0, y: 0, width: 1, height: 1 };
  const cropX = Math.min(transformedWidth - 1, Math.round(crop.x * transformedWidth));
  const cropY = Math.min(transformedHeight - 1, Math.round(crop.y * transformedHeight));
  const right = Math.min(transformedWidth, Math.max(cropX + 1, Math.round((crop.x + crop.width) * transformedWidth)));
  const bottom = Math.min(transformedHeight, Math.max(cropY + 1, Math.round((crop.y + crop.height) * transformedHeight)));
  const cropWidth = right - cropX, cropHeight = bottom - cropY;
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(cropWidth, cropHeight)) : 1;
  return { transformedWidth, transformedHeight, cropX, cropY, cropWidth, cropHeight,
    outputWidth: Math.max(1, Math.round(cropWidth * scale)), outputHeight: Math.max(1, Math.round(cropHeight * scale)) };
}
