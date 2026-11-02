import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {createApplication} from '../server/index.mjs';
import {createSub2apiAccount,SUB2API_VISORA_ORIGIN,SUB2API_IMAGES_ORIGIN} from '../server/sub2api-account.mjs';
import {createSub2apiTrustedContext} from '../server/sub2api-account-runtime.mjs';
import {STYLE_CATALOG} from '../shared/style-catalog.mjs';

test('model selection preserves central identity and origin checks through chat, professional planning and confirmation', async()=>{
 const directory=mkdtempSync(join(tmpdir(),'studio-central-model-')),dispatch=[],centralChecks=[];
 const issuer='https://account.example.test',context={clientIp:'127.0.0.1',userAgent:'test-fixture',acceptLanguage:'en'};
 let revoked=false;
 const result=()=>({user:{id:7,uid:'sub2api:7',email:'fixture@example.invalid',status:'active'},csrf:'fixture-csrf',native:{accessToken:'fixture-token',accessExpiresAt:Date.now()+3600000,context}});
 const make=origin=>{const clientId=origin===SUB2API_VISORA_ORIGIN?'visora':'images',key=(clientId==='visora'?'a':'b').repeat(64);return createSub2apiAccount({origin,issuer,clientId,getTrustedContext:createSub2apiTrustedContext({origin,transport:'loopback-proxy'}),consumer:{origin,issuer,clientId,handle:async()=>false,requireSession:async()=>result(),getSessionKey:()=>key,authorizeSessionKey:async k=>{assert.equal(k,key);centralChecks.push(origin);if(revoked)throw Object.assign(new Error('revoked'),{statusCode:401});return result();},close(){}}});};
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fJkAAAAASUVORK5CYII=';
 const gateway={model:'gpt-image-2.5',profile:async()=>result().user,groups:async()=>[{id:2,name:'Fixture',platform:'openai',allow_image_generation:true}],createKey:async()=>({id:1,key:'fixture-central-test-key'}),converse:async(key,p)=>{dispatch.push(p.model);return p.messages[0].content.includes('专业方案助理')?JSON.stringify({ready:true,decisions:[{aspect:'composition',detail:'完整保留轮椅外形，采用明确的主体层级。'},{aspect:'preservation',detail:'保留车架结构与颜色，不额外增加部件。'}]}):JSON.stringify({ready:true,reply:'请确认方案。',prompt:'轮椅，白色背景。'});},generate:async()=>{dispatch.push('image');return {data:[{b64_json:png}]};}};
 const app=createApplication({dataDir:directory,demo:false,gateway,sub2apiAccount:make(SUB2API_VISORA_ORIGIN),legacySub2apiAccount:make(SUB2API_IMAGES_ORIGIN),concurrency:10});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const call=(path,{body,origin=SUB2API_VISORA_ORIGIN,source=origin,csrf='fixture-csrf'}={})=>new Promise((resolve,reject)=>{const host=new URL(origin).host;const req=request({hostname:'127.0.0.1',port:app.server.address().port,path,method:body?'POST':'GET',headers:{host,'x-forwarded-host':host,'x-forwarded-proto':'https','x-ritel-client-ip':'127.0.0.1','user-agent':'test-fixture','accept-language':'en',...(body?{'content-type':'application/json',origin:source,'x-csrf-token':csrf}:{})}},res=>{let data='';res.on('data',x=>data+=x);res.on('end',()=>{try{resolve({status:res.statusCode,data:JSON.parse(data)});}catch(e){reject(e);}});});req.on('error',reject);req.end(body?JSON.stringify(body):undefined);});
 const wait=async(id,origin)=>{for(let i=0;i<200;i++){const r=await call('/api/jobs/'+id,{origin});if(!['queued','running'].includes(r.data.job?.status))return r.data.job;await new Promise(r=>setTimeout(r,10));}throw Error('job timed out');};
 try{
  for(const origin of [SUB2API_VISORA_ORIGIN,SUB2API_IMAGES_ORIGIN]){
   const config=(await call('/api/config',{origin})).data;assert.equal(config.accountMode,'sub2api');assert.equal(config.chatModel,'gpt-6-luna');assert.deepEqual(config.chatModels,['gpt-6-luna','gpt-6.1-sol']);
   const thread=(await call('/api/threads',{origin,body:{}})).data.thread.id;
   const body={clientRequestId:crypto.randomUUID(),threadId:thread,prompt:'一个轮椅',groupId:2,chatModel:'gpt-6.1-sol',imageModel:'gpt-image-2.5-flare'};
   assert.equal((await call('/api/chat',{origin,source:origin===SUB2API_VISORA_ORIGIN?SUB2API_IMAGES_ORIGIN:SUB2API_VISORA_ORIGIN,body})).status,403);
   assert.equal((await call('/api/chat',{origin,csrf:'wrong',body})).status,403);
   const accepted=await call('/api/chat',{origin,body});assert.equal(accepted.status,202);const job=await wait(accepted.data.job.id,origin);assert.equal(job.model,'gpt-6.1-sol');assert.equal(job.status,'done');
   const style=STYLE_CATALOG.find(s=>s.inputMode!=='reference');const plan=await call('/api/style-plans',{origin,body:{clientRequestId:crypto.randomUUID(),threadId:thread,styleId:style.id,styleVersion:style.version,subject:'一个轮椅',groupId:2,size:'2K',count:1,styleOptimization:'professional',chatModel:'gpt-6.1-sol',imageModel:'gpt-image-2.5-sunburst'}});assert.equal(plan.status,202);const complete=await wait(plan.data.job.id,origin);assert.equal(complete.status,'done');assert.equal(complete.proposal.optimization.model,'gpt-6.1-sol');
   const image=await call('/api/plans/'+complete.id+'/confirm',{origin,body:{confirmed:true}});assert.equal(image.status,202);const done=await wait(image.data.job.id,origin);assert.equal(done.status,'done');assert.equal(done.model,'gpt-image-2.5-sunburst');assert.ok(centralChecks.includes(origin));
   revoked=true;const count=dispatch.length;const denied=await call('/api/chat',{origin,body:{...body,clientRequestId:crypto.randomUUID()}});assert.equal(denied.status,202);assert.equal((await wait(denied.data.job.id,origin)).status,'failed');assert.equal(dispatch.length,count);revoked=false;
  }
 }finally{await app.close();rmSync(directory,{recursive:true,force:true});}
});
