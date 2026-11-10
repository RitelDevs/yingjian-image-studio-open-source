export const DEFAULT_IMAGE_MODEL = 'gpt-image-2.5-sunburst';
export const IMAGE_MODEL_OPTIONS = Object.freeze([
  Object.freeze({ id: 'gpt-image-2.5-flare', label: 'Flare 2.5 · 快速' }),
  Object.freeze({ id: 'gpt-image-2.5-sunburst', label: 'Sunburst 2.5 · 强力' }),
  Object.freeze({ id: 'gpt-image-2.6-flare', label: 'Flare 2.6 · 快速' }),
  Object.freeze({ id: 'gpt-image-2.6-sunburst', label: 'Sunburst 2.6 · 强力' })
]);
export const imageModelLabel = id => IMAGE_MODEL_OPTIONS.find(item => item.id === id)?.label || id || 'Images 2.5（旧方案）';
