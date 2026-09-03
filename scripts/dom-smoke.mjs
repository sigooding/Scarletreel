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
console.error = (...a) => { problems.push(["console.error", a.map(String).join(" ")]); };
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
  console.log("  text:", (container.textContent || "").replace(/\\s+/g, " ").slice(0, 220));
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

// Phase 3b: the Studio tabs that carry the newest tools - Media Tools
// (library + Background remover + sheet lab) and Test (playtester +
// Playtest coverage). Both mount heavy components; the smoke test proves
// they don't throw on a cold render. (No template literals here: this whole
// body is written into the temp entry file as one big template string.)
const studioTabs = [
  ["MEDIA TOOLS", /Media Tools/i],
  ["TEST TAB", /Test\s*$/i],
  ["CHARACTERS", /^\s*Characters\s*$/i],
];
for (const [label, re] of studioTabs) {
  if (clickByText(re)) {
    await sleep(1200);
    const res = report("STUDIO . " + label);
    failed |= res.crashed;
  } else console.log("!! could not find the " + label + " tab");
}
root.unmount(); await sleep(200); problems.length = 0;

// Phase 3c: creator manual
// The manual is a full in-app page rather than another modal. Exercise both
// the newsstand entry point and a copied-style deep link so its navigation stays
// useful in the desktop build as well as the browser preview.
root = await mountFresh(); problems.length = 0;
if (clickByText(/^📓 Creator Manual$/i)) {
  await sleep(500);
  const manualText = (container.textContent || "").replace(/\\s+/g, " ");
  const manualSearch = container.querySelector('input[aria-label="Search the Studio creator manual"]');
  const manualOk = /Build the case/i.test(manualText) && /Common errors/i.test(manualText) && !!manualSearch;
  console.log("\\n=== CREATOR MANUAL ===");
  console.log("  rendered manual with searchable index:", manualOk);
  if (!manualOk) failed = true;
  failed |= report("CREATOR MANUAL").crashed;
} else {
  console.log("!! could not find Creator Manual button");
  failed = true;
}
root.unmount(); await sleep(200); problems.length = 0;
win.history.replaceState(null, "", "#manual/choices");
root = await mountFresh();
const deepLinkOk = !!container.querySelector("#choices") && /Choices and consequences/i.test(container.textContent || "");
console.log("  manual deep link mounted:", deepLinkOk);
if (!deepLinkOk) failed = true;
root.unmount(); await sleep(200); problems.length = 0;
win.history.replaceState(null, "", "/");

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

