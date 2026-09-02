#!/usr/bin/env node
/**
 * SOUTH PARK ASSET PREP — slices, keys and publishes the AI-generated plates.
 *
 * Raw sheets land in scripts/.tmp-sp-raw/ as flat art on a chroma-green
 * backdrop. This script:
 *   1. decodes the PNG (8-bit RGB / RGBA / palette),
 *   2. keys the green out (dominance test, then spriteForge's feathered
 *      applyKey against the sampled corner colour, then despeckle),
 *   3. slices the grid, crops every cell to the UNION content box (poses
 *      stay aligned frame to frame),
 *   4. downscales sheets to half size (box filter), backgrounds stay full,
 *   5. writes PNGs to public/assets/southpark/ and prints the frame table
 *      used to author the SpriteSheet objects in src/data/southPark.ts.
 *
 * Node-only: a minimal PNG codec on top of zlib — no image deps.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

// spriteForge constructs ImageData — provide the engine-test shim shape.
if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}
const { applyKey, sampleCorners, despeckle } = await import("../src/studio/spriteForge.ts").catch(() => import("../src/studio/spriteForge.js"));

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(here, ".tmp-sp-raw");
const OUT = path.join(here, "..", "public", "assets", "southpark");
mkdirSync(OUT, { recursive: true });

/* ---------------- minimal PNG codec ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
};

/** Decode an 8-bit PNG (colorType 2/3/6, no interlace) to RGBA ImageData. */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let pos = 8;
  let w = 0, h = 0, colorType = 0, bitDepth = 0, interlace = 0;
  let plte = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") plte = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error("bitDepth " + bitDepth + " unsupported");
  if (interlace) throw new Error("interlaced PNG unsupported");
  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 3 ? 1 : 0;
  if (!channels) throw new Error("colorType " + colorType + " unsupported");
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const img = new Uint8ClampedArray(w * h * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
    prev = cur;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4, s = x * channels;
      if (colorType === 2) {
        img[o] = cur[s]; img[o + 1] = cur[s + 1]; img[o + 2] = cur[s + 2]; img[o + 3] = 255;
      } else if (colorType === 6) {
        img[o] = cur[s]; img[o + 1] = cur[s + 1]; img[o + 2] = cur[s + 2]; img[o + 3] = cur[s + 3];
      } else {
        const pi = cur[s] * 3;
        img[o] = plte[pi]; img[o + 1] = plte[pi + 1]; img[o + 2] = plte[pi + 2];
        img[o + 3] = trns && cur[s] < trns.length ? trns[cur[s]] : 255;
      }
    }
  }
  return { data: img, width: w, height: h };
}

/** Encode RGBA ImageData as a filtered (filter 0) PNG. */
export function encodePng(img) {
  const { data, width: w, height: h } = img;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = data[y * stride + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- keying + slicing ---------------- */

/** Key chroma green out: dominance test first (the paper grain wobbles
 *  around #00FF00), then a feathered applyKey against the corner colour. */
function keyGreen(img) {
  const { data, width: w, height: h } = img;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (g > 80 && g > r * 1.32 && g > b * 1.32) data[i + 3] = 0;
  }
  const keyed = applyKey(img, sampleCorners(data, w, h), 60, 40);
  // de-spill: any surviving strongly-green pixel gets its green pulled in
  for (let i = 0; i < keyed.data.length; i += 4) {
    const r = keyed.data[i], g = keyed.data[i + 1], b = keyed.data[i + 2];
    if (keyed.data[i + 3] > 0 && g > r + 40 && g > b + 40) {
      const avg = Math.round((r + b) / 2);
      keyed.data[i + 1] = Math.min(g, avg + 20);
    }
  }
  return despeckle(despeckle(keyed, 2), 3);
}

/** Box-filter downscale by a rational factor (<=1). */
function downscale(img, factor) {
  if (factor >= 1) return img;
  const { data, width: w, height: h } = img;
  const nw = Math.max(1, Math.round(w * factor));
  const nh = Math.max(1, Math.round(h * factor));
  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor((x * w) / nw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / nw));
      const y0 = Math.floor((y * h) / nh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / nh));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < h; yy++) {
        for (let xx = x0; xx < x1 && xx < w; xx++) {
          const p = (yy * w + xx) * 4;
          const al = data[p + 3] / 255;
          r += data[p] * al; g += data[p + 1] * al; b += data[p + 2] * al; a += al; n++;
        }
      }
      const o = (y * nw + x) * 4;
      const al = a / Math.max(1, n);
      out[o] = al > 0 ? Math.round(r / a) : 0;
      out[o + 1] = al > 0 ? Math.round(g / a) : 0;
      out[o + 2] = al > 0 ? Math.round(b / a) : 0;
      out[o + 3] = Math.round(al * 255);
    }
  }
  return { data: out, width: nw, height: nh };
}

/** Slice a keyed sheet into a cols×rows grid, crop all cells to the union
 *  content box (+pad), repack tightly, half-size, save. Returns frame size. */
function processSheet(name, cols, rows, opts = {}) {
  const buf = readFileSync(path.join(RAW, name + ".png"));
  let img = keyGreen(decodePng(buf));
  const { width: W, height: H, data } = img;
  const cw = Math.floor(W / cols), ch = Math.floor(H / rows);
  // union content box across cells (keeps every frame aligned)
  let minX = cw * cols, minY = ch * rows, maxX = -1, maxY = -1;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          if (data[((r * ch + y) * W + c * cw + x) * 4 + 3] > 24) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
    }
  }
  if (maxX < 0) throw new Error(name + ": nothing left after keying");
  const pad = opts.pad ?? 4;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(cw - 1, maxX + pad); maxY = Math.min(ch - 1, maxY + pad);
  const fw = maxX - minX + 1, fh = maxY - minY + 1;
  const packed = { data: new Uint8ClampedArray(fw * cols * fh * rows * 4), width: fw * cols, height: fh * rows };
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const s = ((r * ch + minY + y) * W + (c * cw + minX + x)) * 4;
          const o = ((r * fh + y) * packed.width + c * fw + x) * 4;
          packed.data[o] = data[s]; packed.data[o + 1] = data[s + 1];
          packed.data[o + 2] = data[s + 2]; packed.data[o + 3] = data[s + 3];
        }
      }
    }
  }
  const final = downscale(packed, opts.scale ?? 0.5);
  writeFileSync(path.join(OUT, name + ".png"), encodePng(final));
  return { file: `assets/southpark/${name}.png`, frameWidth: Math.round(fw * (opts.scale ?? 0.5)), frameHeight: Math.round(fh * (opts.scale ?? 0.5)), cols, rows };
}

/** Backgrounds keep full resolution. */
function processBg(name) {
  const img = decodePng(readFileSync(path.join(RAW, name + ".png")));
  writeFileSync(path.join(OUT, name + ".png"), encodePng(img));
  return { file: `assets/southpark/${name}.png`, width: img.width, height: img.height };
}

const jobs = JSON.parse(readFileSync(path.join(RAW, "jobs.json"), "utf8"));
const report = {};
for (const j of jobs.sheets) report[j.name] = processSheet(j.name, j.cols, j.rows, j.opts ?? {});
for (const b of jobs.bgs ?? []) report[b] = processBg(b);
writeFileSync(path.join(RAW, "manifest.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
