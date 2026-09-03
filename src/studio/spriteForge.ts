/* ------------------------------------------------------------------ */
/*  spriteForge — shared pixel tools for sprite creation.              */
/*                                                                     */
/*  Pure canvas/ImageData helpers used by the ✂ Sprite Cutout Lab and  */
/*  the AI tab's one-click "auto sprite sheet" flow:                   */
/*    generate art on flat magenta → key the backdrop out → find the   */
/*    frames by the transparent gaps between them → crop, scale and    */
/*    bottom-align every frame to one uniform grid → emit the sheet    */
/*    PNG plus ready-made animations for its intended use.             */
/* ------------------------------------------------------------------ */

export type Rgb = { r: number; g: number; b: number };

export function parseHex(hex: string): Rgb {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
}

export function toHex(c: Rgb): string {
  const p = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${p(c.r)}${p(c.g)}${p(c.b)}`;
}

/** Sample the four corners of the image and return the average colour —
 * a good default key for sprites painted on a flat backdrop. */
export function sampleCorners(data: Uint8ClampedArray, w: number, h: number): Rgb {
  const px = (x: number, y: number) => (y * w + x) * 4;
  const spots = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  let r = 0,
    g = 0,
    b = 0;
  for (const i of spots) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return { r: r / spots.length, g: g / spots.length, b: b / spots.length };
}

/** Chroma-key `src` against `key`: fully transparent within `tolerance`
 * colour distance, feathered alpha across the `softness` band beyond it.
 * Also de-spills the key hue from semi-transparent edge pixels. */
export function applyKey(src: ImageData, key: Rgb, tolerance: number, softness: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const d = out.data;
  const soft = Math.max(1, softness);
  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - key.r;
    const dg = d[i + 1] - key.g;
    const db = d[i + 2] - key.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= tolerance) {
      d[i + 3] = 0;
    } else if (dist <= tolerance + soft) {
      const a = (dist - tolerance) / soft; // 0..1 across the feather band
      d[i + 3] = Math.round(d[i + 3] * a);
      d[i] = Math.round(d[i] + (d[i] - key.r) * 0.25 * (1 - a));
      d[i + 1] = Math.round(d[i + 1] + (d[i + 1] - key.g) * 0.25 * (1 - a));
      d[i + 2] = Math.round(d[i + 2] + (d[i + 2] - key.b) * 0.25 * (1 - a));
    }
  }
  return out;
}

/** Average of EVERY pixel along the four edges, not just the four corners.
 *  A sturdier auto key for photographs and AI art, whose backdrops are rarely
 *  perfectly flat — a gradient or a vignette drags a corner-only sample off
 *  the true backdrop colour. */
export function sampleEdges(data: Uint8ClampedArray, w: number, h: number): Rgb {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    add(0, y);
    add(w - 1, y);
  }
  if (!n) return { r: 255, g: 255, b: 255 };
  return { r: r / n, g: g / n, b: b / n };
}

/** Magic-wand key — the tool for "just remove the background of this photo".
 *
 *  `applyKey` keys EVERY pixel near the colour, so a white shirt vanishes with
 *  a white studio backdrop. This floods inward from the image border instead:
 *  only pixels *connected* to the edge survive as background, so anything the
 *  subject encloses (eyes, lettering, a pale jacket against a pale wall) is
 *  kept. Feathering works exactly like `applyKey`. */
export function applyEdgeFloodKey(src: ImageData, key: Rgb, tolerance: number, softness: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const { data: d, width: w, height: h } = out;
  const soft = Math.max(1, softness);
  const cut = tolerance + soft;
  const hit = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const near = (i: number): boolean => {
    const p = i * 4;
    const dr = d[p] - key.r;
    const dg = d[p + 1] - key.g;
    const db = d[p + 2] - key.b;
    return dr * dr + dg * dg + db * db <= cut * cut;
  };

  // Seed the flood with every border pixel that matches the backdrop.
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = y * w + x;
      if (!hit[i] && near(i)) {
        hit[i] = 1;
        queue[tail++] = i;
      }
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (const x of [0, w - 1]) {
      const i = y * w + x;
      if (!hit[i] && near(i)) {
        hit[i] = 1;
        queue[tail++] = i;
      }
    }
  }

  // 4-way BFS — the classic flood fill, iterative so big images don't recurse.
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) {
      const n = i - 1;
      if (!hit[n] && near(n)) {
        hit[n] = 1;
        queue[tail++] = n;
      }
    }
    if (x < w - 1) {
      const n = i + 1;
      if (!hit[n] && near(n)) {
        hit[n] = 1;
        queue[tail++] = n;
      }
    }
    if (y > 0) {
      const n = i - w;
      if (!hit[n] && near(n)) {
        hit[n] = 1;
        queue[tail++] = n;
      }
    }
    if (y < h - 1) {
      const n = i + w;
      if (!hit[n] && near(n)) {
        hit[n] = 1;
        queue[tail++] = n;
      }
    }
  }

  // Feather only the pixels the flood actually claimed.
  for (let i = 0; i < w * h; i++) {
    if (!hit[i]) continue;
    const p = i * 4;
    const dr = d[p] - key.r;
    const dg = d[p + 1] - key.g;
    const db = d[p + 2] - key.b;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= tolerance) {
      d[p + 3] = 0;
    } else {
      const a = Math.min(1, (dist - tolerance) / soft); // 0..1 across the band
      d[p + 3] = Math.round(d[p + 3] * a);
      d[p] = Math.round(d[p] + (d[p] - key.r) * 0.25 * (1 - a));
      d[p + 1] = Math.round(d[p + 1] + (d[p + 1] - key.g) * 0.25 * (1 - a));
      d[p + 2] = Math.round(d[p + 2] + (d[p + 2] - key.b) * 0.25 * (1 - a));
    }
  }
  return out;
}

/** Drop isolated opaque specks — the salt-and-pepper a key leaves in a busy
 *  backdrop. One pass: an opaque pixel with fewer than `minNeighbours` opaque
 *  neighbours out of 8 is treated as noise. Cheap enough to run on every
 *  preview render, unlike a full connected-component sweep. */
export function despeckle(src: ImageData, minNeighbours = 3): ImageData {
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  const { data: d, width: w, height: h } = out;
  const opaque = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3] > 32 ? 1 : 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      if (d[p + 3] <= 32) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) n += opaque(x + dx, y + dy);
      if (n < minNeighbours) d[p + 3] = 0;
    }
  }
  return out;
}

/** Bounding box of non-transparent pixels (with a small margin). */
export function contentBounds(img: ImageData): { x: number; y: number; w: number; h: number } | null {
  const { width: w, height: h, data } = img;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const m = 2;
  return {
    x: Math.max(0, minX - m),
    y: Math.max(0, minY - m),
    w: Math.min(w - 1, maxX + m) - Math.max(0, minX - m) + 1,
    h: Math.min(h - 1, maxY + m) - Math.max(0, minY - m) + 1,
  };
}

/* ------------------------------------------------------------------ */
/*  One-click sheet assembly.                                          */
/* ------------------------------------------------------------------ */

/** What the sheet is FOR — decides the frame height and which named
 * animations get written, matching the engine's conventions:
 * talking portraits use talk+rest, walkers walk+idle, extras loop. */
export type ForgeKind = "talking" | "walk" | "loop" | "single";

export interface ForgedSheet {
  /** the finished transparent sheet PNG */
  dataUrl: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  animations: Record<string, { frames: number[]; fps?: number }>;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = url;
  });
}

/** Column ranges of non-transparent content, merging gaps smaller than
 * ~1% of the image width so brush noise doesn't split a frame in two.
 * Exported so the auto-build preview can show the detected runs live. */
export function frameRuns(img: ImageData): Array<[number, number]> {
  const { width: w, height: h, data } = img;
  const occupied: boolean[] = new Array(w).fill(false);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        occupied[x] = true;
        break;
      }
    }
  }
  const raw: Array<[number, number]> = [];
  let start: number | null = null;
  for (let x = 0; x < w; x++) {
    if (occupied[x] && start === null) start = x;
    if (!occupied[x] && start !== null) {
      raw.push([start, x]);
      start = null;
    }
  }
  if (start !== null) raw.push([start, w]);
  const gap = Math.max(8, Math.round(w * 0.01));
  const merged: Array<[number, number]> = [];
  for (const r of raw) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] < gap) last[1] = r[1];
    else merged.push([r[0], r[1]]);
  }
  // Drop slivers (stray specks the key missed) under 2% of the width.
  return merged.filter(([a, b]) => b - a >= w * 0.02);
}

/** Evenly-spaced frame bands across the CONTENT span of a keyed image —
 * the author's override when gap-detection finds the wrong number of
 * sprites (two figures touching merge into one run; a stray speck splits
 * one in two). Finds the first/last occupied column and divides that span
 * into `n` equal bands. Returns [] when nothing survived the key. */
export function evenFrameRuns(img: ImageData, n: number): Array<[number, number]> {
  const count = Math.max(1, Math.round(n));
  const { width: w, height: h, data } = img;
  let first = -1;
  let last = -1;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (first < 0) first = x;
        last = x;
        break;
      }
    }
  }
  if (first < 0) return [];
  const span = last + 1 - first;
  const band = span / count;
  const out: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) out.push([Math.round(first + i * band), Math.round(first + (i + 1) * band)]);
  return out;
}

/** Derived feathering for the auto-build strength slider: presets average
 * ~65% of the tolerance (gentle 25/35, normal 40/60, strong 50/90). */
export function softnessForStrength(tolerance: number): number {
  return Math.max(10, Math.round(tolerance * 0.65));
}

/** Decode a dropped/picked File into raw pixels + an object-url-free data
 * url. Shared by the auto-build preview (SheetEditor) and callers that want
 * to re-key the source per slider move instead of re-encoding passes. */
export async function fileToImageData(file: File): Promise<{ data: ImageData; url: string }> {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("couldn't read that file"));
    reader.readAsDataURL(file);
  });
  const img = await loadImage(url);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(img, 0, 0);
  return { data: ctx.getImageData(0, 0, c.width, c.height), url };
}

function presetAnimations(kind: ForgeKind, n: number): ForgedSheet["animations"] {
  const all = Array.from({ length: n }, (_, i) => i);
  switch (kind) {
    case "talking":
      // Convention from the built-in casts: last frame = mouth closed (rest).
      return n >= 3
        ? { rest: { frames: [n - 1] }, talk: { frames: [0, 1, n - 1, 1], fps: 7 } }
        : { rest: { frames: [n - 1] }, talk: { frames: all, fps: 7 } };
    case "walk":
      return { walk: { frames: all, fps: 10 }, idle: { frames: [0] } };
    case "loop":
      return { loop: { frames: all, fps: 7 } };
    case "single":
      return { loop: { frames: [0] } };
  }
}

/** Optional keying overrides for forgeSpriteSheet. */
export interface ForgeOptions {
  /** colour distance treated as backdrop (default 60). Lower = gentler —
   * keeps more of the art; higher = stronger — eats further into it. */
  tolerance?: number;
  /** feathered band beyond the tolerance (default 40) */
  softness?: number;
  /** OUTPUT FRAME HEIGHT CAP (px). 0 / undefined = the classic per-kind
   *  presets (256 loop / 480 single / 384 otherwise, which also UPSCALE
   *  small art — legacy behaviour, unchanged). Any other value: frames come
   *  out at `min(cap, tallest source frame)` — big art keeps its detail up
   *  to the cap, small art is never upscaled into blur. */
  targetHeight?: number;
  /** Author-chosen sprite count. When set (and kind !== "single"), the
   *  content span is sliced into this many EVEN bands instead of the gap
   *  detection — the fix for "I uploaded 5 sprites and it found 4"
   *  (touching figures merge into one transparent-gap run). The preview
   *  shows the bands live, so authors see the split before applying. */
  frameCount?: number;
}

/** Named strengths for the auto-key, surfaced anywhere auto-build runs. */
export const FORGE_STRENGTHS: { id: string; label: string; tolerance: number; softness: number }[] = [
  { id: "gentle", label: "gentle (keeps detail)", tolerance: 35, softness: 25 },
  { id: "normal", label: "normal", tolerance: 60, softness: 40 },
  { id: "strong", label: "strong (dirty backdrop)", tolerance: 90, softness: 50 },
];

/** Output sizes for the forged sheet, surfaced anywhere auto-build runs.
 *  `height` is the FRAME HEIGHT CAP passed to forgeSpriteSheet (0 = the
 *  classic per-kind presets). "source" is a huge cap that in practice means
 *  "keep every pixel the source has" — for authors who bring big art. */
export const FORGE_SIZES: { id: string; label: string; height: number }[] = [
  { id: "standard", label: "standard (light files · 256–480px)", height: 0 },
  { id: "hd", label: "HD (up to 512px)", height: 512 },
  { id: "big", label: "big (up to 1024px)", height: 1024 },
  { id: "source", label: "source size (no downscale)", height: 8192 },
];

/** The whole job in one call: key the backdrop, find the frames, crop and
 * scale them to a uniform bottom-aligned grid, and hand back the sheet PNG
 * with engine-ready animations. Throws with a readable message when the
 * image doesn't cut cleanly (e.g. the backdrop wasn't flat). */
export async function forgeSpriteSheet(imageUrl: string, kind: ForgeKind, options?: ForgeOptions): Promise<ForgedSheet> {
  const img = await loadImage(imageUrl);
  const stage = document.createElement("canvas");
  stage.width = img.naturalWidth;
  stage.height = img.naturalHeight;
  const sctx = stage.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("canvas unavailable");
  sctx.drawImage(img, 0, 0);
  const src = sctx.getImageData(0, 0, stage.width, stage.height);

  const keyed = applyKey(
    src,
    sampleCorners(src.data, src.width, src.height),
    options?.tolerance ?? 60,
    options?.softness ?? 40
  );
  const keyedCanvas = document.createElement("canvas");
  keyedCanvas.width = src.width;
  keyedCanvas.height = src.height;
  keyedCanvas.getContext("2d")!.putImageData(keyed, 0, 0);

  const forced = kind !== "single" && options?.frameCount && options.frameCount > 0 ? Math.round(options.frameCount) : 0;
  const runs =
    kind === "single"
      ? [[0, src.width] as [number, number]]
      : forced
        ? evenFrameRuns(keyed, forced)
        : frameRuns(keyed);
  if (!runs.length) throw new Error("no frames found — the backdrop didn't key out (is it a flat colour?)");

  // Crop each frame to its own content.
  const kctx = keyedCanvas.getContext("2d", { willReadFrequently: true })!;
  const crops: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const [x0, x1] of runs) {
    const slice = kctx.getImageData(x0, 0, Math.max(1, x1 - x0), src.height);
    const b = contentBounds(slice);
    if (b) crops.push({ x: x0 + b.x, y: b.y, w: b.w, h: b.h });
  }
  if (!crops.length) throw new Error("frames were empty after cutting out the backdrop");

  // Uniform grid: everything scaled to one height, bottom-centre aligned.
  // The height comes from the author's output-size choice (a CAP — big art
  // keeps its pixels up to it, small art is never upscaled into blur), or
  // falls back to the classic per-kind presets when no cap is given.
  const cap = options?.targetHeight ?? 0;
  const targetH =
    cap > 0
      ? Math.max(64, Math.min(cap, Math.max(...crops.map((c) => c.h))))
      : kind === "loop" ? 256 : kind === "single" ? 480 : 384;
  const widths = crops.map((c) => Math.max(1, Math.round((c.w * targetH) / c.h)));
  const fw = Math.max(...widths);
  const sheet = document.createElement("canvas");
  sheet.width = fw * crops.length;
  sheet.height = targetH;
  const octx = sheet.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  crops.forEach((c, i) => {
    const w = widths[i];
    octx.drawImage(keyedCanvas, c.x, c.y, c.w, c.h, i * fw + Math.round((fw - w) / 2), 0, w, targetH);
  });

  return {
    dataUrl: sheet.toDataURL("image/png"),
    frameWidth: fw,
    frameHeight: targetH,
    frameCount: crops.length,
    animations: presetAnimations(kind, crops.length),
  };
}
