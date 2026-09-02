# Engine improvements — six proposals (two built)

A working list of things the *engine* (playtime runtime, not the authoring UI)
doesn't do yet, ranked by how much authoring pain they remove. Each entry says
what it is, why it matters, roughly what it costs, and where it would live.

---

## 1. ✅ Playtest coverage — **IMPLEMENTED**

**What:** the engine keeps a per-story tally of every scene entered and every
choice picked while a case is in play (`src/game/playtestCoverage.ts`),
persisted in `localStorage` and accumulated across playthroughs. Studio's
**▶ Test** tab shows it as **🧪 Playtest coverage**: scenes entered / choices
taken / endings reached as percentages, completed runs, the last played
timestamp, and a click-to-jump list of everything never exercised.

**Why:** the validator is static — it walks the graph and says what *could* be
reached. It cannot say what you actually reached. The branch nobody has played
is exactly the branch most likely to be broken, and today finding it means
replaying the whole case from the top. Coverage turns "I think I tested it"
into a number.

**Cost:** small. One pure module, two call sites in `Game.tsx` (scene arrival,
choice pick), one Studio panel, 16 engine tests. Nothing is read back into
play, so a missing or corrupt record degrades to "nothing recorded yet".

**Natural next step:** proposal 5 (a bot that plays the game) writes into the
same tally, so coverage fills in without a human at the keyboard.

---

## 2. ✅ Deterministic seeded RNG — **IMPLEMENTED**

**Shipped:** `src/game/rng.ts` — mulberry32 + a string seed hash, a shared
module stream (`gameRandom` / `gameRange` / `gamePick` / `gameShuffle`),
`setGameSeed` for tests and future Studio toggles, and a boot-time
`initGameSeedFromUrl` that Game.tsx runs at import: put **?seed=1234** (any
string) on the URL and every gameplay draw pins to one stream — the console
logs a `[seed]` line confirming the run is deterministic. Gameplay call
sites now route through it (PatternPuzzle's row shuffle, RideGame's spawn
timing / lane / sprite); cosmetic randomness — ids, audio noise, storm
particles, Studio canvas — deliberately stays live. 18 engine checks cover
stream determinism, seed parsing and the helpers.

---


## 3. Rewind one decision

**What:** a stack of snapshots (scene id + `GlobalState` + beat index) pushed
on every scene arrival and every choice. A **Rewind** control pops one entry —
undoing a misclick, a timed-out quick-time event, or a reply you wish you
hadn't said — without a save file and without replaying.

**Why:** quick-time events and one-shot replies are unforgiving by design, and
the only recovery today is restarting the episode. For authors it is worse:
testing the third branch of a conversation means replaying the first two every
time. Rewind also makes playtesting loops dramatically shorter, which feeds
straight back into coverage.

**Cost:** medium. The snapshot machinery already exists (`buildSave` /
`GlobalState` serialisation), so this is mostly stack discipline: what counts
as one "decision", how to treat items consumed and flags set in the undone
step, and drawing the line so rewind can't be used to re-roll an ending.

---

## 4. Inject-a-world-state deep links

**What:** let Studio hand the player a URL carrying a fabricated world state —
flags, inventory, meters, trust, memories, and a target scene — and have the
engine boot straight into that scene with that state. `?scene=tt_light&flags=tt_caught_lie,tt_heard_signal&items=tt_manifest_page`.

**Why:** Studio's Playtester already fakes state *in the inspector*; this makes
the same trick work in the real runtime, at full screen, with real audio and
cinematics. It is the difference between "the gate should open" and watching
the gate open. Also the cheapest way to hand a specific branch to a
collaborator: send a link.

**Cost:** medium. Needs a strict parser (unknown flag ids ignored with a
warning, not an error) and a decision about which parts of state are
injectable — journey log and episode progress probably stay read-only so a
deep link can't fabricate a "previously on…" recap.

---

## 5. Automated playthrough bot (the big one)

**What:** a headless driver that plays a case over and over — walking choices
with weighted randomness (prefer unvisited branches, since the coverage tally
already knows which those are), firing hotspots, timing out some QTEs on
purpose — and reports: crashes, dead ends, unreachable endings, scenes with no
exit, and coverage growth per run.

**Why:** it is the only proposal here that finds bugs *for* you. A thousand
simulated playthroughs overnight will reach branches a human tester never
touches, and because it writes into the coverage tally (proposal 1), the
dashboard fills itself in. It also doubles as a stress test for the save
system and the act/episode hand-off.

**Cost:** large. The engine's decision surface lives inside an 8k-line React
component; a bot wants that surface extracted into pure "given (scene, state)
→ available decisions / apply decision" functions. Worth doing eventually, and
it is the change that would make the engine genuinely testable end-to-end.

---

## 6. Per-choice telemetry for balancing

**What:** with coverage already counting picks, also record *when* a choice was
taken versus offered (a choice shown but never picked is a signal), and surface
a per-scene "pick rate" in Studio.

**Why:** a choice nobody ever takes is wasted writing, or a tell that its
wording doesn't match its consequence. Pick rates also expose degenerate
design: an early branch that 95% of playthroughs funnel through means the
"branching" story isn't branching.

**Cost:** small once coverage exists (count offers alongside picks) — but it
needs a privacy story: this is local-only data, and it should be obvious in the
UI that nothing leaves the device.

---

## Backlog (smaller, but cheap wins)

- **Honour `prefers-reduced-motion`** in the QTE shake and the letterbox
  transitions — accessibility, and a one-line CSS/flag check.
- **Skip-read-text fast-forward** that only skips text the player has already
  seen (the current skip mode skips everything, which spoils a first-timer who
  turns it on by accident).
- **Preload the next scene's background** (and its first talking sheet) on the
  beat before navigation, so the transition doesn't hitch on a cold decode.
- **Save-schema migration tooling** — `SAVE_SCHEMA` exists; a small migration
  registry would let old saves be upgraded instead of discarded.
