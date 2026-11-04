import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createStore } from '../server/store.mjs';
import { createKeyProvider } from '../server/editor/keys.mjs';
import { GatewayError } from '../server/gateway.mjs';
import { createApplication } from '../server/index.mjs';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'studio-key-lifecycle-'));
  let store = createStore(directory);
  const calls = { reads: [], creates: [] };
  const records = new Map();
  const failures = new Map();
  let sequence = 1000, createFailure;
  const session = userId => {
    const token = store.saveSession({ id: userId, status: 'active' }, 'fixture-access-' + userId, null, 3600);
    return store.session(token);
  };
  const sessions = [session(1), session(2)];
  const gateway = {
    model: 'gpt-image-2.5',
    async getKey(token, keyId, context) {
      calls.reads.push({ token, keyId, context });
      if (failures.has(keyId)) throw failures.get(keyId);
      const row = records.get(keyId);
      if (!row || token !== 'fixture-access-' + row.user_id) throw new GatewayError('Key not found', 404, false, 'key_not_found');
      return structuredClone(row);
    },
    async createKey(token, groupId, context) {
      calls.creates.push({ token, groupId, context });
      if (createFailure) throw createFailure;
      const userId = Number(token.split('-').at(-1));
      const row = { id: ++sequence, user_id: userId, group_id: groupId, group_ids: [groupId],
        key: 'fixture-new-key-' + sequence, status: 'active', expires_at: null };
      records.set(row.id, row);
      return structuredClone(row);
    }
  };
  function cached(userId = 1, groupId = 12, patch = {}) {
    const row = { id: userId * 100 + groupId, user_id: userId, group_id: groupId, group_ids: [groupId],
      key: `fixture-cached-key-${userId}-${groupId}`, status: 'active', expires_at: null, ...patch };
    records.set(row.id, row);
    store.putKey(userId, groupId, row.key, row.id);
    return row;
  }
  const provider = createKeyProvider(store, gateway);
  const close = () => {
    store.close();
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep + 'studio-key-lifecycle-'));
    rmSync(directory, { recursive: true, force: true });
  };
  return { get store() { return store; }, directory, gateway, provider, calls, records, failures, sessions, cached, close,
    restart() { store.close(); store = createStore(directory); return createKeyProvider(store, gateway); },
    failCreation(error) { createFailure = error; } };
}

test('inspecting a connection creates no credential and exposes only safe status', async () => {
  const f = fixture();
  try {
    const [session] = f.sessions;
    assert.equal((await f.provider.inspect(session, 12)).state, 'unlinked');
    const row = f.cached();
    const result = await f.provider.inspect(session, 12);
    assert.equal(result.state, 'ready');
    assert.equal(result.groupId, 12);
    assert.equal(result.keyId, row.id);
    assert.doesNotMatch(JSON.stringify(result), /fixture-(?:cached|access)|encrypted_key|accessToken/);
    assert.equal(f.calls.creates.length, 0);
  } finally { f.close(); }
});

test('a first connection still creates one personal group key and subsequently validates it', async () => {
  const f = fixture();
  try {
    const [session] = f.sessions;
    const key = await f.provider(session, 12);
    assert.match(key, /^fixture-new-key-/);
    assert.equal(await f.provider(session, 12), key);
    assert.equal(f.calls.creates.length, 1);
    assert.ok(f.calls.reads.length >= 1);
  } finally { f.close(); }
});

for (const [state, change] of [
  ['deleted', (f, row) => f.records.delete(row.id)],
  ['disabled', (_f, row) => { row.status = 'inactive'; }],
  ['expired', (_f, row) => { row.expires_at = new Date(Date.now() - 60000).toISOString(); }],
  ['group_changed', (_f, row) => { row.group_id = 15; row.group_ids = [15]; }],
  ['invalid', (_f, row) => { row.key = 'fixture-rotated-key-different'; }]
]) {
  test(`${state} cached keys stop dispatch without silently creating a replacement`, async () => {
    const f = fixture();
    try {
      const [session] = f.sessions, row = f.cached();
      change(f, row);
      const status = await f.provider.inspect(session, 12);
      assert.equal(status.state, state);
      assert.equal(status.keyId, row.id);
      await assert.rejects(f.provider(session, 12), error =>
        error instanceof GatewayError && error.reason === 'studio_key_' + state && !error.uncertain);
      assert.equal(f.calls.creates.length, 0);
      assert.equal(f.store.getKey(1, 12).keyId, row.id);
    } finally { f.close(); }
  });
}

