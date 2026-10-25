import { useLayoutEffect, useRef } from 'react';

// One raised surface follows the selected item; the labels never move.
// Coordinates belong to the scroll content, so normal scrolling needs no JS loop.
export function useSelectionSurface(selectedKey, layoutKey, selector) {
  const containerRef = useRef(null);
  const surfaceRef = useRef(null);
  const bounds = useRef(null);
  const previousKey = useRef(selectedKey);
  const pointerTarget = useRef(null);

  function selectFrom(event, key) {
    pointerTarget.current = event.detail > 0 && key !== selectedKey ? key : null;
  }

  useLayoutEffect(() => {
    const container = containerRef.current;
    const surface = surfaceRef.current;
    const selected = container?.querySelector(selector);
    if (!container || !surface) return;
    if (!selected) {
      surface.hidden = true;
      bounds.current = null;
      previousKey.current = selectedKey;
      pointerTarget.current = null;
      return;
    }
    const measure = (animate = false) => {
      const next = [selected.offsetLeft, selected.offsetTop, selected.offsetWidth, selected.offsetHeight];
      // The full-screen editor temporarily removes the sidebar from layout.
      // Forget hidden geometry so reopening cannot animate from a zero-sized origin.
      if (!next[2] || !next[3]) {
        surface.hidden = true;
        bounds.current = null;
        return;
      }
      if (bounds.current?.every((value, index) => value === next[index])) return;
      surface.style.transitionDuration = animate && bounds.current ? '' : '0s';
      surface.style.width = `${next[2]}px`;
      surface.style.height = `${next[3]}px`;
      surface.style.transform = `translate(${next[0]}px, ${next[1]}px)`;
      surface.hidden = false;
      bounds.current = next;
    };
    measure(pointerTarget.current === selectedKey && previousKey.current !== selectedKey);
    previousKey.current = selectedKey;
    pointerTarget.current = null;
    const observer = new ResizeObserver(() => measure());
    observer.observe(container);
    for (const child of container.children) if (child !== surface) observer.observe(child);
    return () => observer.disconnect();
  }, [selectedKey, layoutKey, selector]);

  return { containerRef, surfaceRef, selectFrom };
}
