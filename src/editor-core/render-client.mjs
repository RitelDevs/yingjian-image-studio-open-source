import { EditorError } from '../../shared/editor-contract.mjs';
import { createImageRenderer } from './renderer.mjs';

/** Worker RPC with a main-thread fallback for browsers without Worker/OffscreenCanvas. */
export function createRenderClient({ onFallback = () => {} } = {}) {
  let worker, fallback, disposed = false, sequence = 0;
  const requests = new Map(), originals = new Map(), fallbackLoads = new Map();
  const useFallback = () => {
    if (!fallback) { fallback = createImageRenderer(); onFallback('当前浏览器使用兼容图片处理模式，大图调整可能稍慢。'); }
    return fallback;
  };
  function failWorker() {
    worker?.terminate(); worker = null;
    for (const request of requests.values()) { clearTimeout(request.timer); request.reject(new EditorError('图片后台线程不可用。', 'worker_unavailable')); }
    requests.clear();
  }
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function') {
    try {
      worker = new Worker(new URL('./render.worker.js', import.meta.url), { type: 'module', name: 'yingjian-image-editor' });
      worker.onmessage = ({ data }) => {
        const pending = requests.get(data.id); if (!pending) return;
        clearTimeout(pending.timer); requests.delete(data.id);
        if (data.error) pending.reject(new EditorError(data.error.message, data.error.code)); else pending.resolve(data.result);
      };
      worker.onerror = event => { event.preventDefault?.(); failWorker(); };
      worker.onmessageerror = failWorker;
    } catch { worker = null; }
  }
  async function fallbackLoad(sourceId) {
    if (!originals.has(sourceId)) throw new EditorError('图片来源已变化。', 'stale_source');
    if (!fallbackLoads.has(sourceId)) {
      const task = useFallback().load(sourceId, originals.get(sourceId)).catch(error => { fallbackLoads.delete(sourceId); throw error; });
      fallbackLoads.set(sourceId, task);
    }
    return fallbackLoads.get(sourceId);
  }
  async function call(type, payload) {
    if (disposed) throw new EditorError('图片编辑器已关闭。', 'disposed');
    if (worker) {
      try {
        return await new Promise((resolve, reject) => {
          const id = ++sequence;
          const timer = setTimeout(() => failWorker(), 90_000);
          requests.set(id, { resolve, reject, timer });
          try { worker.postMessage({ id, type, payload }); }
          catch { failWorker(); }
        });
      } catch (error) { if (error.code !== 'worker_unavailable') throw error; }
    }
    if (disposed) throw new EditorError('图片编辑器已关闭。', 'disposed');
    if (type === 'load') return fallbackLoad(payload.sourceId);
    if (type === 'render') { await fallbackLoad(payload.sourceId); return useFallback().render(payload); }
  }
  return {
    async load(sourceId, blob) {
      originals.set(sourceId, blob);
      try { return await call('load', { sourceId, blob }); }
      catch (error) { originals.delete(sourceId); throw error; }
    },
    render: payload => call('render', payload),
    release(sourceId) {
      originals.delete(sourceId);
      const pending = fallbackLoads.get(sourceId); fallbackLoads.delete(sourceId);
      if (pending) void pending.then(() => fallback?.release(sourceId), () => {});
      else fallback?.release(sourceId);
      if (worker) void call('release', { sourceId }).catch(() => {});
    },
    dispose() {
      if (disposed) return;
      disposed = true; worker?.terminate(); worker = null;
      for (const request of requests.values()) { clearTimeout(request.timer); request.reject(new EditorError('图片编辑器已关闭。', 'disposed')); }
      requests.clear(); originals.clear(); fallbackLoads.clear(); fallback?.dispose();
    }
  };
}
