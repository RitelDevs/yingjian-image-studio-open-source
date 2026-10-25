import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server/index.mjs';
import { createStore } from '../server/store.mjs';
import { GatewayError, classifyFailure } from '../server/gateway.mjs';
import { createGateway } from '../server/gateway.mjs';
import { createServer } from 'node:http';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fJkAAAAASUVORK5CYII=';

async function setup(overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-test-'));
  const calls = { createKey: 0, generate: 0, login: 0, createdKeys: [], generatedKeys: [] };
  const gateway = {
    model: 'gpt-image-2.5',
    login: async (email) => {
      calls.login++;
      const id = email.startsWith('other') ? 2 : Number(/^member(\d+)@/.exec(email)?.[1] || 1);
      return { access_token: `token-${id}`, refresh_token: `refresh-${id}`, expires_in: 3600,
        user: { id, email, username: `user-${id}`, balance: 8.2, status: 'active', role: overrides.role || 'user' } };
    },
    login2FA: async () => { throw new Error('not needed'); },
    refresh: async () => overrides.refresh ? overrides.refresh() : Promise.reject(new Error('not needed')),
    profile: async (token) => ({ id: Number(token.slice(6)), email: `user-${token.slice(6)}@example.test`, username: `user-${token.slice(6)}`, balance: 8.2, status: 'active', role: overrides.role || 'user' }),
    groups: async () => [{ id: 2, name: 'Image', platform: 'openai', status: 'active', allow_image_generation: true }],
    createKey: async (token, groupId) => {
      calls.createKey++;
      const id = Number(token.slice(6));
      const key = `sk-user-${id}-group-${groupId}-fixture-123456789`;
      calls.createdKeys.push({ userId: id, groupId, key });
      return { id: 99 + id, key };
    },
    logout: async () => {},
    generate: async (_key, input) => {
      calls.generate++;
      calls.generatedKeys.push(_key);
      if (overrides.generate) return overrides.generate(input);
      return { data: [{ b64_json: png }] };
    }
  };
  const app = createApplication({ dataDir: directory, gateway, publicOrigin: 'http://127.0.0.1:8788', integration: overrides.integration, concurrency: overrides.concurrency });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  async function request(path, { method = 'GET', cookie, body, headers = {} } = {}) {
    const response = await fetch(`${origin}${path}`, {
      method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers, ...(cookie ? { cookie } : {}) },
      body: body && JSON.stringify(body)
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function login(email = 'one@example.test') {
    const result = await request('/api/login', { method: 'POST', body: { email, password: 'test' } });
    assert.equal(result.status, 200);
    return result.cookie;
  }
  async function waitJob(id, cookie) {
    for (let step = 0; step < 100; step++) {
      const result = await request(`/api/jobs/${id}`, { cookie });
      if (!['queued', 'running'].includes(result.data.job?.status)) return result.data.job;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('job never finished');
  }
  async function stop() {
    await new Promise((resolve) => app.server.close(resolve));
    app.close();
    rmSync(directory, { force: true, recursive: true });
  }
  return { app, calls, directory, origin, request, login, waitJob, stop };
}

test('uses the authenticated user, deduplicates submissions, and isolates seven-day media', async () => {
  const site = await setup();
  try {
    const cookie = await site.login();
    const created = await site.request('/api/threads', { method: 'POST', cookie, body: {} });
    assert.equal(created.status, 201);
    const body = { clientRequestId: crypto.randomUUID(), threadId: created.data.thread.id,
      prompt: 'A vase of flowers', count: 1, size: '2K', groupId: 2, references: [] };
    const first = await site.request('/api/jobs', { method: 'POST', cookie, body });
    const duplicate = await site.request('/api/jobs', { method: 'POST', cookie, body });
    assert.equal(first.status, 202);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(first.data.job.id, duplicate.data.job.id);
    const result = await site.waitJob(first.data.job.id, cookie);
    assert.equal(result.status, 'done');
    assert.equal(result.images.length, 1);
    assert.equal(site.calls.generate, 1);
    assert.equal(site.calls.createKey, 1);
    const image = await fetch(`${site.origin}${result.images[0].url}`, { headers: { cookie } });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    const otherCookie = await site.login('other@example.test');
    const unauthorized = await fetch(`${site.origin}${result.images[0].url}`, { headers: { cookie: otherCookie } });
    assert.equal(unauthorized.status, 404);
    assert.equal((await site.request(`/api/threads/${created.data.thread.id}`, { cookie: otherCookie })).status, 404);
    site.app.store.db.prepare('UPDATE messages SET expires_at=? WHERE id=?').run(Date.now() - 1, result.id);
    site.app.store.cleanup();
    assert.equal((await site.request(`/api/threads/${created.data.thread.id}`, { cookie })).data.messages.length, 0);
  } finally { await site.stop(); }
});

test('integration entry rejects non-admin accounts without storing a session', async () => {
  const site = await setup({ integration: { runId: 'mock-integration', maxJobs: 2 } });
  try {
    const result = await site.request('/api/login', { method: 'POST', body: { email: 'one@example.test', password: 'test' } });
    assert.equal(result.status, 403);
    assert.equal(site.app.store.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0);
    assert.equal(site.calls.createKey, 0);
  } finally { await site.stop(); }
});

test('admin sessions cannot list, read, or delete conversations and images owned by another account', async () => {
  const site = await setup({ role: 'admin' });
  try {
    const ownerCookie = await site.login('other@example.test');
    const adminCookie = await site.login('one@example.test');
    const { data: { thread: otherThread } } = await site.request('/api/threads', { method: 'POST', cookie: ownerCookie, body: {} });
    const submitted = await site.request('/api/jobs', { method: 'POST', cookie: ownerCookie, body: {
      clientRequestId: crypto.randomUUID(), threadId: otherThread.id, prompt: 'Owner isolation fixture', count: 1, size: '2K', groupId: 2, references: []
    } });
    const result = await site.waitJob(submitted.data.job.id, ownerCookie);
    assert.equal(result.status, 'done');
    assert.deepEqual((await site.request('/api/threads', { cookie: adminCookie })).data.threads, []);
    assert.equal((await site.request(`/api/threads/${otherThread.id}`, { cookie: adminCookie })).status, 404);
    assert.equal((await site.request(`/api/threads/${otherThread.id}`, { method: 'DELETE', cookie: adminCookie })).status, 404);
    assert.equal((await site.request(`/api/jobs/${result.id}`, { cookie: adminCookie })).status, 404);
    assert.equal((await fetch(`${site.origin}${result.images[0].url}`, { headers: { cookie: adminCookie } })).status, 404);
    assert.equal((await site.request(`/api/threads/${otherThread.id}`, { cookie: ownerCookie })).data.messages.length, 1);
    assert.equal((await fetch(`${site.origin}${result.images[0].url}`, { headers: { cookie: ownerCookie } })).status, 200);
    assert.equal((await site.request(`/api/threads/${otherThread.id}`, { method: 'DELETE', cookie: ownerCookie })).status, 200);
    assert.equal((await site.request(`/api/threads/${otherThread.id}`, { cookie: ownerCookie })).status, 404);
    assert.equal((await fetch(`${site.origin}${result.images[0].url}`, { headers: { cookie: ownerCookie } })).status, 404);
  } finally { await site.stop(); }
});

test('two users generate with their own cached upstream keys and never share billing credentials', async () => {
  const site = await setup();
  try {
    const firstCookie = await site.login('one@example.test');
    const secondCookie = await site.login('other@example.test');
    for (const cookie of [firstCookie, secondCookie, firstCookie]) {
      const { data } = await site.request('/api/threads', { method: 'POST', cookie, body: {} });
      const job = await site.request('/api/jobs', { method: 'POST', cookie, body: {
        clientRequestId: crypto.randomUUID(), threadId: data.thread.id,
        prompt: 'Account ownership fixture', size: '2K', count: 1, groupId: 2, references: []
      } });
      assert.equal(job.status, 202);
      assert.equal((await site.waitJob(job.data.job.id, cookie)).status, 'done');
    }
    assert.deepEqual(site.calls.createdKeys.map(({ userId, groupId }) => ({ userId, groupId })), [{ userId: 1, groupId: 2 }, { userId: 2, groupId: 2 }]);
    assert.equal(site.calls.generatedKeys[0], site.calls.createdKeys[0].key);
    assert.equal(site.calls.generatedKeys[1], site.calls.createdKeys[1].key);
    assert.equal(site.calls.generatedKeys[2], site.calls.createdKeys[0].key);
    assert.notEqual(site.calls.generatedKeys[0], site.calls.generatedKeys[1]);
  } finally { await site.stop(); }
});

test('integration cookies stay separate and the two-job limit includes failed and duplicate submissions correctly', async () => {
  const site = await setup({ role: 'admin', integration: { runId: 'mock-integration', maxJobs: 2 } });
  try {
    const cookie = await site.login();
    assert.ok(cookie.startsWith('studio_integration_sid='));
    assert.equal((await site.request('/api/me', { cookie: cookie.replace('studio_integration_sid=', 'studio_sid=') })).status, 401);
    const thread = (await site.request('/api/threads', { method: 'POST', cookie, body: {} })).data.thread;
    const body = { clientRequestId: crypto.randomUUID(), threadId: thread.id, prompt: 'Integration fixture', count: 1, size: '2K', groupId: 2, references: [] };
    assert.equal((await site.request('/api/jobs', { method: 'POST', cookie, body: { ...body, count: 2 } })).status, 400);
    const first = await site.request('/api/jobs', { method: 'POST', cookie, body });
    assert.equal(first.status, 202);
    await site.waitJob(first.data.job.id, cookie);
    const duplicate = await site.request('/api/jobs', { method: 'POST', cookie, body });
    assert.equal(duplicate.data.duplicate, true);
    const second = await site.request('/api/jobs', { method: 'POST', cookie, body: { ...body, clientRequestId: crypto.randomUUID() } });
    assert.equal(second.status, 202);
    await site.waitJob(second.data.job.id, cookie);
    const third = await site.request('/api/jobs', { method: 'POST', cookie, body: { ...body, clientRequestId: crypto.randomUUID() } });
    assert.equal(third.status, 429);
    assert.equal(site.calls.generate, 2);
    assert.equal(site.calls.createKey, 1);
  } finally { await site.stop(); }
});

test('keeps uncertain jobs for manual billing review and does not retry them', async () => {
  const failure = classifyFailure(504, { message: 'Upstream timeout' });
  const site = await setup({ generate: async () => { throw failure; } });
  try {
    const cookie = await site.login();
    const created = await site.request('/api/threads', { method: 'POST', cookie, body: {} });
    const body = { clientRequestId: crypto.randomUUID(), threadId: created.data.thread.id,
      prompt: 'A window at dusk', count: 1, size: '2K', groupId: 2, references: [] };
    const first = await site.request('/api/jobs', { method: 'POST', cookie, body });
    const result = await site.waitJob(first.data.job.id, cookie);
    assert.equal(result.status, 'unknown');
    assert.equal(result.error, failure.message);
    assert.match(result.error, /panrui12/);
    await site.request('/api/jobs', { method: 'POST', cookie, body });
    assert.equal(site.calls.generate, 1);
  } finally { await site.stop(); }
});

test('unsupported batch requests retain the one-image remedy through the job API', async () => {
  const failure = classifyFailure(400, { error: { message: "Unknown parameter: 'tools[0].n'." } });
  const site = await setup({ generate: async () => { throw failure; } });
  try {
    const cookie = await site.login();
    const { data: { thread } } = await site.request('/api/threads', { method: 'POST', cookie, body: {} });
    const response = await site.request('/api/jobs', { method: 'POST', cookie, body: {
      clientRequestId: crypto.randomUUID(), threadId: thread.id, prompt: 'Four views', count: 4, size: '2K', groupId: 2, references: []
    } });
    const result = await site.waitJob(response.data.job.id, cookie);
    assert.equal(result.status, 'failed');
    assert.equal(result.error, failure.message);
    assert.match(result.error, /1 张/);
    assert.equal(site.calls.generate, 1);
  } finally { await site.stop(); }
});

test('empty and unsavable results explain why no image is shown without retrying', async () => {
  for (const [answer, expected] of [
    [{ data: [] }, /没有可用图片/],
    [{ data: [{ b64_json: 'aW52YWxpZA==' }] }, /未能完整下载或保存/]
  ]) {
    const site = await setup({ generate: async () => answer });
    try {
      const cookie = await site.login();
      const { data: { thread } } = await site.request('/api/threads', { method: 'POST', cookie, body: {} });
      const response = await site.request('/api/jobs', { method: 'POST', cookie, body: {
        clientRequestId: crypto.randomUUID(), threadId: thread.id, prompt: 'A scene', count: 1, size: '2K', groupId: 2, references: []
      } });
      const result = await site.waitJob(response.data.job.id, cookie);
      assert.equal(result.status, 'unknown');
      assert.match(result.error, expected);
      assert.match(result.error, /请勿立即重复提交.*panrui12/);
      assert.equal(site.calls.generate, 1);
    } finally { await site.stop(); }
  }
});

test('rejects inaccessible groups and cross-origin mutations before generation', async () => {
  const site = await setup();
  try {
    const cookie = await site.login();
    const badOrigin = await site.request('/api/threads', { method: 'POST', cookie, body: {}, headers: { origin: 'https://not-this-site.example' } });
    assert.equal(badOrigin.status, 403);
    const created = await site.request('/api/threads', { method: 'POST', cookie, body: {} });
    const invalid = await site.request('/api/jobs', { method: 'POST', cookie, body: {
      clientRequestId: crypto.randomUUID(), threadId: created.data.thread.id,
      prompt: 'Anything', count: 1, size: '2K', groupId: 999, references: []
    } });
    assert.equal(invalid.status, 403);
    assert.equal(site.calls.generate, 0);
    assert.equal(site.calls.createKey, 0);
  } finally { await site.stop(); }
});

test('marks interrupted queued jobs as unknown on startup', () => {
  const directory = mkdtempSync(join(tmpdir(), 'studio-restart-'));
  try {
    const first = createStore(directory);
    const thread = first.createThread(1);
    const message = first.createMessage(1, thread.id, {
      clientRequestId: crypto.randomUUID(), prompt: 'One scene', model: 'gpt-image-2.5', count: 1, size: '2K', groupId: 2
    });
    assert.equal(message.status, 'queued');
    first.close();
    const second = createStore(directory);
    assert.equal(second.getMessage(message.id, 1).status, 'unknown');
    second.close();
  } finally { rmSync(directory, { force: true, recursive: true }); }
});

test('keeps partial images and waits for the user to request another generation', async () => {
  const site = await setup({ generate: async () => ({ data: [{ b64_json: png }, { b64_json: png }] }) });
  try {
    const cookie = await site.login();
    const created = await site.request('/api/threads', { method: 'POST', cookie, body: {} });
    const body = { clientRequestId: crypto.randomUUID(), threadId: created.data.thread.id,
      prompt: 'Three flowers', count: 3, size: '2K', groupId: 2, references: [] };
    const first = await site.request('/api/jobs', { method: 'POST', cookie, body });
    const result = await site.waitJob(first.data.job.id, cookie);
    assert.equal(result.status, 'partial');
    assert.equal(result.images.length, 2);
    assert.match(result.error, /2\/3/);
    assert.equal(site.calls.generate, 1);
  } finally { await site.stop(); }
});

test('routes the fixed model through generations and uploaded references through edits', async () => {
  const hits = [];
  const mock = createServer(async (req, res) => {
    const parts = [];
    for await (const chunk of req) parts.push(chunk);
    hits.push({ path: req.url, type: req.headers['content-type'], body: Buffer.concat(parts).toString() });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ b64_json: png }] }));
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  try {
    const gateway = createGateway(`http://127.0.0.1:${mock.address().port}`, 'gpt-image-2.5');
    await gateway.generate('test-key', { prompt: 'First view', size: '2K', count: 1, references: [] });
    await gateway.generate('test-key', { prompt: 'Change the light', size: '2K', count: 1,
      references: [{ mime: 'image/png', bytes: Buffer.from(png, 'base64') }] });
    assert.equal(hits[0].path, '/v1/images/generations');
    assert.equal(JSON.parse(hits[0].body).model, 'gpt-image-2.5');
    assert.equal(hits[1].path, '/v1/images/edits');
    assert.match(hits[1].type, /multipart\/form-data/);
    assert.match(hits[1].body, /name="image\[\]"/);
    assert.match(hits[1].body, /gpt-image-2.5/);
  } finally { await new Promise((resolve) => mock.close(resolve)); }
});

