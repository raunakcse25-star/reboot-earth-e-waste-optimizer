import React, { useEffect, useRef } from 'react';

export interface ElectricBorderProps {
  color?: string;
  speed?: number;
  chaos?: number;
  spread?: number;
  strands?: number;
  thickness?: number;
  borderRadius?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

// Deterministic fast value noise for organic electric plasma jitter
function hash1D(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function smoothNoise(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash1D(i) * (1 - u) + hash1D(i + 1) * u;
}

function fbm1D(x: number): number {
  return (
    smoothNoise(x) * 0.55 +
    smoothNoise(x * 2.13 + 17.3) * 0.3 +
    smoothNoise(x * 4.71 + 41.9) * 0.15
  ) * 2 - 1;
}

interface PerimeterPoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
}

function sampleRoundedRectPerimeter(
  width: number,
  height: number,
  radius: number,
  pad: number,
  samples: number
): PerimeterPoint[] {
  const x0 = pad;
  const y0 = pad;
  const w = Math.max(4, width - pad * 2);
  const h = Math.max(4, height - pad * 2);
  const r = Math.min(radius, w / 2, h / 2);

  const straightW = Math.max(0, w - 2 * r);
  const straightH = Math.max(0, h - 2 * r);
  const arcLen = (Math.PI / 2) * r;
  const totalLen = 2 * straightW + 2 * straightH + 4 * arcLen;

  const points: PerimeterPoint[] = [];
  if (totalLen <= 0) return points;

  const segs = [
    straightW, // top
    arcLen,    // top-right
    straightH, // right
    arcLen,    // bottom-right
    straightW, // bottom
    arcLen,    // bottom-left
    straightH, // left
    arcLen,    // top-left
  ];

  for (let i = 0; i < samples; i++) {
    let d = (i / samples) * totalLen;
    let segIdx = 0;
    while (segIdx < segs.length - 1 && d > segs[segIdx]) {
      d -= segs[segIdx];
      segIdx++;
    }

    let x = x0;
    let y = y0;
    let nx = 0;
    let ny = -1;

    switch (segIdx) {
      case 0: // top edge
        x = x0 + r + d;
        y = y0;
        nx = 0;
        ny = -1;
        break;
      case 1: { // top-right corner
        const a = -Math.PI / 2 + (r > 0 ? d / r : 0);
        x = x0 + w - r + Math.cos(a) * r;
        y = y0 + r + Math.sin(a) * r;
        nx = Math.cos(a);
        ny = Math.sin(a);
        break;
      }
      case 2: // right edge
        x = x0 + w;
        y = y0 + r + d;
        nx = 1;
        ny = 0;
        break;
      case 3: { // bottom-right corner
        const a = 0 + (r > 0 ? d / r : 0);
        x = x0 + w - r + Math.cos(a) * r;
        y = y0 + h - r + Math.sin(a) * r;
        nx = Math.cos(a);
        ny = Math.sin(a);
        break;
      }
      case 4: // bottom edge
        x = x0 + w - r - d;
        y = y0 + h;
        nx = 0;
        ny = 1;
        break;
      case 5: { // bottom-left corner
        const a = Math.PI / 2 + (r > 0 ? d / r : 0);
        x = x0 + r + Math.cos(a) * r;
        y = y0 + h - r + Math.sin(a) * r;
        nx = Math.cos(a);
        ny = Math.sin(a);
        break;
      }
      case 6: // left edge
        x = x0;
        y = y0 + h - r - d;
        nx = -1;
        ny = 0;
        break;
      case 7: { // top-left corner
        const a = Math.PI + (r > 0 ? d / r : 0);
        x = x0 + r + Math.cos(a) * r;
        y = y0 + r + Math.sin(a) * r;
        nx = Math.cos(a);
        ny = Math.sin(a);
        break;
      }
    }

    points.push({ x, y, nx, ny });
  }

  return points;
}

export const ElectricBorder: React.FC<ElectricBorderProps> = ({
  color = '#7df9ff',
  speed = 1,
  chaos = 0.5,
  spread = 0.6,
  strands = 3,
  thickness = 1.5,
  borderRadius = 24,
  className = '',
  style,
  children,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bleed = 22;
    let width = wrapper.clientWidth || 300;
    let height = wrapper.clientHeight || 360;
    let perimeter: PerimeterPoint[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(40, wrapper.clientWidth);
      height = Math.max(40, wrapper.clientHeight);
      const cw = width + bleed * 2;
      const ch = height + bleed * 2;
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sampleCount = Math.min(260, Math.max(96, Math.round((width + height) / 4)));
      perimeter = sampleRoundedRectPerimeter(cw, ch, borderRadius, bleed, sampleCount);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapper);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const strandCount = Math.max(1, Math.min(8, Math.round(strands)));
    let rafId = 0;
    let startTime = performance.now();

    const renderFrame = (now: number) => {
      const t = reducedMotion ? 0 : ((now - startTime) / 1000) * speed;
      const cw = width + bleed * 2;
      const ch = height + bleed * 2;
      ctx.clearRect(0, 0, cw, ch);

      if (perimeter.length > 2) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (let s = 0; s < strandCount; s++) {
          const strandPhase = s * 13.37;
          const amp = (3.5 + chaos * 10) * (0.65 + (s / Math.max(1, strandCount)) * spread * 1.15);
          const freq = 10 + chaos * 18 + s * 4;

          ctx.beginPath();
          for (let i = 0; i <= perimeter.length; i++) {
            const pt = perimeter[i % perimeter.length];
            const u = i / perimeter.length;
            const n = fbm1D(u * freq + t * (2.6 + s * 0.7) + strandPhase);
            const crackle = fbm1D(u * freq * 2.5 - t * 5.2 + strandPhase * 2) * chaos * 0.5;
            const disp = (n + crackle) * amp;
            const px = pt.x + pt.nx * disp;
            const py = pt.y + pt.ny * disp;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();

          // Outer glow pass
          ctx.save();
          ctx.strokeStyle = color;
          ctx.globalAlpha = s === 0 ? 0.55 : 0.35;
          ctx.lineWidth = thickness * (s === 0 ? 3.2 : 2.1);
          ctx.shadowColor = color;
          ctx.shadowBlur = 12 + spread * 10;
          ctx.stroke();
          ctx.restore();

          // Crisp hot core pass
          ctx.save();
          ctx.strokeStyle = s === 0 ? '#ffffff' : color;
          ctx.globalAlpha = s === 0 ? 0.92 : 0.78;
          ctx.lineWidth = Math.max(0.75, thickness * (s === 0 ? 1 : 0.75));
          ctx.stroke();
          ctx.restore();
        }
      }

      if (!reducedMotion) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [color, speed, chaos, spread, strands, thickness, borderRadius]);

  return (
    <div
      ref={wrapperRef}
      className={`relative inline-block ${className}`}
      style={{ borderRadius, ...style }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[22px] z-10"
      />
      <div
        className="relative z-0 overflow-hidden"
        style={{ borderRadius }}
      >
        {children}
      </div>
    </div>
  );
};

export default ElectricBorder;
