import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export default function OptionPicker({ label, value, options, onChange, grid = false, className = '' }) {
  const id = useId();
  const trigger = useRef(null), panel = useRef(null), optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState(null);
  const typed = useRef({ text: '', time: 0 });
  const selected = options.findIndex(option => String(option.value) === String(value));
  const chosen = options[selected];

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }
  function show(last = false) {
    if (!options.length) return;
    setActive(selected >= 0 ? selected : last ? options.length - 1 : 0);
    setPosition(null);
    setOpen(true);
  }
  function commit(index) {
    onChange(options[index].value);
    close(true);
  }

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const anchor = trigger.current?.getBoundingClientRect(), menu = panel.current;
      if (!anchor || !menu) return;
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft || 0) + 12;
      const topEdge = (viewport?.offsetTop || 0) + 12;
      const rightEdge = leftEdge + (viewport?.width || innerWidth) - 24;
      const bottomEdge = topEdge + (viewport?.height || innerHeight) - 24;
      const width = Math.min(grid ? 264 : 224, rightEdge - leftEdge);
      const desiredHeight = Math.min(menu.scrollHeight + 2, 340);
      const above = Math.max(0, anchor.top - topEdge - 8), below = Math.max(0, bottomEdge - anchor.bottom - 8);
      const up = above >= desiredHeight || above > below;
      const maxHeight = Math.max(1, Math.min(340, up ? above : below));
      const height = Math.min(desiredHeight, maxHeight);
      const next = {
        left: Math.min(Math.max(anchor.left, leftEdge), rightEdge - width),
        top: Math.max(topEdge, up ? anchor.top - 8 - height : anchor.bottom + 8),
        width, maxHeight, side: up ? 'above' : 'below'
      };
      setPosition(previous => previous && Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
    }
    place();
    const observer = new ResizeObserver(place);
    observer.observe(trigger.current); observer.observe(panel.current);
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      observer.disconnect(); window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true);
      window.visualViewport?.removeEventListener('resize', place); window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [open, grid]);

  useLayoutEffect(() => {
    if (open && position) optionRefs.current[active]?.focus({ preventScroll: true });
  }, [open, active, Boolean(position)]);

  useEffect(() => {
    if (!open) return;
    const outside = event => {
      if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) close();
    };
    const focusOutside = event => {
      if (!trigger.current?.contains(event.target) && !panel.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', focusOutside);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', focusOutside); };
  }, [open]);

  function navigate(event) {
    let next = active;
    if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
    if (event.key === 'Tab') { close(true); return; }
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); commit(active); return; }
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else if (event.key === 'ArrowDown') next = Math.min(options.length - 1, active + (grid ? 3 : 1));
    else if (event.key === 'ArrowUp') next = Math.max(0, active - (grid ? 3 : 1));
    else if (event.key === 'ArrowRight' && grid) next = Math.min(options.length - 1, active + 1);
    else if (event.key === 'ArrowLeft' && grid) next = Math.max(0, active - 1);
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.time < 700 ? typed.current.text : '') + event.key.toLowerCase(), time: now };
      const found = options.findIndex(option => option.label.toLowerCase().startsWith(typed.current.text));
      if (found >= 0) next = found;
    } else return;
    event.preventDefault(); setActive(next);
    optionRefs.current[next]?.scrollIntoView({ block: 'nearest' });
  }

  return <div className={`option-picker ${className}`}>
    <span className="picker-label">{label}</span>
    <button ref={trigger} type="button" className="picker-trigger" aria-label={label} aria-describedby={`${id}-value`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} disabled={!options.length}
      onClick={() => open ? close() : show()}
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); show(event.key === 'ArrowUp'); } }}>
      <span id={`${id}-value`}>{chosen?.label || '请选择'}</span><ChevronDown size={13} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={panel} className={`picker-popover ${grid ? 'picker-popover-grid' : ''} ${position ? 'is-positioned' : ''}`} data-side={position?.side}
      style={{ left: position?.left ?? 0, top: position?.top ?? 0, width: position?.width ?? (grid ? 264 : 224), maxHeight: position?.maxHeight ?? 340, visibility: position ? 'visible' : 'hidden' }}>
      <div className="picker-heading">{label}</div>
      <div id={id} role="listbox" aria-label={label} className="picker-options" onKeyDown={navigate}>
        {options.map((option, index) => <button key={option.value} ref={element => { optionRefs.current[index] = element; }} type="button" role="option" aria-label={option.label} aria-selected={index === selected}
          tabIndex={index === active ? 0 : -1} className="picker-option" onFocus={() => setActive(index)} onClick={() => commit(index)}>
          {option.icon && <span className="picker-option-icon" aria-hidden="true">{option.icon}</span>}
          <span className="picker-option-label">{option.label}</span>
          {index === selected && <Check className="picker-check" size={14} aria-hidden="true" />}
        </button>)}
      </div>
    </div>, document.body)}
  </div>;
}
