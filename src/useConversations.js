import { useCallback, useEffect, useRef, useState } from 'react';
import { draftAspectRatio, resolveImageGeometry } from '../shared/image-geometry.mjs';
import { selectReferenceFiles } from './reference-files.js';
import { STYLE_CATALOG } from '../shared/style-catalog.mjs';

const emptyKey = 'new';
const pending = item => ['queued', 'running'].includes(item.status);
const settled = item => !pending(item);

export function useConversations({ call, userId, defaultGroupId, fileToDataUrl }) {
  const storageKey = `studio-active-thread:${userId}`;
  const revocationKey = `studio-style-revocations:${userId}`;
  const pendingStyleRevocations = useRef(null);
  if (!pendingStyleRevocations.current) {
    try { const saved = JSON.parse(sessionStorage.getItem(revocationKey) || '[]'); pendingStyleRevocations.current = new Set(Array.isArray(saved) ? saved.filter(id => /^[a-f0-9-]{36}$/i.test(id)) : []); }
    catch { pendingStyleRevocations.current = new Set(); }
  }
  const withdrawnStyles = useRef(new Set(pendingStyleRevocations.current));
  function restoreStyleDraft(id) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`${storageKey}:style:${id || emptyKey}`) || '{}');
      const selected = saved.selectedStyle;
      if (selected && (!STYLE_CATALOG.some(style => style.id === selected.id && style.version === selected.version) || !/^[a-f0-9-]{36}$/i.test(selected.selectionId))) return { selectedStyle: null, styleTouched: true, useContext: false };
      return { selectedStyle: selected || null, styleTouched: saved.styleTouched === true, styleTitle: typeof saved.styleTitle === 'string' ? saved.styleTitle : '', styleOptimization: saved.styleOptimization === 'template' ? 'template' : 'professional', ...(saved.useContext === false ? { useContext: false } : {}) };
    } catch { return {}; }
  }
  const [activeId, setActiveId] = useState(() => {
    try { const id = sessionStorage.getItem(storageKey); return /^[a-f0-9-]{36}$/i.test(id || '') ? id : null; } catch { return null; }
  });
  const active = useRef(activeId);
  const selection = useRef(0);
  const [threads, setThreads] = useState([]);
  const [entries, setEntries] = useState({});
  const cache = useRef({});
  const reads = useRef(new Map());
  const listRead = useRef(0);
  const live = useRef(true);
  const localUrls = useRef(new Set());
  const creation = useRef(null);
  const editorReturnTargets = useRef(new Map());
  const confirmations = useRef(new Set());
  const [confirming, setConfirming] = useState({});
  const [creating, setCreating] = useState(false);

  const get = useCallback(id => {
    const key = id || emptyKey;
    if (!cache.current[key]) cache.current[key] = {
      messages: null, loading: false, error: '', notice: '', sending: false,
      draft: { prompt: '', refs: [], size: '2K', aspectRatio: 'auto', ratioWidth: '16', ratioHeight: '9', count: 1, groupId: defaultGroupId, useContext: true, contextParentId: undefined, requestId: crypto.randomUUID(), selectedStyle: null, styleTouched: false, styleTitle: '', styleOptimization: 'professional', ...restoreStyleDraft(id) }
    };
    return cache.current[key];
  }, [defaultGroupId, storageKey]);
  const patch = useCallback((id, values) => {
    const key = id || emptyKey;
    cache.current = { ...cache.current, [key]: { ...get(id), ...values } };
    if (values.draft) {
      const { selectedStyle, styleTouched, styleTitle, styleOptimization, useContext } = values.draft;
      try { sessionStorage.setItem(`${storageKey}:style:${key}`, JSON.stringify({ selectedStyle, styleTouched, styleTitle, styleOptimization, useContext })); } catch {}
    }
    if (live.current) setEntries(cache.current);
  }, [get, storageKey]);
  const invalidate = useCallback(id => {
    const version = (reads.current.get(id) || 0) + 1;
    reads.current.set(id, version);
    return version;
  }, []);
  const releaseRefs = useCallback(refs => {
    for (const ref of refs) if (ref.localUrl && localUrls.current.delete(ref.objectUrl)) URL.revokeObjectURL(ref.objectUrl);
  }, []);
  const choose = useCallback(id => {
    active.current = id;
    selection.current++;
    setActiveId(id);
    try { if (id) sessionStorage.setItem(storageKey, id); else sessionStorage.removeItem(storageKey); } catch {}
  }, [storageKey]);
  const loadThreads = useCallback(async () => {
    const version = ++listRead.current;
    const response = await call('/api/threads');
    if (live.current && version === listRead.current) setThreads(response.threads);
  }, [call]);
  const loadThread = useCallback(async id => {
    const version = invalidate(id);
    patch(id, { loading: true, error: '' });
    try {
      const response = await call(`/api/threads/${id}`);
      if (live.current && reads.current.get(id) === version) {
        const currentDraft = get(id).draft;
        let restored;
        const last = response.messages.at(-1);
        if (!currentDraft.styleTouched && last?.proposal?.style && ['ready', 'confirmed'].includes(last.proposal.state)) {
          const style = STYLE_CATALOG.find(style => style.id === last.proposal.style.id && style.version === last.proposal.style.version);
          if (style) restored = { ...currentDraft, selectedStyle: { id: style.id, name: style.name, version: style.version, selectionId: last.proposal.styleSelectionId || last.id }, styleTouched: true, styleTitle: last.proposal.styleInput?.title || '', styleOptimization: last.proposal.optimization?.mode || 'template' };
        }
        if (currentDraft.selectedStyle && response.messages.some(item => item.proposal?.state === 'revoked' && (item.proposal.styleSelectionId || item.id) === currentDraft.selectedStyle.selectionId)) {
          restored = { ...currentDraft, selectedStyle: null, styleTouched: true, useContext: false, contextParentId: undefined, styleTitle: '' };
        }
        patch(id, { messages: response.messages, loading: false, error: '', ...(restored ? { draft: restored } : {}) });
      }
    } catch (error) {
      if (live.current && reads.current.get(id) === version) patch(id, { loading: false, error: error.message });
    }
  }, [call, get, invalidate, patch]);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      listRead.current++;
      for (const id of reads.current.keys()) invalidate(id);
      localUrls.current.forEach(url => URL.revokeObjectURL(url));
      localUrls.current.clear();
    };
  }, [invalidate]);
  useEffect(() => {
    void loadThreads().catch(() => { if (live.current) patch(active.current, { notice: '创作列表暂时加载失败，请稍后刷新。' }); });
  }, [loadThreads, patch]);
  useEffect(() => { if (activeId) void loadThread(activeId); }, [activeId, loadThread]);
  useEffect(() => {
    const refresh = () => {
      const ids = Object.entries(cache.current).filter(([id, entry]) => id !== emptyKey && entry.messages?.some(pending)).map(([id]) => id);
      for (const id of ids) if (!get(id).loading) void loadThread(id);
      if (ids.length) void loadThreads().catch(() => {});
    };
    const timer = setInterval(refresh, 3000);
    const resume = () => { if (document.visibilityState === 'visible') { if (active.current) void loadThread(active.current); void loadThreads().catch(() => {}); } };
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { clearInterval(timer); window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [get, loadThread, loadThreads]);

  const editDraft = useCallback(values => {
    const id = active.current, previous = get(id).draft;
    patch(id, { draft: { ...previous, ...values, requestId: crypto.randomUUID() } });
  }, [get, patch]);
  const setNotice = useCallback(notice => patch(active.current, { notice }), [patch]);
  const create = useCallback(async () => {
    if (creation.current) return creation.current;
    const source = active.current, chosen = selection.current;
    setCreating(true);
    creation.current = (async () => {
      try {
        const { thread } = await call('/api/threads', { method: 'POST', body: '{}' });
        listRead.current++;
        // New conversations enter the list immediately; an older list response cannot remove them.
        setThreads(current => [thread, ...current.filter(item => item.id !== thread.id)]);
        if (!source) {
          patch(thread.id, { ...get(null), messages: [] });
          delete cache.current[emptyKey];
          try { sessionStorage.removeItem(`${storageKey}:style:${emptyKey}`); } catch {}
        } else patch(thread.id, { messages: [] });
        if (selection.current === chosen && active.current === source) choose(thread.id);
        return thread.id;
      } catch (error) { patch(source, { notice: error.message }); return null; }
      finally { creation.current = null; if (live.current) setCreating(false); }
    })();
    return creation.current;
  }, [call, choose, get, patch, storageKey]);
  const attachEditorReference = useCallback(async (file, { threadId, operationId, isCurrent = () => true } = {}) => {
    const initial = selectReferenceFiles([file], []);
    if (!initial.accepted.length) throw new Error(initial.notice || '图片无法用作参考图。');
    if (!isCurrent()) return null;
    let target = threadId || editorReturnTargets.current.get(operationId);
    if (target) {
      if (!/^[a-f0-9-]{36}$/i.test(target)) throw new Error('来源会话无效，请重新从会话选择图片。');
      // Use the ordinary owner-scoped endpoint; local provenance is never authorization.
      const response = await call(`/api/threads/${target}`);
      if (response.thread?.id !== target) throw new Error('来源会话已不可用，图片仍保留在编辑台。');
    } else {
      const { thread } = await call('/api/threads', { method: 'POST', body: '{}' });
      if (!thread?.id) throw new Error('新会话未创建成功，请稍后重试。');
      target = thread.id;
      if (operationId) editorReturnTargets.current.set(operationId, target);
      listRead.current++;
      setThreads(current => [thread, ...current.filter(item => item.id !== target)]);
      patch(target, { messages: [] });
    }
    if (!isCurrent() || !live.current) return null;
    const previous = get(target).draft;
    if (!previous.refs.some(item => operationId && item.editorOperationId === operationId)) {
      const { accepted, notice } = selectReferenceFiles([file], previous.refs);
      if (!accepted.length) throw new Error(notice || '参考图未添加，请先清理会话中的参考图片。');
      const objectUrl = URL.createObjectURL(accepted[0]); localUrls.current.add(objectUrl);
      patch(target, { draft: { ...previous, contextParentId: undefined, requestId: crypto.randomUUID(), refs: [...previous.refs, { file: accepted[0], objectUrl, localUrl: true, name: accepted[0].name, editorOperationId: operationId }] }, notice: '已带入编辑后的参考图，可继续描述想要的画面。' });
    }
    return target;
  }, [call, get, patch]);
  const rename = useCallback(async (id, title) => {
    // Ignore list responses captured before this save, including ones racing with it.
    listRead.current++;
    const { thread } = await call(`/api/threads/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) });
    if (!thread || thread.id !== id) throw new Error('会话名称未保存，请重试。');
    listRead.current++;
    if (live.current) setThreads(current => current.map(item => item.id === id ? { ...item, ...thread } : item));
    return thread;
  }, [call]);
  const remove = useCallback(async (id, { confirmed = false } = {}) => {
    if (!confirmed) return false;
    try {
      await call(`/api/threads/${id}`, { method: 'DELETE' });
      invalidate(id); listRead.current++;
      releaseRefs(get(id).draft.refs);
      delete cache.current[id];
      setEntries({ ...cache.current });
      setThreads(current => current.filter(item => item.id !== id));
      if (active.current === id) choose(null);
      return true;
    } catch (error) { patch(active.current, { notice: error.message }); throw error; }
  }, [call, choose, get, invalidate, patch, releaseRefs]);
  const flushStyleRevocations = useCallback(async (threadId = active.current) => {
    for (const selectionId of [...pendingStyleRevocations.current]) {
      try {
        await call(`/api/style-selections/${selectionId}/revoke`, { method: 'POST', body: '{}' });
        pendingStyleRevocations.current.delete(selectionId);
        try { sessionStorage.setItem(revocationKey, JSON.stringify([...pendingStyleRevocations.current])); } catch {}
      } catch {
        patch(threadId, { notice: '风格标签已移除，但取消状态尚未同步。请点击“重试取消”；同步成功前不会提交新任务。' });
        return false;
      }
    }
    if (cache.current[threadId || emptyKey]) patch(threadId, {});
    return true;
  }, [call, patch, revocationKey]);
  useEffect(() => { if (pendingStyleRevocations.current.size) void flushStyleRevocations(); }, [flushStyleRevocations]);
  const selectStyle = useCallback(style => {
    const id = active.current, entry = get(id), previous = entry.draft;
    if (style && previous.selectedStyle?.id === style.id && previous.selectedStyle?.version === style.version) return previous.selectedStyle;
    const oldIds = new Set([previous.selectedStyle?.selectionId, ...(entry.messages || []).filter(item => item.proposal?.style && item.proposal.state === 'ready').map(item => item.proposal.styleSelectionId || item.id)].filter(Boolean));
    for (const token of oldIds) { withdrawnStyles.current.add(token); pendingStyleRevocations.current.add(token); }
    try { sessionStorage.setItem(revocationKey, JSON.stringify([...pendingStyleRevocations.current])); } catch {}
    const selectedStyle = style ? { id: style.id, version: style.version, name: style.name, selectionId: crypto.randomUUID() } : null;
    patch(id, { draft: { ...previous, selectedStyle, styleTouched: true, styleTitle: '', styleOptimization: 'professional', stylePlanRequest: undefined, useContext: false, contextParentId: undefined, requestId: crypto.randomUUID() },
      messages: entry.messages?.map(item => item.proposal?.state === 'ready' && oldIds.size ? { ...item, proposal: { ...item.proposal, state: 'revoked' } } : item) || entry.messages,
      notice: style ? '' : '已取消内置风格，文字和参考图已保留。后续按当前描述重新整理。' });
    void flushStyleRevocations(id);
    return selectedStyle;
  }, [get, patch, flushStyleRevocations, revocationKey]);
  const retryStyleCancellation = useCallback(async () => {
    const id = active.current;
    if (await flushStyleRevocations(id)) { patch(id, { notice: '风格取消已同步。' }); if (id) void loadThread(id); }
  }, [flushStyleRevocations, patch, loadThread]);

  const submit = useCallback(async () => {
    const source = active.current;
    const entry = get(source), snapshot = entry.draft;
    if (entry.sending || !snapshot.prompt.trim() || !snapshot.groupId) return;
    let geometry;
    try { geometry = resolveImageGeometry(snapshot.size, draftAspectRatio(snapshot)); }
    catch (error) { patch(source, { notice: error.message }); return; }
    patch(source, { sending: true, notice: '' });
    let threadId = source;
    try {
      if (!await flushStyleRevocations(source)) return;
      threadId = source || await create();
      if (!threadId) return;
      const references = await Promise.all(snapshot.refs.map(async item => item.mediaId ? { mediaId: item.mediaId } : { dataUrl: await fileToDataUrl(item.file) }));
      const { job } = await call('/api/chat', { method: 'POST', body: JSON.stringify({
        clientRequestId: snapshot.requestId, threadId, prompt: snapshot.prompt.trim(),
        count: snapshot.count, size: snapshot.size, aspectRatio: geometry.aspectRatio, groupId: snapshot.groupId, references,
        useContext: snapshot.useContext !== false, ...(snapshot.contextParentId !== undefined ? { contextParentId: snapshot.contextParentId } : {})
      }) });
      invalidate(threadId);
      const current = get(threadId);
      const existing = current.messages?.find(item => item.id === job.id);
      const latest = existing && (existing.updatedAt > job.updatedAt || (settled(existing) && pending(job))) ? existing : job;
      const updates = { messages: [...(current.messages || []).filter(item => item.id !== job.id), latest].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)), loading: false, error: '' };
      // The submitted snapshot belongs to this thread, even if the user is now typing elsewhere.
      if (current.draft.requestId === snapshot.requestId) {
        releaseRefs(snapshot.refs);
        updates.draft = { ...current.draft, prompt: '', refs: [], contextParentId: undefined, requestId: crypto.randomUUID() };
      }
      patch(threadId, updates);
      // Fetch the full thread even when the POST completes before its first history read.
      void loadThread(threadId);
      listRead.current++;
      setThreads(currentThreads => currentThreads.map(item => item.id === threadId
        ? { ...item, title: item.title === '新的创作' && !item.titleEdited ? snapshot.prompt.trim().slice(0, 24) : item.title, updatedAt: job.updatedAt }
        : item).sort((a, b) => b.updatedAt - a.updatedAt));
      void loadThreads().catch(() => {});
    } catch (error) { patch(threadId || source, { notice: error.message }); }
    finally { patch(threadId || source, { sending: false }); }
  }, [call, create, fileToDataUrl, get, invalidate, loadThread, loadThreads, patch, releaseRefs, flushStyleRevocations]);

  const prepareStylePlan = useCallback(async (input) => {
    const source = active.current;
    const entry = get(source), snapshot = entry.draft;
    if (entry.sending) return { ok: false, error: '这段创作正在提交，请稍候。' };
    let geometry;
    try { geometry = resolveImageGeometry(input.size, input.aspectRatio); }
    catch (error) { return { ok: false, error: error.message }; }
    if (!input.groupId) return { ok: false, error: '请选择可用的生图分组。' };
    const payload = { styleId: input.styleId, styleVersion: input.styleVersion, subject: input.subject,
      title: input.title ?? '', styleOptimization: input.styleOptimization ?? 'professional', size: input.size, aspectRatio: geometry.aspectRatio, count: input.count, groupId: input.groupId, ...(input.styleSelectionId ? { styleSelectionId: input.styleSelectionId } : {}) };
    const signature = JSON.stringify([payload, snapshot.requestId, snapshot.refs.map(item => item.mediaId || item.objectUrl)]);
    // Keep the request id through network failures so retrying cannot create another plan.
    const clientRequestId = snapshot.stylePlanRequest?.signature === signature ? snapshot.stylePlanRequest.id : crypto.randomUUID();
    patch(source, { sending: true, notice: '', draft: { ...snapshot, stylePlanRequest: { signature, id: clientRequestId } } });
    let threadId = source;
    try {
      if (!await flushStyleRevocations(source)) return { ok: false, error: '请先重试取消旧风格。' };
      if (input.styleSelectionId && withdrawnStyles.current.has(input.styleSelectionId)) return { ok: false, canceled: true };
      threadId = source || await create();
      if (!threadId) return { ok: false, error: '无法创建创作记录，请稍后重试。' };
      const references = await Promise.all(snapshot.refs.map(async item => item.mediaId
        ? { mediaId: item.mediaId } : { dataUrl: await fileToDataUrl(item.file) }));
      if (input.styleSelectionId && withdrawnStyles.current.has(input.styleSelectionId)) return { ok: false, canceled: true };
      const { job } = await call('/api/style-plans', { method: 'POST', body: JSON.stringify({ ...payload, clientRequestId, threadId, references }) });
      if (!cache.current[threadId]) return { ok: false, error: '创作记录已删除，请重新开始。' };
      invalidate(threadId);
      const current = get(threadId);
      const existing = current.messages?.find(item => item.id === job.id);
      const latest = existing && (existing.updatedAt > job.updatedAt || existing.proposal?.state === 'confirmed' || existing.proposal?.state === 'superseded') ? existing : job;
      const messages = (current.messages || []).filter(item => item.id !== job.id);
      const updates = { messages: [...messages, latest].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)), loading: false, error: '' };
      // Accepted input now lives in the message. Never erase edits made while the request was in flight.
      if (current.draft.requestId === snapshot.requestId) {
        releaseRefs(snapshot.refs);
        updates.draft = { ...current.draft, ...(input.styleSelectionId ? { prompt: '' } : {}), refs: [], contextParentId: undefined, stylePlanRequest: undefined, requestId: crypto.randomUUID() };
      }
      patch(threadId, updates);
      // Read server ordering before exposing success; a delayed response must not supersede a newer plan.
      await loadThread(threadId);
      void loadThreads().catch(() => {});
      if (input.styleSelectionId && withdrawnStyles.current.has(input.styleSelectionId)) return { ok: false, canceled: true };
      return { ok: true, threadId, planId: job.id };
    } catch (error) {
      if (input.styleSelectionId && withdrawnStyles.current.has(input.styleSelectionId)) return { ok: false, canceled: true };
      if (source !== null && !cache.current[source]) return { ok: false, error: error.message };
      patch(threadId || source, { notice: error.message });
      return { ok: false, error: error.message };
    } finally {
      if (cache.current[threadId || source || emptyKey]) patch(threadId || source, { sending: false });
    }
  }, [call, create, fileToDataUrl, get, invalidate, loadThread, loadThreads, patch, releaseRefs, flushStyleRevocations]);

  const confirmPlan = useCallback(async (plan, prompt) => {
    if (confirmations.current.has(plan.id)) return;
    if (plan.proposal?.style && get(plan.threadId).draft.styleTouched && get(plan.threadId).draft.selectedStyle?.selectionId !== (plan.proposal.styleSelectionId || plan.id)) {
      patch(plan.threadId, { notice: '风格已取消或更换，请按当前选择重新发送。' }); return;
    }
    confirmations.current.add(plan.id);
    setConfirming(current => ({ ...current, [plan.id]: true }));
    const threadId = plan.threadId;
    patch(threadId, { notice: '' });
    try {
      if (!await flushStyleRevocations(threadId)) return;
      const response = await call(`/api/plans/${plan.id}/confirm`, { method: 'POST', body: JSON.stringify({ confirmed: true, prompt }) });
      invalidate(threadId);
      const messages = (get(threadId).messages || []).filter(item => item.id !== response.job.id && item.id !== response.plan.id);
      patch(threadId, { messages: [...messages, response.plan, response.job].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)), loading: false, error: '' });
      void loadThread(threadId);
      void loadThreads().catch(() => {});
    } catch (error) { patch(threadId, { notice: error.message }); void loadThread(threadId); }
    finally {
      confirmations.current.delete(plan.id);
      if (live.current) setConfirming(current => ({ ...current, [plan.id]: false }));
    }
  }, [call, get, invalidate, loadThread, loadThreads, patch, flushStyleRevocations]);

  const entry = entries[activeId || emptyKey] || get(activeId);
  const initialLoading = Boolean(activeId && entry.messages === null && !entry.error);
  return {
    threads, activeId, messages: (entry.messages || []).map(item => {
      const token = item.proposal?.style && (item.proposal.styleSelectionId || item.id);
      return item.proposal?.state === 'ready' && token && (withdrawnStyles.current.has(token) || entry.draft.styleTouched && entry.draft.selectedStyle?.selectionId !== token)
        ? { ...item, proposal: { ...item.proposal, state: 'revoked' } } : item;
    }), draft: entry.draft,
    selectStyle, retryStyleCancellation, styleCancellationPending: pendingStyleRevocations.current.size > 0,
    sending: entry.sending, creating, notice: entry.notice, loading: initialLoading,
    loadError: entry.error, choose, create, remove, rename, attachEditorReference, submit, prepareStylePlan, confirmPlan, confirming, editDraft, setNotice,
    reloadThread: () => active.current && loadThread(active.current),
    replaceRefs(refs, prompt) { releaseRefs(get(active.current).draft.refs); editDraft({ refs, ...(prompt !== undefined ? { prompt } : {}) }); },
    removeRef(index) { const refs = get(active.current).draft.refs; releaseRefs(refs.slice(index, index + 1)); editDraft({ refs: refs.filter((_, i) => i !== index), contextParentId: undefined }); },
    addFiles(files, { dropped = false, directoryCount = 0 } = {}) {
      const refs = get(active.current).draft.refs;
      const { accepted, notice } = selectReferenceFiles([...files], refs, directoryCount);
      setNotice(notice);
      if (!accepted.length) return 0;
      editDraft({ contextParentId: undefined, refs: [...refs, ...accepted.map((file, index) => {
        const objectUrl = URL.createObjectURL(file); localUrls.current.add(objectUrl);
        return { file, objectUrl, localUrl: true, name: file.name, dropped, dropIndex: index };
      })] });
      return accepted.length;
    }
  };
}
