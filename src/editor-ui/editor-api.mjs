import { call } from '../studio-api.js';
import { ADJUSTMENT_DEFINITIONS, EDITOR_PRESETS } from '../../shared/editor-contract.mjs';

const labels = Object.fromEntries(ADJUSTMENT_DEFINITIONS.map(item => [item.key, item.label]));
const presets = Object.fromEntries(EDITOR_PRESETS.map(item => [item.id, item.label]));

export function operationSummary(operations = []) {
  return operations.flatMap(operation => {
    if (operation.type === 'setAdjustments') return Object.entries(operation.values || {}).map(([key, value]) => `${labels[key] || key} ${value > 0 ? '+' : ''}${value}`);
    if (operation.type === 'applyPreset') return [`${presets[operation.presetId] || operation.presetId}预设`];
    return [{ setTransform: '调整方向', setCrop: '调整裁剪', reset: '恢复原图', undo: '撤销上一步', redo: '重做上一步' }[operation.type] || '调整图片'];
  }).join(' · ');
}

export function normalizeReply(value) {
  const result = value?.request || value?.job || value;
  if (!result || typeof result !== 'object') throw new Error('未收到有效回复，请稍后查询请求状态。');
  return { ...result, requestId: result.requestId || result.id };
}

export async function submitEditorChat(input, signal, request = call) {
  return normalizeReply(await request('/api/editor/chat', { method: 'POST', body: JSON.stringify(input), signal }));
}

export async function readEditorChat(requestId, signal, request = call) {
  return normalizeReply(await request(`/api/editor/chat/${encodeURIComponent(requestId)}`, { signal }));
}

export function canApplyReply(result, state, hasPendingPreview = false) {
  return Boolean(state && !hasPendingPreview && result.documentId === state.documentId && result.baseRevision === state.revision);
}

export function boundedChatHistory(entries = []) {
  let chars = 0;
  const kept = [];
  for (const entry of entries.slice().reverse()) {
    if (!entry.reply || !['applied', 'not-applied', 'replied'].includes(entry.status)) continue;
    const content = entry.message + entry.reply;
    if (kept.length >= 12 || chars + content.length > 16000) break;
    kept.unshift({ role: 'user', content: entry.message }, {
      role: 'assistant', content: `${entry.reply}\n编辑操作${entry.status === 'applied' ? '已应用' : '未应用'}。${entry.summary || ''}`
    });
    chars += content.length;
  }
  return kept;
}