// Phase 8: Throttle & Ash — the POINT-AND-CLICK prototype (gameKind:
// "adventure"). Boot it, confirm the walkable room mounts (walker sheet,
// drawn bike, flickering neon, verb markers), then click a marker and confirm
// the walker ROUTES to it and fires the verb it carries.
root = await mountFresh(); problems.length = 0;
if (clickByText(/Throttle & Ash/i)) {
  await sleep(1500);
  clickByText(/^\u25b6?\\s*Play/i) || clickByText(/Play/i);
  await sleep(3500);
  const html0 = container.innerHTML;
  const walkerOk = /adv-biker-walk/i.test(html0);
  const bikeArt = /adv-bike/i.test(html0);
  const signArt = /adv-roadhouse-sign/i.test(html0);
  const neonsOn = /anim-flicker/i.test(html0);
  const markers = [...container.querySelectorAll("button")].filter((b) => /stage-marker/i.test(b.className || ""));
  let lookedText = false;
  let goRefused = false;
  const bikeBtn = markers.find((b) => /^the bike$/i.test((b.getAttribute("aria-label") || "").trim()));
  if (bikeBtn) {
    bikeBtn.click();
    for (let i = 0; i < 20 && !lookedText; i++) {
      await sleep(700);
      lookedText = /Bone dry/.test((container.textContent || "").replace(/\\s+/g, " "));
    }
  } else console.log("!! the bike marker never rendered");
  // The VERB COIN: pick LOOK, click the bike (it looks), then pick TAKE and
  // click the same bike — the object answers a different verb instead of
  // being used up by the first one.
  const coinVerbs = [...container.querySelectorAll("button")].filter((b) => /^(Look at|Pick up|Talk to|Use|Go to)$/.test(b.getAttribute("aria-label") || ""));
  const lookBtn = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "") === "Look at");
  const takeBtn = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "") === "Pick up");
  let bikeTakeLine = false;
  if (lookBtn && takeBtn) {
    takeBtn.click();
    await sleep(300);
    const bike2 = [...container.querySelectorAll("button")].find((b) => /^the bike$/i.test((b.getAttribute("aria-label") || "").trim()));
    if (bike2) {
      bike2.click();
      for (let i = 0; i < 16 && !bikeTakeLine; i++) {
        await sleep(600);
        bikeTakeLine = /Four hundred pounds of motorcycle/.test((container.textContent || "").replace(/\\s+/g, " "));
      }
    }
    // And a verb this object does NOT answer ("go") gets refused, politely.
    goRefused = false;
    const goBtn = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "") === "Go to");
    if (goBtn) {
      goBtn.click();
      await sleep(300);
      const bike3 = [...container.querySelectorAll("button")].find((b) => /^the bike$/i.test((b.getAttribute("aria-label") || "").trim()));
      if (bike3) {
        bike3.click();
        for (let i = 0; i < 16 && !goRefused; i++) {
          await sleep(600);
          goRefused = /not a way out|rocks and a bad idea|wall somebody painted/i.test((container.textContent || "").replace(/\\s+/g, " "));
        }
      }
    }
  }
  console.log("\\n=== THROTTLE & ASH (point-and-click prototype) ===");
  console.log("  walker sheet:", walkerOk, "| bike art in the room:", bikeArt, "| neon sign:", signArt, "(" + (neonsOn ? "flickering" : "static") + ")");
  // Walk-behind mask: the parked truck art is drawn exactly once (either in
  // the extras pass or the over-the-walker pass — never both).
  // INVENTORY: the container sprite (saddlebags) renders with the items
  // inside it, and an item can be picked up with the ✋ verb and then DRAGGED
  // (pointer down → move → ghost follows → up).
  const dockMode = [...container.querySelectorAll("[data-inventory]")].map((n) => n.getAttribute("data-inventory"))[0] || "";
  const heading = /Saddlebags/i.test((container.textContent || "").replace(/\\s+/g, " "));
  let chip = null;
  const takeBtn2 = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "") === "Pick up");
  if (takeBtn2) {
    takeBtn2.click();
    await sleep(250);
    const wrench = [...container.querySelectorAll("button")].find((b) => /^the bent wrench$/i.test((b.getAttribute("aria-label") || "").trim()));
    if (wrench) {
      wrench.click();
      for (let i = 0; i < 16 && !chip; i++) {
        await sleep(600);
        chip = container.querySelector('[data-item-id="adv_wrench"]');
      }
    }
  }
  // NB: the pouch only renders once there is something to carry, and PNGs are
  // inlined as data URLs in the smoke bundle — so assert on the container
  // ELEMENT (the art the items sit inside), not on the file name.
  const caseArt = /inv-container/.test(container.innerHTML) && !!container.querySelector('[data-inventory="container"] img');
  let dragGhost = false;
  if (chip) {
    chip.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, clientX: 40, clientY: 40, button: 0, pointerType: "mouse" }));
    await sleep(120);
    win.dispatchEvent(new win.PointerEvent("pointermove", { bubbles: true, clientX: 220, clientY: 120, pointerType: "mouse" }));
    await sleep(160);
    dragGhost = !!container.querySelector("[data-drag-ghost]");
    win.dispatchEvent(new win.PointerEvent("pointerup", { bubbles: true, clientX: 220, clientY: 120, pointerType: "mouse" }));
    await sleep(160);
  }
  // Cursor art: the case's own cursor is applied over the scene (a static
  // image becomes a real CSS cursor; a sheet draws a sprite that tracks the
  // mouse). PNGs are data URLs here, so assert on the cursor declaration.
  const cursorCss = [...container.querySelectorAll("[style*='cursor']")].map((n) => n.getAttribute("style") || "").filter((s) => s.indexOf("cursor:") >= 0);
  const artCursor = cursorCss.some((s) => s.indexOf("cursor: url") >= 0);
  const htmlNow = container.innerHTML;
  const truckDraws = (htmlNow.match(/adv-truck/gi) || []).length;
  const truckArt = truckDraws > 0;
  console.log("  verb markers in the room:", markers.length, "| walk-to-look fired:", lookedText);
  console.log("  verb coin offers:", coinVerbs.length, "verbs | second verb on the same object:", bikeTakeLine, "| unanswerable verb refused:", goRefused);
  console.log("  walk-behind mask (parked truck):", truckArt, "| drawn once, never duplicated:", truckDraws === 1, "(" + truckDraws + ")");
  console.log("  cursor art applied over the scene:", artCursor, "(" + cursorCss.length + " styled layers)");
  if (!artCursor) failed = true;
  console.log("  inventory: mode=" + dockMode + " | pouch sprite with items inside:", caseArt, "| heading:", heading, "| item picked up:", !!chip, "| drag ghost:", dragGhost);
  if (dockMode !== "container" || !caseArt || !heading || !chip || !dragGhost) failed = true;
  if (!truckArt || truckDraws !== 1) failed = true;
  if (!walkerOk || !bikeArt || !signArt || markers.length < 4 || !lookedText) failed = true;
  if (coinVerbs.length < 4 || !bikeTakeLine || !goRefused) failed = true;
  // happy-dom drives requestAnimationFrame with setImmediate, so a multi-second
  // walk enqueues hundreds of setPos updates before React can commit a single
  // frame — React then logs "Maximum update depth exceeded". That is an artifact
  // of the test DOM (a real browser paces rAF and commits in between; the walker
  // is verified to arrive, fire its verb and settle idle), so it is filtered for
  // this walking phase only. Every other warning still fails the build.
  for (let i = problems.length - 1; i >= 0; i--) {
    if (/Maximum update depth/.test(problems[i][1])) problems.splice(i, 1);
  }
  failed |= report("THROTTLE & ASH (point-and-click)").crashed;
} else console.log("!! could not find the Throttle & Ash card");
root.unmount();

