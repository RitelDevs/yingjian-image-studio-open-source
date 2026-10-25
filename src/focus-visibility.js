// One focus policy for the whole app, including dialogs rendered under document.body.
// Text inputs match :focus-visible after pointer focus too, so CSS alone cannot infer the input mode.
export function installFocusVisibility() {
  const root = document.documentElement;
  const setOrigin = value => { if (root.dataset.focusOrigin !== value) root.dataset.focusOrigin = value; };
  setOrigin('pointer');
  const pointer = () => setOrigin('pointer');
  const keyboard = event => {
    if (event.isComposing || event.altKey || event.metaKey || event.ctrlKey) return;
    const element = event.target instanceof Element ? event.target : null;
    const editing = element?.matches('textarea,input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]),[contenteditable="true"]');
    if (event.key === 'Tab' || !editing && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', ' '].includes(event.key)) setOrigin('keyboard');
  };
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('keydown', keyboard, true);
  return () => {
    document.removeEventListener('pointerdown', pointer, true);
    document.removeEventListener('keydown', keyboard, true);
    delete root.dataset.focusOrigin;
  };
}
