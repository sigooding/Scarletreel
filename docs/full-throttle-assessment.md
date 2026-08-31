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
4. **The dumpster alley** — first playable scene: punch the lid, climb out.
5. **The front of the Kickstand** — the bike ("Some joker took my keys."),
   kick the door in.
6. **Inside** — Quohog the bartender (dialogue + fist the keys out of him),
   the piano gag.
7. **Ride out** — the Rottwheeler, the sabotaged front wheel, the crash,
   Miranda — closing on the "asphalt" bookend and a Part One break.

Validation all green: `tsc --noEmit`, `npm run check`, `npm run test:engine`
(811 passed), `npm test` (DOM smoke renders the new story), `npm run build`.

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

### 2. ✅ DONE — object-first verb menu (the "skull")

`stage.objectVerbMenu: true` (opt-in per room) flips the interaction to
Full Throttle's model: **click the object → a pie menu of the verbs *that
object* answers pops up next to it**, pick one to act; USE expands to the
inventory when the object accepts items. The recreation now uses it everywhere,
so the Kickstand rooms read object-first rather than coin-first.

The one simplification from the original: the menu opens on **click** rather
than literal click-and-**hold**. Pointer hold conflicts with click-to-walk and
drag on the same surface, so click-to-open is the reliable version; the
`examine` (hold-to-act) plumbing is the natural place to add a true hold later.

---

## Other gaps, ranked by how much they cost the recreation

### A. Walk-off-screen exits (rooms are single plates)

The original is a side-scrolling strip of screens: you click a red/yellow
**edge arrow** to walk to the next plate (alley → front of Kickstand → inside).
Here each room is one image and "leave" is a `goToScene` hotspot carrying a ➜
`go` verb. It works — the dumpster-alley→street→bar chain plays — but it reads
as "click the invisible door hotspot", not "walk right".

**Fix:** `stage.worldWidth` + a camera that follows the walker, and
`exitEdges` that route off the left/right/top/bottom of the plate (already
scoped in `docs/adventure-mode.md` §"What the prototype is missing", #2).

### B. No bike-riding or combat minigames

The Rottwheeler duel and the crashing bike are the *payoff* of FT's opening —
the first thing you actually *do* after the Kickstand. The engine has no
vehicle locomotion and no combat, so both are narrated as dialogue beats here.
That's honest, but it means the recreation ends exactly where the original gets
interactive.

**Fix:** a `minigame` hotspot action type (or a dedicated node) for road
combat — even a scripted beat-driven version (tap to swing a chain, a
sabotaged-wheel QTE) would capture the shape. Quick-time choices already exist
(`quickTime`, `qtePrompt`, heartbeat, shaky-cam) and could frame a first pass.

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
| 2 | ~~Object-first verb menu (the "skull")~~ **DONE (opt-in, click-to-open)** | — |
| 3 | Walk-off-screen edge exits + camera | medium |
| 4 | Bike/combat minigame (beat-driven first pass) | large |
| 5 | Topic-list dialogue | medium |
| 6 | NPC schedules / walk cycles | medium |

The next highest-leverage change is **#3** — walk-off-screen edge exits and a
camera — which would let the alley → street → bar chain be walked through the
way the original does, instead of via goToScene door markers.
