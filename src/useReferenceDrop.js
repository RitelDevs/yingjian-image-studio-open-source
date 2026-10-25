import { useEffect, useRef, useState } from 'react';
import { REFERENCE_LIMIT, REFERENCE_TYPES } from './reference-files.js';

const isFileDrag = transfer => transfer && ([...transfer.types].includes('Files') || [...(transfer.items || [])].some(item => item.kind === 'file'));
const contains = (element, target) => target instanceof Node && element?.contains(target);

// Native window listeners also prevent a missed file drop from navigating away and losing a draft.
export function useReferenceDrop({ targetRef, onFiles, onNotice, referenceCount, scope, inputRef }) {
  const [state, setState] = useState('idle');
  const [announcement, setAnnouncement] = useState('');
  const latest = useRef(null);
  latest.current = { onFiles, onNotice, referenceCount, inputRef };
  useEffect(() => { setState('idle'); setAnnouncement(''); }, [scope]);
  useEffect(() => {
    let phase = 'idle', insideDepth = 0, resetTimer;
    const update = value => { if (phase !== value) { phase = value; setState(value); } };
    const reset = () => { clearTimeout(resetTimer); insideDepth = 0; update('idle'); };
    const status = transfer => {
      if (latest.current.referenceCount >= REFERENCE_LIMIT) return 'full';
      const items = [...(transfer.items || [])].filter(item => item.kind === 'file');
      return items.length && items.every(item => item.type && item.type !== 'application/octet-stream' && !REFERENCE_TYPES.includes(item.type)) ? 'unsupported' : 'ready';
    };
    const over = event => {
      if (!isFileDrag(event.dataTransfer)) return;
      // A nested drop zone (such as the image editor) already owns this drag.
      // Keep its chosen dropEffect instead of rejecting it as outside the composer.
      if (event.defaultPrevented) { reset(); return; }
      event.preventDefault();
      const inside = contains(targetRef.current, event.target);
      const value = inside ? status(event.dataTransfer) : 'idle';
      if (inside) insideDepth = event.type === 'dragenter' ? insideDepth + 1 : Math.max(1, insideDepth);
      else insideDepth = 0;
      update(value);
      clearTimeout(resetTimer);
      // Explorer cancellation can end without a browser drop/dragend. Do not leave a stale target.
      if (inside) resetTimer = setTimeout(reset, 1000);
      event.dataTransfer.dropEffect = value === 'ready' ? 'copy' : 'none';
    };
    const leave = event => {
      if (phase === 'idle') return;
      if (contains(targetRef.current, event.target)) insideDepth = Math.max(0, insideDepth - 1);
      if (!insideDepth) { reset(); return; }
      if (event.relatedTarget) { if (!contains(targetRef.current, event.relatedTarget)) reset(); return; }
      // Some external drags omit relatedTarget. Check coordinates instead of flickering over children.
      if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= innerWidth || event.clientY >= innerHeight
          || !contains(targetRef.current, document.elementFromPoint(event.clientX, event.clientY))) reset();
    };
    const drop = event => {
      if (!isFileDrag(event.dataTransfer)) return;
      if (event.defaultPrevented) { reset(); return; }
      event.preventDefault();
      reset();
      if (!contains(targetRef.current, event.target)) { latest.current.onNotice('请把图片拖到下方输入框内。'); return; }
      const items = [...(event.dataTransfer.items || [])].filter(item => item.kind === 'file');
      let directoryCount = 0;
      const files = items.length ? items.flatMap(item => {
        if (item.webkitGetAsEntry?.()?.isDirectory) { directoryCount++; return []; }
        const file = item.getAsFile(); return file ? [file] : [];
      }) : [...event.dataTransfer.files];
      if (!files.length && !directoryCount) { latest.current.onNotice('没有读取到图片，请从文件夹重新拖入，或点击回形针选择。'); return; }
      const added = latest.current.onFiles(files, { dropped: true, directoryCount });
      if (added) {
        setAnnouncement(`已添加 ${added} 张参考图，当前共 ${latest.current.referenceCount + added} 张。`);
        latest.current.inputRef.current?.focus({ preventScroll: true });
      }
    };
    const key = event => { if (event.key === 'Escape') reset(); };
    const visibility = () => { if (document.hidden) reset(); };
    const listeners = [['dragenter', over], ['dragover', over], ['dragleave', leave], ['drop', drop], ['dragend', reset], ['blur', reset], ['keydown', key]];
    for (const [name, listener] of listeners) window.addEventListener(name, listener);
    document.addEventListener('visibilitychange', visibility);
    return () => { clearTimeout(resetTimer); for (const [name, listener] of listeners) window.removeEventListener(name, listener); document.removeEventListener('visibilitychange', visibility); };
  }, [targetRef, scope]);
  return { state, announcement };
}
