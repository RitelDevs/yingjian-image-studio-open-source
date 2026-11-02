// Resume through the adapter so the hidden-iframe check and /api/me reconcile
// the original workspace with the current central identity. No navigation/replay.
export function installStudioSessionReactivation({ window: win = window, document: doc = document, refresh }) {
  let disposed = false, queued = false;
  const resume = () => {
    if (disposed || doc.visibilityState === 'hidden' || queued) return;
    queued = true;
    queueMicrotask(() => {
      if (!disposed && doc.visibilityState !== 'hidden') void refresh();
      queued = false;
    });
  };
  const restored = event => { if (event.persisted) resume(); };
  win.addEventListener('focus', resume);
  win.addEventListener('pageshow', restored);
  doc.addEventListener('visibilitychange', resume);
  return { dispose() {
    disposed = true;
    win.removeEventListener('focus', resume);
    win.removeEventListener('pageshow', restored);
    doc.removeEventListener('visibilitychange', resume);
  } };
}
