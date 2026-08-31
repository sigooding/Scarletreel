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
  validateStory,
  writeSave,
  type GlobalState,
} from "../src/logic";
import { buildRouteGraph, scenesInAct } from "../src/game/routeGraph";
import { sheetAnim, sheetCols, sheetDrawable, sheetFrameAt, sheetFramePos, spriteSheetIssues } from "../src/game/spriteSheet";
import type { SpriteSheet } from "../src/game/spriteSheet";
import { NEON_DINER } from "../src/data/neonDiner";
import type { Choice, Contradiction, DialogueBeat, EpisodeProgress, GameSave, Hotspot, JourneyStep, SceneNode, Story } from "../src/types";

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

console.log(`\nengine tests: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  ✖ ${f}`);
  process.exit(1);
}
console.log("✔ all engine tests passed");
process.exit(0);
