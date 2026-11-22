import React from "react";
import { cn } from "@/lib/utils";

export interface GlobeProps {
  /** Optional container classes (defaults to centered full-container sizing) */
  className?: string;
  /** Diameter of the globe in pixels (default: 250) */
  size?: number;
  /** Optional equirectangular Earth texture URL */
  textureUrl?: string;
  /** Use full viewport height (h-screen) as in standalone demo */
  fullScreen?: boolean;
}

const DEFAULT_EARTH_TEXTURE =
  "https://cdn.21st.dev/assets/mirror/f2/f2fe23d0c6a8406962e4c5ef969e13dc9de3faf37d3e7258a1067173325b254f.jpg";

const Globe: React.FC<GlobeProps> = ({
  className,
  size = 250,
  textureUrl = DEFAULT_EARTH_TEXTURE,
  fullScreen = false,
}) => {
  const scale = size / 250;

  return (
    <>
      <style>
        {`
          @keyframes earthRotate {
            0% { background-position: 0 0; }
            100% { background-position: 400px 0; }
          }
          @keyframes twinkling { 0%,100% { opacity:0.15; } 50% { opacity:1; } }
          @keyframes twinkling-slow { 0%,100% { opacity:0.15; } 50% { opacity:0.95; } }
          @keyframes twinkling-long { 0%,100% { opacity:0.12; } 50% { opacity:1; } }
          @keyframes twinkling-fast { 0%,100% { opacity:0.15; } 50% { opacity:0.9; } }
        `}
      </style>
      <div
        className={cn(
          "flex items-center justify-center w-full",
          fullScreen ? "h-screen" : "min-h-[340px] h-full py-10",
          className
        )}
      >
        <div
          className="relative flex items-center justify-center"
          style={{ width: size, height: size }}
        >
          {/* Orbiting Starfield (positioned outside the sphere clipping boundary) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full bg-white w-1 h-1"
            style={{
              left: `${-20 * scale}px`,
              top: `${12 * scale}px`,
              animation: "twinkling 3s infinite",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full bg-white w-1 h-1"
            style={{
              left: `${-40 * scale}px`,
              top: `${30 * scale}px`,
              animation: "twinkling-slow 2s infinite",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full bg-sky-200 w-1 h-1"
            style={{
              left: `${295 * scale}px`,
              top: `${90 * scale}px`,
              animation: "twinkling-long 4s infinite",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full bg-white w-1 h-1"
            style={{
              left: `${200 * scale}px`,
              top: `${285 * scale}px`,
              animation: "twinkling 3s infinite",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full bg-cyan-200 w-1 h-1"
            style={{
              left: `${50 * scale}px`,
              top: `${270 * scale}px`,
              animation: "twinkling-fast 1.5s infinite",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full bg-white w-1 h-1"
            style={{
              left: `${240 * scale}px`,
              top: `${-40 * scale}px`,
              animation: "twinkling-long 4s infinite",
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full bg-sky-100 w-1 h-1"
            style={{
              left: `${280 * scale}px`,
              top: `${55 * scale}px`,
              animation: "twinkling-slow 2s infinite",
            }}
          />

          {/* Soft atmospheric halo */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-[-14px] rounded-full bg-sky-400/15 blur-2xl"
          />

          {/* Rotating Earth Sphere */}
          <div
            role="img"
            aria-label="Animated rotating Earth globe"
            className="relative w-full h-full rounded-full overflow-hidden shadow-[0_0_24px_rgba(195,244,255,0.28),-5px_0_8px_#c3f4ff_inset,15px_2px_25px_#000_inset,-24px_-2px_34px_#c3f4ff99_inset,250px_0_44px_#00000066_inset,150px_0_38px_#000000aa_inset]"
            style={{
              backgroundImage: `url('${textureUrl}'), radial-gradient(circle at 35% 35%, #38bdf8, #0369a1 58%, #041c32 100%)`,
              backgroundSize: "cover",
              backgroundPosition: "left",
              animation: "earthRotate 30s linear infinite",
            }}
          />
        </div>
      </div>
    </>
  );
};

export default Globe;
