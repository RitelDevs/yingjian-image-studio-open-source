import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createApplication } from '../server/index.mjs';
import { compileStyleRecipe } from '../server/style-recipes.mjs';
import { STYLE_CATALOG } from '../shared/style-catalog.mjs';
import { normalizeStyleOptimization } from '../shared/style-optimization.mjs';
import { createStyleOptimizationSnapshot, buildStyleOptimizationRequest, parseStyleOptimizationAnswer, demoStyleOptimizationAnswer } from '../server/style-optimizer.mjs';

const product = STYLE_CATALOG.find(s => s.id === 'product-studio');
const subject = '一支黑色电影镜头，保持深灰背景与原有刻度';
const fields = { styleId: product.id, styleVersion: product.version, subject, title: '', hasReferences: false };
const snapshot = () => createStyleOptimizationSnapshot({ compiled: compileStyleRecipe(fields), ...fields, model: 'test-professional-chat' });
const answer = () => JSON.stringify({ ready: true, decisions: [
  { aspect: 'lighting', detail: '在黑色镜身上形成窄明暗带，镜片保留蓝紫镀膜反射。' },
  { aspect: 'viewpoint', detail: '三分之四视角展示前镜片和齿轮环，不改变镜头结构。' }
] });
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fJkAAAAASUVORK5CYII=';
const reference = { dataUrl: `data:image/png;base64,${png}` };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function fixture(t, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-professional-test-'));
  const calls = { chat: [], images: [], keys: 0 };
  const groups = [{ id: 2, platform: 'openai', name: '测试分组', allow_image_generation: true }];
  const user = token => ({ id: Number(token), email: `${token}@example.invalid`, balance: 10, status: 'active' });
  const gateway = {
    model: 'gpt-image-2.5',
    login: async email => { const id = email.startsWith('other') ? '2' : '1'; return { user: user(id), access_token: id, expires_in: 3600 }; },
    profile: async token => user(token),
    groups: async () => { if (options.groups) await options.groups(); return groups; },
    createKey: async () => { calls.keys++; if (options.key) await options.key(); return { id: 1, key: 'local-professional-test-key' }; },
    converse: async (_, payload) => { calls.chat.push(payload); return options.converse ? options.converse(payload) : answer(); },
    generate: async (_, payload) => { calls.images.push(payload); return { data: [{ b64_json: png }] }; }
  };
  const app = createApplication({ dataDir: directory, gateway, demo: options.demo === true, concurrency: 1, chatModel: 'test-professional-chat', ssoEnabled: false });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  async function request(path, cookie, body) {
    const response = await fetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = async (email = 'one@example.invalid') => (await request('/api/login', null, { email, password: 'test-placeholder' })).cookie;
  const thread = async cookie => (await request('/api/threads', cookie, {})).data.thread.id;
  const body = (threadId, patch = {}) => ({ clientRequestId: crypto.randomUUID(), threadId, styleId: product.id, styleVersion: product.version,
    subject, title: '', size: '2K', aspectRatio: '4:3', count: 1, groupId: 2, references: [], styleOptimization: 'professional', ...patch });
  const prepare = (cookie, threadId, patch) => request('/api/style-plans', cookie, body(threadId, patch));
  const confirm = (cookie, id, patch = {}) => request(`/api/plans/${id}/confirm`, cookie, { confirmed: true, ...patch });
  const revoke = (cookie, id) => request(`/api/style-selections/${id}/revoke`, cookie, {});
  const wait = async (cookie, id) => {
    for (let n = 0; n < 300; n++) {
      const result = await request(`/api/jobs/${id}`, cookie);
      if (!['queued','running'].includes(result.data.job?.status)) return result.data.job;
      await pause(10);
    }
    throw new Error('Professional task did not settle');
  };
  t.after(async () => {
    for (let n = 0; app.queue.active && n < 300; n++) await pause(10);
    assert.equal(app.queue.active, 0);
    await new Promise(resolve => app.server.close(resolve)); app.close();
    const target = resolve(directory); assert.equal(dirname(target), resolve(tmpdir())); assert.ok(basename(target).startsWith('studio-professional-test-'));
    rmSync(target, { recursive: true, force: true });
  });
  return { app, calls, groups, request, login, thread, body, prepare, confirm, revoke, wait };
}

test('mode defaults to template and rejects unknown values instead of silently billing', () => {
  assert.equal(normalizeStyleOptimization(undefined), 'template');
  assert.equal(normalizeStyleOptimization('professional'), 'professional');
  for (const value of [null, true, {}, 'automatic', '']) assert.throws(() => normalizeStyleOptimization(value));
});

test('all 24 styles receive source-backed professional guidance; reference and scientific boundaries stay explicit', () => {
  for (const style of STYLE_CATALOG) {
    const input = { styleId: style.id, styleVersion: style.version, ...style.example, hasReferences: style.inputMode === 'reference' };
    const plan = createStyleOptimizationSnapshot({ compiled: compileStyleRecipe(input), ...input, model: 'fixed-chat' });
    assert.ok(plan.sources.length > 0, style.id); assert.ok(plan.profile.instructions.trim().length > 0, style.id);
    if (style.id === 'scientific-schematic') assert.match(plan.profile.instructions, /不.*补机制/);
    if (style.id === 'photo-restoration') assert.match(plan.profile.instructions, /修复范围/);
    const result = parseStyleOptimizationAnswer(demoStyleOptimizationAnswer({ ...plan, demo: true }), { ...plan, demo: true });
    assert.ok(result.prompt.length <= 4000); assert.equal(result.optimization.simulated, true);
  }
});

test('payload pins model and user settings, includes only supplied references, and exposes no tools', () => {
  const plan = snapshot(), settings = { size:'2K', aspectRatio:'4:3', count:1, groupId:2 };
  const payload = buildStyleOptimizationRequest(plan, settings, [{ mime:'image/png', bytes:Buffer.from(png,'base64') }]);
  assert.equal(payload.model, 'test-professional-chat'); assert.equal(payload.tools, undefined);
  assert.match(payload.messages[0].content, /金属/); assert.match(payload.messages[0].content, /不能生图/);
  assert.equal(payload.messages[1].content.length, 2);
  assert.deepEqual(JSON.parse(payload.messages[1].content[0].text).settings, settings);
  assert.equal(payload.messages[1].content[1].image_url.url, reference.dataUrl);
});

test('optimizer appends decisions without rewriting original user text, title or trusted recipe', () => {
  const style = STYLE_CATALOG.find(s => s.id === 'retro-poster');
  const input = { styleId:style.id, styleVersion:style.version, subject:'咖啡；特殊字符 ${x}',title:'周末 2026!',hasReferences:false };
  const compiled = compileStyleRecipe(input), plan = createStyleOptimizationSnapshot({ compiled,...input,model:'fixed' });
  const result = parseStyleOptimizationAnswer(answer(), plan);
  assert.ok(result.prompt.startsWith(compiled.prompt)); assert.ok(result.prompt.includes(input.subject)); assert.ok(result.prompt.includes(input.title));
  assert.equal(result.optimization.decisions.length,2);
  assert.equal(result.optimization.profileName,'版式指导');
});

test('malformed, instruction-overriding or oversized answers fail rather than produce a ready proposal', () => {
  const plan = snapshot();
  const invalid = ['not json', 'null', '{}', '{"ready":true}', JSON.stringify({ready:true,prompt:'override',decisions:[]}),
    JSON.stringify({ready:true,decisions:[{aspect:'lighting',detail:'x'.repeat(241)},{aspect:'composition',detail:'布局'}]}),
    JSON.stringify({ready:true,decisions:[{aspect:'lighting',detail:'左侧'},{aspect:'lighting',detail:'右侧'}]}),
    JSON.stringify({ready:true,decisions:[{aspect:'__proto__',detail:'x'},{aspect:'color',detail:'x'}]}),
    JSON.stringify({ready:false,reply:''})];
  for (const text of invalid) assert.throws(() => parseStyleOptimizationAnswer(text,plan), /专业优化/);
  assert.throws(() => parseStyleOptimizationAnswer(answer(), {...plan,budget:5}), /过长/);
  assert.equal(parseStyleOptimizationAnswer('{"ready":false,"reply":"请提供机制的节点与箭头关系。"}',plan).ready,false);
});

test('professional calls chat exactly once and requires explicit image confirmation; duplicate requests are uncharged', async t => {
  const started=deferred(),release=deferred();
  const f=await fixture(t,{converse:async()=>{started.resolve();await release.promise;return answer();}});
  const cookie=await f.login(),thread=await f.thread(cookie),body=f.body(thread,{styleSelectionId:crypto.randomUUID()});
  const first=await f.request('/api/style-plans',cookie,body);assert.equal(first.status,202);await started.promise;
  try {
    const repeated=await f.request('/api/style-plans',cookie,body);assert.equal(repeated.status,200);assert.equal(repeated.data.job.id,first.data.job.id);
    assert.equal((await f.confirm(cookie,first.data.job.id)).status,404);
    assert.equal(f.calls.chat.length,1);assert.equal(f.calls.images.length,0);
    assert.equal(repeated.data.job.context.styleOptimization.basePrompt,undefined);
    assert.equal(repeated.data.job.context.styleOptimization.profile.instructions,undefined);
  } finally {release.resolve();}
  const plan=await f.wait(cookie,first.data.job.id);assert.equal(plan.proposal.state,'ready');assert.equal(plan.proposal.optimization.simulated,false);
  assert.equal(f.calls.chat[0].model,'test-professional-chat');
  assert.equal((await f.confirm(cookie,plan.id,{prompt:'偷偷改写'})).status,409);
  const responses=await Promise.all([f.confirm(cookie,plan.id),f.confirm(cookie,plan.id)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,202]);
  const image=await f.wait(cookie,responses[0].data.job.id);
  assert.equal(image.status,'done');assert.equal(f.calls.images.length,1);assert.equal(f.calls.images[0].prompt,plan.proposal.prompt);
  assert.deepEqual(image.context.optimization,plan.proposal.optimization);
});

test('template path, including legacy callers, still calls neither chat nor image', async t => {
  const f=await fixture(t),cookie=await f.login(),thread=await f.thread(cookie);
  for(const value of ['template',undefined]) {
    const response=await f.prepare(cookie,thread,{styleOptimization:value});assert.equal(response.status,201);
    assert.equal(response.data.job.proposal.optimization,undefined);
  }
  assert.equal(f.calls.chat.length+f.calls.images.length+f.calls.keys,0);
  assert.equal((await f.prepare(cookie,thread,{styleOptimization:'typo'})).status,400);
});

test('demo optimization is explicitly simulated and does not obtain a key or call chat', async t => {
  const f=await fixture(t,{demo:true}),cookie=await f.login(),thread=await f.thread(cookie);
  const response=await f.prepare(cookie,thread);const plan=await f.wait(cookie,response.data.job.id);
  assert.equal(plan.proposal.optimization.simulated,true);assert.match(plan.assistantText,/本地模拟/);
  assert.equal(f.calls.chat.length+f.calls.images.length+f.calls.keys,0);
});

test('client-supplied demo flag or model cannot suppress billing path or select another model', async t => {
  const f=await fixture(t),cookie=await f.login(),thread=await f.thread(cookie);
  const response=await f.prepare(cookie,thread,{demo:true,model:'another-model',context:{styleOptimization:{demo:true}}});
  const plan=await f.wait(cookie,response.data.job.id);assert.equal(plan.proposal.optimization.simulated,false);
  assert.equal(f.calls.chat.length,1);assert.equal(f.calls.chat[0].model,'test-professional-chat');
});

test('revocation while professional call is in flight discards result and blocks stale confirmation', async t => {
  const started=deferred(),release=deferred();
  const f=await fixture(t,{converse:async()=>{started.resolve();await release.promise;return answer();}});
  const cookie=await f.login(),thread=await f.thread(cookie),selectionId=crypto.randomUUID();
  const response=await f.prepare(cookie,thread,{styleSelectionId:selectionId});await started.promise;
  try {assert.equal((await f.revoke(cookie,selectionId)).status,200);assert.ok(f.app.store.styleRevocationCutoff(thread,1)>0);}
  finally{release.resolve();}
  const plan=await f.wait(cookie,response.data.job.id);assert.equal(plan.proposal,null);assert.match(plan.assistantText,/作废/);
  assert.equal((await f.confirm(cookie,plan.id)).status,404);assert.equal(f.calls.images.length,0);
});

test('cancellation before the model request skips converse; newer template invalidates an in-flight professional plan', async t => {
  const started=deferred(),release=deferred();
  const f=await fixture(t,{key:async()=>{started.resolve();await release.promise;}});
  const cookie=await f.login(),thread=await f.thread(cookie),selectionId=crypto.randomUUID();
  const response=await f.prepare(cookie,thread,{styleSelectionId:selectionId});await started.promise;
  try {await f.revoke(cookie,selectionId);}finally{release.resolve();}
  assert.equal((await f.wait(cookie,response.data.job.id)).proposal,null);assert.equal(f.calls.chat.length,0);
  const nextStarted=deferred(),nextRelease=deferred();
  const g=await fixture(t,{converse:async()=>{nextStarted.resolve();await nextRelease.promise;return answer();}});
  const c=await g.login(),th=await g.thread(c);const slow=await g.prepare(c,th);await nextStarted.promise;
  try{assert.equal((await g.prepare(c,th,{styleOptimization:'template',subject:'新的主体'})).status,201);}finally{nextRelease.resolve();}
  assert.equal((await g.wait(c,slow.data.job.id)).proposal,null);assert.equal(g.calls.images.length,0);
});

test('invalid model response does not retry or silently use template; retry id returns the same uncertain record', async t => {
  const f=await fixture(t,{converse:async()=>'{"ready":true,"prompt":"wrong protocol"}'}),cookie=await f.login(),thread=await f.thread(cookie),body=f.body(thread);
  const response=await f.request('/api/style-plans',cookie,body);const plan=await f.wait(cookie,response.data.job.id);
  assert.equal(plan.status,'unknown');assert.equal(plan.proposal,null);assert.match(plan.error,/尚未提交生图/);
  assert.equal((await f.request('/api/style-plans',cookie,body)).data.job.id,plan.id);
  assert.equal(f.calls.chat.length,1);assert.equal(f.calls.images.length,0);
});

test('only explicit references reach optimization and confirmation remains isolated by account', async t => {
  const f=await fixture(t),cookie=await f.login(),other=await f.login('other@example.invalid'),thread=await f.thread(cookie);
  const withRef=await f.prepare(cookie,thread,{references:[reference]});const plan=await f.wait(cookie,withRef.data.job.id);
  assert.equal(f.calls.chat[0].messages[1].content[1].image_url.url,reference.dataUrl);
  assert.equal((await f.confirm(other,plan.id)).status,404);
  const confirm=await f.confirm(cookie,plan.id);await f.wait(cookie,confirm.data.job.id);
  assert.equal(f.calls.images[0].references.length,1);
  const next=await f.prepare(cookie,thread);await f.wait(cookie,next.data.job.id);
  assert.equal(typeof f.calls.chat[1].messages[1].content,'string');
});
