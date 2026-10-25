import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ArrowUpRight, ImagePlus, Layers3, LoaderCircle, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { STYLE_CATALOG } from '../shared/style-catalog.mjs';
import { getStyleExample } from '../shared/style-examples.mjs';
import { draftAspectRatio, resolveImageGeometry } from '../shared/image-geometry.mjs';
import ImageGeometry from './ImageGeometry.jsx';
import OptionPicker from './OptionPicker.jsx';
import StyleOptimization from './StyleOptimization.jsx';
import './style-market.css';
import StyleMarketFilters from './StyleMarketFilters.jsx';
import StyleArtworkExtra, { hasExtraArtwork } from './StyleArtworkExtra.jsx';

// Original vector studies explain the visual direction; they are not generated samples.
function StyleArtwork({ style, className = '', full = false }) {
  const uid = useId().replaceAll(':', '');
  const [failedSrc, setFailedSrc] = useState(null);
  const example = getStyleExample(style);
  const source = full ? (example?.fullSrc || example?.src) : example?.src;
  if (source) {
    if (failedSrc === source) return <div className={`style-artwork style-artwork-error ${className}`} role="img" aria-label="例图暂时无法加载">例图暂时无法加载</div>;
    return <img className={`style-artwork style-generated-example ${className}`} src={source} style={{ backgroundColor: style.cover.colors[0] }} alt={example.alt || `Images2.5 生成的${style.name}例图`} width={example.width} height={example.height} loading={full ? 'eager' : 'lazy'} decoding="async" onError={() => setFailedSrc(source)} />;
  }
  const [paper = '#e2edf5', accent = '#6d9bbb', ink = '#284969'] = style.cover.colors;
  const variant = style.cover.variant;
  if (hasExtraArtwork(style.id)) return <StyleArtworkExtra style={style} className={className} />;
  return <svg className={`style-artwork ${className}`} viewBox="0 0 400 320" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${uid}-bg`} x1="30" y1="0" x2="360" y2="320" gradientUnits="userSpaceOnUse"><stop stopColor={paper} /><stop offset="1" stopColor={accent} stopOpacity=".32" /></linearGradient>
      <linearGradient id={`${uid}-body`} x1="155" y1="100" x2="260" y2="280" gradientUnits="userSpaceOnUse"><stop stopColor="white" stopOpacity=".8" /><stop offset="1" stopColor={accent} /></linearGradient>
      <radialGradient id={`${uid}-clay`} cx=".35" cy=".25" r=".8"><stop stopColor="#fff4df" /><stop offset=".65" stopColor="#e8c6a8" /><stop offset="1" stopColor="#bf9279" /></radialGradient>
    </defs>
    <rect width="400" height="320" rx="4" fill={paper} />
    {variant === 'clay-avatar' && <>
      <rect width="400" height="320" fill={`url(#${uid}-bg)`} /><circle cx="203" cy="150" r="115" fill="white" fillOpacity=".28" />
      <ellipse cx="203" cy="283" rx="93" ry="13" fill={ink} fillOpacity=".12" />
      <path d="M124 276C126 218 156 208 201 208C247 208 279 231 280 276Z" fill={accent} /><path d="M155 257Q199 277 247 257" stroke="white" strokeOpacity=".3" strokeWidth="4" />
      <ellipse cx="135" cy="159" rx="16" ry="23" fill="#dbb594" /><ellipse cx="265" cy="159" rx="16" ry="23" fill="#dbb594" />
      <rect x="139" y="82" width="122" height="140" rx="59" fill={`url(#${uid}-clay)`} />
      <path d="M139 143C126 100 153 60 194 62C231 48 270 83 264 140C246 129 244 98 230 101C206 128 176 130 157 122L147 150Z" fill={ink} />
      <path d="M158 91Q181 69 214 79" stroke="white" strokeOpacity=".13" strokeWidth="9" strokeLinecap="round" />
      <ellipse cx="177" cy="155" rx="5" ry="7" fill={ink} /><ellipse cx="224" cy="155" rx="5" ry="7" fill={ink} />
      <path d="M188 184Q201 194 214 184" stroke="#93674f" strokeWidth="4" strokeLinecap="round" /><ellipse cx="164" cy="177" rx="12" ry="6" fill="#e8a492" fillOpacity=".6" />
      <path d="m309 74 4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" fill="white" /><circle cx="88" cy="206" r="9" fill="white" fillOpacity=".6" />
    </>}
    {variant === 'product-studio' && <>
      <rect width="400" height="320" fill={`url(#${uid}-bg)`} /><path d="M-40 130 140-20H240L10 200Z" fill="white" fillOpacity=".4" /><path d="M80 320 344 78H407V178L250 320Z" fill="white" fillOpacity=".23" />
      <ellipse cx="227" cy="272" rx="99" ry="18" fill={ink} fillOpacity=".13" /><path d="M96 246V278C96 305 304 305 304 278V246" fill="#e9e4d9" /><ellipse cx="200" cy="246" rx="104" ry="24" fill="#fbf9f1" />
      <rect x="155" y="102" width="91" height="145" rx="20" fill={accent} /><rect x="155" y="102" width="91" height="145" rx="20" fill={`url(#${uid}-body)`} />
      <rect x="169" y="77" width="64" height="34" rx="6" fill={ink} /><path d="M174 84H227" stroke="white" strokeOpacity=".25" strokeWidth="3" />
      <rect x="167" y="157" width="67" height="57" rx="2" fill="#fbf9f1" fillOpacity=".95" /><text x="201" y="182" textAnchor="middle" fill={ink} fontSize="12" letterSpacing="3" fontFamily="Outfit, sans-serif">FORM</text><path d="M187 193H214" stroke={accent} />
      <path d="M163 120V148" stroke="white" strokeOpacity=".65" strokeWidth="4" strokeLinecap="round" /><path d="M284 233Q267 192 310 172Q319 211 284 233Z" fill={ink} fillOpacity=".65" />
    </>}
    {variant === 'retro-poster' && <>
      <path d="M0 0H400V320H0Z" fill={paper} /><path d="M0 243Q109 222 211 258T400 242V320H0Z" fill={accent} />
      <text x="29" y="69" fontFamily="Outfit, sans-serif" fontWeight="800" fontSize="48" letterSpacing="-2" fill={ink}>SLOW</text><text x="29" y="111" fontFamily="Outfit, sans-serif" fontWeight="800" fontSize="48" letterSpacing="-2" fill={ink}>WEEKEND.</text>
      <circle cx="319" cy="70" r="32" fill={accent} /><path d="m302 70 11 11 23-24" stroke={paper} strokeWidth="3" />
      <ellipse cx="229" cy="270" rx="82" ry="12" fill={ink} fillOpacity=".2" /><path d="M171 145H270L256 262H187Z" fill={ink} /><path d="M176 155H265L261 201H182Z" fill="#bf9c75" /><path d="M182 201H261L256 249H187Z" fill="#e4c9a2" />
      <path d="M246 157 267 122" stroke={accent} strokeWidth="7" strokeLinecap="round" /><path d="m191 162 18-6 9 20-18 6Zm37 2 17-7 9 18-17 8Z" fill={paper} fillOpacity=".7" />
      <text x="31" y="165" fill={ink} fontSize="11" fontFamily="Outfit, sans-serif" letterSpacing="2">TAKE IT EASY</text><path d="M31 178H109" stroke={ink} /><text x="31" y="296" fill={paper} fontSize="10" letterSpacing="3" fontFamily="Outfit, sans-serif">A LITTLE EVERYDAY JOY</text>
    </>}
    {variant === 'picture-book' && <>
      <circle cx="297" cy="65" r="33" fill="#f5c76c" /><path d="M0 173Q94 116 199 190T400 163V320H0Z" fill={accent} fillOpacity=".4" /><path d="M0 251Q105 173 228 232T400 230V320H0Z" fill={accent} />
      <path d="M292 320Q236 248 199 221Q175 207 164 198" stroke={paper} strokeWidth="28" />
      <path d="M80 221V112M65 167 80 184 101 156" stroke={ink} strokeWidth="7" strokeLinecap="round" /><ellipse cx="80" cy="109" rx="45" ry="65" fill={ink} fillOpacity=".85" />
      <path d="M312 237V169" stroke={ink} strokeWidth="5" /><ellipse cx="312" cy="156" rx="28" ry="40" fill={ink} fillOpacity=".6" />
      <path d="M171 219Q151 194 165 166L159 138 179 155 197 154 217 141 211 171Q224 201 203 221Z" fill="#e3aa69" /><path d="M171 218Q185 201 203 219" fill="#fff2d5" />
      <circle cx="178" cy="177" r="3" fill={ink} /><circle cx="199" cy="177" r="3" fill={ink} /><path d="m185 185 4 4 4-4" stroke={ink} strokeWidth="2" /><path d="M204 218Q247 225 225 189" stroke="#e3aa69" strokeWidth="13" strokeLinecap="round" />
      <path d="m123 71 8-4 8 4m20-19 7-4 7 4" stroke={ink} strokeOpacity=".6" strokeWidth="2" strokeLinecap="round" /><circle cx="42" cy="274" r="4" fill="#fff3b2" /><circle cx="333" cy="285" r="4" fill="#fff3b2" />
    </>}
    {variant === 'paper-cut' && <>
      <rect width="400" height="320" fill={ink} /><path d="M0 0H400V320H0ZM58 97C-8 183 97 304 215 284S395 176 340 82 119 18 58 97Z" fill={accent} fillRule="evenodd" /><path d="M0 0H400V320H0ZM83 92C20 155 67 260 191 271S368 174 329 102 151 24 83 92Z" fill={paper} fillOpacity=".5" fillRule="evenodd" transform="translate(0 -9)" />
      <path d="M0 0H400V320H0ZM80 66C1 115 15 272 172 296S395 218 359 95 161 16 80 66Z" fill={paper} fillRule="evenodd" />
      <circle cx="238" cy="119" r="31" fill="#f6d68c" /><path d="m83 245 80-105 64 83 41-40 56 62Z" fill={accent} /><path d="m103 262 82-76 65 66 32-20 25 30Z" fill={paper} fillOpacity=".7" />
      <path d="M96 267Q135 222 169 249T286 265" stroke={paper} strokeWidth="13" strokeLinecap="round" /><path d="M325 270V187M325 228Q296 220 297 201Q326 203 325 228ZM325 214Q346 204 348 188" stroke={paper} strokeWidth="4" strokeLinecap="round" />
    </>}
    {variant === 'film-photo' && <>
      <rect width="400" height="320" fill={ink} /><rect x="31" y="26" width="338" height="268" rx="3" fill={paper} />
      <rect x="42" y="37" width="316" height="237" fill="#c6cfc6" /><circle cx="292" cy="93" r="28" fill="#f1dfac" /><path d="M42 168 123 98 179 143 244 126 358 183V274H42Z" fill={accent} /><path d="M42 213 139 172 243 214 358 172V274H42Z" fill={ink} fillOpacity=".8" />
      <path d="M120 274 224 204 217 195 137 240 90 274" fill={paper} fillOpacity=".8" /><path d="M67 216V150M67 155 47 179H86ZM67 171 43 200H92Z" stroke={ink} fill={ink} strokeWidth="4" />
      <path d="M340 234V179M340 182 323 205H356Z" fill={ink} stroke={ink} strokeWidth="4" /><text x="316" y="260" fill="#e6b78e" fontSize="11" fontFamily="monospace" textAnchor="end">10 24 '26</text>
      {[50, 100, 150, 200, 250, 300].map(x => <g key={x}><rect x={x} y="8" width="23" height="9" rx="2" fill={paper} fillOpacity=".75" /><rect x={x} y="303" width="23" height="9" rx="2" fill={paper} fillOpacity=".75" /></g>)}
    </>}
    {variant === 'minimal-poster' && <>
      <path d="M31 36H369M31 282H369" stroke={ink} strokeOpacity=".4" /><text x="32" y="62" fontFamily="Outfit, sans-serif" fontSize="10" fill={ink} letterSpacing="2">LESS, BUT BETTER</text>
      <circle cx="290" cy="107" r="51" fill={accent} /><text x="25" y="176" fontFamily="Outfit, sans-serif" fontWeight="600" fontSize="92" fill={ink} letterSpacing="-5">Make</text><text x="25" y="248" fontFamily="Outfit, sans-serif" fontWeight="600" fontSize="92" fill={ink} letterSpacing="-5">space.</text>
      <text x="33" y="300" fontFamily="Outfit, sans-serif" fontSize="9" fill={ink} letterSpacing="2">ROOM FOR YOUR IDEAS</text><path d="M339 292H365M357 285 365 292 357 299" stroke={ink} strokeWidth="2" />
    </>}
    {variant === 'isometric-scene' && <>
      <rect width="400" height="320" fill={`url(#${uid}-bg)`} /><ellipse cx="202" cy="279" rx="116" ry="19" fill={ink} fillOpacity=".1" />
      <path d="m67 221 133-77 133 77-133 77Z" fill="#e0e7d2" /><path d="m67 221 133 77v13L67 234Z" fill={accent} fillOpacity=".7" /><path d="m200 298 133-77v13l-133 77Z" fill={ink} fillOpacity=".4" />
      <path d="m135 148 65-38 65 38v87l-65 37-65-37Z" fill="#f7f2e2" /><path d="m200 185 65-37v87l-65 37Z" fill="#ded9c5" />
      <path d="m122 150 78-80 78 80-78 45Z" fill={accent} /><path d="m200 70 78 80-78 45Z" fill={ink} fillOpacity=".28" />
      <path d="m156 193 22 13v30l-22-13Z" fill={ink} /><path d="m217 206 27-15v25l-27 15Z" fill={accent} /><path d="m230 199v25" stroke="#f7f2e2" strokeWidth="2" />
      <path d="M102 222V184M299 236V185" stroke={ink} strokeWidth="6" /><ellipse cx="102" cy="170" rx="23" ry="34" fill={accent} /><ellipse cx="299" cy="175" rx="23" ry="34" fill={ink} fillOpacity=".75" /><path d="m189 278 20-12 20 12-20 12Z" fill={paper} />
    </>}
  </svg>;
}

