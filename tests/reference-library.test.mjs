import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication} from '../server/index.mjs';
import {createReferenceLibrary} from '../server/reference-library.mjs';

function fixture(){
 const root=mkdtempSync(join(tmpdir(),'visora-reference-'));
 for(const folder of ['pose-gallery/img','pose-gallery/thumbs','costume-gallery/img','costume-gallery/thumbs'])mkdirSync(join(root,folder),{recursive:true});
 const images=Buffer.from('RIFF0000WEBPfixture');
 for(const kind of ['pose','costume'])for(const folder of ['img','thumbs'])writeFileSync(join(root,kind+'-gallery',folder,'fixture.webp'),images);
 writeFileSync(join(root,'pose-gallery/pose-index.json'),JSON.stringify([{id:'front',sys:'标准',no:'P001',cat:'站姿',name:'手在腰侧',ang:'正面',thumb:'thumbs/fixture.webp',img:'img/fixture.webp'},{id:'side',sys:'标准',no:'P001',cat:'站姿',name:'手在腰侧',ang:'侧面',thumb:'thumbs/fixture.webp',img:'img/fixture.webp'}]));
 writeFileSync(join(root,'costume-gallery/costumes-index.json'),JSON.stringify({items:[{id:'SPR-0001',categoria_ja:'春',keywords:'white coat',thumb:'thumbs/fixture.webp',img:'img/fixture.webp'}]}));
 return {root,images};
}
test('optional local catalog groups views, serves original indexed bytes, rejects unknown paths and write methods',async()=>{
 const {root,images}=fixture(),library=createReferenceLibrary(root),app=createApplication({demo:true,dataDir:join(root,'state'),referenceLibrary:library});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{
  const config=await(await fetch(base+'/api/config')).json();assert.equal(config.features.referenceLibrary,true);
  const c=await(await fetch(base+'/reference-library/catalog.json')).json();assert.equal(c.poseCount,1);assert.equal(c.poseImages,2);assert.equal(c.costumeCount,1);assert.equal(c.items[0].views.length,2);
  const r=await fetch(base+c.items[0].views[0].image);assert.equal(r.headers.get('content-type'),'image/webp');assert.deepEqual(Buffer.from(await r.arrayBuffer()),images);
  for(const path of ['/reference-library/pose/.git/config','/reference-library/pose/LICENSE','/reference-library/unknown','/reference-library/pose/img/unindexed.webp'])assert.equal((await fetch(base+path)).status,404);
  assert.equal((await fetch(base+'/reference-library/catalog.json',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/reference-library/pose/img/fixture.webp',{method:'HEAD'})).status,200);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
test('missing or traversing indexed assets fail before the optional service starts',()=>{
 const {root}=fixture();try{
  writeFileSync(join(root,'pose-gallery/pose-index.json'),JSON.stringify([{id:'invalid',sys:'system',no:'P01',thumb:'../../other-file',img:'img/fixture.webp'}]));assert.throws(()=>createReferenceLibrary(root),/Invalid reference asset path/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('excluded paired collections have neither catalog entries nor directly accessible assets',async()=>{
 const {root}=fixture();
 const index=join(root,'pose-gallery/pose-index.json');
 const poses=JSON.parse(readFileSync(index,'utf8'));
 for(const folder of ['img','thumbs'])writeFileSync(join(root,'pose-gallery',folder,'pair60_P001.webp'),'excluded');
 poses.push({id:'pair60_P001',sys:'双人缠绵',no:'P001',thumb:'thumbs/pair60_P001.webp',img:'img/pair60_P001.webp'});
 writeFileSync(index,JSON.stringify(poses));
 const app=createApplication({demo:true,dataDir:join(root,'state'),referenceLibraryRoot:root});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{
  const catalog=await(await fetch(base+'/reference-library/catalog.json')).json();
  assert.equal(catalog.poseImages,2);assert.equal(catalog.poseCount,1);assert.equal(catalog.costumeCount,1);
  assert(!JSON.stringify(catalog).includes('pair60'));
  for(const folder of ['img','thumbs'])assert.equal((await fetch(base+'/reference-library/pose/'+folder+'/pair60_P001.webp')).status,404);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
