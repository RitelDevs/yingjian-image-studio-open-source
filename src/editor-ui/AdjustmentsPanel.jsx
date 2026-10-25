import { useRef, useState } from 'react';
import EditableAdjustmentValue from './EditableAdjustmentValue.jsx';
import { RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2, Crop, Check, X, SlidersHorizontal, History } from 'lucide-react';
import { ADJUSTMENT_DEFINITIONS, ADJUSTMENT_GROUPS, EDITOR_PRESETS } from '../../shared/editor-contract.mjs';

export function AdjustmentsPanel({ editor, onIssue, cropMode, onCropToggle }) {
  const editorRef = useRef(editor); editorRef.current = editor;
  const valuesRef = useRef({});
  const active = useRef(null);
  const [tab, setTab] = useState('adjust');
  const state = editor.document;
  const disabled = !state || editor.restoring || editor.busy;
  function perform(operations, label) {
    try { editor.commitOperations(operations, { actor: 'manual', label }); }
    catch (error) { onIssue(error.message); }
  }
  function start(key) { active.current = key; valuesRef.current = { ...state.adjustments }; }
  function preview(key, value) {
    if (active.current !== key) start(key);
    valuesRef.current[key] = Number(value);
    try { editor.previewOperations([{ type: 'setAdjustments', values: { [key]: Number(value) } }]); }
    catch (error) { onIssue(error.message); }
  }
  function commit(key, label) {
    if (active.current !== key) return;
    active.current = null;
    try { editorRef.current.commitOperations([{ type: 'setAdjustments', values: { [key]: valuesRef.current[key] } }], { actor: 'manual', label: `调整${label}` }); }
    catch (error) { onIssue(error.message); }
  }
  const adjustments = state?.adjustments || {};
  const selectedPreset = state && EDITOR_PRESETS.find(preset => Object.entries(preset.adjustments).every(([key, value]) => (adjustments[key] ?? 0) === value));
  return <aside className="ed-panel ed-adjustments" aria-label="图片参数">
    <div className="ed-panel-tabs" role="tablist" aria-label="编辑工具">
      <button role="tab" aria-selected={tab === 'adjust'} onClick={() => setTab('adjust')}><SlidersHorizontal size={15} /> 调整</button>
      <button role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}><History size={15} /> 历史</button>
    </div>
    <div className="ed-panel-scroll">
      {tab === 'history' ? <div className="ed-history"><h2>每一步，都可以回退</h2><p className="ed-muted">手动与 AI 调整共用一份编辑历史。</p>{!editor.history?.length ? <p className="ed-empty-history">导入图片后，调整记录会显示在这里。</p> : <ol>{editor.history.slice().reverse().map((item, index) => <li className={`${item.undone ? 'is-undone' : ''} ${item.isCurrent ? 'is-current' : ''}`} key={item.id || index}><span className={`ed-history-dot ${item.actor === 'ai' ? 'is-ai' : ''}`} /><div><strong>{item.label || '编辑图片'}{item.isCurrent ? ' · 当前' : item.undone ? ' · 已撤销' : ''}</strong><small>{item.actor === 'ai' ? 'AI 调整' : '手动调整'}{item.createdAt ? ` · ${new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}</small></div></li>)}</ol>}</div> : <>
        <section className="ed-section"><div className="ed-section-heading"><h2>风格预设</h2><span>一键找到感觉</span></div>
          <div className="ed-presets">{EDITOR_PRESETS.map(preset => {
            const selected = state && Object.entries(preset.adjustments).every(([key, value]) => adjustments[key] === value);
            return <button key={preset.id} className={`ed-preset ${selected ? 'is-selected' : ''}`} aria-pressed={Boolean(selected)} title={preset.description} disabled={disabled || cropMode} onClick={() => perform([{ type: 'applyPreset', presetId: preset.id }], `${preset.label}预设`)}>
              <span className={`ed-preset-swatch ed-preset-${preset.id}`} aria-hidden="true"><span /><i />{selected && <Check size={12} />}</span><span>{preset.label}</span>
            </button>;
          })}</div>
          <p className="ed-preset-description">{selectedPreset?.description || '选择风格后，还可以继续调整每一项参数。'}</p>
        </section>
        <section className="ed-section"><div className="ed-section-heading"><h2>精细调整</h2><button className="ed-text-button" disabled={disabled || cropMode} onClick={() => perform([{ type: 'applyPreset', presetId: 'original' }], '重置调色')}>重置</button></div>
          <div className="ed-control-groups">{ADJUSTMENT_GROUPS.map(group => <fieldset className="ed-control-group" key={group.id}><legend>{group.label}</legend><p>{group.description}</p><div className="ed-sliders">{ADJUSTMENT_DEFINITIONS.filter(def => def.group === group.id).map(def => <div className={`ed-adjustment ed-adjustment-${def.key}`} key={def.key}>
            <div className="ed-slider-heading"><label htmlFor={`ed-${def.key}`}>{def.label}</label><EditableAdjustmentValue key={`${state?.documentId || 'empty'}:${def.key}`} definition={def} value={adjustments[def.key] ?? 0} editor={editor} disabled={disabled || cropMode} onIssue={onIssue} /></div>
            <input id={`ed-${def.key}`} type="range" title={def.description} min={def.min} max={def.max} step={def.step || 1} value={adjustments[def.key] ?? 0} disabled={disabled || cropMode} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); start(def.key); }} onChange={event => preview(def.key, event.target.value)} onPointerUp={() => commit(def.key, def.label)} onPointerCancel={() => { active.current = null; editor.cancelPreview(); }} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commit(def.key, def.label); }} onBlur={() => commit(def.key, def.label)} />
            {def.key === 'temperature' && <div className="ed-scale-labels"><span>冷</span><span>暖</span></div>}{def.key === 'tint' && <div className="ed-scale-labels"><span>绿</span><span>洋红</span></div>}
          </div>)}</div></fieldset>)}</div>
        </section>
        <section className="ed-section"><div className="ed-section-heading"><h2>构图</h2><button className="ed-text-button" disabled={disabled || cropMode} onClick={() => perform([{ type: 'reset' }], '恢复原图')}>恢复原图</button></div><div className="ed-transform-tools">
          <button title="向左旋转 90 度" aria-label="向左旋转 90 度" disabled={disabled || cropMode} onClick={() => perform([{ type: 'setTransform', values: { rotation: ((state.transform.rotation || 0) + 270) % 360 } }], '向左旋转')}><RotateCcw size={17} /></button>
          <button title="向右旋转 90 度" aria-label="向右旋转 90 度" disabled={disabled || cropMode} onClick={() => perform([{ type: 'setTransform', values: { rotation: ((state.transform.rotation || 0) + 90) % 360 } }], '向右旋转')}><RotateCw size={17} /></button>
          <button title="水平翻转" aria-label="水平翻转" disabled={disabled || cropMode} onClick={() => perform([{ type: 'setTransform', values: { flipX: !state.transform.flipX } }], '水平翻转')}><FlipHorizontal2 size={17} /></button>
          <button title="垂直翻转" aria-label="垂直翻转" disabled={disabled || cropMode} onClick={() => perform([{ type: 'setTransform', values: { flipY: !state.transform.flipY } }], '垂直翻转')}><FlipVertical2 size={17} /></button>
        </div><button className="ed-crop-button" aria-pressed={cropMode} disabled={disabled} onClick={onCropToggle}><Crop size={16} />{cropMode ? '正在选择裁剪区域' : '裁剪图片'}</button>{state?.crop && !cropMode && <button className="ed-text-button ed-full" onClick={() => perform([{ type: 'setCrop', crop: null }], '取消裁剪')}>恢复完整画幅</button>}</section>
      </>}
    </div>
    <div className="ed-panel-foot"><span className="ed-safe-dot" />原图保留，调整随时可撤销</div>
  </aside>;
}

export function CropControls({ value, onChange, onApply, onCancel }) {
  function update(key, number) {
    const next = { ...value, [key]: Math.max(key === 'width' || key === 'height' ? .01 : 0, Math.min(1, Number(number) / 100 || 0)) };
    next.width = Math.min(next.width, 1 - next.x); next.height = Math.min(next.height, 1 - next.y);
    if (next.width > 0 && next.height > 0) onChange(next);
  }
  return <div className="ed-crop-controls" aria-label="裁剪设置"><span>拖动图片选区</span><div className="ed-crop-values">{Object.entries({ x: '左', y: '上', width: '宽', height: '高' }).map(([key, label]) => <label key={key}>{label}<input aria-label={`裁剪${label}百分比`} type="number" min="0" max="100" step="1" value={Math.round(value[key] * 100)} onChange={event => update(key, event.target.value)} />%</label>)}</div><button className="ed-primary" onClick={onApply}><Check size={14} />应用裁剪</button><button className="ed-tool" aria-label="取消裁剪选择" title="取消裁剪选择" onClick={onCancel}><X size={16} /></button></div>;
}
