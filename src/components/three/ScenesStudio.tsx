import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Globe2,
  Layers,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Sun,
  X,
} from 'lucide-react';
import { createProceduralTextures } from './textures';
import {
  buildCollectionHubScene,
  buildExplodedDeviceScene,
  buildOrbitalNetworkScene,
  type InspectableSpec,
} from './models';

export type SceneId = 'hub' | 'device' | 'orbital';
type CameraPreset = 'overview' | 'closeup' | 'aerial';
type LightingMood = 'dusk' | 'day';

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _dummyMatrix = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _dummyScale = new THREE.Vector3(1, 1, 1);
const _targetCam = new THREE.Vector3();
const _targetLook = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

interface CameraGoal {
  pos: [number, number, number];
  target: [number, number, number];
}

const CAMERA_PRESETS: Record<SceneId, Record<CameraPreset, CameraGoal>> = {
  hub: {
    overview: { pos: [13.5, 8.2, 14.5], target: [0, 1.4, 0] },
    closeup: { pos: [5.8, 3.2, 7.6], target: [-0.4, 1.5, 0.4] },
    aerial: { pos: [0.5, 19.5, 11.5], target: [0, 0.5, 0] },
  },
  device: {
    overview: { pos: [6.2, 4.4, 6.8], target: [0, 1.2, 0] },
    closeup: { pos: [2.8, 2.5, 4.1], target: [0, 1.0, -0.3] },
    aerial: { pos: [0.2, 9.2, 3.6], target: [0, 0.8, 0] },
  },
  orbital: {
    overview: { pos: [0, 2.2, 8.2], target: [0, 0, 0] },
    closeup: { pos: [2.4, 1.1, 5.2], target: [0, 0, 0] },
    aerial: { pos: [5.4, 5.6, 5.2], target: [0, 0, 0] },
  },
};

const SCENE_META: Record<
  SceneId,
  { label: string; title: string; subtitle: string; hint: string }
> = {
  hub: {
    label: 'Eco Hub',
    title: 'Smart Collection Hub & EV Fleet',
    subtitle: 'Solar-powered sorting bay, twin recovery cyclones & active EV routing loop',
    hint: 'Click facility or EV van to inspect · Drag to orbit · Scroll to zoom',
  },
  device: {
    label: 'Device Anatomy',
    title: 'Exploded Workstation Recovery View',
    subtitle: '6-layer composite teardown showing battery quarantine & copper/gold streams',
    hint: 'Adjust Explode slider or click any hardware layer to inspect material yield',
  },
  orbital: {
    label: 'Orbital Network',
    title: 'Global Circular Telemetry Network',
    subtitle: 'Planetary e-waste hubs, composite satellites & recovered material streams',
    hint: 'Adjust Explode slider to expand orbital tracks & hub beacons',
  },
};

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  });
}

