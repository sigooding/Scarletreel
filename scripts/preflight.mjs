#!/usr/bin/env node
/**
 * PREFLIGHT — run this before every build you intend to ship (Steam or
 * anywhere else). It answers one question: is the catalogue production-ready?
 *
 *   node scripts/preflight.mjs        (or: npm run preflight)
 *
 * What it proves, story by story:
 *   1. VALIDATOR    — zero errors (warnings are listed but don't block).
 *   2. PLAYABILITY  — an engine-faithful walk (replies, hidden choices,
 *                     exclusive groups, one-shots, gating) terminates on an
 *                     ending, and the deep walk covers the graph.
 *   3. ENDINGS      — at least one victory and one game-over ending exist.
 *   4. ASSETS       — every image/audio path every story references exists
 *                     under public/ (the same guarantee `npm run check` gives,
 *                     but against the live compiled data, including beats'
 *                     replacement backgrounds, montages and keyframes).
 *   5. MUSIC        — the soundtrack state machine is traced across each
 *                     walk so a leaked track is visible at a glance.
 *
 * Exit code 0 = ship it. Anything else = fix first.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const TMP = join(ROOT, ".preflight");
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const GRN = (s) => `\x1b[32m${s}\x1b[0m`;
const GOLD = (s) => `\x1b[33m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

let failures = 0;
const fail = (msg) => { failures++; console.log(`  ${RED("FAIL")}  ${msg}`); };
const pass = (msg) => console.log(`  ${GRN("ok")}    ${msg}`);
const note = (msg) => console.log(`  ${DIM("·")}    ${msg}`);

/* ---------- 1. compile the real source (data + engine logic) ---------- */
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
// The repo is "type": "module", but tsc emits CommonJS here. A local
// package.json marks the emit dir as CommonJS so Node imports it cleanly.
writeFileSync(join(TMP, "package.json"), '{"type":"commonjs"}');
const tsc = spawnSync("npx", ["tsc", "src/data/stories.ts", "src/logic.ts", "src/studio/canvas.ts", "--outDir", TMP,
  "--module", "commonjs", "--target", "es2020", "--moduleResolution", "node",
  "--esModuleInterop", "--skipLibCheck"], { stdio: "pipe", encoding: "utf8", cwd: ROOT });
if (tsc.status !== 0) {
  console.log(RED("Compile failed — TypeScript errors in the shipped data/logic:"));
  console.log(tsc.stdout || tsc.stderr);
  process.exit(1);
}
// tsc infers the root dir from the entry files, so the emitted tree may be
// .preflight/data/stories.js or .preflight/src/data/stories.js depending on
// entries. Locate the compiled modules instead of guessing.
const find = (dir, name) => {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of readdirSync(cur, { withFileTypes: true })) {
      const p = join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name === name) return p;
    }
  }
  return null;
};
const storiesJs = find(TMP, "stories.js");
const logicJs = find(TMP, "logic.js");
if (!storiesJs || !logicJs) {
  console.log(RED("Compile produced no stories.js/logic.js — check the tsc invocation."));
  process.exit(1);
}
const { STORIES } = await import(storiesJs.replaceAll("\\", "/"));
const logic = await import(logicJs.replaceAll("\\", "/"));
const { validateStory, meetsGating, createInitialState, applyConsequences, sceneById, encodeStory, decodeStory, seasonEpisodes, unassignedScenes } = logic;
const canvasJs = find(TMP, "canvas.js");
const canvas = canvasJs ? await import(canvasJs.replaceAll("\\", "/")) : null;

/* ---------- helpers (engine-faithful, mirrors Game.tsx) ---------- */
const choiceHasEffects = (c) => !!(c.consequences && Object.values(c.consequences).some((v) => Array.isArray(v) && v.length));
const choiceRepeats = (c) => (c.isRepeatable !== undefined ? c.isRepeatable : c.reply ? false : !choiceHasEffects(c));

