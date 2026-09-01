import { spriteSheetIssues } from "./game/spriteSheet";
import type {
  Choice,
  Consequences,
  Contradiction,
  DialogueBeat,
  EndingLog,
  Episode,
  EpisodeProgress,
  GameSave,
  Gating,
  GlobalState,
  CursorArt,
  CursorKind,
  Hotspot,
  HotspotAction,
  InventorySettings,
  HotspotActionType,
  Interrogation,
  Item,
  MapLocation,
  MeterKey,
  RecapLine,
  SceneNode,
  SeasonLog,
  StageScriptStep,
  StageSettings,
  Story,
  UnlockedEnding,
} from "./types";

export const uid = () => Math.random().toString(36).slice(2, 9);
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const METER_KEYS: MeterKey[] = ["Sultry", "Aggressive", "Clever", "Suspicion"];

/** Player-facing meter names. The internal MeterKey values (used in saved data
 * and story gating) are untouched so existing cases & saves keep working — only
 * the labels players/authors see change. */
export const METER_LABELS: Record<MeterKey, string> = {
  Sultry: "Charm",
  Aggressive: "Intimidate",
  Clever: "Deduce",
  Suspicion: "Heat",
};

/** Short hints used in Studio's compact meter grids. */
export const METER_SHORT: Record<MeterKey, string> = {
  Sultry: "Chm",
  Aggressive: "Int",
  Clever: "Ded",
  Suspicion: "Heat",
};

export function createInitialState(story: Story): GlobalState {
  const trust: Record<string, number> = {};
  story.characters.forEach((c) => (trust[c.id] = c.trustMeter));
  return {
    activeFlags: new Set<string>(),
    inventory: [],
    meters: { Sultry: 0, Aggressive: 0, Clever: 0, Suspicion: 0 },
    characterTrust: trust,
    memories: {},
  };
}

/* ------------------------------- gating ------------------------------- */

export function meetsGating(g: Gating | undefined, s: GlobalState): boolean {
  if (!g) return true;
  const hasItem = (id: string) => s.inventory.some((i) => i.id === id);
  const hasFlag = (f: string) => s.activeFlags.has(f);

  const reqItems = g.requiresItems ?? [];
  const reqFlags = g.requiresFlags ?? [];
  const all = g.requiresAll !== false;
  if (reqItems.length + reqFlags.length > 0) {
    const checks = [...reqItems.map(hasItem), ...reqFlags.map(hasFlag)];
    if (all ? !checks.every(Boolean) : !checks.some(Boolean)) return false;
  }
  if ((g.excludesItems ?? []).some(hasItem)) return false;
  if ((g.excludesFlags ?? []).some(hasFlag)) return false;
  const reqMemories = g.requiresMemories ?? [];
  // A "remembered" key can be a memoryLog tag (the player MADE that choice)
  // or a story flag (the player SAW it happen) — either way the character
  // remembers it, so both satisfy the gate.
  const remembers = (key: string) => s.memories[key] != null || s.activeFlags.has(key);
  if (reqMemories.length && (!all ? !reqMemories.some(remembers) : !reqMemories.every(remembers)))
    return false;
  if (g.minMeters) {
    for (const [k, v] of Object.entries(g.minMeters)) if (s.meters[k as MeterKey] < (v ?? 0)) return false;
  }
  if (g.maxMeters) {
    for (const [k, v] of Object.entries(g.maxMeters)) if (s.meters[k as MeterKey] > (v ?? 99)) return false;
  }
  if (g.minTrust) {
    for (const [id, v] of Object.entries(g.minTrust)) if ((s.characterTrust[id] ?? 0) < v) return false;
  }
  return true;
}

/** Travel-map lens on the live state: which locations are drawn, and which
 *  of those are open. Locked pins stay visible (as "???") unless the author
 *  marked them hiddenWhenLocked. Pure — unlocks are DERIVED from the same
 *  gating vocabulary as choices/hotspots (meetsGating), never stored, so a
 *  loaded save or NG+ run can't disagree with the flags that earned access. */
export function mapLocationsView(
  story: Story,
  s: GlobalState
): { location: MapLocation; unlocked: boolean }[] {
  return (story.map?.locations ?? [])
    .map((location) => ({ location, unlocked: meetsGating(location.gating, s) }))
    .filter(({ unlocked, location }) => unlocked || !location.hiddenWhenLocked);
}

/** True when the story ships a usable travel map and the theme hasn't hidden
 *  it — the single gate for the HUD menu entry, the T hotkey, hotspot
 *  openMap actions and the overlay itself. */
export function mapAvailable(story: Story): boolean {
  return (story.map?.locations?.length ?? 0) > 0 && !story.dialogueBox?.hideMap;
}

/** A choice whose ONLY job is walking somewhere: it navigates, and carries
 *  no consequences, memory, reply behaviour, presented item, timer or group
 *  semantics. Only these are safe for the travel map to absorb — replacing
 *  anything richer would silently delete authored side effects (map travel
 *  applies none). */
export function choiceIsPureTravel(c: Choice): boolean {
  if (!c.targetSceneId || c.reply) return false;
  const cq = c.consequences as Record<string, unknown> | undefined;
  const hasConsequences = !!cq && Object.values(cq).some((v) => v !== undefined && v !== null);
  return (
    !hasConsequences &&
    !c.memoryLog &&
    !c.rememberLine &&
    !c.presentItem &&
    !c.quickTime &&
    !c.timeLimitSeconds &&
    !c.exclusiveGroup &&
    !c.timedOutTargetSceneId &&
    !c.timedOutConsequences
  );
}

/** Which of this scene's choices the travel map replaces right now (an
 *  opt-in via map.replaceTravelChoices): pure-travel choices whose target an
 *  UNLOCKED pin also reaches. The choice rail hides these and shows a single
 *  "Open the map" action instead — one road out, not two buttons for the
 *  same journey. A locked pin never absorbs a choice (the choice may be the
 *  only way in until the pin's gate is earned), and non-pure choices are
 *  never touched. Pure and state-derived, so saves can't disagree. */
export function mapReplacedChoiceIds(story: Story, scene: SceneNode, s: GlobalState): Set<string> {
  const out = new Set<string>();
  if (!story.map?.replaceTravelChoices || !mapAvailable(story)) return out;
  const open = new Set(
    (story.map.locations ?? []).filter((l) => meetsGating(l.gating, s)).map((l) => l.targetSceneId)
  );
  for (const c of scene.choices ?? []) {
    if (choiceIsPureTravel(c) && open.has(c.targetSceneId!)) out.add(c.id);
  }
  return out;
}

/** The scene a heat bust should route to, or null when no bust is due:
 *  Suspicion at/over the briefing's heat limit, a valid bust scene, not
 *  already standing on it, and (in a season) inside the CURRENT episode —
 *  routing to another chapter's ending would close the wrong episode.
 *  Pure, so the engine tests can pin the contract. */
export function heatBustTarget(
  story: Story,
  state: { meters: Record<MeterKey, number> },
  sceneId: string,
  episode?: Episode
): string | null {
  const limit = story.briefing?.heatLimit ?? 0;
  const failScene = story.briefing?.heatFailSceneId;
  if (!limit || !failScene) return null;
  if (state.meters.Suspicion < limit) return null;
  if (failScene === sceneId) return null;
  if (!story.scenes.some((s) => s.id === failScene)) return null;
  if (episode && !(episode.sceneIds ?? []).includes(failScene)) return null;
  return failScene;
}

export function gatingHint(g: Gating | undefined, story: Story): string | null {
  if (!g) return null;
  const bits: string[] = [];
  const itemName = (id: string) => story.items.find((i) => i.id === id)?.name ?? id;
  if (g.requiresItems?.length) bits.push(`needs ${g.requiresItems.map(itemName).join(g.requiresAll === false ? " or " : " & ")}`);
  if (g.requiresFlags?.length) bits.push(`needs: ${g.requiresFlags.join(", ").replace(/_/g, " ")}`);
  if (g.requiresMemories?.length) bits.push(`remembers: ${g.requiresMemories.join(", ").replace(/_/g, " ")}`);
  if (g.minMeters) bits.push(Object.entries(g.minMeters).map(([k, v]) => `${METER_LABELS[k as MeterKey] ?? k} ≥ ${v}`).join(", "));
  if (g.maxMeters) bits.push(Object.entries(g.maxMeters).map(([k, v]) => `${METER_LABELS[k as MeterKey] ?? k} ≤ ${v}`).join(", "));
  if (g.minTrust) bits.push(Object.entries(g.minTrust).map(([id, v]) => `${story.characters.find((c) => c.id === id)?.name ?? id} trust ≥ ${v}`).join(", "));
  return bits.length ? bits.join(" · ") : null;
}

/* ---------------------------- consequences ---------------------------- */

export function applyConsequences(story: Story, c: Consequences | undefined, s: GlobalState): GlobalState {
  if (!c) return s;
  const next: GlobalState = {
    activeFlags: new Set(s.activeFlags),
    inventory: [...s.inventory],
    meters: { ...s.meters },
    characterTrust: { ...s.characterTrust },
    memories: { ...s.memories },
  };
  c.setFlags?.forEach((f) => next.activeFlags.add(f));
  c.clearFlags?.forEach((f) => next.activeFlags.delete(f));
  c.addItems?.forEach((id) => {
    const item = story.items.find((i) => i.id === id);
    if (item && !next.inventory.some((i) => i.id === id)) next.inventory.push(item);
  });
  c.removeItems?.forEach((id) => {
    next.inventory = next.inventory.filter((i) => i.id !== id);
  });
  c.meterChanges?.forEach((m) => {
    next.meters[m.meter] = clamp(next.meters[m.meter] + m.delta, 0, 10);
  });
  c.trustChanges?.forEach((t) => {
    next.characterTrust[t.characterId] = clamp((next.characterTrust[t.characterId] ?? 0) + t.delta, -5, 5);
  });
  return next;
}

export function combineItems(story: Story, a: Item, b: Item): Item | null {
  const recipe =
    (a.combinableWith && a.combinableWith.targetItemId === b.id && a.combinableWith.resultItemId) ||
    (b.combinableWith && b.combinableWith.targetItemId === a.id && b.combinableWith.resultItemId) ||
    null;
  if (!recipe) return null;
  return story.items.find((i) => i.id === recipe) ?? null;
}

/* ---------------------------- persistence ----------------------------- */

const ENDING_KEY = "scarlet-reel-endings-v1";

export function loadEndings(): EndingLog {
  try {
    return JSON.parse(localStorage.getItem(ENDING_KEY) ?? "{}") as EndingLog;
  } catch {
    return {};
  }
}

export function recordEnding(storyId: string, e: UnlockedEnding): EndingLog {
  const log = loadEndings();
  const list = log[storyId] ?? [];
  if (!list.some((x) => x.sceneId === e.sceneId)) list.push(e);
  log[storyId] = list;
  localStorage.setItem(ENDING_KEY, JSON.stringify(log));
  return log;
}

/** Erase a story's unlocked-ending record — used when a story is permanently deleted. */
export function removeStoryEndings(storyId: string): EndingLog {
  const log = loadEndings();
  delete log[storyId];
  try {
    localStorage.setItem(ENDING_KEY, JSON.stringify(log));
  } catch {
    /* ignore */
  }
  removeSeasonProgress(storyId);
  return log;
}

/* ------------------------- episodes / seasons ------------------------- */

const SEASON_KEY = "scarlet-reel-season-progress-v1";

/** Is this story packed into episodes? */
export function isEpisodic(story: Story): boolean {
  return Array.isArray(story.episodes) && story.episodes.length > 0;
}

/** Episodes in running order, with their number filled in. */
export function seasonEpisodes(story: Story): Episode[] {
  // Normalise on the way out. Episode records can arrive from a cached
  // Studio draft, an imported file, or a schema older than the current one,
  // and `sceneIds` is dereferenced unguarded in a dozen places — a single
  // missing array there takes down the whole render with a blank screen.
  return (Array.isArray(story.episodes) ? story.episodes : [])
    .filter((ep): ep is Episode => !!ep && typeof ep.id === "string")
    .map((ep, i) => ({
      ...ep,
      number: ep.number ?? i + 1,
      title: ep.title ?? `Episode ${i + 1}`,
      sceneIds: Array.isArray(ep.sceneIds) ? ep.sceneIds.filter((x) => typeof x === "string") : [],
    }));
}

/** Which episode owns a scene. Falls back to the first episode that lists it,
 * so a scene accidentally claimed twice still resolves deterministically. */
export function episodeOfScene(story: Story, sceneId: string): Episode | undefined {
  return seasonEpisodes(story).find((ep) => ep.sceneIds.includes(sceneId));
}

export function episodeById(story: Story, episodeId: string | undefined): Episode | undefined {
  if (!episodeId) return undefined;
  return seasonEpisodes(story).find((ep) => ep.id === episodeId);
}

/** The episode that follows this one in the season, if any. */
export function nextEpisode(story: Story, episodeId: string): Episode | undefined {
  const eps = seasonEpisodes(story);
  const idx = eps.findIndex((e) => e.id === episodeId);
  return idx >= 0 ? eps[idx + 1] : undefined;
}

/** The episode that follows a given ENDING of this episode: the per-ending
 *  override (`nextEpisodeByEnding`) when the ending scene matches, else the
 *  positional next. Forked seasons route each "next time on…" this way so a
 *  fork's curtain teases its own continuation chapter. */
export function nextEpisodeForEnding(story: Story, episodeId: string, endingSceneId: string): Episode | undefined {
  const eps = seasonEpisodes(story);
  const ep = eps.find((e) => e.id === episodeId);
  const overrideId = ep?.nextEpisodeByEnding?.[endingSceneId];
  if (overrideId) return eps.find((e) => e.id === overrideId);
  return nextEpisode(story, episodeId);
}

/** Scenes that no episode claims. Surfaced by the validator (and the Studio
 * episode editor) so an author can't strand part of the graph. */
export function unassignedScenes(story: Story): SceneNode[] {
  if (!isEpisodic(story)) return [];
  const claimed = new Set(seasonEpisodes(story).flatMap((ep) => ep.sceneIds));
  // Note placeholders are author markers, not content — never list them as
  // scenes waiting for an episode.
  return story.scenes.filter((s) => s.nodeType !== "note" && !claimed.has(s.id));
}

export function loadSeasonProgress(): SeasonLog {
  try {
    return JSON.parse(localStorage.getItem(SEASON_KEY) ?? "{}") as SeasonLog;
  } catch {
    return {};
  }
}

export function storySeasonProgress(storyId: string): Record<string, EpisodeProgress> {
  return loadSeasonProgress()[storyId] ?? {};
}

/** Record an episode as cleared, snapshotting the world state so the NEXT
 * episode can open with the consequences of this one already applied. */
export function recordEpisodeProgress(storyId: string, progress: EpisodeProgress): SeasonLog {
  const log = loadSeasonProgress();
  const forStory = { ...(log[storyId] ?? {}) };
  const previous = forStory[progress.episodeId];
  // Keep the first clear time so "completed" dates don't churn on replays, but
  // always take the newest carry-over — the latest run is the canon one.
  forStory[progress.episodeId] = { ...progress, completedAt: previous?.completedAt ?? progress.completedAt };
  log[storyId] = forStory;
  try {
    localStorage.setItem(SEASON_KEY, JSON.stringify(log));
  } catch {
    /* ignore — the episode still finished, it just won't persist */
  }
  return log;
}

export function removeSeasonProgress(storyId: string): SeasonLog {
  const log = loadSeasonProgress();
  delete log[storyId];
  try {
    localStorage.setItem(SEASON_KEY, JSON.stringify(log));
  } catch {
    /* ignore */
  }
  return log;
}

/**
 * An episode is playable when it's the first one, explicitly unlocked, already
 * cleared (replayable), or the episode before it has been cleared.
 */
export function isEpisodeUnlocked(story: Story, episodeId: string, progress = storySeasonProgress(story.id)): boolean {
  const eps = seasonEpisodes(story);
  const idx = eps.findIndex((e) => e.id === episodeId);
  if (idx <= 0) return true;
  if (eps[idx].unlockedByDefault) return true;
  if (progress[episodeId]) return true;
  // Forked seasons: unlock is conditional on WHICH ending the route took,
  // not on position. Any listed predecessor episode counts; when it names
  // endings, the clear must be one of them.
  const after = eps[idx].unlockAfter;
  if (after) {
    return after.some((a) => {
      const prior = progress[a.episodeId];
      return !!prior && (!a.endingSceneIds || a.endingSceneIds.includes(prior.endingSceneId));
    });
  }
  return !!progress[eps[idx - 1].id];
}

/** The episode the player should drop into next: the first uncleared unlocked
 * one, else the last episode of the season. */
export function currentEpisode(story: Story, progress = storySeasonProgress(story.id)): Episode | undefined {
  const eps = seasonEpisodes(story);
  if (!eps.length) return undefined;
  return eps.find((ep) => !progress[ep.id] && isEpisodeUnlocked(story, ep.id, progress)) ?? eps[eps.length - 1];
}

/**
 * The world state an episode starts from: the carry-over snapshot from the
 * previous cleared episode, rebuilt against this story. Episode one (or a
 * missing snapshot) simply starts clean.
 */
export function carryOverState(story: Story, episodeId: string): GlobalState {
  const fresh = createInitialState(story);
  const eps = seasonEpisodes(story);
  const idx = eps.findIndex((e) => e.id === episodeId);
  if (idx <= 0) return fresh;
  const progress = storySeasonProgress(story.id);
  // Walk backwards to the most recent cleared episode so a skipped (unlocked)
  // chapter still inherits from whatever the player actually finished.
  for (let i = idx - 1; i >= 0; i--) {
    const carry = progress[eps[i].id]?.carry;
    if (!carry) continue;
    return {
      activeFlags: new Set(carry.activeFlags ?? []),
      inventory: (carry.inventory ?? [])
        .map((id) => story.items.find((item) => item.id === id))
        .filter((item): item is Item => !!item),
      meters: { ...fresh.meters, ...(carry.meters ?? {}) },
      characterTrust: { ...fresh.characterTrust, ...(carry.characterTrust ?? {}) },
      memories: { ...(carry.memories ?? {}) },
    };
  }
  return fresh;
}

/** The recap lines that apply to a given state — a "Previously on…" built from
 * what THIS player actually did, not a fixed trailer. */
export function resolveRecap(episode: Episode, state: GlobalState): RecapLine[] {
  return (episode.recapLines ?? []).filter((line) => meetsGating(line.gating, state));
}

/* ----------------------------- save slots ----------------------------- */

export const SAVE_SLOTS = 3;

/** The invisible checkpoint slot. The game writes a snapshot here on every
 * scene arrival, so "▶ Resume" and the Load screen always have something
 * current to return to even if the player never touched a manual slot. It
 * shares the slot key scheme (slot 0) but never appears in the Save menu. */
export const AUTO_SLOT = 0;

/** Save slots are scoped per-episode so every chapter keeps its own three
 * slots (one set per chapter), while non-episodic stories keep their original,
 * un-suffixed keys so existing saves keep loading. */
