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

Runs two suites under plain Node. No test framework — the TypeScript bodies are
bundled with the esbuild that ships with Vite, so `npm ci` is all you need.

1. **Engine tests** (`npm run test:engine`) — the pure-logic checks: gating,
   memory/flag recalls, flag collection, the validator, the act-membership
   walk, and full The Neon Diner playthroughs (a gold run and a full-mistake
   fold run).

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

### ElevenLabs model & cost estimate

The chosen model lives in localStorage (`scarlet-ai-voice-model`).
`setElevenModel()` only writes storage — it does not re-render anything — so
the Beats-tab UI mirrors it into React state (`voiceModel`, re-read on every
tab switch) to keep the live cost preview and the insert-cue list in sync.
Per-model rates are `ELEVENLABS_CREDITS_PER_CHAR` / `ELEVENLABS_USD_PER_1K`
in `src/studio/aiVoice.ts`.
