# Running the game locally

## Requirements

- **Node `^20.19.0` or `>=22.12.0`** (Vite 7 refuses older versions)
- npm

There are no native modules, no database, no environment variables, and no
API keys. If `npm ci` succeeds you have everything.

## Setup

```bash
git pull                 # assets live in the repo — a stale checkout is the usual problem
npm ci                   # not `npm install` — ci matches the lockfile exactly
npm run dev
```

Then open the URL Vite prints (usually <http://localhost:5173>).

## Something looks wrong?

Run the setup check first. It verifies your Node version, that dependencies
are installed, whether your checkout is behind the remote, and that **every
image and audio file the playable stories reference actually exists on disk**:

```bash
npm run check
```

It names the exact missing file and which story needs it, so there's no
guessing.

### Engine tests

```bash
npm test
```

Runs three suites under plain Node. No test framework — the TypeScript bodies are
bundled with the esbuild that ships with Vite, so `npm ci` is all you need.

1. **Engine tests** (`npm run test:engine`) — the pure-logic checks: gating,
   memory/flag recalls, flag collection, the validator, the act-membership
   walk, playtest coverage, the background-remover keying maths, and full The
   Neon Diner playthroughs (a gold run and a full-mistake fold run).

2. **Import/export round trip** (`npm run test:media`) — exercises the real
   `src/data/mediaLibrary.ts` against a real IndexedDB
   ([`fake-indexeddb`](https://github.com/dumbmatter/fakeIndexedDB), a
   devDependency, so it never reaches the shipped bundle — `electron-builder`
   only packs `dist/`, `electron/` and `package.json`). It runs the export in
   one process and the import in a **separate** process, so the importing side
   genuinely starts with an empty store — a real "shared to someone else's
   machine" test. It seeds **every** media-bearing field listed in
   `visitStoryMediaRefs` and asserts per-field byte integrity, plus that
   `compactStoryMedia` migrates every raw `data:` URL to an `asset:` reference.

   > That last part is the one to watch. `visitStoryMediaRefs`,
   > `resolveStoryMedia` and `compactStoryMedia` each walk the media fields by
   > hand and must stay in sync — a field missing from the play-time resolver
   > means its `asset:<id>` reference reaches the browser as a literal URL and
   > renders nothing, with no error anywhere. This suite exists because that
   > happened to `cinematic.foregroundExtras` and `cinematic.parallaxLayers`.
   > **Add a new media-bearing field to all three, then add it to
   > `scripts/ie-roundtrip/export-side.ts`.**

   `npm run test:media:real` additionally pushes the shipped 45.9 MB
   `nobodys-witness-draft.reel.json` (69 scenes, 86 bundled assets) through the
   same import path and asserts every reference resolves.

3. **DOM smoke test** (`npm run test:dom`) — mounts the real `<App/>` in
   [happy-dom](https://github.com/capricorn86/happy-dom) (a devDependency) and
   clicks through the newsstand, the ending gallery, the Studio (including the
   🛠 Media Tools and ▶ Test tabs), and a real playthrough of Nobody's
   Witness. Any `console.error`/`console.warn`,
   uncaught throw, or error-boundary trip on those screens fails the run —
   this is what catches invalid DOM nesting (React logs it as an error) and
   mount-time crashes that the pure-logic suites can't see.

4. **Walking-stage beta test** (`npm run test:stage`) — the 🚶 STAGE nodes'
   dedicated regression net (`scripts/beta/stage-harness.mjs`, same esbuild +
   happy-dom trick). Part 1 pins the walking engine math from `src/logic.ts`
   (movement, floor/path clamping, obstacle routing, camera, world edges,
   legacy `stage2d` normalisation). Parts 2–4 mount the real `<GamePlayer>`
   and play a synthetic story across the stage ↔ graphic-novel boundary in
   every direction: WASD/arrow walking, click-to-walk around furniture, the
   verb coin, remote looks, conversations that lock the floor, wide-world
   camera pans, walk-off-screen edge exits, a live MULTI-STATE safe puzzle
   (locked → opened → taken through `Hotspot.states`), a gate-aware DOOR
   barrier that physically seals the alley until a conversation opens it, the
   SCUMM sentence line (hover readout + right-click look), and a real stage
   round-trip through Demo Lab: Press the Lie. The non-interference half
   asserts the classic novel scenes between stages keep their prose panel,
   hotspots, exam card, choice keyboard shortcuts (W/S/arrows/digits) and
   default cursor — no walker, markers, captions or armed coin verb may leak
   across the boundary. Part 5 mounts the real Studio and drives the 🔁
   States editor (badge, add, remove) and the plate's 🥾 walk test (a sealed
   marker reports NO ROUTE with the doors shut; opening them lets the live
   walker cross and reach it; WASD/arrows drive it).

### Building a sprite sheet from a generated plate

The AI tab builds sheets in the browser (generate on flat magenta → key the
backdrop → slice the frames → write the sheet). To do the same headlessly —
for a rebuild, or for art generated elsewhere — use the command-line twin:

```bash
node scripts/make-sprite-sheet.mjs \
  --in plates/tintin-talk.png \
  --out public/assets/sprites/tt-tintin-talk.png \
  --key ff00ff --height 384 --frames 3
```

It prints the `frameWidth × frameHeight` grid to paste into a story's sheet
config. If a plate's figures bridge (a glow or a crossing arm spans the gap),
the script recovers automatically — it splits merged runs at the bridge's
narrowest column and despeckles the cut fringe; see **docs/sprite-sheets.md**.

### Blank/white screen, or art missing but text showing

If `npm run check` passes, the problem is **stored browser data**, not the
code. The game caches story copies in `localStorage`, and a snapshot saved by
an older version can override the shipped story — including its scene graph
and its asset paths.

Open **<http://localhost:5173/diagnose.html>** and press **"Fix it"**.

That page lists every stored key, flags what's wrong with each (episodic
overrides, pre-acts snapshots, malformed saves, corrupt JSON), and clears the
bad ones while keeping backups. Then reload the game.

A hard reload alone will *not* fix it — the data lives in `localStorage`, which
survives refreshes, cache clears and restarts.

### Why the two are different

| Symptom | Cause | Fix |
| --- | --- | --- |
| Broken-image icon, missing art | files not on disk | `git pull` |
| Art missing but prose renders | stale cached story | `/diagnose.html` → Fix it |
| Blank white page | crash, usually a bad save | recovery screen, or `/diagnose.html` |
| `npm run dev` fails to start | Node too old | install current Node LTS |

## Notes

- Assets are committed to the repo under `public/`. They are **not** downloaded
  at runtime, so anything missing means an incomplete checkout.
- `npm install` can drift from the lockfile. Prefer `npm ci`.
- The production build inlines everything into a single `dist/index.html`
  (`npm run build`).

## Developer notes

### Don't call `window.prompt()`

The desktop shell (Electron — `npm run desktop:dev-live` or packaged) does
**not** implement `window.prompt()`; it throws `prompt() is not supported`,
while `alert`/`confirm` work as native dialogs. The Studio therefore never
calls `prompt()` for editing (renaming a scene node is in-place: click the
card title, Enter or click away saves, Esc cancels) and its two dialog
fallbacks are guarded: the share link falls back to a select-all box, and the
ElevenLabs batch "type GENERATE" spend check **fails closed** when no dialog
is available. If you add UI, prefer in-place editing over `prompt()`.

### Note placeholder nodes ("Missing Scene Here")

Scenes with `nodeType: "note"` are author markers for scenes that don't exist
yet (added via the 📝 Note toolbar button or right-click → "Add note here").
They wire into the graph on both sides but are **bypassed in play**:
`bypassedSceneId()` in `src/logic.ts` follows a note's first outgoing route
until a real scene (hop-guarded against note→note cycles), and `Game.tsx`
applies it at every scene transition, playtest entry, and save restore.
Any new code that resolves a target scene id must route through it. The
validator enforces: a note can't be the start scene, a wired-in note with no
route out is a soft-lock **error**, multi-route notes warn, and notes are
exempt from the unreachable / no-exits checks. The placeholder text lives in
`scene.title` (a dead-end note shows it as its plate instead of a blank
scene). The inspector offers "Convert to full scene" (clears `nodeType`) once
the real scene is written.

### Travel map (`story.map`)

The 🗺 Travel Map is a screen of flag-gated destinations (HUD menu → Travel
map, or T; a hotspot can use action `openMap`). Design contract:

- **Unlocks are derived, never stored.** A pin is open exactly when its
  `gating` passes `meetsGating` against the live state — the same vocabulary
  as choices/hotspots (flags, items, meters, trust). Nothing map-related is
  written to the save, so loads, replays and NG+ can never disagree with the
  flags that earned access.
- Locked pins render as "???" with the author's `lockedHint` (or the generic
  gating hint); `hiddenWhenLocked` pins aren't drawn at all until earned.
