import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { resolveImageGeometry } from '../shared/image-geometry.mjs';
import { demoEditorAnswer } from './editor/demo.mjs';

export class GatewayError extends Error {
  constructor(message, status = 502, uncertain = false, reason = 'gateway_error') {
    super(message);
    this.status = status;
    this.uncertain = uncertain;
    this.reason = reason;
  }
}

// Account operations have their own errors; never describe a login as an image request.
export function classifyAccountFailure(status, body, path) {
  const login = path === '/api/v1/auth/login';
  const twoFactor = path === '/api/v1/auth/login/2fa';
  const signingIn = login || twoFactor;
  const code = String(body?.reason || body?.error?.code || body?.error?.type || body?.code || '');
  const detail = String(body?.error?.message || (typeof body?.error === 'string' ? body.error : '') || body?.message || '');
  const reason = `${code} ${detail}`;
  if (status === 429 || /RATE_LIMIT|TOO_MANY_(?:ATTEMPTS|REQUESTS)|尝试过于频繁|请求过于频繁/i.test(reason)) {
    return new GatewayError(signingIn ? '登录尝试过于频繁，请稍后再试。' : '账户请求过于频繁，请稍后再试。', 429, false, 'account_rate_limited');
  }
  if (status >= 500 || status === 408) {
    return new GatewayError(signingIn ? '登录服务暂时不可用，请稍后重试。' : '账户服务暂时不可用，请稍后重试。', 502, false, 'account_unavailable');
  }
  if (signingIn && /turnstile|captcha|人机验证/i.test(reason)) {
    return new GatewayError('人机验证未通过或已过期，请重新完成验证后登录。', 400, false, 'login_verification_required');
  }
  if (signingIn && /ACCOUNT_(?:DISABLED|SUSPENDED|LOCKED)|USER_(?:DISABLED|SUSPENDED|INACTIVE)|(?:account|user).{0,20}(?:disabled|suspended|locked|inactive)|账号.{0,10}(?:禁用|停用|冻结|锁定)/i.test(reason)) {
    return new GatewayError('账号暂不可用，请联系管理员微信 panrui12 检查。', 403, false, 'account_disabled');
  }
  if (twoFactor) {
    if (/TEMP_TOKEN|(?:token|session).{0,20}(?:expired|invalid)|(?:expired|invalid).{0,20}(?:token|session)|登录.{0,10}过期/i.test(reason)) {
      return new GatewayError('本次登录验证已过期，请刷新页面后重新登录。', 401, false, 'login_challenge_expired');
    }
    if ([400, 401].includes(status) || /TOTP|(?:invalid|incorrect|expired).{0,20}(?:code|otp)|验证码/i.test(reason)) {
      return new GatewayError('两步验证码不正确或已过期，请重新输入。', 400, false, 'login_code_invalid');
    }
  }
  if (login && (status === 401 || /INVALID_(?:CREDENTIALS|PASSWORD|EMAIL_OR_PASSWORD)|AUTHENTICATION_FAILED|(?:invalid|incorrect|wrong).{0,30}(?:credentials|password)|(?:password|密码).{0,12}(?:invalid|incorrect|wrong|不正确|错误)|邮箱或密码|用户名或密码/i.test(reason))) {
    return new GatewayError('邮箱或密码不正确，请检查后重试。', 401, false, 'login_credentials_invalid');
  }
  if (signingIn) {
    if (status === 403) return new GatewayError('当前账号无法登录，请联系管理员微信 panrui12 检查。', 403, false, 'login_access_denied');
    return new GatewayError('登录未成功，请检查填写的信息后重试。', 400, false, 'login_rejected');
  }
  if (status === 401) return new GatewayError('登录已过期，请重新登录。', 401, false, 'authentication_expired');
  if (status === 403) return new GatewayError('当前账号没有此操作的权限，请联系管理员微信 panrui12 检查。', 403, false, 'account_access_denied');
  return new GatewayError('账户操作未完成，请稍后重试；仍失败时联系管理员微信 panrui12。', 400, false, 'account_request_rejected');
}

