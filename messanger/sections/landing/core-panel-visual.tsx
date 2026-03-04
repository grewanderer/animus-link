'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

type Particle = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  vx: number;
  vy: number;
  phase: number;
};

type Marker = {
  x: number;
  y: number;
  size: number;
  alpha: number;
  vx: number;
  vy: number;
  phase: number;
};

type VisualQuality = 'balanced' | 'high';

function resolveDpr(width: number, height: number, quality: VisualQuality) {
  const pixelRatio = window.devicePixelRatio || 1;
  const isSmallScreen = Boolean(window.matchMedia?.('(max-width: 768px)')?.matches);
  const cap = quality === 'high' ? (isSmallScreen ? 2 : 3) : isSmallScreen ? 1.5 : 2;
  const maxSurfacePixels =
    quality === 'high' ? (isSmallScreen ? 10_000_000 : 24_000_000) : isSmallScreen ? 4_500_000 : 8_000_000;
  let next = Math.min(cap, pixelRatio);

  const area = Math.max(1, Math.round(width)) * Math.max(1, Math.round(height));
  const projected = area * next * next;
  if (projected > maxSurfacePixels) {
    next = Math.sqrt(maxSurfacePixels / area);
  }

  return Math.max(1, Math.min(cap, next));
}
const TWO_PI = Math.PI * 2;
const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function spawnParticles(width: number, height: number) {
  const density = clamp01((width * height) / 240_000);
  const count = Math.round(22 + density * 26);
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    radius: rand(10, 26),
    alpha: rand(0.05, 0.15),
    vx: rand(-10, 12),
    vy: rand(-6, 6),
    phase: rand(0, TWO_PI),
  }));
}

function spawnMarkers(width: number, height: number) {
  const density = clamp01((width * height) / 320_000);
  const count = Math.round(7 + density * 10);
  return Array.from({ length: count }, () => ({
    x: rand(width * 0.12, width * 0.88),
    y: rand(height * 0.14, height * 0.86),
    size: rand(10, 18),
    alpha: rand(0.1, 0.22),
    vx: rand(-6, 6),
    vy: rand(-6, 6),
    phase: rand(0, TWO_PI),
  }));
}

function updateDrifters<T extends { x: number; y: number; vx: number; vy: number }>(
  items: T[],
  dt: number,
  width: number,
  height: number,
) {
  const seconds = dt / 1000;
  items.forEach((item) => {
    item.x += item.vx * seconds;
    item.y += item.vy * seconds;
    const margin = 40;
    if (item.x < -margin) item.x = width + margin;
    if (item.x > width + margin) item.x = -margin;
    if (item.y < -margin) item.y = height + margin;
    if (item.y > height + margin) item.y = -margin;
  });
}

function drawFog(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const offsetX = Math.sin(time * 0.00018) * width * 0.06;
  const offsetY = Math.cos(time * 0.00022) * height * 0.05;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.95;

  const left = ctx.createRadialGradient(
    width * 0.18 + offsetX,
    height * 0.44 + offsetY,
    0,
    width * 0.18 + offsetX,
    height * 0.44 + offsetY,
    Math.max(width, height) * 0.85,
  );
  left.addColorStop(0, 'rgba(225, 248, 255, 0.16)');
  left.addColorStop(0.45, 'rgba(125, 205, 240, 0.08)');
  left.addColorStop(1, 'rgba(8, 16, 26, 0)');
  ctx.fillStyle = left;
  ctx.fillRect(0, 0, width, height);

  const right = ctx.createRadialGradient(
    width * 0.82 - offsetX,
    height * 0.52 - offsetY,
    0,
    width * 0.82 - offsetX,
    height * 0.52 - offsetY,
    Math.max(width, height) * 0.75,
  );
  right.addColorStop(0, 'rgba(170, 235, 255, 0.12)');
  right.addColorStop(0.5, 'rgba(90, 175, 235, 0.07)');
  right.addColorStop(1, 'rgba(8, 16, 26, 0)');
  ctx.fillStyle = right;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], time: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  particles.forEach((p) => {
    const pulse = 0.7 + Math.sin(time * 0.00035 + p.phase) * 0.3;
    ctx.globalAlpha = p.alpha * pulse;
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
    gradient.addColorStop(0, 'rgba(225, 248, 255, 0.9)');
    gradient.addColorStop(1, 'rgba(6, 16, 26, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, TWO_PI);
    ctx.fill();
  });
  ctx.restore();
}

