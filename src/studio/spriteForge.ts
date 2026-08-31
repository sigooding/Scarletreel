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
 * ~1% of the image width so brush noise doesn't split a frame in two. */
function frameRuns(img: ImageData): Array<[number, number]> {
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

/** The whole job in one call: key the backdrop, find the frames, crop and
 * scale them to a uniform bottom-aligned grid, and hand back the sheet PNG
 * with engine-ready animations. Throws with a readable message when the
 * image doesn't cut cleanly (e.g. the backdrop wasn't flat). */
export async function forgeSpriteSheet(imageUrl: string, kind: ForgeKind): Promise<ForgedSheet> {
  const img = await loadImage(imageUrl);
  const stage = document.createElement("canvas");
  stage.width = img.naturalWidth;
  stage.height = img.naturalHeight;
  const sctx = stage.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("canvas unavailable");
  sctx.drawImage(img, 0, 0);
  const src = sctx.getImageData(0, 0, stage.width, stage.height);

  const keyed = applyKey(src, sampleCorners(src.data, src.width, src.height), 60, 40);
  const keyedCanvas = document.createElement("canvas");
  keyedCanvas.width = src.width;
  keyedCanvas.height = src.height;
  keyedCanvas.getContext("2d")!.putImageData(keyed, 0, 0);

  const runs = kind === "single" ? [[0, src.width] as [number, number]] : frameRuns(keyed);
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
  const targetH = kind === "loop" ? 256 : kind === "single" ? 480 : 384;
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
