/**
 * SPRITESHEET SUPPORT — one image, a grid of frames, named animations.
 *
 * Pure data + math only (no React) so logic.ts can validate sheets and the
 * Node engine tests can pin the frame arithmetic. The renderer lives in
 * src/game/SheetSprite.tsx and steps frames with CSS background-position —
 * no canvas, nothing runs while a sprite is idle on a single frame.
 *
 * Conventions the engine looks up by name:
 *   - stage walker: "walk" while moving, "idle" at rest
 * Fallback: a missing name falls back through `fallbacks`, then to the
 * first animation defined on the sheet, so a sheet with only "walk" still
 * renders at rest (frozen on the animation's first frame).
 */

export interface SpriteSheetAnimation {
  /** Frame indices into the grid, counted left→right then top→bottom. */
  frames: number[];
  /** Frames per second (default 8). */
  fps?: number;
  /** Loop forever (default true). false = hold the last frame. */
  loop?: boolean;
}

export interface SpriteSheet {
  /** The sheet image — url / `asset:` reference. */
  image: string;
  /** Size of ONE frame in the sheet, in source pixels. */
  frameWidth: number;
  frameHeight: number;
  /** Named animations, e.g. { idle: {frames:[0]}, walk: {frames:[0,1,2,3]} } */
  animations: Record<string, SpriteSheetAnimation>;
  /** Render with crisp nearest-neighbour scaling (pixel art). */
  pixelated?: boolean;
}

/** Columns in the sheet given the loaded image's natural width. */
export function sheetCols(sheet: SpriteSheet, imageWidth: number): number {
  return Math.max(1, Math.floor(imageWidth / Math.max(1, sheet.frameWidth)));
}

/** Resolve an animation by name with graceful fallbacks. */
export function sheetAnim(
  sheet: SpriteSheet,
  name: string,
  fallbacks: string[] = []
): SpriteSheetAnimation | null {
  for (const key of [name, ...fallbacks]) {
    const anim = sheet.animations?.[key];
    if (anim && anim.frames?.length) return anim;
  }
  const first = Object.values(sheet.animations ?? {}).find((a) => a?.frames?.length);
  return first ?? null;
}

/** Which frame of `anim` is showing `elapsedSeconds` after it started. */
export function sheetFrameAt(anim: SpriteSheetAnimation, elapsedSeconds: number): number {
  const fps = anim.fps && anim.fps > 0 ? anim.fps : 8;
  const step = Math.max(0, Math.floor(elapsedSeconds * fps));
  const n = anim.frames.length;
  if (n === 0) return 0;
  const idx = anim.loop === false ? Math.min(step, n - 1) : step % n;
  return anim.frames[idx];
}

/** Grid position of a frame index. */
export function sheetFramePos(frame: number, cols: number): { col: number; row: number } {
  const f = Math.max(0, Math.floor(frame));
  return { col: f % cols, row: Math.floor(f / cols) };
}

/** Author-facing sanity check; each entry becomes a validator warning. */
export function spriteSheetIssues(sheet: SpriteSheet, label = "sprite sheet"): string[] {
  const issues: string[] = [];
  if (!sheet.image) issues.push(`${label}: no sheet image set.`);
  if (!(sheet.frameWidth > 0) || !(sheet.frameHeight > 0))
    issues.push(`${label}: frame size must be positive (got ${sheet.frameWidth}×${sheet.frameHeight}).`);
  const anims = Object.entries(sheet.animations ?? {});
  if (!anims.length) issues.push(`${label}: no animations defined — add at least "idle" or "walk".`);
  for (const [name, anim] of anims) {
    if (!anim?.frames?.length) issues.push(`${label}: animation "${name}" has no frames.`);
    else if (anim.frames.some((f) => !Number.isInteger(f) || f < 0))
      issues.push(`${label}: animation "${name}" has a negative or fractional frame index.`);
    if (anim?.fps !== undefined && !(anim.fps > 0)) issues.push(`${label}: animation "${name}" fps must be > 0.`);
  }
  if (anims.length && !anims.some(([n]) => n === "walk" || n === "idle"))
    issues.push(
      `${label}: no "walk" or "idle" animation — the stage walker looks up those names (it will fall back to "${anims[0][0]}").`
    );
  return issues;
}
