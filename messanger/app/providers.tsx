'use client';

import type { ReactNode } from 'react';

import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ToastProvider } from '@/components/ui/toast-provider';
import type { Locale } from '@/lib/i18n';

export function AppProviders({ children, locale }: { children: ReactNode; locale: Locale }) {
  return (
    <ToastProvider locale={locale}>
      <ErrorBoundary locale={locale}>{children}</ErrorBoundary>
    </ToastProvider>
  );
}
