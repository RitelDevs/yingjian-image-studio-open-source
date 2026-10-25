import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ADJUSTMENTS, DEFAULT_TRANSFORM, EDITOR_PRESETS, ADJUSTMENT_DEFINITIONS, validateEditorState, validateOperations, applyOperations } from '../shared/editor-contract.mjs';
import { adjustPixels } from '../src/editor-core/pixels.mjs';
import { grainAt } from '../src/editor-core/effects.mjs';
import { createEditorHistory } from '../src/editor-core/history.mjs';
import { editorPayload } from '../server/editor/planner.mjs';
import { demoEditorAnswer } from '../server/editor/demo.mjs';

const originalKeys = ['brightness', 'contrast', 'saturation', 'temperature', 'tint', 'vignette'];
const newKeys = ['highlights', 'shadows', 'bloom', 'grain'];
const doc = () => ({ documentId: '06156222-a472-455c-8074-6434cac17fe5', revision: 0, width: 100, height: 100,
  name: 'test.png', mime: 'image/png', adjustments: { ...DEFAULT_ADJUSTMENTS }, transform: { ...DEFAULT_TRANSFORM }, crop: null });
const pixel = (data, width, x, y) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
function raster(width, height, color = [128, 128, 128, 255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(color, i * 4);
  return data;
}
function fixturePayload(prompt, state = doc()) {
  return editorPayload('test-model', { prompt, state_json: JSON.stringify(state), preview_data_url: 'data:image/png;base64,fixture' }, []);
}

test('six-control drafts and history restore without losing edits, crop or revision', () => {
  const previous = doc(); previous.adjustments = Object.fromEntries(originalKeys.map(key => [key, key === 'brightness' ? 12 : 0]));
  previous.crop = { x: .1, y: .2, width: .7, height: .6 }; previous.revision = 8;
  const history = { schemaVersion: 1, document: previous, cursor: 0,
    frames: [{ state: previous, entry: { id: crypto.randomUUID(), label: '旧版调色', actor: 'manual', createdAt: Date.now() } }] };
  const normalized = validateEditorState(previous), restored = createEditorHistory(normalized, history);
  for (const key of newKeys) assert.equal(restored.document.adjustments[key], 0);
  assert.equal(restored.document.adjustments.brightness, 12); assert.equal(restored.document.revision, 8);
  assert.deepEqual(restored.document.crop, previous.crop);
  assert.deepEqual(Object.keys(previous.adjustments), originalKeys, 'migration must not mutate stored input');
  restored.commit([{ type: 'setAdjustments', values: { bloom: 20 } }]); restored.undo();
  assert.equal(restored.document.adjustments.brightness, 12); assert.equal(restored.document.adjustments.bloom, 0); assert.equal(restored.document.revision, 10);
  assert.throws(() => validateEditorState({ ...doc(), adjustments: { bloom: 15 } }), 'the original six fields remain required');
});

test('new control bounds and preset recipes stay inside the shared whitelist', () => {
  assert.equal(ADJUSTMENT_DEFINITIONS.length, 11); assert.equal(EDITOR_PRESETS.length, 10);
  for (const def of ADJUSTMENT_DEFINITIONS) {
    assert(['light', 'color', 'effects'].includes(def.group)); assert(def.description);
    assert.throws(() => validateOperations([{ type: 'setAdjustments', values: { [def.key]: def.max + 1 } }]));
    assert.throws(() => validateOperations([{ type: 'setAdjustments', values: { [def.key]: def.min - 1 } }]));
  }
  for (const preset of EDITOR_PRESETS) {
    assert.equal(Object.keys(preset.adjustments).length, ADJUSTMENT_DEFINITIONS.length); assert(preset.description);
    validateEditorState(applyOperations(doc(), [{ type: 'applyPreset', presetId: preset.id }]));
  }
  assert(EDITOR_PRESETS.find(item => item.id === 'film').adjustments.grain > 0);
  assert(EDITOR_PRESETS.find(item => item.id === 'dreamy').adjustments.bloom > 0);
  assert.equal(EDITOR_PRESETS.find(item => item.id === 'noir').adjustments.saturation, -100);
});

test('highlight and shadow adjustments target luminance ranges without globally recoloring the image', () => {
  const source = new Uint8ClampedArray([30,30,30,255,128,128,128,127,225,225,225,255,255,255,255,0]);
  const shadows = adjustPixels(source.slice(), 4, 1, { ...DEFAULT_ADJUSTMENTS, shadows: 40 });
  assert(shadows[0] > source[0] + 20); assert.equal(shadows[8], source[8]);
  const highlights = adjustPixels(source.slice(), 4, 1, { ...DEFAULT_ADJUSTMENTS, highlights: -40 });
  assert.equal(highlights[0], source[0]); assert(highlights[8] < source[8] - 20);
  for (const result of [shadows, highlights]) {
    assert.equal(result[4], result[5]); assert.equal(result[5], result[6]); assert.equal(result[7], 127);
    assert.deepEqual([...result.slice(12)], [...source.slice(12)]);
  }
});

test('bloom spreads bright light, leaves alpha intact, and ignores invisible bright pixels', () => {
  const width = 80, height = 60, source = raster(width, height, [20,20,20,255]);
  for (let y = 24; y < 36; y++) for (let x = 34; x < 46; x++) source.set([245,235,220,255], (y * width + x) * 4);
  const output = adjustPixels(source.slice(), width, height, { ...DEFAULT_ADJUSTMENTS, bloom: 80 });
  assert(pixel(output, width, 32, 30)[0] > pixel(source, width, 32, 30)[0] + 5, 'glow reaches outside the bright square');
  assert(Math.abs(output[0] - source[0]) <= 1, 'distant shadows are not uniformly washed out');
  for (let i = 3; i < output.length; i += 4) assert.equal(output[i], source[i]);
  const invisible = raster(width, height, [0,0,0,255]);
  for (let y = 24; y < 36; y++) for (let x = 34; x < 46; x++) invisible.set([255,255,255,0], (y * width + x) * 4);
  const invisibleResult = adjustPixels(invisible.slice(), width, height, { ...DEFAULT_ADJUSTMENTS, bloom: 100 });
  assert.deepEqual(invisibleResult, invisible);
});

test('film grain is visible, deterministic and aligned in normalized coordinates', () => {
  const source = raster(60,40);
  const first = adjustPixels(source.slice(), 60, 40, { ...DEFAULT_ADJUSTMENTS, grain: 50 });
  const second = adjustPixels(source.slice(), 60, 40, { ...DEFAULT_ADJUSTMENTS, grain: 50 });
  assert.deepEqual(first, second); assert.notDeepEqual(first, source);
  assert.deepEqual(adjustPixels(source.slice(), 60, 40, DEFAULT_ADJUSTMENTS), source);
  for (let i = 0; i < first.length; i += 4) { assert.equal(first[i], first[i + 1]); assert.equal(first[i + 1], first[i + 2]); assert.equal(first[i + 3],255); }
  // Exact same normalized pixel center at 3x resolution has the same grain value.
  assert(Math.abs(grainAt(10, 12, 60, 40) - grainAt(31, 37, 180, 120)) < 1e-10);
});

test('new presets are reversible as a whole, repeatably render, and preserve the source', () => {
  for (const id of ['film', 'noir', 'dramatic', 'dreamy']) {
    const history = createEditorHistory(doc()), source = raster(40,30,[90,130,190,128]), copy = source.slice();
    history.commit([{ type:'applyPreset',presetId:id }], { actor:'ai',documentId:history.document.documentId,baseRevision:0 });
    const first = adjustPixels(source.slice(),40,30,history.document.adjustments);
    assert.notDeepEqual(first,source);
    const state = history.document; history.undo(); assert.deepEqual(history.document.adjustments, DEFAULT_ADJUSTMENTS); history.redo();
    assert.deepEqual(adjustPixels(source.slice(),40,30,history.document.adjustments),first);
    assert.deepEqual(source,copy); assert.equal(state.revision,1); assert.equal(history.document.revision,3);
  }
});

test('AI receives finishing guidance and actual supported look definitions without executable tools', () => {
  const payload = fixturePayload('暗部稍微提亮，保持商品颜色');
  const instructions = payload.messages[0].content;
  assert.match(instructions,/先校正光线与白平衡/); assert.match(instructions,/已丢失的纹理/);
  assert.match(instructions,/保留商品本来的颜色/); assert.match(instructions,/不是开尔文/);
  for (const key of newKeys) assert(instructions.includes(`"key":"${key}"`));
  for (const id of ['film','noir','dramatic','dreamy']) assert(instructions.includes(`"id":"${id}"`));
  assert.equal(payload.tools,undefined);
});

test('local demo distinguishes presets from parameter edits and uses the chosen preset as its base', () => {
  const soft = JSON.parse(demoEditorAnswer(fixturePayload('增加柔光，提亮阴影，压低高光')));
  const softState = applyOperations(doc(),soft.operations);
  assert(softState.adjustments.bloom > 0); assert(softState.adjustments.shadows > 0); assert(softState.adjustments.highlights < 0);
  assert.equal(softState.adjustments.brightness,0, 'luminance-specific language must not accidentally change global brightness');
  const noir = JSON.parse(demoEditorAnswer(fixturePayload('黑白电影风格')));
  assert.deepEqual(noir.operations,[{type:'applyPreset',presetId:'noir'}]);
  const warm = JSON.parse(demoEditorAnswer(fixturePayload('暖一点')));
  assert.deepEqual(warm.operations,[{type:'setAdjustments',values:{temperature:15}}]);
  const film = JSON.parse(demoEditorAnswer(fixturePayload('用胶片预设，减少颗粒')));
  assert.equal(applyOperations(doc(),film.operations).adjustments.grain,12);
});
