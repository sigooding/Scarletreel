import { useEffect, useRef, useState } from "react";
import { assetUrl } from "../assetPath";
import { sheetAnim, sheetCols, sheetFrameAt, sheetFramePos, type SpriteSheet } from "./spriteSheet";

/**
 * Renders one animation of a SpriteSheet, stepped with CSS
 * background-position. The sheet image loads once (to learn the grid), then
 * a per-fps timer advances the frame; a single-frame animation never ticks.
 *
 * `height` is the on-screen height in px — the frame is scaled uniformly
 * so authors size sprites the way they size everything else on the stage.
 */
export function SheetSprite({
  sheet,
  anim,
  fallbacks = [],
  height = 96,
  className = "",
}: {
  sheet: SpriteSheet;
  anim: string;
  fallbacks?: string[];
  height?: number;
  className?: string;
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [tick, setTick] = useState(0);
  const startRef = useRef(0);

  const url = assetUrl(sheet.image);
  const active = sheetAnim(sheet, anim, fallbacks);

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
    if (!active || active.frames.length < 2) return;
    const fps = active.fps && active.fps > 0 ? active.fps : 8;
    const id = window.setInterval(() => setTick((t) => t + 1), Math.max(30, 1000 / fps));
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anim, sheet, active?.frames.length, active?.fps]);
  void tick;

  if (!active || !dims) return null;
  const cols = sheetCols(sheet, dims.w);
  const elapsed = (performance.now() - startRef.current) / 1000;
  const frame = sheetFrameAt(active, elapsed);
  const { col, row } = sheetFramePos(frame, cols);
  const scale = height / sheet.frameHeight;
  const w = sheet.frameWidth * scale;
  const h = height;

  return (
    <div
      className={className}
      style={{
        width: w,
        height: h,
        backgroundImage: `url(${url})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${dims.w * scale}px ${dims.h * scale}px`,
        backgroundPosition: `-${col * sheet.frameWidth * scale}px -${row * sheet.frameHeight * scale}px`,
        imageRendering: sheet.pixelated ? "pixelated" : undefined,
      }}
      aria-hidden
    />
  );
}
