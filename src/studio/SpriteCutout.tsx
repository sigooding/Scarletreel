import { useCallback, useEffect, useRef, useState } from "react";
import { resolveAssetReference, uploadDataUrlAsset } from "../data/mediaLibrary";
import { ImagePicker } from "./ImagePicker";

/* ------------------------------------------------------------------ */
/*  Media tab: Sprite Cutout Lab.                                      */
/*                                                                     */
/*  Turns ANY painted / photographic / AI-generated image into a       */
/*  transparent sprite PNG — no pixel-art workflow required. Pick an   */
/*  image, key out its background colour (auto-sampled from the        */
/*  corners, or click the preview to pick), tune tolerance + edge      */
/*  softness, optionally trim to content, then save the cutout         */
/*  straight into the media library so it can be used as a foreground  */
/*  extra, stage walker frame, portrait, or sheet source anywhere.     */
/* ------------------------------------------------------------------ */

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) || 0,
    g: parseInt(h.slice(2, 4), 16) || 0,
    b: parseInt(h.slice(4, 6), 16) || 0,
  };
}

function toHex(c: Rgb): string {
  const p = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${p(c.r)}${p(c.g)}${p(c.b)}`;
}

/** Sample the four corners of the image and return the average colour —
 * a good default key for sprites painted on a flat backdrop. */
function sampleCorners(data: Uint8ClampedArray, w: number, h: number): Rgb {
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
function applyKey(
  src: ImageData,
  key: Rgb,
  tolerance: number,
  softness: number
): ImageData {
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
      // De-spill: pull the edge pixel away from the key colour so halos
      // don't show against new backgrounds.
      d[i] = Math.round(d[i] + (d[i] - key.r) * 0.25 * (1 - a));
      d[i + 1] = Math.round(d[i + 1] + (d[i + 1] - key.g) * 0.25 * (1 - a));
      d[i + 2] = Math.round(d[i + 2] + (d[i + 2] - key.b) * 0.25 * (1 - a));
    }
  }
  return out;
}

/** Bounding box of non-transparent pixels (with a small margin). */
function contentBounds(img: ImageData): { x: number; y: number; w: number; h: number } | null {
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
  minX = Math.max(0, minX - m);
  minY = Math.max(0, minY - m);
  maxX = Math.min(w - 1, maxX + m);
  maxY = Math.min(h - 1, maxY + m);
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function SpriteCutoutLab({ storyId }: { storyId: string }) {
  const [sourceRef, setSourceRef] = useState<string | undefined>(undefined);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [keyHex, setKeyHex] = useState<string>("#ff00ff");
  const [autoKey, setAutoKey] = useState(true);
  const [tolerance, setTolerance] = useState(60);
  const [softness, setSoftness] = useState(40);
  const [trim, setTrim] = useState(true);
  const [name, setName] = useState("sprite cutout");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceDataRef = useRef<ImageData | null>(null);
  const outputRef = useRef<HTMLCanvasElement | null>(null);

  /* Resolve the picked reference (asset:<id> / builtin path / data URL). */
  useEffect(() => {
    let alive = true;
    if (!sourceRef) {
      setSourceUrl(undefined);
      sourceDataRef.current = null;
      return;
    }
    resolveAssetReference(sourceRef).then((url) => {
      if (alive) setSourceUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [sourceRef]);

  /* Load pixels once per source image. */
  useEffect(() => {
    if (!sourceUrl) return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!alive) return;
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      try {
        const data = ctx.getImageData(0, 0, c.width, c.height);
        sourceDataRef.current = data;
        if (autoKey) setKeyHex(toHex(sampleCorners(data.data, c.width, c.height)));
        else render();
      } catch {
        setStatus("⚠ couldn't read image pixels (cross-origin image?)");
        sourceDataRef.current = null;
      }
    };
    img.onerror = () => alive && setStatus("⚠ image failed to load");
    img.src = sourceUrl;
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceUrl]);

  /* Re-render the keyed preview whenever settings change. */
  const render = useCallback(() => {
    const src = sourceDataRef.current;
    const canvas = canvasRef.current;
    if (!src || !canvas) return;
    const keyed = applyKey(src, parseHex(keyHex), tolerance, softness);
    const bounds = trim ? contentBounds(keyed) : null;
    const bx = bounds ?? { x: 0, y: 0, w: src.width, h: src.height };

    // Full-resolution output canvas (what gets saved).
    const out = document.createElement("canvas");
    out.width = bx.w;
    out.height = bx.h;
    const octx = out.getContext("2d");
    if (!octx) return;
    const stage = document.createElement("canvas");
    stage.width = src.width;
    stage.height = src.height;
    stage.getContext("2d")?.putImageData(keyed, 0, 0);
    octx.drawImage(stage, bx.x, bx.y, bx.w, bx.h, 0, 0, bx.w, bx.h);
    outputRef.current = out;

    // Fit the preview canvas.
    const maxW = 560;
    const scale = Math.min(1, maxW / bx.w);
    canvas.width = Math.max(1, Math.round(bx.w * scale));
    canvas.height = Math.max(1, Math.round(bx.h * scale));
    const pctx = canvas.getContext("2d");
    if (!pctx) return;
    pctx.imageSmoothingQuality = "high";
    pctx.clearRect(0, 0, canvas.width, canvas.height);
    pctx.drawImage(out, 0, 0, canvas.width, canvas.height);
  }, [keyHex, tolerance, softness, trim]);

  useEffect(() => {
    render();
  }, [render, sourceUrl]);

  /* Click the preview to pick the key colour under the cursor. */
  const pickFromCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const src = sourceDataRef.current;
    const canvas = canvasRef.current;
    const out = outputRef.current;
    if (!src || !canvas || !out) return;
    const rect = canvas.getBoundingClientRect();
    // Map preview → output → source coordinates.
    const ox = Math.floor(((e.clientX - rect.left) / rect.width) * out.width);
    const oy = Math.floor(((e.clientY - rect.top) / rect.height) * out.height);
    const bounds = trim ? contentBounds(applyKey(src, parseHex(keyHex), tolerance, softness)) : null;
    const sx = (bounds?.x ?? 0) + ox;
    const sy = (bounds?.y ?? 0) + oy;
    if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) return;
    const i = (sy * src.width + sx) * 4;
    setAutoKey(false);
    setKeyHex(toHex({ r: src.data[i], g: src.data[i + 1], b: src.data[i + 2] }));
  };

  const save = async () => {
    const out = outputRef.current;
    if (!out) return;
    setBusy(true);
    setStatus(null);
    try {
      const dataUrl = out.toDataURL("image/png");
      const result = await uploadDataUrlAsset(storyId, `${name.trim() || "sprite cutout"}.png`, "image", dataUrl);
      setStatus(result.success ? `✓ saved to media library (${out.width}×${out.height})` : `⚠ ${result.error ?? "save failed"}`);
    } catch (err) {
      setStatus(`⚠ ${err instanceof Error ? err.message : "save failed"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 space-y-2 border border-amber-400/30 bg-amber-400/5 p-2">
      <div className="font-pulp text-[10px] uppercase tracking-widest text-amber-300">✂ Sprite cutout lab</div>
      <p className="font-type text-[9px] leading-snug text-paper/45">
        Make transparent sprite assets from any art style — painted, photographic, or AI-generated. No pixel-art
        needed. Pick an image, key out its backdrop (auto-sampled from the corners, or click the preview to pick a
        colour), tune tolerance and edge softness, then save the cutout PNG into the media library. Use it anywhere a
        sprite goes: foreground extras (🎬 Cinematics), stage walkers, portraits, or as frames for the Sheet slicer
        above.
      </p>
      <ImagePicker
        value={sourceRef}
        onChange={setSourceRef}
        storyId={storyId}
        includeGradients={false}
        placeholder="Source image…"
      />
      {sourceUrl && (
        <>
          <div className="flex flex-wrap items-center gap-3 font-type text-[9px] text-paper/60">
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={autoKey}
                onChange={(e) => {
                  setAutoKey(e.target.checked);
                  if (e.target.checked && sourceDataRef.current) {
                    const d = sourceDataRef.current;
                    setKeyHex(toHex(sampleCorners(d.data, d.width, d.height)));
                  }
                }}
              />
              auto key (corners)
            </label>
            <label className="flex items-center gap-1">
              key
              <input
                type="color"
                value={keyHex}
                onChange={(e) => {
                  setAutoKey(false);
                  setKeyHex(e.target.value);
                }}
                className="h-5 w-8 cursor-pointer border border-noir-600 bg-transparent"
              />
            </label>
            <label className="flex items-center gap-1">
              tolerance
              <input
                type="range"
                min={0}
                max={200}
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="w-24"
              />
              <span className="w-6 text-right">{tolerance}</span>
            </label>
            <label className="flex items-center gap-1">
              softness
              <input
                type="range"
                min={0}
                max={120}
                value={softness}
                onChange={(e) => setSoftness(Number(e.target.value))}
                className="w-24"
              />
              <span className="w-6 text-right">{softness}</span>
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
              trim to content
            </label>
          </div>
          <div
            className="inline-block max-w-full border border-noir-600"
            style={{
              backgroundImage:
                "linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
              backgroundColor: "#1a1a1f",
            }}
          >
            <canvas
              ref={canvasRef}
              onClick={pickFromCanvas}
              title="Click to pick the key colour under the cursor"
              className="block max-w-full cursor-crosshair"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="asset name…"
              className="border border-noir-600 bg-noir-900 px-2 py-1 font-type text-[9px] text-paper/80 outline-none focus:border-amber-300"
            />
            <button
              onClick={save}
              disabled={busy}
              className="border border-amber-400/50 px-2 py-1 text-[9px] uppercase tracking-wider text-amber-300 hover:border-amber-300 hover:bg-amber-400/10 disabled:opacity-40"
            >
              {busy ? "saving…" : "💾 save cutout to library"}
            </button>
            {status && <span className="font-type text-[9px] text-paper/60">{status}</span>}
          </div>
        </>
      )}
    </div>
  );
}
