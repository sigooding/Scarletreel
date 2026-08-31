# 🚶 STAGE NODES — the walkable scene

A **Stage node** is a scene that plays as free-roam exploration: no prose panel,
nothing to read before acting. The player walks a character around a floor,
walks up to things to interact with them, talks to characters to open
conversations, and walks to a door to leave.

Set it in **Studio → Scene tab → Node Layout Type → "🚶 Walkable Stage"**
(or the "🚶 Stage" canvas button), then configure the floor / spawn /
character in **Scene tab → 🚶 Walkable Stage**.

---

## How it plays

| Standard node | Stage node |
| --- | --- |
| Prose panel types out a paragraph | **No prose panel.** Narrative is a one-line caption (`enterCaption`) plus short 💬 show-text markers |
| Click a hotspot zone → instant | **Walk to a marker** (gold reticle at the thing's feet) → it fires on arrival |
| Beats play automatically after prose | Beats play only when the player **talks** (a 🗣 marker) — the conversation |
| Choices wait at the bottom | Choices appear **only at the end of a conversation** — give them `timeLimitSeconds` for the "decide now" pressure |
| Exits are choices / hotspot zones | Exits are **door markers** (→ Go to scene hotspots) you walk to |

Movement: click the floor to walk (clicks outside the band snap to its
nearest edge) or use **WASD / arrow keys**. The character scales with depth
(`depthScale`) so walking "up" the floor reads as walking away. While a
conversation plays the stage sleeps; when it ends the player is walking
again.

## The five marker verbs (Hotspots tab)

A stage marker is an ordinary hotspot — same gating, same actions, same
one-shot consumption. The stage just draws it standing on the floor at the
zone's base and makes the player walk to it:

- **💬 Show text** — look/describe. Plays as a bottom caption (auto-fades),
  not the centre exam card.
- **🎁 Give item / 🚩 Set flag / ⚙ Use item** — pickups and world-state,
  unchanged.
- **🗣 Start conversation** — the heart of the node: walking to this marker
  plays the scene's **dialogueBeats** as a conversation (the normal cinematic
  dialogue panel, portraits, press-the-lie, everything), then the scene's
  **choices** appear. `flagSet` on this action marks "talked to X" once.
  `isRepeatable` keeps the marker for re-talks.
- **→ Go to scene** — the door. Walk to it, scene fades to the target.
- **📌 Corkboard / 🔍 Pattern puzzle** — work too.

Object art (an NPC, a prop) goes in the hotspot's **image** field: the stage
anchors it with its feet on the marker, depth-sorted with the characters.

## The walker's look — four tiers

The player character renders from the first of these that's set
(Scene tab → 🚶 Walkable Stage):

1. **`stage.playerSheet` — a sprite sheet** (best). ONE image holding a grid
   of frames (counted left→right, top→bottom, starting at 0) plus named
   animations. The engine plays `walk` while moving and `idle` at rest, with
   graceful fallback (missing `idle` freezes on `walk`'s first frame; any
   missing name falls back to the first animation defined). Set per-animation
   `fps` (default 8) and `loop` (default true; `false` holds the last frame).
   `pixelated: true` keeps pixel art crisp. Rendered via CSS
   `background-position` stepping — no canvas, zero work while idle on a
   single frame. Demo: `public/assets/sprites/gumshoe-walk.png` (4 frames of
   114×192), wired up in *Anatomy of a Lie*'s stage scene.

   ```ts
   playerSheet: {
     image: "/assets/sprites/gumshoe-walk.png",
     frameWidth: 114, frameHeight: 192,
     animations: { idle: { frames: [1] }, walk: { frames: [0, 1, 2, 3], fps: 8 } },
     pixelated: true,
   }
   ```

2. **`walkFrames`** — 2–4 loose frame images cycled while walking (frame 1
   doubles as the idle pose).
3. **`playerImage`** — a single sprite image, procedurally bobbed.
4. **`emoji:…`** — the zero-asset placeholder (also bobbed).

`playerSheet.image` is a media-bearing field: it's wired into all three
`mediaLibrary.ts` walkers (visit / resolve / compact), the voice-pack
bundler, the import/export round-trip seed, and the preflight asset-exists
check. `spriteSheetIssues()` (src/game/spriteSheet.ts) validates sheets and
surfaces problems as Check-tab warnings.

> Sprite sheets also drive **talking portraits** (`character.talkingSheet`)
> and **animated foreground extras** (`foregroundExtra.sheet`), and the
> Media Tools tab has a **Sheet slicer** for working out any sheet's grid — see
> `docs/sprite-sheets.md` for the full picture.

## Authoring recipe (the walkable loop)

1. **Floor & spawn** — drag the neon band and 🕵️ dot in the Scene tab's
   mini-plate (or type the numbers). Markers can be dragged there too.
2. **A look pass** — 2–4 💬 show-text markers with one-liner captions.
   Keep lines SHORT; captions hold ~3–6 seconds.
3. **One conversation** — a character sprite (hotspot image) + 🗣 marker +
   the scene's beats. End the conversation with choices; time-limit the ones
   that should panic the player.
4. **A door** — one → Go to scene marker so the scene can't soft-lock
   (the validator enforces this).
5. **Gating for reactivity** — a beat/choice gated on the flag the 🗣 marker
   sets is how the room "remembers" you talked to someone.

## Validation rules (Check tab)

- Stage nodes with **prose** → warning (prose never shows in play).
- **No way out** (no door marker, no auto-advance, no choices) → error.
- **🗣 marker with no beats** → error; **beats with no 🗣 marker** → warning.
- **Choices-only exits** on a stage with a conversation → deliberate-pattern
  heads-up (the player must talk before they can leave).
- Spawn outside the floor band, thin floor bands, single-frame walk cycles →
  warnings.
- **Sprite-sheet problems** (no image, non-positive frame size, empty/negative
  frame lists, missing `walk`/`idle` names) → warnings via `spriteSheetIssues`.

## Legacy

Old exports with the bolt-on `stage2d` setting import as stage nodes
automatically (`stage2d` → `nodeType: "stage"` + `stage`). The old
walk-on-a-standard-scene behaviour is gone — the stage node replaces it.

## Desktop

Nothing new to package — stage nodes are ordinary scenes in the same Vite
bundle; the Electron shell (and `npm run desktop:dist`) ships them as-is.
