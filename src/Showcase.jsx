import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight } from 'lucide-react';
import Brand from './Brand.jsx';
import './spatial-showcase.css';

const WORKS = [
  ['architecture', '空间，留给想象。', 'ARCHITECTURE / 空间探索', '01'],
  ['still-life', '日常，也有新意。', 'STILL LIFE / 静物叙事', '02'],
  ['landscape', '去没去过的远方。', 'LANDSCAPE / 自然风景', '03'],
  ['poster', '让一个想法出声。', 'GRAPHIC / 视觉表达', '04']
];

export default function Showcase({ children, authenticated, onEnter }) {
  const root = useRef(null);
  const stage = useRef(null);
  useEffect(() => {
    const section = stage.current;
    const words = section.querySelector('.manifesto-copy');
    const meta = section.querySelector('.manifesto-meta');
    const sticky = section.querySelector('.manifesto-sticky');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0, top = 0, distance = 1;
    const clamp = (n) => Math.min(1, Math.max(0, n));
    const phase = (p, start, end) => {
      const t = clamp((p - start) / (end - start));
      return t * t * (3 - 2 * t);
    };
    function paint() {
      frame = 0;
      const p = reduced.matches ? 0 : clamp((scrollY - top) / distance);
      const opening = reduced.matches ? 1 : phase(p, .04, .52);
      const entering = reduced.matches ? 0 : phase(p, .32, .94);
      const copy = phase(p, .04, .25);
      section.style.setProperty('--door-angle', `${opening * 104}deg`);
      section.style.setProperty('--portal-scale', String(1 + entering * 3.6));
      section.style.setProperty('--room-scale', String(1 + entering * .24));
      section.style.setProperty('--frame-opacity', String(1 - phase(p, .76, .96)));
      section.style.setProperty('--room-opacity', reduced.matches ? '.35' : '1');
      section.style.setProperty('--arrival-opacity', reduced.matches ? '0' : String(phase(p, .46, .68)));
      section.style.setProperty('--hint-opacity', String(1 - phase(p, .04, .18)));
      words.style.transform = `translate3d(0, ${-copy * 26}px, 0)`;
      words.style.opacity = String(1 - copy);
      meta.style.opacity = String(1 - phase(p, .12, .35));
      words.inert = copy >= .98;
      words.style.pointerEvents = copy >= .98 ? 'none' : '';
      section.dataset.portalState = reduced.matches ? 'static' : p < .04 ? 'closed' : p < .52 ? 'opening' : p < .94 ? 'entering' : 'entered';
    }
    function schedule() { if (!frame) frame = requestAnimationFrame(paint); }
    function measure() {
      const rect = section.getBoundingClientRect();
      top = rect.top + scrollY;
      distance = Math.max(1, rect.height - sticky.offsetHeight);
      schedule();
    }
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(section);
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', measure);
    reduced.addEventListener('change', measure);
    const reveal = new IntersectionObserver((items) => items.forEach((item) => {
      if (item.isIntersecting) { item.target.classList.add('is-revealed'); reveal.unobserve(item.target); }
    }), { threshold: .08 });
    root.current.querySelectorAll('.scroll-reveal').forEach((el) => reveal.observe(el));
    if (['#account-entry', '#showcase-works', '#showcase-workflow'].includes(location.hash)) {
      requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
    }
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); reveal.disconnect();
      removeEventListener('scroll', schedule); removeEventListener('resize', measure);
      reduced.removeEventListener('change', measure);
    };
  }, []);
  function enter() {
    if (authenticated) onEnter();
    else document.getElementById('account-entry')?.scrollIntoView({ behavior: 'auto' });
  }
  return <div className="showcase" id="explore" ref={root}>
    <a className="skip-link" href="#account-entry">跳到登录入口</a>
    <header className="showcase-header">
      <a className="showcase-brand" href="#explore" aria-label="映间首页"><Brand /></a>
      <nav aria-label="展示页导航"><a href="#showcase-works">灵感展厅 <span>01</span></a><a href="#showcase-workflow">创作方式 <span>02</span></a></nav>
      <button className="showcase-enter" onClick={enter}>{authenticated ? '进入工作台' : '登录 / 开始创作'}<ArrowUpRight size={18} /></button>
    </header>
    <section className="manifesto-stage" ref={stage} aria-label="映间创作空间">
      <div className="manifesto-sticky">
        <div className="manifesto-meta"><span>映间 / 在线图像创作</span><span>OPEN A DOOR TO YOUR IMAGINATION.</span></div>
        <div className="portal-scene" aria-hidden="true">
          <div className="portal-room">
            <div className="portal-ceiling" />
            <div className="portal-artworks">
              <div className="portal-print portal-print-left"><img src="/editorial/still-life.svg" alt="" width="900" height="1100" /></div>
              <div className="portal-print portal-print-center"><img src="/editorial/landscape.svg" alt="" width="900" height="1100" fetchPriority="high" /></div>
              <div className="portal-print portal-print-right"><img src="/editorial/poster.svg" alt="" width="900" height="1100" /></div>
            </div>
            <div className="portal-floor" />
          </div>
          <div className="portal-camera">
            <div className="portal-frame" />
            <div className="portal-door portal-door-left"><div className="portal-glass" /><span className="portal-handle" /></div>
            <div className="portal-door portal-door-right"><div className="portal-glass" /><span className="portal-handle" /></div>
            <div className="portal-threshold" />
          </div>
        </div>
        <div className="manifesto-copy">
          <h1><span>想象，</span><span>即刻<span className="type-highlight">成像</span>。</span></h1>
          <div className="manifesto-action"><p>从一句话开始。<br />把脑海里的画面，带到眼前。</p><button onClick={enter}>开始创作 <ArrowUpRight size={22} /></button></div>
        </div>
        <div className="portal-arrival" aria-hidden="true"><span>WELCOME TO YOUR CREATIVE SPACE</span><strong>走进想象。</strong></div>
        <div className="manifesto-bottom"><a href="#showcase-works"><ArrowDown size={16} /> 向下，走进灵感展厅</a><span>文字生图 / 参考图修改 / 连续创作</span></div>
      </div>
    </section>
    <section id="showcase-works" className="showcase-works">
      <div className="showcase-section-head scroll-reveal"><span className="editorial-label">01 / 灵感展厅</span><h2>一种想法。<br /><span>不止一种可能。</span></h2><p>无需从空白开始。<br />找一个方向，再把它变成你的。</p></div>
      <div className="showcase-work-grid">{WORKS.map(([image, title, detail, number]) => <button className="showcase-work scroll-reveal" key={image} onClick={enter}>
        <div className="showcase-work-image"><img src={`/editorial/${image}.svg`} alt={title} width={image === 'architecture' ? 1600 : 900} height="1100" loading="lazy" /><span className="work-corner"><ArrowUpRight size={27} /></span></div>
        <div className="showcase-work-title"><div><small>{detail}</small><h3>{title}</h3></div><span>{number}</span></div>
      </button>)}</div>
      <p className="showcase-disclaimer">原创灵感插画，仅作创作方向示意。实际生成结果取决于提示词与模型。</p>
    </section>
    <section id="showcase-workflow" className="showcase-workflow">
      <div className="workflow-heading scroll-reveal"><span className="editorial-label">02 / 创作方式</span><h2>少一点操作。<br />多一点<span>想象。</span></h2><button onClick={enter}>进入创作空间 <ArrowRight size={24} /></button></div>
      <ol>{[
        ['01', '写下画面。', '描述你想看到的内容，也可以上传一张参考图。'],
        ['02', '继续打磨。', '选择生成结果，通过对话调整光线、颜色与细节。'],
        ['03', '随时接续。', '同账号换设备查看。提示词、参考图和作品保留 7 天。']
      ].map(([number, title, description]) => <li key={number} className="scroll-reveal"><span>{number}</span><div><h3>{title}</h3><p>{description}</p></div></li>)}</ol>
    </section>
    <section id="account-entry" className="showcase-account">{authenticated ? <div className="showcase-return"><span className="editorial-label">YOUR NEXT IDEA STARTS HERE</span><h2>轮到你了。</h2><button className="showcase-enter" onClick={onEnter}>回到工作台 <ArrowUpRight size={24} /></button></div> : children}</section>
    <footer className="showcase-bottom"><a href="#explore" aria-label="回到映间首页"><Brand /></a><span>想象没有边界。画面由你定义。</span><a href="#explore">回到顶部 <ArrowUpRight size={16} /></a></footer>
  </div>;
}
