import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.mjs';
import { createGateway, GatewayError, sniffMime } from './gateway.mjs';
import { createQueue } from './queue.mjs';
import { createKeyProvider } from './editor/keys.mjs';
import { createEditorService } from './editor/service.mjs';
import { createSSO } from './sso.mjs';
import { VERSION } from '../shared/version.mjs';
import { resolveImageGeometry } from '../shared/image-geometry.mjs';
import { compileStyleRecipe, StyleRecipeError } from './style-recipes.mjs';
import { createStyleOptimizationSnapshot } from './style-optimizer.mjs';
import { normalizeStyleOptimization } from '../shared/style-optimization.mjs';

const APP_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CONTACT = '请联系管理员微信 panrui12。';

function send(res, status, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': body.length, ...headers });
  res.end(body);
}
async function parseJson(req, maxBytes = 48 * 1024 * 1024) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new GatewayError('请求格式无效。', 415);
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new GatewayError('上传内容超过 ' + Math.floor(maxBytes / 1024 / 1024) + ' MB。', 413);
    parts.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new GatewayError('请求内容无法读取。', 400); }
}
function sid(req, name = 'studio_sid') {
  return String(req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}
function groupList(response) {
  const list = Array.isArray(response) ? response : response?.groups || response?.items || response?.data || [];
  return Array.isArray(list) ? list.filter((item) => item?.platform === 'openai' && item.status !== 'inactive' && item.allow_image_generation !== false)
    .map((item) => ({ id: Number(item.id), name: item.name, rateMultiplier: Number(item.rate_multiplier ?? 1) }))
    .filter((item) => Number.isSafeInteger(item.id) && item.id > 0) : [];
}
function decodeUpload(value) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value || '');
  if (!match) throw new GatewayError('只支持 PNG、JPEG、WebP 参考图。', 400);
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 8 * 1024 * 1024 || bytes.length < 8 || sniffMime(bytes) !== match[1]) {
    throw new GatewayError('参考图无效或超过 8 MB。', 400);
  }
  return { mime: match[1], bytes };
}

