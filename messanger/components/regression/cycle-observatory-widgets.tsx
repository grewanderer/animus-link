import type { ReactNode } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StripState = 'success' | 'failure' | 'pending' | 'unknown';

export function CycleConsoleRow({
  left,
  controls,
  links,
  className,
}: {
  left: ReactNode;
  controls: ReactNode;
  links: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0 flex-1">{left}</div>
        <div className="flex shrink-0 items-center gap-2">{controls}</div>
        <div className="flex shrink-0 items-center gap-2">{links}</div>
      </div>
    </div>
  );
}

export function PrimaryPanel({
  title,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('rounded-2xl border-white/10 bg-white/[0.02] p-3.5 shadow-none', className)}>
      <CardHeader className="mb-0 flex-row items-center justify-between gap-2 px-0 pt-0">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.15em] text-white/72">
          {title}
        </CardTitle>
        {actions ? <div className="text-xs text-white/65">{actions}</div> : null}
      </CardHeader>
      <CardContent className="space-y-3 px-0 pb-0">{children}</CardContent>
    </Card>
  );
}

export function ResearchIndicesPanel({
  title,
  items,
  thresholdMarks,
  className,
}: {
  title: ReactNode;
  items: Array<{
    label: string;
    value: string;
    delta?: string;
    reason?: string;
    formula: string;
  }>;
  thresholdMarks: Array<number>;
  className?: string;
}) {
  return (
    <PrimaryPanel title={title} className={className}>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/60">{item.label}</p>
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] text-white/65"
                title={item.formula}
                aria-label={item.formula}
              >
                ?
              </span>
            </div>
            <p className="mt-1 font-metric-mono text-xl text-white">{item.value}</p>
            {item.delta ? <p className="mt-1 text-[11px] text-white/65">{item.delta}</p> : null}
            {item.reason ? <p className="mt-1 text-[11px] text-white/60">{item.reason}</p> : null}
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2" role="img" aria-label={String(title)}>
        <div className="relative h-2 rounded-full bg-white/10">
          {thresholdMarks.map((mark, index) => (
            <span
              key={`threshold-${index}-${mark}`}
              className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-white/85"
              style={{ left: `${clamp(mark)}%` }}
            />
          ))}
          <span className="absolute inset-0 rounded-full border border-white/5" />
        </div>
      </div>
    </PrimaryPanel>
  );
}

