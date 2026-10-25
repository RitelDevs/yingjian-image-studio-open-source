import { GatewayError } from './gateway.mjs';

export const CONTEXT_TURNS = 6;
export const CONTEXT_CHARACTERS = 12000;

function usable(message) {
  return message && ['done', 'partial'].includes(message.status) && message.images.length > 0;
}

// History is resolved on the server from this account and thread only, never from client text.
export function conversationContext(store, current) {
  if (current.context.planId) return { prompt: current.prompt, context: current.context, image: null };
  if (!current.context.enabled) return { prompt: current.prompt, context: { enabled: false }, image: null };
  const userId = current.userId;
  const explicitParent = Object.hasOwn(current.context, 'parentId');
  const parent = explicitParent
    ? (current.context.parentId ? store.contextParent(current.id, userId, current.context.parentId) : null)
    : store.contextParent(current.id, userId);
  if (explicitParent && current.context.parentId && !usable(parent)) {
    throw new GatewayError('所选上下文已过期或无法使用，请重新选择图片，或新建创作重新开始。', 400, false, 'context_unavailable');
  }
  if (!parent) return { prompt: current.prompt, context: { enabled: true, parentId: null, turnIds: [] }, image: null };

  const history = [], seen = new Set();
  let cursor = parent, characters = 0;
  while (usable(cursor) && history.length < CONTEXT_TURNS && !seen.has(cursor.id)) {
    if (characters + cursor.prompt.length > CONTEXT_CHARACTERS) break;
    history.unshift(cursor); seen.add(cursor.id); characters += cursor.prompt.length;
    // An independent generation starts a new branch, including when made in an older thread.
    if (!cursor.context.enabled || !cursor.context.parentId) break;
    cursor = store.contextParent(cursor.id, userId, cursor.context.parentId);
  }

  let image = null;
  if (!current.referenceIds.length) {
    // For a turn with multiple images, pick the first displayed result; the user may select another.
    image = store.media(parent.images[0].id, userId);
    if (!image) throw new GatewayError('上一轮图片已过期，请重新上传参考图，或新建创作重新开始。', 400, false, 'context_unavailable');
  }
  const prompt = [
    '请继续同一创作会话。下方历史仅用于理解当前修改对象和已确认的创作要求；与历史冲突时，以本轮要求为准。不要把说明文字画进图片。',
    current.referenceIds.length ? '本轮提供的参考图优先作为修改对象。' : '所附参考图是上一轮选定的生成结果，请基于它继续修改。',
    '历史用户要求（按先后顺序）：',
    ...history.map((turn, index) => `第 ${index + 1} 轮：${JSON.stringify(turn.prompt)}`),
    '本轮用户要求：', current.prompt
  ].join('\n\n');
  return { prompt, image, context: { enabled: true, parentId: parent.id, turnIds: history.map(turn => turn.id), imageId: image?.id || null } };
}
