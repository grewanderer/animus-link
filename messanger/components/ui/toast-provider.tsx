'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { createTranslator, defaultLocale, type Locale } from '@/lib/i18n';

export type ToastIntent = 'info' | 'success' | 'warn' | 'error';

export interface ToastOptions {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  intent?: ToastIntent;
  durationMs?: number;
  action?: { label: string; onSelect: () => void };
}

export type ToastRecord = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  intent: ToastIntent;
  durationMs: number;
  action?: { label: string; onSelect: () => void };
  createdAt: number;
};

type ToastContextValue = {
  push: (toast: ToastOptions) => string;
  dismiss: (id: string) => void;
  toasts: ToastRecord[];
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION = 6000;

const copy: Partial<Record<Locale, { defaultTitle: string; closeLabel: string }>> & {
  en: { defaultTitle: string; closeLabel: string };
} = {
  en: {
    defaultTitle: 'Notification',
    closeLabel: 'Close notification',
  },
  ru: {
    defaultTitle: 'Уведомление',
    closeLabel: 'Закрыть уведомление',
  },
  es: {
    defaultTitle: 'Notificación',
    closeLabel: 'Cerrar notificación',
  },
  'zh-CN': {
    defaultTitle: '通知',
    closeLabel: '关闭通知',
  },
  ja: {
    defaultTitle: '通知',
    closeLabel: '通知を閉じる',
  },
};

const makeId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
};

export function ToastProvider({ children, locale = defaultLocale }: { children: ReactNode; locale?: Locale }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef<Map<string, number>>(new Map());
  const t = createTranslator(locale, copy);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((toast: ToastOptions) => {
    const id = toast.id ?? makeId();
    setToasts((current) => {
      const next = current.filter((entry) => entry.id !== id);
      const record: ToastRecord = {
        id,
        title: toast.title ?? t('defaultTitle'),
        intent: toast.intent ?? 'info',
        durationMs: toast.durationMs ?? DEFAULT_DURATION,
        createdAt: Date.now(),
        description: toast.description,
        action: toast.action,
      };
      next.push(record);
      return next;
    });
    return id;
  }, [t]);

  useEffect(() => {
    const timeouts = timers.current;
    toasts.forEach((toast) => {
      if (toast.durationMs === Infinity) {
        return;
      }
      if (timeouts.has(toast.id)) {
        return;
      }
      const timeout = window.setTimeout(() => {
        timeouts.delete(toast.id);
        dismiss(toast.id);
      }, toast.durationMs ?? DEFAULT_DURATION);
      timeouts.set(toast.id, timeout);
    });
    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeouts.clear();
    };
  }, [toasts, dismiss]);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      dismiss: (id: string) => {
        const timeoutId = timers.current.get(id);
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timers.current.delete(id);
        }
        dismiss(id);
      },
      toasts,
    }),
    [push, dismiss, toasts],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport closeLabel={t('closeLabel')} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return {
    push: context.push,
    dismiss: context.dismiss,
  };
}

function ToastViewport({ closeLabel }: { closeLabel: string }) {
  const context = useContext(ToastContext);
  if (!context) {
    return null;
  }
  return (
    <div className="toast-viewport" role="status" aria-live="polite">
      {context.toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.intent}`}>
          <div className="toast__content">
            <strong className="toast__title">{toast.title}</strong>
            {toast.description ? <p className="toast__description">{toast.description}</p> : null}
          </div>
          <div className="toast__actions">
            {toast.action ? (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  context.dismiss(toast.id);
                  toast.action?.onSelect();
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              type="button"
              className="toast__close"
              onClick={() => context.dismiss(toast.id)}
              aria-label={closeLabel}
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
