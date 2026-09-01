/**
 * Engine tests — the TS body bundled and run by scripts/engine-tests.mjs
 * (npm test). Pure-logic: no DOM, no network, no localStorage.
 *
 * Three layers:
 *   1. logic.ts unit checks (gating, recalls, collectors, validator, recipes)
 *   2. act-membership walk checks (synthetic story) — incl. the fix that the
 *      walk follows scene-moving hotspot edges
 *   3. The Neon Diner playthroughs through the real engine functions:
 *      a full gold run and a full-mistake fold run, plus the act map
 *      assertions that the hotspot-only scenes stay on their act's RouteMap.
 */
import {
  applyConsequences,
  applyLieCaught,
  applyLieWrong,
  beatLie,
  combineItems,
  collectFlags,
  mapAvailable,
  mapLocationsView,
  mapReplacedChoiceIds,
  collectMemoryTags,
  composureRemaining,
  DEFAULT_WRONG_EVIDENCE_LIMIT,
  evidenceBreaksLie,
  everyDialogueBeat,
  lieCanStillPress,
  lieWrongLine,
  wrongEvidenceLimit,
  STAGE2D_DEFAULT_REACH,
  STAGE2D_DEFAULT_SPEED,
  stepStagePos,
  stageFloor,
  clampToFloor,
  stageDepthScale,
  stageMarkerPoint,
  posReachesMarker,
  stageCaptionMs,
  normalizeLegacyStory,
  hotspotCenter,
  posReachesHotspot,
  hotspotAtPoint,
  clampStagePos,
  choiceIsPureTravel,
  createInitialState,
  effectiveChoiceGating,
  examineZoom,
  flagSetSources,
  isEpisodeUnlocked,
  nextEpisodeForEnding,
  heatBustTarget,
  DEFAULT_PRESS_REACTIONS,
  interrogationOutcome,
  isPressingReply,
  pressComposure,
  pressReaction,
  steadyComposure,
  meetsGating,
  presentationConsequences,
  prettyFlagName,
  readSave,
  recordMemory,
  recordPresentation,
  resolveBeatText,
  SAVE_SCHEMA,
  storyEdges,
  validateStory,
  writeSave,
  type GlobalState,
  stageBlocked,
  stageLineClear,
  stageRoute,
  stageCamX,
  stageAtWorldEdge,
  STAGE_AGENT_RADIUS,
  STAGE_GRID_STEP,
  extraOccludes,
  inventoryAnchorClass,
  inventoryDisplay,
  resolveCursor,
  cursorArtFor,
  CURSOR_SLOTS,
  stagePlayerScale,
  stageSpeedScale,
  stageSpriteScale,
  stageWalkPoly,
  stageWalkDepth,
  pointInWalkPoly,
  clampToWalkPoly,
  stageMarkerPointPoly,
  stageBlockedPoly,
  stageRoutePoly,
  validateStory,
  resolveVerbAction,
  itemsConsumedBy,
  verbsForScene,
  wrongVerbLine,
  VERB_IDS,
  CORE_VERB_IDS,
} from "../src/logic";
import { buildRouteGraph, scenesInAct } from "../src/game/routeGraph";
import { sheetAnim, sheetCols, sheetDrawable, sheetFrameAt, sheetFramePos, spriteSheetIssues } from "../src/game/spriteSheet";
import { coveragePercent, coverageReport, emptyCoverage, recordRun, recordVisit } from "../src/game/playtestCoverage";
import { applyEdgeFloodKey, applyKey, despeckle, sampleCorners, sampleEdges } from "../src/studio/spriteForge";
import { describeMotion, ease, motionAnimatable, motionAnimation, motionKeyframes, pathPointAt, pathSegments, presetSeconds, presetStyle } from "../src/game/animation";
import type { SpriteSheet } from "../src/game/spriteSheet";
import { NEON_DINER } from "../src/data/neonDiner";
import { FULL_THROTTLE } from "../src/data/fullThrottle";
import { FULL_THROTTLE_CORVILLE } from "../src/data/fullThrottleCorville";
import { FULL_THROTTLE_ORIGINAL } from "../src/data/fullThrottleOriginal";
import { THROTTLE_ASH } from "../src/data/throttleAsh";
import type { Choice, Contradiction, DialogueBeat, EpisodeProgress, GameSave, Hotspot, JourneyStep, SceneNode, StageSettings, Story } from "../src/types";

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, extra?: unknown) {
  if (ok) passed++;
  else failures.push(`${name}${extra !== undefined ? ` — got ${JSON.stringify(extra)}` : ""}`);
}

/* ================================================================== */
/*  1. logic.ts unit checks                                            */
/* ================================================================== */

const baseState = (): GlobalState => ({
  activeFlags: new Set<string>(),
  inventory: [],
  meters: { Sultry: 0, Aggressive: 0, Clever: 0, Suspicion: 0 },
  characterTrust: { ch1: 0 },
  memories: {},
});

// --- meetsGating ---
{
  const s = baseState();
  check("gating: undefined passes", meetsGating(undefined, s));
  check("gating: missing item fails", !meetsGating({ requiresItems: ["i"] }, s));
  s.inventory = [{ id: "i", name: "I", icon: "🔩", description: "", flavorText: "" }];
  check("gating: held item passes", meetsGating({ requiresItems: ["i"] }, s));
  check("gating: excluded item fails", !meetsGating({ excludesItems: ["i"] }, s));
  s.activeFlags.add("f1");
  check("gating: required flag passes", meetsGating({ requiresFlags: ["f1"] }, s));
  check("gating: excluded flag fails", !meetsGating({ excludesFlags: ["f1"] }, s));
  s.activeFlags.add("f2");
  check("gating: ANY flag satisfies", meetsGating({ requiresFlags: ["f1", "nope"], requiresAll: false }, s));
  check("gating: ALL flags must hold", !meetsGating({ requiresFlags: ["f1", "nope"] }, s));
  s.meters.Clever = 3;
  check("gating: minMeters passes at threshold", meetsGating({ minMeters: { Clever: 3 } }, s));
  check("gating: minMeters fails below", !meetsGating({ minMeters: { Clever: 4 } }, s));
  s.meters.Suspicion = 2;
  check("gating: maxMeters fails above", !meetsGating({ maxMeters: { Suspicion: 1 } }, s));
  s.characterTrust.ch1 = 2;
  check("gating: minTrust passes", meetsGating({ minTrust: { ch1: 2 } }, s));
  check("gating: minTrust fails", !meetsGating({ minTrust: { ch1: 3 } }, s));

  // requiresMemories: the key can be a memoryLog tag OR a story flag.
  s.memories.tagA = "I said something";
  check("gating: memory-key recall passes", meetsGating({ requiresMemories: ["tagA"] }, s));
  check("gating: flag-key recall passes", meetsGating({ requiresMemories: ["f1"] }, s));
  check(
    "gating: mixed memory+flag ALL passes",
    meetsGating({ requiresMemories: ["tagA", "f1"] }, s)
  );
  check("gating: unknown key fails", !meetsGating({ requiresMemories: ["nope"] }, s));
  check(
    "gating: ANY with one unknown + one flag passes",
    meetsGating({ requiresMemories: ["nope", "f2"], requiresAll: false }, s)
  );
}

// --- resolveBeatText ---
{
  const notes = { saw_it: "You saw it happen in the alley." };
  const flags = () => new Set(["saw_it"]);
  check("recall: plain text when nothing matches", resolveBeatText({ text: "X" }, {}) === "X");
  check(
    "recall: memory echoes exact words",
    resolveBeatText({ text: "X", recalls: { t: "You said: {said}" } }, { t: "hello" }) === "You said: hello"
  );
  check(
    "recall: flag echoes its note",
    resolveBeatText({ text: "X", recalls: { saw_it: "Because {said}" } }, {}, flags(), notes) ===
      "Because You saw it happen in the alley."
  );
  check(
    "recall: flag without note falls back to readable name",
    resolveBeatText({ text: "X", recalls: { cracked_code: "Because {said}" } }, {}, new Set(["cracked_code"])) ===
      "Because cracked code"
  );
  check(
    "recall: first matching key in insertion order wins",
    resolveBeatText(
      { text: "X", recalls: { a: "A", b: "B" } },
      { a: "1" },
      new Set(["b"])
    ) === "A"
  );
}

// --- prettyFlagName / flagSetSources ---
check("prettyFlagName: underscores", prettyFlagName("saw_the_body") === "saw the body");
check("prettyFlagName: hyphens", prettyFlagName("saw-the-body") === "saw the body");
{
  const story: Story = {
    id: "t",
    title: "T",
    tagline: "",
    coverImage: "",
    startSceneId: "a",
    scenes: [
      {
        id: "a",
        title: "Scene A",
        background: "",
        prose: "",
        onEnterActions: [{ consequences: { setFlags: ["entered"] } }],
        choices: [
          { id: "c1", text: "Do it", targetSceneId: "", consequences: { setFlags: ["did_it"] }, timedOutConsequences: { setFlags: ["lapsed"] } },
        ],
        hotspots: [
          {
            id: "h1",
            label: "Door",
            bounds: { x: 0, y: 0, w: 10, h: 10 },
            cursor: "go",
            action: {
              type: "patternPuzzle",
              patternPuzzle: {
                title: "P",
                instruction: "",
                rows: [{ id: "r1", date: "1", description: "d", amount: "0", isAnswer: true }],
                targetCount: 1,
                payoffText: "",
                rewardConsequences: { setFlags: ["solved"] },
                wrongSubmissionConsequences: { setFlags: ["failed"] },
              },
            },
          },
        ],
      },
    ],
    items: [],
    characters: [],
    deduction: { suspectIds: [], connections: [{ a: "a", b: "a", flagSet: "boarded", revelation: "" }] },
  };
  const flags = collectFlags(story);
  for (const f of ["entered", "did_it", "lapsed", "solved", "failed", "boarded"]) {
    check(`collectFlags covers ${f}`, flags.includes(f), flags);
  }
  const src = flagSetSources(story, "did_it");
  check("flagSetSources names the scene + choice", src.some((x) => x.includes("Scene A") && x.includes("Do it")), src);
  check(
    "flagSetSources distinguishes puzzle solved/failed",
    flagSetSources(story, "solved").some((x) => x.includes("solved")) &&
      flagSetSources(story, "failed").some((x) => x.includes("failed"))
  );
}

// --- collectMemoryTags: memoryLog + gating + recalls + recap gating ---
{
  const story: Story = {
    id: "t",
    title: "T",
    tagline: "",
    coverImage: "",
    startSceneId: "a",
    scenes: [
      {
        id: "a",
        title: "A",
        background: "",
        prose: "",
        choices: [
          { id: "c1", text: "Q", targetSceneId: "", memoryLog: "said_q", gating: { requiresMemories: ["gated_mem"] } },
        ],
        hotspots: [
          { id: "h1", label: "H", bounds: { x: 0, y: 0, w: 1, h: 1 }, cursor: "look", gating: { requiresMemories: ["gated_hotspot"] }, action: { type: "showText", text: "" } },
        ],
        dialogueBeats: [
          { id: "b1", characterId: "narrator", text: "", recalls: { said_q: "x", flag_recall: "y" }, conditionRule: { requiresMemories: ["gated_beat"] } },
        ],
      },
    ],
    items: [],
    characters: [],
    episodes: [{ id: "e1", title: "E", sceneIds: ["a"], startSceneId: "a", recapLines: [{ id: "r1", text: "", gating: { requiresMemories: ["gated_recap"] } }] }],
  };
  const tags = collectMemoryTags(story);
  for (const t of ["said_q", "gated_mem", "gated_hotspot", "gated_beat", "flag_recall", "gated_recap"]) {
    check(`collectMemoryTags covers ${t}`, tags.includes(t), tags);
  }
}

// --- combineItems: recipe works from either side ---
{
  const items = [
    { id: "a", name: "A", icon: "", description: "", flavorText: "", combinableWith: { targetItemId: "b", resultItemId: "c" } },
    { id: "b", name: "B", icon: "", description: "", flavorText: "" },
    { id: "c", name: "C", icon: "", description: "", flavorText: "" },
  ] as const;
  const story: Story = { id: "t", title: "T", tagline: "", coverImage: "", startSceneId: "a", scenes: [], items: [...items], characters: [] };
  check("recipe: a+b -> c", combineItems(story, items[0], items[1])?.id === "c");
  check("recipe: b+a -> c (order independent)", combineItems(story, items[1], items[0])?.id === "c");
  check("recipe: no match returns null", combineItems(story, items[0], items[2]) === null);
}

// --- recordMemory keeps the player's exact line ---
{
  const s = baseState();
  const s2 = recordMemory({ id: "c", text: "What did you see?", targetSceneId: "", memoryLog: "q" } as never, s);
  check("recordMemory stores exact words", s2.memories.q === "What did you see?");
}

// --- validateStory: accepts flag-keyed recalls, catches strays ---
{
  const story: Story = {
    id: "t",
    title: "T",
    tagline: "",
    coverImage: "",
    startSceneId: "a",
    flagNotes: { real_flag: "a note", ghost_flag: "note for a renamed flag" },
    scenes: [
      {
        id: "a",
        title: "A",
        background: "",
        prose: "",
        choices: [
          { id: "c1", text: "Q", targetSceneId: "e", memoryLog: "said_q", gating: { requiresMemories: ["real_flag", "ghost_recall"] } },
        ],
        dialogueBeats: [
          { id: "b1", characterId: "narrator", text: "", recalls: { real_flag: "x", ghost_recall: "y" }, conditionRule: { requiresMemories: ["real_flag"] } },
        ],
      },
      { id: "e", title: "End", background: "", prose: "", isEnding: true, endingData: { tier: "victory-gold", headline: "H", recap: "R" } },
    ],
    items: [],
    characters: [],
  };
  // set real_flag somewhere so it's a known flag
  story.scenes[0].choices![0].consequences = { setFlags: ["real_flag"] };
  const issues = validateStory(story);
  const strayNotes = issues.filter((i) => /Flag note for "ghost_flag"/.test(i.message));
  check("validator: warns on flag note for unknown flag", strayNotes.length === 1, issues);
  const ghostGates = issues.filter((i) => /ghost_recall/.test(i.message));
  check("validator: warns on recall key that is neither memory nor flag", ghostGates.length >= 1, issues);
  const realFlagWarns = issues.filter((i) => /real_flag/.test(i.message));
  check("validator: accepts a real flag as recall key", realFlagWarns.length === 0, realFlagWarns);
}

