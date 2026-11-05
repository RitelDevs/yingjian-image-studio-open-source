import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ImagePlus, Library, LoaderCircle, Search, Shirt, PersonStanding, X, ArrowUpRight } from 'lucide-react';
import './reference-library.css';

export default function ReferenceLibrary({ onBack, onImport, existingCount, blocked }) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[kind,setKind]=useState('pose'),[query,setQuery]=useState(''),[collection,setCollection]=useState('全身单人・标准系'),[category,setCategory]=useState('全部'),[angle,setAngle]=useState('正面'),[limit,setLimit]=useState(36),[detail,setDetail]=useState(null),[selection,setSelection]=useState([]),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  const scroll=useRef(null),heading=useRef(null),live=useRef(true),importing=useRef(false);
  useEffect(()=>{ live.current=true;return()=>{live.current=false;}; },[]);
  useEffect(()=>{const controller=new AbortController();setError('');fetch('/reference-library/catalog.json',{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error('本地参考图库尚未连接，请重新加载。');return r.json();}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>controller.abort();},[retry]);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[]);
  const remaining=Math.max(0,4-existingCount);
  const base=useMemo(()=>data?.items.filter(item=>item.kind===kind)||[],[data,kind]);
  const collections=[...new Set(base.map(item=>item.collection))];
  const categories=['全部',...new Set(base.filter(item=>collection==='全部'||item.collection===collection).map(item=>item.category))];
  const filtered=useMemo(()=>{const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);return base.filter(item=>(collection==='全部'||item.collection===collection)&&(category==='全部'||item.category===category)&&terms.every(term=>`${item.code} ${item.name} ${item.keywords} ${item.category}`.toLowerCase().includes(term)));},[base,collection,category,query]);
  const viewFor=item=>item.views.find(v=>v.label===angle)||item.views[0];
  const chosen=view=>selection.some(x=>x.view.id===view.id);
  function reset(){setLimit(36);setDetail(null);scroll.current?.scrollTo({top:0});}
  function changeKind(value){setKind(value);setCollection(value==='pose'?'全身单人・标准系':'全部');setCategory('全部');setQuery('');reset();}
  function select(item,view){
    setError('');if(chosen(view)){setSelection(current=>current.filter(x=>x.view.id!==view.id));return;}
    if(selection.length>=remaining){setError(`当前创作已有 ${existingCount} 张参考图，还可以选 ${remaining} 张。`);return;}
    setSelection(current=>[...current,{item,view}]);
  }
  async function submit(){
    if(importing.current||!selection.length||blocked)return;
    importing.current=true;setBusy(true);setError('');
    try{
      const files=await Promise.all(selection.map(async({item,view})=>{
        const r=await fetch(view.image);if(!r.ok)throw new Error('参考图片读取失败，请重试。');const blob=await r.blob();
        if(!['image/jpeg','image/png','image/webp'].includes(blob.type)||!blob.size||blob.size>8*1024*1024)throw new Error('参考图格式或大小不符合要求。');
        return new File([blob],`${item.kind==='pose'?'姿势':'服装'}-${view.id}.webp`,{type:blob.type});
      }));
      if(live.current)await onImport(files,selection);
    }catch(e){if(live.current)setError(e.message);}finally{importing.current=false;if(live.current)setBusy(false);}
  }
  return <main className="reference-library" id="main-content" aria-label="参考图库" onKeyDown={event=>{if(event.key==='Escape'&&detail){event.stopPropagation();setDetail(null);}}}>
    <div className="rl-scroll" ref={scroll}>
      <div className="rl-heading"><button type="button" className="rl-back" onClick={onBack}><ArrowLeft size={16}/>返回创作</button><div className="rl-heading-row"><div><p className="rl-eyebrow">REFERENCE LIBRARY</p><h1 ref={heading} tabIndex={-1}>让想象，有所参考。</h1><p>选一个动作，搭一套穿着，带回你的创作。</p></div><span className="rl-local"><span/>已连接本地素材</span></div></div>
      <div className="rl-tools"><div className="rl-tabs" role="group" aria-label="参考素材类型"><button type="button" aria-pressed={kind==='pose'} onClick={()=>changeKind('pose')}><PersonStanding size={18}/>姿势<span>{data?.poseCount||'—'}</span></button><button type="button" aria-pressed={kind==='costume'} onClick={()=>changeKind('costume')}><Shirt size={18}/>服装<span>{data?.costumeCount||'—'}</span></button></div><label className="rl-search"><Search size={17}/><input type="search" aria-label="搜索参考素材" value={query} placeholder={kind==='pose'?'搜索动作、分类或编号…':'搜索英文款式、颜色或编号…'} onChange={e=>{setQuery(e.target.value);reset();}}/></label></div>
      <div className="rl-filters"><div className="rl-filter-row" role="group" aria-label="素材分组">{(kind==='pose'?collections:['全部']).map(value=><button type="button" key={value} aria-pressed={collection===value} onClick={()=>{setCollection(value);setCategory('全部');reset();}}>{value.replace('全身单人・','').replace('单人','')}</button>)}{kind==='pose'&&<span className="rl-angle"><span>视角</span><select aria-label="姿势视角" value={angle} onChange={e=>setAngle(e.target.value)}>{['正面','俯视','仰视','侧面','斜侧'].map(a=><option key={a}>{a}</option>)}</select></span>}</div><div className="rl-categories" role="group" aria-label="素材分类">{categories.map(value=><button type="button" key={value} aria-pressed={category===value} onClick={()=>{setCategory(value);reset();}}>{value}</button>)}</div></div>
      <div className="rl-count" aria-live="polite"><span>{data?`${filtered.length} ${kind==='pose'?'组姿势':'套服装'}`:'正在连接素材…'}</span><span>{kind==='pose'?'每组可切换多个视角':'点击卡片查看穿搭细节'}</span></div>
      {error&&<div className="rl-error" role="alert">{error}{!data&&<button type="button" onClick={()=>setRetry(x=>x+1)}>重新加载</button>}</div>}
      {!data&&!error&&<div className="rl-empty"><LoaderCircle className="spin"/>正在读取本地图库…</div>}
      <div className={`rl-content${detail?' has-detail':''}`}><div><div className="rl-grid">{filtered.slice(0,limit).map(item=>{const view=viewFor(item),selected=chosen(view);return <article className={`rl-card${selected?' selected':''}`} key={item.id}><button type="button" className="rl-card-open" onClick={()=>{setDetail({item,view});setError('');}} aria-label={`查看 ${item.name}`}><div className="rl-art"><img src={view.thumb} alt={`${item.name} · ${view.label}`} loading="lazy" decoding="async" width="300" height="360"/><span className="rl-code">{item.code}</span><span className="rl-open-icon"><ArrowUpRight size={17}/></span></div><div className="rl-card-meta"><h2>{item.name}</h2><p>{kind==='pose'?`${item.category} · ${view.label}`:item.keywords}</p></div></button><button type="button" className="rl-pick" aria-label={`${selected?'取消选择':'选择'} ${view.id}`} aria-pressed={selected} onClick={()=>select(item,view)}>{selected?<Check size={15}/>:<PlusIcon/>}<span>{selected?'已选':'选作参考'}</span></button></article>;})}</div>{data&&!filtered.length&&<div className="rl-empty"><Search size={25}/><p>没有找到匹配的参考</p><button type="button" onClick={()=>{setQuery('');setCategory('全部');}}>清除搜索和分类</button></div>}{limit<filtered.length&&<button type="button" className="rl-more" onClick={()=>setLimit(x=>x+36)}>加载更多<span>{Math.min(limit,filtered.length)} / {filtered.length}</span></button>}</div>
      {detail&&<aside className="rl-detail" aria-label="参考素材详情"><header><span>{detail.item.code} · {detail.view.label}</span><button type="button" className="icon-button" aria-label="关闭参考详情" onClick={()=>setDetail(null)}><X size={18}/></button></header><img className="rl-detail-image" src={detail.view.image} alt={`${detail.item.name} · ${detail.view.label}`}/><h2>{detail.item.name}</h2><p>{detail.item.kind==='pose'?detail.item.category:detail.item.keywords}</p>{detail.item.views.length>1&&<div className="rl-view-options" role="group" aria-label="切换参考视角">{detail.item.views.map(v=><button type="button" key={v.id} aria-pressed={v.id===detail.view.id} onClick={()=>setDetail(current=>({...current,view:v}))}><img src={v.thumb} alt=""/>{v.label}</button>)}</div>}<button type="button" className="rl-detail-pick" onClick={()=>select(detail.item,detail.view)}>{chosen(detail.view)?<Check size={17}/>:<ImagePlus size={17}/>} {chosen(detail.view)?'已加入待选':'选作参考图'}</button><small>来源：ギア · @giaaibusi<br/>POSE-DB-01 / COSTUME-DB-01</small></aside>}</div>
      <footer className="rl-source">素材：<a href="https://x.com/giaaibusi" target="_blank" rel="noreferrer">ギア @giaaibusi</a> · 中文姿势：Anhao · <a href="https://github.com/aaa8221953/pose-gallery" target="_blank" rel="noreferrer">姿势源码</a> / <a href="https://github.com/aaa8221953/costume-gallery" target="_blank" rel="noreferrer">服装源码</a></footer>
    </div>
    <div className="rl-selection"><div className="rl-selection-info"><Library size={20}/><div><strong>{selection.length?`已选 ${selection.length} 张参考`:'从一个动作开始'}</strong><span>{existingCount?`当前创作已有 ${existingCount} 张，还能添加 ${remaining} 张`:'可组合姿势、视角和服装，最多 4 张'}</span></div></div><div className="rl-selected-images">{selection.map(({item,view})=><button type="button" key={view.id} aria-label={`移除 ${view.id}`} title={`${item.name} · ${view.label}`} onClick={()=>select(item,view)}><img src={view.thumb} alt={item.name}/><span><X size={12}/></span></button>)}</div><button type="button" className="rl-import" onClick={submit} disabled={!selection.length||selection.length>remaining||busy||blocked}>{busy?<LoaderCircle size={17} className="spin"/>:<ArrowRight size={17}/>}带回创作{selection.length>0&&<span>{selection.length}</span>}</button></div>
  </main>;
}
function PlusIcon(){return <ImagePlus size={15}/>;}
