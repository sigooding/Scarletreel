import { useEffect, useRef, useState } from "react";
import type { Hotspot, StageSettings } from "../types";
import { CURSOR_ICON } from "../logic";
import {
  STAGE2D_DEFAULT_REACH,
  STAGE2D_DEFAULT_SPEED,
  clampToFloor,
  hotspotAtPoint,
  posReachesMarker,
  stageDepthScale,
  stageFloor,
  stageMarkerPoint,
  stepStagePos,
} from "../logic";
import { assetUrl } from "../assetPath";
import { audio } from "../audio";
import { SheetSprite } from "./SheetSprite";
import { sheetDrawable } from "./spriteSheet";

/**
 * Stage — the walkable layer of a STAGE node (Telltale-style exploration).
 *
 * Pure presentation + movement. The reel (flags, items, choices, beats,
 * captions) is owned by Game.tsx; this component:
 *
 *  - draws the walkable floor and walks the player character across it
 *    (click-to-walk + arrow/WASD), with perspective depth scaling;
 *  - renders every hotspot as a Telltale interaction MARKER (a reticle at
 *    the thing's feet, an icon, a label chip that fades in on approach);
 *  - renders hotspot object images (NPCs, props) anchored at the marker;
 *  - walks the character to a marker and fires it through `onInteract` —
 *    the exact same callback a clicked hotspot uses, so gating, items,
 *    showText, exits and conversations all behave.
 *
 * Coordinates are scene percentages (0–100). x is a % of plate width, y a
 * % of plate height; the y step is aspect-corrected so walk speed is
 * uniform across the plate. `active` is false while a conversation plays
 * or an overlay is open: movement stops and the markers hide.
 */

const HINT_RADIUS = 16; // scene-width % — labels fade in within this of a marker

