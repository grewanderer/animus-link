import type { ReactNode } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type VizPanelProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  controls?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

export function VizPanel({
  title,
  subtitle,
  controls,
  footer,
  className,
  bodyClassName,
  children,
}: VizPanelProps) {
  return (
    <Card className={cn('overflow-hidden border-white/12 bg-[#0b1626]/90 shadow-[0_28px_60px_rgba(4,10,20,0.6)]', className)}>
      {title || subtitle || controls ? (
        <CardHeader className="mb-0 flex min-h-[3.25rem] flex-col gap-2 px-4 pt-4 sm:min-h-[3.5rem] sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4 sm:px-5">
          <div className="min-w-0 space-y-1.5">
            {title ? (
              <CardTitle className="min-h-[2.25rem] text-sm font-semibold leading-5 text-white sm:text-base">
                {title}
              </CardTitle>
            ) : null}
            {subtitle ? <CardDescription className="text-xs leading-relaxed">{subtitle}</CardDescription> : null}
          </div>
          {controls ? (
            <div className="flex w-full items-start justify-start text-xs text-white/70 sm:ml-auto sm:w-auto sm:justify-end sm:pt-0.5">
              {controls}
            </div>
          ) : null}
        </CardHeader>
      ) : null}

      <CardContent
        className={cn(
          'relative z-10 flex min-h-[260px] items-end justify-end px-6 pb-8 pt-10 sm:min-h-[320px]',
          bodyClassName,
        )}
      >
        {children}
      </CardContent>

      {footer ? (
        <div className="border-t border-white/10 px-6 py-3 text-xs text-white/65">{footer}</div>
      ) : null}
    </Card>
  );
}
