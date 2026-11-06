import './Toast.css';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * Toasts replace window.alert(): non-blocking, styled to the workspace.
 *
 *   const toast = useToast();
 *   toast.error('Start time is invalid.');
 *   toast.success('Exported subtitles.srt');
 *   toast.info('Video restored', { action: { label: 'Undo', onClick } });
 */
const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const push = useCallback((tone, message, opts = {}) => {
    const id = nextId++;
    const duration = opts.duration ?? (tone === 'error' ? 6000 : 3500);
    setToasts(t => [...t.slice(-3), { id, tone, message, action: opts.action }]);
    if (duration > 0) timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    info: (m, o) => push('info', m, o),
    success: (m, o) => push('success', m, o),
    warn: (m, o) => push('warn', m, o),
    error: (m, o) => push('error', m, o),
    dismiss,
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ws-toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`ws-toast ${t.tone}`}>
            <span className="msg">{t.message}</span>
            {t.action && (
              <button className="ws-toast-action" onClick={() => { t.action.onClick(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
            <button className="ws-toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const noop = () => {};
const fallback = { info: noop, success: noop, warn: noop, error: noop, dismiss: noop };

export function useToast() {
  return useContext(ToastContext) || fallback;
}