const saveKey = (storyId: string, slot: number, episodeId?: string) =>
  episodeId
    ? `scarlet-reel-save-${storyId}-ep-${episodeId}-slot-${slot}`
    : `scarlet-reel-save-${storyId}-slot-${slot}`;

/** Current save-slot schema version. Bump this when a GameSave shape
 *  change is NOT purely additive, and handle the upgrade in migrateSave.
 *  Saves written before versioning existed carry no stamp and are v1. */
export const SAVE_SCHEMA = 1;

/** Upgrade an older save to the current shape, or null to refuse it.
 *  Unknown NEWER versions (a future build's save opened by this build) are
 *  refused rather than mis-loaded. A missing stamp is the only "older"
 *  case and is already v1, so there is no conversion to do yet — but the
 *  result is always re-stamped, so callers only ever see versioned saves.
 *  Future upgrades slot in between the version check and the stamp. */
function migrateSave(save: GameSave): GameSave | null {
  const v = save.schema ?? 1;
  if (v > SAVE_SCHEMA) return null;
  return { ...save, schema: SAVE_SCHEMA };
}

/** Persist a playthrough snapshot into a slot (1-based). Stamps the current
 *  schema so readSave can migrate or refuse it on load. */
export function writeSave(slot: number, save: GameSave): boolean {
  try {
    localStorage.setItem(saveKey(save.storyId, slot, save.episodeId), JSON.stringify({ ...save, schema: SAVE_SCHEMA }));
    return true;
  } catch {
    return false;
  }
}

/** Read a single slot, or null when empty / corrupted / from another story
 *  / from a save schema this build doesn't understand. */
export function readSave(storyId: string, slot: number, episodeId?: string): GameSave | null {
  try {
    const raw = localStorage.getItem(saveKey(storyId, slot, episodeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameSave;
    if (!parsed || parsed.storyId !== storyId || !parsed.sceneId) return null;
    return migrateSave(parsed);
  } catch {
    return null;
  }
}

/** All slots for a story (or one episode of it); empty slots are null. */
export function readSaves(storyId: string, episodeId?: string): (GameSave | null)[] {
  return Array.from({ length: SAVE_SLOTS }, (_, i) => readSave(storyId, i + 1, episodeId));
}

/** Delete a single save slot. */
export function clearSave(storyId: string, slot: number, episodeId?: string): void {
  try {
    localStorage.removeItem(saveKey(storyId, slot, episodeId));
  } catch {
    /* ignore */
  }
}

/** The most recent save across every episode of a story — powers the
 * newsstand's "▶ Resume" button, which must find your latest chapter. */
export function latestSave(story: Story): { save: GameSave; slot: number; episodeId?: string } | null {
  const episodeIds: (string | undefined)[] = Array.isArray(story.episodes) && story.episodes.length
    ? story.episodes.map((e) => e?.id).filter((id): id is string => typeof id === "string")
    : [undefined];
  let best: { save: GameSave; slot: number; episodeId?: string } | null = null;
  episodeIds.forEach((episodeId) => {
    // Include the auto checkpoint (slot 0) alongside the manual slots.
    for (let slot = AUTO_SLOT; slot <= SAVE_SLOTS; slot++) {
      const save = readSave(story.id, slot, episodeId);
      if (save && (!best || save.savedAt > best!.save.savedAt)) best = { save, slot, episodeId };
    }
  });
  return best;
}

/* --------------------------- share encoding --------------------------- */

export function encodeStory(story: Story): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(story))));
}

export function decodeStory(b64: string): Story | null {
  try {
    const story = JSON.parse(decodeURIComponent(escape(atob(b64)))) as Story;
    if (!story.id || !story.scenes || !story.startSceneId) return null;
    return story;
  } catch {
    return null;
  }
}

/* ---------------------------- story graph ----------------------------- */

export interface StoryEdge {
  id: string;
  source: string;
  target: string;
  kind: "choice" | "hotspot" | "auto";
  ref: Choice | Hotspot | SceneNode;
  label: string;
  attitude: string;
}

export function storyEdges(story: Story): StoryEdge[] {
  const edges: StoryEdge[] = [];
  story.scenes.forEach((sc) => {
    if (sc.autoAdvanceTargetSceneId)
      edges.push({
        id: `e-${sc.id}-auto`,
        source: sc.id,
        target: sc.autoAdvanceTargetSceneId,
        kind: "auto",
        ref: sc,
        label: `⏱ auto ${sc.autoAdvanceDelaySeconds ?? 0}s`,
        attitude: "Neutral",
      });
    // An after-beat route is a real scene edge too: an insert-shot beat that
    // ends the scene and cuts straight to another scene. Track it so the
    // validator sees the target as reachable and the canvas can draw it.
    sc.dialogueBeats?.forEach((b) => {
      if (b.afterBeatTargetSceneId)
        edges.push({
          id: `e-${sc.id}-b-${b.id}`,
          source: sc.id,
          target: b.afterBeatTargetSceneId,
          kind: "auto",
          ref: sc,
          label: `🎬 after beat${b.afterBeatMode === "continue" ? " (▸)" : " (auto)"}`,
          attitude: "Neutral",
        });
    });
    sc.choices?.forEach((ch) => {
      if (ch.targetSceneId)
        edges.push({
          id: `e-${sc.id}-c-${ch.id}`,
          source: sc.id,
          target: ch.targetSceneId,
          kind: "choice",
          ref: ch,
          label: ch.text.slice(0, 26),
          attitude: ch.attitudeTag ?? "Neutral",
        });
      // A quick-time prompt's timed-out route is a real, separate edge — the
      // "you hesitated" path. Track it so the validator sees it as reachable
      // and the Studio canvas shows the consequence branch.
      if (ch.timedOutTargetSceneId)
        edges.push({
          id: `e-${sc.id}-c-${ch.id}-timeout`,
          source: sc.id,
          target: ch.timedOutTargetSceneId,
          kind: "choice",
          ref: ch,
          label: `${ch.text.slice(0, 22)} (timed out)`,
          attitude: "Neutral",
        });
    });
    sc.hotspots?.forEach((hs) => {
      if (hs.action.targetSceneId)
        edges.push({
          id: `e-${sc.id}-h-${hs.id}`,
          source: sc.id,
          target: hs.action.targetSceneId,
          kind: "hotspot",
          ref: hs,
          label: `⌖ ${hs.label.slice(0, 22)}`,
          attitude: "Hotspot",
        });
      // A pattern puzzle is a real branch: solving it (and, when retry is off,
      // failing it) routes the player to a scene. Those destinations are
      // authored on the puzzle config rather than the hotspot action, so they
      // have to be lifted out explicitly — otherwise the validator flags a
      // puzzle-only scene as having no exits and the canvas hides the branch.
      if (hs.action.type === "patternPuzzle" && hs.action.patternPuzzle) {
        const pp = hs.action.patternPuzzle;
        if (pp.targetSceneId)
          edges.push({
            id: `e-${sc.id}-h-${hs.id}-solve`,
            source: sc.id,
            target: pp.targetSceneId,
            kind: "hotspot",
            ref: hs,
            label: `🔍 ${hs.label.slice(0, 20)} (solved)`,
            attitude: "Hotspot",
          });
        if (pp.wrongTargetSceneId)
          edges.push({
            id: `e-${sc.id}-h-${hs.id}-wrong`,
            source: sc.id,
            target: pp.wrongTargetSceneId,
            kind: "hotspot",
            ref: hs,
            label: `🔍 ${hs.label.slice(0, 20)} (failed)`,
            attitude: "Hotspot",
          });
      }
      // A scripted sequence can end on a goToScene step — a real navigation
      // edge (the cutscene walks you out of the room). Lift each one so the
      // validator sees the destination as reachable and the canvas draws it.
      if (hs.action.type === "runScript") {
        (hs.action.script ?? []).forEach((st, si) => {
          if (st.do === "goToScene" && st.targetSceneId)
            edges.push({
              id: `e-${sc.id}-h-${hs.id}-script-${si}`,
              source: sc.id,
              target: st.targetSceneId,
              kind: "hotspot",
              ref: hs,
              label: `🎬 ${hs.label.slice(0, 20)} (script)`,
              attitude: "Hotspot",
            });
        });
      }
    });
    // A room-entry script's goToScene is a navigation edge too.
    (sc.stage?.enterScript ?? []).forEach((st, si) => {
      if (st.do === "goToScene" && st.targetSceneId)
        edges.push({
          id: `e-${sc.id}-enterscript-${si}`,
          source: sc.id,
          target: st.targetSceneId,
          kind: "auto",
          ref: sc,
          label: "🎬 entry script",
          attitude: "Neutral",
        });
    });
    // Walk-off-screen edge exits are real scene edges too: the player walks
    // into the plate edge and lands in the target scene, so the validator
    // treats them as exits and the canvas draws the branch.
    (["left", "right"] as const).forEach((edge) => {
      const ex = sc.stage?.exitEdges?.[edge];
      if (ex?.targetSceneId)
        edges.push({
          id: `e-${sc.id}-edge-${edge}`,
          source: sc.id,
          target: ex.targetSceneId,
          kind: "hotspot",
          ref: sc,
          label: `➜ walk off ${edge} edge`,
          attitude: "Hotspot",
        });
    });
  });
  return edges;
}

/** Every DialogueBeat in a story that a writer or engine can read — the
 * scene's own beats PLUS the two beats nested inside a "press the lie"
 * contradiction (the caught-in-a-lie reaction and the bluff-called line).
 * Collectors/walkers that read beats for flags, memories or gates must use
 * this so a flag/memory referenced only on a lie beat isn't treated as
 * nonexistent (the same reason Interrogation beats get lifted by hand). */
export function everyDialogueBeat(story: Story): DialogueBeat[] {
  const out: DialogueBeat[] = [];
  story.scenes.forEach((sc) => {
    (sc.dialogueBeats ?? []).forEach((b) => {
      out.push(b);
      if (b.lie) {
        out.push(b.lie.caughtBeat);
        if (b.lie.wrongBeat) out.push(b.lie.wrongBeat);
      }
    });
  });
  return out;
}

/** The Contradiction on a beat, if any (helper for readability at call sites). */
export const beatLie = (beat: DialogueBeat | null | undefined): import("./types").Contradiction | undefined =>
  beat?.lie;

export function collectFlags(story: Story): string[] {
  const flags = new Set<string>();
  const fromGate = (g?: Gating) => {
    g?.requiresFlags?.forEach((f) => flags.add(f));
    g?.excludesFlags?.forEach((f) => flags.add(f));
  };
  const fromConsequences = (c?: Consequences) => {
    c?.setFlags?.forEach((f) => flags.add(f));
    c?.clearFlags?.forEach((f) => flags.add(f));
  };
  story.scenes.forEach((sc) => {
    sc.choices?.forEach((c) => {
      fromGate(c.gating);
      fromConsequences(c.consequences);
      // A quick-time prompt's "you hesitated" path sets flags too.
      fromConsequences(c.timedOutConsequences);
    });
    sc.hotspots?.forEach((h) => {
      fromGate(h.gating);
      if (h.action.flagSet) flags.add(h.action.flagSet);
      // Pattern puzzles grant flags from their puzzle config, not the
      // hotspot action, so lift both the solve and the final-fail sets.
      const pp = h.action.patternPuzzle;
      if (pp) {
        fromConsequences(pp.rewardConsequences);
        fromConsequences(pp.wrongSubmissionConsequences);
      }
      // Scripted sequences set flags mid-cutscene.
      h.action.script?.forEach((st) => {
        if (st.do === "setFlag") flags.add(st.flag);
      });
    });
    sc.dialogueBeats?.forEach((b) => {
      fromGate(b.conditionRule);
      // The contradiction: its caught flag is set by the engine at runtime
      // (like an interrogation crack), and both outcome swings set flags.
      if (b.lie) {
        flags.add(b.lie.contradictedFlag);
        fromConsequences(b.lie.contradictedConsequences);
        fromConsequences(b.lie.wrongConsequences);
        fromGate(b.lie.caughtBeat.conditionRule);
        b.lie.wrongBeat && fromGate(b.lie.wrongBeat.conditionRule);
      }
    });
    sc.onEnterActions?.forEach((a) => fromConsequences(a.consequences));
    // Room-entry scripts: their setFlag steps and the run-once latch flag.
    sc.stage?.enterScript?.forEach((st) => {
      if (st.do === "setFlag") flags.add(st.flag);
    });
    if (sc.stage?.enterScriptFlag) flags.add(sc.stage.enterScriptFlag);
    // Interrogation outcomes set flags the ENGINE applies at runtime (on the
    // crack / clamp), not any authored consequence — lift them so the Flags
    // tab lists them and gates/recalls can reference them.
    if (sc.interrogation) {
      flags.add(sc.interrogation.brokeFlag);
      if (sc.interrogation.clampFlag) flags.add(sc.interrogation.clampFlag);
      fromConsequences(sc.interrogation.brokeConsequences);
      fromConsequences(sc.interrogation.clampConsequences);
    }
  });
  story.deduction?.connections.forEach((c) => flags.add(c.flagSet));
  story.map?.locations.forEach((loc) => fromGate(loc.gating));
  return [...flags].sort();
}

/** All keys a beat can recall or a gate can "remember": Choice.memoryLog
 * tags, every Gating.requiresMemories entry, and every DialogueBeat.recalls
 * key (scene beats plus episode recap lines). The source list for Studio's
 * memory pickers — which additionally offer story flags (see
 * collectFlags). */
export function collectMemoryTags(story: Story): string[] {
  const tags = new Set<string>();
  const fromGate = (g?: Gating) => g?.requiresMemories?.forEach((t) => tags.add(t));
  story.scenes.forEach((sc) => {
    sc.choices?.forEach((c) => {
      if (c.memoryLog) tags.add(c.memoryLog);
      fromGate(c.gating);
    });
    sc.hotspots?.forEach((h) => fromGate(h.gating));
    sc.dialogueBeats?.forEach((b) => {
      fromGate(b.conditionRule);
      Object.keys(b.recalls ?? {}).forEach((t) => tags.add(t));
      // A contradiction's reaction beats can gate on and recall memories too.
      if (b.lie) {
        fromGate(b.lie.caughtBeat.conditionRule);
        Object.keys(b.lie.caughtBeat.recalls ?? {}).forEach((t) => tags.add(t));
        if (b.lie.wrongBeat) {
          fromGate(b.lie.wrongBeat.conditionRule);
          Object.keys(b.lie.wrongBeat.recalls ?? {}).forEach((t) => tags.add(t));
        }
      }
    });
  });
  (story.episodes ?? []).forEach((ep) => ep.recapLines?.forEach((l) => fromGate(l.gating)));
  // Item-present keys: a choice with presentItem records `item:<id>` in the
  // memories map, so those keys are valid recall/gate keys too.
  story.items.forEach((i) => tags.add(`item:${i.id}`));
  return [...tags].sort();
}

/** `saw_the_body` -> "saw the body" — the readable form of a flag id, used
 * wherever a flag name stands in for prose (recalls without a note, the
 * player's "Story so far" readout). */
export const prettyFlagName = (flag: string): string =>
  (flag.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || flag);

/** Where a flag gets set, in readable form — the Studio 🏷 Flags tab shows
 * this under each note box so authors see what the flag actually triggers. */
export function flagSetSources(story: Story, flag: string): string[] {
  const out: string[] = [];
  const add = (sceneTitle: string | undefined, how: string) =>
    out.push(sceneTitle ? `${sceneTitle} — ${how}` : how);
  story.scenes.forEach((sc) => {
    sc.choices?.forEach((c) => {
      if (c.consequences?.setFlags?.includes(flag)) add(sc.title, `choice “${c.text.slice(0, 40)}”`);
      if (c.timedOutConsequences?.setFlags?.includes(flag)) add(sc.title, `“${c.text.slice(0, 40)}” (timed out)`);
    });
    sc.hotspots?.forEach((h) => {
      if (h.action.flagSet === flag) add(sc.title, `hotspot “${h.label}”`);
      const pp = h.action.patternPuzzle;
      if (pp?.rewardConsequences?.setFlags?.includes(flag)) add(sc.title, `puzzle “${h.label}” (solved)`);
      if (pp?.wrongSubmissionConsequences?.setFlags?.includes(flag)) add(sc.title, `puzzle “${h.label}” (failed)`);
    });
    sc.onEnterActions?.forEach((a) => {
      if (a.consequences?.setFlags?.includes(flag)) add(sc.title, "on entering the scene");
    });
  });
  if (story.deduction?.connections.some((c) => c.flagSet === flag)) out.push("corkboard deduction");
  return out;
}

/** Resolve a dialogue beat's effective text, substituting a recall line when a
 * matching memory OR flag exists.
 *
 * A recall key can be a memoryLog tag — `{said}` then echoes the player's
 * exact words — or a story flag name, where `{said}` echoes the flag's note
 * from `Story.flagNotes` (or the flag's readable name when no note is
 * written). When several keys match, the first in insertion order wins.
 * Falls back to `beat.text` when nothing matches. */
export function resolveBeatText(
  beat: { text: string; recalls?: Record<string, string> } | null | undefined,
  memories: Record<string, string>,
  activeFlags?: Set<string>,
  flagNotes?: Record<string, string>
): string {
  if (!beat) return "";
  if (beat.recalls) {
    for (const [key, line] of Object.entries(beat.recalls)) {
      const said = memories[key];
      if (said != null) return line.replace(/\{said\}/g, said);
      if (activeFlags?.has(key)) {
        const note = flagNotes?.[key]?.trim();
        return line.replace(/\{said\}/g, note || prettyFlagName(key));
      }
    }
  }
  return beat.text;
}

/** Record a memory from a picked choice. Returns a new state (or the same one
 * when the choice carries no memoryLog tag). */
export function recordMemory(choice: Choice, s: GlobalState): GlobalState {
  if (!choice.memoryLog) return s;
  if (s.memories[choice.memoryLog] === choice.text) return s;
  return { ...s, memories: { ...s.memories, [choice.memoryLog]: choice.text } };
}

/** A choice's effective gate: its authored gate PLUS the item it presents —
 * you can't show what you don't have. Keeping this in one place means every
 * evaluation site (hidden filter, locked markers, hints, the journey log,
 * auto-advance, the softlock check) enforces the same rule. */
export function effectiveChoiceGating(c: Choice): Gating | undefined {
  if (!c.presentItem) return c.gating;
  const items = [...(c.gating?.requiresItems ?? [])];
  if (!items.includes(c.presentItem)) items.push(c.presentItem);
  return { ...c.gating, requiresItems: items };
}

/** Whether a gate's requirements can be satisfied WITHOUT leaving the scene —
 * some hotspot in the same room sets the flag / hands over the item. This
 * turns the classic "do X to unlock the door" pattern (punch the dumpster lid
 * → climb out) from a scary "every exit is gated" warning into the open door
 * it actually is. Meters, trust, memories and excludes need state from outside
 * the room, so a gate that leans on them is judged NOT locally satisfiable
 * (conservative — the advisory stays). */
