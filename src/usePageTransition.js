import { useCallback, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import './page-transition.css';

const milliseconds = value => Number.parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000);
const motionFor = (from, to) => to === 'editor' ? 'editor-in' : from === 'editor' ? 'editor-out' : to === 'market' ? 'market-in' : 'market-out';
const entryTransform = mode => ({
  'market-in': 'perspective(1200px) translateX(3%) rotateY(-3deg) scale(.97)',
  'market-out': 'perspective(1200px) translateX(-3%) rotateY(3deg) scale(.97)',
  'editor-in': 'perspective(1200px) translateY(4%) rotateX(3deg) scale(.97)',
  'editor-out': 'perspective(1200px) translateY(-2%) scale(.97)'
})[mode];

// Animate the live panel so file drops and controls stay available throughout navigation.
export function usePageTransition(view) {
  const currentView = useRef(view);
  currentView.current = view;
  const running = useRef(null);
  const modality = useRef('pointer');
  const cancel = useCallback(() => {
    const previous = running.current;
    running.current = null;
    previous?.animation?.cancel();
    document.documentElement.removeAttribute('data-page-motion');
    return Boolean(previous);
  }, []);
  useEffect(() => {
    const pointer = () => { modality.current = 'pointer'; };
    const keyboard = () => { modality.current = 'keyboard'; cancel(); };
    const fileDrag = event => {
      if (event.dataTransfer && [...event.dataTransfer.types].includes('Files')) cancel();
    };
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('keydown', keyboard, true);
    window.addEventListener('dragenter', fileDrag, true);
    window.addEventListener('dragover', fileDrag, true);
    return () => {
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('keydown', keyboard, true);
      window.removeEventListener('dragenter', fileDrag, true);
      window.removeEventListener('dragover', fileDrag, true);
      cancel();
    };
  }, [cancel]);

  return useCallback((nextView, update) => {
    const from = currentView.current;
    const interrupted = cancel();
    // Commit navigation immediately; animation never delays requests, focus or route state.
    flushSync(update);
    if (from === nextView || interrupted || modality.current === 'keyboard') return;
    const element = document.querySelector(nextView === 'editor' ? '.image-editor:not([hidden])' : '.workspace-stage');
    if (typeof element?.animate !== 'function') return;
    const mode = motionFor(from, nextView);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = document.documentElement;
    const tokens = getComputedStyle(root);
    const request = { animation: null };
    running.current = request;
    root.setAttribute('data-page-motion', mode);
    request.animation = element.animate(reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: entryTransform(mode) }, { opacity: 1, transform: 'none' }], {
      duration: milliseconds(tokens.getPropertyValue(reduced ? '--page-fade-duration' : '--page-duration')),
      easing: tokens.getPropertyValue('--ease-out').trim(), fill: 'none'
    });
    request.animation.id = 'workspace-page-transition';
    const finish = () => { if (running.current === request) cancel(); };
    request.animation.finished.then(finish, finish);
  }, [cancel]);
}
