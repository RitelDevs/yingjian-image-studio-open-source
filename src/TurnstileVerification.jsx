import { useEffect, useRef, useState } from 'react';

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading;
function loadTurnstile() {
  if (window.turnstile?.render) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL; script.async = true; script.defer = true;
    const fail = () => { clearTimeout(timer); script.remove(); loading = null; reject(new Error('Verification unavailable')); };
    const timer = setTimeout(fail, 15000);
    script.onerror = fail;
    script.onload = () => {
      clearTimeout(timer);
      if (window.turnstile?.render) resolve(window.turnstile); else fail();
    };
    document.head.appendChild(script);
  });
  return loading;
}

export default function TurnstileVerification({ siteKey, onToken, resetKey }) {
  const container = useRef(null);
  const tokenCallback = useRef(onToken);
  tokenCallback.current = onToken;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let disposed = false, widget = null, api;
    const clear = () => tokenCallback.current('');
    clear(); setState('loading');
    loadTurnstile().then(value => {
      if (disposed) return;
      api = value;
      const size = container.current.clientWidth < 300 ? 'compact' : 'flexible';
      widget = api.render(container.current, {
        sitekey: siteKey, action: 'auth', theme: 'light', size, 'response-field': false,
        callback: token => { if (!disposed) { tokenCallback.current(token); setState('verified'); } },
        'expired-callback': () => { if (!disposed) { clear(); setState('expired'); } },
        'timeout-callback': () => { if (!disposed) { clear(); setState('expired'); } },
        'error-callback': code => {
          if (!disposed) { clear(); setState(String(code).startsWith('110200') ? 'domain' : 'error'); }
          return true;
        }
      });
      if (widget === undefined || widget === null) throw new Error('Widget unavailable');
      setState(current => current === 'loading' ? 'waiting' : current);
    }).catch(() => { if (!disposed) { clear(); setState('error'); } });
    return () => { disposed = true; if (api && widget !== null) { try { api.remove(widget); } catch {} } };
  }, [siteKey, resetKey, attempt]);
  const error = ['error', 'expired', 'domain'].includes(state);
  const text = { loading: '正在加载人机验证…', waiting: '请完成人机验证', verified: '验证已完成，请点击登录。', expired: '验证已过期，请重新验证。', domain: '当前域名未获验证服务授权，请联系管理员微信 panrui12。', error: '人机验证加载失败，请检查网络后重试。' }[state];
  return <div className="login-verification" aria-label="登录人机验证">
    <div ref={container} className="turnstile-container" />
    <div className="login-verification-state" role="status"><span>{text}</span>{(error || state === 'verified') && <button type="button" onClick={() => setAttempt(value => value + 1)}>重新验证</button>}</div>
  </div>;
}
