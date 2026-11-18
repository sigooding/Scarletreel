# Testing tools — rewind, branch links, and the playthrough bot

Three features that exist to make a branching case *testable*. They share one
foundation: the engine's decision logic now lives in pure functions
(`src/game/decisions.ts`) that both the real runtime and the bot call, so a
result from one is a true statement about the other.

---

## 1. ↺ Rewind one decision

**In game:** the **↺ Rewind** button in the HUD (beside **◂ Back**), or
**Backspace**.

`←` rewinds one *line*. `↺` rewinds one *decision* — the choice you misclicked,
the quick-time window you let close, the reply you wish you hadn't said, and
every flag and item that decision handed you, across scenes.

**How it works.** `src/game/rewind.ts` keeps a bounded stack of world
snapshots. An entry *is* a `GameSave` — the exact shape `buildSave` produces
and `restoreSave` consumes — so undoing is "restore the snapshot taken just
before this decision". Items un-pick, flags un-set, meters and trust roll back
by construction, not by a second implementation of the effects in reverse that
would eventually drift.

**When a snapshot is taken:**

| Event | Snapshot? |
|---|---|
| Picking a choice (navigating or a reply) | ✅ before consequences land |
| A quick-time window expiring | ✅ before the hesitation branch fires |
| A hotspot that gives an item / sets a flag / moves a meter / moves you | ✅ |
| Reading a `showText` zone with no payload | ❌ flavour, not a decision |
| Advancing a line of dialogue | ❌ that is what `←` is for |

**The guard rails:**

- Consecutive duplicates collapse — re-entering a scene doesn't grow the stack
  (and a collapsed push still upgrades the label to the specific decision).
- **Endings seal the stack.** A snapshot at an ending is refused and arriving
  at one seals it, so rewind can never re-roll an ending.
- Bounded at `REWIND_LIMIT` (25); the oldest fall off.
- **RAM-only.** Nothing is persisted. Rewind is an undo, not a save system, and
  never competes with save slots.

---

## 2. 🔗 Branch links (inject a world state)

**In Studio:** the **🔗 Branch link** panel in the **▶ Test** tab builds one
with checkboxes and copies it. **In the URL:** hand-write it.

```
?scene=nd_freezer&items=burner&flags=examined_note&meters=Suspicion:5
?scene=booth&trust=lydia:3,marco:-2&memories=alibi:I%20lied
?story=neon-diner&scene=nd_freezer&seed=42
```

| Param | Form | Notes |
|---|---|---|
| `story` | `<id>` | which case; defaults to the flagship |
| `scene` | `<id>` | where to open; defaults to the story's start scene |
| `flags` | `a,b,c` | comma-separated |
| `items` | `a,b,c` | comma-separated item ids |
| `meters` | `Suspicion:5,clever:3` | names are case-insensitive, clamped 0–10 |
| `trust` | `lydia:3,marco:-2` | clamped −5…+5 |
| `memories` | `tag:the line` | values may contain spaces (url-encode them) |
| `seed` | any string | composes: pins the RNG so the branch replays identically |

Studio's Playtester fakes state in the *inspector*. This does it in the *real
runtime* — full screen, real audio, real cinematics. It is the difference
between "the gate should open" and watching the gate open, and the cheapest
way to hand a collaborator one exact branch.

**Two rules make it trustworthy:**

- **Unknown ids warn, they never fail.** A renamed flag or a cut item degrades
  to "that part was ignored" and still boots the scene. A link that hard-fails
  on a stale id is a link nobody trusts. (Deliberate exception: an unknown
  *flag* is applied anyway — flags are free-form, and testing a gate before
  writing the content that sets it is exactly the use case.)
- **Only world state is injectable.** The journey log, save slots and season
  progress stay read-only, so a link can't fabricate a "previously on…" recap
  or forge a completed season — and it never overwrites a resume.

---

## 3. 🤖 The automated playthrough bot

```bash
npm run bot                                       # 200 runs of the first story
npm run bot -- --story neon-diner --runs 1000     # hammer one case
npm run bot -- --seed unlucky --verbose           # replay a session exactly
npm run bot -- --coverage cov.json --out cov.json # aim at your real gaps
npm run bot -- --links                            # a repro deep link per problem
```

| Flag | Default | What it does |
|---|---|---|
| `--story <id>` | first in the catalogue | which case to play |
| `--runs <n>` | 200 | how many playthroughs |
| `--max-steps <n>` | 400 | budget per run before it's called a loop |
| `--seed <string>` | `scarlet` | pins the session; a failure replays exactly |
| `--explore <0..1>` | 1 | how hard to prefer never-taken branches |
| `--qte-timeout <p>` | 0.15 | chance of deliberately letting a QTE lapse |
| `--coverage <path>` | — | warm-start weighting from an exported tally |
| `--out <path>` | — | write the accumulated tally |
| `--links` | off | print a branch link to reproduce each problem |
| `--verbose` | off | one line per run |

**What it reports:** crashes, **dead ends** (a non-ending scene with nothing
left to do), scenes / choices / endings no run reached, runs that blew the step
budget, and an ending-frequency histogram.

