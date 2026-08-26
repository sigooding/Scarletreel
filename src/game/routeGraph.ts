import type { JourneyStep, Story } from "../types";

/* ------------------------------------------------------------------ *
 *  ROUTE GRAPH
 *
 *  Turns story data + the player's journey into a branching tree for the
 *  route map. The hand-rolled chart draws a linear spine of decisions;
 *  this instead walks the actual scene graph so the player sees the
 *  WHOLE shape of an act — including the branches they never entered.
 *
 *  Everything here is pure: no React, no layout library. The Detroit
 *  chart is a layered DAG, so we do a longest-path layering (a node sits
 *  one rank below its deepest parent) which keeps every edge pointing
 *  forward and stops branches from crossing back over the spine.
 * ------------------------------------------------------------------ */

export type RouteStatus = "taken" | "missed" | "locked";

export interface RouteNode {
  id: string;
  sceneId: string;
  label: string;
  /** rank from the act's opening scene */
  depth: number;
  /** lane within the rank */
  lane: number;
  status: RouteStatus;
  isEnding: boolean;
  endingTier?: string;
  /** scene the player is standing in right now */
  isCurrent: boolean;
}

export interface RouteEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  attitude: string;
  status: RouteStatus;
  /** A loop-back edge (e.g. "Back to the hall") — kept for drawing, but
   *  excluded from layering so cycles can't pump the ranks. */
  isBack?: boolean;
}

export interface RouteGraph {
  nodes: RouteNode[];
  edges: RouteEdge[];
}

/** Scenes belonging to an act: everything reachable from its start that
 *  isn't the start of a later act. Acts are contiguous spans of the graph,
 *  so the next act's opening scene is the natural boundary.
 *
 *  The walk follows every edge the player can actually walk: choices
 *  (including quick-time timeout routes), auto-advance, and scene-moving
 *  hotspots (goToScene / useItem doors, plus a pattern puzzle's solve and
 *  final-fail targets). Following only choice edges used to silently drop
 *  scenes that a door hotspot reaches — they played fine but vanished from
 *  the act's route map. */
export function scenesInAct(story: Story, actId: string): Set<string> {
  const act = story.acts?.find((a) => a.id === actId);
  const out = new Set<string>();
  if (!act) return out;

  const boundaries = new Set(
    (story.acts ?? []).filter((a) => a.id !== actId).map((a) => a.startSceneId)
  );
  const byId = new Map(story.scenes.map((s) => [s.id, s]));
  const queue = [act.startSceneId];

  while (queue.length) {
    const id = queue.shift()!;
    if (!id || out.has(id) || boundaries.has(id)) continue;
    const scene = byId.get(id);
    if (!scene) continue;
    out.add(id);
    // Endings terminate the walk — nothing follows them.
    if (scene.isEnding) continue;
    if (scene.autoAdvanceTargetSceneId) queue.push(scene.autoAdvanceTargetSceneId);
    for (const c of scene.choices ?? []) {
      if (c.targetSceneId) queue.push(c.targetSceneId);
      if (c.timedOutTargetSceneId) queue.push(c.timedOutTargetSceneId);
    }
    for (const h of scene.hotspots ?? []) {
      if (h.action.targetSceneId) queue.push(h.action.targetSceneId);
      const puzzle = h.action.patternPuzzle;
      if (puzzle?.targetSceneId) queue.push(puzzle.targetSceneId);
      if (puzzle?.wrongTargetSceneId) queue.push(puzzle.wrongTargetSceneId);
    }
  }
  return out;
}

/** Which act a scene sits in, following the same containment rule.
 *
 *  Returns null for scenes no act can reach by choice edges — notably the
 *  heat-failure ending, which the engine can drop the player into from
 *  anywhere. Such a scene genuinely belongs to no act, and callers treat a
 *  null as "don't attribute this to an act boundary". */
export function actOfScene(story: Story, sceneId: string): string | null {
  for (const act of story.acts ?? []) {
    if (scenesInAct(story, act.id).has(sceneId)) return act.id;
  }
  return null;
}

/**
 * Build the branching map for one act.
 *
 * `journey` marks the route actually walked. Scenes the player passed
 * through are "taken"; everything else in the act is "missed" — visible,
 * but greyed, which is the entire point of the Detroit presentation.
 */
