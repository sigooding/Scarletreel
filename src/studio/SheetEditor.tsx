import { useEffect, useMemo, useState } from "react";
import { assetUrl } from "../assetPath";
import { uploadDataUrlAsset, useResolvedMedia } from "../data/mediaLibrary";
import { ImagePicker } from "./ImagePicker";
import { FORGE_STRENGTHS, forgeSpriteSheet, type ForgeKind } from "./spriteForge";
import { sheetCols, sheetFramePos, spriteSheetIssues, type SpriteSheet, type SpriteSheetAnimation } from "../game/spriteSheet";

/* ------------------------------------------------------------------ */
/*  SPRITE-SHEET EDITOR — shared by the stage walker, talking          */
/*  portraits, foreground extras and the Media tab's Sheet slicer.     */
/*  One image + frame grid + named animations, with a scrubbing        */
/*  preview so authors can find frame numbers without counting.        */
/* ------------------------------------------------------------------ */

const inputCls =
  "w-full border border-noir-600 bg-noir-950 px-2 py-1 text-xs text-paper focus:border-neon outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[10px] uppercase tracking-wider text-paper/50">
      {label}
      <div className="mt-0.5 normal-case tracking-normal">{children}</div>
    </label>
  );
}

/** What a given use of a sheet expects, so the editor can seed sensible
 * defaults and suggest the animation names the engine actually looks up. */
export interface SheetPreset {
  frameWidth: number;
  frameHeight: number;
  /** animations seeded when the image is first picked */
  animations: Record<string, SpriteSheetAnimation>;
  /** names the engine looks up for this use — offered as quick-add buttons */
  suggested: string[];
}

export const WALKER_PRESET: SheetPreset = {
  frameWidth: 32,
  frameHeight: 48,
  animations: { idle: { frames: [0] }, walk: { frames: [0, 1, 2, 3], fps: 10 } },
  suggested: ["walk", "idle"],
};
export const TALKING_PRESET: SheetPreset = {
  frameWidth: 64,
  frameHeight: 64,
  animations: { rest: { frames: [0] }, talk: { frames: [0, 1], fps: 6 } },
  suggested: ["talk", "rest"],
};
export const EXTRA_PRESET: SheetPreset = {
  frameWidth: 64,
  frameHeight: 64,
  animations: { loop: { frames: [0, 1], fps: 8 } },
  suggested: ["loop"],
};

/** Which auto-build pipeline a preset maps to: decides frame height and the
 * animations the forge writes (talk+rest / walk+idle / loop). */
function presetForgeKind(preset: SheetPreset): ForgeKind {
  if (preset.suggested.includes("talk")) return "talking";
  if (preset.suggested.includes("walk")) return "walk";
  return "loop";
}

/* ------------------------------------------------------------------ */
/*  Preview: pick an animation, play it, or pause and scrub frames.    */
/* ------------------------------------------------------------------ */