export function Stage({
  settings,
  hotspots,
  unlocked,
  onInteract,
  active,
}: {
  settings: StageSettings;
  hotspots: Hotspot[];
  /** Whether a marker is currently usable (gate passes). */
  unlocked: (hs: Hotspot) => boolean;
  onInteract: (hs: Hotspot) => void;
  /** Movement + input only while the scene is in exploration mode. */
  active: boolean;
}) {
  const plateRef = useRef<HTMLDivElement>(null);
  const floor = stageFloor(settings);
  const spawn = clampToFloor(settings.spawn?.x ?? 50, settings.spawn?.y ?? floor.bottom - 2, floor);
  const speed = settings.speed ?? STAGE2D_DEFAULT_SPEED;
  const reach = settings.reach ?? STAGE2D_DEFAULT_REACH;
  const keyboard = settings.keyboard !== false;
  const hints = settings.hints ?? "proximity";
  const depth = settings.depthScale ?? 0.35;
  const baseScale = settings.playerScale ?? 1;

  const [pos, setPos] = useState(spawn);
  const targetRef = useRef<{ x: number; y: number; hotspotId?: string } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  // The rAF loop persists across renders, so it reads hotspots through a
  // ref — a marker consumed mid-walk (a one-shot pickup) must vanish from
  // the loop the same frame it vanishes from the plate.
  const hotspotsRef = useRef(hotspots);
  hotspotsRef.current = hotspots;
  const [facing, setFacing] = useState<1 | -1>(1);
  const [walking, setWalking] = useState(false);
  const [frameIdx, setFrameIdx] = useState(0);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const [nearId, setNearId] = useState<string | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const keysRef = useRef<Set<string>>(new Set());
  // Same story for onInteract: the loop outlives the parent's re-renders,
  // so it fires through a ref that always points at the latest callback.
  const interactRef = useRef(onInteract);
  interactRef.current = onInteract;
  const frameClock = useRef(0);
  const frameDur = Math.max(0.04, settings.walkFrameDuration ?? 0.14);
  const walkFrames = (settings.walkFrames ?? []).filter(Boolean);
  // A sprite sheet (one image, gridded frames) beats loose walkFrames when
  // it actually has a drawable animation.
  const hasSheet = sheetDrawable(settings.playerSheet);

  const aspect = () => {
    const el = plateRef.current;
    if (!el || el.clientHeight === 0) return 16 / 9;
    return el.clientWidth / el.clientHeight;
  };

  const platePoint = (e: React.PointerEvent): { x: number; y: number } => {
    const r = plateRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    };
  };

  /* --- keyboard movement --- */
  useEffect(() => {
    if (!active || !keyboard) return;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
        keysRef.current.add(k);
        // Direct steering cancels a click-to-walk target.
        targetRef.current = null;
      }
    };
    const up = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [active, keyboard]);

  /* --- movement loop --- */
  useEffect(() => {
    if (!active) {
      setWalking(false);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const a = aspect();
      const cur = posRef.current;
      let next: { x: number; y: number } = cur;
      let moved = false;
      let arrived = false;

      const ks = keysRef.current;
      const kb =
        ks.has("arrowleft") || ks.has("a") ? -1 : ks.has("arrowright") || ks.has("d") ? 1 : 0;
      const vf =
        ks.has("arrowup") || ks.has("w") ? -1 : ks.has("arrowdown") || ks.has("s") ? 1 : 0;

      if (kb !== 0 || vf !== 0) {
        // Keyboard: walk directly, normalised so diagonals aren't faster.
        const len = Math.hypot(kb, vf) || 1;
        const step = speed * dt;
        next = clampToFloor(cur.x + (kb / len) * step, cur.y + (vf / len) * step / a, floor);
        if (kb !== 0) setFacing(kb > 0 ? 1 : -1);
        moved = true;
      } else if (targetRef.current) {
        const t = targetRef.current;
        const r = stepStagePos(cur, { x: t.x, y: t.y }, speed, dt, a);
        next = clampToFloor(r.x, r.y, floor);
        if (Math.abs(t.x - cur.x) > 0.5) setFacing(t.x > cur.x ? 1 : -1);
        moved = true;
        if (r.arrived) arrived = true;
      }

      if (moved) {
        setPos(next);
        setWalking(true);
        // Cycle the walk frames while moving.
        if (walkFrames.length > 1) {
          frameClock.current += dt;
          if (frameClock.current >= frameDur) {
            frameClock.current = 0;
            setFrameIdx((i) => (i + 1) % walkFrames.length);
          }
        }
        // Fire any marker the character has walked into. Keyboard walkers
        // get interactions by stepping onto the marker; click walkers
        // usually arrive because they clicked the marker.
        for (const hs of hotspotsRef.current) {
          if (firedRef.current.has(hs.id)) continue;
          const m = stageMarkerPoint(hs, floor);
          if (posReachesMarker(next, m, reach, a)) {
            firedRef.current.add(hs.id);
            targetRef.current = null;
            arrived = true;
            audio.hover();
            interactRef.current(hs);
          }
        }
        // Which marker is "near" (for proximity labels)?
        let best: { id: string; d: number } | null = null;
        for (const hs of hotspotsRef.current) {
          const m = stageMarkerPoint(hs, floor);
          const a2 = a;
          const d = Math.hypot(next.x - m.x, (next.y - m.y) * a2);
          if (!best || d < best.d) best = { id: hs.id, d };
        }
        setNearId(best && best.d <= HINT_RADIUS ? best.id : null);
      }

      if (arrived) {
        targetRef.current = null;
        setWalking(false);
        setFrameIdx(0);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // hotspots/unlocked/onInteract are read via refs/closures that the
    // parent re-creates each render; the loop intentionally persists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, speed, reach]);

  // Reset position when a fresh scene mounts (component keyed by scene id).
  useEffect(() => {
    setPos(spawn);
    firedRef.current.clear();
    targetRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Walk toward a marker, stopping just short of it (at ~reach) so the
   *  character doesn't stand inside the thing they're interacting with. */
  const walkToMarker = (hs: Hotspot) => {
    const m = stageMarkerPoint(hs, floor);
    const a = aspect();
    const cur = posRef.current;
    const dx = cur.x - m.x;
    const dy = (cur.y - m.y) * a;
    const dist = Math.hypot(dx, dy);
    const stop = reach * 0.72;
    let tx: number;
    let ty: number;
    if (dist <= stop || dist === 0) {
      tx = cur.x;
      ty = cur.y;
    } else {
      tx = m.x + (dx / dist) * stop;
      ty = m.y + ((dy / dist) * stop) / a;
    }
    firedRef.current.clear();
    targetRef.current = { x: tx, y: ty, hotspotId: hs.id };
    setFacing(hs.bounds.x + hs.bounds.w / 2 >= cur.x ? 1 : -1);
  };

  const isEmoji = (settings.playerImage ?? "").startsWith("emoji:");
  const emoji = isEmoji ? settings.playerImage!.slice("emoji:".length) : "🕵️";
  const playerDepth = stageDepthScale(pos.y, floor, depth) * baseScale;

  const markerIcon = (hs: Hotspot) => CURSOR_ICON[hs.cursor] ?? "◆";

  return (
    <div
      ref={plateRef}
      className={`absolute inset-0 z-[45] ${active ? "cursor-pointer" : "pointer-events-none"}`}
      style={{ pointerEvents: active ? "auto" : "none" }}
      onPointerDown={(e) => {
        if (!active) return;
        const p = platePoint(e);
        const floorPoint = clampToFloor(p.x, p.y, floor);
        audio.click();
        setRipple({ x: floorPoint.x, y: floorPoint.y, key: Date.now() });
        // Clicking a zone walks to that zone's marker; empty floor walks
        // to the point. Markers themselves are buttons — this branch is
        // their fallback (and the walk-shortcut for touch users).
        const hit = hotspotAtPoint(hotspotsRef.current, p);
        if (hit) {
          walkToMarker(hit);
        } else {
          // Empty floor: just walk. The fired set persists, so brushed-past
          // markers don't re-rattle on every stroll.
          targetRef.current = { x: floorPoint.x, y: floorPoint.y };
        }
      }}
    >
      {/* the floor — two soft edge-shades so the walkable band reads without
          painting a obvious rectangle over the art */}
      <div
        className="pointer-events-none absolute inset-x-0"
        style={{ top: 0, height: `${floor.top}%`, background: "linear-gradient(to bottom, rgba(0,0,0,0.18), rgba(0,0,0,0.28))" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0"
        style={{ top: `${floor.bottom}%`, height: `${100 - floor.bottom}%`, background: "linear-gradient(to top, rgba(0,0,0,0.34), rgba(0,0,0,0.16))" }}
        aria-hidden
      />

      {/* walk target ripple */}
      {ripple && active && (
        <span
          key={ripple.key}
          className="stage2d-ripple pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neon/70"
          style={{ left: `${ripple.x}%`, top: `${ripple.y}%` }}
          onAnimationEnd={() => setRipple(null)}
        />
      )}

      {/* interaction markers — one per visible hotspot, standing where the
          thing stands. The object art (NPC / prop) and the reticle+label are
          SEPARATE plate-anchored elements so percent widths stay relative to
          the plate; both depth-sort by the marker's y. */}
      {hotspots.map((hs) => {
        const m = stageMarkerPoint(hs, floor);
        const ok = unlocked(hs);
        const near = hints === "always" || (hints === "proximity" && (nearId === hs.id || posReachesMarker(pos, m, HINT_RADIUS, aspect())));
        const z = 50 + Math.round(m.y);
        return (
          <div key={hs.id} className="contents">
            {/* the object itself (NPC / prop art), feet planted on the marker */}
            {hs.image && (
              <img
                src={assetUrl(hs.image)}
                alt=""
                draggable={false}
                className={`pointer-events-none absolute select-none object-contain object-bottom drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)] ${ok ? "" : "opacity-80 saturate-[0.7]"}`}
                style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${hs.bounds.w}%`, maxWidth: "none", transform: "translate(-50%,-100%)", zIndex: z }}
              />
            )}
            <button
              tabIndex={active ? 0 : -1}
              aria-label={`${hs.label}${ok ? "" : " (locked)"}`}
              disabled={!active}
              className={`stage-marker pointer-events-auto absolute ${ok ? "" : "stage-marker-locked"}`}
              style={{ left: `${m.x}%`, top: `${m.y}%`, zIndex: z + 1 }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (!active) return;
                audio.click();
                walkToMarker(hs);
              }}
              onClick={() => {
                // Keyboard activation (Enter on a focused marker) — the
                // pointer path is handled above; this is idempotent.
                if (active) walkToMarker(hs);
              }}
              onMouseEnter={() => active && audio.hover()}
            >
              <span className={`stage-marker-label ${near ? "stage-marker-label-on" : ""}`}>
                {markerIcon(hs)} {hs.label}
                {!ok && " 🔒"}
              </span>
              <span className="stage-marker-reticle" aria-hidden />
            </button>
          </div>
        );
      })}

      {/* the player character — outer handles position + facing (scaleX) +
          depth scale, inner handles the idle/walk bob so the transforms
          don't fight. z-index tracks the feet so the party overlaps like
          people standing in a room, not like stickers. */}
      <div
        className="pointer-events-none absolute z-[52]"
        style={{
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: `translate(-50%,-92%) scaleX(${facing}) scale(${playerDepth})`,
          zIndex: 50 + Math.round(pos.y),
        }}
      >
        <div className={walking && walkFrames.length < 2 && !hasSheet ? "stage2d-walk" : walking ? "" : "stage2d-idle"}>
          {hasSheet ? (
            <SheetSprite
              sheet={settings.playerSheet!}
              anim={walking ? "walk" : "idle"}
              fallbacks={walking ? ["idle"] : ["walk"]}
              height={96}
              freezeOnFallback={!walking}
              className="drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]"
            />
          ) : walkFrames.length > 0 ? (
            <img
              src={assetUrl(walkFrames[walking ? frameIdx % walkFrames.length : 0])}
              alt=""
              className="h-24 w-auto object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]"
              draggable={false}
            />
          ) : settings.playerImage && !isEmoji ? (
            <img
              src={assetUrl(settings.playerImage)}
              alt=""
              className="h-24 w-auto object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]"
              draggable={false}
            />
          ) : (
            <span className="block text-5xl leading-none drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]">{emoji}</span>
          )}
          {/* ground shadow (not mirrored or bobbed) */}
          <span className="mx-auto mt-1 block h-2 w-10 rounded-[100%] bg-black/40 blur-[2px]" style={{ transform: `scaleX(${facing})` }} />
        </div>
      </div>
    </div>
  );
}
