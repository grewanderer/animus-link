'use client';

import { useCallback, useEffect, useRef } from 'react';

import type {
  FrameNode,
  FrameOptions,
  FrameSceneController,
  FrameStatus,
  FrameVariant,
} from './init-scene';
import { initScene } from './init-scene';
import { createTranslator, defaultLocale, type Locale } from '@/lib/i18n';

export type FrameRootProps = {
  nodes: FrameNode[];
  statuses: FrameStatus[];
  logoSrc?: string;
  variant?: FrameVariant;
  onAction?: FrameOptions['onAction'];
  onCoreAction?: FrameOptions['onCoreAction'];
  locale?: Locale;
};

export function FrameRoot({
  nodes,
  statuses,
  logoSrc,
  variant,
  onAction,
  onCoreAction,
  locale = defaultLocale,
}: FrameRootProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<FrameSceneController | null>(null);
  const latestDataRef = useRef<{ nodes: FrameNode[]; statuses: FrameStatus[] }>({
    nodes,
    statuses,
  });
  const copy: Partial<
    Record<Locale, { canvasLabel: string; navLabel: string; coreLabel: string; coreSub: string }>
  > & {
    en: { canvasLabel: string; navLabel: string; coreLabel: string; coreSub: string };
  } = {
    en: {
      canvasLabel: 'Animus visualization',
      navLabel: 'Primary controls',
      coreLabel: 'Tools',
      coreSub: 'Control center',
    },
    ru: {
      canvasLabel: 'Визуализация Animus',
      navLabel: 'Основные инструменты',
      coreLabel: 'Инструменты',
      coreSub: 'Центр управления',
    },
    es: {
      canvasLabel: 'Visualización de Animus',
      navLabel: 'Controles principales',
      coreLabel: 'Herramientas',
      coreSub: 'Centro de control',
    },
    'zh-CN': {
      canvasLabel: 'Animus 可视化',
      navLabel: '主要控制',
      coreLabel: '工具',
      coreSub: '控制中心',
    },
    ja: {
      canvasLabel: 'Animus 可視化',
      navLabel: '主要コントロール',
      coreLabel: 'ツール',
      coreSub: 'コントロールセンター',
    },
  };
  const t = createTranslator(locale, copy);

  useEffect(() => {
    latestDataRef.current = { nodes, statuses };
    controllerRef.current?.update(latestDataRef.current);
  }, [nodes, statuses]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) {
      return;
    }

    let disposed = false;
    let controller: FrameSceneController | null = null;

    initScene({
      canvas,
      root,
      nodes: latestDataRef.current.nodes,
      statuses: latestDataRef.current.statuses,
      logoSrc,
      variant,
      onAction,
      onCoreAction,
    })
      .then((instance) => {
        if (disposed) {
          instance.dispose();
          return;
        }
        controller = instance;
        controllerRef.current = instance;
        controller.update(latestDataRef.current);
      })
      .catch((error) => {
        console.log('[frame] failed to initialise scene', error);
      });

    return () => {
      disposed = true;
      controllerRef.current = null;
      controller?.dispose();
    };
  }, [logoSrc, variant, onAction, onCoreAction]);

  const preventFocusTrap = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (!rootRef.current) {
      return;
    }
    const interactive = rootRef.current.dataset.interactive === 'true';
    if (!interactive) {
      event.preventDefault();
      rootRef.current.focus({ preventScroll: true });
    }
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        data-frame-canvas="scene"
        aria-label={t('canvasLabel')}
        className={variant === 'decorative' ? 'pointer-events-none' : undefined}
      />
      <div
        ref={rootRef}
        className="main-ui"
        style={{ pointerEvents: 'none', opacity: 0, position: 'fixed', inset: 0 }}
        data-visible="false"
        data-interactive="false"
        aria-hidden="true"
        tabIndex={-1}
        onFocus={preventFocusTrap}
      >
        <div className="main-ui__layout">
          <div className="main-ui__orbit" role="navigation" aria-label={t('navLabel')}>
            <button className="main-ui__core" type="button">
              <span className="main-ui__core-label">{t('coreLabel')}</span>
              <span className="main-ui__core-sub">{t('coreSub')}</span>
            </button>
            <div className="main-ui__nodes" data-role="nodes" />
          </div>
          <aside className="main-ui__panel" aria-live="polite">
            <h2 className="main-ui__panel-title" data-role="panel-title" />
            <p className="main-ui__panel-description" data-role="panel-description" />
            <dl className="main-ui__panel-meta" data-role="panel-meta" />
            <div className="main-ui__panel-actions" data-role="panel-actions" />
          </aside>
        </div>
      </div>
    </>
  );
}
