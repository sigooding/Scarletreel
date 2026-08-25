import type { CSSProperties } from "react";
import type {
  CinematicSettings,
  LensFlareGhostTier,
  LensFlarePreset,
  LensFlareSettings,
  LightPoint,
} from "./types";

/** A fully-defaulted, clamped light ready to hand to `.cin-light`. */
export interface ResolvedLight {
  x: number;
  y: number;
  color: string;
  intensity: number;
  size: number;
  pulseSeconds: number;
  pulseAmount: number;
}

/** A fully-defaulted, clamped optical lens flare ready to render in `.cin-lensflare-layer`. */
export interface ResolvedLensFlare {
  enabled: boolean;
  preset: LensFlarePreset;
  x: number;
  y: number;
  intensity: number;
  color: string;
  secondaryColor: string;
  streakIntensity: number;
  streakWidth: number;
  streakAngle: number;
  ghostIntensity: number;
  ghostSpread: number;
  ghostCount: LensFlareGhostTier;
  starburstIntensity: number;
  starburstRays: number;
  coreSize: number;
  pulseSeconds: number;
  pulseAmount: number;
  reactivity: number;
  linkToLight?: number;
}

/** One optical ghost reflection calculated along the optical axis. */
export interface GhostElement {
  id: number;
  factor: number;
  x: number;
  y: number;
  size: number; // diameter as % of viewport
  opacity: number;
  type: "disc" | "disc-soft" | "disc-wide" | "ring" | "ring-thin" | "halo-rainbow" | "aperture" | "star-pin";
  color: string;
  borderColor?: string;
  borderWidth?: number;
  rotateDeg?: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Split a stored glow colour (hex or `rgba(r,g,b,a)`) into its hue and the
 * intensity carried in its alpha channel, so the Studio colour and brightness
 * controls can edit them independently. */
export function parseGlowColor(col?: string): { hex: string; r: number; g: number; b: number; a: number } {
  const s = (col ?? "").trim();
  if (/^#?[0-9a-f]{6}$/i.test(s)) {
    const h = s.replace("#", "").toLowerCase();
    return {
      hex: `#${h}`,
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 0.5,
    };
  }
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(s);
  if (m) {
    return {
      hex: `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("")}`,
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] !== undefined ? clamp(parseFloat(m[4]), 0, 1) : 0.5,
    };
  }
  return { hex: "#e8b23c", r: 232, g: 178, b: 60, a: 0.5 };
}

/** Editable light list for a cinematic. Merges the legacy single-light fields
 * (`lightSource` / `lightColor` / `lightRadius`) into the first entry so old
 * drafts keep their glow and migrate to the `lights` array on next edit. */
export function lightPoints(c?: CinematicSettings): LightPoint[] {
  if (c?.lights?.length) return c.lights;
  if (c?.lightSource) {
    const [x, y] = c.lightSource.split(" ").map((v) => parseFloat(v));
    const { hex, a } = parseGlowColor(c.lightColor);
    return [
      {
        x: clamp(x || 50, 0, 100),
        y: clamp(y || 30, 0, 100),
        color: hex,
        intensity: a,
        size: c.lightRadius ?? 40,
        pulseSeconds: 2.8,
        pulseAmount: 1,
      },
    ];
  }
  return [];
}

/** Normalised lights ready to render — every default applied and every value clamped. */
export function resolveLights(c?: CinematicSettings): ResolvedLight[] {
  return lightPoints(c).map((l) => ({
    x: clamp(l.x ?? 50, 0, 100),
    y: clamp(l.y ?? 30, 0, 100),
    color: l.color ?? "#e8b23c",
    intensity: clamp(l.intensity ?? 0.5, 0, 1),
    size: clamp(l.size ?? 40, 5, 95),
    pulseSeconds: clamp(l.pulseSeconds ?? 2.8, 0.5, 12),
    pulseAmount: clamp(l.pulseAmount ?? 1, 0, 1),
  }));
}

/** Inline style for one glow layer — CSS custom props consumed by `.cin-light`.
 * The glow peaks at `intensity` and breathes down to
 * `intensity * (1 - pulseAmount * 0.5)` on a smooth sine curve. */
export function lightStyle(l: ResolvedLight): CSSProperties {
  return {
    "--glow-pos": `${l.x}% ${l.y}%`,
    "--glow-col": l.color,
    "--glow-intensity": String(l.intensity),
    "--glow-size": `${l.size}%`,
    "--glow-dur": `${l.pulseSeconds}s`,
    "--glow-amp": String(l.pulseAmount * 0.5),
  } as CSSProperties;
}