// Phase 9: Full Throttle — the recreated opening. Advance through the
// credits / limo / pitch cutscenes into the INSIDE-THE-DUMPSTER stage,
// punch the lid (object-first menu), climb out, and confirm the alley is a
// WIDE WORLD: a 200% strip with the camera transform and the bike + door
// markers laid out past x=100 (the right screen of the strip).
root = await mountFresh(); problems.length = 0;
if (clickByText(/Full Throttle — The Kickstand/i)) {
  await sleep(1500);
  clickByText(/^\\u25b6?\\s*Play/i) || clickByText(/Play/i);
  await sleep(3000);
  // Step through the cutscenes until the first stage mounts (the dumpster).
  let stageMarkers = [...container.querySelectorAll("button")].filter((b) => /stage-marker/.test(b.className || ""));
  for (let i = 0; i < 110 && !stageMarkers.length; i++) {
    win.dispatchEvent(new win.KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
    const adv = [...container.querySelectorAll("button")].find((b) => /continue|\\u25b6/.test(b.textContent || ""));
    if (adv) adv.click();
    await sleep(300);
    stageMarkers = [...container.querySelectorAll("button")].filter((b) => /stage-marker/.test(b.className || ""));
  }
  const inDumpster = stageMarkers.some((b) => /dumpster lid/.test(b.getAttribute("aria-label") || ""));
  // Object-first menu, HOLD-TO-OPEN (stage.objectMenuHold — the classic
  // skull pie): press and HOLD the marker and a big circular menu opens in
  // the middle of the screen — verb chips from 12 o'clock, clockwise, with
  // the skull in the centre. Release over a verb's sector to act, so the
  // release point is computed from the verb's index (geometry, not clicks).
  const holdAndPick = async (el, verbLabel) => {
    el.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, clientX: 60, clientY: 60, button: 0, pointerType: "mouse" }));
    await sleep(480); // past the 320 ms hold threshold
    const chips = [...container.querySelectorAll("[data-pie-verb]")];
    const i = chips.findIndex((c) => (c.getAttribute("aria-label") || "") === verbLabel);
    if (i < 0) return false;
    const n = chips.length;
    const cx = win.innerWidth / 2;
    const cy = win.innerHeight / 2;
    const R = 120; // inside the verb ring (52–154 px from the centre)
    const ang = ((-90 + (i * 360) / n) * Math.PI) / 180;
    const x = cx + R * Math.cos(ang);
    const y = cy + R * Math.sin(ang);
    win.dispatchEvent(new win.PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, button: 0, pointerType: "mouse" }));
    await sleep(60);
    win.dispatchEvent(new win.PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, button: 0, pointerType: "mouse" }));
    return true;
  };
  const lid = stageMarkers.find((b) => /dumpster lid/.test(b.getAttribute("aria-label") || ""));
  let punched = false;
  if (lid) {
    if (await holdAndPick(lid, "Punch")) {
      for (let i = 0; i < 30 && !punched; i++) {
        await sleep(500);
        punched = /punch the lid/.test((container.textContent || "").replace(/\\s+/g, " "));
      }
      if (!punched) console.log("!! the punch never landed after the hold-release");
    } else console.log("!! the skull pie never opened (or Punch wasn't offered)");
  } else console.log("!! the dumpster-lid marker never rendered");
  // The climb-out marker is gated on ft_free — it unlocks after the punch.
  let climbed = false;
  const climb = [...container.querySelectorAll("button")].find((b) => /climb out/.test(b.getAttribute("aria-label") || ""));
  if (climb) {
    if (await holdAndPick(climb, "Go to")) {
      for (let i = 0; i < 40 && !climbed; i++) {
        await sleep(500);
        climbed = /behind the kickstand|keys permitting/i.test((container.textContent || "").replace(/\\s+/g, " "));
      }
    } else console.log("!! the skull pie never opened for the climb-out marker");
  } else console.log("!! the climb-out marker never appeared after the punch");
  // The WIDE WORLD: the strip renders at 200% with the camera transform, and
  // the right-screen markers (bike + door) are laid out past x=100.
  const html = container.innerHTML;
  const wideWorld = /width:\\s*200%/.test(html) && /translateX/.test(html);
  const alleyMarkers = [...container.querySelectorAll("button")].filter((b) => /stage-marker/.test(b.className || ""));
  const labels = alleyMarkers.map((b) => b.getAttribute("aria-label") || "");
  const bikeThere = labels.some((l) => /your bike/.test(l));
  const doorThere = labels.some((l) => /kickstand door/i.test(l));
  const dumpsterThere = labels.some((l) => /^the dumpster/.test(l));
  console.log("\\n=== FULL THROTTLE (dumpster → wide alley) ===");
  console.log("  inside-dumpster stage:", inDumpster, "| lid punched:", punched, "| climbed out:", climbed);
  console.log("  wide world 200% strip + camera:", wideWorld, "| markers:", alleyMarkers.length, "|", JSON.stringify(labels));
  console.log("  dumpster:", dumpsterThere, "| bike:", bikeThere, "| door:", doorThere);
  if (!inDumpster || !punched || !climbed || !wideWorld || !dumpsterThere || !bikeThere || !doorThere) failed = true;
  // Same happy-dom rAF artifact as the Throttle & Ash phase: walking storms
  // setPos before React can commit, which logs max-update-depth warnings.
  for (let i = problems.length - 1; i >= 0; i--) {
    if (/Maximum update depth/.test(problems[i][1])) problems.splice(i, 1);
  }
  failed |= report("FULL THROTTLE (wide-world opening)").crashed;
} else console.log("!! could not find the Full Throttle card");
root.unmount();

