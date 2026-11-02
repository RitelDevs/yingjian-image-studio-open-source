import { GatewayError } from '../gateway.mjs';

export function liveSession(store, hash, userId, { allowExpired = false, token } = {}) {
  const session = store.sessionByHash(hash);
  if (!session || !Number.isSafeInteger(userId) || userId < 1 || session.user_id !== userId || session.id_hash !== hash ||
      (!allowExpired && (!session.accessToken || !Number.isFinite(session.access_expires) || session.access_expires <= Date.now()))) {
    throw new GatewayError('登录已失效，本次任务尚未向上游提交。请重新登录后再试。', 401, false, 'authentication_expired');
  }
  if (token !== undefined && session.accessToken !== token) {
    throw new GatewayError('登录状态已变更，本次任务尚未向上游提交。请重新登录后再试。', 401, false, 'authentication_changed');
  }
  return session;
}

// Rebind the native token centrally before checking local expiry; read back to
// reject a logout or identity change while authorization was in flight.
export async function authorizeBoundSession(store, authorizeSession, hash, userId, options = {}) {
  if (!authorizeSession) return liveSession(store, hash, userId, options);
  const authorized = await authorizeSession(hash, userId);
  if (!authorized || authorized.user_id !== userId || authorized.id_hash !== hash || !authorized.accessToken) {
    throw new GatewayError('中央账号验证失败，请重新登录后再试。', 401, false, 'central_session_unavailable');
  }
  return liveSession(store, hash, userId, { token: authorized.accessToken });
}
