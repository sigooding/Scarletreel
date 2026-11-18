import { useCallback, useEffect, useRef, useState } from "react";
import type { GlobalState, Item } from "../types";
import type { ResolvedInventory } from "../logic";
import { assetUrl } from "../assetPath";
import { audio } from "../audio";
import { SheetSprite } from "./SheetSprite";
import { sheetDrawable } from "./spriteSheet";

/**
 * InventoryDock — what the player is carrying, however the case wants it shown.
 *
 * One component, three presentations (`mode`):
 *
 *  · **classic** (default) — the plain chip rail every case already has. A
 *    case that never touches `inventoryDisplay` looks exactly as it did.
 *  · **container** — a POUCH / CASE / SADDLEBAG sprite that pops open with the
 *    items laid out INSIDE it. `image` is any transparent cutout (a bag, a
 *    briefcase, a tool roll); the items sit in its middle, inset by `inset`%.
 *    With no art supplied it draws a stitched leather panel in house style, so
 *    the mode never looks half-built. Authors bring their own art per game.
 *  · **hidden** — no dock at all; the case manages items off-screen.
 *
 * Dragging: an item can be dragged onto a SCENE OBJECT to USE it there (the
 * point-and-click gesture), or onto ANOTHER ITEM to combine the two. Both go
 * through pointer events, so a touch screen works the same as a mouse; a
 * movement threshold keeps click-to-inspect working.
 */

export interface DragItem {
  item: Item;
  x: number;
  y: number;
  over: string | null;
}

/** What's under the cursor. `elementFromPoint` where layout exists, with a
 *  bounding-box sweep as the fallback (headless test DOMs, and any browser
 *  where the point lands on a transformed layer). */
