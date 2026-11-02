import { timingSafeEqual } from 'node:crypto';
import { GatewayError } from './gateway.mjs';

export const SUB2API_VISORA_ORIGIN = 'https://visora.ritel.si';
export const SUB2API_IMAGES_ORIGIN = 'https://images.ritel.si';
export const SUB2API_STUDIO_ORIGINS = Object.freeze([SUB2API_VISORA_ORIGIN, SUB2API_IMAGES_ORIGIN]);
const denied = (status = 401) => new GatewayError('中央账号验证失败，请重新登录后再试。', status, false, 'central_session_unavailable');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Identity adapter only. Entitlements, balances, groups and personal API keys remain
// in the original Sub2API gateway and Studio tables, owned by the native integer UID.
export function createSub2apiAccount({ origin, issuer, clientId, consumer, getTrustedContext } = {}) {
  if (!SUB2API_STUDIO_ORIGINS.includes(origin) || new URL(issuer).origin !== issuer || !issuer.startsWith('https://') ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(clientId ?? '') || consumer?.origin !== origin || consumer?.issuer !== issuer || consumer?.clientId !== clientId ||
      ['handle', 'requireSession', 'getSessionKey', 'authorizeSessionKey', 'close'].some(key => typeof consumer?.[key] !== 'function')) {
    throw new TypeError('Explicit Sub2API Studio consumer required');
  }
  const authority = { origin, issuer, clientId };
  async function verified(operation) {
    try { return await operation(); }
    catch (error) {
      if (error instanceof GatewayError) throw error;
      throw denied([400, 401, 403, 429, 503].includes(error?.statusCode) ? error.statusCode : 503);
    }
  }
  function bind(store, result, consumerKey, background = false) {
    if (!/^[a-f0-9]{64}$/.test(consumerKey ?? '') || !Number.isSafeInteger(result?.user?.id) || result.user.id < 1 ||
        result.user.uid !== 'sub2api:' + result.user.id || !result.native?.accessToken || result.native.accessExpiresAt <= Date.now()) throw denied();
    const row = store.bindSub2apiSession({ ...authority, consumerKey, user: result.user, native: result.native }, { background });
    if (!row) throw denied();
    return row;
  }
  return Object.freeze({ ...authority,
    ...(getTrustedContext ? { assertTrustedRequest: getTrustedContext } : {}),
    handle: (req, res) => consumer.handle(req, res),
    authenticate: (store, req) => verified(async () => {
      const result = await consumer.requireSession(req);
      // Native <img>/<a> reads cannot carry a custom header. Every read still
      // checks central; unsafe requests also require exact session CSRF + Origin.
      const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
      if ((!safe && (!same(req.headers['x-csrf-token'], result.csrf) || req.headers.origin !== origin)) ||
          (req.headers.origin !== undefined && req.headers.origin !== origin) ||
          (req.headers['sec-fetch-site'] !== undefined && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) {
        throw new GatewayError('请求校验失败，请刷新登录状态。', 403, false, 'csrf_rejected');
      }
      return bind(store, result, consumer.getSessionKey(req));
    }),
    authorizeSession: (store, hash, userId) => verified(async () => {
      const binding = store.sub2apiSessionBinding(hash), previous = store.sessionByHash(hash);
      if (!binding || binding.origin !== origin || binding.issuer !== issuer || binding.client_id !== clientId ||
          !previous || previous.user_id !== userId) throw denied();
      const result = await consumer.authorizeSessionKey(binding.consumer_key);
      if (result.user.id !== userId || store.sub2apiSessionBinding(hash)?.consumer_key !== binding.consumer_key) throw denied();
      const row = bind(store, result, binding.consumer_key, true);
      if (row.id_hash !== hash) throw denied();
      return row;
    }),
    async logout(store, req, res) {
      const consumerKey = consumer.getSessionKey(req), previousURL = req.url;
      try {
        req.url = '/auth/logout';
        if (!await consumer.handle(req, res)) throw denied(503);
      } finally {
        req.url = previousURL;
        // handle clears the local consumer on successful or uncertain central
        // logout. A rejected CSRF request leaves both bindings untouched.
        if (consumerKey && !consumer.getSessionKey(req)) store.forgetSub2apiSession({ ...authority, consumerKey });
      }
    },
    close: () => consumer.close()
  });
}

// Exactly the two Studio domains during the Visora cutover; both use the ONE
// application store/queue. The original consumer owns its cookies and state.
export function createDualOriginSub2apiAccount(primary, legacy) {
  if (primary?.origin !== SUB2API_VISORA_ORIGIN || legacy?.origin !== SUB2API_IMAGES_ORIGIN ||
      primary.issuer !== legacy.issuer || primary.clientId === legacy.clientId ||
      [primary, legacy].some(account => ['assertTrustedRequest', 'handle', 'authenticate', 'authorizeSession', 'logout', 'close']
        .some(key => typeof account[key] !== 'function'))) throw new TypeError('Explicit Visora and legacy images consumers required');
  const accounts = new Map([[primary.origin, primary], [legacy.origin, legacy]]);
  function select(req) {
    const count = name => req.rawHeaders.filter((_, i) => i % 2 === 0).filter(value => value.toLowerCase() === name).length;
    const account = [...accounts.values()].find(value => new URL(value.origin).host === req.headers.host);
    if (!account || count('host') !== 1 || count('origin') > 1 ||
        (req.headers.origin !== undefined && req.headers.origin !== account.origin))
      throw new GatewayError('请求来源不匹配。', 403, false, 'csrf_rejected');
    // The selected private runtime checks the actual peer/TLS transport, exact
    // forwarding headers and verified client address. Never rewrite Host/Origin.
    try { account.assertTrustedRequest(req); }
    catch { throw new GatewayError('请求代理来源不匹配。', 403, false, 'csrf_rejected'); }
    return account;
  }
  return Object.freeze({ origin: primary.origin, issuer: primary.issuer,
    origins: Object.freeze([...accounts.keys()]),
    handle: (req, res) => select(req).handle(req, res),
    authenticate: (store, req) => select(req).authenticate(store, req),
    logout: (store, req, res) => select(req).logout(store, req, res),
    authorizeSession(store, hash, userId) {
      const binding = store.sub2apiSessionBinding(hash), account = accounts.get(binding?.origin);
      if (!account || binding.issuer !== account.issuer || binding.client_id !== account.clientId) throw denied();
      return account.authorizeSession(store, hash, userId);
    },
    async close() {
      const results = await Promise.allSettled([...accounts.values()].map(account => Promise.resolve().then(() => account.close())));
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
    }
  });
}
