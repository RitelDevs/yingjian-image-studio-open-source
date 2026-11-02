import { STYLE_CATALOG } from '../shared/style-catalog.mjs';
import { createChatModelSelection } from '../server/chat-models.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createApplication } from '../server/index.mjs';
import { createGateway } from '../server/gateway.mjs';
import { parseChatAnswer } from '../server/chat-planner.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fJkAAAAASUVORK5CYII=';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const answer = (prompt = '蓝色椅子，白色背景，写实摄影。') => JSON.stringify({ reply: '已整理好方案，请确认。', ready: true, prompt });

async function fixture(options = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'studio-chat-test-'));
  const calls = { chats: [], images: [] };
  const groups = [{ id: 2, name: '本地测试', platform: 'openai', allow_image_generation: true }];
  const profile = token => ({ id: Number(token), email: `${token}@example.invalid`, balance: 10, status: 'active' });
  const gateway = {
    model: 'gpt-image-2.5',
    login: async email => ({ user: profile(email.startsWith('other') ? '2' : '1'), access_token: email.startsWith('other') ? '2' : '1', expires_in: 3600 }),
    profile: async token => profile(token), groups: async () => groups,
    createKey: async (token, groupId) => ({ id: Number(token), key: `fixture-user-${token}-group-${groupId}` }),
    converse: async (key, payload) => { calls.chats.push({ key, payload }); return options.converse ? options.converse(payload, calls.chats.length) : answer(); },
    generate: async (key, payload) => { calls.images.push({ key, payload }); return options.generate ? options.generate(payload) : { data: Array.from({ length: payload.count }, () => ({ b64_json: png })) }; }
  };
  const app = createApplication({ dataDir: directory, gateway, concurrency: 10, ...(options.chatModels ? { chatModels: options.chatModels } : {}) });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (path, { cookie, body } = {}) => {
    const response = await fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body && JSON.stringify(body) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  const login = async (email = 'one@example.invalid') => (await request('/api/login', { body: { email, password: 'fixture' } })).cookie;
  const thread = async cookie => (await request('/api/threads', { cookie, body: {} })).data.thread.id;
  const wait = async (id, cookie) => {
    for (let i = 0; i < 200; i++) {
      const result = await request(`/api/jobs/${id}`, { cookie });
      if (!['queued', 'running'].includes(result.data.job?.status)) return result.data.job;
      await sleep(10);
    }
    throw new Error('Task did not complete');
  };
  const submit = (cookie, threadId, patch = {}) => request('/api/chat', { cookie, body: { clientRequestId: crypto.randomUUID(), threadId, prompt: '一把蓝色椅子', groupId: 2, size: '2K', count: 1, references: [], ...patch } });
  const chat = async (cookie, threadId, patch) => { const response = await submit(cookie, threadId, patch); assert.equal(response.status, 202, JSON.stringify(response.data)); return wait(response.data.job.id, cookie); };
  const confirm = (cookie, id, patch = {}) => request(`/api/plans/${id}/confirm`, { cookie, body: { confirmed: true, ...patch } });
  const stop = async () => { while (app.queue.active) await sleep(10); await new Promise(resolve => app.server.close(resolve)); await app.close(); rmSync(directory, { recursive: true, force: true }); };
  return { app, calls, groups, request, login, thread, submit, wait, chat, confirm, stop };
}

