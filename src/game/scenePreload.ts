import { applyConsequences, bypassedSceneId, effectiveChoiceGating, meetsGating, recordMemory, recordPresentation, resolveHotspot } from "../logic";
import type { Choice, Consequences, DialogueBeat, GlobalState, HotspotAction, SceneNode, StageScriptStep, Story } from "../types";
import { PRELOAD_LIMITS } from "../mediaPreload";
import { choiceRepeats, visibleBeatQueue } from "./decisions";

export const NEXT_ROOM_LIMIT = 4;
export type SceneMediaPlan = { images: string[]; audio: string[]; sceneIds: string[] };

/** One hop, not the whole story. This runs while prose/dialogue is playing,
 * before choices become interactive. The graph is read without mutating the
 * run, and branch/entry consequences are simulated only to select the right
 * gated opening beat. The runtime's normal loader remains the fallback. */
export function nextSceneMediaPlan({
  story, scene, state, beats = visibleBeatQueue(scene, state), beatIndex = -1,
  usedChoices = new Set<string>(), usedHotspots = new Set<string>(),
  expiredChoices = new Set<string>(), visitedScenes = new Set<string>(),
  seenBeatIds = new Set<string>(),
}: {
  story: Story;
  scene: SceneNode;
  state: GlobalState;
  beats?: DialogueBeat[];
  /** -1 while prose is playing / walking, otherwise the current beat index. */
  beatIndex?: number;
  usedChoices?: ReadonlySet<string>;
  usedHotspots?: ReadonlySet<string>;
  expiredChoices?: ReadonlySet<string>;
  visitedScenes?: ReadonlySet<string>;
  seenBeatIds?: ReadonlySet<string>;
}): SceneMediaPlan {
  const images = new Set<string>();
  const clips = new Set<string>();
  const targets = new Set<string>();
  const image = (value?: string) => {
    if (value && !/^(gradient:|video:|emoji:)/i.test(value) && images.size < PRELOAD_LIMITS.images) images.add(value);
  };
  const voice = (value?: string) => { if (value && clips.size < PRELOAD_LIMITS.audio) clips.add(value); };
  const beat = (line?: DialogueBeat) => { image(line?.background); voice(line?.audioUrl); };
  // Warm the next line's insert and recorded cue as well as the next room.
  beat(beats[beatIndex + 1]);
  const add = (id?: string, branchState = state) => {
    if (!id) return;
    const resolvedId = bypassedSceneId(story, id);
    if (resolvedId === scene.id || targets.has(resolvedId) || targets.size >= NEXT_ROOM_LIMIT) return;
    const next = story.scenes.find((s) => s.id === resolvedId);
    if (!next || next.nodeType === "note") return;
    targets.add(resolvedId);
    image(next.background);
    let entryState = branchState;
    const revisit = visitedScenes.has(resolvedId);
    if (!revisit) {
      for (const action of next.onEnterActions ?? []) {
        if (meetsGating(action.conditionRule, entryState)) entryState = applyConsequences(story, action.consequences, entryState);
      }
      if (next.prose && next.autoNarrate !== false) voice(next.narrationAudioUrl);
    }
    const queue = visibleBeatQueue(next, entryState);
    beat(revisit && next.nodeType !== "stage" ? queue.find((b) => !seenBeatIds.has(b.id)) : queue[0]);
  };
  const withEffects = (effects?: Consequences, base = state) => applyConsequences(story, effects, base);
  const script = (steps?: StageScriptStep[], base = state) => {
    let predicted = base;
    for (const step of steps ?? []) {
      if (step.do === "setFlag") predicted = withEffects({ setFlags: [step.flag] }, predicted);
      if (step.do === "goToScene") { add(step.targetSceneId, predicted); break; }
    }
  };
  const action = (a: HotspotAction, base = state): GlobalState => {
    const predicted = withEffects({
      setFlags: a.flagSet ? [a.flagSet] : undefined,
      addItems: a.itemGranted ? [a.itemGranted] : undefined,
      removeItems: a.itemConsumed ? [a.itemConsumed] : undefined,
      meterChanges: a.meterChange ? [a.meterChange] : undefined,
    }, base);
    add(a.targetSceneId, predicted);
    if (a.type === "runScript") script(a.script, predicted);
    if (a.type === "patternPuzzle") {
      add(a.patternPuzzle?.targetSceneId, withEffects(a.patternPuzzle?.rewardConsequences, predicted));
      add(a.patternPuzzle?.wrongTargetSceneId, withEffects(a.patternPuzzle?.wrongSubmissionConsequences, predicted));
    }
    if (a.type === "arcadeGame") {
      add(a.arcadeGame?.targetSceneId, withEffects(a.arcadeGame?.rewardConsequences, predicted));
      add(a.arcadeGame?.loseTargetSceneId, withEffects(a.arcadeGame?.loseConsequences, predicted));
    }
    let chained = predicted;
    for (const step of a.then ?? []) {
      chained = action(step, chained);
      if (step.type === "goToScene") break;
    }
    return chained;
  };

  if (!scene.isEnding) {
    // Deterministic cuts get first claim on the small budget.
    add(beats[beats.length - 1]?.afterBeatTargetSceneId);
    add(scene.autoAdvanceTargetSceneId);
    if (!scene.stage?.enterScriptFlag || !state.activeFlags.has(scene.stage.enterScriptFlag)) script(scene.stage?.enterScript);
    for (const c of scene.choices ?? []) {
      if (expiredChoices.has(c.id) || (!choiceRepeats(c) && usedChoices.has(`${scene.id}:${c.id}`))) continue;
      if (!meetsGating(effectiveChoiceGating(c), state)) continue;
      if (!c.reply) add(c.targetSceneId, recordPresentation(c, story, recordMemory(c, withEffects(c.consequences))));
      if (hasFailureRoute(c)) add(c.timedOutTargetSceneId, withEffects(c.timedOutConsequences));
    }
    for (const original of scene.hotspots ?? []) {
      const h = resolveHotspot(original, state);
      if (!meetsGating(h.gating, state)) continue;
      if (!h.isRepeatable && h.action.type !== "showText" && usedHotspots.has(`${scene.id}:${h.id}`)) continue;
      action(h.action);
      for (const a of Object.values(h.verbs ?? {})) if (a) action(a);
    }
    for (const edge of Object.values(scene.stage?.exitEdges ?? {})) {
      if (edge && meetsGating(edge.gating, state)) add(edge.targetSceneId, withEffects({ setFlags: edge.flagSet ? [edge.flagSet] : undefined }));
    }
    // Map-only adventure rooms also have a first frame. Local exits take
    // priority; a large travel map never fans out into a catalogue download.
    for (const pin of story.map?.locations ?? []) if (meetsGating(pin.gating, state)) add(pin.targetSceneId);
  }
  return { images: [...images], audio: [...clips], sceneIds: [...targets] };
}

function hasFailureRoute(choice: Choice): boolean {
  return !!(choice.quickTime || choice.ride || choice.triangulate) && !!choice.timedOutTargetSceneId;
}
