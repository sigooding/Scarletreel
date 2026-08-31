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

### B. 🔶 PARTLY DONE — the Rottwheeler duel is now a QTE fight

The duel is no longer narrated as plain beats: `ft_ride` → `ft_ride2` are
**quick-time choices** (⚡ HIT HIM! / ⚡ BOOT HIM! with heartbeat sting and
shaky-cam). Hesitate on either and the clock routes to `ft_ride_dead` — a
`gameover` ending ("KILLED ON HIGHWAY 9"), because the original really does
kill you if you lose the fight. The crash, Miranda and the "asphalt" bookend
still play as beats, and the whole golden path (punch → climb → kick → talk →
shake down → ride → duel) is asserted in the engine tests.

What's still missing is a *locomotion* minigame — the engine has no vehicle
physics, so the ride itself is a cutscene; the fight is timing, not steering.

### C. Topic-list dialogue

Quohog's scene is linear beats. The original lets you *ask* Quohog about
things and repeat them; topic trees are how a LucasArts bartender works. The
engine's dialogue is beats + reply choices (gated, `hidden`, `memoryLog`), so a
`topics[]` model on `startDialogue` (per-topic gates, an "exhausted" state, a
"leave" node) would be needed for real NPC conversations.

### D. Static NPCs

Only the player walks. Quohog stands behind the bar; in the original, scene
NPCs idle (polish the glass) and react. The engine has sprite sheets and
foreground extras but no NPC schedule/walk-cycle (documented gap #4).

### E. Inventory as a right-click skull

FT shows the inventory as a stretched skull with items in its mouth, opened
with right-click. Here it's a bottom-left "Jacket" container. The container
mode is a good match visually; what's missing is **right-click-to-open** and a
**use-item-on-item at the cursor** beyond drag-to-combine.

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
| 4 | ~~Bike/combat minigame~~ **🔶 PARTLY — QTE duel with a real game-over (see §B); no vehicle locomotion yet** | — |
| 5 | Topic-list dialogue | medium |
| 6 | NPC schedules / walk cycles | medium |

The next highest-leverage change is **#5** — a `topics[]` model on
`startDialogue` so Quohog can be *asked* about things (per-topic gates,
exhausted states) instead of the current linear beat conversation.