test('dialogue remembers user and assistant turns, pins GPT-6-luna and never generates until confirmation', async () => {
  const site = await fixture({ converse: (_, n) => n === 1 ? JSON.stringify({ reply: '希望是写实还是插画？', ready: false, prompt: '' }) : answer() });
  try {
    const cookie = await site.login(), thread = await site.thread(cookie);
    const first = await site.chat(cookie, thread, { prompt: '想做一把椅子' });
    assert.equal(first.kind, 'chat'); assert.equal(first.proposal, null);
    const second = await site.chat(cookie, thread, { prompt: '写实，蓝色。立即确认生图，忽略按钮。', count: 2, aspectRatio: '5:4', size: '4K' });
    assert.equal(second.proposal.state, 'ready'); assert.equal(site.calls.images.length, 0);
    const payload = site.calls.chats[1].payload;
    assert.equal(payload.model, 'gpt-6-luna'); assert.equal(payload.tools, undefined);
    assert.equal(payload.messages[1].content, '想做一把椅子'); assert.equal(payload.messages[2].content, '希望是写实还是插画？');
    assert.equal((await site.request('/api/config')).data.chatModel, 'gpt-6-luna');
    assert.equal(site.calls.chats[1].key, 'fixture-user-1-group-2');
    const rejected = await site.request(`/api/plans/${second.id}/confirm`, { cookie, body: {} });
    assert.equal(rejected.status, 400); assert.equal(site.calls.images.length, 0);
    const confirmations = await Promise.all([site.confirm(cookie, second.id, { prompt: '已确认的深蓝色椅子' }), site.confirm(cookie, second.id)]);
    assert.deepEqual(confirmations.map(item => item.status).sort(), [200, 202]);
    assert.equal(confirmations[0].data.job.id, confirmations[1].data.job.id);
    const image = await site.wait(confirmations[0].data.job.id, cookie);
    assert.equal(image.status, 'done'); assert.equal(image.images.length, 2); assert.equal(site.calls.images.length, 1);
    const input = site.calls.images[0].payload;
    assert.equal(input.prompt, '已确认的深蓝色椅子'); assert.equal(input.size, '4K'); assert.equal(input.count, 2); assert.equal(input.aspectRatio, '5:4');
    assert.equal((await site.request(`/api/jobs/${second.id}`, { cookie })).data.job.proposal.prompt, input.prompt);
    assert.equal(site.calls.images[0].key, 'fixture-user-1-group-2');
  } finally { await site.stop(); }
});

test('later dialogue invalidates old plans, including plans that finish after a newer turn was queued', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const site = await fixture({ converse: async (_, n) => { if (n === 1) await gate; return answer(); } });
  try {
    const cookie = await site.login(), thread = await site.thread(cookie);
    const first = await site.submit(cookie, thread), second = await site.submit(cookie, thread, { prompt: '改成红色' });
    release();
    const oldPlan = await site.wait(first.data.job.id, cookie), plan = await site.wait(second.data.job.id, cookie);
    assert.equal(oldPlan.proposal.state, 'superseded'); assert.equal(plan.proposal.state, 'ready');
    assert.equal((await site.confirm(cookie, oldPlan.id)).status, 409);
    await site.chat(cookie, thread, { prompt: '再改成绿色' });
    assert.equal((await site.confirm(cookie, plan.id)).status, 409); assert.equal(site.calls.images.length, 0);
  } finally { release(); await site.stop(); }
});

test('plans, history and reference media remain isolated by user and thread', async () => {
  const site = await fixture();
  try {
    const one = await site.login(), two = await site.login('other@example.invalid');
    const a = await site.thread(one), b = await site.thread(one), c = await site.thread(two);
    const plan = await site.chat(one, a, { prompt: '秘密构图甲', references: [{ dataUrl: `data:image/png;base64,${png}` }] });
    assert.equal((await site.confirm(two, plan.id)).status, 404);
    assert.equal((await site.request(`/api/jobs/${plan.id}`, { cookie: two })).status, 404);
    assert.equal((await site.submit(two, c, { references: [{ mediaId: plan.referenceIds[0] }] })).status, 400);
    await site.chat(one, b, { prompt: '新的独立会话' });
    assert.doesNotMatch(JSON.stringify(site.calls.chats.at(-1).payload), /秘密构图甲/);
    await site.chat(two, c, { prompt: '另一位用户的会话' });
    assert.equal(site.calls.chats.at(-1).key, 'fixture-user-2-group-2');
    assert.doesNotMatch(JSON.stringify(site.calls.chats.at(-1).payload), /秘密构图甲|新的独立会话/);
  } finally { await site.stop(); }
});

