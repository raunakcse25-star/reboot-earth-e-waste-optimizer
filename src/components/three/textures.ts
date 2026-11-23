import * as THREE from 'three';

export interface ProceduralTextureSet {
  contactShadow: THREE.CanvasTexture;
  asphaltAlbedo: THREE.CanvasTexture;
  asphaltRoughness: THREE.CanvasTexture;
  solarAlbedo: THREE.CanvasTexture;
  pcbAlbedo: THREE.CanvasTexture;
  pcbRoughness: THREE.CanvasTexture;
  batteryLabel: THREE.CanvasTexture;
  earthAlbedo: THREE.CanvasTexture;
  earthRoughness: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAniso: number): ProceduralTextureSet {
  const aniso = Math.max(1, Math.min(maxAniso, 8));

  // 1. Soft radial contact shadow (transparent -> dark center)
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const sctx = shadowCanvas.getContext('2d')!;
  const sGrad = sctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  sGrad.addColorStop(0, 'rgba(3, 10, 20, 0.72)');
  sGrad.addColorStop(0.55, 'rgba(3, 10, 20, 0.34)');
  sGrad.addColorStop(1, 'rgba(3, 10, 20, 0)');
  sctx.fillStyle = sGrad;
  sctx.fillRect(0, 0, 256, 256);
  const contactShadow = new THREE.CanvasTexture(shadowCanvas);

  // 2. Asphalt / Concrete Loading Apron Albedo + Roughness
  const asphaltCanvas = document.createElement('canvas');
  asphaltCanvas.width = 512;
  asphaltCanvas.height = 512;
  const actx = asphaltCanvas.getContext('2d')!;
  actx.fillStyle = '#24303f';
  actx.fillRect(0, 0, 512, 512);

  // Deterministic micro-aggregate speckle
  for (let i = 0; i < 4500; i++) {
    const x = (i * 73) % 512;
    const y = (i * 197 + Math.floor(i / 512) * 31) % 512;
    const shade = 28 + ((i * 29) % 24);
    actx.fillStyle = `rgb(${shade}, ${shade + 8}, ${shade + 18})`;
    actx.fillRect(x, y, 2, 2);
  }
  // Subtle bay markings
  actx.strokeStyle = 'rgba(226, 232, 240, 0.22)';
  actx.lineWidth = 4;
  actx.setLineDash([18, 14]);
  actx.strokeRect(24, 24, 464, 464);
  actx.setLineDash([]);

  const asphaltAlbedo = new THREE.CanvasTexture(asphaltCanvas);
  asphaltAlbedo.colorSpace = THREE.SRGBColorSpace;
  asphaltAlbedo.wrapS = THREE.RepeatWrapping;
  asphaltAlbedo.wrapT = THREE.RepeatWrapping;
  asphaltAlbedo.repeat.set(3, 3);
  asphaltAlbedo.anisotropy = aniso;

  const asphaltRoughCanvas = document.createElement('canvas');
  asphaltRoughCanvas.width = 256;
  asphaltRoughCanvas.height = 256;
  const arctx = asphaltRoughCanvas.getContext('2d')!;
  arctx.fillStyle = '#c8c8c8';
  arctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    const x = (i * 53) % 256;
    const y = (i * 113) % 256;
    const v = 165 + ((i * 17) % 70);
    arctx.fillStyle = `rgb(${v},${v},${v})`;
    arctx.fillRect(x, y, 2, 2);
  }
  const asphaltRoughness = new THREE.CanvasTexture(asphaltRoughCanvas);
  asphaltRoughness.wrapS = THREE.RepeatWrapping;
  asphaltRoughness.wrapT = THREE.RepeatWrapping;
  asphaltRoughness.repeat.set(3, 3);
  asphaltRoughness.anisotropy = aniso;

  // 3. Solar Photovoltaic Cell Grid
  const solarCanvas = document.createElement('canvas');
  solarCanvas.width = 512;
  solarCanvas.height = 512;
  const pvctx = solarCanvas.getContext('2d')!;
  const pvGrad = pvctx.createLinearGradient(0, 0, 512, 512);
  pvGrad.addColorStop(0, '#0a2548');
  pvGrad.addColorStop(0.5, '#0f3666');
  pvGrad.addColorStop(1, '#081d3a');
  pvctx.fillStyle = pvGrad;
  pvctx.fillRect(0, 0, 512, 512);
  pvctx.strokeStyle = 'rgba(186, 230, 253, 0.42)';
  pvctx.lineWidth = 2;
  for (let x = 0; x <= 512; x += 64) {
    pvctx.beginPath();
    pvctx.moveTo(x, 0);
    pvctx.lineTo(x, 512);
    pvctx.stroke();
  }
  for (let y = 0; y <= 512; y += 32) {
    pvctx.beginPath();
    pvctx.moveTo(0, y);
    pvctx.lineTo(512, y);
    pvctx.stroke();
  }
  pvctx.strokeStyle = 'rgba(224, 242, 254, 0.7)';
  pvctx.lineWidth = 4;
  pvctx.strokeRect(4, 4, 504, 504);

  const solarAlbedo = new THREE.CanvasTexture(solarCanvas);
  solarAlbedo.colorSpace = THREE.SRGBColorSpace;
  solarAlbedo.anisotropy = aniso;

  // 4. Multi-Layer Gold/Copper PCB Albedo + Roughness
  const pcbCanvas = document.createElement('canvas');
  pcbCanvas.width = 1024;
  pcbCanvas.height = 640;
  const pctx = pcbCanvas.getContext('2d')!;
  pctx.fillStyle = '#094534';
  pctx.fillRect(0, 0, 1024, 640);

  const pcbRoughCanvas = document.createElement('canvas');
  pcbRoughCanvas.width = 1024;
  pcbRoughCanvas.height = 640;
  const prctx = pcbRoughCanvas.getContext('2d')!;
  prctx.fillStyle = '#a8a8a8';
  prctx.fillRect(0, 0, 1024, 640);

  // Subtle fiberglass weave
  pctx.strokeStyle = 'rgba(16, 185, 129, 0.14)';
  pctx.lineWidth = 1;
  for (let x = 0; x < 1024; x += 16) {
    pctx.beginPath();
    pctx.moveTo(x, 0);
    pctx.lineTo(x, 640);
    pctx.stroke();
  }
  for (let y = 0; y < 640; y += 16) {
    pctx.beginPath();
    pctx.moveTo(0, y);
    pctx.lineTo(1024, y);
    pctx.stroke();
  }

  // Copper/Gold traces & via pads
  pctx.strokeStyle = '#d4a13c';
  pctx.lineWidth = 3;
  prctx.strokeStyle = '#2e2e2e';
  prctx.lineWidth = 4;
  for (let i = 0; i < 34; i++) {
    const startX = 40 + (i % 17) * 56;
    const startY = i < 17 ? 42 : 598;
    const midY = i < 17 ? 170 + (i % 5) * 28 : 470 - (i % 5) * 28;
    const endX = Math.min(980, startX + ((i % 3) - 1) * 48);

    pctx.beginPath();
    pctx.moveTo(startX, startY);
    pctx.lineTo(startX, midY);
    pctx.lineTo(endX, midY);
    pctx.stroke();

    prctx.beginPath();
    prctx.moveTo(startX, startY);
    prctx.lineTo(startX, midY);
    prctx.lineTo(endX, midY);
    prctx.stroke();

    pctx.fillStyle = '#f5c451';
    pctx.beginPath();
    pctx.arc(endX, midY, 5, 0, Math.PI * 2);
    pctx.fill();

    prctx.fillStyle = '#202020';
    prctx.beginPath();
    prctx.arc(endX, midY, 6, 0, Math.PI * 2);
    prctx.fill();
  }

  // Gold edge connector fingers
  for (let x = 180; x < 840; x += 14) {
    pctx.fillStyle = '#eab308';
    pctx.fillRect(x, 608, 8, 26);
    prctx.fillStyle = '#1e1e1e';
    prctx.fillRect(x, 608, 8, 26);
  }

  // Silkscreen stencil markings
  pctx.strokeStyle = 'rgba(241, 245, 249, 0.72)';
  pctx.lineWidth = 2;
  pctx.strokeRect(20, 20, 984, 600);
  pctx.fillStyle = 'rgba(241, 245, 249, 0.85)';
  pctx.font = 'bold 20px monospace';
  pctx.fillText('REBOOT-EARTH RECOVERY SPEC // PCB-REV4.2', 42, 62);
  pctx.font = '15px monospace';
  pctx.fillText('CU 21.4% | AU 0.04% | AG 0.12% | ROHS AUDIT READY', 42, 588);

  const pcbAlbedo = new THREE.CanvasTexture(pcbCanvas);
  pcbAlbedo.colorSpace = THREE.SRGBColorSpace;
  pcbAlbedo.anisotropy = aniso;

  const pcbRoughness = new THREE.CanvasTexture(pcbRoughCanvas);
  pcbRoughness.anisotropy = aniso;

  // 5. Li-Ion Battery Pack Hazard & Spec Label
  const batCanvas = document.createElement('canvas');
  batCanvas.width = 512;
  batCanvas.height = 256;
  const bctx = batCanvas.getContext('2d')!;
  bctx.fillStyle = '#1e293b';
  bctx.fillRect(0, 0, 512, 256);
  // Amber safety stripe
  bctx.fillStyle = '#f59e0b';
  bctx.fillRect(0, 0, 512, 34);
  bctx.fillStyle = '#0f172a';
  bctx.font = 'bold 18px monospace';
  bctx.fillText('LI-ION QUARANTINE MODULE // HANDLE WITH CARE', 16, 23);
  bctx.fillStyle = '#e2e8f0';
  bctx.font = 'bold 26px sans-serif';
  bctx.fillText('76Wh 6-Cell Pack', 24, 92);
  bctx.fillStyle = '#94a3b8';
  bctx.font = '16px monospace';
  bctx.fillText('CO / LI / NI RECOVERY STREAM', 24, 130);
  bctx.fillText('DO NOT PUNCTURE OR INCINERATE', 24, 162);
  bctx.strokeStyle = '#38bdf8';
  bctx.lineWidth = 3;
  bctx.strokeRect(20, 188, 472, 44);
  bctx.fillStyle = '#38bdf8';
  bctx.font = 'bold 16px monospace';
  bctx.fillText('SAFE EXTRACTION PRIORITY: STAGE 01', 36, 216);

  const batteryLabel = new THREE.CanvasTexture(batCanvas);
  batteryLabel.colorSpace = THREE.SRGBColorSpace;
  batteryLabel.anisotropy = aniso;

  // 6. Planetary Globe Albedo + Roughness
  const ew = 1024;
  const eh = 512;
  const eCanvas = document.createElement('canvas');
  eCanvas.width = ew;
  eCanvas.height = eh;
  const ectx = eCanvas.getContext('2d')!;
  const oceanGrad = ectx.createLinearGradient(0, 0, 0, eh);
  oceanGrad.addColorStop(0, '#051930');
  oceanGrad.addColorStop(0.5, '#0a2d52');
  oceanGrad.addColorStop(1, '#051930');
  ectx.fillStyle = oceanGrad;
  ectx.fillRect(0, 0, ew, eh);

  ectx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
  ectx.lineWidth = 1;
  for (let x = 0; x < ew; x += 64) {
    ectx.beginPath();
    ectx.moveTo(x, 0);
    ectx.lineTo(x, eh);
    ectx.stroke();
  }
  for (let y = 0; y < eh; y += 64) {
    ectx.beginPath();
    ectx.moveTo(0, y);
    ectx.lineTo(ew, y);
    ectx.stroke();
  }

  const erCanvas = document.createElement('canvas');
  erCanvas.width = ew;
  erCanvas.height = eh;
  const erctx = erCanvas.getContext('2d')!;
  erctx.fillStyle = '#363636';
  erctx.fillRect(0, 0, ew, eh);

  const continents = [
    [
      [165, 118], [238, 108], [272, 168], [252, 232], [298, 294], [316, 378],
      [274, 422], [238, 344], [208, 260], [158, 194],
    ],
    [
      [462, 92], [556, 94], [576, 166], [598, 224], [612, 316], [562, 396],
      [508, 382], [492, 290], [448, 226], [444, 146],
    ],
    [
      [576, 88], [742, 86], [828, 146], [806, 236], [736, 276], [684, 242],
      [656, 296], [626, 232], [586, 174],
    ],
    [
      [796, 314], [886, 316], [902, 386], [824, 396], [786, 354],
    ],
  ];

  for (const poly of continents) {
    ectx.beginPath();
    erctx.beginPath();
    poly.forEach(([x, y], idx) => {
      if (idx === 0) {
        ectx.moveTo(x, y);
        erctx.moveTo(x, y);
      } else {
        ectx.lineTo(x, y);
        erctx.lineTo(x, y);
      }
    });
    ectx.closePath();
    erctx.closePath();
    const lg = ectx.createLinearGradient(0, 80, 0, 420);
    lg.addColorStop(0, '#0f528a');
    lg.addColorStop(0.5, '#1474b8');
    lg.addColorStop(1, '#0b3e6e');
    ectx.fillStyle = lg;
    ectx.fill();
    ectx.strokeStyle = '#38bdf8';
    ectx.lineWidth = 2;
    ectx.stroke();

    erctx.fillStyle = '#cfcfcf';
    erctx.fill();
  }

  const earthAlbedo = new THREE.CanvasTexture(eCanvas);
  earthAlbedo.colorSpace = THREE.SRGBColorSpace;
  earthAlbedo.anisotropy = aniso;

  const earthRoughness = new THREE.CanvasTexture(erCanvas);
  earthRoughness.anisotropy = aniso;

  return {
    contactShadow,
    asphaltAlbedo,
    asphaltRoughness,
    solarAlbedo,
    pcbAlbedo,
    pcbRoughness,
    batteryLabel,
    earthAlbedo,
    earthRoughness,
    dispose: () => {
      contactShadow.dispose();
      asphaltAlbedo.dispose();
      asphaltRoughness.dispose();
      solarAlbedo.dispose();
      pcbAlbedo.dispose();
      pcbRoughness.dispose();
      batteryLabel.dispose();
      earthAlbedo.dispose();
      earthRoughness.dispose();
    },
  };
}
