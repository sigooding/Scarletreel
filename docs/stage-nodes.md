# 🚶 STAGE NODES — the Telltale-style walkable scene

A **Stage node** is a scene that plays like a Telltale game: no prose panel,
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
| Choices wait at the bottom | Choices appear **only at the end of a conversation** — give them `timeLimitSeconds` for the Telltale "decide now" pressure |
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

## Authoring recipe (the Telltale loop)

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

## Legacy

Old exports with the bolt-on `stage2d` setting import as stage nodes
automatically (`stage2d` → `nodeType: "stage"` + `stage`). The old
walk-on-a-standard-scene behaviour is gone — the stage node replaces it.

## Desktop

Nothing new to package — stage nodes are ordinary scenes in the same Vite
bundle; the Electron shell (and `npm run desktop:dist`) ships them as-is.
