import { EDITOR_PRESETS, ADJUSTMENT_DEFINITIONS, applyOperations, validateOperations } from '../../shared/editor-contract.mjs';

// Deterministic, visibly labelled local fixture. Never a substitute for a real model.
export function demoEditorAnswer(payload) {
  let input;
  try { input = JSON.parse(payload.messages.at(-1).content.find(item => item.type === 'text').text); }
  catch { return JSON.stringify({ reply: '本地演示：请上传图片，再试试“调亮一点，降低饱和度”。', operations: [] }); }
  const text = input.request, state = input.currentState;
  let operations = [], reply = '本地演示：以下是模拟调整建议，未调用中转 AI。';
  if (/换背景|删除.*(?:人|物)|抠图|加(?:个|一个)?(?:人|文字)|生成图片|增删/.test(text)) {
    reply = '本地演示：当前编辑台支持调色、预设、裁剪、旋转和翻转，暂不支持替换背景或增删图片内容。';
  } else if (/重做/.test(text)) operations = [{ type: 'redo' }];
  else if (/撤销/.test(text)) operations = [{ type: 'undo' }];
  else if (/恢复原图|复位/.test(text)) operations = [{ type: 'reset' }];
  else {
    // Direction words belong to their own instruction, not every control in the sentence.
    const clauses = text.split(/[，,、；;。\n]|然后|接着|同时|并且|再/u).map(value => value.trim()).filter(Boolean);
    const presets = EDITOR_PRESETS.slice().sort((a, b) => b.label.length - a.label.length);
    const preset = clauses.reduce((selected, clause) => {
      const wantsPreset = /预设|风格|效果|电影|柔梦|戏剧|复古|清透/.test(clause);
      const editsGrainOnly = /颗粒/.test(clause) && !/预设|风格/.test(clause);
      return wantsPreset && !editsGrainOnly ? presets.find(item => clause.includes(item.label)) || selected : selected;
    }, null);
    if (preset) operations.push({ type: 'applyPreset', presetId: preset.id });
    const values = {};
    const change = (key, delta) => {
      const def = ADJUSTMENT_DEFINITIONS.find(item => item.key === key);
      values[key] = Math.max(def.min, Math.min(def.max, (values[key] ?? preset?.adjustments[key] ?? state.adjustments[key] ?? 0) + delta));
    };
    for (const clause of clauses) {
      if (/调亮|亮一点|整体亮|明度|brightness/i.test(clause)) change('brightness', /降低明度|暗一点|调暗/.test(clause) ? -10 : 10);
      else if (/调暗|暗一点/.test(clause)) change('brightness', -10);
      if (/饱和度/.test(clause)) change('saturation', /降|减|低/.test(clause) ? -15 : 15);
      if (!/预设|风格|效果/.test(clause)) {
        if (/暖/.test(clause)) change('temperature', 15);
        if (/冷/.test(clause)) change('temperature', -15);
      }
      if (/阴影|暗部/.test(clause)) change('shadows', /压暗|降|减/.test(clause) ? -15 : 15);
      if (/高光|亮部/.test(clause)) change('highlights', /压|降|减|柔和|刺眼/.test(clause) ? -18 : 12);
      const disable = /关闭|关掉|去掉|去除|取消|清除|移除|不要|归零/.test(clause);
      if (/锐度|锐化|清晰一点|清楚一点|sharpness|sharpen/i.test(clause)) { if (disable) values.sharpness = 0; else change('sharpness', /减|降|少/.test(clause) ? -15 : 25); }
      if (/柔光/.test(clause)) { if (disable) values.bloom = 0; else change('bloom', /减|降|少/.test(clause) ? -15 : 25); }
      if (/颗粒/.test(clause)) { if (disable) values.grain = 0; else change('grain', /减|降|少/.test(clause) ? -12 : 20); }
    }
    if (Object.keys(values).length) operations.push({ type: 'setAdjustments', values });
    if (/旋转/.test(text)) operations.push({ type: 'setTransform', values: { rotation: (state.transform.rotation + 90) % 360 } });
    if (/水平翻转/.test(text)) operations.push({ type: 'setTransform', values: { flipX: !state.transform.flipX } });
    if (/垂直翻转/.test(text)) operations.push({ type: 'setTransform', values: { flipY: !state.transform.flipY } });
    if (/正方形|方形裁剪/.test(text)) {
      const transformed = applyOperations(state, operations);
      const rotated = transformed.transform.rotation % 180 !== 0;
      const w = rotated ? state.height : state.width, h = rotated ? state.width : state.height, edge = Math.min(w, h);
      operations.push({ type: 'setCrop', crop: { x: (w - edge) / w / 2, y: (h - edge) / h / 2, width: edge / w, height: edge / h } });
    }
    if (!operations.length) reply = '本地演示：可以试试“调亮一点，降低饱和度”或“使用黑白预设”。真实对话请使用正式账号登录的本地服务。';
  }
  return JSON.stringify({ reply, operations: validateOperations(operations, state) });
}