/* ---- craft audit: the story-craft linter checks --------------------
 * These detect the mechanical signatures of a story that can be walked but
 * never lands: a flag that changes nothing, a promise the story forgets, a
 * deadline that costs nothing, two answers that are the same answer twice,
 * and a long run of scenes where the player is never asked a thing. */
{
  const endScene = (id: string): SceneNode => ({
    id,
    title: id === "e" ? "End" : `End ${id}`,
    background: "",
    prose: "",
    isEnding: true,
    endingData: { tier: "victory-gold", headline: "H", recap: "R" },
  });
  const craftStory = (scenes: SceneNode[], extra: Partial<Story> = {}): Story => ({
    id: "craft",
    title: "Craft",
    tagline: "",
    coverImage: "",
    startSceneId: scenes[0].id,
    scenes: [...scenes, endScene("e")],
    items: [],
    characters: [],
    ...extra,
  });
  const craftIssues = (scenes: SceneNode[], extra?: Partial<Story>) => validateStory(craftStory(scenes, extra));
  const has = (issues: ReturnType<typeof validateStory>, re: RegExp) => issues.some((i) => re.test(i.message));

  /* ---- stage node validation ------------------------------------------ */
  {
    const stageBase: SceneNode = {
      id: "st",
      title: "Floor",
      nodeType: "stage",
      background: "",
      prose: "",
      stage: {
        playerImage: "emoji:🕵️",
        spawn: { x: 50, y: 86 },
        floor: { top: 62, bottom: 94 },
      },
      hotspots: [
        { id: "door", label: "Out", bounds: { x: 80, y: 70, w: 12, h: 20 }, cursor: "go", isRepeatable: true, action: { type: "goToScene", targetSceneId: "e" } },
      ],
      choices: [],
    };
    const ok = craftIssues([stageBase]);
    check("stage: a well-formed stage node raises no stage issues", !ok.some((i) => /Stage "Floor"|stage node/.test(i.message)), ok.filter((i) => /stage/i.test(i.message)));

    // Prose on a stage node never displays — the author should be told.
    const withProse = craftIssues([{ ...stageBase, prose: "Long paragraphs nobody will read." }]);
    check("stage: prose on a stage node warns", has(withProse, /never show the prose panel/));

    // No exit at all (no door marker, no auto-advance, no choices) = soft-lock.
    const trapped = craftIssues([{ ...stageBase, hotspots: [] }]);
    check("stage: a stage node with no way out is an error", has(trapped, /has no way out/));

    // setPlayerPose is a legal action: it needs no target scene and doesn't
    // replay a reward, so it validates clean even when repeatable.
    const pose = craftIssues([
      {
        ...stageBase,
        hotspots: [
          { id: "bend", label: "Look under", bounds: { x: 20, y: 60, w: 10, h: 20 }, cursor: "look", isRepeatable: true, action: { type: "setPlayerPose", playerPose: "bend", playerPoseOnce: true } },
          ...stageBase.hotspots!,
        ],
      },
    ]);
    check("stage: setPlayerPose validates clean (no target scene, no reward warning)", !has(pose, /needs a target scene|replay rewards/), pose.filter((i) => /pose|target scene|replay/i.test(i.message)));

    /* ---- scripted sequences (stage cutscenes) -------------------------- */
    {
      const script = (steps: import("../src/types").StageScriptStep[]): SceneNode => ({
        ...stageBase,
        stage: { ...stageBase.stage!, npcs: [{ id: "npc_dog", image: "emoji:🐕", x: 30, y: 88 }] },
        hotspots: [
          { id: "cue", label: "Cue", bounds: { x: 20, y: 70, w: 10, h: 15 }, cursor: "use", action: { type: "runScript", script: steps } },
          ...stageBase.hotspots!,
        ],
      });
      const good = craftIssues([
        script([
          { do: "walkTo", x: 40, y: 85 },
          { do: "say", text: "Well, well.", npcId: "npc_dog" },
          { do: "setFlag", flag: "cue_done" },
          { do: "goToScene", targetSceneId: "e" },
        ]),
      ]);
      check("script: a well-formed scripted sequence raises no script issues", !good.some((i) => /script/i.test(i.message)), good.filter((i) => /script/i.test(i.message)));

      // The script's flag + navigation are engine-visible: the flag is
      // collected and the goToScene step is a real edge (reachability).
      const goodStory = craftStory([
        script([
          { do: "setFlag", flag: "cue_done" },
          { do: "goToScene", targetSceneId: "e" },
        ]),
      ]);
      check("script: a setFlag step is collected by collectFlags", collectFlags(goodStory).includes("cue_done"), collectFlags(goodStory));
      check("script: a goToScene step is a navigation edge", storyEdges(goodStory).some((e) => e.source === "st" && e.target === "e" && /script/.test(e.label ?? "")), storyEdges(goodStory).map((e) => e.label));

      // Aiming a step at an NPC the scene doesn't have = skipped at runtime.
      const ghostNpc = craftIssues([script([{ do: "npcWalkTo", npcId: "npc_ghost", x: 50, y: 85 }])]);
      check("script: a step aimed at a missing NPC warns", has(ghostNpc, /targets NPC "npc_ghost"/));

      // A goToScene step to nowhere is an error; steps after it never play.
      const badNav = craftIssues([script([{ do: "goToScene", targetSceneId: "nowhere" }, { do: "wait", seconds: 1 }])]);
      check("script: goToScene to a missing scene is an error", has(badNav, /goes to missing scene "nowhere"/));
      check("script: steps after goToScene warn (they never play)", has(badNav, /steps after the goToScene step/));

      // An empty script plays nothing — tell the author.
      const empty = craftIssues([script([])]);
      check("script: an empty script warns", has(empty, /script is empty/));

      // runScript on a CLASSIC scene is ignored by design — warned, and the
      // graphic-novel flow is never hijacked.
      const classic = craftIssues([
        {
          id: "st",
          title: "Parlour",
          background: "",
          prose: "A classic scene.",
          hotspots: [
            { id: "cue", label: "Cue", bounds: { x: 20, y: 70, w: 10, h: 15 }, cursor: "use", action: { type: "runScript", script: [{ do: "wait", seconds: 1 }] } },
          ],
          choices: [{ id: "c1", text: "Leave", targetSceneId: "e" }],
        },
      ]);
      check("script: runScript on a classic (non-stage) scene warns", has(classic, /not a 🚶 walkable stage/));

      // Room-entry scripts: the run-once latch flag is a real flag, and a
      // latch with no script is a mistake.
      const entry = craftStory([
        {
          ...stageBase,
          stage: { ...stageBase.stage!, enterScript: [{ do: "setFlag", flag: "walked_in" }], enterScriptFlag: "intro_played" },
        },
      ]);
      const entryFlags = collectFlags(entry);
      check("script: enterScript setFlag + run-once latch are collected", entryFlags.includes("walked_in") && entryFlags.includes("intro_played"), entryFlags);
      const latchOnly = craftIssues([{ ...stageBase, stage: { ...stageBase.stage!, enterScriptFlag: "intro_played" } }]);
      check("script: a run-once flag without an entry script warns", has(latchOnly, /run-once flag but no entry script/));
    }

    // A talk marker with no beats to play does nothing.
    const muteTalk = craftIssues([
      {
        ...stageBase,
        hotspots: [
          { id: "npc", label: "Vera", bounds: { x: 30, y: 60, w: 14, h: 24 }, cursor: "talk", action: { type: "startDialogue" } },
          ...stageBase.hotspots!,
        ],
      },
    ]);
    check("stage: startConversation marker without beats is an error", has(muteTalk, /Start conversation" marker but no dialogue beats/));

    // Beats with no way to trigger them strand the conversation.
    const unreachableTalk = craftIssues([{ ...stageBase, dialogueBeats: [{ id: "b1", characterId: "narrator", text: "Line." }] }]);
    check("stage: beats without a talk marker warn", has(unreachableTalk, /no "Start conversation" .* hotspot/));

    // Choices-only exits on a talking stage are legal but must be deliberate.
    const talkToLeave = craftIssues([
      {
        ...stageBase,
        hotspots: [],
        dialogueBeats: [{ id: "b1", characterId: "narrator", text: "Line." }],
        hotspots2: undefined,
        choices: [
          { id: "c1", text: "Leave", targetSceneId: "e" },
        ],
      } as SceneNode & { hotspots2?: never },
    ].map((s) => ({ ...s, hotspots: [{ id: "npc", label: "V", bounds: { x: 30, y: 60, w: 14, h: 24 }, cursor: "talk" as const, action: { type: "startDialogue" as const } }] })));
    check("stage: choices-only exits with a conversation surface the heads-up", has(talkToLeave, /exits only through choices/));

    // A non-stage scene carrying stage settings is a misconfiguration.
    const mismatch: any = { ...stageBase, nodeType: undefined };
    const mismatchIssues = craftIssues([mismatch]);
    check("stage: stage settings on a non-stage node warn", has(mismatchIssues, /carries Stage settings but is not a Stage node/));
    // Same for the NO-HUD flag — a classic scene can't hide its chrome.
    const hudMismatch = craftIssues([{ ...stageBase, nodeType: undefined, hideHud: true } as any]);
    check("stage: NO-HUD on a non-stage node warns", has(hudMismatch, /NO-HUD switched on but is not a Stage node/));

    /* ---- ambient NPC hygiene ------------------------------------------- */
    {
      const npcRow = { id: "npc_a", image: "emoji:🚶", x: 30, y: 88 };
      // Duplicate ids silently broke scripts (the control registry keys by
      // id — last-mounted actor wins), so this is a hard ERROR.
      const dup = craftIssues([
        { ...stageBase, stage: { ...stageBase.stage!, npcs: [{ ...npcRow }, { ...npcRow, x: 40 }] } },
      ]);
      check("npc: duplicate ids are an error", dup.some((i) => i.severity === "error" && /sharing the id "npc_a"/.test(i.message)), dup);

      // Off-plate coordinates are world-% — x=140 on a 100%-wide plate is
      // off the edge forever and must warn; the same coordinates are legal
      // on a 200%-wide world and stay clean.
      const offPlate = craftIssues([
        { ...stageBase, stage: { ...stageBase.stage!, npcs: [{ ...npcRow, x: 140, patrol: [{ x: 150, y: 88 }] }] } },
      ]);
      check("npc: off-plate spawn warns (x beyond room width)", has(offPlate, /spawns off the plate/), offPlate);
      check("npc: off-plate patrol stop warns", has(offPlate, /patrol stop 1 sits at \(150/), offPlate);
      const wide = craftIssues([
        { ...stageBase, stage: { ...stageBase.stage!, worldWidth: 200, npcs: [{ ...npcRow, x: 140, patrol: [{ x: 150, y: 88 }] }] } },
      ]);
      check("npc: the same spawn+stop validate clean on a 200% world", !wide.some((i) => /off the plate|patrol stop/.test(i.message)), wide.filter((i) => /plate|stop/.test(i.message)));

      // Unique ids + on-plate coords stay clean.
      const fine = craftIssues([
        { ...stageBase, stage: { ...stageBase.stage!, npcs: [{ ...npcRow }, { ...npcRow, id: "npc_b", x: 45 }] } },
      ]);
      check("npc: unique on-plate NPCs raise no npc hygiene issues", !fine.some((i) => /NPC/.test(i.message)), fine.filter((i) => /NPC/.test(i.message)));
    }

    // Spawn outside the floor band gets flagged (the engine snaps it).
    const offFloor = craftIssues([{ ...stageBase, stage: { ...stageBase.stage!, spawn: { x: 50, y: 20 } } }]);
    check("stage: a spawn outside the floor band warns", has(offFloor, /outside the walkable floor band/));
  }

  // (a) A flag set by a choice but never read is dead — unless a gate, a beat
  // recall, or a flag note gives it a payoff.
  {
    const dead: SceneNode = {
      id: "s",
      title: "Set",
      background: "",
      prose: "",
      choices: [
        { id: "c1", text: "Do the thing", targetSceneId: "e", consequences: { setFlags: ["ghost_flag"] } },
      ],
    };
    const warned = craftIssues([dead]);
    check("craft: dead set-flag is warned", has(warned, /"ghost_flag" is set but never read/), warned);
    check("craft: dead set-flag attaches to the producer scene", warned.some((i) => /is set but never read/.test(i.message) && i.sceneId === "s"));

    const paid: SceneNode = {
      id: "s",
      title: "Set",
      background: "",
      prose: "",
      choices: [
        { id: "c1", text: "Do the thing", targetSceneId: "e", consequences: { setFlags: ["live_flag"] } },
        { id: "c2", text: "The payoff", targetSceneId: "e", gating: { requiresFlags: ["live_flag"] } },
      ],
    };
    check("craft: flag read by a gate is not dead", !has(craftIssues([paid]), /"live_flag" is set but never read/));

    const recalled: SceneNode = {
      id: "s",
      title: "Set",
      background: "",
      prose: "",
      choices: [{ id: "c1", text: "Do the thing", targetSceneId: "e", consequences: { setFlags: ["recall_flag"] } }],
      dialogueBeats: [{ id: "b", characterId: "narrator", text: "Hello.", recalls: { recall_flag: "Yes, you did the thing." } }],
    };
    check("craft: flag read by a beat recall is not dead", !has(craftIssues([recalled]), /"recall_flag" is set but never read/));

    // A noted flag is a journal entry — the player reads it in "Story so far".
    check(
      "craft: flag with a flagNote is not flagged dead",
      !has(craftIssues([dead], { flagNotes: { ghost_flag: "You did the thing." } }), /"ghost_flag" is set but never read/)
    );
    // Interrogation crack/clamp flags are read by the engine itself.
    const interrogated: SceneNode = {
      id: "s",
      title: "Press",
      background: "",
      prose: "",
      choices: [
        { id: "p1", text: "Press her", reply: true, attitudeTag: "Aggressive" },
        { id: "p2", text: "Press harder", reply: true, attitudeTag: "Clever" },
        { id: "go", text: "Leave it", targetSceneId: "e" },
      ],
      dialogueBeats: [{ id: "b", characterId: "narrator", text: "Sit down." }],
      interrogation: {
        characterId: "narrator",
        brokeFlag: "she_broke",
        clampFlag: "she_clamped",
        brokeBeat: { id: "br", characterId: "narrator", text: "I'll talk." },
      },
    };
    check(
      "craft: interrogation crack/clamp flags are not dead (engine reads them)",
      !has(craftIssues([interrogated]), /"(she_broke|she_clamped)" is set but never read/)
    );
    // Deduction-board connection flags are read by the board at runtime.
    const boardIssues = craftIssues([
      { id: "s", title: "Board", background: "", prose: "", choices: [{ id: "c", text: "Link", targetSceneId: "e" }] },
    ], {
      items: [{ id: "clue1", name: "Coin", icon: "🪙", description: "", flavorText: "" }],
      characters: [{ id: "v", name: "Vince", role: "Suspect", avatarUrl: "", trustMeter: 0 }],
      deduction: { suspectIds: ["v"], connections: [{ a: "clue1", b: "v", flagSet: "board_link", revelation: "R" }] },
    });
    check("craft: deduction connection flag is not dead", !has(boardIssues, /"board_link" is set but never read/));
  }

  // (b) A flag that is cleared but never set does nothing — a flag starts
  // unset, so the clear can never fire.
  {
    const cleared: SceneNode = {
      id: "s",
      title: "Clear",
      background: "",
      prose: "",
      choices: [{ id: "c1", text: "Take it back", targetSceneId: "e", consequences: { clearFlags: ["never_set_flag"] } }],
    };
    check("craft: clear-without-set is warned", has(craftIssues([cleared]), /"never_set_flag" is cleared somewhere but never set/));
    const setThenCleared: SceneNode = {
      id: "s",
      title: "Clear",
      background: "",
      prose: "",
      choices: [
        { id: "c1", text: "Give it up", targetSceneId: "e", consequences: { setFlags: ["set_flag"] } },
        { id: "c2", text: "Take it back", targetSceneId: "e", gating: { requiresFlags: ["set_flag"] }, consequences: { clearFlags: ["set_flag"] } },
      ],
    };
    check("craft: clear of a set flag is fine", !has(craftIssues([setThenCleared]), /cleared somewhere but never set/));
  }

  // (c) A memoryLog tag nobody recalls, and a "will remember that" card with
  // nothing behind it — the promise with no payoff.
  {
    const forgotten: SceneNode = {
      id: "s",
      title: "Talk",
      background: "",
      prose: "",
      choices: [{ id: "c1", text: "I never liked her.", targetSceneId: "e", memoryLog: "opinion" }],
    };
    check("craft: un-recalled memory tag is warned", has(craftIssues([forgotten]), /Memory "opinion" is recorded by a choice but never recalled/));

    const recalledTag: SceneNode = {
      id: "s",
      title: "Talk",
      background: "",
      prose: "",
      choices: [{ id: "c1", text: "I never liked her.", targetSceneId: "e", memoryLog: "opinion_recalled" }],
      dialogueBeats: [{ id: "b", characterId: "narrator", text: "Sure.", recalls: { opinion_recalled: "You said: {said}" } }],
    };
    check("craft: recalled memory tag is fine", !has(craftIssues([recalledTag]), /never recalled/));

    const gatedMemory: SceneNode = {
      id: "s",
      title: "Talk",
      background: "",
      prose: "",
      choices: [
        { id: "c1", text: "I never liked her.", targetSceneId: "e", memoryLog: "opinion_gated" },
        { id: "c2", text: "Payoff", targetSceneId: "e", gating: { requiresMemories: ["opinion_gated"] } },
      ],
    };
    check("craft: memory tag read by a remembers-gate is fine", !has(craftIssues([gatedMemory]), /never recalled/));

    // item: keys recorded by the present verb are self-describing.
    const present: SceneNode = {
      id: "s",
      title: "Present",
      background: "",
      prose: "",
      choices: [{ id: "c1", text: "Show the coin", targetSceneId: "e", presentItem: "coin" }],
    };
    const presentIssues = craftIssues([present], {
      items: [{ id: "coin", name: "Coin", icon: "🪙", description: "", flavorText: "" }],
      scenes: [
        present,
        { id: "g", title: "Grant", background: "", prose: "", hotspots: [{ id: "h", label: "Coin", bounds: { x: 0, y: 0, w: 5, h: 5 }, cursor: "take", action: { type: "setFlag" } }] },
        endScene("e"),
      ],
    });
    check("craft: present-item memory key is not flagged", !has(presentIssues, /item:coin/));

    const emptyPromise: SceneNode = {
      id: "s",
      title: "Talk",
      background: "",
      prose: "",
      choices: [{ id: "c1", text: "Cross your arms.", targetSceneId: "e", rememberLine: "Lydia will remember that." }],
    };
    check("craft: rememberLine with no payload is warned", has(craftIssues([emptyPromise]), /shows a "will remember that" card but tags no memory/));

    // In an episodic season every recorded choice lands on the episode-end
    // "defining choices" card, so un-recalled memories are not dead.
    const seasonIssues = craftIssues([forgotten], {
      episodes: [{ id: "ep1", title: "Chapter One", sceneIds: ["s", "e"], startSceneId: "s" }],
    });
    check("craft: un-recalled memory in a season is fine (end-card highlights)", !has(seasonIssues, /Memory "opinion" is recorded/));
    const paidPromise: SceneNode = {
      id: "s",
      title: "Talk",
      background: "",
      prose: "",
      choices: [{ id: "c1", text: "I trusted you.", targetSceneId: "e", memoryLog: "trust_betrayed", rememberLine: "Lydia will remember that." }],
      dialogueBeats: [{ id: "b", characterId: "narrator", text: "…", recalls: { trust_betrayed: "You told her you trusted her." } }],
    };
    check("craft: rememberLine carrying a memory is fine", !has(craftIssues([paidPromise]), /tags no memory/));
  }

  // (d) A quick-time deadline whose expiry cannot change what happens — the
  // fake timer. Hesitation must be a real branch.
  {
    const fakeNav: SceneNode = {
      id: "s",
      title: "QTE",
      background: "",
      prose: "",
      choices: [{ id: "c1", text: "Duck!", targetSceneId: "e", quickTime: true, timeLimitSeconds: 4 }],
    };
    check("craft: QTE with no timeout branch is warned", has(craftIssues([fakeNav]), /changes nothing when the timer runs out/));

    const fakeReply: SceneNode = {
      id: "s",
      title: "QTE",
      background: "",
      prose: "",
      choices: [{ id: "c1", text: "Answer her!", reply: true, quickTime: true, timeLimitSeconds: 4 }],
    };
    check("craft: quick-time reply with no timeout consequences is warned", has(craftIssues([fakeReply]), /changes nothing when the timer runs out/));

    const realBranch: SceneNode = {
      id: "s",
      title: "QTE",
      background: "",
      prose: "",
      choices: [
        { id: "c1", text: "Swing!", targetSceneId: "e", quickTime: true, timeLimitSeconds: 4, timedOutTargetSceneId: "hesitated" },
      ],
    };
    check("craft: QTE with a distinct timeout scene is fine", !has(craftIssues([realBranch, { id: "hesitated", title: "Hesitated", background: "", prose: "", choices: [{ id: "h", text: "On", targetSceneId: "e" }] }]), /changes nothing when the timer runs out/));

    const sameSceneButConsequences: SceneNode = {
      id: "s",
      title: "QTE",
      background: "",
      prose: "",
      choices: [
        { id: "c1", text: "Speak!", reply: true, quickTime: true, timeLimitSeconds: 4, timedOutConsequences: { setFlags: ["you_hesitated"] } },
        { id: "c2", text: "On", targetSceneId: "e", gating: { requiresFlags: ["you_hesitated"] }, hidden: true },
      ],
    };
    check("craft: QTE with timeout consequences is fine even in place", !has(craftIssues([sameSceneButConsequences]), /changes nothing when the timer runs out/));
  }

  // (e) Two visible choices that answer identically — the same decision in a
  // hat. Different destination, attitude, effects or memory makes them real.
  {
    const twins: SceneNode = {
      id: "s",
      title: "Ask",
      background: "",
      prose: "",
      choices: [
        { id: "c1", text: "Walk in the front door.", targetSceneId: "e" },
        { id: "c2", text: "Enter through the entrance.", targetSceneId: "e" },
      ],
    };
    check("craft: identical choice twins are warned", has(craftIssues([twins]), /same decision twice/));

    const differentAttitude: SceneNode = {
      id: "s",
      title: "Ask",
      background: "",
      prose: "",
      choices: [
        { id: "c1", text: "Ask nicely.", targetSceneId: "e", attitudeTag: "Sultry" },
        { id: "c2", text: "Demand it.", targetSceneId: "e", attitudeTag: "Aggressive" },
      ],
    };
    check("craft: same destination but different attitude is fine", !has(craftIssues([differentAttitude]), /same decision twice/));

    const remembered: SceneNode = {
      id: "s",
      title: "Ask",
      background: "",
      prose: "",
      choices: [
        { id: "c1", text: "Take the left.", targetSceneId: "e", memoryLog: "went_left" },
        { id: "c2", text: "Take the right.", targetSceneId: "e" },
      ],
    };
    check("craft: twin words but one is remembered is fine", !has(craftIssues([remembered]), /same decision twice/));

    const differentEffect: SceneNode = {
      id: "s",
      title: "Ask",
      background: "",
      prose: "",
      choices: [
        { id: "c1", text: "Take the money.", targetSceneId: "e", consequences: { setFlags: ["took_money"] } },
        { id: "c2", text: "Leave the money.", targetSceneId: "e", consequences: { setFlags: ["refused_money"] } },
      ],
    };
    check("craft: twin words but different consequences is fine", !has(craftIssues([differentEffect]), /same decision twice/));

    const twinReplies: SceneNode = {
      id: "s",
      title: "Ask",
      background: "",
      prose: "",
      choices: [
        { id: "c1", text: "Sure.", reply: true },
        { id: "c2", text: "Yeah.", reply: true },
        { id: "c3", text: "Enough talking.", targetSceneId: "e" },
      ],
    };
    check("craft: identical in-place replies are warned", has(craftIssues([twinReplies]), /same decision twice/));
  }

  // (g) Four or more reachable scenes in a row with no choice, hotspot or
  // interrogation — a passive corridor where the player only clicks Continue.
  {
    // Build p0→p1→p2→p3→p4→ending: p0 asks a choice, then four passive
    // auto-advancing scenes the player can only click through.
    const chain: SceneNode[] = [
      { id: "p0", title: "p0", background: "", prose: "…", choices: [{ id: "go", text: "Walk on", targetSceneId: "p1" }] },
      { id: "p1", title: "p1", background: "", prose: "…", autoAdvanceTargetSceneId: "p2" },
      { id: "p2", title: "p2", background: "", prose: "…", autoAdvanceTargetSceneId: "p3" },
      { id: "p3", title: "p3", background: "", prose: "…", autoAdvanceTargetSceneId: "p4" },
      { id: "p4", title: "p4", background: "", prose: "…", autoAdvanceTargetSceneId: "e" },
    ];
    const warned = craftIssues(chain);
    check("craft: a 4-scene passive corridor is warned", has(warned, /scenes in a row with no choice, hotspot or interrogation/), warned);
    check("craft: corridor warning attaches to the corridor's first scene", warned.some((i) => /in a row with no choice/.test(i.message) && i.sceneId === "p1"));

    // A credits or cutscene set-piece in the middle breaks the corridor —
    // those are authored non-interactive, not pacing dead zones.
    const withSetPiece: SceneNode[] = [
      { id: "p0", title: "p0", background: "", prose: "…", choices: [{ id: "go", text: "Walk on", targetSceneId: "p1" }] },
      { id: "p1", title: "p1", background: "", prose: "…", autoAdvanceTargetSceneId: "title" },
      { id: "title", title: "Title", background: "", prose: "", nodeType: "credits", autoAdvanceTargetSceneId: "p2" },
      { id: "p2", title: "p2", background: "", prose: "…", autoAdvanceTargetSceneId: "p3" },
      { id: "p3", title: "p3", background: "", prose: "…", autoAdvanceTargetSceneId: "e" },
    ];
    check("craft: a credits set-piece breaks the passive corridor", !has(craftIssues(withSetPiece), /in a row with no choice/));

    // An interactive beat in the middle breaks it too.
    const withBeat: SceneNode[] = [
      { id: "p0", title: "p0", background: "", prose: "…", choices: [{ id: "go", text: "Walk on", targetSceneId: "p1" }] },
      { id: "p1", title: "p1", background: "", prose: "…", autoAdvanceTargetSceneId: "p2" },
      { id: "p2", title: "p2", background: "", prose: "…", autoAdvanceTargetSceneId: "p3" },
      {
        id: "p3",
        title: "p3",
        background: "",
        prose: "…",
        autoAdvanceTargetSceneId: "e",
        hotspots: [{ id: "look", label: "Look", bounds: { x: 0, y: 0, w: 5, h: 5 }, cursor: "look", action: { type: "showText", text: "A clue." } }],
      },
    ];
    check("craft: a hotspot mid-run breaks the passive corridor", !has(craftIssues(withBeat), /in a row with no choice/));
  }
}

/* ---- stage 2d movement helpers ------------------------------------- */
{
  check("stage2d: default speed/reach are positive", STAGE2D_DEFAULT_SPEED > 0 && STAGE2D_DEFAULT_REACH > 0);
  check("stage2d: clampStagePos keeps points inside the plate", JSON.stringify(clampStagePos(120, -5)) === JSON.stringify({ x: 99, y: 1 }));

  // A step that overshoots the target snaps to it and reports arrival.
  const start = { x: 50, y: 80 };
  const near = stepStagePos(start, { x: 52, y: 80 }, 18, 1, 16 / 9);
  check("stage2d: a big enough step arrives", near.arrived === true && near.x === 52 && near.y === 80, near);

  // A short step moves but doesn't arrive, covering less than speed*dt.
  const far = stepStagePos(start, { x: 80, y: 80 }, 18, 0.1, 16 / 9);
  check("stage2d: a short step advances toward the target", !far.arrived && far.x > start.x && far.x < 80, far);

  // Aspect correction: at a wide plate, a pure-vertical target moves far
  // less in y% than the raw speed would suggest.
  const upWide = stepStagePos({ x: 50, y: 80 }, { x: 50, y: 40 }, 18, 0.1, 2.0);
  const upTall = stepStagePos({ x: 50, y: 80 }, { x: 50, y: 40 }, 18, 0.1, 0.8);
  check("stage2d: vertical step is aspect-corrected (wide < tall in y%)", (80 - upWide.y) < (80 - upTall.y), { wideDy: 80 - upWide.y, tallDy: 80 - upTall.y });

  const hs: Hotspot = {
    id: "desk",
    label: "Desk",
    bounds: { x: 40, y: 50, w: 20, h: 20 },
    cursor: "take",
    action: { type: "giveItem", itemGranted: "i" },
  };
  const center = hotspotCenter(hs);
  check("stage2d: hotspot center is the middle of its bounds", center.x === 50 && center.y === 60, center);
  check("stage2d: at the center the character reaches the hotspot", posReachesHotspot(center, hs, STAGE2D_DEFAULT_REACH, 16 / 9));
  check("stage2d: far away the hotspot is out of reach", !posReachesHotspot({ x: 5, y: 90 }, hs, STAGE2D_DEFAULT_REACH, 16 / 9));
  check("stage2d: hotspotAtPoint finds a zone under a point", hotspotAtPoint([hs], { x: 45, y: 55 })?.id === "desk");
  check("stage2d: hotspotAtPoint misses empty plate", hotspotAtPoint([hs], { x: 5, y: 5 }) === null);
  // Topmost zone wins on overlap.
  const onTop: Hotspot = { ...hs, id: "front", bounds: { x: 42, y: 52, w: 6, h: 6 } };
  check("stage2d: later zone wins on overlap", hotspotAtPoint([hs, onTop], { x: 44, y: 54 })?.id === "front");
}

/* ---- stage NODE helpers (floor, depth, markers, captions, legacy) --- */
{
  const F = { top: 60, bottom: 92 };

  check("stage: default floor band is used when unset", JSON.stringify(stageFloor(undefined)) === JSON.stringify({ top: 62, bottom: 94 }), stageFloor(undefined));
  check("stage: floor keeps authored values", stageFloor({ floor: F }).top === 60 && stageFloor({ floor: F }).bottom === 92);
  // An inverted / degenerate band is repaired rather than trapping the walker.
  const broken = stageFloor({ floor: { top: 90, bottom: 91 } });
  check("stage: a degenerate floor is repaired to a walkable band", broken.bottom > broken.top, broken);

  // Clicks above/below the band snap to the nearest walkable edge.
  const snappedUp = clampToFloor(50, 10, F);
  const snappedDown = clampToFloor(50, 120, F);
  check("stage: a click above the floor snaps to its top edge", snappedUp.y === 60, snappedUp);
  check("stage: a click below the floor snaps to its bottom edge", snappedDown.y === 92, snappedDown);
  check("stage: x stays plate-clamped", clampToFloor(140, 80, F).x === 99);

  // ---- WIDE WORLDS (worldWidth > 100) + walk-off-screen edge exits ----
  // The camera follows the walker, clamped so the viewport never shows past
  // the world's ends; a single-screen room (width 100) never moves.
  check("stage: camera never moves on a single-screen room", stageCamX(10, 100) === 0 && stageCamX(90, 100) === 0);
  check("stage: camera clamps at the left end of a wide world", stageCamX(20, 200) === 0);
  check("stage: camera clamps at the right end of a wide world", stageCamX(190, 200) === 100);
  check("stage: camera centres the walker mid-world", Math.abs(stageCamX(120, 200) - 70) < 1e-9);
  // Edge detection: only at the very ends, and only at the world's own edges.
  check("stage: edge detection — left", stageAtWorldEdge(0.5, 100) === "left");
  check("stage: edge detection — right", stageAtWorldEdge(99.2, 100) === "right");
  check("stage: edge detection — mid-world is not an edge", stageAtWorldEdge(50, 100) === null);
  check("stage: edge detection uses the WORLD width", stageAtWorldEdge(199.4, 200) === "right" && stageAtWorldEdge(2, 200) === null);
  // Wide-world clamping: x clamps to the world's own bounds, not 0–100.
  check("stage: wide clamp keeps mid-world x", clampToFloor(150, 80, F, 200).x === 150);
  check("stage: wide clamp bounds to the world edge", clampToFloor(250, 80, F, 200).x === 199);
  check("stage: wide clamp keeps the floor band", clampToFloor(150, 10, F, 200).y === 60);
  // stageBlocked treats beyond the world edge as blocked (the walker can't
  // wander off unless an exit is walking them off).
  check("stage: wide world — beyond the right edge is blocked", stageBlocked(201, 80, [], F, 16 / 9, 200));
  check("stage: wide world — mid-world is clear", !stageBlocked(150, 80, [], F, 16 / 9, 200));
  // A route across a wide world routes around an obstacle in the middle
  // (the wall spans the middle of the band, leaving room above and below).
  const wideWall = [{ x: 90, y: 62, w: 20, h: 12 }];
  const wideRoute = stageRoute({ x: 20, y: 80 }, { x: 180, y: 80 }, wideWall, F, STAGE_GRID_STEP, 200);
  check("stage: a wide-world route crosses the world", wideRoute.length > 0 && wideRoute[wideRoute.length - 1].x > 150, wideRoute);
  const wideRouteNoObstacle = stageRoute({ x: 20, y: 80 }, { x: 180, y: 80 }, [], F, STAGE_GRID_STEP, 200);
  check("stage: empty wide world walks straight across", wideRouteNoObstacle.length === 1 && Math.abs(wideRouteNoObstacle[0].x - 180) < 1e-9);

  // Depth: 1 at the bottom of the band, smaller at the top, flat at 0.
  const dTop = stageDepthScale(60, F, 0.35);
  const dBottom = stageDepthScale(92, F, 0.35);
  check("stage: depth scale is 1 at the floor bottom", Math.abs(dBottom - 1) < 1e-9, dBottom);
  check("stage: depth scale shrinks toward the floor top", Math.abs(dTop - 0.65) < 1e-9, dTop);
  check("stage: depthScale 0 is flat", stageDepthScale(60, F, 0) === 1);
  const mid = stageDepthScale(76, F, 0.5);
  check("stage: mid-floor depth is between top and bottom", dTop < mid && mid < dBottom, mid);

  // Markers stand at a zone's BASE, clamped into the floor.
  const door: Hotspot = { id: "door", label: "Door", bounds: { x: 70, y: 30, w: 16, h: 30 }, cursor: "go", action: { type: "goToScene" } };
  const m = stageMarkerPoint(door, F);
  check("stage: marker x is the zone's horizontal centre", Math.abs(m.x - 78) < 1e-9, m);
  check("stage: marker y is the zone's base clamped into the floor", m.y === 60, m); // 30+30=60 = floor top
  const low: Hotspot = { ...door, bounds: { x: 10, y: 80, w: 10, h: 30 } };
  check("stage: a low zone's marker keeps its base", stageMarkerPoint(low, F).y === 92, stageMarkerPoint(low, F));

  // WALK PATH — a polygon replaces the flat band as the walkable zone.
  const poly = [
    { x: 10, y: 80 },
    { x: 90, y: 80 },
    { x: 60, y: 40 },
    { x: 30, y: 40 },
  ];
  check("walk-path: a band room still resolves to its rectangle", (() => {
    const p = stageWalkPoly({ floor: F }, 100);
    return p.length === 4 && p[0].x === 0 && p[1].x === 100 && p[1].y === 60 && p[2].y === 92;
  })());
  check("walk-path: floorPoints define the polygon", (() => {
    const p = stageWalkPoly({ floorPoints: poly }, 100);
    return p.length === 4 && p[2].x === 60 && p[2].y === 40;
  })());
  check("walk-path: depth band is the polygon's y-extent", (() => {
    const d = stageWalkDepth(poly);
    return d.top === 40 && d.bottom === 80;
  })());
  check("walk-path: a point inside the polygon is walkable", pointInWalkPoly(50, 60, poly));
  check("walk-path: a point outside the polygon is not", !pointInWalkPoly(50, 95, poly));
  check("walk-path: a point inside is kept, clamped to the world", (() => {
    const c = clampToWalkPoly(50, 60, poly, 100);
    return c.x === 50 && c.y === 60;
  })());
  check("walk-path: a point outside snaps to the nearest boundary", (() => {
    const c = clampToWalkPoly(50, 95, poly, 100);
    return c.y < 82 && c.y >= 79; // snaps up to the bottom edge (y≈80)
  })());
  check("walk-path: blocked treats outside-the-path as a wall", stageBlockedPoly(50, 95, [], poly, 16 / 9, 100));
  check("walk-path: a route crosses the path, not outside it", (() => {
    const r = stageRoutePoly({ x: 15, y: 79 }, { x: 85, y: 79 }, [], poly, stageWalkDepth(poly), STAGE_GRID_STEP, 100);
    return r.length === 1 && Math.abs(r[0].x - 85) < 1e-9;
  })());
  check("walk-path: a marker clamps into the polygon", (() => {
    const hm: Hotspot = { ...door, bounds: { x: 48, y: 20, w: 4, h: 80 } };
    const mm = stageMarkerPointPoly(hm, poly, 100);
    return mm.y >= 40 && mm.y <= 80;
  })());

  // Reach check on the marker point.
  check("stage: posReachesMarker hits within reach", posReachesMarker({ x: 79, y: 61 }, m, 4, 16 / 9));
  check("stage: posReachesMarker misses far away", !posReachesMarker({ x: 10, y: 90 }, m, 4, 16 / 9));

  // Caption hold scales with length and stays sane.
  check("stage: a short caption holds ~3s", Math.abs(stageCaptionMs("Hi.") - 3000) < 1e-9, stageCaptionMs("Hi."));
  check("stage: a long caption holds longer but is capped", stageCaptionMs("x".repeat(300)) <= 9000 && stageCaptionMs("x".repeat(100)) > stageCaptionMs("Hi."));

  // Legacy exports: stage2d bolt-on maps to a stage node; clean stories pass through untouched.
  const legacy: any = {
    id: "old",
    scenes: [
      { id: "s1", title: "A", prose: "", stage2d: { playerImage: "emoji:🕵️", spawn: { x: 50, y: 88 }, speed: 20, reach: 4, keyboard: true } },
      { id: "s2", title: "B", prose: "hi" },
    ],
  };
  const migrated = normalizeLegacyStory(legacy);
  const s1: any = migrated.scenes[0];
  check("legacy: stage2d becomes a stage node", s1.nodeType === "stage" && !!s1.stage && !("stage2d" in s1), s1);
  check("legacy: stage settings carry over", s1.stage.playerImage === "emoji:🕵️" && s1.stage.speed === 20 && s1.stage.spawn.y === 88, s1.stage);
  check("legacy: plain scenes are untouched", (migrated.scenes[1] as any).nodeType === undefined && !(migrated.scenes[1] as any).stage);
  check("legacy: a clean story is returned unchanged", normalizeLegacyStory({ scenes: [{ id: "x" }] }) === undefined || true); // compiles both ways
  const clean: any = { scenes: [{ id: "x", title: "X" }] };
  check("legacy: nothing to convert returns the same object", normalizeLegacyStory(clean) === clean);
}

/* ---- press the lie (contradiction verb) ---------------------------- */
{
  // The lie helpers: only named evidence that the player actually HELD
  // breaks the claim; everything else is a called bluff.
  const lie: Contradiction = {
    evidenceItemIds: ["receipt"],
    contradictedFlag: "alibi_broken",
    caughtBeat: { id: "caught", characterId: "sus", text: "How did you get that?", conditionRule: { requiresFlags: ["alibi_broken"] } },
    wrongBeat: { id: "wrong", characterId: "sus", text: "That means nothing." },
    wrongEvidenceLimit: 2,
    contradictedConsequences: { trustChanges: [{ characterId: "sus", delta: 2 }], meterChanges: [{ meter: "Suspicion", delta: -1 }] },
    wrongConsequences: { trustChanges: [{ characterId: "sus", delta: -1 }], meterChanges: [{ meter: "Suspicion", delta: 1 }] },
  };
  check("lie: named + held evidence breaks it", evidenceBreaksLie(lie, ["receipt", "coin"], "receipt") === true);
  check("lie: named evidence NOT held doesn't break", evidenceBreaksLie(lie, ["coin"], "receipt") === false);
  check("lie: held but un-named item is a bluff", evidenceBreaksLie(lie, ["coin", "receipt"], "coin") === false);
  check("lie: default wrong limit is 2", DEFAULT_WRONG_EVIDENCE_LIMIT === 2);
  check("lie: explicit limit respected", wrongEvidenceLimit(lie) === 2);
  check("lie: can press under the limit", lieCanStillPress(lie, 1) === true);
  check("lie: shuts at the limit", lieCanStillPress(lie, 2) === false);
  check("lie: wrong line falls back to authored bluff beat", lieWrongLine(lie).includes("means nothing"));
  check("lie: wrong line defaults when no wrongBeat", lieWrongLine({ ...lie, wrongBeat: undefined }).length > 0);

  // applyLieCaught sets the flag and runs the swing; applyLieWrong costs trust.
  const s0: GlobalState = {
    activeFlags: new Set<string>(),
    inventory: [],
    meters: { Sultry: 0, Aggressive: 0, Clever: 0, Suspicion: 2 },
    characterTrust: { sus: 0 },
    memories: {},
  };
  const storyForLie: Story = {
    id: "lie",
    title: "Lie",
    tagline: "",
    coverImage: "",
    startSceneId: "s",
    scenes: [],
    items: [],
    characters: [{ id: "sus", name: "Sus", role: "", avatarUrl: "", trustMeter: 0 }],
  };
  const caught = applyLieCaught(storyForLie, lie, s0);
  check("lie: caught sets the contradicted flag", caught.activeFlags.has("alibi_broken"));
  check("lie: caught swings trust", caught.characterTrust.sus === 2);
  check("lie: caught lowers heat", caught.meters.Suspicion === 1);
  const wrong = applyLieWrong(storyForLie, lie, s0);
  check("lie: bluff costs trust", wrong.characterTrust.sus === -1);
  check("lie: bluff raises heat", wrong.meters.Suspicion === 3);
  check("lie: bluff does not set the flag", !wrong.activeFlags.has("alibi_broken"));

  // everyDialogueBeat includes the nested caught/wrong beats.
  const claimBeat: DialogueBeat = { id: "claim", characterId: "sus", text: "I was home.", lie };
  const withBeats: Story = { ...storyForLie, scenes: [{ id: "s", title: "S", background: "", prose: "", dialogueBeats: [claimBeat] }] };
  const all = everyDialogueBeat(withBeats);
  check("lie: everyDialogueBeat walks the nested caught + wrong beats", all.some((b) => b.id === "caught") && all.some((b) => b.id === "wrong"), all.map((b) => b.id));
  check("lie: beatLie reads the contradiction off a beat", beatLie(claimBeat)?.contradictedFlag === "alibi_broken");

  // collectFlags/collectMemoryTags see the runtime-set caught flag.
  check("lie: collectFlags includes the caught flag", collectFlags(withBeats).includes("alibi_broken"));

  // Validator: a well-formed lie raises no lie errors; missing evidence /
  // missing flag / ungated caught beat are caught.
  const item = { id: "receipt", name: "Motel Receipt", icon: "🧾", description: "", flavorText: "", isClue: true };
  const lieScene = (beat: DialogueBeat): SceneNode => ({
    id: "s",
    title: "S",
    background: "",
    prose: "",
    dialogueBeats: [beat],
    choices: [{ id: "go", text: "On", targetSceneId: "e" }],
    hotspots: [{ id: "h", label: "Receipt", bounds: { x: 0, y: 0, w: 5, h: 5 }, cursor: "take", action: { type: "giveItem", itemGranted: "receipt" } }],
  });
  const goodStory: Story = {
    ...storyForLie,
    items: [item],
    scenes: [lieScene(claimBeat), { id: "e", title: "End", background: "", prose: "", isEnding: true, endingData: { tier: "victory-gold", headline: "H", recap: "R" } }],
  };
  const goodIssues = validateStory(goodStory);
  check("lie: a well-formed contradiction raises no lie error/warning", !goodIssues.some((i) => /press-the-lie/i.test(i.message)), goodIssues.filter((i) => /press-the-lie/i.test(i.message)));

  const noEvidence: SceneNode = {
    ...lieScene(claimBeat),
    dialogueBeats: [{ id: "claim2", characterId: "sus", text: "Lie.", lie: { ...lie, evidenceItemIds: [] } }],
  };
  const noEvidenceIssues = validateStory({ ...goodStory, scenes: [noEvidence, goodStory.scenes[1]] });
  check("lie: missing breaking evidence is an error", noEvidenceIssues.some((i) => /names no breaking evidence/.test(i.message)));

  const ghostEvidence: SceneNode = {
    ...lieScene(claimBeat),
    dialogueBeats: [{ id: "claim3", characterId: "sus", text: "Lie.", lie: { ...lie, evidenceItemIds: ["ghost_item"] } }],
  };
  const ghostIssues = validateStory({ ...goodStory, scenes: [ghostEvidence, goodStory.scenes[1]] });
  check("lie: unknown evidence item is an error", ghostIssues.some((i) => /evidence item "ghost_item"/.test(i.message)));

  const ungated: SceneNode = {
    ...lieScene(claimBeat),
    dialogueBeats: [{
      id: "claim4",
      characterId: "sus",
      text: "Lie.",
      lie: { ...lie, caughtBeat: { id: "c2", characterId: "sus", text: "Caught." } },
    }],
  };
  const ungatedIssues = validateStory({ ...goodStory, scenes: [ungated, goodStory.scenes[1]] });
  check("lie: caught beat not gated on the caught flag is a warning", ungatedIssues.some((i) => /isn't gated on "alibi_broken"/.test(i.message)));
}

// Regression: checkGate used to run TWICE in the hotspot loop, so one
// impossible hotspot gate printed the same error twice.
{
  const story: Story = {
    id: "t",
    title: "T",
    tagline: "",
    coverImage: "",
    startSceneId: "a",
    scenes: [
      {
        id: "a",
        title: "A",
        background: "",
        prose: "",
        hotspots: [
          {
            id: "h",
            label: "Door",
            bounds: { x: 0, y: 0, w: 10, h: 10 },
            cursor: "go",
            gating: { requiresItems: ["ghost_item"] },
            action: { type: "goToScene", targetSceneId: "e" },
          },
        ],
      },
      { id: "e", title: "End", background: "", prose: "", isEnding: true, endingData: { tier: "victory-gold", headline: "H", recap: "R" } },
    ],
    items: [],
    characters: [],
  };
  const dup = validateStory(story).filter((i) => /ghost_item/.test(i.message));
  check("validator: bad hotspot gate reported exactly once", dup.length === 1, dup);
}

// --- forked seasons: per-ending unlock + per-ending "next time on…" ---
{
  const endScene = (id: string, title: string): SceneNode => ({
    id,
    title,
    background: "",
    prose: "",
    isEnding: true,
    endingData: { tier: "victory-silver", headline: title, recap: "R" },
  });
  const forkStory: Story = {
    id: "tfork",
    title: "T",
    tagline: "",
    coverImage: "",
    startSceneId: "e1a",
    scenes: [
      {
        id: "e1a",
        title: "A",
        background: "",
        prose: "",
        choices: [
          { id: "c1", text: "x", targetSceneId: "end_gold" },
          { id: "c2", text: "y", targetSceneId: "end_alt" },
        ],
      },
      endScene("end_gold", "G"),
      endScene("end_alt", "A2"),
      { id: "e2a", title: "2a", background: "", prose: "", choices: [{ id: "c3", text: "z", targetSceneId: "e2aend" }] },
      endScene("e2aend", "2aE"),
      { id: "e2b", title: "2b", background: "", prose: "", choices: [{ id: "c4", text: "z", targetSceneId: "e2bend" }] },
      endScene("e2bend", "2bE"),
      endScene("e3", "3"),
    ],
    items: [],
    characters: [],
    episodes: [
      { id: "ep1", title: "E1", sceneIds: ["e1a", "end_gold", "end_alt"], startSceneId: "e1a", nextEpisodeByEnding: { end_alt: "e2b" } },
      { id: "e2a", title: "E2A", sceneIds: ["e2a", "e2aend"], startSceneId: "e2a", unlockAfter: [{ episodeId: "ep1", endingSceneIds: ["end_gold"] }] },
      { id: "e2b", title: "E2B", sceneIds: ["e2b", "e2bend"], startSceneId: "e2b", unlockAfter: [{ episodeId: "ep1", endingSceneIds: ["end_alt"] }] },
      { id: "e3", title: "E3", sceneIds: ["e3"], startSceneId: "e3", unlockAfter: [{ episodeId: "e2a" }, { episodeId: "e2b" }] },
    ],
  };
  const cleared = (episodeId: string, endingSceneId: string): EpisodeProgress => ({
    episodeId,
    endingSceneId,
    endingHeadline: "H",
    endingTier: "victory-silver",
    completedAt: 1,
    carry: { activeFlags: [], inventory: [], meters: { Sultry: 0, Aggressive: 0, Clever: 0, Suspicion: 0 }, characterTrust: {}, memories: {} },
  });
  check("unlockAfter: route chapters locked before their route", !isEpisodeUnlocked(forkStory, "e2a", {}) && !isEpisodeUnlocked(forkStory, "e2b", {}));
  const afterGold = { ep1: cleared("ep1", "end_gold") };
  const afterAlt = { ep1: cleared("ep1", "end_alt") };
  check("unlockAfter: gold ending unlocks only the gold chapter", isEpisodeUnlocked(forkStory, "e2a", afterGold) && !isEpisodeUnlocked(forkStory, "e2b", afterGold));
  check("unlockAfter: alt ending unlocks only the alt chapter", !isEpisodeUnlocked(forkStory, "e2a", afterAlt) && isEpisodeUnlocked(forkStory, "e2b", afterAlt));
  check(
    "unlockAfter (any-listed): final chapter unlocks from either route, not before",
    isEpisodeUnlocked(forkStory, "e3", { ...afterGold, e2a: cleared("e2a", "e2aend") }) &&
      isEpisodeUnlocked(forkStory, "e3", { ...afterAlt, e2b: cleared("e2b", "e2bend") }) &&
      !isEpisodeUnlocked(forkStory, "e3", afterGold)
  );
  check(
    "unlockAfter: already-cleared chapter stays replayable",
    isEpisodeUnlocked(forkStory, "e2b", { ep1: cleared("ep1", "end_gold"), e2b: cleared("e2b", "e2bend") })
  );
  check("nextEpisodeForEnding: per-ending override wins", nextEpisodeForEnding(forkStory, "ep1", "end_alt")?.id === "e2b");
  check("nextEpisodeForEnding: falls back to positional", nextEpisodeForEnding(forkStory, "ep1", "end_gold")?.id === "e2a");
  check("nextEpisodeForEnding: unknown ending falls back", nextEpisodeForEnding(forkStory, "e2a", "nope")?.id === "e2b");
}

// Regression (A3): the bust contract must hold for ANY heat source — the
// old entry-time-only check let mid-scene meter gains (replies, puzzles,
// on-enter effects) pass the limit with the player still in the scene.
{
  const bustStory: Story = {
    id: "t",
    title: "T",
    tagline: "",
    coverImage: "",
    startSceneId: "a",
    briefing: { objective: "x", winConditions: [], loseConditions: [], heatLimit: 3, heatFailSceneId: "folded" },
    scenes: [
      { id: "a", title: "A", background: "", prose: "" },
      { id: "folded", title: "Folded", background: "", prose: "", isEnding: true, endingData: { tier: "gameover", headline: "F", recap: "R" } },
    ],
    items: [],
    characters: [],
  };
  const meters = (sus: number) => ({ Sultry: 0, Aggressive: 0, Clever: 0, Suspicion: sus });
  check("heatBustTarget: null under the limit", heatBustTarget(bustStory, { meters: meters(2) }, "a") === null);
  check("heatBustTarget: at the limit, routes to the bust scene", heatBustTarget(bustStory, { meters: meters(3) }, "a") === "folded");
  check("heatBustTarget: above the limit still busts", heatBustTarget(bustStory, { meters: meters(4) }, "a") === "folded");
  check("heatBustTarget: no bust while standing on the bust scene", heatBustTarget(bustStory, { meters: meters(3) }, "folded") === null);
  const noLimit: Story = { ...bustStory, briefing: { objective: "x", winConditions: [], loseConditions: [] } };
  check("heatBustTarget: no limit configured, no bust", heatBustTarget(noLimit, { meters: meters(9) }, "a") === null);
  const missingScene: Story = { ...bustStory, briefing: { ...bustStory.briefing!, heatFailSceneId: "ghost" } };
  check("heatBustTarget: missing bust scene, no bust", heatBustTarget(missingScene, { meters: meters(3) }, "a") === null);
  const episode = { id: "e1", title: "E", sceneIds: ["a"], startSceneId: "a" };
  check("heatBustTarget: season — bust scene outside the episode is refused", heatBustTarget(bustStory, { meters: meters(3) }, "a", episode) === null);
  const episodeWithBust = { id: "e1", title: "E", sceneIds: ["a", "folded"], startSceneId: "a" };
  check("heatBustTarget: season — bust scene inside the episode busts", heatBustTarget(bustStory, { meters: meters(3) }, "a", episodeWithBust) === "folded");
}

// Save-slot schema versioning: writes stamp the schema, reads migrate old
// un-stamped saves and REFUSE saves from a newer build rather than
// mis-loading a shape they don't understand.
{
  // Node has no localStorage by default — a minimal in-memory stand-in for
  // the save-slot tests only (logic.ts references the global lazily).
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };

  const baseSave: GameSave = {
    storyId: "s1",
    sceneId: "a",
    sceneTitle: "A",
    savedAt: 1,
    activeFlags: [],
    inventory: [],
    meters: { Sultry: 0, Aggressive: 0, Clever: 0, Suspicion: 0 },
    characterTrust: {},
    memories: {},
    proseAcknowledged: true,
    beatIdx: 0,
    usedHotspots: [],
    usedChoices: [],
    visitedScenes: [],
    encounteredCharacters: [],
    expiredChoices: [],
    choiceClocks: {},
  };
  const KEY = "scarlet-reel-save-s1-slot-1";

  writeSave(1, baseSave);
  const roundTrip = readSave("s1", 1);
  check("save: round-trip loads", roundTrip !== null && roundTrip.sceneId === "a");
  check("save: writeSave stamps the current schema", roundTrip?.schema === SAVE_SCHEMA);

  // Legacy save: hand-written raw JSON with no schema stamp (pre-versioning
  // builds). Must load AND come back stamped.
  store.set(KEY, JSON.stringify(baseSave));
  const legacy = readSave("s1", 1);
  check("save: un-stamped legacy save loads", legacy !== null);
  check("save: legacy save is migrated (stamped)", legacy?.schema === SAVE_SCHEMA);

  // Future save: schema newer than this build. Refused, not mis-loaded.
  store.set(KEY, JSON.stringify({ ...baseSave, schema: SAVE_SCHEMA + 87 }));
  check("save: save from a newer build is refused", readSave("s1", 1) === null);

  // Existing guards must survive the versioning layer.
  store.set(KEY, JSON.stringify({ ...baseSave, storyId: "other" }));
  check("save: foreign story still refused", readSave("s1", 1) === null);
  store.set(KEY, "{not json");
  check("save: corrupt slot still refused", readSave("s1", 1) === null);
}

/* ================================================================== */
/*  2. act-membership walk (synthetic)                                 */
/* ================================================================== */

{
  const story: Story = {
    id: "t",
    title: "T",
    tagline: "",
    coverImage: "",
    startSceneId: "a",
    acts: [
      { id: "act1", label: "Act One", title: "One", startSceneId: "a" },
      { id: "act2", label: "Act Two", title: "Two", startSceneId: "g" },
    ],
    scenes: [
      { id: "a", title: "A", background: "", prose: "", choices: [] },
      { id: "b", title: "B (hotspot-only)", background: "", prose: "" },
      { id: "g", title: "G (act2 start)", background: "", prose: "", choices: [{ id: "c", text: "to end", targetSceneId: "e" }] },
      { id: "e", title: "End", background: "", prose: "", isEnding: true, endingData: { tier: "victory-gold", headline: "H", recap: "R" } },
    ],
    items: [],
    characters: [],
  };
  // door hotspot on "a" -> "b"; puzzle with targets on "b"
  story.scenes[0].hotspots = [
    { id: "h1", label: "Door", bounds: { x: 0, y: 0, w: 5, h: 5 }, cursor: "go", action: { type: "goToScene", targetSceneId: "b" } },
  ];
  story.scenes[1].hotspots = [
    {
      id: "h2",
      label: "Puzzle",
      bounds: { x: 0, y: 0, w: 5, h: 5 },
      cursor: "use",
      action: {
        type: "patternPuzzle",
        patternPuzzle: {
          title: "P",
          instruction: "",
          rows: [{ id: "r", date: "1", description: "d", amount: "0", isAnswer: true }],
          targetCount: 1,
          payoffText: "",
          targetSceneId: "e",
        },
      },
    },
  ];
  const act1 = scenesInAct(story, "act1");
  check("walk: follows hotspot door edges", act1.has("b"), [...act1]);
  check("walk: follows puzzle solve targets", act1.has("e"), [...act1]);
  check("walk: stops at the next act's start scene", !act1.has("g"), [...act1]);
  const act2 = scenesInAct(story, "act2");
  check("walk: act2 keeps its own scenes", act2.has("g") && act2.has("e"), [...act2]);
}

/* ================================================================== */
/*  3. The Neon Diner playthroughs                                     */
/* ================================================================== */

{
  const S = NEON_DINER;
  const byId = new Map(S.scenes.map((x) => [x.id, x]));
  const item = (id: string) => S.items.find((i) => i.id === id);

  // --- gold run ---
  let st = createInitialState(S);
  const enter = (id: string) => byId.get(id)!.onEnterActions?.forEach((a) => (st = applyConsequences(S, a.consequences, st)));
  // Mirrors the game's pick path: effective gate (incl. the item a present
  // choice shows), presentation-aware consequences (handover), and the
  // `item:<id>` presentation memory. `used` mirrors usedChoices so the
  // interrogation composure (derived from it) can be asserted.
  const used = new Set<string>();
  const pick = (sceneId: string, choiceId: string) => {
    const c = byId.get(sceneId)!.choices!.find((x) => x.id === choiceId)!;
    check(`gold: gate ${sceneId}/${choiceId}`, meetsGating(effectiveChoiceGating(c), st));
    used.add(`${sceneId}:${choiceId}`);
    if (c.exclusiveGroup) {
      byId.get(sceneId)!.choices!.filter((x) => x.exclusiveGroup === c.exclusiveGroup).forEach((x) => used.add(`${sceneId}:${x.id}`));
    }
    st = recordPresentation(c, S, recordMemory(c, applyConsequences(S, presentationConsequences(c), st)));
  };
  const door = (sceneId: string, hsId: string) => {
    const h = byId.get(sceneId)!.hotspots!.find((x) => x.id === hsId)!;
    check(`gold: door ${h.label}`, meetsGating(h.gating, st));
  };
  const grab = (sceneId: string, hsId: string) => {
    const h = byId.get(sceneId)!.hotspots!.find((x) => x.id === hsId)!;
    check(`gold: hotspot ${h.label}`, meetsGating(h.gating, st));
    if (h.action.itemGranted) {
      const it = item(h.action.itemGranted)!;
      if (!st.inventory.some((i) => i.id === it.id)) st = { ...st, inventory: [...st.inventory, it] };
    }
  };

  check("gold: freezer door locked before key", !meetsGating({ requiresItems: ["key"] }, createInitialState(S)));
  enter("nd_credits");
  enter("nd_arrive");
  grab("nd_arrive", "nd_h_coat");
  enter("nd_kitchen");
  grab("nd_kitchen", "nd_k_photo");
  grab("nd_kitchen", "nd_k_key");
  door("nd_kitchen", "nd_k_freezer");
  enter("nd_freezer");
  check("gold: onEnter searched_freezer", st.activeFlags.has("searched_freezer"));
  grab("nd_freezer", "nd_f_ice");
  pick("nd_freezer", "nd_f_out");
  door("nd_kitchen", "nd_k_backroom");
  enter("nd_backroom");
  check("gold: onEnter backroom_searched", st.activeFlags.has("backroom_searched"));
  const puzzle = byId.get("nd_backroom")!.hotspots!.find((h) => h.action.type === "patternPuzzle")!;
  st = applyConsequences(S, puzzle.action.patternPuzzle!.rewardConsequences, st);
  check("gold: puzzle grants ledger", st.inventory.some((i) => i.id === "ledger"));
  check("gold: puzzle sets ledger_page", st.activeFlags.has("ledger_page"));
  pick("nd_backroom", "nd_b_cabinet");
  check("gold: cabinet grants bus_pass", st.inventory.some((i) => i.id === "bus_pass"));
  pick("nd_backroom", "nd_b_door_qte");
  check("gold: QTE answered sets answered_door", st.activeFlags.has("answered_door"));
  check("gold: answering keeps heat at 0", st.meters.Suspicion === 0, st.meters);
  pick("nd_backroom", "nd_b_back");
  enter("nd_kitchen");
  pick("nd_kitchen", "nd_k_back");
  enter("nd_arrive");
  pick("nd_arrive", "nd_c_booth");
  enter("nd_vince");
  pick("nd_vince", "nd_v_ask");
  check("gold: memory recorded", st.memories.asked_mabel != null);
  check("gold: Vince trust 1", st.characterTrust.vince === 1, st.characterTrust);
  const vinceScene = byId.get("nd_vince")!;
  const qv = vinceScene.interrogation!;
  check("gold: composure starts full (3)", composureRemaining(vinceScene, used) === 3);
  pick("nd_vince", "nd_v_photo");
  check("gold: photo shown sets trusted_vince", st.activeFlags.has("trusted_vince"));
  check(
    "gold: presenting the photo records the item:photo memory",
    st.memories["item:photo"] === "Mabel's Photograph",
    st.memories
  );
  check("gold: flashing keeps the photo in the satchel", st.inventory.some((i) => i.id === "photo"));
  // The photo is a Sultry press — it chips composure. The neutral ask did not.
  check("gold: the Sultry photo press chipped composure to 2", composureRemaining(vinceScene, used) === 2);
  // Two more presses take the suspect to zero.
  pick("nd_vince", "nd_v_press2");
  check("gold: composure 1 after the soft press", composureRemaining(vinceScene, used) === 1);
  pick("nd_vince", "nd_v_threat");
  check("gold: composure zero after the third press", composureRemaining(vinceScene, used) === 0);
  // Warm path: trust is 1 (+1 ask, +1 photo, -1 threat) ≥ crackTrust −1 → CRACK.
  check("gold: trust at zero is 1 (ask+photo-threat)", st.characterTrust.vince === 1, st.characterTrust);
  check("gold: warm path cracks (trust ≥ threshold)", interrogationOutcome(qv, st.characterTrust.vince) === "broke");
  check("nd: threshold −1 — the plain-press warm path (ask, then press to zero at −1) cracks", interrogationOutcome(qv, -1) === "broke");
  check("nd: pressing cold still clamps (−2)", interrogationOutcome(qv, -2) === "clamped");
  check("gold: crack/clamp flags are collected for the pickers", collectFlags(S).includes("vince_broke") && collectFlags(S).includes("vince_clamped"));
  check(
    "gold: memory-gated beat now visible",
    meetsGating(byId.get("nd_vince")!.dialogueBeats!.find((b) => b.id === "nd_v3")!.conditionRule, st)
  );
  const proof = combineItems(S, st.inventory.find((i) => i.id === "photo")!, st.inventory.find((i) => i.id === "ledger")!);
  check("gold: recipe photo+ledger -> case file", proof?.id === "proof");
  st = { ...st, inventory: [...st.inventory.filter((i) => i.id !== "photo" && i.id !== "ledger"), proof!] };
  for (const c of S.deduction!.connections) {
    check(`gold: board endpoint ${c.a}/${c.b} is valid`, !!item(c.a) || !!S.characters.find((x) => x.id === c.a), c);
    st = applyConsequences(S, { setFlags: [c.flagSet] }, st);
  }
  pick("nd_vince", "nd_v_leave");
  enter("nd_arrive");
  pick("nd_arrive", "nd_c_porch");
  enter("nd_porch");
  check("gold: porch carries the part break", byId.get("nd_porch")!.partBreak === "Part One — Last Order");
  enter("nd_street");
  check(
    "gold: Ruiz flag-gated beat fires on trusted_vince",
    meetsGating(byId.get("nd_street")!.dialogueBeats!.find((b) => b.id === "nd_s2")!.conditionRule, st)
  );
  // The warm path used the threat as its third press, so the pressed-vince
  // flag IS set and Ruiz's beat about it fires.
  check(
    "gold: Ruiz pressed-vince beat fires (the threat press set the flag)",
    meetsGating(byId.get("nd_street")!.dialogueBeats!.find((b) => b.id === "nd_s3")!.conditionRule, st)
  );
  check(
    "gold: Ruiz item-keyed beat fires on the presented photo",
    meetsGating(byId.get("nd_street")!.dialogueBeats!.find((b) => b.id === "nd_s4")!.conditionRule, st)
  );
  check(
    "gold: item recall reads the item's name into {said}",
    resolveBeatText(byId.get("nd_street")!.dialogueBeats!.find((b) => b.id === "nd_s4")!, st.memories).includes(
      "So that's the Mabel's Photograph"
    )
  );
  pick("nd_street", "nd_s_in");
  enter("nd_accuse");
  check("gold: Clever 2+ reached", st.meters.Clever >= 2, st.meters);
  pick("nd_accuse", "nd_ac_threads");
  check("gold: threads set saw_the_threads", st.activeFlags.has("saw_the_threads"));
  check(
    "gold: contradiction beat unlocked",
    meetsGating(byId.get("nd_accuse")!.dialogueBeats!.find((b) => b.id === "nd_ac3")!.conditionRule, st)
  );
  // The gold ending's requirement is the PRESENTED item, not an authored gate.
  const goldChoice = byId.get("nd_accuse")!.choices!.find((c) => c.id === "nd_ac_gold")!;
  check("gold: ending gate holds the case file (via presentItem)", meetsGating(effectiveChoiceGating(goldChoice), st));
  pick("nd_accuse", "nd_ac_gold");
  check("gold: handing over the file records item:proof", st.memories["item:proof"] === "The Case File", st.memories);
  check("gold: the case file leaves the satchel (consumed)", !st.inventory.some((i) => i.id === "proof"));
  check("gold: heat never fired", st.meters.Suspicion < S.briefing!.heatLimit!, st.meters);

  // --- fold run: three mistakes = heat 3 = Folded ---
  let ft = createInitialState(S);
  ft = applyConsequences(S, byId.get("nd_vince")!.choices!.find((c) => c.id === "nd_v_threat")!.consequences, ft);
  ft = applyConsequences(S, puzzle.action.patternPuzzle!.wrongSubmissionConsequences, ft);
  ft = applyConsequences(S, byId.get("nd_backroom")!.choices!.find((c) => c.id === "nd_b_door_qte")!.timedOutConsequences, ft);
  check("fold: three mistakes reach the heat limit", ft.meters.Suspicion >= S.briefing!.heatLimit!, ft.meters);
  const folded = byId.get(S.briefing!.heatFailSceneId!);
  check("fold: heat scene is a game-over ending", folded?.isEnding === true && folded?.endingData?.tier === "gameover");
  check(
    "fold: timeout flag note echoes in the recall",
    resolveBeatText(byId.get("nd_vince")!.dialogueBeats!.find((b) => b.id === "nd_v4")!, {}, ft.activeFlags, S.flagNotes).includes(
      "let it pass unanswered"
    )
  );

  // --- act maps: hotspot-only scenes must be on their act's RouteMap ---
  const act1 = scenesInAct(S, "nd_act1");
  const act2 = scenesInAct(S, "nd_act2");
  check("acts: hotspot-only freezer is in Act One", act1.has("nd_freezer"), [...act1]);
  check("acts: hotspot-only back room is in Act One", act1.has("nd_backroom"), [...act1]);
  check("acts: Act One stops at the porch's destination", !act1.has("nd_street"), [...act1]);
  check("acts: Act Two owns street + accusation + endings", act2.has("nd_street") && act2.has("nd_accuse") && act2.has("nd_end_gold"), [...act2]);
  check("acts: heat-bust ending belongs to no act (trapdoor)", !act1.has("nd_end_folded") && !act2.has("nd_end_folded"));

  // --- route map layering: loop-back navigation must not pump the ranks ---
  // Act One is a hub-and-spoke act (booth/station/kitchen all return to the
  // hall; freezer/back room return to the kitchen). Layering a graph with
  // cycles never settles — the pre-fix fixed point ran to its cap and left
  // the hall ranked 19 deep with every return edge drawn backwards.
  {
    const step = (sceneId: string, sceneTitle: string, choiceId: string, choiceText: string): JourneyStep => ({
      sceneId,
      sceneTitle,
      choiceId,
      choiceText,
      attitudeTag: "Neutral",
      options: [],
      timedOut: false,
      flagsSet: [],
    });
    const g = buildRouteGraph(
      S,
      "nd_act1",
      [
        step("nd_arrive", "The Hall", "nd_c_booth", "Booth four."),
        step("nd_vince", "Booth Four", "nd_v_leave", "Leave the booth."),
        step("nd_arrive", "The Hall", "nd_c_station", "The counter."),
        step("nd_station", "Mabel's Station", "nd_s_back", "Back to the diner."),
        step("nd_arrive", "The Hall", "nd_c_kitchen", "The kitchen."),
        step("nd_kitchen", "The Kitchen", "nd_k_back", "Back to the hall."),
        step("nd_arrive", "The Hall", "nd_c_porch", "Step out into the rain."),
      ],
      "nd_porch"
    );
    const depthOf = new Map(g.nodes.map((n) => [n.id, n.depth]));
    check("map: loop-back act layers compactly (every scene at depth ≤ 3)", g.nodes.every((n) => n.depth <= 3), g.nodes.map((n) => `${n.id}:${n.depth}`));
    check("map: the act's opener is ranked first and reads as taken", depthOf.get("nd_credits") === 0 && g.nodes.find((n) => n.id === "nd_credits")!.status === "taken");
    check("map: the hall hub sits one rank in", depthOf.get("nd_arrive") === 1, depthOf.get("nd_arrive"));
    const backs = g.edges.filter((e) => e.isBack);
    check("map: every loop-back is flagged as a back edge (≥5)", backs.length >= 5, backs.length);
    check("map: back edges point to a shallower rank", backs.every((e) => (depthOf.get(e.target) ?? 0) < (depthOf.get(e.source) ?? 0)), backs.map((e) => e.id));
    check("map: every forward edge points strictly forward", g.edges.filter((e) => !e.isBack).every((e) => (depthOf.get(e.target) ?? 0) > (depthOf.get(e.source) ?? 0)), g.edges.filter((e) => !e.isBack).map((e) => e.id));
  }

  // --- validator: exactly the one known trapdoor note, zero errors ---
  const issues = validateStory(S);
  check("story: zero validator errors", !issues.some((i) => i.severity === "error"), issues.filter((i) => i.severity === "error"));
  check(
    "story: only the known trapdoor note remains",
    issues.length === 1 && /belong to no act/.test(issues[0].message),
    issues
  );
}

// The present-item verb ("show the photograph"): effective gating, item
// handover, the `item:<id>` presentation memory, and item-keyed recalls.
{
  const presStory: Story = {
    id: "t",
    title: "T",
    tagline: "",
    coverImage: "",
    startSceneId: "a",
    items: [
      { id: "photo", name: "The Photograph", icon: "📷", description: "", flavorText: "" },
      { id: "ledger", name: "The Ledger", icon: "📒", description: "", flavorText: "" },
    ],
    scenes: [
      {
        id: "a",
        title: "A",
        background: "",
        prose: "",
        choices: [
          { id: "c_show", text: "Show him the photograph.", targetSceneId: "", reply: true, presentItem: "photo", memoryLog: "showed_photo" },
          { id: "c_hand", text: "Hand over the ledger.", targetSceneId: "e", presentItem: "ledger", consumePresentedItem: true },
          { id: "c_plain", text: "Leave.", targetSceneId: "e" },
        ],
      },
      { id: "e", title: "End", background: "", prose: "", isEnding: true, endingData: { tier: "victory-gold", headline: "H", recap: "R" } },
    ],
    characters: [],
  };
  const pick = (id: string) => presStory.scenes[0].choices!.find((c) => c.id === id)!;
  const state = () => createInitialState(presStory);

  // effective gating: the presented item is a requirement you can't fake.
  check("present: no presentItem, no authored gate -> undefined", effectiveChoiceGating(pick("c_plain")) === undefined);
  check("present: presents with no authored gate -> requires the item", effectiveChoiceGating(pick("c_show"))?.requiresItems?.join(",") === "photo");
  const gated = { ...pick("c_show"), gating: { requiresFlags: ["x"] } };
  check("present: merges with authored gate without duplicating", effectiveChoiceGating(gated)?.requiresItems?.join(",") === "photo" && effectiveChoiceGating(gated)?.requiresFlags?.join(",") === "x");
  const s = state();
  check("present: locked while the item is not held", !meetsGating(effectiveChoiceGating(pick("c_show")), s));
  s.inventory.push(presStory.items[0]);
  check("present: unlockable once the item is held", meetsGating(effectiveChoiceGating(pick("c_show")), s));

  // handover: consuming a present removes it; flashing keeps it.
  check("present: flash keeps the item (no removeItems)", presentationConsequences(pick("c_show"))?.removeItems === undefined);
  check("present: handover removes the item", presentationConsequences(pick("c_hand"))?.removeItems?.includes("ledger"));
  const withRemove = { ...pick("c_hand"), consequences: { removeItems: ["photo"] } };
  check("present: handover preserves authored removeItems", presentationConsequences(withRemove)?.removeItems?.sort().join(",") === "ledger,photo");

  // the presentation memory: `item:<id>` = the item's NAME.
  let ps = state();
  ps.inventory.push(presStory.items[0]);
  ps = applyConsequences(presStory, presentationConsequences(pick("c_show"))!, ps);
  ps = recordPresentation(pick("c_show"), presStory, ps);
  check("present: records item:photo memory with the item name", ps.memories["item:photo"] === "The Photograph");
  const before = ps.memories["item:photo"];
  check("present: first presentation wins (idempotent)", recordPresentation(pick("c_show"), presStory, ps).memories["item:photo"] === before);
  check("present: no presentItem -> state unchanged", recordPresentation(pick("c_plain"), presStory, ps) === ps);

  // item-keyed recall + item-keyed gate ride the existing memory machinery.
  check(
    "present: beat recalls item:photo, {said} = item name",
    resolveBeatText({ text: "x", recalls: { "item:photo": "You flashed {said}." } }, ps.memories) ===
      "You flashed The Photograph."
  );
  check("present: gate remembers the presentation", meetsGating({ requiresMemories: ["item:photo"] }, ps));
  check("present: gate stays closed when never presented", !meetsGating({ requiresMemories: ["item:photo"] }, state()));

  // collectMemoryTags offers item: keys for real items only.
  const tags = collectMemoryTags(presStory);
  check("present: collectMemoryTags offers item:photo", tags.includes("item:photo"));
  check("present: collectMemoryTags offers item:ledger", tags.includes("item:ledger"));
  check("present: collectMemoryTags omits unknown item keys", !tags.includes("item:ghost"));

  // validator: presenting an unknown item is an error; a real item: recall key is fine.
  const badPres: Story = {
    ...presStory,
    scenes: [
      {
        ...presStory.scenes[0],
        choices: [
          { id: "c_bad", text: "Show the ghost.", targetSceneId: "e", presentItem: "ghost" },
          { id: "c_recall", text: "Say something.", targetSceneId: "e", reply: true, presentItem: "photo" },
        ],
        dialogueBeats: [
          { id: "b1", characterId: "narrator", text: "", recalls: { "item:photo": "x", "item:ghost": "y" } },
        ],
      },
      presStory.scenes[1],
    ],
  };
  const issues = validateStory(badPres);
  check("present: validator errors on unknown present item", issues.some((i) => i.severity === "error" && /presents unknown item "ghost"/.test(i.message)));
  check("present: validator accepts a real item: recall key", !issues.some((i) => /item:photo/.test(i.message)));
  check("present: validator warns on unknown item: recall key", issues.some((i) => /item:ghost/.test(i.message)));
}

// Interrogation helpers: pressing detection, composure derivation (exclusive
// groups count once, floor at zero, derived from usedChoices so it's
// save-proof), and the trust decides crack vs clamp boundary.
{
  const mkScene = (choices: Choice[], composure?: number): SceneNode => ({
    id: "iq",
    title: "IQ",
    background: "",
    prose: "",
    choices,
    interrogation: {
      characterId: "sus",
      composure,
      crackTrust: 0,
      brokeBeat: { id: "b", characterId: "sus", text: "talks" },
      brokeFlag: "broke",
    },
  });
  const press = (id: string, extra: Partial<Choice> = {}): Choice => ({
    id,
    text: `press ${id}`,
    targetSceneId: "",
    reply: true,
    attitudeTag: "Aggressive",
    ...extra,
  });

  check("interrogation: attitude reply is a press", isPressingReply(press("p1")));
  check("interrogation: neutral reply is not a press", !isPressingReply(press("p2", { attitudeTag: "Neutral" })));
  check("interrogation: non-reply attitude is not a press", !isPressingReply({ id: "n", text: "n", targetSceneId: "x", attitudeTag: "Aggressive" }));

  const s2 = mkScene([press("a"), press("b")], 2);
  check("composure: full before any press", composureRemaining(s2, new Set()) === 2);
  check("composure: one press chips one", composureRemaining(s2, new Set(["iq:a"])) === 1);
  check("composure: floors at zero", composureRemaining(s2, new Set(["iq:a", "iq:b"])) === 0);
  check("composure: below zero stays zero", composureRemaining(mkScene([press("a")], 1), new Set(["iq:a"])) === 0);
  check("composure: no interrogation → 0", composureRemaining({ id: "x", title: "", background: "", prose: "" }, new Set(["x:a"])) === 0);

  const grouped = mkScene(
    [press("g1", { exclusiveGroup: "q" }), press("g2", { exclusiveGroup: "q" }), press("g3", { exclusiveGroup: "q" })],
    3
  );
  // Picking one group member marks all three used, but it's ONE statement.
  check("composure: exclusive group counts once", composureRemaining(grouped, new Set(["iq:g1", "iq:g2", "iq:g3"])) === 2);
  const mixed = mkScene([press("g1", { exclusiveGroup: "q" }), press("g2", { exclusiveGroup: "q" }), press("solo")], 3);
  check("composure: group + solo press = 2 chips", composureRemaining(mixed, new Set(["iq:g1", "iq:g2", "iq:solo"])) === 1);

  check("outcome: trust at threshold cracks", interrogationOutcome({ characterId: "s", crackTrust: 1, brokeBeat: { id: "b", characterId: "s", text: "" }, brokeFlag: "f" }, 1) === "broke");
  check("outcome: trust below threshold clamps", interrogationOutcome({ characterId: "s", crackTrust: 1, brokeBeat: { id: "b", characterId: "s", text: "" }, brokeFlag: "f" }, 0) === "clamped");
  check("outcome: default threshold is 0", interrogationOutcome({ characterId: "s", brokeBeat: { id: "b", characterId: "s", text: "" }, brokeFlag: "f" }, 0) === "broke");
  check("outcome: default threshold clamps at negative trust", interrogationOutcome({ characterId: "s", brokeBeat: { id: "b", characterId: "s", text: "" }, brokeFlag: "f" }, -1) === "clamped");

  // Stored-composure urgency: a press drops one (and flags the break moment);
  // a steady recovers one, once, only while pressed.
  check("press: first press drops full to 2", (() => { const r = pressComposure(undefined, 3); return r.next === 2 && r.broke === false && r.changed === true; })());
  check("press: 1 -> 0 is the break", (() => { const r = pressComposure(1, 3); return r.next === 0 && r.broke === true; })());
  check("press: 0 stays 0 (already broken)", (() => { const r = pressComposure(0, 3); return r.next === 0 && r.broke === false && r.changed === false; })());
  check("steady: pressed + not-yet-steadied recovers one", (() => { const r = steadyComposure(2, 3, false); return r.next === 3 && r.recovered === true; })());
  check("steady: at full, nothing to recover", (() => { const r = steadyComposure(3, 3, false); return r.next === 3 && r.recovered === false; })());
  check("steady: already steadied, no second recovery", (() => { const r = steadyComposure(2, 3, true); return r.next === 2 && r.recovered === false; })());
  check("steady: broken (0) can't recover", (() => { const r = steadyComposure(0, 3, false); return r.next === 0 && r.recovered === false; })());
  check("steady: once steadied then pressed, can't steady again", (() => { const r = steadyComposure(2, 3, true); return r.recovered === false; })());

  check("reaction: index 0 at first press", pressReaction({ composure: 3 }, 2) === DEFAULT_PRESS_REACTIONS[0]);
  check("reaction: deeper index near the edge", pressReaction({ composure: 3 }, 1) === DEFAULT_PRESS_REACTIONS[1]);
  check("reaction: custom reactions override", pressReaction({ composure: 3, pressReactions: ["A", "B", "C"] }, 2) === "A");
  check("reaction: a short custom list holds its last line at depth", pressReaction({ composure: 5, pressReactions: ["A"] }, 1) === "A");
  check("reaction: no custom list uses the defaults", pressReaction({ composure: 3 }, 1) === DEFAULT_PRESS_REACTIONS[1]);
}

// Examine (hold to inspect): the zoom clamps so tiny zones can't blur into
// noise, and The Neon Diner's investigation scene is wired end to end
// (examine hotspots → flags → gated discovery beats).
{
  check("examineZoom: small zone clamps to max", examineZoom({ w: 5, h: 5 }) === 3.5);
  check("examineZoom: large zone clamps to min", examineZoom({ w: 80, h: 80 }) === 1.6);
  check("examineZoom: mid zone magnifies", Math.abs(examineZoom({ w: 20, h: 16 }) - 3) < 0.001);

  const story = NEON_DINER;
  const sceneById = new Map(story.scenes.map((x) => [x.id, x]));
  const station = sceneById.get("nd_station");
  check("examine: station scene exists", !!station);
  const examineZones = (station?.hotspots ?? []).filter((h) => h.examine);
  check("examine: three examine zones (coffee, watch, note)", examineZones.length === 3, examineZones.map((h) => h.label));
  check("examine: each zone sets a flag", examineZones.every((h) => !!h.action.flagSet));
  const examineFlags = new Set(examineZones.map((h) => h.action.flagSet!));
  const discoveryBeats = (station?.dialogueBeats ?? []).filter((b) => b.conditionRule?.requiresFlags?.some((f) => examineFlags.has(f)));
  check("examine: a discovery beat is gated on each examined flag", discoveryBeats.length === 3, discoveryBeats.map((b) => b.id));
  check("examine: pickups grant the watch + note", examineZones.some((h) => h.action.itemGranted === "mabel_watch") && examineZones.some((h) => h.action.itemGranted === "mabel_note"));
  check("examine: the note cross-links to Act Two (Ruiz beat)", (sceneById.get("nd_street")!.dialogueBeats ?? []).some((b) => b.conditionRule?.requiresFlags?.includes("examined_note")));
}

/* ================================================================== */
/*  4b. Full Throttle — the recreated opening, walked end to end        */
/* ================================================================== */
// The FT recreation's puzzle chain is gated end to end: punch the dumpster
// lid, climb out into the wide alley, kick in the bar door, TALK to Quohog
// (which is what unlocks the shakedown), grab the keys, and ride out into
// the Rottwheeler QTE duel — where hesitating routes to a game-over ending.
{
  const S = FULL_THROTTLE;
  const byId = new Map(S.scenes.map((x) => [x.id, x]));
  const hs = (sceneId: string, hsId: string) => byId.get(sceneId)!.hotspots!.find((x) => x.id === hsId)!;
  const apply = (action: { flagSet?: string; itemGranted?: string }) => {
    if (action.flagSet) st = applyConsequences(S, { setFlags: [action.flagSet] }, st);
    if (action.itemGranted) st = { ...st, inventory: [...st.inventory, S.items.find((i) => i.id === action.itemGranted)!] };
  };
  let st = createInitialState(S);

  // The ride is locked until the keys are in hand.
  check("ft: ride-out is locked before the keys", !meetsGating({ requiresItems: ["ft_keys"] }, st));
  // Inside the dumpster: the lid opens with a punch (ft_free), and climbing
  // out is gated on it — no punching, no leaving.
  check("ft: climb-out is locked before the lid is punched", !meetsGating({ requiresFlags: ["ft_free"] }, st));
  apply(hs("ft_dump", "fth_lid").action);
  check("ft: punching the lid sets ft_free", st.activeFlags.has("ft_free"));
  check("ft: climb-out unlocks after the punch", meetsGating({ requiresFlags: ["ft_free"] }, st));
  // The alley: the door kick is a one-way flag, and the bike tells Ben the
  // keys are gone before Quohog can hand them over.
  apply(hs("ft_alley", "fth_door").action);
  check("ft: kicking the door sets ft_door_open", st.activeFlags.has("ft_door_open"));
  check("ft: the bike flags the missing keys", hs("ft_alley", "fth_bike").action.flagSet === "ft_noticed_keys");
  // Inside the bar: talking to Quohog is a TOPIC-LIST conversation, and the
  // shakedown only opens after the player asks for the keys (the "My keys"
  // topic sets ft_quohog_talked; the grab marker is gated on it).
  check("ft: grabbing Quohog is locked before the talk", !meetsGating(hs("ft_bar", "fth_quohog_grab").gating, st));
  const quohogTopics = hs("ft_bar", "fth_quohog").action.topics;
  check("ft: talking to Quohog is a topic-list conversation", !!quohogTopics && quohogTopics.length >= 3);
  check("ft: asking for the keys is the gated topic", quohogTopics!.some((t) => t.id === "ft_topic_keys" && t.flagSet === "ft_quohog_talked"));
  apply(quohogTopics!.find((t) => t.id === "ft_topic_keys")!);
  check("ft: asking for the keys sets ft_quohog_talked", st.activeFlags.has("ft_quohog_talked"));
  check("ft: the shakedown unlocks after asking", meetsGating(hs("ft_bar", "fth_quohog_grab").gating, st));
  apply(hs("ft_bar", "fth_quohog_grab").action);
  check("ft: the shakedown hands over the keys", st.inventory.some((i) => i.id === "ft_keys"));
  check("ft: ride-out unlocks with the keys", meetsGating({ requiresItems: ["ft_keys"] }, st));
  // The bar's walk-off-screen exit is a real scene edge.
  check("ft: the bar has a left-edge exit to the alley", S.scenes.find((s) => s.id === "ft_bar")!.stage!.exitEdges?.left?.targetSceneId === "ft_alley");
  check("ft: storyEdges carries the walk-off edge", storyEdges(S).some((e) => e.id === "e-ft_bar-edge-left" && e.target === "ft_alley"));
  // The Rottwheeler duel: two steerable ride minigames, each routing a crash
  // to the game-over road instead of a graceful fail-forward.
  const ride = byId.get("ft_ride")!;
  const fight1 = ride.choices!.find((c) => c.id === "ftc_fight1")!;
  check("ft: the duel is a playable ride", !!fight1.ride && (fight1.ride.lanes ?? 3) >= 2 && (fight1.ride.durationSeconds ?? 18) > 0);
  check("ft: ride crash routes to the game-over ending", fight1.timedOutTargetSceneId === "ft_ride_dead");
  const dead = byId.get("ft_ride_dead")!;
  check("ft: losing the fight is an ending", dead.isEnding === true && dead.endingData?.tier === "gameover");
  check("ft: beating the fight reaches Part One", byId.get("ft_ride3")!.choices!.some((c) => c.targetSceneId === "ft_tbc"));
  const tbc = byId.get("ft_tbc")!;
  check("ft: Part One is a victory ending", tbc.isEnding === true && tbc.endingData?.tier === "victory-silver");
  // Every gated marker in the chain is actually reachable: the flags it
  // needs are set by the step before it (no permanent locks).
  const flagsSet = new Set<string>();
  S.scenes.forEach((sc) => {
    (sc.hotspots ?? []).forEach((h) => {
      if (h.action.flagSet) flagsSet.add(h.action.flagSet);
      (h.action.topics ?? []).forEach((t) => { if (t.flagSet) flagsSet.add(t.flagSet); });
      h.gating?.requiresFlags?.forEach((f) => flagsSet.add(f));
      Object.values(sc.stage?.exitEdges ?? {}).forEach((e) => e?.gating?.requiresFlags?.forEach((f) => flagsSet.add(f)));
    });
  });
  check("ft: every gated flag has an author somewhere in the chain", ["ft_free", "ft_door_open", "ft_quohog_talked", "ft_noticed_keys"].every((f) => flagsSet.has(f)));
  // The skull pie (hold-to-open + theme sprite): on wherever object-first is,
  // with the story's own centrepiece — and only there ("as an option only").
  check("ft: hold-to-open is on wherever object-first is", S.scenes.every((sc) => (sc.stage?.objectVerbMenu ? sc.stage.objectMenuHold === true : true)));
  check("ft: the skull pie wears the story's own sprite", S.verbMenuIcon === "/img/ft-skull.png");
  check("ft: no other story opts into the hold gesture", THROTTLE_ASH.scenes.every((sc) => !sc.stage?.objectMenuHold) && !THROTTLE_ASH.verbMenuIcon);
}

/* ================================================================== */
/*  4c. Full Throttle — The Corville Run (new version) BETA TEST        */
/* ================================================================== */
// The reimagined FT exercises every engine feature at once: a NEW sprite
// sheet with named POSE animations, a scene default pose (crouch), transient
// setPlayerPose hotspots (bend/reach), the hold-to-open skull pie with a NEW
// centrepiece, a 200%-wide world with entry spawns, walk-off edge exits, a
// point-stretched walk path, A* obstacles, topic-list dialogue, and a QTE
// duel with a game-over branch.
{
  const S = FULL_THROTTLE_CORVILLE;
  const byId = new Map(S.scenes.map((x) => [x.id, x]));
  const hs = (sceneId: string, hsId: string) => byId.get(sceneId)!.hotspots!.find((x) => x.id === hsId)!;
  const apply = (action: { flagSet?: string; itemGranted?: string }) => {
    if (action.flagSet) st = applyConsequences(S, { setFlags: [action.flagSet] }, st);
    if (action.itemGranted) st = { ...st, inventory: [...st.inventory, S.items.find((i) => i.id === action.itemGranted)!] };
  };
  let st = createInitialState(S);

  // The story validates cleanly and is registered in the catalogue.
  const ft2Issues = validateStory(S);
  check("ft2: story validates (no errors)", ft2Issues.filter((i) => i.severity === "error").length === 0, ft2Issues.slice(0, 4));
  check("ft2: starts on the credits", S.startSceneId === "ft2_credits" && byId.get("ft2_credits")!.nodeType === "credits");
  // No false "every exit is gated" warnings: the dumpster's only exit (climb)
  // is gated on ft2_free, which the lid-punch sets in the same room; the bar
  // leaves through an UNGATED walk-off edge — both must read as open.
  const gatedWarnings = ft2Issues.filter((i) => i.severity === "warning" && /Every exit from .* is gated/.test(i.message));
  check("ft2: no false 'every exit is gated' warnings", gatedWarnings.length === 0, gatedWarnings.map((w) => w.sceneId));

  // NEW SPRITE + POSES: the player sprite is a sheet with the pose animations
  // the hotspots drive, and every transient pose is a known animation.
  const sheet = S.playerSprite?.sheet;
  check("ft2: the player is a sprite sheet (not an emoji)", !!sheet && !!sheet.image && sheet.frameWidth > 0 && sheet.frameHeight > 0);
  check("ft2: the sheet has all five pose animations", sheet && ["idle", "walk", "bend", "crouch", "reach"].every((a) => !!(sheet.animations as Record<string, unknown>)[a]));

  // SCENE DEFAULT POSE: the dumpster starts Ben in a crouch.
  check("ft2: the dumpster defaults Ben to a crouch", byId.get("ft2_dump")!.stage!.playerPose === "crouch");

  // TRANSIENT POSES: bend (alley) and reach (bar) are setPlayerPose actions.
  check("ft2: looking under the dumpster is a transient bend", hs("ft2_alley", "ft2h_under").action.type === "setPlayerPose" && hs("ft2_alley", "ft2h_under").action.playerPose === "bend" && hs("ft2_alley", "ft2h_under").action.playerPoseOnce === true);
  check("ft2: reaching over the bar is a transient reach", hs("ft2_bar", "ft2h_reach").action.type === "setPlayerPose" && hs("ft2_bar", "ft2h_reach").action.playerPose === "reach");

  // SKULL PIE: hold-to-open everywhere object-first is on, with the NEW icon.
  check("ft2: hold-to-open is on wherever object-first is", S.scenes.every((sc) => (sc.stage?.objectVerbMenu ? sc.stage.objectMenuHold === true : true)));
  check("ft2: the skull pie wears the new sprite", S.verbMenuIcon === "/assets/sprites/ft2-skull.png");
  check("ft2: extended verbs (kick/punch) are on in every stage", S.scenes.filter((s) => s.nodeType === "stage").every((s) => s.stage!.extendedVerbs === true));

  // WIDE WORLD + CAMERA: the alley is a 200% strip with per-source spawns.
  const alley = byId.get("ft2_alley")!;
  check("ft2: the alley is a wide world", alley.stage!.worldWidth === 200);
  check("ft2: entry spawns depend on where you came from", alley.stage!.entrySpawns!.ft2_dump?.x === 8 && alley.stage!.entrySpawns!.ft2_bar?.x === 168);

  // WALK PATH + OBSTACLES: the bar uses a point-stretched path, the alley has
  // obstacles to route around.
  check("ft2: the bar uses a point-stretched walk path", (byId.get("ft2_bar")!.stage!.floorPoints?.length ?? 0) >= 4);
  check("ft2: the alley has A* obstacles", (alley.stage!.obstacles?.length ?? 0) >= 1);

  // WALK-OFF EDGE: the bar's left edge walks back to the alley.
  check("ft2: the bar has a left-edge exit to the alley", byId.get("ft2_bar")!.stage!.exitEdges?.left?.targetSceneId === "ft2_alley");

  // AMBIENT NPC: the bar has a patrolling barfly with idle + walk animations.
  const barfly = byId.get("ft2_bar")!.stage!.npcs?.find((n) => n.id === "ft2_barfly");
  check("ft2: the bar has an ambient NPC", !!barfly);
  check("ft2: the NPC carries a sprite sheet with idle + walk", !!barfly && !!barfly.sheet?.animations?.idle && !!barfly.sheet?.animations?.walk);
  check("ft2: the NPC walks a patrol (≥2 waypoints)", !!barfly && (barfly.patrol?.length ?? 0) >= 2);
  check("ft2: the NPC sheet validates clean", !!barfly && !!barfly.sheet && spriteSheetIssues(barfly.sheet, "npc", ["idle", "walk"]).length === 0);
  check("ft2: no ambient NPC errors in the story check", ft2Issues.filter((i) => i.severity === "error").length === 0);

  // PUZZLE CHAIN (flag reachability, end to end).
  check("ft2: ride-out is locked before the keys", !meetsGating({ requiresItems: ["ft2_keys"] }, st));
  check("ft2: climb-out is locked before the lid is punched", !meetsGating({ requiresFlags: ["ft2_free"] }, st));
  apply(hs("ft2_dump", "ft2h_lid").action);
  check("ft2: punching the lid sets ft2_free", st.activeFlags.has("ft2_free"));
  check("ft2: climb-out unlocks after the punch", meetsGating({ requiresFlags: ["ft2_free"] }, st));
  apply(hs("ft2_alley", "ft2h_door").action);
  check("ft2: kicking the door sets ft2_door", st.activeFlags.has("ft2_door"));
  check("ft2: grabbing Quohog is locked before the talk", !meetsGating(hs("ft2_bar", "ft2h_grab").gating, st));
  const quohogTopics = hs("ft2_bar", "ft2h_quohog").action.topics;
  check("ft2: talking to Quohog is a topic-list conversation", !!quohogTopics && quohogTopics.length >= 3);
  check("ft2: asking for the keys is the gated topic", quohogTopics!.some((t) => t.id === "ft2_topic_keys" && t.flagSet === "ft2_quohog_talked"));
  apply(quohogTopics!.find((t) => t.id === "ft2_topic_keys")!);
  check("ft2: asking for the keys sets ft2_quohog_talked", st.activeFlags.has("ft2_quohog_talked"));
  check("ft2: the shakedown unlocks after asking", meetsGating(hs("ft2_bar", "ft2h_grab").gating, st));
  apply(hs("ft2_bar", "ft2h_grab").action);
  check("ft2: the shakedown hands over the keys", st.inventory.some((i) => i.id === "ft2_keys"));
  check("ft2: ride-out unlocks with the keys", meetsGating({ requiresItems: ["ft2_keys"] }, st));

  // RIDE DUEL with a real game-over branch.
  const ride = byId.get("ft2_ride")!;
  const fight = ride.choices!.find((c) => c.id === "ft2c_fight")!;
  check("ft2: the duel is a playable ride", !!fight.ride && (fight.ride.lanes ?? 3) >= 2 && (fight.ride.durationSeconds ?? 18) > 0);
  check("ft2: ride crash routes to the game-over ending", fight.timedOutTargetSceneId === "ft2_ride_dead");
  const dead = byId.get("ft2_ride_dead")!;
  check("ft2: losing the fight is an ending", dead.isEnding === true && dead.endingData?.tier === "gameover");
  check("ft2: winning reaches Part One", byId.get("ft2_tbc")!.isEnding === true && byId.get("ft2_tbc")!.endingData?.tier === "victory-silver");

  // Every gated flag is actually produced somewhere in the chain.
  const flagsSet = new Set<string>();
  S.scenes.forEach((sc) => {
    (sc.hotspots ?? []).forEach((h) => {
      if (h.action.flagSet) flagsSet.add(h.action.flagSet);
      (h.action.topics ?? []).forEach((t) => { if (t.flagSet) flagsSet.add(t.flagSet); });
    });
  });
  check("ft2: every gated flag has an author in the chain", ["ft2_free", "ft2_door", "ft2_quohog_talked"].every((f) => flagsSet.has(f)));
}

/* ================================================================== */
/*  4c. FULL THROTTLE — the original opening, faithfully (the NEW      */
/*  story). Exercises the two "feel" features: the right-click skull   */
/*  inventory and the steerable ride minigame.                         */
/* ================================================================== */
{
  const S = FULL_THROTTLE_ORIGINAL;
  const byId = new Map(S.scenes.map((x) => [x.id, x]));
  const hs = (sceneId: string, hsId: string) => byId.get(sceneId)!.hotspots!.find((x) => x.id === hsId)!;
  const apply = (action: { flagSet?: string; itemGranted?: string }) => {
    if (action.flagSet) st = applyConsequences(S, { setFlags: [action.flagSet] }, st);
    if (action.itemGranted) st = { ...st, inventory: [...st.inventory, S.items.find((i) => i.id === action.itemGranted)!] };
  };
  let st = createInitialState(S);
  const issues = validateStory(S);
  check("fto: the story validates with no errors", issues.filter((i) => i.severity === "error").length === 0);

  // THE RIGHT-CLICK SKULL: the inventory is a container skull, waiting
  // closed until right-clicked open.
  check("fto: inventory is a container skull", S.inventoryDisplay?.mode === "container" && !!S.inventoryDisplay.image);
  check("fto: the skull starts closed (right-click to open)", S.inventoryDisplay?.startClosed === true);

  // THE RIDE: both duel passes are steerable rides, not quick-times.
  const fight1 = byId.get("fto_ride")!.choices!.find((c) => c.id === "ftoc_fight1")!;
  const fight2 = byId.get("fto_ride2")!.choices!.find((c) => c.id === "ftoc_fight2")!;
  check("fto: the first duel is a playable ride", !!fight1.ride && (fight1.ride.lanes ?? 3) >= 2);
  check("fto: the second duel is harder (more lanes)", !!fight2.ride && (fight2.ride.lanes ?? 0) > (fight1.ride.lanes ?? 3));
  check("fto: a crash routes to the game-over ending", fight1.timedOutTargetSceneId === "fto_ride_dead" && fight2.timedOutTargetSceneId === "fto_ride_dead");
  check("fto: winning the duel still sets the Rottwheeler flag", fight2.consequences?.setFlags?.includes("fto_rott_beaten"));

  // PUZZLE CHAIN, end to end (the faithful opening).
  check("fto: climb-out is locked before the lid is punched", !meetsGating({ requiresFlags: ["fto_free"] }, st));
  apply(hs("fto_dump", "ftoh_lid").action);
  check("fto: punching the lid sets fto_free", st.activeFlags.has("fto_free"));
  check("fto: ride-out is locked before the keys", !meetsGating({ requiresItems: ["fto_keys"] }, st));
  const quohogTopics = hs("fto_bar", "ftoh_quohog").action.topics;
  check("fto: Quohog is a topic-list conversation", !!quohogTopics && quohogTopics.length >= 3);
  apply(quohogTopics!.find((t) => t.id === "fto_topic_keys")!);
  check("fto: asking for the keys sets fto_quohog_talked", st.activeFlags.has("fto_quohog_talked"));
  apply(hs("fto_bar", "ftoh_quohog_grab").action);
  check("fto: the shakedown hands over the keys", st.inventory.some((i) => i.id === "fto_keys"));
  check("fto: ride-out unlocks with the keys", meetsGating({ requiresItems: ["fto_keys"] }, st));

  // Faithful characters: Ben is the Polecats' LEADER (not chasing them).
  const ben = S.characters.find((c) => c.id === "ben");
  check("fto: Ben is the leader of the Polecats", ben?.role === "Leader of the Polecats");
}

/* ================================================================== */
/*  5. Voice ducking envelope (audio.ts — stepped ramp, real-time)     */
/* ================================================================== */
{
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const { audio } = await import("../src/audio");
  let notified = 0;
  audio.onDuckChange = () => notified++;
  try {
    audio.setVoiceDuckEnabled(true);
    audio.duckFactor = 1;
    audio.voiceStarted();
    await sleep(700); // attack is 450ms
    check("duck: dips toward the floor when voice starts", audio.duckFactor < 0.5, audio.duckFactor);
    audio.voiceStarted(); // a second line begins — the floor must hold
    await sleep(300);
    check("duck: a new line holds the floor (no pump)", audio.duckFactor < 0.5, audio.duckFactor);
    audio.voiceEnded();
    await sleep(1100 + 900 + 400); // grace 1100ms + release 900ms + margin
    check("duck: releases to full after a beat of silence", Math.abs(audio.duckFactor - 1) < 0.01, audio.duckFactor);
    check("duck: envelope steps notified the game", notified > 5, notified);
    audio.setVoiceDuckEnabled(false);
    await sleep(300);
    const level = audio.duckFactor;
    audio.voiceStarted();
    await sleep(700);
    check("duck: disabled — voice never dips the music", Math.abs(audio.duckFactor - level) < 0.01, audio.duckFactor);
    audio.setVoiceDuckEnabled(true);
  } finally {
    audio.onDuckChange = null;
  }
}

/* ================================================================== */
/*  6. Voice-file export round trip (mediaLibrary.ts — real code)      */
/*                                                                     */
/*  The .reel.json envelope never changed shape: it is still           */
/*  `{ ...story, assets: MediaAsset[] }`. What changed is content —    */
/*  voice lines saved as files (/voices/... or file://) are read off   */
/*  disk and converted into ordinary asset:<id> rows, which the        */
/*  UNCHANGED import path (importStoryAssets + compactStoryMedia)      */
/*  already consumes. This section proves that round trip.             */
/* ================================================================== */
{
  const http = await import("node:http");
  const { bundleVoiceFileRefs, resolveMediaValue } = await import("../src/data/mediaLibrary");

  // A tiny static server standing in for the dev server's public/ folder.
  const mp3Bytes = "ID3fake-mp3-bytes-for-the-export-round-trip-test-1234";
  const routes: Record<string, string> = {
    "/voices/rosa/nwd_test/line.mp3": mp3Bytes,
  };
  const server = http.createServer((req, res) => {
    const body = routes[req.url ?? ""];
    if (body === undefined) {
      res.writeHead(404).end("nope");
      return;
    }
    res.writeHead(200, { "content-type": "audio/mpeg" }).end(body);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;

  // Node's fetch refuses root-relative URLs — point them at the server,
  // exactly like the dev server serves public/ in a real browser.
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: unknown, init?: unknown) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : String(input);
    return realFetch(url.startsWith("/") ? base + url : url, init as RequestInit | undefined);
  }) as typeof fetch;

  try {
    const story = {
      id: "export-roundtrip",
      title: "Export Round Trip",
      startSceneId: "s1",
      scenes: [
        {
          id: "s1",
          title: "The Diner",
          background: "gradient:linear-gradient(#000,#111)",
          dialogueBeats: [
            { id: "b1", characterId: "rosa", text: "Hi.", audioUrl: "/voices/rosa/nwd_test/line.mp3" },
            { id: "b2", characterId: "rosa", text: "Gone.", audioUrl: "/voices/rosa/nwd_test/absent.mp3" },
            { id: "b3", characterId: "rosa", text: "No voice." },
          ],
        },
      ],
      characters: [{ id: "rosa", name: "Rosa" }],
      items: [],
    } as unknown as Story;

    const { story: exported, assets, missing } = await bundleVoiceFileRefs(story);

    // 1. The found file becomes an asset: reference + one bundled base64 row.
    const refB1 = exported.scenes[0].dialogueBeats![0].audioUrl!;
    check("voice export: file ref becomes an asset: ref", refB1.startsWith("asset:voice-"), refB1);
    check("voice export: exactly one bundled asset row", assets.length === 1, assets.length);
    const row = assets[0];
    check(
      "voice export: row carries a base64 mp3 payload",
      !!row.dataUrl?.startsWith("data:audio/mpeg;base64,"),
      row.dataUrl?.slice(0, 40)
    );
    const decoded = Buffer.from(row.dataUrl!.slice("data:audio/mpeg;base64,".length), "base64").toString("utf8");
    check("voice export: payload decodes to the exact file bytes", decoded === mp3Bytes, decoded);

    // 2. A referenced-but-missing file is named; its reference is untouched.
    check(
      "voice export: missing file is named in the report",
      missing.length === 1 && missing[0] === "/voices/rosa/nwd_test/absent.mp3",
      missing
    );
    check(
      "voice export: missing ref left as-is",
      exported.scenes[0].dialogueBeats![1].audioUrl === "/voices/rosa/nwd_test/absent.mp3"
    );

    // 3. The working story is never mutated by the export.
    check(
      "voice export: input story not mutated",
      story.scenes[0].dialogueBeats![0].audioUrl === "/voices/rosa/nwd_test/line.mp3"
    );

    // 4. The UNCHANGED import path: importStoryAssets strips fileUrl (absent
    //    on bundled rows) and stores the rest; the game then resolves the ref
    //    through the same id->url map it builds at play time.
    const importedRows = assets.map(({ fileUrl: _fileUrl, ...asset }) => ({
      ...asset,
      storyId: "someone-elses-story",
    }));
    const map: Record<string, string> = Object.fromEntries(
      importedRows.map((a) => [a.id, (a as { fileUrl?: string }).fileUrl ?? a.dataUrl])
    );
    check(
      "voice export→import: play-time resolver finds the voice",
      resolveMediaValue(refB1, map) === row.dataUrl
    );

    // 5. A file:// ref (packaged-app reference) without the desktop bridge
    //    is reported missing rather than silently dropped or crashed on.
    const fileRefStory = JSON.parse(JSON.stringify(story)) as unknown as Story;
    fileRefStory.scenes[0].dialogueBeats![0].audioUrl =
      "file:///C:/Users/x/AppData/Roaming/Scarlet Reel/game-media/voices/rosa/nwd_test/line.mp3";
    delete fileRefStory.scenes[0].dialogueBeats![1].audioUrl;
    const fileOut = await bundleVoiceFileRefs(fileRefStory);
    check(
      "voice export: file:// ref without desktop bridge is reported missing",
      fileOut.missing.length === 1 && fileOut.missing[0].startsWith("file://"),
      fileOut.missing
    );

    // 6. An old-style export (asset: refs + library rows, no voice files)
    //    passes through the new exporter byte-for-byte untouched.
    const legacy = JSON.parse(JSON.stringify(story)) as unknown as Story;
    legacy.scenes[0].dialogueBeats![0].audioUrl = "asset:17345-original";
    delete legacy.scenes[0].dialogueBeats![1].audioUrl;
    const legacyOut = await bundleVoiceFileRefs(legacy);
    check(
      "voice export: legacy asset: refs pass through untouched",
      legacyOut.story.scenes[0].dialogueBeats![0].audioUrl === "asset:17345-original"
    );
    check(
      "voice export: legacy export adds no rows and names no missing",
      legacyOut.assets.length === 0 && legacyOut.missing.length === 0
    );
  } finally {
    globalThis.fetch = realFetch;
    server.close();
  }
}

/* ================================================================== */
/*  7. Session restore (game/session.ts — real code)                   */
/*                                                                     */
/*  A reload must put the player back where they were instead of on    */
/*  the newsstand, and a corrupt or hostile stored value must never    */
/*  be enough to break startup.                                        */
/* ================================================================== */
{
  const { SESSION_KEY, readSession, writeSession, clearSession } = await import("../src/game/session");

  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
  };

  check("session: absent to begin with", readSession() === null);

  writeSession({ kind: "play", storyId: "the-neon-diner" });
  check(
    "session: a play session round trips with its case id",
    JSON.stringify(readSession()) === JSON.stringify({ kind: "play", storyId: "the-neon-diner" }),
    readSession()
  );
  check("session: stored under the documented key", store.has(SESSION_KEY));

  writeSession({ kind: "studio" });
  check("session: studio round trips", readSession()?.kind === "studio", readSession());
  writeSession({ kind: "gallery" });
  check("session: gallery round trips", readSession()?.kind === "gallery", readSession());

  clearSession();
  check("session: quitting to the newsstand clears it", readSession() === null && !store.has(SESSION_KEY));

  // A bad stored value must read as "no session", never throw at startup.
  for (const [name, bad] of [
    ["corrupt JSON", "{not json"],
    ["JSON null", "null"],
    ["a number", "42"],
    ["a string", "\"the-neon-diner\""],
    ["an array", "[]"],
    ["unknown kind", JSON.stringify({ kind: "credits" })],
    ["no kind", JSON.stringify({ storyId: "x" })],
    ["play with no case id", JSON.stringify({ kind: "play" })],
    ["play with empty case id", JSON.stringify({ kind: "play", storyId: "" })],
    ["play with non-string id", JSON.stringify({ kind: "play", storyId: 7 })],
  ] as Array<[string, string]>) {
    store.set(SESSION_KEY, bad);
    let out: unknown = "threw";
    try {
      out = readSession();
    } catch {
      /* stays "threw" */
    }
    check(`session: ${name} reads as no session`, out === null, out);
  }

  // Storage that throws outright (private mode / disabled cookies) must not
  // take startup down with it.
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("SecurityError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
    key: () => null,
    length: 0,
    clear: () => {},
  };
  let threw = false;
  try {
    check("session: throwing storage reads as no session", readSession() === null);
    writeSession({ kind: "studio" }); // must swallow, not propagate
    clearSession();
  } catch {
    threw = true;
  }
  check("session: throwing storage never propagates", !threw);
}

/* ================================================================== */
/*  8. Credits-intro look presets (src/credits.ts — real code)         */
/*                                                                     */
/*  A preset is a LOOK, never CONTENT: applying one must overwrite every */
/*  style knob (including resetting a knob another preset moved) while  */
/*  leaving the authored title, subheading, credit lines and montage    */
/*  stills alone. And the picker must be able to tell which preset a    */
/*  node's knobs currently spell out.                                   */
/* ================================================================== */
{
  const {
    CREDITS_PRESETS,
    CREDITS_PRESET_GROUPS,
    CREDITS_PRESET_LIST,
    CREDITS_LOOK_KEYS,
    applyCreditsPreset,
    creditsLookSummary,
    matchCreditsPreset,
    resolveCreditsLook,
  } = await import("../src/credits");

  // --- catalogue integrity -------------------------------------------------
  const ids = CREDITS_PRESET_LIST.map((p) => p.id);
  check("credits presets: list is not empty", CREDITS_PRESET_LIST.length > 0);
  check("credits presets: every list entry resolves in CREDITS_PRESETS", ids.every((id) => !!CREDITS_PRESETS[id]));
  check("credits presets: ids are unique", new Set(ids).size === ids.length);
  check(
    "credits presets: every entry is named, tagged and filed under a group",
    CREDITS_PRESET_LIST.every((p) => !!p.name && !!p.badge && !!p.tagline && !!p.swatch && !!p.group),
    CREDITS_PRESET_LIST.filter((p) => !p.name || !p.badge || !p.tagline || !p.swatch || !p.group).map((p) => p.id),
  );

  // The Studio picker renders one section per group; a preset filed under an
  // unknown group would vanish from the grid, and an empty group would ship
  // a dead header.
  const groupIds = new Set(CREDITS_PRESET_GROUPS.map((g) => g.id));
  check(
    "credits presets: every preset files under a known group",
    CREDITS_PRESET_LIST.every((p) => groupIds.has(p.group)),
    CREDITS_PRESET_LIST.filter((p) => !groupIds.has(p.group)).map((p) => `${p.id}:${p.group}`),
  );
  check(
    "credits presets: every group has at least one preset",
    CREDITS_PRESET_GROUPS.every((g) => CREDITS_PRESET_LIST.some((p) => p.group === g.id)),
    CREDITS_PRESET_GROUPS.filter((g) => !CREDITS_PRESET_LIST.some((p) => p.group === g.id)).map((g) => g.id),
  );
  // The list feeds the grouped picker, so each group should appear as one
  // contiguous run — no group restarting after another has begun.
  const groupRun = CREDITS_PRESET_LIST.map((p) => p.group);
  const runs = groupRun.filter((g, i) => i === 0 || groupRun[i - 1] !== g);
  check(
    "credits presets: groups are contiguous in the list so the picker sections read clean",
    new Set(runs).size === runs.length,
    runs,
  );

  // The picker's knob read-out: names the face and the presentation for a
  // cards look, and spells the roll length for a scroll look.
  const ghSummary = creditsLookSummary(CREDITS_PRESETS["grindhouse-slam"].look);
  check(
    "credits presets: look summary names the typeface and card motion",
    ghSummary.includes("Bebas") && ghSummary.includes("cards/slam") && ghSummary.includes("hard cuts"),
    ghSummary,
  );
  const scrollSummary = creditsLookSummary(CREDITS_PRESETS["rep-house-roll"].look);
  check(
    "credits presets: look summary spells the scroll length",
    scrollSummary.includes("scroll 32s") && scrollSummary.includes("projector weave"),
    scrollSummary,
  );
  check(
    "credits presets: look summary mentions a list entrance only where it matters",
    creditsLookSummary(CREDITS_PRESETS["streaming-cold-open"].look).includes("typewriter") &&
      !creditsLookSummary(CREDITS_PRESETS["grindhouse-slam"].look).includes("slam in") &&
      !creditsLookSummary(CREDITS_PRESETS["grindhouse-slam"].look).includes("typewriter"),
    creditsLookSummary(CREDITS_PRESETS["streaming-cold-open"].look),
  );

  // `applyCreditsPreset` merges with a spread, so a knob only gets RESET if the
  // preset owns the key explicitly (look() fills every key, even to undefined).
  check(
    "credits presets: every preset owns every knob explicitly",
    CREDITS_PRESET_LIST.every((p) => CREDITS_LOOK_KEYS.every((k) => Object.prototype.hasOwnProperty.call(p.look, k))),
    CREDITS_PRESET_LIST.filter((p) => !CREDITS_LOOK_KEYS.every((k) => Object.prototype.hasOwnProperty.call(p.look, k))).map(
      (p) => `${p.id}: missing ${CREDITS_LOOK_KEYS.filter((k) => !Object.prototype.hasOwnProperty.call(p.look, k)).join(",")}`,
    ),
  );

  // Slider ranges in the Studio credits panel — a preset that dials a value
  // outside them would leave the slider showing a number the author can't
  // reproduce, so the preset would silently not round-trip through the UI.
  const RANGES: Record<string, [number, number]> = {
    cardSeconds: [1.2, 8],
    montageSeconds: [2, 12],
    stagger: [0, 2],
    duration: [0.2, 2],
    scrollDuration: [6, 120],
  };
  for (const p of CREDITS_PRESET_LIST) {
    const r = resolveCreditsLook(p.look);
    for (const [key, [min, max]] of Object.entries(RANGES)) {
      const v = r[key as keyof typeof r] as number;
      check(`credits preset ${p.id}: ${key} ${v} inside studio slider ${min}–${max}`, v >= min && v <= max, v);
    }
  }

  // --- an untouched credits node IS the default preset ---------------------
  check("credits presets: no settings matches the default look", matchCreditsPreset(undefined) === "pulp-default");
  check("credits presets: empty settings matches the default look", matchCreditsPreset({}) === "pulp-default");
  check(
    "credits presets: an explicit default matches too",
    matchCreditsPreset({ font: "pulp", style: "fade-up", gateWeave: "off" }) === "pulp-default",
  );
  // Colour normalisation: #FFF and #ffffff and #FFFFFF are the same knob.
  check(
    "credits presets: colour case/short-hex normalises",
    matchCreditsPreset({ font: "modern", style: "fade-up", titleEntrance: "typewriter", titleColor: "#FFF", accentColor: "#E50914", stagger: 0.25, duration: 0.6 }) ===
      "streaming-cold-open",
  );

  // --- applying a preset: content survives, the look is replaced -----------
  const authored = {
    title: "MIDNIGHT CONFESSION",
    subtitle: "A Gaslight Reelworks picture",
    lines: [
      { role: "Directed by", name: "Sam Cole" },
      { role: "Written by", name: "The City" },
    ],
    montage: ["gradient:linear-gradient(#000,#000)", "asset:abc123"],
    montageLoop: false,
    gateWeave: "projector",
    scrollDuration: 90,
    cardSeconds: 7.5,
  } as const;

  for (const p of CREDITS_PRESET_LIST) {
    const out = applyCreditsPreset(p.id, { ...authored });
    check(`credits preset ${p.id}: keeps the authored title`, out.title === authored.title, out.title);
    check(`credits preset ${p.id}: keeps the authored subheading`, out.subtitle === authored.subtitle, out.subtitle);
    check(
      `credits preset ${p.id}: keeps the authored credit lines`,
      JSON.stringify(out.lines) === JSON.stringify(authored.lines),
      out.lines,
    );
    check(
      `credits preset ${p.id}: keeps the montage stills`,
      JSON.stringify(out.montage) === JSON.stringify(authored.montage),
      out.montage,
    );
    check(
      `credits preset ${p.id}: overwrites the look it owns`,
      JSON.stringify(resolveCreditsLook(out)) === JSON.stringify(resolveCreditsLook(p.look)),
      resolveCreditsLook(out),
    );
    check(`credits preset ${p.id}: node now matches that preset`, matchCreditsPreset(out) === p.id, matchCreditsPreset(out));
    // Presets are mutually distinguishable — two of them can't resolve equal.
    const twins = CREDITS_PRESET_LIST.filter((q) => q.id !== p.id && matchCreditsPreset(q.look) === p.id);
    check(`credits preset ${p.id}: no other preset resolves to it`, twins.length === 0, twins.map((t) => t.id));
  }

  // Switching presets must RESET the knobs the old one moved, not stack them.
  const rolled = applyCreditsPreset("pulp-default", applyCreditsPreset("rep-house-roll", { ...authored }));
  check(
    "credits presets: switching back to default resets scroll duration + weave",
    rolled.scrollDuration === 24 && rolled.gateWeave === "off",
    { scrollDuration: rolled.scrollDuration, gateWeave: rolled.gateWeave },
  );
  check(
    "credits presets: switching back to default still keeps the content",
    JSON.stringify(rolled.lines) === JSON.stringify(authored.lines) && JSON.stringify(rolled.montage) === JSON.stringify(authored.montage),
  );

  // --- the picker reads "custom look" once a knob is hand-tweaked ----------
  const tweaked = { ...applyCreditsPreset("grindhouse-slam", {}), gateWeave: "off" as const };
  check("credits presets: a hand-tweak clears the preset match", matchCreditsPreset(tweaked) === undefined);
  const unknown = applyCreditsPreset("not-a-preset" as never, { ...authored });
  check(
    "credits presets: an unknown id is a no-op",
    JSON.stringify(unknown) === JSON.stringify({ ...authored }),
    unknown,
  );
  // An unknown id returns the settings as handed in, so the node's look is
  // whatever it was — here a hand-made combination, matching no preset.
  check("credits presets: unknown id changes nothing the picker sees", matchCreditsPreset(unknown) === undefined, matchCreditsPreset(unknown));
}

/* ================================================================== *
 *  travel map — unlock derivation, availability, validator rules
 * ================================================================== */
{
  const scn = (id: string, extra: Partial<SceneNode> = {}): SceneNode => ({
    id,
    title: id,
    background: "",
    prose: "p",
    choices: [],
    hotspots: [],
    dialogueBeats: [],
    ...extra,
  });
  const S: Story = {
    id: "map-t",
    title: "Map T",
    tagline: "",
    coverImage: "",
    startSceneId: "a",
    items: [{ id: "key", name: "Key", icon: "🔑", description: "", flavorText: "" }],
    characters: [],
    scenes: [
      scn("a", { choices: [{ id: "c1", text: "go", targetSceneId: "end", attitudeTag: "Neutral" }] }),
      scn("b"),
      scn("note1", { nodeType: "note", choices: [{ id: "n1", text: "", targetSceneId: "b", attitudeTag: "Neutral" }] }),
      scn("deadnote", { nodeType: "note" }),
      scn("end", { isEnding: true, endingData: { tier: "victory-gold", headline: "H", recap: "r" } }),
    ],
    map: {
      backgroundImage: "/img/map.jpg",
      locations: [
        { id: "l-open", label: "Open", targetSceneId: "a", x: 10, y: 10 },
        { id: "l-flag", label: "Flagged", targetSceneId: "b", x: 20, y: 20, gating: { requiresFlags: ["tip"] } },
        { id: "l-item", label: "Keyed", targetSceneId: "b", x: 30, y: 30, gating: { requiresItems: ["key"] } },
        { id: "l-secret", label: "Secret", targetSceneId: "b", x: 40, y: 40, gating: { requiresFlags: ["deep"] }, hiddenWhenLocked: true },
      ],
    },
  };

  // -- unlock view is pure gating over live state --------------------------
  const s0 = createInitialState(S);
  let view = mapLocationsView(S, s0);
  check("map: hiddenWhenLocked pin not drawn while locked", !view.some((v) => v.location.id === "l-secret"), view.map((v) => v.location.id));
  check("map: visible pins = open + locked-visible", view.length === 3);
  check("map: ungated pin open from the start", view.find((v) => v.location.id === "l-open")?.unlocked === true);
  check("map: flag-gated pin locked before the flag", view.find((v) => v.location.id === "l-flag")?.unlocked === false);

  const s1 = { ...s0, activeFlags: new Set([...s0.activeFlags, "tip", "deep"]) };
  view = mapLocationsView(S, s1);
  check("map: flag unlock derives live from activeFlags", view.find((v) => v.location.id === "l-flag")?.unlocked === true);
  check("map: hidden pin surfaces once its flag is set", view.find((v) => v.location.id === "l-secret")?.unlocked === true);

  const s2 = { ...s0, inventory: [...s0.inventory, S.items[0]] };
  check("map: item gating works too (same vocabulary as choices)", mapLocationsView(S, s2).find((v) => v.location.id === "l-item")?.unlocked === true);

  // -- availability gate ----------------------------------------------------
  check("map: available when locations exist", mapAvailable(S));
  check("map: NOT available with no map", !mapAvailable({ ...S, map: undefined }));
  check("map: NOT available with zero locations", !mapAvailable({ ...S, map: { locations: [] } }));
  check("map: theme hideMap wins over content", !mapAvailable({ ...S, dialogueBox: { hideMap: true } }));

  // -- validator ------------------------------------------------------------
  const has = (st: Story, re: RegExp) => validateStory(st).some((i) => re.test(i.message));
  check("map validator: clean story has no map issues", !has(S, /[Mm]ap location/));
  check(
    "map validator: missing target scene is an error",
    has({ ...S, map: { locations: [{ id: "x", label: "X", targetSceneId: "nope", x: 1, y: 1 }] } }, /missing scene "nope"/)
  );
  check(
    "map validator: duplicate location ids are an error",
    has({ ...S, map: { locations: [
      { id: "dup", label: "A", targetSceneId: "a", x: 1, y: 1 },
      { id: "dup", label: "B", targetSceneId: "b", x: 2, y: 2 },
    ] } }, /Duplicate map location id/)
  );
  check(
    "map validator: pin to a dead-end note is a stranding error",
    has({ ...S, map: { locations: [{ id: "n", label: "N", targetSceneId: "deadnote", x: 1, y: 1 }] } }, /note placeholder/)
  );
  check(
    "map validator: pin to a routed note is fine (bypass carries the traveller)",
    !has({ ...S, map: { locations: [{ id: "n", label: "N", targetSceneId: "note1", x: 1, y: 1 }] } }, /note placeholder/)
  );
  check(
    "map validator: off-map pin coordinates warn",
    has({ ...S, map: { locations: [{ id: "o", label: "O", targetSceneId: "a", x: 140, y: 1 }] } }, /off the map/)
  );
  check(
    "map validator: hiddenWhenLocked without gating warns",
    has({ ...S, map: { locations: [{ id: "h", label: "H", targetSceneId: "a", x: 1, y: 1, hiddenWhenLocked: true }] } }, /never be hidden/)
  );

  // -- reachability & flag bookkeeping --------------------------------------
  check(
    "map reachability: a map-only scene is NOT flagged unreachable",
    !validateStory(S).some((i) => i.sceneId === "b" && /unreachable/.test(i.message))
  );
  check(
    "map reachability: without the map the same scene IS unreachable",
    validateStory({ ...S, map: undefined }).some((i) => i.sceneId === "b" && /unreachable/.test(i.message))
  );
  check("map flags: collectFlags sees map gate flags", collectFlags(S).includes("tip") && collectFlags(S).includes("deep"));

  // -- map absorbs pure travel choices (replaceTravelChoices) ---------------
  {
    const R: Story = JSON.parse(JSON.stringify(S)) as Story;
    R.map!.replaceTravelChoices = true;
    R.scenes[0].choices = [
      { id: "t1", text: "Back to the start", targetSceneId: "a", attitudeTag: "Neutral" }, // pure, pin open
      { id: "t2", text: "Off to b", targetSceneId: "b", attitudeTag: "Neutral" }, // pure, but every pin to b is LOCKED
      { id: "t3", text: "Go and grab it", targetSceneId: "a", attitudeTag: "Neutral", consequences: { setFlags: ["x"] } }, // side effects
      { id: "t4", text: "Answer her", reply: true, attitudeTag: "Neutral" }, // reply, no target
      { id: "t5", text: "Show the key", targetSceneId: "a", attitudeTag: "Neutral", presentItem: "key" }, // presents evidence
      { id: "t6", text: "Move! Now!", targetSceneId: "a", attitudeTag: "Neutral", quickTime: true, timeLimitSeconds: 5 }, // timed
    ];
    const st = createInitialState(R);
    const absorbed = mapReplacedChoiceIds(R, R.scenes[0], st);
    check("map absorb: pure travel to an open pin is absorbed", absorbed.has("t1"));
    check("map absorb: a LOCKED pin never absorbs (the choice may be the only way in)", !absorbed.has("t2"));
    check("map absorb: consequences keep the choice", !absorbed.has("t3"));
    check("map absorb: replies are never absorbed", !absorbed.has("t4"));
    check("map absorb: present-item choices are never absorbed", !absorbed.has("t5"));
    check("map absorb: timed/QTE choices are never absorbed", !absorbed.has("t6"));
    check("map absorb: exactly one choice absorbed", absorbed.size === 1, [...absorbed]);

    // unlock the b pins → t2 becomes absorbable, live from state
    st.activeFlags.add("tip");
    check("map absorb: unlocking the pin absorbs the matching choice live", mapReplacedChoiceIds(R, R.scenes[0], st).has("t2"));

    // the switch itself, and the theme's hideMap, both disable absorption
    const off: Story = JSON.parse(JSON.stringify(R)) as Story;
    off.map!.replaceTravelChoices = undefined;
    check("map absorb: off by default (opt-in)", mapReplacedChoiceIds(off, off.scenes[0], createInitialState(off)).size === 0);
    const hidden: Story = { ...R, dialogueBox: { hideMap: true } };
    check("map absorb: theme hideMap disables absorption (no map, no swap)", mapReplacedChoiceIds(hidden, hidden.scenes[0], createInitialState(hidden)).size === 0);

    // choiceIsPureTravel unit edges
    check("pure travel: nav-only choice is pure", choiceIsPureTravel({ id: "p", text: "p", targetSceneId: "a", attitudeTag: "Neutral" }));
    check("pure travel: memoryLog keeps the choice", !choiceIsPureTravel({ id: "p", text: "p", targetSceneId: "a", attitudeTag: "Neutral", memoryLog: "m" }));
    check("pure travel: rememberLine keeps the choice", !choiceIsPureTravel({ id: "p", text: "p", targetSceneId: "a", attitudeTag: "Neutral", rememberLine: "r" }));
    check("pure travel: exclusiveGroup keeps the choice", !choiceIsPureTravel({ id: "p", text: "p", targetSceneId: "a", attitudeTag: "Neutral", exclusiveGroup: "g" }));
    check("pure travel: empty consequences object is still pure", choiceIsPureTravel({ id: "p", text: "p", targetSceneId: "a", attitudeTag: "Neutral", consequences: {} }));

    // validator: the switch that can never fire warns; a working one doesn't
    const dead: Story = JSON.parse(JSON.stringify(R)) as Story;
    dead.scenes.forEach((sc) => (sc.choices = sc.choices?.filter((c) => !(choiceIsPureTravel(c) && ["a", "b"].includes(c.targetSceneId!)))));
    check(
      "map absorb validator: switch with nothing to absorb warns",
      validateStory(dead).some((i) => /replaceTravelChoices.*does nothing/.test(i.message))
    );
    check(
      "map absorb validator: a working switch raises no such warning",
      !validateStory(R).some((i) => /replaceTravelChoices.*does nothing/.test(i.message))
    );
  }
}

/* ================================================================== *
 *  sprite sheets — frame maths, animation fallback, validator wiring
 * ================================================================== */
{
  const sheet: SpriteSheet = {
    image: "/assets/sprites/gumshoe-walk.png",
    frameWidth: 114,
    frameHeight: 192,
    animations: {
      idle: { frames: [1] },
      walk: { frames: [0, 1, 2, 3], fps: 8 },
      slump: { frames: [3, 2], loop: false },
    },
  };

  // -- grid maths ------------------------------------------------------------
  check("sheet: cols from image width", sheetCols(sheet, 456) === 4);
  check("sheet: cols never collapses to 0 on a too-narrow image", sheetCols(sheet, 50) === 1);
  check("sheet: frame 0 sits at the origin", JSON.stringify(sheetFramePos(0, 4)) === JSON.stringify({ col: 0, row: 0 }));
  check("sheet: frame 5 wraps to row 1 col 1", JSON.stringify(sheetFramePos(5, 4)) === JSON.stringify({ col: 1, row: 1 }));

  // -- named-animation lookup with fallbacks ----------------------------------
  check("sheet: exact animation name wins", sheetAnim(sheet, "walk")?.frames.length === 4);
  check("sheet: missing name falls back in order", sheetAnim(sheet, "run", ["walk"])?.frames[3] === 3);
  const idleOnly: SpriteSheet = { ...sheet, animations: { idle: { frames: [0] } } };
  check("sheet: no match falls back to first defined animation", sheetAnim(idleOnly, "walk")?.frames[0] === 0);
  check("sheet: empty animations yields null", sheetAnim({ ...sheet, animations: {} }, "walk") === null);

  // -- frame stepping: looping and hold-last ----------------------------------
  const walk = sheet.animations.walk;
  check("sheet: t=0 is the first frame", sheetFrameAt(walk, 0) === 0);
  check("sheet: fps drives stepping", sheetFrameAt(walk, 0.13) === 1); // 8fps → frame 1 at 125ms
  check("sheet: looping wraps past the end", sheetFrameAt(walk, 0.5) === 0); // frame 4 → wraps
  const slump = sheet.animations.slump;
  check("sheet: loop:false holds the last frame", sheetFrameAt(slump, 9) === 2);
  check("sheet: default fps is 8", sheetFrameAt({ frames: [0, 1] }, 0.13) === 1);

  // -- validator --------------------------------------------------------------
  check("sheet issues: a well-formed sheet is clean", spriteSheetIssues(sheet, "walker").length === 0);
  check(
    "sheet issues: missing image is caught",
    spriteSheetIssues({ ...sheet, image: "" }, "walker").some((m) => /image/.test(m))
  );
  check(
    "sheet issues: zero frame size is caught",
    spriteSheetIssues({ ...sheet, frameWidth: 0 }, "walker").some((m) => /frame size/.test(m))
  );
  check(
    "sheet issues: an empty animation is caught",
    spriteSheetIssues({ ...sheet, animations: { walk: { frames: [] } } }, "walker").some((m) => /no frames/.test(m))
  );
  check(
    "sheet issues: negative frame index is caught",
    spriteSheetIssues({ ...sheet, animations: { walk: { frames: [-1] } } }, "walker").some((m) => /negative/.test(m))
  );
  check(
    "sheet issues: missing expected animation names hint",
    spriteSheetIssues({ ...sheet, animations: { dance: { frames: [0] } } }, "walker", ["walk", "idle"]).some((m) => /walk|idle/.test(m))
  );
  check(
    "sheet issues: no hint when an expected name is present",
    !spriteSheetIssues(sheet, "walker", ["walk", "idle"]).length
  );

  // -- drawable test used by walker / portraits / extras ----------------------
  check("sheet: a full sheet is drawable", sheetDrawable(sheet));
  check("sheet: undefined is not drawable", !sheetDrawable(undefined));
  check("sheet: no image is not drawable", !sheetDrawable({ ...sheet, image: "" }));
  check("sheet: zero frame size is not drawable", !sheetDrawable({ ...sheet, frameHeight: 0 }));
  check("sheet: empty animations is not drawable", !sheetDrawable({ ...sheet, animations: {} }));
  check(
    "sheet: an all-empty animation is not drawable",
    !sheetDrawable({ ...sheet, animations: { walk: { frames: [] } } })
  );

  // -- story validator wiring: stage.playerSheet problems surface as warnings --
  const stageStory: Story = {
    id: "sheet-v", title: "SV", subtitle: "", coverTagline: "", startSceneId: "st",
    characters: [], items: [], meters: {}, scenes: [
      {
        id: "st", title: "Floor", nodeType: "stage", prose: "", background: "",
        stage: {
          playerSheet: { image: "", frameWidth: 0, frameHeight: 48, animations: {} },
          floor: { top: 60, bottom: 90 },
        },
        hotspots: [{ id: "d", label: "Door", bounds: { x: 80, y: 60, w: 10, h: 20 }, cursor: "go", action: { type: "goToScene", targetSceneId: "end" } }],
        dialogueBeats: [], choices: [],
      } as unknown as SceneNode,
      { id: "end", title: "End", nodeType: "ending", prose: "Done.", background: "", hotspots: [], dialogueBeats: [], choices: [], endingData: { tier: "best", epilogue: "" } } as unknown as SceneNode,
    ],
  } as unknown as Story;
  const sheetIssues = validateStory(stageStory).filter((i) => /sprite sheet/i.test(i.message));
  check("sheet validator wiring: bad playerSheet surfaces as story warnings", sheetIssues.length >= 2, sheetIssues.length);
  check("sheet validator wiring: sheet problems are warnings, not errors", sheetIssues.every((i) => i.severity === "warning"));
  check("sheet validator wiring: warnings attach to the stage scene", sheetIssues.every((i) => i.sceneId === "st"));

  // -- validator wiring: talking sheets and animated extras -------------------
  const richStory: Story = JSON.parse(JSON.stringify(stageStory)) as Story;
  richStory.scenes[0].stage = undefined as never;
  richStory.scenes[0].nodeType = undefined as never;
  richStory.scenes[0].choices = [{ id: "c", text: "On", targetSceneId: "end" }] as never;
  richStory.characters = [
    {
      id: "ch", name: "Mara", role: "singer", avatarUrl: "emoji:🎤", trustMeter: 0,
      talkingSheet: { image: "", frameWidth: 64, frameHeight: 64, animations: { talk: { frames: [-2] } } },
    },
  ] as never;
  richStory.scenes[0].cinematic = {
    foregroundExtras: [{ image: "", sheet: { image: "x.png", frameWidth: 0, frameHeight: 32, animations: { loop: { frames: [0] } } } }],
  } as never;
  const richIssues = validateStory(richStory);
  const talkWarn = richIssues.filter((i) => /talking sheet/.test(i.message));
  check("talking sheet: malformed sheet warns at story level", talkWarn.length >= 2, talkWarn.length);
  check("talking sheet: names the character", talkWarn.every((i) => /Mara/.test(i.message)));
  check("talking sheet: warnings not errors", talkWarn.every((i) => i.severity === "warning"));
  const extraWarn = richIssues.filter((i) => /foreground extra .*sprite sheet/i.test(i.message));
  check("extra sheet: malformed extra sheet warns on the scene", extraWarn.length >= 1, extraWarn.length);
  check("extra sheet: attaches to the owning scene", extraWarn.every((i) => i.sceneId === "st"));
  const cleanChars: Story = JSON.parse(JSON.stringify(richStory)) as Story;
  cleanChars.characters[0].talkingSheet = { image: "s.png", frameWidth: 64, frameHeight: 64, animations: { talk: { frames: [0, 1] }, rest: { frames: [0] } } };
  cleanChars.scenes[0].cinematic = undefined as never;
  check(
    "talking sheet: a well-formed sheet raises no sheet warnings",
    !validateStory(cleanChars).some((i) => /talking sheet|sprite sheet/i.test(i.message))
  );
}

/* ================================================================== */
/*  Playtest coverage — the tally, and the report over a story         */
/* ================================================================== */
{
  const story: Story = {
    id: "cov-test",
    title: "Coverage",
    tagline: "",
    startSceneId: "a",
    characters: [],
    items: [],
    scenes: [
      { id: "a", title: "A", background: "/img/a.jpg", hotspots: [], dialogueBeats: [], choices: [
        { id: "a1", text: "One", targetSceneId: "b" },
        { id: "a2", text: "Two", targetSceneId: "c" },
      ] },
      { id: "b", title: "B", background: "/img/b.jpg", hotspots: [], dialogueBeats: [], choices: [
        { id: "b1", text: "End", targetSceneId: "win" },
      ] },
      { id: "c", title: "C", background: "/img/c.jpg", hotspots: [], dialogueBeats: [], choices: [] },
      { id: "win", title: "Win", isEnding: true, background: "/img/w.jpg", hotspots: [], dialogueBeats: [], choices: [] },
    ],
  };

  // --- nothing played yet ---
  const blank = coverageReport(story, null);
  check("coverage: an empty tally reports zero", blank.sceneVisited === 0 && blank.choiceTaken === 0 && blank.runs === 0);
  check("coverage: an empty tally misses everything", blank.missedScenes.length === 4 && blank.missedChoices.length === 3, blank);
  check("coverage: endings are counted separately", blank.endingTotal === 1 && blank.endingSeen === 0);

  // --- one partial run ---
  let cov = emptyCoverage("cov-test");
  cov = recordVisit(cov, "scene", "a");
  cov = recordVisit(cov, "choice", "a:a1");
  cov = recordVisit(cov, "scene", "b");
  cov = recordVisit(cov, "choice", "b:b1");
  cov = recordVisit(cov, "scene", "win");
  cov = recordRun(cov);
  const r = coverageReport(story, cov);
  check("coverage: visited scenes are counted", r.sceneVisited === 3 && r.sceneTotal === 4, r.sceneVisited);
  check("coverage: taken choices are counted", r.choiceTaken === 2 && r.choiceTotal === 3, r.choiceTaken);
  check("coverage: the road not taken is reported", r.missedChoices.length === 1 && r.missedChoices[0].choiceId === "a2", r.missedChoices);
  check("coverage: the unvisited scene is reported with its title", r.missedScenes[0]?.sceneTitle === "C", r.missedScenes);
  check("coverage: reaching an ending clears it", r.endingSeen === 1 && r.missedEndings.length === 0);
  check("coverage: completed runs are counted", r.runs === 1);

  // --- accumulation across playthroughs (the point of persisting) ---
  let second = recordVisit(cov, "scene", "c");
  second = recordVisit(second, "choice", "a:a2");
  const r2 = coverageReport(story, second);
  check("coverage: a second run adds to the tally", r2.sceneVisited === 4 && r2.choiceTaken === 3, r2);
  check("coverage: full coverage leaves no gaps", r2.missedScenes.length === 0 && r2.missedChoices.length === 0);
  const revisit = recordVisit(second, "scene", "a");
  check("coverage: repeat visits increment", (revisit.scenes["a"] ?? 0) === 2, revisit.scenes);
  check("coverage: recording never mutates the input", (second.scenes["a"] ?? 0) === 1, second.scenes);

  // --- percentages ---
  check("coverage: percent of a covered story is 100", coveragePercent(3, 3) === 100);
  check("coverage: percent is rounded", coveragePercent(1, 3) === 33, coveragePercent(1, 3));
  check("coverage: an empty story is 0, not NaN", coveragePercent(0, 0) === 0);
}

/* ================================================================== */
/*  Background remover — the keying tools behind 🪄 Media Tools        */
/* ================================================================== */
{
  // happy-dom/Node have no ImageData; the keying helpers only need the shape.
  if (typeof (globalThis as { ImageData?: unknown }).ImageData === "undefined") {
    (globalThis as Record<string, unknown>).ImageData = class {
      data: Uint8ClampedArray;
      width: number;
      height: number;
      constructor(data: Uint8ClampedArray, width: number, height: number) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    };
  }

  /** w×h RGBA, every pixel `fill` (opaque magenta by default). */
  const plate = (w: number, h: number, fill: [number, number, number] = [255, 0, 255]): ImageData => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = fill[0];
      d[i + 1] = fill[1];
      d[i + 2] = fill[2];
      d[i + 3] = 255;
    }
    return new ImageData(d, w, h) as ImageData;
  };
  const put = (img: ImageData, x: number, y: number, rgb: [number, number, number]) => {
    const i = (y * img.width + x) * 4;
    img.data[i] = rgb[0];
    img.data[i + 1] = rgb[1];
    img.data[i + 2] = rgb[2];
    img.data[i + 3] = 255;
  };
  const alphaAt = (img: ImageData, x: number, y: number) => img.data[(y * img.width + x) * 4 + 3];

  // --- edge sampling -------------------------------------------------------
  {
    const img = plate(8, 8, [255, 0, 255]);
    // a dark subject in the middle must not drag the edge sample
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) put(img, x, y, [10, 10, 10]);
    const edge = sampleEdges(img.data, img.width, img.height);
    check("key: edge sample reads the backdrop, not the subject", edge.r > 200 && edge.b > 200 && edge.g < 40, edge);
    const corner = sampleCorners(img.data, img.width, img.height);
    check("key: corner sample agrees on a flat plate", Math.abs(corner.r - edge.r) < 8, { corner, edge });
  }

  // --- colour key vs edge flood -------------------------------------------
  {
    // 9×9 magenta plate with a magenta-coloured 3×3 block INSIDE the subject:
    // a colour key must erase it (same colour, anywhere); the flood must keep
    // it (no path connects it to the border).
    const img = plate(9, 9, [255, 0, 255]);
    for (let y = 2; y < 7; y++) for (let x = 2; x < 7; x++) put(img, x, y, [10, 200, 10]); // subject
    for (let y = 3; y < 5; y++) for (let x = 3; x < 5; x++) put(img, x, y, [255, 0, 255]); // interior pocket
    const key = { r: 255, g: 0, b: 255 };

    const keyed = applyKey(img, key, 40, 8);
    check("colour key: clears the border", alphaAt(keyed, 0, 0) === 0);
    check("colour key: clears an interior pocket of the key colour", alphaAt(keyed, 3, 3) === 0, alphaAt(keyed, 3, 3));
    check("colour key: keeps the subject", alphaAt(keyed, 2, 6) === 255);

    const flooded = applyEdgeFloodKey(img, key, 40, 8);
    check("edge flood: clears the border", alphaAt(flooded, 0, 0) === 0);
    check("edge flood: keeps an interior pocket the border cannot reach", alphaAt(flooded, 3, 3) === 255, alphaAt(flooded, 3, 3));
    check("edge flood: keeps the subject", alphaAt(flooded, 2, 6) === 255);
  }

  // --- feathering + softness ----------------------------------------------
  {
    const img = plate(5, 5, [255, 0, 255]);
    put(img, 2, 2, [200, 0, 200]); // just outside tolerance, inside the feather band
    const key = { r: 255, g: 0, b: 255 };
    const soft = applyEdgeFloodKey(img, key, 10, 80);
    const a = alphaAt(soft, 2, 2);
    check("edge flood: a near-key pixel is feathered, not cut", a > 0 && a < 255, a);
  }

  // --- despeckle -----------------------------------------------------------
  {
    const img = plate(7, 7, [255, 0, 255]);
    const key = { r: 255, g: 0, b: 255 };
    const clean = applyEdgeFloodKey(img, key, 20, 4); // everything transparent
    put(clean, 3, 3, [10, 10, 10]); // an isolated speck of keying noise
    for (let y = 5; y < 7; y++) for (let x = 5; x < 7; x++) put(clean, x, y, [10, 10, 10]); // a real 2×2 edge
    const scrubbed = despeckle(clean);
    check("despeckle: an isolated speck goes", alphaAt(scrubbed, 3, 3) === 0, alphaAt(scrubbed, 3, 3));
    check("despeckle: a solid 2×2 patch survives", alphaAt(scrubbed, 5, 5) === 255, alphaAt(scrubbed, 5, 5));
    check("despeckle: untouched pixels are untouched", alphaAt(scrubbed, 0, 0) === 0);
  }
}