**How it explores.** Each decision is weighted `1/(1+n)` where `n` is how often
it has been taken — an untaken branch is worth 1, one taken nine times is worth
0.1. A well-trodden branch never becomes impossible, because some branches are
only reachable *through* a common one. With `--coverage` the counts start from
your real playtest tally, so the bot heads for what you have been avoiding.

**Exit code.** Only crashes and dead ends fail the process. Unreached branches
print as advice — a story with a rare branch is not a broken story, and a bot
that fails CI over exploration luck is a bot people switch off.

### It found a real bug on its first run

```
── ✖ 1 dead end(s) — a non-ending scene with nothing left to do ──
  The Walk-In (nd_freezer)
      … nd_kitchen → hotspot:Walk-in freezer
      … nd_freezer → choice:Out. The cold is in your teeth now.
```

`nd_freezer`'s only exit (`nd_f_out`) carried `meterChanges: [Clever +1]`.
Choices with consequences default to **one-shot** so meters can't be farmed by
looping a scene — correct in general. But the freezer is re-enterable from the
kitchen, so: go in, leave (exit spent), walk back in → the room has no exit.
About 10% of random runs hit it.

**Fixed** in `src/data/neonDiner.ts`: `nd_f_out` is now `isRepeatable: true`
with no consequences, and the Clever point moved onto the ice hotspot, which
was already one-shot and so can't be farmed either. 500 runs now report clean.

This is the class of bug the bot exists for: reachable, unremarkable in the
static validator, and invisible until someone happens to walk the same door
twice. **The general pattern is worth remembering:** any re-enterable room
whose only exit choice carries consequences softlocks on the second visit.

### …and then it taught us what the simulation couldn't see

The next four reports were *not* content bugs. They were branches the
simulation had no model for, which is just as dangerous — an unmodelled
mechanism means the bot silently never tests everything behind it. Each one is
now part of the decision surface:

| Reported as | Actually | Now modelled as |
| --- | --- | --- |
| `rs_street` is a dead end | a stage room whose exit is **walking off the screen edge**, not a choice | `stage-exit` (+ auto-closing an open stage conversation) |
| Rain Sector's endings unreachable | the key card only falls out of the vending machine if you **kick** it | the **verb coin**: every verb the room offers on every object is its own decision |
| Rain Sector's two best endings unreachable | they gate on **catching a lie**, pressed with a held clue | `press-lie` — both the right evidence *and* a called bluff, with the attempt limit |
| `ppd_ledger` / `tt_harbour` are dead ends | the way out is through a **minigame** whose exit lives in its own config | `minigame` — the bot can't play a pattern puzzle, so it decides the *outcome*; both are ordinary branches |
| Scooby's Unmasking unreachable | it gates on three **corkboard deductions** | `deduction` — wire a held clue to a suspect you've met |

Modelling those took the catalogue from "mostly walkable" to **all 30 shipped
stories clean**, and Rain Sector, Scooby-Doo and the pattern-puzzle demo from
partial coverage to **100% of scenes, choices, endings and markers**. Two
things also turned out to be missing from scene entry itself — `onEnterActions`
never fired, and nobody was ever recorded as "met" — which is why the corkboard
had no suspects on it.

A standing engine check now walks **every shipped story** 12 times and fails
the build on any crash or dead end, so this class of regression can't come
back quietly.

---

## The shared foundation

`src/game/decisions.ts` answers two questions with no React, no DOM, no audio
and no storage:

```ts
availableDecisions(story, sim)      // what can happen here?
applyDecision(story, sim, decision) // what does the world look like after?
```

`availableDecisions` follows the runtime's own precedence: an ending is
terminal → a heat bust supersedes the scene → pickable choices (gate passed,
not spent, not expired) → live hotspots and their verbs → corkboard
deductions → pressing a lie → stage edge exits → closing a finished stage
conversation → failing all of that, the scene's own after-beat route or
auto-advance.

A `Decision` is one of eight kinds:

| Kind | What it is |
| --- | --- |
| `choice` | a choice or a conversational reply |
| `qte-timeout` | **deliberately** letting a quick-time window lapse — deciding by not deciding |
| `hotspot` | activating an object, optionally with a **verb** (`kick`) or an item (`use crowbar on…`) |
| `deduction` | 📌 wiring a held clue to a suspect on the corkboard |
| `press-lie` | challenging a false claim with evidence — right *or* wrong |
| `minigame` | the **outcome** of a pattern puzzle or a ride: won or lost |
| `stage-exit` | 🚶 walking off the left/right edge of a stage room |
| `stage-convo-end` \| `auto` \| `heat-bust` | the world moving on its own |

Two details worth knowing if you extend it. A verb activation is **flavour that
stays on the object** — only one that takes an item or moves the player spends
its marker — and a **retryable** pattern puzzle survives a wrong submission,
because eating its own marker would strand the player in a room whose only exit
is the puzzle. Both were false dead ends before they were fixed. Coverage is
also tallied per *object*, not per verb, so `decisionCoverageKey` is
deliberately coarser than `decisionKey`.

**`Game.tsx` imports the shared rules from here** — `getPerks`,
`adjustedConsequences` (Velvet Tongue / HEAT / Iron Nerve), `choiceRepeats`,
`visibleBeatQueue` — instead of keeping private copies. That is the point: one
definition, used by both, so the simulation cannot silently drift from the game
and make every bot result a lie. Three engine checks assert the duplicates
stay gone.