test('re-enabling the original key restores use without replacing the user credential', async () => {
  const f = fixture();
  try {
    const [session] = f.sessions, row = f.cached(1, 12, { status: 'inactive' });
    await assert.rejects(f.provider(session, 12));
    row.status = 'active';
    assert.equal((await f.provider.inspect(session, 12)).state, 'ready');
    assert.equal(await f.provider(session, 12), row.key);
    assert.equal(f.calls.creates.length, 0);
  } finally { f.close(); }
});

test('a multigroup key remains usable when it still includes the selected group', async () => {
  const f = fixture();
  try {
    const row = f.cached(1, 12, { group_id: 15, group_ids: [15, 12] });
    assert.equal(await f.provider(f.sessions[0], 12), row.key);
    assert.equal(f.calls.creates.length, 0);
  } finally { f.close(); }
});

test('login and lookup service failures are not treated as credential deletion', async () => {
  const f = fixture();
  try {
    const [session] = f.sessions, row = f.cached();
    for (const failure of [
      new GatewayError('Login expired', 401, false, 'authentication_expired'),
      new GatewayError('Service unavailable', 503, false, 'account_unavailable'),
      new GatewayError('Unrelated missing route', 404, false, 'account_request_rejected')
    ]) {
      f.failures.set(row.id, failure);
      for (const operation of [() => f.provider.inspect(session, 12), () => f.provider(session, 12),
        () => f.provider.reconnect(session, 12, row.id)]) {
        await assert.rejects(operation(), error => error.reason !== 'studio_key_deleted');
      }
      assert.equal(f.store.getKey(1, 12).keyId, row.id);
    }
    assert.equal(f.calls.creates.length, 0);
  } finally { f.close(); }
});

test('explicit reconnect replaces a deleted key once despite concurrent or repeated recovery clicks', async () => {
  const f = fixture();
  try {
    const [session] = f.sessions, old = f.cached();
    f.records.delete(old.id);
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => f.provider.reconnect(session, 12, old.id)));
    assert.ok(results.some(result => result.status === 'fulfilled' && result.value.state === 'ready'));
    assert.equal(f.calls.creates.length, 1);
    const replacement = f.store.getKey(1, 12);
    assert.notEqual(replacement.keyId, old.id);
    const repeated = await Promise.allSettled([f.provider.reconnect(session, 12, old.id)]);
    if (repeated[0].status === 'fulfilled') assert.equal(repeated[0].value.state, 'ready');
    assert.equal(f.calls.creates.length, 1);
    assert.equal(await f.provider(session, 12), replacement.key);
  } finally { f.close(); }
});

test('ready connections never create an unnecessary key and failed creation is not retried', async () => {
  const f = fixture();
  try {
    const [session] = f.sessions, row = f.cached();
    assert.equal((await f.provider.reconnect(session, 12, row.id)).state, 'ready');
    assert.equal(f.calls.creates.length, 0);
    f.records.delete(row.id);
    f.failCreation(new GatewayError('Creation response unknown', 502, true, 'key_creation_unknown'));
    await assert.rejects(f.provider.reconnect(session, 12, row.id));
    assert.equal(f.calls.creates.length, 1);
    assert.equal(f.store.getKey(1, 12).keyId, row.id);
  } finally { f.close(); }
});

test('reconnecting one account and group preserves other cached connections', async () => {
  const f = fixture();
  try {
    const old = f.cached(1, 12), otherGroup = f.cached(1, 15), otherUser = f.cached(2, 12);
    f.records.delete(old.id);
    await f.provider.reconnect(f.sessions[0], 12, old.id);
    assert.equal(f.store.getKey(1, 15).key, otherGroup.key);
    assert.equal(f.store.getKey(2, 12).key, otherUser.key);
    assert.equal(await f.provider(f.sessions[0], 15), otherGroup.key);
    assert.equal(await f.provider(f.sessions[1], 12), otherUser.key);
    assert.deepEqual(f.calls.creates.map(({ token, groupId }) => ({ token, groupId })),
      [{ token: 'fixture-access-1', groupId: 12 }]);
  } finally { f.close(); }
});