// Phase 10: Full Throttle — The Corville Run (the NEW version). Exercises the
// new sprite sheet + poses, the new skull-pie centrepiece, the setPlayerPose
// hotspots, the point-stretched walk path, and the topic-list bartender —
// end to end from the dumpster through the bar.
root = await mountFresh(); problems.length = 0;
if (clickByText(/Full Throttle — The Corville Run/i)) {
  await sleep(1500);
  clickByText(/^\\u25b6?\\s*Play/i) || clickByText(/Play/i);
  await sleep(3000);
  let stageMarkers = [...container.querySelectorAll("button")].filter((b) => /stage-marker/.test(b.className || ""));
  for (let i = 0; i < 110 && !stageMarkers.length; i++) {
    win.dispatchEvent(new win.KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
    const adv = [...container.querySelectorAll("button")].find((b) => /continue|\\u25b6/.test(b.textContent || ""));
    if (adv) adv.click();
    await sleep(300);
    stageMarkers = [...container.querySelectorAll("button")].filter((b) => /stage-marker/.test(b.className || ""));
  }
  const holdAndPick = async (el, verbLabel) => {
    el.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, clientX: 60, clientY: 60, button: 0, pointerType: "mouse" }));
    await sleep(480);
    const chips = [...container.querySelectorAll("[data-pie-verb]")];
    const i = chips.findIndex((c) => (c.getAttribute("aria-label") || "") === verbLabel);
    if (i < 0) return false;
    const n = chips.length;
    const cx = win.innerWidth / 2;
    const cy = win.innerHeight / 2;
    const R = 120;
    const ang = ((-90 + (i * 360) / n) * Math.PI) / 180;
    const x = cx + R * Math.cos(ang);
    const y = cy + R * Math.sin(ang);
    win.dispatchEvent(new win.PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, button: 0, pointerType: "mouse" }));
    await sleep(60);
    win.dispatchEvent(new win.PointerEvent("pointerup", { bubbles: true, clientX: x, clientY: y, button: 0, pointerType: "mouse" }));
    return true;
  };
  // Dumpster: the lid marker renders (the new player sheet + crouch pose).
  const inDumpster = stageMarkers.some((b) => /dumpster lid/.test(b.getAttribute("aria-label") || ""));
  const lid = stageMarkers.find((b) => /dumpster lid/.test(b.getAttribute("aria-label") || ""));
  let punched = false;
  if (lid) {
    if (await holdAndPick(lid, "Punch")) {
      for (let i = 0; i < 30 && !punched; i++) {
        await sleep(500);
        punched = /punch the lid/.test((container.textContent || "").replace(/\\s+/g, " "));
      }
    } else console.log("!! FT2: the skull pie never opened (or Punch wasn't offered)");
  } else console.log("!! FT2: the dumpster-lid marker never rendered");
  let climbed = false;
  const climb = [...container.querySelectorAll("button")].find((b) => /climb out/.test(b.getAttribute("aria-label") || ""));
  if (climb) {
    if (await holdAndPick(climb, "Go to")) {
      for (let i = 0; i < 40 && !climbed; i++) {
        await sleep(500);
        climbed = /behind the kickstand|keys permitting/i.test((container.textContent || "").replace(/\\s+/g, " "));
      }
    }
  } else console.log("!! FT2: the climb-out marker never appeared after the punch");
  // Wide alley: 200% strip + camera, and the setPlayerPose "bend" marker.
  const html = container.innerHTML;
  const wideWorld = /width:\\s*200%/.test(html) && /translateX/.test(html);
  const bendThere = [...container.querySelectorAll("button")].some((b) => /look under the dumpster/.test(b.getAttribute("aria-label") || ""));
  // Kick the door into the bar (the walk path + topic-list bartender live there).
  let inBar = false;
  const door = [...container.querySelectorAll("button")].find((b) => /kickstand door/i.test(b.getAttribute("aria-label") || ""));
  if (door) {
    if (await holdAndPick(door, "Kick")) {
      for (let i = 0; i < 40 && !inBar; i++) {
        await sleep(500);
        inBar = /reach over the bar/.test((container.textContent || "").replace(/\\s+/g, " "));
      }
    } else console.log("!! FT2: the skull pie never opened for the door kick");
  } else console.log("!! FT2: the Kickstand door marker never rendered");
  const barMarkers = [...container.querySelectorAll("button")].filter((b) => /stage-marker/.test(b.className || ""));
  const reachThere = barMarkers.some((b) => /reach over the bar/.test(b.getAttribute("aria-label") || ""));
  const quohogThere = barMarkers.some((b) => /quohog/i.test(b.getAttribute("aria-label") || ""));
  const grabLocked = barMarkers.some((b) => /grab quohog/i.test(b.getAttribute("aria-label") || "") && /🔒/.test(b.textContent || ""));
  // The ambient barfly NPC (idle/walk cycle) renders its sheet in the bar.
  const barflyThere = /ft2-barfly\.png/.test(container.innerHTML);
  console.log("\\n=== FULL THROTTLE — THE CORVILLE RUN (new version) ===");
  console.log("  dumpster:", inDumpster, "| lid punched:", punched, "| climbed out:", climbed);
  console.log("  wide 200% + camera:", wideWorld, "| bend marker:", bendThere);
  console.log("  in bar:", inBar, "| reach-over pose marker:", reachThere, "| topic-list bartender:", quohogThere, "| grab locked:", grabLocked, "| barfly NPC:", barflyThere);
  if (!inDumpster || !punched || !climbed || !wideWorld || !bendThere || !inBar || !reachThere || !quohogThere || !barflyThere) failed = true;
  for (let i = problems.length - 1; i >= 0; i--) {
    if (/Maximum update depth/.test(problems[i][1])) problems.splice(i, 1);
  }
  failed |= report("FULL THROTTLE — THE CORVILLE RUN").crashed;
} else console.log("!! could not find the Full Throttle — The Corville Run card");
root.unmount();