export function classifyFailure(status, body) {
  const detail = String(body?.error?.message || body?.message || '');
  const code = String(body?.error?.code || body?.error?.type || body?.code || '');
  const moderation = /^(content_policy_violation|content_filter|content_filtered|safety_violation|moderation_blocked)$/i.test(code)
    || /content[_ -]policy[_ -]violation|safety system|blocked by.{0,30}(safety|moderation|content filter)|violat(?:e|es|ed|ion).{0,35}(content|safety).{0,15}polic|内容.{0,15}(审核未通过|未通过审核|违规|被拦截)|违禁词|色情|不符合.{0,10}(内容|安全).{0,5}(政策|规则)|moderation.{0,15}(blocked|rejected)|NSFW.{0,20}(blocked|rejected|detected)/i.test(detail);
  const billing = '若发现余额已扣除，请联系管理员微信 panrui12 核对。';
  const pending = '请勿立即重复提交，请联系管理员微信 panrui12 核对结果和扣费。';
  if (moderation) return new GatewayError(`提示词或参考图未通过内容审核，本次未生成图片。请修改内容后重试；${billing}`, 400, false, 'content_refused');
  if (status === 400 && /unknown parameter.{0,20}(?:tools\[\d+\]\.n|['"]n['"])|only.{0,12}(?:n\s*=\s*1|one image)|n.{0,8}must be 1|不支持.{0,8}(?:多张|批量)/i.test(detail)) {
    return new GatewayError(`当前生图线路不支持一次生成多张图片。请将张数改为 1 张后再试。${billing}`, 400, false, 'batch_unsupported');
  }
  if (status === 429) {
    if (/usage limit|insufficient_quota|quota|额度|配额/i.test(`${code} ${detail}`)) {
      return new GatewayError(`上游生图服务的可用额度已达到限制。请稍后再试，或联系管理员微信 panrui12 处理线路额度。${billing}`, 429, false, 'upstream_quota');
    }
    return new GatewayError(`上游生图请求过于频繁，已触发限流。请稍后再试。${billing}`, 429, false, 'rate_limited');
  }
  if (status === 402 || /余额不足|insufficient.{0,20}(balance|credit)/i.test(detail)) {
    return new GatewayError('账户余额不足，无法继续生成。请联系管理员微信 panrui12 充值。', 402, false, 'balance_insufficient');
  }
  if (status === 401) return new GatewayError(`中转登录或访问凭证已失效。请退出后重新登录；仍失败时联系管理员微信 panrui12 检查。${billing}`, 401, false, 'authentication_expired');
  if (status === 403) return new GatewayError(`当前账号或所选分组没有本次生图的访问权限。请更换可用分组，或联系管理员微信 panrui12 检查。${billing}`, 403, false, 'access_denied');
  if (/did not execute image generation|未执行生图/i.test(detail)) {
    return new GatewayError(`上游返回“未执行生图”，网站没有收到图片。${pending}`, 502, true, 'upstream_no_generation');
  }
  if (status === 408 || status === 504 || /timed?\s*out|timeout|超时/i.test(detail)) {
    return new GatewayError(`等待上游生图响应超时，暂时无法确认是否已生成图片。${pending}`, 504, true, 'upstream_timeout');
  }
  if (status >= 500) return new GatewayError(`上游生图服务暂时不可用，返回服务错误（${status}），本次结果尚未确认。${pending}`, 502, true, 'upstream_unavailable');
  if (status === 400 && /(?:invalid|unsupported|not supported|must be).{0,50}(?:size|dimension|aspect.?ratio)|(?:size|dimension|aspect.?ratio).{0,80}(?:invalid|unsupported|not supported|must be)|尺寸.{0,12}(?:不支持|无效)/i.test(detail)) {
    return new GatewayError(`当前线路不支持所选画面比例或尺寸。请换用常用比例，或将比例改为“自动”后再试。${billing}`, 400, false, 'size_unsupported');
  }
  if (/model|模型|images?.{0,15}edit/i.test(detail) && status === 400) {
    return new GatewayError(`当前模型不支持这次操作或参数。请调整生成设置；仍失败时联系管理员微信 panrui12 检查。${billing}`, 400, false, 'model_unsupported');
  }
  return new GatewayError(`上游拒绝了本次生成请求，未返回可识别的具体原因。请调整提示词或生成设置；仍失败时联系管理员微信 panrui12 检查。${billing}`, 400, false, 'request_rejected');
}

export function classifyConnectionFailure(error) {
  const code = String(error?.cause?.code || error?.code || '');
  const timeout = /TIMEOUT/.test(code) || ['TimeoutError', 'AbortError'].includes(error?.name);
  const message = timeout
    ? (code === 'UND_ERR_BODY_TIMEOUT' ? '接收上游生图结果超时，图片可能已生成但未完整返回。' : '等待上游生图响应超时，暂时无法确认是否已生成图片。')
    : '与上游生图服务的连接中断，暂时无法确认是否已生成图片。';
  const result = new GatewayError(`${message}请勿立即重复提交，请联系管理员微信 panrui12 核对结果和扣费。`, timeout ? 504 : 502, true, timeout ? 'upstream_timeout' : 'upstream_connection');
  if (/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) result.networkCode = code;
  return result;
}

function isPublicAddress(value) {
  if (!isIP(value)) return false;
  if (value.includes(':')) {
    const lower = value.toLowerCase();
    return !/^(::1|::|fc|fd|fe8|fe9|fea|feb)/.test(lower) && !lower.startsWith('::ffff:');
  }
  const [a, b] = value.split('.').map(Number);
  return a !== 0 && a !== 10 && a !== 127 && a < 224 && !(a === 169 && b === 254)
    && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168)
    && !(a === 100 && b >= 64 && b <= 127);
}

export async function readImageResult(item) {
  if (typeof item?.b64_json === 'string') {
    const bytes = Buffer.from(item.b64_json, 'base64');
    if (bytes.length > 12 * 1024 * 1024 || bytes.length < 8) throw new GatewayError('图片文件无效。');
    return { bytes, mime: sniffMime(bytes) };
  }
  if (typeof item?.url !== 'string') throw new GatewayError('中转未返回可保存的图片。');
  let url = new URL(item.url);
  for (let redirect = 0; redirect < 4; redirect++) {
    if (url.protocol !== 'https:') throw new GatewayError('图片链接必须使用 HTTPS。');
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new GatewayError('图片链接不可访问。');
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30_000) });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      url = new URL(response.headers.get('location'), url);
      continue;
    }
    if (!response.ok) throw new GatewayError('无法保存中转返回的图片。');
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 12 * 1024 * 1024) throw new GatewayError('返回图片超过 12 MB。');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    return { bytes, mime: sniffMime(bytes) };
  }
  throw new GatewayError('图片链接跳转次数过多。');
}

