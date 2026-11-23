import * as THREE from 'three';
import type { ProceduralTextureSet } from './textures';

export interface InspectableSpec {
  id: string;
  title: string;
  subtitle: string;
  recoveryMetric: string;
  note: string;
}

export interface HubSceneHandles {
  root: THREE.Group;
  vanGroup: THREE.Group;
  vanWheels: THREE.Object3D[];
  turbineRotor: THREE.Object3D;
  conveyorCrates: THREE.Mesh[];
  interactiveMeshes: THREE.Object3D[];
}

export interface DeviceSceneHandles {
  root: THREE.Group;
  layers: {
    group: THREE.Group;
    baseY: number;
    explodeY: number;
  }[];
  fans: THREE.Object3D[];
  ingotsMesh: THREE.InstancedMesh;
  ingotParams: { radius: number; phase: number; speed: number; yOffset: number; scale: number }[];
  interactiveMeshes: THREE.Object3D[];
}

export interface OrbitalSceneHandles {
  root: THREE.Group;
  globeMesh: THREE.Mesh;
  atmoMesh: THREE.Mesh;
  primaryRing: THREE.Mesh;
  secondaryRing: THREE.Mesh;
  satellites: { group: THREE.Group; angleOffset: number; radius: number; tilt: number }[];
  hubMeshes: { mesh: THREE.Mesh; normal: THREE.Vector3 }[];
  particleMesh: THREE.InstancedMesh;
  particleParams: { radius: number; speed: number; phase: number; yAmp: number; scale: number }[];
}

function tagInspectable(obj: THREE.Object3D, spec: InspectableSpec, list: THREE.Object3D[]) {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      child.userData.spec = spec;
      child.layers.enable(1);
      list.push(child);
    }
  });
}