for (const [label, error] of [
  ['network disconnection', new TypeError('fixture connection closed before response')],
  ['5xx response', new GatewayError('fixture gateway error', 503, false, 'account_unavailable')]
]) {
  test(`${label} during creation keeps an unknown outcome across restart without another write`, async () => {
    const f = fixture();
    try {
      const [session] = f.sessions, old = f.cached();
      f.records.delete(old.id);
      f.failCreation(error);
      await assert.rejects(f.provider.reconnect(session, 12, old.id), value => value.reason === 'studio_key_unknown');
      assert.equal(f.calls.creates.length, 1);
      const restarted = f.restart();
      assert.equal((await restarted.inspect(session, 12)).state, 'unknown');
      f.failCreation(undefined);
      await assert.rejects(restarted(session, 12), value => value.reason === 'studio_key_unknown');
      await assert.rejects(restarted.reconnect(session, 12, old.id), value => value.reason === 'studio_key_unknown');
      assert.equal(f.calls.creates.length, 1);
      assert.equal(f.store.getKey(1, 12).keyId, old.id);
    } finally { f.close(); }
  });
}

test('an explicit 4xx creation rejection allows a later deliberate reconnect attempt', async () => {
  const f = fixture();
  try {
    const [session] = f.sessions, old = f.cached();
    f.records.delete(old.id);
    f.failCreation(new GatewayError('fixture key creation denied', 403, false, 'account_access_denied'));
    await assert.rejects(f.provider.reconnect(session, 12, old.id), value => value.reason === 'account_access_denied');
    assert.equal(f.calls.creates.length, 1);
    const restarted = f.restart();
    assert.equal((await restarted.inspect(session, 12)).state, 'deleted');
    f.failCreation(undefined);
    assert.equal((await restarted.reconnect(session, 12, old.id)).state, 'ready');
    assert.equal(f.calls.creates.length, 2);
  } finally { f.close(); }
});

