import { useEffect, useRef, useState } from "react";
import { assetUrl } from "../assetPath";
import { sheetAnim, sheetCols, sheetFrameAt, sheetFramePos, type SpriteSheet } from "./spriteSheet";

/**
 * Renders one animation of a SpriteSheet, stepped with CSS
 * background-position. The sheet image loads once (to learn the grid), then
 * a per-fps timer advances the frame; a single-frame animation never ticks.
 *
 * Sizing:
 *  - `height={px}` (default 96) — fixed pixel height, frame scaled uniformly.
 *  - `height="100%"` — fluid: fills the parent's height and derives its width
 *    from the frame's aspect ratio, so it can live inside %-sized wrappers
 *    (talking portraits, foreground extras).
 *
 * `freezeOnFallback`: when the REQUESTED animation name isn't on the sheet
 * and we fell back to another one, hold that animation's first frame instead
 * of playing it — a sheet with only "walk" stands still on walk frame 1
 * rather than moonwalking in place.
 *
 * `resolve` maps `asset:` references to blob/data URLs where the story
 * fields haven't been resolved yet (Studio previews).
 */
export function SheetSprite({
  sheet,
  anim,
  fallbacks = [],
  height = 96,
  freezeOnFallback = false,
  resolve,
  className = "",
  style,
}: {
  sheet: SpriteSheet;
  anim: string;
  fallbacks?: string[];
  height?: number | "100%";
  freezeOnFallback?: boolean;
  resolve?: (v?: string) => string | undefined;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [tick, setTick] = useState(0);
  const startRef = useRef(0);

  const url = assetUrl(resolve ? resolve(sheet.image) ?? sheet.image : sheet.image);
  const active = sheetAnim(sheet, anim, fallbacks);
  // Did the lookup land on the animation the caller asked for?
  const requested = sheet.animations?.[anim];
  const fellBack = !(requested && requested.frames?.length);
  const frozen = freezeOnFallback && fellBack;

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setDims({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Restart the clock when the animation changes; only tick multi-frame loops.
  useEffect(() => {
    startRef.current = performance.now();
    setTick(0);
    if (!active || active.frames.length < 2 || frozen) return;
    const fps = active.fps && active.fps > 0 ? active.fps : 8;
    const id = window.setInterval(() => setTick((t) => t + 1), Math.max(30, 1000 / fps));
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim, sheet, frozen, active?.frames.length, active?.fps]);
  void tick;

  if (!active || !dims) return null;
  const cols = sheetCols(sheet, dims.w);
  const rows = Math.max(1, Math.floor(dims.h / Math.max(1, sheet.frameHeight)));
  const elapsed = (performance.now() - startRef.current) / 1000;
  const frame = frozen ? active.frames[0] : sheetFrameAt(active, elapsed);
  const { col, row } = sheetFramePos(frame, cols);

  const common: React.CSSProperties = {
    backgroundImage: `url(${url})`,
    backgroundRepeat: "no-repeat",
    imageRendering: sheet.pixelated ? "pixelated" : undefined,
    ...style,
  };

  if (height === "100%") {
    // Fluid: %-based background stepping so no pixel measurements are needed.
    const xPct = cols > 1 ? (col * 100) / (cols - 1) : 0;
    const yPct = rows > 1 ? (row * 100) / (rows - 1) : 0;
    return (
      <div
        className={className}
        style={{
          height: "100%",
          aspectRatio: `${sheet.frameWidth} / ${sheet.frameHeight}`,
          backgroundSize: `${cols * 100}% ${rows * 100}%`,
          backgroundPosition: `${xPct}% ${yPct}%`,
          ...common,
        }}
        aria-hidden
      />
    );
  }

  const scale = height / sheet.frameHeight;
  return (
    <div
      className={className}
      style={{
        width: sheet.frameWidth * scale,
        height,
        backgroundSize: `${dims.w * scale}px ${dims.h * scale}px`,
        backgroundPosition: `-${col * sheet.frameWidth * scale}px -${row * sheet.frameHeight * scale}px`,
        ...common,
      }}
      aria-hidden
    />
  );
}
