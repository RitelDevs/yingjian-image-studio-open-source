import test from 'node:test';
import assert from 'node:assert/strict';
import { zoomAt, fitImage, MIN_ZOOM, MAX_ZOOM } from '../src/editor-ui/viewport-math.mjs';
import { normalizeEditorOrigin, readEditorOrigin, saveEditorOrigin } from '../src/editor-ui/editor-origin.mjs';
test('zoom preserves the image point underneath the pointer and clamps the range', () => {
  const view={scale:1.4,x:30,y:-80},anchor={x:116,y:-43};
  const before={x:(anchor.x-view.x)/view.scale,y:(anchor.y-view.y)/view.scale};
  const after=zoomAt(view,3,anchor);
  assert.ok(Math.abs((anchor.x-after.x)/after.scale-before.x)<1e-9);
  assert.ok(Math.abs((anchor.y-after.y)/after.scale-before.y)<1e-9);
  assert.equal(zoomAt(view,100).scale,MAX_ZOOM);assert.equal(zoomAt(view,.001).scale,MIN_ZOOM);
  assert.equal(zoomAt(view,NaN).scale,view.scale);
});
test('fit respects portrait, landscape and small panes', () => {
  for(const [w,h,ratio] of [[700,600,2],[300,600,.5],[120,100,3]]){const fit=fitImage(w,h,ratio);assert.ok(fit.width<=w&&fit.height<=h);assert.ok(Math.abs(fit.width/fit.height-ratio)<1e-9);}
});
test('provenance is bound to both the account and the exact local document', () => {
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  saveEditorOrigin('a',id,{threadId:other},storage);assert.equal(readEditorOrigin('a',id,storage).threadId,other);
  assert.equal(readEditorOrigin('b',id,storage),null);assert.equal(readEditorOrigin('a',other,storage),null);
  saveEditorOrigin('a',other,null,storage);assert.equal(readEditorOrigin('a',other,storage).kind,'upload');assert.equal(readEditorOrigin('a',id,storage),null);
  assert.equal(normalizeEditorOrigin(id,{threadId:'../../other-user'}).kind,'upload');assert.equal(normalizeEditorOrigin('invalid',null),null);
});
