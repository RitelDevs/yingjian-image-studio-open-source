/** Shared by the image editor UI, renderer and AI server. No browser dependencies. */
export const EDITOR_SCHEMA_VERSION = 1;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const MAX_IMAGE_EDGE = 16384;
export const IMAGE_MIME_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
// New controls are additive: a saved six-control draft restores with these at zero.
const OPTIONAL_ADJUSTMENTS = new Set(['highlights', 'shadows', 'bloom', 'grain', 'sharpness']);
export const ADJUSTMENT_GROUPS = Object.freeze([
  Object.freeze({ id: 'light', label: '光线', description: '先调整整体明暗，再照顾亮部与暗部。' }),
  Object.freeze({ id: 'color', label: '色彩', description: '控制颜色浓淡和冷暖倾向。' }),
  Object.freeze({ id: 'effects', label: '质感', description: '锐度、柔光、颗粒与暗角都可单独微调。' })
]);
export const ADJUSTMENT_DEFINITIONS = Object.freeze([
  ['brightness', '明度', -100, 100, 'light', '调整全图明暗。'],
  ['contrast', '对比度', -100, 100, 'light', '拉开或收拢明暗差异。'],
  ['highlights', '高光', -100, 100, 'light', '调整亮部；不能找回原图中已丢失的细节。'],
  ['shadows', '阴影', -100, 100, 'light', '调整暗部，正值提亮，负值压暗。'],
  ['saturation', '饱和度', -100, 100, 'color', '调整颜色浓淡，-100 为黑白。'],
  ['temperature', '色温', -100, 100, 'color', '负值偏冷，正值偏暖；不是开尔文色温。'],
  ['tint', '色调', -100, 100, 'color', '负值偏绿，正值偏洋红。'],
  ['sharpness', '锐度', 0, 100, 'effects', '增强边缘与细节，0 为原始锐度；过高可能突出噪点，不能恢复丢失的细节。'],
  ['bloom', '柔光', 0, 100, 'effects', '让亮部向周围柔和扩散，保留画面轮廓。'],
  ['grain', '胶片颗粒', 0, 100, 'effects', '增加固定的细微颗粒，同一参数重复导出效果稳定。'],
  ['vignette', '暗角', 0, 100, 'effects', '轻压画面四周，引导视线。']
].map(([key, label, min, max, group, description]) => Object.freeze({ key, label, min, max, step: 1, defaultValue: 0, group, description })));
export const DEFAULT_ADJUSTMENTS = Object.freeze(Object.fromEntries(ADJUSTMENT_DEFINITIONS.map(({ key }) => [key, 0])));
export const DEFAULT_TRANSFORM = Object.freeze({ rotation: 0, flipX: false, flipY: false });
// Original six recipes stay unchanged; new looks are tuned for this renderer's units.
export const EDITOR_PRESETS = Object.freeze([
  ['original', '原图', {}, '清除调色与质感效果，保留当前裁剪和旋转。'],
  ['clean', '清透', { brightness: 8, contrast: 8, saturation: 6, temperature: -2 }, '轻提明度与层次，适合明亮日常画面。'],
  ['warm', '暖调', { brightness: 5, contrast: 2, saturation: 5, temperature: 22, tint: 2, vignette: 4 }, '温和的金黄色倾向，保留自然层次。'],
  ['cool', '冷调', { brightness: 2, contrast: 8, saturation: -6, temperature: -22, vignette: 6 }, '清冷、克制的蓝色倾向。'],
  ['retro', '复古', { brightness: 5, contrast: -12, saturation: -18, temperature: 18, tint: 5, vignette: 22 }, '低饱和与柔和反差，带暖色旧照片氛围。'],
  ['bw', '黑白', { brightness: 6, contrast: 18, saturation: -100, vignette: 10 }, '去除颜色，突出明暗与形状。'],
  ['film', '胶片', { brightness: 3, contrast: 8, highlights: -18, shadows: 10, saturation: -10, temperature: 6, grain: 24, vignette: 12 }, '柔和亮部、轻微颗粒和低饱和；不是特定胶片型号仿真。'],
  ['noir', '黑白电影', { contrast: 30, highlights: -12, shadows: -16, saturation: -100, grain: 16, vignette: 30 }, '浓重黑白、压暗阴影与边缘，适合戏剧性轮廓。'],
  ['dramatic', '戏剧', { brightness: -4, contrast: 24, highlights: -15, shadows: -12, saturation: 5, vignette: 18 }, '更深的暗部与鲜明反差，适合强调力量感。'],
  ['dreamy', '柔梦', { brightness: 4, contrast: -10, highlights: -8, shadows: 12, saturation: -8, temperature: 5, bloom: 36 }, '亮部柔和扩散、略低反差，适合轻盈梦幻氛围。']
].map(([id, label, values, description]) => Object.freeze({ id, label, description, adjustments: Object.freeze({ ...DEFAULT_ADJUSTMENTS, ...values }) })));

