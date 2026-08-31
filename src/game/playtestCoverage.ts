/**
 * PLAYTEST COVERAGE — what your last run actually exercised.
 *
 * The validator answers "can this be reached?" (static: it walks the graph
 * from the start scene). It cannot answer "did I actually reach it?" — the
 * branch you have never played is exactly the branch most likely to be
 * broken, and finding out means replaying the whole case.
 *
 * So the engine keeps a tally while you play: every scene you ENTER and every
 * choice you PICK is counted, per story, in localStorage. It survives reloads
 * and closing the tab, accumulates across playthroughs (so coverage grows as
 * you test different branches), and resets on demand from Studio.
 *
 * Nothing here affects play — no state is read back into the game, and a
 * missing or corrupt record is simply treated as "nothing recorded yet".
 */

import type { Story } from "../types";

export const COVERAGE_VERSION = 1;

export interface PlaytestCoverage {
  version: number;
  storyId: string;
  /** when recording first started */
  startedAt: number;
  /** last time anything was recorded */
  updatedAt: number;
  /** how many times a playthrough reached an ending scene */
  runs: number;
  /** scene id → number of visits */
  scenes: Record<string, number>;
  /** `${sceneId}:${choiceId}` → number of times picked */
  choices: Record<string, number>;
}

export const coverageKey = (storyId: string) => `scarlet-reel-coverage:${storyId}`;

export function emptyCoverage(storyId: string, at = Date.now()): PlaytestCoverage {
  return { version: COVERAGE_VERSION, storyId, startedAt: at, updatedAt: at, runs: 0, scenes: {}, choices: {} };
}

/** A stored record, or null when there isn't one (or it is unreadable /
 *  malformed / from an older schema — a bad value must never break play). */
export function readCoverage(storyId: string): PlaytestCoverage | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(coverageKey(storyId));
  } catch {
    return null; // storage unavailable (private mode, disabled cookies)
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const c = parsed as Partial<PlaytestCoverage>;
  if (c.version !== COVERAGE_VERSION) return null; // old format: start fresh
  if (typeof c.storyId !== "string" || c.storyId !== storyId) return null;
  return {
    version: COVERAGE_VERSION,
    storyId,
    startedAt: typeof c.startedAt === "number" ? c.startedAt : Date.now(),
    updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : Date.now(),
    runs: typeof c.runs === "number" && c.runs >= 0 ? c.runs : 0,
    scenes: isCountMap(c.scenes) ? c.scenes : {},
    choices: isCountMap(c.choices) ? c.choices : {},
  };
}

function isCountMap(v: unknown): v is Record<string, number> {
  return !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v as Record<string, unknown>).every((n) => typeof n === "number");
}

export function writeCoverage(cov: PlaytestCoverage): void {
  try {
    localStorage.setItem(coverageKey(cov.storyId), JSON.stringify(cov));
  } catch {
    /* storage unavailable — coverage just won't persist */
  }
}

export function clearCoverage(storyId: string): void {
  try {
    localStorage.removeItem(coverageKey(storyId));
  } catch {
    /* nothing to clear */
  }
}

/** Record one visit / one pick. Pure — returns the new record, writes nothing. */
export function recordVisit(
  cov: PlaytestCoverage,
  kind: "scene" | "choice",
  id: string,
  at = Date.now()
): PlaytestCoverage {
  if (!id) return cov;
  const bag = kind === "scene" ? cov.scenes : cov.choices;
  return {
    ...cov,
    updatedAt: at,
    ...(kind === "scene" ? { scenes: { ...bag, [id]: (bag[id] ?? 0) + 1 } } : { choices: { ...bag, [id]: (bag[id] ?? 0) + 1 } }),
  };
}

/** Count a finished playthrough (a run that landed on an ending). */
export function recordRun(cov: PlaytestCoverage, at = Date.now()): PlaytestCoverage {
  return { ...cov, runs: cov.runs + 1, updatedAt: at };
}

/* ------------------------------------------------------------------ */
/*  Reporting                                                          */
/* ------------------------------------------------------------------ */

export interface CoverageGap {
  sceneId?: string;
  sceneTitle?: string;
  choiceId?: string;
  text: string;
}

export interface CoverageReport {
  /** scene tallies */
  sceneTotal: number;
  sceneVisited: number;
  missedScenes: CoverageGap[];
  /** choice tallies */
  choiceTotal: number;
  choiceTaken: number;
  missedChoices: CoverageGap[];
  /** endings */
  endingTotal: number;
  endingSeen: number;
  missedEndings: CoverageGap[];
  /** completed playthroughs */
  runs: number;
  /** last recorded activity, if any */
  updatedAt?: number;
  startedAt?: number;
}

/** Compare a story against what has been played. Pure — safe to unit test. */
export function coverageReport(story: Story, cov: PlaytestCoverage | null): CoverageReport {
  const scenes = story.scenes ?? [];
  const missedScenes: CoverageGap[] = [];
  const missedChoices: CoverageGap[] = [];
  const missedEndings: CoverageGap[] = [];
  let sceneVisited = 0;
  let choiceTotal = 0;
  let choiceTaken = 0;
  let endingTotal = 0;
  let endingSeen = 0;

  for (const sc of scenes) {
    const visits = cov?.scenes?.[sc.id] ?? 0;
    if (visits > 0) sceneVisited++;
    else missedScenes.push({ sceneId: sc.id, sceneTitle: sc.title, text: sc.title });
    if (sc.isEnding) {
      endingTotal++;
      if (visits > 0) endingSeen++;
      else missedEndings.push({ sceneId: sc.id, sceneTitle: sc.title, text: sc.title });
    }
    for (const c of sc.choices ?? []) {
      choiceTotal++;
      const key = `${sc.id}:${c.id}`;
      if ((cov?.choices?.[key] ?? 0) > 0) choiceTaken++;
      else missedChoices.push({ sceneId: sc.id, sceneTitle: sc.title, choiceId: c.id, text: c.text });
    }
  }

  return {
    sceneTotal: scenes.length,
    sceneVisited,
    missedScenes,
    choiceTotal,
    choiceTaken,
    missedChoices,
    endingTotal,
    endingSeen,
    missedEndings,
    runs: cov?.runs ?? 0,
    ...(cov?.updatedAt ? { updatedAt: cov.updatedAt } : {}),
    ...(cov?.startedAt ? { startedAt: cov.startedAt } : {}),
  };
}

/** 0–100, or 0 for an empty story (nothing to cover). */
export function coveragePercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(done, total) / total) * 100);
}
