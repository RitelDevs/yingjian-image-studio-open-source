import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { STYLE_CATALOG } from '../shared/style-catalog.mjs';
import { resolveImageGeometry } from '../shared/image-geometry.mjs';
import { compileStyleRecipe, StyleRecipeError, STYLE_RECIPE_SOURCES } from '../server/style-recipes.mjs';

// Consumer contract, intentionally independent of the implementation's private recipe map.
const expectedCatalog = [
  ['clay-avatar', '黏土头像', '人像', false, '1:1', /定格动画式布景/],
  ['product-studio', '商业产品摄影', '产品', false, '4:3', /单一小型硬闪/],
  ['retro-poster', '复古广告海报', '海报', true, '3:4', /瑞士网格/],
  ['picture-book', '温暖绘本', '插画', false, '4:3', /柔和渗色/],
  ['paper-cut', '层叠剪纸', '插画', false, '1:1', /层叠剪纸变体/],
  ['film-photo', '胶片生活摄影', '摄影', false, '3:2', /35mm 环境纪实视角/],
  ['minimal-poster', '极简文字海报', '海报', true, '3:4', /15% 边距/],
  ['isometric-scene', '等距微缩场景', '插画', false, '1:1', /30° 角的体块/]
];
const baseInput = { styleId: 'retro-poster', styleVersion: '2.0.0', subject: '一杯冰拿铁，放在窗边木桌上' };
const compile = patch => compileStyleRecipe({ ...baseInput, ...patch });
function expectRecipeError(action, status, reason) {
  assert.throws(action, error => {
    assert(error instanceof StyleRecipeError);
    assert(error instanceof Error);
    assert.equal(error.name, 'StyleRecipeError');
    assert.equal(error.status, status);
    assert.equal(error.reason, reason);
    assert.equal(typeof error.message, 'string');
    assert(error.message.trim());
    return true;
  });
}