export function createApplication(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || join(APP_ROOT, 'data');
  const demo = options.demo ?? (process.env.DEMO_MODE === '1' || process.argv.includes('--demo'));
  const integration = options.integration || null;
  if (integration && (demo || !Number.isSafeInteger(integration.maxJobs) || integration.maxJobs < 1)) throw new Error('Invalid integration configuration');
  const cookieName = options.cookieName || (integration ? 'studio_integration_sid' : 'studio_sid');
  const store = createStore(dataDir);
  const gateway = options.gateway || createGateway(process.env.GATEWAY_BASE_URL || 'http://127.0.0.1:8080', process.env.IMAGE_MODEL || 'gpt-image-2.5', demo);
  const chatModel = options.chatModel || process.env.CHAT_MODEL || 'gpt-6-luna';
  const publicOrigin = options.publicOrigin || process.env.PUBLIC_ORIGIN || '';
  const configuredOrigins = options.publicOrigins ?? (process.env.PUBLIC_ORIGINS ? process.env.PUBLIC_ORIGINS.split(',').map(value => value.trim()).filter(Boolean) : null);
  const publicOrigins = [...new Set(configuredOrigins || (publicOrigin ? [publicOrigin] : []))];
  for (const origin of configuredOrigins || []) { const url = new URL(origin); if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('PUBLIC_ORIGINS requires canonical HTTPS origins.'); }
  if (publicOrigin && !publicOrigins.includes(publicOrigin)) throw new Error('PUBLIC_ORIGIN must be in PUBLIC_ORIGINS.');
  function requestPublicOrigin(req) {
    if (!configuredOrigins) return publicOrigin || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;
    const origin = publicOrigins.find(value => new URL(value).host === req.headers.host);
    if (!origin) throw new GatewayError('当前网站域名未配置。', 403);
    return origin;
  }
  const sso = createSSO({ enabled: !demo && !integration && (options.ssoEnabled ?? process.env.SSO_ENABLED === '1'), publicOrigin, publicOrigins, requestPublicOrigin, store, gateway, sources: options.ssoSources ?? (process.env.SSO_SOURCES ? JSON.parse(process.env.SSO_SOURCES) : undefined) });
  const ensureKey = createKeyProvider(store, gateway);
  const queue = createQueue(store, gateway, Math.max(1, Math.min(10, Math.floor(Number(options.concurrency ?? process.env.JOB_CONCURRENCY) || 2))), ensureKey);
  const editor = createEditorService({ store, gateway, queue, ensureKey, chatModel, groupList });
  const cleanupTimer = setInterval(() => { store.cleanup(); editor.cleanup(); }, 60 * 60_000);
  cleanupTimer.unref();
  store.cleanup();
  editor.cleanup();

  function cookie(token) {
    return `${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${publicOrigin.startsWith('https:') ? '; Secure' : ''}`;
  }
  function checkTestAccount(user) {
    if (integration && user?.role !== 'admin') throw new GatewayError('这个入口仅供管理员账号联调，请使用管理员账号登录。', 403);
  }
  async function authenticated(req) {
    const row = store.session(sid(req, cookieName));
    if (!row) throw new GatewayError('请先登录。', 401);
    if (row.access_expires < Date.now() + 60_000 && row.refreshToken) {
      try {
        const refreshed = await gateway.refresh(row.refreshToken);
        store.updateSession(row, {
          accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token || row.refreshToken,
          accessExpires: Date.now() + (Number(refreshed.expires_in) || 900) * 1000
        });
      } catch { throw new GatewayError('登录已失效，请重新登录。', 401); }
    }
    if (row.access_expires <= Date.now()) throw new GatewayError('中转登录已过期，请重新连接中转账号。', 401);
    if (row.validated_at < Date.now() - 5 * 60_000) {
      const user = await gateway.profile(row.accessToken);
      if (!user || user.id !== row.user_id || user.status === 'disabled') throw new GatewayError('账号不可用。', 403);
      checkTestAccount(user);
      store.updateSession(row, { user });
    }
    return row;
  }
  function checkOrigin(req) {
    if (!['POST', 'DELETE', 'PUT', 'PATCH'].includes(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return;
    const expected = requestPublicOrigin(req);
    if (origin !== expected) throw new GatewayError('请求来源不匹配。', 403);
  }
  async function api(req, res, path) {
    if (path === '/api/health' && req.method === 'GET') return send(res, 200, { ok: true, version: VERSION, ...(options.previewId ? { previewId: options.previewId } : {}), queue: { active: queue.active, waiting: queue.waiting, limit: queue.limit } });
    if (path === '/api/config' && req.method === 'GET') return send(res, 200, { demo, version: VERSION, model: gateway.model, chatModel, integration, features: { styleOptimization: true }, ssoSources: sso.sourcesFor(requestPublicOrigin(req)) });
    if (path === '/api/login-config' && req.method === 'GET') { requestPublicOrigin(req); return send(res, 200, await gateway.loginConfig()); }
    if (await sso.handle(req, res, path, { send, parseJson, sessionCookie: cookie })) return;
    checkOrigin(req);
    if (path === '/api/login' && req.method === 'POST') {
      const input = await parseJson(req);
      const email = String(input.email || '').trim();
      if (!email || typeof input.password !== 'string' || !input.password) throw new GatewayError('请输入邮箱和密码。', 400);
      const turnstileToken = input.turnstileToken ?? '';
      if (typeof turnstileToken !== 'string' || turnstileToken.length > 2048) throw new GatewayError('人机验证凭证无效，请重新验证。', 400);
      const auth = await gateway.login(email, input.password, turnstileToken);
      if (auth?.requires_2fa) return send(res, 200, { requires2FA: true, tempToken: auth.temp_token });
      if (!auth?.access_token || !Number.isSafeInteger(auth?.user?.id)) throw new GatewayError('中转登录结果不完整。', 502);
      checkTestAccount(auth.user);
      const token = store.saveSession(auth.user, auth.access_token, auth.refresh_token, auth.expires_in);
      return send(res, 200, { user: auth.user }, { 'set-cookie': cookie(token) });
    }
    if (path === '/api/login/2fa' && req.method === 'POST') {
      const input = await parseJson(req);
      const auth = await gateway.login2FA(input.tempToken, input.code);
      if (!auth?.access_token || !Number.isSafeInteger(auth?.user?.id)) throw new GatewayError('验证码无效。', 401);
      checkTestAccount(auth.user);
      const token = store.saveSession(auth.user, auth.access_token, auth.refresh_token, auth.expires_in);
      return send(res, 200, { user: auth.user }, { 'set-cookie': cookie(token) });
    }
    if (path === '/api/demo-login' && req.method === 'POST') {
      if (!demo) throw new GatewayError('预览模式未开启。', 404);
      const auth = await gateway.login('demo', 'demo');
      const token = store.saveSession(auth.user, auth.access_token, null, auth.expires_in);
      return send(res, 200, { user: auth.user }, { 'set-cookie': cookie(token) });
    }
    const session = await authenticated(req);
    if (path === '/api/editor/chat' && req.method === 'POST') {
      if (integration) throw new GatewayError('管理员生图联调入口暂不提供编辑对话，请使用普通登录入口。', 403);
      const input = await parseJson(req, 12 * 1024 * 1024);
      const result = await editor.submit(session, input);
      return send(res, result.status, result.result);
    }
    const editorRequest = /^\/api\/editor\/chat\/([^/]+)$/.exec(path);
    if (editorRequest && req.method === 'GET') return send(res, 200, editor.get(session, editorRequest[1]));
    if (path === '/api/logout' && req.method === 'POST') {
      store.db.prepare('DELETE FROM sessions WHERE id_hash=?').run(session.id_hash);
      if (session.refreshToken) void gateway.logout(session.refreshToken).catch(() => {});
      return send(res, 200, { ok: true }, { 'set-cookie': cookie('') + '; Max-Age=0' });
    }
    if (path === '/api/me' && req.method === 'GET') {
      const user = await gateway.profile(session.accessToken);
      if (!user || user.id !== session.user_id || user.status === 'disabled') throw new GatewayError('账号不可用。', 403);
      checkTestAccount(user);
      store.updateSession(session, { user });
      const groups = groupList(await gateway.groups(session.accessToken));
      return send(res, 200, { user: { id: user.id, username: user.username, email: user.email, balance: user.balance }, groups, model: gateway.model, chatModel, demo, integration, features: { styleOptimization: true } });
    }
    if (path === '/api/threads' && req.method === 'GET') return send(res, 200, { threads: store.threads(session.user_id) });
    if (path === '/api/threads' && req.method === 'POST') return send(res, 201, { thread: store.createThread(session.user_id) });
    const threadMatch = /^\/api\/threads\/([a-f0-9-]{36})$/.exec(path);
    if (threadMatch) {
      const thread = store.thread(threadMatch[1], session.user_id);
      if (!thread) throw new GatewayError('找不到这段创作记录。', 404);
      if (req.method === 'GET') return send(res, 200, { thread: { id: thread.id, title: thread.title }, messages: store.messages(thread.id, session.user_id) });
      if (req.method === 'PATCH') {
        const input = await parseJson(req, 4096);
        const title = typeof input?.title === 'string' ? input.title.trim() : '';
        if (!title || title.length > 60 || /[\u0000-\u001f\u007f]/.test(title)) throw new GatewayError('会话名称请填写 1–60 个字符，不含换行或控制字符。', 400);
        const updated = store.transaction(() => store.renameThread(thread.id, session.user_id, title));
        if (!updated) throw new GatewayError('这段会话已删除或无法修改。', 404);
        return send(res, 200, { thread: updated });
      }
      if (req.method === 'DELETE') {
        if (store.messages(thread.id, session.user_id).some((message) => ['queued', 'running'].includes(message.status))) {
          throw new GatewayError('这段创作仍在生成，完成后再删除。', 409);
        }
        store.deleteThread(thread.id, session.user_id);
        return send(res, 200, { ok: true });
      }
    }
    const mediaMatch = /^\/api\/media\/([a-f0-9-]{36})$/.exec(path);
    if (mediaMatch && req.method === 'GET') {
      const item = store.media(mediaMatch[1], session.user_id);
      if (!item) throw new GatewayError('图片已过期或不存在。', 404);
      res.writeHead(200, { 'content-type': item.mime, 'content-length': item.bytes.length, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' });
      return res.end(item.bytes);
    }
    const revokeStyle = /^\/api\/style-selections\/([a-f0-9-]{36})\/revoke$/.exec(path);
    if (revokeStyle && req.method === 'POST') {
      // Tombstones also cancel a request that has not finished creating its plan yet.
      const result = store.transaction(() => store.revokeStyle(session.user_id, revokeStyle[1]));
      return send(res, 200, result);
    }
    if (path === '/api/style-plans' && req.method === 'POST') {
      if (integration) throw new GatewayError('管理员联调入口暂不提供风格方案，请使用本地预览或正式创作入口。', 403);
      const input = await parseJson(req);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new GatewayError('风格方案内容无效。', 400);
      let optimizationMode;
      try { optimizationMode = normalizeStyleOptimization(input.styleOptimization); }
      catch (error) { throw new GatewayError(error.message, 400); }
      const clientRequestId = input.clientRequestId;
      const styleSelectionId = input.styleSelectionId;
      if (styleSelectionId !== undefined && (typeof styleSelectionId !== 'string' || !/^[a-f0-9-]{36}$/i.test(styleSelectionId))) throw new GatewayError('风格选择编号无效。', 400);
      const assertStyleActive = () => {
        if (store.isStyleRevoked(session.user_id, styleSelectionId)) throw new GatewayError('这次风格选择已取消，请重新选择后再发送。', 409, false, 'style_revoked');
      };
      assertStyleActive();
      if (typeof clientRequestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(clientRequestId)) throw new GatewayError('请求编号无效。', 400);
      const repeated = () => {
        const previous = store.findRequest(session.user_id, clientRequestId);
        if (previous && (!(previous.proposal?.style || previous.context?.styleOptimization?.style) || previous.threadId !== input.threadId)) {
          throw new GatewayError('请求编号已被另一项创作使用，请重新提交。', 409);
        }
        return previous;
      };
      const duplicate = repeated();
      if (duplicate) return send(res, 200, { job: duplicate, duplicate: true });
      if (typeof input.threadId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.threadId)) throw new GatewayError('创作记录编号无效。', 400);
      const thread = store.thread(input.threadId, session.user_id);
      if (!thread) throw new GatewayError('请选择自己的创作记录。', 404);
      const count = Number(input.count ?? 1), groupId = Number(input.groupId), size = input.size ?? '2K';
      if (!Number.isInteger(count) || count < 1 || count > 4 || !['1K', '2K', '4K'].includes(size)) throw new GatewayError('图片数量或尺寸无效。', 400);
      let geometry;
      try { geometry = resolveImageGeometry(size, input.aspectRatio ?? 'auto'); }
      catch (error) { throw new GatewayError(error.message, 400); }
      if (input.references != null && !Array.isArray(input.references)) throw new GatewayError('参考图列表无效。', 400);
      const refs = input.references ?? [];
      if (refs.length > 4) throw new GatewayError('最多上传 4 张参考图。', 400);
      let compiled;
      try {
        compiled = compileStyleRecipe({ styleId: input.styleId, styleVersion: input.styleVersion,
          subject: input.subject, title: Object.hasOwn(input, 'title') ? input.title : '', hasReferences: refs.length > 0 });
      } catch (error) {
        if (error instanceof StyleRecipeError) throw new GatewayError(error.message, error.status, false, error.reason);
        throw error;
      }
      const groups = groupList(await gateway.groups(session.accessToken));
      if (!groups.some(item => item.id === groupId)) throw new GatewayError(`当前账号不能使用所选生图分组。${CONTACT}`, 403);
      // Another request or a deletion may have completed while permissions were checked.
      assertStyleActive();
      const existing = repeated();
      if (existing) return send(res, 200, { job: existing, duplicate: true });
      if (!store.thread(thread.id, session.user_id)) throw new GatewayError('创作记录已删除，请重新开始。', 404);
      let totalSize = 0;
      const parsed = refs.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw new GatewayError('参考图无效。', 400);
        let image;
        if (item.mediaId) {
          image = store.media(item.mediaId, session.user_id);
          if (!image || !['input', 'output'].includes(image.kind)) throw new GatewayError('参考图片已过期或不属于当前账号，请重新上传。', 400);
        } else image = decodeUpload(item.dataUrl);
        totalSize += image.bytes.length;
        return { mime: image.mime, bytes: image.bytes };
      });
      if (totalSize > 24 * 1024 * 1024) throw new GatewayError('参考图总量超过 24 MB。', 413);
      const optimizationSnapshot = optimizationMode === 'professional' ? createStyleOptimizationSnapshot({
        compiled, subject: (input.subject ?? '').trim(), title: (input.title ?? '').trim(), model: chatModel, demo, styleSelectionId
      }) : null;
      const context = { enabled: false, ...(optimizationSnapshot ? { styleOptimization: optimizationSnapshot } : {}) };
      const settings = { size, count, aspectRatio: geometry.aspectRatio, groupId };
      const subject = (input.subject ?? '').trim() || `参考图套用：${compiled.style.name}`, title = (input.title ?? '').trim();
      const job = store.transaction(() => {
        const record = store.createMessage(session.user_id, thread.id, {
          clientRequestId, prompt: subject + (title ? `\n标题：${title}` : ''), model: optimizationSnapshot ? chatModel : gateway.model, kind: 'chat', ...settings, context
        });
        const referenceIds = parsed.map(item => store.addMedia(session.user_id, record.id, 'input', item.mime, item.bytes));
        store.setReferences(record.id, referenceIds);
        store.supersedePlans(thread.id, session.user_id);
        if (!optimizationSnapshot) store.finishChat(record.id, compiled.summary, {
          prompt: compiled.prompt, settings, referenceIds, context, style: compiled.style, styleInput: { subject, title }, ...(styleSelectionId ? { styleSelectionId } : {})
        });
        return store.getMessage(record.id, session.user_id);
      });
      if (optimizationSnapshot) queue.enqueue({ id: job.id, threadId: thread.id, sessionHash: session.id_hash,
        referenceIds: job.referenceIds, prompt: job.prompt, ...settings });
      return send(res, optimizationSnapshot ? 202 : 201, { job: store.getMessage(job.id, session.user_id), duplicate: false });
    }
    const confirmation = /^\/api\/plans\/([a-f0-9-]{36})\/confirm$/.exec(path);
    if (confirmation && req.method === 'POST') {
      const input = await parseJson(req);
      if (input.confirmed !== true) throw new GatewayError('请先查看方案，再点击确认生成。', 400);
      const id = confirmation[1];
      let plan = store.contextJob(id);
      if (!plan || plan.userId !== session.user_id || plan.kind !== 'chat' || !plan.proposal) throw new GatewayError('找不到可确认的生图方案。', 404);
      const existing = plan.proposal.jobId && store.getMessage(plan.proposal.jobId, session.user_id);
      if (existing) return send(res, 200, { job: existing, plan: store.getMessage(id, session.user_id), duplicate: true });
      if (plan.proposal.style && store.isStyleRevoked(session.user_id, plan.proposal.styleSelectionId || id)) throw new GatewayError('该风格已取消，请重新整理生成方案。', 409, false, 'style_revoked');
      if (plan.proposal.state !== 'ready') throw new GatewayError('这份方案已被后续对话更新，请确认最新方案。', 409);
      if (plan.proposal.style && Object.hasOwn(input, 'prompt') && input.prompt !== plan.proposal.prompt) {
        throw new GatewayError('风格方案已锁定，请修改内容后重新查看生成方案。', 409);
      }
      const prompt = plan.proposal.style ? plan.proposal.prompt : (typeof input.prompt === 'string' ? input.prompt.trim() : plan.proposal.prompt);
      if (!prompt || prompt.length > 4000) throw new GatewayError('确认提示词须为 1～4000 字。', 400);
      const groups = groupList(await gateway.groups(session.accessToken));
      // Re-read after awaiting the gateway: a new chat or another confirmation may have won the race.
      plan = store.contextJob(id);
      if (!plan || plan.userId !== session.user_id) throw new GatewayError('方案已过期，请重新整理。', 404);
      if (plan.proposal.jobId) return send(res, 200, { job: store.getMessage(plan.proposal.jobId, session.user_id), plan: store.getMessage(id, session.user_id), duplicate: true });
      if (plan.proposal.style && store.isStyleRevoked(session.user_id, plan.proposal.styleSelectionId || id)) throw new GatewayError('该风格已取消，请重新整理生成方案。', 409, false, 'style_revoked');
      if (plan.proposal.state !== 'ready') throw new GatewayError('这份方案已被后续对话更新，请确认最新方案。', 409);
      const { size, count, aspectRatio, groupId } = plan.proposal.settings;
      if (!groups.some(item => item.id === groupId)) throw new GatewayError('当前账号不能使用该方案的生图分组，请重新选择分组并整理方案。', 403);
      const images = plan.proposal.referenceIds.map(mediaId => store.media(mediaId, session.user_id));
      if (images.some(item => !item)) throw new GatewayError('方案中的参考图已过期，请重新上传后整理方案。', 400);
      if (images.reduce((n, item) => n + item.bytes.length, 0) > 24 * 1024 * 1024) throw new GatewayError('参考图总量超过 24 MB。', 413);
      const job = store.transaction(() => {
        const record = store.createMessage(session.user_id, plan.threadId, {
          clientRequestId: `confirmed-plan:${id}`, prompt, model: gateway.model, size, count, aspectRatio, groupId,
          context: { ...plan.proposal.context, planId: id, ...(plan.proposal.style ? { style: plan.proposal.style } : {}), ...(plan.proposal.optimization ? { optimization: plan.proposal.optimization } : {}) }
        });
        const references = images.map(item => store.addMedia(session.user_id, record.id, 'input', item.mime, item.bytes));
        store.setReferences(record.id, references); store.markConfirmed(id, record.id, prompt);
        return store.getMessage(record.id, session.user_id);
      });
      queue.enqueue({ id: job.id, threadId: plan.threadId, sessionHash: session.id_hash, referenceIds: job.referenceIds, prompt, size, count, groupId, aspectRatio });
      return send(res, 202, { job: store.getMessage(job.id, session.user_id), plan: store.getMessage(id, session.user_id), duplicate: false });
    }
    if ((path === '/api/jobs' || path === '/api/chat') && req.method === 'POST') {
      const chat = path === '/api/chat';
      if (chat && integration) throw new GatewayError('管理员联调入口暂不提供对话，请使用正式对话入口。', 403);

      const input = await parseJson(req);
      const clientRequestId = String(input.clientRequestId || '');
      if (!/^[a-f0-9-]{36}$/i.test(clientRequestId)) throw new GatewayError('请求编号无效。', 400);
      const duplicate = store.findRequest(session.user_id, clientRequestId);
      if (duplicate) return send(res, 200, { job: duplicate, duplicate: true });
      const thread = store.thread(input.threadId, session.user_id);
      if (!thread) throw new GatewayError('请选择创作记录。', 404);
      if (input.useContext != null && typeof input.useContext !== 'boolean') throw new GatewayError('上下文设置无效。', 400);
      const context = { enabled: chat ? input.useContext !== false : input.useContext === true };
      if (context.enabled && Object.hasOwn(input, 'contextParentId')) {
        if (input.contextParentId !== null) {
          if (typeof input.contextParentId !== 'string') throw new GatewayError('上下文记录无效。', 400);
          const parent = store.getMessage(input.contextParentId, session.user_id);
          if (!parent || parent.threadId !== thread.id || !['done','partial'].includes(parent.status) || !parent.images.length
            || !store.media(parent.images[0].id, session.user_id)) throw new GatewayError('所选上下文不属于当前会话或已过期。', 400);
        }
        context.parentId = input.contextParentId;
      }
      const prompt = String(input.prompt || '').trim();
      const count = Number(input.count || 1), groupId = Number(input.groupId), size = String(input.size || '2K');
      if (!prompt || prompt.length > 4000) throw new GatewayError('提示词长度应在 1 到 4000 字之间。', 400);
      if (!Number.isInteger(count) || count < 1 || count > 4 || !['1K', '2K', '4K'].includes(size)) throw new GatewayError('图片数量或尺寸无效。', 400);
      let geometry;
      try { geometry = resolveImageGeometry(size, input.aspectRatio ?? 'auto'); }
      catch (error) { throw new GatewayError(error.message, 400); }
      if (integration && count !== 1) throw new GatewayError('本轮联调每次只生成 1 张图片。', 400);
      const groups = groupList(await gateway.groups(session.accessToken));
      if (!groups.some((item) => item.id === groupId)) throw new GatewayError(`当前账号不能使用所选生图分组。${CONTACT}`, 403);
      const refs = Array.isArray(input.references) ? input.references : [];
      if (refs.length > 4) throw new GatewayError('最多上传 4 张参考图。', 400);
      let totalSize = 0;
      const parsed = refs.map((item) => {
        if (!item || typeof item !== 'object') throw new GatewayError('参考图无效。', 400);
        if (item.mediaId) {
          const old = store.media(item.mediaId, session.user_id);
          if (!old || !['input', 'output'].includes(old.kind)) throw new GatewayError('参考图片已过期，请重新上传。', 400);
          totalSize += old.bytes.length;
          return { mime: old.mime, bytes: old.bytes };
        }
        const image = decodeUpload(item.dataUrl);
        totalSize += image.bytes.length;
        return image;
      });
      if (totalSize > 24 * 1024 * 1024) throw new GatewayError('参考图总量超过 24 MB。', 413);
      const existing = store.findRequest(session.user_id, clientRequestId);
      if (existing) return send(res, 200, { job: existing, duplicate: true });
      if (integration && store.db.prepare('SELECT count(*) AS n FROM messages').get().n >= integration.maxJobs) {
        throw new GatewayError(`本轮 ${integration.maxJobs} 个测试请求已用完，请先核对结果和扣费后再继续。`, 429);
      }
      const message = store.createMessage(session.user_id, thread.id, { clientRequestId, prompt, model: chat ? chatModel : gateway.model, kind: chat ? 'chat' : 'image', count, size, groupId, aspectRatio: geometry.aspectRatio, context });
      if (chat) store.supersedePlans(thread.id, session.user_id);
      try {
        const referenceIds = parsed.map((item) => store.addMedia(session.user_id, message.id, 'input', item.mime, item.bytes));
        store.setReferences(message.id, referenceIds);
        queue.enqueue({ id: message.id, threadId: thread.id, sessionHash: session.id_hash, referenceIds, prompt, size, count, groupId, aspectRatio: geometry.aspectRatio });
      } catch (error) {
        store.updateMessage(message.id, 'failed', '保存参考图失败，请重试。');
        throw error;
      }
      return send(res, 202, { job: store.getMessage(message.id, session.user_id), duplicate: false });
    }
    const jobMatch = /^\/api\/jobs\/([a-f0-9-]{36})$/.exec(path);
    if (jobMatch && req.method === 'GET') {
      const job = store.getMessage(jobMatch[1], session.user_id);
      if (!job) throw new GatewayError('找不到生成任务。', 404);
      return send(res, 200, { job });
    }
    throw new GatewayError('页面不存在。', 404);
  }
  const dist = options.distDir ? resolve(options.distDir) : join(APP_ROOT, 'dist');
  const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    try {
      if (path.startsWith('/api/')) return await api(req, res, path);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new GatewayError('页面不存在。', 404);
      const target = resolve(dist, `.${path === '/' ? '/index.html' : path}`);
      const file = target.startsWith(dist + sep) && (() => { try { return statSync(target).isFile(); } catch { return false; } })() ? target : join(dist, 'index.html');
      const bytes = readFileSync(file);
      res.writeHead(200, { 'content-type': mimeTypes[extname(file)] || 'application/octet-stream', 'content-length': bytes.length, 'cache-control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=86400' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (res.headersSent) return res.end();
      const known = error instanceof GatewayError;
      send(res, known ? error.status : 500, { error: known ? error.message : '服务暂时不可用，请联系管理员微信 panrui12。' });
    }
  });
  return { server, store, queue, editor, close: () => { clearInterval(cleanupTimer); editor.close(); store.close(); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApplication();
  const port = Number(process.env.PORT) || 8788;
  const host = process.env.HOST || '127.0.0.1';
  app.server.listen(port, host, () => console.log(`Image studio ready at http://${host}:${port}`));
}
