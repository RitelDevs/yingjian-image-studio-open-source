import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

// The exact same behavioral checks can exercise the root's frozen-bundle factory.
const target = process.env.STUDIO_CLIENT_FACTORY
  ? pathToFileURL(process.env.STUDIO_CLIENT_FACTORY).href : new URL('../src/sub2api-client.js', import.meta.url).href;
const loaded = await import(target);
const createClient = loaded.createSub2apiStudioClient ?? loaded.default;
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; }
async function until(predicate) { for (let i = 0; i < 30 && !predicate(); i++) await tick(); assert.ok(predicate(), 'operation reached its expected barrier'); }

async function fixture() {
  let observer, onError, pending, clock = 0, authorityGate, profileGate, writeGate, authorityError;
  let userId = 1, checks = 0;
  const calls = [], phases = [];
  const session = () => ({user: userId == null ? null : {uid: 'sub2api:' + userId}, csrf: 'a'.repeat(43)});
  const consumer = {
    session: session(),
    get pending() { return pending; },
    refresh() {
      if (pending) return pending;
      checks++;
      pending = (async () => {
        await authorityGate?.promise;
        if (authorityError) throw authorityError;
        consumer.session = session();
        await observer(consumer.session);
        return consumer.session;
      })().catch(error => { onError(error); throw error; }).finally(() => { pending = undefined; });
      return pending;
    },
    async logout() { userId = null; consumer.session = session(); await observer(consumer.session); },
    stop() {},
  };
  const client = createClient({now: () => clock,
    loadBrowser: async () => ({bootstrapSub2apiConsumer: async options => {
      observer = options.onSession; onError = options.onError;
      await consumer.refresh(); return consumer;
    }}),
    fetch: async (url, options) => {
      calls.push({url, method: options.method ?? 'GET', csrf: options.headers.get('X-CSRF-Token')});
      if (url === '/api/me') {
        const id = userId;
        await profileGate?.promise;
        return id == null ? Response.json({error: 'anonymous'}, {status: 401}) : Response.json({user: {id}, groups: []});
      }
      if (options.method === 'POST') { await writeGate?.promise; return Response.json({applied: true, id: 123}); }
      return Response.json({items: []});
    }});
  client.configure({accountMode: 'sub2api', accountOrigin: 'https://account.example.test'});
  client.subscribe(value => phases.push({phase: value.phase, hasAccount: !!value.account}));
  await client.start();
  return {client, consumer, calls, phases, get checks() { return checks; },
    time(value) { clock = value; }, user(value) { userId = value; },
    holdAuthority() { return authorityGate = deferred(); }, holdProfile() { return profileGate = deferred(); },
    holdWrite() { return writeGate = deferred(); }, failAuthority(value) { authorityError = value; }};
}

test('same-user refresh preserves successful in-flight mutation and queues HTTP through profile hydration', {timeout: 2000}, async () => {
  const f = await fixture(), ownerVersion = f.client.snapshot.ownerVersion;
  const write = f.holdWrite();
  const sent = f.client.call('/api/threads', {method: 'POST', body: '{}'});
  await until(() => f.calls.some(x => x.method === 'POST'));
  f.time(30001); const authority = f.holdAuthority(), profile = f.holdProfile();
  const refresh = f.client.refresh();
  let queuedDone = false, sentDone = false;
  const queued = f.client.call('/api/threads').then(value => { queuedDone = true; return value; });
  sent.then(() => { sentDone = true; });
  write.resolve(); await tick();
  assert.equal(sentDone, false); assert.equal(queuedDone, false);
  assert.equal(f.calls.filter(x => x.url === '/api/threads').length, 1);
  authority.resolve(); await until(() => f.calls.filter(x => x.url === '/api/me').length === 2);
  assert.equal(f.calls.filter(x => x.url === '/api/threads').length, 1);
  profile.resolve(); await refresh;
  assert.deepEqual(await sent, {applied: true, id: 123});
  assert.deepEqual(await queued, {items: []});
  assert.equal(f.client.snapshot.ownerVersion, ownerVersion);
  assert.equal(f.calls.filter(x => x.method === 'POST').length, 1, 'mutation is never replayed');
  assert.equal(f.calls.find(x => x.method === 'POST').csrf, 'a'.repeat(43));
  assert.equal(f.phases.some(x => x.hasAccount && x.phase === 'checking'), false, 'foreground refresh is silent');
});

