import type { Story } from "../types";

/* ------------------------------------------------------------------ */
/*  Canvas layout helpers                                              */
/*                                                                    */
/*  Pure functions so the two things Studio does to the canvas —      */
/*  healing a broken draft layout and tidying a mess into act rows —  */
/*  are testable outside the component (see scripts/preflight.mjs).   */
/* ------------------------------------------------------------------ */

/** Merge a stored draft's layout onto the built-in floor, repairing piles.
 *
 * Two failure modes are repaired:
 *   1. MISSING positions (a draft saved before the story had a layout, or
 *      before scenes were added) — those cards stack at the origin.
 *   2. PILED positions (many scenes sharing one coordinate).
 *
 * The built-in layout is the floor; the author's own distinct drags always
 * win, so real work is never lost — only unreadable piles fall back. */
export function healLayout(
  storedLayout: Record<string, { x: number; y: number }> | undefined,
  baseLayout: Record<string, { x: number; y: number }>
): Record<string, { x: number; y: number }> {
  const merged: Record<string, { x: number; y: number }> = { ...baseLayout };
  const byPos = new Map<string, number>();
  Object.values(storedLayout ?? {}).forEach((p) => {
    const k = `${Math.round(p.x)},${Math.round(p.y)}`;
    byPos.set(k, (byPos.get(k) ?? 0) + 1);
  });
  // A coordinate claimed by four or more cards is a pile, not a composition.
  const pileKeys = new Set([...byPos.entries()].filter(([, n]) => n >= 4).map(([k]) => k));
  Object.entries(storedLayout ?? {}).forEach(([sid, p]) => {
    const k = `${Math.round(p.x)},${Math.round(p.y)}`;
    const basePos = baseLayout[sid];
    if (!pileKeys.has(k) || (basePos && basePos.x === p.x && basePos.y === p.y)) merged[sid] = p;
  });
  return merged;
}

/** Deterministic "tidy" positions: one row band per act (when the story has
 *  acts), scenes in authoring order left → right, wrapping at six per row.
 *  The fastest cure for a canvas that has become one pile of cards. */
export function tidyLayoutPositions(story: Story): Record<string, { x: number; y: number }> {
  const acts = story.acts ?? [];
  const starts = new Set(acts.map((a) => a.startSceneId));
  const groups: { label?: string; scenes: Story["scenes"] }[] = [];
  story.scenes.forEach((sc) => {
    if (starts.has(sc.id)) groups.push({ label: acts.find((a) => a.startSceneId === sc.id)?.label, scenes: [sc] });
    else if (!groups.length) groups.push({ scenes: [sc] });
    else groups[groups.length - 1].scenes.push(sc);
  });
  const PER_ROW = 6;
  const X_STEP = 340;
  const Y_STEP = 460;
  const layout: Record<string, { x: number; y: number }> = {};
  let y = 0;
  groups.forEach((g) => {
    g.scenes.forEach((sc, i) => {
      layout[sc.id] = { x: (i % PER_ROW) * X_STEP, y: y + Math.floor(i / PER_ROW) * Y_STEP };
    });
    y += Math.ceil(g.scenes.length / PER_ROW) * Y_STEP + 80;
  });
  return layout;
}