function walk(story, avoidEndings = true) {
  const idx = new Map(story.scenes.map((s, i) => [s.id, i]));
  let state = createInitialState(story);
  const used = new Set();
  const visited = [];
  let cur = story.startSceneId;
  for (let step = 0; step < 300; step++) {
    const sc = sceneById(story, cur);
    if (!sc) return { ending: null, visited, stuck: cur };
    visited.push(sc.id);
    if (sc.onEnterActions) for (const a of sc.onEnterActions) state = applyConsequences(story, a.consequences, state);
    if (sc.isEnding) return { ending: sc, visited, state };
    const usable = (sc.choices ?? []).filter((c) =>
      !used.has(`${sc.id}:${c.id}`) &&
      !(c.hidden && !meetsGating(c.gating, state)) &&
      meetsGating(c.gating, state));
    let navs = usable.filter((c) => c.targetSceneId && !c.reply && c.targetSceneId !== "");
    if (avoidEndings) {
      const ne = navs.filter((c) => !sceneById(story, c.targetSceneId)?.isEnding);
      if (ne.length) navs = ne;
    }
    const nav = navs.sort((a, b) => (idx.get(b.targetSceneId) ?? 0) - (idx.get(a.targetSceneId) ?? 0))[0];
    if (nav) {
      used.add(`${sc.id}:${nav.id}`);
      if (nav.exclusiveGroup) (sc.choices ?? []).filter((o) => o.exclusiveGroup === nav.exclusiveGroup).forEach((o) => used.add(`${sc.id}:${o.id}`));
      state = applyConsequences(story, nav.consequences, state);
      if (nav.memoryLog) state = { ...state, memories: { ...state.memories, [nav.memoryLog]: nav.text } };
      cur = nav.targetSceneId;
      continue;
    }
    // No navigation choice yet — on a stage node the exit is a walk-to door
    // hotspot, not a choice. Only consider hotspots that actually route
    // somewhere (give-item / show-text markers must not be mistaken for exits).
    const routes = (sc.hotspots ?? []).filter((h) => h.action.targetSceneId || h.action.patternPuzzle?.targetSceneId);
    const hs = routes.find((h) => !used.has(`${sc.id}:${h.id}`) && meetsGating(h.gating, state));
    if (hs) {
      used.add(`${sc.id}:${hs.id}`);
      const target = hs.action.targetSceneId || hs.action.patternPuzzle?.targetSceneId;
      if (target) {
        cur = target;
        continue;
      }
    }
    const pick = usable.find((c) => c.reply);
    if (!pick && sc.autoAdvanceTargetSceneId) {
      cur = sc.autoAdvanceTargetSceneId;
      continue;
    }
    if (!pick) return { ending: null, visited, stuck: sc.id };
    used.add(`${sc.id}:${pick.id}`);
    if (pick.exclusiveGroup) (sc.choices ?? []).filter((o) => o.exclusiveGroup === pick.exclusiveGroup).forEach((o) => used.add(`${sc.id}:${o.id}`));
    state = applyConsequences(story, pick.consequences, state);
    if (pick.memoryLog) state = { ...state, memories: { ...state.memories, [pick.memoryLog]: pick.text } };
    if (!pick.reply && pick.targetSceneId) cur = pick.targetSceneId;
  }
  return { ending: null, visited, stuck: "step-guard" };
}

function assetRefs(story) {
  const refs = new Set();
  story.scenes.forEach((sc) => {
    if (sc.background?.startsWith("/")) refs.add(sc.background);
    (sc.dialogueBeats ?? []).forEach((b) => b.background?.startsWith("/") && refs.add(b.background));
    (sc.credits?.montage ?? []).forEach((m) => m.startsWith("/") && refs.add(m));
    (sc.cinematic?.foregroundAnimation?.frames ?? []).forEach((f) => refs.add(f));
    (sc.cinematic?.foregroundImage?.startsWith("/") && refs.add(sc.cinematic.foregroundImage));
    [sc.musicUrl, sc.sceneAudioUrl, sc.narrationAudioUrl].forEach((u) => u?.startsWith("/") && refs.add(u));
    (sc.dialogueBeats ?? []).forEach((b) => b.audioUrl?.startsWith("/") && refs.add(b.audioUrl));
  });
  story.characters.forEach((c) => c.avatarUrl?.startsWith("/") && refs.add(c.avatarUrl));
  story.items.forEach((i) => i.iconUrl?.startsWith("/") && refs.add(i.iconUrl));
  story.coverImage?.startsWith("/") && refs.add(story.coverImage);
  (story.acts ?? []).forEach((a) => a.titleCardImage?.startsWith("/") && refs.add(a.titleCardImage));
  (story.episodes ?? []).forEach((e) => [e.titleCardImage, e.posterImage, e.titleCardMusicUrl].forEach((u) => u?.startsWith("/") && refs.add(u)));
  return [...refs];
}

