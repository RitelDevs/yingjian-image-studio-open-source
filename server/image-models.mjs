import { GatewayError } from './gateway.mjs';
import { IMAGE_MODEL_OPTIONS, imageModelLabel } from '../shared/image-models.mjs';

export function createImageModelSelection(defaultModel, configured) {
  const ids = configured ?? [defaultModel, ...IMAGE_MODEL_OPTIONS.map(item => item.id)];
  if (!Array.isArray(ids) || !ids.length || [defaultModel, ...ids].some(id => typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(id))) throw new Error('IMAGE_MODELS must contain valid model IDs.');
  const allowed = [...new Set([defaultModel, ...ids])];
  return { models: allowed.map(id => ({ id, label: imageModelLabel(id) })), select(value) {
    if (value === undefined) return defaultModel;
    if (typeof value !== 'string' || !allowed.includes(value)) throw new GatewayError('所选生图模型不可用，请重新选择并整理方案。', 400, false, 'image_model_invalid');
    return value;
  }, stored(value) {
    // Plans made before model selection used exactly this legacy gateway model.
    return value === undefined ? 'gpt-image-2.5' : this.select(value);
  } };
}