export class EditorError extends Error {
  constructor(message, code = 'invalid_editor_input') { super(message); this.name = 'EditorError'; this.code = code; }
}
const fail = (message, code) => { throw new EditorError(message, code); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isDocumentId(value) { return typeof value === 'string' && uuid.test(value); }
function object(value, keys, title) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(`${title}格式无效。`);
  if (Object.keys(value).some(key => !keys.includes(key))) fail(`${title}包含未知字段。`);
  return value;
}
function number(value, min, max, title, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) fail(`${title}超出允许范围。`);
  return value;
}
export function validateAdjustments(input, partial = false) {
  object(input, ADJUSTMENT_DEFINITIONS.map(item => item.key), '调色参数');
  const result = {};
  for (const item of ADJUSTMENT_DEFINITIONS) {
    if (partial && !Object.hasOwn(input, item.key)) continue;
    const value = !Object.hasOwn(input, item.key) && OPTIONAL_ADJUSTMENTS.has(item.key) ? item.defaultValue : input[item.key];
    result[item.key] = number(value, item.min, item.max, item.label);
  }
  if (partial && !Object.keys(result).length) fail('请提供至少一项调色参数。');
  return result;
}
export function validateTransform(input, partial = false) {
  object(input, ['rotation', 'flipX', 'flipY'], '旋转翻转参数');
  const result = {};
  for (const key of ['rotation', 'flipX', 'flipY']) {
    if (partial && !Object.hasOwn(input, key)) continue;
    if (key === 'rotation') {
      if (![0, 90, 180, 270].includes(input[key])) fail('旋转角度只能为 0、90、180 或 270 度。');
    } else if (typeof input[key] !== 'boolean') fail('翻转参数必须为布尔值。');
    result[key] = input[key];
  }
  if (partial && !Object.keys(result).length) fail('请提供至少一项旋转翻转参数。');
  return result;
}
export function validateCrop(input) {
  if (input === null) return null;
  object(input, ['x', 'y', 'width', 'height'], '裁剪区域');
  const x = number(input.x, 0, 1, '裁剪横坐标'), y = number(input.y, 0, 1, '裁剪纵坐标');
  const width = number(input.width, Number.MIN_VALUE, 1, '裁剪宽度'), height = number(input.height, Number.MIN_VALUE, 1, '裁剪高度');
  if (x >= 1 || y >= 1 || x + width > 1 + 1e-10 || y + height > 1 + 1e-10) fail('裁剪区域不能超出图片边界。');
  return { x, y, width: Math.min(width, 1 - x), height: Math.min(height, 1 - y) };
}
export function validateEditorState(input) {
  object(input, ['documentId', 'revision', 'width', 'height', 'name', 'mime', 'adjustments', 'transform', 'crop'], '编辑状态');
  if (!isDocumentId(input.documentId)) fail('图片文档编号无效。');
  const revision = number(input.revision, 0, Number.MAX_SAFE_INTEGER, '编辑版本', true);
  const width = number(input.width, 1, MAX_IMAGE_EDGE, '图片宽度', true), height = number(input.height, 1, MAX_IMAGE_EDGE, '图片高度', true);
  if (width * height > MAX_IMAGE_PIXELS) fail('图片像素过多，请使用不超过 4000 万像素的图片。', 'image_too_large');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 255) fail('图片名称无效。');
  if (!IMAGE_MIME_TYPES.includes(input.mime)) fail('只支持 PNG、JPEG、WebP 图片。');
  return { documentId: input.documentId, revision, width, height, name: input.name, mime: input.mime,
    adjustments: validateAdjustments(input.adjustments), transform: validateTransform(input.transform), crop: validateCrop(input.crop) };
}
export function validateOperations(input, state) {
  if (state !== undefined) validateEditorState(state);
  if (!Array.isArray(input) || input.length > 32) fail('编辑操作必须是最多 32 项的数组。');
  const result = input.map(operation => {
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) fail('编辑操作格式无效。');
    switch (operation.type) {
      case 'setAdjustments': object(operation, ['type', 'values'], '调色操作'); return { type: operation.type, values: validateAdjustments(operation.values, true) };
      case 'applyPreset':
        object(operation, ['type', 'presetId'], '预设操作');
        if (!EDITOR_PRESETS.some(item => item.id === operation.presetId)) fail('没有找到这个图片预设。');
        return { type: operation.type, presetId: operation.presetId };
      case 'setTransform': object(operation, ['type', 'values'], '变换操作'); return { type: operation.type, values: validateTransform(operation.values, true) };
      case 'setCrop': object(operation, ['type', 'crop'], '裁剪操作'); return { type: operation.type, crop: validateCrop(operation.crop) };
      case 'reset': case 'undo': case 'redo': object(operation, ['type'], '编辑操作'); return { type: operation.type };
      default: fail('不支持这项编辑操作。');
    }
  });
  if (result.length > 1 && result.some(item => ['undo', 'redo'].includes(item.type))) fail('撤销或重做必须单独执行。');
  return result;
}
export function sameEdits(a, b) {
  return JSON.stringify([a.adjustments, a.transform, a.crop]) === JSON.stringify([b.adjustments, b.transform, b.crop]);
}
export function nextRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) fail('编辑版本已超出允许范围，请重新载入图片。');
  return revision + 1;
}
export function applyOperations(input, operations) {
  const original = validateEditorState(input), result = validateEditorState(input);
  const validated = validateOperations(operations);
  for (const operation of validated) {
    switch (operation.type) {
      case 'setAdjustments': Object.assign(result.adjustments, operation.values); break;
      case 'applyPreset': result.adjustments = { ...EDITOR_PRESETS.find(item => item.id === operation.presetId).adjustments }; break;
      case 'setTransform': {
        const transform = { ...result.transform, ...operation.values };
        // Crop coordinates belong to the transformed image; a changed transform starts a fresh crop.
        if (JSON.stringify(transform) !== JSON.stringify(result.transform)) result.crop = null;
        result.transform = transform; break;
      }
      case 'setCrop': result.crop = operation.crop; break;
      case 'reset': result.adjustments = { ...DEFAULT_ADJUSTMENTS }; result.transform = { ...DEFAULT_TRANSFORM }; result.crop = null; break;
      default: fail('撤销和重做需要通过编辑历史执行。', 'history_required');
    }
  }
  if (!sameEdits(original, result)) result.revision = nextRevision(original.revision);
  return result;
}
export function describeOperations(operations) {
  const names = operations.map(item => {
    if (item.type === 'setAdjustments') return Object.keys(item.values).map(key => ADJUSTMENT_DEFINITIONS.find(value => value.key === key)?.label).filter(Boolean).join('、');
    if (item.type === 'applyPreset') return EDITOR_PRESETS.find(value => value.id === item.presetId)?.label || '预设';
    return { setTransform: '旋转翻转', setCrop: '裁剪', reset: '恢复原图', undo: '撤销', redo: '重做' }[item.type] || '调整图片';
  });
  return names.join(' · ').slice(0, 200) || '调整图片';
}