export function gateSatisfiableLocally(gating: Gating | undefined, scene: SceneNode): boolean {
  if (!gating) return true;
  const flags = gating.requiresFlags ?? [];
  const items = gating.requiresItems ?? [];
  const nonLocal =
    (gating.excludesFlags?.length ?? 0) > 0 ||
    (gating.excludesItems?.length ?? 0) > 0 ||
    (gating.minMeters && Object.keys(gating.minMeters).length > 0) ||
    (gating.maxMeters && Object.keys(gating.maxMeters).length > 0) ||
    (gating.minTrust && Object.keys(gating.minTrust).length > 0) ||
    (gating.requiresMemories?.length ?? 0) > 0;
  if (nonLocal) return false;
  if (flags.length === 0 && items.length === 0) return true;
  const setFlags = new Set<string>();
  const grantItems = new Set<string>();
  (scene.hotspots ?? []).forEach((h) => {
    if (h.action.flagSet) setFlags.add(h.action.flagSet);
    if (h.action.itemGranted) grantItems.add(h.action.itemGranted);
    (h.action.topics ?? []).forEach((t) => { if (t.flagSet) setFlags.add(t.flagSet); });
  });
  Object.values(scene.stage?.exitEdges ?? {}).forEach((e) => { if (e?.flagSet) setFlags.add(e.flagSet); });
  const all = gating.requiresAll !== false;
  const flagsOk = all ? flags.every((f) => setFlags.has(f)) : flags.some((f) => setFlags.has(f));
  const itemsOk = all ? items.every((i) => grantItems.has(i)) : items.some((i) => grantItems.has(i));
  return flagsOk && itemsOk;
}

/** The choice's consequences with the presented item removed when the choice
 * hands it over (consumePresentedItem). Flashing an item leaves it in the
 * satchel. */
export function presentationConsequences(c: Choice): Consequences | undefined {
  if (!c.presentItem || !c.consumePresentedItem) return c.consequences;
  return { ...c.consequences, removeItems: [...(c.consequences?.removeItems ?? []), c.presentItem] };
}

/** Record that the player presented an item: memories gains an
 * `item:<id>` entry holding the item's NAME, so a beat can recall it
 * ({said} echoes "The Photograph") and a gate can remember it — exactly
 * like a memoryLog line, no new state dimension. First presentation wins. */
export function recordPresentation(choice: Choice, story: Story, s: GlobalState): GlobalState {
  if (!choice.presentItem) return s;
  const item = story.items.find((i) => i.id === choice.presentItem);
  if (!item) return s;
  const key = `item:${item.id}`;
  if (s.memories[key]) return s;
  return { ...s, memories: { ...s.memories, [key]: item.name } };
}

/** A PRESSING reply: a conversational reply tagged with an attitude — the
 * follow-up that chews on the suspect's composure. Neutral follow-ups
 * (questions, silence, small talk) don't count as pressure. */
export const isPressingReply = (c: Choice): boolean =>
  !!c.reply && (c.attitudeTag ?? "Neutral") !== "Neutral";

/** Composure remaining in an interrogation scene: the initial value minus
 * the pressing replies already made here. Presses are one-shot
 * (usedChoices), so the counter persists across saves and re-entries and
 * can't be ground — a press, once made, never comes back. An exclusive
 * group counts once: picking one member resolves the rest, but you only
 * SAID one thing. */
export function composureRemaining(scene: SceneNode, usedChoices: Set<string>): number {
  const q = scene.interrogation;
  if (!q) return 0;
  const initial = q.composure ?? 3;
  const used = (scene.choices ?? []).filter((c) => isPressingReply(c) && usedChoices.has(`${scene.id}:${c.id}`));
  const groups = new Set(used.filter((c) => c.exclusiveGroup).map((c) => c.exclusiveGroup!));
  const count = used.filter((c) => !c.exclusiveGroup).length + groups.size;
  return Math.max(0, initial - count);
}

/** When composure hits zero, trust decides the outcome: at/above the
 * threshold the suspect talks (cracks), below it they shut down (clamp).
 * This is the risk in the risk/reward: press without warming them up first
 * and the pressure rebounds. */
export function interrogationOutcome(q: Interrogation, trust: number): "broke" | "clamped" {
  return trust >= (q.crackTrust ?? 0) ? "broke" : "clamped";
}

/** Examine zoom: the scale factor that magnifies the scene plate toward the
 * examined hotspot's centre so the zone occupies most of the frame.
 * Clamped so a tiny zone can't blur into noise — a CSS magnification of a
 * small image loses detail, hence the large-plate authoring guidance. */
export function examineZoom(bounds: { w: number; h: number }): number {
  return Math.min(3.5, Math.max(1.6, 60 / Math.max(bounds.w, bounds.h)));
}

/** Apply a PRESS to a suspect's live composure. `current` is the live value
 * (undefined until first pressed = full). Returns the new composure and
 * whether this press just hit zero (the break moment). A press on an already
 * broken suspect (0) does nothing. */
export function pressComposure(current: number | undefined, initial: number): { next: number; broke: boolean; changed: boolean } {
  const cur = current ?? initial;
  if (cur <= 0) return { next: 0, broke: false, changed: false };
  const next = cur - 1;
  return { next, broke: next === 0, changed: true };
}

/** Apply a STEADY (the suspect recovers after you hesitate). One +1, only
 * while pressed (0 < composure < initial) and only if they haven't steadied
 * yet. Returns the new composure and whether it recovered at all. */
export function steadyComposure(
  current: number | undefined,
  initial: number,
  alreadySteadied: boolean
): { next: number; recovered: boolean } {
  const cur = current ?? initial;
  if (alreadySteadied || cur <= 0 || cur >= initial) return { next: cur, recovered: false };
  return { next: cur + 1, recovered: true };
}

/** Default escalating reaction lines as a suspect is pressed down, indexed
 * from composure = initial-1 (index 0) down to 1. Overridable per scene. */
export const DEFAULT_PRESS_REACTIONS = [
  "They go still.",
  "Their jaw tightens.",
  "A muscle in their neck works.",
  "Their eyes flick to the door.",
  "They stop breathing.",
];
export function pressReaction(q: { pressReactions?: string[]; composure?: number }, composureNow: number): string {
  const initial = q.composure ?? 3;
  // index 0 = just below full, deeper = closer to the edge
  const idx = Math.min((q.pressReactions?.length ?? DEFAULT_PRESS_REACTIONS.length) - 1, Math.max(0, initial - 1 - composureNow));
  return q.pressReactions?.[idx] ?? DEFAULT_PRESS_REACTIONS[Math.min(idx, DEFAULT_PRESS_REACTIONS.length - 1)];
}

/* ---------------------- press the lie (contradiction) ----------------- */

/** Default wrong-evidence guesses before a claim shuts for the scene. */
export const DEFAULT_WRONG_EVIDENCE_LIMIT = 2;

/** Does a held item break this lie? Only the items named as evidence count;
 *  every other item is a bluff the speaker calls. */
export function evidenceBreaksLie(lie: Contradiction, heldItemIds: string[], presentedItemId: string): boolean {
  const held = new Set(heldItemIds);
  if (!lie.evidenceItemIds.includes(presentedItemId)) return false;
  return held.has(presentedItemId);
}

/** The number of wrong guesses that shut the claim for the scene. */
export const wrongEvidenceLimit = (lie: Contradiction): number =>
  Math.max(0, lie.wrongEvidenceLimit ?? DEFAULT_WRONG_EVIDENCE_LIMIT);

/** After `wrongCount` bad guesses, can the claim still be pressed? */
export function lieCanStillPress(lie: Contradiction, wrongCount: number): boolean {
  return wrongCount < wrongEvidenceLimit(lie);
}

/** The line a speaker barks when the player shows evidence that doesn't hold. */
export const lieWrongLine = (lie: Contradiction): string =>
  lie.wrongBeat?.text?.trim() ||
  "You wave that around like it means something. It doesn't. Try again with the real thing — if you've got it.";

/** Apply a SUCCESSFUL contradiction: run the payoff consequences, set the
 * caught flag (so the rest of the scene can gate on the lie being broken),
 * and return the next state. Mirrors how an interrogation crack is applied
 * in the same state write as the press that caused it. */
export function applyLieCaught(story: Story, lie: Contradiction, s: GlobalState): GlobalState {
  let next = applyConsequences(story, lie.contradictedConsequences, s);
  next = { ...next, activeFlags: new Set(next.activeFlags).add(lie.contradictedFlag) };
  return next;
}

/** Apply a CALLED BLUFF: run the wrong-guess consequences (usually heat up /
 * trust down). */
export function applyLieWrong(story: Story, lie: Contradiction, s: GlobalState): GlobalState {
  return applyConsequences(story, lie.wrongConsequences, s);
}

/* ------------------------- stage 2d movement ------------------------ */

/** Icon shown for each hotspot cursor verb (markers, hotspot labels). */
export const CURSOR_ICON: Record<string, string> = { look: "👁", take: "✋", talk: "💬", use: "⚙", go: "➜", kick: "👢", punch: "👊" };

/* ============================================================
   VERB COIN — "pick the verb, then the object"
   ------------------------------------------------------------
   The point-and-click interaction model: the player chooses a verb
   (look / take / talk / use / go — plus the opt-in body verbs kick /
   punch), optionally arms an inventory item for USE, then clicks an
   object. One object can therefore answer several verbs instead of
   needing one overlapping hotspot per verb.
   ============================================================ */

export type VerbId = CursorKind;

/** The five core verbs every game kind shares — and the default coin. */
export const CORE_VERB_IDS: VerbId[] = ["look", "take", "talk", "use", "go"];
/** The two extra body-verbs, opt-in per room (StageSettings.extendedVerbs). */
export const EXTRA_VERB_IDS: VerbId[] = ["kick", "punch"];
/** Every verb, in the order the coin shows them. */
export const VERB_IDS: VerbId[] = [...CORE_VERB_IDS, ...EXTRA_VERB_IDS];
export const VERB_LABEL: Record<VerbId, string> = {
  look: "Look at",
  take: "Pick up",
  talk: "Talk to",
  use: "Use",
  go: "Go to",
  kick: "Kick",
  punch: "Punch",
};
export const VERB_ICON: Record<VerbId, string> = {
  look: "👁",
  take: "✋",
  talk: "💬",
  use: "⚙",
  go: "➜",
  kick: "👢",
  punch: "👊",
};

/** House-style "that doesn't work" lines, per verb. */
export const DEFAULT_VERB_RESPONSES: Record<VerbId, string[]> = {
  look: ["Nothing there you haven't already seen.", "You look. It keeps its secrets.", "It's exactly what it looked like the first time."],
  take: ["That's not coming loose — it's bolted to the county.", "You'd need a crowbar and a reason.", "Leave it. Somebody's counting on it being there."],
  talk: ["Talking to furniture is how the last guy ended up in the county home.", "It doesn't answer. You feel better anyway.", "No conversation in it."],
  use: ["That does nothing. Nothing at all.", "Tried it. Nothing. Not even a noise.", "Wrong tool, wrong thing, wrong hour."],
  go: ["No way out that way but a long walk and a bad idea.", "That's not an exit. That's a wall someone painted.", "You could go that way. You'd come right back."],
  kick: ["You give it a kick. It kicks back by not moving.", "That's how you break a boot and get nothing for it.", "Kicking it doesn't help. It's not that kind of problem."],
  punch: ["You take a swing. The air and your knuckles regret it.", "Punching that solves nothing and hurts plenty.", "That's a wall, not a punching bag."],
};

/** A verb-coin response line. `seed` varies the pick so repeating a failed
 *  verb doesn't read like a stuck record; an authored Hotspot.wrongVerbText
 *  always wins, then the story's own lines, then the house style. */
export function wrongVerbLine(
  verb: VerbId,
  story?: { verbResponses?: Partial<Record<VerbId, string[]>> },
  hotspetText?: string,
  seed = 0,
): string {
  if (hotspetText) return hotspetText;
  const authored = story?.verbResponses?.[verb];
  const pool = authored && authored.length ? authored : DEFAULT_VERB_RESPONSES[verb];
  return pool[Math.abs(Math.floor(seed)) % pool.length] ?? DEFAULT_VERB_RESPONSES[verb][0];
}

/** Which verbs a room's coin offers: the author's list if set, otherwise
 *  every verb the room actually uses (hotspot cursors, extra verb actions,
 *  and USE whenever anything in the room accepts an item).
 *
 *  The two EXTRA body-verbs (kick / punch) are OPT-IN: they only appear when
 *  the room sets `stage.extendedVerbs` (or lists them in `stage.verbs`). So a
 *  classic case or a visual novel — anything without a verb coin, or with a
 *  coin that never opts in — is untouched, and kick/punch can't leak into a
 *  room that didn't ask for them. */
export function verbsForScene(scene: { stage?: StageSettings; hotspots?: Hotspot[] } | undefined | null): VerbId[] {
  if (!scene) return [];
  const authored = scene.stage?.verbs;
  if (authored && authored.length) {
    const clean = VERB_IDS.filter((v) => authored.includes(v));
    if (clean.length) return clean;
  }
  const extended = scene.stage?.extendedVerbs === true;
  const allowed = extended ? VERB_IDS : CORE_VERB_IDS;
  const set = new Set<VerbId>();
  for (const hs of scene.hotspots ?? []) {
    if ((VERB_IDS as string[]).includes(hs.cursor)) set.add(hs.cursor as VerbId);
    for (const v of Object.keys(hs.verbs ?? {}) as VerbId[]) set.add(v);
    if (hs.acceptsItems?.length) set.add("use");
  }
  return VERB_IDS.filter((v) => set.has(v) && allowed.includes(v));
}

export interface VerbResolution {
  /** True when this verb/item does something here. */
  ok: boolean;
  /** The action to run (undefined when ok is false). */
  action?: HotspotAction;
  /** Overrides the action's own text (an item-specific reply). */
  text?: string;
  /** The verb that was answered (echoed so the caller can caption it). */
  verb: VerbId;
}

/** Which satchel item an activation actually SPENDS. Consumption is always
 *  author-controlled: only an 🗝 use-item action with `itemConsumed` set
 *  eats an item. A 💬 say-a-line reply — or a use-item action that authors
 *  no consumption — never empties the satchel, even when the player armed
 *  the item on purpose. (The old behaviour silently spent the armed item,
 *  which read exactly like "the showText ate my item".) */
export function itemsConsumedBy(act: HotspotAction | undefined | null): string[] {
  return act?.type === "useItem" && act.itemConsumed ? [act.itemConsumed] : [];
}

/** Resolve "player used VERB (with ITEM) on hotspot" to the action to run.
 *
 *  Order of precedence for the USE verb with an item:
 *    1. hs.acceptsItems contains the item → hs.verbs.use ?? hs.action, with
 *       hs.itemResponses[item] as the line if the author wrote one;
 *    2. otherwise it's a wrong item → ok:false.
 *  For the other verbs: hs.verbs[verb], else hs.action when the hotspot's
 *  own cursor is that verb, else nothing. */
export function resolveVerbAction(hs: Hotspot, verb: VerbId, itemId?: string): VerbResolution {
  if (verb === "use" && itemId) {
    // An item is "accepted" when the author ticked it in the USE panel OR
    // merely wrote the reply line for it (an authored reply implies intent).
    const accepted = (hs.acceptsItems ?? []).includes(itemId) || hs.itemResponses?.[itemId] != null;
    if (!accepted) return { ok: false, verb };
    // An accepted item is answered by the object's authored ⚙ USE action…
    // and, failing that, by its DEFAULT action when that action is a reply
    // (💬 say) or a consumption (🗝 use-item). That is what the Studio's
    // "Accepts these items" panel promises: tick the item, write the line,
    // and the line plays. Only actions that take/move things stay strict —
    // accepting a snack must never make a → door teleport or a 🎁 pickup.
    const answers =
      hs.action.type === "useItem" || hs.action.type === "showText" ? hs.action : undefined;
    const action = hs.verbs?.use ?? answers;
    if (!action) return { ok: false, verb };
    return { ok: true, action, text: hs.itemResponses?.[itemId], verb };
  }
  if (verb === "use") {
    // USE with nothing armed — fall back to whatever the object offers.
    const action = hs.verbs?.use ?? (hs.cursor === "use" ? hs.action : undefined);
    return action ? { ok: true, action, verb } : { ok: false, verb };
  }
  const extra = hs.verbs?.[verb];
  if (extra) return { ok: true, action: extra, verb };
  if (hs.cursor === verb) return { ok: true, action: hs.action, verb };
  return { ok: false, verb };
}

/** Does this hotspot answer to this verb at all (so the UI can dim the
 *  markers a verb can't touch without leaking what the puzzle is)? */
export function hotspotAnswersVerb(hs: Hotspot, verb: VerbId): boolean {
  return resolveVerbAction(hs, verb).ok;
}

/** Default walk speed: scene-width % per second. */
export const STAGE2D_DEFAULT_SPEED = 18;
/** Default reach distance: scene-width % within which a hotspot fires. */
export const STAGE2D_DEFAULT_REACH = 4;
/** Default AMBIENT NPC pace (% world-width / sec). Deliberately slower than
 *  the player's, and never inherited from the room's player speed — a fast
 *  player must not turn every barman into a sprinter. Authors can always
 *  set an NPC's own speed in the 🚏 Ambient NPCs section. */
export const STAGE2D_DEFAULT_NPC_SPEED = 12;
/** Default walkable floor band (y % of plate height). */
export const STAGE_DEFAULT_FLOOR = { top: 62, bottom: 94 };
/** Default depth shrink at the top of the floor (0–0.9). */
export const STAGE_DEFAULT_DEPTH_SCALE = 0.35;


/** The effective floor band of a stage scene, with defaults filled and the
 *  band sanitised (top strictly above bottom, both inside the plate). */
export function stageFloor(settings: StageSettings | undefined): { top: number; bottom: number } {
  const f = settings?.floor;
  const top = clamp(Number(f?.top ?? STAGE_DEFAULT_FLOOR.top), 0, 98);
  const bottom = clamp(Number(f?.bottom ?? STAGE_DEFAULT_FLOOR.bottom), 2, 100);
  return bottom - top >= 4 ? { top, bottom } : { top: clamp(bottom - 8, 0, 98), bottom };
}

/** Clamp a point into the floor band (x also kept off the plate edges).
 *  Clicks above/below the band walk to its nearest edge — the cursor always
 *  lands somewhere the character can stand. `width` is the world width in
 *  viewport-% (100 = a single screen; wide worlds clamp to their own
 *  bounds). */
export function clampToFloor(
  x: number,
  y: number,
  floor: { top: number; bottom: number },
  width = 100
): { x: number; y: number } {
  const w = Math.max(100, width);
  return { x: clamp(x, 1, w - 1), y: clamp(y, floor.top, floor.bottom) };
}

/** Perspective scale of a sprite standing at y within the floor band:
 *  1 at the bottom of the band, shrinking to (1 - depthScale) at the top. */
