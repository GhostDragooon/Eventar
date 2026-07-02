'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

// App-wide toast system — replaces silent action results (rule 12: outcomes
// are always surfaced). Success = green tick, error = red, neutral = context.
// Announced via aria-live="polite" without stealing focus.

export type Toast = {
  id: number;
  tone: 'success' | 'error' | 'neutral';
  message: string;
};

type ToastContextValue = {
  toast: (tone: Toast['tone'], message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TOAST_MS = 4500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((tone: Toast['tone'], message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => dismiss(id), TOAST_MS);
  }, [dismiss]);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-md left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-xs items-center pointer-events-none px-md w-full max-w-[480px]"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex items-center gap-sm w-full rounded-[12px] bg-[#0A0A0A] text-white shadow-lg px-md py-sm text-[13px] font-medium"
          >
            <span
              aria-hidden
              className={`material-symbols-outlined text-[18px] shrink-0 ${
                t.tone === 'success' ? 'text-[#4ADE80]' : t.tone === 'error' ? 'text-[#F87171]' : 'text-white/60'
              }`}
            >
              {t.tone === 'success' ? 'check_circle' : t.tone === 'error' ? 'error' : 'info'}
            </span>
            <span className="flex-1 min-w-0">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 text-white/50 hover:text-white transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden>close</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
