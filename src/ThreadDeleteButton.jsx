import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, Trash2, X } from 'lucide-react';
import './thread-delete.css';

function DeleteConfirmation({ thread, onRemove, onClose }) {
  const dialog = useRef(null), cancelButton = useRef(null), pending = useRef(false), mounted = useRef(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement;
    dialog.current.showModal(); cancelButton.current.focus();
    return () => {
      mounted.current = false; dialog.current?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      else document.querySelector('.sidebar-action.new-thread')?.focus({ preventScroll: true });
    };
  }, []);
  function dismiss() { if (!pending.current) onClose(); }
  async function confirm() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const removed = await onRemove(thread.id, { confirmed: true });
      if (mounted.current) {
        if (removed === false) setError('这段会话暂时无法删除，请重试。');
        else onClose();
      }
    } catch (issue) { if (mounted.current) setError(issue.message || '删除失败，请稍后重试。'); }
    finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  function keyboard(event) {
    if (event.key !== 'Tab') return;
    const items = [...dialog.current.querySelectorAll('button:not(:disabled)')];
    if (!items.length) { event.preventDefault(); return; }
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
  }
  return createPortal(<dialog ref={dialog} className="thread-delete-dialog" aria-labelledby="thread-delete-title" aria-describedby="thread-delete-description" onKeyDown={keyboard} onCancel={event => { event.preventDefault(); dismiss(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss();
  }}>
    <button type="button" className="thread-delete-close" aria-label="关闭删除确认" disabled={busy} onClick={dismiss}><X size={19} /></button>
    <span className="thread-delete-symbol" aria-hidden="true"><Trash2 size={24} /></span>
    <h2 id="thread-delete-title">删除这段会话？</h2>
    <p className="thread-delete-name">{thread.title || '未命名创作'}</p>
    <p id="thread-delete-description">会话中的文字、参考图和生成图片将一并删除，且无法恢复。</p>
    {error && <p className="thread-delete-error" role="alert">{error}</p>}
    <div className="thread-delete-actions"><button ref={cancelButton} type="button" className="thread-delete-cancel" disabled={busy} onClick={dismiss}>取消</button><button type="button" className="thread-delete-confirm" disabled={busy} onClick={() => void confirm()}>{busy ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}{busy ? '正在删除…' : '确认删除'}</button></div>
  </dialog>, document.body);
}

export default function ThreadDeleteButton({ thread, onRemove }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="thread-trash-trigger" title="删除会话" aria-label={`删除会话：${thread.title || '未命名创作'}`} onClick={() => setOpen(true)}><Trash2 size={16} /></button>{open && <DeleteConfirmation thread={thread} onRemove={onRemove} onClose={() => setOpen(false)} />}</>;
}