function StyleDialog({ style, children, onClose }) {
  const example = getStyleExample(style);
  const [showReference, setShowReference] = useState(false);
  useEffect(() => setShowReference(false), [style.id]);
  const dialog = useRef(null), close = useRef(null), closeAction = useRef(onClose);
  closeAction.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const root = document.getElementById('root');
    const wasInert = root?.inert;
    const previousOverflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => close.current?.focus({ preventScroll: true }));
    function containFocus(event) {
      // Existing OptionPicker renders outside the dialog; its popup remains usable.
      if (dialog.current?.contains(event.target) || event.target.closest?.('.picker-popover')) return;
      close.current?.focus({ preventScroll: true });
    }
    function keyboard(event) {
      if (event.defaultPrevented || event.target.closest?.('.picker-popover')) return;
      if (event.key === 'Escape') { event.preventDefault(); closeAction.current(); }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), [href], [tabindex="0"]')]
        .filter(node => node.getClientRects().length && !node.closest('[inert]'));
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keyboard);
    document.addEventListener('focusin', containFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', keyboard);
      document.removeEventListener('focusin', containFocus);
      if (root) root.inert = wasInert;
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<div className="style-dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="style-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="style-dialog-title" aria-describedby="style-dialog-description">
      <button ref={close} type="button" className="icon-button style-dialog-close" aria-label="关闭风格详情" onClick={onClose}><X size={20} /></button>
      <aside className="style-dialog-preview">
        <div className="style-preview-label"><Layers3 size={15} /> 风格预览 <span>{style.category}</span></div>
        {showReference && example?.referenceSrc
          ? <img className="style-artwork style-generated-example" src={example.referenceSrc} alt={example.referenceAlt || ('参考原图：' + style.name)} />
          : <StyleArtwork style={style} full />}
        {example?.referenceSrc && <div className="style-example-switch" role="group" aria-label="例图对照">
          <button type="button" aria-pressed={!showReference} onClick={() => setShowReference(false)}>实际生成结果</button>
          <button type="button" aria-pressed={showReference} onClick={() => setShowReference(true)}>参考原图</button>
        </div>}
        <div className="style-dialog-description"><h2 id="style-dialog-title">{style.name}</h2><p id="style-dialog-description">{style.description}</p><div className="style-tags">{style.tags.map(tag => <span key={tag}>{tag}</span>)}</div></div>
        {example?.referenceNote && <p className="style-example-note">{example.referenceNote}</p>}
        {example?.reviewNote && <p className="style-example-note">实测备注：{example.reviewNote}</p>}
        <div className="style-preview-disclaimer">{example ? <><span>Images2.5 真实例图 · v{style.version}</span><a className="style-original-link" href={example.originalSrc || example.fullSrc} target="_blank" rel="noreferrer">查看原图 <ArrowUpRight size={13} /></a></> : '风格示意，非模型实测效果'}</div>
      </aside>
      {children}
    </section>
  </div>, document.body);
}