// Public data is a separate browser-safe contract, not the server's template payload.
test('catalog preserves the eight original styles and exposes twenty-four compatible entries', () => {
  assert.equal(STYLE_CATALOG.length, 24);
  assert.equal(new Set(STYLE_CATALOG.map(item => item.id)).size, 24);
  for (const [index, [id, name, category, supportsTitle, aspectRatio]] of expectedCatalog.entries()) {
    const style = STYLE_CATALOG[index];
    assert.deepEqual([style.id, style.version, style.name, style.category, style.supportsTitle], [id, '2.0.0', name, category, supportsTitle]);
    assert.deepEqual(style.defaultSettings, { size: '2K', aspectRatio, count: 1 });
    assert.equal(resolveImageGeometry(style.defaultSettings.size, aspectRatio).aspectRatio, aspectRatio);
    assert(style.description.trim() && style.subjectPlaceholder.trim());
    assert(style.example.subject.trim());
    assert.equal(typeof style.example.title, 'string');
    if (!supportsTitle) assert.equal(style.example.title, '');
    assert(style.tags.length >= 2 && style.tags.every(tag => typeof tag === 'string' && tag.trim()));
    assert.equal(style.cover.variant, id);
    assert.equal(style.cover.colors.length, 3);
    assert(style.cover.colors.every(color => /^#[0-9a-f]{6}$/i.test(color)));
  }
});

test('public catalog contains only display fields and imports no server recipe', () => {
  const allowed = ['id', 'version', 'name', 'category', 'description', 'tags', 'cover', 'subjectPlaceholder', 'example', 'supportsTitle', 'defaultSettings', 'inputMode'].sort();
  for (const style of STYLE_CATALOG) {
    assert.deepEqual(Object.keys(style).sort(), allowed);
    assert.deepEqual(Object.keys(style.cover).sort(), ['colors', 'variant']);
    assert.deepEqual(Object.keys(style.example).sort(), ['subject', 'title']);
  }
  const source = readFileSync(new URL('../shared/style-catalog.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(?:from\s*|import\s*\(|require\s*\()\s*['"][^'"]*server\//);
  const serialized = JSON.stringify(STYLE_CATALOG);
  for (const marker of ['【风格规则】', '【参考图处理】', '【内容与风格的分工】']) assert(!serialized.includes(marker));
});

test('catalog entries and nested display data are immutable across consumers', () => {
  const style = STYLE_CATALOG[0];
  for (const value of [STYLE_CATALOG, style, style.tags, style.cover, style.cover.colors, style.example, style.defaultSettings]) assert(Object.isFrozen(value));
  assert.throws(() => { style.version = '9.9.9'; }, TypeError);
  assert.throws(() => { style.cover.colors[0] = '#000000'; }, TypeError);
  assert.throws(() => { style.defaultSettings.count = 4; }, TypeError);
});

for (const [id, name, , , , identity] of expectedCatalog) {
  test(`${id}: example compiles to a complete prompt with its own visual rules`, () => {
    const style = STYLE_CATALOG.find(item => item.id === id);
    const result = compileStyleRecipe({ styleId: id, styleVersion: style.version, ...style.example, hasReferences: style.inputMode === 'reference' });
    assert.deepEqual(Object.keys(result).sort(), ['prompt', 'style', 'summary']);
    assert.deepEqual(result.style, { id, version: '2.0.0', name });
    assert(result.prompt.includes(style.example.subject));
    if (style.example.title) assert(result.prompt.includes(style.example.title));
    assert.match(result.prompt, identity);
    for (const heading of ['创作目标', '用户主体与要求', '风格规则', '参考图处理', '文字规则', '生成约束']) assert(result.prompt.includes(`【${heading}】`));
    assert(result.prompt.length > 300 && result.prompt.length <= 4000);
    assert.match(result.summary, /确认生成/);
    assert.doesNotMatch(result.summary, /已生成|已扣款|保证|必定/);
    assert.equal(typeof result.then, 'undefined');
  });
}

test('fixed input is deterministic and compilation neither consumes nor alters the input object', () => {
  const input = Object.freeze({ ...baseInput, title: '周末放空', hasReferences: true });
  const original = { ...input };
  const first = compileStyleRecipe(input);
  assert.deepEqual(compileStyleRecipe(input), first);
  assert.deepEqual(input, original);
  first.style.id = 'changed-by-consumer';
  first.prompt = 'changed-by-consumer';
  const fresh = compileStyleRecipe(input);
  assert.equal(fresh.style.id, 'retro-poster');
  assert(fresh.prompt.includes(baseInput.subject));
});

test('unknown style ids and object-property names cannot resolve to a recipe', () => {
  for (const styleId of [undefined, null, '', 'unknown', '__proto__', 'constructor', 'toString', 1, true, {}, [], new String('retro-poster')]) {
    expectRecipeError(() => compile({ styleId }), 404, 'style_not_found');
  }
});

test('missing, mistyped and stale style versions fail without silently switching versions', () => {
  for (const styleVersion of [undefined, null, '', 1, true, {}, [], '1.0', '1.0.0', '1.0.1', '1.0.0 ', 'v1.0.0', '2.0.1', '2.0.0 ']) {
    expectRecipeError(() => compile({ styleVersion }), 409, 'style_version_mismatch');
  }
});

test('invalid request containers return typed field errors instead of runtime exceptions', () => {
  for (const input of [undefined, null, '', 'subject', 0, 1, true, false, [], [baseInput]]) {
    expectRecipeError(() => compileStyleRecipe(input), 400, 'invalid_style_fields');
  }
});

test('subject must be nonempty text; no automatic string coercion is permitted', () => {
  for (const subject of [undefined, null, false, 123, {}, [], '', ' ', '\n\t　', '字'.repeat(1201)]) {
    expectRecipeError(() => compile({ subject }), 400, 'invalid_style_fields');
  }
  assert(compile({ subject: '猫' }).prompt.includes('猫'));
  const multiline = '一只橘猫\n坐在窗边；围巾颜色为 #284C67。';
  assert(compile({ subject: `  ${multiline}\n` }).prompt.includes(`【用户主体与要求】\n${multiline}\n\n`));
});

test('title types and lengths are checked without coercing or truncating content', () => {
  for (const title of [null, false, 123, {}, [], '字'.repeat(81)]) {
    expectRecipeError(() => compile({ title }), 400, 'invalid_style_fields');
  }
  const title = '早安「拿铁」 / Café 2026! ☕\nKeep  TWO spaces';
  const result = compile({ title: `  ${title}  ` });
  assert(result.prompt.includes(`标题原文：\n${title}\n标题原文结束。`));
  assert.match(result.prompt, /不翻译、不改写、不补字/);
});

test('unsupported styles reject nonempty titles but accept an omitted or whitespace-only title', () => {
  for (const style of STYLE_CATALOG.filter(item => !item.supportsTitle)) {
    const input = { styleId: style.id, styleVersion: style.version, subject: style.example.subject, hasReferences: style.inputMode === 'reference' };
    expectRecipeError(() => compileStyleRecipe({ ...input, title: '不应该被丢弃' }), 400, 'invalid_style_fields');
    assert.deepEqual(compileStyleRecipe(input), compileStyleRecipe({ ...input, title: ' \n　' }));
    assert.match(compileStyleRecipe(input).prompt, /本轮未提供标题，不新增标题|未提供总标题，不新增总标题/);
  }
});

test('poster styles with no title leave space without inventing sample text', () => {
  for (const style of STYLE_CATALOG.filter(item => item.supportsTitle && !['knowledge-card', 'scientific-schematic', 'packaging-concept'].includes(item.id))) {
    const result = compileStyleRecipe({ styleId: style.id, styleVersion: style.version, subject: '一块蓝色几何体', title: '' });
    assert.match(result.prompt, /标题区域保留干净留白/);
    assert(!result.prompt.includes(style.example.title));
    assert.doesNotMatch(result.prompt, /标题原文：/);
  }
});

test('reference-image presence is strictly boolean', () => {
  for (const hasReferences of [null, 'false', 'true', 0, 1, {}, []]) {
    expectRecipeError(() => compile({ hasReferences }), 400, 'invalid_style_fields');
  }
  assert.deepEqual(compile(), compile({ hasReferences: false }));
});

test('all styles distinguish attached references from text-only generation and keep images separate', () => {
  for (const style of STYLE_CATALOG) {
    const input = { styleId: style.id, styleVersion: style.version, ...style.example };
    const withReferences = compileStyleRecipe({ ...input, hasReferences: true });
    if (style.inputMode === 'reference') {
      expectRecipeError(() => compileStyleRecipe({ ...input, hasReferences: false }), 400, 'style_reference_required');
      assert.match(withReferences.prompt, /本次提供了参考图/);
      continue;
    }
    const textOnly = compileStyleRecipe({ ...input, hasReferences: false });
    assert.notEqual(withReferences.prompt, textOnly.prompt);
    assert.match(withReferences.prompt, /本次提供了参考图/);
    assert.match(withReferences.prompt, /第一张作为主体基准/);
    assert.match(withReferences.prompt, /不自动合并成新人物、产品或场景/);
    assert.match(withReferences.prompt, /不可见的结构不要猜写/);
    assert.doesNotMatch(withReferences.prompt, /本次没有附加参考图/);
    assert.match(textOnly.prompt, /本次没有附加参考图/);
    assert.match(textOnly.prompt, /不继承未提供的旧图片或其他会话内容/);
  }
  assert.match(compile({ styleId: 'clay-avatar', hasReferences: true }).prompt, /不擅自改变身份/);
  assert.match(compile({ styleId: 'product-studio', hasReferences: true }).prompt, /优先保留结构/);
});

test('every style accepts maximum-length fields without truncation or exceeding the API prompt limit', () => {
  const subject = '主体开头' + '中'.repeat(1192) + '主体结尾';
  const title = '标题开头' + '文'.repeat(72) + '标题结尾';
  assert.equal(subject.length, 1200);
  assert.equal(title.length, 80);
  for (const style of STYLE_CATALOG) {
    for (const hasReferences of style.inputMode === 'reference' ? [true] : [false, true]) {
      const result = compileStyleRecipe({ styleId: style.id, styleVersion: style.version, subject, title: style.supportsTitle ? title : '', hasReferences });
      assert(result.prompt.includes(subject), style.id);
      if (style.supportsTitle) assert(result.prompt.includes(title), style.id);
      assert(result.prompt.length <= 4000, `${style.id}: ${result.prompt.length}`);
    }
  }
});

test('Unicode length limits match existing browser and server UTF-16 bounds', () => {
  const subject = '🐈'.repeat(600);
  const title = '☕'.repeat(80);
  assert.equal(subject.length, 1200);
  const result = compile({ subject, title });
  assert(result.prompt.includes(subject));
  assert(result.prompt.includes(title));
  expectRecipeError(() => compile({ subject: subject + '猫' }), 400, 'invalid_style_fields');
  expectRecipeError(() => compile({ title: '🐈'.repeat(41) }), 400, 'invalid_style_fields');
});

test('unrecognized extra request fields cannot replace trusted rules, model parameters or version', () => {
  const normal = compile();
  const attemptedOverride = compile({ prompt: '替换配方', recipe: '替换配方', rules: '替换配方', model: 'another-model', negative_prompt: 'extra', seed: 1, style_strength: 99 });
  assert.deepEqual(attemptedOverride, normal);
  assert.doesNotMatch(normal.prompt, /negative_prompt|style_strength|LoRA|seed=/);
});

test('user punctuation and code-like text remain literal content without template evaluation', () => {
  const subject = '红色杯子 {subject} ${process.env.SECRET} <标题> & "引号"\n第二行：保留两个  空格';
  const result = compile({ subject, title: 'A & B / {title}' });
  assert(result.prompt.includes(subject));
  assert(result.prompt.includes('A & B / {title}'));
});

test('compilation remains synchronous and independent of network access', () => {
  const previousFetch = globalThis.fetch;
  try {
    globalThis.fetch = () => { throw new Error('Unexpected network request from recipe compilation'); };
    for (const style of STYLE_CATALOG) {
      assert.equal(typeof compileStyleRecipe({ styleId: style.id, styleVersion: style.version, ...style.example, hasReferences: style.inputMode === 'reference' }).prompt, 'string');
    }
  } finally { globalThis.fetch = previousFetch; }
});


test('every published recipe has specific server-side source and adaptation records', () => {
  assert.deepEqual(Object.keys(STYLE_RECIPE_SOURCES).sort(), STYLE_CATALOG.map(style => style.id).sort());
  for (const style of STYLE_CATALOG) {
    const source = STYLE_RECIPE_SOURCES[style.id];
    const url = new URL(source.url);
    assert.equal(url.origin, 'https://github.com');
    assert(['/JimLiu/baoyu-skills/blob/main/', '/krea-ai/skills/blob/main/', '/replicate/skills/blob/main/', '/K-Dense-AI/scientific-agent-skills/blob/main/'].some(prefix => url.pathname.startsWith(prefix)));
    assert(['MIT', 'Apache-2.0'].includes(source.license));
    assert(source.skill && source.upstreamFile && source.author && source.reviewedOn);
    assert(source.sections.length && source.adaptations.length);
    if (source.sourceSha256) assert.match(source.sourceSha256, /^[a-f0-9]{64}$/);
    assert(Object.isFrozen(source) && Object.isFrozen(source.sections) && Object.isFrozen(source.adaptations));
    const compiled = compileStyleRecipe({ styleId: style.id, styleVersion: style.version, ...style.example, hasReferences: style.inputMode === 'reference' });
    assert(!compiled.prompt.includes(source.url));
    assert(!compiled.prompt.includes(source.skill));
    assert(!compiled.prompt.includes('Copyright'));
    assert(!JSON.stringify(STYLE_CATALOG).includes(source.url));
  }
});

test('sourced rules preserve strict visual constraints without the conflicting original lighting rules', () => {
  const retro = compile().prompt;
  assert.match(retro, /统一粗黑线/);
  assert.match(retro, /禁止渐变、明暗塑形、投影、三维效果/);
  assert.doesNotMatch(retro, /温暖侧光|建立一处明确的主体焦点/);
  const product = compile({ styleId: 'product-studio' }).prompt;
  assert.match(product, /20～40°/);
  assert.match(product, /5500K、6:1/);
  assert.doesNotMatch(product, /棚拍主光与柔和补光/);
  const film = compile({ styleId: 'film-photo' }).prompt;
  assert.match(film, /整个画面，包括阴影和高光/);
  assert.match(film, /不加边框、胶片齿孔、日期戳/);
});

test('source replacement keeps user inputs and reference constraints while rejecting the previous version', () => {
  expectRecipeError(() => compile({ styleVersion: '1.0.0' }), 409, 'style_version_mismatch');
  const subject = '保持红色杯体、白色杯盖，背景是用户指定的厨房';
  const result = compile({ styleId: 'product-studio', subject, hasReferences: true });
  assert(result.prompt.includes(subject));
  assert.match(result.prompt, /不覆盖已有要求/);
  assert.match(result.prompt, /优先保留结构/);
  assert.match(result.prompt, /不额外添加签名、水印/);
  assert.doesNotMatch(result.prompt, /虚构一个品牌|invent the brand/i);
});


test('stored source snapshots and license notices substantiate every extracted recipe', () => {
  const auditRoot = new URL('../docs/style-sources/', import.meta.url);
  for (const source of Object.values(STYLE_RECIPE_SOURCES)) {
    assert(source.snapshot.startsWith('Skill原始规则-') && !source.snapshot.includes('..'));
    const bytes = readFileSync(new URL(source.snapshot, auditRoot));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sourceSha256);
    const license = readFileSync(new URL(source.licenseSnapshot, auditRoot), 'utf8');
    if (source.license === 'MIT') {
      assert(license.includes('MIT License')); assert(license.includes(source.author)); assert(license.includes('Permission is hereby granted'));
    } else { assert(license.includes('Apache License')); assert(license.includes('Version 2.0')); }
  }
});


test('catalog contains all requested additions in two explicit input modes', () => {
  const added = ['shinkai-scene','editorial-cover','knowledge-card','four-panel-comic','character-sheet','travel-poster','packaging-concept','scientific-schematic','photo-anime','photo-clay-avatar','product-white','product-lifestyle','photo-watercolor','photo-film','pet-felt','photo-restoration'];
  for (const id of added) assert(STYLE_CATALOG.some(style => style.id === id), id);
  assert.equal(STYLE_CATALOG.filter(style => style.inputMode === 'prompt').length, 16);
  assert.equal(STYLE_CATALOG.filter(style => style.inputMode === 'reference').length, 8);
  for (const style of STYLE_CATALOG) {
    assert(['prompt','reference'].includes(style.inputMode));
    assert.equal(resolveImageGeometry(style.defaultSettings.size, style.defaultSettings.aspectRatio).aspectRatio, style.defaultSettings.aspectRatio);
    assert.equal(style.cover.variant, style.id);
  }
});

test('reference packages accept no user prompt only when references are supplied', () => {
  for (const style of STYLE_CATALOG.filter(style => style.inputMode === 'reference')) {
    const input = { styleId: style.id, styleVersion: style.version, title: '' };
    for (const subject of ['', undefined, '   ']) {
      const result = compileStyleRecipe({ ...input, subject, hasReferences: true });
      assert(result.prompt.includes('本次上传的参考图'));
      assert(result.prompt.includes(style.name));
      expectRecipeError(() => compileStyleRecipe({ ...input, subject, hasReferences: false }), 400, 'style_reference_required');
    }
    for (const subject of [null, {}, false, 123]) expectRecipeError(() => compileStyleRecipe({ ...input, subject, hasReferences: true }), 400, 'invalid_style_fields');
  }
});

test('structured illustration packages keep provided labels and dialogue without forcing a title', () => {
  const subject = '温度传感器 → ESP32 → 风扇；标签原文：输入、处理、输出。对白原文：你好。';
  for (const id of ['knowledge-card','four-panel-comic','character-sheet','packaging-concept','scientific-schematic']) {
    const style = STYLE_CATALOG.find(item => item.id === id);
    const result = compileStyleRecipe({ styleId: id, styleVersion: style.version, subject, title: '' });
    assert(result.prompt.includes(subject));
    assert.match(result.prompt, /保留已提供的正文与标签/);
    assert.doesNotMatch(result.prompt, /不新增标题、标语、说明小字/);
    assert.match(result.prompt, /不补造数据/);
  }
});
