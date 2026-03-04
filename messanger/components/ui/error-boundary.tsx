'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { createTranslator, defaultLocale, type Locale } from '@/lib/i18n';

type Props = {
  children: ReactNode;
  fallback?: (params: { error: Error; reset: () => void }) => ReactNode;
  locale?: Locale;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the error for observability/log aggregation.
    console.error('[frontend] error boundary caught', error, info?.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.reset });
      }
      const copy: Partial<
        Record<Locale, { label: string; title: string; unknownError: string; retry: string }>
      > & {
        en: { label: string; title: string; unknownError: string; retry: string };
      } = {
        en: {
          label: 'Animus · runtime error',
          title: 'Something went wrong',
          unknownError: 'Unknown error',
          retry: 'Try again',
        },
        ru: {
          label: 'Animus · ошибка выполнения',
          title: 'Что-то пошло не так',
          unknownError: 'Неизвестная ошибка',
          retry: 'Попробовать снова',
        },
        es: {
          label: 'Animus · error de ejecución',
          title: 'Algo salió mal',
          unknownError: 'Error desconocido',
          retry: 'Intentar de nuevo',
        },
        'zh-CN': {
          label: 'Animus · 运行时错误',
          title: '出现错误',
          unknownError: '未知错误',
          retry: '重试',
        },
        ja: {
          label: 'Animus · 実行時エラー',
          title: '問題が発生しました',
          unknownError: '不明なエラー',
          retry: '再試行',
        },
      };
      const t = createTranslator(this.props.locale ?? defaultLocale, copy);
      const errorMessage = this.state.error.message || t('unknownError');
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#040910] px-6 text-white">
          <div className="rounded-lg border border-white/10 bg-white/5 px-6 py-5 shadow-lg shadow-black/50">
            <p className="text-xs uppercase tracking-[0.32em] text-white/50">{t('label')}</p>
            <p className="text-lg font-semibold">{t('title')}</p>
            <p className="text-sm text-white/75">{errorMessage}</p>
            <button
              type="button"
              onClick={this.reset}
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white hover:border-white/25"
            >
              {t('retry')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
