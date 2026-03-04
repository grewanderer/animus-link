import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type MarketingSectionProps = {
  id?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function MarketingSection({
  id,
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  className,
}: MarketingSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'relative space-y-8 pb-12 last:pb-0 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/15 after:to-transparent last:after:hidden',
        className,
      )}
    >
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 space-y-3">
          {eyebrow ? (
            <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.35em] text-white/60">
              <span className="h-px w-10 bg-white/35" />
              <span>{eyebrow}</span>
            </div>
          ) : null}
          {title ? (
            <h2 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">{title}</h2>
          ) : null}
          {subtitle ? <p className="max-w-3xl text-white/80">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-end">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