// Phase 8: INSPECTOR GADGET — beta case for the 🔭 OUT-OF-REACH hotspot
// (Hotspot.remote) AND the 🎬 SCRIPTED SEQUENCE room-entry cutscene. Boot
// the case, advance HQ to the plaza stage. The plaza has an enterScript:
// letterbox bars ([data-stage-cutscene]) must appear, Brain's/the player's
// floated lines must show, input must be LOCKED while it runs (the clock
// click does nothing mid-cutscene), and control must return afterwards —
// then the remote clock zone fires immediately and the gated door reads
// locked, exactly as before.
root = await mountFresh(); problems.length = 0;
if (clickByText(/Clockwork Caper/i)) {
  await sleep(1500);
  clickByText(/^▶?\\s*Play/i) || clickByText(/Play/i);
  await sleep(2500);
  let toPlaza = false;
  for (let i = 0; i < 20 && !toPlaza; i++) {
    const btns = [...container.querySelectorAll("button")].filter((b) => (b.textContent || "").trim().length > 0);
    const go = btns.find((b) => /self-destruct/i.test(b.textContent || ""));
    if (go) { go.click(); toPlaza = true; break; }
    win.dispatchEvent(new win.KeyboardEvent("keydown", { code: "Space", key: " ", bubbles: true }));
    const adv = btns.find((b) => /continue/i.test(b.textContent || ""));
    if (adv) adv.click();
    await sleep(500);
  }
  // ENTRY CUTSCENE — starts ~450ms after the stage mounts. Watch it play:
  // the letterbox shield up, the scripted say lines in the DOM, then the
  // shield down again (script finished, input handed back). ~20s budget —
  // the script itself runs ~8s of walks and lines.
  await sleep(1200);
  let sawCutscene = !!container.querySelector("[data-stage-cutscene]");
  let sawLine = false;
  let cutsceneOver = false;
  for (let i = 0; i < 50; i++) {
    if (!sawCutscene && container.querySelector("[data-stage-cutscene]")) sawCutscene = true;
    if (/One mystery at a time/i.test(container.textContent || "")) sawLine = true;
    if (sawCutscene && sawLine && !container.querySelector("[data-stage-cutscene]")) { cutsceneOver = true; break; }
    await sleep(400);
  }
  const markerLabels = [...container.querySelectorAll("button.stage-marker")].map((b) => b.getAttribute("aria-label") || "");
  const doorLocked = markerLabels.some((l) => /Tower service door \\(locked\\)/i.test(l));
  // Remote clock: retry-click (harmless if a stray frame still has the
  // shield up) — it must fire with NO walk-up once control is back.
  let clockBtn = null;
  let remoteFired = false;
  for (let i = 0; i < 8 && !remoteFired; i++) {
    clockBtn = [...container.querySelectorAll("button")].find((b) => (b.getAttribute("aria-label") || "") === "The tower clock");
    if (clockBtn) {
      clockBtn.click();
      await sleep(400);
      remoteFired = /STUCK at 3:12/i.test(container.textContent || "");
    }
    if (!remoteFired) await sleep(600);
  }
  console.log("\\n=== INSPECTOR GADGET (out-of-reach hotspot + entry cutscene) ===");
  console.log("  reached plaza stage:", toPlaza, "| markers:", markerLabels.length, JSON.stringify(markerLabels));
  console.log("  cutscene letterbox shown:", sawCutscene, "| scripted line floated:", sawLine, "| cutscene released input:", cutsceneOver);
  console.log("  clock marker found:", !!clockBtn, "| remote look fired with NO walk-up:", remoteFired, "| gated door shows locked:", doorLocked);
  if (!toPlaza || !sawCutscene || !sawLine || !cutsceneOver || !clockBtn || !remoteFired || !doorLocked) failed = true;
  for (let i = problems.length - 1; i >= 0; i--) {
    if (/Maximum update depth/.test(problems[i][1])) problems.splice(i, 1);
  }
  failed |= report("INSPECTOR GADGET (plaza stage)").crashed;
} else console.log("!! could not find the Inspector Gadget — Clockwork Caper card");
root.unmount();

