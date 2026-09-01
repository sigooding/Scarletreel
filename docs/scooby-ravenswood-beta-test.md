# Scooby-Doo and the Ravenswood Phantom — Studio Beta Test, Pass 1

**Story id:** `scooby-ravenswood` (`src/data/scoobyRavenswood.ts`)
**Beta date:** 2026-09-01 · **Status:** playable, validator-clean, all gates green.
**Re-audit any time:** `node scripts/beta/scooby-harness.mjs` (54 checks: gold run, cold run, heat run, sheets, bookkeeping).

The case was built end-to-end through the repo's headless authoring pipeline (art plates → key/slice → story data → validator → engine tests → build) as a broad feature-shake of Studio, in the spirit of the Tintin homage case. It is a fan homage with original dialogue and plot; unofficial, non-commercial.

---

## 1. What shipped in this pass

### The case
A full Saturday-morning mystery at a condemned manor: the gang is lured by a second telegram, the caretaker lies about the post, the ledger, and the lower house; a glowing Phantom patrols the upstairs corridor; the cellar hides a projector, a costume rack, and a smuggling manifest. **Five endings** (gold unmask / silver escape / caught / sheriff-bust / quit), heat limit 8, `ghost-green` HUD.

### Art budget — 10 generated images (the agreed cap)
| Asset | Pipeline | Used as |
|---|---|---|
| `plates/sd-scooby-talk.png` | keyed + sliced, 3 frames (205×384) | `character.talkingSheet` — Scooby |
| `plates/sd-shaggy-talk.png` | 3 frames (174×384) | `talkingSheet` — Shaggy (right, flipped) |
| `plates/sd-velma-talk.png` | 3 frames (164×384) | `talkingSheet` — Velma |
| `plates/sd-phantom-talk.png` | **salvaged** — see §3.2, 3 frames (316×384) | `talkingSheet` — the Phantom |
| `plates/sd-scooby-walk.png` | 4 frames (152×160) | `stage.playerSheet` — the walkable grounds |
| `public/img/bg-sd-manor.jpg` | — | grounds plate **and** case cover |
| `public/img/bg-sd-foyer.jpg` | — | caretaker meeting + foyer hub |
| `public/img/bg-sd-library.jpg` | — | library / interrogation |
| `public/img/bg-sd-corridor.jpg` | — | the QTE chase + 2 endings |
| `public/img/bg-sd-cellar.jpg` | — | cellar lair, trap, gold ending |

Fred, Daphne and Grimsby speak this pass with emoji avatars (🧣 💜 🧹) — sprite cutouts for them are the top item for **pass 2**, see §5.

### Studio features exercised by this one case
- 🚶 **Stage 2D** as the *start scene* — Scooby is a sprite-sheet walker on the manor grounds; click-to-walk, obstacle routing around the van, hold-to-EXAMINE markers (sign, mailbox), a `goToScene` exit marker.
- 🗣 **Sprite cast** — 4 talking sheets, stage left/right two-shots with flips and listener dimming.
- 🎯 **Press the Lie ×2** — the telegram postmark lie and the ledger lie, both with wrong-evidence limits, bluff beats, trust/heat swings, and `rememberLine`s.
- 🕵 **Interrogation** — the library runs composure pressure on Grimsby (composure 4, `steadySeconds` 7, `crackTrust` 1); both lies carry `composureDamage: 2`; trust decides crack vs clamp.
- 🧩 **Pattern puzzle** — the estate ledger (3 cash lots to "E.G."), retry allowed, reward = flag + torn-page item.
- ⏱ **Quick-time** — the corridor chase (heartbeat, shaky cam) with a real timeout game-over route.
- 📌 **Corkboard** — three pinnable connections; the gold ending is gated on all three pins.
- 💬 Reply Q&A with `memoryLog` + `{said}` recalls, `presentItem` (hidden until held), `exclusiveGroup` approach pair, hidden gated choices, `partBreak`, `flagNotes`, `openBoard` hotspot, `examine` holds, meter/heat economy, emoji avatars.

