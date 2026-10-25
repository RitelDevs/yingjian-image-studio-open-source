const PAUSED = 'studio-auto-login-paused';
const KNOWN_ORIGINS = ['https://dash.ritel.si', 'https://console.ritel.si', 'https://api-us.ritelt.com', 'https://api-jp.ritelt.com', 'https://api-dr.ritelt.com', 'https://api-cf.ritelt.com'];

export function pauseAutoLogin() { try { sessionStorage.setItem(PAUSED, '1'); } catch {} }
export function resumeAutoLogin() { try { sessionStorage.removeItem(PAUSED); } catch {} }

// All probes are same-site HTTPS frames. Only opaque one-time codes come
// back to this page; access tokens stay inside their original Sub2API frame.
export async function tryAutoLogin(sources, call) {
  try { if (sessionStorage.getItem(PAUSED)) return false; } catch { return false; }
  if (!Array.isArray(sources) || !sources.length) return false;
  const probes = [];
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12000);
  function probe(source) {
    const frame = document.createElement('iframe');
    const nonce = crypto.randomUUID();
    frame.hidden = true;
    frame.title = '检查中转登录状态';
    frame.referrerPolicy = 'no-referrer';
    const item = { source, frame, nonce, candidate: null, connected: null, dispose: null };
    item.ready = new Promise((resolve) => {
      let settled = false;
      const settle = (value) => { if (!settled) { settled = true; clearTimeout(timer); item.candidate = value; resolve(value); } };
      const timer = setTimeout(() => settle(null), 4500);
      const onMessage = (event) => {
        if (event.origin !== source.origin || event.source !== frame.contentWindow || event.data?.type !== 'studio-session-probe' || event.data.nonce !== nonce) return;
        const data = event.data;
        if (data.phase === 'ready') settle(Number.isSafeInteger(data.accountId) && data.accountId > 0 ? data.accountId : null);
        if (data.phase === 'connected') item.connected?.(data);
      };
      window.addEventListener('message', onMessage);
      frame.addEventListener('error', () => settle(null), { once: true });
      item.dispose = () => { settle(null); item.connected?.({ unavailable: true }); window.removeEventListener('message', onMessage); frame.remove(); };
    });
    frame.src = `${source.origin}/studio-sso/silent#nonce=${nonce}`;
    document.body.appendChild(frame);
    probes.push(item);
    return item;
  }
  try {
    sources.filter((source) => KNOWN_ORIGINS.includes(source.origin)).forEach(probe);
    await Promise.all(probes.map((item) => item.ready));
    const candidates = probes.filter((item) => item.candidate);
    if (!candidates.length || new Set(candidates.map((item) => item.candidate)).size !== 1) return false;
    const selected = candidates[0];
    const { challenge } = await call('/api/sso/start', { method: 'POST', signal: abort.signal, body: JSON.stringify({ source: selected.source.id, expectedUserId: selected.candidate }) });
    const ticket = await new Promise((resolve) => {
      if (abort.signal.aborted) return resolve({ unavailable: true });
      selected.connected = resolve;
      abort.signal.addEventListener('abort', () => resolve({ unavailable: true }), { once: true });
      selected.frame.contentWindow.postMessage({ type: 'studio-session-connect', nonce: selected.nonce, challenge }, selected.source.origin);
    });
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket.code || '')) return false;
    await call('/api/sso/finish', { method: 'POST', signal: abort.signal, body: JSON.stringify({ code: ticket.code }) });
    return true;
  } catch { return false; }
  finally { clearTimeout(timeout); probes.forEach((item) => item.dispose()); }
}
