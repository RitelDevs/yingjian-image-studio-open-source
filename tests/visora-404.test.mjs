import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApplication} from '../server/index.mjs';

test('unknown webpage GET/HEAD is branded 404; root hash routes, real assets and JSON APIs keep their contracts',async()=>{
 const root=mkdtempSync(join(tmpdir(),'visora-404-')),dist=join(root,'dist');mkdirSync(dist);mkdirSync(join(dist,'assets'));
 writeFileSync(join(dist,'index.html'),'<!doctype html><title>Fixture studio</title><div id="root"></div>');writeFileSync(join(dist,'assets/app.js'),'export const fixture=true;');writeFileSync(join(dist,'404.html'),readFileSync(new URL('../public/404.html',import.meta.url)));
 const app=createApplication({dataDir:join(root,'data'),distDir:dist,demo:true});
 try{await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
  for(const path of ['/', '/?view=works#editor','/#styles','/#showcase-works','/index.html','/assets/app.js'])assert.equal((await fetch(base+path)).status,200,path);
  const missing=await fetch(base+'/__design_missing_20261031',{headers:{accept:'text/html'}});assert.equal(missing.status,404);assert.match(missing.headers.get('content-type'),/^text\/html/);assert.equal(missing.headers.get('cache-control'),'no-store');const html=await missing.text();for(const text of ['Ritel.SI Visora','找不到这个页面','找不到這個頁面','This page could not be found','https://ritel.si/','https://dash.ritel.si/','https://dash.ritel.si/support-tickets'])assert.ok(html.includes(text),text);
  const head=await fetch(base+'/__design_missing_20261031',{method:'HEAD'});assert.equal(head.status,404);assert.equal(await head.text(),'');assert.equal(head.headers.get('content-length'),missing.headers.get('content-length'));
  assert.equal((await fetch(base+'/api/health')).status,200);
  for(const path of ['/api/not-found','/auth/not-found','/v1/not-found']){const r=await fetch(base+path);assert.ok(r.status>=400);assert.match(r.headers.get('content-type'),/^application\/json/);}
  const post=await fetch(base+'/__design_missing_20261031',{method:'POST',body:'fixture'});assert.equal(post.status,404);assert.match(post.headers.get('content-type'),/^application\/json/);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
