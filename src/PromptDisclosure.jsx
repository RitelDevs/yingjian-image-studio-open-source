import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import './prompt-disclosure.css';

export default function PromptDisclosure({ text, label = '提示词', children }) {
  const id = useId(), measure = useRef(null), [open, setOpen] = useState(false), [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const node = measure.current;
    const check = () => setOverflow(node.scrollHeight > parseFloat(getComputedStyle(node).lineHeight) * 2 + 2 || Boolean(children));
    check(); const observer = new ResizeObserver(check); observer.observe(node); return () => observer.disconnect();
  }, [text, children]);
  return <div className={`prompt-disclosure${open ? ' is-open' : ''}${overflow ? ' has-overflow' : ''}`}>
    <div className="prompt-disclosure-preview" id={id}>
      <p ref={measure} className="confirmation-prompt">{text}</p>
      {open && children}
    </div>
    {overflow && <button type="button" className="prompt-disclosure-toggle" aria-expanded={open} aria-controls={id} aria-label={`${open ? '收起' : '展开'}${label}`} onClick={() => setOpen(v => !v)}><span>{open ? '收起' : `展开${label}`}</span><ChevronDown size={14} /></button>}
  </div>;
}
