import { EditorError, DEFAULT_ADJUSTMENTS, DEFAULT_TRANSFORM, applyOperations, validateEditorState, validateOperations } from '../../shared/editor-contract.mjs';
import { createEditorHistory, assertEditContext } from './history.mjs';
import { createRenderClient } from './render-client.mjs';
import { createDraftStorage } from './draft-storage.mjs';
import { validateImageBlob, normalizeImageName } from './image-input.mjs';

const EMPTY_HISTORY = Object.freeze([]);
export const EMPTY_EDITOR_SNAPSHOT = Object.freeze({ document: null, previewUrl: '', originalUrl: '', history: EMPTY_HISTORY,
  canUndo: false, canRedo: false, busy: false, rendering: false, restoring: true, saving: false,
  error: '', notice: '', hasPendingPreview: false, previewWidth: 0, previewHeight: 0 });
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new EditorError('无法读取图片快照。', 'snapshot_failed')); reader.readAsDataURL(blob);
  });
}
function readonlyDocument(input) {
  const state = validateEditorState(input);
  Object.freeze(state.adjustments); Object.freeze(state.transform); if (state.crop) Object.freeze(state.crop);
  return Object.freeze(state);
}

/** Framework-independent controller. Inject renderer/storage for deterministic integration tests. */
export function createEditorController({ userId, renderer: suppliedRenderer, storage: suppliedStorage, createObjectURL = blob => URL.createObjectURL(blob), revokeObjectURL = url => URL.revokeObjectURL(url) }) {
  const storage = suppliedStorage || createDraftStorage(userId);
  const listeners = new Set();
  let snapshot = EMPTY_EDITOR_SNAPSHOT, engine = null, original = null, sourceId = null;
  let renderer = suppliedRenderer, transient = null, pendingOperations = null;
  let started = false, disposed = false, startPromise, loadVersion = 0, renderVersion = 0;
  let previewGesture = 0;
  let previewInFlight = false, previewRequested = false, previewScheduled = false, previewTicket = 0;
  let savingSequence = 0, saveChain = Promise.resolve(), leases = 0;
  let workCount = 0;
  function update(values) {
    if (disposed) return;
    snapshot = Object.freeze({ ...snapshot, ...values });
    for (const listener of listeners) listener();
  }
  function imageRenderer() {
    if (!renderer) renderer = createRenderClient({ onFallback: notice => update({ notice }) });
    return renderer;
  }
  function assertLive() { if (disposed) throw new EditorError('图片编辑器已关闭。', 'disposed'); }
  function assertImage() { assertLive(); if (!engine || !original) throw new EditorError('请先打开一张图片。', 'no_image'); }
  function publish() {
    update({ document: transient || engine?.document || null, history: engine ? Object.freeze(engine.history) : EMPTY_HISTORY,
      canUndo: engine?.canUndo || false, canRedo: engine?.canRedo || false, hasPendingPreview: Boolean(transient) });
  }
  function work(delta) { workCount = Math.max(0, workCount + delta); update({ busy: workCount > 0 }); }
  function revoke(url) { if (url) revokeObjectURL(url); }
  function errorMessage(error, fallback) { return error?.message || fallback; }
  function persist() {
    if (!engine || !original || disposed) return;
    const saved = { schemaVersion: 1, original, history: engine.serialize() }, sequence = ++savingSequence;
    update({ saving: true });
    saveChain = saveChain.catch(() => {}).then(() => storage.save(saved)).then(() => {
      if (sequence === savingSequence) update({ saving: false });
    }).catch(() => {
      if (sequence === savingSequence) update({ saving: false, notice: '本地草稿未能保存，可能是浏览器空间不足。你仍可继续编辑并导出图片。' });
    });
  }
  function schedulePreview() {
    renderVersion++; previewRequested = true;
    update({ rendering: true });
    if (previewInFlight || previewScheduled || disposed) return;
    previewScheduled = true;
    const callback = () => { previewScheduled = false; previewTicket = 0; void processPreview(); };
    if (typeof requestAnimationFrame === 'function') previewTicket = requestAnimationFrame(callback);
    else queueMicrotask(callback);
  }
  async function processPreview() {
    if (disposed || !engine || !sourceId || !previewRequested || previewInFlight) return;
    previewRequested = false; previewInFlight = true;
    const version = renderVersion, document = transient || engine.document, capturedSource = sourceId;
    const interactive = Boolean(transient), gesture = previewGesture;
    try {
      const result = await imageRenderer().render({ sourceId: capturedSource, state: document, maxEdge: interactive ? 768 : 1600, format: 'png' });
      // During one uncommitted gesture, show completed intermediate frames instead of
      // starving the preview until the pointer stops. Never cross image/commit/cancel boundaries.
      const sameGesture = interactive && transient && gesture === previewGesture
        && engine?.document.revision === document.revision;
      if (disposed || capturedSource !== sourceId || (version !== renderVersion && !sameGesture)) return;
      const previewUrl = createObjectURL(result.blob), oldUrl = snapshot.previewUrl;
      update({ previewUrl, previewWidth: result.width, previewHeight: result.height, rendering: previewRequested }); revoke(oldUrl);
    } catch (error) {
      if (!disposed && version === renderVersion) update({ rendering: false, error: errorMessage(error, '图片预览失败，请重试。') });
    } finally {
      previewInFlight = false;
      if (!disposed && previewRequested) void processPreview();
    }
  }
  function install(blob, id, nextEngine) {
    const previousSource = sourceId, previousOriginal = snapshot.originalUrl, previousPreview = snapshot.previewUrl;
    engine = nextEngine; original = blob; sourceId = id; transient = null; pendingOperations = null;
    update({ originalUrl: createObjectURL(blob), previewUrl: '', previewWidth: 0, previewHeight: 0, error: '', restoring: false });
    publish(); schedulePreview(); revoke(previousOriginal); revoke(previousPreview);
    if (previousSource && previousSource !== id) imageRenderer().release(previousSource);
  }
  async function restore() {
    const token = loadVersion;
    let loadedSource;
    try {
      const saved = await storage.read();
      if (disposed || token !== loadVersion || !saved) return;
      if (saved.schemaVersion !== 1 || !saved.history) throw new EditorError('草稿格式无效。');
      const state = validateEditorState(saved.history.document), validated = await validateImageBlob(saved.original);
      if (validated.mime !== state.mime) throw new EditorError('草稿图片格式不一致。');
      if (disposed || token !== loadVersion) return;
      const dimensions = await imageRenderer().load(state.documentId, validated.blob); loadedSource = state.documentId;
      if (disposed || token !== loadVersion) { renderer?.release(loadedSource); return; }
      if (dimensions.width !== state.width || dimensions.height !== state.height) throw new EditorError('草稿图片尺寸不一致。');
      const restored = createEditorHistory(state, saved.history);
      install(validated.blob, state.documentId, restored); loadedSource = null;
    } catch (error) {
      if (loadedSource) renderer?.release(loadedSource);
      if (!disposed && token === loadVersion) update({ notice: `未能恢复本地草稿：${errorMessage(error, '草稿不可用')} 你可以重新打开图片。` });
    } finally { if (!disposed && token === loadVersion) update({ restoring: false }); }
  }
  const api = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start() {
      assertLive();
      if (!started) { started = true; startPromise = restore(); }
      return startPromise;
    },
    // Delayed disposal survives React StrictMode's setup-cleanup-setup cycle.
    acquire() {
      assertLive(); leases++; void api.start();
      let released = false;
      return () => { if (released) return; released = true; leases--; queueMicrotask(() => { if (!leases) api.dispose(); }); };
    },
    async loadImage(input, { name } = {}) {
      assertLive(); const token = ++loadVersion;
      const id = crypto.randomUUID(); let loaded = false;
      work(1); update({ error: '', restoring: false });
      try {
        const { blob, mime } = await validateImageBlob(input);
        if (disposed || token !== loadVersion) throw new EditorError('已切换到另一张图片。', 'stale_source');
        const dimensions = await imageRenderer().load(id, blob); loaded = true;
        if (disposed || token !== loadVersion) throw new EditorError('已切换到另一张图片。', 'stale_source');
        const document = { documentId: id, revision: 0, ...dimensions, name: normalizeImageName(name ?? input.name), mime,
          adjustments: { ...DEFAULT_ADJUSTMENTS }, transform: { ...DEFAULT_TRANSFORM }, crop: null };
        const nextEngine = createEditorHistory(document);
        install(blob, id, nextEngine); loaded = false; persist(); return nextEngine.document;
      } catch (error) {
        if (loaded) renderer?.release(id);
        if (!disposed && token === loadVersion) update({ error: errorMessage(error, '图片载入失败。') });
        throw error;
      } finally { work(-1); }
    },
    previewOperations(operations) {
      assertImage();
      const validated = validateOperations(operations, engine.document);
      if (validated.some(item => ['undo', 'redo'].includes(item.type))) throw new EditorError('撤销和重做不能用作临时预览。');
      const next = applyOperations(engine.document, validated);
      if (!transient) previewGesture++;
      transient = readonlyDocument({ ...next, revision: engine.document.revision }); pendingOperations = validated;
      update({ error: '' }); publish(); schedulePreview(); return transient;
    },
    cancelPreview() {
      assertLive(); if (!transient) return engine?.document || null;
      transient = null; pendingOperations = null; publish(); schedulePreview(); return engine.document;
    },
    commitOperations(operations = pendingOperations || [], options = {}) {
      assertImage(); assertEditContext(engine.document, options);
      if (options.actor === 'ai' && transient) throw new EditorError('你正在手动调整图片，这轮 AI 调整未应用。', 'stale_revision');
      const before = engine.document;
      const result = engine.commit(operations, options);
      const hadPreview = Boolean(transient); transient = null; pendingOperations = null;
      update({ error: '' }); publish();
      if (result !== before || hadPreview) schedulePreview();
      if (result !== before) persist();
      return result;
    },
    undo(options = {}) { return api.commitOperations([{ type: 'undo' }], options); },
    redo(options = {}) { return api.commitOperations([{ type: 'redo' }], options); },
    async getAiSnapshot() {
      assertImage();
      if (transient) throw new EditorError('请先完成当前滑块或裁剪调整，再发送给 AI。', 'preview_pending');
      const state = engine.document, capturedSource = sourceId;
      const result = await imageRenderer().render({ sourceId: capturedSource, state, maxEdge: 1024, format: 'jpeg', quality: .88 });
      assertLive();
      const previewDataUrl = await blobToDataUrl(result.blob); assertLive();
      return { documentId: state.documentId, baseRevision: state.revision, state: validateEditorState(state), previewDataUrl };
    },
    async exportImage({ format = 'png', quality = .92 } = {}) {
      assertImage();
      if (transient) throw new EditorError('请先完成当前调整，再导出图片。', 'preview_pending');
      const state = engine.document, capturedSource = sourceId;
      work(1); update({ error: '' });
      try {
        const result = await imageRenderer().render({ sourceId: capturedSource, state, maxEdge: 0, format, quality });
        assertLive(); return result.blob;
      } catch (error) { update({ error: errorMessage(error, '图片导出失败。') }); throw error; }
      finally { work(-1); }
    },
    async flush() { await saveChain; },
    clearError() { update({ error: '' }); },
    clearNotice() { update({ notice: '' }); },
    dispose() {
      if (disposed) return;
      disposed = true; loadVersion++; renderVersion++; listeners.clear();
      if (previewTicket && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(previewTicket);
      renderer?.dispose(); revoke(snapshot.originalUrl); revoke(snapshot.previewUrl);
      engine = null; original = null; transient = null; pendingOperations = null; sourceId = null;
      void saveChain.finally(() => storage.close?.());
    }
  };
  return api;
}
