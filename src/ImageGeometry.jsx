import { ArrowLeftRight, SquareDashed, SlidersHorizontal } from 'lucide-react';
import { ASPECT_RATIOS, PAPER_SIZES, draftPixelSize, draftAspectRatio, resolveImageGeometry } from '../shared/image-geometry.mjs';
import OptionPicker from './OptionPicker.jsx';

const ratioOptions = [
  { value: 'auto', label: '自动', icon: <SquareDashed size={20} /> },
  ...ASPECT_RATIOS.map(ratio => {
    const [width, height] = ratio.split(':').map(Number);
    return { value: ratio, label: ratio, icon: <span className="ratio-option-shape" style={{ width: 24 * width / Math.max(width, height), height: 24 * height / Math.max(width, height) }} /> };
  }),
  { value: 'custom', label: '自定义', icon: <SlidersHorizontal size={20} /> }
];

export default function ImageGeometry({ draft, onChange, children }) {
  let geometry, error;
  try { geometry = resolveImageGeometry(draft.size, draftAspectRatio(draft), draftPixelSize(draft)); }
  catch (issue) { error = issue.message; }
  const paper = Boolean(PAPER_SIZES[draft.size]), pixels = draft.size === 'custom';
  const custom = !paper && !pixels && draft.aspectRatio === 'custom';
  return <div className="geometry-controls">
    <div className="geometry-fields">
      {!paper && !pixels && <OptionPicker label="画面比例" className="ratio-select" value={draft.aspectRatio || 'auto'} options={ratioOptions} grid onChange={aspectRatio => onChange({ aspectRatio })} />}
      {paper && <div className="paper-size-info"><span>{draft.size} · {geometry?.paper.widthMM} × {geometry?.paper.heightMM} mm</span><button type="button" className="tool-button" aria-label="切换纸张横竖方向" title="切换横竖方向" onClick={() => onChange({ aspectRatio: (geometry?.width || 0) > (geometry?.height || 0) ? 'portrait' : 'landscape' })}><ArrowLeftRight size={16} /></button></div>}
      {pixels && <div className="custom-ratio custom-pixels" role="group" aria-label="自定义像素尺寸"><label><span>宽</span><input type="number" min="512" max="4096" step="1" inputMode="numeric" aria-label="像素宽" aria-invalid={Boolean(error)} value={draft.pixelWidth ?? '1536'} onChange={event => onChange({ pixelWidth: event.target.value })} /></label><span>×</span><label><span>高</span><input type="number" min="512" max="4096" step="1" inputMode="numeric" aria-label="像素高" aria-invalid={Boolean(error)} value={draft.pixelHeight ?? '1024'} onChange={event => onChange({ pixelHeight: event.target.value })} /></label><span>px</span><button type="button" aria-label="交换像素宽高" onClick={() => onChange({ pixelWidth: draft.pixelHeight || '1024', pixelHeight: draft.pixelWidth || '1536' })}><ArrowLeftRight size={16} /></button></div>}
      {children}
      {custom && <div className="custom-ratio" role="group" aria-label="自定义宽高比">
        <label><span>宽</span><input aria-label="比例宽" aria-invalid={Boolean(error)} aria-describedby={error ? 'ratio-help ratio-error' : 'ratio-help'} type="number" min="1" max="10000" step="1" inputMode="numeric" value={draft.ratioWidth} onChange={event => onChange({ ratioWidth: event.target.value })} /></label>
        <span aria-hidden="true">:</span>
        <label><span>高</span><input aria-label="比例高" aria-invalid={Boolean(error)} aria-describedby={error ? 'ratio-help ratio-error' : 'ratio-help'} type="number" min="1" max="10000" step="1" inputMode="numeric" value={draft.ratioHeight} onChange={event => onChange({ ratioHeight: event.target.value })} /></label>
        <button type="button" aria-label="交换宽高比" title="交换宽高比" onClick={() => onChange({ ratioWidth: draft.ratioHeight, ratioHeight: draft.ratioWidth })}><ArrowLeftRight size={16} /></button>
      </div>}
      {geometry?.width && <div className="geometry-preview"><span className="geometry-outline" style={{ aspectRatio: `${geometry.width} / ${geometry.height}` }} aria-hidden="true" /><span>目标 {geometry.width} × {geometry.height}</span></div>}
      {custom && <span className="geometry-help" id="ratio-help">支持 1:3～3:1</span>}
    </div>
    {(paper || pixels) && <p className="geometry-size-note">{paper ? '纸张按约 150 DPI 换算，' : '宽高按 16 像素对齐，'}实际输出尺寸以模型返回为准。</p>}
    {(custom || paper || pixels) && error && <p className="geometry-error" id="ratio-error" role="status">{error}</p>}
  </div>;
}
