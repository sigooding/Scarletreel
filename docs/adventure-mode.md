# Adventure mode — point-and-click rooms

> One engine, three kinds of game. A case declares its kind with
> `story.gameKind`: `"noir-rail"` (the house style: prose + choice rail),
> `"adventure"` (walkable rooms, verb cursors, inventory puzzles), or `"vn"`
> (visual novel). Today the switch is a **declaration plus tooling defaults** —
> the interaction models share one engine, so an adventure case still plays
> prose beats the moment a conversation starts. That is deliberate: the mode
> switch should not fork the codebase, it should change what a NEW scene looks
> like and which tools Studio puts in front of you.

## Turning it on

Toolbar (next to the title field): **🕵 Noir Rail · 🚶 Adventure · 🎭 Visual Novel**.

* **Adventure** — every new scene comes out as a 🚶 walkable **stage** node
  (keyboard on, floor band, spawn, proximity hints) instead of a prose plate,
  and Studio's status line tells you the recipe for a room.
* **Noir Rail** — unchanged: prose, beats, a choice rail.
* **Visual Novel** — reserved; build around portraits and dialogue beats for
  now (the pieces are all there, no dedicated tooling yet).

`src/data/throttleAsh.ts` (**Throttle & Ash — The Long Way Down**) is the
reference case: `gameKind: "adventure"`, five rooms, three endings.

## The anatomy of a room

| Piece | Where | What it does |
| --- | --- | --- |
| Plate | `scene.background` | one painted room; the camera never moves |
| Floor band | `stage.floor {top, bottom}` | the strip the walker may stand on |
| Spawn | `stage.spawn {x, y}` | where you enter |
| Furniture | `stage.obstacles [{x,y,w,h}]` | **new** — no-go rectangles the walker routes around, drawn and dragged on the plate (🚧 Barriers) |
| Walker | `stage.playerSheet` | sprite sheet with `idle`/`walk` animations |
| Objects | `scene.hotspots[]` | clickable things, each with a verb cursor |
| NPCs | hotspot → `startDialogue` | walks to them, then the conversation plays |
| Ambience | `cinematic.foregroundExtras[]` | animated props (flickering neon, a gull) — and, with `occludes`, walk-behind masks |

### The verb coin (pick the verb, then the object)

Turn it on per room: `stage.verbCoin: true` (Studio: 🎛 **Verb coin** in the
Walkable Stage panel). The coin sits bottom-left; the player picks a verb —
👁 look · ✋ take · 💬 talk · ⚙ use · ➜ go — then clicks the object. Rooms
without the coin behave exactly as they always did.

**Two extra body-verbs — 👢 kick · 👊 punch — are opt-in.** A room that wants
them (a biker game, a melee-heavy point-and-click) sets `stage.extendedVerbs:
true` (Studio: the **👢 Kick · 👊 Punch** toggle). Off (the default), the coin
stays the classic five regardless of what the hotspots answer, so a visual
novel or a classic case never sees them. Listing them explicitly in
`stage.verbs` also works. Hotspots answer them like any other verb: `cursor:
"kick"` sets the default and the marker icon, and `verbs: { kick: … }` adds
per-verb flavour. `src/data/fullThrottle.ts` is the reference case.

### Object-first verb menu (Full Throttle's "skull")

Opt-in per room: `stage.objectVerbMenu: true` (Studio: 💀 **Object-first verb
menu** on the 🎛 Verb-coin panel). Instead of the bottom-left coin (pick a verb,
then click), the player **clicks the object first** and a small pie-style menu
of the verbs *that object* answers pops up next to it — Full Throttle's
flaming-skull gesture. USE expands to the inventory when the object accepts
items. Off (default) the coin and the classic click-to-activate flow are
unchanged. `fullThrottle.ts` turns it on for every room.

### The protagonist, defined once

