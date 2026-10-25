import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createApplication } from '../server/index.mjs';
import { createGateway } from '../server/gateway.mjs';
import { STYLE_CATALOG } from '../shared/style-catalog.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fJkAAAAASUVORK5CYII=';
const reference = { dataUrl: `data:image/png;base64,${png}` };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const defaultStyle = STYLE_CATALOG.find(style => style.id === 'retro-poster');

async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-style-test-'));
  const calls = { images: [], chats: [], keys: [], wire: [] };
  const groups = [{ id: 2, name: '本地测试', platform: 'openai', allow_image_generation: true }];
  const profile = token => ({ id: Number(token), email: `${token}@example.invalid`, balance: 10, status: 'active' });
  let upstream;
  if (options.wire) {
    upstream = createServer(async (req, res) => {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const type = req.headers['content-type'];
      const fields = type?.startsWith('multipart/')
        ? await new Response(body, { headers: { 'content-type': type } }).formData()
        : JSON.parse(body.toString());
      calls.wire.push({ route: req.url, fields });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ b64_json: png }] }));
    });
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  }
  const real = upstream && createGateway(`http://127.0.0.1:${upstream.address().port}`, 'gpt-image-2.5');
  const gateway = {
    model: 'gpt-image-2.5',
    login: async email => { const id = email.startsWith('other') ? '2' : '1'; return { user: profile(id), access_token: id, expires_in: 3600 }; },
    profile: async token => profile(token),
    groups: async () => { if (options.groupCheck) await options.groupCheck(); return groups; },
    createKey: async (token, groupId) => { calls.keys.push({ token, groupId }); return { id: 1, key: 'local-test-placeholder-key' }; },
    converse: async (_, payload) => { calls.chats.push(payload); if (options.converse) return options.converse(payload); return JSON.stringify({ reply: '请确认。', ready: true, prompt: '普通对话整理的蓝色椅子。' }); },
    generate: async (key, payload) => { calls.images.push(payload); return real ? real.generate(key, payload) : { data: Array.from({ length: payload.count }, () => ({ b64_json: png })) }; }
  };
  const app = createApplication({ dataDir: directory, gateway, concurrency: 3, ssoEnabled: false, publicOrigin: '' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  async function request(path, { cookie, body, method, headers = {} } = {}) {
    const response = await fetch(origin + path, { method: method || (body !== undefined ? 'POST' : 'GET'),
      headers: { ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = async (email = 'one@example.invalid') => (await request('/api/login', { body: { email, password: 'test-placeholder' } })).cookie;
  const thread = async cookie => (await request('/api/threads', { cookie, body: {} })).data.thread.id;
  const body = (threadId, patch = {}) => ({ clientRequestId: crypto.randomUUID(), threadId,
    styleId: defaultStyle.id, styleVersion: defaultStyle.version, subject: '一杯冰拿铁，放在窗边木桌上', title: '周末放空',
    size: '2K', aspectRatio: '3:4', count: 1, groupId: 2, references: [], ...patch });
  const prepare = (cookie, threadId, patch) => request('/api/style-plans', { cookie, body: body(threadId, patch) });
  const confirm = (cookie, id, patch = {}) => request(`/api/plans/${id}/confirm`, { cookie, body: { confirmed: true, ...patch } });
  const wait = async (cookie, id) => {
    for (let n = 0; n < 300; n++) {
      const result = await request(`/api/jobs/${id}`, { cookie });
      if (!['queued', 'running'].includes(result.data.job?.status)) return result.data.job;
      await pause(10);
    }
    throw new Error('Local task did not settle');
  };
  const chat = (cookie, threadId, patch = {}) => request('/api/chat', { cookie, body: {
    clientRequestId: crypto.randomUUID(), threadId, prompt: '一把蓝色椅子，保持写实摄影。', groupId: 2, size: '2K', count: 1, references: [], ...patch
  } });
  t.after(async () => {
    for (let i = 0; app.queue.active && i < 500; i++) await pause(10);
    assert.equal(app.queue.active, 0, 'Queue must settle before cleanup');
    await new Promise(resolve => app.server.close(resolve)); app.close();
    if (upstream) await new Promise(resolve => upstream.close(resolve));
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir())); assert.ok(basename(target).startsWith('studio-style-test-'));
    rmSync(target, { recursive: true, force: true });
  });
  return { app, calls, groups, request, login, thread, body, prepare, confirm, wait, chat };
}

test('style preparation is local and confirmation pins prompt, settings, style and exactly one image job', async t => {
  const f = await fixture(t), cookie = await f.login(), threadId = await f.thread(cookie);
  const ready = await f.prepare(cookie, threadId, { count: 2 });
  assert.equal(ready.status, 201, JSON.stringify(ready.data));
  const plan = ready.data.job;
  assert.equal(plan.kind, 'chat'); assert.equal(plan.status, 'done'); assert.equal(plan.proposal.state, 'ready');
  assert.equal(plan.proposal.style.version, defaultStyle.version); assert.equal(plan.proposal.style.id, defaultStyle.id);
  assert.ok(plan.proposal.prompt.includes('周末放空'));
  assert.deepEqual(plan.proposal.context, { enabled: false });
  assert.equal(f.calls.images.length + f.calls.chats.length + f.calls.keys.length, 0);
  assert.equal(f.app.queue.active + f.app.queue.waiting, 0);
  assert.equal((await f.confirm(cookie, plan.id, { confirmed: false })).status, 400);
  assert.equal((await f.confirm(cookie, plan.id, { prompt: '替换已确认的完整配方' })).status, 409);
  const responses = await Promise.all([f.confirm(cookie, plan.id, { prompt: plan.proposal.prompt, size: '4K', count: 4 }), f.confirm(cookie, plan.id)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 202]);
  assert.equal(responses[0].data.job.id, responses[1].data.job.id);
  const job = await f.wait(cookie, responses[0].data.job.id);
  assert.equal(job.status, 'done'); assert.equal(job.images.length, 2);
  assert.deepEqual(job.context.style, plan.proposal.style);
  assert.equal(f.calls.chats.length, 0); assert.equal(f.calls.images.length, 1); assert.equal(f.calls.keys.length, 1);
  assert.equal(f.calls.images[0].prompt, plan.proposal.prompt);
  assert.equal(f.calls.images[0].size, '2K'); assert.equal(f.calls.images[0].count, 2); assert.equal(f.calls.images[0].aspectRatio, '3:4');
});

test('parallel retries create one plan and request ids cannot cross operation or thread boundaries', async t => {
  const f = await fixture(t), cookie = await f.login(), threadId = await f.thread(cookie);
  const body = f.body(threadId);
  const results = await Promise.all(Array.from({ length: 4 }, () => f.request('/api/style-plans', { cookie, body })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 200, 200, 201]);
  assert.equal(new Set(results.map(r => r.data.job.id)).size, 1);
  assert.equal(f.app.store.messages(threadId, 1).length, 1);
  assert.equal((await f.request('/api/style-plans', { cookie, body: { ...body, threadId: await f.thread(cookie) } })).status, 409);
  const chat = await f.chat(cookie, threadId); await f.wait(cookie, chat.data.job.id);
  const chatId = f.app.store.db.prepare('SELECT client_request_id FROM messages WHERE id=?').get(chat.data.job.id).client_request_id;
  assert.equal((await f.prepare(cookie, threadId, { clientRequestId: chatId })).status, 409);
});

test('unknown style, stale versions and invalid fields do not create records or call models', async t => {
  const f = await fixture(t), cookie = await f.login(), threadId = await f.thread(cookie);
  const cases = [
    [{ styleId: 'missing-style' }, 404], [{ styleVersion: 'not-current' }, 409], [{ styleVersion: null }, 409],
    [{ subject: '' }, 400], [{ subject: '   ' }, 400], [{ subject: 123 }, 400], [{ subject: '字'.repeat(1201) }, 400],
    [{ title: '字'.repeat(81) }, 400], [{ title: {} }, 400], [{ title: null }, 400], [{ threadId: null }, 400], [{ styleId: 'clay-avatar', title: '不支持的标题' }, 400],
    [{ count: 0 }, 400], [{ count: 5 }, 400], [{ size: '8K' }, 400], [{ aspectRatio: '9:1' }, 400],
    [{ references: {} }, 400], [{ references: Array(5).fill(reference) }, 400], [{ references: [{}] }, 400]
  ];
  for (const [patch, status] of cases) assert.equal((await f.prepare(cookie, threadId, patch)).status, status, JSON.stringify(patch).slice(0, 100));
  assert.equal((await f.request('/api/style-plans', { cookie, body: null })).status, 400);
  assert.equal(f.app.store.messages(threadId, 1).length, 0);
  assert.equal(f.calls.images.length + f.calls.chats.length + f.calls.keys.length, 0);
});

test('authentication, group permissions, origin, thread ownership and reference ownership are enforced', async t => {
  const f = await fixture(t), cookie = await f.login(), other = await f.login('other@example.invalid');
  const threadId = await f.thread(cookie), otherThread = await f.thread(other);
  assert.equal((await f.prepare(null, threadId)).status, 401);
  assert.equal((await f.prepare(cookie, threadId, { groupId: 999 })).status, 403);
  assert.equal((await f.prepare(other, threadId)).status, 404);
  assert.equal((await f.request('/api/style-plans', { cookie, body: f.body(threadId), headers: { origin: 'https://foreign.invalid' } })).status, 403);
  const prepared = await f.prepare(cookie, threadId, { references: [reference] });
  assert.equal(prepared.status, 201);
  const plan = prepared.data.job;
  assert.equal((await f.confirm(other, plan.id)).status, 404);
  assert.equal((await f.prepare(other, otherThread, { references: [{ mediaId: plan.referenceIds[0] }] })).status, 400);
  f.groups.length = 0;
  assert.equal((await f.confirm(cookie, plan.id)).status, 403);
  assert.equal(f.calls.images.length + f.calls.keys.length, 0);
});

test('new style plan supersedes an older style or chat plan while other threads remain independent', async t => {
  const f = await fixture(t), cookie = await f.login(), threadId = await f.thread(cookie), independent = await f.thread(cookie);
  const outside = await f.prepare(cookie, independent);
  const first = await f.prepare(cookie, threadId);
  const second = await f.prepare(cookie, threadId, { subject: '一瓶柑橘汽水' });
  assert.equal((await f.confirm(cookie, first.data.job.id)).status, 409);
  const chat = await f.chat(cookie, threadId); const chatPlan = await f.wait(cookie, chat.data.job.id);
  assert.equal((await f.confirm(cookie, second.data.job.id)).status, 409);
  await f.prepare(cookie, threadId, { subject: '最后一版的柑橘汽水' });
  assert.equal((await f.confirm(cookie, chatPlan.id)).status, 409);
  assert.equal((await f.request(`/api/jobs/${outside.data.job.id}`, { cookie })).data.job.proposal.state, 'ready');
});

test('a slow chat response cannot reactivate its old proposal after a style plan was prepared', async t => {
  const started = deferred(), release = deferred();
  const f = await fixture(t, { converse: async () => { started.resolve(); await release.promise; return JSON.stringify({ reply: '旧方案', ready: true, prompt: '已过时的聊天方案' }); } });
  const cookie = await f.login(), threadId = await f.thread(cookie);
  const chat = await f.chat(cookie, threadId); await started.promise;
  try {
    const next = await f.prepare(cookie, threadId);
    assert.equal(next.status, 201); assert.equal(next.data.job.proposal.state, 'ready');
  } finally { release.resolve(); }
  assert.equal((await f.wait(cookie, chat.data.job.id)).proposal.state, 'superseded');
  assert.equal((await f.confirm(cookie, chat.data.job.id)).status, 409);
});

test('deletion during an awaited permission check does not resurrect a thread', async t => {
  const started = deferred(), release = deferred(); let held = false;
  const f = await fixture(t, { groupCheck: async () => { if (held) { started.resolve(); await release.promise; } } });
  const cookie = await f.login(), threadId = await f.thread(cookie);
  held = true;
  const preparing = f.prepare(cookie, threadId); await started.promise;
  try { assert.equal((await f.request(`/api/threads/${threadId}`, { cookie, method: 'DELETE' })).status, 200); }
  finally { release.resolve(); }
  assert.equal((await preparing).status, 404);
  assert.equal(f.app.store.messages(threadId, 1).length, 0);
});

test('confirmation rechecks supersession after an awaited permission check', async t => {
  const started = deferred(), release = deferred(); let holdNext = false;
  const f = await fixture(t, { groupCheck: async () => { if (holdNext) { holdNext = false; started.resolve(); await release.promise; } } });
  const cookie = await f.login(), threadId = await f.thread(cookie);
  const old = await f.prepare(cookie, threadId); holdNext = true;
  const confirming = f.confirm(cookie, old.data.job.id); await started.promise;
  try { assert.equal((await f.prepare(cookie, threadId, { subject: '更新后的主体' })).status, 201); }
  finally { release.resolve(); }
  assert.equal((await confirming).status, 409); assert.equal(f.calls.images.length, 0);
});

test('saved style version remains a snapshot even when it is not a current catalogue version', async t => {
  const f = await fixture(t), cookie = await f.login(), threadId = await f.thread(cookie);
  const result = await f.prepare(cookie, threadId), plan = result.data.job;
  // Simulate a plan saved by an earlier recipe release without mutating A\'s catalogue.
  const saved = { ...plan.proposal, style: { ...plan.proposal.style, version: '0.9.0' }, prompt: '上一版配方已给用户看过的完整提示词。' };
  f.app.store.db.prepare('UPDATE messages SET proposal_json=? WHERE id=?').run(JSON.stringify(saved), plan.id);
  const response = await f.confirm(cookie, plan.id, { prompt: saved.prompt });
  assert.equal(response.status, 202);
  const job = await f.wait(cookie, response.data.job.id);
  assert.equal(job.context.style.version, '0.9.0'); assert.equal(f.calls.images[0].prompt, saved.prompt);
});

test('references are copied into the plan and image job; expired references stop confirmation', async t => {
  const f = await fixture(t), cookie = await f.login(), threadId = await f.thread(cookie);
  const first = await f.prepare(cookie, threadId, { references: [reference] });
  const second = await f.prepare(cookie, threadId, { references: [{ mediaId: first.data.job.referenceIds[0] }] });
  const plan = second.data.job;
  assert.notEqual(plan.referenceIds[0], first.data.job.referenceIds[0]);
  const confirmed = await f.confirm(cookie, plan.id); const image = await f.wait(cookie, confirmed.data.job.id);
  assert.notEqual(image.referenceIds[0], plan.referenceIds[0]);
  assert.deepEqual(f.calls.images[0].references[0].bytes, Buffer.from(png, 'base64'));
  const expired = await f.prepare(cookie, threadId, { references: [reference] });
  f.app.store.db.prepare('UPDATE media SET expires_at=0 WHERE id=?').run(expired.data.job.referenceIds[0]);
  assert.equal((await f.confirm(cookie, expired.data.job.id)).status, 400);
  assert.equal(f.calls.images.length, 1);
});

test('style generation uses actual generations/edits gateway routes and never inherits old images', async t => {
  const f = await fixture(t, { wire: true }), cookie = await f.login(), threadId = await f.thread(cookie);
  const withRef = await f.prepare(cookie, threadId, { references: [reference] });
  const edited = await f.confirm(cookie, withRef.data.job.id); assert.equal((await f.wait(cookie, edited.data.job.id)).status, 'done');
  assert.equal(f.calls.wire[0].route, '/v1/images/edits');
  const fields = f.calls.wire[0].fields;
  // FormData encodes line endings as CRLF; the prompt text is otherwise identical.
  assert.equal(fields.get('prompt').replaceAll('\r\n', '\n'), withRef.data.job.proposal.prompt); assert.equal(fields.get('model'), 'gpt-image-2.5');
  assert.equal(fields.getAll('image[]').length, 1);
  assert.deepEqual(Buffer.from(await fields.get('image[]').arrayBuffer()), Buffer.from(png, 'base64'));
  const fresh = await f.prepare(cookie, threadId, { subject: '新的独立画面' });
  const generated = await f.confirm(cookie, fresh.data.job.id); await f.wait(cookie, generated.data.job.id);
  assert.equal(f.calls.wire[1].route, '/v1/images/generations');
  assert.equal(f.calls.wire[1].fields.prompt, fresh.data.job.proposal.prompt);
  assert.equal(f.calls.images[1].references.length, 0);
});

test('ordinary chat remains editable at confirmation and works after style generation', async t => {
  const f = await fixture(t), cookie = await f.login(), threadId = await f.thread(cookie);
  const prepared = await f.prepare(cookie, threadId), confirmed = await f.confirm(cookie, prepared.data.job.id);
  await f.wait(cookie, confirmed.data.job.id);
  const chat = await f.chat(cookie, threadId), plan = await f.wait(cookie, chat.data.job.id);
  assert.equal(plan.proposal.style, undefined);
  const result = await f.confirm(cookie, plan.id, { prompt: '普通聊天仍允许确认时修改提示词。' });
  assert.equal(result.status, 202); await f.wait(cookie, result.data.job.id);
  assert.equal(f.calls.images[1].prompt, '普通聊天仍允许确认时修改提示词。'); assert.equal(f.calls.chats.length, 1);
});

test('all sixteen additions prepare real saved plans without calling a model', async t => {
  const f = await fixture(t), cookie = await f.login(), threadId = await f.thread(cookie);
  for (const style of STYLE_CATALOG.slice(8)) {
    const response = await f.prepare(cookie, threadId, {
      styleId: style.id, styleVersion: style.version, ...style.example, ...style.defaultSettings,
      references: style.inputMode === 'reference' ? [reference] : []
    });
    assert.equal(response.status, 201, `${style.id}: ${JSON.stringify(response.data)}`);
    assert.equal(response.data.job.proposal.style.id, style.id);
    assert.equal(response.data.job.proposal.state, 'ready');
    assert(response.data.job.prompt.trim(), 'History must not have a blank label');
    assert.equal(response.data.job.referenceIds.length, style.inputMode === 'reference' ? 1 : 0);
  }
  assert.equal(f.calls.chats.length + f.calls.images.length + f.calls.keys.length, 0);
});

test('reference-only plans require an owned image and accept empty or omitted user prompts', async t => {
  const f = await fixture(t), cookie = await f.login(), threadId = await f.thread(cookie);
  const style = STYLE_CATALOG.find(item => item.id === 'photo-anime');
  const input = { styleId: style.id, styleVersion: style.version, subject: '', title: '', references: [] };
  assert.equal((await f.prepare(cookie, threadId, input)).status, 400);
  assert.equal(f.app.store.messages(threadId, 1).length, 0);
  const ready = await f.prepare(cookie, threadId, { ...input, subject: undefined, references: [reference] });
  assert.equal(ready.status, 201, JSON.stringify(ready.data));
  assert.match(ready.data.job.prompt, /参考图套用：照片转新海诚风格/);
  assert.match(ready.data.job.proposal.prompt, /本次上传的参考图/);
  assert.equal(f.calls.chats.length + f.calls.images.length, 0);
  const confirmed = await f.confirm(cookie, ready.data.job.id);
  assert.equal(confirmed.status, 202);
  const image = await f.wait(cookie, confirmed.data.job.id);
  assert.equal(image.status, 'done');
  assert.equal(f.calls.images.length, 1);
  assert.equal(f.calls.images[0].references.length, 1);
  assert.equal(f.calls.images[0].prompt, ready.data.job.proposal.prompt);
  for (const subject of [null, 42, {}, true]) {
    const bad = await f.prepare(cookie, threadId, { ...input, subject, references: [reference] });
    assert.equal(bad.status, 400, JSON.stringify(bad.data));
  }
});

test('scientific and content-card plans preserve supplied labels with an empty title', async t => {
  const f = await fixture(t), cookie = await f.login(), threadId = await f.thread(cookie);
  const subject = '传感器 → ESP32 → 风扇；标签：采集、判断、执行；不要添加其他节点。';
  for (const id of ['scientific-schematic', 'knowledge-card']) {
    const style = STYLE_CATALOG.find(item => item.id === id);
    const result = await f.prepare(cookie, threadId, { styleId: id, styleVersion: style.version, subject, title: '' });
    assert.equal(result.status, 201);
    assert(result.data.job.proposal.prompt.includes(subject));
    assert.match(result.data.job.proposal.prompt, /保留已提供的正文与标签/);
    assert.doesNotMatch(result.data.job.proposal.prompt, /不新增标题、标语、说明小字/);
  }
  assert.equal(f.calls.images.length + f.calls.chats.length, 0);
});

test('removable composer style is revoked persistently; own references and confirmed outputs remain intact', async t => {
  const f = await fixture(t), cookie = await f.login(), threadId = await f.thread(cookie), styleSelectionId = crypto.randomUUID();
  const plan = (await f.prepare(cookie, threadId, { styleSelectionId, references: [reference] })).data.job;
  assert.equal(plan.proposal.styleSelectionId, styleSelectionId);
  const canceled = await f.request(`/api/style-selections/${styleSelectionId}/revoke`, { cookie, body: {} });
  assert.equal(canceled.status, 200);
  assert.equal((await f.request(`/api/threads/${threadId}`, { cookie })).data.messages[0].proposal.state, 'revoked');
  assert.equal((await f.confirm(cookie, plan.id)).status, 409);
  assert(f.app.store.media(plan.referenceIds[0], 1));
  assert.equal((await f.prepare(cookie, threadId, { styleSelectionId })).status, 409);
  assert.equal(f.calls.images.length + f.calls.chats.length, 0);
  const newToken = crypto.randomUUID(), replacement = (await f.prepare(cookie, threadId, { styleSelectionId: newToken })).data.job;
  const generated = await f.confirm(cookie, replacement.id); await f.wait(cookie, generated.data.job.id);
  await f.request(`/api/style-selections/${newToken}/revoke`, { cookie, body: {} });
  assert.equal((await f.confirm(cookie, replacement.id)).status, 200, 'already submitted image remains idempotent, not canceled');
  assert.equal(f.calls.images.length, 1);
});

test('withdrawing while plan permissions are pending prevents the late plan from appearing', async t => {
  const started = deferred(), release = deferred(); let hold = false;
  const f = await fixture(t, { groupCheck: async () => { if (hold) { started.resolve(); await release.promise; } } });
  const cookie = await f.login(), threadId = await f.thread(cookie), styleSelectionId = crypto.randomUUID();
  hold = true;
  const preparing = f.prepare(cookie, threadId, { styleSelectionId }); await started.promise;
  try { assert.equal((await f.request(`/api/style-selections/${styleSelectionId}/revoke`, { cookie, body: {} })).status, 200); }
  finally { release.resolve(); }
  assert.equal((await preparing).status, 409);
  assert.equal(f.app.store.messages(threadId, 1).length, 0);
});

test('withdrawing while confirmation awaits permission prevents upstream image dispatch', async t => {
  const started = deferred(), release = deferred(); let hold = false;
  const f = await fixture(t, { groupCheck: async () => { if (hold) { started.resolve(); await release.promise; } } });
  const cookie = await f.login(), threadId = await f.thread(cookie), styleSelectionId = crypto.randomUUID();
  const plan = (await f.prepare(cookie, threadId, { styleSelectionId })).data.job;
  hold = true; const confirming = f.confirm(cookie, plan.id); await started.promise;
  try { await f.request(`/api/style-selections/${styleSelectionId}/revoke`, { cookie, body: {} }); }
  finally { release.resolve(); }
  assert.equal((await confirming).status, 409); assert.equal(f.calls.images.length, 0);
});

test('revocation is user scoped, and ordinary chat no longer inherits withdrawn style instructions or old references', async t => {
  const f = await fixture(t), cookie = await f.login(), other = await f.login('other@example.invalid'), threadId = await f.thread(cookie), styleSelectionId = crypto.randomUUID();
  const plan = (await f.prepare(cookie, threadId, { styleSelectionId, references: [reference] })).data.job;
  assert.equal((await f.request(`/api/style-selections/${styleSelectionId}/revoke`, { body: {} })).status, 401);
  await f.request(`/api/style-selections/${styleSelectionId}/revoke`, { cookie: other, body: {} });
  assert.equal((await f.request(`/api/jobs/${plan.id}`, { cookie })).data.job.proposal.state, 'ready');
  await f.request(`/api/style-selections/${styleSelectionId}/revoke`, { cookie, body: {} });
  const chat = await f.chat(cookie, threadId, { prompt: '现在只画一把蓝色椅子，背景白色，不要咖啡。', useContext: true });
  await f.wait(cookie, chat.data.job.id);
  assert.equal(f.calls.chats.length, 1);
  assert.equal(f.calls.chats[0].messages.length, 2);
  assert.equal(typeof f.calls.chats[0].messages.at(-1).content, 'string');
  assert(!JSON.stringify(f.calls.chats[0]).includes('复古广告海报'));
  assert(!JSON.stringify(f.calls.chats[0]).includes('周末放空'));
});

test('chat already in flight cannot publish an inherited style proposal after withdrawal', async t => {
  const started = deferred(), release = deferred();
  const f = await fixture(t, { converse: async () => { started.resolve(); await release.promise; return JSON.stringify({ reply: '旧风格', ready: true, prompt: '复古咖啡海报' }); } });
  const cookie = await f.login(), threadId = await f.thread(cookie), styleSelectionId = crypto.randomUUID();
  await f.prepare(cookie, threadId, { styleSelectionId });
  const chat = await f.chat(cookie, threadId); await started.promise;
  try { await f.request(`/api/style-selections/${styleSelectionId}/revoke`, { cookie, body: {} }); }
  finally { release.resolve(); }
  const result = await f.wait(cookie, chat.data.job.id);
  assert.equal(result.proposal, null); assert.match(result.assistantText, /取消了风格/); assert.equal(f.calls.images.length, 0);
});
