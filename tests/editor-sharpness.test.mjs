import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ADJUSTMENTS, DEFAULT_TRANSFORM, EDITOR_PRESETS, validateEditorState, validateOperations } from '../shared/editor-contract.mjs';
import { createEditorHistory } from '../src/editor-core/history.mjs';
import { adjustPixels } from '../src/editor-core/pixels.mjs';
import { demoEditorAnswer } from '../server/editor/demo.mjs';
import { editorPayload } from '../server/editor/planner.mjs';
import { operationSummary } from '../src/editor-ui/editor-api.mjs';
const doc = () => ({ documentId:'f77b648a-5545-4faa-a5b7-e687c4dc93c5',revision:0,width:5,height:3,name:'edge.png',mime:'image/png',adjustments:{...DEFAULT_ADJUSTMENTS},transform:{...DEFAULT_TRANSFORM},crop:null });
function pixels(values, height = 3) {
  return new Uint8ClampedArray(Array.from({length:height}, () => values.flatMap(v => [v,v,v,255])).flat());
}
test('sharpness defaults to zero for legacy drafts and presets; ranges are validated', () => {
  const old = doc(); delete old.adjustments.sharpness;
  assert.equal(validateEditorState(old).adjustments.sharpness,0);
  assert(EDITOR_PRESETS.every(p => p.adjustments.sharpness === 0));
  for(const value of [-1,101,NaN,'30']) assert.throws(()=>validateOperations([{type:'setAdjustments',values:{sharpness:value}}]));
});
test('zero and flat images remain unchanged; edge contrast increases monotonically', () => {
  const input = pixels([80,80,125,170,170]);
  assert.deepEqual(adjustPixels(input.slice(),5,3,DEFAULT_ADJUSTMENTS),input);
  for(const size of [[1,1],[5,1],[1,5],[5,3]]) {
    const flat = new Uint8ClampedArray(size[0]*size[1]*4);for(let i=0;i<flat.length;i+=4) flat.set([90,120,170,180],i);
    assert.deepEqual(adjustPixels(flat.slice(),...size,{...DEFAULT_ADJUSTMENTS,sharpness:100}),flat);
  }
  const mild = adjustPixels(input.slice(),5,3,{...DEFAULT_ADJUSTMENTS,sharpness:30});
  const strong = adjustPixels(input.slice(),5,3,{...DEFAULT_ADJUSTMENTS,sharpness:100});
  const i=(5+1)*4,j=(5+3)*4;
  assert(mild[i]<input[i]);assert(strong[i]<mild[i]);assert(strong[j]>mild[j]);
  assert.deepEqual(input,pixels([80,80,125,170,170]));
});
test('transparent hidden colors do not create fringes; alpha is unchanged',()=>{
  const input = new Uint8ClampedArray([255,0,255,0,100,100,100,255,100,100,100,128,0,255,0,0]);
  const out=adjustPixels(input.slice(),4,1,{...DEFAULT_ADJUSTMENTS,sharpness:100});
  assert.deepEqual(out,input);
});
test('sharpness participates in atomic AI history, undo, redo, stale revision guards and summaries',()=>{
  const h=createEditorHistory(doc());
  h.commit([{type:'setAdjustments',values:{sharpness:40,saturation:-10}}],{actor:'ai',documentId:h.document.documentId,baseRevision:0});
  assert.equal(h.document.adjustments.sharpness,40);h.undo();assert.equal(h.document.adjustments.sharpness,0);h.redo();assert.equal(h.document.adjustments.sharpness,40);
  assert.throws(()=>h.commit([{type:'setAdjustments',values:{sharpness:60}}],{actor:'ai',documentId:h.document.documentId,baseRevision:0}));
  assert.equal(operationSummary([{type:'setAdjustments',values:{sharpness:40}}]),'锐度 +40');
});
test('AI schema includes sharpness and local demo supports increase, decrease and disable',()=>{
  const state=doc();state.adjustments.sharpness=40;
  const request=prompt=>({prompt,state_json:JSON.stringify(state),preview_data_url:'data:image/png;base64,AAA='});
  const payload=editorPayload('test-model',request('锐化一点'),[]);
  assert.match(payload.messages[0].content, /"key":"sharpness"/);
  const run=text=>JSON.parse(demoEditorAnswer(editorPayload('test-model',request(text),[]))).operations[0].values.sharpness;
  assert.equal(run('锐化一点'),65);assert.equal(run('降低锐度'),25);assert.equal(run('关闭锐化'),0);
});