async function httpFixture() {
  const f = fixture();
  f.gateway.profile = async token => ({ id: Number(token.split('-').at(-1)), status: 'active', balance: 10 });
  f.gateway.groups = async () => [{ id: 12, platform: 'openai', name: 'Fixture image group', allow_image_generation: true }];
  const paidCalls = [];
  f.gateway.generate = async () => { paidCalls.push('image'); throw new Error('unexpected paid image call'); };
  f.gateway.converse = async () => { paidCalls.push('chat'); throw new Error('unexpected paid chat call'); };
  const app = createApplication({ dataDir: f.directory, gateway: f.gateway, publicOrigin: 'http://127.0.0.1:8788' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + app.server.address().port;
  const token = f.store.saveSession({ id: 1, status: 'active' }, 'fixture-access-1', null, 3600);
  const call = async (path, { body, anonymous = false, headers = {} } = {}) => {
    const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(!anonymous ? { cookie: 'studio_sid=' + token } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  };
  return { ...f, call, paidCalls, async stop() { await app.close(); f.close(); } };
}

test('connection HTTP endpoints require authentication, allowed groups and explicit creation confirmation', async () => {
  const f = await httpFixture();
  try {
    assert.equal((await f.call('/api/key-connection?groupId=12', { anonymous: true })).status, 401);
    assert.equal((await f.call('/api/key-connection', { anonymous: true, body: { groupId: 12, confirmed: true, expectedKeyId: null } })).status, 401);
    for (const value of ['', '0', '-1', '1.5', 'abc']) {
      assert.equal((await f.call('/api/key-connection?groupId=' + value)).status, 400);
    }
    assert.equal((await f.call('/api/key-connection?groupId=15')).status, 403);
    assert.equal((await f.call('/api/key-connection', { body: { groupId: 15, confirmed: true, expectedKeyId: null } })).status, 403);
    const status = await f.call('/api/key-connection?groupId=12');
    assert.equal(status.status, 200); assert.equal(status.data.state, 'unlinked');
    for (const body of [
      { groupId: 12, expectedKeyId: null },
      { groupId: 12, confirmed: false, expectedKeyId: null },
      { groupId: 12, confirmed: 'true', expectedKeyId: null },
      { groupId: 12, confirmed: true },
      { groupId: 12, confirmed: true, expectedKeyId: 0 },
      { groupId: 12, confirmed: true, expectedKeyId: '112' }
    ]) assert.equal((await f.call('/api/key-connection', { body })).status, 400);
    assert.equal((await f.call('/api/key-connection', { body: { groupId: 12, confirmed: true, expectedKeyId: null },
      headers: { origin: 'https://other-site.example.invalid' } })).status, 403);
    assert.equal(f.calls.creates.length, 0); assert.deepEqual(f.paidCalls, []);
  } finally { await f.stop(); }
});

test('connection HTTP recovery checks the observed key, returns safe status and never submits a model request', async () => {
  const f = await httpFixture();
  try {
    const old = f.cached(); f.records.delete(old.id);
    const checked = await f.call('/api/key-connection?groupId=12');
    assert.equal(checked.status, 200); assert.equal(checked.data.state, 'deleted');
    assert.equal(checked.data.keyId, old.id);
    assert.equal((await f.call('/api/key-connection', { body: { groupId: 12, confirmed: true, expectedKeyId: old.id + 1 } })).status, 409);
    assert.equal(f.calls.creates.length, 0);
    const body = { groupId: 12, confirmed: true, expectedKeyId: old.id };
    const recovered = await f.call('/api/key-connection', { body });
    assert.equal(recovered.status, 200); assert.equal(recovered.data.state, 'ready');
    assert.notEqual(recovered.data.keyId, old.id);
    assert.doesNotMatch(JSON.stringify(recovered.data), /fixture-(?:new|cached|access)|encrypted_key|accessToken/);
    assert.equal((await f.call('/api/key-connection', { body })).status, 200);
    assert.equal(f.calls.creates.length, 1); assert.deepEqual(f.paidCalls, []);
    assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM messages').get().n, 0);
  } finally { await f.stop(); }
});

for (const state of ['deleted', 'disabled']) {
  test(`${state} cached keys fail real queued image and chat tasks without model dispatch, replacement or replay`, async () => {
    const f = await httpFixture();
    try {
      const old = f.cached();
      if (state === 'deleted') f.records.delete(old.id);
      else old.status = 'inactive';
      const failedJobs = [];
      for (const path of ['/api/jobs', '/api/chat']) {
        const created = await f.call('/api/threads', { body: {} });
        assert.equal(created.status, 201);
        const body = { clientRequestId: crypto.randomUUID(), threadId: created.data.thread.id,
          prompt: 'A blue chair beside a window', groupId: 12, size: '2K', count: 1, references: [] };
        const submitted = await f.call(path, { body });
        assert.equal(submitted.status, 202);
        const id = submitted.data.job.id;
        let result;
        for (let attempt = 0; attempt < 100; attempt++) {
          const response = await f.call('/api/jobs/' + id);
          assert.equal(response.status, 200);
          result = response.data.job;
          if (!['queued', 'running'].includes(result.status)) break;
          await new Promise(resolve => setTimeout(resolve, 5));
        }
        assert.equal(result.status, 'failed');
        assert.equal(result.kind, path === '/api/chat' ? 'chat' : 'image');
        assert.match(result.error, state === 'deleted' ? /生图 Key 已被删除/ : /生图 Key 已被停用/);
        assert.doesNotMatch(result.error, /重新登录|结果待核对|fixture-/);
        const reads = f.calls.reads.length;
        const repeated = await f.call(path, { body });
        assert.equal(repeated.status, 200);
        assert.equal(repeated.data.duplicate, true);
        assert.equal(repeated.data.job.id, id);
        assert.equal(repeated.data.job.status, 'failed');
        assert.equal(f.calls.reads.length, reads);
        failedJobs.push(id);
      }
      assert.equal(f.calls.reads.length, 2);
      assert.equal(f.calls.creates.length, 0);
      assert.deepEqual(f.paidCalls, []);
      assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM messages').get().n, 2);
      if (state === 'disabled') {
        old.status = 'active';
        assert.equal((await f.call('/api/key-connection?groupId=12')).data.state, 'ready');
      } else {
        const recovered = await f.call('/api/key-connection', { body: { groupId: 12, confirmed: true, expectedKeyId: old.id } });
        assert.equal(recovered.status, 200);
        assert.equal(recovered.data.state, 'ready');
        assert.equal(f.calls.creates.length, 1);
      }
      for (const id of failedJobs) assert.equal((await f.call('/api/jobs/' + id)).data.job.status, 'failed');
      assert.deepEqual(f.paidCalls, []);
      assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM messages').get().n, 2);
    } finally { await f.stop(); }
  });
}
