import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { CornerUpLeft, LoaderCircle, Maximize, MessageSquare, MessageSquarePlus, MousePointer2, SquareDashed } from 'lucide-react';
import { DEFAULT_VIEW, fitImage, zoomAt } from './viewport-math.mjs';
import './editor-canvas.css';

const ImagePane = forwardRef(function ImagePane({ name, label, url, selected, onActivate, cropMode, crop, onCropChange }, ref) {
  const surface = useRef(null), image = useRef(null), gesture = useRef(null), pointers = useRef(new Map()), cropStart = useRef(null);
  const liveView = useRef({ ...DEFAULT_VIEW }), frame = useRef(0);
  const [view, setView] = useState({ ...DEFAULT_VIEW }), [size, setSize] = useState({ width: 1, height: 1 }), [ratio, setRatio] = useState(1);
  const [dragging, setDragging] = useState(false);
  function update(next) {
    liveView.current = next;
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; setView({ ...liveView.current }); });
  }
  function fit() { update({ ...DEFAULT_VIEW }); }
  useImperativeHandle(ref, () => ({ fit }), []);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(surface.current); return () => observer.disconnect();
  }, []);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);
  useEffect(() => {
    const node = surface.current;
    const wheel = event => {
      event.preventDefault(); onActivate();
      const rect = node.getBoundingClientRect(), unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      update(zoomAt(liveView.current, liveView.current.scale * Math.exp(-Math.max(-500, Math.min(500, event.deltaY * unit)) * .002), { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 }));
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, [onActivate]);
  function point(event) {
    const bounds = image.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  }
  function start(event) {
    if (event.button !== 0 && event.button !== 1) return;
    if (cropMode && event.button !== 1) return;
    event.preventDefault(); onActivate(); event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current = [...pointers.current.values()]; setDragging(true);
  }
  function move(event) {
    if (!pointers.current.has(event.pointerId)) return;
    const before = gesture.current; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...pointers.current.values()]; gesture.current = after;
    if (before.length === 2 && after.length === 2) {
      const mid = items => ({ x: (items[0].x + items[1].x) / 2, y: (items[0].y + items[1].y) / 2 });
      const old = mid(before), next = mid(after), distance = items => Math.hypot(items[1].x - items[0].x, items[1].y - items[0].y);
      const rect = surface.current.getBoundingClientRect();
      const zoomed = zoomAt(liveView.current, liveView.current.scale * distance(after) / Math.max(1, distance(before)), { x: old.x - rect.left - rect.width / 2, y: old.y - rect.top - rect.height / 2 });
      update({ ...zoomed, x: zoomed.x + next.x - old.x, y: zoomed.y + next.y - old.y });
    } else if (before.length === 1 && after.length === 1) update({ ...liveView.current, x: liveView.current.x + after[0].x - before[0].x, y: liveView.current.y + after[0].y - before[0].y });
  }
  function finish(event) { pointers.current.delete(event.pointerId); gesture.current = [...pointers.current.values()]; if (!pointers.current.size) setDragging(false); }
  const box = fitImage(size.width, size.height, ratio);
  return <section className={`ed-viewport ${selected ? 'is-current' : ''}`} aria-label={label} data-viewport={name}>
    <div className="ed-viewport-label"><span>{label}</span><button type="button" onClick={() => { onActivate(); fit(); }} title={`适应${label}画面`} aria-label={`适应${label}画面`}>{Math.round(view.scale * 100)}%</button></div>
    <div ref={surface} className={`ed-viewport-surface ${dragging ? 'is-panning' : ''} ${cropMode ? 'is-selecting' : ''}`} tabIndex={0} aria-label={`${label}画布，滚轮缩放，拖动平移`} data-scale={view.scale} data-pan-x={view.x} data-pan-y={view.y} onFocus={onActivate} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onDoubleClick={() => { if (!cropMode) fit(); }} onKeyDown={event => {
      if (['+', '=', '-', '0', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
      if (event.key === '0') fit();
      else if (event.key === '+' || event.key === '=') update(zoomAt(liveView.current, liveView.current.scale * 1.2));
      else if (event.key === '-') update(zoomAt(liveView.current, liveView.current.scale / 1.2));
      else if (event.key.startsWith('Arrow')) update({ ...liveView.current, x: liveView.current.x + ({ ArrowLeft: -20, ArrowRight: 20 }[event.key] || 0), y: liveView.current.y + ({ ArrowUp: -20, ArrowDown: 20 }[event.key] || 0) });
    }}>
      <div ref={image} className="ed-image-box ed-viewport-image" style={{ width: box.width, height: box.height, transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
        {url && <img className="ed-preview-image" src={url} alt={name === 'original' ? '未编辑的原图' : '当前编辑效果'} draggable="false" onLoad={event => setRatio(event.target.naturalWidth / event.target.naturalHeight)} />}
        {cropMode && <div className="ed-crop-layer" onPointerDown={event => { if (event.button !== 0) return; event.stopPropagation(); onActivate(); event.currentTarget.setPointerCapture(event.pointerId); cropStart.current = point(event); }} onPointerMove={event => {
          if (!cropStart.current) return; const end = point(event), start = cropStart.current, width = Math.abs(end.x - start.x), height = Math.abs(end.y - start.y);
          if (width > .005 && height > .005) onCropChange({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width, height });
        }} onPointerUp={() => { cropStart.current = null; }} onPointerCancel={() => { cropStart.current = null; }}><div className="ed-crop-selection" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}><i /><i /><i /><i /><span /><span /></div></div>}
      </div>
    </div>
  </section>;
});

export default forwardRef(function EditorCanvas({ document, originalUrl, previewUrl, compare, cropMode, crop, onCropChange, onCropToggle, onChat, onReturn, returnLabel, returning, disabled }, ref) {
  const original = useRef(null), edited = useRef(null);
  const [activePane, setActivePane] = useState('edited');
  function fit() { (activePane === 'original' && compare ? original.current : edited.current)?.fit(); }
  useImperativeHandle(ref, () => ({ fit }), [activePane, compare]);
  useEffect(() => { if (!compare || cropMode) setActivePane('edited'); }, [compare, cropMode]);
  return <div className={`ed-interactive-canvas ${compare ? 'is-comparing' : ''}`}>
    <div className="ed-viewport-grid">
      {compare && <ImagePane key="original" ref={original} name="original" label="原图" url={originalUrl} selected={activePane === 'original'} onActivate={() => setActivePane('original')} />}
      <ImagePane key="edited" ref={edited} name="edited" label={compare ? '编辑后' : '当前画面'} url={previewUrl} selected={activePane === 'edited'} onActivate={() => setActivePane('edited')} cropMode={cropMode} crop={crop} onCropChange={onCropChange} />
    </div>
    <div className="ed-canvas-dock" role="toolbar" aria-label="画布工具">
      <button type="button" aria-label="移动画面" title="移动画面 · 拖动平移，滚轮缩放" aria-pressed={!cropMode} disabled={disabled || returning} onClick={() => { if (cropMode) onCropToggle(); }}><MousePointer2 size={19} /></button>
      <button type="button" aria-label="框选裁剪" title="框选裁剪" aria-pressed={cropMode} disabled={disabled || returning} onClick={() => { setActivePane('edited'); onCropToggle(); }}><SquareDashed size={19} /></button>
      <button type="button" aria-label="打开编辑会话" title="打开编辑会话" onClick={onChat}><MessageSquare size={19} /></button>
      <span className="ed-dock-divider" />
      <button type="button" aria-label="适应当前画面" title="适应当前画面 · 双击画面也可复位" onClick={fit}><Maximize size={18} /></button>
      <span className="ed-dock-divider" />
      <button type="button" className="ed-dock-return" aria-label={returnLabel} title={returnLabel} disabled={disabled || cropMode || returning} onClick={onReturn}>{returning ? <LoaderCircle size={19} className="spin" /> : returnLabel.startsWith('返回') ? <CornerUpLeft size={19} /> : <MessageSquarePlus size={19} />}</button>
    </div>
  </div>;
});
