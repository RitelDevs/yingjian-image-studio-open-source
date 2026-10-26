import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, Check, Clock3, Copy, ImagePlus, Layers3,
  LoaderCircle, LogOut, Menu, Paperclip, Plus, RefreshCw,
  Send, Sparkles, Trash2, Wallet, X, Eye, EyeOff, ArrowUpRight, ImageUp, SlidersHorizontal
} from 'lucide-react';
import Inspiration from './Inspiration.jsx';
import Showcase from './Showcase.jsx';
import { tryAutoLogin, pauseAutoLogin, resumeAutoLogin } from './auto-login.js';
import Brand from './Brand.jsx';
import ThreadDeleteButton from './ThreadDeleteButton.jsx';
import ThreadRenameButton from './ThreadRenameButton.jsx';
import { useConversations } from './useConversations.js';
import { useReferenceDrop } from './useReferenceDrop.js';
import { usePageTransition } from './usePageTransition.js';
import { useSelectionSurface } from './useSelectionSurface.js';
import ImageGeometry from './ImageGeometry.jsx';
import OptionPicker from './OptionPicker.jsx';
import ProposalCard from './ProposalCard.jsx';
import StyleMarket from './StyleMarket.jsx';
import StyleOptimization from './StyleOptimization.jsx';
import ImageViewer from './ImageViewer.jsx';
import TurnstileVerification from './TurnstileVerification.jsx';
import { imageSettingsForRetry, draftAspectRatio } from '../shared/image-geometry.mjs';
import { STYLE_CATALOG } from '../shared/style-catalog.mjs';
import { getStyleExample } from '../shared/style-examples.mjs';
import ImageEditor from './editor-ui/ImageEditor.jsx';

const CONTACT = 'panrui12';
const REGISTER_URL = 'https://api-us.ritelt.com/register?aff=885EB5776PEU';
const SIZE_OPTIONS = ['1K', '2K', '4K'];
const statusText = {
  queued: '排队中', running: '生成中', done: '已完成', partial: '部分完成',
  unknown: '待核对', failed: '未完成'
};

async function call(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers }
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || '连接失败，请稍后重试。');
  return json;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('无法读取参考图。'));
    reader.readAsDataURL(file);
  });
}

function Logo({ compact = false }) {
  return <Brand compact={compact} />;
}

