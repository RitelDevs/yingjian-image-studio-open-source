import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ImagePlus, Images, LoaderCircle, MessageSquare, RefreshCw, Search, X } from 'lucide-react';
import { conversationImages } from './conversation-images.mjs';
import './conversation-image-picker.css';

async function readHistory(path, signal) {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', signal });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('登录状态已失效，请重新登录后选择会话图片。');
    if (response.status === 404) throw new Error('这段会话已删除或过期，请选择其他会话。');
    throw new Error('暂时无法读取会话，请稍后重试。');
  }
  return response.json();
}
const dateLabel = time => time ? new Date(time).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }) : '';

export default function ConversationImagePicker({ userId, preferredThreadId, onSelect, onClose }) {
  const dialog = useRef(null), search = useRef(null);
  const alive = useRef(true), selecting = useRef(false);
  const [threads, setThreads] = useState([]), [listLoading, setListLoading] = useState(true), [listError, setListError] = useState('');
  const [threadId, setThreadId] = useState(null), [query, setQuery] = useState(''), [kind, setKind] = useState('all');
  const [content, setContent] = useState({ id: null, images: [], loading: false, error: '' });
  const [listRetry, setListRetry] = useState(0), [imageRetry, setImageRetry] = useState(0);
  const [imageStates, setImageStates] = useState({}), [selectedId, setSelectedId] = useState(null);
  const [importing, setImporting] = useState(false), [importError, setImportError] = useState('');
  const readyImages = content.id === threadId ? content.images : [];
  const selected = readyImages.find(image => image.id === selectedId);
  const visibleThreads = threads.filter(thread => thread.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const visibleImages = readyImages.filter(image => kind === 'all' || image.kind === kind);
  const currentThread = threads.find(thread => thread.id === threadId);

  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    dialog.current.showModal(); search.current?.focus();
    return () => {
      alive.current = false;
      dialog.current?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true); setListError('');
    void readHistory('/api/threads', controller.signal).then(data => {
      if (controller.signal.aborted) return;
      const list = (data.threads || []).filter(thread => /^[a-f0-9-]{36}$/i.test(thread.id)).map(thread => ({ ...thread, title: thread.title || '未命名创作' }));
      setThreads(list);
      let remembered;
      try { remembered = sessionStorage.getItem(`studio-active-thread:${userId}`); } catch { /* Storage is optional. */ }
      setThreadId(previous => [previous, preferredThreadId, remembered].find(id => list.some(thread => thread.id === id)) || list[0]?.id || null);
    }).catch(error => { if (!controller.signal.aborted) setListError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setListLoading(false); });
    return () => controller.abort();
  }, [userId, preferredThreadId, listRetry]);
  useEffect(() => {
    setSelectedId(null); setImageStates({}); setImportError('');
    if (!threadId) { setContent({ id: null, images: [], loading: false, error: '' }); return; }
    const controller = new AbortController();
    setContent({ id: threadId, images: [], loading: true, error: '' });
    void readHistory(`/api/threads/${threadId}`, controller.signal).then(data => {
      if (!controller.signal.aborted) setContent({ id: threadId, images: conversationImages(data.messages), loading: false, error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setContent({ id: threadId, images: [], loading: false, error: error.message });
    });
    return () => controller.abort();
  }, [threadId, imageRetry]);

  function close() { if (!selecting.current) onClose(); }
  function containKeyboard(event) {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(element => element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); dialog.current.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  async function importSelected() {
    if (!selected || imageStates[selected.id] !== 'ready' || selecting.current) return;
    selecting.current = true; setImporting(true); setImportError('');
    try {
      await onSelect({ ...selected, threadId, name: `${currentThread?.title || '会话图片'} · ${selected.name}` });
      if (alive.current) onClose();
    } catch (error) { if (alive.current) setImportError(error.message || '图片无法导入，请重试或选择其他图片。'); }
    finally { selecting.current = false; if (alive.current) setImporting(false); }
  }
  const loading = content.loading || content.id !== threadId;
  return createPortal(<dialog ref={dialog} tabIndex={-1} onKeyDown={containKeyboard} className="conversation-image-picker" aria-labelledby="conversation-image-title" aria-describedby="conversation-image-help" onCancel={event => { event.preventDefault(); close(); }} onClick={event => {
    if (event.target !== event.currentTarget) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
  }} onDragOver={event => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'none'; }} onDrop={event => { event.preventDefault(); event.stopPropagation(); }}>
    <header className="cip-header"><div><span className="cip-eyebrow"><Images size={16} />你的图片</span><h2 id="conversation-image-title">从会话中选择图片</h2><p id="conversation-image-help">选择生成图或参考图，继续在工作台编辑。</p></div><button type="button" className="cip-icon-button" aria-label="关闭会话图片选择" disabled={importing} onClick={close}><X size={20} /></button></header>
    <div className="cip-body">
      <aside className="cip-history"><label className="cip-search"><Search size={16} /><input ref={search} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索会话" aria-label="搜索会话图片记录" disabled={importing} /></label>
        <div className="cip-thread-list" aria-label="可选会话" aria-busy={listLoading}>
          {listLoading ? <p className="cip-state"><LoaderCircle className="spin" size={18} />正在读取会话…</p> : listError ? <div className="cip-state" role="alert"><p>{listError}</p><button type="button" onClick={() => setListRetry(value => value + 1)}><RefreshCw size={14} />重新加载</button></div> : !threads.length ? <p className="cip-state">还没有创作记录。<br />生成图片或上传参考图后，会显示在这里。</p> : !visibleThreads.length ? <p className="cip-state">没有匹配的会话</p> : visibleThreads.map(thread => <button type="button" className="cip-thread" key={thread.id} aria-pressed={thread.id === threadId} disabled={importing} onClick={() => setThreadId(thread.id)}><MessageSquare size={16} /><span><strong>{thread.title}</strong><small>{dateLabel(thread.updatedAt)}</small></span></button>)}
        </div>
      </aside>
      <section className="cip-library" aria-label="会话图片" aria-busy={loading}>
        <div className="cip-library-head"><h3>{currentThread?.title || '选择一段会话'}</h3><div className="cip-filters" role="group" aria-label="会话图片类型">{[['all', '全部'], ['generated', '生成图'], ['reference', '参考图']].map(([value, label]) => <button type="button" key={value} aria-pressed={kind === value} disabled={importing} onClick={() => { setKind(value); setSelectedId(null); setImportError(''); }}>{label}</button>)}</div></div>
        {loading && threadId ? <div className="cip-state cip-center" role="status"><LoaderCircle className="spin" size={24} /><span>正在加载图片…</span></div> : content.error ? <div className="cip-state cip-center" role="alert"><p>{content.error}</p><button type="button" onClick={() => setImageRetry(value => value + 1)}><RefreshCw size={14} />重新加载图片</button></div> : !visibleImages.length ? <div className="cip-state cip-center"><Images size={30} /><p>{threadId ? (readyImages.length ? '这段会话还没有这类图片' : '这段会话还没有可选图片') : '选择会话后，这里的图片就能继续编辑'}</p></div> : <div className="cip-image-grid">{visibleImages.map(image => <button type="button" className="cip-image" key={`${imageRetry}:${image.id}`} aria-label={`选择${image.name}：${image.prompt || '会话图片'}`} aria-pressed={selectedId === image.id} disabled={importing || imageStates[image.id] !== 'ready'} onClick={() => { setSelectedId(image.id); setImportError(''); }}>
          <div className="cip-thumbnail"><img src={image.url} alt={image.name} loading="lazy" onLoad={() => setImageStates(values => ({ ...values, [image.id]: 'ready' }))} onError={() => { setImageStates(values => ({ ...values, [image.id]: 'failed' })); }} />{imageStates[image.id] === 'failed' && <span className="cip-image-failed">图片已过期或不可用</span>}<span className="cip-image-kind">{image.label}</span>{selectedId === image.id && <span className="cip-selected-check"><Check size={17} /></span>}</div><strong>{image.prompt || image.name}</strong><small>{dateLabel(image.createdAt)}</small>
        </button>)}</div>}
      </section>
    </div>
    <footer className="cip-footer"><div><span>{importing ? '正在放入工作台…' : selected ? `已选 1 张 · ${selected.label}` : '选择 1 张图片'}</span>{importError ? <p role="alert">{importError}</p> : <small>只显示当前账号的会话图片 · 导入不触发生图</small>}</div><button type="button" className="cip-import" disabled={!selected || imageStates[selected.id] !== 'ready' || importing} onClick={() => void importSelected()}>{importing ? <LoaderCircle className="spin" size={17} /> : <ImagePlus size={17} />}放入工作台</button></footer>
  </dialog>, document.body);
}
