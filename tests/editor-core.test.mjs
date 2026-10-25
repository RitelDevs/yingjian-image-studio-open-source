import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ADJUSTMENTS, DEFAULT_TRANSFORM, EDITOR_PRESETS, validateEditorState, validateOperations, applyOperations, MAX_IMAGE_BYTES } from '../shared/editor-contract.mjs';
import { createEditorHistory, HISTORY_LIMIT } from '../src/editor-core/history.mjs';
import { adjustPixels } from '../src/editor-core/pixels.mjs';
import { resolveRenderGeometry } from '../src/editor-core/geometry.mjs';
import { validateImageBlob } from '../src/editor-core/image-input.mjs';
import { createEditorController } from '../src/editor-core/controller.mjs';

const uuid = 'f77b648a-5545-4faa-a5b7-e687c4dc93c5';
function state(patch = {}) { return { documentId: uuid, revision: 0, width: 4096, height: 2048, name: 'test.png', mime: 'image/png',
  adjustments: { ...DEFAULT_ADJUSTMENTS }, transform: { ...DEFAULT_TRANSFORM }, crop: null, ...patch }; }
const adjustments = values => [{ type: 'setAdjustments', values }];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function until(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await sleep(5); } throw new Error('Timed out waiting for editor state'); }
function pngHeader() { return new Blob([new Uint8Array([137,80,78,71,13,10,26,10,...Array(24).fill(0)])], { type: 'image/png' }); }
function fixture({ storage = {}, renderer = {}, userId = 'test-user' } = {}) {
  const saves = [], renders = [], released = [], revoked = [];
  let urlCounter = 0, saved = null;
  const controller = createEditorController({ userId,
    renderer: { async load() { return { width: 40, height: 20 }; },
      async render(payload) { renders.push(payload); return { blob: new Blob([JSON.stringify(payload.state)], { type: 'image/png' }), width: 40, height: 20 }; },
      release(id) { released.push(id); }, dispose() {}, ...renderer },
    storage: { async read() { return saved; }, async save(value) { saved = structuredClone(value); saves.push(saved); }, async close() {}, ...storage },
    createObjectURL: () => `blob:editor-test-${++urlCounter}`, revokeObjectURL: value => revoked.push(value)
  });
  return { controller, saves, renders, released, revoked, get saved() { return saved; } };
}

test('shared state and operation validation rejects unsafe or ambiguous input without coercion', () => {
  const initial = state();
  assert.deepEqual(validateEditorState(initial), initial);
  assert.notEqual(validateEditorState(initial).adjustments, initial.adjustments);
  for (const values of [{ brightness: 101 }, { contrast: NaN }, { saturation: Infinity }, { temperature: '10' }, { vignette: -1 }, {}, { hue: 2 }]) assert.throws(() => validateOperations(adjustments(values)));
  for (const operations of [null, {}, [{ type: 'unknown' }], [{ type: 'reset', code: 'eval()' }], [{ type: 'undo' }, { type: 'redo' }],
    [{ type: 'setCrop', crop: { x: .9, y: 0, width: .2, height: .5 } }], [{ type: 'setCrop', crop: { x: 0, y: 0, width: 0, height: 1 } }],
    [{ type: 'setTransform', values: { rotation: 45 } }], [{ type: 'setTransform', values: { flipX: 1 } }], [{ type: 'applyPreset', presetId: 'injected' }],
    Array.from({ length: 33 }, () => ({ type: 'reset' }))]) assert.throws(() => validateOperations(operations));
  assert.throws(() => validateOperations([JSON.parse('{"type":"setAdjustments","values":{"__proto__":{}}}')]));
  for (const patch of [{ documentId: 'invalid' }, { revision: -1 }, { revision: .5 }, { width: 0 }, { height: 16385 }, { width: 10000, height: 10000 }, { mime: 'image/svg+xml' }]) assert.throws(() => validateEditorState(state(patch)));
  assert.deepEqual(validateOperations([]), []);
  assert.deepEqual(validateOperations([{ type: 'undo' }]), [{ type: 'undo' }]);
});