export function DetailsAccordion({
  title,
  subtitle,
  children,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details
      className={cn(
        'group rounded-2xl border border-white/10 bg-white/[0.02] p-3.5',
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.15em] text-white/75">{title}</p>
          {subtitle ? <p className="mt-1 text-xs text-white/62">{subtitle}</p> : null}
        </div>
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-[10px] text-white/70 transition group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-3 border-t border-white/10 pt-3">{children}</div>
    </details>
  );
}

function clamp(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function stateTone(state: StripState) {
  if (state === 'success') {
    return 'bg-sky-200/95 shadow-[0_0_10px_rgba(130,210,255,0.45)]';
  }
  if (state === 'failure') {
    return 'bg-cyan-200/95 shadow-[0_0_10px_rgba(170,240,255,0.45)]';
  }
  if (state === 'pending') {
    return 'bg-blue-200/90 shadow-[0_0_8px_rgba(140,185,255,0.38)]';
  }
  return 'bg-white/32';
}

export function StatTile({
  label,
  value,
  detail,
  delta,
  className,
  visual,
}: {
  label: string;
  value: string;
  detail?: string;
  delta?: string;
  className?: string;
  visual?: ReactNode;
}) {
  return (
    <div className={cn('rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5', className)}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">{label}</p>
      <p className="mt-1 font-metric-mono text-lg leading-tight text-white">{value}</p>
      {detail ? <p className="mt-1 text-xs text-white/72">{detail}</p> : null}
      {delta ? <p className="mt-1 text-[11px] text-white/65">{delta}</p> : null}
      {visual ? <div className="mt-2">{visual}</div> : null}
    </div>
  );
}

export function DiscreteStrip({
  label,
  values,
  className,
}: {
  label: string;
  values: Array<{ state: StripState; label: string }>;
  className?: string;
}) {
  if (values.length === 0) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2', className)} role="img" aria-label={label}>
        <div className="h-2 rounded-full bg-white/8" />
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2', className)} role="img" aria-label={label}>
      <div className="flex items-center gap-1.5">
        {values.map((item, index) => (
          <span
            key={`${item.label}-${index}`}
            className={cn('h-2.5 flex-1 rounded-full', stateTone(item.state))}
            title={item.label}
            aria-label={item.label}
          />
        ))}
      </div>
    </div>
  );
}

export function GaugeTile({
  label,
  value,
  size = 132,
  detail,
  reason,
  emptyValue = '—',
  className,
}: {
  label: string;
  value?: number;
  size?: number;
  detail?: string;
  reason?: string;
  emptyValue?: string;
  className?: string;
}) {
  const normalized = clamp(typeof value === 'number' ? value : 0);
  const stroke = size >= 120 ? 11 : 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (normalized / 100) * circumference;
  const hasValue = typeof value === 'number';

  return (
    <div className={cn('rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5', className)}>
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">{label}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,auto),1fr] sm:items-center">
        <div className="mx-auto" role="img" aria-label={label}>
          <div className="relative" style={{ width: `${size}px`, height: `${size}px` }}>
            <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(255,255,255,0.14)"
                strokeWidth={stroke}
              />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="rgba(142,216,255,0.95)"
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${dash} ${Math.max(circumference - dash, 0)}`}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            </svg>
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-metric-mono text-sm text-white/92">
              {hasValue ? `${Math.round(normalized)}%` : emptyValue}
            </span>
          </div>
        </div>

        <div className="space-y-1">
          {detail ? <p className="text-sm font-medium text-white/88">{detail}</p> : null}
          {reason ? <p className="text-xs text-white/68">{reason}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function BudgetBar({
  label,
  used,
  budget,
  status,
  reason,
}: {
  label: string;
  used: number;
  budget?: number;
  status: string;
  reason?: string;
}) {
  const hasBudget = typeof budget === 'number' && Number.isFinite(budget) && budget > 0;
  const ratio = hasBudget ? clamp((used / Math.max(1, budget || 1)) * 100) : 0;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">{label}</p>
        <span className="rounded-full border border-white/15 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/78">
          {status}
        </span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white/10">
        <span
          className="block h-full rounded-full bg-gradient-to-r from-sky-300/55 to-sky-100/90"
          style={{ width: `${hasBudget ? ratio : 0}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-white/72">{hasBudget ? `${used} / ${budget}` : reason}</p>
    </div>
  );
}

export function ChecklistSegments({
  label,
  items,
}: {
  label: string;
  items: Array<{ ok: boolean; label: string }>;
}) {
  return (
    <div role="img" aria-label={label} className="rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2">
      <div className="grid grid-cols-4 gap-1.5">
        {items.map((item, index) => (
          <span
            key={`${item.label}-${index}`}
            className={cn('h-4 rounded-md border border-white/15', item.ok ? 'bg-sky-200/80' : 'bg-white/10')}
            title={item.label}
            aria-label={item.label}
          />
        ))}
      </div>
    </div>
  );
}

export function IndexCard({
  title,
  value,
  delta,
  formula,
  reason,
  threshold,
  extra,
  emptyValue = '—',
}: {
  title: string;
  value?: number;
  delta?: string;
  formula: string;
  reason?: string;
  threshold?: number;
  extra?: ReactNode;
  emptyValue?: string;
}) {
  const hasValue = typeof value === 'number' && Number.isFinite(value);
  const normalized = clamp(hasValue ? value : 0);
  const thresholdValue = clamp(typeof threshold === 'number' ? threshold : 0);

  return (
    <Card className="bg-[#0b1626]/80 p-4">
      <CardHeader className="mb-0 gap-2 px-0 pt-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base leading-5">{title}</CardTitle>
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-[11px] text-white/75"
            title={formula}
            aria-label={formula}
          >
            ?
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-0 pb-0">
        <p className="font-metric-mono text-2xl text-white">{hasValue ? `${normalized.toFixed(1)}` : emptyValue}</p>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-2 py-2" role="img" aria-label={formula}>
          <div className="relative h-2 rounded-full bg-white/10">
            <span
              className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-sky-300/55 to-sky-100/90"
              style={{ width: `${normalized}%` }}
            />
            {thresholdValue > 0 ? (
              <span
                className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-white/85"
                style={{ left: `${thresholdValue}%` }}
              />
            ) : null}
          </div>
        </div>
        {extra ? extra : null}
        {delta ? <p className="text-xs text-white/72">{delta}</p> : null}
        {reason ? <p className="text-xs text-white/65">{reason}</p> : null}
      </CardContent>
    </Card>
  );
}

export function AnchorCard({
  title,
  primary,
  secondary,
  children,
}: {
  title: string;
  primary: string;
  secondary?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">{title}</p>
      <p className="mt-1 font-metric-mono text-sm text-white">{primary}</p>
      {secondary ? <p className="mt-1 text-xs text-white/70">{secondary}</p> : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

export function ReleaseBadge({
  label,
  value,
  detail,
  reason,
}: {
  label: string;
  value: string;
  detail?: string;
  reason?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">{label}</p>
      <p className="mt-1 text-sm font-medium text-white">{value}</p>
      {detail ? <p className="mt-1 text-xs text-white/70">{detail}</p> : null}
      {reason ? <p className="mt-1 text-xs text-white/65">{reason}</p> : null}
    </div>
  );
}

export function LatencyStat({
  label,
  median,
  p90,
  reason,
  emptyValue = '—',
}: {
  label: string;
  median?: string;
  p90?: string;
  reason?: string;
  emptyValue?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/60">{label}</p>
      <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
        <p className="font-metric-mono text-white">{median || emptyValue}</p>
        <p className="font-metric-mono text-white/80">{p90 || emptyValue}</p>
      </div>
      {reason ? <p className="mt-1 text-xs text-white/65">{reason}</p> : null}
    </div>
  );
}
