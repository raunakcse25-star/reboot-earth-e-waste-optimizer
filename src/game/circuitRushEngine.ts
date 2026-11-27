import { soundEngine } from './soundEngine';

export type GamePhase = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';
export type GameDifficulty = 'standard' | 'overdrive';
export type ChuteCategory = 'it' | 'metal' | 'hazard';

export interface HudSnapshot {
  phase: GamePhase;
  difficulty: GameDifficulty;
  score: number;
  highScore: number;
  combo: number;
  maxCombo: number;
  shift: number;
  shiftSorted: number;
  shiftTarget: number;
  totalSorted: number;
  recycledKg: number;
  co2SavedKg: number;
  integrity: number;
  maxIntegrity: number;
  surgeCharge: number; // 0..100
  heldCategory: ChuteCategory | null;
  heldLabel: string | null;
  endlessMode: boolean;
  gameOverReason: string | null;
}

type ItemKind =
  | 'pcb'
  | 'laptop'
  | 'server'
  | 'golden_pcb'
  | 'copper_coil'
  | 'smartphone'
  | 'solar_cell'
  | 'battery'
  | 'swollen_battery';

interface ConveyorItem {
  id: number;
  kind: ItemKind;
  category: ChuteCategory;
  label: string;
  lane: number;
  x: number;
  y: number;
  width: number;
  height: number;
  speedMult: number;
  weightKg: number;
  co2Factor: number;
  baseScore: number;
  heavy: boolean;
  golden: boolean;
  // Thermal runaway hazard timer (swollen_battery)
  isVolatile: boolean;
  fuseMax: number;
  fuseLeft: number;
  warnedHalf: boolean;
  warnedCritical: boolean;
  // Visual spring
  scaleX: number;
  scaleY: number;
  wobblePhase: number;
}

interface FlyingItem {
  item: ConveyorItem;
  startX: number;
  startY: number;
  targetChute: ChuteCategory;
  targetX: number;
  targetY: number;
  progress: number;
  duration: number;
  rotation: number;
  fromSurge: boolean;
}

interface LaneSurgeHazard {
  lane: number;
  state: 'windup' | 'active';
  timer: number;
  duration: number;
  hitPlayer: boolean;
}

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  kind: 'spark' | 'ring' | 'shard';
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

interface ChuteRect {
  category: ChuteCategory;
  keyNum: '1' | '2' | '3';
  title: string;
  subtitle: string;
  accent: string;
  accentGlow: string;
  x: number;
  y: number;
  w: number;
  h: number;
  bounce: number;
  flash: number;
  errorFlash: number;
}

const HIGH_SCORE_KEY = 'reboot_earth_circuit_rush_highscore';
const MAX_PARTICLES = 240;
const VICTORY_SHIFT = 5;

const CHUTE_META: Record<
  ChuteCategory,
  { keyNum: '1' | '2' | '3'; title: string; subtitle: string; accent: string; accentGlow: string }
> = {
  it: {
    keyNum: '1',
    title: 'IT & PCB',
    subtitle: 'BOARDS · SERVERS',
    accent: '#10B981',
    accentGlow: 'rgba(16, 185, 129, 0.35)',
  },
  metal: {
    keyNum: '2',
    title: 'METAL & WIRE',
    subtitle: 'COILS · PHONES',
    accent: '#0EA5E9',
    accentGlow: 'rgba(14, 165, 233, 0.35)',
  },
  hazard: {
    keyNum: '3',
    title: 'HAZARD VAULT',
    subtitle: 'LITHIUM CELLS',
    accent: '#F59E0B',
    accentGlow: 'rgba(245, 158, 11, 0.38)',
  },
};

