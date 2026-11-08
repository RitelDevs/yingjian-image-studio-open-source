import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { transparencyWarning } from '../server/image-transparency.mjs';
import { STYLE_CATALOG } from '../shared/style-catalog.mjs';
import { image, fixture } from './helpers/transparency.mjs';

test('transparent generation and reference edit send native PNG controls and download true alpha unchanged',async t=>{
  const f=await fixture(t);
  for(const references of [[],[{dataUrl:'data:image/png;base64,'+f.transparent.toString('base64')}]]){
    const {status,data}=await f.request('/api/jobs',f.body({references}));assert.equal(status,202);
    const job=await f.wait(data.job.id);assert.equal(job.status,'done');
    const sent=f.calls.at(-1);assert.equal(sent.path,references.length?'/v1/images/edits':'/v1/images/generations');
    assert.equal(sent.payload.background,'transparent');assert.equal(sent.payload.output_format,'png');assert(!Object.hasOwn(sent.payload,'response_format'));
    if(references.length)assert(sent.bytes.includes(f.transparent));
    const bytes=await f.downloaded(job);assert(bytes.equals(f.transparent));assert.equal(PNG.sync.read(bytes).data[7],0);
  }
});

test('chat and both style plans lock the selected background until confirmed generation',async t=>{
  const f=await fixture(t),style=STYLE_CATALOG.find(s=>s.inputMode!=='reference');
  for(const mode of ['chat','template','professional']){
    const input=mode==='chat'?f.body({}):f.body({styleId:style.id,styleVersion:style.version,subject:'蓝色椅子',styleOptimization:mode});
    const prepared=await f.request(mode==='chat'?'/api/chat':'/api/style-plans',input);assert([201,202].includes(prepared.status));
    const plan=await f.wait(prepared.data.job.id);assert.equal(plan.status,'done');assert.equal(plan.proposal.settings.background,'transparent');
    assert.equal((await f.request('/api/plans/'+plan.id+'/confirm',{confirmed:true,background:'opaque'})).status,409);
    const confirmed=await f.request('/api/plans/'+plan.id+'/confirm',{confirmed:true});assert.equal(confirmed.status,202);
    const job=await f.wait(confirmed.data.job.id);assert.equal(job.status,'done');assert.equal(f.calls.at(-1).payload.background,'transparent');
    assert((await f.downloaded(job)).equals(f.transparent));
  }
});

test('opaque output is retained with an explicit transparency warning and never auto retried',async t=>{
  const f=await fixture(t,true),{data}=await f.request('/api/jobs',f.body({})),job=await f.wait(data.job.id);
  assert.equal(job.status,'partial');assert.match(job.error,/没有透明像素/);assert.equal(f.calls.length,1);assert((await f.downloaded(job)).equals(f.solid));
});

test('automatic background preserves existing native requests and invalid choices never dispatch',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/jobs',f.body({background:'checkerboard'}))).status,400);assert.equal(f.calls.length,0);
  const {data}=await f.request('/api/jobs',f.body({background:'auto'}));assert.equal((await f.wait(data.job.id)).status,'done');
  assert(!Object.hasOwn(f.calls[0].payload,'background'));assert(!Object.hasOwn(f.calls[0].payload,'output_format'));
  const opaque=await f.request('/api/jobs',f.body({background:'opaque'}));assert.equal((await f.wait(opaque.data.job.id)).status,'done');assert.equal(f.calls.at(-1).payload.background,'opaque');
});

test('alpha verification rejects solid or corrupt PNG, wrong format and excessive dimensions without changing bytes',()=>{
  const bytes=image(0),copy=Buffer.from(bytes);assert.equal(transparencyWarning({bytes,mime:'image/png'}),null);assert(bytes.equals(copy));
  assert.match(transparencyWarning({bytes:image(255),mime:'image/png'}),/没有透明像素/);
  assert.match(transparencyWarning({bytes,mime:'image/jpeg'}),/PNG/);
  assert.match(transparencyWarning({bytes:Buffer.alloc(8),mime:'image/png'}),/未能核验/);
  const huge=Buffer.from(bytes);huge.writeUInt32BE(100000,16);assert.match(transparencyWarning({bytes:huge,mime:'image/png'}),/未能核验/);
});
