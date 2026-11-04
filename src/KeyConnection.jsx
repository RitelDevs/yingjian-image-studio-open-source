import { useContext, useEffect, useRef, useState } from 'react';
import { RefreshCw, LoaderCircle } from 'lucide-react';
import { StudioApiContext } from './studio-api.js';
import './key-connection.css';

const descriptions = {
  deleted: '生图 Key 已被删除。重新连接后才能继续创作。',
  disabled: '生图 Key 已被停用。请在控制台重新启用原 Key，再检查连接；也可以选择新建 Key。',
  expired: '生图 Key 已过期。请在控制台调整有效期，或重新连接。',
  group_changed: '生图 Key 已不再绑定这个分组。请恢复原分组，或重新连接。',
  invalid: '生图 Key 与保存的连接不一致，请重新连接。',
  limited: '生图 Key 当前不可用。请在控制台检查状态和额度，再检查连接。',
  unknown: '创建连接的结果待核对。请联系管理员微信 panrui12，暂时不要重复创建。'
};
export default function KeyConnection({ groupId, refreshToken }) {
  const { call } = useContext(StudioApiContext);
  const [connection, setConnection] = useState(null);
  const [issue, setIssue] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState('');
  const generation = useRef(0), lock = useRef(false);
  async function check() {
    if (!groupId || lock.current) return;
    const version = ++generation.current;
    setBusy(true); setIssue(''); setConfirming(false);
    try {
      const value = await call('/api/key-connection?groupId=' + Number(groupId));
      if (version === generation.current) { setConnection(value); setFeedback(''); }
    } catch (error) { if (version === generation.current) { setConnection(null); setIssue(error.message || '暂时无法检查生图连接。'); } }
    finally { if (version === generation.current) setBusy(false); }
  }
  useEffect(() => { void check(); return () => { generation.current++; }; }, [groupId, refreshToken, call]);
  async function reconnect() {
    if (lock.current || !connection) return;
    lock.current = true;
    const version = ++generation.current;
    setBusy(true); setIssue('');
    try {
      const value = await call('/api/key-connection', { method: 'POST', body: JSON.stringify({ groupId: Number(groupId), expectedKeyId: connection.keyId, confirmed: true }) });
      if (version === generation.current) { setConnection(value); setConfirming(false); setFeedback('生图连接已恢复。请重新提交需要的创作；历史任务不会自动重发。'); }
    } catch (error) {
      if (version === generation.current) { setIssue(error.message || '连接结果暂时无法确认，请重新检查。'); setConfirming(false); setConnection(null); }
    } finally { lock.current = false; if (version === generation.current) setBusy(false); }
  }
  const detail = descriptions[connection?.state];
  if (!detail && !issue && !feedback) return null;
  const canReconnect = ['deleted', 'disabled', 'expired', 'group_changed', 'invalid'].includes(connection?.state);
  return <div className="key-connection" role="status" aria-label="生图连接状态" aria-busy={busy}>
    <p>{issue || feedback || detail}</p>
    {confirming && <p>将为当前分组创建并连接一个新的个人 API Key，原 Key 保持不变。这一步不会生成图片或发送对话。</p>}
    <div className="key-connection-actions">
      {confirming ? <><button type="button" disabled={busy} onClick={() => void reconnect()}>{busy ? <LoaderCircle size={14} className="spin" /> : null}创建并连接新 Key</button><button type="button" disabled={busy} onClick={() => setConfirming(false)}>取消</button></> : <>
        {canReconnect && <button type="button" disabled={busy} onClick={() => setConfirming(true)}>{connection.state === 'disabled' ? '选择新建 Key' : '重新连接生图'}</button>}
        {!feedback && <button type="button" disabled={busy} onClick={() => void check()}>{busy ? <LoaderCircle size={14} className="spin" /> : <RefreshCw size={14} />}重新检查连接</button>}
      </>}
    </div>
  </div>;
}
