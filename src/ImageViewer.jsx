import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Maximize, Minus, Plus, SlidersHorizontal, X } from 'lucide-react';
import { DEFAULT_VIEW, fitImage, zoomAt } from './editor-ui/viewport-math.mjs';
import './image-viewer.css';

export default function ImageViewer({ image, onClose, onEdit }) {
  const dialog = useRef(null), viewport = useRef(null), pointers = useRef(new Map()), previous = useRef([]), viewRef = useRef({ ...DEFAULT_VIEW });
  const [view, setView] = useState({ ...DEFAULT_VIEW }), [size, setSize] = useState({ width: 1, height: 1 }), [ratio, setRatio] = useState(1);
  const [loaded, setLoaded] = useState(false), [failed, setFailed] = useState(false), [panning, setPanning] = useState(false);
  const frame = useRef(null), leavingForEditor = useRef(false), closeAction = useRef(onClose); closeAction.current = onClose;
  function update(next) { viewRef.current = next; if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = null; setView({ ...viewRef.current }); }); }
  function reset() { update({ ...DEFAULT_VIEW }); }
  useEffect(() => {
    const trigger = document.activeElement;
    dialog.current.showModal();
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(viewport.current);
    return () => { observer.disconnect(); dialog.current?.close(); if (frame.current) cancelAnimationFrame(frame.current); if (!leavingForEditor.current && trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const node = viewport.current;
    const wheel = event => { if (!loaded) return; event.preventDefault(); const bounds = node.getBoundingClientRect(), unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1; update(zoomAt(viewRef.current, viewRef.current.scale * Math.exp(-Math.max(-500, Math.min(500, event.deltaY * unit)) * .002), { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 })); };
    node.addEventListener('wheel', wheel, { passive: false });return () => node.removeEventListener('wheel', wheel);
  }, [loaded]);
  function move(event) {
    if (!pointers.current.has(event.pointerId)) return;
    const before = previous.current;pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});const after=[...pointers.current.values()];previous.current=after;
    if(before.length===2 && after.length===2){
      const mid=a=>({x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}),distance=a=>Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y),old=mid(before),next=mid(after),b=viewport.current.getBoundingClientRect();
      const nextView=zoomAt(viewRef.current,viewRef.current.scale*distance(after)/Math.max(1,distance(before)),{x:old.x-b.left-b.width/2,y:old.y-b.top-b.height/2});update({...nextView,x:nextView.x+next.x-old.x,y:nextView.y+next.y-old.y});
    }else if(before.length===1&&after.length===1)update({...viewRef.current,x:viewRef.current.x+after[0].x-before[0].x,y:viewRef.current.y+after[0].y-before[0].y});
  }
  function finish(event){pointers.current.delete(event.pointerId);previous.current=[...pointers.current.values()];if(!pointers.current.size)setPanning(false);}
  const box=fitImage(size.width,size.height,ratio),filename=image.name || '图片';
  return createPortal(<dialog ref={dialog} className="studio-image-viewer" aria-label="图片大图预览" onCancel={event=>{event.preventDefault();closeAction.current();}} onKeyDown={event=>{
    if(event.key==='Tab'){
      const controls=[...dialog.current.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')];
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus();}
    }
    if(['+','=','-','0'].includes(event.key)&&loaded){event.preventDefault();event.key==='0'?reset():update(zoomAt(viewRef.current,viewRef.current.scale*(event.key==='-'?1/1.2:1.2)));}
  }}>
    <header className="viewer-header"><span>{filename}</span><button type="button" aria-label="关闭大图" title="关闭大图 · Esc" onClick={onClose}><X size={21}/></button></header>
    <div ref={viewport} className={`viewer-viewport${panning?' is-panning':''}`} aria-label="图片画布，滚轮缩放，拖动平移" tabIndex={0} data-scale={view.scale} onPointerDown={event=>{
      if(!loaded||event.button!==0)return;event.preventDefault();event.currentTarget.focus({preventScroll:true});event.currentTarget.setPointerCapture(event.pointerId);pointers.current.set(event.pointerId,{x:event.clientX,y:event.clientY});previous.current=[...pointers.current.values()];setPanning(true);
    }} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} onDoubleClick={reset}>
      {!failed&&<img src={image.url} alt={`${filename}大图`} draggable="false" style={{width:box.width,height:box.height,transform:`translate(-50%,-50%) translate(${view.x}px,${view.y}px) scale(${view.scale})`,visibility:loaded?'visible':'hidden'}} onLoad={event=>{setRatio(event.currentTarget.naturalWidth/event.currentTarget.naturalHeight);setLoaded(true);}} onError={()=>{setFailed(true);setLoaded(false);}}/>}
      {!loaded&&<p className="viewer-state" role="status">{failed?'图片已过期或暂时无法读取。':'正在加载图片…'}</p>}
    </div>
    <footer className="viewer-footer">
      <div className="viewer-zoom"><button type="button" disabled={!loaded} title="缩小" aria-label="缩小图片" onClick={()=>update(zoomAt(viewRef.current,viewRef.current.scale/1.2))}><Minus size={17}/></button><button type="button" disabled={!loaded} className="viewer-zoom-value" aria-label="适应大图画布" title="适应画布 · 双击图片也可复位" onClick={reset}>{Math.round(view.scale*100)}%<Maximize size={14}/></button><button type="button" disabled={!loaded} title="放大" aria-label="放大图片" onClick={()=>update(zoomAt(viewRef.current,viewRef.current.scale*1.2))}><Plus size={17}/></button></div>
      <div className="viewer-actions"><a href={image.url} download={`${filename}.${image.mime==='image/jpeg'?'jpg':image.mime==='image/webp'?'webp':'png'}`} aria-label="下载大图" title="下载图片"><Download size={18}/></a><button type="button" className="viewer-edit" disabled={!loaded} onClick={()=>{leavingForEditor.current=true;onEdit(image);}}><SlidersHorizontal size={17}/><span>放入编辑台</span></button></div>
    </footer>
  </dialog>,document.body);
}
