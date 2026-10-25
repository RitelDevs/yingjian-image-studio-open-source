import { useRef, useState } from 'react';

export default function EditableAdjustmentValue({ definition, value, editor, disabled, onIssue }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const session = useRef(null);
  const button = useRef(null);
  const live = useRef(editor); live.current = editor;
  const { key, label, min, max, step = 1 } = definition;
  const number = raw => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim()) && Number.isFinite(Number(raw)) ? Number(raw) : null;
  const normalize = value => Math.max(min, Math.min(max, Math.round(value / step) * step));
  function isCurrent() {
    const state = live.current.document;
    return session.current && state?.documentId === session.current.documentId && state?.revision === session.current.baseRevision;
  }
  function begin() {
    if (disabled || !editor.document) return;
    session.current = { documentId: editor.document.documentId, baseRevision: editor.document.revision };
    try {
      // Reserve an uncommitted gesture so a late AI reply cannot replace an in-progress number.
      editor.previewOperations([{ type: 'setAdjustments', values: { [key]: value } }]);
      setText(String(value)); setEditing(true);
    } catch (error) { session.current = null; onIssue(error.message); }
  }
  function update(raw) {
    setText(raw);
    const parsed = number(raw);
    if (parsed === null || parsed < min || parsed > max || !isCurrent()) return;
    try { live.current.previewOperations([{ type: 'setAdjustments', values: { [key]: normalize(parsed) } }]); }
    catch (error) { onIssue(error.message); }
  }
  function finish(cancel = false, restoreFocus = false) {
    if (!session.current) return;
    try {
      if (isCurrent()) {
        const parsed = number(text);
        if (cancel || parsed === null) live.current.cancelPreview();
        else live.current.commitOperations([{ type: 'setAdjustments', values: { [key]: normalize(parsed) } }], {
          ...session.current, actor: 'manual', label: `输入${label}`
        });
      }
    } catch (error) { if (isCurrent()) live.current.cancelPreview(); onIssue(error.message); }
    finally {
      session.current = null; setEditing(false);
      if (restoreFocus) requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
    }
  }
  const parsed = number(text);
  return editing ? <input className="ed-value-input" type="text" inputMode="decimal" autoComplete="off" spellCheck="false"
    aria-label={`${label}数值`} aria-invalid={parsed === null || parsed < min || parsed > max}
    title={`${min} 至 ${max}；回车确认，Esc 取消`} value={text}
    ref={node => { if (node && document.activeElement !== node) { node.focus({ preventScroll: true }); node.select(); } }}
    onChange={event => update(event.target.value)} onBlur={() => finish()}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); finish(event.key === 'Escape', true);
      }
    }} /> : <button ref={button} className="ed-value-button" type="button" disabled={disabled}
    aria-label={`编辑${label}数值`} title={`点击输入${label}（${min} 至 ${max}）`} onClick={begin}>{value > 0 ? '+' : ''}{value}</button>;
}