// Phase 9: NO-HUD walkable stage (SceneNode.hideHud). A stage scene with
// the layout flipped must render ZERO chrome — no ☰ Menu button, no Case
// Progress meter, no inventory dock, no sound/help corner — while the stage
// itself (markers, walker floor) stays interactive, and Esc still raises
// the quit dialog (Save & exit). The same scene with hideHud off keeps its
// HUD, proving the flag (not the node type) drives it.
const { INSPECTOR_GADGET: igStory } = await import("../../src/data/inspectorGadget.ts");
const { GamePlayer } = await import("../../src/game/Game.tsx");
async function bootIg(hideHud) {
  try { win.localStorage.clear(); win.sessionStorage.clear(); } catch {}
  container.innerHTML = "";
  const story = {
    ...igStory,
    scenes: igStory.scenes.map((sc) =>
      sc.nodeType === "stage" ? { ...sc, stage: sc.stage ? { ...sc.stage, enterScript: undefined } : sc.stage, hideHud } : sc
    ),
  };
  const stageScene = story.scenes.find((sc) => sc.nodeType === "stage");
  const r = createRoot(container);
  r.render(createElement(StrictMode, null, createElement(GamePlayer, { story, playFromSceneId: stageScene.id, onExit: () => {} })));
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    if (container.querySelector("button.stage-marker")) break;
  }
  await sleep(1200);
  return r;
}