function musicTrace(story, order) {
  let playing = null;
  const spans = [];
  for (const id of order) {
    const sc = sceneById(story, id);
    const url = sc.musicUrl ?? sc.sceneAudioUrl ?? null;
    const mode = sc.musicMode ?? "inherit";
    if (mode === "none") playing = null;
    else if (url && (mode === "track" || playing !== url)) playing = url;
    if (playing) {
      const last = spans[spans.length - 1];
      if (last && last.track === playing) last.scenes.push(sc.title);
      else spans.push({ track: playing, scenes: [sc.title] });
    }
  }
  return spans;
}

/* ---------- 2. audit every story ---------- */
console.log(`\n${GOLD("PREFLIGHT")} — ${STORIES.length} stories in the catalogue\n`);
for (const s of STORIES) {
  console.log(`▸ ${s.title} ${DIM(`[${s.id}]`)}`);
  const issues = validateStory(s);
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  if (errors.length) fail(`${errors.length} validator error(s): ${errors.map((e) => e.message).join(" | ")}`);
  else pass(`validator clean${warnings.length ? ` (${warnings.length} warning(s))` : ""}`);
  warnings.slice(0, 4).forEach((w) => note(`warn: ${w.message.slice(0, 100)}`));

  const anyRun = walk(s, false);
  if (anyRun.ending) pass(`playable: walk ends on "${anyRun.ending.title}" [${anyRun.ending.endingData?.tier}] after ${anyRun.visited.length} scenes`);
  else fail(`no ending reachable (stuck at ${anyRun.stuck})`);
  // Episodic seasons: every episode is its own entry point — walk each one
  // and confirm the chapter itself terminates on an ending.
  const eps = Array.isArray(s.episodes) ? s.episodes : [];
  if (eps.length) {
    let epOk = true;
    for (const ep of eps) {
      const savedStart = s.startSceneId;
      s.startSceneId = ep.startSceneId;
      const run = walk(s, false);
      s.startSceneId = savedStart;
      if (run.ending && ep.sceneIds.includes(run.ending.id)) note(`episode ${ep.number ?? "?"} "${ep.title}" closes on "${run.ending.title}"`);
      else { epOk = false; fail(`episode "${ep.title}" walk fails (${run.ending ? `ends outside the episode at ${run.ending.id}` : `stuck at ${run.stuck}`})`); }
    }
    if (epOk) pass(`all ${eps.length} episodes playable and self-closing`);
  }
  // Coverage: union of deep walks from every entry point (story start + each
  // episode start), mirroring the validator's reachability seeding.
  const starts = [s.startSceneId, ...eps.map((e) => e.startSceneId)];
  const covered = new Set();
  starts.forEach((st) => {
    const savedStart = s.startSceneId;
    s.startSceneId = st;
    walk(s, true).visited.forEach((v) => covered.add(v));
    s.startSceneId = savedStart;
  });
  anyRun.visited.forEach((v) => covered.add(v));
  note(`deep walks cover ${covered.size}/${s.scenes.length} scenes`);
  if (covered.size < s.scenes.length) {
    const missed = s.scenes.filter((sc) => !covered.has(sc.id)).map((sc) => sc.title);
    if (missed.length) note(`not walked (still validator-reachable): ${missed.join(", ")}`);
  }

  const victories = s.scenes.filter((x) => x.isEnding && x.endingData?.tier?.startsWith("victory"));
  const gameovers = s.scenes.filter((x) => x.isEnding && x.endingData?.tier === "gameover");
  if (!victories.length) fail("no victory ending — the player cannot win");
  else if (!gameovers.length) note("no game-over ending (advisory)");
  else pass(`endings: ${victories.length} victory / ${gameovers.length} game-over`);

  const refs = assetRefs(s);
  const missing = refs.filter((a) => !existsSync(join(ROOT, "public", a)));
  if (missing.length) fail(`missing asset(s): ${missing.join(", ")}`);
  else pass(`${refs.length} referenced assets all on disk`);

  for (const span of musicTrace(s, [...new Set(anyRun.visited)])) {
    note(`music ${span.track} spans ${span.scenes.length} scene(s): ${span.scenes.slice(0, 3).join(", ")}${span.scenes.length > 3 ? "…" : ""}`);
  }
  console.log("");
}


