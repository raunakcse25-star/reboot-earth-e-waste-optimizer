import React, { useEffect, useRef, useState } from 'react';
import {
  CircuitRushEngine,
  type GameDifficulty,
  type HudSnapshot,
} from '../game/circuitRushEngine';
import { soundEngine } from '../game/soundEngine';
import backdropArt from '../assets/images/game_circuit_rush_backdrop_1795775033261.jpg';

interface CircuitRushGameProps {
  onExit: () => void;
}

const INITIAL_HUD: HudSnapshot = {
  phase: 'TITLE_MENU',
  difficulty: 'standard',
  score: 0,
  highScore: 0,
  combo: 0,
  maxCombo: 0,
  shift: 1,
  shiftSorted: 0,
  shiftTarget: 14,
  totalSorted: 0,
  recycledKg: 0,
  co2SavedKg: 0,
  integrity: 100,
  maxIntegrity: 100,
  surgeCharge: 0,
  heldCategory: null,
  heldLabel: null,
  endlessMode: false,
  gameOverReason: null,
};

// Bespoke inline SVG title lockup with geometric circuit-trace typography craft
const CircuitRushTitleSvg: React.FC = () => (
  <svg
    viewBox="0 0 540 126"
    className="w-full max-w-[460px] h-auto drop-shadow-[0_6px_24px_rgba(2,8,18,0.85)]"
    role="img"
    aria-label="Circuit Rush"
  >
    <defs>
      <linearGradient id="crTitleMetal" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#F8FAFC" />
        <stop offset="55%" stopColor="#CBD5E1" />
        <stop offset="100%" stopColor="#94A3B8" />
      </linearGradient>
      <linearGradient id="crTitleAccent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#10B981" />
        <stop offset="55%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
    </defs>

    {/* Top copper-emerald circuit trace hairline */}
    <path
      d="M4 14 H148 L160 4 H316"
      fill="none"
      stroke="url(#crTitleAccent)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="4" cy="14" r="3.5" fill="#10B981" />
    <circle cx="316" cy="4" r="3.5" fill="#F59E0B" />

    {/* Main geometric display wordmark */}
    <text
      x="2"
      y="72"
      fill="url(#crTitleMetal)"
      fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      fontWeight="900"
      fontSize="60"
      letterSpacing="5"
    >
      CIRCUIT
    </text>

    {/* Second line bold industrial accent */}
    <text
      x="4"
      y="116"
      fill="url(#crTitleAccent)"
      fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      fontWeight="900"
      fontSize="44"
      letterSpacing="12"
    >
      RUSH
    </text>

    {/* Right-side circuit node bracket */}
    <path
      d="M214 102 H356 L368 90 H420"
      fill="none"
      stroke="#10B981"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.85"
    />
    <circle cx="420" cy="90" r="4" fill="#38BDF8" />
    <rect x="210" y="98" width="8" height="8" rx="1.5" fill="#F59E0B" />
  </svg>
);

const AudioIcon: React.FC<{ muted: boolean }> = ({ muted }) => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    {muted ? (
      <>
        <line x1="22" y1="9" x2="16" y2="15" />
        <line x1="16" y1="9" x2="22" y2="15" />
      </>
    ) : (
      <>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      </>
    )}
  </svg>
);

const PauseIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </svg>
);

const BoltIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
    <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
  </svg>
);

const ShieldHeartIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

