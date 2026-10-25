import { EditorError, validateEditorState, validateOperations, applyOperations, sameEdits, nextRevision, describeOperations, isDocumentId } from '../../shared/editor-contract.mjs';

export const HISTORY_LIMIT = 100;
const clone = value => structuredClone(value);
function frozenState(input) {
  const state = validateEditorState(input);
  Object.freeze(state.adjustments); Object.freeze(state.transform);
  if (state.crop) Object.freeze(state.crop);
  return Object.freeze(state);
}
function metadata(options, operations) {
  const actor = options.actor ?? 'manual';
  if (!['manual', 'ai'].includes(actor)) throw new EditorError('编辑来源无效。');
  return Object.freeze({ id: crypto.randomUUID(), actor, label: String(options.label || describeOperations(operations)).slice(0, 200), createdAt: Date.now() });
}
export function assertEditContext(state, options = {}) {
  if (options.actor === 'ai' && (!isDocumentId(options.documentId) || !Number.isSafeInteger(options.baseRevision))) {
    throw new EditorError('AI 操作缺少图片版本信息。', 'invalid_context');
  }
  if ((options.documentId !== undefined && options.documentId !== state.documentId)
    || (options.baseRevision !== undefined && options.baseRevision !== state.revision)) {
    throw new EditorError('图片已经变化，这轮 AI 调整未应用。', 'stale_revision');
  }
}
export function createEditorHistory(initialState, saved = null) {
  let current = frozenState(initialState);
  let frames = [{ state: current, entry: metadata({ label: '导入图片' }, []) }], cursor = 0;
  if (saved) {
    if (saved.schemaVersion !== 1 || !Array.isArray(saved.frames) || !saved.frames.length || saved.frames.length > HISTORY_LIMIT + 1
      || !Number.isInteger(saved.cursor) || saved.cursor < 0 || saved.cursor >= saved.frames.length) throw new EditorError('草稿编辑历史无效。', 'invalid_draft');
    frames = saved.frames.map(frame => {
      const state = frozenState(frame.state), entry = frame.entry;
      if (state.documentId !== current.documentId || state.width !== current.width || state.height !== current.height
        || state.mime !== current.mime || state.name !== current.name || state.revision > current.revision
        || !entry || !isDocumentId(entry.id) || !['manual', 'ai'].includes(entry.actor)
        || typeof entry.label !== 'string' || entry.label.length > 200 || !Number.isSafeInteger(entry.createdAt) || entry.createdAt < 0) {
        throw new EditorError('草稿编辑历史无效。', 'invalid_draft');
      }
      return { state, entry: Object.freeze({ id: entry.id, label: entry.label, actor: entry.actor, createdAt: entry.createdAt }) };
    });
    cursor = saved.cursor;
    if (!sameEdits(current, frames[cursor].state)) throw new EditorError('草稿状态与编辑历史不一致。', 'invalid_draft');
  }
  const api = {
    get document() { return current; },
    get canUndo() { return cursor > 0; },
    get canRedo() { return cursor < frames.length - 1; },
    get history() { return frames.map((frame, index) => Object.freeze({ ...frame.entry, isCurrent: index === cursor, undone: index > cursor })); },
    commit(operations, options = {}) {
      assertEditContext(current, options);
      const validated = validateOperations(operations, current);
      if (validated[0]?.type === 'undo') return api.undo(options);
      if (validated[0]?.type === 'redo') return api.redo(options);
      const next = frozenState(applyOperations(current, validated));
      if (sameEdits(current, next)) return current;
      const entry = metadata(options, validated);
      frames = frames.slice(0, cursor + 1);
      frames.push({ state: next, entry });
      if (frames.length > HISTORY_LIMIT + 1) frames = frames.slice(-(HISTORY_LIMIT + 1));
      cursor = frames.length - 1; current = next;
      return current;
    },
    undo(options = {}) {
      assertEditContext(current, options);
      if (cursor === 0) return current;
      const revision = nextRevision(current.revision);
      cursor--; current = frozenState({ ...frames[cursor].state, revision });
      return current;
    },
    redo(options = {}) {
      assertEditContext(current, options);
      if (cursor === frames.length - 1) return current;
      const revision = nextRevision(current.revision);
      cursor++; current = frozenState({ ...frames[cursor].state, revision });
      return current;
    },
    serialize() { return { schemaVersion: 1, document: clone(current), frames: clone(frames), cursor }; }
  };
  return api;
}