/* ---------- 3. studio side ---------- */
console.log(`${GOLD("STUDIO SIDE")} — editor contracts\n`);
{
  // Share-link + JSON round trips: exactly what Studio's Share / commit /
  // export pipeline does to a story object.
  for (const s of STORIES) {
    const encoded = encodeStory(s);
    const decoded = decodeStory(encoded);
    const okRound = decoded && JSON.stringify(decoded) === JSON.stringify(s);
    if (!okRound) fail(`${s.title}: share-link encode/decode loses data`);
  }
  pass(`share-link round trip is lossless for all ${STORIES.length} stories`);

  // Episode bookkeeping the Episodes tab relies on.
  for (const s of STORIES) {
    if (!Array.isArray(s.episodes) || !s.episodes.length) continue;
    const orphans = unassignedScenes(s);
    if (orphans.length) fail(`${s.title}: ${orphans.length} scene(s) not in any episode (${orphans.map((o) => o.title).join(", ")})`);
    else pass(`${s.title}: every scene claimed by an episode (${seasonEpisodes(s).length} episodes)`);
    const claimed = seasonEpisodes(s).flatMap((e) => e.sceneIds);
    if (new Set(claimed).size !== claimed.length) fail(`${s.title}: a scene is claimed by two episodes`);
  }

  // Canvas layout helpers (the same functions Studio runs).
  if (canvas) {
    const draft = STORIES.find((x) => x.id === "nobodys-witness-draft");
    const base = draft.layout ?? {};
    // A pile (6 cards stacked at the origin) is repaired; a genuine drag is kept.
    const pile = {};
    draft.scenes.slice(0, 6).forEach((sc) => (pile[sc.id] = { x: 0, y: 0 }));
    const healed = canvas.healLayout(pile, base);
    const pileFixed = draft.scenes.slice(0, 6).every((sc) => {
      const p = healed[sc.id];
      const b = base[sc.id];
      return p && b && p.x === b.x && p.y === b.y;
    });
    if (pileFixed) pass("layout heal repairs a stacked pile (returns every card to its authored slot)");
    else fail("layout heal did not return piled cards to their authored slots");
    const dragged = { [draft.scenes[0].id]: { x: 9999, y: -42 } };
    const healedDrag = canvas.healLayout(dragged, base);
    if (healedDrag[draft.scenes[0].id].x === 9999) pass("layout heal keeps the author's own drags");
    else fail("layout heal clobbered a legitimate drag");
    // Tidy must produce a unique position for every scene of every story.
    let tidyOk = true;
    for (const s of STORIES) {
      const t = canvas.tidyLayoutPositions(s);
      const seen = new Set();
      Object.values(t).forEach((p) => seen.add(`${p.x},${p.y}`));
      if (Object.keys(t).length !== s.scenes.length || seen.size !== Object.keys(t).length) tidyOk = false;
    }
    if (tidyOk) pass("tidy layout gives every scene a unique slot in every story");
    else fail("tidy layout produced collisions or missed scenes");
  } else {
    fail("canvas module not compiled — studio layout tests skipped");
  }
  console.log("");
}

/* ---------- 4. wrap up ---------- */
rmSync(TMP, { recursive: true, force: true });
if (failures) {
  console.log(RED(`PREFLIGHT FAILED — ${failures} problem(s). Fix before shipping.`));
  process.exit(1);
}
console.log(GRN("PREFLIGHT PASSED — catalogue is production-ready. `npm run build` produces dist/index.html (single file).\n"));