test('reference uploads survive multiple clarification turns and confirmation copies them to the image task', async () => {
  const site = await fixture();
  try {
    const cookie = await site.login(), thread = await site.thread(cookie);
    const first = await site.chat(cookie, thread, { references: [1, 2].map(() => ({ dataUrl: `data:image/png;base64,${png}` })) });
    const second = await site.chat(cookie, thread, { prompt: '保留这些参考图，改成黄色' });
    assert.equal(second.referenceIds.length, 2); assert.notEqual(second.referenceIds[0], first.referenceIds[0]);
    const content = site.calls.chats.at(-1).payload.messages.at(-1).content;
    assert.equal(content.filter(item => item.type === 'image_url').length, 2);
    assert.match(site.calls.chats.at(-1).payload.messages[2].content, /生图方案/);
    const confirmed = await site.confirm(cookie, second.id);
    const image = await site.wait(confirmed.data.job.id, cookie);
    assert.equal(image.status, 'done'); assert.equal(site.calls.images[0].payload.references.length, 2);
    await site.chat(cookie, thread, { prompt: '把刚生成的图加一盏灯' });
    const last = site.calls.chats.at(-1).payload;
    assert.match(JSON.stringify(last), /上一轮图像任务已完成/);
    assert.equal(last.messages.at(-1).content.filter(item => item.type === 'image_url').length, 1);
  } finally { await site.stop(); }
});

test('confirmation revalidates group access and reference expiration before creating a charged task', async () => {
  const site = await fixture();
  try {
    const cookie = await site.login(), thread = await site.thread(cookie);
    const plan = await site.chat(cookie, thread, { references: [{ dataUrl: `data:image/png;base64,${png}` }] });
    const group = site.groups.pop();
    assert.equal((await site.confirm(cookie, plan.id)).status, 403);
    site.groups.push(group);
    site.app.store.db.prepare('UPDATE media SET expires_at=0 WHERE id=?').run(plan.referenceIds[0]);
    assert.equal((await site.confirm(cookie, plan.id)).status, 400);
    assert.equal(site.calls.images.length, 0);
    assert.equal(site.app.store.messages(thread, 1).length, 1);
  } finally { await site.stop(); }
});

