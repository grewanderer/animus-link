import type { TrendPoint } from '@/lib/regression-types';

type Props = {
  points: TrendPoint[];
  ariaLabel: string;
  className?: string;
};

function toPath(points: TrendPoint[], width: number, height: number) {
  if (points.length === 0) {
    return '';
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);

  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((point.value - min) / span) * height;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function TrendSparkline({ points, ariaLabel, className }: Props) {
  if (points.length === 0) {
    return (
      <div
        className={className}
        role="img"
        aria-label={ariaLabel}
      >
        <div className="h-14 rounded-xl border border-white/10 bg-white/[0.02]" />
      </div>
    );
  }

  const width = 240;
  const height = 56;
  const path = toPath(points, width, height);

  return (
    <div className={className} role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full" preserveAspectRatio="none">
        <path d={`${path} L ${width},${height} L 0,${height} Z`} fill="rgba(57,168,255,0.12)" />
        <path d={path} fill="none" stroke="rgba(113, 204, 255, 0.95)" strokeWidth="2" />
      </svg>
    </div>
  );
}