export function SheetPreview({ sheet, storyId, height = 96 }: { sheet: SpriteSheet; storyId: string; height?: number }) {
  const media = useResolvedMedia(storyId);
  const url = assetUrl(media(sheet.image) ?? sheet.image);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const animNames = Object.keys(sheet.animations ?? {}).filter((n) => sheet.animations[n]?.frames?.length);
  const [animName, setAnimName] = useState(animNames[0] ?? "");
  const [playing, setPlaying] = useState(true);
  const [step, setStep] = useState(0);

  const anim = sheet.animations?.[animNames.includes(animName) ? animName : animNames[0] ?? ""];

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setDims({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => setStep(0), [animName, anim?.frames.join(",")]);
  useEffect(() => {
    if (!playing || !anim || anim.frames.length < 2) return;
    const fps = anim.fps && anim.fps > 0 ? anim.fps : 8;
    const id = window.setInterval(() => setStep((s) => (s + 1) % anim.frames.length), Math.max(30, 1000 / fps));
    return () => window.clearInterval(id);
  }, [playing, anim?.frames.length, anim?.fps, animName]);

  if (!url || !dims || !anim) return <p className="font-type text-[9px] italic text-paper/35">Pick an image and add an animation to preview.</p>;

  const cols = sheetCols(sheet, dims.w);
  const rows = Math.max(1, Math.floor(dims.h / Math.max(1, sheet.frameHeight)));
  const idx = Math.min(step, anim.frames.length - 1);
  const frame = anim.frames[idx] ?? 0;
  const { col, row } = sheetFramePos(frame, cols);
  const scale = height / Math.max(1, sheet.frameHeight);

  return (
    <div className="space-y-1">
      <div className="flex items-end gap-2">
        <div
          className="shrink-0 border border-noir-600 bg-noir-950/60"
          style={{
            width: Math.max(8, sheet.frameWidth * scale),
            height,
            backgroundImage: `url(${url})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${dims.w * scale}px ${dims.h * scale}px`,
            backgroundPosition: `-${col * sheet.frameWidth * scale}px -${row * sheet.frameHeight * scale}px`,
            imageRendering: sheet.pixelated ? "pixelated" : undefined,
          }}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1">
            <select className={`${inputCls} !w-auto`} value={animNames.includes(animName) ? animName : animNames[0]} onChange={(e) => setAnimName(e.target.value)}>
              {animNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <button
              onClick={() => setPlaying((p) => !p)}
              className="border border-noir-600 px-2 py-1 text-[10px] uppercase tracking-wider text-paper/70 hover:border-neon hover:text-neon"
            >
              {playing ? "⏸ pause" : "▶ play"}
            </button>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, anim.frames.length - 1)}
            value={idx}
            onChange={(e) => {
              setPlaying(false);
              setStep(parseInt(e.target.value, 10) || 0);
            }}
            className="w-full accent-amber-400"
          />
          <p className="font-type text-[9px] text-paper/45">
            frame <span className="text-amber-300">{frame}</span> (step {idx + 1}/{anim.frames.length}) · grid {cols}×{rows} ·
            image {dims.w}×{dims.h}px
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Controls: the full editor for one SpriteSheet value.               */
/* ------------------------------------------------------------------ */

export function SpriteSheetControls({
  value,
  onChange,
  storyId,
  preset,
  pickerLabel = "Sheet image (clear to remove)",
}: {
  value?: SpriteSheet;
  onChange: (v: SpriteSheet | undefined) => void;
  storyId: string;
  preset: SheetPreset;
  pickerLabel?: string;
}) {
  const patch = (p: Partial<SpriteSheet>) => value && onChange({ ...value, ...p });
  const setAnim = (name: string, anim: SpriteSheetAnimation | undefined) => {
    if (!value) return;
    const animations = { ...value.animations };
    if (anim) animations[name] = anim;
    else delete animations[name];
    onChange({ ...value, animations });
  };
  const renameAnim = (from: string, to: string) => {
    if (!value || !to || from === to || value.animations[to]) return;
    const animations: Record<string, SpriteSheetAnimation> = {};
    for (const [k, v] of Object.entries(value.animations)) animations[k === from ? to : k] = v;
    onChange({ ...value, animations });
  };
  const parseFrames = (csv: string) =>
    csv.split(/[,\s]+/).map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n >= 0);

  const issues = useMemo(() => (value ? spriteSheetIssues(value, "sheet", preset.suggested) : []), [value, preset]);
  const missingSuggested = value ? preset.suggested.filter((n) => !value.animations[n]) : [];

  // ⚡ Auto-build from an upload: key out the flat backdrop, slice frames by
  // the transparent gaps, build the sheet, save it to the library, and fill
  // this editor in — the whole job in one click.
  const [forging, setForging] = useState(false);
  const [forgeMsg, setForgeMsg] = useState<string | null>(null);
  const [keyStrength, setKeyStrength] = useState("normal");
  const autoBuild = async (file: File) => {
    setForging(true);
    setForgeMsg(null);
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(new Error("could not read the file"));
        r.readAsDataURL(file);
      });
      const strength = FORGE_STRENGTHS.find((f) => f.id === keyStrength) ?? FORGE_STRENGTHS[1];
      const sheet = await forgeSpriteSheet(dataUrl, presetForgeKind(preset), strength);
      const base = file.name.replace(/\.[a-z0-9]+$/i, "") || "sheet";
      const up = await uploadDataUrlAsset(storyId, `sheet-${base}.png`, "image", sheet.dataUrl, "sprites");
      onChange({
        image: up.success && up.assetId ? `asset:${up.assetId}` : sheet.dataUrl,
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
        animations: sheet.animations,
        pixelated: false,
      });
      setForgeMsg(
        `✓ ${sheet.frameCount} frame${sheet.frameCount === 1 ? "" : "s"} · ${sheet.frameWidth} × ${sheet.frameHeight} each — sheet saved to the library and filled in below.`
      );
    } catch (err) {
      setForgeMsg(`⚠ ${err instanceof Error ? err.message : "auto-build failed"}`);
    } finally {
      setForging(false);
    }
  };

  return (
    <div className="space-y-1">
      {/* One-click path: upload art on a flat backdrop and everything below
          fills itself in. A single figure works too (you get a clean 1-frame
          cutout sheet). */}
      <div className="space-y-1 border border-amber-400/25 bg-amber-400/5 p-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className={`cursor-pointer border border-amber-400/50 px-2 py-1 font-pulp text-[9px] uppercase tracking-widest text-amber-300 hover:bg-amber-400/10 ${forging ? "opacity-50" : ""}`}>
            {forging ? "⚙ building…" : "⚡ Upload art → auto-build sheet"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={forging}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void autoBuild(f);
                e.target.value = "";
              }}
            />
          </label>
          <span className="font-type text-[8px] leading-snug text-paper/45">
            Frames side by side on ONE flat backdrop colour (magenta, green — anything flat). It keys the backdrop
            out, slices the frames by the gaps, and fills everything in. A single figure gives a 1-frame cutout.
          </span>
        </div>
        <label className="flex items-center gap-1 font-type text-[8px] text-paper/55">
          backdrop removal:
          <select
            className="border border-noir-600 bg-noir-950 px-1 py-0.5 text-[9px] text-paper/80"
            value={keyStrength}
            onChange={(e) => setKeyStrength(e.target.value)}
          >
            {FORGE_STRENGTHS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          — gentle if it eats into the art · strong if backdrop specks survive. For full manual control use
          Media Tools ▸ ✂ Sprite Cutout Lab.
        </label>
        {forgeMsg && <p className="font-type text-[9px] text-paper/60">{forgeMsg}</p>}
      </div>
      <Field label={pickerLabel}>
        <ImagePicker
          value={value?.image}
          storyId={storyId}
          includeGradients={false}
          preferFolder="sprites"
          onChange={(v) =>
            v
              ? onChange({
                  frameWidth: preset.frameWidth,
                  frameHeight: preset.frameHeight,
                  animations: preset.animations,
                  ...(value ?? {}),
                  image: v,
                })
              : onChange(undefined)
          }
          placeholder="Pick the sprite sheet…"
        />
      </Field>
      {value && (
        <>
          <div className="grid grid-cols-3 gap-1">
            <Field label="Frame width (px)">
              <input
                type="number" min={1} className={inputCls} value={value.frameWidth}
                onChange={(e) => patch({ frameWidth: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              />
            </Field>
            <Field label="Frame height (px)">
              <input
                type="number" min={1} className={inputCls} value={value.frameHeight}
                onChange={(e) => patch({ frameHeight: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              />
            </Field>
            <label className="flex items-end gap-1 pb-1 text-[10px] uppercase tracking-wider text-paper/60">
              <input type="checkbox" checked={!!value.pixelated} onChange={(e) => patch({ pixelated: e.target.checked || undefined })} />
              Pixel art
            </label>
          </div>

          {Object.entries(value.animations).map(([name, anim]) => (
            <div key={name} className="grid grid-cols-[5rem_1fr_3.2rem_2.4rem_1.2rem] items-end gap-1">
              <Field label="Name">
                <input className={inputCls} defaultValue={name} onBlur={(e) => renameAnim(name, e.target.value.trim())} />
              </Field>
              <Field label="Frames (e.g. 0, 1, 2)">
                <input
                  className={inputCls}
                  defaultValue={anim.frames.join(", ")}
                  onBlur={(e) => {
                    const frames = parseFrames(e.target.value);
                    setAnim(name, frames.length ? { ...anim, frames } : undefined);
                  }}
                />
              </Field>
              <Field label="fps">
                <input
                  type="number" min={1} max={60} className={inputCls} value={anim.fps ?? 8}
                  onChange={(e) => setAnim(name, { ...anim, fps: Math.max(1, parseInt(e.target.value, 10) || 8) })}
                />
              </Field>
              <label className="flex flex-col items-center gap-0.5 pb-1 text-[8px] uppercase tracking-wider text-paper/50">
                loop
                <input type="checkbox" checked={anim.loop !== false} onChange={(e) => setAnim(name, { ...anim, loop: e.target.checked ? undefined : false })} />
              </label>
              <button
                onClick={() => setAnim(name, undefined)}
                className="pb-1 text-[10px] text-crimson hover:underline"
                title={`remove "${name}"`}
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1">
            {missingSuggested.map((n) => (
              <button
                key={n}
                onClick={() => setAnim(n, { frames: [0] })}
                className="border border-noir-600 px-2 py-0.5 text-[9px] uppercase tracking-wider text-paper/60 hover:border-neon hover:text-neon"
              >
                + "{n}"
              </button>
            ))}
            <button
              onClick={() => {
                let i = 1;
                while (value.animations[`anim${i}`]) i++;
                setAnim(`anim${i}`, { frames: [0] });
              }}
              className="border border-noir-600 px-2 py-0.5 text-[9px] uppercase tracking-wider text-paper/60 hover:border-neon hover:text-neon"
            >
              + animation
            </button>
          </div>

          {issues.length > 0 && (
            <ul className="space-y-0.5">
              {issues.map((msg, i) => (
                <li key={i} className="font-type text-[9px] text-amber-400/80">⚠ {msg}</li>
              ))}
            </ul>
          )}

          <SheetPreview sheet={value} storyId={storyId} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Media tab: the standalone Sheet slicer / lab.                      */
/* ------------------------------------------------------------------ */

export function SheetLab({ storyId }: { storyId: string }) {
  const [sheet, setSheet] = useState<SpriteSheet | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 space-y-1 border border-cyan-neon/30 bg-cyan-neon/5 p-2">
      <div className="font-pulp text-[10px] uppercase tracking-widest text-cyan-neon">🎞 Sheet slicer</div>
      <p className="font-type text-[9px] leading-snug text-paper/45">
        Work out a sprite sheet's grid here: pick the image, set the frame size, scrub the preview to find frame
        numbers, and name the animations. Then use the same settings where the sheet lives — a stage walker
        (Scene tab → 🚶 Walkable Stage), a talking portrait (Characters tab), or an animated foreground extra
        (🎬 Cinematics) — or copy the JSON below into a draft.
      </p>
      <SpriteSheetControls value={sheet} onChange={setSheet} storyId={storyId} preset={EXTRA_PRESET} pickerLabel="Sheet image" />
      {sheet && (
        <button
          onClick={() => {
            navigator.clipboard?.writeText(JSON.stringify(sheet, null, 2)).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="border border-noir-600 px-2 py-1 text-[9px] uppercase tracking-wider text-paper/60 hover:border-neon hover:text-neon"
        >
          {copied ? "✓ copied" : "⧉ copy sheet JSON"}
        </button>
      )}
    </div>
  );
}
