import { createHash } from 'node:crypto';
import { GatewayError, sniffMime } from '../gateway.mjs';
import { ADJUSTMENT_DEFINITIONS, EDITOR_PRESETS, EditorError, validateEditorState, validateOperations } from '../../shared/editor-contract.mjs';

export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_IMAGE = 8 * 1024 * 1024;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = message => new GatewayError(message, 400, false, 'invalid_editor_request');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  return object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
}

export function validateEditorRequest(input) {
  if (!object(input)) throw invalid('编辑请求内容无效。');
  for (const key of ['clientRequestId', 'documentId']) {
    if (typeof input[key] !== 'string' || !UUID.test(input[key])) throw invalid('图片或请求编号无效。');
  }
  if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0) throw invalid('编辑版本无效。');
  if (!Number.isSafeInteger(input.groupId) || input.groupId < 1) throw invalid('请选择有效的计费分组。');
  if (typeof input.message !== 'string' || !input.message.trim() || input.message.length > 4000) throw invalid('编辑要求应为 1 到 4000 字。');
  let state;
  try { state = validateEditorState(input.state); }
  catch { throw invalid('当前图片参数无效，请重新载入图片后再试。'); }
  if (state.documentId !== input.documentId || state.revision !== input.baseRevision) throw invalid('图片编号或版本与当前参数不一致。');
  if (input.history !== undefined) {
    if (!Array.isArray(input.history) || input.history.length > 200 || input.history.some(item =>
      !object(item) || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || item.content.length > 12000)) {
      throw invalid('编辑对话历史无效。');
    }
  }
  const preview = input.previewDataUrl;
  if (typeof preview !== 'string' || preview.length > Math.ceil(MAX_IMAGE / 3) * 4 + 64) {
    throw invalid('请提供 8 MB 以内的当前画面预览。');
  }
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(preview);
  if (!match) throw invalid('预览只支持 PNG、JPEG、WebP 图片数据。');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 8 || bytes.length > MAX_IMAGE || bytes.toString('base64') !== match[2] || sniffMime(bytes) !== match[1]) {
    throw invalid('预览图片内容无效或超过 8 MB。');
  }
  const normalized = { clientRequestId: input.clientRequestId, documentId: input.documentId,
    baseRevision: input.baseRevision, groupId: input.groupId, message: input.message.trim(), state, previewDataUrl: preview };
  return { ...normalized, inputHash: createHash('sha256').update(JSON.stringify(stable(normalized))).digest('hex') };
}

// Only display trusted validator messages and finite numeric values, never raw model fields/code.
function receivedNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? '，AI 返回了 ' + value : '，AI 返回的值不是有效数字';
}

function explainOperationError(operation, error) {
  const adjustment = operation?.type === 'setAdjustments' && ADJUSTMENT_DEFINITIONS.find(item => error.message === item.label + '超出允许范围。');
  if (adjustment) return adjustment.label + '只能在 ' + adjustment.min + '～' + adjustment.max + ' 之间' + receivedNumber(operation.values?.[adjustment.key]) + '。';
  if (error.message === '旋转角度只能为 0、90、180 或 270 度。') {
    return '旋转角度只能为 0、90、180 或 270 度' + receivedNumber(operation.values?.rotation) + '。';
  }
  if (error.message === '没有找到这个图片预设。') return 'AI 指定的预设不存在；可用预设为' + EDITOR_PRESETS.map(item => item.label).join('、') + '。';
  if (error.message === '不支持这项编辑操作。') return '该操作不受支持；当前只支持调色、预设、旋转翻转、裁剪、复位、撤销和重做。';
  if (error.message === '裁剪区域不能超出图片边界。') return '裁剪区域超出图片边界，请缩小选区或将选区移回图片内。';
  const cropField = operation?.type === 'setCrop' && [
    ['x', '裁剪横坐标', '0～1'], ['y', '裁剪纵坐标', '0～1'],
    ['width', '裁剪宽度', '大于 0 且不超过 1'], ['height', '裁剪高度', '大于 0 且不超过 1']
  ].find(([, label]) => error.message === label + '超出允许范围。');
  if (cropField) return cropField[1] + '应为' + cropField[2] + '（按图片尺寸的比例计算）' + receivedNumber(operation.crop?.[cropField[0]]) + '。';
  return error.message;
}

function explainRejectedBatch(operations, error) {
  if (!(error instanceof EditorError)) return '编辑操作校验出现异常，请稍后再试。';
  // Reuse A's validator to locate the first bad operation; no second validation policy.
  for (let index = 0; index < operations.length; index++) {
    try { validateOperations([operations[index]]); }
    catch (itemError) {
      if (!(itemError instanceof EditorError)) return '编辑操作校验出现异常，请稍后再试。';
      return '第 ' + (index + 1) + ' 项操作：' + explainOperationError(operations[index], itemError);
    }
  }
  // Cross-operation errors, e.g. undo combined with adjustments, belong to the whole batch.
  return error.message;
}

export function parseEditorAnswer(text, state) {
  const fail = message => new GatewayError('AI 编辑结果未通过：' + message + ' 本轮全部操作未应用，图片保持不变。', 502, false, 'invalid_editor_answer');
  if (typeof text !== 'string' || !text.trim()) throw fail('没有返回编辑结果。');
  if (text.length > 24_000) throw fail('编辑结果超过 24000 字符，无法处理。');
  let answer;
  try { answer = JSON.parse(text.trim().replace(/^\x60{3}(?:json)?\s*|\s*\x60{3}$/g, '')); }
  catch { throw fail('返回内容不是可读取的 JSON 格式。'); }
  if (!object(answer)) throw fail('返回内容必须包含回复文字和操作列表。');
  if (typeof answer.reply !== 'string' || !answer.reply.trim()) throw fail('缺少有效的回复文字。');
  if (answer.reply.length > 6000) throw fail('回复文字超过 6000 字符。');
  // The existing gateway returns this shape for content-policy refusals.
  const operations = answer.operations ?? (answer.ready === false && !answer.prompt ? [] : undefined);
  if (!Array.isArray(operations)) throw fail('缺少操作列表，或操作列表格式不正确。');
  if (operations.length > 32) throw fail('一次最多支持 32 项操作，AI 返回了 ' + operations.length + ' 项。');
  if (operations.length === 0) return { reply: answer.reply.trim(), operations: [] };
  try { return { reply: answer.reply.trim(), operations: validateOperations(operations, state) }; }
  catch (error) { throw fail(explainRejectedBatch(operations, error)); }
}
