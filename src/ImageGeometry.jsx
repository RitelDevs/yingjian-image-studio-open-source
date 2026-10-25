import { ArrowLeftRight, SquareDashed, SlidersHorizontal } from 'lucide-react';
import { ASPECT_RATIOS, draftAspectRatio, resolveImageGeometry } from '../shared/image-geometry.mjs';
import OptionPicker from './OptionPicker.jsx';

const ratioOptions = [
  { value: 'auto', label: '自动', icon: <SquareDashed size={20} /> },
  ...ASPECT_RATIOS.map(ratio => {
    const [width, height] = ratio.split(':').map(Number);
    return { value: ratio, label: ratio, icon: <span className="ratio-option-shape" style={{ width: 24 * width / Math.max(width, height), height: 24 * height / Math.max(width, height) }} /> };
  }),
  { value: 'custom', label: '自定义', icon: <SlidersHorizontal size={20} /> }
];

export default function ImageGeometry({ draft, onChange }) {
  let geometry, error;
  try { geometry = resolveImageGeometry(draft.size, draftAspectRatio(draft)); }
  catch (issue) { error = issue.message; }
  const custom = draft.aspectRatio === 'custom';
  return <div className="geometry-controls">
    <div className="geometry-fields">
      <OptionPicker label="画面比例" className="ratio-select" value={draft.aspectRatio || 'auto'} options={ratioOptions} grid onChange={aspectRatio => onChange({ aspectRatio })} />
      {custom && <div className="custom-ratio" role="group" aria-label="自定义宽高比">
        <label><span>宽</span><input aria-label="比例宽" aria-invalid={Boolean(error)} aria-describedby={error ? 'ratio-help ratio-error' : 'ratio-help'} type="number" min="1" max="10000" step="1" inputMode="numeric" value={draft.ratioWidth} onChange={event => onChange({ ratioWidth: event.target.value })} /></label>
        <span aria-hidden="true">:</span>
        <label><span>高</span><input aria-label="比例高" aria-invalid={Boolean(error)} aria-describedby={error ? 'ratio-help ratio-error' : 'ratio-help'} type="number" min="1" max="10000" step="1" inputMode="numeric" value={draft.ratioHeight} onChange={event => onChange({ ratioHeight: event.target.value })} /></label>
        <button type="button" aria-label="交换宽高比" title="交换宽高比" onClick={() => onChange({ ratioWidth: draft.ratioHeight, ratioHeight: draft.ratioWidth })}><ArrowLeftRight size={16} /></button>
      </div>}
      {geometry?.width && <div className="geometry-preview"><span className="geometry-outline" style={{ aspectRatio: `${geometry.width} / ${geometry.height}` }} aria-hidden="true" /><span>目标 {geometry.width} × {geometry.height}</span></div>}
      {custom && <span className="geometry-help" id="ratio-help">支持 1:3～3:1</span>}
    </div>
    {custom && error && <p className="geometry-error" id="ratio-error" role="status">{error}</p>}
  </div>;
}
