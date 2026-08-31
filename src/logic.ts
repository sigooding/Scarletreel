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
  Hotspot,
  HotspotActionType,
  Interrogation,
  Item,
  MapLocation,
  MeterKey,
  RecapLine,
  SceneNode,
  SeasonLog,
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
 * slots (Telltale-style), while non-episodic stories keep their original,
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
export const CURSOR_ICON: Record<string, string> = { look: "👁", take: "✋", talk: "💬", use: "⚙", go: "➜" };

/** Default walk speed: scene-width % per second. */
export const STAGE2D_DEFAULT_SPEED = 18;
/** Default reach distance: scene-width % within which a hotspot fires. */
export const STAGE2D_DEFAULT_REACH = 4;
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
 *  lands somewhere the character can stand. */
export function clampToFloor(x: number, y: number, floor: { top: number; bottom: number }): { x: number; y: number } {
  return { x: clamp(x, 1, 99), y: clamp(y, floor.top, floor.bottom) };
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

/** Where a hotspot's stage MARKER stands: the bottom-centre of its zone
 *  (a thing sits ON the ground), clamped into the floor band so the
 *  character can always walk to it. */
export function stageMarkerPoint(
  h: Hotspot,
  floor: { top: number; bottom: number }
): { x: number; y: number } {
  return clampToFloor(h.bounds.x + h.bounds.w / 2, h.bounds.y + h.bounds.h, floor);
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

  // ---- STAGE nodes (Telltale-style walkable scenes) ----
  for (const sc of story.scenes) {
    if (sc.nodeType !== "stage") {
      if (sc.stage)
        issues.push({ severity: "warning", sceneId: sc.id, message: `Scene "${sc.title}" carries Stage settings but is not a Stage node — set Node Layout Type to "🚶 Walkable Stage" or the settings do nothing.` });
      continue;
    }
    const label = `Stage "${sc.title}"`;
    if (!sc.stage)
      issues.push({ severity: "warning", sceneId: sc.id, message: `${label} has no Stage settings (floor, spawn, character) — the scene plays as a plain plate with no walker. Open the Scene tab → 🚶 Walkable Stage.` });
    if ((sc.prose ?? "").trim())
      issues.push({ severity: "warning", sceneId: sc.id, message: `${label} has prose, but stage nodes never show the prose panel. Move it into "Caption on scene entry" (Scene tab → 🚶 Walkable Stage) or showText hotspots.` });
    // A stage scene the player can never leave is a soft-lock: exits must be
    // walk-to markers (goToScene hotspots) or an auto-advance — a choice
    // only appears after a conversation, so it can't be the only way out.
    if (!sc.isEnding) {
      const doorOut = (sc.hotspots ?? []).some((h) => h.action.type === "goToScene" && h.action.targetSceneId);
      if (!doorOut && !sc.autoAdvanceTargetSceneId && !(sc.choices ?? []).some((c) => c.targetSceneId))
        issues.push({ severity: "error", sceneId: sc.id, message: `${label} has no way out. Add a hotspot with action "→ Go to scene" (a door/exit marker the player walks to), or an auto-advance target.` });
    }
    if ((sc.hotspots ?? []).some((h) => h.action.type === "startDialogue") && (sc.dialogueBeats ?? []).length === 0)
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
        spriteSheetIssues(sc.stage.playerSheet, "walker sprite sheet").forEach((msg) =>
          issues.push({ severity: "warning", sceneId: sc.id, message: `${label} ${msg}` })
        );
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
        ...(sc.hotspots ?? []).filter(routesSomewhere).map((hotspot) => !hotspot.gating),
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
      if (x < 0 || y < 0 || w <= 0 || height <= 0 || x + w > 100 || y + height > 100)
        issues.push({ severity: "error", sceneId: sc.id, message: `Hotspot "${h.label}" has invalid percentage bounds.` });
      if (h.action.itemGranted && !itemIds.has(h.action.itemGranted))
        issues.push({ severity: "error", sceneId: sc.id, message: `Hotspot "${h.label}" grants unknown item "${h.action.itemGranted}".` });
      if (h.action.itemConsumed && !itemIds.has(h.action.itemConsumed))
        issues.push({ severity: "error", sceneId: sc.id, message: `Hotspot "${h.label}" consumes unknown item "${h.action.itemConsumed}".` });
      // Only hotspots that actually move the player between scenes need a
      // target. In-place mini-games (lockpick, safe, cipher, memory) grant
      // items/flags and keep the player put, so they must NOT be flagged.
      const needsTargetScene: HotspotActionType[] = ["goToScene", "useItem"];
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
    if (!grantableFlags.has(flag))
      issues.push({ severity: "error", sceneId: null, message: `Flag "${flag}" is required by a gate but no choice, hotspot, puzzle, or board connection sets it.` });
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