function addContactShadow(
  parent: THREE.Object3D,
  shadowTex: THREE.Texture,
  width: number,
  depth: number,
  y = 0.015,
  opacity = 0.45
) {
  const geo = new THREE.PlaneGeometry(width, depth);
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const plane = new THREE.Mesh(geo, mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = y;
  parent.add(plane);
  return plane;
}

/**
 * Scene 1: Composite Smart E-Waste Collection Hub & Electric Fleet (outdoor perimeter, bottom-center pivots)
 */
export function buildCollectionHubScene(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): HubSceneHandles {
  const root = new THREE.Group();
  const interactiveMeshes: THREE.Object3D[] = [];

  // 1. Extended Natural Terrain Ground (extends smoothly into horizon fog)
  const terrainGeo = new THREE.CircleGeometry(65, 64);
  const terrainMat = new THREE.MeshStandardMaterial({
    color: 0x16292d,
    roughness: 0.94,
    metalness: 0.02,
  });
  const terrain = new THREE.Mesh(terrainGeo, terrainMat);
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  root.add(terrain);

  // 2. Paved Loading Apron & Drive Loop (offset +0.025 on Y to prevent Z-fighting)
  const apronGeo = new THREE.CylinderGeometry(11.6, 12.1, 0.05, 48);
  const apronMat = new THREE.MeshStandardMaterial({
    map: textures.asphaltAlbedo,
    roughnessMap: textures.asphaltRoughness,
    roughness: 0.88,
    metalness: 0.05,
  });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.position.y = 0.025;
  apron.receiveShadow = true;
  root.add(apron);

  // Subtle glowing circular guide lane on apron
  const laneGeo = new THREE.RingGeometry(7.95, 8.15, 72);
  const laneMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.45,
    roughness: 0.4,
    metalness: 0.1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const lane = new THREE.Mesh(laneGeo, laneMat);
  lane.rotation.x = -Math.PI / 2;
  lane.position.y = 0.055;
  root.add(lane);

  // 3. Composite Recycling & Collection Hub Structure (11 distinct parts, bottom-center pivot at y=0.05)
  const facilityGroup = new THREE.Group();
  facilityGroup.position.set(-0.6, 0.05, -0.8);
  addContactShadow(facilityGroup, textures.contactShadow, 10.4, 7.6, 0.015, 0.5);

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.88,
    metalness: 0.05,
  });
  const cladMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.42,
    metalness: 0.25,
  });
  const steelMat = new THREE.MeshPhysicalMaterial({
    color: 0x334155,
    roughness: 0.26,
    metalness: 0.86,
    clearcoat: 0.25,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    roughness: 0.08,
    metalness: 0.1,
    transmission: isSoftwareGl ? 0 : 0.72,
    transparent: true,
    opacity: isSoftwareGl ? 0.48 : 0.92,
    ior: 1.5,
    thickness: 0.4,
    depthWrite: false,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    emissive: 0x0284c7,
    emissiveIntensity: 0.65,
    roughness: 0.25,
    metalness: 0.35,
  });
  const solarMat = new THREE.MeshStandardMaterial({
    map: textures.solarAlbedo,
    roughness: 0.22,
    metalness: 0.55,
  });

  // Part A: Concrete Loading Plinth
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.36, 5.2), concreteMat);
  plinth.position.y = 0.18;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  facilityGroup.add(plinth);

  // Part B: Beveled Main Processing Hall (ExtrudeGeometry)
  const hallShape = new THREE.Shape();
  hallShape.moveTo(-3.4, 0);
  hallShape.lineTo(3.4, 0);
  hallShape.lineTo(3.4, 2.35);
  hallShape.lineTo(1.8, 2.85);
  hallShape.lineTo(-3.4, 2.5);
  hallShape.closePath();
  const hallGeo = new THREE.ExtrudeGeometry(hallShape, {
    depth: 4.1,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  hallGeo.translate(0, 0.36, -2.05);
  const hallMesh = new THREE.Mesh(hallGeo, cladMat);
  hallMesh.castShadow = true;
  hallMesh.receiveShadow = true;
  facilityGroup.add(hallMesh);

  // Part C: Architectural Glazed Curtain Wall & Intake Bay Mullions
  const curtainGlass = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.55, 0.14), glassMat);
  curtainGlass.position.set(-0.6, 1.48, 2.12);
  curtainGlass.renderOrder = 2;
  facilityGroup.add(curtainGlass);

  for (let i = -2; i <= 2; i++) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.65, 0.18), steelMat);
    mullion.position.set(-0.6 + i * 1.05, 1.48, 2.13);
    facilityGroup.add(mullion);
  }

  // Part D: Cantilevered Intake Canopy & Glowing Fascia Strip
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.14, 1.5), steelMat);
  canopy.position.set(-0.2, 2.42, 2.65);
  canopy.castShadow = true;
  facilityGroup.add(canopy);

  const fascia = new THREE.Mesh(new THREE.BoxGeometry(5.64, 0.08, 0.08), accentMat);
  fascia.position.set(-0.2, 2.42, 3.4);
  facilityGroup.add(fascia);

  // Part E: Angled Rooftop Solar PV Array (4 composite panels with steel mounting frames)
  for (let i = 0; i < 4; i++) {
    const panelFrame = new THREE.Group();
    panelFrame.position.set(-2.35 + i * 1.45, 3.05 + (i > 2 ? 0.12 : 0), -0.4);
    panelFrame.rotation.x = THREE.MathUtils.degToRad(18);
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.06, 2.1), steelMat);
    const cellMesh = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.07, 1.98), solarMat);
    cellMesh.position.y = 0.012;
    panelFrame.add(frameMesh, cellMesh);
    facilityGroup.add(panelFrame);
  }

  // Part F: Twin Material Recovery Cyclones / Silos (LatheGeometry)
  const siloProfile = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.55, 0),
    new THREE.Vector2(0.55, 1.8),
    new THREE.Vector2(0.32, 2.45),
    new THREE.Vector2(0.18, 2.7),
    new THREE.Vector2(0.01, 2.7),
  ];
  const siloGeo = new THREE.LatheGeometry(siloProfile, 24);
  const copperAccentMat = new THREE.MeshPhysicalMaterial({
    color: 0xd97706,
    roughness: 0.24,
    metalness: 0.9,
    clearcoat: 0.3,
  });
  const siloGroup = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const silo = new THREE.Mesh(siloGeo, i === 0 ? steelMat : copperAccentMat);
    silo.position.set(4.35, 0.0, -1.0 + i * 1.45);
    silo.castShadow = true;
    siloGroup.add(silo);

    // Exhaust recovery duct connecting hall to silo (TubeGeometry)
    const ductCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(3.35, 2.15, -1.0 + i * 1.45),
      new THREE.Vector3(3.85, 2.55, -1.0 + i * 1.45),
      new THREE.Vector3(4.35, 2.35, -1.0 + i * 1.45),
    ]);
    const duct = new THREE.Mesh(new THREE.TubeGeometry(ductCurve, 20, 0.14, 10, false), steelMat);
    siloGroup.add(duct);
  }
  facilityGroup.add(siloGroup);

  // Part G: Rooftop Micro Wind Turbine
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 2.4, 12), cladMat);
  mast.position.set(2.55, 3.8, -1.45);
  mast.castShadow = true;
  facilityGroup.add(mast);

  const nacelle = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.28, 6, 12), steelMat);
  nacelle.rotation.x = Math.PI / 2;
  nacelle.position.set(2.55, 5.0, -1.45);
  facilityGroup.add(nacelle);

  const turbineRotor = new THREE.Group();
  turbineRotor.position.set(2.55, 5.0, -1.24);
  const bladeGeo = new THREE.BoxGeometry(0.11, 1.05, 0.03);
  bladeGeo.translate(0, 0.52, 0);
  for (let b = 0; b < 3; b++) {
    const blade = new THREE.Mesh(bladeGeo, cladMat);
    blade.rotation.z = (b * Math.PI * 2) / 3;
    turbineRotor.add(blade);
  }
  const spinner = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), accentMat);
  turbineRotor.add(spinner);
  facilityGroup.add(turbineRotor);

  // Part H: Exterior Intake Conveyor Belt with Moving E-Waste Crates
  const beltBase = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.38, 0.72), steelMat);
  beltBase.position.set(2.25, 0.55, 2.55);
  beltBase.castShadow = true;
  facilityGroup.add(beltBase);

  const crateMat = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.45,
    metalness: 0.2,
  });
  const conveyorCrates: THREE.Mesh[] = [];
  for (let c = 0; c < 3; c++) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.44), crateMat);
    crate.position.set(1.2 + c * 0.95, 0.91, 2.55);
    crate.castShadow = true;
    facilityGroup.add(crate);
    conveyorCrates.push(crate);
  }

  tagInspectable(
    facilityGroup,
    {
      id: 'hub-facility',
      title: 'CPCB-Aligned Smart Collection Hub',
      subtitle: 'Solar-Powered Intake & Automated Sorting Bay',
      recoveryMetric: '94.2% Landfill Diversion Rate',
      note: 'Powered by rooftop PV arrays and micro-wind generation with twin copper/aluminum cyclone separators.',
    },
    interactiveMeshes
  );
  root.add(facilityGroup);

  // 4. Composite Electric Collection Van (10 distinct parts, bottom-center pivot)
  const vanGroup = new THREE.Group();
  addContactShadow(vanGroup, textures.contactShadow, 3.3, 1.8, 0.02, 0.52);

  const vanBodyShape = new THREE.Shape();
  vanBodyShape.moveTo(-1.35, 0.32);
  vanBodyShape.lineTo(1.15, 0.32);
  vanBodyShape.lineTo(1.42, 0.65);
  vanBodyShape.lineTo(1.32, 1.18);
  vanBodyShape.lineTo(0.75, 1.56);
  vanBodyShape.lineTo(-1.35, 1.56);
  vanBodyShape.closePath();

  const vanBodyGeo = new THREE.ExtrudeGeometry(vanBodyShape, {
    depth: 1.18,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  vanBodyGeo.translate(0, 0, -0.59);

  const vanPaintMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    roughness: 0.2,
    metalness: 0.15,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
  });
  const vanHull = new THREE.Mesh(vanBodyGeo, vanPaintMat);
  vanHull.castShadow = true;
  vanGroup.add(vanHull);

  // Eco-teal livery stripe along cargo sides
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.15, 0.24, 1.32),
    new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.35,
      metalness: 0.3,
    })
  );
  stripe.position.set(-0.22, 0.92, 0);
  vanGroup.add(stripe);

  // Tinted windshield canopy
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.44, 1.12),
    new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.08,
      metalness: 0.25,
      clearcoat: 1.0,
    })
  );
  windshield.position.set(1.02, 1.24, 0);
  windshield.rotation.z = THREE.MathUtils.degToRad(-24);
  vanGroup.add(windshield);

  // Roof solar trickle panel
  const vanSolar = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.04, 0.95), solarMat);
  vanSolar.position.set(-0.35, 1.63, 0);
  vanGroup.add(vanSolar);

  // Headlight & tail light bars
  const headlight = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 1.02),
    new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0xbae6fd,
      emissiveIntensity: 1.4,
      roughness: 0.1,
    })
  );
  headlight.position.set(1.42, 0.72, 0);
  vanGroup.add(headlight);

  const taillight = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.14, 1.06),
    new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      emissive: 0xe11d48,
      emissiveIntensity: 1.0,
      roughness: 0.2,
    })
  );
  taillight.position.set(-1.4, 0.74, 0);
  vanGroup.add(taillight);

  // 4 Composite Wheel Assemblies (Tire + Alloy Rim)
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.88,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.22,
    metalness: 0.9,
  });
  const tireGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 20);
  tireGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.24, 12);
  rimGeo.rotateX(Math.PI / 2);

  const vanWheels: THREE.Object3D[] = [];
  const wheelCoords: [number, number][] = [
    [-0.82, 0.62],
    [-0.82, -0.62],
    [0.82, 0.62],
    [0.82, -0.62],
  ];
  for (const [wx, wz] of wheelCoords) {
    const wheel = new THREE.Group();
    wheel.position.set(wx, 0.32, wz);
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    wheel.add(tire, rim);
    vanGroup.add(wheel);
    vanWheels.push(wheel);
  }

  tagInspectable(
    vanGroup,
    {
      id: 'ev-van',
      title: 'Zero-Emission EV Cargo Van',
      subtitle: '0.08 kg CO₂e/km · 850 kg Payload Capacity',
      recoveryMetric: 'Up to 68% Transport Emission Savings',
      note: 'Dispatched via 2-opt multi-objective routing to consolidate doorstep e-waste pickups.',
    },
    interactiveMeshes
  );
  root.add(vanGroup);

  // 5. Natural Outdoor Perimeter Grove (InstancedMesh trees: trunks + tiered crowns with ±15% scale & tint)
  const treeCount = 34;
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.22, 1.3, 8);
  trunkGeo.translate(0, 0.65, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x4b382a,
    roughness: 0.92,
    metalness: 0.0,
  });

  const crownLowerGeo = new THREE.ConeGeometry(1.05, 2.3, 9);
  crownLowerGeo.translate(0, 2.15, 0);
  const crownUpperGeo = new THREE.ConeGeometry(0.72, 1.8, 9);
  crownUpperGeo.translate(0, 3.25, 0);
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.02,
  });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const crownsLower = new THREE.InstancedMesh(crownLowerGeo, foliageMat, treeCount);
  const crownsUpper = new THREE.InstancedMesh(crownUpperGeo, foliageMat, treeCount);
  trunks.castShadow = !isSoftwareGl;
  crownsLower.castShadow = !isSoftwareGl;

  const dummy = new THREE.Object3D();
  const baseGreen = new THREE.Color();
  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2 + ((i % 3) - 1) * 0.04;
    const dist = 14.5 + (i % 5) * 2.2;
    const scale = 0.86 + ((i * 37) % 30) / 100; // ±15% natural variation
    dummy.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    dummy.rotation.y = i * 1.1;
    dummy.scale.set(scale, scale * (0.95 + (i % 4) * 0.06), scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    crownsLower.setMatrixAt(i, dummy.matrix);
    crownsUpper.setMatrixAt(i, dummy.matrix);

    baseGreen.setHSL(0.41 + ((i % 5) - 2) * 0.015, 0.42, 0.24 + (i % 4) * 0.025);
    crownsLower.setColorAt(i, baseGreen);
    baseGreen.offsetHSL(0.01, 0.04, 0.05);
    crownsUpper.setColorAt(i, baseGreen);
  }
  trunks.computeBoundingSphere();
  crownsLower.computeBoundingSphere();
  crownsUpper.computeBoundingSphere();
  if (crownsLower.instanceColor) crownsLower.instanceColor.needsUpdate = true;
  if (crownsUpper.instanceColor) crownsUpper.instanceColor.needsUpdate = true;
  root.add(trunks, crownsLower, crownsUpper);

  // 6. Solar Perimeter Bollard Lights (8 posts around apron edge)
  const bollardPoleGeo = new THREE.CylinderGeometry(0.07, 0.09, 2.2, 10);
  bollardPoleGeo.translate(0, 1.1, 0);
  const bollardLampGeo = new THREE.CylinderGeometry(0.24, 0.16, 0.16, 12);
  const lampGlowMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.1,
    roughness: 0.15,
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.25;
    const post = new THREE.Group();
    post.position.set(Math.cos(a) * 11.2, 0.04, Math.sin(a) * 11.2);
    post.add(new THREE.Mesh(bollardPoleGeo, steelMat));
    const head = new THREE.Mesh(bollardLampGeo, lampGlowMat);
    head.position.y = 2.24;
    post.add(head);
    root.add(post);
  }

  return {
    root,
    vanGroup,
    vanWheels,
    turbineRotor,
    conveyorCrates,
    interactiveMeshes,
  };
}

