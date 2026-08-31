# Full Throttle recreation — engine assessment

**What was built:** `src/data/fullThrottle.ts` — "Full Throttle — The Kickstand",
a faithful point-and-click reconstruction of the opening act of LucasArts'
*Full Throttle* (1995), authored in this engine's **adventure mode** and
registered in the catalogue (`src/data/stories.ts`). It recreates, in order:

1. **Opening credits** — Ben's flash-forward narration ("Whenever I smell
   asphalt, I think of Maureen…") over a night-ride still, as a `credits` node.
2. **The limo scene** — the full "Ripburger, you're dumber than dirt!" exchange.
3. **The sales pitch** — the complete Kickstand confrontation (Darrel's broke,
   Corley's "This place is for bikers only," Ripburger's escort offer, Ben's
   "The Polecats are not goons for hire," Bolus's knockout, Ripburger's lie to
   the gang).
4. **Inside the dumpster** — the true first playable screen of the original:
   dark, ribbed metal, the lid overhead. Punch the lid, climb out.
5. **The alley — a WIDE WORLD** — one continuous 200%-wide scrolling strip:
   the dumpster on the left screen, and walking right pans the camera around
   the corner to the front of the Kickstand — the bike ("Some joker took my
   keys.") and the door. The original's scrolling alley, no scene cuts.
6. **Inside the Kickstand** — Quohog the bartender (talk first, *then* fist
   the keys out of him — the conversation gates the shakedown), the piano gag,
   and a walk-off-screen red arrow at the left edge back to the alley.
7. **Ride out** — the Rottwheeler duel as a two-punch QTE fight (hesitate and
   the road takes you — a real game-over), the sabotaged front wheel, the
   crash, Miranda — closing on the "asphalt" bookend and a Part One break.

Validation all green: `tsc --noEmit`, `npm run check`, `npm run test:engine`
(851 passed, including a golden-path walk of the whole FT puzzle chain),
`npm test` (DOM smoke boots the story, punches out of the dumpster and
verifies the wide-world alley renders), `npm run build`.

The dialogue is transcribed as faithfully as public sources allow; the verb
mapping is where the engine and the original genuinely diverge — and that
divergence *is* the assessment below.

---

## The verb coin is the gap that matters most

Full Throttle's interface is a **flaming skull** (the Polecats tattoo) that pops
up when you **click-and-hold an object**. It offers **four** verbs:

| Original | Meaning | This engine's closest | How close |
| --- | --- | --- | --- |
| 👁 eyes | look / examine | `look` | ✅ close |
| 👄 mouth | talk / taste / lick | `talk` | ✅ close |
| ✊ fist | use / grab / hit / punch | `punch` (+ `use` for grab) | ✅ added |
| 👢 boot | kick | `kick` | ✅ added |
| (right-click) | inventory (stretched skull) | container "Jacket" | ⚠️ different |

### 1. ✅ DONE — `kick` and `punch` verbs, opt-in per room

The two body-verbs are now in the engine. The coin offers **seven** verbs in
canonical order — `look, take, talk, use, go, kick, punch` — and a room opts
into the two extras via `stage.extendedVerbs: true` (Studio: a **👢 Kick ·
👊 Punch** toggle on the 🎛 Verb-coin panel). Because it's opt-in:

- a **visual novel** or classic **noir-rail** case (no stage, or a coin that
  never opts in) is completely unaffected — kick/punch never appear;
- a room that opts in but only uses core verbs still shows the classic five;
- an author can also name `kick`/`punch` explicitly in `stage.verbs`.

Hotspots answer the new verbs the same way they always did: `cursor: "kick"`
sets the default (and the marker icon 👢), and `verbs: { kick: …, punch: … }`
adds per-verb flavour — so *kick the door*, *punch the dumpster*, *punch
Quohog* and *kick the piano* now read as four distinct Ben-actions instead of
one ⚙ "use". `Full Throttle — The Kickstand` uses all four; `Throttle & Ash`
is untouched and still shows five.

Backing surface (all generic, no new logic paths): `CursorKind`/`VerbId` gained
the two values, `VERB_IDS`/`VERB_LABEL`/`VERB_ICON`/`DEFAULT_VERB_RESPONSES`/
`CURSOR_SLOTS`/`CURSOR_ICON` gained entries, `verbsForScene` gates the extras
behind the flag, and Studio's hotspot cursor dropdown + refusal-lines tab grew
the two options. `resolveVerbAction`/`hotspotAnswersVerb` needed no change.

### 2. ✅ DONE — object-first verb menu (the "skull"), hold-to-open

`stage.objectVerbMenu: true` (opt-in per room) flips the interaction to
Full Throttle's model: **click the object → a pie menu of the verbs *that
object* answers pops up next to it**, pick one to act; USE expands to the
inventory when the object accepts items. The recreation now uses it everywhere,
so the Kickstand rooms read object-first rather than coin-first.

And now the original's signature gesture is in too: `stage.objectMenuHold:
true` (also opt-in) makes it **click-and-hold** — press and hold an object and
a BIG circular menu opens in the middle of the screen with the verbs ringed
around it; release over a verb to act, over the skull or outside to cancel;
quick taps walk. The centrepiece is the story's `verbMenuIcon` sprite (🎮
In-game theme tab), rendered large in the middle — Full Throttle ships its own
flaming-skull art (`/img/ft-skull.png`); other games keep the default emoji.
The hold gesture lives on window listeners with geometric hit-testing, so it
never fights click-to-walk: taps still walk, drags still cancel, only a real
press-and-hold opens the pie.

---

## Other gaps, ranked by how much they cost the recreation

### A. ✅ DONE — wide-world scrolling + walk-off-screen exits

The original is a side-scrolling strip of screens: you click a red/yellow
**edge arrow** (or just walk) to the next plate, and the camera scrolls with
you. That's now in the engine:

- **`stage.worldWidth`** (Studio: **World width** on the Walkable Stage
  panel) makes a room a continuous strip wider than the viewport; a camera
  follows the walker with light smoothing and never shows past the world's
  ends. The alley → front-of-Kickstand chain is now ONE 200%-wide world
  (`ft_alley` on `/img/ft-alley-wide.jpg`): you climb out of the dumpster on
  the left screen and walk right as the camera pans around the corner to the
  bike and the front door. No scene cuts — exactly the original's scroll.
- **`stage.exitEdges`** (Studio: **➡ Walk-off-screen exits**) adds the
  red/yellow chevron arrows: walk into the plate edge (or click the arrow)
  and Ben strides off-frame into the target scene. The bar's left edge walks
  out to the alley; the right edge of the alley world stays a wall.
- **`stage.entrySpawns`** (Studio: **🚪 Entry spawns**, draggable cyan dots)
  picks your spawn by the room you came from — climb out of the dumpster and
  you stand by the dumpster; leave the bar and you stand at the front door.
- Engine plumbing: `stageCamX` / `stageAtWorldEdge` in `src/logic.ts`, the
  width-aware `clampToFloor`/`stageBlocked`/`stageRoute`, edge exits count as
  exits in the validator and draw as `➜ walk off … edge` flowchart branches.
  The opening itself gained the missing **inside-the-dumpster** screen
  (`ft_dump` — punch the lid, then climb out), which is the true first
  playable screen of the original.

### B. ✅ DONE — the ride is now a steerable locomotion minigame

The ride is no longer a QTE cutscene: `ft_ride` → `ft_ride2` (and the Corville
Run's `ft2_ride`) are now **playable road chases**. A choice carrying
`choice.ride` (see `RideConfig` in `src/types.ts`, rendered by
`src/game/RideGame.tsx`) launches a steerable arcade sequence — Ben's bike
sits at the bottom of the frame in a lane, oncoming traffic scrolls toward
him, and you weave with ←/→ (or A/D, or tap a lane on touch) to dodge it.
Survive the ride's duration and you run the target down (the choice's
`consequences` apply and you head to `targetSceneId`); let traffic reach you
and you crash — routed to `timedOutTargetSceneId` exactly like the old QTE
hesitation path, so losing is still the `gameover` "KILLED ON HIGHWAY 9"
ending. The `ftc_fight2` win still sets `ft_rott_beaten`, so the milestone and
flag note stay intact. Crash, Miranda and the "asphalt" bookend still play as
beats; the whole golden path is asserted in the engine tests.

It's opt-in: a story that never sets `ride` is untouched, and the old
`quickTime` QTE machinery still works for non-ride deadlines.

### C. ✅ DONE — topic-list dialogue (`startDialogue.topics`)

Quohog's scene is now a **topic hub**, not linear beats: talking opens a list
of askable questions, each topic plays its own beats, and the conversation
returns to the hub (a "leave" option ends it). The opt-in model is
`action.topics` on a `startDialogue` marker (see `src/types.ts` →
`DialogueTopic`):

- `label` is the player-facing question; `beats` is the exchange that plays
  (reusing the full `DialogueBeat` machinery — voice, expressions, recalls).
- `gating` hides a topic until flags/items/trust are ready.
- a non-`repeatable` topic is **exhausted** after one ask (stays in the hub
  with a ✓); `repeatable` re-asks.
- `flagSet` records the ask, so later topics/beats/hotspots gate on it — in
  the recreation, the "My keys, Quohog." topic sets `ft_quohog_talked`, which
  is what unlocks the grab (fist) marker.

Stories that never set `topics` are 100% unchanged — the scene's linear
`dialogueBeats` play exactly as before. Studio authors it on the Hotspots tab:
a 🗣 Start-conversation marker gains a **💬 Topic-list conversation** editor
(label, gate, "askable again", "sets flag", and per-topic lines).

### D. ✅ DONE — ambient NPC idle/walk cycles (`stage.npcs`)

Scene NPCs are no longer frozen props. A room can now list **ambient NPCs**
(`stage.npcs`, opt-in): each is a living actor that **idles** (loops its
`idle` animation) and — when it carries a `patrol` — **walks a route**
between waypoints (switching to `walk`), pausing idle at each before looping
back. They use the exact same `SpriteSheet` model as the walker (`idle` /
`walk`, each falling back to the other), and are depth-scaled by their y and
z-sorted by their feet, so they overlap the player the way people overlap in
a room — and scroll with the camera on wide worlds. NPCs are pure
set-dressing: interaction still lives on hotspots (Quohog is a hotspot, and
a hotspot's own `sheet` already loops a "polish the glass" idle).

- **`StageNpc`**: `id` · `sheet` (or static `image`/`emoji:`) · `x`/`y` spawn
  · `facing` · `scale` · `speed` · `patrol: { x, y, pause? }[]`.
- No `patrol` = stand and idle forever (the classic bartender).
- Studio: the 🚶 Walkable Stage panel gained an **🚶 Ambient NPCs** editor
  (add/remove, sheet via the same sprite-sheet controls, spawn/facing/scale/
  speed, and a per-NPC waypoint list).
- `Full Throttle — The Corville Run` ships a patrolling **barfly** in the
  Kickstand (`ft2_barfly`, `/assets/sprites/ft2-barfly.png`): he paces the
  floor, drinking at each end. Engine tests assert the sheet + patrol shape;
  the DOM smoke test confirms he renders in the bar.

### E. ✅ DONE — inventory as a right-click skull

FT shows the inventory as a stretched skull with items in its mouth, opened
with right-click. The engine's `container` inventory mode already matched the
visual; the two missing pieces are now in `src/game/InventoryDock.tsx`:

- **Right-click-to-open**: right-clicking the dock toggles it open/closed —
  the skull-pop gesture, no left-click required.
- **Right-click verb menu on items**: right-clicking an item pops a small
  context menu at the cursor with **🔍 Inspect**, **✋ Use on…**, and (when the
  story has a recipe) **🔗 Combine…**. "Use on…" enters a targeting mode — the
  next click on a scene object *uses* the item there, or on another item
  *combines* the two at the cursor, with an on-screen hint and Esc to cancel.
  This is the "use-item-on-item at the cursor" affordance beyond the existing
  drag-to-combine.

---

## Things the engine already does well (don't redo)

- **Walkable rooms** with perspective scaling, walk-behind masks, and A*
  obstacle routing — the alley/street/bar *feel* like FT screens.
- **Per-verb cursor art** and **container inventory** — the "hand / eye /
  jacket" theming is opt-in and worked first try.
- **Gating** — "can't leave until you punch out", "keys gate the ride" — mapped
  the puzzle chain cleanly.
- **Credits node + music + letterbox** — the opening title sequence is a real
  `credits` node, not a hack.
- **Dialogue beats with voiced characters** — the pitch scene plays as a proper
  cutscene with portraits.

## Summary

| Priority | Need | Effort |
| --- | --- | --- |
| 1 | ~~`kick` (and `punch`) verbs + per-object answers~~ **DONE (opt-in)** | — |
| 2 | ~~Object-first verb menu (the "skull")~~ **DONE (opt-in; hold-to-open skull pie + theme sprite)** | — |
| 3 | ~~Walk-off-screen edge exits + camera~~ **DONE (wide worlds, edge arrows, entry spawns — see §A)** | — |
| 4 | ~~Bike/combat minigame~~ **DONE — steerable ride minigame (`choice.ride`, see §B)** | — |
| 5 | ~~Topic-list dialogue~~ **DONE (opt-in `topics[]` — see §C)** | — |
| 6 | ~~NPC schedules / walk cycles~~ **DONE (ambient `stage.npcs` — see §D)** | — |

All six Full Throttle "feel" gaps are now closed: the wide-world scroll, the
hold-to-open skull pie, walk-off edges, the steerable bike-riding minigame,
topic-list dialogue, and the right-click skull inventory.