test('operation batches apply atomically with absolute values and one revision', () => {
  const initial = state();
  const result = applyOperations(initial, [...adjustments({ brightness: 10 }), ...adjustments({ brightness: 20, saturation: -15 })]);
  assert.equal(result.adjustments.brightness, 20); assert.equal(result.adjustments.saturation, -15); assert.equal(result.revision, 1);
  assert.equal(initial.adjustments.brightness, 0); assert.equal(initial.revision, 0);
  assert.throws(() => applyOperations(initial, [...adjustments({ brightness: 10 }), { type: 'setAdjustments', values: { saturation: 200 } }]));
  assert.deepEqual(initial, state());
  assert.equal(applyOperations(initial, adjustments({ brightness: 0 })).revision, 0);
  assert.equal(applyOperations(initial, [...adjustments({ brightness: 10 }), ...adjustments({ brightness: 0 })]).revision, 0);
  assert.throws(() => applyOperations(initial, [{ type: 'undo' }]), error => error.code === 'history_required');
});

test('presets preserve geometry; transform changes clear old crop; reset restores every edit', () => {
  const initial = state({ transform: { rotation: 90, flipX: true, flipY: false }, crop: { x: .1, y: .2, width: .6, height: .5 } });
  for (const preset of EDITOR_PRESETS) {
    const result = applyOperations(initial, [{ type: 'applyPreset', presetId: preset.id }]);
    assert.deepEqual(result.adjustments, preset.adjustments); assert.deepEqual(result.crop, initial.crop); assert.deepEqual(result.transform, initial.transform);
  }
  assert.equal(applyOperations(initial, [{ type: 'setTransform', values: { rotation: 180 } }]).crop, null);
  assert.deepEqual(applyOperations(initial, [{ type: 'setTransform', values: { rotation: 90 } }]).crop, initial.crop);
  const reset = applyOperations(initial, [{ type: 'reset' }]);
  assert.deepEqual(reset.adjustments, DEFAULT_ADJUSTMENTS); assert.deepEqual(reset.transform, DEFAULT_TRANSFORM); assert.equal(reset.crop, null);
  assert.equal(reset.documentId, uuid); assert.equal(reset.width, initial.width);
});

test('history groups AI edits, increments undo/redo revisions, branches, and rejects stale context', () => {
  const history = createEditorHistory(state());
  history.commit([...adjustments({ brightness: 15 }), { type: 'applyPreset', presetId: 'warm' }], { actor: 'ai', documentId: uuid, baseRevision: 0, label: 'AI 暖调' });
  assert.equal(history.document.revision, 1); assert.equal(history.history.length, 2); assert.equal(history.history[1].actor, 'ai');
  assert.equal(history.undo().revision, 2); assert.equal(history.document.adjustments.temperature, 0); assert.equal(history.canRedo, true);
  assert.equal(history.redo().revision, 3); assert.equal(history.document.adjustments.temperature, 22);
  const before = history.serialize();
  assert.throws(() => history.commit(adjustments({ brightness: 40 }), { actor: 'ai', documentId: uuid, baseRevision: 1 }), error => error.code === 'stale_revision');
  assert.throws(() => history.commit(adjustments({ brightness: 40 }), { actor: 'ai' }), error => error.code === 'invalid_context');
  assert.deepEqual(history.serialize(), before);
  history.undo(); history.commit(adjustments({ contrast: 25 }));
  assert.equal(history.document.revision, 5); assert.equal(history.canRedo, false); assert.equal(history.history.length, 2);
  assert.throws(() => { history.document.adjustments.brightness = 25; }, TypeError);
});

test('history persists redo branches, caps memory, and rejects mismatched drafts', () => {
  const history = createEditorHistory(state());
  history.commit(adjustments({ brightness: 15 })); history.commit(adjustments({ brightness: 35 })); history.undo();
  const serialized = history.serialize(), restored = createEditorHistory(serialized.document, serialized);
  assert.equal(restored.canRedo, true); assert.equal(restored.redo().adjustments.brightness, 35); assert.equal(restored.document.revision, 4);
  const broken = structuredClone(serialized); broken.frames[0].state.documentId = crypto.randomUUID();
  assert.throws(() => createEditorHistory(serialized.document, broken), error => error.code === 'invalid_draft');
  for (let i = 0; i < 140; i++) restored.commit(adjustments({ brightness: i % 2 ? 0 : 1 }));
  assert.equal(restored.history.length, HISTORY_LIMIT + 1);
  let count = 0; while (restored.canUndo) { restored.undo(); count++; }
  assert.equal(count, HISTORY_LIMIT);
});