test('uses the previous result as a reference in a later chat turn', async () => {
  const referenceCounts = [];
  const site = await setup({ generate: async ({ references }) => {
    referenceCounts.push(references.length);
    return { data: [{ b64_json: png }] };
  } });
  try {
    const cookie = await site.login();
    const created = await site.request('/api/threads', { method: 'POST', cookie, body: {} });
    const first = await site.request('/api/jobs', { method: 'POST', cookie, body: {
      clientRequestId: crypto.randomUUID(), threadId: created.data.thread.id,
      prompt: 'A room', count: 1, size: '2K', groupId: 2, references: []
    } });
    const firstResult = await site.waitJob(first.data.job.id, cookie);
    const second = await site.request('/api/jobs', { method: 'POST', cookie, body: {
      clientRequestId: crypto.randomUUID(), threadId: created.data.thread.id,
      prompt: 'Add a window', count: 1, size: '2K', groupId: 2,
      references: [{ mediaId: firstResult.images[0].id }]
    } });
    const secondResult = await site.waitJob(second.data.job.id, cookie);
    assert.equal(secondResult.status, 'done');
    assert.equal(secondResult.referenceIds.length, 1);
    assert.deepEqual(referenceCounts, [0, 1]);
    assert.equal(site.calls.createKey, 1);
  } finally { await site.stop(); }
});