function drawHelix(
  ctx: CanvasRenderingContext2D,
  {
    x,
    height,
    width,
    time,
    alpha,
  }: { x: number; height: number; width: number; time: number; alpha: number },
) {
  const segmentCount = Math.round(height / 16);
  const amplitude = Math.min(width * 0.11, 72);
  const radius = Math.min(width * 0.022, 14);
  const phase = time * 0.0004;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha;

  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount;
    const y = t * height;
    const angle = t * TWO_PI * 1.35 + phase;
    const offset = Math.sin(angle) * amplitude;
    const offset2 = Math.sin(angle + Math.PI) * amplitude;
    const x1 = x + offset;
    const x2 = x + offset2;

    if (i % 3 === 0) {
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(210, 245, 255, 0.18)';
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(x1, y, 0, x1, y, radius * 2.2);
    glow.addColorStop(0, 'rgba(235, 252, 255, 0.28)');
    glow.addColorStop(1, 'rgba(8, 16, 26, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x1, y, radius * 2.2, 0, TWO_PI);
    ctx.fill();

    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = 'rgba(230, 248, 255, 0.55)';
    ctx.beginPath();
    ctx.arc(x1, y, radius, 0, TWO_PI);
    ctx.fill();

    ctx.globalAlpha = alpha * 0.42;
    ctx.fillStyle = 'rgba(210, 240, 255, 0.38)';
    ctx.beginPath();
    ctx.arc(x2, y, radius * 0.72, 0, TWO_PI);
    ctx.fill();

    ctx.globalAlpha = alpha;
  }

  ctx.restore();
}

function drawMarkers(ctx: CanvasRenderingContext2D, markers: Marker[], time: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  markers.forEach((marker) => {
    const pulse = 0.7 + Math.sin(time * 0.00055 + marker.phase) * 0.3;
    ctx.globalAlpha = marker.alpha * pulse;
    ctx.strokeStyle = 'rgba(210, 245, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(marker.x, marker.y, marker.size, marker.size);

    if (marker.size > 12) {
      ctx.globalAlpha *= 0.5;
      ctx.beginPath();
      ctx.moveTo(marker.x - 10, marker.y + marker.size / 2);
      ctx.lineTo(marker.x - 2, marker.y + marker.size / 2);
      ctx.stroke();
    }
  });
  ctx.restore();
}

function drawScanBand(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  reduceMotion: boolean,
) {
  const bannerWidth = Math.min(width * 0.86, 680);
  const bannerHeight = Math.max(30, bannerWidth * 0.1);
  const x = (width - bannerWidth) / 2;
  const y = height * 0.44;

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = 'rgba(6, 18, 28, 0.92)';
  ctx.fillRect(x, y, bannerWidth, bannerHeight);

  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = 'rgba(170, 230, 255, 0.3)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x + 0.5, y + 0.5, bannerWidth - 1, bannerHeight - 1);

  const scanX = reduceMotion ? x + bannerWidth * 0.55 : x + ((time * 0.14) % bannerWidth);
  const grad = ctx.createLinearGradient(scanX - 50, y, scanX + 50, y);
  grad.addColorStop(0, 'rgba(120, 220, 255, 0)');
  grad.addColorStop(0.5, 'rgba(210, 248, 255, 0.42)');
  grad.addColorStop(1, 'rgba(120, 220, 255, 0)');
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = grad;
  ctx.fillRect(scanX - 50, y, 100, bannerHeight);

  ctx.globalAlpha = 0.26;
  ctx.fillStyle = 'rgba(210, 245, 255, 0.55)';
  ctx.fillRect(x + bannerWidth * 0.06, y + bannerHeight - 6, bannerWidth * 0.88, 2);
  ctx.restore();
}

function drawHudCard(ctx: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const cardWidth = Math.min(width * 0.48, 360);
  const cardHeight = Math.min(height * 0.24, 150);
  const x = width * 0.08;
  const y = height * 0.64;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = 'rgba(6, 18, 28, 0.9)';
  ctx.fillRect(x, y, cardWidth, cardHeight);

  ctx.globalAlpha = 0.42;
  ctx.strokeStyle = 'rgba(170, 230, 255, 0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, cardWidth - 1, cardHeight - 1);

  const stripeWidth = cardWidth * 0.18;
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = 'rgba(150, 210, 255, 0.25)';
  ctx.fillRect(x, y, stripeWidth, cardHeight);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, stripeWidth, cardHeight);
  ctx.clip();
  ctx.globalAlpha = 0.32;
  ctx.strokeStyle = 'rgba(235, 252, 255, 0.35)';
  ctx.lineWidth = 6;
  const tilt = Math.sin(time * 0.00035) * 6;
  for (let i = -cardHeight; i < stripeWidth + cardHeight; i += 18) {
    ctx.beginPath();
    ctx.moveTo(x + i + tilt, y);
    ctx.lineTo(x + i - cardHeight + tilt, y + cardHeight);
    ctx.stroke();
  }
  ctx.restore();

  const padX = x + stripeWidth + 14;
  const padY = y + 16;
  const lineHeight = 10;
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = 'rgba(210, 245, 255, 0.28)';
  for (let i = 0; i < 6; i += 1) {
    const t = i / 6;
    const w = cardWidth * (0.56 - t * 0.22 + Math.sin(time * 0.0005 + i) * 0.03);
    ctx.fillRect(padX, padY + i * lineHeight * 1.1, w, 2);
  }

  ctx.globalAlpha = 0.26;
  ctx.fillStyle = 'rgba(210, 245, 255, 0.22)';
  const graphX = padX;
  const graphY = y + cardHeight - 28;
  const graphW = cardWidth * 0.62;
  const graphH = 14;
  ctx.strokeStyle = 'rgba(190, 240, 255, 0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(graphX, graphY, graphW, graphH);

  ctx.beginPath();
  for (let i = 0; i <= 18; i += 1) {
    const t = i / 18;
    const px = graphX + t * graphW;
    const py = graphY + graphH * (0.2 + 0.6 * (0.5 + Math.sin(time * 0.001 + t * 6) * 0.5));
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = 'rgba(220, 250, 255, 0.24)';
  ctx.stroke();

  ctx.restore();
}

function drawLogoWatermark(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  width: number,
  height: number,
) {
  const size = Math.min(width, height) * 0.56;
  const x = width * 0.5;
  const y = height * 0.5;

  // Crisp base pass keeps edges readable before glow composition.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.22;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(logo, x - size / 2, y - size / 2, size, size);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.14;
  ctx.shadowColor = 'rgba(200, 240, 255, 0.22)';
  ctx.shadowBlur = size * 0.11;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(logo, x - size / 2, y - size / 2, size, size);
  ctx.restore();
}

type CorePanelVisualProps = {
  className?: string;
  quality?: VisualQuality;
};

export function CorePanelVisual({ className, quality = 'balanced' }: CorePanelVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d', {
      alpha: true,
      desynchronized: quality !== 'high',
    });
    if (!ctx) {
      return;
    }

    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let reduceMotion = Boolean(media?.matches);
    const handleMediaChange = () => {
      reduceMotion = Boolean(media?.matches);
    };
    media?.addEventListener?.('change', handleMediaChange);

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let markers: Marker[] = [];

    let logo: HTMLImageElement | null = null;
    let logoReady = false;
    const logoImage = new Image();
    logoImage.decoding = 'async';
    logoImage.src = '/logo.png';
    logoImage.addEventListener('load', () => {
      logoReady = true;
      logo = logoImage;
    });

    const setSize = (nextWidth: number, nextHeight: number) => {
      const pixelRatio = resolveDpr(nextWidth, nextHeight, quality);
      width = Math.max(1, Math.round(nextWidth));
      height = Math.max(1, Math.round(nextHeight));
      canvas.width = Math.max(1, Math.floor(width * pixelRatio));
      canvas.height = Math.max(1, Math.floor(height * pixelRatio));
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      particles = spawnParticles(width, height);
      markers = spawnMarkers(width, height);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      setSize(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserver.observe(canvas);

    setSize(canvas.clientWidth || 1, canvas.clientHeight || 1);

    let raf = 0;
    let last = performance.now();

    const render = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;

      updateDrifters(particles, reduceMotion ? 0 : dt, width, height);
      updateDrifters(markers, reduceMotion ? 0 : dt, width, height);

      ctx.clearRect(0, 0, width, height);

      const background = ctx.createLinearGradient(0, 0, width, height);
      background.addColorStop(0, 'rgba(6, 16, 26, 0.92)');
      background.addColorStop(0.5, 'rgba(10, 26, 38, 0.88)');
      background.addColorStop(1, 'rgba(4, 10, 18, 0.96)');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);

      drawFog(ctx, width, height, now);
      drawParticles(ctx, particles, now);

      drawHelix(ctx, { x: width * 0.14, height, width, time: now, alpha: 0.3 });
      drawHelix(ctx, {
        x: width * 0.86,
        height,
        width,
        time: now + 600,
        alpha: 0.3,
      });

      drawMarkers(ctx, markers, now);

      if (logoReady && logo) {
        drawLogoWatermark(ctx, logo, width, height);
      }

      drawScanBand(ctx, width, height, now, reduceMotion);
      drawHudCard(ctx, width, height, now);

      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(4, 12, 20, 0.12)';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      media?.removeEventListener?.('change', handleMediaChange);
    };
  }, [quality]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('pointer-events-none block h-full w-full', className)}
      aria-hidden="true"
    />
  );
}
