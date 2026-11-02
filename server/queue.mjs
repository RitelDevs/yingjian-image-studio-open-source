import { GatewayError, readImageResult } from './gateway.mjs';
import { conversationContext } from './conversation-context.mjs';
import { buildChatRequest, chatPayload, parseChatAnswer } from './chat-planner.mjs';
import { createKeyProvider } from './editor/keys.mjs';
import { authorizeBoundSession, liveSession } from './editor/session.mjs';
import { runStyleOptimization } from './style-optimizer.mjs';

export function createQueue(store, gateway, concurrency = 2, ensureKey, { authorizeSession } = {}) {
  if (authorizeSession !== undefined && typeof authorizeSession !== 'function') throw new TypeError('Queue authorization must be a server function');
  ensureKey ??= createKeyProvider(store, gateway, { authorizeSession });
  const pending = [];
  const runningThreads = new Set();
  let active = 0, closing = false, closePromise;
  const drainWaiters = new Set();
  const drain = () => active || pending.length ? new Promise(resolve => drainWaiters.add(resolve)) : Promise.resolve();
  async function run(job) {
    let chat = false;
    const { id, referenceIds, prompt, size, count, groupId, aspectRatio = 'auto' } = job;
    try {
      store.updateMessage(id, 'running');
      const current = store.contextJob(id);
      if (!current) throw new GatewayError('创作记录已失效，请重新开始。', 400);
      const userId = current.userId;
      chat = current.kind === 'chat';
      let session = await authorizeBoundSession(store, authorizeSession, job.sessionHash, userId, { allowExpired: true });
      if (!authorizeSession && session.access_expires < Date.now() + 60_000 && session.refreshToken) {
        const predecessor = { accessToken: session.accessToken, refreshToken: session.refreshToken };
        const refreshed = await gateway.refresh(session.refreshToken);
        session = liveSession(store, job.sessionHash, userId, { allowExpired: true, token: predecessor.accessToken });
        if (session.refreshToken !== predecessor.refreshToken) throw new GatewayError('登录状态已变更，请重新登录后再试。', 401, false, 'authentication_changed');
        store.updateSession(session, {
          accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token || session.refreshToken,
          accessExpires: Date.now() + (Number(refreshed.expires_in) || 900) * 1000
        });
      }
      if (!session.accessToken || session.access_expires < Date.now()) {
        throw new GatewayError('等待期间登录已过期，本次任务尚未向上游提交生图。请退出后重新登录再试。', 401, false, 'authentication_expired');
      }
      let originalToken = session.accessToken;
      const user = await gateway.profile(originalToken, session.context);
      if (authorizeSession && (user?.id !== userId || user.status !== 'active')) throw new GatewayError('账号不可用，本次任务尚未向上游提交。', 403, false, 'account_unavailable');
      session = liveSession(store, job.sessionHash, userId, { token: originalToken });
      if (chat && current.context.styleOptimization?.mode === 'professional') {
        await runStyleOptimization({ store, gateway, ensureKey, current, session, authorizeSession });
        return;
      }
      const resolved = chat ? buildChatRequest(store, current) : conversationContext(store, current);
      store.setContext(id, resolved.context);
      let effectiveReferences = referenceIds;
      if (resolved.image) {
        effectiveReferences = (resolved.inheritedImages || [resolved.image]).map(image => store.addMedia(session.user_id, id, 'input', image.mime, image.bytes));
        store.setReferences(id, effectiveReferences);
      }
      if (authorizeSession) session = await authorizeBoundSession(store, authorizeSession, job.sessionHash, userId);
      const key = await ensureKey(session, groupId);
      const references = effectiveReferences.map((mediaId) => store.media(mediaId, session.user_id));
      if (references.some((item) => !item)) throw new GatewayError('参考图已过期，请重新上传。', 400);
      if (chat) {
        const settings = { size, count, aspectRatio, groupId };
        const payload = chatPayload(current.model, resolved.conversation, references, settings);
        if (authorizeSession) session = await authorizeBoundSession(store, authorizeSession, job.sessionHash, userId);
        originalToken = session.accessToken;
        liveSession(store, job.sessionHash, userId, { token: originalToken });
        const answer = parseChatAnswer(await gateway.converse(key, payload));
        const refreshed = store.getMessage(id, session.user_id);
        const proposal = answer.ready ? {
          prompt: answer.prompt, settings, referenceIds: refreshed.referenceIds,
          context: resolved.context
        } : null;
        if (store.styleRevocationCutoff(current.threadId, session.user_id) > (resolved.context.styleCutoff || 0)) {
          store.finishChat(id, '整理期间你取消了风格，本次回复已作废。请按当前描述重新发送。', null);
          return;
        }
        store.finishChat(id, answer.reply, proposal);
        return;
      }
      if (authorizeSession) session = await authorizeBoundSession(store, authorizeSession, job.sessionHash, userId);
      originalToken = session.accessToken;
      liveSession(store, job.sessionHash, userId, { token: originalToken });
      const answer = await gateway.generate(key, { prompt: resolved.prompt, size, count, references, aspectRatio });
      const images = Array.isArray(answer?.data) ? answer.data : [];
      let saved = 0;
      let saveFailures = 0;
      for (const image of images.slice(0, count)) {
        try {
          const item = await readImageResult(image);
          store.addMedia(session.user_id, id, 'output', item.mime, item.bytes);
          saved++;
        } catch {
          saveFailures++;
        }
      }
      if (!saved) {
        throw new GatewayError(saveFailures
          ? '上游返回了图片，但网站未能完整下载或保存。请勿立即重复提交，请联系管理员微信 panrui12 核对图片和扣费。'
          : '上游返回的结果中没有可用图片。请勿立即重复提交，请联系管理员微信 panrui12 核对结果和扣费。',
        502, true, saveFailures ? 'image_save_failed' : 'empty_image_result');
      }
      store.updateMessage(id, saved === count ? 'done' : 'partial', saved < count
        ? `完成 ${saved}/${count} 张。${saveFailures ? '其余图片未能完整下载或保存。' : '上游只返回了部分图片。'}已保留成功结果，不会自动补发请求；若账单与实际结果不符，请联系管理员微信 panrui12 核对。`
        : null);
    } catch (error) {
      const known = error instanceof GatewayError;
      const unknown = !known || error.uncertain === true;
      let message = known ? error.message : chat ? '对话处理遇到异常，尚未提交生图。请稍后再试。' : '网站处理生图任务时遇到异常，暂时无法确认结果。请勿立即重复提交，请联系管理员微信 panrui12 核对。';
      if (unknown && !message.includes('panrui12')) message += ' 请勿立即重复提交，请联系管理员微信 panrui12 核对结果和扣费。';
      if (known && error.reason === 'invalid_style_optimization') {
        const current = store.contextJob(id);
        if (current) store.setContext(id, { ...current.context, styleOptimizationFailure: { reason: error.reason, ...error.validation } });
      }
      store.updateMessage(id, unknown ? 'unknown' : 'failed', message);
      console.warn(JSON.stringify({ event: chat ? 'chat_turn_failed' : 'image_job_failed', jobId: id, reason: known ? error.reason : 'internal_error', status: known ? error.status : 500, uncertain: unknown, ...(error.networkCode ? { networkCode: error.networkCode } : {}), ...(error.validation ? { validation: error.validation } : {}) }));
    } finally {
      active--;
      runningThreads.delete(job.threadId);
      schedule();
    }
  }
  async function runTask(job) {
    try { await job.runTask(); }
    catch { console.warn(JSON.stringify({ event: 'background_task_failed' })); }
    finally { active--; runningThreads.delete(job.threadId); schedule(); }
  }
  function schedule() {
    while (active < concurrency && pending.length) {
      const index = pending.findIndex(job => !runningThreads.has(job.threadId));
      if (index < 0) break;
      const [job] = pending.splice(index, 1);
      runningThreads.add(job.threadId);
      active++;
      void (job.runTask ? runTask(job) : run(job));
    }
    if (!active && !pending.length) {
      for (const resolve of drainWaiters) resolve();
      drainWaiters.clear();
    }
  }
  return {
    drain,
    close() { closing = true; return closePromise ??= drain(); },
    enqueue(job) { if (closing) throw new GatewayError('服务正在停止。', 503); pending.push({ ...job, threadId: job.threadId || store.contextJob(job.id)?.threadId || job.id }); schedule(); },
    enqueueTask(key, runTask) { if (closing) throw new GatewayError('服务正在停止。', 503); pending.push({ threadId: key, runTask }); schedule(); },
    get limit() { return concurrency; },
    get active() { return active; },
    get waiting() { return pending.length; }
  };
}
