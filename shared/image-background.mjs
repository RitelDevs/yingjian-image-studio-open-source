export const IMAGE_BACKGROUNDS = Object.freeze([
  Object.freeze({ value: 'auto', label: '自动' }),
  Object.freeze({ value: 'transparent', label: '透明底' }),
  Object.freeze({ value: 'opaque', label: '不透明' })
]);

export function normalizeImageBackground(value = 'auto') {
  if (!IMAGE_BACKGROUNDS.some(option => option.value === value)) throw new RangeError('背景应为自动、透明底或不透明。');
  return value;
}

export const backgroundLabel = value => IMAGE_BACKGROUNDS.find(option => option.value === value)?.label || '自动';