export class CircuitRushEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onHudChange: (snapshot: HudSnapshot) => void;

  private width = 1280;
  private height = 720;
  private dpr = 1;

  private rafId: number | null = null;
  private lastTime = 0;
  private running = false;

  // Game state
  private phase: GamePhase = 'TITLE_MENU';
  private difficulty: GameDifficulty = 'standard';
  private endlessMode = false;
  private score = 0;
  private highScore = 0;
  private combo = 0;
  private maxCombo = 0;
  private shift = 1;
  private shiftSorted = 0;
  private shiftTarget = 12;
  private totalSorted = 0;
  private recycledKg = 0;
  private co2SavedKg = 0;
  private integrity = 100;
  private readonly maxIntegrity = 100;
  private surgeCharge = 0;
  private gameOverReason: string | null = null;

  // Layout geometry (recomputed on resize)
  private playLeft = 64;
  private playRight = 1140;
  private chuteTop = 94;
  private chuteHeight = 96;
  private laneYs: number[] = [310, 445, 580];
  private laneHeight = 92;
  private chutes: ChuteRect[] = [];

  // Crane (player)
  private craneX = 480;
  private craneY = 445;
  private craneVx = 0;
  private craneVy = 0;
  private craneScaleX = 1;
  private craneScaleY = 1;
  private craneStunTimer = 0;
  private craneFlashTimer = 0;
  private heldItem: ConveyorItem | null = null;
  private nearestCandidateId: number | null = null;

  // World entities
  private nextItemId = 1;
  private items: ConveyorItem[] = [];
  private flyingItems: FlyingItem[] = [];
  private laneHazards: LaneSurgeHazard[] = [];
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];

  // Timers & Juice
  private beltOffset = 0;
  private spawnTimer = 0.8;
  private laneHazardTimer = 8.5;
  private hitstopTimer = 0;
  private shakeMag = 0;
  private empWaveRadius = 0;
  private empWaveAlpha = 0;
  private empWaveX = 0;
  private empWaveY = 0;
  private ambientTime = 0;

  // Input Hygiene: continuous held keys vs edge-triggered actions + buffer
  private heldKeys = new Set<string>();
  private grabBufferTimer = 0;
  private pointerActive = false;
  private pointerX = 480;
  private pointerY = 445;

  // Cached HUD digest to avoid unneeded React state updates
  private lastHudKey = '';

  constructor(canvas: HTMLCanvasElement, onHudChange: (snapshot: HudSnapshot) => void) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not acquire 2D canvas context');
    }
    this.ctx = context;
    this.onHudChange = onHudChange;

    try {
      const saved = Number(localStorage.getItem(HIGH_SCORE_KEY) || '0');
      if (Number.isFinite(saved) && saved > 0) this.highScore = Math.floor(saved);
    } catch {
      this.highScore = 0;
    }

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 3,
        color: '#10B981',
        alpha: 0,
        life: 0,
        maxLife: 0.4,
        kind: 'spark',
      });
    }

    this.handleResize();
    this.attachEvents();
    this.emitHud(true);
    this.startLoop();
  }

  public setDifficulty(diff: GameDifficulty): void {
    this.difficulty = diff;
    this.emitHud(true);
  }

  public startNewGame(diff?: GameDifficulty): void {
    soundEngine.unlock();
    soundEngine.playUiClick();
    if (diff) this.difficulty = diff;

    this.phase = 'PLAYING';
    this.endlessMode = false;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.shift = 1;
    this.shiftSorted = 0;
    this.shiftTarget = this.getShiftTarget(1);
    this.totalSorted = 0;
    this.recycledKg = 0;
    this.co2SavedKg = 0;
    this.integrity = this.maxIntegrity;
    this.surgeCharge = 25;
    this.gameOverReason = null;

    this.items = [];
    this.flyingItems = [];
    this.laneHazards = [];
    this.floatingTexts = [];
    for (const p of this.particles) p.active = false;

    this.heldItem = null;
    this.nearestCandidateId = null;
    this.craneX = this.playLeft + (this.playRight - this.playLeft) * 0.38;
    this.craneY = this.laneYs[1];
    this.craneVx = 0;
    this.craneVy = 0;
    this.craneScaleX = 1;
    this.craneScaleY = 1;
    this.craneStunTimer = 0;
    this.craneFlashTimer = 0;
    this.hitstopTimer = 0;
    this.shakeMag = 0;
    this.empWaveAlpha = 0;
    this.spawnTimer = 0.45;
    this.laneHazardTimer = 9.0;
    this.grabBufferTimer = 0;
    this.heldKeys.clear();
    this.pointerActive = false;

    // Seed two starter items so action begins immediately
    this.spawnItem(0, this.playLeft + 40);
    this.spawnItem(2, this.playLeft + 150);

    this.spawnFloatingText(this.width * 0.5, this.laneYs[1] - 60, 'SHIFT 1 · GO!', '#10B981', 1.25);
    this.emitHud(true);
  }

  public pause(): void {
    if (this.phase !== 'PLAYING') return;
    this.phase = 'PAUSED';
    this.heldKeys.clear();
    soundEngine.playUiClick();
    this.emitHud(true);
  }

  public resume(): void {
    if (this.phase !== 'PAUSED') return;
    this.phase = 'PLAYING';
    this.lastTime = performance.now();
    this.heldKeys.clear();
    soundEngine.playUiClick();
    this.emitHud(true);
  }

  public continueEndless(): void {
    if (this.phase !== 'VICTORY') return;
    this.endlessMode = true;
    this.phase = 'PLAYING';
    this.shift += 1;
    this.shiftSorted = 0;
    this.shiftTarget = this.getShiftTarget(this.shift);
    this.integrity = Math.min(this.maxIntegrity, this.integrity + 25);
    this.lastTime = performance.now();
    this.heldKeys.clear();
    soundEngine.playShiftUp();
    this.spawnFloatingText(this.width * 0.5, this.laneYs[1] - 50, `ENDLESS SHIFT ${this.shift}!`, '#0EA5E9', 1.3);
    this.emitHud(true);
  }

  public returnToTitle(): void {
    this.phase = 'TITLE_MENU';
    this.heldKeys.clear();
    this.items = [];
    this.flyingItems = [];
    this.laneHazards = [];
    this.heldItem = null;
    this.emitHud(true);
  }

  public triggerSurge(): void {
    if (this.phase !== 'PLAYING' || this.surgeCharge < 100) return;
    this.executeMagnetSurge();
  }

  public destroy(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.detachEvents();
  }

  private getShiftTarget(shiftNum: number): number {
    return 10 + shiftNum * 4;
  }

  private handleResize = (): void => {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect?.width || window.innerWidth));
    const h = Math.max(320, Math.floor(rect?.height || window.innerHeight));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = w;
    this.height = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    // Recompute responsive playfield geometry (leaving generous perimeter margin for low-occlusion HUD)
    const sidePad = Math.max(20, Math.min(72, Math.floor(w * 0.05)));
    const landfillWidth = Math.max(66, Math.min(108, Math.floor(w * 0.085)));
    this.playLeft = sidePad;
    this.playRight = w - sidePad - landfillWidth;

    const topHudReserve = Math.max(76, Math.min(92, Math.floor(h * 0.12)));
    this.chuteTop = topHudReserve;
    this.chuteHeight = Math.max(78, Math.min(104, Math.floor(h * 0.14)));

    const usableChuteSpan = this.playRight - this.playLeft;
    const chuteGap = Math.max(12, Math.min(24, Math.floor(usableChuteSpan * 0.025)));
    const chuteW = (usableChuteSpan - chuteGap * 2) / 3;

    const cats: ChuteCategory[] = ['it', 'metal', 'hazard'];
    const prevBounces = new Map(this.chutes.map((c) => [c.category, c.bounce]));
    this.chutes = cats.map((cat, idx) => {
      const meta = CHUTE_META[cat];
      return {
        category: cat,
        keyNum: meta.keyNum,
        title: meta.title,
        subtitle: meta.subtitle,
        accent: meta.accent,
        accentGlow: meta.accentGlow,
        x: this.playLeft + idx * (chuteW + chuteGap),
        y: this.chuteTop,
        w: chuteW,
        h: this.chuteHeight,
        bounce: prevBounces.get(cat) || 0,
        flash: 0,
        errorFlash: 0,
      };
    });

    const lanesTop = this.chuteTop + this.chuteHeight + Math.max(26, Math.floor(h * 0.045));
    const lanesBottom = h - Math.max(36, Math.floor(h * 0.06));
    const lanesTotalH = Math.max(180, lanesBottom - lanesTop);
    this.laneHeight = Math.max(58, Math.min(100, Math.floor(lanesTotalH / 3.45)));
    const laneStep = lanesTotalH / 3;
    this.laneYs = [
      lanesTop + laneStep * 0.5,
      lanesTop + laneStep * 1.5,
      lanesTop + laneStep * 2.5,
    ];

    // Clamp crane inside new bounds
    this.craneX = Math.max(this.playLeft + 24, Math.min(this.playRight - 24, this.craneX));
    this.craneY = Math.max(this.chuteTop + 30, Math.min(lanesBottom, this.craneY));

    // Align conveyor items vertically to resized lanes
    for (const item of this.items) {
      item.y = this.laneYs[item.lane] ?? this.laneYs[1];
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (
      code === 'Space' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      if (this.phase === 'PLAYING' || this.phase === 'PAUSED') {
        e.preventDefault();
      }
    }

    if (code === 'Escape' || code === 'KeyP') {
      if (this.phase === 'PLAYING') {
        this.pause();
      } else if (this.phase === 'PAUSED') {
        this.resume();
      }
      return;
    }

    if (this.phase !== 'PLAYING') return;

    soundEngine.unlock();

    // Movement keys disable pointer-follow mode cleanly
    if (
      code === 'KeyW' ||
      code === 'KeyA' ||
      code === 'KeyS' ||
      code === 'KeyD' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      this.pointerActive = false;
      this.heldKeys.add(code);
      return;
    }

    // Edge-triggered actions (ignore OS key repeat)
    if (e.repeat) return;

    if (code === 'Space') {
      this.handlePrimaryAction();
    } else if (code === 'Digit1' || code === 'Numpad1') {
      this.tryQuickLaunch('it');
    } else if (code === 'Digit2' || code === 'Numpad2') {
      this.tryQuickLaunch('metal');
    } else if (code === 'Digit3' || code === 'Numpad3') {
      this.tryQuickLaunch('hazard');
    } else if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyE') {
      this.triggerSurge();
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.heldKeys.delete(e.code);
  };

  private handleBlur = (): void => {
    this.heldKeys.clear();
    this.pointerActive = false;
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.heldKeys.clear();
      this.pointerActive = false;
      if (this.phase === 'PLAYING') {
        this.pause();
      }
    }
  };

  private getCanvasPoint(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.phase !== 'PLAYING') return;
    const pt = this.getCanvasPoint(e.clientX, e.clientY);
    this.pointerX = pt.x;
    this.pointerY = pt.y;
    this.pointerActive = true;
  };

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.phase !== 'PLAYING') return;
    soundEngine.unlock();
    const pt = this.getCanvasPoint(e.clientX, e.clientY);
    this.pointerX = pt.x;
    this.pointerY = pt.y;
    this.pointerActive = true;

    // Clicking directly on a chute while holding an item immediately launches it there
    const clickedChute = this.findChuteAt(pt.x, pt.y, 18);
    if (clickedChute && this.heldItem) {
      this.launchHeldItemToChute(clickedChute.category);
      return;
    }

    // Clicking directly near a conveyor item when empty snaps crane & grabs it smoothly
    if (!this.heldItem) {
      const clickedItem = this.findNearestItem(pt.x, pt.y, 78);
      if (clickedItem) {
        this.craneX = clickedItem.x;
        this.craneY = clickedItem.y;
        this.grabItem(clickedItem);
        return;
      }
    }

    this.handlePrimaryAction();
  };

  private attachEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
  }

  private detachEvents(): void {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
  }

  private handlePrimaryAction(): void {
    if (this.craneStunTimer > 0) return;

    if (this.heldItem) {
      // Check if crane is over or near a chute
      const chute = this.findChuteAt(this.craneX, this.craneY, 36);
      if (chute) {
        this.launchHeldItemToChute(chute.category);
        return;
      }
      // If crane is above the top conveyor lane, launch to horizontally aligned chute
      if (this.craneY < this.chuteTop + this.chuteHeight + 70) {
        const nearest = this.findClosestChuteByX(this.craneX);
        if (nearest) {
          this.launchHeldItemToChute(nearest.category);
          return;
        }
      }
      // Otherwise launch gently to the chute aligned with craneX if user presses Space again while in upper deck, or drop back cleanly?
      // Better UX: pressing Space while holding always flings to the horizontally aligned chute if above lane 0, or drops back to nearest lane if over lanes
      const nearestLaneIdx = this.getClosestLaneIndex(this.craneY);
      const returned = this.heldItem;
      this.heldItem = null;
      returned.lane = nearestLaneIdx;
      returned.x = Math.max(this.playLeft + 32, Math.min(this.playRight - 45, this.craneX));
      returned.y = this.laneYs[nearestLaneIdx];
      returned.scaleX = 1.25;
      returned.scaleY = 0.78;
      this.items.push(returned);
      soundEngine.playUiClick();
      this.emitHud();
      return;
    }

    // Not holding an item: attempt grab, with 120ms input buffer if slightly early
    const target = this.findNearestItem(this.craneX, this.craneY, 74);
    if (target) {
      this.grabItem(target);
    } else {
      this.grabBufferTimer = 0.12;
    }
  }

  private tryQuickLaunch(category: ChuteCategory): void {
    if (this.craneStunTimer > 0) return;
    if (!this.heldItem) {
      // Quality-of-life: if hovering directly over an item and pressing 1/2/3, instant grab + launch!
      const target = this.findNearestItem(this.craneX, this.craneY, 74);
      if (target) {
        this.grabItem(target);
        this.launchHeldItemToChute(category);
      }
      return;
    }
    this.launchHeldItemToChute(category);
  }

  private grabItem(item: ConveyorItem): void {
    const idx = this.items.findIndex((i) => i.id === item.id);
    if (idx === -1) return;
    this.items.splice(idx, 1);
    this.heldItem = item;
    this.grabBufferTimer = 0;
    this.craneScaleX = 1.28;
    this.craneScaleY = 0.76;
    item.scaleX = 1.22;
    item.scaleY = 0.82;
    soundEngine.playGrab(item.heavy);
    this.spawnBurst(item.x, item.y, CHUTE_META[item.category].accent, 9, 'spark');
    this.emitHud();
  }

  private launchHeldItemToChute(targetCategory: ChuteCategory): void {
    if (!this.heldItem) return;
    const chute = this.chutes.find((c) => c.category === targetCategory);
    if (!chute) return;

    const item = this.heldItem;
    this.heldItem = null;
    this.craneScaleX = 0.82;
    this.craneScaleY = 1.24;

    this.flyingItems.push({
      item,
      startX: this.craneX,
      startY: this.craneY,
      targetChute: targetCategory,
      targetX: chute.x + chute.w * 0.5,
      targetY: chute.y + chute.h * 0.52,
      progress: 0,
      duration: item.heavy ? 0.25 : 0.19,
      rotation: 0,
      fromSurge: false,
    });

    soundEngine.playUiClick();
    this.emitHud();
  }

  private executeMagnetSurge(): void {
    this.surgeCharge = 0;
    this.hitstopTimer = 0.06;
    this.shakeMag = Math.max(this.shakeMag, 12);
    this.empWaveX = this.craneX;
    this.empWaveY = this.craneY;
    this.empWaveRadius = 24;
    this.empWaveAlpha = 1;

    soundEngine.playSurge();
    this.spawnFloatingText(this.craneX, this.craneY - 46, 'MAGNET SURGE!', '#38BDF8', 1.35);
    this.spawnRing(this.craneX, this.craneY, '#38BDF8', 180);

    // Wipe active lane voltage hazards
    if (this.laneHazards.length > 0) {
      this.laneHazards = [];
      this.spawnFloatingText(this.width * 0.5, this.laneYs[1], 'SURGE HAZARDS CLEARED', '#10B981', 1.05);
    }

    // Auto-sort held item + every item currently on the belts into its exact matching chute
    const toLaunch: ConveyorItem[] = [];
    if (this.heldItem) {
      toLaunch.push(this.heldItem);
      this.heldItem = null;
    }
    while (this.items.length > 0) {
      const popped = this.items.pop();
      if (popped) toLaunch.push(popped);
    }

    toLaunch.forEach((item, idx) => {
      const chute = this.chutes.find((c) => c.category === item.category);
      if (!chute) return;
      this.flyingItems.push({
        item,
        startX: item.x,
        startY: item.y,
        targetChute: item.category,
        targetX: chute.x + chute.w * 0.5,
        targetY: chute.y + chute.h * 0.52,
        progress: -idx * 0.04,
        duration: 0.24,
        rotation: 0,
        fromSurge: true,
      });
    });

    this.emitHud(true);
  }

  private resolveChuteArrival(flight: FlyingItem): void {
    const chute = this.chutes.find((c) => c.category === flight.targetChute);
    const { item } = flight;
    const correct = item.category === flight.targetChute;

    if (correct) {
      this.combo += 1;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;

      const comboMult = 1 + Math.min(this.combo - 1, 10) * 0.25;
      const diffMult = this.difficulty === 'overdrive' ? 1.25 : 1;
      const earned = Math.round(item.baseScore * comboMult * diffMult);
      this.score += earned;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        try {
          localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
        } catch {
          // ignore
        }
      }

      this.totalSorted += 1;
      this.shiftSorted += 1;
      this.recycledKg = Math.round((this.recycledKg + item.weightKg) * 10) / 10;
      this.co2SavedKg = Math.round((this.co2SavedKg + item.weightKg * item.co2Factor) * 10) / 10;

      if (!flight.fromSurge) {
        const surgeGain = item.golden ? 28 : item.isVolatile ? 18 : item.heavy ? 14 : 9;
        const prevSurge = this.surgeCharge;
        this.surgeCharge = Math.min(100, this.surgeCharge + surgeGain);
        if (prevSurge < 100 && this.surgeCharge >= 100) {
          this.spawnFloatingText(flight.targetX, flight.targetY + 56, 'SURGE READY! [SHIFT]', '#38BDF8', 1.15);
        }
      }

      if (chute) {
        chute.bounce = 1;
        chute.flash = 1;
      }

      const accent = CHUTE_META[item.category].accent;
      this.spawnBurst(flight.targetX, flight.targetY, accent, item.heavy || item.golden ? 22 : 13, 'spark');
      this.spawnRing(flight.targetX, flight.targetY, accent, item.heavy ? 95 : 64);

      if (item.golden) {
        soundEngine.playGoldenSort();
        this.hitstopTimer = 0.04;
        this.shakeMag = Math.max(this.shakeMag, 6);
        this.spawnFloatingText(flight.targetX, flight.targetY - 12, `+${earned} GOLD PCB!`, '#FACC15', 1.25);
      } else if (item.isVolatile) {
        soundEngine.playHazardNeutralize();
        this.hitstopTimer = 0.04;
        this.shakeMag = Math.max(this.shakeMag, 5);
        this.spawnFloatingText(flight.targetX, flight.targetY - 12, `+${earned} SECURED!`, '#F59E0B', 1.15);
      } else if (item.heavy) {
        soundEngine.playHeavySort(this.combo);
        this.hitstopTimer = 0.055;
        this.shakeMag = Math.max(this.shakeMag, 8);
        this.spawnFloatingText(flight.targetX, flight.targetY - 12, `+${earned} HEAVY!`, '#10B981', 1.2);
      } else {
        soundEngine.playSortSuccess(this.combo);
        const comboTag = this.combo >= 3 ? ` ×${this.combo}` : '';
        this.spawnFloatingText(flight.targetX, flight.targetY - 10, `+${earned}${comboTag}`, accent, 1.0);
      }

      // Check shift progression
      if (this.shiftSorted >= this.shiftTarget) {
        if (!this.endlessMode && this.shift >= VICTORY_SHIFT) {
          this.phase = 'VICTORY';
          this.heldKeys.clear();
          soundEngine.playVictory();
          this.emitHud(true);
          return;
        }
        this.shift += 1;
        this.shiftSorted = 0;
        this.shiftTarget = this.getShiftTarget(this.shift);
        this.integrity = Math.min(this.maxIntegrity, this.integrity + 12);
        soundEngine.playShiftUp();
        this.spawnFloatingText(
          this.width * 0.5,
          this.laneYs[0] - 28,
          `SHIFT ${this.shift} · SPEED UP!`,
          '#38BDF8',
          1.35
        );
      }
    } else {
      // Wrong chute
      this.combo = 0;
      this.applyDamage(8, 'Misrouted material overloaded the sorting chute.');
      if (chute) {
        chute.errorFlash = 1;
        chute.bounce = 0.7;
      }
      soundEngine.playWrongSort();
      this.spawnBurst(flight.targetX, flight.targetY, '#EF4444', 14, 'shard');
      this.spawnFloatingText(flight.targetX, flight.targetY - 10, 'WRONG CHUTE -8', '#F87171', 1.1);
    }

    this.emitHud();
  }

  private applyDamage(amount: number, reason: string): void {
    this.integrity = Math.max(0, this.integrity - amount);
    this.shakeMag = Math.max(this.shakeMag, Math.min(16, 6 + amount * 0.45));
    this.craneFlashTimer = 0.22;
    if (this.integrity <= 0 && this.phase === 'PLAYING') {
      this.phase = 'GAME_OVER';
      this.gameOverReason = reason;
      this.heldKeys.clear();
      soundEngine.playGameOver();
      this.emitHud(true);
    }
  }

  private spawnItem(forcedLane?: number, forcedX?: number): void {
    const lane = forcedLane !== undefined ? forcedLane : Math.floor(Math.random() * 3);
    const x = forcedX !== undefined ? forcedX : this.playLeft - 36;

    // Avoid spawning right on top of another item at belt entry
    for (const other of this.items) {
      if (other.lane === lane && Math.abs(other.x - x) < 92) {
        return;
      }
    }

    const roll = Math.random();
    let kind: ItemKind = 'pcb';

    // Progressive roster unlock across shifts
    if (roll < 0.065 && this.shift >= 1) {
      kind = 'golden_pcb';
    } else if (roll < (this.shift >= 2 ? 0.24 : 0.14)) {
      kind = 'swollen_battery';
    } else if (roll < 0.36 && this.shift >= 2) {
      kind = 'server';
    } else {
      const pool: ItemKind[] = ['pcb', 'laptop', 'copper_coil', 'smartphone', 'solar_cell', 'battery'];
      kind = pool[Math.floor(Math.random() * pool.length)];
    }

    const spec = this.getItemSpec(kind);
    const diffFuseMult = this.difficulty === 'overdrive' ? 0.85 : 1;

    this.items.push({
      id: this.nextItemId++,
      kind,
      category: spec.category,
      label: spec.label,
      lane,
      x,
      y: this.laneYs[lane],
      width: spec.width,
      height: spec.height,
      speedMult: spec.speedMult,
      weightKg: spec.weightKg,
      co2Factor: spec.co2Factor,
      baseScore: spec.baseScore,
      heavy: spec.heavy,
      golden: spec.golden,
      isVolatile: spec.isVolatile,
      fuseMax: spec.fuseMax * diffFuseMult,
      fuseLeft: spec.fuseMax * diffFuseMult,
      warnedHalf: false,
      warnedCritical: false,
      scaleX: 1,
      scaleY: 1,
      wobblePhase: Math.random() * Math.PI * 2,
    });
  }

  private getItemSpec(kind: ItemKind): {
    category: ChuteCategory;
    label: string;
    width: number;
    height: number;
    speedMult: number;
    weightKg: number;
    co2Factor: number;
    baseScore: number;
    heavy: boolean;
    golden: boolean;
    isVolatile: boolean;
    fuseMax: number;
  } {
    switch (kind) {
      case 'pcb':
        return {
          category: 'it',
          label: 'Circuit Board',
          width: 56,
          height: 44,
          speedMult: 1.0,
          weightKg: 0.9,
          co2Factor: 3.1,
          baseScore: 100,
          heavy: false,
          golden: false,
          isVolatile: false,
          fuseMax: 0,
        };
      case 'laptop':
        return {
          category: 'it',
          label: 'Laptop Unit',
          width: 64,
          height: 46,
          speedMult: 0.95,
          weightKg: 2.2,
          co2Factor: 2.8,
          baseScore: 120,
          heavy: false,
          golden: false,
          isVolatile: false,
          fuseMax: 0,
        };
      case 'server':
        return {
          category: 'it',
          label: 'Heavy Server',
          width: 82,
          height: 54,
          speedMult: 0.72,
          weightKg: 8.5,
          co2Factor: 3.4,
          baseScore: 260,
          heavy: true,
          golden: false,
          isVolatile: false,
          fuseMax: 0,
        };
      case 'golden_pcb':
        return {
          category: 'it',
          label: 'Golden PCB',
          width: 56,
          height: 44,
          speedMult: 1.42,
          weightKg: 1.4,
          co2Factor: 4.8,
          baseScore: 340,
          heavy: false,
          golden: true,
          isVolatile: false,
          fuseMax: 0,
        };
      case 'copper_coil':
        return {
          category: 'metal',
          label: 'Copper Coil',
          width: 54,
          height: 46,
          speedMult: 1.02,
          weightKg: 3.2,
          co2Factor: 2.1,
          baseScore: 110,
          heavy: false,
          golden: false,
          isVolatile: false,
          fuseMax: 0,
        };
      case 'smartphone':
        return {
          category: 'metal',
          label: 'Smartphone',
          width: 46,
          height: 50,
          speedMult: 1.14,
          weightKg: 0.4,
          co2Factor: 4.2,
          baseScore: 130,
          heavy: false,
          golden: false,
          isVolatile: false,
          fuseMax: 0,
        };
      case 'solar_cell':
        return {
          category: 'metal',
          label: 'Solar Module',
          width: 64,
          height: 48,
          speedMult: 0.92,
          weightKg: 4.6,
          co2Factor: 2.6,
          baseScore: 150,
          heavy: false,
          golden: false,
          isVolatile: false,
          fuseMax: 0,
        };
      case 'battery':
        return {
          category: 'hazard',
          label: 'Lithium Pack',
          width: 56,
          height: 42,
          speedMult: 1.0,
          weightKg: 1.8,
          co2Factor: 3.6,
          baseScore: 135,
          heavy: false,
          golden: false,
          isVolatile: false,
          fuseMax: 0,
        };
      case 'swollen_battery':
        return {
          category: 'hazard',
          label: 'Volatile Battery',
          width: 60,
          height: 46,
          speedMult: 0.88,
          weightKg: 2.4,
          co2Factor: 4.1,
          baseScore: 240,
          heavy: false,
          golden: false,
          isVolatile: true,
          fuseMax: 6.2,
        };
    }
  }

  private findNearestItem(x: number, y: number, maxDist: number): ConveyorItem | null {
    let best: ConveyorItem | null = null;
    let bestD = maxDist;
    for (const item of this.items) {
      const dx = item.x - x;
      const dy = item.y - y;
      const d = Math.hypot(dx, dy);
      if (d < bestD) {
        bestD = d;
        best = item;
      }
    }
    return best;
  }

  private findChuteAt(x: number, y: number, pad = 0): ChuteRect | null {
    for (const c of this.chutes) {
      if (x >= c.x - pad && x <= c.x + c.w + pad && y >= c.y - pad && y <= c.y + c.h + pad) {
        return c;
      }
    }
    return null;
  }

  private findClosestChuteByX(x: number): ChuteRect | null {
    let best: ChuteRect | null = null;
    let bestDist = Infinity;
    for (const c of this.chutes) {
      const cx = c.x + c.w * 0.5;
      const d = Math.abs(cx - x);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  private getClosestLaneIndex(y: number): number {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.laneYs.length; i++) {
      const d = Math.abs(this.laneYs[i] - y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  private spawnBurst(
    x: number,
    y: number,
    color: string,
    count: number,
    kind: 'spark' | 'shard' = 'spark'
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (!p.active) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 70 + Math.random() * 230;
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.size = kind === 'shard' ? 4 + Math.random() * 4 : 2.5 + Math.random() * 3.5;
        p.color = color;
        p.maxLife = 0.28 + Math.random() * 0.26;
        p.life = p.maxLife;
        p.alpha = 1;
        p.kind = kind;
        spawned++;
      }
    }
  }

  private spawnRing(x: number, y: number, color: string, radius: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = radius; // target max radius stored in vx
        p.vy = 0;
        p.size = 10;
        p.color = color;
        p.maxLife = 0.34;
        p.life = p.maxLife;
        p.alpha = 0.9;
        p.kind = 'ring';
        return;
      }
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string, scale = 1): void {
    this.floatingTexts.push({
      x,
      y,
      vy: -54,
      text,
      color,
      life: 0.95,
      maxLife: 0.95,
      scale,
    });
  }

  private startLoop(): void {
    this.running = true;
    this.lastTime = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      // Mandatory frame delta-time clamping
      const dt = Math.min(Math.max(rawDt, 0), 0.05);

      this.update(dt);
      this.render();

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private update(dt: number): void {
    this.ambientTime += dt;

    if (this.phase !== 'PLAYING') {
      // Gently animate belts in background on Title/Paused only lightly
      if (this.phase === 'TITLE_MENU') {
        this.beltOffset = (this.beltOffset + dt * 48) % 44;
      }
      return;
    }

    // Brief hitstop freeze for tactile impact weight
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.shakeMag = Math.max(0, this.shakeMag - dt * 28);
      return;
    }

    // Decaying camera shake & EMP wave
    this.shakeMag = Math.max(0, this.shakeMag - dt * 36);
    if (this.empWaveAlpha > 0) {
      this.empWaveRadius += dt * 1350;
      this.empWaveAlpha = Math.max(0, this.empWaveAlpha - dt * 2.1);
    }

    // Belt speed escalates smoothly with shift & difficulty
    const diffSpeed = this.difficulty === 'overdrive' ? 1.24 : 1.0;
    const baseBeltSpeed = (82 + (this.shift - 1) * 18) * diffSpeed;
    this.beltOffset = (this.beltOffset + baseBeltSpeed * dt) % 44;

    // Crane movement (keyboard OR pointer)
    this.updateCrane(dt);

    // Input buffer for grab
    if (this.grabBufferTimer > 0) {
      this.grabBufferTimer = Math.max(0, this.grabBufferTimer - dt);
      if (!this.heldItem && this.craneStunTimer <= 0) {
        const target = this.findNearestItem(this.craneX, this.craneY, 74);
        if (target) {
          this.grabItem(target);
        }
      }
    }

    // Track nearest lock-on item for visual target bracket
    if (!this.heldItem) {
      const candidate = this.findNearestItem(this.craneX, this.craneY, 82);
      this.nearestCandidateId = candidate ? candidate.id : null;
    } else {
      this.nearestCandidateId = null;
    }

    // Spawn cadence
    const spawnInterval = Math.max(
      0.56,
      (1.78 - (this.shift - 1) * 0.16) / (this.difficulty === 'overdrive' ? 1.18 : 1.0)
    );
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = spawnInterval * (0.85 + Math.random() * 0.3);
      if (this.items.length < 11) {
        this.spawnItem();
      }
    }

    // Lane Voltage Surge Jammer hazard (Shift 3+ or Overdrive Shift 2+)
    const hazardUnlockShift = this.difficulty === 'overdrive' ? 2 : 3;
    if (this.shift >= hazardUnlockShift) {
      this.laneHazardTimer -= dt;
      if (this.laneHazardTimer <= 0 && this.laneHazards.length === 0) {
        const lane = Math.floor(Math.random() * 3);
        this.laneHazards.push({
          lane,
          state: 'windup',
          timer: 1.7,
          duration: 1.7,
          hitPlayer: false,
        });
        soundEngine.playWarningChirp();
        this.laneHazardTimer = Math.max(5.5, 11.0 - this.shift * 0.75);
      }
    }

    // Update lane hazards
    for (let i = this.laneHazards.length - 1; i >= 0; i--) {
      const hz = this.laneHazards[i];
      hz.timer -= dt;
      if (hz.state === 'windup') {
        if (hz.timer <= 0) {
          hz.state = 'active';
          hz.duration = 0.65;
          hz.timer = 0.65;
          this.shakeMag = Math.max(this.shakeMag, 7);
          soundEngine.playDamage();
          this.spawnBurst(this.playLeft + (this.playRight - this.playLeft) * 0.5, this.laneYs[hz.lane], '#38BDF8', 18, 'spark');
        }
      } else {
        // Check if crane is inside active voltage lane
        const laneY = this.laneYs[hz.lane];
        if (!hz.hitPlayer && Math.abs(this.craneY - laneY) < this.laneHeight * 0.56) {
          hz.hitPlayer = true;
          this.craneStunTimer = 0.55;
          this.combo = 0;
          this.hitstopTimer = 0.045;
          this.applyDamage(12, 'Crane shorted out by a conveyor lane voltage surge.');
          this.spawnBurst(this.craneX, this.craneY, '#F59E0B', 20, 'spark');
          this.spawnFloatingText(this.craneX, this.craneY - 36, 'VOLTAGE HIT -12', '#F87171', 1.15);
          this.emitHud();
        }
        if (hz.timer <= 0) {
          this.laneHazards.splice(i, 1);
        }
      }
    }

    // Update conveyor items & volatile battery timers
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.x += baseBeltSpeed * item.speedMult * dt;
      item.wobblePhase += dt * 7;
      item.scaleX += (1 - item.scaleX) * Math.min(1, dt * 12);
      item.scaleY += (1 - item.scaleY) * Math.min(1, dt * 12);

      // Volatile battery countdown telegraph
      if (item.isVolatile) {
        item.fuseLeft -= dt;
        const ratio = item.fuseLeft / item.fuseMax;
        if (ratio < 0.55 && !item.warnedHalf) {
          item.warnedHalf = true;
          soundEngine.playWarningChirp();
        }
        if (ratio < 0.28 && !item.warnedCritical) {
          item.warnedCritical = true;
          soundEngine.playWarningChirp();
        }
        if (item.fuseLeft <= 0) {
          // Detonation!
          this.items.splice(i, 1);
          this.detonateBattery(item.x, item.y);
          continue;
        }
      }

      // Reached Landfill Shredder on the right
      if (item.x > this.playRight - 6) {
        this.items.splice(i, 1);
        this.combo = 0;
        const dmg = item.isVolatile ? 18 : item.heavy ? 14 : 10;
        soundEngine.playDamage();
        this.hitstopTimer = 0.035;
        this.applyDamage(dmg, 'Too much unsorted e-waste reached the landfill pit.');
        this.spawnBurst(this.playRight + 8, item.y, '#EF4444', 18, 'shard');
        this.spawnFloatingText(this.playRight - 48, item.y - 16, `LANDFILL -${dmg}`, '#F87171', 1.05);
        this.emitHud();
      }
    }

    // Held volatile battery still ticks (slightly slower to give fair deposit time)
    if (this.heldItem && this.heldItem.isVolatile) {
      this.heldItem.fuseLeft -= dt * 0.72;
      if (this.heldItem.fuseLeft <= 0) {
        const bx = this.craneX;
        const by = this.craneY;
        this.heldItem = null;
        this.detonateBattery(bx, by);
      }
    }

    // Update flying items
    for (let i = this.flyingItems.length - 1; i >= 0; i--) {
      const f = this.flyingItems[i];
      f.progress += dt / f.duration;
      f.rotation += dt * 9;
      if (f.progress >= 1) {
        this.flyingItems.splice(i, 1);
        this.resolveChuteArrival(f);
      }
    }

    // Chute bounce & flash decay
    for (const c of this.chutes) {
      c.bounce = Math.max(0, c.bounce - dt * 5.2);
      c.flash = Math.max(0, c.flash - dt * 3.8);
      c.errorFlash = Math.max(0, c.errorFlash - dt * 3.2);
    }

    // Particles
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      if (p.kind === 'ring') {
        p.size = 12 + (p.vx - 12) * (1 - Math.pow(1 - t, 3));
        p.alpha = (1 - t) * 0.85;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.alpha = 1 - t;
      }
    }

    // Floating popups
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      ft.vy *= 0.95;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  private detonateBattery(x: number, y: number): void {
    this.combo = 0;
    this.hitstopTimer = 0.065;
    soundEngine.playDamage();
    this.applyDamage(20, 'A swollen lithium battery ruptured in thermal runaway.');
    this.spawnRing(x, y, '#F97316', 140);
    this.spawnBurst(x, y, '#F59E0B', 26, 'spark');
    this.spawnBurst(x, y, '#EF4444', 18, 'shard');
    this.spawnFloatingText(x, y - 24, 'THERMAL RUPTURE -20', '#FB923C', 1.25);
    this.emitHud();
  }

  private updateCrane(dt: number): void {
    if (this.craneStunTimer > 0) {
      this.craneStunTimer = Math.max(0, this.craneStunTimer - dt);
    }
    if (this.craneFlashTimer > 0) {
      this.craneFlashTimer = Math.max(0, this.craneFlashTimer - dt);
    }

    // Spring scale recovery
    this.craneScaleX += (1 - this.craneScaleX) * Math.min(1, dt * 14);
    this.craneScaleY += (1 - this.craneScaleY) * Math.min(1, dt * 14);

    const minX = this.playLeft + 24;
    const maxX = this.playRight - 20;
    const minY = this.chuteTop + this.chuteHeight * 0.45;
    const maxY = this.laneYs[2] + this.laneHeight * 0.35;

    const heavySlowdown = this.heldItem?.heavy ? 0.78 : 1.0;

    if (this.craneStunTimer <= 0) {
      if (this.pointerActive) {
        const targetX = Math.max(minX, Math.min(maxX, this.pointerX));
        const targetY = Math.max(minY, Math.min(maxY, this.pointerY));
        const lerpRate = Math.min(1, dt * 18 * heavySlowdown);
        this.craneX += (targetX - this.craneX) * lerpRate;
        this.craneY += (targetY - this.craneY) * lerpRate;
        this.craneVx = 0;
        this.craneVy = 0;
      } else {
        let ix = 0;
        let iy = 0;
        if (this.heldKeys.has('KeyA') || this.heldKeys.has('ArrowLeft')) ix -= 1;
        if (this.heldKeys.has('KeyD') || this.heldKeys.has('ArrowRight')) ix += 1;
        if (this.heldKeys.has('KeyW') || this.heldKeys.has('ArrowUp')) iy -= 1;
        if (this.heldKeys.has('KeyS') || this.heldKeys.has('ArrowDown')) iy += 1;

        if (ix !== 0 && iy !== 0) {
          const inv = 1 / Math.SQRT2;
          ix *= inv;
          iy *= inv;
        }

        const maxSpeed = 660 * heavySlowdown;
        const accel = 4600 * heavySlowdown;

        if (ix !== 0) {
          this.craneVx += ix * accel * dt;
        } else {
          this.craneVx *= Math.pow(0.0008, dt);
        }

        if (iy !== 0) {
          this.craneVy += iy * accel * dt;
        } else {
          this.craneVy *= Math.pow(0.0008, dt);
        }

        const speed = Math.hypot(this.craneVx, this.craneVy);
        if (speed > maxSpeed) {
          this.craneVx = (this.craneVx / speed) * maxSpeed;
          this.craneVy = (this.craneVy / speed) * maxSpeed;
        }

        this.craneX = Math.max(minX, Math.min(maxX, this.craneX + this.craneVx * dt));
        this.craneY = Math.max(minY, Math.min(maxY, this.craneY + this.craneVy * dt));
      }
    }

    if (this.heldItem) {
      this.heldItem.x = this.craneX;
      this.heldItem.y = this.craneY + 6;
      this.heldItem.scaleX += (1 - this.heldItem.scaleX) * Math.min(1, dt * 12);
      this.heldItem.scaleY += (1 - this.heldItem.scaleY) * Math.min(1, dt * 12);
    }
  }

  private emitHud(force = false): void {
    const key = [
      this.phase,
      this.difficulty,
      this.score,
      this.highScore,
      this.combo,
      this.shift,
      this.shiftSorted,
      this.shiftTarget,
      this.recycledKg,
      this.co2SavedKg,
      this.integrity,
      Math.floor(this.surgeCharge),
      this.heldItem?.category || 'none',
      this.endlessMode ? 1 : 0,
    ].join('|');

    if (!force && key === this.lastHudKey) return;
    this.lastHudKey = key;

    this.onHudChange({
      phase: this.phase,
      difficulty: this.difficulty,
      score: this.score,
      highScore: this.highScore,
      combo: this.combo,
      maxCombo: this.maxCombo,
      shift: this.shift,
      shiftSorted: this.shiftSorted,
      shiftTarget: this.shiftTarget,
      totalSorted: this.totalSorted,
      recycledKg: this.recycledKg,
      co2SavedKg: this.co2SavedKg,
      integrity: Math.round(this.integrity),
      maxIntegrity: this.maxIntegrity,
      surgeCharge: Math.round(this.surgeCharge),
      heldCategory: this.heldItem?.category ?? null,
      heldLabel: this.heldItem?.label ?? null,
      endlessMode: this.endlessMode,
      gameOverReason: this.gameOverReason,
    });
  }

  // ==================== RENDERING ====================

  private render(): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Camera shake offset
    if (this.shakeMag > 0.25) {
      const sx = (Math.random() * 2 - 1) * this.shakeMag;
      const sy = (Math.random() * 2 - 1) * this.shakeMag;
      ctx.translate(sx, sy);
    }

    this.drawFloor(ctx);
    this.drawLandfillZone(ctx);
    this.drawChutes(ctx);
    this.drawConveyors(ctx);
    this.drawLaneHazards(ctx);

    // Conveyor items
    for (const item of this.items) {
      const isTargeted = item.id === this.nearestCandidateId && !this.heldItem;
      this.drawItem(ctx, item, isTargeted, false);
    }

    // Ballistic flying items
    for (const f of this.flyingItems) {
      if (f.progress < 0) continue;
      const t = Math.min(1, f.progress);
      const ease = 1 - Math.pow(1 - t, 3);
      const arcLift = Math.sin(t * Math.PI) * 48;
      const fx = f.startX + (f.targetX - f.startX) * ease;
      const fy = f.startY + (f.targetY - f.startY) * ease - arcLift;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(f.rotation * 0.22);
      const shrink = 1 - t * 0.35;
      ctx.scale(shrink, shrink);
      this.drawItemBody(ctx, f.item);
      ctx.restore();
    }

    // EMP Magnet Surge wave
    if (this.empWaveAlpha > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(this.empWaveX, this.empWaveY, this.empWaveRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(56, 189, 248, ${this.empWaveAlpha * 0.9})`;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(this.empWaveX, this.empWaveY, this.empWaveRadius * 0.85, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(16, 185, 129, ${this.empWaveAlpha * 0.55})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // Overhead crane gantry + player grapple head + held item
    if (this.phase !== 'TITLE_MENU') {
      this.drawCrane(ctx);
    }

    // Particles
    this.drawParticles(ctx);

    // World-space floating score & feedback popups
    this.drawFloatingTexts(ctx);

    ctx.restore();
  }

  private drawFloor(ctx: CanvasRenderingContext2D): void {
    // Deep industrial navy-slate recovery floor
    const bgGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    bgGrad.addColorStop(0, '#06111D');
    bgGrad.addColorStop(0.55, '#091A2B');
    bgGrad.addColorStop(1, '#071422');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // Subtle structural steel floor tile seams
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.045)';
    ctx.lineWidth = 1;
    const grid = 48;
    ctx.beginPath();
    for (let x = this.playLeft % grid; x < this.width; x += grid) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    for (let y = 0; y < this.height; y += grid) {
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();
  }

  private drawLandfillZone(ctx: CanvasRenderingContext2D): void {
    const x = this.playRight + 8;
    const y = this.laneYs[0] - this.laneHeight * 0.6;
    const w = this.width - x - 14;
    const h = this.laneYs[2] + this.laneHeight * 0.6 - y;
    if (w < 24) return;

    ctx.save();
    // Dark shredder pit housing
    this.roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = '#180B10';
    ctx.fill();
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Diagonal hazard safety stripes along left lip
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 12, h);
    ctx.clip();
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(x, y, 12, h);
    ctx.fillStyle = '#111827';
    for (let sy = y - 24; sy < y + h + 24; sy += 22) {
      ctx.beginPath();
      ctx.moveTo(x, sy);
      ctx.lineTo(x + 12, sy + 11);
      ctx.lineTo(x + 12, sy + 20);
      ctx.lineTo(x, sy + 9);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Vertical warning label inside pit
    ctx.save();
    ctx.translate(x + w * 0.57, y + h * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(248, 113, 113, 0.78)';
    ctx.font = '700 12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LANDFILL PIT', 0, 0);
    ctx.restore();

    ctx.restore();
  }

  private drawChutes(ctx: CanvasRenderingContext2D): void {
    for (const c of this.chutes) {
      const isMatchingHeld = this.heldItem?.category === c.category;
      const scale = 1 + c.bounce * 0.06;

      ctx.save();
      ctx.translate(c.x + c.w * 0.5, c.y + c.h * 0.5);
      ctx.scale(scale, scale);
      ctx.translate(-(c.x + c.w * 0.5), -(c.y + c.h * 0.5));

      // Matching target highlight aura when holding an item
      if (isMatchingHeld) {
        const pulse = 0.65 + Math.sin(this.ambientTime * 11) * 0.35;
        ctx.save();
        ctx.shadowColor = c.accent;
        ctx.shadowBlur = 18 * pulse;
        this.roundRect(ctx, c.x - 3, c.y - 3, c.w + 6, c.h + 6, 14);
        ctx.strokeStyle = c.accent;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
      }

      // Main chute bay housing
      this.roundRect(ctx, c.x, c.y, c.w, c.h, 12);
      const grad = ctx.createLinearGradient(c.x, c.y, c.x, c.y + c.h);
      grad.addColorStop(0, '#0F243A');
      grad.addColorStop(1, '#091625');
      ctx.fillStyle = grad;
      ctx.fill();

      // Impact flash or error flash
      if (c.flash > 0) {
        ctx.fillStyle = c.accentGlow;
        ctx.globalAlpha = c.flash * 0.8;
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (c.errorFlash > 0) {
        ctx.fillStyle = `rgba(239, 68, 68, ${c.errorFlash * 0.45})`;
        ctx.fill();
      }

      ctx.strokeStyle = isMatchingHeld ? c.accent : 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = isMatchingHeld ? 2.5 : 1.5;
      ctx.stroke();

      // Top colored accent rail
      this.roundRect(ctx, c.x + 12, c.y + 7, c.w - 24, 5, 3);
      ctx.fillStyle = c.accent;
      ctx.fill();

      // Quick-key badge etched cleanly into left side of chute housing
      const badgeSize = 26;
      const bx = c.x + 14;
      const by = c.y + c.h * 0.5 - badgeSize * 0.5 + 3;
      this.roundRect(ctx, bx, by, badgeSize, badgeSize, 6);
      ctx.fillStyle = isMatchingHeld ? c.accent : '#132B45';
      ctx.fill();
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 1.25;
      ctx.stroke();

      ctx.fillStyle = isMatchingHeld ? '#04101C' : '#E2E8F0';
      ctx.font = '800 13px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.keyNum, bx + badgeSize * 0.5, by + badgeSize * 0.5 + 0.5);

      // Chute category icon on right side
      this.drawChuteIcon(ctx, c.category, c.x + c.w - 28, c.y + c.h * 0.5 + 3, c.accent);

      // Title & subtitle
      ctx.textAlign = 'left';
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '700 14px system-ui, -apple-system, sans-serif';
      ctx.fillText(c.title, bx + badgeSize + 12, c.y + c.h * 0.44 + 2);

      ctx.fillStyle = 'rgba(148, 163, 184, 0.82)';
      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillText(c.subtitle, bx + badgeSize + 12, c.y + c.h * 0.68 + 2);

      // Intake funnel lip at bottom edge of chute
      ctx.fillStyle = isMatchingHeld ? c.accent : 'rgba(148, 163, 184, 0.35)';
      ctx.fillRect(c.x + c.w * 0.25, c.y + c.h - 3, c.w * 0.5, 3);

      ctx.restore();
    }
  }

  private drawChuteIcon(
    ctx: CanvasRenderingContext2D,
    category: ChuteCategory,
    cx: number,
    cy: number,
    color: string
  ): void {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (category === 'it') {
      // Microchip silhouette
      ctx.strokeRect(cx - 9, cy - 9, 18, 18);
      ctx.fillRect(cx - 4, cy - 4, 8, 8);
      for (const offset of [-5, 0, 5]) {
        ctx.beginPath();
        ctx.moveTo(cx + offset, cy - 13);
        ctx.lineTo(cx + offset, cy - 9);
        ctx.moveTo(cx + offset, cy + 9);
        ctx.lineTo(cx + offset, cy + 13);
        ctx.moveTo(cx - 13, cy + offset);
        ctx.lineTo(cx - 9, cy + offset);
        ctx.moveTo(cx + 9, cy + offset);
        ctx.lineTo(cx + 13, cy + offset);
        ctx.stroke();
      }
    } else if (category === 'metal') {
      // Copper coil / concentric rings
      ctx.beginPath();
      ctx.arc(cx, cy, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Hazard containment bolt shield
      ctx.beginPath();
      ctx.moveTo(cx, cy - 12);
      ctx.lineTo(cx + 11, cy + 9);
      ctx.lineTo(cx - 11, cy + 9);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 1, cy - 4);
      ctx.lineTo(cx - 3, cy + 2);
      ctx.lineTo(cx + 1, cy + 2);
      ctx.lineTo(cx - 1, cy + 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawConveyors(ctx: CanvasRenderingContext2D): void {
    const beltX = this.playLeft;
    const beltW = this.playRight - this.playLeft;

    for (let i = 0; i < this.laneYs.length; i++) {
      const cy = this.laneYs[i];
      const top = cy - this.laneHeight * 0.5;
      const h = this.laneHeight;

      ctx.save();
      // Conveyor dark metallic bed
      this.roundRect(ctx, beltX, top, beltW, h, 8);
      ctx.fillStyle = '#0D1E31';
      ctx.fill();

      // Brushed steel top & bottom rails
      ctx.fillStyle = '#1E354D';
      ctx.fillRect(beltX, top, beltW, 7);
      ctx.fillRect(beltX, top + h - 7, beltW, 7);

      // Animated conveyor tread chevrons clipped inside belt
      ctx.save();
      ctx.beginPath();
      ctx.rect(beltX + 2, top + 7, beltW - 4, h - 14);
      ctx.clip();

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 2;
      const step = 44;
      for (let x = beltX - step + this.beltOffset; x < beltX + beltW + step; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, top + 10);
        ctx.lineTo(x + 14, cy);
        ctx.lineTo(x, top + h - 10);
        ctx.stroke();
      }
      ctx.restore();

      // Left intake feeder housing
      ctx.fillStyle = '#142940';
      ctx.fillRect(beltX - 8, top - 2, 14, h + 4);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(beltX - 5, cy - 8, 4, 16);

      // Subtle lane index marker
      ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`L0${i + 1}`, beltX + 12, top + 17);

      ctx.restore();
    }
  }

  private drawLaneHazards(ctx: CanvasRenderingContext2D): void {
    const beltX = this.playLeft;
    const beltW = this.playRight - this.playLeft;

    for (const hz of this.laneHazards) {
      const cy = this.laneYs[hz.lane];
      const top = cy - this.laneHeight * 0.5;
      const h = this.laneHeight;

      ctx.save();
      if (hz.state === 'windup') {
        const progress = 1 - hz.timer / hz.duration;
        const pulse = 0.5 + 0.5 * Math.sin(this.ambientTime * 22);
        // Telegraph warning fill + progress bar
        ctx.fillStyle = `rgba(245, 158, 11, ${0.12 + pulse * 0.16})`;
        ctx.fillRect(beltX, top, beltW, h);

        ctx.strokeStyle = `rgba(245, 158, 11, ${0.6 + pulse * 0.4})`;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([12, 8]);
        ctx.strokeRect(beltX + 2, top + 2, beltW - 4, h - 4);
        ctx.setLineDash([]);

        // Telegraph charge bar along bottom rail
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(beltX, top + h - 6, beltW * progress, 6);

        // Warning label
        ctx.fillStyle = '#FDE68A';
        ctx.font = '800 12px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡ VOLTAGE SURGE INCOMING · CLEAR LANE ⚡', beltX + beltW * 0.5, cy);
      } else {
        // Active electric arc discharge across lane!
        ctx.fillStyle = 'rgba(56, 189, 248, 0.34)';
        ctx.fillRect(beltX, top, beltW, h);

        ctx.strokeStyle = '#E0F2FE';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(beltX, cy);
        const segs = 22;
        for (let s = 1; s <= segs; s++) {
          const sx = beltX + (beltW / segs) * s;
          const sy = cy + (Math.random() * 2 - 1) * (h * 0.32);
          ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawItem(
    ctx: CanvasRenderingContext2D,
    item: ConveyorItem,
    isTargeted: boolean,
    isHeld: boolean
  ): void {
    ctx.save();
    ctx.translate(item.x, item.y);

    // Volatile battery thermal runaway telegraph ring
    if (item.isVolatile) {
      const ratio = Math.max(0, item.fuseLeft / item.fuseMax);
      const urgency = 1 - ratio;
      const pulse = 0.5 + 0.5 * Math.sin(this.ambientTime * (10 + urgency * 22));
      const radius = Math.max(item.width, item.height) * 0.68;

      ctx.save();
      // Background hazard halo
      ctx.beginPath();
      ctx.arc(0, 0, radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239, 68, 68, ${0.14 + pulse * 0.2})`;
      ctx.fill();

      // Countdown radial arc
      ctx.beginPath();
      ctx.arc(0, 0, radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.strokeStyle = ratio < 0.35 ? '#EF4444' : '#F59E0B';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.restore();
    }

    // Lock-on target brackets when crane is close enough to grab
    if (isTargeted) {
      const bw = item.width * 0.5 + 9;
      const bh = item.height * 0.5 + 9;
      const accent = CHUTE_META[item.category].accent;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      const corner = 10;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(-bw, -bh + corner);
      ctx.lineTo(-bw, -bh);
      ctx.lineTo(-bw + corner, -bh);
      // Top-right
      ctx.moveTo(bw - corner, -bh);
      ctx.lineTo(bw, -bh);
      ctx.lineTo(bw, -bh + corner);
      // Bottom-right
      ctx.moveTo(bw, bh - corner);
      ctx.lineTo(bw, bh);
      ctx.lineTo(bw - corner, bh);
      // Bottom-left
      ctx.moveTo(-bw + corner, bh);
      ctx.lineTo(-bw, bh);
      ctx.lineTo(-bw, bh - corner);
      ctx.stroke();
    }

    // Grounded drop shadow
    ctx.fillStyle = isHeld ? 'rgba(2, 8, 18, 0.55)' : 'rgba(2, 8, 18, 0.42)';
    this.roundRect(
      ctx,
      -item.width * 0.48 + (isHeld ? 5 : 3),
      -item.height * 0.48 + (isHeld ? 12 : 6),
      item.width * 0.96,
      item.height * 0.96,
      8
    );
    ctx.fill();

    // Squash & stretch
    const liftScale = isHeld ? 1.1 : 1.0;
    ctx.scale(item.scaleX * liftScale, item.scaleY * liftScale);
    this.drawItemBody(ctx, item);

    ctx.restore();
  }

  private drawItemBody(ctx: CanvasRenderingContext2D, item: ConveyorItem): void {
    const w = item.width;
    const h = item.height;
    const hw = w * 0.5;
    const hh = h * 0.5;
    const accent = item.golden ? '#FACC15' : CHUTE_META[item.category].accent;

    if (item.kind === 'pcb' || item.kind === 'golden_pcb') {
      // Circuit board with copper/gold traces & central IC chip
      this.roundRect(ctx, -hw, -hh, w, h, 6);
      ctx.fillStyle = item.golden ? '#422006' : '#064E3B';
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Traces
      ctx.strokeStyle = item.golden ? '#FDE047' : '#34D399';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-hw + 6, -hh + 10);
      ctx.lineTo(-6, -hh + 10);
      ctx.lineTo(-6, 0);
      ctx.moveTo(hw - 6, hh - 10);
      ctx.lineTo(6, hh - 10);
      ctx.lineTo(6, 0);
      ctx.stroke();

      // IC chip
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-9, -8, 18, 16);
      ctx.strokeStyle = item.golden ? '#FACC15' : '#6EE7B7';
      ctx.lineWidth = 1;
      ctx.strokeRect(-9, -8, 18, 16);
    } else if (item.kind === 'laptop') {
      // Sleek aluminum laptop unit with emerald PCB edge
      this.roundRect(ctx, -hw, -hh, w, h, 6);
      ctx.fillStyle = '#334155';
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Screen bezel
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(-hw + 7, -hh + 6, w - 14, h * 0.52);
      // Keyboard deck
      ctx.fillStyle = '#64748B';
      ctx.fillRect(-hw + 8, 4, w - 16, h * 0.28);
    } else if (item.kind === 'server') {
      // Heavy double-wide rack server with emerald status bays
      this.roundRect(ctx, -hw, -hh, w, h, 7);
      ctx.fillStyle = '#1E293B';
      ctx.fill();
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Drive bays
      ctx.fillStyle = '#0F172A';
      for (let b = 0; b < 3; b++) {
        ctx.fillRect(-hw + 8, -hh + 8 + b * 14, w - 26, 9);
      }
      // Blinking LEDs
      const blink = Math.floor(this.ambientTime * 6) % 2 === 0;
      ctx.fillStyle = blink ? '#34D399' : '#059669';
      ctx.fillRect(hw - 12, -hh + 10, 5, 5);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(hw - 12, -hh + 24, 5, 5);
    } else if (item.kind === 'copper_coil') {
      // Wound copper coil spool with electric sky trim
      this.roundRect(ctx, -hw, -hh, w, h, 10);
      ctx.fillStyle = '#1E293B';
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
    } else if (item.kind === 'smartphone') {
      // Compact smartphone silhouette
      this.roundRect(ctx, -hw + 6, -hh, w - 12, h, 7);
      ctx.fillStyle = '#0F172A';
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#0369A1';
      ctx.fillRect(-hw + 11, -hh + 7, w - 22, h - 16);
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.arc(0, hh - 4.5, 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (item.kind === 'solar_cell') {
      // Photovoltaic grid cell
      this.roundRect(ctx, -hw, -hh, w, h, 6);
      ctx.fillStyle = '#0C4A6E';
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
      ctx.lineWidth = 1;
      for (let gx = -hw + 14; gx < hw; gx += 14) {
        ctx.beginPath();
        ctx.moveTo(gx, -hh + 3);
        ctx.lineTo(gx, hh - 3);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-hw + 3, 0);
      ctx.lineTo(hw - 3, 0);
      ctx.stroke();
    } else {
      // Lithium battery / Swollen Volatile Battery
      const volatile = item.kind === 'swollen_battery';
      const swell = volatile ? 1 + Math.sin(this.ambientTime * 16) * 0.06 : 1;
      ctx.save();
      ctx.scale(swell, swell);

      this.roundRect(ctx, -hw, -hh, w, h, volatile ? 9 : 6);
      ctx.fillStyle = volatile ? '#451A03' : '#292524';
      ctx.fill();
      ctx.strokeStyle = volatile ? '#EF4444' : '#F59E0B';
      ctx.lineWidth = volatile ? 2.5 : 2;
      ctx.stroke();

      // Battery terminal cap
      ctx.fillStyle = '#CBD5E1';
      ctx.fillRect(hw - 1, -7, 5, 14);

      // Charge bars or hazard bolt
      if (volatile) {
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.moveTo(3, -11);
        ctx.lineTo(-6, 1);
        ctx.lineTo(0, 1);
        ctx.lineTo(-3, 11);
        ctx.lineTo(6, -1);
        ctx.lineTo(0, -1);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#F59E0B';
        ctx.fillRect(-hw + 8, -hh + 9, 10, h - 18);
        ctx.fillRect(-hw + 22, -hh + 9, 10, h - 18);
        ctx.fillRect(-hw + 36, -hh + 9, 8, h - 18);
      }
      ctx.restore();
    }

    // Small category color key badge in top-right corner of item for instant colorblind-safe readability
    const keyNum = CHUTE_META[item.category].keyNum;
    ctx.fillStyle = '#071320';
    ctx.beginPath();
    ctx.arc(hw - 3, -hh + 3, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '800 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(keyNum, hw - 3, -hh + 3.5);
  }

  private drawCrane(ctx: CanvasRenderingContext2D): void {
    // Overhead gantry beam tracking craneX
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(this.craneX, this.chuteTop - 16);
    ctx.lineTo(this.craneX, this.height - 20);
    ctx.stroke();

    // Subtle magnetic guidance tether line toward matching chute while holding an item
    if (this.heldItem) {
      const targetChute = this.chutes.find((c) => c.category === this.heldItem?.category);
      if (targetChute) {
        ctx.save();
        ctx.strokeStyle = targetChute.accent;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2;
        ctx.setLineDash([7, 7]);
        ctx.beginPath();
        ctx.moveTo(this.craneX, this.craneY - 22);
        ctx.lineTo(targetChute.x + targetChute.w * 0.5, targetChute.y + targetChute.h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Draw held item directly beneath magnetic grapple claws
    if (this.heldItem) {
      this.drawItem(ctx, this.heldItem, false, true);
    }

    // Crane magnetic grapple head
    ctx.save();
    ctx.translate(this.craneX, this.craneY);
    ctx.scale(this.craneScaleX, this.craneScaleY);

    const isStunned = this.craneStunTimer > 0;
    const isFlashing = this.craneFlashTimer > 0;
    const ringColor = isStunned
      ? '#EF4444'
      : this.heldItem
        ? CHUTE_META[this.heldItem.category].accent
        : this.surgeCharge >= 100
          ? '#38BDF8'
          : '#10B981';

    // Outer magnetic field ring
    ctx.beginPath();
    ctx.arc(0, 0, this.heldItem ? 36 : 30, 0, Math.PI * 2);
    ctx.strokeStyle = ringColor;
    ctx.globalAlpha = this.heldItem ? 0.65 : 0.35;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 4 articulated grapple prongs
    ctx.strokeStyle = isFlashing ? '#FFFFFF' : '#CBD5E1';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    const spread = this.heldItem ? 22 : 17;
    for (let a = 0; a < 4; a++) {
      const angle = Math.PI * 0.25 + a * (Math.PI * 0.5);
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 10, Math.sin(angle) * 10);
      ctx.lineTo(Math.cos(angle) * spread, Math.sin(angle) * spread);
      ctx.stroke();
    }

    // Central magnetic core hub
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = isFlashing ? '#FFFFFF' : '#0F243A';
    ctx.fill();
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner LED beacon
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = ringColor;
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      if (!p.active) continue;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      if (p.kind === 'ring') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (p.kind === 'shard') {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size * 0.65);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private drawFloatingTexts(ctx: CanvasRenderingContext2D): void {
    for (const ft of this.floatingTexts) {
      const alpha = Math.min(1, ft.life / (ft.maxLife * 0.45));
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `800 ${Math.round(14 * ft.scale)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#040C16';
      ctx.fillText(ft.text, ft.x + 1.5, ft.y + 1.5);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    const radius = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}
