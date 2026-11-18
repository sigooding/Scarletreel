#!/usr/bin/env node
/**
 * Export a story from src/data as a self-contained .reel.json.
 *
 * The repo keeps committed .reel.json files at the root as the permanent,
 * committable copy of a case (see DEVELOPMENT-NOTES §1). This script does the
 * same job the Studio's Export button does, but headlessly and from the
 * committed source of truth (src/data/*.ts):
 *
 *   1. bundles the story data file with esbuild (ships with Vite)
 *   2. finds every media path the story references (backgrounds, posters,
 *      avatars, montages, music, per-beat plates…)
 *   3. embeds every file that exists under public/ as a base64 MediaAsset
 *      and rewrites the story reference to the compact `asset:<id>` token
 *   4. writes { ...story, assets } — the exact envelope Studio's Import
 *      expects, so the file travels complete into any Studio
 *
 * Usage:
 *   node scripts/export-reel.mjs <src/data/<story>.ts> <story-id> <out.reel.json>
 *
 * References to files that are NOT under public/ (or that are missing on
 * disk) are left as plain paths with a warning — shared repo assets keep
 * working when the export is imported on a machine that has the repo, and a
 * missing file is a content bug you want to see, not a silently dropped one.
 */
import { buildSync } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const [, , storyFileArg, storyIdArg, outArg] = process.argv;
if (!storyFileArg || !storyIdArg || !outArg) {
  console.error("usage: node scripts/export-reel.mjs <src/data/<story>.ts> <story-id> <out.reel.json>");
  process.exit(2);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const storyFile = path.isAbsolute(storyFileArg) ? storyFileArg : path.join(root, storyFileArg);
const outFile = path.isAbsolute(outArg) ? outArg : path.join(root, outArg);

/* ---- 1. bundle + load the story ---- */
const dir = mkdtempSync(path.join(tmpdir(), "scarlet-export-"));
const bundle = path.join(dir, "story.bundle.mjs");
buildSync({
  entryPoints: [storyFile],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: bundle,
  logLevel: "warning",
  absWorkingDir: root,
});
const mod = await import(pathToFileURL(bundle).href);
const stories = Object.values(mod).filter((v) => v && typeof v === "object" && Array.isArray(v.scenes) && typeof v.id === "string");
const story = stories.find((s) => s.id === storyIdArg) ?? (stories.length === 1 ? stories[0] : undefined);
if (!story) {
  console.error(`no story with id "${storyIdArg}" in ${storyFileArg} (found: ${stories.map((s) => s.id).join(", ") || "none"})`);
  process.exit(1);
}

/* ---- 2. collect every media path reference ---- */
const MEDIA_RE = /^\/[\w./ -]+\.(?:jpg|jpeg|png|webp|gif|mp3|wav|ogg|mp4|webm)$/i;
const refs = new Set();
const collect = (node) => {
  if (typeof node === "string") {
    if (MEDIA_RE.test(node)) refs.add(node);
    return;
  }
  if (Array.isArray(node)) return node.forEach(collect);
  if (node && typeof node === "object") return Object.values(node).forEach(collect);
};
collect(story);

/* ---- 3. embed what's on disk, rewrite refs ---- */
const typeFor = (ext) =>
  ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext.toLowerCase()) && "image") ||
  ([".mp4", ".webm", ".ogg"].includes(ext.toLowerCase()) && "video") || "audio";
const assets = [];
const rewrite = new Map(); // path -> asset:<id>
const now = Date.now();
let embedded = 0;
const warnings = [];

for (const ref of [...refs].sort()) {
  const disk = path.join(root, "public", ref.replace(/^\//, ""));
  if (!fs.existsSync(disk)) {
    warnings.push(`  missing on disk (kept as plain path): ${ref}`);
    continue;
  }
  const ext = path.extname(ref).toLowerCase();
  const mime =
    { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
      ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".mp4": "video/mp4", ".webm": "video/webm" }[ext] ?? "application/octet-stream";
  const id = ref.replace(/^\//, "").replace(/\//g, "-").replace(/\.[^.]+$/, "");
  const dataUrl = `data:${mime};base64,${fs.readFileSync(disk).toString("base64")}`;
  assets.push({
    id,
    name: path.basename(ref),
    type: typeFor(ext),
    dataUrl,
    size: fs.statSync(disk).size,
    uploadedAt: now,
  });
  rewrite.set(ref, `asset:${id}`);
  embedded += 1;
}

const swap = (node) => {
  if (typeof node === "string") return rewrite.get(node) ?? node;
  if (Array.isArray(node)) return node.map(swap);
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = swap(v);
    return out;
  }
  return node;
};
const storyOut = swap(JSON.parse(JSON.stringify(story)));

const bundle_ = { ...storyOut, assets };
fs.writeFileSync(outFile, JSON.stringify(bundle_, null, 2));
rmSync(dir, { recursive: true, force: true });

const kb = (Math.round((Buffer.byteLength(JSON.stringify(bundle_)) / 1024) + 0.5)) / 100;
console.log(`exported "${story.id}" → ${path.relative(root, outFile)}`);
console.log(`  embedded ${embedded}/${refs.size} media reference(s) as base64 assets (~${kb.toFixed(1)} MB JSON)`);
if (warnings.length) {
  console.log(`  ${warnings.length} warning(s):`);
  warnings.forEach((w) => console.log(w));
}
