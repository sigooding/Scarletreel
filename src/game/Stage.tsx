import { useEffect, useRef, useState } from "react";
import type { Hotspot, StageSettings } from "../types";
import { CURSOR_ICON, hotspotAnswersVerb } from "../logic";
import {
  STAGE2D_DEFAULT_REACH,
  STAGE2D_DEFAULT_SPEED,
  VERB_ICON,
  VERB_LABEL,
  clampToFloor,
  hotspotAtPoint,
  posReachesMarker,
  stageBlocked,
  stageFloor,
  stageMarkerPoint,
  stageRoute,
  stageSpeedScale,
  stageSpriteScale,
  stepStagePos,
} from "../logic";
import type { VerbId } from "../logic";
import { assetUrl } from "../assetPath";
import { audio } from "../audio";
import { SheetSprite } from "./SheetSprite";
import { sheetDrawable } from "./spriteSheet";
import { presetStyle } from "./animation";

/**
 * Stage — the walkable layer of a STAGE node (free-roam exploration).
 *
 * Pure presentation + movement. The reel (flags, items, choices, beats,
 * captions) is owned by Game.tsx; this component:
 *
 *  - draws the walkable floor and walks the player character across it
 *    (click-to-walk + arrow/WASD), with perspective depth scaling;
 *  - renders every hotspot as an interaction MARKER (a reticle at
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

/** An inventory item the USE verb can arm. */
export interface CoinItem {
  id: string;
  name: string;
  icon?: string;
}