export const CircuitRushGame: React.FC<CircuitRushGameProps> = ({ onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<CircuitRushEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [backdropFailed, setBackdropFailed] = useState(false);

  // Mount isolated 60fps simulation engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new CircuitRushEngine(canvas, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Keyboard shortcuts for Title / Victory / Game Over screens
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (hud.phase === 'TITLE_MENU') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          engineRef.current?.startNewGame();
        } else if (e.code === 'Escape') {
          onExit();
        }
      } else if (hud.phase === 'GAME_OVER' || hud.phase === 'VICTORY') {
        if (e.code === 'Enter') {
          e.preventDefault();
          engineRef.current?.startNewGame();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hud.phase, onExit]);

  const handleToggleMute = () => {
    const next = soundEngine.toggleMute();
    setMuted(next);
  };

  const handleSetDifficulty = (diff: GameDifficulty) => {
    soundEngine.playUiClick();
    engineRef.current?.setDifficulty(diff);
  };

  const handleStart = () => {
    engineRef.current?.startNewGame();
  };

  const handlePause = () => {
    engineRef.current?.pause();
  };

  const handleResume = () => {
    engineRef.current?.resume();
  };

  const handleContinueEndless = () => {
    engineRef.current?.continueEndless();
  };

  const handleTriggerSurge = () => {
    engineRef.current?.triggerSurge();
  };

  const integrityPct = Math.max(0, Math.min(100, Math.round((hud.integrity / hud.maxIntegrity) * 100)));
  const integrityColor =
    integrityPct > 55 ? 'bg-emerald-400' : integrityPct > 28 ? 'bg-amber-400' : 'bg-red-500';
  const shiftPct = Math.min(100, Math.round((hud.shiftSorted / Math.max(1, hud.shiftTarget)) * 100));
  const surgeReady = hud.surgeCharge >= 100;

  return (
    <div className="fixed inset-0 z-50 bg-[#071320] text-slate-100 overflow-hidden select-none">
      {/* Isolated 60fps Canvas Container */}
      <div className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="block w-full h-full touch-none"
          aria-label="Circuit Rush interactive e-waste sorting game"
        />
      </div>

      {/* ==================== TITLE SCREEN ==================== */}
      {hud.phase === 'TITLE_MENU' && (
        <div className="absolute inset-0 z-20 flex flex-col justify-between bg-[#071320]">
          {/* Illustrated 16:9 Key-Art Backdrop with CSS fallback */}
          <div className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#06111D] via-[#0B223B] to-[#071320]">
            {!backdropFailed && (
              <img
                src={backdropArt}
                alt="Circuit Rush automated magnetic crane sorting electronics over steel conveyor belts"
                referrerPolicy="no-referrer"
                onError={() => setBackdropFailed(true)}
                className="w-full h-full object-cover object-center opacity-95"
              />
            )}
            {/* Directional contrast scrim preserving left negative space & right key-art focal crane */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-r from-[#06101B]/95 via-[#06101B]/72 to-[#06101B]/18"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-[#06101B]/90 via-transparent to-[#06101B]/45"
            />
          </div>

          {/* Top Perimeter Bar: Quiet Return & Audio Toggle */}
          <div className="relative z-10 flex items-center justify-between px-6 sm:px-10 pt-5">
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-200 bg-[#0B1C30]/90 border border-slate-700/80 hover:border-sky-400/70 hover:text-white transition-colors cursor-pointer"
            >
              ← Exit
            </button>

            <div className="flex items-center gap-4">
              {hud.highScore > 0 && (
                <div className="text-right">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Best Score
                  </span>
                  <span className="font-mono text-base font-bold tabular-nums text-amber-400">
                    {hud.highScore.toLocaleString()}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={muted ? 'Unmute game audio' : 'Mute game audio'}
                className="p-2.5 rounded-lg bg-[#0B1C30]/90 border border-slate-700/80 text-slate-200 hover:border-sky-400/70 hover:text-white transition-colors cursor-pointer"
              >
                <AudioIcon muted={muted} />
              </button>
            </div>
          </div>

          {/* Left-Anchored Hero Lockup over Calm Negative Space */}
          <div className="relative z-10 px-6 sm:px-12 lg:px-16 max-w-xl space-y-6 my-auto">
            <div className="space-y-3">
              <p className="text-xs font-mono font-semibold uppercase tracking-[0.24em] text-emerald-400">
                Reboot Earth Recovery Floor
              </p>
              <CircuitRushTitleSvg />
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-md">
                Pilot the magnetic gantry crane to rescue circuit boards, copper coils, and volatile lithium packs before they hit the landfill pit.
              </p>
            </div>

            {/* Difficulty Segmented Control */}
            <div className="inline-flex rounded-lg bg-[#091829] border border-slate-700/80 p-1 gap-1">
              {(
                [
                  { id: 'standard', label: 'Standard' },
                  { id: 'overdrive', label: 'Overdrive' },
                ] as const
              ).map((mode) => {
                const active = hud.difficulty === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => handleSetDifficulty(mode.id)}
                    className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    }`}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>

            {/* Primary CTA */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleStart}
                className="px-8 py-3.5 rounded-lg text-sm font-bold tracking-wide uppercase bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_28px_rgba(16,185,129,0.35)] transition-all active:scale-[0.98] cursor-pointer"
              >
                Start Game
              </button>
            </div>
          </div>

          {/* Single Flat Control-Hint Line along Bottom */}
          <div className="relative z-10 px-6 sm:px-12 lg:px-16 pb-6 pt-3">
            <p className="font-mono text-[11px] sm:text-xs text-slate-300/85 tracking-wide">
              WASD / Arrows or Mouse Move · Space / Click Grab &amp; Sort · 1-3 Quick Chute · Shift Magnet Surge · Esc Pause
            </p>
          </div>
        </div>
      )}

      {/* ==================== ACTIVE PLAY PERIMETER HUD (NO BLUR, LOW OCCLUSION) ==================== */}
      {hud.phase !== 'TITLE_MENU' && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-4 sm:px-6 pt-3 flex items-start justify-between gap-4">
          {/* Top-Left Perimeter Cluster: Score, Combo, Shift */}
          <div className="flex items-center gap-5 sm:gap-7 bg-[#071320]/90 border border-slate-800/90 rounded-lg px-4 py-2">
            <div>
              <span className="block text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">
                Score
              </span>
              <span className="font-mono text-xl font-extrabold tabular-nums text-white leading-none">
                {hud.score.toLocaleString()}
              </span>
            </div>

            <div className="h-7 w-px bg-slate-800" />

            <div>
              <span className="block text-[10px] font-mono uppercase tracking-[0.16em] text-slate-400">
                Combo
              </span>
              <span
                className={`font-mono text-xl font-extrabold tabular-nums leading-none ${
                  hud.combo >= 5
                    ? 'text-amber-400'
                    : hud.combo >= 2
                      ? 'text-emerald-400'
                      : 'text-slate-400'
                }`}
              >
                ×{Math.max(1, hud.combo)}
              </span>
            </div>

            <div className="hidden sm:block h-7 w-px bg-slate-800" />

            <div className="hidden sm:block min-w-[104px]">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">
                <span>{hud.endlessMode ? `Endless ${hud.shift}` : `Shift ${hud.shift}/5`}</span>
                <span className="tabular-nums text-sky-300">
                  {hud.shiftSorted}/{hud.shiftTarget}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-sky-400 transition-all duration-150"
                  style={{ width: `${shiftPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Top-Right Perimeter Cluster: Integrity, Recycled, Surge, Audio & Pause */}
          <div className="flex items-center gap-3 sm:gap-4 bg-[#071320]/90 border border-slate-800/90 rounded-lg px-3.5 py-2">
            {/* Integrity */}
            <div className="min-w-[92px] sm:min-w-[110px]">
              <div className="flex items-center justify-between gap-2 text-[10px] font-mono uppercase tracking-[0.12em]">
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <ShieldHeartIcon />
                  Integrity
                </span>
                <span className="tabular-nums font-bold text-slate-100">{integrityPct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-150 ${integrityColor}`}
                  style={{ width: `${integrityPct}%` }}
                />
              </div>
            </div>

            <div className="hidden md:block h-7 w-px bg-slate-800" />

            {/* Recycled Weight */}
            <div className="hidden md:block text-right">
              <span className="block text-[10px] font-mono uppercase tracking-[0.14em] text-slate-400">
                Recycled
              </span>
              <span className="font-mono text-sm font-bold tabular-nums text-emerald-400">
                {hud.recycledKg.toFixed(1)} kg
              </span>
            </div>

            <div className="h-7 w-px bg-slate-800" />

            {/* Magnet Surge Trigger / Meter */}
            <button
              type="button"
              onClick={handleTriggerSurge}
              disabled={!surgeReady || hud.phase !== 'PLAYING'}
              className={`pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-mono font-bold tabular-nums transition-colors ${
                surgeReady
                  ? 'bg-sky-400 text-slate-950 hover:bg-sky-300 cursor-pointer'
                  : 'bg-slate-900 border border-slate-700/80 text-slate-400 cursor-default'
              }`}
              title={surgeReady ? 'Activate Magnet Surge (Shift / E)' : 'Sort items to charge Magnet Surge'}
            >
              <BoltIcon />
              <span>{surgeReady ? 'SURGE [SHIFT]' : `${hud.surgeCharge}%`}</span>
            </button>

            {/* Mute & Pause */}
            <div className="pointer-events-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                className="p-2 rounded-md bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:border-sky-400/70 transition-colors cursor-pointer"
              >
                <AudioIcon muted={muted} />
              </button>
              <button
                type="button"
                onClick={hud.phase === 'PAUSED' ? handleResume : handlePause}
                aria-label="Pause game"
                className="p-2 rounded-md bg-slate-900 border border-slate-700/80 text-slate-300 hover:text-white hover:border-sky-400/70 transition-colors cursor-pointer"
              >
                <PauseIcon />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== PAUSED MODAL ==================== */}
      {hud.phase === 'PAUSED' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#040C16]/80 px-4">
          <div className="w-full max-w-sm rounded-xl bg-[#0B1C30] border border-sky-900/80 p-6 space-y-5 shadow-2xl">
            <div className="space-y-1">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-sky-400">
                Shift {hud.shift} Paused
              </p>
              <h2 className="text-2xl font-extrabold tracking-tight text-white">
                Conveyors Halted
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono border-y border-slate-800 py-3.5">
              <div>
                <span className="block text-slate-400 uppercase text-[10px]">Score</span>
                <span className="text-base font-bold tabular-nums text-white">
                  {hud.score.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="block text-slate-400 uppercase text-[10px]">Recycled</span>
                <span className="text-base font-bold tabular-nums text-emerald-400">
                  {hud.recycledKg.toFixed(1)} kg
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleResume}
                className="w-full py-2.5 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer"
              >
                Resume
              </button>
              <button
                type="button"
                onClick={handleStart}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 transition-colors cursor-pointer"
              >
                Restart Shift
              </button>
              <button
                type="button"
                onClick={onExit}
                className="w-full py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Exit to Reboot Earth
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== VICTORY / GAME OVER MODAL ==================== */}
      {(hud.phase === 'VICTORY' || hud.phase === 'GAME_OVER') && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#040C16]/85 px-4">
          <div className="w-full max-w-md rounded-xl bg-[#0B1C30] border border-sky-900/80 p-6 sm:p-7 space-y-5 shadow-2xl">
            <div className="space-y-1.5">
              <p
                className={`font-mono text-[11px] font-bold uppercase tracking-[0.2em] ${
                  hud.phase === 'VICTORY' ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {hud.phase === 'VICTORY' ? 'All 5 Shifts Cleared' : 'Facility Overload'}
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {hud.phase === 'VICTORY' ? 'Recovery Quota Complete' : 'Line Shutdown'}
              </h2>
              {hud.phase === 'GAME_OVER' && hud.gameOverReason && (
                <p className="text-xs text-slate-300 leading-relaxed">{hud.gameOverReason}</p>
              )}
            </div>

            {/* Clean Impact & Score Readout Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-y border-slate-800 py-4 font-mono">
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Score</span>
                <span className="text-lg font-extrabold tabular-nums text-white">
                  {hud.score.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Best</span>
                <span className="text-lg font-extrabold tabular-nums text-amber-400">
                  {hud.highScore.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Max Combo</span>
                <span className="text-lg font-extrabold tabular-nums text-sky-400">
                  ×{Math.max(1, hud.maxCombo)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Recycled</span>
                <span className="text-base font-bold tabular-nums text-emerald-400">
                  {hud.recycledKg.toFixed(1)} kg
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-400">CO₂e Saved</span>
                <span className="text-base font-bold tabular-nums text-emerald-300">
                  {hud.co2SavedKg.toFixed(1)} kg
                </span>
              </div>
              <div>
                <span className="block text-[10px] uppercase text-slate-400">Items Sorted</span>
                <span className="text-base font-bold tabular-nums text-slate-200">
                  {hud.totalSorted}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              {hud.phase === 'VICTORY' && (
                <button
                  type="button"
                  onClick={handleContinueEndless}
                  className="w-full py-2.5 rounded-lg text-sm font-bold bg-sky-400 hover:bg-sky-300 text-slate-950 transition-colors cursor-pointer"
                >
                  Continue Endless Shift
                </button>
              )}
              <button
                type="button"
                onClick={handleStart}
                className="w-full py-2.5 rounded-lg text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer"
              >
                Play Again
              </button>
              <button
                type="button"
                onClick={onExit}
                className="w-full py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Exit to Reboot Earth
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
