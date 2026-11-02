import { GatewayError } from '../gateway.mjs';
import { authorizeBoundSession, liveSession } from './session.mjs';
import { createEditorStore } from './store.mjs';
import { editorPayload } from './planner.mjs';
import { UUID, parseEditorAnswer, validateEditorRequest } from './validation.mjs';

const CONTACT = '如需核对对话费用，请联系管理员微信 panrui12。';
const MAX_PENDING_PER_USER = 10;

export function createEditorService({ store, gateway, queue, ensureKey, chatModel, groupList, authorizeSession }) {
  if (authorizeSession !== undefined && typeof authorizeSession !== 'function') throw new TypeError('Editor authorization must be a server function');
  const records = createEditorStore(store);
  let closed = false, closing = false, closePromise;
  const pendingTasks = new Set();
  const drain = () => Promise.all([...pendingTasks]).then(() => undefined);

  function duplicate(userId, input) {
    const old = records.findRequest(userId, input.clientRequestId);
    if (!old) return null;
    if (old.expires_at <= Date.now()) throw new GatewayError('这次编辑请求已过期，请从当前画面重新发起。', 410, false, 'editor_expired');
    if (old.input_hash !== input.inputHash) throw new GatewayError('这个请求编号已用于另一份编辑内容，请勿复用。', 409, false, 'editor_request_conflict');
    return { status: 200, result: { ...records.publicResult(old), duplicate: true } };
  }

  async function run(id, userId, sessionHash) {
    if (closed) return;
    if (!records.markRunning(userId, id)) return;
    let upstreamStarted = false;
    try {
      const request = records.byId(userId, id);
      if (!request) throw new GatewayError('编辑请求已过期。', 410, false, 'editor_expired');
      let session = await authorizeBoundSession(store, authorizeSession, sessionHash, userId, { allowExpired: true });
      if (!authorizeSession && session.access_expires < Date.now() + 60_000 && session.refreshToken) {
        const predecessor = { accessToken: session.accessToken, refreshToken: session.refreshToken };
        const refreshed = await gateway.refresh(session.refreshToken);
        if (closed) return;
        session = liveSession(store, sessionHash, userId, { allowExpired: true, token: predecessor.accessToken });
        if (session.refreshToken !== predecessor.refreshToken) throw new GatewayError('登录状态已变更，请重新登录后再试。', 401, false, 'authentication_changed');
        store.updateSession(session, { accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token || session.refreshToken,
          accessExpires: Date.now() + (Number(refreshed.expires_in) || 900) * 1000 });
      }
      if (!session.accessToken || session.access_expires <= Date.now()) throw new GatewayError('等待期间登录已过期，本次编辑对话未提交。', 401, false, 'authentication_expired');
      let originalToken = session.accessToken;
      const user = await gateway.profile(originalToken, session.context);
      session = liveSession(store, sessionHash, userId, { token: originalToken });
      if (!user || user.id !== userId || (authorizeSession ? user.status !== 'active' : user.status === 'disabled')) throw new GatewayError('账号不可用，本次编辑对话未提交。', 403, false, 'editor_account');
      if (authorizeSession) session = await authorizeBoundSession(store, authorizeSession, sessionHash, userId);
      const groups = groupList(await gateway.groups(session.accessToken, session.context));
      if (!groups.some(item => item.id === request.group_id)) throw new GatewayError('当前账号已不能使用所选分组，本次编辑对话未提交。', 403, false, 'editor_group');
      if (closed) return;
      if (authorizeSession) session = await authorizeBoundSession(store, authorizeSession, sessionHash, userId);
      const key = await ensureKey(session, request.group_id);
      if (closed) return;
      const payload = editorPayload(request.model, request, records.history(userId, request.document_id, id));
      // Recheck after key creation, immediately before the single paid call.
      session = await authorizeBoundSession(store, authorizeSession, sessionHash, userId);
      originalToken = session.accessToken;
      liveSession(store, sessionHash, userId, { token: originalToken });
      upstreamStarted = true;
      const raw = await gateway.converse(key, payload, { purpose: 'editor' });
      if (closed) return;
      const answer = parseEditorAnswer(raw, JSON.parse(request.state_json));
      records.finish(userId, id, { status: 'done', ...answer });
    } catch (error) {
      if (closed) return;
      const known = error instanceof GatewayError;
      const uncertain = known ? error.uncertain === true : upstreamStarted;
      const reason = known ? error.reason : 'editor_internal';
      let message = known ? error.message : upstreamStarted
        ? '编辑对话结果暂时无法确认，画面未由本次请求修改，请勿立即重复发送。'
        : '编辑对话未能提交，画面保持不变。';
      if (uncertain && !message.includes('panrui12')) message += ' ' + CONTACT;
      records.finish(userId, id, { status: uncertain ? 'unknown' : 'failed', error: message, reason });
      console.warn(JSON.stringify({ event: 'editor_chat_failed', requestId: id, status: uncertain ? 'unknown' : 'failed', reason }));
    }
  }

  return {
    records,
    async submit(session, raw) {
      if (closing) throw new GatewayError('编辑服务正在关闭，请稍后再试。', 503);
      const input = validateEditorRequest(raw);
      const repeated = duplicate(session.user_id, input);
      if (repeated) return repeated;
      const userId = session.user_id, sessionHash = session.id_hash;
      if (authorizeSession) session = await authorizeBoundSession(store, authorizeSession, sessionHash, userId);
      const groups = groupList(await gateway.groups(session.accessToken, session.context));
      if (authorizeSession) session = await authorizeBoundSession(store, authorizeSession, sessionHash, userId);
      if (!groups.some(item => item.id === input.groupId)) throw new GatewayError('当前账号不能使用所选编辑对话分组。', 403, false, 'editor_group');
      // The first request can have finished while this one awaited the gateway.
      if (closing) throw new GatewayError('编辑服务正在关闭，请稍后再试。', 503);
      const latest = duplicate(session.user_id, input);
      if (latest) return latest;
      if (records.pendingCount(session.user_id) >= MAX_PENDING_PER_USER) throw new GatewayError('待处理编辑对话过多，请等当前请求完成。', 429, false, 'editor_queue_full');
      const row = store.transaction(() => records.create(session.user_id, input, chatModel));
      let finish;
      const task = new Promise(resolve => { finish = resolve; });
      pendingTasks.add(task);
      const complete = () => { pendingTasks.delete(task); finish(); };
      try {
        queue.enqueueTask('editor:' + userId + ':' + input.documentId, async () => {
          try { await run(row.id, userId, sessionHash); } finally { complete(); }
        });
      } catch (error) {
        complete();
        if (records.markRunning(userId, row.id)) records.finish(userId, row.id, { status: 'failed', error: '服务正在停止，本次编辑对话未提交。', reason: 'editor_closing' });
        throw error;
      }
      return { status: 202, result: { ...records.publicResult(row), duplicate: false } };
    },
    get(session, id) {
      if (!UUID.test(id)) throw new GatewayError('找不到这次编辑对话。', 404, false, 'editor_not_found');
      const byId = records.byId(session.user_id, id);
      const candidate = records.findRequest(session.user_id, id);
      const byClientId = candidate?.expires_at > Date.now() ? candidate : null;
      // Recover a lost POST acknowledgement using the client UUID without a second paid request.
      if (byId && byClientId && byId.id !== byClientId.id) throw new GatewayError('请求编号存在歧义，请联系管理员核对。', 409, false, 'editor_request_conflict');
      const row = byId || byClientId;
      if (!row) throw new GatewayError('找不到这次编辑对话，或记录已过期。', 404, false, 'editor_not_found');
      return records.publicResult(row);
    },
    cleanup(now) { records.cleanup(now); },
    drain,
    close() {
      closing = true;
      if (closePromise) return closePromise;
      const finish = () => { records.close(); closed = true; };
      // After queue.close(), finish synchronously before the caller closes SQLite.
      if (!pendingTasks.size) { finish(); return closePromise = Promise.resolve(); }
      return closePromise = drain().then(finish);
    }
  };
}