export function Stage({
  settings,
  hotspots,
  unlocked,
  onInteract,
  active,
  verbs,
  inventory,
  onPosChange,
  dropRequest,
  cursorStyle,
  onVerbChange,
}: {
  settings: StageSettings;
  hotspots: Hotspot[];
  /** Whether a marker is currently usable (gate passes). */
  unlocked: (hs: Hotspot) => boolean;
  /** `ctx` carries the verb-coin selection: the verb (and, for USE, the
   *  armed inventory item). Undefined = the classic click-to-activate. */
  onInteract: (hs: Hotspot, ctx?: { verb?: VerbId; itemId?: string }) => void;
  /** Movement + input only while the scene is in exploration mode. */
  active: boolean;
  /** VERB COIN: the verbs this room offers. Undefined/empty = no coin, and
   *  the room behaves exactly as it always has. */
  verbs?: VerbId[];
  /** Carried inventory, listed under the coin when USE is selected. */
  inventory?: CoinItem[];
  /** The walker's feet (scene %), reported whenever they move — Game uses it
   *  to decide which foreground extras are drawn OVER the character. */
  onPosChange?: (p: { x: number; y: number }) => void;
  /** An item dropped on a scene object: walk there, then USE it. */
  dropRequest?: { hotspotId: string; itemId: string; key: number } | null;
  /** Custom cursor art for the plate (see Story.cursorArt). */
  cursorStyle?: React.CSSProperties;
  /** Reports the coin's selected verb upward — it drives the cursor art. */
  onVerbChange?: (verb: VerbId) => void;
}) {
  const plateRef = useRef<HTMLDivElement>(null);
  const floor = stageFloor(settings);
  const spawn = clampToFloor(settings.spawn?.x ?? 50, settings.spawn?.y ?? floor.bottom - 2, floor);
  const speed = settings.speed ?? STAGE2D_DEFAULT_SPEED;
  const reach = settings.reach ?? STAGE2D_DEFAULT_REACH;
  const keyboard = settings.keyboard !== false;
  const hints = settings.hints ?? "proximity";
  const baseScale = settings.playerScale ?? 1;

  const obstacles = settings.obstacles ?? [];
  const [pos, setPos] = useState(spawn);
  const targetRef = useRef<{ x: number; y: number; hotspotId?: string } | null>(null);
  /** Remaining corners of the current route — click-to-walk follows the whole
   *  polyline, not just its last point (see the arrival branch below). */
  const routeRef = useRef<{ x: number; y: number }[]>([]);
  const posRef = useRef(pos);
  posRef.current = pos;
  // Report the feet upward whenever they change — Game needs them to decide
  // which foreground extras are in FRONT of the walker (walk-behind masks).
  const posCbRef = useRef(onPosChange);
  posCbRef.current = onPosChange;
  useEffect(() => {
    posCbRef.current?.({ x: pos.x, y: pos.y });
  }, [pos.x, pos.y]);
  // The rAF loop persists across renders, so it reads hotspots through a
  // ref — a marker consumed mid-walk (a one-shot pickup) must vanish from
  // the loop the same frame it vanishes from the plate.
  const hotspotsRef = useRef(hotspots);
  hotspotsRef.current = hotspots;
  /** The walker's facing direction: horizontal (left/right) flips the sprite
   *  via scaleX; up/down use DIRECTIONAL animations when the sheet defines
   *  them ("walk-up" / "walk-down" / "idle-up" / "idle-down") and otherwise
   *  fall back to the side sprite — so existing sheets keep working unchanged. */
  type Dir = "left" | "right" | "up" | "down";
  const [dir, setDir] = useState<Dir>("right");
  /** Which way is the walker heading, given a step vector (y grows downward). */
  const dirOf = (dx: number, dy: number): Dir => {
    if (dx === 0 && dy === 0) return dir;
    return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy < 0 ? "up" : "down");
  };
  /** Resolve the sprite-sheet animation + flip for a facing, with graceful
   *  fallbacks so a sheet that only knows "walk"/"idle" still plays (side
   *  sprite, un-flipped for up/down — the classic single-sheet behaviour). */
  const dirAnim = (d: Dir, moving: boolean): { anim: string; fallbacks: string[]; flip: boolean } => {
    if (d === "up") return moving
      ? { anim: "walk-up", fallbacks: ["walk", "idle"], flip: false }
      : { anim: "idle-up", fallbacks: ["idle", "walk"], flip: false };
    if (d === "down") return moving
      ? { anim: "walk-down", fallbacks: ["walk", "idle"], flip: false }
      : { anim: "idle-down", fallbacks: ["idle", "walk"], flip: false };
    return moving
      ? { anim: "walk", fallbacks: ["idle"], flip: d === "left" }
      : { anim: "idle", fallbacks: ["walk"], flip: d === "left" };
  };
  const [walking, setWalking] = useState(false);
  const [frameIdx, setFrameIdx] = useState(0);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const [nearId, setNearId] = useState<string | null>(null);
  // VERB COIN — the selected verb and, for USE, the armed item. Both are
  // mirrored into refs because the rAF loop fires interactions.
  // `verbMode` = verbs drive the firing (either the verb-first coin OR the
  // object-first menu); `coinOn` = the bottom-left coin RAIL specifically.
  const verbMode = !!verbs && verbs.length > 0;
  const objectMenu = settings.objectVerbMenu === true;
  const coinOn = verbMode && !objectMenu;
  const [verb, setVerb] = useState<VerbId>(verbs?.[0] ?? "look");
  const [heldItem, setHeldItem] = useState<string | null>(null);
  const verbRef = useRef<VerbId>(verbs?.[0] ?? "look");
  const heldRef = useRef<string | null>(null);
  verbRef.current = verb;
  heldRef.current = heldItem;
  // OBJECT-FIRST verb menu (Full Throttle's "skull"): click an object and a
  // small pie menu of the verbs it answers pops up next to it. `menu` holds the
  // open object + its marker point; `menuUse` is the object whose USE was
  // picked and is waiting for an inventory item to arm.
  const [menu, setMenu] = useState<{ hs: Hotspot; x: number; y: number } | null>(null);
  const [menuUse, setMenuUse] = useState<Hotspot | null>(null);
  /** The verbs an object answers, for the menu (respects the room's verb list). */
  const menuVerbs = (hs: Hotspot): VerbId[] => {
    const room = verbs ?? [];
    return room.filter((v) => v === "use" ? (hs.acceptsItems?.length ? true : hotspotAnswersVerb(hs, v)) : hotspotAnswersVerb(hs, v));
  };
  /** The marker the player explicitly clicked, with the verb it was clicked
   *  with — so a coin room only fires what was aimed at, never a brushed
   *  past marker. */
  const pendingRef = useRef<{ hotspotId: string; verb: VerbId; itemId?: string } | null>(null);
  const coinRef = useRef(verbMode);
  coinRef.current = verbMode;
  // The selected verb is the cursor in a coin room — hand it to the parent so
  // its art can follow the mouse.
  const verbCbRef = useRef(onVerbChange);
  verbCbRef.current = onVerbChange;
  useEffect(() => {
    if (coinOn) verbCbRef.current?.(verb);
  }, [verb, coinOn]);
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
        // Walking away from the camera covers less SCREEN per second — the
        // sprite is smaller, so the step should be too.
        const step = speed * stageSpeedScale(cur.y, floor, settings) * dt;
        const want = { x: cur.x + (kb / len) * step, y: cur.y + (vf / len) * step / a };
        // Wall sliding: if the diagonal is blocked, take whichever single
        // axis still works, so brushing a counter skims along it instead of
        // pinning the character in place.
        if (obstacles.length && stageBlocked(want.x, want.y, obstacles, floor, a)) {
          const slideX = { x: want.x, y: cur.y };
          const slideY = { x: cur.x, y: want.y };
          if (!stageBlocked(slideX.x, slideX.y, obstacles, floor, a)) next = slideX;
          else if (!stageBlocked(slideY.x, slideY.y, obstacles, floor, a)) next = slideY;
        } else {
          next = clampToFloor(want.x, want.y, floor);
        }
        if (kb !== 0 || vf !== 0) setDir(dirOf(kb, vf));
        moved = next.x !== cur.x || next.y !== cur.y;
      } else if (targetRef.current) {
        const t = targetRef.current;
        const r = stepStagePos(cur, { x: t.x, y: t.y }, speed * stageSpeedScale(cur.y, floor, settings), dt, a);
        next = clampToFloor(r.x, r.y, floor);
        if (Math.abs(t.x - cur.x) > 0.5 || Math.abs(t.y - cur.y) > 0.5) setDir(dirOf(t.x - cur.x, t.y - cur.y));
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
          if (!posReachesMarker(next, m, reach, a)) continue;
          // A coin room is verb-first: only the marker the player actually
          // aimed at fires, and it fires with the verb they picked. Brushing
          // past the bar on the way to the door does not talk to the bar.
          const pending = pendingRef.current;
          if (coinRef.current && (!pending || pending.hotspotId !== hs.id)) continue;
          firedRef.current.add(hs.id);
          pendingRef.current = null;
          targetRef.current = null;
          arrived = true;
          audio.hover();
          interactRef.current(
            hs,
            coinRef.current ? { verb: pending?.verb ?? verbRef.current, itemId: pending?.itemId ?? heldRef.current ?? undefined } : undefined,
          );
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
        const rest = routeRef.current;
        if (rest.length) {
          // Next corner of the route.
          const nextWp = rest.shift()!;
          targetRef.current = { x: nextWp.x, y: nextWp.y };
          setWalking(true);
        } else {
          targetRef.current = null;
          setWalking(false);
          setFrameIdx(0);
        }
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // hotspots/unlocked/onInteract are read via refs/closures that the
    // parent re-creates each render; the loop intentionally persists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, speed, reach, floor.top, floor.bottom, obstacles.length, settings.depthScale, settings.playerNearScale, settings.playerFarScale]);

  // Reset position when a fresh scene mounts (component keyed by scene id).
  useEffect(() => {
    setPos(spawn);
    firedRef.current.clear();
    targetRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Follow a route: the first waypoint becomes the live target, the rest wait
   *  in `routeRef` and are picked up on arrival. */
  const followRoute = (route: { x: number; y: number }[]) => {
    if (!route.length) return false;
    routeRef.current = route.slice(1);
    targetRef.current = { x: route[0].x, y: route[0].y };
    setWalking(true);
    return true;
  };

  /** Walk toward a marker, stopping just short of it (at ~reach) so the
   *  character doesn't stand inside the thing they're interacting with.
   *  Routed around the scene's obstacles, so the counter between you and the
   *  barman is walked around rather than through. */
  const walkToMarker = (hs: Hotspot, ctx?: { verb?: VerbId; itemId?: string }) => {
    if (coinRef.current || ctx) {
      const v = ctx?.verb ?? verbRef.current;
      pendingRef.current = {
        hotspotId: hs.id,
        verb: v,
        itemId: v === "use" ? ctx?.itemId ?? heldRef.current ?? undefined : undefined,
      };
    }
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
    const route = stageRoute(cur, { x: tx, y: ty }, obstacles, floor);
    if (route.length) {
      setDir(dirOf(hs.bounds.x + hs.bounds.w / 2 - cur.x, m.y - cur.y));
      if (followRoute(route)) return;
    }
    // No route (walled off) — fall back to walking straight at it.
    targetRef.current = { x: tx, y: ty, hotspotId: hs.id };
    setDir(dirOf(hs.bounds.x + hs.bounds.w / 2 - cur.x, m.y - cur.y));
  };

  /** Object-first menu: the player picked a verb for the open object. USE on
   *  an object that accepts items first arms one from the inventory; otherwise
   *  it acts directly. Closes the menu and walks the character over. */
  const pickVerb = (hs: Hotspot, v: VerbId, itemId?: string) => {
    if (v === "use" && (hs.acceptsItems?.length ?? 0) > 0 && !itemId) {
      setMenuUse(hs);
      return;
    }
    setMenu(null);
    setMenuUse(null);
    walkToMarker(hs, { verb: v, itemId: v === "use" ? itemId : undefined });
  };

  // An item dropped on a scene object: walk over, then USE it there.
  const dropKeyRef = useRef<number | null>(null);
  useEffect(() => {
    if (!dropRequest || dropRequest.key === dropKeyRef.current) return;
    dropKeyRef.current = dropRequest.key;
    const hs = hotspotsRef.current.find((h) => h.id === dropRequest.hotspotId);
    if (!hs) return;
    walkToMarker(hs, { verb: "use", itemId: dropRequest.itemId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropRequest?.key]);

  const isEmoji = (settings.playerImage ?? "").startsWith("emoji:");
  const emoji = isEmoji ? settings.playerImage!.slice("emoji:".length) : "🕵️";
  // Perspective: big up close, small in the distance (near/far ends are
  // authorable; `depthScale` still works as "shrink by this much at the back").
  const playerDepth = stageSpriteScale(pos.y, floor, settings) * baseScale;

  const markerIcon = (hs: Hotspot) => CURSOR_ICON[hs.cursor] ?? "◆";

  return (
    <div
      ref={plateRef}
      className={`absolute inset-0 z-[45] ${active ? "cursor-pointer" : "pointer-events-none"}`}
      style={{ pointerEvents: active ? "auto" : "none", ...(cursorStyle ?? {}) }}
      onPointerDown={(e) => {
        if (!active) return;
        // Anywhere else dismisses the object-first menu.
        setMenu(null);
        setMenuUse(null);
        const p = platePoint(e);
        const floorPoint = clampToFloor(p.x, p.y, floor);
        audio.click();
        setRipple({ x: floorPoint.x, y: floorPoint.y, key: Date.now() });
        // Clicking a zone walks to that zone's marker; empty floor walks
        // to the point. Markers themselves are buttons — this branch is
        // their fallback (and the walk-shortcut for touch users).
        const hit = hotspotAtPoint(hotspotsRef.current, p);
        if (hit) {
          if (objectMenu && !coinOn) {
            const m = stageMarkerPoint(hit, floor);
            setMenu({ hs: hit, x: m.x, y: m.y });
          } else {
            walkToMarker(hit);
          }
        } else {
          // Empty floor: just walk — routed around the furniture. The fired
          // set persists, so brushed-past markers don't re-rattle on every
          // stroll.
          const route = stageRoute(posRef.current, floorPoint, obstacles, floor);
          if (route.length) {
            routeRef.current = route.slice(1);
            targetRef.current = { x: route[0].x, y: route[0].y };
            setWalking(true);
          } else {
            // Walled off (or a click outside the floor): slide as close as the
            // furniture allows rather than refusing the click outright.
            targetRef.current = { x: floorPoint.x, y: floorPoint.y };
          }
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
            {hs.image || sheetDrawable(hs.sheet) ? (
              <div
                className={`pointer-events-none absolute ${ok ? "" : "opacity-80 saturate-[0.7]"}`}
                style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${hs.bounds.w}%`, maxWidth: "none", transform: "translate(-50%,-100%)", zIndex: z }}
              >
                {(() => {
                  const preset = presetStyle(hs.anim);
                  const inner = (child: React.ReactNode) =>
                    preset.className ? (
                      <div className={preset.className} style={{ ...(preset.vars as React.CSSProperties), transformOrigin: "50% 100%" }} aria-hidden>
                        {child}
                      </div>
                    ) : (
                      child
                    );
                  if (sheetDrawable(hs.sheet))
                    return inner(
                      <div
                        style={{ width: "100%", aspectRatio: `${Math.max(1, hs.sheet.frameWidth)} / ${Math.max(1, hs.sheet.frameHeight)}` }}
                      >
                        <SheetSprite
                          sheet={hs.sheet}
                          anim="loop"
                          fallbacks={["idle", "walk"]}
                          height="100%"
                          className="drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)]"
                        />
                      </div>
                    );
                  return inner(
                    <img
                      src={assetUrl(hs.image!)}
                      alt=""
                      draggable={false}
                      className={`pointer-events-none w-full select-none object-contain object-bottom drop-shadow-[0_6px_10px_rgba(0,0,0,0.55)]`}
                    />
                  );
                })()}
              </div>
            ) : null}
            <button
              tabIndex={active ? 0 : -1}
              aria-label={`${hs.label}${ok ? "" : " (locked)"}`}
              data-hs-id={hs.id}
              disabled={!active}
              className={`stage-marker pointer-events-auto absolute ${ok ? "" : "stage-marker-locked"}`}
              style={{ left: `${m.x}%`, top: `${m.y}%`, zIndex: z + 1 }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (!active) return;
                audio.click();
                if (objectMenu && !coinOn) {
                  // OBJECT-FIRST: click the object → a pie menu of its verbs
                  // pops up next to it (Full Throttle's "skull").
                  setMenu({ hs, x: m.x, y: m.y });
                  setMenuUse(null);
                } else {
                  walkToMarker(hs);
                }
              }}
              onClick={() => {
                // Keyboard activation (Enter on a focused marker) — the
                // pointer path is handled above; this is idempotent.
                if (active && !(objectMenu && !coinOn)) walkToMarker(hs);
              }}
              onMouseEnter={() => active && audio.hover()}
            >
              <span className={`stage-marker-label ${near ? "stage-marker-label-on" : ""}`}>
                {coinOn ? VERB_ICON[verb] : markerIcon(hs)} {hs.label}
                {verb === "use" && heldItem ? ` ← ${inventory?.find((i) => i.id === heldItem)?.name ?? ""}` : ""}
                {!ok && " 🔒"}
              </span>
              <span className="stage-marker-reticle" aria-hidden />
            </button>
          </div>
        );
      })}

      {/* OBJECT-FIRST VERB MENU — a small pie of the verbs THIS object
          answers, popped up at the object (Full Throttle's "skull"). USE
          expands to the inventory when the object accepts items. */}
      {objectMenu && menu && active ? (
        <div
          className="pointer-events-auto absolute z-[78] -translate-x-1/2"
          style={{ left: `${menu.x}%`, top: `${Math.max(8, menu.y - 8)}%`, transform: "translate(-50%,-100%)" }}
        >
          <div className="flex flex-col items-center gap-1.5 rounded border border-noir-700 bg-noir-950/92 p-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.6)] backdrop-blur-sm">
            <span className="max-w-[160px] truncate px-1 font-pulp text-[8px] uppercase tracking-widest text-paper/50">{menu.hs.label}</span>
            <div className="flex flex-wrap justify-center gap-1">
              {menuVerbs(menu.hs).map((v) => (
                <button
                  key={v}
                  aria-label={VERB_LABEL[v]}
                  className="flex min-w-[40px] flex-col items-center rounded border px-1.5 py-1 font-pulp text-[9px] uppercase tracking-wide transition-colors border-noir-700 bg-noir-900/85 text-paper/80 hover:border-gold hover:text-gold"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    audio.click();
                    pickVerb(menu.hs, v);
                  }}
                >
                  <span className="text-sm leading-none" aria-hidden>{VERB_ICON[v]}</span>
                  {v}
                </button>
              ))}
            </div>
            {menuUse && menuUse.id === menu.hs.id ? (
              <div className="flex max-w-[200px] flex-wrap justify-center gap-1 border-t border-noir-700 pt-1">
                {((inventory ?? []).length
                  ? inventory!
                  : []).map((it) => (
                    <button
                      key={it.id}
                      className="flex items-center gap-1 rounded border border-noir-700 bg-noir-900/85 px-1.5 py-1 font-type text-[10px] text-paper/80 hover:border-gold hover:text-gold"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        audio.click();
                        pickVerb(menu.hs, "use", it.id);
                      }}
                    >
                      <span aria-hidden>{it.icon ?? "📦"}</span> {it.name}
                    </button>
                  ))}
                {(inventory ?? []).length === 0 ? (
                  <span className="px-1 font-type text-[9px] italic text-paper/40">Nothing to use here — nothing in your pockets.</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* VERB COIN — bottom-left, the way a LucasArts room puts it. Pick a
          verb, then click the object; USE arms an inventory item first. */}
      {coinOn && active ? (
        <div className="pointer-events-auto absolute bottom-3 left-3 z-[76] flex flex-col items-start gap-1.5">
          {verb === "use" && (inventory?.length ?? 0) > 0 ? (
            <div className="flex max-w-[min(70vw,640px)] flex-wrap gap-1 rounded border border-noir-700 bg-noir-950/90 p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.5)] backdrop-blur-sm">
              <span className="self-center px-1 font-pulp text-[9px] uppercase tracking-[0.2em] text-gold/70">Use</span>
              {inventory!.map((it) => {
                const on = heldItem === it.id;
                return (
                  <button
                    key={it.id}
                    aria-label={`Use ${it.name}`}
                    aria-pressed={on}
                    className={`flex items-center gap-1 rounded border px-2 py-1 font-type text-[11px] transition-colors ${
                      on
                        ? "border-gold bg-gold/20 text-gold"
                        : "border-noir-700 bg-noir-900/80 text-paper/80 hover:border-gold/60 hover:text-gold"
                    }`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      audio.click();
                      setHeldItem(on ? null : it.id);
                    }}
                  >
                    <span aria-hidden>{it.icon ?? "📦"}</span> {it.name}
                  </button>
                );
              })}
              <span className="self-center px-1 font-type text-[10px] italic text-paper/45">
                …then click what you want to use it on
              </span>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1 rounded border border-noir-700 bg-noir-950/90 p-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.5)] backdrop-blur-sm">
            {verbs!.map((v) => {
              const on = verb === v;
              return (
                <button
                  key={v}
                  aria-label={VERB_LABEL[v]}
                  aria-pressed={on}
                  className={`flex min-w-[64px] flex-col items-center rounded border px-2 py-1 font-pulp text-[10px] uppercase tracking-[0.15em] transition-colors ${
                    on
                      ? "border-gold bg-gold/20 text-gold"
                      : "border-noir-700 bg-noir-900/80 text-paper/70 hover:border-gold/60 hover:text-gold"
                  }`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    audio.click();
                    setVerb(v);
                    if (v !== "use") setHeldItem(null);
                  }}
                >
                  <span className="text-base leading-none" aria-hidden>
                    {VERB_ICON[v]}
                  </span>
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* the player character — outer handles position + facing (scaleX for
          left/right, directional anims for up/down) + depth scale, inner
          handles the idle/walk bob so the transforms don't fight. z-index
          tracks the feet so the party overlaps like people standing in a
          room, not like stickers. */}
      {(() => {
        const da = dirAnim(dir, walking);
        const flip = da.flip ? -1 : 1;
        return (
          <div
            className="pointer-events-none absolute z-[52]"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: `translate(-50%,-92%) scaleX(${flip}) scale(${playerDepth})`,
              zIndex: 50 + Math.round(pos.y),
            }}
          >
            <div className={walking && walkFrames.length < 2 && !hasSheet ? "stage2d-walk" : walking ? "" : "stage2d-idle"}>
              {hasSheet ? (
                <SheetSprite
                  sheet={settings.playerSheet!}
                  anim={da.anim}
                  fallbacks={da.fallbacks}
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
              <span className="mx-auto mt-1 block h-2 w-10 rounded-[100%] bg-black/40 blur-[2px]" style={{ transform: `scaleX(${flip})` }} />
            </div>
          </div>
        );
      })()}
    </div>
  );
}