/** Defaults for a brand-new light point. */
export function defaultLight(): LightPoint {
  return { x: 50, y: 30, color: "#e8b23c", intensity: 0.5, size: 40, pulseSeconds: 2.8, pulseAmount: 1 };
}

/* ------------------------------------------------------------------ */
/*  Dynamic Lens Flare Profiles & Presets                             */
/* ------------------------------------------------------------------ */

export interface LensFlarePresetConfig {
  name: string;
  tagline: string;
  badge: string;
  color: string;
  secondaryColor: string;
  streakIntensity: number;
  streakWidth: number;
  streakAngle: number;
  ghostIntensity: number;
  ghostSpread: number;
  ghostCount: LensFlareGhostTier;
  starburstIntensity: number;
  starburstRays: number;
  coreSize: number;
  pulseSeconds: number;
  pulseAmount: number;
  reactivity: number;
}

export const LENS_FLARE_PRESETS: Record<LensFlarePreset, LensFlarePresetConfig> = {
  "anamorphic-blue": {
    name: "Anamorphic Blue",
    tagline: "Classic CinemaScope / Hollywood widescreen horizontal beam with electric cyan & cobalt reflections",
    badge: "🎬 Sci-Fi / Action",
    color: "#38bdf8",
    secondaryColor: "#818cf8",
    streakIntensity: 0.95,
    streakWidth: 1.0,
    streakAngle: 0,
    ghostIntensity: 0.75,
    ghostSpread: 1.0,
    ghostCount: "standard",
    starburstIntensity: 0.55,
    starburstRays: 6,
    coreSize: 42,
    pulseSeconds: 2.8,
    pulseAmount: 0.35,
    reactivity: 1.0,
  },
  "warm-amber": {
    name: "Golden Hour / Amber",
    tagline: "Warm sunset & vintage tungsten streetlamp glow with rich golden streaks and warm aperture rings",
    badge: "🌅 Golden Hour / Noir",
    color: "#f59e0b",
    secondaryColor: "#f87171",
    streakIntensity: 0.85,
    streakWidth: 1.2,
    streakAngle: 0,
    ghostIntensity: 0.8,
    ghostSpread: 1.05,
    ghostCount: "rich",
    starburstIntensity: 0.7,
    starburstRays: 8,
    coreSize: 48,
    pulseSeconds: 3.2,
    pulseAmount: 0.4,
    reactivity: 1.0,
  },
  "sci-fi-cyan": {
    name: "Sci-Fi Cyan",
    tagline: "Cybernetic cobalt & electric cyan beam with sharp aperture reflections",
    badge: "⚡ High-Tech",
    color: "#06b6d4",
    secondaryColor: "#3b82f6",
    streakIntensity: 1.0,
    streakWidth: 0.85,
    streakAngle: 0,
    ghostIntensity: 0.85,
    ghostSpread: 0.95,
    ghostCount: "standard",
    starburstIntensity: 0.65,
    starburstRays: 4,
    coreSize: 38,
    pulseSeconds: 2.2,
    pulseAmount: 0.45,
    reactivity: 1.1,
  },
  "neon-noir": {
    name: "Neon Noir",
    tagline: "Vivid cyberpunk magenta streak with purple & cyan chromatic reflections",
    badge: "🔮 Cyberpunk / Neon",
    color: "#ec4899",
    secondaryColor: "#a855f7",
    streakIntensity: 0.9,
    streakWidth: 1.1,
    streakAngle: 0,
    ghostIntensity: 0.8,
    ghostSpread: 1.1,
    ghostCount: "rich",
    starburstIntensity: 0.65,
    starburstRays: 6,
    coreSize: 45,
    pulseSeconds: 2.4,
    pulseAmount: 0.5,
    reactivity: 1.0,
  },
  "vintage-35mm": {
    name: "Vintage 35mm",
    tagline: "Spherical lens flare with chromatic rainbow halo, soft iris aperture rings, and starburst rays",
    badge: "🎞 Vintage Film",
    color: "#fde68a",
    secondaryColor: "#38bdf8",
    streakIntensity: 0.45,
    streakWidth: 1.4,
    streakAngle: 0,
    ghostIntensity: 0.9,
    ghostSpread: 1.15,
    ghostCount: "rich",
    starburstIntensity: 0.8,
    starburstRays: 6,
    coreSize: 52,
    pulseSeconds: 3.4,
    pulseAmount: 0.3,
    reactivity: 0.9,
  },
  "natural-sun": {
    name: "Natural Sun",
    tagline: "Soft daylight solar glare with airy pastel rings and delicate diffraction rays",
    badge: "☀️ Daylight / Sol",
    color: "#fef08a",
    secondaryColor: "#fdba74",
    streakIntensity: 0.35,
    streakWidth: 1.5,
    streakAngle: 0,
    ghostIntensity: 0.7,
    ghostSpread: 1.0,
    ghostCount: "standard",
    starburstIntensity: 0.85,
    starburstRays: 8,
    coreSize: 58,
    pulseSeconds: 4.0,
    pulseAmount: 0.25,
    reactivity: 0.85,
  },
  "interrogation": {
    name: "Interrogation Spotlight",
    tagline: "Blinding high-contrast stark white beam with crisp sharp diffraction starburst",
    badge: "🔦 Hard Spotlight",
    color: "#ffffff",
    secondaryColor: "#94a3b8",
    streakIntensity: 0.85,
    streakWidth: 0.9,
    streakAngle: 0,
    ghostIntensity: 0.6,
    ghostSpread: 0.9,
    ghostCount: "subtle",
    starburstIntensity: 1.0,
    starburstRays: 4,
    coreSize: 62,
    pulseSeconds: 1.8,
    pulseAmount: 0.3,
    reactivity: 1.2,
  },
  "emerald": {
    name: "Emerald Night",
    tagline: "Moody noir green / eerie night-vision flare with teal secondary reflections",
    badge: "🟢 Nocturne / Eerie",
    color: "#10b981",
    secondaryColor: "#06b6d4",
    streakIntensity: 0.85,
    streakWidth: 1.0,
    streakAngle: 0,
    ghostIntensity: 0.75,
    ghostSpread: 1.0,
    ghostCount: "standard",
    starburstIntensity: 0.6,
    starburstRays: 6,
    coreSize: 42,
    pulseSeconds: 2.8,
    pulseAmount: 0.4,
    reactivity: 1.0,
  },
  "custom": {
    name: "Custom",
    tagline: "Custom authored optical lens flare",
    badge: "🛠 Custom Profile",
    color: "#38bdf8",
    secondaryColor: "#818cf8",
    streakIntensity: 0.85,
    streakWidth: 1.0,
    streakAngle: 0,
    ghostIntensity: 0.75,
    ghostSpread: 1.0,
    ghostCount: "standard",
    starburstIntensity: 0.6,
    starburstRays: 6,
    coreSize: 42,
    pulseSeconds: 2.8,
    pulseAmount: 0.4,
    reactivity: 1.0,
  },
};

