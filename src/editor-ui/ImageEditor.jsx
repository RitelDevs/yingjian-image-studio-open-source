import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowDownToLine, ChevronDown, Columns2, Images, ImagePlus, LoaderCircle, Maximize, Redo2, RotateCcw, SlidersHorizontal, Sparkles, Undo2, Upload, X } from 'lucide-react';
import { useImageEditor } from '../editor-core/useImageEditor.js';
import { AdjustmentsPanel, CropControls } from './AdjustmentsPanel.jsx';
import EditorChatPanel from './EditorChatPanel.jsx';
import ConversationImagePicker from './ConversationImagePicker.jsx';
import { conversationImageUrl } from './conversation-images.mjs';
import './editor.css';
import EditorCanvas from './EditorCanvas.jsx';
import { readEditorOrigin, saveEditorOrigin } from './editor-origin.mjs';
import { REFERENCE_BYTES } from '../reference-files.js';

const fullCrop = { x: 0, y: 0, width: 1, height: 1 };
export default function ImageEditor({ user, groups, defaultGroupId, demo, active = true, source, onBack, onReturnReference }) {
  const editor = useImageEditor({ userId: user.id });
  const current = useRef(editor); current.current = editor;
  const [issue, setIssue] = useState('');
  const [feedback, setFeedback] = useState('');
  const [tab, setTab] = useState('adjust');
  const [compare, setCompare] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [format, setFormat] = useState('png');
  const [exporting, setExporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [cropMode, setCropMode] = useState(false);
  const [crop, setCrop] = useState(fullCrop);
  const [origin, setOrigin] = useState(null);
  const [returning, setReturning] = useState(false);
  const returnLock = useRef(false), canvas = useRef(null), alive = useRef(active);
  alive.current = active;
  const input = useRef(null), menu = useRef(null), heading = useRef(null);
  const sourceApplied = useRef(null), sourceFetch = useRef(null), dragDepth = useRef(0);
  const state = editor.document;
  const disabled = !state || editor.restoring || editor.busy || returning;
  const imageOrigin = origin?.documentId === state?.documentId ? origin : readEditorOrigin(user.id, state?.documentId);
  const returnLabel = imageOrigin?.threadId ? '返回原会话，作为参考图' : '新建会话，作为参考图';
  function rememberOrigin(document, source) { if (document) setOrigin(saveEditorOrigin(user.id, document.documentId, source)); }
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => { if (!active) { setHistoryOpen(false); sourceFetch.current?.abort(); } }, [active]);
  useEffect(() => () => sourceFetch.current?.abort(), []);
  useEffect(() => { if (active) { heading.current?.focus({ preventScroll: true }); setCompare(false); } }, [active]);
  useEffect(() => {
    if (!exportOpen) return;
    const close = event => { if (!menu.current?.contains(event.target)) setExportOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [exportOpen]);
  useEffect(() => {
    if (!active || !source || editor.restoring || sourceApplied.current === source.requestId) return;
    sourceApplied.current = source.requestId;
    setIssue(''); setCropMode(false); setCompare(false);
    sourceFetch.current?.abort();
    const controller = new AbortController(); sourceFetch.current = controller;
    let completed = false;
    void fetch(source.url, { credentials: 'same-origin', signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('这张图片已过期或无法读取，请重新上传。');
      return response.blob();
    }).then(blob => {
      if (controller.signal.aborted) return;
      return current.current.loadImage(blob, { name: source.name || '生成作品' }).then(document => { rememberOrigin(document, source); });
    }).catch(error => { if (error.name !== 'AbortError' && !controller.signal.aborted) setIssue(error.message); }).finally(() => { completed = true; });
    return () => {
      controller.abort();
      if (!completed && sourceApplied.current === source.requestId) sourceApplied.current = null;
    };
  }, [active, source, editor.restoring]);
  useEffect(() => {
    if (!active || historyOpen) return;
    const keydown = event => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
      if (event.key === 'Escape') {
        if (cropMode) { editor.cancelPreview(); setCropMode(false); }
        setExportOpen(false); setCompare(false);
      }
      if (typing || cropMode || !state) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        try { event.shiftKey ? editor.redo() : editor.undo(); } catch (error) { setIssue(error.message); }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [active, cropMode, state, editor, historyOpen]);
  useEffect(() => { if (!feedback) return; const timer = setTimeout(() => setFeedback(''), 4500); return () => clearTimeout(timer); }, [feedback]);

  async function loadFile(file) {
    if (!file || returnLock.current) return;
    sourceFetch.current?.abort();
    setIssue(''); setFeedback(''); editor.clearError?.(); setCropMode(false); setCompare(false);
    try { rememberOrigin(await editor.loadImage(file, { name: file.name }), null); }
    catch (error) { setIssue(error.message); }
  }
  async function loadConversationImage(image) {
    if (returnLock.current) throw new Error('正在返回会话，请稍候。');
    const url = conversationImageUrl(image.id);
    if (!url) throw new Error('图片记录无效，请重新选择。');
    sourceFetch.current?.abort();
    const controller = new AbortController(); sourceFetch.current = controller;
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '登录状态已失效，请重新登录。' : '这张图片已过期或被删除，请选择其他图片。');
    const blob = await response.blob();
    if (controller.signal.aborted) throw new DOMException('已取消导入', 'AbortError');
    const result = await current.current.loadImage(blob, { name: image.name });
    if (controller.signal.aborted) return;
    rememberOrigin(result, image);
    setIssue(''); setFeedback('已从会话导入图片，原图保留。'); setCropMode(false); setCompare(false);
    return result;
  }
  function edit(action) { setIssue(''); editor.clearError?.(); try { action(); } catch (error) { setIssue(error.message); } }
  function toggleCrop() {
    if (cropMode) { editor.cancelPreview(); setCropMode(false); return; }
    setCrop(state.crop || { x: .1, y: .1, width: .8, height: .8 });
    edit(() => { editor.previewOperations([{ type: 'setCrop', crop: null }]); setCropMode(true); });
  }
  function applyCrop() {
    edit(() => { editor.commitOperations([{ type: 'setCrop', crop }], { actor: 'manual', label: '裁剪图片' }); setCropMode(false); });
  }
  async function returnReference() {
    if (returnLock.current || disabled || cropMode || !onReturnReference) return;
    returnLock.current = true; setReturning(true); setIssue('');
    const ticket = { documentId: state.documentId, revision: state.revision };
    const isCurrent = () => alive.current && current.current.document?.documentId === ticket.documentId && current.current.document?.revision === ticket.revision;
    try {
      const blob = await editor.exportImage({ format: 'webp', quality: .95 });
      if (!isCurrent()) throw new Error('画面已切换，请重新选择要带回的图片。');
      if (blob.size > REFERENCE_BYTES) throw new Error('编辑后的图片超过 8 MB，请先裁剪或导出压缩后再上传。');
      const name = `${state.name.replace(/\.[^.]+$/, '')}-编辑-v${state.revision + 1}.webp`;
      await onReturnReference(new File([blob], name, { type: 'image/webp' }), { threadId: imageOrigin?.threadId, operationId: `${ticket.documentId}:${ticket.revision}`, isCurrent });
    } catch (error) { if (alive.current) setIssue(error.message || '图片暂未带回，请稍后重试。'); }
    finally { returnLock.current = false; setReturning(false); }
  }
  function focusChat() {
    setTab('chat');
    requestAnimationFrame(() => document.querySelector('.image-editor:not([hidden]) .ed-chat-input textarea')?.focus({ preventScroll: true }));
  }
  async function save() {
    if (exporting || disabled || cropMode) return;
    setExporting(true); setIssue('');
    try {
      const blob = await editor.exportImage({ format, quality: .92 });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `${(state.name || '映间作品').replace(/\.[^.]+$/, '')}-编辑.${format === 'jpeg' ? 'jpg' : 'png'}`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setExportOpen(false); setFeedback('图片已导出，原图仍然保留。');
    } catch (error) { setIssue(error.message || '导出失败，请稍后重试。'); }
    finally { setExporting(false); }
  }
  const isFileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files');
  const banner = issue || editor.error || editor.notice || feedback;
  return <section className="image-editor" data-panel={tab} hidden={!active} aria-label="图片编辑台" onDragEnter={event => { if (!isFileDrag(event)) return; event.preventDefault(); dragDepth.current++; setDragging(true); }} onDragOver={event => { if (isFileDrag(event)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }} onDragLeave={event => { if (isFileDrag(event) && --dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false); } }} onDrop={event => { if (!isFileDrag(event)) return; event.preventDefault(); event.stopPropagation(); dragDepth.current = 0; setDragging(false); if (event.dataTransfer.files.length > 1) setFeedback('一次编辑一张图片，已选择第一张。'); void loadFile(event.dataTransfer.files[0]); }}>
    <input ref={input} aria-label="导入编辑图片" type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => { void loadFile(event.target.files?.[0]); event.target.value = ''; }} />
    <header className="ed-header"><div className="ed-header-start"><button className="ed-back" disabled={returning} onClick={onBack} aria-label="返回创作对话" title="返回创作对话"><ArrowLeft size={19} /></button><div className="ed-title"><h1 ref={heading} tabIndex="-1">图片编辑台</h1><span>{state ? state.name : '让每一张图，都更接近你的想法'}</span></div></div><div className="ed-header-actions">
      <div className="ed-history-actions"><button className="ed-tool" aria-label="撤销编辑" title="撤销 · Ctrl Z" disabled={!editor.canUndo || cropMode || editor.busy} onClick={() => edit(editor.undo)}><Undo2 size={18} /></button><button className="ed-tool" aria-label="重做编辑" title="重做 · Ctrl Shift Z" disabled={!editor.canRedo || cropMode || editor.busy} onClick={() => edit(editor.redo)}><Redo2 size={18} /></button></div>
      <button className={`ed-button ed-compare ${compare ? 'is-active' : ''}`} disabled={disabled || cropMode} aria-label={compare ? '退出对比' : '对比原图'} aria-pressed={compare} onClick={() => setCompare(value => !value)}><Columns2 size={16} /><span>{compare ? '退出对比' : '对比原图'}</span></button>
      <button className="ed-tool ed-reset" aria-label="恢复原图" title="恢复原图（可撤销）" disabled={disabled || cropMode} onClick={() => edit(() => editor.commitOperations([{ type: 'reset' }], { actor: 'manual', label: '恢复原图' }))}><RotateCcw size={17} /></button>
      <div className="ed-export" ref={menu}><button className="ed-primary" aria-expanded={exportOpen} disabled={disabled || cropMode} onClick={() => setExportOpen(value => !value)}><ArrowDownToLine size={16} /><span>导出</span><ChevronDown size={12} /></button>{exportOpen && <div className="ed-export-menu"><h3>导出当前画面</h3><label>图片格式<select aria-label="导出图片格式" value={format} onChange={event => setFormat(event.target.value)}><option value="png">PNG · 保留透明</option><option value="jpeg">JPEG · 较小体积</option></select></label><p>保留原始分辨率{state?.crop ? '，按选区裁剪' : ''}。{format === 'jpeg' ? '透明区域使用白色背景。' : ''}</p><button className="ed-primary" onClick={() => void save()} disabled={exporting}>{exporting ? <LoaderCircle className="spin" size={14} /> : <ArrowDownToLine size={14} />}{exporting ? '正在导出…' : '下载图片'}</button></div>}</div>
    </div></header>
    {banner && <div className={`ed-banner ${(issue || editor.error) ? 'is-error' : ''}`} role="status"><span>{banner}</span>{banner && <button aria-label="关闭编辑提示" onClick={() => { setIssue(''); setFeedback(''); editor.clearError?.(); editor.clearNotice?.(); }}><X size={14} /></button>}</div>}
    <div className="ed-body">
      <AdjustmentsPanel editor={editor} onIssue={setIssue} cropMode={cropMode} onCropToggle={toggleCrop} />
      <main className="ed-canvas-panel" aria-label="图片编辑画布"><div className="ed-canvas-toolbar"><span className="ed-canvas-mode"><span />{compare ? '左右对比' : cropMode ? '裁剪画幅' : '实时预览'}</span><div className="ed-import-actions"><button className="ed-text-button" disabled={editor.restoring || editor.busy || returning} onClick={() => setHistoryOpen(true)}><Images size={14} />从会话选择</button><button className="ed-text-button" disabled={editor.restoring || editor.busy || returning} onClick={() => input.current?.click()}><ImagePlus size={14} />{state ? '更换图片' : '导入图片'}</button></div></div>
        <div className={`ed-canvas-stage ${cropMode ? 'is-cropping' : ''}`}>
          {!state ? <div className="ed-import-empty"><span className="ed-import-symbol"><ImagePlus size={37} strokeWidth={1.3} /></span><p className="ed-empty-eyebrow">一点调整，一种新感觉</p><h2>把图片放到这里</h2><p>手动调色，或者与 AI 一起编辑。<br />每次调整都保留退路。</p><div className="ed-import-choices"><button className="ed-primary" disabled={editor.restoring || editor.busy || returning} onClick={() => setHistoryOpen(true)}><Images size={16} />从会话选择</button><button className="ed-button" disabled={editor.restoring || editor.busy || returning} onClick={() => input.current?.click()}><Upload size={16} />选择图片</button></div><small>也可拖入 PNG、JPEG、WebP · 单张 8 MB 内</small></div> : <EditorCanvas key={state.documentId} ref={canvas} document={state} originalUrl={editor.originalUrl} previewUrl={editor.previewUrl} compare={compare} cropMode={cropMode} crop={crop} onCropChange={setCrop} onCropToggle={toggleCrop} onChat={focusChat} onReturn={returnReference} returnLabel={returnLabel} returning={returning} disabled={disabled} />}
          {(editor.restoring || editor.busy) && <div className="ed-canvas-loading" role="status"><LoaderCircle className="spin" size={18} />{editor.restoring ? '恢复上次的编辑…' : '正在处理图片…'}</div>}
        </div>
        {cropMode && <CropControls value={crop} onChange={setCrop} onApply={applyCrop} onCancel={toggleCrop} />}
        <footer className="ed-canvas-footer"><span>{state ? `${state.width} × ${state.height} px` : '原图始终保留'}{state?.crop ? ' · 已裁剪' : ''}</span><button type="button" className="ed-fit-control" disabled={!state} onClick={() => canvas.current?.fit()}><Maximize size={12} />适应画布</button><span>{state ? `版本 ${state.revision}` : '编辑保存在此浏览器'}</span></footer>
      </main>
      <EditorChatPanel editor={editor} userId={user.id} groups={groups} defaultGroupId={defaultGroupId} demo={demo} cropMode={cropMode} active={active} />
    </div>
    <nav className="ed-mobile-tabs" aria-label="编辑台面板"><button aria-pressed={tab === 'adjust'} onClick={() => setTab('adjust')}><SlidersHorizontal size={16} />调色与构图</button><button aria-pressed={tab === 'chat'} onClick={() => setTab('chat')}><Sparkles size={16} />AI 会话</button></nav>
    {historyOpen && active && <ConversationImagePicker key={user.id} userId={user.id} preferredThreadId={imageOrigin?.threadId} onSelect={loadConversationImage} onClose={() => setHistoryOpen(false)} />}
    {dragging && <div className="ed-drop-overlay"><span><Upload size={32} /><strong>松开，开始编辑这张图</strong><small>PNG、JPEG、WebP · 单张 8 MB 内</small></span></div>}
  </section>;
}
