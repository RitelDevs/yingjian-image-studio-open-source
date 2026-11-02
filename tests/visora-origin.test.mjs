import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {createSub2apiAccount,SUB2API_VISORA_ORIGIN,SUB2API_IMAGES_ORIGIN} from '../server/sub2api-account.mjs';
import {createApplication} from '../server/index.mjs';
const issuer='https://account.ritel.si';
function setup(origin) {const result={user:{id:7,uid:'sub2api:7'},csrf:'session-csrf',native:{accessToken:'fixture-token',accessExpiresAt:Date.now()+60000}};const consumer={origin,issuer,clientId:'fixture',handle:async()=>false,requireSession:async()=>result,getSessionKey:()=> 'a'.repeat(64),authorizeSessionKey:async()=>result,close(){}};return {consumer,account:createSub2apiAccount({origin,issuer,clientId:'fixture',consumer})};}
for(const origin of [SUB2API_VISORA_ORIGIN,SUB2API_IMAGES_ORIGIN]) {
 test(`central consumer ${origin} accepts its own POST, rejects the other origin and missing CSRF`,async()=>{
  const {account}=setup(origin);let writes=0;const store={bindSub2apiSession:({origin:bound,user})=>{writes++;assert.equal(bound,origin);return {user_id:user.id};}};
  const req=(source=origin,csrf='session-csrf')=>({method:'POST',headers:{origin:source,'x-csrf-token':csrf,'sec-fetch-site':'same-origin'}});
  assert.deepEqual(await account.authenticate(store,req()),{user_id:7});
  for(const r of [req(origin===SUB2API_VISORA_ORIGIN?SUB2API_IMAGES_ORIGIN:SUB2API_VISORA_ORIGIN),req(origin,''),{method:'POST',headers:{}}])await assert.rejects(account.authenticate(store,r),e=>e.status===403);
  assert.equal(writes,1);
 });
 test(`app starts at exact origin ${origin} with central mode and no legacy SSO`,async()=>{
  const dataDir=mkdtempSync(join(tmpdir(),'visora-origin-'));const {account}=setup(origin);const app=createApplication({dataDir,sub2apiAccount:account,publicOrigin:origin,publicOrigins:[origin],demo:false});
  try{await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const config=await new Promise((resolve,reject)=>{const req=request({hostname:'127.0.0.1',port:app.server.address().port,path:'/api/config',headers:{host:new URL(origin).host}},res=>{let body='';res.on('data',chunk=>body+=chunk);res.on('end',()=>{try{assert.equal(res.statusCode,200);resolve(JSON.parse(body));}catch(error){reject(error);}});});req.on('error',reject);req.end();});assert.equal(config.accountMode,'sub2api');assert.deepEqual(config.ssoSources,[]);}finally{await app.close();rmSync(dataDir,{recursive:true,force:true});}
 });
}
test('unknown, wildcard, noncanonical and lookalike Studio origins remain rejected',()=>{
 for(const origin of ['https://visora.ritel.si/','http://visora.ritel.si','https://visora.ritel.si.evil.test','https://images.ritelt.com','https://other.ritel.si','https://*.ritel.si'])assert.throws(()=>setup(origin),/Explicit Sub2API Studio consumer required/);
 const {consumer}=setup(SUB2API_IMAGES_ORIGIN);assert.throws(()=>createSub2apiAccount({origin:SUB2API_VISORA_ORIGIN,issuer,clientId:'fixture',consumer}),/Explicit Sub2API Studio consumer required/);
});
