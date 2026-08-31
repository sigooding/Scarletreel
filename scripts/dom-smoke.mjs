#!/usr/bin/env node
/**
 * DOM smoke test — mounts the real <App/> in happy-dom under Node, then
 * clicks through the newsstand, the ending gallery, the Studio, and a real
 * story, reporting every console.error/warn, thrown exception, and
 * error-boundary trip along the way. Not a replacement for a real browser,
 * but catches mount crashes, invalid DOM nesting (React logs it as a
 * console.error), bad hook usage, and missing guards on window APIs.
 *
 * Needs the happy-dom devDependency (`npm ci` installs it):
 *
 *   npm run test:dom
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const dir = path.join(root, "scripts", ".tmp-dom-smoke");
mkdirSync(dir, { recursive: true });
const entry = path.join(dir, "entry.jsx");

writeFileSync(
  entry,
  `
import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost:5173/" });
const doc = win.document;
doc.body.innerHTML = '<div id="root"></div>';

// Wire happy-dom into the Node globals React expects.
for (const key of [
  "document", "navigator", "location", "history", "customElements",
  "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLIFrameElement",
  "Element", "Node", "NodeList", "CharacterData", "DocumentFragment", "Document",
  "MutationObserver", "ResizeObserver", "IntersectionObserver", "getComputedStyle",
  "requestAnimationFrame", "cancelAnimationFrame", "localStorage", "sessionStorage",
  "CustomEvent", "Event", "KeyboardEvent", "MouseEvent", "PointerEvent",
  "matchMedia", "DOMRect", "SVGElement", "Image", "Audio", "CSS",
]) {
  if (win[key] === undefined) continue;
  try { globalThis[key] = win[key]; }
  catch { try { Object.defineProperty(globalThis, key, { value: win[key], configurable: true }); } catch {} }
}
globalThis.window = win;
win.matchMedia = win.matchMedia?.bind(win) ?? ((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
globalThis.matchMedia = win.matchMedia;

// happy-dom has no network, so <img>/new Image() never fire "load" — which
// keeps SheetSprite (talking portraits, foreground extras, stage walkers)
// from ever mounting. Stub Image with an eager loader that reports the real
// PNG dimensions read straight from the file header when the src maps to a
// file under public/, so sprite grids compute exactly as in a browser.
import { readFileSync as __readPng } from "node:fs";
function pngSize(p) {
  try {
    const b = __readPng(p);
    if (b.length > 24 && b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch {}
  return null;
}
class EagerImage {
  constructor() { this.naturalWidth = 0; this.naturalHeight = 0; this.onload = null; this.onerror = null; }
  set src(v) {
    this._src = v;
    const rel = String(v).replace(/^https?:\\/\\/[^/]+/, "").split("?")[0];
    const size = rel.endsWith(".png") ? pngSize("${path.join(root, "public").replace(/\\/g, "\\\\")}" + rel) : null;
    if (size) { this.naturalWidth = size.w; this.naturalHeight = size.h; }
    else { this.naturalWidth = 1024; this.naturalHeight = 512; }
    queueMicrotask(() => this.onload && this.onload());
  }
  get src() { return this._src; }
  addEventListener(t, fn) { if (t === "load") this.onload = fn; }
  removeEventListener() {}
}
globalThis.Image = EagerImage;
win.Image = EagerImage;

const problems = [];
const realErr = console.error;
const realWarn = console.warn;
console.error = (...a) => { problems.push(["console.error", a.map(String).join(" ")]); realErr(...a); };
console.warn = (...a) => { problems.push(["console.warn", a.map(String).join(" ")]); realWarn(...a); };
process.on("uncaughtException", (e) => { problems.push(["uncaught", String(e && e.stack || e)]); });
process.on("unhandledRejection", (e) => { problems.push(["unhandled rejection", String(e && e.stack || e)]); });

const { StrictMode, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { default: App } = await import("APP_PATH");
const { ErrorBoundary } = await import("EB_PATH");

// Shims for APIs happy-dom lacks that the app touches.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.ResizeObserver = globalThis.ResizeObserver;
}
if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  win.IntersectionObserver = globalThis.IntersectionObserver;
}
class FakeAudio {
  constructor() { this.paused = true; this.volume = 1; this.currentTime = 0; this.duration = 0; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  load() {}
  addEventListener() {}
  removeEventListener() {}
  cloneNode() { return new FakeAudio(); }
}
globalThis.Audio = FakeAudio; win.Audio = FakeAudio;
try { win.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; win.HTMLMediaElement.prototype.pause = function () {}; } catch {}
try { win.HTMLCanvasElement.prototype.getContext = function () { return null; }; } catch {}
win.scrollTo = () => {}; globalThis.scrollTo = win.scrollTo;

const container = doc.getElementById("root");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickByText = (re) => {
  const els = [...container.querySelectorAll('button, [role="button"], a')];
  const hit = els.find((el) => re.test(el.textContent || ""));
  if (!hit) return false;
  hit.click();
  return true;
};

const report = (phase, extra = "") => {
  const html = container.innerHTML;
  const crashed = /the reel snapped|something broke/i.test(html);
  console.log("\\n=== " + phase + " ===");
  console.log("  rendered:", html.length, "chars; error-boundary:", crashed, extra);
  if (problems.length) {
    for (const [kind, msg] of problems) console.log("  -", kind + ":", msg.replace(/\\s+/g, " ").slice(0, 400));
  } else {
    console.log("  no console errors/warnings");
  }
  console.log("  text:", (container.textContent || "").replace(/\s+/g, " ").slice(0, 220));
  const n = problems.length;
  problems.length = 0;
  return { crashed, n };
};

let failed = false;
const mountFresh = async () => {
  try { win.localStorage.clear(); win.sessionStorage.clear(); } catch {}
  container.innerHTML = "";
  const root = createRoot(container);
  root.render(createElement(StrictMode, null, createElement(ErrorBoundary, null, createElement(App))));
  await sleep(1500);
  return root;
};

// Phase 1: library
let root = await mountFresh();
if (container.innerHTML.length < 100) { console.log("MOUNT FAILED"); process.exit(1); }
failed |= report("LIBRARY (newsstand)").crashed;

// Phase 2: ending gallery
if (clickByText(/Morgue File/i)) { await sleep(1200); failed |= report("ENDING GALLERY").crashed; }
else console.log("!! could not find Morgue File button");
root.unmount(); await sleep(200); problems.length = 0;

// Phase 3: studio
root = await mountFresh(); problems.length = 0;
if (clickByText(/Open Studio Editor/i)) { await sleep(2500); failed |= report("STUDIO").crashed; }
else console.log("!! could not find Studio button");
root.unmount(); await sleep(200); problems.length = 0;

// Phase 4: play the flagship story
root = await mountFresh(); problems.length = 0;
if (clickByText(/Play Nobody/i)) { await sleep(3000); failed |= report("GAME (Nobody's Witness True Romance Cut)").crashed; }
else console.log("!! could not find Play button");

// Phase 5: advance a few scenes by clicking the first choice repeatedly
for (let i = 0; i < 5; i++) {
  const btns = [...container.querySelectorAll("button")].filter((b) => (b.textContent || "").trim().length > 0);
  const choice = btns.find((b) => /continue|▸|▶|next/i.test(b.textContent || "")) ?? btns[btns.length - 1];
  if (!choice) break;
  choice.click();
  await sleep(900);
}
failed |= report("GAME after 5 interactions").crashed;
root.unmount();

// Phase 6: The Kingfisher Job — travel-map absorption in the real UI.
// Boot the story, advance through prose + beats, and confirm the rail shows
// the "Open the map" action INSTEAD of the raw travel choice; then open the
// map and confirm the pins render.
root = await mountFresh(); problems.length = 0;
if (clickByText(/Kingfisher/i)) {
  await sleep(1500);
  clickByText(/^▶?\\s*Play/i) || clickByText(/Play/i);
  await sleep(3000);
  let sawMapButton = false;
  for (let i = 0; i < 24 && !sawMapButton; i++) {
    const btns = [...container.querySelectorAll("button")].filter((b) => (b.textContent || "").trim().length > 0);
    const mapBtn = btns.find((b) => /open the map/i.test(b.textContent || ""));
    if (mapBtn) { sawMapButton = true; break; }
    // Space is the engine's universal advance: finish typing, acknowledge
    // prose, then step dialogue beats — exactly what a player does.
    win.dispatchEvent(new win.KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
    const adv = btns.find((b) => /continue|▸ continue/i.test(b.textContent || ""));
    if (adv) adv.click();
    await sleep(600);
  }
  const text = (container.textContent || "").replace(/\\s+/g, " ");
  const leakedTravel = /Take the Packard/i.test(text);
  const falseDeadEnd = /Dead end detected/i.test(text);
  console.log("\\n=== KINGFISHER map absorption ===");
  console.log("  open-the-map action shown:", sawMapButton, "| raw travel choice leaked:", leakedTravel, "| false dead-end:", falseDeadEnd);
  if (!sawMapButton || leakedTravel || falseDeadEnd) failed = true;
  if (sawMapButton) {
    [...container.querySelectorAll("button")].find((b) => /open the map/i.test(b.textContent || ""))?.click();
    await sleep(900);
    const mapText = (container.textContent || "").replace(/\\s+/g, " ");
    const pinsOk = /Gilded Kingfisher/i.test(mapText) && /Crosstown/i.test(mapText);
    console.log("  travel map opened with pins:", pinsOk);
    if (!pinsOk) failed = true;
  }
  failed |= report("KINGFISHER (map absorbs travel)").crashed;
} else console.log("!! could not find The Kingfisher Job card");
root.unmount();

// Phase 7: Bumpy Night — video background plate + non-pixel car sprite.
// Boot the story, travel dressing room → party → the drive, and confirm the
// scene renders a <video> element pointing at the highway plate with the
// painted car sheet layered over it.
root = await mountFresh(); problems.length = 0;
if (clickByText(/Bumpy Night/i)) {
  await sleep(1500);
  clickByText(/^▶?\\s*Play/i) || clickByText(/Play/i);
  await sleep(3000);
  let sawVideo = false;
  for (let i = 0; i < 40 && !sawVideo; i++) {
    const vid = container.querySelector("video");
    if (vid && /Highway-driving/i.test(vid.getAttribute("src") || "")) { sawVideo = true; break; }
    const btns = [...container.querySelectorAll("button")].filter((b) => (b.textContent || "").trim().length > 0);
    // Route toward the drive: take Eve on, then leave the party with Karen.
    const travel = btns.find((b) => /throw the party|country place/i.test(b.textContent || ""));
    if (travel) { travel.click(); await sleep(900); continue; }
    win.dispatchEvent(new win.KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
    const adv = btns.find((b) => /continue|▸ continue/i.test(b.textContent || ""));
    if (adv) adv.click();
    await sleep(600);
  }
  const html = container.innerHTML;
  const carSprite = /av-car-front/i.test(html);
  console.log("\\n=== BUMPY NIGHT video plate ===");
  console.log("  video background mounted:", sawVideo, "| car sprite over the plate:", carSprite);
  if (!sawVideo || !carSprite) failed = true;
  failed |= report("BUMPY NIGHT (video bg + car sprite)").crashed;
} else console.log("!! could not find Bumpy Night card");
root.unmount();

console.log("\\n=== DOM SMOKE " + (failed ? "FAILED" : "PASSED") + " ===");
process.exit(failed ? 1 : 0);
`
    .replace("APP_PATH", "../../src/App.tsx")
    .replace("EB_PATH", "../../src/ErrorBoundary.tsx")
);

const out = path.join(dir, "bundle.mjs");
await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  jsx: "automatic",
  loader: { ".ts": "ts", ".tsx": "tsx", ".css": "empty", ".mp3": "empty", ".png": "dataurl", ".jpg": "dataurl" },
  absWorkingDir: root,
  alias: { "@": path.join(root, "src") },
  plugins: [
    {
      name: "virtuals",
      setup(b) {
        b.onResolve({ filter: /^virtual:builtin-(images|audio)$/ }, (a) => ({ path: a.path, namespace: "v" }));
        b.onLoad({ filter: /.*/, namespace: "v" }, () => ({ contents: "export default [];" }));
      },
    },
  ],
  define: { __SCARLET_REEL_BUILD_ID__: JSON.stringify("dom-smoke") },
  external: ["happy-dom"],
});

const { spawnSync } = await import("node:child_process");
const res = spawnSync(process.execPath, [out], { stdio: "inherit", cwd: root, timeout: 120000 });
rmSync(dir, { recursive: true, force: true });
process.exit(res.status ?? 1);
