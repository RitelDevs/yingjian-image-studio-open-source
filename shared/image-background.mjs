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

// Only explicit removal/transparency requests affect auto. Quoted design details,
// transparent objects, and negated removal requests retain the normal background.
export function resolveImageBackground(value, prompt = '') {
  const background = normalizeImageBackground(value);
  if (background !== 'auto') return background;
  let transparent = false;
  for (const clause of String(prompt).split(/[，,。.!！？?;；\n]/)) {
    if (/(?:保留|保持|不要去掉|不要删除|不要移除|不要[抠扣]掉|别去掉).{0,12}背景|(?:不要|无需|不需要|不必|别|禁止|不想).{0,12}(?:透明(?:的)?(?:底|背景)|[抠扣](?:图|底|掉.{0,12}(?:背景|底))|(?:去|移除|删除|消除|擦除).{0,12}(?:背景|底))|不透明(?:底|背景)|\b(?:non[- ]transparent|opaque|keep\s+(?:the\s+)?background|do\s+not\s+remove\s+(?:the\s+)?background)\b/i.test(clause)) {
      transparent = false; continue;
    }
    if (/透明(?:的)?(?:底|背景)|(?:[抠扣](?:掉|除|出)?|去(?:掉|除)?|移除|删除|消除|擦除).{0,12}(?:背景|底色|底)|(?:背景|底色).{0,12}(?:[抠扣]掉|去掉|去除|移除|删除|消除|擦除)|[抠扣]图|(?:不要|不需要|无需)背景|\bwithout\s+(?:a\s+)?background\b|\btransparent\s+background\b|\b(?:remove|erase|delete)\s+(?:the\s+)?background\b|\bbackground\s+removal\b/i.test(clause)) transparent = true;
  }
  return transparent ? 'transparent' : 'auto';
}