test('handles 200 simulated online sessions without an upstream image call', async () => {
  const site = await setup();
  try {
    const cookies = await Promise.all(Array.from({ length: 200 }, (_, index) => site.login(`member${index + 1}@example.test`)));
    const profiles = await Promise.all(cookies.map((cookie) => site.request('/api/me', { cookie })));
    assert.equal(profiles.length, 200);
    assert.equal(new Set(profiles.map((result) => result.data.user.id)).size, 200);
    assert(profiles.every((result) => result.status === 200));
    assert.equal(site.calls.generate, 0);
  } finally { await site.stop(); }
});

test('ten jobs run concurrently; excess and same-account requests queue without rejection or duplicate execution', async () => {
  const gates = [];
  const site = await setup({ concurrency: 10, generate: input => new Promise((resolve, reject) => gates.push({ resolve, reject, prompt: input.prompt })) });
  const jobs = [];
  try {
    const firstCookie = await site.login('member1@example.test');
    for (let i = 0; i < 14; i++) {
      const cookie = i < 4 ? firstCookie : await site.login(`member${i - 2}@example.test`);
      const { data: { thread } } = await site.request('/api/threads', { method: 'POST', cookie, body: {} });
      const body = { clientRequestId: crypto.randomUUID(), threadId: thread.id,
        prompt: `Concurrency fixture ${i}`, size: '2K', count: 1, groupId: 2, references: [] };
      const response = await site.request('/api/jobs', { method: 'POST', cookie, body });
      assert.equal(response.status, 202);
      jobs.push({ job: response.data.job, cookie, body });
    }
    assert.equal(gates.length, 10);
    assert.equal(site.app.queue.active, 10);
    assert.equal(site.app.queue.waiting, 4);
    assert.deepEqual((await site.request('/api/health')).data.queue, { active: 10, waiting: 4, limit: 10 });
    for (const { job, cookie } of jobs.slice(10)) assert.equal((await site.request(`/api/jobs/${job.id}`, { cookie })).data.job.status, 'queued');
    const duplicate = await site.request('/api/jobs', { method: 'POST', cookie: jobs[10].cookie, body: jobs[10].body });
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.job.id, jobs[10].job.id);
    assert.equal(site.app.queue.waiting, 4);
    gates[0].reject(new GatewayError('Upstream fixture failure', 429));
    assert.equal((await site.waitJob(jobs[0].job.id, jobs[0].cookie)).status, 'failed');
    assert.equal(gates.length, 11);
    assert.equal(gates[10].prompt, 'Concurrency fixture 10');
    assert.equal(site.app.queue.active, 10);
    for (let i = 1; i <= 3; i++) {
      gates[i].resolve({ data: [{ b64_json: png }] });
      assert.equal((await site.waitJob(jobs[i].job.id, jobs[i].cookie)).status, 'done');
      assert.equal(gates[10 + i].prompt, `Concurrency fixture ${10 + i}`);
      assert.equal(site.app.queue.active, 10);
    }
    assert.equal(site.app.queue.waiting, 0);
    for (const gate of gates.slice(4)) gate.resolve({ data: [{ b64_json: png }] });
    for (const { job, cookie } of jobs.slice(1)) assert.equal((await site.waitJob(job.id, cookie)).status, 'done');
    assert.equal(site.app.queue.active, 0);
    assert.equal(site.calls.generate, 14);
    assert.equal(new Set(site.calls.generatedKeys).size, 11);
  } finally {
    // Release all held simulated requests even if an assertion fails mid-queue.
    for (let step = 0; step < 20 && site.app.queue.active; step++) {
      for (const gate of gates) gate.resolve({ data: [{ b64_json: png }] });
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    await site.stop();
  }
});

