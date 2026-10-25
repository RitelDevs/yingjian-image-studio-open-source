import { useId } from 'react';
import { getStyleOptimizationProfile } from '../shared/style-optimization.mjs';
import './style-optimization.css';

export default function StyleOptimization({ value = 'professional', onChange, style, disabled = false, demo = false }) {
  const id = useId();
  const profile = getStyleOptimizationProfile(style);
  return <fieldset className="style-optimization" disabled={disabled} aria-describedby={`${id}-hint`}>
    <legend>方案方式</legend>
    <div className="style-optimization-options">
      <label><input type="radio" name={id} value="template" checked={value === 'template'} onChange={() => onChange('template')} /><span><strong>直接套用</strong><small>使用固定风格规则</small></span></label>
      <label><input type="radio" name={id} value="professional" checked={value === 'professional'} onChange={() => onChange('professional')} /><span><strong>专业优化</strong><small>{profile.focus}</small></span></label>
    </div>
    <p id={`${id}-hint`}>{value === 'professional' ? demo ? '本地模拟专业优化，不调用真实模型；实际优化效果尚待验证。' : '按主体调用对话模型优化，按中转计费；看完方案、确认后才生图。' : '直接套用不调用对话模型；确认生图后按中转计费。'}</p>
  </fieldset>;
}

export function StyleOptimizationSummary({ optimization }) {
  if (optimization?.mode !== 'professional') return null;
  return <section className="style-optimization-summary" aria-label="专业优化说明">
    <div><strong>{optimization.simulated ? '专业优化 · 本地模拟' : '专业优化'} · {optimization.profileName}</strong></div>
    <ul>{optimization.decisions.map(item => <li key={item.aspect}><strong>{item.label}</strong><span>{item.detail}</span></li>)}</ul>
    <p>参考规则：{[...new Set((optimization.sources || []).map(source => source.skill))].join('、') || '当前风格规则'}。请核对下方完整提示词后再确认。</p>
  </section>;
}
