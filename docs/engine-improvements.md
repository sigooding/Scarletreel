# Engine improvements — six proposals (five built)

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

**Done:** proposal 5 (a bot that plays the game) now writes into the same
tally, so coverage fills in without a human at the keyboard — and reads it
back to weight itself toward the branches you have been missing.

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


## 3. ✅ Rewind one decision — **IMPLEMENTED**

**Shipped:** `src/game/rewind.ts` — a bounded, RAM-only stack of world
snapshots, one per DECISION. An entry *is* a `GameSave`, so undoing is
"restore the snapshot taken just before it" through the same `restoreSave`
path a load slot uses: items un-pick, flags un-set, meters and trust roll
back, the journey log truncates — by construction, not by a second,
drift-prone inverse-effects implementation.

A **↺ Rewind** control sits beside **◂ Back** in the HUD (and on **Backspace**;
← stays "one line", deliberately a different key because undoing a choice is
a much bigger step). Its tooltip names what it will undo.

The rules that make it a feature rather than a cheat:

- **One decision, not one frame.** Snapshots are pushed immediately *before* a
  choice commits, before a quick-time window's expiry consequences land, and
  before a hotspot that hands you something / sets a flag / moves a meter /
  moves you. Reading a line never pushes one.
- **Consecutive duplicates collapse** (re-entry, re-render), and a collapsed
  push still upgrades the label to the more specific decision.
- **Endings are final.** A snapshot at an ending is refused and the stack is
  *sealed* on arrival, so rewind can never be used to re-roll an ending until
  you like the one you got.
- **Bounded** at `REWIND_LIMIT` (25) — the oldest fall off, the newest survive.
- **RAM-only.** Nothing persists; rewind is an undo, not a save system, and
  never competes with slots.

**Cost as built:** one pure module + ~40 lines of wiring in `Game.tsx`.
19 engine checks; the DOM smoke test proves the control is dead before any
decision, goes live the moment one is made, and restores the moment when
pressed.

---

## 4. ✅ Inject-a-world-state deep links — **IMPLEMENTED**

**Shipped:** `src/game/deepLink.ts` plus a **🔗 Branch link** builder in
Studio's **▶ Test** tab. A URL carries a fabricated world state and the engine
boots straight into it, at full screen, with real audio and cinematics:

```
?scene=nd_freezer&items=burner&flags=examined_note&meters=Suspicion:5
?scene=booth&trust=lydia:3,marco:-2&memories=alibi:I%20lied&seed=42
?story=<id>&scene=…        pick which case (defaults to the flagship)
```

Meter names are case-insensitive, `?seed=` composes with it so the branch
replays identically for whoever opens the link, and episodic stories open the
episode that owns the scene directly at it.

The two rules that make it trustworthy:

- **Unknown ids warn, never fail.** A renamed flag or a cut item degrades to
  "that part was ignored" and *still boots the scene*. Out-of-range meters and
  trust clamp to the engine's own bounds with a note. The Studio builder shows
  exactly the warnings the runtime will log.
  (One deliberate exception: an unknown *flag* is applied anyway — flags are
  free-form, and testing a gate before writing the content that sets it is the
  point.)
- **Only world state is injectable.** Flags, items, meters, trust, memories and
  the target scene. The journey log, save slots and season progress stay
  read-only, so a link can never fabricate a "previously on…" recap or forge a
  completed season — and it never overwrites a resume.

**Cost as built:** one pure module, a Studio panel, ~30 lines in `GamePlayer`
and a boot branch in `App`. 30 engine checks + two DOM smoke phases (a link
boots into the linked scene holding the injected item; bad ids still render a
playable screen).

---

## 5. ✅ Automated playthrough bot — **IMPLEMENTED**

**Shipped in two halves.**

**The decision surface** (`src/game/decisions.ts`) — the prerequisite. The
branching logic that used to be knowable only by mounting the 8.6k-line
`<CasePlayer>` and clicking is now two pure functions:

```
availableDecisions(story, sim)      → what can happen here?
applyDecision(story, sim, decision) → what does the world look like after?
```

with the runtime's own order of precedence, and `Decision` covering every way
the world can move: choices, replies, **deliberately lapsed quick-time
windows**, hotspots **and the verbs used on them**, 📌 corkboard deductions,
**pressing a lie** (right evidence or called bluff), the **outcome** of a
pattern puzzle or ride minigame, 🚶 walking off a stage's screen edge,
auto-transitions and heat busts.

Crucially `Game.tsx` now **imports** the shared rules from here — `getPerks`,
`adjustedConsequences` (Velvet Tongue / HEAT / Iron Nerve), `choiceRepeats`,
the visible-beat queue — rather than keeping private copies. There is one
definition used by both, so a bot result can never be a lie about the game.
Three engine checks assert the duplicates are actually gone.

**The bot** (`npm run bot`, `scripts/playthrough-bot.mjs`) — a loop over those
two functions. It reports crashes, **dead ends** (a non-ending scene with
nothing left to do), unreached scenes / choices / endings, runs that blew the
step budget, and an ending-frequency histogram.

It explores with weighted randomness that prefers the branch nobody has taken
(`1/(1+n)`, tunable with `--explore`), and `--coverage <file>` warm-starts the
weighting **from the real playtest tally** — so it heads straight for the
branches a human tester has been avoiding, exactly as proposal 1 anticipated.
`--out` writes the accumulated tally back. `--seed` pins the session so a
failing run replays exactly; `--qte-timeout` sets how often it lets a
quick-time window lapse on purpose (that hesitation branch is real content
nobody plays deliberately); `--links` prints a proposal-4 deep link to
reproduce each problem.

```
npm run bot -- --story neon-diner --runs 1000 --links
npm run bot -- --coverage cov.json --out cov.json     # keep filling the gaps
```

**It already earns its keep.** On its first run it found a genuine softlock in
The Neon Diner: `nd_freezer`'s only exit choice carried a meter consequence,
which makes it one-shot, but the room is re-enterable from the kitchen — walk
back in after using the exit once and there was no way out. ~10% of random runs
hit it. **Fixed**: the exit is now repeatable and the Clever point moved to the
already-one-shot ice hotspot, so it still can't be farmed.

Its *other* findings were more interesting: five reports that looked like dead
ends or unreachable endings turned out to be branch mechanisms the simulation
had no model for — stage edge exits, the **verb coin** (Rain Sector's key card
only falls out of the vending machine if you *kick* it), pressing a lie, the
corkboard, and minigame outcomes. That is the more dangerous failure, because
an unmodelled mechanism means everything behind it is silently never tested.
All five are now part of the decision surface, along with two things missing
from scene entry itself (`onEnterActions` never fired, and nobody was recorded
as "met"). The result: **all 30 shipped stories walk clean**, and Rain Sector,
Scooby-Doo and the pattern-puzzle demo went from partial to **100% scene,
choice, ending and marker coverage**. See `docs/testing-tools.md` for the
report-by-report breakdown.

Only dead ends and crashes fail the process; unreached branches are printed as
advice, because a bot that fails CI over exploration luck is a bot people
switch off. A standing engine check does walk **every shipped story** and fails
the build on any crash or dead end.

**Cost as built:** one pure module (the extraction), one bundled script,
~65 engine checks including a sweep of the entire shipped catalogue.

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
