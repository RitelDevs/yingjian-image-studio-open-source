import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.mjs';
import { createSSO } from '../server/sso.mjs';
import { GatewayError } from '../server/gateway.mjs';

function setup() {
  let now = Date.now();
  const dir = mkdtempSync(join(tmpdir(), 'studio-sso-test-'));
  const store = createStore(dir);
  const token = ['fixture', Buffer.from(JSON.stringify({ exp: Math.floor(now / 1000) + 3600 })).toString('base64url'), 'signature'].join('.');
  let user = { id: 7, status: 'active', role: 'user', email: 'fixture@example.test' };
  const sso = createSSO({ enabled: true, publicOrigin: 'https://images.ritelt.com', store, now: () => now, gateway: { profile: async (value) => {
    if (value !== token) throw new GatewayError('Invalid upstream credential', 401);
    return user;
  } } });
  async function request(path, body, { origin = 'https://images.ritelt.com', cookie = '', extra = {}, method = 'POST' } = {}) {
    const result = {};
    try {
      await sso.handle({ method, headers: { origin, cookie, ...extra } }, { writeHead: (status, headers) => Object.assign(result, { status, headers }), end: (body) => { result.raw = String(body); } }, path, {
        send: (_res, status, data, headers) => Object.assign(result, { status, data, headers }), parseJson: async () => body,
        sessionCookie: (value) => `studio_sid=${value}; HttpOnly; Secure; SameSite=Lax; Path=/`
      });
    } catch (error) { result.status = error.status || 500; result.error = error.message; }
    return result;
  }
  async function start() {
    const result = await request('/api/sso/start', { source: 'us' });
    return { result, challenge: new URLSearchParams(new URL(result.data.url).hash.slice(1)).get('challenge'), cookie: result.headers['set-cookie'].split(';')[0] };
  }
  async function exchange(challenge, accessToken = token) { return request('/api/sso/exchange', { challenge, accessToken }, { origin: 'https://api-us.ritelt.com' }); }
  return { store, request, start, exchange, token, advance: (ms) => { now += ms; }, changeUser: (value) => { user = value; }, close: () => { store.close(); rmSync(dir, { recursive: true }); } };
}

test('SSO uses verified upstream identity and a one-time browser-bound code without sharing refresh tokens', async () => {
  const s = setup();
  try {
    const flow = await s.start();
    assert.match(flow.result.headers['set-cookie'], /__Host-studio_sso=.*HttpOnly; Secure; SameSite=Lax/);
    assert.equal(flow.result.data.url.includes(s.token), false);
    const exchange = await s.exchange(flow.challenge);
    assert.equal(exchange.status, 200);
    const finish = await s.request('/api/sso/finish', { code: exchange.data.code }, { cookie: flow.cookie });
    assert.equal(finish.status, 200);
    const sid = finish.headers['set-cookie'][0].split(';')[0].slice('studio_sid='.length);
    assert.equal(s.store.session(sid).user_id, 7);
    assert.equal(s.store.session(sid).refreshToken, null);
    assert.equal((await s.request('/api/sso/finish', { code: exchange.data.code }, { cookie: flow.cookie })).status, 401);
    assert.equal((await s.exchange(flow.challenge)).status, 400);
  } finally { s.close(); }
});

test('SSO rejects forged identity, wrong source, cross-site starts and a different browser', async () => {
  const s = setup();
  try {
    assert.equal((await s.request('/api/sso/start', { source: 'us' }, { origin: 'https://untrusted.test' })).status, 403);
    assert.equal((await s.request('/api/sso/start', { source: 'https://untrusted.test' })).status, 400);
    const flow = await s.start();
    assert.equal((await s.request('/api/sso/exchange', { challenge: flow.challenge, accessToken: s.token }, { origin: 'https://api-jp.ritelt.com' })).status, 400);
    assert.equal((await s.exchange(flow.challenge, s.token.replace('signature', 'forged'))).status, 401);
    const ticket = await s.exchange(flow.challenge);
    const other = await s.start();
    assert.equal((await s.request('/api/sso/finish', { code: ticket.data.code }, { cookie: other.cookie })).status, 401);
    assert.equal((await s.request('/api/sso/finish', { code: ticket.data.code }, { cookie: flow.cookie, origin: 'https://untrusted.test' })).status, 403);
    assert.equal((await s.request('/api/sso/finish', { code: ticket.data.code }, { cookie: flow.cookie })).status, 200);
  } finally { s.close(); }
});

test('SSO rejects expired challenges, expired tickets, disabled accounts and changed identity', async () => {
  const s = setup();
  try {
    const old = await s.start();
    s.advance(300001);
    assert.equal((await s.exchange(old.challenge)).status, 400);
    const flow = await s.start();
    const ticket = await s.exchange(flow.challenge);
    s.advance(60001);
    assert.equal((await s.request('/api/sso/finish', { code: ticket.data.code }, { cookie: flow.cookie })).status, 401);
    const disabled = await s.start();
    s.changeUser({ id: 7, status: 'disabled' });
    assert.equal((await s.exchange(disabled.challenge)).status, 403);
    s.changeUser({ id: 7, status: 'active' });
    const changed = await s.exchange(disabled.challenge);
    s.changeUser({ id: 8, status: 'active' });
    assert.equal((await s.request('/api/sso/finish', { code: changed.data.code }, { cookie: disabled.cookie })).status, 401);
    assert.equal(s.store.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  } finally { s.close(); }
});

test('SSO bridge has strict page policy and no credential in the redirect or persistent ticket', async () => {
  const s = setup();
  try {
    assert.equal((await s.request('/api/sso/bridge', null, { method: 'GET' })).status, 403);
    const result = await s.request('/api/sso/bridge', null, { method: 'GET', extra: { 'x-studio-bridge-origin': 'https://api-us.ritelt.com' } });
    assert.equal(result.status, 200);
    assert.match(result.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(result.headers['referrer-policy'], 'no-referrer');
    const script = await s.request('/api/sso/bridge.js', null, { method: 'GET', extra: { 'x-studio-bridge-origin': 'https://api-us.ritelt.com' } });
    assert.doesNotMatch(script.raw, /getItem\('refresh_token'\)/);
    assert.match(script.raw, /#sso=/);
  } finally { s.close(); }
});

test('silent bridge only allows the image-site parent and leaves tokens inside the relay frame', async () => {
  const s = setup();
  try {
    const options = { method: 'GET', extra: { 'x-studio-bridge-origin': 'https://api-us.ritelt.com' } };
    const page = await s.request('/api/sso/silent', null, options);
    assert.equal(page.status, 200);
    assert.match(page.headers['content-security-policy'], /frame-ancestors https:\/\/images\.ritelt\.com;/);
    assert.equal(page.headers['x-frame-options'], undefined);
    const script = await s.request('/api/sso/silent.js', null, options);
    assert.match(script.raw, /event.origin!==studioOrigin\|\|event.source!==window.parent/);
    assert.match(script.raw, /event.data.nonce!==nonce/);
    assert.doesNotMatch(script.raw, /getItem\('refresh_token'\)|location\.replace/);
    assert.match(script.raw, /phase:'connected',code:result.code/);
  } finally { s.close(); }
});

test('silent login refuses a different account between detection and ticket exchange', async () => {
  const s = setup();
  try {
    const result = await s.request('/api/sso/start', { source: 'us', expectedUserId: 9 });
    assert.equal(result.status, 200);
    assert.equal((await s.exchange(result.data.challenge)).status, 401);
    assert.equal(s.store.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
  } finally { s.close(); }
});