/** Default configuration for a new dynamic lens flare. */
export function defaultLensFlare(preset: LensFlarePreset = "anamorphic-blue", overridePos?: { x: number; y: number }): LensFlareSettings {
  const p = LENS_FLARE_PRESETS[preset] ?? LENS_FLARE_PRESETS["anamorphic-blue"];
  return {
    enabled: true,
    preset,
    x: overridePos ? clamp(overridePos.x, 0, 100) : 50,
    y: overridePos ? clamp(overridePos.y, 0, 100) : 30,
    intensity: 0.75,
    color: p.color,
    secondaryColor: p.secondaryColor,
    streakIntensity: p.streakIntensity,
    streakWidth: p.streakWidth,
    streakAngle: p.streakAngle,
    ghostIntensity: p.ghostIntensity,
    ghostSpread: p.ghostSpread,
    ghostCount: p.ghostCount,
    starburstIntensity: p.starburstIntensity,
    starburstRays: p.starburstRays,
    coreSize: p.coreSize,
    pulseSeconds: p.pulseSeconds,
    pulseAmount: p.pulseAmount,
    reactivity: p.reactivity,
  };
}

/** Normalize and clamp a LensFlareSettings object. */
export function resolveSingleLensFlare(f: LensFlareSettings, lights?: LightPoint[]): ResolvedLensFlare {
  const presetKey = f.preset ?? "anamorphic-blue";
  const p = LENS_FLARE_PRESETS[presetKey] ?? LENS_FLARE_PRESETS["anamorphic-blue"];

  let posX = f.x ?? 50;
  let posY = f.y ?? 30;

  // If linked to a light point, anchor to that light
  if (f.linkToLight !== undefined && lights && lights[f.linkToLight]) {
    const l = lights[f.linkToLight];
    posX = l.x ?? posX;
    posY = l.y ?? posY;
  }

  return {
    enabled: f.enabled !== false,
    preset: presetKey,
    x: clamp(posX, 0, 100),
    y: clamp(posY, 0, 100),
    intensity: clamp(f.intensity ?? 0.75, 0, 1),
    color: f.color ?? p.color,
    secondaryColor: f.secondaryColor ?? p.secondaryColor,
    streakIntensity: clamp(f.streakIntensity ?? p.streakIntensity, 0, 1),
    streakWidth: clamp(f.streakWidth ?? p.streakWidth, 0.1, 4),
    streakAngle: clamp(f.streakAngle ?? p.streakAngle, -45, 45),
    ghostIntensity: clamp(f.ghostIntensity ?? p.ghostIntensity, 0, 1),
    ghostSpread: clamp(f.ghostSpread ?? p.ghostSpread, 0.4, 2.5),
    ghostCount: f.ghostCount ?? p.ghostCount,
    starburstIntensity: clamp(f.starburstIntensity ?? p.starburstIntensity, 0, 1),
    starburstRays: [4, 6, 8, 12].includes(f.starburstRays ?? p.starburstRays) ? (f.starburstRays ?? p.starburstRays) : 6,
    coreSize: clamp(f.coreSize ?? p.coreSize, 10, 95),
    pulseSeconds: clamp(f.pulseSeconds ?? p.pulseSeconds, 0.5, 12),
    pulseAmount: clamp(f.pulseAmount ?? p.pulseAmount, 0, 1),
    reactivity: clamp(f.reactivity ?? p.reactivity, 0, 2),
    linkToLight: f.linkToLight,
  };
}