A story can set its walker **story-wide** via `story.playerSprite` (Studio:
🎮 In-game theme → 🚶 **Player character**): an `image` (emoji / url) and/or a
`sprite sheet`. Every 🚶 stage scene uses it as the default; a scene that sets
its own `stage.playerSheet` / `playerImage` overrides it. Purely additive —
stories that never set it behave exactly as before. `fullThrottle.ts` defines
Ben here (a four-frame walk sheet sliced from a magenta plate by
`scripts/make-sprite-sheet.mjs`), so he's set once for the whole case.

**USE arms an item:** pick ⚙ use and the satchel opens in a rail above the
coin; click an item to arm it, then click what you want to use it on.

One object now answers several verbs (`Hotspot.verbs`) instead of needing one
overlapping hotspot per verb:

```ts
{
  id: "advh_fix_bike",
  label: "the bike",
  cursor: "use",                       // the default (and what plays coin-off)
  gating: { requiresItems: ["adv_repair_kit"] },
  acceptsItems: ["adv_repair_kit"],    // USE + this item works…
  itemResponses: { adv_repair_kit: "Two feet of rubber, one bent wrench…" },
  verbs: {                             // …and this is what it says otherwise
    look: { type: "showText", text: "Cut line, dry tank…" },
    talk: { type: "showText", text: "You tell her to start. She does not start." },
  },
  action: { type: "useItem", itemConsumed: "adv_repair_kit", flagSet: "adv_bike_fixed" },
}
```

Rules the engine enforces (`resolveVerbAction` in `src/logic.ts`):

| Situation | Result |
| --- | --- |
| verb = the hotspot's own cursor, no `verbs` entry | the hotspot's `action` |
| verb has a `verbs` entry | that action |
| USE + an item in `acceptsItems` | `verbs.use` ?? `action`, with `itemResponses[item]` as the line |
| USE + any other item | refused |
| anything else | refused |

Refusals read from `Hotspot.wrongVerbText` → `Story.verbResponses[verb]` → the
house lines, varied so a repeated failure doesn't loop. Verb actions are
**flavour and repeatable** — looking at a thing never uses it up; only an
action that takes something (`giveItem`) or moves the player (`goToScene`)
consumes its marker. In a coin room only the marker you actually clicked
fires, so brushing past the bar on the way to the door doesn't talk to the bar.

Authoring (Studio): 🎛 **Verb coin** + verb chips on the Walkable Stage
panel; 🎚 **Verb coin — other verbs** and 🎒 **Accepts these items (USE)**
(with the per-item reply line) on each hotspot; 🎛 **Verb coin — refusal
lines** on the 🏷 Flags tab for the story-wide defaults.

Because `hotspot.image` (and the new `hotspot.sheet` + `hotspot.anim`) put real
art on a hotspot, the bike you fix is *drawn in the room* rather than described
in prose, and the Roadhouse sign really flickers
(`anim: { preset: "flicker", speed: 1.1, intensity: 0.85 }`).

### Placing the character

Hotspots tab → **🚶 Player start**. Click (or drag) anywhere on the plate and
the walker stands there — clamped onto the walkable floor band, so you can't
drop them in the sky. The marker draws the actual character (sprite sheet,
image, or 🚶) and stays visible, ghosted, while you place hotspots and barriers
around them. `stage.spawn` is the same value, so the numeric fields still work.

### Cursors — art per verb

Because in a point-and-click **the verb is the cursor**, the cursor is authorable
per case (`Story.cursorArt`, edited on the 🎮 **In-game theme** tab, previewed at
real size in your own theme over a scrap of plate):

```ts
cursorArt: {
  default: { image: "/assets/ui/cursor-hand.png", size: 34 },  // plain arrow
  look:    { image: "/assets/ui/cursor-eye.png",  size: 30 },
  take:    { image: "/assets/ui/cursor-hand.png" },
  use:     { sheet: HAND_TAP, size: 40, anchor: "center" },     // animated!
}
```

* **Static art** (`image`) becomes a real CSS cursor — keep it ≤128px.
* **Sprite sheet** (`sheet`) is drawn as a small looping sprite that tracks the
  mouse: a reaching hand, a turning key, a blinking eye. No size limit.
