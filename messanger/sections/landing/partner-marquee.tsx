'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { getMarketingData } from '@/lib/marketing-data';
import { type Locale } from '@/lib/i18n';

export function PartnerMarquee({ locale }: { locale: Locale }) {
  const { partnerLogos } = getMarketingData(locale);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLUListElement | null>(null);
  const [repeat, setRepeat] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) {
      return;
    }

    let raf = 0;
    const calculate = () => {
      const containerWidth = container.clientWidth;
      const contentWidth = measure.scrollWidth;
      if (containerWidth <= 0 || contentWidth <= 0) {
        return;
      }
      const nextRepeat = Math.max(1, Math.ceil(containerWidth / contentWidth));
      setRepeat((prev) => (prev === nextRepeat ? prev : nextRepeat));
    };

    const schedule = () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
      raf = requestAnimationFrame(calculate);
    };

    schedule();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(schedule);
      observer.observe(container);
      observer.observe(measure);
      return () => {
        observer.disconnect();
        if (raf) {
          cancelAnimationFrame(raf);
        }
      };
    }

    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.removeEventListener('resize', schedule);
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
  }, [locale]);

  const logos = useMemo(() => {
    if (!partnerLogos.length) {
      return [];
    }
    return Array.from({ length: repeat }, () => partnerLogos).flat();
  }, [partnerLogos, repeat]);

  if (!partnerLogos.length) {
    return null;
  }
  return (
    <div
      ref={containerRef}
      className="border-white/12 group relative overflow-hidden rounded-3xl border bg-gradient-to-r from-white/10 via-white/5 to-white/10 py-6 backdrop-blur-md [--marquee-duration:28s] [--marquee-gap:3rem]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_40%,rgba(160,214,236,0.18),transparent_40%),radial-gradient(circle_at_86%_60%,rgba(120,180,210,0.14),transparent_45%)] opacity-70" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)] blur-lg" />

      <div className="relative motion-reduce:hidden">
        <div className="flex w-max animate-marquee items-center gap-[var(--marquee-gap)] whitespace-nowrap text-sm font-medium uppercase tracking-[0.45em] text-white/65 will-change-transform group-hover:[animation-play-state:paused]">
          <ul className="flex items-center gap-[var(--marquee-gap)]">
            {logos.map((logo, index) => (
              <li key={`${logo}-${index}`} className="shrink-0 px-2">
                {logo}
              </li>
            ))}
          </ul>
          <ul className="flex items-center gap-[var(--marquee-gap)]" aria-hidden="true">
            {logos.map((logo, index) => (
              <li key={`${logo}-${index}`} className="shrink-0 px-2">
                {logo}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ul className="relative hidden flex-wrap justify-center gap-4 px-4 text-sm font-medium uppercase tracking-[0.45em] text-white/65 motion-reduce:flex">
        {partnerLogos.map((logo, index) => (
          <li key={`${logo}-${index}`} className="shrink-0">
            {logo}
          </li>
        ))}
      </ul>

      <div className="pointer-events-none absolute left-0 top-0 -z-10 opacity-0" aria-hidden="true">
        <ul
          ref={measureRef}
          className="flex w-max items-center gap-[var(--marquee-gap)] whitespace-nowrap text-sm font-medium uppercase tracking-[0.45em] text-white/65"
        >
          {partnerLogos.map((logo, index) => (
            <li key={`${logo}-${index}`} className="shrink-0 px-2">
              {logo}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