/**
 * Scene 2: Exploded E-Waste Workstation Anatomy & Material Recovery Showcase (6 composite layers)
 */
export function buildExplodedDeviceScene(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean
): DeviceSceneHandles {
  const root = new THREE.Group();
  const interactiveMeshes: THREE.Object3D[] = [];

  // Ground studio pedestal + radial contact shadow
  const stageGeo = new THREE.CylinderGeometry(6.2, 6.6, 0.14, 64);
  const stageMat = new THREE.MeshStandardMaterial({
    color: 0x0b1a2d,
    roughness: 0.65,
    metalness: 0.25,
  });
  const stage = new THREE.Mesh(stageGeo, stageMat);
  stage.position.y = -0.07;
  stage.receiveShadow = true;
  root.add(stage);

  addContactShadow(root, textures.contactShadow, 6.2, 4.4, 0.015, 0.55);

  const layers: DeviceSceneHandles['layers'] = [];
  const fans: THREE.Object3D[] = [];

  // Layer 1: Beveled Anodized Aluminum Lower Chassis
  const chassisGroup = new THREE.Group();
  const chassisShape = new THREE.Shape();
  const w = 2.45;
  const d = 1.65;
  const r = 0.22;
  chassisShape.moveTo(-w + r, -d);
  chassisShape.lineTo(w - r, -d);
  chassisShape.quadraticCurveTo(w, -d, w, -d + r);
  chassisShape.lineTo(w, d - r);
  chassisShape.quadraticCurveTo(w, d, w - r, d);
  chassisShape.lineTo(-w + r, d);
  chassisShape.quadraticCurveTo(-w, d, -w, d - r);
  chassisShape.lineTo(-w, -d + r);
  chassisShape.quadraticCurveTo(-w, -d, -w + r, -d);

  const chassisGeo = new THREE.ExtrudeGeometry(chassisShape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  chassisGeo.rotateX(Math.PI / 2);
  const aluminumMat = new THREE.MeshPhysicalMaterial({
    color: 0xcbd5e1,
    metalness: 0.92,
    roughness: 0.22,
    clearcoat: 0.3,
  });
  const chassisMesh = new THREE.Mesh(chassisGeo, aluminumMat);
  chassisMesh.position.y = 0.24;
  chassisMesh.castShadow = true;
  chassisMesh.receiveShadow = true;
  chassisGroup.add(chassisMesh);

  // Rubber grip feet
  const footMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.92, metalness: 0 });
  const footGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.05, 16);
  for (const [fx, fz] of [
    [-1.95, -1.2],
    [1.95, -1.2],
    [-1.95, 1.2],
    [1.95, 1.2],
  ]) {
    const foot = new THREE.Mesh(footGeo, footMat);
    foot.position.set(fx, 0.025, fz);
    chassisGroup.add(foot);
  }
  tagInspectable(
    chassisGroup,
    {
      id: 'layer-chassis',
      title: 'CNC Anodized Aluminum Unibody',
      subtitle: '6000-Series Structural Alloy Enclosure',
      recoveryMetric: '98% Closed-Loop Aluminum Recovery',
      note: 'Shredded and remelted with 95% lower energy footprint than primary bauxite smelting.',
    },
    interactiveMeshes
  );
  root.add(chassisGroup);
  layers.push({ group: chassisGroup, baseY: 0, explodeY: 0 });

  // Layer 2: 6-Cell Lithium-Ion Battery Quarantine Module
  const batteryGroup = new THREE.Group();
  const cellMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.55,
    metalness: 0.15,
  });
  const labelMat = new THREE.MeshStandardMaterial({
    map: textures.batteryLabel,
    roughness: 0.48,
    metalness: 0.1,
  });
  for (let i = 0; i < 3; i++) {
    const cell = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.14, 0.88), cellMat);
    cell.position.set(-1.32 + i * 1.32, 0.36, 0.52);
    cell.castShadow = true;
    batteryGroup.add(cell);
  }
  const labelPlate = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.72), labelMat);
  labelPlate.rotation.x = -Math.PI / 2;
  labelPlate.position.set(0, 0.435, 0.52);
  batteryGroup.add(labelPlate);

  const busbar = new THREE.Mesh(
    new THREE.BoxGeometry(3.7, 0.04, 0.12),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.85 })
  );
  busbar.position.set(0, 0.38, 0.04);
  batteryGroup.add(busbar);

  tagInspectable(
    batteryGroup,
    {
      id: 'layer-battery',
      title: '76Wh Lithium-Ion Battery Pack',
      subtitle: 'Priority Stage 01 Safe Extraction',
      recoveryMetric: 'Cobalt, Lithium & Nickel Hydrometallurgy',
      note: 'Quarantined intact prior to shredding to eliminate thermal runaway risk and recover battery-grade salts.',
    },
    interactiveMeshes
  );
  root.add(batteryGroup);
  layers.push({ group: batteryGroup, baseY: 0, explodeY: 0.95 });

  // Layer 3: Multi-Layer Gold/Copper Logic Board (PCB)
  const pcbGroup = new THREE.Group();
  const pcbMat = new THREE.MeshStandardMaterial({
    map: textures.pcbAlbedo,
    roughnessMap: textures.pcbRoughness,
    roughness: 0.55,
    metalness: 0.38,
  });
  const pcbBoard = new THREE.Mesh(new THREE.BoxGeometry(4.35, 0.08, 1.55), pcbMat);
  pcbBoard.position.set(0, 0.48, -0.58);
  pcbBoard.castShadow = true;
  pcbGroup.add(pcbBoard);

  // Silicon CPU Die + Brushed Nickel Heatspreader
  const cpuSubstrate = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 0.04, 0.76),
    new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.45, metalness: 0.3 })
  );
  cpuSubstrate.position.set(-0.35, 0.54, -0.58);
  const cpuIhs = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.06, 0.56),
    new THREE.MeshPhysicalMaterial({ color: 0xe2e8f0, roughness: 0.16, metalness: 0.95 })
  );
  cpuIhs.position.set(-0.35, 0.58, -0.58);
  pcbGroup.add(cpuSubstrate, cpuIhs);

  // Gold-pinned RAM DIMM modules & Lathe Capacitors
  const dimmMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.42, metalness: 0.25 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.18, metalness: 0.95 });
  for (let rIdx = 0; rIdx < 2; rIdx++) {
    const dimm = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.06, 0.3), dimmMat);
    dimm.position.set(1.15, 0.56, -0.82 + rIdx * 0.42);
    const goldEdge = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.02, 0.04), goldMat);
    goldEdge.position.set(1.15, 0.53, -0.68 + rIdx * 0.42);
    pcbGroup.add(dimm, goldEdge);
  }
  const capGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.14, 14);
  for (let c = 0; c < 6; c++) {
    const cap = new THREE.Mesh(capGeo, aluminumMat);
    cap.position.set(-1.75 + (c % 3) * 0.22, 0.58, -0.95 + Math.floor(c / 3) * 0.38);
    pcbGroup.add(cap);
  }

  tagInspectable(
    pcbGroup,
    {
      id: 'layer-pcb',
      title: 'Multi-Layer Logic Board & Silicon SoC',
      subtitle: 'High-Value Precious Metal Fraction',
      recoveryMetric: '21.4% Copper · 0.04% Gold · 0.12% Silver',
      note: 'Contains 40× higher gold concentration per ton than mined ore; routed to certified smelters.',
    },
    interactiveMeshes
  );
  root.add(pcbGroup);
  layers.push({ group: pcbGroup, baseY: 0, explodeY: 1.95 });

  // Layer 4: Copper Heatpipes & Dual Cooling Fans (TubeGeometry)
  const thermalGroup = new THREE.Group();
  const copperMat = new THREE.MeshPhysicalMaterial({
    color: 0xd97706,
    roughness: 0.2,
    metalness: 0.94,
    clearcoat: 0.35,
  });

  const pipeCurve1 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.55, 0.68, -0.95),
    new THREE.Vector3(-0.35, 0.68, -0.58),
    new THREE.Vector3(1.55, 0.68, -0.95),
  ]);
  const pipe1 = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve1, 32, 0.065, 12, false), copperMat);
  const pipeCurve2 = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.55, 0.68, -0.78),
    new THREE.Vector3(-0.35, 0.68, -0.44),
    new THREE.Vector3(1.55, 0.68, -0.78),
  ]);
  const pipe2 = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve2, 32, 0.055, 12, false), copperMat);
  thermalGroup.add(pipe1, pipe2);

  // Dual blower housings + spinning rotors
  const shroudMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.72 });
  for (const fx of [-1.55, 1.55]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 10, 24), shroudMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(fx, 0.68, -0.85);
    thermalGroup.add(ring);

    const rotor = new THREE.Group();
    rotor.position.set(fx, 0.68, -0.85);
    rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), copperMat));
    for (let b = 0; b < 7; b++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.03, 0.06), shroudMat);
      const a = (b / 7) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22);
      fin.rotation.y = -a + 0.4;
      rotor.add(fin);
    }
    thermalGroup.add(rotor);
    fans.push(rotor);
  }

  tagInspectable(
    thermalGroup,
    {
      id: 'layer-thermal',
      title: 'Pure Copper Vapor-Chamber & Dual Fans',
      subtitle: 'High-Purity Red Metal Thermal Assembly',
      recoveryMetric: '99.4% Electrolytic Copper Purity',
      note: 'Detached cleanly in manual dismantling bays for direct copper wire and motor winding reuse.',
    },
    interactiveMeshes
  );
  root.add(thermalGroup);
  layers.push({ group: thermalGroup, baseY: 0, explodeY: 2.95 });

  // Layer 5: Optical Glass Display & Carbon Bezel Assembly
  const displayGroup = new THREE.Group();
  const bezelMesh = new THREE.Mesh(
    new THREE.BoxGeometry(4.85, 0.07, 3.22),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.45 })
  );
  bezelMesh.position.y = 0.86;
  bezelMesh.castShadow = true;
  displayGroup.add(bezelMesh);

  const glassPane = new THREE.Mesh(
    new THREE.BoxGeometry(4.56, 0.035, 2.94),
    new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.06,
      metalness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.82,
      transparent: true,
      opacity: isSoftwareGl ? 0.36 : 0.9,
      ior: 1.54,
      thickness: 0.3,
      clearcoat: 1.0,
      depthWrite: false,
    })
  );
  glassPane.position.y = 0.915;
  glassPane.renderOrder = 3;
  displayGroup.add(glassPane);

  tagInspectable(
    displayGroup,
    {
      id: 'layer-display',
      title: 'Aluminosilicate Optical Glass & Indium Layer',
      subtitle: 'LCD / OLED Display Stack',
      recoveryMetric: 'Indium Tin Oxide (ITO) + Cullet Recovery',
      note: 'Separated via optical delamination to recover rare-earth indium and repurpose specialty glass.',
    },
    interactiveMeshes
  );
  root.add(displayGroup);
  layers.push({ group: displayGroup, baseY: 0, explodeY: 3.95 });

  // Layer 6: Instanced Recovered Material Ingots Orbiting on Explode
  const ingotCount = 84;
  const ingotGeo = new THREE.OctahedronGeometry(0.085, 0);
  const ingotMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.88,
    roughness: 0.18,
  });
  const ingotsMesh = new THREE.InstancedMesh(ingotGeo, ingotMat, ingotCount);
  ingotsMesh.frustumCulled = false;

  const ingotPalette = [
    new THREE.Color(0xd97706), // Copper
    new THREE.Color(0xfacc15), // Gold
    new THREE.Color(0xcbd5e1), // Aluminum
    new THREE.Color(0x38bdf8), // Silicon
  ];
  const ingotParams = Array.from({ length: ingotCount }, (_, i) => {
    ingotsMesh.setColorAt(i, ingotPalette[i % ingotPalette.length]);
    return {
      radius: 3.35 + (i % 7) * 0.24,
      phase: (i / ingotCount) * Math.PI * 2,
      speed: 0.24 + (i % 4) * 0.06,
      yOffset: 0.4 + (i % 9) * 0.42,
      scale: 0.72 + (i % 5) * 0.14,
    };
  });
  if (ingotsMesh.instanceColor) ingotsMesh.instanceColor.needsUpdate = true;
  root.add(ingotsMesh);

  return {
    root,
    layers,
    fans,
    ingotsMesh,
    ingotParams,
    interactiveMeshes,
  };
}

