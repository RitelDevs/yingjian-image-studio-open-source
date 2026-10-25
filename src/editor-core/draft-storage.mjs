import { EditorError } from '../../shared/editor-contract.mjs';

export const DRAFT_DATABASE = 'yingjian-image-editor';
export function createDraftStorage(userId) {
  if ((typeof userId !== 'number' && typeof userId !== 'string') || !String(userId).trim() || String(userId).length > 128) throw new EditorError('本地草稿需要有效的账号编号。', 'invalid_account');
  const key = `account:${String(userId)}`;
  let opening, closed = false;
  function database() {
    if (closed) return Promise.reject(new EditorError('草稿存储已关闭。', 'disposed'));
    if (!opening) opening = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new EditorError('浏览器不支持本地草稿保存。', 'storage_unavailable')); return; }
      let rejected = false;
      const request = indexedDB.open(DRAFT_DATABASE, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts', { keyPath: 'key' });
      };
      request.onerror = () => reject(request.error || new Error('无法打开本地草稿。'));
      request.onblocked = () => { rejected = true; reject(new EditorError('本地草稿存储被其他页面占用，请关闭旧页面后重试。', 'storage_blocked')); };
      request.onsuccess = () => {
        const db = request.result;
        if (closed || rejected) { db.close(); if (closed) reject(new EditorError('草稿存储已关闭。', 'disposed')); return; }
        db.onversionchange = () => { db.close(); opening = null; };
        resolve(db);
      };
    }).catch(error => { opening = null; throw error; });
    return opening;
  }
  async function transaction(mode, work) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', mode), store = tx.objectStore('drafts');
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error || new Error('本地草稿操作中断。'));
      tx.onerror = () => {};
      const request = work(store);
      request.onsuccess = () => { result = request.result; };
    });
  }
  return {
    async read() { return (await transaction('readonly', store => store.get(key)))?.draft || null; },
    async save(draft) { await transaction('readwrite', store => store.put({ key, updatedAt: Date.now(), draft })); },
    async remove() { await transaction('readwrite', store => store.delete(key)); },
    async close() { closed = true; try { (await opening)?.close(); } catch {} }
  };
}