function Login({ onLogin, demo, integration, embedded = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verification, setVerification] = useState(demo ? { turnstileEnabled: false } : null);
  const [verificationError, setVerificationError] = useState('');
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [verificationReset, setVerificationReset] = useState(0);
  const loginInFlight = useRef(false);
  const verificationProof = useRef({ token: '', receivedAt: 0 });
  const receiveVerificationToken = useCallback(token => {
    verificationProof.current = { token, receivedAt: token ? Date.now() : 0 };
    setTurnstileToken(token);
    // A new challenge supersedes only the previous CAPTCHA error, never account errors.
    if (token) setError(current => /人机验证|验证凭证/.test(current) ? '' : current);
  }, []);
  useEffect(() => {
    if (demo) return;
    let active = true;
    setVerification(null); setVerificationError(''); receiveVerificationToken('');
    void call('/api/login-config').then(value => {
      if (!value || typeof value.turnstileEnabled !== 'boolean' || (value.turnstileEnabled && !value.turnstileSiteKey)) throw new Error('验证配置暂不可用');
      if (active) setVerification(value);
    }).catch(() => { if (active) setVerificationError('登录验证加载失败，请重试。'); });
    return () => { active = false; };
  }, [demo, verificationAttempt, receiveVerificationToken]);
  const requiresVerification = !tempToken && verification?.turnstileEnabled;
  const verificationPending = !tempToken && (!verification || (requiresVerification && !turnstileToken));
  async function submit(event) {
    event.preventDefault();
    if (loginInFlight.current || busy || verificationPending) return;
    const proof = verificationProof.current;
    // Leave a small margin before Cloudflare's 300-second, single-use lifetime.
    if (requiresVerification && (!proof.token || Date.now() - proof.receivedAt >= 290_000)) {
      receiveVerificationToken(''); setVerificationReset(value => value + 1);
      setError('人机验证已过期，正在重新验证。完成后请再次点击登录。');
      return;
    }
    loginInFlight.current = true;
    if (requiresVerification) receiveVerificationToken('');
    setBusy(true);
    setError('');
    try {
      const response = tempToken
        ? await call('/api/login/2fa', { method: 'POST', body: JSON.stringify({ tempToken, code }) })
        : await call('/api/login', { method: 'POST', body: JSON.stringify({ email, password, ...(requiresVerification ? { turnstileToken: proof.token } : {}) }) });
      if (response.requires2FA) setTempToken(response.tempToken);
      else onLogin();
    } catch (issue) { setError(issue.message); }
    finally {
      loginInFlight.current = false;
      setBusy(false);
      if (requiresVerification) { receiveVerificationToken(''); setVerificationReset(value => value + 1); }
    }
  }
  async function preview() {
    setBusy(true);
    setError('');
    try { await call('/api/demo-login', { method: 'POST', body: '{}' }); onLogin(); }
    catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  }
  return <div className={`login-shell ${embedded ? 'login-embedded' : ''}`}>
    {!embedded && <header className="login-top"><Logo /><span>在线创作空间</span></header>}
    <a className="skip-link" href="#main-content">跳转到登录表单</a>
    <main className="login-main" id="main-content">
      <section className="login-form-column">
        <div className="login-content">
          <div className="login-eyebrow">YOUR SPACE. YOUR IDEAS.</div>
          <h2 className="login-title">欢迎回来。</h2>
          <p className="login-subtitle">使用 Sub2API 账户进入创作空间</p>
          {integration && <p className="integration-login-note" role="status">管理员真实联调 · 连接 {integration.gateway}<br />提交生图会按中转价格扣费，本轮最多 {integration.maxJobs} 次，每次 1 张。</p>}
          {error && <div className="form-error" role="alert">{error}</div>}
          <form onSubmit={submit}>
            {!tempToken ? <>
              <label htmlFor="email">邮箱</label>
              <input id="email" name="email" type="email" autoComplete="username" spellCheck={false} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required />
              <label htmlFor="password">密码</label>
              <div className="password-field"><input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入账户密码" required /><button type="button" className="password-toggle" aria-label={showPassword ? '隐藏密码' : '显示密码'} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            </> : <>
              <label htmlFor="code">两步验证码</label>
              <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" spellCheck={false} value={code} onChange={(event) => setCode(event.target.value)} placeholder="6 位验证码" required />
            </>}
            {!tempToken && !demo && !verification && <div className="login-verification-state" role="status">{verificationError || '正在加载登录验证…'}{verificationError && <button type="button" onClick={() => setVerificationAttempt(value => value + 1)}>重新加载</button>}</div>}
            {requiresVerification && <TurnstileVerification siteKey={verification.turnstileSiteKey} onToken={receiveVerificationToken} resetKey={verificationReset} />}
            <button className="primary-button login-button" type="submit" aria-label="登录" disabled={busy || verificationPending}>
              {busy ? <LoaderCircle className="spin" size={18} /> : <>登录 <ArrowRight size={18} /></>}
            </button>
          </form>
          {demo && <button className="demo-button" type="button" onClick={preview} disabled={busy}>进入本地预览</button>}
          <div className="login-help"><a className="login-register-link" href={REGISTER_URL} target="_blank" rel="noopener noreferrer">注册账户<ArrowUpRight size={16} aria-hidden="true" /></a></div>
        </div>
      </section>
      <aside className="login-preview" aria-hidden="true">
        <div className="login-preview-head"><span>你的创作空间</span><ArrowUpRight size={23} /></div>
        <div className="login-statement">下一幅。<br />由你定义<span>。</span></div>
        <div className="login-art-collection"><img src="/editorial/architecture.svg" width="1600" height="1100" alt="" /></div>
        <div className="preview-footer"><span>IMAGES 2.5</span><span>MAKE IT YOURS.</span></div>
      </aside>
    </main>
  </div>;
}