function hitTest(x: number, y: number): HTMLElement | null {
  let el: HTMLElement | null = null;
  try {
    el = (document.elementFromPoint?.(x, y) as HTMLElement | null) ?? null;
  } catch {
    el = null;
  }
  if (el) return el;
  for (const node of Array.from(document.querySelectorAll("[data-hs-id], [data-item-id]")) as HTMLElement[]) {
    const r = node.getBoundingClientRect();
    if (r.width && r.height && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return node;
  }
  return null;
}

export function InventoryDock({
  state,
  display,
  onInspect,
  onCombine,
  onExplainCrafting,
  hasCrafting,
  onUseItem,
}: {
  state: GlobalState;
  display: ResolvedInventory;
  onInspect: (item: Item) => void;
  onCombine: (a: Item, b: Item) => void;
  onExplainCrafting: () => void;
  hasCrafting: boolean;
  /** Dropped an item onto a scene object (by its `data-hs-id`) — USE it there. */
  onUseItem?: (item: Item, hotspotId: string) => void;
}) {
  const [open, setOpen] = useState(!display.startClosed);
  const [flash, setFlash] = useState<string | null>(null);
  const [combineMode, setCombineMode] = useState(false);
  const [combineSel, setCombineSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragItem | null>(null);
  const dragRef = useRef<{ item: Item; startX: number; startY: number; active: boolean } | null>(null);
  // Right-click an item to pop a small verb
  // menu at the cursor (inspect / use-on / combine), and right-click the dock
  // to open or close it. `useOn` is the "use this on…" targeting mode.
  const [ctxMenu, setCtxMenu] = useState<{ item: Item; x: number; y: number } | null>(null);
  const [useOn, setUseOn] = useState<Item | null>(null);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 900);
    return () => clearTimeout(t);
  }, [flash]);

  /* ---- close the right-click menu on outside clicks / blur / Escape ---- */
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  /* ---- "use on…" targeting: the NEXT click resolves the action ---- */
  useEffect(() => {
    if (!useOn) return;
    const resolve = (e: PointerEvent) => {
      const el = hitTest(e.clientX, e.clientY);
      const hotspotId = el?.closest?.("[data-hs-id]")?.getAttribute("data-hs-id") ?? null;
      if (hotspotId && onUseItem) {
        audio.pickup();
        onUseItem(useOn, hotspotId);
        setUseOn(null);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const otherId = el?.closest?.("[data-item-id]")?.getAttribute("data-item-id") ?? null;
      if (otherId && otherId !== useOn.id) {
        const b = state.inventory.find((i) => i.id === otherId);
        if (b) {
          setFlash(b.id);
          setCombineSel(null);
          onCombine(useOn, b);
          setUseOn(null);
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
      // Clicked nothing that accepts the item — drop out of targeting.
      audio.fail();
      setUseOn(null);
    };
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUseOn(null);
    };
    window.addEventListener("pointerdown", resolve, true);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("pointerdown", resolve, true);
      window.removeEventListener("keydown", cancel);
    };
  }, [useOn, onCombine, onUseItem, state.inventory]);

  /* ---- pointer drag: onto an object (USE) or onto another item (combine) -- */
  const finishDrag = useCallback(
    (clientX: number, clientY: number) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || !d.active) return;
      const el = hitTest(clientX, clientY);
      // A scene object (hotspot zone button, or a 🚶 stage marker)…]
      const target = el?.closest?.("[data-hs-id]") as HTMLElement | null;
      const hotspotId = target?.getAttribute("data-hs-id") ?? null;
      if (hotspotId && onUseItem) {
        audio.pickup();
        onUseItem(d.item, hotspotId);
        return;
      }
      // …or another item in the dock: combine the two.
      const other = el?.closest?.("[data-item-id]") as HTMLElement | null;
      const otherId = other?.getAttribute("data-item-id") ?? null;
      if (otherId && otherId !== d.item.id) {
        const b = state.inventory.find((i) => i.id === otherId);
        if (b) {
          setFlash(b.id);
          setCombineSel(null);
          onCombine(d.item, b);
        }
      }
    },
    [onCombine, onUseItem, state.inventory]
  );

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.active && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 6) d.active = true;
      if (!d.active) return;
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const over = el?.closest?.("[data-hs-id]")?.getAttribute("data-hs-id") ?? null;
      setDrag({ item: d.item, x: e.clientX, y: e.clientY, over });
    };
    const up = (e: PointerEvent) => finishDrag(e.clientX, e.clientY);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, finishDrag]);

  const startDrag = (item: Item, e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragRef.current = { item, startX: e.clientX, startY: e.clientY, active: false };
    setDrag({ item, x: e.clientX, y: e.clientY, over: null });
  };

  if (display.mode === "hidden") return null;

  const isContainer = display.mode === "container";
  const heading = (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
      <button
        onClick={() => {
          audio.click();
          setOpen((o) => !o);
        }}
        onContextMenu={(e) => {
          // The skull verb menu opens with a right-click.
          e.preventDefault();
          audio.click();
          setOpen((o) => !o);
        }}
        className="hud-btn px-3 py-1.5"
        data-active={open || undefined}
        aria-expanded={open}
        title="Right-click to open or close"
      >
        {isContainer ? "🎒" : "🧳"} {display.label} {state.inventory.length} {open ? "▾" : "▸"}
      </button>
      {hasCrafting && (
        <>
          <button
            onClick={() => {
              audio.click();
              setCombineMode((m) => !m);
              setCombineSel(null);
            }}
            data-color={!combineMode ? "neon" : undefined}
            data-active={combineMode || undefined}
            className="hud-btn px-2 py-1.5"
            title="Tap one item, then another, to combine them — no dragging needed"
          >
            🔧 {combineMode ? "Tapping" : "Combine"}
          </button>
          <button
            onClick={() => {
              audio.click();
              onExplainCrafting();
            }}
            data-color="cyan"
            className="hud-btn px-2 py-1.5"
            title="Show the recipe available in this story"
          >
            ? Recipes
          </button>
        </>
      )}
    </div>
  );

  const itemChip = (item: Item) => (
    <button
      key={item.id}
      data-item-id={item.id}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/item", item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const otherId = e.dataTransfer.getData("text/item");
        const other = state.inventory.find((i) => i.id === otherId);
        if (other && other.id !== item.id) {
          setFlash(item.id);
          setCombineSel(null);
          onCombine(other, item);
        }
      }}
      onPointerDown={(e) => startDrag(item, e)}
      onContextMenu={(e) => {
        e.preventDefault();
        audio.click();
        setCtxMenu({ item, x: e.clientX, y: e.clientY });
      }}
      onClick={() => {
        if (dragRef.current?.active) return; // that was a drag, not a click
        if (combineMode) {
          audio.click();
          if (!combineSel) setCombineSel(item.id);
          else if (combineSel === item.id) setCombineSel(null);
          else {
            const first = state.inventory.find((i) => i.id === combineSel);
            setCombineSel(null);
            if (first) {
              setFlash(item.id);
              onCombine(first, item);
            }
          }
          return;
        }
        audio.click();
        onInspect(item);
      }}
      title={`${item.name} — ${combineMode ? "combine mode: tap two items" : "click to inspect · drag onto an object to use it, or onto another item to combine · right-click for the verb menu"}`}
      className={`relative flex items-center justify-center border-2 text-2xl transition-transform hover:scale-110 ${
        item.isClue ? "border-crimson/60 bg-crimson/10" : "border-paper/30 bg-noir-700"
      } ${flash === item.id ? "combine-flash" : ""} ${
        combineMode && combineSel === item.id ? "ring-2 ring-gold shadow-[0_0_14px_rgba(232,178,60,0.6)]" : ""
      } ${isContainer ? "h-11 w-11 text-xl" : "h-14 w-14"} ${
        drag?.item.id === item.id ? "opacity-40" : ""
      }`}
      style={{ touchAction: "none" }}
    >
      {item.iconUrl ? (
        <img src={assetUrl(item.iconUrl)} alt={item.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        item.icon
      )}
      {item.isClue && <span className="absolute -right-1 -top-1 text-[9px]">📌</span>}
    </button>
  );

  return (
    <>
      {/* z-[60]: the dock must clear the walk-behind foreground pass in
          Game.tsx, which paints scenery at z-[58]. At the old z-50 a
          foreground prop rendered straight over the inventory. */}
      <div className={`absolute z-[60] flex flex-col ${anchorClass(display.anchor)}`} data-inventory={display.mode}>
        {heading}
        {combineMode && open && state.inventory.length > 0 && (
          <div className="mb-1.5 border border-gold/30 bg-gold/10 px-2 py-1 font-type text-[10px] text-gold">
            Tap the first item, then tap the second to combine.
          </div>
        )}
        {open && state.inventory.length > 0 ? (
          isContainer ? (
            /* ---- container: the sprite, with the loot laid out inside ---- */
            <div
              className="inv-container relative select-none"
              style={{ height: display.height, width: Math.round(display.height * 1.15) }}
            >
              {sheetDrawable(display.sheet) ? (
                <SheetSprite sheet={display.sheet!} anim="loop" fallbacks={["idle"]} height="100%" className="absolute inset-0 h-full w-full object-contain" />
              ) : (
                <img
                  src={assetUrl(display.image)}
                  alt=""
                  aria-hidden
                  draggable={false}
                  className="pointer-events-none absolute inset-0 h-full w-full object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,0.6)]"
                />
              )}
              {/* the items sit in the pouch — inset keeps them off the strap */}
              <div
                className="absolute grid place-content-center gap-1.5"
                style={{
                  left: `${display.inset}%`,
                  right: `${display.inset}%`,
                  top: `${display.inset}%`,
                  bottom: `${display.inset}%`,
                  gridTemplateColumns: `repeat(${display.columns}, minmax(0, 1fr))`,
                }}
              >
                {state.inventory.map((item) => itemChip(item))}
              </div>
            </div>
          ) : (
            <div className="hud-frame slide-up flex max-w-md flex-wrap gap-2 p-2">{state.inventory.map((item) => itemChip(item))}</div>
          )
        ) : null}
      </div>

      {/* the thing in your hand — follows the cursor while dragging */}
      {drag && drag.item ? (
        <div
          data-drag-ghost={drag.item.id}
          className="pointer-events-none fixed z-[90] flex h-12 w-12 items-center justify-center border-2 border-gold bg-noir-900/90 text-2xl shadow-[0_0_18px_rgba(232,178,60,0.5)]"
          style={{ left: drag.x - 24, top: drag.y - 24 }}
          aria-hidden
        >
          {drag.item.iconUrl ? <img src={assetUrl(drag.item.iconUrl)} alt="" className="h-full w-full object-cover" /> : drag.item.icon}
          {drag.over ? <span className="absolute -bottom-5 whitespace-nowrap font-pulp text-[8px] uppercase tracking-widest text-gold">use on it</span> : null}
        </div>
      ) : null}

      {/* Right-click verb menu — pops at the cursor. */}
      {ctxMenu && (
        <div
          className="fixed z-[95] w-44 overflow-hidden rounded border border-gold/40 bg-noir-900/95 shadow-[0_10px_30px_rgba(0,0,0,0.7)] backdrop-blur"
          style={{
            left: Math.max(4, Math.min(ctxMenu.x, window.innerWidth - 190)),
            top: Math.max(4, Math.min(ctxMenu.y, window.innerHeight - 150)),
          }}
          onPointerDown={(e) => e.stopPropagation()}
          role="menu"
        >
          <div className="truncate border-b border-paper/15 px-3 py-1.5 font-pulp text-[9px] uppercase tracking-widest text-paper/60">
            {ctxMenu.item.icon} {ctxMenu.item.name}
          </div>
          <button
            role="menuitem"
            className="hud-menu-item flex w-full items-center gap-2 px-3 py-2 text-left"
            onClick={() => {
              audio.click();
              onInspect(ctxMenu.item);
              setCtxMenu(null);
            }}
          >
            <span>🔍</span> Inspect
          </button>
          <button
            role="menuitem"
            className="hud-menu-item flex w-full items-center gap-2 px-3 py-2 text-left"
            onClick={() => {
              audio.click();
              setUseOn(ctxMenu.item);
              setCtxMenu(null);
            }}
          >
            <span>✋</span> Use on…
          </button>
          {hasCrafting && (
            <button
              role="menuitem"
              className="hud-menu-item flex w-full items-center gap-2 px-3 py-2 text-left"
              onClick={() => {
                audio.click();
                setCombineMode(true);
                setCombineSel(ctxMenu.item.id);
                setCtxMenu(null);
              }}
            >
              <span>🔗</span> Combine…
            </button>
          )}
        </div>
      )}

      {/* "Use on…" targeting hint — the next click resolves the action. */}
      {useOn && (
        <div className="fixed left-1/2 top-3 z-[95] -translate-x-1/2 whitespace-nowrap rounded border border-gold/50 bg-noir-900/95 px-4 py-2 font-pulp text-[10px] uppercase tracking-widest text-gold shadow-[0_8px_20px_rgba(0,0,0,0.6)]">
          {useOn.icon} Use {useOn.name} on… <span className="text-paper/50">(Esc to cancel)</span>
        </div>
      )}
    </>
  );
}

function anchorClass(anchor: ResolvedInventory["anchor"]): string {
  switch (anchor) {
    case "bottom-right":
      return "bottom-3 right-3 items-end";
    case "top-left":
      return "top-3 left-3 items-start";
    case "top-right":
      return "top-3 right-3 items-end";
    default:
      return "bottom-3 left-3 items-start";
  }
}
