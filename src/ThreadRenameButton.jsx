import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, LoaderCircle, Pencil, X } from 'lucide-react';
import './thread-rename.css';

function RenameDialog({ thread, onRename, onClose }) {
  const dialog = useRef(null), input = useRef(null), pending = useRef(false), alive = useRef(true);
  const [title, setTitle] = useState(thread.title || ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const clean = title.trim();
  const invalid = !clean || clean.length > 60 || /[\u0000-\u001f\u007f]/.test(clean);
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    dialog.current.showModal(); input.current.focus(); input.current.select();
    return () => { alive.current = false; dialog.current?.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  function close() { if (!pending.current) onClose(); }
  async function save(event) {
    event.preventDefault();
    if (pending.current || invalid || clean === thread.title) return;
    pending.current = true; setBusy(true); setError('');
    try { await onRename(thread.id, clean); if (alive.current) onClose(); }
    catch (issue) { if (alive.current) setError(issue.message || '保存失败，请稍后重试。'); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  function keyboard(event) {
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) { event.preventDefault(); return; }
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    if (!controls.length) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
  }
  return createPortal(<dialog ref={dialog} className="thread-rename-dialog" aria-labelledby="thread-rename-title" onKeyDown={keyboard} onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  }}>
    <button type="button" className="thread-rename-close" aria-label="关闭修改会话名称" disabled={busy} onClick={close}><X size={19} /></button>
    <span className="thread-rename-symbol" aria-hidden="true"><Pencil size={23} /></span>
    <h2 id="thread-rename-title">修改会话名称</h2>
    <form onSubmit={save}>
      <label htmlFor="thread-name-input">会话名称</label>
      <input ref={input} id="thread-name-input" value={title} maxLength={60} disabled={busy} autoComplete="off" onChange={event => { setTitle(event.target.value); setError(''); }} aria-describedby="thread-name-hint" />
      <div id="thread-name-hint"><span>保存后会同步到这段会话</span><span>{title.length}/60</span></div>
      {error && <p className="thread-rename-error" role="alert">{error}</p>}
      <div className="thread-rename-actions"><button type="button" disabled={busy} onClick={close}>取消</button><button type="submit" className="thread-rename-save" disabled={busy || invalid || clean === thread.title}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{busy ? '正在保存…' : '保存名称'}</button></div>
    </form>
  </dialog>, document.body);
}

export default function ThreadRenameButton({ thread, onRename }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="thread-rename-trigger" title="修改会话名称" aria-label={`修改会话名称：${thread.title || '未命名创作'}`} onClick={() => setOpen(true)}><Pencil size={16} /></button>{open && <RenameDialog thread={thread} onRename={onRename} onClose={() => setOpen(false)} />}</>;
}
