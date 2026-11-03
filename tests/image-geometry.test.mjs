import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ASPECT_RATIOS, IMAGE_PIXEL_LIMITS, resolveImageGeometry, imageSettingsForRetry } from '../shared/image-geometry.mjs';
import { createStore } from '../server/store.mjs';
import { createGateway, classifyFailure } from '../server/gateway.mjs';

test('all preset proportions produce aligned dimensions within native edge, ratio and pixel limits', () => {
  for (const size of ['1K', '2K', '4K']) {
    assert.equal(resolveImageGeometry(size).requestSize, 'auto');
    for (const ratio of [...ASPECT_RATIOS, '5:4', '21:9', '1:3', '3:1']) {
      const result = resolveImageGeometry(size, ratio);
      const [w, h] = ratio.split(':').map(Number);
      assert(Math.max(result.width, result.height) <= IMAGE_PIXEL_LIMITS.maxEdge);
      assert(result.width * result.height >= IMAGE_PIXEL_LIMITS.minPixels);
      assert(result.width * result.height <= IMAGE_PIXEL_LIMITS.maxPixels);
      assert(result.width <= result.height * 3 && result.height <= result.width * 3);
      assert.equal(result.width % 16, 0);
      assert.equal(result.height % 16, 0);
      assert(Math.abs((result.width / result.height) / (w / h) - 1) < .025);
    }
  }
  assert.equal(resolveImageGeometry('2K', '16:9').requestSize, '2048x1152');
  assert.equal(resolveImageGeometry('2K', '9:16').requestSize, '1152x2048');
  assert.equal(resolveImageGeometry('4K', '200:160').aspectRatio, '5:4');
  assert.deepEqual(imageSettingsForRetry({ size: '4K', aspectRatio: '5:4' }), { size: '4K', aspectRatio: 'custom', ratioWidth: '5', ratioHeight: '4' });
  assert.deepEqual(imageSettingsForRetry({ size: '2K' }), { size: '2K', aspectRatio: 'auto' });
});

test('invalid dimensions cannot bypass the shared request constraints', () => {
  for (const ratio of ['0:1', '1:0', '-1:2', '1.5:1', '1:', '', '4:1', '1:4', '10001:10000', {}, 1]) {
    assert.throws(() => resolveImageGeometry('2K', ratio));
  }
  assert.throws(() => resolveImageGeometry('9000x9000', '1:1'));
  const failure = classifyFailure(400, { error: { message: 'Invalid size: dimensions must be supported' } });
  assert.equal(failure.reason, 'size_unsupported');
  assert.match(failure.message, /未接受.*像素尺寸/);
  assert.doesNotMatch(failure.message, /改为.*自动/);
});

