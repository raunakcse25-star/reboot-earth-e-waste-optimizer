import React, { useEffect, useRef } from 'react';

export interface DotFieldProps {
  gradientFrom?: string;
  gradientTo?: string;
  dotRadius?: number;
  dotSpacing?: number;
  cursorRadius?: number;
  bulgeStrength?: number;
  glowRadius?: number;
  className?: string;
}

function parseHexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace('#', '').trim();
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return [82, 39, 255];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const DotField: React.FC<DotFieldProps> = ({
  gradientFrom = '#5227FF',
  gradientTo = '#FF9FFC',
  dotRadius = 1.5,
  dotSpacing = 14,
  cursorRadius = 240,
  bulgeStrength = 0.6,
  glowRadius = 160,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const fromRgb = parseHexToRgb(gradientFrom);
    const toRgb = parseHexToRgb(gradientTo);

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let rafId = 0;

    // Precomputed grid points
    let dots: Array<{
      x: number;
      y: number;
      r: number;
      g: number;
      b: number;
    }> = [];

    const pointer = {
      targetX: -9999,
      targetY: -9999,
      x: -9999,
      y: -9999,
      active: 0,
      targetActive: 0,
    };

    const spacing = Math.max(6, dotSpacing);

    const buildGrid = () => {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      const offsetX = (width - (cols - 1) * spacing) / 2;
      const offsetY = (height - (rows - 1) * spacing) / 2;

      const nextDots: typeof dots = [];
      for (let row = 0; row < rows; row++) {
        const y = offsetY + row * spacing;
        const ny = height > 1 ? y / height : 0;
        for (let col = 0; col < cols; col++) {
          const x = offsetX + col * spacing;
          const nx = width > 1 ? x / width : 0;
          const t = Math.max(0, Math.min(1, nx * 0.65 + ny * 0.35));
          nextDots.push({
            x,
            y,
            r: Math.round(lerp(fromRgb[0], toRgb[0], t)),
            g: Math.round(lerp(fromRgb[1], toRgb[1], t)),
            b: Math.round(lerp(fromRgb[2], toRgb[2], t)),
          });
        }
      }
      dots = nextDots;
    };

    const draw = () => {
      // Smoothly ease cursor position & activation
      if (!prefersReducedMotion) {
        pointer.active += (pointer.targetActive - pointer.active) * 0.12;
        if (pointer.targetActive > 0) {
          if (pointer.x < -5000) {
            pointer.x = pointer.targetX;
            pointer.y = pointer.targetY;
          } else {
            pointer.x += (pointer.targetX - pointer.x) * 0.18;
            pointer.y += (pointer.targetY - pointer.y) * 0.18;
          }
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const isDark = document.documentElement.classList.contains('dark');
      const baseAlpha = isDark ? 0.34 : 0.28;
      const cRad = Math.max(1, cursorRadius);
      const cRadSq = cRad * cRad;
      const gRad = Math.max(1, glowRadius);
      const active = prefersReducedMotion ? 0 : pointer.active;

      // Subtle ambient radial halo under cursor
      if (active > 0.01) {
        const halo = ctx.createRadialGradient(
          pointer.x,
          pointer.y,
          0,
          pointer.x,
          pointer.y,
          gRad * 1.15
        );
        const cxT = Math.max(0, Math.min(1, pointer.x / Math.max(1, width)));
        const hr = Math.round(lerp(fromRgb[0], toRgb[0], cxT));
        const hg = Math.round(lerp(fromRgb[1], toRgb[1], cxT));
        const hb = Math.round(lerp(fromRgb[2], toRgb[2], cxT));
        halo.addColorStop(0, `rgba(${hr}, ${hg}, ${hb}, ${(isDark ? 0.2 : 0.14) * active})`);
        halo.addColorStop(0.55, `rgba(${hr}, ${hg}, ${hb}, ${(isDark ? 0.07 : 0.05) * active})`);
        halo.addColorStop(1, `rgba(${hr}, ${hg}, ${hb}, 0)`);
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, width, height);
      }

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        let drawX = d.x;
        let drawY = d.y;
        let radius = dotRadius;
        let alpha = baseAlpha;

        if (active > 0.005) {
          const dx = d.x - pointer.x;
          const dy = d.y - pointer.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < cRadSq) {
            const dist = Math.sqrt(distSq);
            const norm = 1 - dist / cRad;
            // Smooth cubic falloff for organic optical bulge
            const smooth = norm * norm * (3 - 2 * norm);
            const push = smooth * bulgeStrength * spacing * 1.65 * active;
            if (dist > 0.001) {
              drawX += (dx / dist) * push;
              drawY += (dy / dist) * push;
            }
            radius = dotRadius * (1 + smooth * bulgeStrength * 1.45 * active);
          }

          if (distSq < gRad * gRad) {
            const dist = Math.sqrt(distSq);
            const gNorm = 1 - dist / gRad;
            const gSmooth = gNorm * gNorm;
            alpha = Math.min(0.95, baseAlpha + gSmooth * 0.65 * active);

            if (gSmooth > 0.2) {
              ctx.beginPath();
              ctx.arc(drawX, drawY, radius * (2.2 + gSmooth), 0, Math.PI * 2);
              ctx.fillStyle = `rgba(${d.r}, ${d.g}, ${d.b}, ${gSmooth * 0.18 * active})`;
              ctx.fill();
            }
          }
        }

        ctx.beginPath();
        ctx.arc(drawX, drawY, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${d.r}, ${d.g}, ${d.b}, ${alpha})`;
        ctx.fill();
      }

      if (!prefersReducedMotion) {
        rafId = window.requestAnimationFrame(draw);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (inside) {
        pointer.targetX = e.clientX - rect.left;
        pointer.targetY = e.clientY - rect.top;
        pointer.targetActive = 1;
      } else {
        pointer.targetActive = 0;
      }
    };

    const handlePointerLeave = () => {
      pointer.targetActive = 0;
    };

    buildGrid();
    draw();

    const resizeObserver = new ResizeObserver(() => {
      buildGrid();
      if (prefersReducedMotion) draw();
    });
    resizeObserver.observe(container);

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerleave', handlePointerLeave);
    window.addEventListener('blur', handlePointerLeave);

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerleave', handlePointerLeave);
      window.removeEventListener('blur', handlePointerLeave);
    };
  }, [gradientFrom, gradientTo, dotRadius, dotSpacing, cursorRadius, bulgeStrength, glowRadius]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};

export default DotField;
