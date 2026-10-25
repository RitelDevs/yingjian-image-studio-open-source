import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, LoaderCircle, MessageCircle, RefreshCw, Sparkles, AlertCircle } from 'lucide-react';
import { useEditorChat } from './useEditorChat.js';

const labels = { sending: '准备画面', queued: '等待回复', running: '正在看图', applied: '已应用', 'not-applied': '未应用', replied: '已回复', failed: '失败', unknown: '待查询' };
const examples = ['调亮一点，保留自然色彩', '降低饱和度，再暖一点', '试试柔和的复古感觉'];
export default function EditorChatPanel({ editor, userId, groups, defaultGroupId, demo, cropMode, active }) {
  const [groupId, setGroupId] = useState(defaultGroupId || groups[0]?.id || '');
  const [message, setMessage] = useState('');
  const [issue, setIssue] = useState('');
  const input = useRef(null);
  const bottom = useRef(null);
  const chat = useEditorChat({ userId, editor: { ...editor, hasPendingPreview: editor.hasPendingPreview || cropMode }, groupId: Number(groupId) });
  const documentId = editor.document?.documentId;
  useEffect(() => { if (!groups.some(item => item.id === Number(groupId))) setGroupId(groups[0]?.id || ''); }, [groups, groupId]);
  useEffect(() => { setMessage(''); setIssue(''); }, [documentId]);
  useEffect(() => { if (active) bottom.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' }); }, [chat.entries, active]);
  const disabled = !documentId || chat.busy || editor.restoring || !groupId || cropMode || editor.hasPendingPreview;
  function submit(event) {
    event?.preventDefault();
    if (disabled || !message.trim()) return;
    const value = message;
    setIssue(''); setMessage('');
    void chat.send(value).catch(error => { setIssue(error.message); setMessage(value); });
  }
  return <aside className="ed-panel ed-chat" aria-label="AI 编辑助手">
    <div className="ed-chat-messages" role="log" aria-live="polite" aria-relevant="additions text">
      {!chat.entries.length && <div className="ed-chat-welcome"><div className="ed-chat-welcome-icon"><MessageCircle size={24} /></div><h3>说说你想要的感觉</h3><p>我会查看当前画面，调整左边的参数。你可以继续手动修改，也可以撤销我的调整。</p><div className="ed-chat-examples">{examples.map(value => <button key={value} disabled={!documentId} onClick={() => { setMessage(value); input.current?.focus(); }}>{value}<ArrowUp size={13} /></button>)}</div><span className="ed-chat-boundary">支持调色、预设与构图调整</span></div>}
      {chat.entries.map(entry => <article className="ed-chat-turn" key={entry.id}>
        <div className="ed-user-message">{entry.message}</div>
        <div className="ed-ai-message"><span className="ed-ai-message-label"><Sparkles size={13} />编辑助手</span>
          {['sending', 'queued', 'running'].includes(entry.status) ? <p className="ed-chat-thinking"><LoaderCircle size={14} className="spin" />{labels[entry.status]}…你可以继续手动调整。</p> : <>
            {entry.reply && <p>{entry.reply}</p>}
            {entry.summary && <div className="ed-operation-summary">{entry.summary}</div>}
            <span className={`ed-application-state is-${entry.status}`}>{entry.status === 'applied' ? <Check size={12} /> : ['unknown', 'failed', 'not-applied'].includes(entry.status) ? <AlertCircle size={12} /> : null}{labels[entry.status]}</span>
            {entry.reason && <p className="ed-chat-note">{entry.reason}</p>}{entry.error && <p className="ed-chat-error">{entry.error}</p>}
            {entry.status === 'unknown' && entry.requestId && <button className="ed-text-button" disabled={chat.busy} onClick={() => void chat.refresh(entry)}><RefreshCw size={12} />查询状态</button>}
          </>}
        </div>
      </article>)}<span ref={bottom} />
    </div>
    <form className="ed-chat-form" onSubmit={submit}>
      {demo && <div className="ed-chat-demo">演示模式 · 当前为模拟回复，不扣费</div>}
      {cropMode && <div className="ed-chat-note">应用或取消裁剪后，就可以继续对话。</div>}
      {issue && <p className="ed-chat-error" role="alert">{issue}</p>}
      <div className="ed-chat-input"><textarea ref={input} aria-label="告诉 AI 如何编辑图片" value={message} onChange={event => setMessage(event.target.value)} placeholder={documentId ? '例如：提亮一点，颜色更柔和…' : '先导入一张图片'} maxLength={4000} rows="3" disabled={!documentId} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} /><div className="ed-chat-input-bottom"><label>分组<select aria-label="编辑对话分组" value={groupId} onChange={event => setGroupId(event.target.value)} disabled={chat.busy}>{groups.map(group => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label><button type="submit" className="ed-chat-send" title="发送编辑对话" aria-label="发送编辑对话" disabled={disabled || !message.trim()}><ArrowUp size={18} /></button></div></div>
      <p className="ed-chat-cost">手动编辑不调用模型 · AI 对话按中转计费</p>
    </form>
  </aside>;
}
