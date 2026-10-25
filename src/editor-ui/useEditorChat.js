import { useEffect, useRef, useState } from 'react';
import { boundedChatHistory, canApplyReply, operationSummary, readEditorChat, submitEditorChat } from './editor-api.mjs';

const terminal = new Set(['done', 'failed', 'unknown']);
function readSaved(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 300000) return {};
    const value = JSON.parse(raw);
    if (!value || Array.isArray(value) || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value).slice(-8).map(([id, rows]) => [id, Array.isArray(rows) ? rows.filter(row => typeof row?.id === 'string' && typeof row.message === 'string').slice(-12).map(row => ({ ...row, status: ['sending', 'queued', 'running'].includes(row.status) ? 'unknown' : row.status })) : []]));
  } catch { return {}; }
}
const delay = (ms, signal) => new Promise((resolve, reject) => {
  const aborted = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, ms);
  if (signal.aborted) aborted(); else signal.addEventListener('abort', aborted, { once: true });
});

export function useEditorChat({ userId, editor, groupId }) {
  const key = `yingjian-editor-chat:${userId}`;
  const [conversations, setConversations] = useState(() => readSaved(key));
  const records = useRef(conversations);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const mounted = useRef(true);
  const controllers = useRef(new Map());
  const documentId = editor.document?.documentId;
  const entries = conversations[documentId] || [];
  const busy = entries.some(row => ['sending', 'queued', 'running'].includes(row.status));
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controllers.current.forEach(controller => controller.abort()); controllers.current.clear(); };
  }, []);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(conversations)); } catch {} }, [key, conversations]);

  function update(docId, id, value) {
    if (!mounted.current) return;
    const rows = records.current[docId] || [];
    const next = rows.some(row => row.id === id) ? rows.map(row => row.id === id ? { ...row, ...value } : row) : [...rows, { id, ...value }];
    records.current = Object.fromEntries([...Object.entries(records.current).filter(([key]) => key !== docId).slice(-7), [docId, next.slice(-12)]]);
    setConversations(records.current);
  }

  function finish(docId, id, result) {
    if (result.status !== 'done') {
      update(docId, id, { status: result.status === 'unknown' ? 'unknown' : 'failed', error: result.error || '编辑对话未完成。图片保持原样。' });
      return;
    }
    const operations = result.operations || [];
    const summary = operationSummary(operations);
    let status = 'replied', reason = '';
    if (operations.length) {
      const live = editorRef.current;
      if (!canApplyReply(result, live.document, live.hasPendingPreview)) {
        status = 'not-applied'; reason = '你已继续编辑或切换图片，这次调整没有应用。可根据当前画面重新发送要求。';
      } else {
        try {
          live.commitOperations(operations, { actor: 'ai', label: summary || 'AI 调整', documentId: result.documentId, baseRevision: result.baseRevision });
          status = 'applied';
        } catch (error) { status = 'not-applied'; reason = error.message || '这次调整未应用，图片保持原样。'; }
      }
    }
    update(docId, id, { status, reply: result.reply || '已收到回复。', summary, reason, operations });
  }

  async function follow(docId, id, requestId, signal, first) {
    let result = first;
    for (let i = 0; i < 150; i++) {
      if (signal.aborted || !mounted.current) return;
      if (!result) result = await readEditorChat(requestId, signal);
      if (terminal.has(result.status)) { finish(docId, id, result); return; }
      update(docId, id, { status: result.status === 'queued' ? 'queued' : 'running', requestId });
      await delay(1200, signal);
      result = null;
    }
    update(docId, id, { status: 'unknown', error: '回复等待较久，可以查询状态；不会自动重复提交对话。' });
  }

  async function send(message) {
    const live = editorRef.current;
    const docId = live.document?.documentId;
    if (!docId || !groupId || !message.trim() || controllers.current.has(docId)) return false;
    if (live.hasPendingPreview) throw new Error('请先结束当前滑块或裁剪调整。');
    const id = crypto.randomUUID();
    const controller = new AbortController();
    controllers.current.set(docId, controller);
    update(docId, id, { message: message.trim(), status: 'sending', createdAt: Date.now() });
    let requestId = null, submitted = false;
    try {
      const snapshot = await live.getAiSnapshot();
      if (controller.signal.aborted || !mounted.current) return false;
      if (!canApplyReply({ documentId: snapshot.documentId, baseRevision: snapshot.baseRevision }, editorRef.current.document, editorRef.current.hasPendingPreview)) {
        update(docId, id, { status: 'not-applied', reason: '准备预览时图片发生变化，本次未发送。请按最新画面再试。' });
        return false;
      }
      submitted = true;
      const result = await submitEditorChat({ clientRequestId: id, ...snapshot, groupId, message: message.trim(), history: boundedChatHistory(records.current[docId]) }, controller.signal);
      if (!result.requestId) throw new Error('没有收到请求编号，暂时不能确认回复状态。请勿重复发送。');
      requestId = result.requestId;
      update(docId, id, { requestId });
      await follow(docId, id, result.requestId, controller.signal, result);
      return true;
    } catch (error) {
      if (error.name !== 'AbortError') {
        const rejected = !requestId && (!submitted || (error.status >= 400 && error.status < 500));
        update(docId, id, { status: rejected ? 'failed' : 'unknown', requestId: rejected ? requestId : requestId || id,
          error: error.message || '对话连接中断，暂时无法确认结果。',
          reason: !rejected && !requestId ? '连接中断，暂时不能确认是否已收到；可查询状态，不会重复提交对话。' : '' });
      }
      return false;
    } finally { controllers.current.delete(docId); }
  }

  async function refresh(entry) {
    const docId = documentId;
    if (!entry.requestId || controllers.current.has(docId)) return;
    const controller = new AbortController(); controllers.current.set(docId, controller);
    update(docId, entry.id, { status: 'running', error: '' });
    try { await follow(docId, entry.id, entry.requestId, controller.signal); }
    catch (error) { if (error.name !== 'AbortError') update(docId, entry.id, { status: 'unknown', error: error.message }); }
    finally { controllers.current.delete(docId); }
  }
  return { entries, busy, send, refresh };
}