### Production gates (all re-run this pass)
`npx tsc --noEmit` clean · `npm run check` 327 assets ✔ · `npm test` engine **925/925** + import/export round-trip + DOM smoke ✔ · `npm run build` single-file OK · `node scripts/preflight.mjs` → this story **validator clean**, walk ends on an ending, 2 victory / 3 game-over, 10/10 assets on disk · `node scripts/beta/scooby-harness.mjs` **54/54**.

---

## 2. Verdict on the studio (short version)

The authoring model held up under a from-zero case: every feature I reached for existed, typed cleanly, and survived the validator. The two sharp edges were both in **art ingestion** (bridged sprite plates) and **trust economy math** (lie swings vs `crackTrust`) — details below, both with concrete fixes. One pre-existing, unrelated problem surfaced: `npm run preflight` fails on four shipped Full Throttle stories.

---

## 3. Problems found

### 3.1 `npm run preflight` FAILS on four shipped stories (pre-existing, not this case)
`ft2_bar`, `ft_alley`, `fto_alley` (+1 more) each report **"no ending reachable"** even though the validator is clean and the DOM smoke plays those scenes. The preflight deep-walker appears unable to progress through those stories' ride/QTE/gated branch structure — it walks 4–6 scenes then gives up. Same walker under-walks this case (7/12 scenes, ending only on the quit route) while the same scenes pass through the real engine in the dedicated harness. **Fix suggestion:** teach the preflight walker to (a) pick timed choices before expiry, (b) treat `ride` choices as winnable, or (c) fall back to the engine-test deep-walker used elsewhere. Right now `preflight` exit code 1 can't be used as a ship gate on this repo at all.

### 3.2 Sprite plates that bridge: `make-sprite-sheet.mjs` cannot recover (tooling gap — fixed locally)
The Phantom plate drew its green glow across the gap between poses, so after keying there was **no fully-transparent column gap** — the slicer found 2 "frames", one of them 610 px wide, and `--tolerance/--gap` tuning changed nothing (the bridge is opaque, not near-key). `--frames` then just keeps the N widest runs, i.e. garbage.
**What I added:** `scripts/split-bridged-plate.mjs` — `--probe` prints every merged run and its lowest-occupancy "waist" column; `--cols` takes explicit split columns and also **despeckles** (drops 4-connected components under `--minpx`), which is what actually detaches the bridge slivers. The Phantom sheet was salvaged this way with zero re-generation (image budget intact). **Suggestion:** fold a waist-split fallback (split merged runs at the argmin-occupancy column) into `make-sprite-sheet.mjs`, or at least mention the companion script in `docs/sprite-sheets.md`'s troubleshooting list. Headless authors have no eyes on the plate; the tool needs to be the eyes.

### 3.3 Trust-economy trap: a "perfect detective" run clamps the interrogation (balance bug — fixed in this case, guard still worth adding)
`applyLieCaught` applies the lie's `contradictedConsequences` **before** `interrogationOutcome` decides crack vs clamp, and trust decides *after the swing*. My authored numbers (friendly +1, show-telegram +1, each caught lie −1, `crackTrust` 1) meant the model citizen run — charm up, catch **both** lies, then press — hit composure zero at trust 0 and got **CLAMP**, while a run that skipped a lie catch got the CRACK. The fix here: the empathetic press (`sdc_press_soft`) now carries `trustChanges +1`, so the warm path banks enough trust to afford both lie swings (verified by harness check *"four warm presses crack Grimsby (trust 2 vs crackTrust 1)"* and the cold-path clamp check).
**Guard suggestion for the Check tab:** when a scene has both an `interrogation` and lie beats with trust swings, compute the max reachable trust at first possible zero-composure and warn if it's below `crackTrust` (i.e. the crack is authorially impossible). Today nothing flags this until a human plays it.

### 3.4 Reply Q&A gating: `memoryLog` alone doesn't open a flag gate (sharp edge, worked as coded)
Answering beats gated `requiresFlags: [sd_asked_phantom]` with only `memoryLog: "sd_asked_phantom"` on the reply is a validator **error** ("flag required by a gate but nothing sets it"). `requiresMemories` gating would be the idiomatic alternative; the error message is accurate but doesn't hint at the memory-gate option. **Suggestion:** either have the Check-tab message mention `requiresMemories`, or have Studio's beat-gate picker offer "remembers the reply `<tag>`" as a first-class option next to flags. (In this case I set both the memory and the flag on the two ask-replies.)