export function stageDepthScale(
  y: number,
  floor: { top: number; bottom: number },
  depthScale: number
): number {
  const d = clamp(depthScale, 0, 0.9);
  const span = floor.bottom - floor.top;
  if (span <= 0) return 1;
  const t = clamp((y - floor.top) / span, 0, 1); // 0 top → 1 bottom
  return 1 - d * (1 - t);
}

/* ============================================================
   CURSOR ART
   ------------------------------------------------------------
   Per-case cursor art, keyed by verb (plus "default" for the plain
   arrow). Static art becomes a real CSS cursor; a sprite sheet is drawn
   as a small animated sprite that tracks the mouse.
   ============================================================ */

export type CursorSlot = CursorKind | "default";
export const CURSOR_SLOTS: CursorSlot[] = ["default", "look", "take", "talk", "use", "go", "kick", "punch"];

export interface ResolvedCursor {
  /** The art to draw (undefined = keep the game's system cursor). */
  art: CursorArt | undefined;
  /** Static → a CSS cursor; animated → a sprite that follows the mouse. */
  animated: boolean;
  /** The CSS `cursor` value for static art (empty when animated/none). */
  css: string;
  /** Hotspot offset in px (where the click lands inside the art). */
  hx: number;
  hy: number;
  size: number;
}

/** The art for a verb, falling back to "default", falling back to nothing. */
export function cursorArtFor(story: { cursorArt?: Partial<Record<CursorSlot, CursorArt>> } | undefined | null, kind: CursorSlot): CursorArt | undefined {
  const table = story?.cursorArt;
  if (!table) return undefined;
  return table[kind] ?? table["default"];
}

/** Fill in the blanks and work out how to draw it. */
export function resolveCursor(
  story: { cursorArt?: Partial<Record<CursorSlot, CursorArt>> } | undefined | null,
  kind: CursorSlot,
  resolve?: (v?: string) => string | undefined
): ResolvedCursor {
  const art = cursorArtFor(story, kind);
  if (!art) return { art: undefined, animated: false, css: "", hx: 0, hy: 0, size: 32 };
  const size = clamp(Math.round(art.size ?? 32), 8, 128);
  const center = art.anchor === "center";
  const hx = center ? Math.round(size / 2) : 0;
  const hy = center ? Math.round(size / 2) : 0;
  const sheetOk = !!(art.sheet && art.sheet.frameWidth > 0);
  if (sheetOk) return { art, animated: true, css: "none", hx, hy, size };
  const src = art.image ? (resolve?.(art.image) ?? art.image) : "";
  if (!src) return { art: undefined, animated: false, css: "", hx: 0, hy: 0, size };
  // The trailing keyword is the fallback if the browser can't load the art.
  return { art, animated: false, css: `url("${src}") ${hx} ${hy}, auto`, hx, hy, size };
}

/* ============================================================
   INVENTORY PRESENTATION
   ------------------------------------------------------------
   One dock, three presentations — and the default is the dock every
   existing case already has, so opting in is the only way to change how a
   game looks. See InventorySettings in src/types.ts.
   ============================================================ */

/** Shipped container art (an open leather case) — the preset an author can
 *  pick, and the fallback when "container" mode is chosen with no art. */
export const DEFAULT_INVENTORY_IMAGE = "/assets/ui/inventory-case.png";
export const DEFAULT_INVENTORY_LABEL = "Inventory";

export interface ResolvedInventory {
  mode: "classic" | "container" | "hidden";
  label: string;
  image: string;
  sheet?: import("./game/spriteSheet").SpriteSheet;
  anchor: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  columns: number;
  inset: number;
  height: number;
  startClosed: boolean;
}

/** Fill in the blanks: every case gets a resolved, always-valid dock. */
export function inventoryDisplay(story?: { inventoryDisplay?: InventorySettings } | null): ResolvedInventory {
  const s = story?.inventoryDisplay ?? {};
  const mode: ResolvedInventory["mode"] =
    s.mode === "container" || s.mode === "hidden" ? s.mode : "classic";
  return {
    mode,
    label: (s.label ?? "").trim() || DEFAULT_INVENTORY_LABEL,
    // No art? The dock draws a stitched leather panel in house style, so the
    // mode never looks half-built.
    image: (s.image ?? "").trim() || DEFAULT_INVENTORY_IMAGE,
    ...(s.sheet ? { sheet: s.sheet } : {}),
    anchor: s.anchor ?? "bottom-left",
    columns: clamp(Math.round(s.columns ?? 4), 1, 8),
    inset: clamp(s.inset ?? 14, 0, 45),
    height: clamp(Math.round(s.height ?? 260), 120, 520),
    startClosed: !!s.startClosed,
  };
}

/** CSS for the dock's corner. */
export function inventoryAnchorClass(anchor: ResolvedInventory["anchor"]): string {
  switch (anchor) {
    case "bottom-right":
      return "bottom-3 right-3 items-end";
    case "top-left":
      return "top-3 left-3";
    case "top-right":
      return "top-3 right-3 items-end";
    default:
      return "bottom-3 left-3";
  }
}

/** The walker's sprite scale at a given y: NEAR (bottom of the floor band)
 *  → FAR (top of the band). Authors can pin both ends explicitly
 *  (`playerNearScale` / `playerFarScale`) or keep using `depthScale`, which
 *  means "shrink to (1 - depthScale) at the back". Big up close, small in the
 *  distance — the classic room perspective. */
export function stageSpriteScale(y: number, floor: { top: number; bottom: number }, settings: StageSettings): number {
  const near = clamp(settings.playerNearScale ?? 1, 0.15, 3);
  const farDefault = 1 - clamp(settings.depthScale ?? STAGE_DEFAULT_DEPTH_SCALE, 0, 0.9);
  const far = clamp(settings.playerFarScale ?? farDefault, 0.1, 3);
  const span = floor.bottom - floor.top;
  if (span <= 0) return near;
  const t = clamp((y - floor.top) / span, 0, 1); // 0 back → 1 front
  return far + (near - far) * t;
}

/** The per-scene character size multiplier (stage.playerScale) — the flat
 *  scale every depth-scaled sprite is multiplied by, so a room with a huge
 *  plate (a wide alley, a cathedral) can make the character LOOK huge or
 *  tiny to fit it. Clamped so the walker can't vanish or blow through the
 *  plate; the editor preview and the game both read it through here so the
 *  author sees exactly what plays. */
export function stagePlayerScale(settings: { playerScale?: number }): number {
  return clamp(settings.playerScale ?? 1, 0.15, 4);
}

/** Walk speed at a given y, as a fraction of the room's speed. A smaller
 *  (further away) character covers less screen per second — without this,
 *  walking "into the distance" reads as skating. */
export function stageSpeedScale(y: number, floor: { top: number; bottom: number }, settings: StageSettings): number {
  const s = stageSpriteScale(y, floor, settings);
  return clamp(0.55 + 0.45 * s, 0.35, 1.6);
}

/** WALK-BEHIND: should this foreground extra be drawn OVER the walker?
 *  True when the extra is flagged `occludes` and the walker's feet are ABOVE
 *  its baseline — i.e. standing further from the camera than the object, so
 *  the object hides them. No walker (a non-stage scene) → yes, draw in front. */
export function extraOccludes(extra: { occludes?: boolean; occludeBaseline?: number; y?: number }, walkerFeetY?: number): boolean {
  if (!extra.occludes) return false;
  if (walkerFeetY === undefined) return true;
  const base = clamp(extra.occludeBaseline ?? extra.y ?? 50, 0, 100);
  return walkerFeetY <= base;
}

/** Where a hotspot's stage MARKER stands: the bottom-centre of its zone
 *  (a thing sits ON the ground), clamped into the floor band so the
 *  character can always walk to it. */
export function stageMarkerPoint(
  h: Hotspot,
  floor: { top: number; bottom: number },
  width = 100
): { x: number; y: number } {
  return clampToFloor(h.bounds.x + h.bounds.w / 2, h.bounds.y + h.bounds.h, floor, width);
}

/* --------------------- walk path (polygon walkable zone) ----------------
 * A stage scene may replace the flat floor band with an arbitrary polygon
 * (`floorPoints`). Everything below turns that polygon into the walkable
 * region: point-in-polygon for walkability, nearest-boundary for click
 * clamping, and a depth band (the polygon's y-extent) so perspective still
 * reads "big up close, small in the distance". The plain band is just the
 * special case of a full-width rectangle, so band rooms behave exactly as
 * before. */

export interface WalkPoint {
  x: number;
  y: number;
}

/** The walkable polygon of a stage scene (world-%). With `floorPoints` (≥3
 *  points) it IS that polygon; otherwise it's the classic floor band as a
 *  full-width rectangle. Always returns a closed, ≥3-point ring. */
export function stageWalkPoly(settings: StageSettings | undefined, width = 100): WalkPoint[] {
  const pts = settings?.floorPoints;
  if (pts && pts.length >= 3) return pts.map((p) => ({ x: p.x, y: p.y }));
  const w = Math.max(100, width);
  const f = stageFloor(settings);
  return [
    { x: 0, y: f.top },
    { x: w, y: f.top },
    { x: w, y: f.bottom },
    { x: 0, y: f.bottom },
  ];
}

/** The depth band for perspective scaling: the polygon's y-extent (bottom =
 *  near, top = far). For a band room this equals `stageFloor`, so sprite
 *  scale/speed are unchanged. */
export function stageWalkDepth(poly: WalkPoint[]): { top: number; bottom: number } {
  let top = Infinity;
  let bottom = -Infinity;
  for (const p of poly) {
    if (p.y < top) top = p.y;
    if (p.y > bottom) bottom = p.y;
  }
  if (!Number.isFinite(top)) return { top: 0, bottom: 100 };
  return { top: clamp(top, 0, 98), bottom: clamp(bottom, 2, 100) };
}

/** Squared distance from a point to a line segment (raw units). */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return (px - ax) * (px - ax) + (py - ay) * (py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx;
  const qy = ay + t * dy;
  return (px - qx) * (px - qx) + (py - qy) * (py - qy);
}

/** Ray-cast point-in-polygon, with a small boundary tolerance so the walker
 *  can stand ON the path's edge (an agent radius, not a point). */
export function pointInWalkPoly(x: number, y: number, poly: WalkPoint[]): boolean {
  if (!poly || poly.length < 3) return true;
  const EPS = 0.6;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (segDist2(x, y, a.x, a.y, b.x, b.y) <= EPS * EPS) return true;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Clamp a point into the walkable polygon: if it's already walkable, keep
 *  it (x kept off the world edges); otherwise snap to the nearest point on
 *  the polygon's boundary — so a click outside the path walks to the closest
 *  spot the character can stand. */
export function clampToWalkPoly(
  x: number,
  y: number,
  poly: WalkPoint[],
  width = 100
): { x: number; y: number } {
  const w = Math.max(100, width);
  const cx = clamp(x, 1, w - 1);
  if (pointInWalkPoly(cx, y, poly)) return { x: cx, y };
  let best = { x: cx, y: clamp(y, 0, 100) };
  let bestD = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((x - a.x) * dx + (y - a.y) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = a.x + t * dx;
    const qy = a.y + t * dy;
    const d = (qx - x) * (qx - x) + (qy - y) * (qy - y);
    if (d < bestD) {
      bestD = d;
      best = { x: qx, y: qy };
    }
  }
  return best;
}

/** Where a hotspot's stage MARKER stands when the walkable zone is a path
 *  polygon: bottom-centre of the zone, snapped into the polygon. */
export function stageMarkerPointPoly(
  h: Hotspot,
  poly: WalkPoint[],
  width = 100
): { x: number; y: number } {
  return clampToWalkPoly(h.bounds.x + h.bounds.w / 2, h.bounds.y + h.bounds.h, poly, width);
}

/** The stage camera for a wide world: follows the walker, clamped so the
 *  camera never shows past the world's ends. Returns the left edge of the
 *  viewport in world-% (0 on a single-screen room, where nothing moves). */
export function stageCamX(walkerX: number, worldWidth: number): number {
  const w = Math.max(100, worldWidth);
  return clamp(walkerX - 50, 0, w - 100);
}

/** Is the walker at a world edge, close enough that walking a step further
 *  would walk them off the plate? Used by the stage's walk-off-screen exits
 *  (and the edge arrows). */
export function stageAtWorldEdge(
  x: number,
  worldWidth: number,
  margin = 1.2
): "left" | "right" | null {
  const w = Math.max(100, worldWidth);
  if (x <= margin) return "left";
  if (x >= w - margin) return "right";
  return null;
}

/* --------------------- stage 2d: obstacles + routing ---------------- */

/** How close to an obstacle the character's centre may stand (scene-width %).
 *  A sprite is not a point: without a radius it clips furniture corners. */
export const STAGE_AGENT_RADIUS = 1.6;
/** Grid resolution for the walk search, in scene %. Coarse on purpose — the
 *  route is string-pulled smooth afterwards, and 2% keeps a click at ~2.5k
 *  nodes, which is far below anything a player can perceive. */
export const STAGE_GRID_STEP = 2;

export interface StageObstacle {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The floor band as a full-width rectangle polygon (world %). */
function bandPoly(floor: { top: number; bottom: number }, width: number): WalkPoint[] {
  const w = Math.max(100, width);
  return [
    { x: 0, y: floor.top },
    { x: w, y: floor.top },
    { x: w, y: floor.bottom },
    { x: 0, y: floor.bottom },
  ];
}

/** Is this point inside an obstacle (inflated by the character's radius)?
 *
 *  `poly` is the walkable region (a path polygon, or the floor band as a
 *  rectangle): a point outside it is blocked just like a point inside a wall.
 *  `aspect` (plate width ÷ height) converts the radius from the width-% the
 *  author thinks in to the height-% the y axis is measured in — without it the
 *  clearance is lopsided and the sprite clips the top and bottom of furniture
 *  it neatly avoids at the sides. */
export function stageBlockedPoly(
  x: number,
  y: number,
  obstacles: StageObstacle[] | undefined,
  poly: WalkPoint[] | undefined,
  aspect = 16 / 9,
  width = 100
): boolean {
  if (poly && !pointInWalkPoly(x, y, poly)) return true;
  const w = Math.max(100, width);
  if (x < 0 || x > w) return true;
  const padX = STAGE_AGENT_RADIUS;
  const padY = STAGE_AGENT_RADIUS * (aspect > 0 ? aspect : 16 / 9);
  for (const o of obstacles ?? []) {
    if (x >= o.x - padX && x <= o.x + o.w + padX && y >= o.y - padY && y <= o.y + o.h + padY) return true;
  }
  return false;
}

/** Band form of stageBlockedPoly — kept for the flat-floor call sites and the
 *  engine tests. Delegates through the same polygon logic. */
export function stageBlocked(
  x: number,
  y: number,
  obstacles: StageObstacle[] | undefined,
  floor?: { top: number; bottom: number },
  aspect = 16 / 9,
  width = 100
): boolean {
  return stageBlockedPoly(x, y, obstacles, floor ? bandPoly(floor, width) : undefined, aspect, width);
}

/** Walk the segment in small steps and ask whether every one is clear. Used
 *  for string-pulling and for keyboard wall-sliding. */
export function stageLineClearPoly(
  a: { x: number; y: number },
  b: { x: number; y: number },
  obstacles: StageObstacle[] | undefined,
  poly: WalkPoint[] | undefined,
  aspect = 16 / 9,
  width = 100
): boolean {
  const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, (b.y - a.y) * aspect) / 0.75));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    if (stageBlockedPoly(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, obstacles, poly, aspect, width)) return false;
  }
  return true;
}

/** Band form of stageLineClearPoly. */
export function stageLineClear(
  a: { x: number; y: number },
  b: { x: number; y: number },
  obstacles: StageObstacle[] | undefined,
  floor?: { top: number; bottom: number },
  aspect = 16 / 9,
  width = 100
): boolean {
  return stageLineClearPoly(a, b, obstacles, floor ? bandPoly(floor, width) : undefined, aspect, width);
}

/** Nearest walkable grid node to a point (spiral search outward). A click
 *  that lands inside a wall still has to go SOMEWHERE. */
function nearestFreePoly(
  x: number,
  y: number,
  obstacles: StageObstacle[] | undefined,
  poly: WalkPoint[] | undefined,
  depth: { top: number; bottom: number },
  step: number,
  width = 100
): { x: number; y: number } | null {
  if (!stageBlockedPoly(x, y, obstacles, poly, 16 / 9, width)) return { x, y };
  for (let ring = 1; ring <= 24; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const nx = clamp(x + dx * step, 1, width - 1);
        const ny = clamp(y + dy * step, depth.top, depth.bottom);
        if (!stageBlockedPoly(nx, ny, obstacles, poly, 16 / 9, width)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

/** A* across a coarse grid, then string-pulled: any waypoint the character
 *  can skip in a straight line is dropped, so a grid route becomes the two or
 *  three corners a human would walk.
 *
 *  `poly` is the walkable region (path polygon or band rectangle); `depth`
 *  is its y-extent (the grid rows span it). Returns the waypoints to walk
 *  (excluding the start) or an empty array when no route exists (fully walled
 *  off) — the caller should then refuse the click rather than walk through
 *  the furniture. */
export function stageRoutePoly(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: StageObstacle[] | undefined,
  poly: WalkPoint[] | undefined,
  depth: { top: number; bottom: number },
  step = STAGE_GRID_STEP,
  width = 100
): { x: number; y: number }[] {
  if (!obstacles?.length) {
    // No furniture: the straight line is the route (and it is already optimal).
    return stageLineClearPoly(from, to, obstacles, poly, 16 / 9, width) ? [{ x: to.x, y: to.y }] : [];
  }
  const start = nearestFreePoly(from.x, from.y, obstacles, poly, depth, step, width);
  const goal = nearestFreePoly(to.x, to.y, obstacles, poly, depth, step, width);
  if (!start || !goal) return [];
  if (stageLineClearPoly(start, goal, obstacles, poly, 16 / 9, width)) return [{ x: goal.x, y: goal.y }];

  const w = Math.max(100, width);
  const cols = Math.floor(w / step) + 1;
  const rows = Math.floor((depth.bottom - depth.top) / step) + 1;
  const idx = (c: number, r: number) => r * cols + c;
  const toXY = (c: number, r: number) => ({ x: c * step, y: depth.top + r * step });
  const snap = (p: { x: number; y: number }) => ({
    c: clamp(Math.round(p.x / step), 0, cols - 1),
    r: clamp(Math.round((p.y - depth.top) / step), 0, rows - 1),
  });

  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = toXY(c, r);
      blocked[idx(c, r)] = stageBlockedPoly(p.x, p.y, obstacles, poly, 16 / 9, w) ? 1 : 0;
    }
  }

  const s = snap(start);
  const g = snap(goal);
  // If the snapped nodes landed in a wall (a click inside a fat obstacle),
  // fall back to the nearest free node found above.
  const startIdx = blocked[idx(s.c, s.r)] ? 0 : idx(s.c, s.r);
  const goalIdx = idx(g.c, g.r);
  const h = (c: number, r: number) => Math.hypot(c - g.c, r - g.r);
  const gScore = new Float64Array(cols * rows).fill(Infinity);
  const cameFrom = new Int32Array(cols * rows).fill(-1);
  const open: { i: number; f: number }[] = [];
  gScore[startIdx] = h(s.c, s.r);
  open.push({ i: startIdx, f: h(s.c, s.r) });

  const closed = new Uint8Array(cols * rows);
  while (open.length) {
    // Small frontiers: a linear scan for the best node beats heap bookkeeping.
    let bestAt = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bestAt].f) bestAt = i;
    const current = open.splice(bestAt, 1)[0].i;
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === goalIdx) break;
    const cc = current % cols;
    const cr = (current - cc) / cols;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nc = cc + dx;
        const nr = cr + dy;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const ni = idx(nc, nr);
        if (blocked[ni] || closed[ni]) continue;
        // No corner-cutting: a diagonal step needs both orthogonals clear.
        if (dx && dy && (blocked[idx(cc + dx, cr)] || blocked[idx(cc, cr + dy)])) continue;
        const stepCost = dx && dy ? Math.SQRT2 : 1;
        const tentative = gScore[current] - h(cc, cr) + stepCost;
        if (tentative < gScore[ni]) {
          gScore[ni] = tentative + h(nc, nr);
          cameFrom[ni] = current;
          open.push({ i: ni, f: gScore[ni] });
        }
      }
    }
  }

  if (cameFrom[goalIdx] === -1 && goalIdx !== startIdx) return [];
  // Walk the chain backwards, then reverse it.
  const chain: { x: number; y: number }[] = [];
  let node = goalIdx;
  let guard = 0;
  while (node !== -1 && guard++ < cols * rows) {
    const c = node % cols;
    const r = (node - c) / cols;
    chain.push(toXY(c, r));
    if (node === startIdx) break;
    node = cameFrom[node];
  }
  chain.reverse();
  chain.shift(); // drop the start
  if (chain.length) chain[chain.length - 1] = { x: goal.x, y: goal.y }; // land on the real click

  // String-pull: keep only the corners.
  const pulled: { x: number; y: number }[] = [];
  let cur = { x: start.x, y: start.y };
  let i = 0;
  while (i < chain.length) {
    let furthest = i;
    for (let j = chain.length - 1; j > i; j--) {
      if (stageLineClearPoly(cur, chain[j], obstacles, poly, 16 / 9, w)) {
        furthest = j;
        break;
      }
    }
    pulled.push(chain[furthest]);
    cur = chain[furthest];
    i = furthest + 1;
  }
  return pulled;
}

