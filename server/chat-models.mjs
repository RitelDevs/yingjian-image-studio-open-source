import { GatewayError } from './gateway.mjs';

// A deployment allowlist, not a claim that every upstream group serves every model.
export function createChatModelSelection(defaultModel, configured) {
  const values = configured ?? [defaultModel, 'gpt-6.1-sol'];
  if (!Array.isArray(values) || !values.length || values.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(id))) throw new Error('CHAT_MODELS must contain valid model IDs.');
  const models = [...new Set([defaultModel, ...values])];
  return { models, select(value) {
    if (value === undefined) return defaultModel;
    if (typeof value !== 'string' || !models.includes(value)) throw new GatewayError('所选对话模型不可用，请重新选择。', 400, false, 'chat_model_invalid');
    return value;
  } };
}
