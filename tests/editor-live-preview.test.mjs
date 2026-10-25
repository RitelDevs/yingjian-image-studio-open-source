import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorController} from '../src/editor-core/controller.mjs';
const wait = async predicate => {for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,2))}throw Error('Timed out')};
const operations=brightness=>[{type:'setAdjustments',values:{brightness}}];
const header=()=>new Blob([new Uint8Array([137,80,78,71,13,10,26,10,...Array(24).fill(0)])],{type:'image/png'});
async function setup(){
 const pending=[],revoked=[];let n=0;
 const c=createEditorController({userId:'live-preview-test',renderer:{async load(){return{width:4000,height:2000}},render(payload){return new Promise(resolve=>pending.push({payload,resolve:()=>resolve({blob:new Blob(['frame']),width:payload.maxEdge,height:payload.maxEdge/2})}))},release(){},dispose(){}},storage:{async read(){return null},async save(){},close(){}},createObjectURL:()=>`blob:test-${++n}`,revokeObjectURL:url=>revoked.push(url)});
 await c.start();await c.loadImage(header());await wait(()=>pending.length===1);pending[0].resolve();await wait(()=>!c.getSnapshot().rendering);
 return {c,pending,revoked};
}
test('continuous gestures display completed intermediate frames, coalesce work, then refine after release',async()=>{
 const {c,pending}=await setup();
 try{
  c.previewOperations(operations(10));await wait(()=>pending.length===2);
  const old=c.getSnapshot().previewUrl;
  for(let i=11;i<=35;i++)c.previewOperations(operations(i));
  pending[1].resolve();await wait(()=>pending.length===3);
  assert.notEqual(c.getSnapshot().previewUrl,old);
  assert.equal(c.getSnapshot().document.adjustments.brightness,35);
  assert.equal(c.getSnapshot().document.revision,0);assert.equal(c.getSnapshot().history.length,1);
  assert.equal(pending[1].payload.maxEdge,768);assert.equal(pending[2].payload.state.adjustments.brightness,35);
  const intermediate=c.getSnapshot().previewUrl;c.commitOperations();pending[2].resolve();await wait(()=>pending.length===4);
  assert.equal(c.getSnapshot().previewUrl,intermediate,'late drag frame is not applied after commit');
  assert.equal(pending[3].payload.maxEdge,1600);pending[3].resolve();await wait(()=>!c.getSnapshot().rendering);
  assert.equal(c.getSnapshot().previewWidth,1600);assert.equal(c.getSnapshot().history.length,2);
 }finally{c.dispose()}
});
test('cancel then start another gesture rejects the previous gesture frame even with the same revision',async()=>{
 const {c,pending}=await setup();
 try{
  const original=c.getSnapshot().previewUrl;c.previewOperations(operations(10));await wait(()=>pending.length===2);
  c.cancelPreview();c.previewOperations(operations(-20));pending[1].resolve();await wait(()=>pending.length===3);
  assert.equal(c.getSnapshot().previewUrl,original);pending[2].resolve();await wait(()=>!c.getSnapshot().rendering);
  assert.notEqual(c.getSnapshot().previewUrl,original);assert.equal(c.getSnapshot().document.adjustments.brightness,-20);
 }finally{c.dispose()}
});
test('changing the source while a gesture frame runs never displays that frame on the next image',async()=>{
 const {c,pending}=await setup();
 try{
  c.previewOperations(operations(70));await wait(()=>pending.length===2);await c.loadImage(header());
  const id=c.getSnapshot().document.documentId;pending[1].resolve();await wait(()=>pending.length===3);
  assert.equal(c.getSnapshot().previewUrl,'');assert.equal(pending[2].payload.state.documentId,id);
  pending[2].resolve();await wait(()=>!c.getSnapshot().rendering);assert.equal(c.getSnapshot().previewWidth,1600);
 }finally{c.dispose()}
});
