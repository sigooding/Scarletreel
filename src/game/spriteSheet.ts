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
 *   - stage walker (optional DIRECTIONAL sprites): "walk-up" / "walk-down" /
 *     "idle-up" / "idle-down" — a walker facing away (up, back to camera) or
 *     toward (down, at the camera) uses these when present, else falls back to
 *     the side "walk"/"idle" (the classic single-sheet behaviour). Left/right
 *     is still the side sprite mirrored via scaleX, so "walk-left"/"walk-right"
 *     are deliberately NOT used.
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

/** True when the sheet has an image and at least one drawable animation —
 * the render-or-fallback test used by the stage walker, talking portraits
 * and foreground extras. */
export function sheetDrawable(sheet?: SpriteSheet | null): sheet is SpriteSheet {
  return !!(
    sheet &&
    sheet.image &&
    sheet.frameWidth > 0 &&
    sheet.frameHeight > 0 &&
    Object.values(sheet.animations ?? {}).some((a) => a?.frames?.length)
  );
}

/** Author-facing sanity check; each entry becomes a validator warning.
 * `expectedNames`: the animation names the engine looks up for THIS use of
 * the sheet (walker: walk/idle, portrait: talk/rest, extra: loop) — a sheet
 * defining none of them still renders via fallback, but gets a hint. */
export function spriteSheetIssues(sheet: SpriteSheet, label = "sprite sheet", expectedNames?: string[]): string[] {
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
  if (expectedNames?.length && anims.length && !anims.some(([n]) => expectedNames.includes(n)))
    issues.push(
      `${label}: none of the animation names the engine looks up here (${expectedNames.map((n) => `"${n}"`).join(", ")}) are defined — it will fall back to "${anims[0][0]}".`
    );
  return issues;
}
