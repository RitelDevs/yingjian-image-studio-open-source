import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const { createApplication } = await import(process.env.RENAME_PREVIEW_BACKEND || '../server/index.mjs');
import { createStore } from '../server/store.mjs';

async function fixture() {
  const dir=mkdtempSync(join(tmpdir(),'thread-rename-'));
  const app=createApplication({dataDir:dir,gateway:{model:'fixture',profile:async()=>{throw Error('No upstream requests expected');}}});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const cookie=id=>'studio_sid='+app.store.saveSession({id,email:`user${id}@example.invalid`,status:'active',role:id===2?'admin':'user'},'fixture-access',null,3600);
  const one=cookie(1),other=cookie(2),origin=`http://127.0.0.1:${app.server.address().port}`;
  async function request(path,{body,token=one,method=body?'PATCH':'GET',headers={}}={}) {
    const response=await fetch(origin+path,{method,headers:{...(body?{'content-type':'application/json'}:{}),...(token?{cookie:token}:{}),...headers},body:body&&JSON.stringify(body)});
    return{status:response.status,data:await response.json()};
  }
  return{app,dir,one,other,request,stop:async()=>{await new Promise(r=>app.server.close(r));app.close();rmSync(dir,{recursive:true,force:true});}};
}

test('renaming persists across reopen, preserves messages, and cannot be accessed by another user or admin',async()=>{
 const f=await fixture();try{
  const thread=f.app.store.createThread(1),path='/api/threads/'+thread.id;
  const changed=await f.request(path,{body:{title:'  建筑 · 周末方案  '}});assert.equal(changed.status,200);assert.equal(changed.data.thread.title,'建筑 · 周末方案');assert.equal(changed.data.thread.titleEdited,true);
  assert.equal((await f.request('/api/threads')).data.threads[0].title,'建筑 · 周末方案');
  assert.equal((await f.request(path,{body:{title:'admin overwrite'},token:f.other})).status,404);
  assert.equal((await f.request(path,{body:{title:'anonymous overwrite'},token:null})).status,401);
  assert.equal((await f.request(path,{body:{title:'evil'},headers:{origin:'https://other.invalid'}})).status,403);
  const reopened=createStore(f.dir);assert.equal(reopened.thread(thread.id,1).title,'建筑 · 周末方案');reopened.close();
  assert.deepEqual((await f.request(path)).data.messages,[]);
 }finally{await f.stop()}
});

test('invalid names fail without changes and a renamed default title is not overwritten by later prompts',async()=>{
 const f=await fixture();try{
  const thread=f.app.store.createThread(1),path='/api/threads/'+thread.id;
  for(const title of ['', '   ', 'x'.repeat(61), 'a\nb', 'a\0b', 5, {}, null])assert.equal((await f.request(path,{body:{title}})).status,400);
  assert.equal((await f.request(path)).data.thread.title,'新的创作');
  assert.equal((await f.request(path,{body:{title:'新的创作'}})).status,200);
  const m=f.app.store.createMessage(1,thread.id,{clientRequestId:randomUUID(),prompt:'这段提示词不应覆盖手动名称',model:'fixture',size:'1K',count:1,groupId:2});
  assert.equal((await f.request(path)).data.thread.title,'新的创作');
  assert.equal((await f.request(path)).data.messages[0].id,m.id);
  const sixty='名'.repeat(60);assert.equal((await f.request(path,{body:{title:sixty}})).status,200);
  assert.equal((await f.request(path)).data.thread.title,sixty);
  f.app.store.updateMessage(m.id,'done');assert.equal((await f.request(path,{method:'DELETE'})).status,200);
  assert.equal(f.app.store.db.prepare('SELECT count(*) AS n FROM thread_renames').get().n,0);
  assert.equal((await f.request(path,{body:{title:'deleted'}})).status,404);
 }finally{await f.stop()}
});
