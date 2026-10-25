const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const key = userId => `studio-editor-origin:${userId}`;
export function normalizeEditorOrigin(documentId, source) {
  if (!ID.test(documentId || '')) return null;
  return { documentId, kind: ID.test(source?.threadId || '') ? 'conversation' : 'upload',
    ...(ID.test(source?.threadId || '') ? { threadId: source.threadId } : {}),
    ...(ID.test(source?.mediaId || source?.id || '') ? { mediaId: source.mediaId || source.id } : {}) };
}
export function readEditorOrigin(userId, documentId, storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage.getItem(key(userId)) || 'null');
    return value?.documentId === documentId ? normalizeEditorOrigin(documentId, value) : null;
  } catch { return null; }
}
export function saveEditorOrigin(userId, documentId, source, storage = globalThis.localStorage) {
  const value = normalizeEditorOrigin(documentId, source);
  try { if (value) storage.setItem(key(userId), JSON.stringify(value)); } catch { /* In-memory origin still works if storage is blocked. */ }
  return value;
}
