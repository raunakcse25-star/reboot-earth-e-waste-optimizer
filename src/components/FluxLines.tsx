import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export interface FluxLinesProps {
  colors?: string[];
  glow?: number;
  rimWidth?: number;
  lineWidth?: number;
  flowDirection?: 'down' | 'up' | 'left' | 'right';
  mouseInteraction?: boolean;
  clickSwirl?: boolean;
  className?: string;
}

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  precision highp float;

  varying vec2 vUv;

  uniform float uTime;
  uniform vec2 uResolution;
  uniform vec3 uColor0;
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform float uGlow;
  uniform float uRimWidth;
  uniform float uLineWidth;
  uniform vec2 uFlowDir;
  uniform vec2 uMouse;
  uniform float uMouseActive;
  uniform vec2 uSwirlPos;
  uniform float uSwirlTime;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = rot * p * 2.02;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
    vec2 p = (vUv - 0.5) * aspect;

    // Interactive mouse displacement
    if (uMouseActive > 0.01) {
      vec2 m = (uMouse - 0.5) * aspect;
      vec2 diff = p - m;
      float d = length(diff);
      float push = exp(-d * 4.5) * 0.22 * uMouseActive;
      p += normalize(diff + 0.0001) * push;
      float angle = exp(-d * 3.8) * 0.65 * uMouseActive;
      float s = sin(angle);
      float c = cos(angle);
      vec2 rel = p - m;
      p = m + mat2(c, -s, s, c) * rel;
    }

    // Click-triggered vortex swirl
    float swirlAge = uTime - uSwirlTime;
    if (swirlAge > 0.0 && swirlAge < 3.0) {
      vec2 sp = (uSwirlPos - 0.5) * aspect;
      vec2 rel = p - sp;
      float dist = length(rel);
      float env = exp(-swirlAge * 1.45) * exp(-dist * 3.0);
      float theta = env * 4.5 * sin(swirlAge * 4.0 - dist * 8.0);
      float cs = cos(theta);
      float sn = sin(theta);
      p = sp + mat2(cs, -sn, sn, cs) * rel;
    }

    // Directional flowing domain warp
    vec2 flow = uFlowDir * uTime * 0.32;
    vec2 warped = p * 2.2 + flow;
    float n1 = fbm(warped + vec2(fbm(warped * 1.3 - flow * 0.6)));
    float n2 = fbm(warped * 1.6 - flow * 0.8 + n1 * 1.4);

    // Parallel luminous flux bands along flow axis
    float axisCoord = abs(uFlowDir.y) > 0.5 ? p.x : p.y;
    float waveField = axisCoord * 9.0 + n1 * 4.2 + n2 * 2.4;
    float band = abs(fract(waveField) - 0.5);

    float coreThickness = max(0.015, 0.045 * uLineWidth);
    float rimThickness = max(0.05, coreThickness + uRimWidth * 0.35);

    float coreLine = smoothstep(coreThickness, 0.0, band);
    float rimGlow = smoothstep(rimThickness, 0.0, band);

    // Secondary interlaced harmonic flux stream
    float band2 = abs(fract(waveField * 0.55 + n2 * 1.7 + uTime * 0.08) - 0.5);
    float secondaryLine = smoothstep(coreThickness * 1.4, 0.0, band2) * 0.55;

    // Color blending across the 3 user colors
    float t = clamp(n2 * 1.25, 0.0, 1.0);
    vec3 baseCol = t < 0.5
      ? mix(uColor0, uColor1, t * 2.0)
      : mix(uColor1, uColor2, (t - 0.5) * 2.0);

    // Soft radial vignette so edges fade gracefully
    float vignette = smoothstep(1.35, 0.15, length(p));

    float intensity = (coreLine * 1.15 + rimGlow * 0.42 * uGlow + secondaryLine * 0.65 * uGlow) * vignette;
    vec3 finalColor = baseCol * intensity;

    // Subtle deep forest-obsidian backdrop tint for contrast under white lines
    vec3 backdrop = vec3(0.016, 0.063, 0.047);
    vec3 col = backdrop + finalColor * 0.72;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export const FluxLines: React.FC<FluxLinesProps> = ({
  colors = ['#ffffff', '#ffffff', '#ffffff'],
  glow = 2,
  rimWidth = 0.2,
  lineWidth = 1,
  flowDirection = 'down',
  mouseInteraction = true,
  clickSwirl = true,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      return;
    }

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const c0 = new THREE.Color(colors[0] || '#ffffff');
    const c1 = new THREE.Color(colors[1] || colors[0] || '#ffffff');
    const c2 = new THREE.Color(colors[2] || colors[1] || colors[0] || '#ffffff');

    const flowMap: Record<NonNullable<FluxLinesProps['flowDirection']>, THREE.Vector2> = {
      down: new THREE.Vector2(0, 1),
      up: new THREE.Vector2(0, -1),
      left: new THREE.Vector2(1, 0),
      right: new THREE.Vector2(-1, 0),
    };

    const uniforms = {
      uTime: { value: 0 },
      uResolution: { value: new THREE.Vector2(width, height) },
      uColor0: { value: c0 },
      uColor1: { value: c1 },
      uColor2: { value: c2 },
      uGlow: { value: glow },
      uRimWidth: { value: rimWidth },
      uLineWidth: { value: lineWidth },
      uFlowDir: { value: flowMap[flowDirection] || flowMap.down },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uMouseActive: { value: 0 },
      uSwirlPos: { value: new THREE.Vector2(0.5, 0.5) },
      uSwirlTime: { value: -10 },
    };

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      depthWrite: false,
      depthTest: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const targetMouse = new THREE.Vector2(0.5, 0.5);
    let targetMouseActive = 0;

    const handlePointerMove = (e: PointerEvent) => {
      if (!mouseInteraction) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      targetMouse.x = (e.clientX - rect.left) / rect.width;
      targetMouse.y = 1.0 - (e.clientY - rect.top) / rect.height;
      targetMouseActive = 1;
    };

    const handlePointerLeave = () => {
      targetMouseActive = 0;
    };

    const handleClick = (e: MouseEvent) => {
      if (!clickSwirl) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      uniforms.uSwirlPos.value.set(
        (e.clientX - rect.left) / rect.width,
        1.0 - (e.clientY - rect.top) / rect.height
      );
      uniforms.uSwirlTime.value = uniforms.uTime.value;
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('click', handleClick);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(1, Math.floor(entry.contentRect.width));
        const h = Math.max(1, Math.floor(entry.contentRect.height));
        renderer.setSize(w, h, false);
        uniforms.uResolution.value.set(w, h);
      }
    });
    resizeObserver.observe(container);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = new THREE.Clock();
    let rafId = 0;
    let disposed = false;

    const animate = () => {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      if (!reducedMotion) {
        uniforms.uTime.value += dt;
      }
      uniforms.uMouse.value.lerp(targetMouse, 0.12);
      uniforms.uMouseActive.value += (targetMouseActive - uniforms.uMouseActive.value) * 0.08;
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('click', handleClick);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [colors, glow, rimWidth, lineWidth, flowDirection, mouseInteraction, clickSwirl]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative overflow-hidden ${className}`}
      aria-hidden="true"
    />
  );
};

export default FluxLines;
