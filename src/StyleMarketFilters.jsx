import { useLayoutEffect, useRef } from 'react';
import { ImagePlus, Search, Type, X } from 'lucide-react';
import './style-market-filters.css';

// Public filter values remain compatible with the existing recipe input modes.
export default function StyleMarketFilters({ catalog, mode, onModeChange, category, onCategoryChange, query, onQueryChange }) {
  const scoped = mode === 'all' ? catalog : catalog.filter(style => style.inputMode === mode);
  const categories = ['全部', ...new Set(scoped.map(style => style.category))];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searched = scoped.filter(style => `${style.name} ${style.category} ${style.description} ${style.tags.join(' ')}`.toLocaleLowerCase().includes(normalizedQuery));
  const genreOptions = useRef(null);
  const genreIndicator = useRef(null);
  const indicatorBox = useRef(null);
  const animateSelection = useRef(false);
  // Counts and category sets can change with the search/reference-image filters.
  const genreLayoutKey = JSON.stringify(categories.map(item => [item, item === '全部' ? searched.length : searched.filter(style => style.category === item).length]));
  useLayoutEffect(() => {
    const container = genreOptions.current;
    const indicator = genreIndicator.current;
    const selected = container?.querySelector('button[aria-pressed="true"]');
    if (!container || !indicator || !selected) {
      if (indicator) indicator.hidden = true;
      indicatorBox.current = null;
      return;
    }
    const measure = (animate = false) => {
      const next = [selected.offsetLeft, selected.offsetTop, selected.offsetWidth, selected.offsetHeight];
      if (indicatorBox.current?.every((value, index) => value === next[index])) return;
      indicator.style.transitionDuration = animate && indicatorBox.current ? '' : '0s';
      indicator.style.width = `${next[2]}px`;
      indicator.style.height = `${next[3]}px`;
      indicator.style.transform = `translate(${next[0]}px, ${next[1]}px)`;
      indicator.hidden = false;
      indicatorBox.current = next;
    };
    measure(animateSelection.current);
    animateSelection.current = false;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    for (const button of container.querySelectorAll('button')) observer.observe(button);
    return () => observer.disconnect();
  }, [category, genreLayoutKey]);
  const modes = [
    { value: 'reference', label: '带参考图', hint: '上传图片开始', Icon: ImagePlus },
    { value: 'prompt', label: '不带参考图', hint: '从文字开始', Icon: Type }
  ];
  return <section className="market-filters" aria-label="风格筛选">
    <div className="market-filter-top">
      <div className="reference-choice" role="group" aria-label="参考图分类">
        <div className="reference-choice-options">{modes.map(({ value, label, hint, Icon }) => <button type="button" className="reference-choice-button" key={value} aria-pressed={mode === value} onClick={() => onModeChange(mode === value ? 'all' : value)}>
          <Icon size={19} strokeWidth={1.7} aria-hidden="true" /><span className="reference-choice-copy"><strong>{label}</strong><small>{hint}</small></span><span className="reference-choice-count">{catalog.filter(style => style.inputMode === value).length}</span>
        </button>)}</div>
      </div>
      <div className="market-filter-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="搜索风格" placeholder="搜索风格、题材或质感" value={query} onChange={event => onQueryChange(event.target.value)} />{query && <button type="button" aria-label="清空风格搜索" onClick={() => onQueryChange('')}><X size={15} /></button>}</div>
    </div>
    <div className="market-filter-genres"><span className="market-filter-label">题材</span><div className="market-genre-options" ref={genreOptions} role="group" aria-label="风格分类"><span className="market-genre-indicator" ref={genreIndicator} aria-hidden="true" />{categories.map(item => {
      const count = item === '全部' ? searched.length : searched.filter(style => style.category === item).length;
      return <button type="button" key={item} aria-pressed={category === item} onClick={event => { animateSelection.current = event.detail > 0; onCategoryChange(item); }}><span>{item}</span><small>{count}</small></button>;
    })}</div></div>
  </section>;
}
