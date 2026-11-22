import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, RotateCcw, Layers } from 'lucide-react';
import Globe from '@/components/ui/globe';

interface EarthCanvasProps {
  className?: string;
}

type CameraPreset = 'overview' | 'orbital' | 'core';

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _dummyMatrix = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _dummyScale = new THREE.Vector3(1, 1, 1);
const _targetCamPos = new THREE.Vector3();

function createProceduralEarthTextures(maxAniso: number) {
  const width = 1024;
  const height = 512;

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = width;
  colorCanvas.height = height;
  const ctx = colorCanvas.getContext('2d')!;

  // Deep emerald ocean gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#061C33');
  oceanGrad.addColorStop(0.5, '#0B2F54');
  oceanGrad.addColorStop(1, '#061C33');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle latitude/longitude grid lines
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.09)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Stylized geometric continental landmasses with circuit trace accents
  const continents = [
    // Americas
    [
      [170, 120], [235, 110], [270, 170], [250, 230], [295, 290], [315, 375],
      [275, 420], [240, 345], [210, 260], [160, 195],
    ],
    // Europe & Africa
    [
      [465, 95], [555, 95], [575, 165], [595, 225], [610, 315], [560, 395],
      [510, 380], [495, 290], [450, 225], [445, 145],
    ],
    // Asia & India
    [
      [575, 90], [740, 88], [825, 145], [805, 235], [735, 275], [685, 240],
      [655, 295], [625, 230], [585, 175],
    ],
    // Oceania
    [
      [795, 315], [885, 315], [900, 385], [825, 395], [785, 355],
    ],
  ];

  // Bump/roughness canvas
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = width;
  roughCanvas.height = height;
  const rctx = roughCanvas.getContext('2d')!;
  rctx.fillStyle = '#383838'; // Ocean is smoother/glossy
  rctx.fillRect(0, 0, width, height);

  for (const poly of continents) {
    ctx.beginPath();
    rctx.beginPath();
    poly.forEach(([x, y], idx) => {
      if (idx === 0) {
        ctx.moveTo(x, y);
        rctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
        rctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    rctx.closePath();

    const landGrad = ctx.createLinearGradient(0, 80, 0, 420);
    landGrad.addColorStop(0, '#0E4D82');
    landGrad.addColorStop(0.5, '#156AB0');
    landGrad.addColorStop(1, '#0A3D6B');
    ctx.fillStyle = landGrad;
    ctx.fill();
    ctx.strokeStyle = '#38BDF8';
    ctx.lineWidth = 2;
    ctx.stroke();

    rctx.fillStyle = '#C8C8C8'; // Continents are matte
    rctx.fill();
  }

  // Printed-circuit recovery traces linking circular economy hubs
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
  ctx.lineWidth = 1.5;
  const hubs = [
    [665, 215], // India hub
    [520, 145], // Europe hub
    [225, 175], // North America hub
    [775, 195], // East Asia hub
    [845, 355], // Oceania hub
    [545, 310], // Africa hub
  ];
  for (let i = 0; i < hubs.length; i++) {
    const [x1, y1] = hubs[i];
    const [x2, y2] = hubs[(i + 1) % hubs.length];
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - 24, x2, y2);
    ctx.stroke();

    ctx.fillStyle = '#7DD3FC';
    ctx.beginPath();
    ctx.arc(x1, y1, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  colorMap.anisotropy = maxAniso;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.anisotropy = maxAniso;

  return { colorMap, roughnessMap };
}

function buildCompositeSatellite(
  bodyMat: THREE.Material,
  panelMat: THREE.Material,
  accentMat: THREE.Material
): THREE.Group {
  const sat = new THREE.Group();

  // Primary silhouette: octagonal chassis
  const chassis = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.24, 8), bodyMat);
  chassis.castShadow = true;
  sat.add(chassis);

  // Secondary read: twin articulated solar wing arrays
  const wingGeo = new THREE.BoxGeometry(0.48, 0.018, 0.16);
  const leftWing = new THREE.Mesh(wingGeo, panelMat);
  leftWing.position.set(-0.34, 0, 0);
  const rightWing = new THREE.Mesh(wingGeo, panelMat);
  rightWing.position.set(0.34, 0, 0);
  sat.add(leftWing, rightWing);

  // Strut mounts
  const strutGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.85, 6);
  strutGeo.rotateZ(Math.PI / 2);
  const strut = new THREE.Mesh(strutGeo, bodyMat);
  sat.add(strut);

  // Accent detail: optical telemetry dish + recovery beacon core
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.06, 12, 1, true), accentMat);
  dish.position.set(0, -0.15, 0);
  dish.rotation.x = Math.PI;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), accentMat);
  beacon.position.set(0, 0.15, 0);
  sat.add(dish, beacon);

  return sat;
}

