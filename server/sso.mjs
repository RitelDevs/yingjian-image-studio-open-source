import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { GatewayError } from './gateway.mjs';
import { bridgeHtml, bridgeScript, silentHtml, silentScript } from './sso-bridge.mjs';

const LEGACY_SOURCES = [
  { id: 'us', name: '美区中转', origin: 'https://api-us.ritelt.com' },
  { id: 'jp', name: '日区中转', origin: 'https://api-jp.ritelt.com' }
];
export function normalizeSSOSources(input) {
  if (!Array.isArray(input) || input.length > 10) throw new Error('SSO_SOURCES must be an array of at most 10 trusted HTTPS origins.');
  const ids = new Set(), origins = new Set();
  return input.map(item => {
    if (!item || !/^[a-z0-9_-]{1,32}$/i.test(item.id || '') || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 64) throw new Error('Invalid SSO source id or name.');
    let url; try { url = new URL(item.origin); } catch { throw new Error('Invalid SSO source origin.'); }
    if (url.protocol !== 'https:' || url.origin !== item.origin || url.username || url.password || ids.has(item.id) || origins.has(url.origin)) throw new Error('SSO sources must have unique ids and canonical HTTPS origins without paths.');
    if (item.studioOrigin != null) {
      let studio; try { studio = new URL(item.studioOrigin); } catch { throw new Error('Invalid SSO studio origin.'); }
      if (studio.protocol !== 'https:' || studio.origin !== item.studioOrigin) throw new Error('SSO studioOrigin must be a canonical HTTPS origin.');
    }
    ids.add(item.id); origins.add(url.origin);
    return { id: item.id, name: item.name.trim(), origin: url.origin, ...(item.studioOrigin ? { studioOrigin: item.studioOrigin } : {}) };
  });
}
const random = () => randomBytes(32).toString('base64url');
const hash = (value) => createHash('sha256').update(value).digest('base64url');
const valid = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const equal = (a, b) => valid(a) && valid(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function createSSO({ enabled, publicOrigin, store, gateway, sources: configuredSources = LEGACY_SOURCES, publicOrigins = [publicOrigin], requestPublicOrigin = () => publicOrigin, now = Date.now }) {
  if (enabled && !/^https:\/\/[^/]+$/.test(publicOrigin)) throw new Error('SSO requires a canonical HTTPS origin.');
  const challenges = new Map();
  const tickets = new Map();
  const cookieName = '__Host-studio_sso';
  const cookie = (value, age) => `${cookieName}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;
  const SOURCES = normalizeSSOSources(configuredSources);
  for (const source of SOURCES) if (source.studioOrigin && !publicOrigins.includes(source.studioOrigin)) throw new Error('SSO source studioOrigin is not configured in PUBLIC_ORIGINS.');
  const sourcesFor = origin => enabled && publicOrigins.includes(origin) ? SOURCES.filter(item => (item.studioOrigin || publicOrigin) === origin).map(({ studioOrigin, ...source }) => source) : [];
  const sources = sourcesFor(publicOrigin);
  function clean() {
    for (const [id, item] of challenges) if (item.expires <= now()) challenges.delete(id);
    for (const [id, item] of tickets) if (item.expires <= now()) tickets.delete(id);
  }
  function accessExpiry(token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      const expiry = Number(payload.exp) * 1000;
      if (!Number.isFinite(expiry) || expiry < now() + 60_000) throw new Error();
      return Math.min(expiry, now() + 24 * 60 * 60_000);
    } catch { throw new GatewayError('中转登录即将过期，请在中转刷新登录后再试。', 401); }
  }
  async function profile(token) {
    const user = await gateway.profile(token);
    if (!Number.isSafeInteger(user?.id) || user.id <= 0 || user.status !== 'active') throw new GatewayError('中转账号不可用，请重新登录中转。', 403);
    return user;
  }
  function requireOrigin(req, expected) {
    if (req.headers.origin !== expected) throw new GatewayError('登录请求来源不匹配，请重新开始。', 403);
  }
  return {
    sources, sourcesFor,
    async handle(req, res, path, { send, parseJson, sessionCookie }) {
      if (!path.startsWith('/api/sso/')) return false;
      if (!enabled) throw new GatewayError('单点登录未启用。', 404);
      clean();
      if (req.method === 'GET' && ['/api/sso/bridge', '/api/sso/bridge.js', '/api/sso/silent', '/api/sso/silent.js'].includes(path)) {
        const source = SOURCES.find((item) => item.origin === req.headers['x-studio-bridge-origin']);
        if (!source) throw new GatewayError('请从生图网站进入中转登录。', 403);
        const bridgeOrigin = source.studioOrigin || publicOrigin;
        const js = path.endsWith('.js');
        const silent = path.startsWith('/api/sso/silent');
        const body = Buffer.from(silent ? (js ? silentScript(bridgeOrigin) : silentHtml()) : (js ? bridgeScript(bridgeOrigin) : bridgeHtml(source.name, bridgeOrigin)));
        res.writeHead(200, {
          'content-type': js ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
          'content-length': body.length, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
          'x-content-type-options': 'nosniff', ...(!silent ? { 'x-frame-options': 'DENY' } : {}),
          'content-security-policy': `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors ${silent ? bridgeOrigin : "'none'"}; base-uri 'none'; form-action 'none'`
        });
        res.end(body);
        return true;
      }
      if (req.method !== 'POST') throw new GatewayError('登录方式无效。', 405);
      if (path === '/api/sso/start') {
        const studioOrigin = requestPublicOrigin(req);
        requireOrigin(req, studioOrigin);
        const body = await parseJson(req);
        const source = sourcesFor(studioOrigin).find((item) => item.id === body.source);
        if (!source) throw new GatewayError('请选择已配置的中转站点。', 400);
        if (challenges.size + tickets.size >= 500) throw new GatewayError('登录请求较多，请稍后再试。', 429);
        const state = random(), challenge = hash(state);
        if (body.expectedUserId != null && (!Number.isSafeInteger(body.expectedUserId) || body.expectedUserId <= 0)) throw new GatewayError('账号无效。', 400);
        challenges.set(challenge, { origin: source.origin, studioOrigin, expectedUserId: body.expectedUserId ?? null, expires: now() + 5 * 60_000 });
        send(res, 200, { challenge, url: `${source.origin}/studio-sso/#challenge=${challenge}` }, { 'set-cookie': cookie(state, 300) });
        return true;
      }
      if (path === '/api/sso/exchange') {
        if (!SOURCES.some((item) => item.origin === req.headers.origin)) throw new GatewayError('中转来源无效。', 403);
        const { challenge, accessToken } = await parseJson(req);
        const pending = valid(challenge) && challenges.get(challenge);
        if (!pending || pending.origin !== req.headers.origin) throw new GatewayError('登录跳转已失效，请从生图网站重新开始。', 400);
        if (typeof accessToken !== 'string' || accessToken.length > 16384 || accessToken.split('.').length !== 3) throw new GatewayError('请先登录中转账号。', 401);
        const expiresAt = accessExpiry(accessToken);
        // The JWT payload only supplies a conservative expiry. Identity is
        // verified with Sub2API, never trusted from client-provided claims.
        const user = await profile(accessToken);
        if (pending.expectedUserId != null && user.id !== pending.expectedUserId) throw new GatewayError('中转账号已变更，请使用邮箱和密码登录。', 401);
        if (challenges.get(challenge) !== pending || pending.expires <= now()) throw new GatewayError('登录跳转已失效。', 400);
        challenges.delete(challenge);
        const code = random();
        tickets.set(hash(code), { challenge, studioOrigin: pending.studioOrigin, userId: user.id, encryptedToken: store.encrypt(accessToken), expiresAt, expires: now() + 60_000 });
        send(res, 200, { code });
        return true;
      }
      if (path === '/api/sso/finish') {
        const studioOrigin = requestPublicOrigin(req);
        requireOrigin(req, studioOrigin);
        const { code } = await parseJson(req);
        const state = String(req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
        const ticket = valid(code) && tickets.get(hash(code));
        if (!ticket || ticket.studioOrigin !== studioOrigin || !valid(state) || !equal(hash(state), ticket.challenge)) throw new GatewayError('登录跳转已过期或浏览器不匹配，请重新登录。', 401);
        tickets.delete(hash(code));
        const token = store.decrypt(ticket.encryptedToken);
        const user = await profile(token);
        if (user.id !== ticket.userId || ticket.expiresAt <= now() + 1000) throw new GatewayError('登录账号已变更，请重新开始。', 401);
        const session = store.saveSession(user, token, null, Math.floor((ticket.expiresAt - now()) / 1000));
        send(res, 200, { ok: true }, { 'set-cookie': [sessionCookie(session), cookie('', 0)] });
        return true;
      }
      throw new GatewayError('登录接口不存在。', 404);
    }
  };
}