/** Normalise every lens flare configured in a cinematic settings object. */
export function resolveLensFlares(c?: CinematicSettings): ResolvedLensFlare[] {
  if (!c) return [];
  const results: ResolvedLensFlare[] = [];

  // Primary lens flare
  if (c.lensFlare && c.lensFlare.enabled !== false) {
    results.push(resolveSingleLensFlare(c.lensFlare, c.lights));
  }

  // Multi-flares array
  if (c.flares?.length) {
    c.flares.forEach((f) => {
      if (f && f.enabled !== false) {
        results.push(resolveSingleLensFlare(f, c.lights));
      }
    });
  }

  // Point lights with flare enabled
  if (c.lights?.length) {
    c.lights.forEach((l) => {
      if (l.flare) {
        const custom = typeof l.flare === "object" ? l.flare : {};
        results.push(
          resolveSingleLensFlare(
            {
              x: l.x,
              y: l.y,
              color: l.color,
              intensity: l.intensity,
              ...custom,
            },
            c.lights
          )
        );
      }
    });
  }

  return results;
}

/** Return the first active lens flare, or null. */
export function resolveLensFlare(c?: CinematicSettings): ResolvedLensFlare | null {
  const flares = resolveLensFlares(c);
  return flares.length > 0 ? flares[0] : null;
}

/* ------------------------------------------------------------------ */
/*  Optical Ghost Generation Math                                     */
/* ------------------------------------------------------------------ */

interface GhostTemplate {
  factor: number;
  size: number;
  type: GhostElement["type"];
  colorKey: "primary" | "secondary" | "rainbow";
  opacity: number;
  rotateOffset?: number;
}

const GHOST_TEMPLATES_SUBTLE: GhostTemplate[] = [
  { factor: -0.65, size: 9, type: "disc", colorKey: "primary", opacity: 0.55 },
  { factor: 0.2, size: 16, type: "ring", colorKey: "secondary", opacity: 0.65 },
  { factor: 0.7, size: 22, type: "disc-soft", colorKey: "primary", opacity: 0.45 },
  { factor: 1.25, size: 11, type: "aperture", colorKey: "secondary", opacity: 0.7 },
];

const GHOST_TEMPLATES_STANDARD: GhostTemplate[] = [
  { factor: -0.75, size: 7, type: "aperture", colorKey: "primary", opacity: 0.6 },
  { factor: -0.35, size: 13, type: "disc", colorKey: "secondary", opacity: 0.45 },
  { factor: 0.05, size: 22, type: "halo-rainbow", colorKey: "rainbow", opacity: 0.6 },
  { factor: 0.35, size: 10, type: "disc", colorKey: "primary", opacity: 0.65 },
  { factor: 0.65, size: 26, type: "disc-soft", colorKey: "secondary", opacity: 0.35 },
  { factor: 0.95, size: 15, type: "ring", colorKey: "primary", opacity: 0.55 },
  { factor: 1.3, size: 9, type: "aperture", colorKey: "secondary", opacity: 0.7 },
  { factor: 1.75, size: 34, type: "disc-wide", colorKey: "primary", opacity: 0.25 },
];