### 3.5 Revisit beat-skip counts *authored* beats, including never-played gated ones (engine quirk — noted)
`Game.tsx` resets `beatIdx` to `scene.dialogueBeats.length` on revisit — the **authored** count, not the count that actually played. If a first visit ends before a gated beat surfaced (e.g. you enter the library, don't crack the ledger, leave), that beat can never play on later visits even once its flag is set. In this case the exposure is minimal (the puzzle lives in the same scene), but for any hub scene with late-unlocking beats this silently eats content. **Suggestion:** reset to the number of beats that were *visible* at exit (or re-scan on entry for beats never shown).

### 3.6 Smaller notes
- **Hotspot bounds authored blind.** Headless authoring means guessing x/y/w/h against unseen art. All zones are reasonable but a 10-minute drag pass in Studio's Scene tab overlay (hotspot rectangles over the plates) is recommended before calling this art-final. A "zone heat-map" export (dump every scene with zones drawn) would make headless passes verifiable.
- **No cartoon-appropriate music in the library.** Every shipped MP3 is noir; this case ships with synth ambient presets only (`drone`/`tension`/`storm`). A spooky-sweet 30-second loop under the foyer/cellar would lift it — needs a new audio asset, deliberately not in this image-budget pass.
- **The craft linter is good.** It caught my set-but-never-read `sd_saw_sign` and three never-recalled memories before any test run; adding a `flagNote` or a recall resolved each exactly as documented.
- **Positive:** a `stage` node as the *start scene* works everywhere (validator, deep-walker, DOM smoke, build) — no special-casing needed.
- **Positive:** emoji-avatar speakers (Fred/Daphne/Grimsby) coexist cleanly with sheet-animated speakers in the same scenes.

---

## 4. Playtest script (5 minutes, in `npm run dev`)

1. **Grounds (walkable):** walk Scooby up the drive; hold the gate sign; check the glowing window; **examine the mailbox** (telegram — keep it!). Walk to the door.
2. **Caretaker:** ask both questions; take the *friendly* line; **show the telegram**; while his "no post from this hill" line is up, press the lie with the telegram. Inside.
3. **Foyer:** examine the slime trail (hold), the portraits, take the keys.
4. **Library:** open the ledger → flag the three **CASH** lots; when he claims he *"couldn't sell a candlestick"*, press with the torn page; run all four presses (watch the composure gauge; hesitate and he *steadies*).
5. **Corridor:** pick an escape inside 6 seconds (let it time out once to see the caught ending, then rewind or replay).
6. **Cellar:** projector, costume rack, crate; open the corkboard from the workbench and **pin all three** clues to Grimsby.
7. **Trap:** spring it with the full corkboard → **gold unmasking** ("…meddling detectives").

---

## 5. Queued for pass 2 (next image budget)

1. Talk sprites for **Fred, Daphne, and Grimsby** (the unmasked Grimsby reveal deserves a face).
2. A **Grimsby unmasked variant sheet** for the gold ending's two-shot.
3. Dedicated **cover art** (the manor plate doubles as the cover today).
4. Optional: a **Phantom "lunge" 4th frame**, a second corridor plate for the post-chase look, and a spooky-sweet music loop if audio generation is in scope.
5. Studio polish: hotspot-zone drag pass over the five new plates (§3.6).

---

## 6. Files touched this pass

- `src/data/scoobyRavenswood.ts` — the case (new).
- `src/data/stories.ts` — catalogue entry (first position).
- `plates/sd-*.png` (5) — raw magenta plates.
- `public/assets/sprites/sd-*.png` (5) — keyed/sliced sheets.
- `public/img/bg-sd-*.jpg` (5) — scene plates.
- `scripts/split-bridged-plate.mjs` — new slicer companion for bridged plates (§3.2).
- `scripts/beta/scooby-harness.mjs` + `scripts/beta/scooby-probe.ts` — the re-runnable beta harness (§1).
- `docs/scooby-ravenswood-beta-test.md` — this report.