export function sniffMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw new GatewayError('只支持 PNG、JPEG 和 WebP 图片。', 400);
}

export function createGateway(baseUrl, model, demo = false, options = {}) {
  const base = new URL(baseUrl);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Invalid gateway URL');
  if (base.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(base.hostname)) {
    throw new Error('Gateway must use HTTPS outside localhost');
  }
  async function request(path, { method = 'GET', token, body, timeout = 15_000 } = {}) {
    let response;
    try {
      response = await fetch(new URL(path, base), {
        method,
        headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body && JSON.stringify(body),
        signal: AbortSignal.timeout(timeout)
      });
    } catch {
      throw new GatewayError('连接中转失败，请稍后重试。', 502, method === 'POST' && path.includes('/images/'));
    }
    let json;
    try { json = await response.json(); }
    catch {
      if (!response.ok) throw classifyAccountFailure(response.status, {}, path);
      throw new GatewayError('账户服务返回内容异常，请稍后重试。', 502, false, 'account_invalid_response');
    }
    if (!response.ok || json?.error || (json?.code != null && ![0, 200].includes(json.code))) {
      throw classifyAccountFailure(response.status, json, path);
    }
    return json?.data ?? json;
  }
  let loginConfiguration;
  async function loginConfig() {
    if (demo) return { turnstileEnabled: false, turnstileSiteKey: '' };
    if (loginConfiguration && loginConfiguration.expiresAt > Date.now()) return loginConfiguration.value;
    const settings = await request('/api/v1/settings/public');
    const enabled = settings?.turnstile_enabled === true;
    const siteKey = typeof settings?.turnstile_site_key === 'string' ? settings.turnstile_site_key : '';
    if (enabled && !/^[A-Za-z0-9_-]{10,200}$/.test(siteKey)) throw new GatewayError('登录验证配置暂不可用，请稍后重试。', 502, false, 'login_verification_configuration');
    const value = { turnstileEnabled: enabled, turnstileSiteKey: enabled ? siteKey : '' };
    loginConfiguration = { value, expiresAt: Date.now() + 60_000 };
    return value;
  }
  function demoUser() { return { id: 900001, username: '预览用户', email: 'preview@example.invalid', balance: 12.80, role: 'user', status: 'active' }; }
  return {
    model,
    loginConfig,
    login: (email, password, turnstileToken = '') => demo ? { access_token: 'demo-token', user: demoUser(), expires_in: 86400 } : request('/api/v1/auth/login', { method: 'POST', body: { email, password, ...(turnstileToken ? { turnstile_token: turnstileToken } : {}) } }),
    login2FA: (tempToken, code) => request('/api/v1/auth/login/2fa', { method: 'POST', body: { temp_token: tempToken, totp_code: code } }),
    refresh: (token) => request('/api/v1/auth/refresh', { method: 'POST', body: { refresh_token: token } }),
    profile: (token) => demo ? demoUser() : request('/api/v1/auth/me', { token }),
    groups: (token) => demo ? [{ id: 2, name: '图片创作', platform: 'openai', allow_image_generation: true, rate_multiplier: 1 }] : request('/api/v1/groups/available', { token }),
    createKey: (token, groupId) => demo ? { id: 1, key: 'demo-key-for-local-preview' } : request('/api/v1/keys', { method: 'POST', token, body: { name: options.keyName || '映间在线生图', group_id: groupId, ...(options.keyExpiresInDays ? { expires_in_days: options.keyExpiresInDays } : {}) } }),
    getKey: (token, id) => request(`/api/v1/keys/${Number(id)}`, { token }),
    deleteKey: (token, id) => request(`/api/v1/keys/${Number(id)}`, { method: 'DELETE', token }),
    logout: (refreshToken) => demo ? Promise.resolve() : request('/api/v1/auth/logout', { method: 'POST', body: { refresh_token: refreshToken } }),
    async converse(key, payload, context = {}) {
      if (demo) {
        if (context.purpose === 'editor') return demoEditorAnswer(payload);
        const users = payload.messages.filter(item => item.role === 'user');
        const latest = users.at(-1).content;
        const prompt = typeof latest === 'string' ? latest : latest.find(item => item.type === 'text')?.text || '';
        const ready = users.length > 1 || prompt.length >= 16;
        return JSON.stringify({
          reply: ready ? '本地演示：我已按你的描述整理方案。你可以继续补充要求，确认后再生成。' : '本地演示：你希望画面采用什么风格，例如写实摄影或手绘插画？',
          ready, prompt: ready ? users.map(item => typeof item.content === 'string' ? item.content : item.content[0].text).join('；').slice(-4000) : ''
        });
      }
      let response;
      try {
        response = await fetch(new URL('/v1/chat/completions', base), {
          method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(120_000)
        });
      } catch {
        throw new GatewayError('对话请求超时或连接中断，尚未提交生图。对话费用如有疑问，请联系管理员微信 panrui12 核对。', 504, true, 'chat_connection');
      }
      const json = await response.json().catch(() => ({}));
      if (!response.ok || json?.error) {
        if (classifyFailure(response.status, json).reason === 'content_refused') return JSON.stringify({ reply: '这项对话请求或参考图未通过内容审核，请调整描述后继续。尚未提交生图；若发现费用异常，请联系管理员微信 panrui12 核对。', ready: false, prompt: '' });
        if (response.status === 401) throw new GatewayError('对话访问凭证已失效，请重新登录后再试。', 401, false, 'chat_authentication');
        if (response.status === 402) throw new GatewayError('对话账户余额不足，请联系管理员微信 panrui12 充值。', 402, false, 'chat_balance');
        if (response.status === 429) throw new GatewayError('对话服务当前繁忙或额度受限，请稍后再试；尚未提交生图。', 429, false, 'chat_rate_limited');
        throw new GatewayError('当前分组暂时无法使用对话模型，请更换分组或联系管理员微信 panrui12 检查。尚未提交生图。', 502, true, 'chat_unavailable');
      }
      const answer = json.choices?.[0]?.message;
      if (answer?.refusal) return JSON.stringify({ reply: '这项请求未通过内容审核，请调整描述后继续。', ready: false, prompt: '' });
      // Tools are never passed to the model or executed by this application.
      return typeof answer?.content === 'string' ? answer.content : '';
    },
    async generate(key, { prompt, size, count, references, aspectRatio = 'auto' }) {
      const { requestSize } = resolveImageGeometry(size, aspectRatio);
      if (demo) {
        const fs = await import('node:fs/promises');
        const { join } = await import('node:path');
        const bytes = await fs.readFile(join(process.cwd(), 'public', 'demo', 'sample.jpg'));
        return { data: Array.from({ length: count }, () => ({ b64_json: bytes.toString('base64') })) };
      }
      const route = references.length ? '/v1/images/edits' : '/v1/images/generations';
      let body, headers = { authorization: `Bearer ${key}` };
      if (references.length) {
        body = new FormData();
        body.set('model', model);
        body.set('prompt', prompt);
        body.set('size', requestSize);
        body.set('n', String(count));
        body.set('response_format', 'b64_json');
        references.forEach((item, index) => body.append('image[]', new Blob([item.bytes], { type: item.mime }), `reference-${index + 1}.${item.mime.split('/')[1]}`));
      } else {
        headers['content-type'] = 'application/json';
        body = JSON.stringify({ model, prompt, size: requestSize, n: count, response_format: 'b64_json' });
      }
      let response;
      try {
        response = await fetch(new URL(route, base), { method: 'POST', headers, body, signal: AbortSignal.timeout(15 * 60_000) });
      } catch (error) {
        throw classifyConnectionFailure(error);
      }
      let json;
      try { json = await response.json(); }
      catch (error) {
        if (!(error instanceof SyntaxError)) throw classifyConnectionFailure(error);
        if (!response.ok) throw classifyFailure(response.status, {});
        throw new GatewayError('上游返回的结果格式无法读取，网站未能取得图片。请勿立即重复提交，请联系管理员微信 panrui12 核对结果和扣费。', 502, true, 'invalid_response');
      }
      if (!response.ok || json?.error) throw classifyFailure(response.status, json);
      return json;
    }
  };
}
