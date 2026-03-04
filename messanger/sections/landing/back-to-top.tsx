'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { createTranslator, type Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const labels: Partial<Record<Locale, { label: string; ariaLabel: string }>> & {
  en: { label: string; ariaLabel: string };
} = {
  en: { label: 'Up', ariaLabel: 'Back to top' },
  ru: { label: 'Вверх', ariaLabel: 'Наверх' },
  es: { label: 'Arriba', ariaLabel: 'Volver arriba' },
  'zh-CN': { label: '顶部', ariaLabel: '返回顶部' },
  ja: { label: '上へ', ariaLabel: 'ページ先頭へ戻る' },
};

export function BackToTop({ locale }: { locale: Locale }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => {
      setVisible(window.scrollY > 480);
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update);
    };
  }, []);

  const handleClick = () => {
    const prefersReducedMotion = Boolean(
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
    );
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });

    if (window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  };

  const t = createTranslator(locale, labels);

  return (
    <div
      className={cn(
        'fixed right-5 z-40 transition-all',
        'bottom-5',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
      style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
      aria-hidden={!visible}
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="border border-white/15 bg-white/5 text-white/80 backdrop-blur hover:bg-white/10 hover:text-white"
        onClick={handleClick}
        tabIndex={visible ? 0 : -1}
        aria-label={t('ariaLabel')}
      >
        {t('label')}
      </Button>
    </div>
  );
}