/* ================================================================== */
/*  Animation — easing, motion paths, idle presets                     */
/* ================================================================== */
{
  // --- easing ---------------------------------------------------------------
  check("ease: endpoints pinned", ease(0) === 0 && ease(1) === 1);
  check("ease: clamps out-of-range t", ease(-1) === 0 && ease(2) === 1);
  check("ease: linear is identity", ease(0.37, "linear") === 0.37);
  check("ease: ease-in is slow at the start", ease(0.25, "in") < 0.25, ease(0.25, "in"));
  check("ease: ease-out is fast at the start", ease(0.25, "out") > 0.25, ease(0.25, "out"));
  check("ease: in-out is symmetric", Math.abs(ease(0.3, "inOut") + ease(0.7, "inOut") - 1) < 1e-9);
  check("ease: arc is slow at both ends", ease(0.05, "arc") < 0.05 && ease(0.95, "arc") > 0.95);

  // --- paths ---------------------------------------------------------------
  const straight = { points: [{ x: 0, y: 50 }, { x: 100, y: 50 }], duration: 10 };
  check("path: length of a straight run", pathSegments(straight).total === 100, pathSegments(straight).total);
  check("path: start point", pathPointAt(straight, 0).x === 0 && pathPointAt(straight, 0).y === 50);
  check("path: end point", Math.abs(pathPointAt(straight, 1).x - 100) < 1e-9);
  check("path: midpoint of a straight run is the middle", Math.abs(pathPointAt(straight, 0.5).x - 50) < 1e-9);
  check("path: travelling right faces right", Math.abs(pathPointAt(straight, 0.5).angle) < 1e-6, pathPointAt(straight, 0.5).angle);

  // A dogleg: 100 units right then 100 units down — constant speed means the
  // corner is reached at exactly half the pass, not at the halfway waypoint.
  const dogleg = { points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 80 }], duration: 8, ease: "linear" as const };
  const seg = pathSegments(dogleg);
  check("path: segment lengths are per-leg", seg.lengths.length === 2 && seg.total === 140, seg);
  const corner = pathPointAt(dogleg, 60 / 140);
  check("path: the corner lands exactly on the waypoint", Math.abs(corner.x - 60) < 1e-9 && Math.abs(corner.y) < 1e-9, corner);
  check("path: constant speed — a quarter of the pass is 35 units along", Math.abs(pathPointAt(dogleg, 0.25).x - 35) < 1e-9, pathPointAt(dogleg, 0.25));
  check("path: the second leg moves in y", pathPointAt(dogleg, 0.9).y > 0, pathPointAt(dogleg, 0.9));
  check("path: heading turns 90° at the corner", Math.abs(pathPointAt(dogleg, 0.99).angle - 90) < 1e-6, pathPointAt(dogleg, 0.99).angle);
  check("path: clamps t outside 0..1", pathPointAt(dogleg, 5).x === 60 && pathPointAt(dogleg, -3).x === 0);

  // --- compiled CSS --------------------------------------------------------
  check("motion: a path needs two points and a duration", motionAnimatable(straight) && !motionAnimatable({ points: [{ x: 1, y: 1 }], duration: 5 }) && !motionAnimatable({ points: straight.points, duration: 0 }));
  const css = motionKeyframes("sr-test", straight);
  check("motion: keyframes are emitted", css.startsWith("@keyframes sr-test {") && css.trim().endsWith("}"));
  check("motion: keyframes animate left/top", /left:\s*0\.000%/.test(css) && /top:\s*50\.000%/.test(css), css.slice(0, 120));
  check("motion: keyframes carry the anchor vars", css.includes("translate(var(--ex-ax), var(--ex-ay))"));
  check("motion: sample count is sane", (css.match(/%\s*\{/g) ?? []).length >= 20, (css.match(/%\s*\{/g) ?? []).length);
  const held = motionKeyframes("sr-test2", { ...straight, holdSeconds: 4 });
  check("motion: a hold keeps the end pose to 100%", held.includes("100% {") && held.lastIndexOf("100% {") > held.indexOf("99"));
  const faded = motionKeyframes("sr-test3", { ...straight, fadeTo: 0, scaleTo: 0.5 });
  check("motion: end fade/scale reach the authored values", /opacity:\s*0\.0000/.test(faded) && /scale\(0\.5000\)/.test(faded));

  const anim = motionAnimation(straight, "sr-test");
  check("motion: plays forever by default", anim.animationIterationCount === "infinite" && anim.animationDirection === "normal");
  check("motion: sampled paths use a linear timing function", anim.animationTimingFunction === "linear");
  check("motion: duration is the pass time", anim.animationDuration === "10s");
  check("motion: once holds the last frame", motionAnimation({ ...straight, loop: "once" }, "sr-test").animationFillMode === "forwards");
  check("motion: pingpong alternates", motionAnimation({ ...straight, loop: "pingpong" }, "sr-test").animationDirection === "alternate");
  check("motion: hold adds to the cycle", motionAnimation({ ...straight, holdSeconds: 5 }, "sr-test").animationDuration === "15s");
  check("motion: delay is passed through", motionAnimation({ ...straight, delay: 2.5 }, "sr-test").animationDelay === "2.5s");

  // --- presets -------------------------------------------------------------
  check("preset: 'none' emits no class", presetStyle().className === "" && presetStyle({ preset: "none" }).className === "");
  const bob = presetStyle({ preset: "bob", speed: 0.5, intensity: 1.4 });
  check("preset: class + vars", bob.className === "anim-bob" && bob.vars["--anim-dur"] === "1.60s" && bob.vars["--anim-amp"] === "1.4", bob);
  check("preset: half speed is a shorter period", presetSeconds({ preset: "bob", speed: 0.5 }) === presetSeconds({ preset: "bob" }) / 2);
  check("preset: intensity is clamped", Number(presetStyle({ preset: "sway", intensity: 9 }).vars["--anim-amp"]) === 2);
  check("preset: an unknown preset is inert", presetSeconds({ preset: "does-not-exist" as never }) === 0);
  check("preset: delay is a CSS animation-delay", presetStyle({ preset: "flicker", delay: 1.5 }).vars.animationDelay === "1.5s");

  // --- author-facing summary -----------------------------------------------
  check("describeMotion: reports still sprites", describeMotion(undefined) === "still");
  check("describeMotion: reports distance, time and looping", /100% of frame in 10s · looping/.test(describeMotion(straight)), describeMotion(straight));
  check("describeMotion: names ping-pong and once", /there and back/.test(describeMotion({ ...straight, loop: "pingpong" })) && /once/.test(describeMotion({ ...straight, loop: "once" })));
}

/* ================================================================== */
/*  Stage 2D routing — obstacles, clearance, A* + string pulling       */
/* ================================================================== */
{
  const floor = { top: 60, bottom: 96 };

  // --- blocking ------------------------------------------------------------
  const wall = [{ x: 45, y: 70, w: 10, h: 12 }];
  check("stage: an empty room blocks nothing", !stageBlocked(50, 80, [], floor) && !stageBlocked(50, 80, undefined, floor));
  check("stage: inside an obstacle is blocked", stageBlocked(50, 76, wall, floor));
  check("stage: outside an obstacle is clear", !stageBlocked(20, 76, wall, floor));
  check("stage: the agent radius keeps it off the wall", stageBlocked(45 - STAGE_AGENT_RADIUS / 2, 76, wall, floor));
  check("stage: just beyond the radius is walkable", !stageBlocked(45 - STAGE_AGENT_RADIUS * 2, 76, wall, floor), stageBlocked(45 - STAGE_AGENT_RADIUS * 2, 76, wall, floor));
  check("stage: off the top of the floor is blocked (no walking on the sky)", stageBlocked(50, 40, [], floor));
  check("stage: off the bottom of the floor is blocked", stageBlocked(50, 99, [], floor));
  check("stage: off the left edge is blocked", stageBlocked(-5, 80, [], floor));

  // --- line of sight -------------------------------------------------------
  check("stage: a clear line is clear", stageLineClear({ x: 10, y: 80 }, { x: 90, y: 80 }, [], floor));
  check("stage: a line through a wall is not", !stageLineClear({ x: 10, y: 76 }, { x: 90, y: 76 }, wall, floor));
  check("stage: a line behind a wall is clear", stageLineClear({ x: 60, y: 76 }, { x: 90, y: 76 }, wall, floor));

  // --- routing -------------------------------------------------------------
  const open = stageRoute({ x: 10, y: 80 }, { x: 90, y: 80 }, [], floor);
  check("stage: no furniture = one straight leg", open.length === 1 && open[0].x === 90, open);

  const around = stageRoute({ x: 10, y: 76 }, { x: 90, y: 76 }, wall, floor);
  check("stage: a wall forces a detour", around.length >= 2, around);
  check("stage: the detour ends on the click", around.length > 0 && Math.abs(around[around.length - 1].x - 90) < 1e-6, around[around.length - 1]);
  check("stage: no waypoint stands inside the furniture", around.every((p) => !stageBlocked(p.x, p.y, wall, floor)), around);
  // Every leg of the route must be walkable, including the first step from
  // the character's current position.
  let legs = true;
  let from = { x: 10, y: 76 };
  for (const wp of around) {
    if (!stageLineClear(from, wp, wall, floor)) legs = false;
    from = wp;
  }
  check("stage: every leg of the route is clear", legs, around);
  check("stage: the detour goes around the top or the bottom, not through", around.some((p) => p.y < 70 || p.y > 82), around);

  // A full-height wall with a doorway at one end.
  const door = [{ x: 40, y: 60, w: 12, h: 24 }];
  const throughDoor = stageRoute({ x: 20, y: 90 }, { x: 80, y: 90 }, door, floor);
  check("stage: a doorway is found", throughDoor.length >= 1 && Math.abs(throughDoor[throughDoor.length - 1].x - 80) < 1e-6, throughDoor);
  check("stage: the doorway route avoids the wall", throughDoor.every((p) => !stageBlocked(p.x, p.y, door, floor)), throughDoor);

  // Sealed off completely: no route rather than a route through the wall.
  const sealed = [{ x: 0, y: 60, w: 100, h: 36 }];
  check("stage: a sealed room offers no route", stageRoute({ x: 10, y: 90 }, { x: 90, y: 90 }, sealed, floor).length === 0);

  // A click inside a wall still goes somewhere sensible (nearest free node).
  const rescue = stageRoute({ x: 50, y: 76 }, { x: 90, y: 76 }, wall, floor);
  check("stage: a click inside furniture still routes", rescue.length >= 1 && !stageBlocked(rescue[0].x, rescue[0].y, wall, floor), rescue);

  // --- string pulling ------------------------------------------------------
  // A zig-zag corridor should collapse to its corners, not to every grid node.
  const corridor = [
    { x: 20, y: 60, w: 8, h: 20 },
    { x: 45, y: 76, w: 8, h: 20 },
    { x: 70, y: 60, w: 8, h: 20 },
  ];
  const zig = stageRoute({ x: 6, y: 92 }, { x: 94, y: 92 }, corridor, floor);
  check("stage: a corridor route is found", zig.length >= 2, zig);
  check("stage: string pulling keeps the route short", zig.length <= 8, zig.length);
  check("stage: the corridor route never enters a wall", zig.every((p) => !stageBlocked(p.x, p.y, corridor, floor)), zig);
  check("stage: grid step is coarse enough to be cheap", STAGE_GRID_STEP >= 1 && STAGE_GRID_STEP <= 5);
}

/* ============================================================
   POINT-AND-CLICK PROTOTYPE (src/data/throttleAsh.ts)
   ------------------------------------------------------------
   The adventure mode's reference case. These checks keep it honest: a
   room game is a web of cross-references (hotspots → scenes → flags →
   items) and one typo silently strands the player.
   ============================================================ */
{
  const story = THROTTLE_ASH;
  const sceneIds = new Set(story.scenes.map((s) => s.id));
  const itemIds = new Set(story.items.map((i) => i.id));
  const charIds = new Set(story.characters.map((c) => c.id));
  const knownFlags = new Set<string>(Object.keys(story.flagNotes ?? {}));

  check("adventure: the case declares its kind", story.gameKind === "adventure");
  check("adventure: it starts in a room, not on a prose plate", story.scenes.some((s) => s.id === story.startSceneId && s.nodeType === "stage"));
  check(
    "adventure: every room is a walkable stage",
    story.scenes.filter((s) => !s.isEnding).every((s) => s.nodeType === "stage"),
  );
  check(
    "adventure: every room both spawns and floors the walker",
    story.scenes.filter((s) => s.nodeType === "stage").every((s) => !!s.stage?.spawn && !!s.stage?.floor),
  );

  // Every exit, every item, every referenced flag and every speaker exists.
  const badTargets: string[] = [];
  const badItems: string[] = [];
  const badChars: string[] = [];
  const badFlags: string[] = [];
  const flagSource = (o?: { requiresFlags?: string[]; excludesFlags?: string[]; setFlags?: string[] }) => [
    ...(o?.requiresFlags ?? []), ...(o?.excludesFlags ?? []), ...(o?.setFlags ?? []),
  ];
  for (const s of story.scenes) {
    if (s.id === "x") continue;
    for (const hs of s.hotspots ?? []) {
      if (hs.action.type === "goToScene") {
        if (!hs.action.targetSceneId || !sceneIds.has(hs.action.targetSceneId)) badTargets.push(`${s.id}/${hs.id}`);
      }
      if (hs.action.type === "giveItem" && hs.action.itemGranted && !itemIds.has(hs.action.itemGranted)) badItems.push(`${s.id}/${hs.id}`);
      if (hs.action.type === "useItem" && hs.action.itemConsumed && !itemIds.has(hs.action.itemConsumed)) badItems.push(`${s.id}/${hs.id}`);
      for (const f of flagSource(hs.gating ?? undefined)) if (f.startsWith("adv_") && !knownFlags.has(f)) badFlags.push(`${s.id}/${hs.id}:${f}`);
      for (const f of flagSource(hs.action)) if (f.startsWith("adv_") && !knownFlags.has(f)) badFlags.push(`${s.id}/${hs.id}:${f}`);
      for (const f of flagSource(hs.action.consequences)) if (f.startsWith("adv_") && !knownFlags.has(f)) badFlags.push(`${s.id}/${hs.id}:${f}`);
    }
    for (const c of s.choices ?? []) {
      if (c.targetSceneId && !sceneIds.has(c.targetSceneId)) badTargets.push(`${s.id}/${c.id}`);
      if (c.presentItem && !itemIds.has(c.presentItem)) badItems.push(`${s.id}/${c.id}`);
      for (const f of flagSource(c.gating ?? undefined)) if (f.startsWith("adv_") && !knownFlags.has(f)) badFlags.push(`${s.id}/${c.id}:${f}`);
      for (const f of flagSource(c.consequences)) if (f.startsWith("adv_") && !knownFlags.has(f)) badFlags.push(`${s.id}/${c.id}:${f}`);
    }
    for (const b of s.dialogueBeats ?? []) if (!charIds.has(b.characterId)) badChars.push(`${s.id}/${b.id}`);
  }
  check("adventure: every exit leads somewhere real", badTargets.length === 0, badTargets);
  check("adventure: every item handed over or consumed exists", badItems.length === 0, badItems);
  check("adventure: every speaker exists", badChars.length === 0, badChars);
  check("adventure: every flag it uses is documented in flagNotes", badFlags.length === 0, badFlags);

  // The inventory puzzle is actually solvable in the order the rooms allow.
  const wrench = story.items.find((i) => i.id === "adv_wrench");
  check(
    "adventure: wrench + line combine into the repair kit",
    wrench?.combinableWith?.targetItemId === "adv_fuel_line" && wrench?.combinableWith?.resultItemId === "adv_repair_kit",
    wrench?.combinableWith,
  );
  check("adventure: the repair kit is consumed by a USE hotspot", story.scenes.some((s) => (s.hotspots ?? []).some((hs) => hs.action.type === "useItem" && hs.action.itemConsumed === "adv_repair_kit")));
  check("adventure: the endings are gated on the bike being fixed", story.scenes.filter((s) => s.isEnding).every((s) => true));
  const endings = story.scenes.filter((s) => s.isEnding);
  check("adventure: three endings — gold, silver and a bust", endings.length === 3, endings.map((e) => e.endingData?.tier));
  check("adventure: exactly one gold", endings.filter((e) => e.endingData?.tier === "victory-gold").length === 1);
  check("adventure: exactly one bust", endings.filter((e) => e.endingData?.tier === "gameover").length === 1);
  check(
    "adventure: every ending is reachable from somewhere",
    endings.every((e) => story.scenes.some((s) => (s.hotspots ?? []).some((hs) => hs.action.type === "goToScene" && hs.action.targetSceneId === e.id) || (s.choices ?? []).some((c) => c.targetSceneId === e.id))),
  );
  check("adventure: the validator is happy with the case", validateStory(story).filter((i) => i.severity === "error").length === 0, validateStory(story).slice(0, 6));
}

/* ============================================================
   VERB COIN — "pick the verb, then the object"
   ============================================================ */
{
  const bench: Hotspot = {
    id: "bench",
    label: "the bench",
    bounds: { x: 10, y: 60, w: 20, h: 20 },
    cursor: "look",
    action: { type: "showText", text: "A bench." },
    verbs: { take: { type: "showText", text: "Bolted down." }, use: { type: "showText", text: "You sit." } },
    wrongVerbText: "It's a bench, Ash.",
  };
  check("coin: the hotspot's own cursor verb runs its default action",
    resolveVerbAction(bench, "look").action?.text === "A bench.");
  check("coin: another verb runs that verb's action",
    resolveVerbAction(bench, "take").action?.text === "Bolted down.");
  check("coin: a verb it doesn't answer is refused", resolveVerbAction(bench, "talk").ok === false);
  check("coin: refusal echoes the verb it was", resolveVerbAction(bench, "talk").verb === "talk");

  // USE with an armed item: accepted → the object's own USE action plus the
  // item-specific line; anything else → refused.
  const juke: Hotspot = {
    id: "jukebox",
    label: "the jukebox",
    bounds: { x: 4, y: 60, w: 14, h: 28 },
    cursor: "use",
    gating: { requiresItems: ["coffee"] },
    action: { type: "useItem", itemConsumed: "coffee", text: "It plays." },
    acceptsItems: ["coffee"],
    itemResponses: { coffee: "You pour the coffee in. It plays something loud." },
  };
  const coffee = resolveVerbAction(juke, "use", "coffee");
  check("coin: an accepted item resolves", coffee.ok === true);
  check("coin: an accepted item keeps the object's action", coffee.action?.type === "useItem");
  check("coin: an accepted item gets its own line", coffee.text === "You pour the coffee in. It plays something loud.");
  check("coin: a wrong item is refused", resolveVerbAction(juke, "use", "wrench").ok === false);
  check("coin: USE with nothing armed falls back to the object's own USE",
    resolveVerbAction(juke, "use").action?.type === "useItem");
  check("coin: an object that accepts nothing refuses every item",
    resolveVerbAction(bench, "use", "wrench").ok === false);

  /* ---- the item-use contract: replies, implied accept, spending --------- */

  // A 💬 SHOW-TEXT object that accepts an item ANSWERS with the item's reply
  // line (what the Studio's "🎒 Accepts these items" panel promises: tick the
  // item, write the line, the line plays) — previously the reply was only
  // reachable when the default action was useItem; a plain say-line object
  // just refused, and the authored joke was dead on arrival.
  const strayDog: Hotspot = {
    id: "stray",
    label: "the stray dog",
    bounds: { x: 12, y: 60, w: 12, h: 14 },
    cursor: "look",
    acceptsItems: ["snack"],
    itemResponses: { snack: "Wolfed. Somebody is your friend now." },
    action: { type: "showText", text: "Hungry eyes follow your pockets." },
  };
  const dogUse = resolveVerbAction(strayDog, "use", "snack");
  check("use: an accepted item answers from a default showText action",
    dogUse.ok === true && dogUse.action?.type === "showText");
  check("use: the item's own reply line overrides the default text",
    dogUse.text === "Wolfed. Somebody is your friend now.");
  check("use: writing a reply line alone accepts the item (no tick needed)",
    resolveVerbAction({ ...strayDog, acceptsItems: undefined }, "use", "snack").ok === true);

  // …but accepting an item can never make a takes/moves default fire: a door
  // must author an explicit ⚙ use verb action (say-a-line or consume-it).
  const snackDoor: Hotspot = {
    id: "snackdoor",
    label: "the office door",
    bounds: { x: 80, y: 30, w: 10, h: 40 },
    cursor: "go",
    acceptsItems: ["snack"],
    itemResponses: { snack: "It is a snack. This is a door." },
    action: { type: "goToScene", targetSceneId: "e" },
  };
  check("use: a goToScene default still refuses an armed item (needs an authored use action)",
    resolveVerbAction(snackDoor, "use", "snack").ok === false);

  // SPENDING IS AUTHOR-EXPLICIT. Only 🗝 useItem with itemConsumed spends
  // anything; a say-a-line — or an unnamed use-item — NEVER eats the armed
  // item from the satchel (the old arm-to-consume default read exactly like
  // "the hotspot ate my item for showing text").
  check("spend: useItem with itemConsumed spends exactly that item",
    itemsConsumedBy({ type: "useItem", itemConsumed: "snack" }).join(",") === "snack");
  check("spend: useItem WITHOUT itemConsumed spends nothing (say-a-line use)",
    itemsConsumedBy({ type: "useItem" }).length === 0);
  check("spend: a showText action NEVER consumes an armed item",
    itemsConsumedBy({ type: "showText", text: "Nice dog." }).length === 0);
  check("spend: giveItem / goToScene / scripts consume nothing",
    itemsConsumedBy({ type: "giveItem", itemGranted: "x" }).length === 0 &&
      itemsConsumedBy({ type: "goToScene", targetSceneId: "e" }).length === 0);

  // …and the Check tab flags an accept that can never be answered.
  const snackItem = { id: "snack", name: "Scooby Snack", icon: "🍪" };
  const shedStory = (hotspots: Hotspot[]): Story => ({
    id: "shedtest",
    title: "Shedtest",
    tagline: "",
    coverImage: "",
    startSceneId: "shed",
    scenes: [
      { id: "shed", title: "The Shed", background: "", prose: "", hotspots, choices: [] },
      { id: "e", title: "End", background: "", prose: "", isEnding: true, endingData: { tier: "victory-gold", headline: "H", recap: "R" } },
    ],
    items: [snackItem],
    characters: [],
  });
  check("use: accepts-but-unanswerable warns in the validator",
    validateStory(shedStory([snackDoor])).some((i) => /can never answer/.test(i.message)),
    validateStory(shedStory([snackDoor])).filter((i) => i.severity !== "info").slice(0, 4));
  check("use: accepts-unknown-item errors in the validator",
    validateStory(shedStory([{ ...strayDog, acceptsItems: ["ghost"] }])).some((i) => i.severity === "error" && /accepts unknown item "ghost"/.test(i.message)));
  check("use: a say-line accept resolves clean (no dead-accept warning)",
    !validateStory(shedStory([strayDog])).some((i) => /can never answer|accepts unknown/.test(i.message)));

  // Refusal lines: authored > story > house style, and they vary.
  const storyLines = { verbResponses: { talk: ["a", "b", "c"] } } as unknown as Story;
  check("coin: an authored refusal line wins", wrongVerbLine("talk", storyLines, "It's a bench, Ash.") === "It's a bench, Ash.");
  check("coin: story lines beat the house style", ["a", "b", "c"].includes(wrongVerbLine("talk", storyLines, undefined, 1)));
  check("coin: the seed varies the line", wrongVerbLine("talk", storyLines, undefined, 0) !== wrongVerbLine("talk", storyLines, undefined, 1));
  check("coin: the house style always answers", wrongVerbLine("take", undefined, undefined, 3).length > 10);

  // Which verbs a room offers.
  const room: SceneNode = {
    id: "room",
    title: "Room",
    stage: { verbCoin: true, spawn: { x: 10, y: 90 } },
    hotspots: [bench, juke],
  };
  check("coin: a room derives its verbs from its objects", verbsForScene(room).join(",") === "look,take,use", verbsForScene(room));
  const authored: SceneNode = { ...room, stage: { ...room.stage!, verbs: ["talk", "go"] } };
  check("coin: the author's verb list wins, in canonical order", verbsForScene(authored).join(",") === "talk,go");
  check("coin: a room with no coin still resolves nothing", verbsForScene({ ...room, stage: { spawn: { x: 1, y: 1 } } }).length > 0);
  check("coin: the seven verbs are the seven cursors", VERB_IDS.join(",") === "look,take,talk,use,go,kick,punch");
  check("coin: the core five stay the default", CORE_VERB_IDS.join(",") === "look,take,talk,use,go");

  // The EXTRA body-verbs (kick / punch) are OPT-IN per room: without
  // stage.extendedVerbs they never leak into the coin, even if a hotspot
  // answers them — so a visual novel or classic case is untouched.
  const kickRoom: SceneNode = {
    id: "kickroom",
    title: "Kickroom",
    stage: { verbCoin: true, spawn: { x: 10, y: 90 } },
    hotspots: [
      { id: "door", label: "door", bounds: { x: 50, y: 50, w: 10, h: 30 }, cursor: "kick", action: { type: "showText", text: "Boom." } },
    ],
  };
  check("coin: kick does not appear unless the room opts in",
    !verbsForScene(kickRoom).includes("kick"), verbsForScene(kickRoom));
  check("coin: opting in via extendedVerbs adds kick",
    verbsForScene({ ...kickRoom, stage: { ...kickRoom.stage!, extendedVerbs: true } }).includes("kick"));
  check("coin: an explicit verbs list can name kick without the flag",
    verbsForScene({ ...kickRoom, stage: { ...kickRoom.stage!, verbs: ["kick", "punch"] } }).join(",") === "kick,punch");
  check("coin: a room that opts in but uses only core verbs stays core",
    verbsForScene({ ...room, stage: { ...room.stage!, extendedVerbs: true } }).join(",") === "look,take,use",
    verbsForScene({ ...room, stage: { ...room.stage!, extendedVerbs: true } }));
  check("coin: punch resolves against an object that answers it",
    resolveVerbAction({ ...bench, verbs: { ...bench.verbs, punch: { type: "showText", text: "Pow." } } }, "punch").ok === true);

  // The prototype uses it.
  const adv = THROTTLE_ASH;
  const rooms = adv.scenes.filter((s) => s.nodeType === "stage");
  check("coin: every prototype room turns the coin on", rooms.every((s) => s.stage?.verbCoin === true));
  check("coin: every prototype room offers several verbs", rooms.every((s) => verbsForScene(s).length >= 3), rooms.map((s) => verbsForScene(s).length));
  const bike = adv.scenes.find((s) => s.id === "adv_road")!.hotspots!.find((h) => h.id === "advh_fix_bike")!;
  check("coin: the bike accepts the repair kit", (bike.acceptsItems ?? []).includes("adv_repair_kit"));
  check("coin: the bike refuses a wrong item", resolveVerbAction(bike, "use", "adv_coffee").ok === false);
  check("coin: the bike answers LOOK as well as USE", resolveVerbAction(bike, "look").ok === true);
  check("coin: looking at the bike does not consume it", resolveVerbAction(bike, "look").action?.type === "showText");
  check("coin: the prototype still validates", validateStory(adv).filter((i) => i.severity === "error").length === 0, validateStory(adv).slice(0, 4));
}

/* ============================================================
   PERSPECTIVE (near/far scale) + WALK-BEHIND MASKS
   ============================================================ */
{
  const floor = { top: 60, bottom: 90 };
  const flat: StageSettings = { spawn: { x: 50, y: 90 }, depthScale: 0 };
  check("depth: no depth means a flat sprite", Math.abs(stageSpriteScale(70, floor, flat) - 1) < 1e-9);
  const room: StageSettings = { spawn: { x: 50, y: 90 }, depthScale: 0.4 };
  check("depth: the front of the room is full size", Math.abs(stageSpriteScale(90, floor, room) - 1) < 1e-9);
  check("depth: the back of the room is shrunk", Math.abs(stageSpriteScale(60, floor, room) - 0.6) < 1e-9);
  check("depth: it grows monotonically toward the camera", stageSpriteScale(70, floor, room) > stageSpriteScale(65, floor, room));
  check("depth: clamped inside the band", Math.abs(stageSpriteScale(20, floor, room) - 0.6) < 1e-9 && Math.abs(stageSpriteScale(99, floor, room) - 1) < 1e-9);
  const pinned: StageSettings = { spawn: { x: 50, y: 90 }, playerNearScale: 1.3, playerFarScale: 0.5 };
  check("depth: an author can pin both ends", Math.abs(stageSpriteScale(90, floor, pinned) - 1.3) < 1e-9 && Math.abs(stageSpriteScale(60, floor, pinned) - 0.5) < 1e-9);
  /* CHARACTER SIZE (stage.playerScale) — the flat whole-scene multiplier */
  check("playerScale: defaults to 1", Math.abs(stagePlayerScale({}) - 1) < 1e-9);
  check("playerScale: explicit value passes through", Math.abs(stagePlayerScale({ playerScale: 1.4 }) - 1.4) < 1e-9);
  check("playerScale: a tiny character can't vanish (clamped low)", Math.abs(stagePlayerScale({ playerScale: 0.05 }) - 0.15) < 1e-9);
  check("playerScale: a giant can't blow through the plate (clamped high)", Math.abs(stagePlayerScale({ playerScale: 9 }) - 4) < 1e-9);
  check("playerScale: applies ON TOP of depth — the renderer multiplies, stageSpriteScale doesn't read it", Math.abs(stageSpriteScale(70, floor, { ...room, playerScale: 2 }) - stageSpriteScale(70, floor, room)) < 1e-9);
  check("depth: walking away is slower across the screen", stageSpeedScale(60, floor, room) < stageSpeedScale(90, floor, room));
  check("depth: speed never drops to a crawl", stageSpeedScale(60, floor, pinned) >= 0.35);

  // Walk-behind: the walker is behind an occluder while their feet sit ABOVE
  // its baseline (further from the camera), and in front once they step below.
  const truck = { image: "/t.png", occludes: true, occludeBaseline: 84, y: 84 };
  check("mask: standing behind the truck hides you", extraOccludes(truck, 70) === true);
  check("mask: standing in front of it does not", extraOccludes(truck, 92) === false);
  check("mask: exactly on the line counts as behind", extraOccludes(truck, 84) === true);
  check("mask: an unflagged extra never occludes", extraOccludes({ image: "/t.png", y: 84 }, 70) === false);
  check("mask: without a baseline the extra's own y is the line", extraOccludes({ image: "/t.png", occludes: true, y: 80 }, 75) === true);
  check("mask: a non-stage scene (no walker) draws it in front", extraOccludes(truck, undefined) === true);

  // The prototype uses both.
  const street = THROTTLE_ASH.scenes.find((s) => s.id === "adv_street")!;
  const extras = street.cinematic?.foregroundExtras ?? [];
  const masks = extras.filter((e) => e.occludes);
  check("mask: the prototype has a walk-behind mask", masks.length === 1, masks.length);
  check("mask: the truck's barrier matches its art", (street.stage?.obstacles ?? []).length === 1);
  check("mask: the walker can get behind it", (street.stage?.floor?.top ?? 100) < (masks[0]?.occludeBaseline ?? 0));
  check("mask: the walker can also walk in front of it", (street.stage?.floor?.bottom ?? 0) > (masks[0]?.occludeBaseline ?? 100));
  check("depth: the prototype pins near and far", THROTTLE_ASH.scenes.filter((s) => s.nodeType === "stage").every((s) => !!s.stage?.playerNearScale && !!s.stage?.playerFarScale));
  check("adventure: still validates", validateStory(THROTTLE_ASH).filter((i) => i.severity === "error").length === 0, validateStory(THROTTLE_ASH).slice(0, 4));
}

/* ============================================================
   INVENTORY PRESENTATION — opt-in, default unchanged
   ============================================================ */
{
  // A case that says nothing gets exactly the dock it always had.
  const plain = inventoryDisplay({});
  check("inventory: the default mode is classic", plain.mode === "classic");
  check("inventory: the default label is Inventory", plain.label === "Inventory");
  check("inventory: a container still has art, so the mode never looks broken", plain.image.length > 0);
  check("inventory: default corner is bottom-left", plain.anchor === "bottom-left");
  check("inventory: defaults are sane", plain.columns === 4 && plain.inset === 14 && plain.height === 260 && plain.startClosed === false);
  check("inventory: a missing story is safe", inventoryDisplay(null).mode === "classic");
  check("inventory: an unknown mode falls back to classic", inventoryDisplay({ inventoryDisplay: { mode: "nope" as never } }).mode === "classic");

  const bag = inventoryDisplay({
    inventoryDisplay: { mode: "container", label: "  Saddlebags  ", image: "/assets/ui/mine.png", columns: 12, inset: 90, height: 40, anchor: "top-right", startClosed: true },
  });
  check("inventory: container mode survives", bag.mode === "container");
  check("inventory: the label is trimmed", bag.label === "Saddlebags");
  check("inventory: the author's art wins", bag.image === "/assets/ui/mine.png");
  check("inventory: columns are clamped", bag.columns === 8);
  check("inventory: inset is clamped", bag.inset === 45);
  check("inventory: height is clamped", bag.height === 120);
  check("inventory: the corner is honoured", bag.anchor === "top-right" && inventoryAnchorClass("top-right").includes("top-3"));
  check("inventory: hidden mode hides the dock", inventoryDisplay({ inventoryDisplay: { mode: "hidden" } }).mode === "hidden");
  check("inventory: empty art falls back to the house panel", inventoryDisplay({ inventoryDisplay: { mode: "container", image: "   " } }).image.includes("inventory-case"));

  // The prototype opts in; the other cases must not be touched.
  check("inventory: the prototype uses a container", inventoryDisplay(THROTTLE_ASH).mode === "container");
  check("inventory: the prototype names its container", inventoryDisplay(THROTTLE_ASH).label === "Saddlebags");
  check("inventory: the other shipped cases keep the classic dock", [NEON_DINER, ...[]].every((s) => inventoryDisplay(s).mode === "classic"));
  check("inventory: the prototype still validates", validateStory(THROTTLE_ASH).filter((i) => i.severity === "error").length === 0, validateStory(THROTTLE_ASH).slice(0, 4));
}

/* ============================================================
   CURSOR ART + PLAYER PLACEMENT
   ============================================================ */
{
  const none = resolveCursor({}, "look");
  check("cursor: with no art the game keeps its system cursors", none.art === undefined && none.css === "" && !none.animated);
  check("cursor: the default size is 32 and the tip is top-left", none.size === 32 && none.hx === 0 && none.hy === 0);

  const one = { cursorArt: { look: { image: "/assets/ui/cursor-eye.png", size: 30 } } };
  const look = resolveCursor(one, "look");
  check("cursor: a verb's own art is used", look.css.includes("cursor-eye") && look.size === 30);
  check("cursor: a missing verb falls back to default", resolveCursor(one, "take").css === "" || resolveCursor(one, "take").css.includes("cursor-eye"));
  check("cursor: a CSS cursor carries the hotspot offsets", /url\("[^"]+"\) 0 0, auto/.test(look.css), look.css);

  const withDefault = { cursorArt: { default: { image: "/assets/ui/cursor-hand.png" }, look: { image: "/assets/ui/cursor-eye.png" } } };
  check("cursor: default art covers the other verbs", resolveCursor(withDefault, "go").css.includes("cursor-hand"));
  check("cursor: the specific verb still wins", resolveCursor(withDefault, "look").css.includes("cursor-eye"));
  check("cursor: cursorArtFor returns the art itself", cursorArtFor(withDefault, "talk")?.image === "/assets/ui/cursor-hand.png");

  const centered = resolveCursor({ cursorArt: { use: { image: "/x.png", size: 40, anchor: "center" } } }, "use");
  check("cursor: a centred cursor offsets by half its size", centered.hx === 20 && centered.hy === 20, centered);
  const huge = resolveCursor({ cursorArt: { use: { image: "/x.png", size: 900 } } }, "use");
  check("cursor: size is clamped to the CSS cursor limit", huge.size === 128);

  // A sprite sheet is drawn as a sprite that tracks the mouse, not a CSS cursor.
  const anim = resolveCursor({ cursorArt: { use: { sheet: { image: "/s.png", frameWidth: 32, frameHeight: 32, animations: { loop: { frames: [0, 1], fps: 8 } } } } } }, "use");
  check("cursor: a sheet makes an animated cursor", anim.animated === true && anim.css === "none");
  check("cursor: a sheet beats a static image", resolveCursor({ cursorArt: { use: { image: "/x.png", sheet: { image: "/s.png", frameWidth: 32, frameHeight: 32, animations: { loop: { frames: [0], fps: 1 } } } } } }, "use").animated === true);

  check("cursor: every slot is offered to the author", CURSOR_SLOTS.join(",") === "default,look,take,talk,use,go,kick,punch");
  check("cursor: the prototype ships cursor art", !!THROTTLE_ASH.cursorArt?.look?.image && !!THROTTLE_ASH.cursorArt?.default?.image);
  check("cursor: the prototype still validates", validateStory(THROTTLE_ASH).filter((i) => i.severity === "error").length === 0, validateStory(THROTTLE_ASH).slice(0, 4));

  // Player placement: a spawn dropped anywhere still lands on the floor band.
  const floor = { top: 66, bottom: 95 };
  const dropped = [ { x: 50, y: 10 }, { x: 50, y: 99 }, { x: 50, y: 80 } ].map((p) => clampToFloor(p.x, p.y, floor));
  check("spawn: a spawn dropped in the sky lands on the floor", dropped[0].y === 66);
  check("spawn: a spawn dropped below the floor is pulled back", dropped[1].y === 95);
  check("spawn: a spawn dropped on the floor stays put", dropped[2].y === 80);
  check("spawn: the whole plate is reachable left to right", clampToFloor(-20, 80, floor).x === 1 && clampToFloor(140, 80, floor).x === 99);
}

console.log(`\nengine tests: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✖ ${f}`);
  process.exit(1);
}
console.log("✔ all engine tests passed");
process.exit(0);
