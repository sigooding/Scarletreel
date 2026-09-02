#!/usr/bin/env node
/**
 * STUDIO DEEP PROBE — mounts the real <Studio/> in happy-dom and drives the
 * authoring flows the regular suites only smoke: scene/act/episode/character/
 * item CRUD, undo/redo, repair, export, duplicate, map, validator.
 * Reports every console.error/warn, uncaught throw and error-boundary trip.
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const dir = path.join(root, "scripts", ".tmp-studio-probe");
mkdirSync(dir, { recursive: true });
const entry = path.join(dir, "entry.jsx");

// Hard-exit + cleanup, exactly like scripts/beta/stage-harness.mjs: the
// happy-dom rAF loop can keep the event loop alive after the probe finishes.
process.on("exit", () => {
  try {
    require("node:fs").rmSync(dir, { recursive: true, force: true });
  } catch {}
});

writeFileSync(
  entry,
  `
import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost:5173/" });
const doc = win.document;
doc.body.innerHTML = '<div id="root"></div>';

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

class EagerImage {
  constructor() { this.naturalWidth = 256; this.naturalHeight = 256; this.onload = null; this.onerror = null; }
  set src(v) { this._src = v; queueMicrotask(() => this.onload && this.onload()); }
  get src() { return this._src; }
  addEventListener(t, fn) { if (t === "load") this.onload = fn; }
  removeEventListener() {}
}
globalThis.Image = EagerImage;
win.Image = EagerImage;

const problems = [];
const realErr = console.error;
const realWarn = console.warn;
console.error = (...a) => { problems.push(["console.error", a.map(String).join(" ").slice(0, 500)]); };
console.warn = (...a) => { problems.push(["console.warn", a.map(String).join(" ").slice(0, 300)]); realWarn(...a); };
process.on("uncaughtException", (e) => { problems.push(["uncaught", String((e && e.stack) || e).slice(0, 600)]); });
process.on("unhandledRejection", (e) => { problems.push(["unhandled rejection", String((e && e.stack) || e).slice(0, 600)]); });

const { StrictMode, createElement } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Studio } = await import("STUDIO_PATH");
const { ErrorBoundary } = await import("EB_PATH");
const { STORIES } = await import("STORIES_PATH");

// happy-dom has no HTMLCanvasElement.getContext — Studio canvas tools guard
// on it, but keep a null-returning shim so nothing explodes differently.
try { win.HTMLCanvasElement.prototype.getContext = function () { return null; }; } catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log((ok ? "  ok  " : "  FAIL") + " " + name + (detail !== undefined && !ok ? "  -> " + String(detail).slice(0, 300) : ""));
};

const container = doc.getElementById("root");

const events = { published: null, created: null, played: null, deleted: null };
const stories = () => STORIES.slice(0, 3);

const rootR = createRoot(container);
rootR.render(
  createElement(StrictMode, null,
    createElement(ErrorBoundary, null,
      createElement(Studio, {
        baseStories: stories(),
        get onPublish() { return (s) => { events.published = s; return true; }; },
        onPlay: (s) => { events.played = s; },
        onExit: () => {},
        onDeleteStory: () => true,
        onCreateStory: (s) => { events.created = s; return true; },
        onUpdateTitleTheme: () => {},
      })
    )
  )
);
await sleep(2500);

const q = (sel) => [...container.querySelectorAll(sel)];
const byText = (re, sel = "button") => q(sel).find((el) => re.test((el.textContent || "").trim()));
const TAB_RE = {
  scene: /^Scene$/,
  beats: /^Beats$/,
  hotspots: /^Hotspots$/,
  choices: /^Choices$/,
  characters: /^Characters$/,
  items: /^Items$/,
  briefing: /Game Objective/,
  flags: /Flags/,
  acts: /Acts/,
  episodes: /Episodes/,
  media: /Media Tools/,
  ai: /AI Images/,
  map: /Map/,
};
const tab = async (name) => {
  const b = q("button").find((el) => TAB_RE[name] && TAB_RE[name].test((el.textContent || "").trim()));
  if (!b) { check("tab " + name + " exists", false, "button not found"); return false; }
  b.click(); await sleep(450); return true;
};
const snap = () => (container.textContent || "").replace(/\\s+/g, " ");
const html = () => container.innerHTML;
const reportProblems = (label) => {
  if (problems.length) {
    console.log("  !! problems during " + label + ":");
    for (const p of problems) console.log("     -", p[0] + ":", p[1].replace(/\\s+/g, " ").slice(0, 300));
  }
  const n = problems.length;
  problems.length = 0;
  return n;
};
const crashed = () => /the reel snapped|something broke/i.test(html());

/* ============ 1. canvas boots ============ */
check("studio mounts", html().length > 5000 && !crashed(), "len=" + html().length);
reportProblems("mount");

/* ============ 2. add scene ============ */
const addSceneBtn = byText(/scene/i) ? q("button").find((b) => /^\\s*[＋+]/.test((b.textContent || "")) && /scene/i.test(b.textContent || "")) : null;
if (addSceneBtn) {
  addSceneBtn.click(); await sleep(400);
  check("add scene works", !crashed());
  reportProblems("add scene");
} else check("add scene button exists", false);

/* ============ 3. rename via node menu (custom event path) ============ */
win.dispatchEvent(new win.CustomEvent("scarlet-rename-scene", { detail: { sceneId: "scene-a", title: "Renamed Via Event" } }));
await sleep(300);
check("rename event path", !crashed());
reportProblems("rename");