/** Band form of stageRoutePoly — kept for the flat-floor call sites and the
 *  engine tests. */
export function stageRoute(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: StageObstacle[] | undefined,
  floor: { top: number; bottom: number },
  step = STAGE_GRID_STEP,
  width = 100
): { x: number; y: number }[] {
  return stageRoutePoly(from, to, obstacles, bandPoly(floor, width), floor, step, width);
}

/** Is a stage position within `reach` (scene-width %) of a marker point? */
export function posReachesMarker(
  pos: { x: number; y: number },
  marker: { x: number; y: number },
  reach: number,
  aspect: number
): boolean {
  const a = aspect > 0 ? aspect : 16 / 9;
  const dx = pos.x - marker.x;
  const dy = (pos.y - marker.y) * a;
  return Math.hypot(dx, dy) <= reach;
}

/** How long (ms) a caption bar holds a line — short enough to feel like a
 *  subtitle, long enough to actually read. Used by stage captions. */
export function stageCaptionMs(text: string): number {
  const chars = Math.max(1, (text ?? "").trim().length);
  return clamp(2400 + chars * 55, 3000, 9000);
}

/**
 * Convert a legacy export's per-scene `stage2d` bolt-on into the stage
 * NODE shape. Old .reel.json files (and any hand-written story data from
 * before the stage node existed) carry `stage2d: { playerImage, spawn,
 * speed, reach, keyboard }` on an otherwise standard scene; imports map it
 * to `nodeType: "stage"` + `stage` so old cases keep walking. Returned
 * unchanged when there is nothing to convert.
 */
export function normalizeLegacyStory<T extends { scenes: { stage2d?: unknown; stage?: unknown; nodeType?: string }[] }>(story: T): T {
  let touched = false;
  const scenes = story.scenes.map((sc) => {
    if (!sc.stage2d || sc.stage) return sc;
    const legacy = sc.stage2d as {
      playerImage?: string;
      spawn?: { x: number; y: number };
      speed?: number;
      reach?: number;
      keyboard?: boolean;
    };
    touched = true;
    const { stage2d: _drop, ...rest } = sc as typeof sc & { stage2d?: unknown };
    return {
      ...rest,
      nodeType: "stage",
      stage: {
        playerImage: legacy.playerImage,
        spawn: legacy.spawn,
        speed: legacy.speed,
        reach: legacy.reach,
        keyboard: legacy.keyboard,
      },
    };
  });
  return touched ? { ...story, scenes } : story;
}

/** Clamp a 0–100 percentage point into the plate. */
export const clampStagePos = (x: number, y: number): { x: number; y: number } => ({
  x: clamp(x, 1, 99),
  y: clamp(y, 1, 99),
});

/** Move one frame toward a target. x is percentage of scene width, y of
 * height, so the y component is corrected by the viewport aspect ratio
 * (w/h) or the character would stride much faster vertically on a wide
 * plate. Pure + unit-tested; the React stage drives it from rAF. */
export function stepStagePos(
  pos: { x: number; y: number },
  target: { x: number; y: number },
  speed: number,
  dtSeconds: number,
  aspect: number
): { x: number; y: number; arrived: boolean } {
  const s = speed <= 0 ? STAGE2D_DEFAULT_SPEED : speed;
  const dx = target.x - pos.x;
  const a = aspect > 0 ? aspect : 16 / 9;
  // x in width-%, y in height-% — convert y into width-% units so the step
  // magnitude is uniform. (y * a) maps height-% to a width-%-equivalent.
  const dyEquiv = (target.y - pos.y) * a;
  const dist = Math.hypot(dx, dyEquiv);
  const maxStep = s * dtSeconds;
  if (dist <= maxStep || dist === 0) {
    return { x: target.x, y: target.y, arrived: true };
  }
  const nx = pos.x + (dx / dist) * maxStep;
  // Convert the width-% step back to height-% for y.
  const ny = pos.y + ((dyEquiv / dist) * maxStep) / a;
  return { x: nx, y: ny, arrived: false };
}

/** The centre of a hotspot zone in scene percentages. */
export function hotspotCenter(h: Hotspot): { x: number; y: number } {
  return { x: h.bounds.x + h.bounds.w / 2, y: h.bounds.y + h.bounds.h / 2 };
}

/** Is a stage position within `reach` (scene-width %) of a hotspot's
 * centre? Used by the walkable stage to decide when walking onto a zone
 * should fire it. */
export function posReachesHotspot(
  pos: { x: number; y: number },
  h: Hotspot,
  reach: number,
  aspect: number
): boolean {
  const c = hotspotCenter(h);
  const a = aspect > 0 ? aspect : 16 / 9;
  const dx = pos.x - c.x;
  const dy = (pos.y - c.y) * a;
  return Math.hypot(dx, dy) <= reach;
}

/** The topmost hotspot zone containing a plate point (percentages), or
 * null. This is how the walkable stage turns a click into either a
 * walk-to-hotspot destination (a zone) or a ground point (empty plate). */
export function hotspotAtPoint(
  hotspots: Hotspot[],
  p: { x: number; y: number }
): Hotspot | null {
  for (let i = hotspots.length - 1; i >= 0; i--) {
    const h = hotspots[i];
    if (p.x >= h.bounds.x && p.x <= h.bounds.x + h.bounds.w && p.y >= h.bounds.y && p.y <= h.bounds.y + h.bounds.h) {
      return h;
    }
  }
  return null;
}

/* --------------------------- relationships --------------------------- */

/** A per-character disposition, derived from trust + key relationship flags.
 * This is the "Who trusts / fears you" journal. It is DERIVED from saved state
 * (characterTrust + activeFlags), so it persists across saves and reloads
 * without storing anything extra. */
export interface RelationshipOpinion {
  sentiment:
    | "terrified"
    | "hostile"
    | "wary"
    | "neutral"
    | "warming"
    | "trusting"
    | "devoted";
  /** Short label, e.g. "Trusts you" / "Fears you". */
  label: string;
  /** One-line journal entry, e.g. "Caleb fears you." */
  line: string;
  /** Flags that reference this character (by id or first-name slug) — the
   * "key flags" an author can gate a scene or beat on. */
  flags: string[];
}

export function characterOpinion(
  character: { id: string; name: string },
  trust: number,
  activeFlags: Set<string>
): RelationshipOpinion {
  const first = (character.name.split(" ")[0] || character.name).trim();
  const id = character.id.toLowerCase();
  const firstName = first.toLowerCase();
  const flags = [...activeFlags].filter((f) => {
    const l = f.toLowerCase();
    return l.includes(id) || (firstName.length > 1 && l.includes(firstName));
  });
  const t = trust ?? 0;
  if (t >= 4) return { sentiment: "devoted", label: "Trusts you", line: `${first} trusts you completely.`, flags };
  if (t >= 2) return { sentiment: "trusting", label: "Trusts you", line: `${first} trusts you.`, flags };
  if (t >= 1) return { sentiment: "warming", label: "Warming", line: `${first} is warming to you.`, flags };
  if (t <= -4) return { sentiment: "terrified", label: "Fears you", line: `${first} fears you.`, flags };
  if (t <= -2) return { sentiment: "hostile", label: "Resents you", line: `${first} resents you.`, flags };
  if (t <= -1) return { sentiment: "wary", label: "Wary", line: `${first} is wary of you.`, flags };
  return { sentiment: "neutral", label: "Reserved", line: `${first} is still reading you.`, flags };
}

/* ----------------------------- validation ----------------------------- */

export interface ValidationIssue {
  severity: "error" | "warning";
  sceneId: string | null;
  message: string;
}

