# 🎞 SPRITE SHEETS — one image, a grid of frames, named animations

A **sprite sheet** packs every frame of an animation into ONE image on a
grid. Frames are counted **left→right, top→bottom, starting at 0**. Each
named animation lists the frame numbers it plays, with per-animation `fps`
(default 8) and `loop` (default true; `false` holds the last frame).
`pixelated: true` keeps pixel art crisp. One sheet asset also exports
smaller and faster than a folder of loose frame files.

```ts
{
  image: "/assets/sprites/gumshoe-walk.png",   // url or asset: reference
  frameWidth: 114, frameHeight: 192,           // ONE frame, in source pixels
  animations: {
    idle: { frames: [1] },
    walk: { frames: [0, 1, 2, 3], fps: 8 },
  },
  pixelated: true,
}
```

Rendering is CSS `background-position` stepping (src/game/SheetSprite.tsx) —
no canvas, zero work while an animation holds a single frame. The data model
and frame maths live in src/game/spriteSheet.ts (pure, Node-testable).

## The three places a sheet plugs in

| Field | Animation names the engine looks up | Studio editor |
| --- | --- | --- |
| `scene.stage.playerSheet` — the stage walker | `walk` while moving, `idle` at rest | Scene tab → 🚶 Walkable Stage → 🎞 Sprite-sheet walker |
| `character.talkingSheet` — talking portrait | `talk` while the active speaker, `rest` otherwise | Characters tab → 🗣 Talking animation → 🎞 Sprite-sheet portrait |
| `foregroundExtra.sheet` — animated prop (flickering neon, a rain-lashed flag) | `loop`, played on repeat | 🎬 Cinematics → foreground extra → 🎞 Animate with a sprite sheet |

**Fallback is graceful everywhere.** A missing name falls back to the other
convention name, then to the first animation defined — and when the REST
pose is the one missing (`idle` / `rest`), the fallback animation is
**frozen on its first frame** rather than played, so a sheet with only
"walk" stands still instead of moonwalking in place.

**Sheets are additive.** `playerSheet` overrides `walkFrames`/`playerImage`
only while set; `talkingSheet` takes over from `talkingFrames`/`talkingRest`
only while set (the keyframe fields stay saved and come back the moment the
sheet is cleared); an extra's `sheet` replaces its static `image` in play
but keeps it as the fallback.

## The Sheet slicer (Media tab)

Studio → Media tab → **🎞 Sheet slicer**: pick any uploaded image, set the
frame size, scrub the preview to find frame numbers, name the animations,
then copy the JSON or re-enter the same settings where the sheet lives. The
same editor (src/studio/SheetEditor.tsx) is embedded at all three call
sites, each with its own naming preset.

## Demo assets in the catalogue

- `public/assets/sprites/gumshoe-walk.png` — 4-frame noir detective walk
  cycle (114×192/frame), the walker in *Anatomy of a Lie*'s stage scene.
- `public/assets/sprites/club-neon.png` — 3-frame CLUB sign flicker
  (115×256/frame), an animated foreground extra in *Anatomy of a Lie*'s
  "The Ready-Made Alibi" (note the uneven frame list `[0,0,0,1,0,0,2,…]`
  for a faulty-tube rhythm).

## Engine bookkeeping (the RUNNING.md media rule)

`playerSheet.image`, `talkingSheet.image` and every extra's `sheet.image`
are media-bearing fields: wired into all three `mediaLibrary.ts` walkers
(visit / resolve / compact), the voice-pack bundler mirror, the
import/export round-trip seed (`scripts/ie-roundtrip/export-side.ts`) and
preflight's asset-exists check. `spriteSheetIssues()` validates every sheet
and surfaces problems as Check-tab **warnings** (never errors), each call
site passing the animation names it expects.
