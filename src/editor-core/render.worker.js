import { createImageRenderer } from './renderer.mjs';

const renderer = createImageRenderer();
self.onmessage = async ({ data }) => {
  const { id, type, payload } = data;
  try {
    let result;
    if (type === 'load') result = await renderer.load(payload.sourceId, payload.blob);
    else if (type === 'render') result = await renderer.render(payload);
    else if (type === 'release') result = renderer.release(payload.sourceId);
    else throw new Error('未知图片处理请求。');
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: { message: error.message || '图片处理失败。', code: error.code || 'render_failed' } });
  }
};