test('pixel pipeline preserves original/alpha, adjusts light and color, and applies centered vignette', () => {
  const original = new Uint8ClampedArray([80,120,160,255,40,90,150,128,12,15,18,0]);
  assert.deepEqual(adjustPixels(original.slice(), 3, 1, DEFAULT_ADJUSTMENTS), original);
  const bright = adjustPixels(original.slice(), 3, 1, { ...DEFAULT_ADJUSTMENTS, brightness: 20 });
  assert.deepEqual([...bright.slice(0, 4)], [131,171,211,255]); assert.equal(bright[7], 128); assert.deepEqual([...bright.slice(8)], [12,15,18,0]);
  const gray = adjustPixels(original.slice(), 3, 1, { ...DEFAULT_ADJUSTMENTS, saturation: -100 });
  assert.equal(gray[0], gray[1]); assert.equal(gray[1], gray[2]);
  const warm = adjustPixels(original.slice(), 3, 1, { ...DEFAULT_ADJUSTMENTS, temperature: 100 });
  assert(warm[0] > original[0]); assert(warm[2] < original[2]);
  const neutral = adjustPixels(original.slice(), 3, 1, { ...DEFAULT_ADJUSTMENTS, contrast: -100 });
  assert.deepEqual([...neutral.slice(0, 3)], [128,128,128]);
  const square = new Uint8ClampedArray(5 * 5 * 4).fill(255);
  const corners = adjustPixels(square, 5, 5, { ...DEFAULT_ADJUSTMENTS, vignette: 100 });
  assert(corners[0] < corners[(2 * 5 + 2) * 4]); assert.equal(corners[(2 * 5 + 2) * 4], 255);
  assert.equal(corners[0], corners[(4 * 5 + 4) * 4]); assert.equal(corners[3], 255);
});

test('geometry uses transformed coordinates and preserves source-resolution export', () => {
  assert.equal(resolveRenderGeometry(state(), 1600).outputWidth, 1600);
  assert.equal(resolveRenderGeometry(state(), 1600).outputHeight, 800);
  assert.equal(resolveRenderGeometry(state()).outputWidth, 4096);
  const g = resolveRenderGeometry(state({ transform: { rotation: 90, flipX: false, flipY: false }, crop: { x: .25, y: .25, width: .5, height: .5 } }));
  assert.equal(g.transformedWidth, 2048); assert.equal(g.transformedHeight, 4096);
  assert.equal(g.cropX, 512); assert.equal(g.cropY, 1024); assert.equal(g.outputWidth, 1024); assert.equal(g.outputHeight, 2048);
  const tiny = resolveRenderGeometry(state({ crop: { x: .99, y: .99, width: .000001, height: .000001 } }));
  assert.equal(tiny.outputWidth, 1); assert.equal(tiny.outputHeight, 1);
});

test('upload checks file signatures, MIME, emptiness, and 8 MiB bound', async () => {
  assert.equal((await validateImageBlob(pngHeader())).mime, 'image/png');
  const unnamedType = new Blob([await pngHeader().arrayBuffer()]);
  assert.equal((await validateImageBlob(unnamedType)).blob.type, 'image/png');
  for (const blob of [new Blob(), new Blob(['bad image'], { type: 'image/png' }), new Blob([await pngHeader().arrayBuffer()], { type: 'image/jpeg' }), new Blob([new Uint8Array(MAX_IMAGE_BYTES + 1)], { type: 'image/png' })]) await assert.rejects(validateImageBlob(blob));
});