function Sidebar({ threads, activeId, choose, create, remove, rename, user, onLogout, open, setOpen, busy, onOpenMarket, marketOpen, onOpenEditor, editorOpen }) {
  const [search, setSearch] = useState('');
  const selectedIndex = editorOpen ? 2 : marketOpen ? 1 : 0;
  const visibleThreads = threads.filter(item => item.title.toLowerCase().includes(search.toLowerCase()));
  const toolSurface = useSelectionSurface(selectedIndex, '', '.sidebar-action[aria-current="page"]');
  const threadSurface = useSelectionSurface(activeId, JSON.stringify(visibleThreads.map(item => item.id)), '.thread-row.selected');
  return <>
    {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}
    <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
      <div className="sidebar-heading"><Logo /><button className="icon-button mobile-close" title="关闭侧栏" aria-label="关闭侧栏" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <nav className="sidebar-actions" aria-label="创作工具" ref={toolSurface.containerRef}>
        <span className="selection-surface" ref={toolSurface.surfaceRef} aria-hidden="true" hidden />
        <button className="sidebar-action new-thread" aria-current={selectedIndex === 0 ? 'page' : undefined} onClick={event => { toolSurface.selectFrom(event, 0); create(); setOpen(false); }} disabled={busy}><Plus size={18} /><span>新建创作</span></button>
        <hr className="sidebar-action-divider" />
        <button className="sidebar-action style-market-nav" onClick={event => { toolSurface.selectFrom(event, 1); onOpenMarket(); setOpen(false); }} aria-current={selectedIndex === 1 ? 'page' : undefined}><Layers3 size={18} /><span>风格市场</span></button>
        <button className="sidebar-action ed-nav-entry" aria-current={selectedIndex === 2 ? 'page' : undefined} onClick={event => { toolSurface.selectFrom(event, 2); onOpenEditor(); setOpen(false); }}><SlidersHorizontal size={18} /><span>图片编辑台</span></button>
      </nav>
      <div className="sidebar-section-head"><span className="sidebar-section-tag">我的创作</span><span aria-label={`共 ${threads.length} 个创作`}>{threads.length}</span></div>
      {threads.length > 5 && <input className="thread-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索创作" aria-label="搜索创作" />}
      <div className="thread-list" ref={threadSurface.containerRef}>
        <span className="selection-surface" ref={threadSurface.surfaceRef} aria-hidden="true" hidden />
        {visibleThreads.map((item) => <div className={`thread-row ${item.id === activeId ? 'selected' : ''}`} key={item.id}>
          <button className="thread-main" aria-current={item.id === activeId ? "true" : undefined} onClick={event => { threadSurface.selectFrom(event, item.id); toolSurface.selectFrom(event, 0); choose(item.id); setOpen(false); }} title={item.title}>
            <span className="thread-name">{item.title}</span>
            <span className="thread-date">{new Date(item.updatedAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}</span>
          </button>
          <div className="thread-row-actions"><ThreadRenameButton thread={item} onRename={rename} /><ThreadDeleteButton thread={item} onRemove={remove} /></div>
        </div>)}
      </div>
      <div className="sidebar-bottom">
        <div className="retention"><Clock3 size={15} /> 作品保留 7 天</div>
        <div className="account-row"><div className="avatar">{(user.username || user.email || '用').slice(0, 1).toUpperCase()}</div><div className="account-meta"><strong>{user.username || user.email}</strong><small>{user.email}</small></div><button className="icon-button logout" onClick={onLogout} title="退出登录" aria-label="退出登录"><LogOut size={18} /></button></div>
      </div>
    </aside>
  </>;
}

function Message({ item, onEditImage, onUseImage, onRetry, onCopy, onOpenImage, onConfirm, onUseTemplate, confirming, blocked, groupName }) {
  const chat = item.kind === 'chat';
  const pending = item.status === 'queued' || item.status === 'running';
  return <article className="conversation-turn">
    <div className="turn-meta"><div className="turn-avatar">你</div><strong>你</strong><time>{new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div>
    <div className="prompt-text">{item.prompt}</div>
    {chat && (item.proposal?.style || item.context?.styleOptimization?.style) && <div className="turn-style-settings"><Layers3 size={12} /><span>{(item.proposal?.style || item.context.styleOptimization.style).name}</span><span>·</span><span>{item.proposal?.optimization?.mode === 'professional' || item.context?.styleOptimization ? '专业优化' : '直接套用'}</span></div>}
    {item.context?.turnIds?.length > 0 && <div className="turn-settings">已参考前 {item.context.turnIds.length} 轮要求{item.context.imageId ? '及上一轮图片' : ''}</div>}
    {item.aspectRatio && item.aspectRatio !== 'auto' && <div className="turn-settings">{item.size} · {item.aspectRatio}</div>}
    {item.referenceIds?.length > 0 && <div className="reference-strip">{item.referenceIds.map((id, index) => <div className="reference-image-item" key={id}><button type="button" className="reference-image-open" title="查看参考图大图" aria-label={`查看参考图 ${index + 1} 大图`} onClick={() => onOpenImage({ id, url: `/api/media/${id}`, threadId: item.threadId, name: `参考图-${index + 1}` })}><img src={`/api/media/${id}`} alt={`参考图 ${index + 1}`} /></button><button className="reference-to-editor" title="放入工作台" aria-label={`将参考图 ${index + 1} 放入工作台`} onClick={() => onEditImage({ id, url: `/api/media/${id}`, name: `参考图-${index + 1}` })}>放入工作台</button></div>)}</div>}
    <div className="response-block">
      <div className="response-heading"><span className="result-symbol"><Sparkles size={17} /></span><strong>映间</strong><span className={`status status-${item.status}`}>{pending && <LoaderCircle className="spin" size={13} />}{chat && item.recovery === 'style_template' ? '方案未整理成功' : chat ? ({ queued: '等待回复', running: '正在思考', done: '已回复', unknown: '回复待核对', failed: '回复失败' }[item.status] || item.status) : statusText[item.status] || item.status}</span></div>
      {pending && <div className="progress-line"><span />{chat ? (item.status === 'queued' ? '正在等待前一轮完成…' : item.context?.styleOptimization ? '正在按专业规则推敲构图、光影与表现方式…' : '正在理解需求、整理回复…') : item.status === 'queued' ? '正在排队，空出位置后会自动开始，无需重复提交。' : '正在生成图片'}</div>}
      {chat && item.assistantText && <p className="assistant-reply">{item.assistantText}</p>}
      {chat && item.proposal && <ProposalCard item={item} groupName={groupName} confirming={confirming} blocked={blocked} onConfirm={onConfirm} />}
      {item.images?.length > 0 && <div className={`image-grid ${item.images.length === 1 ? 'single-image' : ''}`}>{item.images.map((image, index) => <div className="image-item" key={image.id}>
        <button className="image-open" onClick={() => onOpenImage({ ...image, threadId: item.threadId, name: `生成作品-${index + 1}` })} title="查看大图" aria-label={`查看生成结果 ${index + 1}`}><img src={image.url} alt={`生成结果 ${index + 1}`} loading="lazy" /></button>
        <div className="image-actions"><button className="image-to-editor" title="放入工作台" aria-label="放入工作台" onClick={() => onEditImage({ ...image, name: `生成作品-${index + 1}` })}><SlidersHorizontal size={17} /><span>放入工作台</span></button><button title="基于这张图继续修改" aria-label="基于这张图继续修改" onClick={() => onUseImage({ ...image, sourceMessageId: item.id })}><ImagePlus size={17} /></button><a href={image.url} download={`yingjian-${image.id}.${image.mime === 'image/png' ? 'png' : image.mime === 'image/webp' ? 'webp' : 'jpg'}`} title="下载图片" aria-label="下载图片"><ArrowDownToLine size={17} /></a></div>
      </div>)}</div>}
      {item.error && <p className={`response-note ${item.status === 'failed' || item.status === 'unknown' ? 'response-error' : ''}`}>{item.error}</p>}
      {chat && item.recovery === 'style_template' && onUseTemplate && <div className="response-tools"><button type="button" disabled={blocked} onClick={onUseTemplate}><Layers3 size={14} />切换为直接套用</button><span className="turn-settings">无需再次请求优化模型，确认方案后才生图</span></div>}
      {!chat && ['done', 'partial', 'failed'].includes(item.status) && <div className="response-tools"><button onClick={() => onRetry(item)}><RefreshCw size={14} /> 重新生成</button><button onClick={() => onCopy(item.prompt)}><Copy size={14} /> 复制提示词</button></div>}
    </div>
  </article>;
}

function Workspace({ initial, onLogout }) {
  const [user, setUser] = useState(initial.user);
  const [groups, setGroups] = useState(initial.groups);
  const conversations = useConversations({ call, userId: user.id, defaultGroupId: initial.groups[0]?.id ?? null, fileToDataUrl });
  const { threads, activeId, messages, draft, sending, creating, notice, loading, loadError,
    choose, create, remove, rename, attachEditorReference, submit, prepareStylePlan, selectStyle, retryStyleCancellation, styleCancellationPending, confirmPlan, confirming, editDraft, setNotice, addFiles, removeRef, replaceRefs, reloadThread } = conversations;
  const { prompt, refs, size, count, groupId } = draft;
  const chosenStyle = STYLE_CATALOG.find(style => style.id === draft.selectedStyle?.id && style.version === draft.selectedStyle?.version);
  const chosenExample = chosenStyle && getStyleExample(chosenStyle);
  const canSubmit = Boolean(groupId && !sending && !styleCancellationPending && (chosenStyle?.inputMode === 'reference' ? refs.length : prompt.trim()) && (!chosenStyle || prompt.trim().length <= 1200));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailImage, setDetailImage] = useState(null);
  const [editorOpen, setEditorOpen] = useState(location.hash === '#editor');
  const [editorVisited, setEditorVisited] = useState(location.hash === '#editor');
  const [editorSource, setEditorSource] = useState(null);
  const editorTrigger = useRef(null);
  const [marketOpen, setMarketOpen] = useState(() => location.hash === '#styles');
  const marketSession = useRef(0);
  const pendingStyleFocus = useRef(null);
  const marketTrigger = useRef(null);
  const marketDropRef = useRef(null);
  const marketSubjectRef = useRef(null);
  const navigate = usePageTransition(editorOpen ? 'editor' : marketOpen ? 'market' : 'create');
  useEffect(() => {
    const update = () => {
      const editor = location.hash === '#editor', market = location.hash === '#styles';
      navigate(editor ? 'editor' : market ? 'market' : 'create', () => {
        marketSession.current++;
        setEditorOpen(editor);
        if (editor) setEditorVisited(true);
        setMarketOpen(market);
      });
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, [navigate]);
  function openEditor(image) {
    editorTrigger.current = document.activeElement;
    navigate('editor', () => {
      if (image) setEditorSource({ ...image, threadId: image.threadId || activeId, requestId: crypto.randomUUID() });
      setEditorVisited(true); setEditorOpen(true); setDetailImage(null); setSidebarOpen(false);
      if (location.hash !== '#editor') history.pushState(null, '', '#editor');
    });
  }
  async function returnEditorReference(file, options) {
    const target = await attachEditorReference(file, options);
    if (!target || !options.isCurrent()) return;
    navigate('create', () => {
      choose(target); setEditorOpen(false); setMarketOpen(false);
      history.replaceState(null, '', location.pathname + location.search);
    });
    requestAnimationFrame(() => textInput.current?.focus({ preventScroll: true }));
  }
  function closeEditor() {
    navigate(marketOpen ? 'market' : 'create', () => {
      setEditorOpen(false);
      history.replaceState(null, '', location.pathname + location.search + (marketOpen ? '#styles' : ''));
      requestAnimationFrame(() => editorTrigger.current?.isConnected && editorTrigger.current.focus({ preventScroll: true }));
    });
  }
  function openMarket() {
    marketTrigger.current = document.activeElement;
    navigate('market', () => {
      marketSession.current++;
      setMarketOpen(true);
      if (location.hash !== '#styles') history.pushState(null, '', location.pathname + location.search + '#styles');
    });
  }
  function backToCreation(restoreFocus = true) {
    navigate('create', () => {
      marketSession.current++;
      setMarketOpen(false);
      if (location.hash === '#styles') history.replaceState(null, '', location.pathname + location.search);
      if (restoreFocus) requestAnimationFrame(() => {
        if (marketTrigger.current?.isConnected && marketTrigger.current.getClientRects().length) marketTrigger.current.focus({ preventScroll: true });
        else textInput.current?.focus({ preventScroll: true });
      });
    });
  }
  function chooseThread(id) { backToCreation(false); choose(id); }
  async function createThread() { backToCreation(false); return create(); }
  const activeThread = useRef(activeId);
  activeThread.current = activeId;
  async function prepareMarketPlan(input) {
    const visit = marketSession.current, sourceThread = activeThread.current;
    const style = STYLE_CATALOG.find(style => style.id === input.styleId && style.version === input.styleVersion);
    const selection = style && selectStyle(style);
    if (style) editDraft({ styleTitle: input.title || '', styleOptimization: input.styleOptimization || 'professional' });
    const result = await prepareStylePlan({ ...input, ...(selection ? { styleSelectionId: selection.selectionId } : {}) });
    // Closing the market or explicitly choosing another thread cancels navigation, not the request.
    if (result?.ok && visit === marketSession.current && (activeThread.current === sourceThread || activeThread.current === result.threadId)) {
      pendingStyleFocus.current = result.planId;
      backToCreation(false);
    }
    return result;
  }
  function chooseMarketStyle(style) {
    selectStyle(style);
    backToCreation(false);
    requestAnimationFrame(() => textInput.current?.focus({ preventScroll: true }));
  }
  function removeComposerStyle() {
    selectStyle(null);
    if (Object.values(confirming).some(Boolean) || messages.some(item => item.kind !== 'chat' && ['queued', 'running'].includes(item.status))) {
      setNotice('后续创作已取消风格，文字和参考图已保留。已经确认提交的图片任务不会被撤回。');
    }
    requestAnimationFrame(() => textInput.current?.focus({ preventScroll: true }));
  }
  async function submitComposer() {
    if (!chosenStyle) return submit();
    if (chosenStyle.inputMode === 'reference' && !refs.length) { setNotice('这个风格需要参考图，请先上传图片。'); return; }
    if (prompt.trim().length > 1200) { setNotice('使用风格时描述最多 1200 字，请缩短内容或移除风格标签。'); return; }
    const visit = marketSession.current, source = activeThread.current;
    const result = await prepareStylePlan({ styleId: chosenStyle.id, styleVersion: chosenStyle.version,
      styleSelectionId: draft.selectedStyle.selectionId, styleOptimization: initial.features?.styleOptimization ? draft.styleOptimization || 'professional' : 'template', subject: prompt.trim(), title: chosenStyle.supportsTitle ? draft.styleTitle || '' : '',
      size, aspectRatio: draftAspectRatio(draft), count, groupId });
    if (result?.ok && visit === marketSession.current && (activeThread.current === source || activeThread.current === result.threadId)) {
      pendingStyleFocus.current = result.planId;
      requestAnimationFrame(() => {
        const plan = document.querySelector(`[data-style-plan-id="${result.planId}"]`);
        if (plan) { plan.focus({ preventScroll: true }); plan.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); pendingStyleFocus.current = null; }
      });
    }
  }
  const endRef = useRef(null);
  const fileInput = useRef(null);
  const textInput = useRef(null);
  const composerRef = useRef(null);
  const drop = useReferenceDrop({ targetRef: marketOpen ? marketDropRef : composerRef, onFiles: addFiles, onNotice: message => setNotice(marketOpen && message === '请把图片拖到下方输入框内。' ? '请先打开一种风格，再把图片拖到详情中的参考图区。' : message), referenceCount: refs.length, scope: `${activeId || 'new'}:${marketOpen ? 'market' : 'chat'}`, inputRef: marketOpen ? marketSubjectRef : textInput });
  const dropTitle = drop.state === 'full' ? '参考图已满' : drop.state === 'unsupported' ? '暂不支持这个文件' : '松开，添加参考图';
  const dropHint = drop.state === 'full' ? '最多 4 张，移除一张后再拖入' : 'PNG、JPEG、WebP · 单张不超过 8 MB';
  const isEmpty = !messages.length && !loading && !loadError;
  useEffect(() => {
    if (marketOpen || !pendingStyleFocus.current) return;
    const proposal = document.querySelector(`[data-style-plan-id="${pendingStyleFocus.current}"]`);
    if (proposal) { proposal.focus({ preventScroll: true }); pendingStyleFocus.current = null; }
  }, [marketOpen, messages, loading]);
  useEffect(() => { if (messages.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [activeId, messages.length]);
  useEffect(() => { const timer = setInterval(() => { void call('/api/me').then((data) => { setUser(data.user); setGroups(data.groups); }).catch(() => {}); }, 60_000); return () => clearInterval(timer); }, []);
  function updatePrompt(value) { editDraft({ prompt: value }); }
  function useImage(image) {
    replaceRefs([{ mediaId: image.id, objectUrl: image.url, name: '上一张作品' }]);
    editDraft({ useContext: true, contextParentId: image.sourceMessageId });
    textInput.current?.focus();
  }
  function retry(item) {
    replaceRefs(item.referenceIds.map((id) => ({ mediaId: id, objectUrl: `/api/media/${id}`, name: '参考图' })), item.prompt);
    editDraft({ ...imageSettingsForRetry(item), useContext: item.context?.enabled === true, contextParentId: item.context?.parentId ?? null });
    textInput.current?.focus();
  }
  async function logout() { await call('/api/logout', { method: 'POST', body: '{}' }).catch(() => {}); onLogout(); }
  async function copy(value) { await navigator.clipboard.writeText(value).then(() => setNotice('已复制提示词')).catch(() => setNotice('复制失败')); }
  return <div className={`workspace${editorOpen ? ' ed-is-open' : ''}`}>
    <Sidebar threads={threads} activeId={activeId} choose={chooseThread} create={createThread} remove={remove} rename={rename} user={user} onLogout={logout} open={sidebarOpen} setOpen={setSidebarOpen} busy={creating} onOpenMarket={openMarket} marketOpen={marketOpen} onOpenEditor={() => openEditor()} editorOpen={editorOpen} />
    <div className="workspace-main" style={editorOpen ? { display: 'none' } : undefined}>
      <a className="skip-link" href="#main-content">跳转到创作对话</a>
      <header className="topbar"><div className="topbar-left"><button className="icon-button menu-toggle" title="打开创作列表" aria-label="打开创作列表" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div className="breadcrumb"><span>创作空间</span><span className="breadcrumb-slash">/</span><strong>{marketOpen ? '风格市场' : threads.find((item) => item.id === activeId)?.title || '新的创作'}</strong></div></div><div className="topbar-right"><button className="ed-open-top" onClick={() => openEditor()}><SlidersHorizontal size={16} /><span>图片编辑台</span></button><span className="model-chip"><span className="model-dot" /> Images 2.5</span><span className="balance"><Wallet size={16} /> 余额 <strong>{Number(user.balance || 0).toFixed(2)}</strong></span></div></header>
      {initial.demo && <div className="demo-strip">本地预览 · 图片和余额为示例，不调用中转</div>}
      {initial.integration && <div className="demo-strip integration-strip">管理员真实联调 · 按中转价格扣费 · 本轮最多 {initial.integration.maxJobs} 个单图请求</div>}
      <div className={`workspace-stage${marketOpen ? ' is-market' : isEmpty ? ' is-empty' : ''}`}>
      {marketOpen ? <StyleMarket optimizationAvailable={initial.features?.styleOptimization === true} demo={initial.demo} onChooseStyle={chooseMarketStyle} draft={draft} groups={groups} prepareStylePlan={prepareMarketPlan} onBack={backToCreation} onPrepared={() => {}} addFiles={addFiles} removeRef={removeRef} notice={notice} onClearNotice={() => setNotice('')} referenceDropRef={marketDropRef} subjectInputRef={marketSubjectRef} dropState={drop.state} blocked={sending || messages.some(turn => turn.kind === 'chat' && ['queued', 'running'].includes(turn.status))} /> : <>
      <main className="conversation" id="main-content" aria-label="创作对话" aria-busy={loading}>
        <div className="conversation-inner">
          {loading && <div className="thread-load-state" role="status"><LoaderCircle className="spin" size={20} /><span>正在加载创作记录…</span></div>}
          {loadError && <div className="thread-load-error" role="status"><span>{loadError}</span><button onClick={reloadThread}>重新加载会话</button></div>}
          {isEmpty ? <Inspiration onFocus={() => textInput.current?.focus({ preventScroll: true })} onUpload={() => fileInput.current?.click()} onOpenMarket={openMarket} /> : messages.map((item) => <Message key={item.id} item={item} onEditImage={openEditor} onUseImage={useImage} onRetry={retry} onCopy={copy} onOpenImage={setDetailImage} onConfirm={confirmPlan} onUseTemplate={chosenStyle?.id === item.context?.styleOptimization?.style?.id ? () => { const original = item.context.styleOptimization.styleInput; editDraft({ styleOptimization: 'template', ...(!prompt.trim() ? { prompt: original?.subject || item.prompt, styleTitle: original?.title || '' } : {}), ...(!refs.length && item.referenceIds?.length ? { refs: item.referenceIds.map((id, index) => ({ mediaId: id, objectUrl: `/api/media/${id}`, name: `参考图-${index + 1}` })) } : {}) }); setNotice('已切换为直接套用。点击“发送”整理方案，确认后才生图；不会再次请求专业优化模型。'); requestAnimationFrame(() => textInput.current?.focus({ preventScroll: true })); } : undefined} confirming={Boolean(confirming[item.id])} blocked={sending || styleCancellationPending || messages.some(turn => turn.kind === 'chat' && ['queued', 'running'].includes(turn.status))} groupName={groups.find(group => group.id === item.groupId)?.name} />)}
          <div ref={endRef} />
        </div>
      </main>
      <section className="composer-wrap" aria-label="生图输入">
        {notice && <div className="notice" role="status">{notice}{styleCancellationPending && <button className="style-cancel-retry" onClick={retryStyleCancellation}>重试取消</button>}<button className="icon-button" title="关闭提示" aria-label="关闭提示" onClick={() => setNotice('')}><X size={15} /></button></div>}
        <div className="composer" ref={composerRef} data-file-drop={drop.state}>
          <div className="composer-drop-overlay" aria-hidden="true"><div className="composer-drop-feedback"><span className="composer-drop-icon"><ImageUp size={24} strokeWidth={1.7} /></span><strong>{dropTitle}</strong><span>{dropHint}</span></div></div>
          <span className="sr-only" role="status" aria-live="polite">{drop.state === 'idle' ? drop.announcement : `${dropTitle}，${dropHint}`}</span>
          {refs.length > 0 && <div className="composer-refs">{refs.map((item, index) => <div className={`composer-ref${item.dropped ? ' is-dropped' : ''}`} key={item.objectUrl || item.mediaId} style={item.dropped ? { transitionDelay: `${item.dropIndex * 40}ms` } : undefined}><img src={item.objectUrl} alt={item.name} /><button title="移除参考图" aria-label="移除参考图" onClick={() => removeRef(index)}><X size={13} /></button></div>)}<span className="ref-label">参考图 {refs.length}/4</span></div>}
          <div className={`composer-text-row${chosenStyle ? ' has-style' : ''}`}>
          {chosenStyle && <span className="composer-style-chip" role="group" aria-label="当前风格">
            <button type="button" className="composer-style-name" aria-label={`更换风格：${chosenStyle.name}`} title={`当前风格：${chosenStyle.name}；点击更换`} onClick={openMarket}>
              <span className="composer-style-thumb" style={{ backgroundColor: chosenStyle.cover.colors[0] }}>{chosenExample?.src ? <img src={chosenExample.src} alt="" onError={event => { event.currentTarget.hidden = true; }} /> : <Layers3 size={12} />}</span>
              <span>{chosenStyle.name}</span>
            </button>
            <button type="button" className="composer-style-remove" aria-label={`取消风格：${chosenStyle.name}`} title="取消内置风格，保留文字和参考图" onClick={removeComposerStyle}><X size={13} /></button>
          </span>}
          <textarea ref={textInput} aria-label="画面描述" autoComplete="off" value={prompt} onChange={(event) => updatePrompt(event.target.value)} placeholder={chosenStyle ? chosenStyle.inputMode === 'reference' ? '上传参考图即可，也可以补充想保留的细节…' : chosenStyle.subjectPlaceholder : refs.length ? '聊聊这张图，你希望怎么调整？' : '描述想法，或聊聊你还没确定的细节…'} rows={2} maxLength={chosenStyle ? 1200 : 4000} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submitComposer(); } }} />
          </div>
          {chosenStyle && <p className="composer-style-hint">{chosenStyle.inputMode === 'reference' ? '上传参考图，发送后查看方案；点 × 取消风格。' : '只写想画的内容即可；点 × 取消内置风格。'}</p>}
          {chosenStyle && prompt.trim().length > 1200 && <p className="composer-style-error" role="status">已有文字已保留。使用风格时最多 1200 字，可缩短内容或移除标签。</p>}
          <ImageGeometry draft={draft} onChange={editDraft}>{chosenStyle && initial.features?.styleOptimization && <StyleOptimization compact style={chosenStyle} value={draft.styleOptimization || 'professional'} onChange={styleOptimization => editDraft({ styleOptimization })} disabled={sending} demo={initial.demo} />}</ImageGeometry>
          <div className="composer-toolbar"><div className="composer-options"><input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => { addFiles(event.target.files || []); event.target.value = ''; }} /><button className="tool-button" onClick={() => fileInput.current?.click()} title="添加参考图片，也可将图片拖入输入框" aria-label="添加参考图片" disabled={refs.length >= 4}><Paperclip size={18} /></button><span className="toolbar-divider" /><OptionPicker label="尺寸" className="size-select" value={size} options={SIZE_OPTIONS.map(item => ({ value: item, label: item }))} onChange={size => editDraft({ size })} /><div className="count-control" title="每次生成张数"><button aria-label="减少张数" onClick={() => editDraft({ count: Math.max(1, count - 1) })} disabled={count <= 1}>−</button><span>{count} 张</span><button aria-label="增加张数" onClick={() => editDraft({ count: Math.min(4, count + 1) })} disabled={count >= 4}>+</button></div><OptionPicker label="分组" className="group-select" value={groupId} options={groups.map(item => ({ value: item.id, label: item.name }))} onChange={groupId => editDraft({ groupId })} /></div><button className="send-button" onClick={submitComposer} disabled={!canSubmit} title={chosenStyle ? '发送并查看风格方案' : '发送对话'} aria-label={chosenStyle ? '发送风格描述' : '发送对话'}>{sending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}<span>发送</span></button></div>
        </div>
        <div className="composer-bottom"><span className="composer-hint">Enter 发送 · Shift + Enter 换行</span><span>对话与生图均按中转计费 · 生图需确认</span></div>
      </section>
      </>}
      </div>
    </div>
    {editorVisited && <ImageEditor key={user.id} user={user} groups={groups} defaultGroupId={groupId} demo={initial.demo} active={editorOpen} source={editorSource} onBack={closeEditor} onReturnReference={returnEditorReference} />}
    {detailImage && <ImageViewer image={detailImage} onClose={() => setDetailImage(null)} onEdit={image => { setDetailImage(null); openEditor(image); }} />}
  </div>;
}