* `anchor` sets the pixel that clicks: `top-left` (pointing) or `center`
  (reticle). `default` covers every verb you don't give its own art, and **no art
  at all means the game keeps its system cursors** — nothing changes unless you
  opt in. In a coin room the selected verb drives the cursor.

### Perspective — big up close, small in the distance

The walker is scaled by where they stand in the floor band, and their *step*
scales with them (walking into the distance covers less screen per second,
otherwise it reads as skating).

```ts
stage: {
  floor: { top: 66, bottom: 95 },
  playerNearScale: 1.15,   // sprite scale at the FRONT of the band
  playerFarScale: 0.62,    // …and at the back (default 1 - depthScale)
}
```

`depthScale: 0.35` still works exactly as before — it just means "shrink to
0.65 at the back". Set either end explicitly for a stronger room.

### Directional sprites — walk away / walk towards

By default the walker uses one side-on sprite sheet (or image) and simply
flips it left/right. But a sheet can also carry **directional** animations for
facing *away* (up, back to camera) and *towards* (down, at the camera), named
by convention:

```
walk      idle        ← side (left/right, mirrored via scaleX)
walk-up   idle-up     ← facing AWAY (back to camera)
walk-down idle-down   ← facing TOWARDS (at the camera)
```

The engine looks up `walk-up`/`walk-down`/`idle-up`/`idle-down` and falls back
to the side `walk`/`idle` when they're absent, so a sheet with only `walk` and
`idle` keeps behaving exactly as it always did. In Studio, the 🎞 **Sprite-sheet
walker** panel shows a live **directional preview** (⬆ away / ⬇ toward / ⬅
left / ➡ right) so you can check all four facings before you play, and the
room's floor preview now draws the *actual* walker at the spawn point instead
of a stand-in emoji.

### Walk-behind masks — the foreground art IS the mask

You do **not** need a separate mask asset. Any foreground extra in a 🚶 room
can be turned into an occluder:

```ts
cinematic: {
  foregroundExtras: [
    {
      image: "/assets/sprites/adv-truck.png",
      x: 52, y: 84, scale: 0.3, anchor: "50% 100%",
      occludes: true,        // draw this OVER the walker when they're behind it
      occludeBaseline: 84,   // the invisible depth line (default: the extra's y)
    },
  ],
},
```

While the walker's feet are **above** the baseline (further from the camera)
the cutout is drawn over them — they vanish behind the truck, the counter, the
pillar. Step below the line and they're in front of it again. The cutout's own
alpha does the hiding, so antialiased edges and gaps (under the chassis,
between chair legs) are respected for free. The switch is one `useMemo`: the
occluder is drawn in a pass above the stage (`z-58`) while it's in front, and
skipped from the normal extras pass — so it is never drawn twice.

Pair it with a 🚧 barrier of the same footprint so they can't walk *through* it
either (see the parked truck in `adv_street`).

### Inventory — the pouch, and drag-and-drop

How the inventory LOOKS is a per-case choice, so a point-and-click can carry a
leather pouch while every other game keeps the dock it has today:

```ts
inventoryDisplay: {
  mode: "container",   // "classic" (default, unchanged) | "container" | "hidden"
  label: "Saddlebags",
  image: "/assets/ui/inventory-case.png",  // any transparent cutout — yours
  anchor: "bottom-left", columns: 3, inset: 20, height: 220,
}
```

* **classic** — the chip rail, exactly as before. Default: no case changes.
* **container** — a pouch / case / saddlebag sprite that **pops open with the
  items laid out inside it**. `image` is any transparent cutout (a bag, a
  briefcase, a tool roll, a freezer bag) — `inset` keeps the icons off the
  strap. Without art you get a stitched leather panel in the house style, so the
  mode never looks half-built. `sheet` gives it an animated sprite instead.
* **hidden** — no on-screen dock at all.

**Drag and drop:** drag an item **onto a scene object** to USE it there (the
prototype: drag the repair kit onto the bike). In a 🚶 room the walker walks over
first and *then* uses it — the splice happens at the bike, not across the road.
Drag one item **onto another** to combine them. Both work with a mouse or a
finger (pointer events, not HTML5 drag), and a movement threshold keeps
click-to-inspect working. Objects that don't accept the item answer with the
story's refusal line, so a wrong guess is a joke rather than a dead end.

