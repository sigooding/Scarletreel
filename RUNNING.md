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

Runs the pure-logic engine tests (gating, memory/flag recalls, flag
collection, the validator, the act-membership walk, and full The Neon Diner
playthroughs — a gold run and a full-mistake fold run) under plain Node.
No test framework: the TypeScript body is bundled with the esbuild that
ships with Vite, so `npm ci` is all you need.

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
