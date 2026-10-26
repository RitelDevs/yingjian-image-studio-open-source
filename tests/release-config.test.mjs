import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VERSION} from '../shared/version.mjs';
import {normalizeSSOSources,createSSO} from '../server/sso.mjs';
import {bridgeHtml} from '../server/sso-bridge.mjs';
test('package and public API version stay aligned',()=>{assert.equal(JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version,VERSION);assert.equal(VERSION,'1.5.1');});
test('SSO sources are explicit canonical HTTPS origins',()=>{
 const sources=[{id:'gateway',name:'自有中转',origin:'https://gateway.example.com'}];assert.deepEqual(normalizeSSOSources(sources),sources);
 for(const origin of ['http://gateway.example.com','https://gateway.example.com/','https://gateway.example.com/path','https://user:pass@gateway.example.com','javascript:alert(1)'])assert.throws(()=>normalizeSSOSources([{...sources[0],origin}]));
 assert.throws(()=>normalizeSSOSources([...sources,...sources]));assert.throws(()=>normalizeSSOSources('all'));assert.throws(()=>normalizeSSOSources([{...sources[0],id:'../bad'}]));
 assert.deepEqual(createSSO({enabled:true,publicOrigin:'https://images.example.com',sources,store:{},gateway:{}}).sources,sources);
});
test('bridge copy and return URL use configured values safely',()=>{const html=bridgeHtml('<img src=x onerror=alert(1)>','https://images.example.com');assert.ok(html.includes('&lt;img'));assert.ok(html.includes('href="https://images.example.com/#account-entry"'));assert.ok(!html.includes('<img src=x'));});

test('multi-domain SSO keeps source lists, bridge parents and tickets bound to their studio', async()=>{
 const main='https://images.example.com',legacy='https://legacy.example.com';
 const sources=[{id:'main',name:'Main',origin:'https://dash.example.com',studioOrigin:main},{id:'old',name:'Old',origin:'https://old-gateway.example.com',studioOrigin:legacy}];
 const token=['test',Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'signature'].join('.');
 let saves=0;
 const sso=createSSO({enabled:true,publicOrigin:main,publicOrigins:[main,legacy],sources,requestPublicOrigin:req=>req.headers.host==='images.example.com'?main:legacy,store:{encrypt:v=>v,decrypt:v=>v,saveSession:()=>{saves++;return 'mock-session'}},gateway:{profile:async()=>({id:7,status:'active'})}});
 assert.equal(sso.sourcesFor(main)[0].id,'main');assert.equal(sso.sourcesFor(legacy)[0].id,'old');assert.deepEqual(sso.sourcesFor('https://evil.example.com'),[]);
 async function request(path,body,{studio=main,origin=studio,cookie='',method='POST',extra={}}={}){let result={};try{await sso.handle({method,headers:{host:new URL(studio).host,origin,cookie,...extra}},{writeHead:(status,headers)=>{result={status,headers}},end:raw=>{result.raw=String(raw)}},path,{send:(_,status,data,headers)=>{result={status,data,headers}},parseJson:async()=>body,sessionCookie:()=> 'mock-cookie'});}catch(e){result={status:e.status||500};}return result;}
 const start=await request('/api/sso/start',{source:'old'},{studio:legacy});assert.equal(start.status,200);const cookie=start.headers['set-cookie'].split(';')[0];
 const exchange=await request('/api/sso/exchange',{challenge:start.data.challenge,accessToken:token},{origin:sources[1].origin});assert.equal(exchange.status,200);
 assert.equal((await request('/api/sso/finish',{code:exchange.data.code},{studio:main,cookie})).status,401);assert.equal(saves,0);
 assert.equal((await request('/api/sso/finish',{code:exchange.data.code},{studio:legacy,cookie})).status,200);assert.equal(saves,1);
 const bridge=await request('/api/sso/silent.js',{}, {method:'GET',extra:{'x-studio-bridge-origin':sources[1].origin}});assert.ok(bridge.raw.includes(legacy));
 assert.equal((await request('/api/sso/start',{source:'old'},{studio:main})).status,400);
});