- Travel resolves through `bypassedSceneId` like every other route, so note
  placeholders pass through.
- The validator checks every pin (missing target = error, dead-end note
  target = stranding error, off-map x/y = warning) and seeds reachability
  with map targets so a map-only location isn't flagged unreachable.
- `map.backgroundImage` is a media-bearing field: it's wired into
  `visitStoryMediaRefs` / `resolveStoryMedia` / `compactStoryMedia` and
  seeded in the import/export round-trip suite. Keep it that way.
- Panel visibility is AUTO (map shows only when locations exist; corkboard
  only with a deduction board) with explicit hide overrides in the In-Game
  Theme tab (`dialogueBox.hideMap` / `hideCorkboard` / `hideCaseProgress`).
  There is deliberately no "force show" — an empty corkboard or map would
  only confuse the player.
- **`map.replaceTravelChoices`** (opt-in, Map tab toggle): the map ABSORBS
  pure travel choices. A choice whose only job is navigating to a scene an
  UNLOCKED pin also reaches is hidden in play and the rail shows one
  "🗺 Open the map" action instead. Hard safety rules, all pinned by engine
  tests (`mapReplacedChoiceIds` / `choiceIsPureTravel` in src/logic.ts):
  choices with ANY side effect (consequences, memoryLog, rememberLine,
  reply, presentItem, timers/QTE, exclusiveGroup, timed-out routing) are
  never absorbed — map travel applies no consequences, so absorbing them
  would delete authored effects; a LOCKED pin never absorbs (the choice may
  be the only way in until the pin is earned); the swap is play-time only —
  the draft's choice graph (and so the deep-walker and reachability) is
  untouched. The in-game dead-end detector and "current lead" hint both
  treat absorbed travel as a live exit. Demo: The Kingfisher Job
  (`src/data/kingfisherJob.ts`), asserted end-to-end by the DOM smoke's
  KINGFISHER phase.