export const ScenesStudio: React.FC = () => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Mutable refs consumed inside the 60fps loop without re-creating WebGLRenderer
  const activeSceneRef = useRef<SceneId>('hub');
  const explodeTargetRef = useRef<number>(0.45);
  const moodRef = useRef<LightingMood>('dusk');
  const pausedRef = useRef<boolean>(false);
  const transitionGoalRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  const [activeScene, setActiveScene] = useState<SceneId>('hub');
  const [preset, setPreset] = useState<CameraPreset>('overview');
  const [explodePct, setExplodePct] = useState<number>(45);
  const [mood, setMood] = useState<LightingMood>('dusk');
  const [paused, setPaused] = useState<boolean>(false);
  const [controlsCollapsed, setControlsCollapsed] = useState<boolean>(false);
  const [inspected, setInspected] = useState<InspectableSpec | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState<boolean>(false);

  const scheduleCameraGoal = (sceneId: SceneId, nextPreset: CameraPreset) => {
    const goal = CAMERA_PRESETS[sceneId][nextPreset];
    transitionGoalRef.current = {
      pos: new THREE.Vector3(...goal.pos),
      target: new THREE.Vector3(...goal.target),
    };
  };

  const handleSelectScene = (next: SceneId) => {
    activeSceneRef.current = next;
    setActiveScene(next);
    setPreset('overview');
    setInspected(null);
    scheduleCameraGoal(next, 'overview');
  };

  const handleSelectPreset = (next: CameraPreset) => {
    setPreset(next);
    scheduleCameraGoal(activeSceneRef.current, next);
  };

  const handleExplodeChange = (val: number) => {
    setExplodePct(val);
    explodeTargetRef.current = val / 100;
  };

  const handleToggleMood = () => {
    const next: LightingMood = moodRef.current === 'dusk' ? 'day' : 'dusk';
    moodRef.current = next;
    setMood(next);
  };

  const handleTogglePause = () => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
  };

  const handleReset = () => {
    setPreset('overview');
    setInspected(null);
    if (activeSceneRef.current === 'device') {
      setExplodePct(45);
      explodeTargetRef.current = 0.45;
    }
    scheduleCameraGoal(activeSceneRef.current, 'overview');
  };

  // Keyboard shortcut 'H' for Zen collapse/expand HUD
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setControlsCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Single stable WebGL lifecycle
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
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const initW = container.clientWidth || window.innerWidth;
    const initH = container.clientHeight || Math.max(520, window.innerHeight - 64);
    renderer.setSize(initW, initH);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(0x071525);
    scene.background = bgColor;
    const fog = new THREE.FogExp2(0x071525, 0.018);
    scene.fog = fog;

    // Mandatory studio environment map via RoomEnvironment + PMREMGenerator
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, initW / initH, 0.1, 160);
    const startGoal = CAMERA_PRESETS.hub.overview;
    camera.position.set(...startGoal.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...startGoal.target);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.8;
    controls.maxDistance = 32;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;

    // Cancel scripted camera transition immediately when user starts orbiting/zooming
    controls.addEventListener('start', () => {
      transitionGoalRef.current = null;
    });

    // Studio 3-point lighting rig (warm directional key + cool hemisphere fill + rim + GPU softbox)
    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.3);
    keyLight.position.set(12, 16, 10);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.camera.near = 2;
      keyLight.shadow.camera.far = 48;
      keyLight.shadow.camera.left = -16;
      keyLight.shadow.camera.right = 16;
      keyLight.shadow.camera.top = 16;
      keyLight.shadow.camera.bottom = -16;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x0b1f33, 0.95);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.25);
    rimLight.position.set(-11, 6, -12);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softbox = new THREE.RectAreaLight(0xe0f2fe, 2.2, 8, 4);
      softbox.position.set(0, 7.5, 5);
      softbox.lookAt(0, 1, 0);
      scene.add(softbox);
    }

    // Build all 3 procedural composite scenes once & toggle visibility cleanly
    const textures = createProceduralTextures(renderer.capabilities.getMaxAnisotropy());
    const hub = buildCollectionHubScene(textures, isSoftwareGl);
    const device = buildExplodedDeviceScene(textures, isSoftwareGl);
    const orbital = buildOrbitalNetworkScene(textures);

    hub.root.visible = true;
    device.root.visible = false;
    orbital.root.visible = false;
    scene.add(hub.root, device.root, orbital.root);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Dedicated Layer 1 Raycasting for part inspection on click (zero heavy per-frame raycasts)
    _raycaster.layers.set(1);
    let pointerDownX = 0;
    let pointerDownY = 0;

    const onPointerDown = (e: PointerEvent) => {
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY);
      if (moved > 6) return; // Ignore orbit drags

      const rect = renderer.domElement.getBoundingClientRect();
      _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointer, camera);

      const candidates =
        activeSceneRef.current === 'hub'
          ? hub.interactiveMeshes
          : activeSceneRef.current === 'device'
            ? device.interactiveMeshes
            : [];
      if (candidates.length === 0) return;

      const hits = _raycaster.intersectObjects(candidates, false);
      if (hits.length > 0 && hits[0].object.userData.spec) {
        setInspected(hits[0].object.userData.spec as InspectableSpec);
      } else {
        setInspected(null);
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();
    let elapsed = 0;
    let currentExplode = explodeTargetRef.current;

    const duskBg = new THREE.Color(0x071525);
    const dayBg = new THREE.Color(0xc7e3f7);
    const duskHemiSky = new THREE.Color(0x7dd3fc);
    const dayHemiSky = new THREE.Color(0xe0f2fe);
    const duskHemiGround = new THREE.Color(0x0b1f33);
    const dayHemiGround = new THREE.Color(0x475569);

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

      if (!prefersReduced && !pausedRef.current) {
        elapsed += dt;
      }

      const mode = activeSceneRef.current;
      hub.root.visible = mode === 'hub';
      device.root.visible = mode === 'device';
      orbital.root.visible = mode === 'orbital';

      // Smooth sky / fog / lighting mood damping
      const isDay = moodRef.current === 'day';
      const moodAlpha = 1 - Math.exp(-4.5 * dt);
      bgColor.lerp(isDay ? dayBg : duskBg, moodAlpha);
      fog.color.copy(bgColor);
      fog.density = THREE.MathUtils.damp(
        fog.density,
        mode === 'hub' ? (isDay ? 0.011 : 0.017) : 0.012,
        4.0,
        dt
      );
      hemiLight.color.lerp(isDay ? dayHemiSky : duskHemiSky, moodAlpha);
      hemiLight.groundColor.lerp(isDay ? dayHemiGround : duskHemiGround, moodAlpha);
      hemiLight.intensity = THREE.MathUtils.damp(hemiLight.intensity, isDay ? 1.35 : 0.92, 4.0, dt);
      keyLight.intensity = THREE.MathUtils.damp(keyLight.intensity, isDay ? 2.6 : 2.15, 4.0, dt);

      // Exponentially damped exploded-view value
      currentExplode = THREE.MathUtils.damp(currentExplode, explodeTargetRef.current, 5.5, dt);

      if (mode === 'hub') {
        // Animate EV van along circular loading lane (radius 8.05)
        const vanAngle = elapsed * 0.34;
        const r = 8.05;
        hub.vanGroup.position.set(Math.cos(vanAngle) * r, 0.05, Math.sin(vanAngle) * r);
        hub.vanGroup.rotation.y = -vanAngle - Math.PI / 2;
        for (const wheel of hub.vanWheels) {
          wheel.rotation.z = -elapsed * 6.5;
        }
        // Rooftop micro wind turbine
        hub.turbineRotor.rotation.z = -elapsed * 2.4;
        // Conveyor crates moving cleanly into intake hall
        hub.conveyorCrates.forEach((crate, idx) => {
          const offset = ((elapsed * 0.42 + idx * 0.33) % 1) * 2.6;
          crate.position.x = 3.55 - offset;
        });
      } else if (mode === 'device') {
        // Animate exploded hardware layers
        for (const layer of device.layers) {
          layer.group.position.y = THREE.MathUtils.lerp(
            layer.baseY,
            layer.explodeY,
            currentExplode
          );
        }
        for (const fan of device.fans) {
          fan.rotation.y = elapsed * 5.2;
        }
        // Orbit recovered copper/gold/aluminum/silicon ingots
        const count = device.ingotParams.length;
        for (let i = 0; i < count; i++) {
          const p = device.ingotParams[i];
          const a = p.phase + elapsed * p.speed;
          const rad = p.radius + currentExplode * 0.65;
          _dummyPos.set(
            Math.cos(a) * rad,
            0.35 + p.yOffset * (0.35 + currentExplode * 0.95) + Math.sin(a * 2) * 0.14,
            Math.sin(a) * rad
          );
          _dummyQuat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a * 2.5);
          _dummyScale.setScalar(p.scale * (0.45 + currentExplode * 0.65));
          _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
          device.ingotsMesh.setMatrixAt(i, _dummyMatrix);
        }
        device.ingotsMesh.instanceMatrix.needsUpdate = true;
      } else {
        // Scene 3: Orbital circular network
        orbital.globeMesh.rotation.y = elapsed * 0.14;
        orbital.primaryRing.rotation.y = -elapsed * 0.12;
        orbital.secondaryRing.rotation.z = elapsed * 0.2;
        orbital.primaryRing.scale.setScalar(1 + currentExplode * 0.22);
        orbital.secondaryRing.scale.setScalar(1 + currentExplode * 0.28);
        orbital.atmoMesh.scale.setScalar(1 + currentExplode * 0.12);

        for (const h of orbital.hubMeshes) {
          h.mesh.position.copy(h.normal).multiplyScalar(2.0 + currentExplode * 0.36);
        }
        for (const sat of orbital.satellites) {
          const angle = elapsed * 0.4 + sat.angleOffset;
          const r = sat.radius + currentExplode * 0.55;
          sat.group.position.set(
            Math.cos(angle) * r,
            Math.sin(angle * 2) * sat.tilt,
            Math.sin(angle) * r
          );
          sat.group.lookAt(0, 0, 0);
        }
        const count = orbital.particleParams.length;
        for (let i = 0; i < count; i++) {
          const p = orbital.particleParams[i];
          const a = p.phase + elapsed * p.speed;
          const r = p.radius + currentExplode * 0.48;
          _dummyPos.set(
            Math.cos(a) * r,
            Math.sin(a * 1.5 + p.phase) * p.yAmp,
            Math.sin(a) * r
          );
          _dummyQuat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a * 2);
          _dummyScale.setScalar(p.scale);
          _dummyMatrix.compose(_dummyPos, _dummyQuat, _dummyScale);
          orbital.particleMesh.setMatrixAt(i, _dummyMatrix);
        }
        orbital.particleMesh.instanceMatrix.needsUpdate = true;
      }

      // Exponentially damped camera preset transition (clears on arrival)
      const goal = transitionGoalRef.current;
      if (goal) {
        const k = 1 - Math.exp(-5.0 * dt);
        _targetCam.copy(goal.pos);
        _targetLook.copy(goal.target);
        camera.position.lerp(_targetCam, k);
        controls.target.lerp(_targetLook, k);
        if (
          camera.position.distanceTo(_targetCam) < 0.03 &&
          controls.target.distanceTo(_targetLook) < 0.03
        ) {
          transitionGoalRef.current = null;
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    tick();

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || Math.max(520, window.innerHeight - 64);
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
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      controls.dispose();
      disposeObjectTree(hub.root);
      disposeObjectTree(device.root);
      disposeObjectTree(orbital.root);
      textures.dispose();
      envTarget.dispose();
      renderer.dispose();
    };
  }, []);

  const meta = SCENE_META[activeScene];

  if (webglUnavailable) {
    return (
      <div className="w-full h-[calc(100vh-4rem)] flex items-center justify-center bg-[#071525] text-sky-100 px-6 text-center">
        <div className="max-w-md space-y-2">
          <h2 className="font-display text-xl font-bold">3D WebGL Viewport Unavailable</h2>
          <p className="text-sm text-sky-200/75">
            Your browser graphics context could not initialize WebGL2. Enable hardware acceleration or try a modern desktop browser to explore the interactive 3D scenes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] overflow-hidden bg-[#071525] select-none">
      {/* Isolated Full-Bleed WebGL Mount Container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Minimal Top-Left Scene Title & Optional Clicked-Part Spec Card (solid rgba, zero backdrop-filter) */}
      <div className="pointer-events-none absolute top-4 left-4 z-10 max-w-sm space-y-2.5">
        <div className="pointer-events-auto rounded-xl px-4 py-3 bg-[#07192E]/92 border border-sky-800/75 shadow-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-400">
            Interactive 3D Studio · {meta.label}
          </p>
          <h1 className="font-display text-base sm:text-lg font-bold text-white leading-tight mt-0.5">
            {meta.title}
          </h1>
          <p className="text-xs text-sky-200/80 mt-1 leading-relaxed">{meta.subtitle}</p>
          <p className="text-[11px] text-sky-300/70 mt-1.5">{meta.hint}</p>
        </div>

        {inspected && (
          <div className="pointer-events-auto rounded-xl px-4 py-3 bg-[#07192E]/95 border border-sky-500/80 shadow-xl space-y-1.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-white">{inspected.title}</p>
                <p className="text-[11px] text-sky-300">{inspected.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setInspected(null)}
                aria-label="Close part specification"
                className="p-1 rounded-md text-sky-200/70 hover:text-white hover:bg-sky-900/60 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs font-mono font-semibold text-emerald-300">
              {inspected.recoveryMetric}
            </p>
            <p className="text-[11px] text-sky-100/80 leading-relaxed">{inspected.note}</p>
          </div>
        )}
      </div>

      {/* Single Compact Collapsible Bottom Control Dock (Zero Side Panels, Solid rgba Surface) */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center max-w-[min(940px,94vw)]">
        <button
          type="button"
          onClick={() => setControlsCollapsed((v) => !v)}
          className="mb-1.5 px-3 py-1 rounded-md text-xs font-medium text-sky-100 bg-[#07192E]/95 border border-sky-800/80 hover:bg-[#102B4A] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          {controlsCollapsed ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
          {controlsCollapsed ? 'Show Controls (H)' : 'Hide Controls (H)'}
        </button>

        {!controlsCollapsed && (
          <div className="flex flex-wrap items-center justify-center gap-2 px-3 py-2 rounded-2xl bg-[#07192E]/95 border border-sky-800/80 shadow-2xl">
            {/* Scene Switcher */}
            <div className="inline-flex items-center gap-1 pr-2 border-r border-sky-800/70">
              {(
                [
                  { id: 'hub', label: 'Eco Hub', icon: Building2 },
                  { id: 'device', label: 'Device Anatomy', icon: Cpu },
                  { id: 'orbital', label: 'Orbital Network', icon: Globe2 },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = activeScene === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectScene(item.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-sky-500 text-sky-950'
                        : 'text-sky-100/80 hover:text-white hover:bg-sky-900/60'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Camera View Presets */}
            <div className="inline-flex items-center gap-1 pr-2 border-r border-sky-800/70">
              {(
                [
                  { id: 'overview', label: 'Overview' },
                  { id: 'closeup', label: 'Close-Up' },
                  { id: 'aerial', label: 'Aerial' },
                ] as const
              ).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => handleSelectPreset(cam.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    preset === cam.id
                      ? 'bg-sky-800 text-white'
                      : 'text-sky-200/80 hover:text-white hover:bg-sky-900/50'
                  }`}
                >
                  {cam.label}
                </button>
              ))}
            </div>

            {/* Exploded View Slider (Device & Orbital scenes) */}
            {activeScene !== 'hub' && (
              <label className="inline-flex items-center gap-2 pr-2 border-r border-sky-800/70 text-xs text-sky-100 whitespace-nowrap">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>Explode</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={explodePct}
                  onChange={(e) => handleExplodeChange(Number(e.target.value))}
                  className="w-20 sm:w-24 accent-sky-400 cursor-pointer"
                />
                <span className="font-mono text-[11px] w-8 text-right text-sky-300">
                  {explodePct}%
                </span>
              </label>
            )}

            {/* Mood, Play/Pause & Camera Reset */}
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={handleToggleMood}
                title="Switch Studio Day / Dusk lighting"
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-sky-100/85 hover:text-white hover:bg-sky-900/60 inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                {mood === 'dusk' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                {mood === 'dusk' ? 'Daylight' : 'Dusk'}
              </button>
              <button
                type="button"
                onClick={handleTogglePause}
                aria-label={paused ? 'Resume animation' : 'Pause animation'}
                title={paused ? 'Resume animation' : 'Pause animation'}
                className="p-1.5 rounded-lg text-sky-100/85 hover:text-white hover:bg-sky-900/60 transition-colors cursor-pointer"
              >
                {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={handleReset}
                aria-label="Reset camera"
                title="Reset camera"
                className="p-1.5 rounded-lg text-sky-100/85 hover:text-white hover:bg-sky-900/60 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
