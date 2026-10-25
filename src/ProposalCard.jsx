import { StyleOptimizationSummary } from './StyleOptimization.jsx';
import { Check, Layers3, LoaderCircle, Send } from 'lucide-react';

// Confirmation stays inside the existing response. Adjustments use the existing composer.
export default function ProposalCard({ item, groupName, confirming, blocked, onConfirm }) {
  const proposal = item.proposal;
  const ready = proposal.state === 'ready';
  const settings = proposal.settings;
  return <section className="confirmation-request" aria-label="待确认生图方案" data-style-plan-id={proposal.style ? item.id : undefined} tabIndex={proposal.style ? -1 : undefined}>
    {proposal.style && <div className="style-proposal-label"><Layers3 size={16} /><strong>{proposal.style.name}</strong><span>v{proposal.style.version}</span></div>}
    <StyleOptimizationSummary optimization={proposal.optimization} />
    <p className="confirmation-prompt">{proposal.prompt}</p>
    <div className="turn-settings">{settings.size} · {settings.aspectRatio === 'auto' ? '自动比例' : settings.aspectRatio} · {settings.count} 张{proposal.referenceIds.length > 0 && ` · 参考图 ${proposal.referenceIds.length} 张`} · {groupName || '当前分组'}</div>
    {proposal.style && ready && <p className="style-proposal-note">可在下方修改描述后重新发送；点输入区的 × 即可取消风格。</p>}
    {ready ? <div className="confirmation-actions"><span className="turn-settings">{blocked ? '等本轮对话完成后确认最新方案' : proposal.style ? '已锁定本次风格与设置，确认后提交生图' : '可继续补充要求，确认后才提交生图'}</span><button className="send-button" onClick={() => onConfirm(item, proposal.prompt)} disabled={confirming || blocked}>{confirming ? <LoaderCircle className="spin" size={16} /> : <Send size={16} />}<span>{confirming ? '正在提交' : '确认生成'}</span></button></div>
      : <div className="confirmation-actions"><span className="turn-settings">{proposal.state === 'confirmed' ? <><Check size={14} /> 已确认，下方查看生成结果</> : proposal.state === 'revoked' ? '已取消此风格方案，请按当前输入重新发送。' : '这份方案已更新，请查看后续对话。'}</span></div>}
  </section>;
}