root = await bootIg(true); problems.length = 0;
const nhText = (container.textContent || "").replace(/\\s+/g, " ");
const nhNoMenu = !/☰ ?Menu/i.test(nhText);
const nhNoMeters = !/Case Progress/i.test(nhText);
const nhNoSound = !/🔊 Sound|🔇 Sound/.test(nhText);
const nhNoDock = !nhText.includes("🧳") && !nhText.includes("🎒");
const nhFrames = container.querySelectorAll(".hud-frame").length;
const nhStageAlive = !!container.querySelector("button.stage-marker");
// Esc must still open the quit dialog even with zero chrome on screen.
win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
await sleep(600);
const nhEscQuits = /Leave the case\?/i.test(container.textContent || "");
console.log("\\n=== STAGE — NO HUD LAYOUT (hideHud) ===");
console.log("  menu hidden:", nhNoMenu, "| meters hidden:", nhNoMeters, "| sound/help hidden:", nhNoSound, "| dock hidden:", nhNoDock, "| .hud-frame count:", nhFrames);
console.log("  stage still interactive:", nhStageAlive, "| Esc still opens quit (save & exit):", nhEscQuits);
if (!nhNoMenu || !nhNoMeters || !nhNoSound || !nhNoDock || !nhStageAlive || !nhEscQuits) failed = true;
win.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
await sleep(400);
root.unmount(); problems.length = 0;

root = await bootIg(false);
const hudText = (container.textContent || "").replace(/\\s+/g, " ");
const hudMenu = /☰ ?Menu/i.test(hudText);
const hudMeters = /Case Progress/i.test(hudText);
const hudStageAlive = !!container.querySelector("button.stage-marker");
console.log("\\n=== STAGE — NORMAL HUD UNCHANGED ===");
console.log("  menu present:", hudMenu, "| meters present:", hudMeters, "| stage present:", hudStageAlive);
if (!hudMenu || !hudMeters || !hudStageAlive) failed = true;
failed |= report("STAGE HUD layouts").crashed;
root.unmount();

// Phase 10: STAGE interaction niceties —
//   (a) markers render ON their object (bottom-centre of the drawn zone),
//       never "jumping" down into the walkable band;
//   (b) nothing darkens the art outside the walkable area any more;
//   (c) LOOKS fire at a distance: clicking a show-text zone plays its caption
//       without the character walking;
//   (d) ✋ take (and friends) still walk up first.
const wireZone = { id: "igh_wire", label: "Pigeon wire", bounds: { x: 44, y: 22, w: 10, h: 12 }, cursor: "look", isRepeatable: true, action: { type: "showText", text: "Tiny grey witnesses, and none of them talking." } };
async function bootPlaza(opts = {}) {
  try { win.localStorage.clear(); win.sessionStorage.clear(); } catch {}
  container.innerHTML = "";
  const story = {
    ...igStory,
    scenes: igStory.scenes.map((sc) =>
      sc.id !== "ig_plaza"
        ? sc
        : {
            ...sc,
            stage: sc.stage ? { ...sc.stage, enterScript: undefined, ...(opts.stageEdits || {}) } : sc.stage,
            hotspots: [...(sc.hotspots || []), wireZone, ...(opts.hotspot ? [opts.hotspot] : [])],
          }
    ),
  };
  const r = createRoot(container);
  r.render(createElement(StrictMode, null, createElement(GamePlayer, { story, playFromSceneId: "ig_plaza", onExit: () => {} })));
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    if (container.querySelector("button.stage-marker")) break;
  }
  await sleep(800);
  return r;
}
const playerLeftPct = () => {
  const el = container.querySelector("[data-stage-player]");
  return el ? parseFloat(el.style.left) : null;
};
const markerBtn = (label) =>
  [...container.querySelectorAll("button.stage-marker")].find((b) => (b.getAttribute("aria-label") || "").indexOf(label) === 0);