const GHOST_TEMPLATES_RICH: GhostTemplate[] = [
  { factor: -0.85, size: 5, type: "star-pin", colorKey: "primary", opacity: 0.8 },
  { factor: -0.6, size: 10, type: "aperture", colorKey: "secondary", opacity: 0.65 },
  { factor: -0.3, size: 15, type: "disc", colorKey: "primary", opacity: 0.5 },
  { factor: -0.05, size: 25, type: "halo-rainbow", colorKey: "rainbow", opacity: 0.65 },
  { factor: 0.15, size: 7, type: "ring-thin", colorKey: "secondary", opacity: 0.75 },
  { factor: 0.38, size: 12, type: "disc", colorKey: "primary", opacity: 0.65 },
  { factor: 0.62, size: 30, type: "disc-soft", colorKey: "secondary", opacity: 0.35 },
  { factor: 0.88, size: 17, type: "aperture", colorKey: "primary", opacity: 0.55 },
  { factor: 1.12, size: 11, type: "ring", colorKey: "secondary", opacity: 0.65 },
  { factor: 1.4, size: 6, type: "star-pin", colorKey: "primary", opacity: 0.85 },
  { factor: 1.7, size: 38, type: "disc-wide", colorKey: "secondary", opacity: 0.25 },
  { factor: 2.05, size: 14, type: "ring-thin", colorKey: "primary", opacity: 0.45 },
];

/** Compute ghost reflection positions along the optical axis passing from
 * the light source through the optical center (50%, 50%). */
export function calculateGhostElements(flare: ResolvedLensFlare): GhostElement[] {
  const templates =
    flare.ghostCount === "subtle"
      ? GHOST_TEMPLATES_SUBTLE
      : flare.ghostCount === "rich"
        ? GHOST_TEMPLATES_RICH
        : GHOST_TEMPLATES_STANDARD;

  const dx = flare.x - 50;
  const dy = flare.y - 50;
  const axisAngleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);

  return templates.map((tmpl, idx) => {
    // Optical position: Center + (Center - Light) * factor * spread
    const gx = 50 - dx * tmpl.factor * flare.ghostSpread;
    const gy = 50 - dy * tmpl.factor * flare.ghostSpread;

    // Edge falloff: softly fade ghosts that drift off the screen boundary
    const distFromCenter = Math.sqrt(Math.pow(gx - 50, 2) + Math.pow(gy - 50, 2));
    const edgeFade = distFromCenter > 75 ? Math.max(0, 1 - (distFromCenter - 75) / 35) : 1;

    let col = flare.color;
    if (tmpl.colorKey === "secondary") col = flare.secondaryColor;
    else if (tmpl.colorKey === "rainbow") col = "rainbow";

    return {
      id: idx,
      factor: tmpl.factor,
      x: Math.round(gx * 100) / 100,
      y: Math.round(gy * 100) / 100,
      size: tmpl.size,
      opacity: Math.round(tmpl.opacity * flare.ghostIntensity * flare.intensity * edgeFade * 100) / 100,
      type: tmpl.type,
      color: col,
      rotateDeg: axisAngleDeg + (tmpl.rotateOffset ?? 0),
    };
  });
}

/** Inline styles / CSS variables for a dynamic lens flare container. */
export function lensFlareStyle(flare: ResolvedLensFlare): CSSProperties {
  const glow = parseGlowColor(flare.color);
  const sec = parseGlowColor(flare.secondaryColor);

  return {
    "--flare-x": `${flare.x}%`,
    "--flare-y": `${flare.y}%`,
    "--flare-col": glow.hex,
    "--flare-rgb": `${glow.r}, ${glow.g}, ${glow.b}`,
    "--flare-sec-col": sec.hex,
    "--flare-sec-rgb": `${sec.r}, ${sec.g}, ${sec.b}`,
    "--flare-intensity": String(flare.intensity),
    "--flare-core-size": `${flare.coreSize}%`,
    "--streak-intensity": String(flare.streakIntensity * flare.intensity),
    "--streak-width": String(flare.streakWidth),
    "--streak-angle": `${flare.streakAngle}deg`,
    "--starburst-intensity": String(flare.starburstIntensity * flare.intensity),
    "--ghost-intensity": String(flare.ghostIntensity * flare.intensity),
    "--flare-pulse-dur": `${flare.pulseSeconds}s`,
    "--flare-pulse-amp": String(flare.pulseAmount * 0.5),
    "--ghost-dx": `${(50 - flare.x) * flare.reactivity}px`,
    "--ghost-dy": `${(50 - flare.y) * flare.reactivity}px`,
  } as CSSProperties;
}
