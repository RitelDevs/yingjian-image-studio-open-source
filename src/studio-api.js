import { createContext } from 'react';
import { createSub2apiStudioClient, StudioRequestError } from './sub2api-client.js';

export const sub2apiClient = createSub2apiStudioClient();
let sub2apiActive = false;

export async function legacyCall(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin', ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers }
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new StudioRequestError(json.error || '连接失败，请稍后重试。', response.status, json.code || '');
  return json;
}
export function configureStudio(config) {
  if (config.accountMode === 'sub2api') sub2apiClient.configure(config);
  sub2apiActive = config.accountMode === 'sub2api';
}
export const call = (...args) => (sub2apiActive ? sub2apiClient.call(...args) : legacyCall(...args));
async function legacyReadMedia(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options });
  if (!response.ok) throw new StudioRequestError(response.status === 401 || response.status === 403
    ? '登录状态已失效，请重新登录。' : '这张图片已过期或无法读取，请重新上传。', response.status);
  return response.blob();
}
export const StudioApiContext = createContext({ call, readMedia: legacyReadMedia });
export function apiForAccount(id) {
  if (!sub2apiActive) return { call: legacyCall, readMedia: legacyReadMedia };
  const scoped = sub2apiClient.forAccount(id);
  return { call: scoped, readMedia: scoped.readMedia };
}

export const currentReturnPath = () => location.pathname + location.search + location.hash;
export const loginPath = (mode = 'login') => '/auth/login?' + new URLSearchParams({ returnPath: currentReturnPath(), ...(mode === 'register' ? { mode: 'register', aff: '885EB5776PEU' } : {}) });
export function accountPath(origin, section) {
  const url = new URL('/account/', origin);
  url.searchParams.set('returnTo', location.origin + currentReturnPath());
  url.hash = section;
  return url.href;
}