test('controller previews a gesture without history, then commits once and blocks AI during a gesture', async () => {
  const f = fixture(), editor = f.controller;
  try {
    await editor.start(); await editor.loadImage(pngHeader());
    const base = editor.getSnapshot().document;
    for (const brightness of [10,20,30,40]) editor.previewOperations(adjustments({ brightness }));
    assert.equal(editor.getSnapshot().document.adjustments.brightness, 40); assert.equal(editor.getSnapshot().document.revision, 0); assert.equal(editor.getSnapshot().history.length, 1);
    assert.throws(() => editor.commitOperations(adjustments({ saturation: -30 }), { actor: 'ai', documentId: base.documentId, baseRevision: 0 }), error => error.code === 'stale_revision');
    await assert.rejects(editor.getAiSnapshot(), error => error.code === 'preview_pending');
    await assert.rejects(editor.exportImage(), error => error.code === 'preview_pending');
    editor.commitOperations();
    assert.equal(editor.getSnapshot().document.revision, 1); assert.equal(editor.getSnapshot().history.length, 2);
    editor.previewOperations(adjustments({ brightness: 70 })); editor.cancelPreview();
    assert.equal(editor.getSnapshot().document.adjustments.brightness, 40);
    editor.undo(); assert.equal(editor.getSnapshot().document.revision, 2); assert.equal(editor.getSnapshot().document.adjustments.brightness, 0);
    await editor.flush(); assert.equal(f.saved.history.document.revision, 2);
  } finally { editor.dispose(); }
});

test('controller discards old renders, coalesces previews, and releases object URLs', async () => {
  const gate = deferred(), requests = [];
  const f = fixture({ renderer: { async render(payload) {
    requests.push(payload);
    if (requests.length === 1) await gate.promise;
    return { blob: new Blob(['render']), width: payload.state.width, height: payload.state.height };
  } } });
  try {
    await f.controller.start(); await f.controller.loadImage(pngHeader()); await until(() => requests.length === 1);
    for (let i = 1; i <= 20; i++) f.controller.previewOperations(adjustments({ brightness: i }));
    gate.resolve(); await until(() => !f.controller.getSnapshot().rendering);
    assert.equal(requests.length, 2); assert.equal(requests[1].state.adjustments.brightness, 20);
    assert.match(f.controller.getSnapshot().previewUrl, /editor-test-2$/);
    f.controller.commitOperations(); await until(() => !f.controller.getSnapshot().rendering);
    assert(f.revoked.includes('blob:editor-test-2'));
  } finally { gate.resolve(); f.controller.dispose(); }
});

test('late image loads cannot replace the newest document', async () => {
  const gate = deferred(); let calls = 0;
  const f = fixture({ renderer: { async load() { if (++calls === 1) await gate.promise; return { width: 40, height: 20 }; } } });
  try {
    await f.controller.start();
    const first = f.controller.loadImage(pngHeader(), { name: 'first.png' });
    const rejected = assert.rejects(first, error => error.code === 'stale_source');
    await until(() => calls === 1);
    await f.controller.loadImage(pngHeader(), { name: 'second.png' });
    gate.resolve(); await rejected;
    assert.equal(f.controller.getSnapshot().document.name, 'second.png'); assert.equal(f.released.length, 1);
  } finally { gate.resolve(); f.controller.dispose(); }
});

test('storage failure keeps editing/export functional and reports unsaved changes', async () => {
  const f = fixture({ storage: { async save() { throw new Error('QuotaExceededError'); } } });
  try {
    await f.controller.start(); await f.controller.loadImage(pngHeader());
    f.controller.commitOperations(adjustments({ brightness: 20 })); await f.controller.flush();
    assert.match(f.controller.getSnapshot().notice, /未能保存/); assert.equal(f.controller.getSnapshot().saving, false);
    assert(await f.controller.exportImage() instanceof Blob);
    assert.equal(f.controller.getSnapshot().document.adjustments.brightness, 20);
  } finally { f.controller.dispose(); }
});

test('restore cannot overwrite a new upload and restored redo/history remain usable', async () => {
  const source = fixture(); await source.controller.start(); await source.controller.loadImage(pngHeader(), { name: 'saved.png' });
  source.controller.commitOperations(adjustments({ contrast: 15 })); source.controller.undo(); await source.controller.flush();
  const saved = source.saved; source.controller.dispose();
  const restored = fixture({ storage: { async read() { return saved; } } });
  try {
    await restored.controller.start(); assert.equal(restored.controller.getSnapshot().canRedo, true);
    restored.controller.redo(); assert.equal(restored.controller.getSnapshot().document.adjustments.contrast, 15);
  } finally { restored.controller.dispose(); }
  const gate = deferred(), racing = fixture({ storage: { async read() { await gate.promise; return saved; } } });
  try {
    const restoring = racing.controller.start();
    await racing.controller.loadImage(pngHeader(), { name: 'new.png' }); gate.resolve(); await restoring;
    assert.equal(racing.controller.getSnapshot().document.name, 'new.png');
  } finally { gate.resolve(); racing.controller.dispose(); }
});