export function buildRouteGraph(
  story: Story,
  actId: string,
  journey: JourneyStep[],
  currentSceneId?: string
): RouteGraph {
  const inAct = scenesInAct(story, actId);
  const byId = new Map(story.scenes.map((s) => [s.id, s]));
  const act = story.acts?.find((a) => a.id === actId);
  if (!act || inAct.size === 0) return { nodes: [], edges: [] };

  const visited = new Set(journey.map((j) => j.sceneId));
  if (currentSceneId) visited.add(currentSceneId);
  // The act's own opener was walked by definition — the player stood there.
  visited.add(act.startSceneId);

  // Choice ids the player actually picked, so an edge can be marked taken
  // even when both branches lead to the same scene.
  const pickedChoices = new Set(journey.map((j) => j.choiceId).filter(Boolean) as string[]);
  // Options that were visible but gated shut, per scene.
  const lockedChoices = new Set<string>();
  for (const step of journey) {
    for (const o of step.options) if (o.locked) lockedChoices.add(o.id);
  }

  /* ---- edges ---- */
  const edges: RouteEdge[] = [];
  const seenEdge = new Set<string>();

  for (const sceneId of inAct) {
    const scene = byId.get(sceneId);
    if (!scene) continue;
    if (scene.autoAdvanceTargetSceneId && inAct.has(scene.autoAdvanceTargetSceneId)) {
      const key = `${sceneId}->${scene.autoAdvanceTargetSceneId}:auto`;
      if (!seenEdge.has(key)) {
        seenEdge.add(key);
        edges.push({
          id: key,
          source: sceneId,
          target: scene.autoAdvanceTargetSceneId,
          label: "auto",
          attitude: "Neutral",
          status: visited.has(sceneId) && visited.has(scene.autoAdvanceTargetSceneId) ? "taken" : "missed",
        });
      }
    }
    for (const c of scene.choices ?? []) {
      // Replies are in-scene dialogue, not navigation.
      if (c.reply || !c.targetSceneId) continue;
      if (!inAct.has(c.targetSceneId)) continue;

      const taken = pickedChoices.has(c.id) && visited.has(c.targetSceneId);
      const status: RouteStatus = taken
        ? "taken"
        : lockedChoices.has(c.id)
          ? "locked"
          : "missed";

      const key = `${sceneId}->${c.targetSceneId}:${c.id}`;
      if (seenEdge.has(key)) continue;
      seenEdge.add(key);
      edges.push({
        id: key,
        source: sceneId,
        target: c.targetSceneId,
        label: c.text.length > 34 ? `${c.text.slice(0, 32)}…` : c.text,
        attitude: c.attitudeTag ?? "Neutral",
        status,
      });

      if (c.timedOutTargetSceneId && inAct.has(c.timedOutTargetSceneId)) {
        const tKey = `${sceneId}->${c.timedOutTargetSceneId}:${c.id}:timeout`;
        if (!seenEdge.has(tKey)) {
          seenEdge.add(tKey);
          const tTaken = journey.some(
            (j) => j.sceneId === sceneId && j.timedOut && visited.has(c.timedOutTargetSceneId!)
          );
          edges.push({
            id: tKey,
            source: sceneId,
            target: c.timedOutTargetSceneId,
            label: "(hesitated)",
            attitude: "Neutral",
            status: tTaken ? "taken" : "missed",
          });
        }
      }
    }
    // Scene-moving hotspots are walkable edges too — the act membership walk
    // follows them, so the map must draw them, or the door scenes (the
    // freezer, the back room) float unconnected and their return edges have
    // no forward edge to pair with.
    for (const h of scene.hotspots ?? []) {
      const doorTarget = h.action.targetSceneId;
      if (doorTarget && inAct.has(doorTarget)) {
        const dKey = `${sceneId}->${doorTarget}:hs:${h.id}`;
        if (!seenEdge.has(dKey)) {
          seenEdge.add(dKey);
          edges.push({
            id: dKey,
            source: sceneId,
            target: doorTarget,
            label: h.label.length > 34 ? `${h.label.slice(0, 32)}…` : h.label,
            attitude: "Neutral",
            status: visited.has(sceneId) && visited.has(doorTarget) ? "taken" : "missed",
          });
        }
      }
      // A pattern puzzle's scene targets are doors as well.
      const puzzle = h.action.patternPuzzle;
      for (const [target, tag] of [
        [puzzle?.targetSceneId, "solved"],
        [puzzle?.wrongTargetSceneId, "final miss"],
      ] as [string | undefined, string][]) {
        if (target && inAct.has(target)) {
          const pKey = `${sceneId}->${target}:puzzle:${h.id}:${tag}`;
          if (!seenEdge.has(pKey)) {
            seenEdge.add(pKey);
            edges.push({
              id: pKey,
              source: sceneId,
              target: target,
              label: `(${tag})`,
              attitude: "Clever",
              status: visited.has(sceneId) && visited.has(target) ? "taken" : "missed",
            });
          }
        }
      }
    }
  }

  /* ---- back-edges: a DFS from the act's opener flags the edges that close
     a loop ("Leave the booth" back to the hall). Layering on a graph with
     cycles never settles — the fixed point below used to run to its cap and
     leave the act's hub scene ranked nineteen ranks deep, with every return
     edge drawn backwards through the map. Keep the back-edges for drawing,
     but rank the DAG they're removed from. */
  const backEdges = new Set<string>();
  {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (e.source === e.target) continue;
      if (!adj.has(e.source)) adj.set(e.source, []);
      adj.get(e.source)!.push(e.target);
    }
    const onStack = new Set<string>();
    const done = new Set<string>();
    const dfs = (id: string) => {
      onStack.add(id);
      for (const to of adj.get(id) ?? []) {
        if (onStack.has(to)) {
          // to is an ancestor of id: every edge id->to closes a cycle.
          for (const e of edges) if (e.source === id && e.target === to) backEdges.add(e.id);
        } else if (!done.has(to)) {
          dfs(to);
        }
      }
      onStack.delete(id);
      done.add(id);
    };
    dfs(act.startSceneId);
    for (const id of inAct) if (!done.has(id)) dfs(id);
    for (const e of edges) e.isBack = backEdges.has(e.id);
  }

  /* ---- layering: a node sits one rank below its DEEPEST parent ----
     Longest-path layering keeps every forward edge pointing right, so a
     branch that rejoins the spine later doesn't get drawn backwards.
     Back-edges are excluded from the parents (see above), so the fixed
     point actually converges on acts with loop-back navigation. */
  const parents = new Map<string, string[]>();
  for (const id of inAct) parents.set(id, []);
  for (const e of edges) {
    if (e.source === e.target || e.isBack) continue;
    parents.get(e.target)?.push(e.source);
  }

  const depth = new Map<string, number>();
  depth.set(act.startSceneId, 0);
  // Iterate to a fixed point; the graph is small and may contain cycles,
  // so cap the passes rather than recursing.
  for (let pass = 0; pass < inAct.size + 2; pass++) {
    let changed = false;
    for (const id of inAct) {
      if (id === act.startSceneId) continue;
      const ps = parents.get(id) ?? [];
      const known = ps.map((p) => depth.get(p)).filter((d): d is number => d !== undefined);
      if (!known.length) continue;
      const next = Math.max(...known) + 1;
      if (depth.get(id) !== next) {
        depth.set(id, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Anything unranked (unreachable within the act) goes after the deepest.
  const maxDepth = Math.max(0, ...[...depth.values()]);
  for (const id of inAct) if (!depth.has(id)) depth.set(id, maxDepth + 1);

  /* ---- lanes: order within a rank, taken route biased to the centre ---- */
  const byDepth = new Map<number, string[]>();
  for (const id of inAct) {
    const d = depth.get(id)!;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }

  const lane = new Map<string, number>();
  for (const [, ids] of byDepth) {
    // Walked scenes first so the player's route reads as the spine.
    ids.sort((a, b) => {
      const av = visited.has(a) ? 0 : 1;
      const bv = visited.has(b) ? 0 : 1;
      if (av !== bv) return av - bv;
      return a.localeCompare(b);
    });
    ids.forEach((id, i) => lane.set(id, i));
  }

  /* ---- nodes ---- */
  // A trapdoor ending (heat failure) belongs to no act, but if the player
  // ended there it must still appear — otherwise their own final scene is
  // missing from the map of the act they were in when it fired.
  const trapdoor = story.briefing?.heatFailSceneId;
  if (
    trapdoor &&
    !inAct.has(trapdoor) &&
    visited.has(trapdoor) &&
    byId.has(trapdoor)
  ) {
    inAct.add(trapdoor);
    const from = journey[journey.length - 2]?.sceneId;
    depth.set(trapdoor, from ? (depth.get(from) ?? maxDepth) + 1 : maxDepth + 1);
    if (from && inAct.has(from)) {
      edges.push({
        id: `${from}->${trapdoor}:heat`,
        source: from,
        target: trapdoor,
        label: "(heat)",
        attitude: "Aggressive",
        status: "taken",
      });
    }
    const d = depth.get(trapdoor)!;
    lane.set(trapdoor, (byDepth.get(d)?.length ?? 0));
  }

  const nodes: RouteNode[] = [...inAct].map((id) => {
    const scene = byId.get(id)!;
    return {
      id,
      sceneId: id,
      label: scene.title,
      depth: depth.get(id)!,
      lane: lane.get(id)!,
      status: visited.has(id) ? "taken" : "missed",
      isEnding: !!scene.isEnding,
      endingTier: scene.endingData?.tier,
      isCurrent: id === currentSceneId,
    };
  });

  nodes.sort((a, b) => a.depth - b.depth || a.lane - b.lane);
  return { nodes, edges };
}