/**
 * Scene 3: Orbital Circular Logistics Network (Planetary Telemetry & Hub Beacons)
 */
export function buildOrbitalNetworkScene(
  textures: ProceduralTextureSet
): OrbitalSceneHandles {
  const root = new THREE.Group();

  const globeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.05, 56, 56),
    new THREE.MeshStandardMaterial({
      map: textures.earthAlbedo,
      roughnessMap: textures.earthRoughness,
      roughness: 0.7,
      metalness: 0.18,
    })
  );
  globeMesh.castShadow = true;
  globeMesh.receiveShadow = true;
  root.add(globeMesh);

  const atmoMesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 40, 40),
    new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.14,
      roughness: 0.12,
      metalness: 0,
      depthWrite: false,
    })
  );
  atmoMesh.renderOrder = 2;
  root.add(atmoMesh);

  // Brushed Titanium Primary Orbital Track (TubeGeometry)
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 3.05, Math.sin(a * 2) * 0.12, Math.sin(a) * 3.05));
  }
  const primaryRing = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.045, 12, true),
    new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      metalness: 0.92,
      roughness: 0.2,
      clearcoat: 0.4,
    })
  );
  primaryRing.rotation.z = THREE.MathUtils.degToRad(18);
  primaryRing.rotation.x = THREE.MathUtils.degToRad(10);
  root.add(primaryRing);

  const secondaryRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.7, 0.022, 12, 96),
    new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      metalness: 0.82,
      roughness: 0.24,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
    })
  );
  secondaryRing.rotation.x = Math.PI / 2 - THREE.MathUtils.degToRad(26);
  secondaryRing.rotation.y = THREE.MathUtils.degToRad(22);
  root.add(secondaryRing);

  // 3 Composite 6-Part Orbital Telemetry Satellites
  const satBodyMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.88, roughness: 0.22 });
  const satPanelMat = new THREE.MeshStandardMaterial({
    map: textures.solarAlbedo,
    metalness: 0.45,
    roughness: 0.35,
  });
  const satBeaconMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.9,
    roughness: 0.2,
  });

  const satellites: OrbitalSceneHandles['satellites'] = [];
  for (let i = 0; i < 3; i++) {
    const sat = new THREE.Group();
    sat.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.3, 8), satBodyMat));
    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.22), satPanelMat);
    leftWing.position.x = -0.44;
    const rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.22), satPanelMat);
    rightWing.position.x = 0.44;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.05, 6), satBodyMat);
    strut.rotation.z = Math.PI / 2;
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.08, 12, 1, true), satBeaconMat);
    dish.position.y = -0.19;
    dish.rotation.x = Math.PI;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 10), satBeaconMat);
    beacon.position.y = 0.19;
    sat.add(leftWing, rightWing, strut, dish, beacon);
    root.add(sat);
    satellites.push({
      group: sat,
      angleOffset: (i * Math.PI * 2) / 3,
      radius: 3.05,
      tilt: 0.42,
    });
  }

  // Beveled Hexagonal Hub Beacons on Earth surface
  const hexShape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    if (i === 0) hexShape.moveTo(Math.cos(a) * 0.1, Math.sin(a) * 0.1);
    else hexShape.lineTo(Math.cos(a) * 0.1, Math.sin(a) * 0.1);
  }
  hexShape.closePath();
  const hubGeo = new THREE.ExtrudeGeometry(hexShape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.022,
    bevelSize: 0.018,
    bevelSegments: 2,
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.65,
    roughness: 0.22,
    emissive: 0x0284c7,
    emissiveIntensity: 0.55,
  });

  const hubCoords: [number, number][] = [
    [28.6, 77.2],
    [13.0, 77.5],
    [19.1, 73.0],
    [51.5, -0.1],
    [35.6, 139.7],
    [37.7, -122.4],
  ];
  const hubMeshes: OrbitalSceneHandles['hubMeshes'] = [];
  for (const [lat, lng] of hubCoords) {
    const phi = THREE.MathUtils.degToRad(90 - lat);
    const theta = THREE.MathUtils.degToRad(lng + 180);
    const normal = new THREE.Vector3(
      -Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    ).normalize();
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.position.copy(normal).multiplyScalar(2.0);
    hub.lookAt(normal.clone().multiplyScalar(4));
    globeMesh.add(hub);
    hubMeshes.push({ mesh: hub, normal });
  }

  // 160 Instanced Material Stream Particles
  const count = 160;
  const pGeo = new THREE.OctahedronGeometry(0.04, 0);
  const pMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.85, roughness: 0.2 });
  const particleMesh = new THREE.InstancedMesh(pGeo, pMat, count);
  particleMesh.frustumCulled = false;

  const palette = [
    new THREE.Color(0x38bdf8),
    new THREE.Color(0xf59e0b),
    new THREE.Color(0x94a3b8),
    new THREE.Color(0x34d399),
  ];
  const particleParams = Array.from({ length: count }, (_, i) => {
    particleMesh.setColorAt(i, palette[i % palette.length]);
    return {
      radius: 2.55 + (i % 10) * 0.16,
      speed: 0.16 + (i % 5) * 0.045,
      phase: (i / count) * Math.PI * 2,
      yAmp: 0.45 + (i % 4) * 0.24,
      scale: 0.72 + (i % 5) * 0.15,
    };
  });
  if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;
  root.add(particleMesh);

  return {
    root,
    globeMesh,
    atmoMesh,
    primaryRing,
    secondaryRing,
    satellites,
    hubMeshes,
    particleMesh,
    particleParams,
  };
}