export const EarthCanvas: React.FC<EarthCanvasProps> = ({ className = '' }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const presetRef = useRef<CameraPreset>('overview');
  const explodedRef = useRef<boolean>(false);
  const resetSignalRef = useRef<number>(0);

  const [preset, setPreset] = useState<CameraPreset>('overview');
  const [exploded, setExploded] = useState(false);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [webglError, setWebglError] = useState(false);

  const handlePreset = (next: CameraPreset) => {
    presetRef.current = next;
    setPreset(next);
  };

  const handleToggleExploded = () => {
    const next = !explodedRef.current;
    explodedRef.current = next;
    setExploded(next);
  };

  const handleReset = () => {
    presetRef.current = 'overview';
    explodedRef.current = false;
    setPreset('overview');
    setExploded(false);
    resetSignalRef.current += 1;
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError(true);
      return;
    }

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 480;
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x040e1a, 0.045);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 1.35, 6.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 4.0;
    controls.maxDistance = 9.5;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;

    let userDragging = false;
    controls.addEventListener('start', () => {
      userDragging = true;
    });
    controls.addEventListener('end', () => {
      userDragging = false;
    });

    // Balanced 3-point studio lighting rig (warm key vs cool hemisphere fill + emerald rim)
    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
    keyLight.position.set(6, 7, 6);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 20;
      keyLight.shadow.camera.left = -4;
      keyLight.shadow.camera.right = 4;
      keyLight.shadow.camera.top = 4;
      keyLight.shadow.camera.bottom = -4;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x08203a, 0.9);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    rimLight.position.set(-6, -2, -5);
    scene.add(rimLight);

    // Master Composite Assembly (10+ distinct parts)
    const assembly = new THREE.Group();
    scene.add(assembly);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const { colorMap, roughnessMap } = createProceduralEarthTextures(maxAniso);

    // Part 1: Planetary Core Globe (procedural land/ocean/circuit PBR)
    const globeGeo = new THREE.SphereGeometry(1.62, 48, 48);
    const globeMat = new THREE.MeshStandardMaterial({
      map: colorMap,
      roughnessMap,
      roughness: 0.72,
      metalness: 0.18,
    });
    const globeMesh = new THREE.Mesh(globeGeo, globeMat);
    globeMesh.castShadow = true;
    globeMesh.receiveShadow = true;
    assembly.add(globeMesh);

    // Part 2: Translucent Atmospheric Shell
    const atmoGeo = new THREE.SphereGeometry(1.74, 36, 36);
    const atmoMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.14,
      roughness: 0.15,
      metalness: 0.0,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    atmoMesh.renderOrder = 2;
    assembly.add(atmoMesh);

    // Part 3: Brushed Titanium Primary Orbital Track (TubeGeometry)
    const ringPoints: THREE.Vector3[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(a) * 2.38, Math.sin(a * 2) * 0.08, Math.sin(a) * 2.38));
    }
    const ringCurve = new THREE.CatmullRomCurve3(ringPoints, true);
    const primaryRingGeo = new THREE.TubeGeometry(ringCurve, 96, 0.036, 12, true);
    const titaniumMat = new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      metalness: 0.92,
      roughness: 0.22,
      clearcoat: 0.4,
    });
    const primaryRing = new THREE.Mesh(primaryRingGeo, titaniumMat);
    primaryRing.rotation.z = THREE.MathUtils.degToRad(18);
    primaryRing.rotation.x = THREE.MathUtils.degToRad(12);
    assembly.add(primaryRing);

    // Part 4: Secondary Circular Recovery Track (emerald anodized metal)
    const secondaryRingGeo = new THREE.TorusGeometry(2.12, 0.018, 12, 96);
    const emeraldMetalMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      metalness: 0.82,
      roughness: 0.25,
      emissive: 0x0369a1,
      emissiveIntensity: 0.45,
    });
    const secondaryRing = new THREE.Mesh(secondaryRingGeo, emeraldMetalMat);
    secondaryRing.rotation.x = Math.PI / 2 - THREE.MathUtils.degToRad(28);
    secondaryRing.rotation.y = THREE.MathUtils.degToRad(24);
    assembly.add(secondaryRing);

    // Parts 5-7: Three Composite Orbital Recycling Satellites
    const satChassisMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      metalness: 0.85,
      roughness: 0.24,
    });
    const satPanelMat = new THREE.MeshStandardMaterial({
      color: 0x075985,
      metalness: 0.4,
      roughness: 0.55,
      emissive: 0x0284c7,
      emissiveIntensity: 0.22,
    });
    const satAccentMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.2,
      roughness: 0.3,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.85,
    });

    const satellites: { group: THREE.Group; angleOffset: number; radius: number; tilt: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const sat = buildCompositeSatellite(satChassisMat, satPanelMat, satAccentMat);
      assembly.add(sat);
      satellites.push({
        group: sat,
        angleOffset: (i * Math.PI * 2) / 3,
        radius: 2.38,
        tilt: 0.32,
      });
    }

    // Parts 8-13: Beveled Hexagonal Collection Hub Beacons anchored on Earth surface
    const hexShape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rx = Math.cos(a) * 0.085;
      const ry = Math.sin(a) * 0.085;
      if (i === 0) hexShape.moveTo(rx, ry);
      else hexShape.lineTo(rx, ry);
    }
    hexShape.closePath();
    const hubGeo = new THREE.ExtrudeGeometry(hexShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.015,
      bevelSegments: 2,
    });
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      metalness: 0.65,
      roughness: 0.22,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
    });

    const hubCoords: [number, number][] = [
      [28.6, 77.2],   // Delhi
      [13.0, 77.5],   // Bengaluru
      [19.1, 73.0],   // Mumbai
      [51.5, -0.1],   // London
      [35.6, 139.7],  // Tokyo
      [37.7, -122.4], // San Francisco
    ];
    const hubMeshes: { mesh: THREE.Mesh; normal: THREE.Vector3 }[] = [];
    for (const [lat, lng] of hubCoords) {
      const phi = THREE.MathUtils.degToRad(90 - lat);
      const theta = THREE.MathUtils.degToRad(lng + 180);
      const normal = new THREE.Vector3(
        -Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();
      const hub = new THREE.Mesh(hubGeo, hubMat);
      hub.position.copy(normal).multiplyScalar(1.58);
      hub.lookAt(normal.clone().multiplyScalar(3));
      globeMesh.add(hub);
      hubMeshes.push({ mesh: hub, normal });
    }

    // InstancedMesh of 120 recovered material particles (copper, aluminum, silicon, gold)
    const particleCount = 120;
    const partGeo = new THREE.OctahedronGeometry(0.032, 0);
    const partMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.85,
      roughness: 0.2,
    });
    const particleMesh = new THREE.InstancedMesh(partGeo, partMat, particleCount);
    particleMesh.frustumCulled = false;

    const palette = [
      new THREE.Color(0x38bdf8), // emerald
      new THREE.Color(0xf59e0b), // recovered gold/copper
      new THREE.Color(0x94a3b8), // aluminum
      new THREE.Color(0x7dd3fc), // silicon glow
    ];
    const particleParams = Array.from({ length: particleCount }, (_, i) => {
      particleMesh.setColorAt(i, palette[i % palette.length]);
      return {
        radius: 2.0 + (i % 9) * 0.14,
        speed: 0.18 + (i % 5) * 0.05,
        phase: (i / particleCount) * Math.PI * 2,
        yAmp: 0.35 + (i % 4) * 0.22,
        scale: 0.75 + (i % 5) * 0.15,
      };
    });
    if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
    assembly.add(particleMesh);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;
    let currentExplode = 0;
    let lastResetSignal = resetSignalRef.current;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      if (!prefersReduced) {
        elapsed += dt;
      }

      // Smoothly interpolate exploded circular-layer view
      const targetExplode = explodedRef.current ? 1 : 0;
      currentExplode = THREE.MathUtils.damp(currentExplode, targetExplode, 5.5, dt);

      globeMesh.rotation.y = elapsed * 0.14;
      primaryRing.rotation.y = -elapsed * 0.12;
      secondaryRing.rotation.z = elapsed * 0.2;

      const ringScale = 1 + currentExplode * 0.22;
      primaryRing.scale.setScalar(ringScale);
      secondaryRing.scale.setScalar(1 + currentExplode * 0.3);
      atmoMesh.scale.setScalar(1 + currentExplode * 0.14);

      for (const h of hubMeshes) {
        h.mesh.position.copy(h.normal).multiplyScalar(1.58 + currentExplode * 0.34);
      }

      // Update composite orbital satellites
      for (const sat of satellites) {
        const angle = elapsed * 0.42 + sat.angleOffset;
        const r = (sat.radius + currentExplode * 0.52);
        sat.group.position.set(
          Math.cos(angle) * r,
          Math.sin(angle * 2) * sat.tilt,
          Math.sin(angle) * r
        );
        sat.group.lookAt(0, 0, 0);
      }

      // Update instanced recovered-material stream
      for (let i = 0; i < particleCount; i++) {
        const p = particleParams[i];
        const a = p.phase + elapsed * p.speed;
        const r = p.radius + currentExplode * 0.45;
        _dummyPos.set(Math.cos(a) * r, Math.sin(a * 1.5 + p.phase) * p.yAmp, Math.sin(a) * r);
        _dummyQuat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a * 2);
        _dummyScale.setScalar(p.scale);
        _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
        particleMesh.setMatrixAt(i, _dummyMatrix);
      }
      particleMesh.instanceMatrix.needsUpdate = true;

      // Smooth camera preset transitions (yield immediately when user drags)
      if (!userDragging) {
        const mode = presetRef.current;
        if (mode === 'overview') _targetCamPos.set(0, 1.35, 6.4);
        else if (mode === 'orbital') _targetCamPos.set(4.6, 2.7, 4.2);
        else _targetCamPos.set(0.4, 0.3, 4.35);

        if (lastResetSignal !== resetSignalRef.current) {
          lastResetSignal = resetSignalRef.current;
          controls.target.set(0, 0, 0);
        }

        const k = 1 - Math.exp(-3.8 * dt);
        camera.position.lerp(_targetCamPos, k);
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    tick();

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      controls.dispose();
      colorMap.dispose();
      roughnessMap.dispose();
      globeGeo.dispose();
      globeMat.dispose();
      atmoGeo.dispose();
      atmoMat.dispose();
      primaryRingGeo.dispose();
      titaniumMat.dispose();
      secondaryRingGeo.dispose();
      emeraldMetalMat.dispose();
      hubGeo.dispose();
      hubMat.dispose();
      partGeo.dispose();
      partMat.dispose();
      satChassisMat.dispose();
      satPanelMat.dispose();
      satAccentMat.dispose();
      envTarget.dispose();
      renderer.dispose();
    };
  }, []);

  if (webglError) {
    return (
      <div className={`relative rounded-2xl border border-sky-900/50 bg-[#040E1A] overflow-hidden flex items-center justify-center p-6 ${className}`}>
        <Globe size={260} className="min-h-[360px]" />
      </div>
    );
  }

  return (
    <div className={`relative rounded-2xl border border-sky-900/50 dark:border-sky-800/60 bg-[#040E1A] overflow-hidden ${className}`}>
      {/* Dedicated isolated WebGL mount node */}
      <div ref={mountRef} className="w-full h-full min-h-[420px] lg:min-h-[520px]" />

      {/* Collapsible compact bottom control dock (solid rgba surface, no backdrop-filter over WebGL) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center max-w-[94%]">
        <button
          type="button"
          onClick={() => setControlsCollapsed((v) => !v)}
          className="mb-1.5 px-3 py-1 rounded-md text-xs font-medium text-sky-100 bg-[#09203A]/95 border border-sky-800/80 hover:bg-[#13345B] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          {controlsCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          {controlsCollapsed ? 'Show 3D Controls' : 'Hide Controls'}
        </button>

        {!controlsCollapsed && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 p-1.5 rounded-xl bg-[#09203A]/95 border border-sky-800/80 shadow-lg">
            {(['overview', 'orbital', 'core'] as CameraPreset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handlePreset(p)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                  preset === p
                    ? 'bg-sky-500 text-sky-950'
                    : 'text-sky-100/80 hover:text-white hover:bg-sky-900/60'
                }`}
              >
                {p === 'overview' ? 'Overview' : p === 'orbital' ? 'Orbital Fleet' : 'Hub Focus'}
              </button>
            ))}
            <button
              type="button"
              onClick={handleToggleExploded}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                exploded
                  ? 'bg-sky-400 text-sky-950'
                  : 'text-sky-100/80 hover:text-white hover:bg-sky-900/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              {exploded ? 'Collapse Layers' : 'Explode Layers'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset 3D camera"
              className="p-1.5 rounded-lg text-sky-100/80 hover:text-white hover:bg-sky-900/60 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