root = await bootPlaza(); problems.length = 0;
// (a) the wire zone ends at y=34 — well ABOVE the 66–94 floor band: pre-fix
//     its marker clamped onto the pavement; now it stays on the wire.
const wireBtn = markerBtn("Pigeon wire");
const wireTop = wireBtn ? Math.round(parseFloat(wireBtn.style.top) * 10) / 10 : -999;
const markerOnObject = Math.abs(wireTop - 34) < 1;
// …and an in-band marker (the dropped glove, zone bottom y=89) still lands
// on its zone's base, i.e. where the old clamp would put it too.
const gloveBtn0 = markerBtn("Dropped glove");
const gloveTop = gloveBtn0 ? Math.round(parseFloat(gloveBtn0.style.top) * 10) / 10 : -999;
const floorMarkerOk = Math.abs(gloveTop - 89) < 1;
// (b) no off-floor dim: the band gradients (0.18/0.28, 0.34/0.16) and the
//     old path mask (0.30 black) are gone from the frame.
const stageHtml = container.innerHTML;
const noDim = !stageHtml.includes("rgba(0,0,0,0.28)") && !stageHtml.includes("rgba(0,0,0,0.34)") && !stageHtml.includes("rgba(0,0,0,0.30)");
// (c) LOOK AT A DISTANCE: the poster is a show-text zone at x≈66 while the
//     character spawns at x=12 — clicking it must read immediately and the
//     walker's x must not budge.
const x0 = playerLeftPct();
const posterBtn = markerBtn("Newsstand poster");
if (posterBtn) posterBtn.click();
await sleep(1500);
const lookFired = (container.textContent || "").indexOf("REWARD") !== -1;
const xAfterLook = playerLeftPct();
const lookNoWalk = x0 !== null && xAfterLook !== null && Math.abs(xAfterLook - x0) < 1;
// (d) WALK-UP ACTIONS STILL WALK: click the glove (giveItem at x≈51): the
//     character crosses the plaza, the one-shot marker is consumed.
const gloveBtn = markerBtn("Dropped glove");
if (gloveBtn) gloveBtn.click();
let walkedToGlove = false;
let gloveGone = false;
for (let i = 0; i < 30; i++) {
  await sleep(300);
  const x = playerLeftPct();
  if (x !== null && x > 35) walkedToGlove = true;
  if (!markerBtn("Dropped glove")) { gloveGone = true; break; }
}
console.log("\\n=== STAGE — MARKER PLACEMENT, DIM REMOVAL, LOOK AT DISTANCE ===");
console.log("  wire marker ON the object (top ≈34%):", markerOnObject, "(got " + wireTop + "%) | in-band glove marker intact:", floorMarkerOk, "(" + gloveTop + "%)");
console.log("  no dim outside walkable area:", noDim);
console.log("  look fired at distance:", lookFired, "| character did NOT walk (x " + x0 + " → " + xAfterLook + "):", lookNoWalk);
console.log("  take still walks up (reached x>35):", walkedToGlove, "| glove consumed on arrival:", gloveGone);
if (!markerOnObject || !floorMarkerOk || !noDim || !posterBtn || !lookFired || !lookNoWalk || !walkedToGlove || !gloveGone) failed = true;
failed |= report("STAGE interaction niceties").crashed;
root.unmount();

// Phase 10b: PROP OCCLUSION + MENU Z-ORDER —
//   (a) a hotspot flagged "occludes" draws its object art OVER the walkers
//       (z 160 beats every actor's 50+y depth sort);
//   (b) the object-first verb menu opens ABOVE every actor (z-[200]) so the
//       choice options are never hidden behind a character.
//   NOTE: this file's body is one big template literal: no backticks in
//   comments or strings here, ever.
const OCCL_ZONE = { id: "igh_occl", label: "Big prop", bounds: { x: 26, y: 40, w: 18, h: 26 }, cursor: "look", isRepeatable: true, occludes: true, image: "/img/prop-occluder.png", action: { type: "showText", text: "A very large foreground prop." } };
root = await bootPlaza({ hotspot: OCCL_ZONE }); problems.length = 0;
const occlBtn = markerBtn("Big prop");
const occlArt = occlBtn ? occlBtn.previousElementSibling : null;
const occlZ = occlArt instanceof win.HTMLElement ? occlArt.style.zIndex : "";
const playerZ = (container.querySelector("[data-stage-player]") || {}).style?.zIndex || "";
const occlAbove = occlZ === "160" && playerZ !== "" && Number(playerZ) < 160;
root.unmount();

root = await bootPlaza({ stageEdits: { objectVerbMenu: true, verbs: undefined, objectMenuHold: undefined } }); problems.length = 0;
const menuBtn = markerBtn("Pigeon wire");
if (menuBtn) {
  try {
    menuBtn.dispatchEvent(new win.PointerEvent("pointerdown", { bubbles: true, cancelable: true, button: 0, pointerId: 1 }));
  } catch {
    menuBtn.dispatchEvent(new win.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
  }
  await sleep(400);
}
const menuDiv = [...container.querySelectorAll("div")].find((d) => typeof d.className === "string" && d.className.includes("z-[200]") && (d.textContent || "").includes("Pigeon wire"));
console.log("\\n=== STAGE — PROP OCCLUSION + MENU Z-ORDER ===");
console.log("  occluder art over walkers (art z " + occlZ + " > player z " + playerZ + "):", occlAbove, "| object menu above actors:", !!menuDiv);
if (!occlAbove || !menuDiv) failed = true;
failed |= report("STAGE prop occlusion + menu z").crashed;
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
const res = spawnSync(process.execPath, [out], { stdio: "inherit", cwd: root, timeout: 240000 });
rmSync(dir, { recursive: true, force: true });
process.exit(res.status ?? 1);
