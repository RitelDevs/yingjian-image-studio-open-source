import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApplication } from '../server/index.mjs';
import { createGateway } from '../server/gateway.mjs';

async function fixture() {
  const dir=mkdtempSync(join(tmpdir(),'studio-turnstile-'));
  const calls=[];let settings={turnstile_enabled:true,turnstile_site_key:'1x00000000000000000000AA',turnstile_secret_key:'private-fixture-never-expose',other_private:'fixture'};
  const upstream=createServer(async(req,res)=>{
    let text='';for await(const chunk of req)text+=chunk;
    const body=text?JSON.parse(text):null;calls.push({path:req.url,body});
    if(req.url==='/api/v1/settings/public') {res.setHeader('content-type','application/json');res.end(JSON.stringify({code:0,data:settings}));return;}
    if(req.url==='/api/v1/auth/login') {
      const token=body?.turnstile_token;
      res.writeHead(token==='valid-fixture-proof'?401:400,{'content-type':'application/json'});
      res.end(JSON.stringify(token==='valid-fixture-proof'?{reason:'INVALID_CREDENTIALS',message:'Invalid email or password'}:{reason:'TURNSTILE_FAILED',message:'Invalid captcha'}));return;
    }
    res.writeHead(404);res.end('{}');
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const gateway=createGateway(`http://127.0.0.1:${upstream.address().port}`,'gpt-image-2.5');
  const app=createApplication({dataDir:dir,gateway});await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const request=async(path,body)=>{
    const r=await fetch(`http://127.0.0.1:${app.server.address().port}`+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body&&JSON.stringify(body)});
    return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};
  };
  return {calls,app,gateway,request,setSettings:value=>{settings=value},upstreamOrigin:`http://127.0.0.1:${upstream.address().port}`,stop:async()=>{await new Promise(r=>app.server.close(r));app.close();await new Promise(r=>upstream.close(r));rmSync(dir,{recursive:true,force:true});}};
}

test('public verification config exposes only the public site key and caches settings safely',async()=>{
  const f=await fixture();try{
    for(let n=0;n<2;n++){
      const r=await f.request('/api/login-config');assert.equal(r.status,200);
      assert.deepEqual(r.data,{turnstileEnabled:true,turnstileSiteKey:'1x00000000000000000000AA'});
      assert.doesNotMatch(JSON.stringify(r.data),/secret|private/);
    }
    assert.equal(f.calls.filter(item=>item.path==='/api/v1/settings/public').length,1);
  }finally{await f.stop()}
});

test('login passes the proof exactly to Sub2API and distinguishes failed proof from wrong credentials',async()=>{
  const f=await fixture();try{
    const body={email:'fixture@example.invalid',password:'wrong-fixture-password'};
    const missing=await f.request('/api/login',body);assert.equal(missing.status,400);assert.match(missing.data.error,/人机验证/);
    const expired=await f.request('/api/login',{...body,turnstileToken:'expired-fixture-proof'});assert.equal(expired.status,400);assert.match(expired.data.error,/人机验证/);
    const verified=await f.request('/api/login',{...body,turnstileToken:'valid-fixture-proof'});assert.equal(verified.status,401);assert.equal(verified.data.error,'邮箱或密码不正确，请检查后重试。');
    assert.deepEqual(f.calls.at(-1).body,{...body,turnstile_token:'valid-fixture-proof'});assert.equal(verified.cookie,null);
    const count=f.calls.length;
    for(const token of [45,{},'x'.repeat(2049)])assert.equal((await f.request('/api/login',{...body,turnstileToken:token})).status,400);
    assert.equal(f.calls.length,count);
    assert.equal(f.app.store.db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
  }finally{await f.stop()}
});

test('verification disabled and malformed configuration are handled without exposing secrets or silently bypassing enabled captcha',async()=>{
  const f=await fixture();try{
    f.setSettings({turnstile_enabled:false,turnstile_site_key:'private-unused'});
    const disabled=createGateway(f.upstreamOrigin,'gpt-image-2.5');assert.deepEqual(await disabled.loginConfig(),{turnstileEnabled:false,turnstileSiteKey:''});
    f.setSettings({turnstile_enabled:true,turnstile_site_key:''});
    const broken=createGateway(f.upstreamOrigin,'gpt-image-2.5');await assert.rejects(broken.loginConfig(),error=>error.reason==='login_verification_configuration');
    const demo=createGateway(f.upstreamOrigin,'gpt-image-2.5',true);const before=f.calls.length;
    assert.deepEqual(await demo.loginConfig(),{turnstileEnabled:false,turnstileSiteKey:''});assert.equal(f.calls.length,before);
  }finally{await f.stop()}
});
