const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export function bridgeHtml(sourceName, publicOrigin = 'https://images.ritelt.com') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>使用中转账号进入映间</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f1f8fc;color:#24475c;font-family:"Segoe UI","Microsoft YaHei",sans-serif;min-height:100dvh;display:grid;place-items:center;padding:24px}main{width:min(100%,460px);background:#fff;border:1px solid #d6e6ef;border-radius:8px;padding:36px}small{color:#4c819f}h1{font-size:25px;line-height:1.5;margin:18px 0}p{font-size:14px;line-height:1.8;color:#577488}button,a{font:inherit;min-height:44px;border-radius:6px}button{display:block;width:100%;margin-top:16px;background:#237daf;color:white;border:0;cursor:pointer}button:disabled{opacity:.5;cursor:wait}a{display:inline-flex;align-items:center;justify-content:center;color:#286d97;margin-top:8px}a.secondary{font-size:12px}a#upstream-login{width:100%;border:1px solid #c8dfe9;text-decoration:none}a:focus-visible,button:focus-visible{outline:3px solid #74b7df;outline-offset:3px}[hidden]{display:none!important}
  </style><script src="/studio-sso/bridge.js" defer></script></head><body><main><small>${escapeHtml(sourceName)} → 映间</small><h1>使用已登录的中转账号</h1><p id="status" role="status" aria-live="polite">正在确认登录状态…</p><a id="upstream-login" href="/dashboard" target="_blank" rel="noopener" hidden>打开中转，完成登录或刷新登录</a><button id="retry" type="button" hidden>我已登录，继续进入映间</button><a class="secondary" href="${escapeHtml(publicOrigin)}/#account-entry">返回生图网站</a><p>仅使用当前站点的账号。浏览器不同或登录已过期时，需要先在中转登录。</p></main></body></html>`;
}

export function bridgeScript(publicOrigin) {
  return `'use strict';
const studioOrigin = ${JSON.stringify(publicOrigin)};
const params = new URLSearchParams(location.hash.slice(1));
const supplied = params.get('challenge');
history.replaceState(null, '', location.pathname);
const status = document.getElementById('status');
const retry = document.getElementById('retry');
const login = document.getElementById('upstream-login');
let challenge = supplied;
try {
  if (supplied && /^[A-Za-z0-9_-]{43}$/.test(supplied)) sessionStorage.setItem('yingjian-sso-pending', JSON.stringify({challenge:supplied,expires:Date.now()+300000}));
  else { const saved=JSON.parse(sessionStorage.getItem('yingjian-sso-pending')||'null'); if(saved&&saved.expires>Date.now()) challenge=saved.challenge; }
} catch {}
let busy = false;
async function connect(){
  if(busy)return;
  if(!challenge||!/^[A-Za-z0-9_-]{43}$/.test(challenge)){status.textContent='请从生图网站点击“使用中转账号登录”进入。';return;}
  busy=true; retry.disabled=true; login.hidden=true; retry.hidden=true;
  try {
    const token=localStorage.getItem('auth_token');
    if(!token)throw new Error('当前中转站点尚未登录。请先登录，随后点击继续。');
    status.textContent='正在连接你的中转账号…';
    const response=await fetch('/studio-sso/exchange',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({challenge,accessToken:token}),signal:AbortSignal.timeout(20000)});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'登录连接未完成，请稍后重试。');
    if(!/^[A-Za-z0-9_-]{43}$/.test(result.code))throw new Error('登录返回结果不完整，请重新开始。');
    sessionStorage.removeItem('yingjian-sso-pending');
    location.replace(studioOrigin+'/#sso='+encodeURIComponent(result.code));
  }catch(error){status.textContent=error.name==='TimeoutError'?'连接超时，请返回生图网站重新开始。':error.message;login.hidden=false;retry.hidden=false;}
  finally{busy=false;retry.disabled=false;}
}
retry.addEventListener('click',connect);
connect();
`;
}

export function silentHtml() {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>登录状态检查</title><script src="/studio-sso/silent.js" defer></script></head><body></body></html>';
}

export function silentScript(publicOrigin) {
  return `'use strict';
const studioOrigin = ${JSON.stringify(publicOrigin)};
const nonce = new URLSearchParams(location.hash.slice(1)).get('nonce');
history.replaceState(null,'',location.pathname);
if(window.parent!==window&&nonce&&/^[A-Za-z0-9-]{36}$/.test(nonce)){
  let token=null, accountId=null, used=false;
  const reply=(data)=>window.parent.postMessage({type:'studio-session-probe',nonce,...data},studioOrigin);
  window.addEventListener('message',async event=>{
    if(event.origin!==studioOrigin||event.source!==window.parent||event.data?.type!=='studio-session-connect'||event.data.nonce!==nonce||used)return;
    if(!token||!accountId||!/^[A-Za-z0-9_-]{43}$/.test(event.data.challenge||''))return;
    used=true;
    try{
      if(localStorage.getItem('auth_token')!==token)throw new Error('Account changed');
      const response=await fetch('/studio-sso/exchange',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({challenge:event.data.challenge,accessToken:token,expectedUserId:accountId}),signal:AbortSignal.timeout(8000)});
      const result=await response.json();
      if(!response.ok||!/^[A-Za-z0-9_-]{43}$/.test(result.code||''))throw new Error('No ticket');
      reply({phase:'connected',code:result.code});
    }catch{reply({phase:'connected',unavailable:true});}
    finally{token=null;}
  });
  (async()=>{
    try{
      token=localStorage.getItem('auth_token');
      if(!token)throw new Error('Not signed in');
      const response=await fetch('/api/v1/auth/me',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(3500)});
      const body=await response.json();const user=body.data??body;
      if(!response.ok||!Number.isSafeInteger(user.id)||user.id<=0||user.status!=='active'||localStorage.getItem('auth_token')!==token)throw new Error('No active session');
      accountId=user.id;reply({phase:'ready',accountId});
    }catch{token=null;reply({phase:'ready',unavailable:true});}
  })();
}
`;
}
