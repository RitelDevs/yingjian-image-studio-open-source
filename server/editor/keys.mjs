import { GatewayError } from '../gateway.mjs';
import { authorizeBoundSession } from './session.mjs';

// One provider per application, shared by image and editor queues.
export function createKeyProvider(store, gateway, { authorizeSession } = {}) {
  if (authorizeSession !== undefined && typeof authorizeSession !== 'function') throw new TypeError('Key authorization must be a server function');
  const pending = new Map();
  async function authorized(session) {
    if (authorizeSession) session = await authorizeBoundSession(store, authorizeSession, session.id_hash, session.user_id);
    return session;
  }
  async function inspect(session, groupId) {
    session = await authorized(session);
    const existing = store.getKey(session.user_id, groupId);
    const result = state => ({ state, groupId, keyId: existing?.keyId ?? null });
    if (store.keyCreationPending(session.user_id, groupId)) return result('unknown');
    if (!existing) return result('unlinked');
    if (!Number.isSafeInteger(existing.keyId) || existing.keyId < 1) return result('invalid');
    let key;
    try { key = await gateway.getKey(session.accessToken, existing.keyId, session.context); }
    catch (error) {
      if (error instanceof GatewayError && error.reason === 'key_not_found') return result('deleted');
      throw error;
    }
    if (key?.id !== existing.keyId || key.user_id !== session.user_id || typeof key.key !== 'string' ||
        !Array.isArray(key.group_ids) && !Number.isSafeInteger(key.group_id)) {
      throw new GatewayError('暂时无法检查生图连接，请稍后重新检查。', 503, false, 'key_check_unavailable');
    }
    if (key.key !== existing.key) return result('invalid');
    if (key.status === 'inactive' || key.status === 'disabled') return result('disabled');
    if (key.status === 'expired') return result('expired');
    if (key.status !== 'active') return result('limited');
    if (key.expires_at) {
      const expires = Date.parse(key.expires_at);
      if (!Number.isFinite(expires)) throw new GatewayError('暂时无法检查生图连接，请稍后重新检查。', 503, false, 'key_check_unavailable');
      if (expires <= Date.now()) return result('expired');
    }
    if (!(Array.isArray(key.group_ids) ? key.group_ids : [key.group_id]).includes(groupId)) return result('group_changed');
    return result('ready');
  }
  function failure(state) {
    const detail = { deleted: '生图 Key 已被删除，请点击“重新连接生图”。', disabled: '生图 Key 已被停用，请在控制台重新启用后检查连接，或明确选择新建 Key。',
      expired: '生图 Key 已过期，请在控制台调整有效期，或点击“重新连接生图”。', group_changed: '生图 Key 的分组已改变，请在控制台恢复分组，或重新连接生图。',
      invalid: '生图 Key 与保存的连接不一致，请重新连接生图。', limited: '生图 Key 当前不可用，请在控制台检查状态和额度后重新检查。',
      unknown: '创建生图连接的结果待核对，请联系管理员微信 panrui12；不会重复创建 Key。' }[state];
    return new GatewayError(detail, 409, false, 'studio_key_' + state);
  }
  async function create(session, groupId) {
    session = await authorized(session);
    if (store.keyCreationPending(session.user_id, groupId)) throw failure('unknown');
    store.beginKeyCreation(session.user_id, groupId);
    let created;
    try { created = await gateway.createKey(session.accessToken, groupId, session.context); }
    catch (error) {
      // A timeout/5xx may follow a successful write. Preserve the intent across
      // restarts instead of creating a second credential on a later click.
      if (error instanceof GatewayError && error.status >= 400 && error.status < 500 && !error.uncertain) {
        store.finishKeyCreation(session.user_id, groupId);
        throw error;
      }
      throw failure('unknown');
    }
    if (typeof created?.key !== 'string' || created.key.length < 16 || !Number.isSafeInteger(created.id) || created.id < 1) throw failure('unknown');
    store.transaction(() => {
      store.putKey(session.user_id, groupId, created.key, created.id);
      store.finishKeyCreation(session.user_id, groupId);
    });
    return { state: 'ready', groupId, keyId: created.id };
  }
  function serialized(session, groupId, operation) {
    const id = session.user_id + ':' + groupId;
    if (!pending.has(id)) pending.set(id, operation().finally(() => pending.delete(id)));
    return pending.get(id);
  }
  async function ensureKey(session, groupId) {
    session = await authorized(session);
    await serialized(session, groupId, async () => {
      const connection = await inspect(session, groupId);
      if (connection.state === 'unlinked') return create(session, groupId);
      if (connection.state !== 'ready') throw failure(connection.state);
      return connection;
    });
    return store.getKey(session.user_id, groupId).key;
  }
  ensureKey.inspect = inspect;
  ensureKey.reconnect = async (session, groupId, expectedKeyId) => {
    session = await authorized(session);
    return serialized(session, groupId, async () => {
      const connection = await inspect(session, groupId);
      if (connection.state === 'ready') return connection;
      if (connection.state === 'unknown' || connection.state === 'limited') throw failure(connection.state);
      if (connection.keyId !== expectedKeyId) throw new GatewayError('生图连接已变化，请重新检查后操作。', 409, false, 'key_connection_changed');
      return create(session, groupId);
    });
  };
  return ensureKey;
}
