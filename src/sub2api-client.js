export class StudioRequestError extends Error {
  constructor(message, status = 0, code = '') { super(message); this.status = status; this.code = code; }
}

const BROWSER_MODULE = '/auth/browser.mjs';
const unsafe = method => !['GET', 'HEAD', 'OPTIONS'].includes(method);
const unavailable = () => new StudioRequestError('账号服务暂不可用，草稿已保留，请重新检查。', 503, 'session_unavailable');
const superseded = () => new StudioRequestError('登录状态已变化，此次请求已停止，请检查当前账号。', 409, 'session_superseded');

// This adapter uses only the consumer's public session. The old unified client stays separate.
export function createSub2apiStudioClient({ fetch: request = globalThis.fetch,
  loadBrowser = () => import(/* @vite-ignore */ BROWSER_MODULE), now = () => performance.now() } = {}) {
  let config, consumer, refreshing, hydrating, lastSuccessfulCheck, loggingOut = false, epoch = 0, uid = null;
  let view = { phase: 'loading', account: null, error: '', ownerVersion: 0 };
  const listeners = new Set();
  function publish(patch) { view = { ...view, ...patch }; for (const listener of listeners) listener(view); }
  function discardAccount() {
    const previous = view.account?.user.id;
    if (previous != null) { try { sessionStorage.removeItem('studio-active-thread:' + previous); } catch {} }
    epoch++;
    publish({ account: null, ownerVersion: view.ownerVersion + 1 });
  }
  function fail(error) {
    lastSuccessfulCheck = undefined;
    publish({ phase: 'unavailable', error: error?.code === 'logout_unconfirmed'
      ? error.message : '账号服务暂不可用，草稿已保留。重新检查后可继续创作。' });
  }
  function withProfile(account, session = consumer?.session) {
    if (!account || session?.user?.uid !== 'sub2api:' + account.user.id) return account;
    return { ...account, user: { ...account.user,
      nickname: session.user.nickname ?? null, avatarUrl: session.user.avatarUrl ?? null } };
  }
  function onSession(session) {
    const next = session.user?.uid ?? null;
    if (next !== uid) { discardAccount(); uid = next; }
    if (loggingOut) return;
    if (!view.account) publish({ phase: 'checking', error: '' });
    const generation = epoch;
    // Return the hydration promise to the consumer, including its own BFCache
    // and activity rechecks. Neither UI release nor queued HTTP can outrun /me.
    const work = (async () => {
      let account;
      try { account = await raw('/api/me', { signal: AbortSignal.timeout(10000) }); }
      catch (error) { if (!session.user && error.status === 401) account = null; else throw error; }
      if (generation !== epoch || loggingOut) throw superseded();
      if (!session.user) {
        if (account) throw unavailable();
        publish({ phase: 'anonymous', error: '' });
        lastSuccessfulCheck = now();
        return null;
      }
      if (!Number.isSafeInteger(account?.user?.id) || account.user.id <= 0 || !Array.isArray(account.groups)) throw unavailable();
      if (session.user.uid !== 'sub2api:' + account.user.id) {
        discardAccount();
        fail(unavailable());
        throw unavailable();
      }
      account = withProfile(account, session);
      publish({ phase: 'ready', account, error: '' });
      lastSuccessfulCheck = now();
      return account;
    })().catch(error => {
      if (generation === epoch) {
        if (error.status === 401 || error.code === 'account_changed') discardAccount();
        fail(error);
      }
      throw error;
    }).finally(() => { if (hydrating === work) hydrating = null; });
    hydrating = work;
    return work;
  }
  async function raw(url, options = {}, media = false) {
    if (typeof url !== 'string' || !/^\/api\//.test(url) || /[\\\r\n]/.test(url)
      || new URL(url, 'https://studio.invalid').pathname !== url.split('?')[0]) throw new TypeError('Fixed same-origin API path required');
    const headers = new Headers(options.headers);
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await request(url, { ...options, credentials: 'same-origin', mode: 'same-origin',
      redirect: 'error', cache: 'no-store', headers });
    if (media && response.ok) return response.blob();
    const value = await response.json().catch(() => {
      if (!response.ok) throw new StudioRequestError('连接失败，请稍后重试。', response.status);
      throw unavailable();
    });
    if (!response.ok) throw new StudioRequestError(typeof value.error === 'string' ? value.error : '连接失败，请稍后重试。',
      response.status, typeof value.code === 'string' ? value.code : '');
    return value;
  }
  function configure(value) {
    const origin = new URL(value.accountOrigin);
    if (value.accountMode !== 'sub2api' || origin.protocol !== 'https:' || origin.origin !== value.accountOrigin)
      throw new TypeError('Explicit HTTPS account origin required');
    config = { accountOrigin: origin.origin };
  }
  function refresh({ force = false } = {}) {
    if (refreshing) return refreshing;
    if (loggingOut) return Promise.reject(unavailable());
    if (!force && !consumer?.pending && !hydrating && ['ready', 'anonymous'].includes(view.phase) &&
        lastSuccessfulCheck !== undefined && now() - lastSuccessfulCheck < 30000) return Promise.resolve(view.account);
    const generation = epoch;
    // Routine foreground checks preserve the workspace, drafts and focus.
    // The request barrier below, rather than a full-page checking UI, gates HTTP.
    if (!view.account) publish({ phase: 'checking', error: '' });
    refreshing = (async () => {
      if (!consumer) {
        const { bootstrapSub2apiConsumer } = await loadBrowser();
        consumer = await bootstrapSub2apiConsumer({ authorizeOrigin: config.accountOrigin, onSession, onError: fail });
      } else await consumer.refresh();
      await hydrating;
      return view.account;
    })().catch(error => {
      if (generation === epoch) fail(error);
      throw error;
    }).finally(() => { refreshing = null; });
    return refreshing;
  }
  async function waitForSession(generation, expected, owner) {
    while (refreshing || consumer?.pending || hydrating) await (refreshing || consumer?.pending || hydrating);
    if (generation !== epoch || expected !== uid ||
        (owner && (view.ownerVersion !== owner.version || view.account?.user.id !== owner.id))) throw superseded();
    if (loggingOut || view.phase !== 'ready' || !consumer?.session.user || !consumer.session.csrf) throw unavailable();
  }
  async function call(url, options = {}, owner = null, media = false) {
    if (url === '/api/config') return raw(url, options);
    if (/^\/api\/(?:login(?:[/-]|$)|demo-login(?:[/?]|$)|logout(?:[/?]|$)|sso(?:[/?]|$)|session(?:[/?]|$))/.test(url))
      throw new StudioRequestError('请通过统一账号中心继续。', 404, 'legacy_auth_disabled');
    const generation = epoch, expected = uid;
    await waitForSession(generation, expected, owner);
    options.signal?.throwIfAborted();
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers);
    if (unsafe(method)) headers.set('X-CSRF-Token', consumer.session.csrf);
    try {
      const value = await raw(url, { ...options, headers }, media);
      await waitForSession(generation, expected, owner);
      if (url === '/api/me' && value?.user?.id !== view.account?.user.id)
        throw new StudioRequestError('当前登录账号已更改。', 409, 'account_changed');
      return url === '/api/me' ? withProfile(value) : value;
    } catch (error) {
      if (generation === epoch && url === '/api/me' && (!error.status || error.status >= 500)) fail(error);
      if (generation === epoch && (error.status === 401 || error.code === 'account_changed')) {
        discardAccount();
        fail(error);
        // Recheck identity, but never replay the business request or a mutation.
        void refresh({ force: true }).catch(() => {});
      }
      throw error;
    }
  }
  async function logout(ownerId) {
    if (loggingOut || view.phase !== 'ready' || view.account?.user.id !== ownerId || !consumer?.session.user) throw unavailable();
    loggingOut = true; epoch++; lastSuccessfulCheck = undefined;
    publish({ phase: 'checking', error: '' });
    try {
      // The consumer verifies applied:true before resolving; a failed acknowledgement retains UI/drafts.
      await consumer.logout();
      consumer.stop(); consumer = null; uid = null;
      discardAccount();
      publish({ phase: 'anonymous', error: '' });
      return { status: 'local_session_ended' };
    } catch {
      const error = new StudioRequestError('退出结果尚未确认，草稿已保留。请重新检查登录状态，不要重复退出。', 503, 'logout_unconfirmed');
      fail(error); throw error;
    } finally { loggingOut = false; }
  }
  return { configure, refresh, call, logout,
    start() { return refreshing || (['ready', 'anonymous'].includes(view.phase) ? Promise.resolve(view.account) : refresh()); },
    get snapshot() { return view; },
    subscribe(listener) { listeners.add(listener); listener(view); return () => listeners.delete(listener); },
    forAccount(id) {
      const owner = { id, version: view.ownerVersion };
      const scoped = (url, options) => call(url, options, owner);
      scoped.readMedia = (url, options) => {
        if (!/^\/api\/media\/[a-f0-9-]+(?:\?[^#]*)?$/i.test(url)) throw new TypeError('Studio media path required');
        return call(url, options, owner, true);
      };
      return scoped;
    }
  };
}