The demo case is **Crosstown** (`src/data/mapDemo.ts`): two pins open at
start, one locked-visible, one hidden, plus parallel gated choices so the
deep-walker can prove the endings without the map.

### ElevenLabs model & cost estimate

The chosen model lives in localStorage (`scarlet-ai-voice-model`).
`setElevenModel()` only writes storage — it does not re-render anything — so
the Beats-tab UI mirrors it into React state (`voiceModel`, re-read on every
tab switch) to keep the live cost preview and the insert-cue list in sync.
Per-model rates are `ELEVENLABS_CREDITS_PER_CHAR` / `ELEVENLABS_USD_PER_1K`
in `src/studio/aiVoice.ts`.

### ElevenLabs HTTP 400 on Generate MP3 / batch

`synthesizeElevenLabs` in `src/studio/aiVoice.ts` builds model-aware
`voice_settings`: **Eleven v3 omits `use_speaker_boost` and `speed`** (the
product guide marks both unsupported on v3; sending them with the default
`eleven_v3` model was a common source of bare `ElevenLabs error 400`).
v2/turbo still send the full set. Continuity uses the TTS endpoint's real
`previous_text` / `next_text` fields (batch already collects them). Error
bodies shaped `{ detail: { status, message } }` are formatted so the alert
shows e.g. `voice_not_found: A voice for the voice_id … was not found`
instead of an empty status. Batch aborts on 400/401/403/404/422 so one bad
voice ID does not burn the whole scene.