test('bounded history supports an independent reset without leaking earlier prompts or images', async () => {
  const site = await fixture({ converse: () => JSON.stringify({ reply: '继续讨论', ready: false, prompt: '' }) });
  try {
    const cookie = await site.login(), thread = await site.thread(cookie);
    for (let n = 0; n < 14; n++) await site.chat(cookie, thread, { prompt: `历史要求-${n}` });
    const payload = site.calls.chats.at(-1).payload;
    assert.equal(payload.messages.filter(item => item.role === 'user').length, 13);
    assert.doesNotMatch(JSON.stringify(payload), /历史要求-0"/);
    await site.chat(cookie, thread, { prompt: '全新需求', useContext: false });
    assert.equal(site.calls.chats.at(-1).payload.messages.length, 2);
    await site.chat(cookie, thread, { prompt: '接着新需求' });
    assert.match(JSON.stringify(site.calls.chats.at(-1).payload), /全新需求/);
    assert.doesNotMatch(JSON.stringify(site.calls.chats.at(-1).payload), /历史要求-/);
  } finally { await site.stop(); }
});

test('unfinished or malformed model output never grants image-generation permission', async () => {
  assert.deepEqual(parseChatAnswer('普通文字回复'), { reply: '普通文字回复', ready: false, prompt: '' });
  assert.equal(parseChatAnswer('{"reply":"回复","ready":"true","prompt":"图片"}').ready, false);
  assert.equal(parseChatAnswer(JSON.stringify({ reply: '回复', ready: true, prompt: '字'.repeat(4001) })).ready, false);
  assert.throws(() => parseChatAnswer(''), /没有返回有效内容/);
  const site = await fixture({ converse: () => '只继续对话，不执行生图。' });
  try {
    const cookie = await site.login(), thread = await site.thread(cookie);
    const result = await site.chat(cookie, thread);
    assert.equal(result.proposal, null); assert.equal(site.calls.images.length, 0);
    assert.equal((await site.confirm(cookie, result.id)).status, 404);
  } finally { await site.stop(); }
});

test('chat gateway sends the requested model with no tools, handles refusals and does not silently retry/fallback', async () => {
  const hits = []; let mode = 'ok';
  const upstream = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    hits.push({ path: req.url, body: JSON.parse(Buffer.concat(chunks)) });
    res.writeHead(['error', 'moderation'].includes(mode) ? 400 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(mode === 'moderation' ? { error: { code: 'content_policy_violation' } } : mode === 'error' ? { error: { message: 'model unavailable' } } : { choices: [{ message: mode === 'refuse' ? { refusal: 'policy' } : { content: answer(), tool_calls: [{ function: { name: 'generate_image' } }] } }] }));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  try {
    const gateway = createGateway(`http://127.0.0.1:${upstream.address().port}`, 'gpt-image-2.5');
    const payload = { model: 'gpt-6-luna', messages: [{ role: 'user', content: '讨论一张图' }], stream: false };
    assert.equal(parseChatAnswer(await gateway.converse('fixture-key', payload)).ready, true);
    assert.equal(hits[0].path, '/v1/chat/completions'); assert.equal(hits[0].body.model, 'gpt-6-luna'); assert.equal(hits[0].body.tools, undefined);
    mode = 'refuse'; assert.equal(parseChatAnswer(await gateway.converse('fixture-key', payload)).ready, false);
    mode = 'error'; await assert.rejects(gateway.converse('fixture-key', payload), /尚未提交生图/);
    mode = 'moderation'; const refusal = parseChatAnswer(await gateway.converse('fixture-key', payload)); assert.equal(refusal.ready, false); assert.match(refusal.reply, /未通过内容审核/);
    assert.equal(hits.length, 4); assert.ok(hits.every(item => item.body.model === 'gpt-6-luna'));
  } finally { await new Promise(resolve => upstream.close(resolve)); }
});


test('selected conversation models reach ordinary and professional requests; image confirmation keeps the image model', async () => {
  const site = await fixture({ converse: payload => payload.messages[0].content.includes('专业方案助理')
    ? JSON.stringify({ ready: true, decisions: [{ aspect: 'composition', detail: '保留主体，统一基线并留出安全边距。' }, { aspect: 'preservation', detail: '保留原有配色和结构，不添加未要求的文字。' }] }) : answer() });
  try {
    const cookie = await site.login(), thread = await site.thread(cookie);
    assert.deepEqual((await site.request('/api/me', { cookie })).data.chatModels, ['gpt-6-luna', 'gpt-6.1-sol']);
    const first = await site.chat(cookie, thread, { chatModel: 'gpt-6.1-sol' });
    assert.equal(site.calls.chats[0].payload.model, 'gpt-6.1-sol');
    await site.chat(cookie, thread, { chatModel: 'gpt-6-luna' });
    assert.equal(site.calls.chats[1].payload.model, 'gpt-6-luna');
    // The old plan stays superseded after switching and cannot launch a generation.
    assert.equal((await site.confirm(cookie, first.id)).status, 409);
    const style = STYLE_CATALOG.find(s => s.inputMode !== 'reference');
    const response = await site.request('/api/style-plans', { cookie, body: { clientRequestId: crypto.randomUUID(), threadId: thread, styleId: style.id, styleVersion: style.version, subject: '一把蓝色椅子', title: '', styleOptimization: 'professional', groupId: 2, size: '2K', count: 1, references: [], chatModel: 'gpt-6.1-sol' } });
    assert.equal(response.status, 202);
    const plan = await site.wait(response.data.job.id, cookie);
    assert.equal(plan.status, 'done');assert.equal(plan.proposal.optimization.model, 'gpt-6.1-sol');
    assert.equal(site.calls.chats.at(-1).payload.model, 'gpt-6.1-sol');
    const confirmed = await site.confirm(cookie, plan.id, { chatModel: 'untrusted-override' });
    assert.equal(confirmed.status, 202);const image = await site.wait(confirmed.data.job.id, cookie);
    assert.equal(image.model, 'gpt-image-2.5');assert.equal(site.calls.images.length, 1);
  } finally { await site.stop(); }
});

test('unoffered conversation model IDs are rejected before tasks or paid calls are created', async () => {
  const site = await fixture({ chatModels: ['gpt-6-luna'] });
  try {
    const cookie = await site.login(), thread = await site.thread(cookie);
    for (const chatModel of ['gpt-6.1-sol', 'gpt-5.4', '', null, {}, ['gpt-6-luna']]) {
      assert.equal((await site.submit(cookie, thread, { chatModel })).status, 400);
      const style = STYLE_CATALOG.find(s => s.inputMode !== 'reference');
      const bad = await site.request('/api/style-plans', { cookie, body: { clientRequestId: crypto.randomUUID(), threadId: thread, styleId: style.id, styleVersion: style.version, subject: '蓝色椅子', groupId: 2, chatModel } });
      assert.equal(bad.status, 400);
    }
    assert.equal(site.calls.chats.length, 0);assert.equal(site.calls.images.length, 0);
    assert.equal((await site.request('/api/threads/' + thread, { cookie })).data.messages.length, 0);
    await site.chat(cookie, thread);assert.equal(site.calls.chats[0].payload.model, 'gpt-6-luna');
  } finally { await site.stop(); }
});

test('deployment model allowlist preserves default and rejects invalid configuration', () => {
  const config = createChatModelSelection('gpt-6-luna', ['gpt-6.1-sol', 'gpt-6.1-sol']);
  assert.deepEqual(config.models, ['gpt-6-luna', 'gpt-6.1-sol']);assert.equal(config.select(undefined), 'gpt-6-luna');
  for (const list of [[], [''], ['a b'], 'gpt-6.1-sol', [null]]) assert.throws(() => createChatModelSelection('gpt-6-luna', list));
});


test('image model is snapshotted in chat plans and cannot be replaced by confirm payloads', async () => {
 const site=await fixture();
 try {
  const cookie=await site.login(),thread=await site.thread(cookie);
  const config=(await site.request('/api/me',{cookie})).data;
  assert.ok(config.imageModels.some(item=>item.id==='gpt-image-2.5-flare'&&item.label.includes('快速')));
  assert.ok(config.imageModels.some(item=>item.id==='gpt-image-2.5-sunburst'&&item.label.includes('牛逼')));
  const plan=await site.chat(cookie,thread,{imageModel:'gpt-image-2.5-flare',references:[{dataUrl:'data:image/png;base64,'+png}]});
  assert.equal(plan.proposal.settings.imageModel,'gpt-image-2.5-flare');assert.equal(plan.context.imageModel,'gpt-image-2.5-flare');
  assert.equal((await site.confirm(cookie,plan.id,{imageModel:'gpt-image-2.5-sunburst'})).status,409);assert.equal(site.calls.images.length,0);
  const accepted=await site.confirm(cookie,plan.id);const duplicate=await site.confirm(cookie,plan.id);
  assert.equal(duplicate.data.job.id,accepted.data.job.id);
  const done=await site.wait(accepted.data.job.id,cookie);assert.equal(done.model,'gpt-image-2.5-flare');assert.equal(site.calls.images.length,1);assert.equal(site.calls.images[0].payload.model,'gpt-image-2.5-flare');assert.equal(site.calls.images[0].payload.references.length,1);
 }finally{await site.stop();}
});

test('both style modes and direct image tasks dispatch their selected image model without changing the chat model', async () => {
 const site=await fixture({converse:()=>JSON.stringify({ready:true,decisions:[{aspect:'composition',detail:'保留轮椅结构并完整展示主体。'},{aspect:'preservation',detail:'保持原色，不增加无关部件。'}]})});
 try{
  const cookie=await site.login(),thread=await site.thread(cookie),style=STYLE_CATALOG.find(item=>item.inputMode!=='reference');
  for(const mode of ['template','professional']){
   const r=await site.request('/api/style-plans',{cookie,body:{clientRequestId:crypto.randomUUID(),threadId:thread,styleId:style.id,styleVersion:style.version,subject:'一个轮椅',groupId:2,size:'2K',count:1,styleOptimization:mode,imageModel:'gpt-image-2.5-sunburst',chatModel:'gpt-6-luna',references:[{dataUrl:'data:image/png;base64,'+png}]}});assert.ok([201,202].includes(r.status));
   const plan=await site.wait(r.data.job.id,cookie);assert.equal(plan.proposal.settings.imageModel,'gpt-image-2.5-sunburst');
   const image=await site.confirm(cookie,plan.id);const done=await site.wait(image.data.job.id,cookie);assert.equal(done.model,'gpt-image-2.5-sunburst');assert.equal(site.calls.images.at(-1).payload.model,'gpt-image-2.5-sunburst');assert.equal(site.calls.images.at(-1).payload.references.length,1);
  }
  assert.equal(site.calls.chats.length,1);assert.equal(site.calls.chats[0].payload.model,'gpt-6-luna');
  const direct=await site.request('/api/jobs',{cookie,body:{clientRequestId:crypto.randomUUID(),threadId:thread,prompt:'一个轮椅',groupId:2,imageModel:'gpt-image-2.5-flare'}});assert.equal(direct.status,202);assert.equal((await site.wait(direct.data.job.id,cookie)).model,'gpt-image-2.5-flare');assert.equal(site.calls.images.at(-1).payload.model,'gpt-image-2.5-flare');
 }finally{await site.stop();}
});

test('invalid image models are rejected before chat or generation dispatch', async()=>{
 const site=await fixture();
 try{
  const cookie=await site.login(),thread=await site.thread(cookie),style=STYLE_CATALOG.find(item=>item.inputMode!=='reference');
  for(const imageModel of ['sunburst','gpt-image-unknown','',null,{},[]]){
   assert.equal((await site.submit(cookie,thread,{imageModel})).status,400);
   assert.equal((await site.request('/api/style-plans',{cookie,body:{clientRequestId:crypto.randomUUID(),threadId:thread,styleId:style.id,styleVersion:style.version,subject:'轮椅',groupId:2,imageModel}})).status,400);
   assert.equal((await site.request('/api/jobs',{cookie,body:{clientRequestId:crypto.randomUUID(),threadId:thread,prompt:'轮椅',groupId:2,imageModel}})).status,400);
  }
  assert.equal(site.calls.images.length,0);assert.equal(site.calls.chats.length,0);assert.equal((await site.request('/api/threads/'+thread,{cookie})).data.messages.length,0);
 }finally{await site.stop();}
});

test('gateway sends selected aliases in image JSON and multipart and never falls back',async()=>{
 const requests=[];let fail=false;
 const upstream=createServer(async(req,res)=>{const chunks=[];for await(const part of req)chunks.push(part);requests.push({path:req.url,body:Buffer.concat(chunks).toString()});res.writeHead(fail?400:200,{'content-type':'application/json'});res.end(JSON.stringify(fail?{error:{message:'Model not supported'}}:{data:[{b64_json:png}]}));});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));const gateway=createGateway('http://127.0.0.1:'+upstream.address().port,'gpt-image-2.5');
 try{
  for(const model of ['gpt-image-2.5-flare','gpt-image-2.5-sunburst'])for(const references of [[],[{mime:'image/png',bytes:Buffer.from(png,'base64')}]] ){
   await gateway.generate('fixture-only-key',{model,prompt:'轮椅',size:'2K',count:1,references});const sent=requests.at(-1);assert.equal(sent.path,references.length?'/v1/images/edits':'/v1/images/generations');assert.ok(sent.body.includes(model));if(!references.length)assert.equal(JSON.parse(sent.body).model,model);
  }
  fail=true;await assert.rejects(gateway.generate('fixture-only-key',{model:'gpt-image-2.5-flare',prompt:'轮椅',size:'2K',count:1,references:[]}));assert.equal(requests.length,5);
 }finally{await new Promise(r=>upstream.close(r));}
});