test('successful foreground checks reuse 30 seconds; explicit force and failed checks bypass cache', async () => {
  const f = await fixture();
  f.time(29999); await f.client.refresh(); await f.client.refresh(); assert.equal(f.checks, 1);
  f.time(30000); await f.client.refresh(); assert.equal(f.checks, 2);
  await f.client.refresh({force: true}); assert.equal(f.checks, 3);
  f.failAuthority(new Error('offline'));
  await assert.rejects(f.client.refresh({force: true}), /offline/);
  assert.equal(f.client.snapshot.phase, 'unavailable'); assert.equal(f.client.snapshot.account.user.id, 1);
  f.failAuthority(null); await f.client.refresh();
  assert.equal(f.checks, 5); assert.equal(f.client.snapshot.phase, 'ready');
});

test('identity change rejects queued owner writes before dispatch and old responses without replay', {timeout: 2000}, async () => {
  const f = await fixture(), scoped = f.client.forAccount(1), write = f.holdWrite();
  const sentResult = scoped('/api/threads', {method: 'POST', body: '{}'}).catch(error => error);
  await until(() => f.calls.some(x => x.method === 'POST'));
  const authority = f.holdAuthority();
  const refresh = f.client.refresh({force: true});
  const queuedResult = scoped('/api/threads', {method: 'POST', body: '{}'}).catch(error => error);
  f.user(2); authority.resolve(); await refresh; write.resolve();
  assert.equal((await sentResult).code, 'session_superseded');
  assert.equal((await queuedResult).code, 'session_superseded');
  assert.equal(f.calls.filter(x => x.method === 'POST').length, 1);
  assert.equal(f.client.snapshot.account.user.id, 2);
});

test('consumer-initiated restoration awaits /me and blocks business HTTP without an adapter refresh', {timeout: 2000}, async () => {
  const f = await fixture(), profile = f.holdProfile();
  const restore = f.consumer.refresh();
  await until(() => f.calls.filter(x => x.url === '/api/me').length === 2);
  let completed = false;
  restore.then(() => { completed = true; });
  const request = f.client.call('/api/threads');
  await tick(); assert.equal(completed, false);
  assert.equal(f.calls.some(x => x.url === '/api/threads'), false);
  profile.resolve(); await restore; await request;
  assert.equal(f.client.snapshot.phase, 'ready');
});

test('authority failure keeps drafts but does not dispatch a waiting mutation', async () => {
  const f = await fixture(), authority = f.holdAuthority(), original = f.client.snapshot.account;
  const refresh = f.client.refresh({force: true}).catch(error => error);
  const queued = f.client.call('/api/threads', {method: 'POST', body: '{}'}).catch(error => error);
  f.failAuthority(new Error('offline')); authority.resolve();
  assert.match((await refresh).message, /offline/); assert.match((await queued).message, /offline/);
  assert.equal(f.calls.some(x => x.method === 'POST'), false);
  assert.equal(f.client.snapshot.account, original);
});

test('aborted waiting mutation is not sent after a successful check', async () => {
  const f = await fixture(), authority = f.holdAuthority(), controller = new AbortController();
  const refresh = f.client.refresh({force: true});
  const queued = f.client.call('/api/threads', {method: 'POST', body: '{}', signal: controller.signal}).catch(error => error);
  controller.abort(); authority.resolve(); await refresh;
  assert.equal((await queued).name, 'AbortError');
  assert.equal(f.calls.some(x => x.method === 'POST'), false);
});

test('confirmed anonymous state retires the previous owner instead of retaining its workspace', async () => {
  const f = await fixture(), scoped = f.client.forAccount(1);
  f.user(null); await f.client.refresh({force: true});
  assert.equal(f.client.snapshot.phase, 'anonymous'); assert.equal(f.client.snapshot.account, null);
  await assert.rejects(scoped('/api/threads'), error => error.code === 'session_superseded');
});