test('refreshes an expired token before dispatching a queued job', async () => {
  let refreshes = 0;
  const site = await setup({ refresh: async () => {
    refreshes++;
    return { access_token: 'token-1', refresh_token: 'refresh-1', expires_in: 3600 };
  } });
  try {
    const cookie = await site.login();
    const session = site.app.store.session(cookie.slice('studio_sid='.length));
    const thread = site.app.store.createThread(session.user_id);
    const message = site.app.store.createMessage(session.user_id, thread.id, {
      clientRequestId: crypto.randomUUID(), prompt: 'A tree', model: 'gpt-image-2.5',
      count: 1, size: '2K', groupId: 2
    });
    site.app.store.db.prepare('UPDATE sessions SET access_expires=? WHERE id_hash=?').run(Date.now() - 1000, session.id_hash);
    site.app.queue.enqueue({ id: message.id, sessionHash: session.id_hash, referenceIds: [],
      prompt: 'A tree', size: '2K', count: 1, groupId: 2 });
    for (let step = 0; step < 100 && ['queued', 'running'].includes(site.app.store.getMessage(message.id, 1).status); step++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(site.app.store.getMessage(message.id, 1).status, 'done');
    assert.equal(refreshes, 1);
    assert.equal(site.calls.generate, 1);
  } finally { await site.stop(); }
});

test('custom aspect ratios are validated before enqueue and retained in history and queue input', async () => {
  const inputs = [];
  const site = await setup({ generate: async input => { inputs.push(input); return { data: [{ b64_json: png }] }; } });
  try {
    const cookie = await site.login();
    const { data: { thread } } = await site.request('/api/threads', { method: 'POST', cookie, body: {} });
    const base = { threadId: thread.id, prompt: 'Landscape', size: '2K', count: 1, groupId: 2, references: [] };
    const invalid = await site.request('/api/jobs', { method: 'POST', cookie, body: { ...base, clientRequestId: crypto.randomUUID(), aspectRatio: '0:2' } });
    assert.equal(invalid.status, 400); assert.equal(site.calls.generate, 0);
    assert.equal(site.app.store.messages(thread.id, 1).length, 0);
    const submitted = await site.request('/api/jobs', { method: 'POST', cookie, body: { ...base, clientRequestId: crypto.randomUUID(), aspectRatio: '10:8' } });
    assert.equal(submitted.status, 202);
    const result = await site.waitJob(submitted.data.job.id, cookie);
    assert.equal(result.aspectRatio, '5:4'); assert.equal(result.size, '2K');
    assert.equal(inputs[0].aspectRatio, '5:4'); assert.equal(inputs[0].size, '2K');
    assert.equal((await site.request(`/api/threads/${thread.id}`, { cookie })).data.messages[0].aspectRatio, '5:4');
  } finally { await site.stop(); }
});

async function contextRequest(site, cookie, threadId, prompt, extra = {}) {
  return site.request('/api/jobs', { method: 'POST', cookie, body: {
    clientRequestId: crypto.randomUUID(), threadId, prompt, count: 1, size: '2K', groupId: 2, references: [], useContext: true, ...extra
  } });
}

test('conversation continuation carries original prompts and the preceding image, while independent generation resets context', async () => {
  const inputs = [];
  const site = await setup({ generate: async input => { inputs.push(input); return { data: [{ b64_json: png }] }; } });
  try {
    const cookie = await site.login();
    const thread = (await site.request('/api/threads', { method: 'POST', cookie, body: {} })).data.thread;
    const run = async (prompt, extra) => {
      const response = await contextRequest(site, cookie, thread.id, prompt, extra);
      assert.equal(response.status, 202);
      return site.waitJob(response.data.job.id, cookie);
    };
    const first = await run('A red chair in a white room');
    assert.equal(inputs[0].prompt, first.prompt); assert.equal(inputs[0].references.length, 0);
    const second = await run('Make the background blue');
    assert.match(inputs[1].prompt, /A red chair in a white room/);
    assert.match(inputs[1].prompt, /Make the background blue$/);
    assert.equal(inputs[1].references.length, 1);
    assert.deepEqual(inputs[1].references[0].bytes, Buffer.from(png, 'base64'));
    assert.equal(second.prompt, 'Make the background blue');
    assert.deepEqual(second.context.turnIds, [first.id]);
    assert.equal(second.context.imageId, first.images[0].id);
    assert.equal(second.referenceIds.length, 1);
    const third = await run('Add warmer light');
    assert.deepEqual(third.context.turnIds, [first.id, second.id]);
    assert.equal(inputs[2].references.length, 1);
    const newScene = await run('An independent mountain', { useContext: false });
    assert.equal(inputs[3].prompt, 'An independent mountain'); assert.equal(inputs[3].references.length, 0);
    const next = await run('Make it snowy');
    assert.deepEqual(next.context.turnIds, [newScene.id]);
    assert.doesNotMatch(inputs[4].prompt, /chair|background blue|warmer light/);
    const fresh = (await site.request('/api/threads', { method: 'POST', cookie, body: {} })).data.thread;
    const separate = await contextRequest(site, cookie, fresh.id, 'Another scene');
    await site.waitJob(separate.data.job.id, cookie);
    assert.equal(inputs[5].prompt, 'Another scene'); assert.equal(inputs[5].references.length, 0);
  } finally { await site.stop(); }
});

test('explicit earlier image creates a branch, retry uses the original context and cross-thread parents are rejected', async () => {
  const inputs = [];
  const site = await setup({ generate: async input => { inputs.push(input); return { data: [{ b64_json: png }] }; } });
  try {
    const cookie = await site.login();
    const thread = (await site.request('/api/threads', { method: 'POST', cookie, body: {} })).data.thread;
    const run = async (prompt, extra = {}) => {
      const r = await contextRequest(site, cookie, thread.id, prompt, extra); assert.equal(r.status, 202);
      return site.waitJob(r.data.job.id, cookie);
    };
    const first = await run('original design');
    await run('unrelated later branch');
    const branch = await run('change only the original', { contextParentId: first.id, references: [{ mediaId: first.images[0].id }] });
    assert.deepEqual(branch.context.turnIds, [first.id]); assert.equal(inputs[2].references.length, 1);
    assert.doesNotMatch(inputs[2].prompt, /unrelated later branch/);
    await run(branch.prompt, { contextParentId: branch.context.parentId, references: branch.referenceIds.map(mediaId => ({ mediaId })) });
    assert.equal(inputs[3].prompt, inputs[2].prompt); assert.equal(inputs[3].references.length, 1);
    const ownOther = (await site.request('/api/threads', { method: 'POST', cookie, body: {} })).data.thread;
    assert.equal((await contextRequest(site, cookie, ownOther.id, 'forged parent', { contextParentId: first.id })).status, 400);
    const otherCookie = await site.login('other@example.test');
    const otherThread = (await site.request('/api/threads', { method: 'POST', cookie: otherCookie, body: {} })).data.thread;
    assert.equal((await contextRequest(site, otherCookie, otherThread.id, 'forged other user', { contextParentId: first.id })).status, 400);
    assert.equal((await contextRequest(site, otherCookie, thread.id, 'forged thread')).status, 404);
    const otherJob = await contextRequest(site, otherCookie, otherThread.id, 'other account scene');
    await site.waitJob(otherJob.data.job.id, otherCookie);
    assert.equal(inputs.at(-1).prompt, 'other account scene'); assert.equal(inputs.at(-1).references.length, 0);
  } finally { await site.stop(); }
});

test('same-thread dependent jobs queue in order while other threads keep generating', async () => {
  const inputs = [], gates = [];
  const site = await setup({ concurrency: 2, generate: input => {
    inputs.push(input); return new Promise(resolve => gates.push(resolve));
  } });
  try {
    const cookie = await site.login();
    const thread = (await site.request('/api/threads', { method: 'POST', cookie, body: {} })).data.thread;
    const another = (await site.request('/api/threads', { method: 'POST', cookie, body: {} })).data.thread;
    const a = await contextRequest(site, cookie, thread.id, 'first design');
    const b = await contextRequest(site, cookie, thread.id, 'then change its light');
    const c = await contextRequest(site, cookie, another.id, 'separate parallel design');
    assert.equal(b.data.job.status, 'queued');
    assert.equal(site.app.queue.active, 2); assert.equal(site.app.queue.waiting, 1);
    assert.deepEqual(inputs.map(i => i.prompt), ['first design', 'separate parallel design']);
    gates[0]({ data: [{ b64_json: png }] });
    const first = await site.waitJob(a.data.job.id, cookie);
    assert.equal(gates.length, 3); assert.match(inputs[2].prompt, /first design.*then change its light/s);
    assert.equal(inputs[2].references.length, 1);
    gates[1]({ data: [{ b64_json: png }] }); gates[2]({ data: [{ b64_json: png }] });
    const second = await site.waitJob(b.data.job.id, cookie);
    assert.equal(second.context.parentId, first.id);
    assert.equal((await site.waitJob(c.data.job.id, cookie)).status, 'done');
  } finally {
    for (let i = 0; i < 20 && site.app.queue.active; i++) { gates.forEach(r => r({ data: [{ b64_json: png }] })); await new Promise(r => setTimeout(r, 5)); }
    await site.stop();
  }
});

test('context excludes failed turns, respects the six-turn/12000-character bounds and does not resend user references', async () => {
  const inputs = [];
  const site = await setup({ generate: async input => {
    inputs.push(input);
    if (input.prompt.endsWith('rejected fixture')) throw classifyFailure(400, { error: { code: 'content_policy_violation' } });
    return { data: [{ b64_json: png }] };
  } });
  try {
    const cookie = await site.login();
    const thread = (await site.request('/api/threads', { method: 'POST', cookie, body: {} })).data.thread;
    const run = async (prompt, extra) => { const r = await contextRequest(site, cookie, thread.id, prompt, extra); return site.waitJob(r.data.job.id, cookie); };
    for (let i = 0; i < 8; i++) await run(`history ${i}`);
    let last = await run('bounded continuation');
    assert.equal(last.context.turnIds.length, 6); assert.doesNotMatch(inputs.at(-1).prompt, /history 0|history 1/);
    assert.equal((await run('rejected fixture')).status, 'failed');
    last = await run('safe continuation', { references: [{ dataUrl: `data:image/png;base64,${png}` }] });
    assert.doesNotMatch(inputs.at(-1).prompt, /rejected fixture/); assert.equal(inputs.at(-1).references.length, 1);
    assert.equal(last.context.imageId, null);
    for (let i = 0; i < 5; i++) await run(`${i}`.repeat(4000));
    last = await run('long history continuation');
    assert.equal(last.context.turnIds.length, 3);
    assert(inputs.at(-1).prompt.length < 13000);
  } finally { await site.stop(); }
});