### The inventory puzzle

1. ✋ take the **wrench** (street) and the **fuel line** (garage, gated on
   `adv_met_dell` + holding the wrench).
2. Combine them in the satchel → **repair kit**
   (`Item.combinableWith { targetItemId, resultItemId }`).
3. ⚙ use the kit on the bike at the edge of town → `adv_bike_fixed`.
4. The exit hotspot for the gold ending is gated on `adv_bike_fixed` **and**
   `adv_exposed`; the silver one on `adv_bike_fixed` with
   `excludesFlags: ["adv_exposed"]`.

### Catching Cutter (the "present" verb)

The Blue Plate hands you a **siphon receipt** (gated on having asked Nee). In
the Roadhouse a *reply* choice carries `presentItem: "adv_receipt"` → sets
`adv_exposed`, which unlocks Cutter's reaction beats and lets you lift his keys
after the coffee-in-the-jukebox distraction. Swing instead and you get the
bust ending.

## What the prototype is missing (ranked)

Built on purpose: every gap below shows up as a compromise in
`throttleAsh.ts` rather than as a surprise later.

1. **No drag-to-world inertia.** Dropping works, but the items don't have
   weight: no "you can't reach that from here", no throwing, no giving an item
   to an NPC by handing it over.
2. **One plate = one room.** No walk-off-screen exits, no camera, no scrolling
   rooms wider than the viewport. *Fix:* `stage.worldWidth` + a camera that
   follows the walker, and `exitEdges: { left, right, top, bottom }`.
3. **Linear conversations.** NPC talk is beats + replies; Full Throttle's
   topic *list* (ask about X, ask about Y, leave) needs a
   `dialogue.topics[]` model with per-topic gates and exhausted states.
4. **Static NPCs.** Only the player has a walk cycle / idle animation. NPCs
   need `schedules` (room + position per flag) and their own sheets.
5. **No use-item-on-item at the cursor.** You can drag an item onto another
   item to combine them, and onto an object to use it — but you can't combine
   two items *while* one is in the world, and there's no "combine in hand".
6. **No pixel-perfect walk boxes.** The floor is a band, not a polygon. A
   `polygon` floor (or a painted walk-mask) buys diagonal rooms.
7. **One baseline per mask.** A mask flips on a single horizontal line, so a
   long counter the walker can stand in front of *and* behind is right at both
   ends and slightly wrong in the middle. A per-extra polygon (or painting a
   real depth buffer) would fix it.

## Testing it

```
npm run test:engine     # 727 checks — includes a "point-and-click prototype"
                        # block that walks every exit, item, flag and ending
                        # cross-reference in throttleAsh.ts
npm run build
```

Authoring the room (Studio): the **Hotspots** tab has a 🚶 **Player start** mode
(drop the character on the plate), a
`⌖ Hotspots / 🚧 Barriers (no-go)` switch — in barrier mode you drag boxes
straight onto the plate, see the walkable floor band and every existing
barrier, click one to select it, and drag a new box to reshape it. The **Walkable
Stage** panel still carries the numeric rows, the 🎛 verb coin, near/far sliders
and the 🚧 list. Foreground extras get a 🚶 **Walk-behind mask** toggle plus a
depth-line slider on the Cinematic tab.

Engine-side pieces this mode depends on (all in `src/logic.ts`, all tested):
`stageBlocked`, `stageLineClear`, `stageRoute` (A* on a 2% grid, string-pulled,
sealed-room safe, aspect-aware clearance), `stageSpriteScale` / `stageSpeedScale`
for perspective, `extraOccludes` for walk-behind, `resolveVerbAction` /
`verbsForScene` / `wrongVerbLine` for the coin, plus `hotspotAtPoint` for the
click-to-walk target, `resolveCursor` / `cursorArtFor` for cursor art, and
`presetStyle` for idle animation on room art.