test('StrictMode lifecycle reacquisition does not dispose a live controller', async () => {
  let disposed = 0;
  const f = fixture({ renderer: { dispose() { disposed++; } } });
  const first = f.controller.acquire(); first(); const second = f.controller.acquire();
  await sleep(0); await f.controller.loadImage(pngHeader()); assert.equal(disposed, 0);
  second(); await sleep(0); assert.equal(disposed, 1);
  assert.throws(() => f.controller.previewOperations(adjustments({ brightness: 1 })), error => error.code === 'disposed');
});

test('real browser Worker, 4K export, transparency, IndexedDB, and React StrictMode', { skip: process.env.EDITOR_BROWSER_TESTS !== '1', timeout: 180_000 }, async () => {
  const { createRequire } = await import('node:module');
  const { mkdtemp, mkdir, rm, realpath } = await import('node:fs/promises');
  const { join, resolve, sep, basename } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { fileURLToPath } = await import('node:url');
  const { createServer } = await import('vite');
  const require = createRequire(import.meta.url);
  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch { ({ chromium } = require(join(process.env.APPDATA, 'npm/node_modules/playwright'))); }
  const root = fileURLToPath(new URL('../', import.meta.url));
  const temporary = await mkdtemp(join(tmpdir(), 'editor-core-browser-'));
  const harnessCode = `
    import React, { useEffect } from 'react';
    import { createRoot } from 'react-dom/client';
    import { createEditorController } from '/src/editor-core/controller.mjs';
    import { createRenderClient } from '/src/editor-core/render-client.mjs';
    import { useImageEditor } from '/src/editor-core/useImageEditor.js';
    import { EDITOR_PRESETS } from '/shared/editor-contract.mjs';
    let root;
    function Probe({ userId }) {
      const editor = useImageEditor({ userId });
      useEffect(() => { window.hookEditor = editor; }, [editor]);
      return React.createElement('span', { id: 'hook-document' }, editor.document?.documentId || 'empty');
    }
    window.makeImage = async (width = 12, height = 8) => {
      const c = document.createElement('canvas'); c.width = width; c.height = height;
      const ctx = c.getContext('2d'); ctx.fillStyle = 'rgb(80,120,160)'; ctx.fillRect(0,0,width,height);
      ctx.clearRect(0,0,Math.max(1,width/3),Math.max(1,height/2));
      ctx.fillStyle = '#ed3a47'; ctx.fillRect(width*2/3,0,width/3,height/2);
      return new Promise(resolve => c.toBlob(resolve,'image/png'));
    };
    window.inspectBlob = async blob => {
      const bmp = await createImageBitmap(blob); const c = new OffscreenCanvas(bmp.width,bmp.height);
      const ctx = c.getContext('2d'); ctx.drawImage(bmp,0,0); bmp.close();
      const image = ctx.getImageData(0,0,c.width,c.height);
      const offset = (Math.floor(c.height*.75)*c.width + Math.floor(c.width*.5))*4;
      return { width:c.width,height:c.height,first:[...image.data.slice(0,4)],center:[...image.data.slice(offset,offset+4)],mime:blob.type };
    };
    window.editorHarness = {
      createEditorController, createRenderClient,
      mount(userId) { if(!root) root=createRoot(document.getElementById('hook-root')); root.render(React.createElement(React.StrictMode,null,React.createElement(Probe,{userId}))); },
      unmount() { root?.unmount(); root=null; window.hookEditor=null; },
      async compare() {
        const blob=await fetch('/demo/sample.jpg').then(r=>r.blob());
        const editor=createEditorController({userId:'visual-core-test'}); await editor.start(); await editor.loadImage(blob,{name:'sample.jpg'});
        const gallery=document.getElementById('comparison');
        for(const id of ['original','clean','warm','cool','retro','bw','film','noir','dramatic','dreamy']) {
          editor.commitOperations([{type:'applyPreset',presetId:id}]);
          const output=await editor.exportImage({format:'jpeg'});
          const figure=document.createElement('figure'), image=document.createElement('img'), caption=document.createElement('figcaption');
          image.src=URL.createObjectURL(output); caption.textContent=EDITOR_PRESETS.find(p=>p.id===id).label;
          figure.append(image,caption); gallery.append(figure); await image.decode();
        }
        await editor.flush(); editor.dispose();
      }
    };
  `;
  const vite = await createServer({ configFile: false, root, cacheDir: join(temporary, 'vite-cache'), logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null },
    optimizeDeps: { include: ['react', 'react-dom/client'] },
    plugins: [{ name: 'editor-core-browser-harness',
      resolveId(id) { if (id === '/__editor_core_harness__.js') return id; },
      load(id) { if (id === '/__editor_core_harness__.js') return harnessCode; },
      configureServer(server) { server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/__editor_core_test__') return next();
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html><meta charset="utf-8"><title>Editor core verification</title><style>body{background:#edf4f8;font:18px system-ui;color:#203449;padding:24px}#comparison{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}figure{margin:0;background:white;padding:12px;border-radius:12px}img{width:100%;height:260px;object-fit:contain}figcaption{padding:12px 0 0}</style><h1>图片处理核心 · 预设核验</h1><div id="hook-root"></div><div id="comparison"></div><script type="module" src="/__editor_core_harness__.js"></script></html>');
      }); }
    }] });
  let browser;
  try {
    await vite.listen(); const address = vite.httpServer.address(), origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1680, height: 900 } });
    const errors = [], workers = [], external = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('worker', worker => workers.push(worker.url()));
    page.on('request', req => { if (/^https?:/.test(req.url()) && !req.url().startsWith(origin)) external.push(req.url()); });
    await page.goto(`${origin}/__editor_core_test__`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.editorHarness);
    const baseline = await page.evaluate(async () => {
      window.coreEditor = window.editorHarness.createEditorController({ userId: 'browser-primary' });
      await window.coreEditor.start(); await window.coreEditor.loadImage(await window.makeImage(), { name: 'synthetic.png' });
      return window.inspectBlob(await window.coreEditor.exportImage());
    });
    assert.equal(baseline.width, 12); assert.equal(baseline.height, 8); assert.equal(baseline.first[3], 0);
    assert.deepEqual(baseline.center, [80,120,160,255]);
    const adjusted = await page.evaluate(async () => {
      const e = window.coreEditor, { documentId, revision } = e.getSnapshot().document;
      e.commitOperations([{ type:'setAdjustments',values:{brightness:20,saturation:-100} }], { actor:'ai',documentId,baseRevision:revision,label:'AI 调整' });
      return { pixels:await window.inspectBlob(await e.exportImage()),revision:e.getSnapshot().document.revision,history:e.getSnapshot().history.length };
    });
    assert.equal(adjusted.revision, 1); assert.equal(adjusted.history, 2);
    assert.equal(adjusted.pixels.center[0], adjusted.pixels.center[1]); assert.equal(adjusted.pixels.center[1], adjusted.pixels.center[2]); assert(adjusted.pixels.center[0] > baseline.center[0]);
    const undo = await page.evaluate(async () => { window.coreEditor.undo(); return { image:await window.inspectBlob(await window.coreEditor.exportImage()),revision:window.coreEditor.getSnapshot().document.revision }; });
    assert.deepEqual(undo.image.center, baseline.center); assert.equal(undo.revision, 2);
    const jpeg = await page.evaluate(async () => window.inspectBlob(await window.coreEditor.exportImage({ format:'jpeg',quality:1 })));
    assert.equal(jpeg.first[3], 255); assert(jpeg.first.slice(0,3).every(value => value > 245)); assert.equal(jpeg.mime, 'image/jpeg');
    const crop = await page.evaluate(async () => {
      const e=window.coreEditor;
      e.commitOperations([{type:'setTransform',values:{rotation:90}},{type:'setCrop',crop:{x:0,y:0,width:.5,height:1}}]);
      return window.inspectBlob(await e.exportImage());
    });
    assert.equal(crop.width, 4); assert.equal(crop.height, 12); assert.equal(crop.first[3],255);
    const fourK = await page.evaluate(async () => {
      const e=window.coreEditor; await e.loadImage(await window.makeImage(4096,2048),{name:'4k.png'});
      e.commitOperations([{type:'setAdjustments',values:{temperature:20,vignette:12,highlights:-15,shadows:12,bloom:30,grain:20}}]);
      const output=await e.exportImage(); const image=await window.inspectBlob(output);
      const repeat=await e.exportImage();
      const digest=async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].join(',');
      const repeatable=await digest(output)===await digest(repeat); const snap=await e.getAiSnapshot();
      const snapshotImage=await window.inspectBlob(await fetch(snap.previewDataUrl).then(r=>r.blob()));
      return {image,snapshotImage,baseRevision:snap.baseRevision,state:snap.state,repeatable};
    });
    assert.equal(fourK.image.width,4096); assert.equal(fourK.image.height,2048); assert.equal(fourK.snapshotImage.width,1024); assert.equal(fourK.baseRevision,1);
    assert.equal(fourK.state.adjustments.temperature,20); assert.equal(fourK.state.adjustments.bloom,30); assert.equal(fourK.state.adjustments.grain,20); assert.equal(fourK.repeatable,true);
    await page.waitForFunction(() => !window.coreEditor.getSnapshot().rendering && window.coreEditor.getSnapshot().previewUrl);
    const previewDimensions=await page.evaluate(()=>({width:window.coreEditor.getSnapshot().previewWidth,height:window.coreEditor.getSnapshot().previewHeight}));
    assert.deepEqual(previewDimensions,{width:1600,height:800});
    const saved = await page.evaluate(async()=>{await window.coreEditor.flush(); const s=window.coreEditor.getSnapshot().document; window.coreEditor.dispose();return s;});
    await page.reload({waitUntil:'networkidle'}); await page.waitForFunction(()=>window.editorHarness);
    const restored = await page.evaluate(async()=>{window.coreEditor=window.editorHarness.createEditorController({userId:'browser-primary'});await window.coreEditor.start();return window.coreEditor.getSnapshot().document;});
    assert.deepEqual(restored,saved);
    const other = await page.evaluate(async()=>{const e=window.editorHarness.createEditorController({userId:'browser-other'});await e.start();const d=e.getSnapshot().document;e.dispose();return d;});
    assert.equal(other,null);
    await page.evaluate(()=>window.editorHarness.mount('strict-account'));
    await page.waitForFunction(()=>window.hookEditor && !window.hookEditor.restoring);
    await page.evaluate(async()=>{await window.hookEditor.loadImage(await window.makeImage(),{name:'strict.png'});});
    await page.waitForFunction(()=>window.hookEditor.document?.name==='strict.png' && !window.hookEditor.rendering);
    await page.evaluate(()=>window.hookEditor.previewOperations([{type:'setAdjustments',values:{brightness:25}}]));
    await page.waitForFunction(()=>window.hookEditor.hasPendingPreview);
    await page.evaluate(()=>window.hookEditor.commitOperations());
    await page.waitForFunction(()=>window.hookEditor.document.revision===1 && !window.hookEditor.saving);
    await page.evaluate(()=>window.editorHarness.mount('strict-other-account'));
    await page.waitForFunction(()=>window.hookEditor && !window.hookEditor.restoring && window.hookEditor.document===null);
    await page.evaluate(()=>window.editorHarness.mount('strict-account'));
    await page.waitForFunction(()=>window.hookEditor.document?.name==='strict.png' && !window.hookEditor.restoring);
    assert.equal(await page.evaluate(()=>window.hookEditor.document.adjustments.brightness),25);
    assert(workers.some(url=>url.includes('render.worker.js')),'real Worker was created');
    await page.evaluate(async()=>{window.editorHarness.unmount();window.coreEditor.dispose();await window.editorHarness.compare();});
    const output=join(root,'data','visual-check','editor-core');await mkdir(output,{recursive:true});
    await page.screenshot({path:join(output,'render-comparison.png'),fullPage:true});
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    console.log(JSON.stringify({editorBrowser:'PASS',worker:true,export:[4096,2048],preview:[1600,800],aiSnapshot:[1024,512],pngAlpha:true,jpegWhite:true,refreshRestore:true,strictMode:true,screenshot:join(output,'render-comparison.png')}));
  } finally {
    await browser?.close(); await vite.close();
    const target=await realpath(temporary),parent=await realpath(tmpdir());
    if(!target.toLowerCase().startsWith((resolve(parent)+sep).toLowerCase())||!basename(target).startsWith('editor-core-browser-'))throw new Error('Unexpected browser test temporary directory');
    await rm(target,{recursive:true,force:true});
  }
});