export default function StyleMarket({ demo = false, optimizationAvailable = false, onChooseStyle, draft, groups, prepareStylePlan, onBack, onPrepared, addFiles, removeRef, notice, onClearNotice, referenceDropRef, subjectInputRef, dropState, blocked = false }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('全部');
  const [packageMode, setPackageMode] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [subject, setSubject] = useState(draft.prompt || '');
  const [title, setTitle] = useState('');
  const [settingsByStyle, setSettingsByStyle] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const submitLock = useRef(false), live = useRef(true), fileInput = useRef(null), heading = useRef(null);
  useEffect(() => { live.current = true; heading.current?.focus({ preventScroll: true }); return () => { live.current = false; }; }, []);
  const selected = STYLE_CATALOG.find(style => style.id === selectedId);
  const referenceOnly = selected?.inputMode === 'reference';
  const missingReference = referenceOnly && !draft.refs.length;
  const categories = ['全部', ...new Set(STYLE_CATALOG.map(style => style.category))];
  const search = query.trim().toLocaleLowerCase();
  const visible = STYLE_CATALOG.filter(style => (packageMode === 'all' || style.inputMode === packageMode) && (category === '全部' || style.category === category)
    && `${style.name} ${style.category} ${style.description} ${style.tags.join(' ')}`.toLocaleLowerCase().includes(search));
  const settings = selected ? settingsByStyle[selected.id] || { ...selected.defaultSettings, ratioWidth: '16', ratioHeight: '9', groupId: draft.groupId, styleOptimization: 'professional' } : null;
  let geometry, geometryError = '';
  if (settings) { try { geometry = resolveImageGeometry(settings.size, draftAspectRatio(settings)); } catch (issue) { geometryError = issue.message; } }
  const hasGroup = settings && groups.some(group => String(group.id) === String(settings.groupId));
  const invalidLength = (!referenceOnly && subject.trim().length > 1200) || (selected?.supportsTitle && title.length > 80);

  function chooseStyle(id) {
    if (submitLock.current) return;
    const next = STYLE_CATALOG.find(style => style.id === id);
    setSelectedId(id); setError('');
    setAnnouncement(`已选择${next.name}。${settingsByStyle[id] ? '沿用上次设置' : `推荐比例 ${next.defaultSettings.aspectRatio}`}，主体与标题草稿已保留。`);
  }
  function changeSettings(values) { setSettingsByStyle(previous => ({ ...previous, [selected.id]: { ...settings, ...values } })); setError(''); }
  function closeDetails() { setSelectedId(null); setError(''); }
  async function prepare(event) {
    event.preventDefault();
    if (submitLock.current || blocked) return;
    if (missingReference) { setError('先上传参考图，这个包不需要填写提示词。'); fileInput.current?.focus(); return; }
    if (!referenceOnly && !subject.trim()) { setError('先写下你想画的主体。'); subjectInputRef.current?.focus(); return; }
    if (invalidLength) { setError('主体最多 1200 字，标题最多 80 字，请缩短后再试。'); return; }
    if (!hasGroup) { setError('当前没有选中可用的生图分组。'); return; }
    if (geometryError) { setError(geometryError); return; }
    if (typeof prepareStylePlan !== 'function') { setError('风格方案接口暂未就绪，请稍后再试；已填写的内容会保留。'); return; }
    submitLock.current = true; setBusy(true); setError(''); onClearNotice();
    try {
      const result = await prepareStylePlan({ styleId: selected.id, styleVersion: selected.version, subject: referenceOnly ? '' : subject.trim(),
        title: selected.supportsTitle ? title.trim() : '', styleOptimization: optimizationAvailable ? settings.styleOptimization || 'professional' : 'template', size: settings.size, aspectRatio: geometry.aspectRatio, count: settings.count, groupId: settings.groupId });
      if (!live.current) return;
      if (!result?.ok) { setError(result?.error || '方案暂未创建成功，请重试。'); return; }
      setSelectedId(null);
      onPrepared(result);
    } catch (issue) { if (live.current) setError(issue.message || '方案暂未创建成功，请重试。'); }
    finally { submitLock.current = false; if (live.current) setBusy(false); }
  }

  return <main className="style-market" id="main-content" aria-label="风格市场">
    <div className="style-market-content">
      <button type="button" className="style-back" onClick={onBack}><ArrowLeft size={16} /> 返回创作</button>
      <h1 className="sr-only" ref={heading} tabIndex={-1}>风格市场</h1>
      <StyleMarketFilters catalog={STYLE_CATALOG} mode={packageMode} onModeChange={value => { setPackageMode(value); setCategory('全部'); }} category={category} onCategoryChange={setCategory} query={query} onQueryChange={setQuery} />
      {!selected && notice && <div className="style-inline-notice" role="status">{notice}<button type="button" className="icon-button" aria-label="关闭提示" onClick={onClearNotice}><X size={16} /></button></div>}
      {!selected && busy && <p className="style-inline-notice" role="status"><LoaderCircle size={16} className="spin" />正在整理方案，完成后可在当前创作中查看。</p>}
      {!selected && error && error !== notice && <p className="style-form-error" role="alert">{error}</p>}
      {visible.length ? <div className="style-card-grid">{visible.map(style => <article className="style-card" key={style.id} data-style-id={style.id}>
        <button type="button" className="style-card-select" aria-label={`使用${style.name}`} disabled={busy} onClick={() => onChooseStyle(style)}>
        <div className="style-card-cover"><StyleArtwork style={style} /><span className="style-card-mode">{style.inputMode === 'reference' ? '带参考图' : '不带参考图'}</span><span className="style-card-open" aria-hidden="true"><ArrowUpRight size={20} /></span></div>
        <div className="style-card-info"><h2>{style.name}</h2><p>{style.description}</p><div><span>{style.tags.slice(0, 2).join(' · ')}</span><span>{style.defaultSettings.aspectRatio}</span></div></div>
        </button><button type="button" className="style-card-details" aria-label={`查看${style.name}例图与设置`} onClick={() => chooseStyle(style.id)}>例图与设置 <ArrowUpRight size={12} /></button>
      </article>)}</div> : <div className="style-empty"><Search size={28} /><h2>没有找到匹配的风格</h2><p>试试“海报”“摄影”，或清除筛选看看全部风格。</p><button type="button" onClick={() => { setQuery(''); setCategory('全部'); setPackageMode('all'); }}>查看全部风格</button></div>}
      <p className="style-market-footnote"><SlidersHorizontal size={14} /> 点击卡片回到会话，在输入区随时移除风格标签。发送后先看方案，确认后才生成。</p>
    </div>
    {selected && <StyleDialog style={selected} onClose={closeDetails}>
      <form className="style-form" onSubmit={prepare} noValidate>
        <div className="style-form-heading"><span className="style-eyebrow">把风格变成你的作品</span><h3>{referenceOnly ? '上传图片，直接套用' : '你想画什么？'}</h3><p>{referenceOnly ? '无需填写提示词，保留原图主体并应用所选效果。' : '简单描述内容，我们会补齐这套风格的视觉要求。'}</p></div>
        <div className="style-form-scroll">
          <fieldset disabled={busy} className="style-form-fields">
            <div className="style-switch"><OptionPicker label="当前风格" value={selected.id} options={STYLE_CATALOG.map(style => ({ value: style.id, label: style.name }))} onChange={chooseStyle} /><span>切换时保留已填内容</span></div>
            {!referenceOnly && <>
            <div className="style-field-heading"><label htmlFor="style-subject">画面主体 <span>必填</span></label><button type="button" className="style-example" onClick={() => { setSubject(selected.example.subject); if (selected.supportsTitle) setTitle(selected.example.title || ''); setError(''); setAnnouncement('已填入示例内容，你可以继续修改。'); }}>填入示例内容 <ArrowUpRight size={13} /></button></div>
            <textarea id="style-subject" ref={subjectInputRef} className="style-subject" placeholder={selected.subjectPlaceholder} value={subject} onChange={event => { setSubject(event.target.value); setError(''); }} maxLength={1200} rows={3} aria-required="true" aria-describedby="style-subject-help" aria-invalid={subject.trim().length > 1200} />
            <div id="style-subject-help" className={`style-field-help${subject.trim().length > 1200 ? ' is-invalid' : ''}`}><span>描述主体、场景和需要保留的细节</span><span>{subject.length}/1200</span></div>
            </>}
            {referenceOnly && <p className="style-reference-instructions">选一张需要处理的图片。之前填写的文字草稿会保留，本次不使用；后台会按这套配方准备方案。</p>}
            {selected.supportsTitle ? <div className="style-title-field"><label htmlFor="style-title">画面标题 <span>选填</span></label><input id="style-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={80} placeholder={selected.example.title || '留空则不添加文字'} aria-describedby="style-title-help" /><p id="style-title-help" className="style-field-help">留空则不添加总标题 · 最多 80 字</p></div> : title && <p className="style-preserved-title">已保留标题“{title}”的草稿。本次不会使用该总标题，正文中的明确标签或对白按配方处理。</p>}
            <div className="style-upload" ref={busy ? null : referenceDropRef} data-file-drop={dropState}>
              <div className="style-field-heading"><label>参考图片 <span>{referenceOnly ? '必填' : '选填'}</span></label><span className="style-reference-count">{draft.refs.length}/4</span></div>
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="风格参考图片文件" onChange={event => { addFiles(event.target.files || []); event.target.value = ''; }} />
              {draft.refs.length > 0 && <div className="style-reference-list">{draft.refs.map((item, index) => <div key={item.objectUrl || item.mediaId}><img src={item.objectUrl || `/api/media/${item.mediaId}`} alt={item.name || `参考图 ${index + 1}`} /><button type="button" aria-label={`移除风格参考图 ${index + 1}`} onClick={() => removeRef(index)}><X size={14} /></button></div>)}</div>}
              <button type="button" className="style-upload-button" disabled={draft.refs.length >= 4} onClick={() => fileInput.current?.click()}><ImagePlus size={20} /><span>{draft.refs.length >= 4 ? '已添加 4 张参考图' : '添加参考图，或拖到这里'}<small>PNG / JPEG / WebP · 单张 ≤ 8 MB · 合计 ≤ 24 MB</small></span></button>
              {dropState === 'ready' && <span className="style-drop-hint">松开，添加参考图</span>}
              <p className="style-field-help">与当前创作共用参考图；不自动沿用历史图片。</p>
              {notice && notice !== error && <div className="style-inline-notice" role="status">{notice}<button type="button" className="icon-button" aria-label="关闭上传提示" onClick={onClearNotice}><X size={15} /></button></div>}
            </div>
            {optimizationAvailable && <StyleOptimization style={selected} value={settings.styleOptimization || 'professional'} onChange={styleOptimization => changeSettings({ styleOptimization })} disabled={busy} demo={demo} />}
            <div className="style-settings"><div className="style-field-heading"><span>生成设置</span><span className="style-recommended">推荐 {selected.defaultSettings.aspectRatio}</span></div><div className="style-settings-row"><OptionPicker label="尺寸" value={settings.size} options={['1K', '2K', '4K'].map(value => ({ value, label: value }))} onChange={size => changeSettings({ size })} /><div className="style-count"><span>张数</span><button type="button" aria-label="减少风格生图张数" disabled={settings.count <= 1} onClick={() => changeSettings({ count: settings.count - 1 })}>−</button><strong>{settings.count}</strong><button type="button" aria-label="增加风格生图张数" disabled={settings.count >= 4} onClick={() => changeSettings({ count: settings.count + 1 })}>+</button></div><OptionPicker label="计费分组" value={settings.groupId} options={groups.map(group => ({ value: group.id, label: group.name }))} onChange={groupId => changeSettings({ groupId })} /></div><ImageGeometry draft={settings} onChange={changeSettings} /></div>
          </fieldset>
          <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
        </div>
        <footer className="style-form-footer">
          {!hasGroup && <p className="style-form-error" role="alert">当前没有选中可用的生图分组，请选择分组或联系管理员开通。</p>}
          {error && <p className="style-form-error" role="alert">{error}</p>}
          <p>{busy ? '正在整理方案，可以关闭窗口稍后在创作记录中查看。' : blocked ? '当前创作正在处理，请稍候。' : missingReference ? '请先上传参考图，无需填写提示词。' : '先查看完整方案，确认后才生图并按中转计费。'}</p><button type="submit" className="style-prepare-button" disabled={busy || blocked || (!referenceOnly && !subject.trim()) || missingReference || invalidLength || !hasGroup || Boolean(geometryError)}>{busy ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}<span>{busy ? '正在准备方案…' : '查看生成方案'}</span>{!busy && <ArrowRight size={17} />}</button></footer>
      </form>
    </StyleDialog>}
  </main>;
}
