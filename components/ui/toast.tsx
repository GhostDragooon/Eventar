'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

// App-wide toast system — replaces silent action results (rule 12: outcomes
// are always surfaced). Success = green tick, error = red, neutral = context.
// Announced via aria-live="polite" without stealing focus.
// Motion (pattern 6): enters from translateY(100%), leaves with fade + translate
// for LEAVE_MS before removal. Reduced motion = fade only. A toast with an
// `action` link has no auto-timeout; it stays until dismissed.

export type Toast = {
  id: number;
  tone: 'success' | 'error' | 'neutral';
  message: string;
  action?: { label: string; href: string };
  leaving?: boolean;
};

type ToastContextValue = {
  toast: (tone: Toast['tone'], message: string, action?: Toast['action']) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const TOAST_MS = 4500;
const LEAVE_MS = 200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), LEAVE_MS);
  }, []);

  const toast = useCallback((tone: Toast['tone'], message: string, action?: Toast['action']) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, tone, message, action }]);
    if (!action) setTimeout(() => dismiss(id), TOAST_MS);
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
          <ToastItem key={t.id} t={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ t, onDismiss }: { t: Toast; onDismiss: (id: number) => void }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const shown = entered && !t.leaving;
  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-center gap-sm w-full rounded-[12px] bg-[#0A0A0A] text-white shadow-lg px-md py-sm text-[calc(13px*var(--text-scale))] font-medium transition-[opacity,translate] motion-reduce:translate-y-0 ${
        t.leaving ? 'duration-200 ease-in' : 'duration-250 ease-[cubic-bezier(0.32,0.72,0,1)]'
      } ${shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full'}`}
    >
      <span
        aria-hidden
        className={`material-symbols-outlined text-[calc(18px*var(--text-scale))] shrink-0 ${
          t.tone === 'success' ? 'text-[#4ADE80]' : t.tone === 'error' ? 'text-[#F87171]' : 'text-white/60'
        }`}
      >
        {t.tone === 'success' ? 'check_circle' : t.tone === 'error' ? 'error' : 'info'}
      </span>
      <span className="flex-1 min-w-0">{t.message}</span>
      {t.action && (
        <Link href={t.action.href} onClick={() => onDismiss(t.id)} className="shrink-0 underline underline-offset-2 hover:text-white/80">
          {t.action.label}
        </Link>
      )}
      <button
        type="button"
        onClick={() => onDismiss(t.id)}
        aria-label="Dismiss notification"
        className="shrink-0 text-white/50 hover:text-white transition-colors"
      >
        <span className="material-symbols-outlined text-[calc(16px*var(--text-scale))]" aria-hidden>close</span>
      </button>
    </div>
  );
}