let initialization;
function initializeAccount() {
  if (!initialization) initialization = (async () => {
    const [config, account] = await Promise.all([
      call('/api/config').catch(() => ({ demo: false })),
      call('/api/me').catch(() => null)
    ]);
    if (account) return { config, account, automatic: false };
    const automatic = await tryAutoLogin(config.ssoSources, call);
    return { config, account: automatic ? await call('/api/me').catch(() => null) : null, automatic };
  })();
  return initialization;
}

export default function App() {
  const [account, setAccount] = useState(null);
  const [config, setConfig] = useState({ demo: false });
  const [loading, setLoading] = useState(true);
  const [exploring, setExploring] = useState(['#explore', '#showcase-works', '#showcase-workflow', '#account-entry'].includes(location.hash));
  useEffect(() => {
    const update = () => setExploring(['#explore', '#showcase-works', '#showcase-workflow', '#account-entry'].includes(location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  function enterWorkspace() {
    history.replaceState(null, '', location.pathname + location.search);
    setExploring(false);
    window.scrollTo(0, 0);
  }
  const reload = useCallback(async () => {
    try { setAccount(await call('/api/me')); }
    catch { setAccount(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    void initializeAccount().then((result) => {
      if (!active) return;
      setConfig(result.config); setAccount(result.account);
      if (result.automatic && result.account) enterWorkspace();
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  if (loading) return <div className="loading-screen"><Logo /><LoaderCircle className="spin" size={22} /></div>;
  if (!account || exploring) return <Showcase authenticated={Boolean(account)} onEnter={enterWorkspace}><Login embedded demo={config.demo} integration={config.integration} onLogin={() => { resumeAutoLogin(); enterWorkspace(); void reload(); }} /></Showcase>;
  return <Workspace initial={account} onLogout={() => { pauseAutoLogin(); setAccount(null); }} />;
}
