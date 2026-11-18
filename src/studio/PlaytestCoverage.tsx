import { useCallback, useEffect, useState } from "react";
import type { Story } from "../types";
import { clearCoverage, coveragePercent, coverageReport, readCoverage, type PlaytestCoverage } from "../game/playtestCoverage";

/* ------------------------------------------------------------------ */
/*  Studio ▶ Test tab: Playtest coverage.                              */
/*                                                                     */
/*  The companion to the static validator. The validator walks the     */
/*  graph and says what CAN be reached; this reads the tally the       */
/*  engine keeps while you play and says what you HAVE reached — so    */
/*  the branch nobody has ever tested stops being invisible.           */
/* ------------------------------------------------------------------ */

function Bar({ label, done, total, tone }: { label: string; done: number; total: number; tone: string }) {
  const pct = coveragePercent(done, total);
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between font-type text-[10px]">
        <span className="text-paper/70">{label}</span>
        <span className="text-paper/45">
          {done}/{total} · {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full bg-noir-800">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function PlaytestCoveragePanel({ story, onSelectScene }: { story: Story; onSelectScene: (sceneId: string) => void }) {
  const [cov, setCov] = useState<PlaytestCoverage | null>(null);
  const refresh = useCallback(() => setCov(readCoverage(story.id)), [story.id]);

  // Re-read whenever the tab shows this panel (a playtest has usually just
  // ended) and whenever the story id changes.
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const report = coverageReport(story, cov);
  const recorded = !!cov && (report.sceneVisited > 0 || report.choiceTaken > 0 || report.runs > 0);
  const when = report.updatedAt ? new Date(report.updatedAt).toLocaleString() : null;

  const gaps: { title: string; tone: string; items: { key: string; label: string; sceneId?: string }[] }[] = [
    {
      title: ` scenes never visited`,
      tone: "text-crimson",
      items: report.missedScenes.map((g) => ({ key: `s:${g.sceneId}`, label: g.sceneTitle ?? g.sceneId ?? "", sceneId: g.sceneId })),
    },
    {
      title: ` choices never taken`,
      tone: "text-gold",
      items: report.missedChoices.map((g) => ({
        key: `c:${g.sceneId}:${g.choiceId}`,
        label: `${g.sceneTitle ?? g.sceneId} — “${g.text}”`,
        sceneId: g.sceneId,
      })),
    },
  ];

  return (
    <div className="mt-3 space-y-2 border border-cyan-neon/30 bg-cyan-neon/5 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-pulp text-[10px] uppercase tracking-widest text-cyan-neon">🧪 Playtest coverage</div>
        <div className="flex items-center gap-1">
          <button
            onClick={refresh}
            title="Re-read the coverage tally"
            className="border border-noir-600 px-1.5 py-0.5 font-pulp text-[8px] uppercase tracking-widest text-paper/60 hover:border-cyan-neon/60 hover:text-cyan-neon"
          >
            ⟳
          </button>
          {recorded && (
            <button
              onClick={() => {
                clearCoverage(story.id);
                setCov(null);
              }}
              title="Forget every recorded playthrough for this case"
              className="border border-noir-600 px-1.5 py-0.5 font-pulp text-[8px] uppercase tracking-widest text-paper/60 hover:border-crimson/60 hover:text-crimson"
            >
              reset
            </button>
          )}
        </div>
      </div>

      <p className="font-type text-[9px] leading-snug text-paper/45">
        The validator says what <i>could</i> be reached. This says what you actually played: the engine counts every scene you
        enter and every choice you pick while a case is in play, and the tally persists across playthroughs. Gaps are the
        branches nobody has tested yet.
      </p>

      {!recorded ? (
        <p className="font-type text-[10px] leading-relaxed text-paper/45">
          Nothing recorded yet — hit <b>▶ Test</b> (or play the case from the newsstand) and this fills in: scenes entered,
          choices taken, endings reached.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Bar label="Scenes entered" done={report.sceneVisited} total={report.sceneTotal} tone="bg-cyan-neon" />
            <Bar label="Choices taken" done={report.choiceTaken} total={report.choiceTotal} tone="bg-emerald-400" />
            {report.endingTotal > 0 && (
              <Bar label="Endings reached" done={report.endingSeen} total={report.endingTotal} tone="bg-gold" />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-type text-[9px] text-paper/45">
            <span>
              🏁 {report.runs} completed run{report.runs === 1 ? "" : "s"}
            </span>
            {when && <span>last played {when}</span>}
          </div>

          {gaps.map((group) =>
            group.items.length ? (
              <div key={group.title} className="space-y-1">
                <div className={`font-pulp text-[9px] uppercase tracking-widest ${group.tone}`}>
                  ⚠ {group.items.length}
                  {group.title}
                </div>
                <div className="max-h-40 space-y-0.5 overflow-auto border border-noir-700 bg-noir-950/60 p-1">
                  {group.items.slice(0, 60).map((it) => (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() => it.sceneId && onSelectScene(it.sceneId)}
                      className="block w-full truncate px-1 text-left font-type text-[9px] text-paper/65 hover:bg-noir-800 hover:text-paper"
                      title={it.label}
                    >
                      {it.label || "(untitled)"}
                    </button>
                  ))}
                  {group.items.length > 60 && (
                    <div className="px-1 font-type text-[9px] text-paper/35">+{group.items.length - 60} more…</div>
                  )}
                </div>
              </div>
            ) : null
          )}

          {report.missedScenes.length === 0 && report.missedChoices.length === 0 && (
            <p className="font-type text-[10px] text-emerald-400">✓ Every scene and every choice in this case has been played.</p>
          )}
        </>
      )}
    </div>
  );
}