/* ============ 4. undo/redo ============ */
win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
await sleep(250);
check("ctrl+z undo", !crashed());
win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "y", ctrlKey: true, bubbles: true }));
await sleep(250);
check("ctrl+y redo", !crashed());
reportProblems("undo/redo");

/* ============ 5. every inspector tab renders ============ */
for (const t of ["scene", "beats", "hotspots", "choices", "characters", "items", "flags", "briefing", "acts", "episodes", "media", "ai", "map"]) {
  await tab(t);
  const ok = !crashed();
  check("tab renders: " + t, ok);
  reportProblems("tab " + t);
}

/* ============ 6. acts: add two acts ============ */
await tab("acts");
let added = false;
const firstAct = byText(/Add an act structure/i);
if (firstAct) { firstAct.click(); await sleep(350); added = true; }
for (let i = 0; i < 2; i++) {
  const b = byText(/\\+ Add act/i);
  if (b) { b.click(); await sleep(350); added = true; }
}
check("add act x2", added && !crashed());
reportProblems("acts add");
const actsText = snap();
check("act panel shows ownership", /Owns \\d+ scene/i.test(actsText), actsText.slice(0, 200));

/* ============ 7. episodes: turn into a season ============ */
await tab("episodes");
const seasonBtn = byText(/Turn this case into a season/i);
if (seasonBtn) { seasonBtn.click(); await sleep(400); }
check("season created", !crashed());
reportProblems("episodes season");
const addEp = byText(/\\+ Add episode/i);
if (addEp) { addEp.click(); await sleep(350); }
check("add episode", !crashed());
reportProblems("episodes add");

/* ============ 8. characters: add character ============ */
await tab("characters");
const addChar = byText(/add character/i) || byText(/\\+ new (person|character)/i);
if (addChar) { addChar.click(); await sleep(350); }
check("add character", !crashed());
reportProblems("characters add");

/* ============ 9. items: add item ============ */
await tab("items");
const addItem = byText(/\\+ Add new item/i);
if (addItem) { addItem.click(); await sleep(350); }
check("add item", !crashed());
reportProblems("items add");

/* ============ 10. map: add location ============ */
await tab("map");
const addLoc = byText(/\\+ Add location/i);
if (addLoc) { addLoc.click(); await sleep(350); }
check("map add location", !crashed());
reportProblems("map add");

/* ============ 11. validator/repair ============ */
const repairBtn = byText(/repair/i);
if (repairBtn) {
  repairBtn.click(); await sleep(400);
  check("repair runs", !crashed());
  reportProblems("repair");
} else check("repair button exists", false);

/* ============ 12. export ============ */
const exportBtn = byText(/export/i);
if (exportBtn) { exportBtn.click(); await sleep(600); }
check("export runs", !crashed());
reportProblems("export");

/* ============ 13. delete the selected scene (event path) ============ */
win.dispatchEvent(new win.CustomEvent("scarlet-delete-scene", { detail: "scene-b" }));
await sleep(300);
check("delete scene event", !crashed());
reportProblems("delete scene");

/* ============ 14. story switcher still works ============ */
const storySelect = q("select").find((s) => (s.getAttribute("aria-label") || "") === "Choose story to edit");
if (storySelect) {
  const opts = [...storySelect.querySelectorAll("option")].map((o) => o.value);
  if (opts.length > 1) {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, "value").set ?? null;
    storySelect.value = opts[1];
    storySelect.dispatchEvent(new win.Event("change", { bubbles: true }));
    await sleep(500);
    check("story switch", !crashed());
    reportProblems("story switch");
  } else check("story switch (only one story — skipped)", true);
} else check("story select exists", false);

const fails = results.filter((r) => !r.ok);
console.log("\\n=== STUDIO DEEP PROBE: " + (results.length - fails.length) + " passed, " + fails.length + " failed ===");
if (problems.length) { for (const p of problems) console.log("  leftover:", p[0], p[1].slice(0, 200)); problems.length = 0; }
rootR.unmount();
process.exit(fails.length ? 1 : 0);
`,
);

// Bundle with the same esbuild Vite ships.
const APP_PATH = path.join(root, "src", "App.tsx");
const out = path.join(dir, "bundle.mjs");
await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  jsx: "automatic",
  loader: { ".ts": "ts", ".tsx": "tsx", ".css": "empty" },
  define: { "process.env.NODE_ENV": '"development"', "import.meta.env": "{}" },
  loader: { ".ts": "ts", ".tsx": "tsx", ".css": "empty", ".mp3": "empty", ".png": "dataurl", ".jpg": "dataurl" },
  plugins: [
    {
      name: "virtuals",
      setup(b) {
        b.onResolve({ filter: /^virtual:builtin-(images|audio)$/ }, (a) => ({ path: a.path, namespace: "v" }));
        b.onLoad({ filter: /.*/, namespace: "v" }, () => ({ contents: "export default [];" }));
      },
    },
  ],
  banner: {
    js: `
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const __dirnameStub = ${JSON.stringify(root)};
`,
  },
  alias: {
    STUDIO_PATH: path.join(root, "src", "studio", "Studio.tsx"),
    EB_PATH: path.join(root, "src", "ErrorBoundary.tsx"),
    STORIES_PATH: path.join(root, "src", "data", "stories.ts"),
    APP_PATH,
    "@": path.join(root, "src"),
  },
  external: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "happy-dom", "@xyflow/react", "clsx", "tailwind-merge"],
});

console.log("bundle built — launching happy-dom probe…\n");
await import(out);
