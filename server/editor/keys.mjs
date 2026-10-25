import { GatewayError } from '../gateway.mjs';

// One provider per application, shared by image and editor queues.
export function createKeyProvider(store, gateway) {
  const pending = new Map();
  return async function ensureKey(session, groupId) {
    const existing = store.getKey(session.user_id, groupId);
    if (existing) return existing.key;
    const id = session.user_id + ':' + groupId;
    if (!pending.has(id)) pending.set(id, (async () => {
      const created = await gateway.createKey(session.accessToken, groupId);
      if (typeof created?.key !== 'string' || created.key.length < 16) {
        throw new GatewayError('中转没有返回可用的个人 API Key。', 502, false, 'key_unavailable');
      }
      store.putKey(session.user_id, groupId, created.key, created.id);
      return created.key;
    })().finally(() => pending.delete(id)));
    return pending.get(id);
  };
}
