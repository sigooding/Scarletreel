import { useEffect, useRef, useState } from "react";
import type { Hotspot, Stage2DSettings } from "../types";
import {
  STAGE2D_DEFAULT_REACH,
  STAGE2D_DEFAULT_SPEED,
  clampStagePos,
  hotspotAtPoint,
  hotspotCenter,
  posReachesHotspot,
  stepStagePos,
} from "../logic";
import { assetUrl } from "../assetPath";
import { audio } from "../audio";

/**
 * Stage2D — the walkable-scene layer.
 *
 * Mounts over a scene's background plate when `scene.stage2d` is set. The
 * player clicks the ground to walk (or uses arrow/WASD keys); walking the
 * character onto a hotspot fires it through the same `onInteract`
 * callback a normal click would. It is pure presentation + movement: the
 * reel (flags, items, choices, dialogue) is owned by Game.tsx.
 *
 * Coordinates are scene percentages (0–100). x is a % of plate width, y a
 * % of plate height; the y step is aspect-corrected so movement speed is
 * uniform across the wide plate.
 */
export function Stage2D({
  settings,
  hotspots,
  unlocked,
  onInteract,
  active,
}: {
  settings: Stage2DSettings;
  hotspots: Hotspot[];
  /** Whether a hotspot is currently usable (gate passes). */
  unlocked: (hs: Hotspot) => boolean;
  onInteract: (hs: Hotspot) => void;
  /** Movement + input only when the scene is interactive. */
  active: boolean;
}) {
  const plateRef = useRef<HTMLDivElement>(null);
  const spawn: { x: number; y: number } = settings.spawn ?? { x: 50, y: 86 };
  const speed = settings.speed ?? STAGE2D_DEFAULT_SPEED;
  const reach = settings.reach ?? STAGE2D_DEFAULT_REACH;
  const keyboard = settings.keyboard !== false;

  const [pos, setPos] = useState(() => clampStagePos(spawn.x, spawn.y));
  const targetRef = useRef<{ x: number; y: number; hotspot?: Hotspot } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const [facing, setFacing] = useState<1 | -1>(1);
  const [walking, setWalking] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const keysRef = useRef<Set<string>>(new Set());

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
      let reached = false;

      const ks = keysRef.current;
      const kb =
        ks.has("arrowleft") || ks.has("a") ? -1 : ks.has("arrowright") || ks.has("d") ? 1 : 0;
      const vf =
        ks.has("arrowup") || ks.has("w") ? -1 : ks.has("arrowdown") || ks.has("s") ? 1 : 0;

      if (kb !== 0 || vf !== 0) {
        // Keyboard: walk directly, normalised so diagonals aren't faster.
        const len = Math.hypot(kb, vf) || 1;
        const step = speed * dt;
        next = clampStagePos(cur.x + (kb / len) * step, cur.y + (vf / len) * step / a);
        if (kb !== 0) setFacing(kb > 0 ? 1 : -1);
        moved = true;
      } else if (targetRef.current) {
        const t = targetRef.current;
        const r = stepStagePos(cur, { x: t.x, y: t.y }, speed, dt, a);
        next = clampStagePos(r.x, r.y);
        if (Math.abs(t.x - cur.x) > 0.5) setFacing(t.x > cur.x ? 1 : -1);
        moved = true;
        if (r.arrived) {
          reached = true;
        }
      }

      if (moved) {
        setPos(next);
        setWalking(true);
        // Fire any hotspot the character is now standing on.
        for (const hs of hotspots) {
          if (firedRef.current.has(hs.id)) continue;
          if (posReachesHotspot(next, hs, reach, a)) {
            const c = hotspotCenter(hs);
            if (unlocked(hs)) {
              firedRef.current.add(hs.id);
              targetRef.current = null;
              reached = true;
              audio.hover();
              onInteract(hs);
            } else {
              // Locked zone: walk up to it, then rattle it once (shows the
              // fail message) without spamming.
              if (Math.hypot(next.x - c.x, (next.y - c.y) * a) <= reach + 1.5) {
                firedRef.current.add(hs.id);
                targetRef.current = null;
                reached = true;
                onInteract(hs);
              }
            }
          }
        }
      }

      if (reached) {
        targetRef.current = null;
        setWalking(false);
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
    setPos(clampStagePos(spawn.x, spawn.y));
    firedRef.current.clear();
    targetRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEmoji = (settings.playerImage ?? "").startsWith("emoji:");
  const emoji = isEmoji ? settings.playerImage!.slice("emoji:".length) : "🕵️";

  return (
    <div
      ref={plateRef}
      className={`absolute inset-0 z-[45] ${active ? "cursor-pointer" : "pointer-events-none"}`}
      style={{ pointerEvents: active ? "auto" : "none" }}
      onPointerDown={(e) => {
        if (!active) return;
        const p = platePoint(e);
        const hit = hotspotAtPoint(hotspots, p);
        audio.click();
        setRipple({ x: p.x, y: p.y, key: Date.now() });
        if (hit) {
          // Walk to the zone; the rAF fires it on arrival. Allow retrying
          // a previously-used non-repeatable? No — one-shot zones stay
          // spent; repeatable ones can be re-walked.
          if (firedRef.current.has(hit.id) && !hit.isRepeatable) {
            targetRef.current = { x: p.x, y: p.y };
          } else {
            const c = hotspotCenter(hit);
            targetRef.current = { x: c.x, y: c.y, hotspot: hit };
          }
        } else {
          targetRef.current = { x: p.x, y: p.y };
        }
      }}
    >
      {/* walk target ripple */}
      {ripple && active && (
        <span
          key={ripple.key}
          className="stage2d-ripple pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neon/70"
          style={{ left: `${ripple.x}%`, top: `${ripple.y}%` }}
          onAnimationEnd={() => setRipple(null)}
        />
      )}

      {/* the character — outer handles position + facing (scaleX), inner
          handles the idle/walk bob so the two transforms don't fight. */}
      <div
        className="pointer-events-none absolute z-[46]"
        style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: `translate(-50%,-92%) scaleX(${facing})` }}
      >
        <div className={walking ? "stage2d-walk" : "stage2d-idle"}>
          {settings.playerImage && !isEmoji ? (
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