export function validateStory(story: Story): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // A newly created case is intentionally empty. Treat it as a guided draft
  // state instead of emitting a wall of misleading missing-start/no-ending
  // errors. Publishing is blocked separately by Studio until a first scene exists.
  if (story.scenes.length === 0) {
    return [{ severity: "warning", sceneId: null, message: "Blank canvas — add your first scene, then mark it as the start scene." }];
  }
  const ids = new Set(story.scenes.map((s) => s.id));
  const itemIds = new Set(story.items.map((i) => i.id));
  const characterIds = new Set(story.characters.map((c) => c.id));
  const memoryTags = new Set<string>();
  story.scenes.forEach((sc) => sc.choices?.forEach((c) => c.memoryLog && memoryTags.add(c.memoryLog)));
  // A recall or "Remembers" gate may also key off a story flag (flag names
  // are valid recall keys) or a presented item (`item:<id>`, recorded by the
  // present-item verb). Deliberately NOT built from collectMemoryTags: that
  // harvests the gates' and beats' own keys, which would make this check
  // circular. Only flag neither as a memoryLog tag, a real flag, nor a real
  // item.
  const recallKeys = new Set<string>([...memoryTags, ...collectFlags(story), ...story.items.map((i) => `item:${i.id}`)]);

  const duplicates = (list: string[]) => [...new Set(list.filter((id, i) => list.indexOf(id) !== i))];
  duplicates(story.scenes.map((s) => s.id)).forEach((id) =>
    issues.push({ severity: "error", sceneId: id, message: `Duplicate scene id "${id}". Node links are ambiguous.` })
  );
  duplicates(story.items.map((i) => i.id)).forEach((id) =>
    issues.push({ severity: "error", sceneId: null, message: `Duplicate item id "${id}". Inventory and recipes will misbehave.` })
  );
  duplicates(story.characters.map((c) => c.id)).forEach((id) =>
    issues.push({ severity: "error", sceneId: null, message: `Duplicate character id "${id}". Dialogue voices and trust will collide.` })
  );

  // Talking-portrait sprite sheets: surface malformed sheets as warnings so a
  // bad frame list is caught in the Check tab, not as a frozen portrait in play.
  story.characters.forEach((c) => {
    if (c.talkingSheet)
      spriteSheetIssues(c.talkingSheet, "talking sheet", ["talk", "rest"]).forEach((msg) =>
        issues.push({ severity: "warning", sceneId: null, message: `Character "${c.name}": ${msg}` })
      );
  });

  // Travel map: every pin must land on a real scene, ids must be unique, and
  // a dead-end note target would strand the traveller (bypassedSceneId can't
  // route past a note with no way out).
  if (story.map) {
    duplicates(story.map.locations.map((l) => l.id)).forEach((id) =>
      issues.push({ severity: "error", sceneId: null, message: `Duplicate map location id "${id}".` })
    );
    story.map.locations.forEach((loc) => {
      if (!ids.has(loc.targetSceneId)) {
        issues.push({ severity: "error", sceneId: null, message: `Map location "${loc.label || loc.id}" → missing scene "${loc.targetSceneId}".` });
        return;
      }
      const resolved = story.scenes.find((s) => s.id === bypassedSceneId(story, loc.targetSceneId));
      if (resolved?.nodeType === "note")
        issues.push({ severity: "error", sceneId: resolved.id, message: `Map location "${loc.label || loc.id}" travels to note placeholder "${resolved.title}" with no route out — the traveller would be stranded.` });
      if (!(loc.x >= 0 && loc.x <= 100 && loc.y >= 0 && loc.y <= 100))
        issues.push({ severity: "warning", sceneId: null, message: `Map location "${loc.label || loc.id}" pin sits off the map (x/y must be 0–100%).` });
      if (loc.hiddenWhenLocked && !loc.gating)
        issues.push({ severity: "warning", sceneId: null, message: `Map location "${loc.label || loc.id}" is hiddenWhenLocked but has no gating — it can never be hidden.` });
    });
    // Map-absorbs-travel: warn when the switch is on but can never fire —
    // either nothing to absorb, or every matching choice carries side
    // effects (which absorption deliberately never touches).
    if (story.map.replaceTravelChoices) {
      const targets = new Set(story.map.locations.map((l) => l.targetSceneId));
      const absorbable = story.scenes.some((sc) =>
        (sc.choices ?? []).some((c) => choiceIsPureTravel(c) && targets.has(c.targetSceneId!))
      );
      if (!absorbable)
        issues.push({
          severity: "warning",
          sceneId: null,
          message:
            "Map replaceTravelChoices is on, but no scene has a pure travel choice matching a pin — the setting does nothing. (Choices with flags/meters/items/replies are never absorbed.)",
        });
    }
  }

  if (!ids.has(story.startSceneId))
    issues.push({ severity: "error", sceneId: null, message: `Start scene "${story.startSceneId}" does not exist.` });
  const startScene = story.scenes.find((s) => s.id === story.startSceneId);
  if (startScene?.nodeType === "note")
    issues.push({ severity: "error", sceneId: startScene.id, message: `Start scene "${startScene.title}" is a note placeholder — the player would open on a marker, not a scene. Pick a real start scene.` });

  const edges = storyEdges(story);
  edges.forEach((e) => {
    if (!ids.has(e.target))
      issues.push({ severity: "error", sceneId: e.source, message: `Dangling link → missing scene "${e.target}" (${e.label}).` });
  });

  // ---- STAGE nodes (free-roam walkable scenes) ----
  // (Runs for EVERY scene first: animated foreground extras live on any node.)
  for (const sc of story.scenes) {
    // Malformed sprite sheets on foreground extras (scene- or beat-level
    // cinematics) warn here instead of rendering nothing in play.
    const extraSheets = [
      ...(sc.cinematic?.foregroundExtras ?? []),
      ...(sc.dialogueBeats ?? []).flatMap((b) => b.cinematic?.foregroundExtras ?? []),
    ];
    extraSheets.forEach((e, xi) => {
      if (e.sheet)
        spriteSheetIssues(e.sheet, `foreground extra #${xi + 1} sprite sheet`, ["loop"]).forEach((msg) =>
          issues.push({ severity: "warning", sceneId: sc.id, message: `Scene "${sc.title}": ${msg}` })
        );
    });
  }
  for (const sc of story.scenes) {
    if (sc.nodeType !== "stage") {
      if (sc.stage)
        issues.push({ severity: "warning", sceneId: sc.id, message: `Scene "${sc.title}" carries Stage settings but is not a Stage node — set Node Layout Type to "🚶 Walkable Stage" or the settings do nothing.` });
      if (sc.hideHud)
        issues.push({ severity: "warning", sceneId: sc.id, message: `Scene "${sc.title}" has NO-HUD switched on but is not a Stage node — only "🚶 Walkable Stage — NO HUD" layout scenes can hide the chrome, so this scene still shows its HUD.` });
      continue;
    }
    const label = `Stage "${sc.title}"`;
    if (!sc.stage)
      issues.push({ severity: "warning", sceneId: sc.id, message: `${label} has no Stage settings (floor, spawn, character) — the scene plays as a plain plate with no walker. Open the Scene tab → 🚶 Walkable Stage.` });
    if ((sc.prose ?? "").trim())
      issues.push({ severity: "warning", sceneId: sc.id, message: `${label} has prose, but stage nodes never show the prose panel. Move it into "Caption on scene entry" (Scene tab → 🚶 Walkable Stage) or showText hotspots.` });
    // A stage scene the player can never leave is a soft-lock: exits must be
    // walk-to markers (goToScene hotspots), walk-off-screen edge exits, or
    // an auto-advance — a choice only appears after a conversation, so it
    // can't be the only way out.
    if (!sc.isEnding) {
      const doorOut = (sc.hotspots ?? []).some((h) => h.action.type === "goToScene" && h.action.targetSceneId);
      const edgeOut = Object.values(sc.stage?.exitEdges ?? {}).some((e) => e?.targetSceneId);
      if (!doorOut && !edgeOut && !sc.autoAdvanceTargetSceneId && !(sc.choices ?? []).some((c) => c.targetSceneId))
        issues.push({ severity: "error", sceneId: sc.id, message: `${label} has no way out. Add a hotspot with action "→ Go to scene" (a door/exit marker the player walks to), a walk-off-screen edge exit, or an auto-advance target.` });
    }
    const starters = (sc.hotspots ?? []).filter((h) => h.action.type === "startDialogue");
    const topicStarter = starters.some((h) => (h.action.topics?.length ?? 0) > 0);
    if (starters.length > 0 && !topicStarter && (sc.dialogueBeats ?? []).length === 0)
      issues.push({ severity: "error", sceneId: sc.id, message: `${label} has a "Start conversation" marker but no dialogue beats — write the conversation in the Beats tab or the marker does nothing.` });
    if ((sc.dialogueBeats ?? []).length > 0 && !(sc.hotspots ?? []).some((h) => h.action.type === "startDialogue"))
      issues.push({ severity: "warning", sceneId: sc.id, message: `${label} has dialogue beats but no "Start conversation" (🗣) hotspot — nobody can trigger the conversation. Add a talk marker (Hotspots tab → action type "🗣 Start conversation").` });
    if (sc.stage) {
      const f = stageFloor(sc.stage);
      if (f.bottom <= f.top + 2)
        issues.push({ severity: "warning", sceneId: sc.id, message: `${label} floor band is thinner than ~4% of the plate — give the character room to walk (Scene tab → floor top/bottom).` });
      const spawn = sc.stage.spawn;
      if (spawn && (spawn.y < f.top - 0.5 || spawn.y > f.bottom + 0.5))
        issues.push({ severity: "warning", sceneId: sc.id, message: `${label} spawn point sits outside the walkable floor band — the character snaps to the floor edge on entry.` });
      if ((sc.stage.walkFrames?.length ?? 0) === 1)
        issues.push({ severity: "warning", sceneId: sc.id, message: `${label} walk cycle has a single frame — add at least 2 frames or clear the list to use the procedural bob.` });
      if (sc.stage.playerSheet)
        spriteSheetIssues(sc.stage.playerSheet, "walker sprite sheet", ["walk", "idle"]).forEach((msg) =>
          issues.push({ severity: "warning", sceneId: sc.id, message: `${label} ${msg}` })
        );
      (sc.stage.npcs ?? []).forEach((npc) => {
        if (!npc.sheet) return;
        spriteSheetIssues(npc.sheet, `NPC "${npc.id}" sprite sheet`, ["idle", "walk"]).forEach((msg) =>
          issues.push({ severity: "warning", sceneId: sc.id, message: `${label} ${msg}` })
        );
      });
      // Duplicate NPC ids are silently broken in play: the script-control
      // registry keys actors by id, so the last one mounted wins — a step
      // aimed at the id drives only that actor (and releasing at the end of
      // a script leaves the other one frozen mid-override). Hard error.
      const npcCounts = new Map<string, number>();
      (sc.stage.npcs ?? []).forEach((npc) => npcCounts.set(npc.id, (npcCounts.get(npc.id) ?? 0) + 1));
      npcCounts.forEach((count, id) => {
        if (count > 1)
          issues.push({ severity: "error", sceneId: sc.id, message: `${label} has ${count} NPCs sharing the id "${id}" — scripted-sequence steps (walk / motion / say) key off the id, so they'd drive only one of the actors. Give each ambient NPC its own id.` });
      });
      // Off-plate spawn/waypoints: coordinates are world-% (0–100 on a normal
      // room, 0–worldWidth on a wide one — the classic trap is reading a
      // screenshot position as viewport-% on a 200% room). Anything past the
      // plate edge renders where the camera can never reach: silent in play,
      // so warn here.
      const worldW = sc.stage.worldWidth ?? 100;
      (sc.stage.npcs ?? []).forEach((npc) => {
        if (npc.x < 0 || npc.x > worldW || npc.y < 0 || npc.y > 100)
          issues.push({ severity: "warning", sceneId: sc.id, message: `${label}: NPC "${npc.id}" spawns off the plate at (${Math.round(npc.x)}, ${Math.round(npc.y)}) — on this ${worldW}%-wide room x runs 0–${worldW} and y 0–100, so the actor stands where nobody can see it.` });
        (npc.patrol ?? []).forEach((wp, wi) => {
          if (wp.x < 0 || wp.x > worldW || wp.y < 0 || wp.y > 100)
            issues.push({ severity: "warning", sceneId: sc.id, message: `${label}: NPC "${npc.id}" patrol stop ${wi + 1} sits at (${Math.round(wp.x)}, ${Math.round(wp.y)}) — off the plate for this ${worldW}%-wide room (x must be 0–${worldW}, y 0–100). The actor will walk out of view and hold there.` });
        });
      });
    }
    // Conversations that end in nothing: a stage conversation with no
    // choices and no after-beat route just closes — fine — but if the ONLY
    // exits are choices the player must talk to leave; surface that
    // deliberately-authored pattern as a heads-up, not an error.
    if (!sc.isEnding && !(sc.hotspots ?? []).some((h) => h.action.type === "goToScene") && (sc.choices ?? []).some((c) => c.targetSceneId) && (sc.dialogueBeats ?? []).length > 0)
      issues.push({ severity: "warning", sceneId: sc.id, message: `${label} exits only through choices, which appear after a conversation — the player must talk before they can leave. That can be exactly right; just make sure it's on purpose.` });
  }

  // Reachability. In a season every episode is its own entry point — the
  // player reaches episode two through the season handoff, not through a scene
  // edge — so each episode's opening scene seeds the walk alongside the
  // story's start scene. The heat-bust scene is an entry point too: the engine
  // teleports there when Suspicion hits the limit, so it is reachable even
  // with no choice pointing at it.
  const reachable = new Set<string>();
  const queue = [
    story.startSceneId,
    ...seasonEpisodes(story).map((ep) => ep.startSceneId),
    story.briefing?.heatFailSceneId ?? "",
    // Travel-map destinations are entry points too: the player reaches them
    // through the 🗺 map screen, not through a scene edge, so a location
    // only visitable by travelling must not read as "unreachable".
    ...(story.map?.locations ?? []).map((loc) => loc.targetSceneId),
  ].filter(Boolean);
  while (queue.length) {
    const cur = queue.pop()!;
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    edges.filter((e) => e.source === cur && ids.has(e.target)).forEach((e) => queue.push(e.target));
  }
  story.scenes.forEach((sc) => {
    const isNote = sc.nodeType === "note";
    // A standalone note is a marker not yet wired into the graph — "unreachable"
    // would just be noise. Once something points at it, reachability matters.
    if (!reachable.has(sc.id) && !isNote)
      issues.push({ severity: "warning", sceneId: sc.id, message: `Scene "${sc.title}" is unreachable from the start.` });
    const outs = edges.filter((e) => e.source === sc.id);
    if (isNote) {
      // Notes bypass in play by following their FIRST outgoing route, so a
      // wired-in note with no route out is a soft-lock: flag it loudly.
      if (reachable.has(sc.id) && outs.length === 0)
        issues.push({ severity: "error", sceneId: sc.id, message: `Note "${sc.title}" is wired in but has no route out — a player reaching it would be stuck. Connect its right handle to the scene that should follow, or delete the note.` });
      if ((sc.choices ?? []).filter((c) => !!c.targetSceneId).length > 1)
        issues.push({ severity: "warning", sceneId: sc.id, message: `Note "${sc.title}" has several outgoing routes — only the first one is followed in play. Remove the extras.` });
      return;
    }
    if (!sc.isEnding && outs.length === 0)
      issues.push({ severity: "error", sceneId: sc.id, message: `Scene "${sc.title}" has no exits and is not an ending.` });
    if (!sc.isEnding && outs.length > 0) {
      // A pattern-puzzle hotspot routes through its config (targetSceneId /
      // wrongTargetSceneId), not the action, so count those as exits here too.
      const routesSomewhere = (hotspot: Hotspot) =>
        !!hotspot.action.targetSceneId ||
        (!!hotspot.action.patternPuzzle && (!!hotspot.action.patternPuzzle.targetSceneId || !!hotspot.action.patternPuzzle.wrongTargetSceneId));
      const hasOpenExit = [
        !!sc.autoAdvanceTargetSceneId,
        // An after-beat route cuts automatically when the last beat finishes —
        // it's never gated (the beat may be, but the route itself is open).
        (sc.dialogueBeats ?? []).some((b) => !!b.afterBeatTargetSceneId),
        // A choice that presents an item is effectively gated (you must hold
        // the item), even when it carries no authored gate of its own.
        ...(sc.choices ?? []).map((choice) => !effectiveChoiceGating(choice)),
        // A walk-to / walk-off exit is open when its gate is empty OR can be
        // satisfied from within the room itself (e.g. punch the lid → climb
        // out), so the classic unlock-the-door pattern isn't flagged.
        ...(sc.hotspots ?? []).filter(routesSomewhere).map((hotspot) => gateSatisfiableLocally(hotspot.gating, sc)),
        ...Object.values(sc.stage?.exitEdges ?? {})
          .filter((e) => !!e?.targetSceneId)
          .map((e) => gateSatisfiableLocally(e?.gating, sc)),
      ].some(Boolean);
      if (!hasOpenExit)
        issues.push({ severity: "warning", sceneId: sc.id, message: `Every exit from "${sc.title}" is gated. Confirm the required item or flag can be obtained first.` });
    }
    if (sc.isEnding && !sc.endingData)
      issues.push({ severity: "warning", sceneId: sc.id, message: `Ending "${sc.title}" is missing endingData.` });
    if (sc.autoAdvanceTargetSceneId === sc.id)
      issues.push({ severity: "error", sceneId: sc.id, message: `Auto-advance on "${sc.title}" points back to itself.` });
    if ((sc.autoAdvanceDelaySeconds ?? 0) < 0)
      issues.push({ severity: "warning", sceneId: sc.id, message: `Auto-advance delay on "${sc.title}" should be 0 or higher.` });
    if (sc.autoAdvanceTargetSceneId && (sc.choices ?? []).some((choice) => !choice.hidden && !choice.gating && (choice.reply || !!choice.targetSceneId)))
      issues.push({ severity: "warning", sceneId: sc.id, message: `Auto-advance on "${sc.title}" waits until no selectable choices are available.` });

    const checkGate = (g: Gating | undefined, where: string) => {
      g?.requiresItems?.forEach((i) => {
        if (!itemIds.has(i))
          issues.push({ severity: "error", sceneId: sc.id, message: `${where} requires unknown item "${i}" — impossible gate.` });
      });
    };
    sc.choices?.forEach((c) => {
      checkGate(c.gating, `Choice "${c.text.slice(0, 24)}…"`);
      c.gating?.requiresMemories?.forEach((tag) => {
        if (!recallKeys.has(tag))
          issues.push({ severity: "warning", sceneId: sc.id, message: `Choice "${c.text.slice(0, 28)}…" is gated on memory/flag "${tag}" but no choice sets that memoryLog tag and no such flag exists.` });
      });
      if (!c.reply && !c.targetSceneId)
        issues.push({ severity: "warning", sceneId: sc.id, message: `Choice "${c.text.slice(0, 28)}…" has no target scene — players can't follow it.` });
      if (c.reply && c.targetSceneId)
        issues.push({ severity: "warning", sceneId: sc.id, message: `Reply choice "${c.text.slice(0, 28)}…" also has a target scene — it will navigate instead of answering in place.` });
      if (c.isRepeatable && c.consequences && Object.values(c.consequences).some((value) => Array.isArray(value) && value.length))
        issues.push({ severity: "warning", sceneId: sc.id, message: `Repeatable choice "${c.text.slice(0, 28)}…" changes state and can be farmed.` });
      c.consequences?.addItems?.forEach((i) => {
        if (!itemIds.has(i)) issues.push({ severity: "error", sceneId: sc.id, message: `Choice grants unknown item "${i}".` });
      });
      if (c.presentItem && !itemIds.has(c.presentItem))
        issues.push({ severity: "error", sceneId: sc.id, message: `Choice presents unknown item "${c.presentItem}" — the player can never hold it, so the choice is unreachable.` });
      if (c.quickTime) {
        if (!c.timeLimitSeconds || c.timeLimitSeconds <= 0)
          issues.push({ severity: "warning", sceneId: sc.id, message: `Quick-time choice "${c.text.slice(0, 28)}…" has no timer — set a hard deadline.` });
        if (c.timedOutTargetSceneId && !ids.has(c.timedOutTargetSceneId))
          issues.push({ severity: "error", sceneId: sc.id, message: `Quick-time choice "${c.text.slice(0, 28)}…" routes to missing timed-out scene "${c.timedOutTargetSceneId}".` });
        if (c.reply && c.timedOutTargetSceneId)
          issues.push({ severity: "warning", sceneId: sc.id, message: `Quick-time reply "${c.text.slice(0, 28)}…" has a timed-out target — replies answer in place, so it stays put.` });
      }
    });
    sc.hotspots?.forEach((h) => {
      checkGate(h.gating, `Hotspot "${h.label}"`);
      h.gating?.requiresMemories?.forEach((tag) => {
        if (!recallKeys.has(tag))
          issues.push({ severity: "warning", sceneId: sc.id, message: `Hotspot "${h.label}" is gated on memory/flag "${tag}" but no choice sets that memoryLog tag and no such flag exists.` });
      });
      const { x, y, w, h: height } = h.bounds;
      const maxX = Math.max(100, sc.stage?.worldWidth ?? 100);
      if (x < 0 || y < 0 || w <= 0 || height <= 0 || x + w > maxX || y + height > 100)
        issues.push({ severity: "error", sceneId: sc.id, message: `Hotspot "${h.label}" has invalid percentage bounds.` });
      if (h.action.itemGranted && !itemIds.has(h.action.itemGranted))
        issues.push({ severity: "error", sceneId: sc.id, message: `Hotspot "${h.label}" grants unknown item "${h.action.itemGranted}".` });
      if (h.action.itemConsumed && !itemIds.has(h.action.itemConsumed))
        issues.push({ severity: "error", sceneId: sc.id, message: `Hotspot "${h.label}" consumes unknown item "${h.action.itemConsumed}".` });
      // An item the object promises to answer (tickled in 🎒 Accepts, or a
      // written reply line) but that resolves to NOTHING at runtime: the
      // default action must be 💬 say or 🗝 use-item, or there must be a 🎚
      // "use" verb action. Otherwise the player arms it and gets refused —
      // authored content that can never fire.
      const promised = Array.from(new Set([...(h.acceptsItems ?? []), ...Object.keys(h.itemResponses ?? {})]));
      for (const pid of promised) {
        if (!itemIds.has(pid)) {
          issues.push({ severity: "error", sceneId: sc.id, message: `Hotspot "${h.label}" accepts unknown item "${pid}".` });
        } else if (!resolveVerbAction(h, "use", pid).ok) {
          issues.push({
            severity: "warning",
            sceneId: sc.id,
            message: `Hotspot "${h.label}" accepts "${pid}" but can never answer it: its default action is ${h.action.type} and it has no ⚙ "use" verb action. Add one (💬 say or 🗝 use-item) or remove the item.`,
          });
        }
      }
      // Only hotspots that actually move the player between scenes need a
      // target. In-place mini-games (lockpick, safe, cipher, memory) grant
      // items/flags and keep the player put, so they must NOT be flagged —
      // and neither must the point-and-click USE verb (useItem): "use the
      // wrench on the bike" happens where the player is standing. Any
      // action MAY still carry a targetSceneId and will travel when it does.
      const needsTargetScene: HotspotActionType[] = ["goToScene"];
      if (needsTargetScene.includes(h.action.type) && !h.action.targetSceneId)
        issues.push({ severity: "error", sceneId: sc.id, message: `Hotspot "${h.label}" needs a target scene.` });
      // A repeatable hotspot is only dangerous when it can REPLAY a reward:
      // grant an item, set a flag, or move a meter. A plain navigation
      // hotspot (goToScene with no reward) is repeatable by design — it's
      // the player's way back, and on-enter scenes already guard against
      // first-entry farming.
      const replaysRewards = !!(h.action.itemGranted || h.action.flagSet || h.action.meterChange || (h.action.type === "useItem" && h.action.itemConsumed));
      if (h.isRepeatable && replaysRewards && !["showText", "openBoard"].includes(h.action.type))
        issues.push({ severity: "warning", sceneId: sc.id, message: `Repeatable hotspot "${h.label}" can replay rewards (item, flag or meter). Make it one-shot or remove the reward.` });
    });
    sc.dialogueBeats?.forEach((beat) => {
      // "narrator" is a reserved speaker id for voice-over / narrator lines.
      if (beat.characterId !== "narrator" && !characterIds.has(beat.characterId))
        issues.push({ severity: "error", sceneId: sc.id, message: `Dialogue beat references missing character "${beat.characterId}".` });
      // Recalls may point at a choice memoryLog tag OR a story flag.
      Object.keys(beat.recalls ?? {}).forEach((tag) => {
        if (!recallKeys.has(tag))
          issues.push({ severity: "warning", sceneId: sc.id, message: `Beat "…${beat.text.slice(0, 18)}…" recalls "${tag}" but no choice sets that memoryLog tag and no such flag exists.` });
      });
      beat.conditionRule?.requiresMemories?.forEach((tag) => {
        if (!recallKeys.has(tag))
          issues.push({ severity: "warning", sceneId: sc.id, message: `Beat "…${beat.text.slice(0, 18)}…" is gated on memory/flag "${tag}" but no choice sets that memoryLog tag and no such flag exists.` });
      });
      // "Press the lie" audit. The contradiction beats must speak (valid
      // character or narrator), the evidence must be real items, and a lie
      // with no evidence can never be broken.
      if (beat.lie) {
        const lie = beat.lie;
        const lieBeatOk = (b: DialogueBeat, label: string) => {
          if (b.characterId !== "narrator" && !characterIds.has(b.characterId))
            issues.push({ severity: "error", sceneId: sc.id, message: `Press-the-lie ${label} beat on "…${beat.text.slice(0, 16)}…" is spoken by missing character "${b.characterId}".` });
        };
        lieBeatOk(lie.caughtBeat, "caught");
        if (lie.wrongBeat) lieBeatOk(lie.wrongBeat, "bluff-called");
        if (!lie.evidenceItemIds.length)
          issues.push({ severity: "error", sceneId: sc.id, message: `Press-the-lie beat "…${beat.text.slice(0, 16)}…" names no breaking evidence — the player can never catch the lie. Pick the clue item that proves it false.` });
        lie.evidenceItemIds.forEach((itemId) => {
          if (!itemIds.has(itemId))
            issues.push({ severity: "error", sceneId: sc.id, message: `Press-the-lie beat "…${beat.text.slice(0, 16)}…" needs evidence item "${itemId}", which doesn't exist.` });
        });
        if (!lie.contradictedFlag?.trim())
          issues.push({ severity: "error", sceneId: sc.id, message: `Press-the-lie beat "…${beat.text.slice(0, 16)}…" has no caught flag — set one so the rest of the scene can gate on the lie being broken.` });
        // The caught beat should usually gate on its own flag so it doesn't
        // also appear as an ordinary line before the player presses.
        if (!lie.caughtBeat.conditionRule?.requiresFlags?.includes(lie.contradictedFlag))
          issues.push({ severity: "warning", sceneId: sc.id, message: `Press-the-lie caught beat ("…${lie.caughtBeat.text.slice(0, 16)}…") isn't gated on "${lie.contradictedFlag}" — gate it so the reaction only plays once the player breaks the lie.` });
      }
    });
    // After-beat routes only fire on the LAST visible beat. Flag a route that
    // is authored on a beat followed by another (ungated) beat so it doesn't
    // silently never run — and only when it points somewhere valid (a bad id
    // is already a dangling-link error).
    sc.dialogueBeats?.forEach((beat, i, beats) => {
      if (!beat.afterBeatTargetSceneId) return;
      if (!ids.has(beat.afterBeatTargetSceneId)) return; // dangling link error covers it
      const laterUngated = beats.slice(i + 1).some((b) => !b.conditionRule);
      if (laterUngated) {
        issues.push({ severity: "warning", sceneId: sc.id, message: `Beat "…${beat.text.slice(0, 18)}…" routes to a scene after it, but a later beat follows — only the LAST visible beat's route fires. Move the route to the final beat.` });
      }
    });
    // Interrogation audit: the suspect must be a real character, the crack
    // beat must speak (a valid character or narrator), and the scene needs at
    // least one pressing reply or composure can never break.
    if (sc.interrogation) {
      const q = sc.interrogation;
      if (!characterIds.has(q.characterId))
        issues.push({ severity: "error", sceneId: sc.id, message: `Interrogation in "${sc.title}" targets missing character "${q.characterId}".` });
      if (q.brokeBeat.characterId !== "narrator" && !characterIds.has(q.brokeBeat.characterId))
        issues.push({ severity: "error", sceneId: sc.id, message: `Interrogation crack beat in "${sc.title}" is spoken by missing character "${q.brokeBeat.characterId}".` });
      if ((q.composure ?? 3) < 1)
        issues.push({ severity: "warning", sceneId: sc.id, message: `Interrogation composure in "${sc.title}" is below 1 — the suspect cracks on the first press.` });
      if (!(sc.choices ?? []).some(isPressingReply))
        issues.push({ severity: "warning", sceneId: sc.id, message: `Interrogation in "${sc.title}" has no pressing replies (attitude-tagged replies) — composure can never break.` });
    }
    if (sc.musicMode === "track" && !sc.musicUrl && !sc.sceneAudioUrl)
      issues.push({ severity: "warning", sceneId: sc.id, message: `Scene "${sc.title}" is set to play music but has no track selected.` });
  });

  // Win/lose design audit — a case you cannot win or cannot lose is broken design.
  const endings = story.scenes.filter((s) => s.isEnding);
  const victories = endings.filter((s) => s.endingData?.tier?.startsWith("victory"));
  const failures = endings.filter((s) => s.endingData?.tier === "gameover");
  if (!victories.length)
    issues.push({ severity: "error", sceneId: null, message: "No victory ending exists — the player cannot win this case." });
  if (!failures.length)
    issues.push({ severity: "warning", sceneId: null, message: "No game-over ending exists — there is no real risk of losing." });
  if (!story.briefing?.objective)
    issues.push({ severity: "warning", sceneId: null, message: "No Case File objective set — players won't know what they're trying to do." });
  if (story.briefing?.heatFailSceneId && !ids.has(story.briefing.heatFailSceneId))
    issues.push({ severity: "error", sceneId: null, message: `Heat bust scene "${story.briefing.heatFailSceneId}" does not exist.` });
  if (story.briefing?.heatFailSceneId) {
    const bust = story.scenes.find((s) => s.id === story.briefing!.heatFailSceneId);
    if (bust && !bust.isEnding)
      issues.push({ severity: "warning", sceneId: bust.id, message: `Heat bust scene "${bust.title}" is not marked as an ending.` });
  }

  // Episode audit — a season with a broken chapter map strands the player.
  if (isEpisodic(story)) {
    const episodes = seasonEpisodes(story);
    const seenEpisodeIds = new Set<string>();
    const sceneOwner = new Map<string, string>();
    episodes.forEach((ep) => {
      if (seenEpisodeIds.has(ep.id))
        issues.push({ severity: "error", sceneId: null, message: `Two episodes share the id "${ep.id}".` });
      seenEpisodeIds.add(ep.id);
      if (!ep.sceneIds.length)
        issues.push({ severity: "error", sceneId: null, message: `Episode "${ep.title}" has no scenes assigned.` });
      ep.sceneIds.forEach((sceneId) => {
        if (!ids.has(sceneId)) {
          issues.push({ severity: "error", sceneId: null, message: `Episode "${ep.title}" lists missing scene "${sceneId}".` });
          return;
        }
        const owner = sceneOwner.get(sceneId);
        if (owner)
          issues.push({ severity: "error", sceneId, message: `Scene is claimed by both "${owner}" and "${ep.title}" — a scene belongs to exactly one episode.` });
        else sceneOwner.set(sceneId, ep.title);
      });
      if (!ep.startSceneId)
        issues.push({ severity: "error", sceneId: null, message: `Episode "${ep.title}" has no opening scene.` });
      else if (!ids.has(ep.startSceneId))
        issues.push({ severity: "error", sceneId: null, message: `Episode "${ep.title}" opens on missing scene "${ep.startSceneId}".` });
      else if (!ep.sceneIds.includes(ep.startSceneId))
        issues.push({ severity: "error", sceneId: ep.startSceneId, message: `Episode "${ep.title}" opens on a scene it doesn't own.` });
      // Each episode needs its own curtain — otherwise it can never hand off.
      const epEndings = story.scenes.filter((s) => ep.sceneIds.includes(s.id) && s.isEnding);
      if (!epEndings.length)
        issues.push({ severity: "error", sceneId: null, message: `Episode "${ep.title}" has no ending scene — it can never finish or unlock the next episode.` });
      else if (!epEndings.some((s) => s.endingData?.tier?.startsWith("victory")))
        issues.push({ severity: "warning", sceneId: null, message: `Episode "${ep.title}" has only game-over endings — the player can't clear it.` });
      ep.recapLines?.forEach((line) => {
        if (line.characterId && line.characterId !== "narrator" && !characterIds.has(line.characterId))
          issues.push({ severity: "warning", sceneId: null, message: `Recap line in "${ep.title}" is spoken by missing character "${line.characterId}".` });
      });
    });
    unassignedScenes(story).forEach((sc) => {
      issues.push({ severity: "warning", sceneId: sc.id, message: `Scene "${sc.title}" isn't in any episode — players can reach it but it has no title card, recap or save slots.` });
    });
    // Cross-episode edges that skip the episode handoff.
    storyEdges(story).forEach((edge) => {
      const from = sceneOwner.get(edge.source);
      const to = sceneOwner.get(edge.target);
      if (from && to && from !== to)
        issues.push({
          severity: "warning",
          sceneId: edge.source,
          message: `"${edge.label}" jumps from episode "${from}" straight into "${to}" — episodes normally hand off through an ending card, not a direct link.`,
        });
    });
    const bustScene = story.briefing?.heatFailSceneId;
    if (bustScene && sceneOwner.has(bustScene))
      issues.push({
        severity: "warning",
        sceneId: bustScene,
        message: `The heat bust routes every episode into "${sceneOwner.get(bustScene)}". Players busted in another episode will end up in that chapter's ending — give each episode its own bust scene if that's not intended.`,
      });
    if (episodes.length && story.startSceneId && !episodes[0].sceneIds.includes(story.startSceneId))
      issues.push({ severity: "warning", sceneId: story.startSceneId, message: `The story's start scene isn't in the first episode — the season screen will open episode one instead.` });
  }

  story.deduction?.suspectIds.forEach((id) => {
    if (!characterIds.has(id)) issues.push({ severity: "error", sceneId: null, message: `Corkboard suspect "${id}" is not a character.` });
  });
  story.deduction?.connections.forEach((link) => {
    const validA = itemIds.has(link.a) || characterIds.has(link.a);
    const validB = itemIds.has(link.b) || characterIds.has(link.b);
    if (!validA || !validB)
      issues.push({ severity: "error", sceneId: null, message: `Corkboard link "${link.flagSet}" references a missing node.` });
    if (!itemIds.has(link.a) && !itemIds.has(link.b))
      issues.push({ severity: "warning", sceneId: null, message: `Corkboard link "${link.flagSet}" has no clue item endpoint.` });
  });

  story.items.forEach((item) => {
    if (item.combinableWith?.targetItemId && !itemIds.has(item.combinableWith.targetItemId))
      issues.push({ severity: "error", sceneId: null, message: `Recipe for "${item.name}" references missing ingredient "${item.combinableWith.targetItemId}".` });
    if (item.combinableWith?.resultItemId && !itemIds.has(item.combinableWith.resultItemId))
      issues.push({ severity: "error", sceneId: null, message: `Recipe for "${item.name}" creates missing item "${item.combinableWith.resultItemId}".` });
  });

  // NPC SET MOTIONS: a waypoint (or idle) animation name that the NPC's own
  // sprite sheet doesn't define silently falls back to idle — usually a typo.
  story.scenes.forEach((sc) => {
    sc.stage?.npcs?.forEach((npc) => {
      const anims = npc.sheet?.animations ? Object.keys(npc.sheet.animations) : null;
      if (!anims || !anims.length) return; // no sheet = nothing to check
      const wanted = [
        ...(npc.idleAnim ? [{ where: "idle motion", name: npc.idleAnim }] : []),
        ...(npc.patrol ?? []).flatMap((wp, i) => (wp.anim ? [{ where: `waypoint ${i + 1}`, name: wp.anim }] : [])),
      ];
      wanted.forEach(({ where, name }) => {
        if (!anims.includes(name))
          issues.push({
            severity: "warning",
            sceneId: sc.id,
            message: `Scene "${sc.title}" NPC "${npc.id}" ${where} motion "${name}" is not an animation on its sheet (${anims.join(", ")}) — it will fall back to idle.`,
          });
      });
    });
  });

  // SCRIPTED SEQUENCES: stage-only cutscenes. Catch the three authoring
  // mistakes that would otherwise fail silently at runtime — a runScript
  // hotspot on a classic graphic-novel scene (ignored there by design),
  // a step aimed at an NPC the scene doesn't have, and a goToScene step
  // pointing at a missing scene.
  story.scenes.forEach((sc) => {
    const isStage = sc.nodeType === "stage";
    const npcIds = new Set((sc.stage?.npcs ?? []).map((n) => n.id));
    const checkSteps = (steps: StageScriptStep[], where: string) => {
      if (!steps.length)
        issues.push({ severity: "warning", sceneId: sc.id, message: `Scene "${sc.title}" ${where} is empty — nothing will play.` });
      steps.forEach((st, i) => {
        const npcId = "npcId" in st ? st.npcId : undefined;
        if (npcId && !npcIds.has(npcId))
          issues.push({
            severity: "warning",
            sceneId: sc.id,
            message: `Scene "${sc.title}" ${where} step ${i + 1} (${st.do}) targets NPC "${npcId}" which is not in this scene — the step will be skipped.`,
          });
        if (st.do === "goToScene" && !ids.has(st.targetSceneId))
          issues.push({ severity: "error", sceneId: sc.id, message: `Scene "${sc.title}" ${where} step ${i + 1} goes to missing scene "${st.targetSceneId}".` });
        if (st.do === "goToScene" && i < steps.length - 1)
          issues.push({
            severity: "warning",
            sceneId: sc.id,
            message: `Scene "${sc.title}" ${where}: steps after the goToScene step (step ${i + 1}) will never play.`,
          });
      });
    };
    sc.hotspots?.forEach((h) => {
      if (h.action.type !== "runScript") return;
      if (!isStage)
        issues.push({
          severity: "warning",
          sceneId: sc.id,
          message: `Scene "${sc.title}" hotspot "${h.label}" runs a scripted sequence, but this is not a 🚶 walkable stage — the action is ignored on classic scenes.`,
        });
      checkSteps(h.action.script ?? [], `hotspot "${h.label}" script`);
    });
    if (sc.stage?.enterScript) checkSteps(sc.stage.enterScript, "entry script");
    if (sc.stage?.enterScriptFlag && !(sc.stage.enterScript ?? []).length)
      issues.push({ severity: "warning", sceneId: sc.id, message: `Scene "${sc.title}" has an entry-script run-once flag but no entry script.` });
  });

  // Ambient loop ids the synth engine doesn't know play as SILENCE — no
  // error, no sound. (Beta-test find: a scene shipped with ambientAudio
  // "storm", which is a PARTICLES preset, not an ambient loop — the room's
  // storm was mute.) Keep in sync with audio.ts registry / Studio AMBIENTS.
  const knownAmbients = new Set(["none", "rain", "jazz", "drone", "tension"]);
  story.scenes.forEach((sc) => {
    if (sc.ambientAudio && !knownAmbients.has(sc.ambientAudio))
      issues.push({
        severity: "warning",
        sceneId: sc.id,
        message: `Scene "${sc.title}" ambient loop "${sc.ambientAudio}" is not a known synth loop (${[...knownAmbients].join(" / ")}) — it will play as silence. Did you mean the Particle Effects preset?`,
      });
  });

  // items that can never be obtained but are required somewhere
  const grantable = new Set<string>();
  story.scenes.forEach((sc) => {
    sc.hotspots?.forEach((h) => {
      if (h.action.itemGranted) grantable.add(h.action.itemGranted);
      // A pattern puzzle's reward item is granted from its puzzle config, not
      // the hotspot action — same blind spot as the flag audit above.
      const puzzle = h.action.patternPuzzle;
      puzzle?.rewardConsequences?.addItems?.forEach((i) => grantable.add(i));
    });
    sc.choices?.forEach((c) => {
      c.consequences?.addItems?.forEach((i) => grantable.add(i));
      c.timedOutConsequences?.addItems?.forEach((i) => grantable.add(i));
    });
    sc.onEnterActions?.forEach((a) => a.consequences?.addItems?.forEach((i) => grantable.add(i)));
  });
  story.items.forEach((i) => {
    if (i.combinableWith) grantable.add(i.combinableWith.resultItemId);
  });
  const required = new Set<string>();
  story.scenes.forEach((sc) => {
    sc.choices?.forEach((c) => {
      c.gating?.requiresItems?.forEach((i) => required.add(i));
      // Presenting an item requires holding it, so an ungranted present item
      // is the same softlock as an ungranted gate item.
      if (c.presentItem) required.add(c.presentItem);
    });
    sc.hotspots?.forEach((h) => h.gating?.requiresItems?.forEach((i) => required.add(i)));
    sc.dialogueBeats?.forEach((b) => {
      b.conditionRule?.requiresItems?.forEach((i) => required.add(i));
      // The contradiction can only be won with a held clue — it's required.
      b.lie?.evidenceItemIds.forEach((i) => required.add(i));
    });
  });
  (story.episodes ?? []).forEach((ep) => ep.recapLines?.forEach((l) => l.gating?.requiresItems?.forEach((i) => required.add(i))));
  required.forEach((i) => {
    if (itemIds.has(i) && !grantable.has(i))
      issues.push({ severity: "error", sceneId: null, message: `Item "${i}" is required by a gate but nothing in the story grants it.` });
  });

  const grantableFlags = new Set<string>();
  const requiredFlags = new Set<string>();
  story.scenes.forEach((sc) => {
    sc.choices?.forEach((choice) => {
      choice.consequences?.setFlags?.forEach((flag) => grantableFlags.add(flag));
      choice.timedOutConsequences?.setFlags?.forEach((flag) => grantableFlags.add(flag));
      choice.gating?.requiresFlags?.forEach((flag) => requiredFlags.add(flag));
    });
    sc.hotspots?.forEach((hotspot) => {
      if (hotspot.action.flagSet) grantableFlags.add(hotspot.action.flagSet);
      const puzzle = hotspot.action.patternPuzzle;
      puzzle?.rewardConsequences?.setFlags?.forEach((flag) => grantableFlags.add(flag));
      puzzle?.wrongSubmissionConsequences?.setFlags?.forEach((flag) => grantableFlags.add(flag));
      hotspot.gating?.requiresFlags?.forEach((flag) => requiredFlags.add(flag));
    });
    sc.onEnterActions?.forEach((action) => action.consequences?.setFlags?.forEach((flag) => grantableFlags.add(flag)));
    sc.dialogueBeats?.forEach((beat) => {
      beat.conditionRule?.requiresFlags?.forEach((flag) => requiredFlags.add(flag));
      // Press-the-lie: the caught flag is set by the engine when the player
      // presents the right evidence (like an interrogation crack), so it's
      // grantable; its caught/wrong beats' gates and outcome swings are real.
      if (beat.lie) {
        grantableFlags.add(beat.lie.contradictedFlag);
        beat.lie.contradictedConsequences?.setFlags?.forEach((flag) => grantableFlags.add(flag));
        beat.lie.wrongConsequences?.setFlags?.forEach((flag) => grantableFlags.add(flag));
        beat.lie.caughtBeat.conditionRule?.requiresFlags?.forEach((flag) => requiredFlags.add(flag));
        beat.lie.wrongBeat?.conditionRule?.requiresFlags?.forEach((flag) => requiredFlags.add(flag));
      }
    });
    // Interrogation outcomes are set by the engine at the crack/clamp, not by
    // any authored consequence — treat them as grantable so gates on the
    // broke/clamp flags don't false-positive as impossible.
    if (sc.interrogation) {
      grantableFlags.add(sc.interrogation.brokeFlag);
      if (sc.interrogation.clampFlag) grantableFlags.add(sc.interrogation.clampFlag);
    }
  });
  story.deduction?.connections.forEach((connection) => grantableFlags.add(connection.flagSet));
  // A map location's gate is a real read: a flag whose only purpose is to
  // open a travel destination is used, not orphaned.
  story.map?.locations.forEach((loc) => loc.gating?.requiresFlags?.forEach((flag) => requiredFlags.add(flag)));
  requiredFlags.forEach((flag) => {
    if (!grantableFlags.has(flag)) {
      let message = `Flag "${flag}" is required by a gate but no choice, hotspot, puzzle, or board connection sets it.`;
      if (memoryTags.has(flag))
        message += ` (A choice records the memory "${flag}" via memoryLog — either gate on requiresMemories instead of requiresFlags, or set the flag in that choice's consequences.)`;
      issues.push({ severity: "error", sceneId: null, message });
    }
  });

  // Flag notes for flags that don't exist anywhere — a stray note, or a
  // flag that was renamed but the note wasn't.
  const knownFlags = new Set(collectFlags(story));
  Object.keys(story.flagNotes ?? {}).forEach((flag) => {
    if (!knownFlags.has(flag))
      issues.push({ severity: "warning", sceneId: null, message: `Flag note for "${flag}" doesn't match any flag used in the story.` });
  });

  /* ---------------- craft audit ----------------
   * The checks above prove the graph CAN be walked. These look for the
   * mechanical signatures of a story that walks but never LANDS: a flag that
   * is set and changes nothing, a "she will remember that" with nothing to
   * remember, a deadline that can't alter what happens, two answers that are
   * the same answer in a hat, and long stretches where the player is never
   * asked a thing. That is the discipline Nobody's Witness keeps by hand in
   * its backward-design ledger; the linter keeps it for everyone else.
   * Producers/consumers are walked by hand (like the collectors above) so
   * each issue can name the scene it came from. */
  const flagProducers = new Map<string, string[]>();
  const flagClearers = new Map<string, string[]>();
  const flagConsumers = new Map<string, string[]>();
  const tagProducers = new Map<string, string[]>();
  const tagConsumers = new Map<string, string[]>();
  const addSource = (map: Map<string, string[]>, key: string, sceneId: string | null) => {
    const list = map.get(key);
    if (list) {
      if (sceneId && !list.includes(sceneId)) list.push(sceneId);
    } else map.set(key, sceneId ? [sceneId] : [""]);
  };
  const walkGatingCraft = (g: Gating | undefined, sceneId: string | null) => {
    if (!g) return;
    [...(g.requiresFlags ?? []), ...(g.excludesFlags ?? []), ...(g.requiresMemories ?? [])].forEach((key) =>
      addSource(flagConsumers, key, sceneId)
    );
    // requiresMemories may also key off a memoryLog tag — record it as a tag
    // consumer too; the dead-tag check ignores plain flags.
    g.requiresMemories?.forEach((t) => addSource(tagConsumers, t, sceneId));
  };
  const walkConsequencesCraft = (c: Consequences | undefined, sceneId: string | null) => {
    c?.setFlags?.forEach((f) => addSource(flagProducers, f, sceneId));
    c?.clearFlags?.forEach((f) => addSource(flagClearers, f, sceneId));
  };
  story.scenes.forEach((sc) => {
    sc.choices?.forEach((c) => {
      walkGatingCraft(c.gating, sc.id);
      walkConsequencesCraft(c.consequences, sc.id);
      walkConsequencesCraft(c.timedOutConsequences, sc.id);
      if (c.memoryLog) addSource(tagProducers, c.memoryLog, sc.id);
      if (c.presentItem) addSource(tagProducers, `item:${c.presentItem}`, sc.id);
    });
    sc.hotspots?.forEach((h) => {
      walkGatingCraft(h.gating, sc.id);
      if (h.action.flagSet) addSource(flagProducers, h.action.flagSet, sc.id);
      walkConsequencesCraft(h.action.patternPuzzle?.rewardConsequences, sc.id);
      walkConsequencesCraft(h.action.patternPuzzle?.wrongSubmissionConsequences, sc.id);
    });
    sc.onEnterActions?.forEach((a) => {
      walkGatingCraft(a.conditionRule, sc.id);
      walkConsequencesCraft(a.consequences, sc.id);
    });
    sc.dialogueBeats?.forEach((b) => {
      walkGatingCraft(b.conditionRule, sc.id);
      // A recall key is a memoryLog tag OR a story flag — consume it as both
      // so either producer recognises the payoff.
      Object.keys(b.recalls ?? {}).forEach((key) => {
        addSource(flagConsumers, key, sc.id);
        addSource(tagConsumers, key, sc.id);
      });
      // Press-the-lie: the engine sets contradictedFlag when the lie breaks
      // (like an interrogation crack), reads it to know the claim is won, and
      // the caught beat normally gates on it. Walk both reactions' gates and
      // both outcome swings so their flags count as produced/consumed.
      if (b.lie) {
        const lie = b.lie;
        addSource(flagProducers, lie.contradictedFlag, sc.id);
        addSource(flagConsumers, lie.contradictedFlag, sc.id);
        walkConsequencesCraft(lie.contradictedConsequences, sc.id);
        walkConsequencesCraft(lie.wrongConsequences, sc.id);
        walkGatingCraft(lie.caughtBeat.conditionRule, sc.id);
        Object.keys(lie.caughtBeat.recalls ?? {}).forEach((key) => {
          addSource(flagConsumers, key, sc.id);
          addSource(tagConsumers, key, sc.id);
        });
        if (lie.wrongBeat) {
          walkGatingCraft(lie.wrongBeat.conditionRule, sc.id);
          Object.keys(lie.wrongBeat.recalls ?? {}).forEach((key) => {
            addSource(flagConsumers, key, sc.id);
            addSource(tagConsumers, key, sc.id);
          });
        }
      }
    });
    if (sc.interrogation) {
      // The engine reads these flags itself: it selects the crack/clamp beat
      // and gates the interrogation HUD on them. They are both produced and
      // consumed by the runtime, so they never need an authored gate.
      addSource(flagProducers, sc.interrogation.brokeFlag, sc.id);
      addSource(flagConsumers, sc.interrogation.brokeFlag, sc.id);
      if (sc.interrogation.clampFlag) {
        addSource(flagProducers, sc.interrogation.clampFlag, sc.id);
        addSource(flagConsumers, sc.interrogation.clampFlag, sc.id);
      }
      walkConsequencesCraft(sc.interrogation.brokeConsequences, sc.id);
      walkConsequencesCraft(sc.interrogation.clampConsequences, sc.id);
    }
  });
  // Corkboard connection flags are produced and read by the deduction board
  // at runtime (solved connections / "case cracked" tally).
  story.deduction?.connections.forEach((c) => {
    addSource(flagProducers, c.flagSet, null);
    addSource(flagConsumers, c.flagSet, null);
  });
  // A flag with an authored flagNote is read by the player: it renders in the
  // Case File "Story so far" readout. Notes are therefore intentional story
  // breadcrumbs — a noted flag that never gates content is a journal entry,
  // not a dead wire. An UNNOTED flag that changes nothing is the real miss:
  // the player acted, and the world never said so or bent.
  Object.keys(story.flagNotes ?? {}).forEach((flag) => addSource(flagConsumers, flag, null));
  (story.episodes ?? []).forEach((ep) => {
    ep.recapLines?.forEach((line) => walkGatingCraft(line.gating, null));
  });
  // A "Previously on…" that replays the player's own lines consumes every
  // recorded memory in the season. In a season, every memoryLog/rememberLine
  // choice also lands on the episode-end card as a "your defining choices"
  // highlight, so in episodic stories recorded memories have an audience by
  // construction — don't nag about them.
  const memoryHasAudience = isEpisodic(story) || (story.episodes ?? []).some((ep) => ep.recapFromMemories);

  // (a) Flags that are set but never read — the silent dead payoff. This is
  // the automated backward-design ledger: if a flag never gates a scene,
  // feeds a beat recall, or clears a condition, the player's action that set
  // it changed nothing about the story.
  flagProducers.forEach((where, flag) => {
    if (flagConsumers.has(flag)) return;
    issues.push({
      severity: "warning",
      sceneId: where[0] || null,
      message: `Flag "${flag}" is set but never read — no gate, beat recall, recap or flag-note depends on it, so nothing the player does with it changes a scene, a line, or the journal. Wire it to a payoff, give it a flag note, or remove it.`,
    });
  });
  // (b) Flags that are cleared but never set — the clear can never fire (the
  // flag starts unset), so whatever it was meant to take away is still there.
  flagClearers.forEach((where, flag) => {
    if (flagProducers.has(flag)) return;
    issues.push({
      severity: "warning",
      sceneId: where[0] || null,
      message: `Flag "${flag}" is cleared somewhere but never set anywhere — a flag starts unset, so that clear does nothing. Set it first (or delete the clear).`,
    });
  });
  // (c) Memory tags that are recorded but never recalled — "the character
  // remembers what you said" with no scene where they do. Present-item keys
  // (item:<id>) are self-describing and skip this.
  tagProducers.forEach((where, tag) => {
    if (tag.startsWith("item:") || tagConsumers.has(tag) || memoryHasAudience) return;
    issues.push({
      severity: "warning",
      sceneId: where[0] || null,
      message: `Memory "${tag}" is recorded by a choice but never recalled — no later beat echoes it and no gate remembers it, so the player's words leave no trace. Add a recall/remembers gate or drop the memoryLog tag.`,
    });
  });
  // (d) A "X will remember that" card with nothing behind it. The card is a
  // PROMISE; with no memory tag, no presented item and no state change, the
  // story has recorded nothing it could possibly remember.
  const choiceCarriesPayload = (c: Choice): boolean =>
    !!c.memoryLog ||
    !!c.presentItem ||
    (c.consequences ? Object.values(c.consequences).some((v) => Array.isArray(v) && v.length > 0) : false) ||
    (c.timedOutConsequences ? Object.values(c.timedOutConsequences).some((v) => Array.isArray(v) && v.length > 0) : false);
  story.scenes.forEach((sc) => {
    sc.choices?.forEach((c) => {
      if (c.rememberLine && !choiceCarriesPayload(c))
        issues.push({
          severity: "warning",
          sceneId: sc.id,
          message: `Choice "${c.text.slice(0, 26)}…" shows a "will remember that" card but tags no memory and changes no state — there is nothing to remember. Give it a memoryLog tag (a later beat can then recall it) or consequences.`,
        });
    });
  });
  // (e) Fake deadlines: a quick-time prompt whose expiry cannot change what
  // happens. The engine routes a timeout to timedOutTargetSceneId ?? target,
  // so a QTE with no distinct timeout scene and no timeout consequences —
  // including a quick-time REPLY (replies answer in place) — plays out
  // identically whether the player reacts or freezes. Hesitation must be a
  // real branch, or the timer is just decoration.
  const consequencesKey = (c?: Consequences): string =>
    JSON.stringify({
      setFlags: [...(c?.setFlags ?? [])].sort(),
      clearFlags: [...(c?.clearFlags ?? [])].sort(),
      addItems: [...(c?.addItems ?? [])].sort(),
      removeItems: [...(c?.removeItems ?? [])].sort(),
      meterChanges: [...(c?.meterChanges ?? [])].map((m) => `${m.meter}:${m.delta}`).sort(),
      trustChanges: [...(c?.trustChanges ?? [])].map((t) => `${t.characterId}:${t.delta}`).sort(),
    });
  story.scenes.forEach((sc) => {
    sc.choices?.forEach((c) => {
      if (!c.quickTime) return;
      const timeoutLandsSame = c.reply || (c.timedOutTargetSceneId ?? c.targetSceneId) === c.targetSceneId;
      const timeoutChangesNothing = consequencesKey(c.timedOutConsequences) === consequencesKey(undefined);
      if (timeoutLandsSame && timeoutChangesNothing)
        issues.push({
          severity: "warning",
          sceneId: sc.id,
          message: `Quick-time choice "${c.text.slice(0, 26)}…" changes nothing when the timer runs out — hesitation lands on the same${c.reply ? " reply" : " scene"} with no timeout consequences. A deadline that costs nothing trains players to ignore every timer: route the timeout elsewhere or give it "hesitated" consequences.`,
        });
    });
  });
  // (f) The same decision in a hat: two visible, ungated choices that answer
  // identically — same destination (or both in-place replies), same attitude,
  // same effects, no memory of either. Players feel the illusion immediately.
  story.scenes.forEach((sc) => {
    const pickable = (sc.choices ?? []).filter(
      (c) => !c.hidden && !c.gating && !effectiveChoiceGating(c) && (c.reply || !!c.targetSceneId)
    );
    for (let i = 0; i < pickable.length; i++) {
      for (let j = i + 1; j < pickable.length; j++) {
        const a = pickable[i];
        const b = pickable[j];
        if (a.reply !== b.reply) continue;
        if (!a.reply && a.targetSceneId !== b.targetSceneId) continue;
        if ((a.attitudeTag ?? "Neutral") !== (b.attitudeTag ?? "Neutral")) continue;
        if (consequencesKey(a.consequences) !== consequencesKey(b.consequences)) continue;
        if (a.memoryLog || b.memoryLog || a.presentItem || b.presentItem) continue;
        issues.push({
          severity: "warning",
          sceneId: sc.id,
          message: `Choices "${a.text.slice(0, 22)}…" and "${b.text.slice(0, 22)}…" are the same decision twice — same destination, same attitude, same effects, and neither is remembered. Merge them, or make the two answers lead (or cost) something different.`,
        });
      }
    }
  });
  // (g) Passive corridors: a run of scenes with no choice, hotspot or
  // interrogation where the player only clicks Continue. Credits/cutscene
  // nodes are authored non-interactive set-pieces and break the chain; notes
  // aren't real scenes. Flag runs of PASSIVE_RUN_MIN or more.
  const PASSIVE_RUN_MIN = 4;
  const isPassiveScene = (sc: SceneNode): boolean => {
    if (sc.nodeType === "note" || sc.nodeType === "cutscene" || sc.nodeType === "credits") return false;
    if (sc.isEnding || sc.interrogation) return false;
    if ((sc.choices ?? []).length > 0) return false;
    if ((sc.hotspots ?? []).length > 0) return false;
    return true;
  };
  const outByScene = new Map<string, StoryEdge[]>();
  edges.forEach((e) => {
    const list = outByScene.get(e.source) ?? [];
    list.push(e);
    outByScene.set(e.source, list);
  });
  const sceneByIdMap = new Map(story.scenes.map((s) => [s.id, s]));
  const corridorReported = new Set<string>();
  reachable.forEach((startId) => {
    const startScene = sceneByIdMap.get(startId);
    if (!startScene || !isPassiveScene(startScene)) return;
    const chain: string[] = [];
    const guard = new Set<string>();
    let cur: string | undefined = startId;
    while (cur) {
      if (guard.has(cur)) break;
      guard.add(cur);
      const sc = sceneByIdMap.get(cur);
      if (!sc || !isPassiveScene(sc)) break;
      chain.push(cur);
      // Passive scenes only leave via auto edges (auto-advance, after-beat).
      // More than one distinct destination is a junction — stop counting.
      const nextIds: string[] = (outByScene.get(cur) ?? []).filter((e) => ids.has(e.target)).map((e) => e.target);
      const nextSet = new Set(nextIds);
      if (nextSet.size !== 1) break;
      cur = nextIds[0];
    }
    if (chain.length >= PASSIVE_RUN_MIN && !corridorReported.has(chain[0])) {
      chain.forEach((id) => corridorReported.add(id));
      const names = chain.slice(0, 4).map((id) => `"${sceneByIdMap.get(id)?.title ?? id}"`).join(" → ");
      issues.push({
        severity: "warning",
        sceneId: chain[0],
        message: `${chain.length} scenes in a row with no choice, hotspot or interrogation (${names}${chain.length > 4 ? " …" : ""}) — the player is only clicking Continue. Ask something mid-run, or collapse the stretch into a cutscene/credits node.`,
      });
    }
  });

  /* ---------------- acts ----------------
   * Act membership is derived by walking choice edges from each act's start
   * scene and stopping at the next act's start (routeGraph.scenesInAct).
   * That keeps the structure honest to the graph, but it means an ordinary
   * edit — one callback link, a moved start scene — can silently reshape or
   * merge whole acts. Nothing else in the engine would complain, so these
   * checks are the only thing standing between an author and a route map
   * that quietly shows the wrong scenes. */
  const acts = story.acts ?? [];
  if (acts.length) {
    duplicates(acts.map((a) => a.id)).forEach((id) =>
      issues.push({ severity: "error", sceneId: null, message: `Duplicate act id "${id}". Act boundaries and route maps will collide.` })
    );

    // Local copy of the containment walk. logic.ts must not import from
    // game/routeGraph (that module pulls in journey/render types), so the
    // rule lives here; both implementations follow the SAME edge set
    // (choices, timeout routes, auto-advance, scene-moving hotspots, puzzle
    // targets) and stop at foreign act starts, so they agree by
    // construction.
    const byId = new Map(story.scenes.map((sc) => [sc.id, sc]));
    const reach = (actId: string): Set<string> => {
      const act = acts.find((a) => a.id === actId);
      const out = new Set<string>();
      if (!act) return out;
      const boundaries = new Set(acts.filter((a) => a.id !== actId).map((a) => a.startSceneId));
      const queue = [act.startSceneId];
      while (queue.length) {
        const id = queue.shift()!;
        if (!id || out.has(id) || boundaries.has(id)) continue;
        const sc = byId.get(id);
        if (!sc) continue;
        out.add(id);
        if (sc.isEnding) continue;
        if (sc.autoAdvanceTargetSceneId) queue.push(sc.autoAdvanceTargetSceneId);
        for (const c of sc.choices ?? []) {
          if (c.targetSceneId) queue.push(c.targetSceneId);
          if (c.timedOutTargetSceneId) queue.push(c.timedOutTargetSceneId);
        }
        for (const h of sc.hotspots ?? []) {
          if (h.action.targetSceneId) queue.push(h.action.targetSceneId);
          const puzzle = h.action.patternPuzzle;
          if (puzzle?.targetSceneId) queue.push(puzzle.targetSceneId);
          if (puzzle?.wrongTargetSceneId) queue.push(puzzle.wrongTargetSceneId);
        }
      }
      return out;
    };

    const owned = new Map(acts.map((a) => [a.id, reach(a.id)]));

    acts.forEach((act) => {
      if (!act.startSceneId)
        issues.push({ severity: "error", sceneId: null, message: `Act "${act.label || act.id}" has no start scene, so it owns nothing and never opens.` });
      else if (!ids.has(act.startSceneId))
        issues.push({ severity: "error", sceneId: null, message: `Act "${act.label || act.id}" starts at "${act.startSceneId}", which no longer exists. Point it at a scene that does.` });
      else if ((owned.get(act.id)?.size ?? 0) === 0)
        issues.push({ severity: "warning", sceneId: act.startSceneId, message: `Act "${act.label || act.id}" is empty — another act's start scene blocks the walk immediately.` });
    });

    // Two acts owning the same scene means it appears on both route maps.
    for (let i = 0; i < acts.length; i++) {
      for (let j = i + 1; j < acts.length; j++) {
        const a = owned.get(acts[i].id) ?? new Set<string>();
        const b = owned.get(acts[j].id) ?? new Set<string>();
        const shared = [...a].filter((x) => b.has(x));
        if (shared.length)
          issues.push({
            severity: "warning",
            sceneId: shared[0],
            message: `Acts "${acts[i].label || acts[i].id}" and "${acts[j].label || acts[j].id}" both contain ${shared.length} scene(s) (${shared.slice(0, 3).join(", ")}${shared.length > 3 ? "…" : ""}). A link crossing an act boundary merges them — both route maps will show these scenes.`,
          });
      }
    }

    // Scenes no act can reach get no act card and no route map. Legitimate
    // for a scene the engine jumps to from anywhere (a heat-failure ending),
    // so this is a note, not an error.
    const claimed = new Set<string>();
    owned.forEach((set) => set.forEach((id) => claimed.add(id)));
    const stranded = story.scenes.filter((sc) => !claimed.has(sc.id));
    if (stranded.length)
      issues.push({
        severity: "warning",
        sceneId: stranded[0].id,
        message: `${stranded.length} scene(s) belong to no act (${stranded.slice(0, 3).map((sc) => sc.title || sc.id).join(", ")}${stranded.length > 3 ? "…" : ""}). They play normally but get no act title card and never appear on a route map.`,
      });
  }

  return issues;
}

/* ------------------------------ helpers ------------------------------- */

export function sceneById(story: Story, id: string): SceneNode | undefined {
  return story.scenes.find((s) => s.id === id);
}

/** Notes are author placeholders ("Missing Scene Here") — the game bypasses
 * them: this resolves the scene the player actually lands on by following a
 * note's single outgoing route (its first choice) until a real scene. Notes
 * with no route resolve to themselves (the author's dead end, flagged by the
 * validator). The hop guard keeps a note→note cycle from spinning forever. */
export function bypassedSceneId(story: Story, id: string): string {
  let cur = id;
  const seen = new Set<string>();
  for (let hops = 0; hops < 32 && !seen.has(cur); hops++) {
    seen.add(cur);
    const sc = story.scenes.find((s) => s.id === cur);
    if (!sc || sc.nodeType !== "note") return cur;
    const out = (sc.choices ?? []).find((c) => !!c.targetSceneId)?.targetSceneId;
    if (!out || !story.scenes.some((s) => s.id === out)) return cur;
    cur = out;
  }
  return cur;
}