test('generation JSON and reference-image multipart both forward requested geometry and keep prompts unchanged', async () => {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ url: req.url, contentType: req.headers['content-type'], body: Buffer.concat(chunks).toString() });
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"data":[]}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const gateway = createGateway(`http://127.0.0.1:${server.address().port}`, 'gpt-image-2.5');
    const input = { prompt: 'Keep this exact prompt', size: '2K', aspectRatio: '16:9', count: 1, references: [] };
    await gateway.generate('local-fixture', input);
    const json = JSON.parse(requests[0].body);
    assert.equal(json.size, '2048x1152'); assert.equal(json.prompt, input.prompt);
    await gateway.generate('local-fixture', { ...input, aspectRatio: '9:16', references: [{ mime: 'image/png', bytes: Buffer.from('fixture') }] });
    assert.equal(requests[1].url, '/v1/images/edits');
    assert.match(requests[1].contentType, /multipart/);
    assert.match(requests[1].body, /name="size"\r\n\r\n1152x2048/);
    await gateway.generate('local-fixture', { ...input, aspectRatio: 'auto' });
    assert.equal(JSON.parse(requests[2].body).size, '2048x2048');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('existing databases migrate additively and ratios persist across reopening', () => {
  const directory = mkdtempSync(join(tmpdir(), 'studio-geometry-'));
  let store;
  try {
    store = createStore(directory);
    const thread = store.createThread(1);
    const input = { clientRequestId: crypto.randomUUID(), prompt: 'Existing history', model: 'gpt-image-2.5', size: '2K', count: 1, groupId: 2 };
    const old = store.createMessage(1, thread.id, input);
    store.updateMessage(old.id, 'done');
    store.db.exec('ALTER TABLE messages DROP COLUMN aspect_ratio');
    store.close(); store = createStore(directory);
    assert.equal(store.getMessage(old.id, 1).aspectRatio, 'auto');
    assert.equal(store.getMessage(old.id, 1).prompt, input.prompt);
    const added = store.createMessage(1, thread.id, { ...input, clientRequestId: crypto.randomUUID(), aspectRatio: '5:4' });
    store.updateMessage(added.id, 'done');
    store.close(); store = createStore(directory);
    assert.equal(store.getMessage(added.id, 1).aspectRatio, '5:4');
    assert.equal(store.messages(thread.id, 1).length, 2);
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});


test('paper presets fit API bounds and preserve paper orientation and canonical retry size', () => {
 for (const [size,mm,w,h] of [['A2',[420,594]],['A3',[297,420],1760,2480],['A4',[210,297],1248,1760]]) {
  const portrait=resolveImageGeometry(size),landscape=resolveImageGeometry(size,'landscape');
  if(w) assert.deepEqual([portrait.width,portrait.height],[w,h]);
  assert.deepEqual([landscape.width,landscape.height],[portrait.height,portrait.width]);
  assert(portrait.width*portrait.height<=8294400); assert(Math.abs(portrait.width/portrait.height-mm[0]/mm[1])<.01);
  assert.deepEqual(portrait.paper,{widthMM:mm[0],heightMM:mm[1],targetDpi:150});assert.equal(resolveImageGeometry(size,landscape.aspectRatio).requestSize,landscape.requestSize);
  assert.deepEqual(imageSettingsForRetry({size,aspectRatio:landscape.aspectRatio}),{size,aspectRatio:landscape.aspectRatio});
 }
});

test('custom pixels are canonicalized once and constrained before dispatch',()=>{
 const dims=resolveImageGeometry('custom','auto',{width:1000,height:1500});assert.deepEqual(dims.pixelSize,{width:1008,height:1504});assert.equal(dims.requestSize,'1008x1504');assert.deepEqual(resolveImageGeometry('custom',dims.aspectRatio,dims.pixelSize),dims);
 assert.deepEqual(imageSettingsForRetry({size:'custom',aspectRatio:dims.aspectRatio,context:{pixelSize:dims.pixelSize}}),{size:'custom',aspectRatio:dims.aspectRatio,pixelWidth:'1008',pixelHeight:'1504'});
 for(const p of [undefined,null,[],{width:100,height:1000},{width:4097,height:1000},{width:1536.5,height:1000},{width:4096,height:512},{width:1024,height:1024,model:'override'}])assert.throws(()=>resolveImageGeometry('custom','auto',p));
 for(const pixelSize of [{width:512,height:512},{width:4096,height:4096},{width:4096,height:1536},{width:512,height:1536}]){
  const g=resolveImageGeometry('custom','auto',pixelSize);assert(g.width<=3840&&g.height<=3840);assert(g.width*g.height>=655360&&g.width*g.height<=8294400);
  assert(g.width<=g.height*3&&g.height<=g.width*3);assert.deepEqual(resolveImageGeometry('custom',g.aspectRatio,g.pixelSize),g);
 }
});

test('paper and custom pixel targets are sent on both image routes',async()=>{
 const requests=[],server=createServer(async(req,res)=>{const parts=[];for await(const part of req)parts.push(part);requests.push({path:req.url,body:Buffer.concat(parts).toString()});res.writeHead(200,{'content-type':'application/json'}).end('{"data":[]}');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const gateway=createGateway('http://127.0.0.1:'+server.address().port,'gpt-image-2.5-sunburst');for(const dimensions of [{size:'A4',aspectRatio:'landscape'},{size:'custom',pixelSize:{width:1000,height:1500}}])for(const references of [[],[{mime:'image/png',bytes:Buffer.from('fixture')}]]){await gateway.generate('fixture-only-key',{...dimensions,prompt:'轮椅',count:1,references});const sent=requests.at(-1),expected=dimensions.size==='A4'?'1760x1248':'1008x1504';assert.equal(sent.path,references.length?'/v1/images/edits':'/v1/images/generations');assert.ok(sent.body.includes(expected));}}finally{await new Promise(r=>server.close(r));}
});
