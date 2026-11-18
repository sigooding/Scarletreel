import { useMemo, useState } from "react";
import { audio } from "../audio";
import { gameShuffle } from "./rng";
import type { PatternPuzzleConfig } from "./PatternPuzzleTypes";

export function PatternPuzzleGame({
  config,
  onSolved,
  onWrong,
  onClose,
}: {
  config: PatternPuzzleConfig;
  onSolved: () => void;
  onWrong: () => void;
  onClose: () => void;
}) {
  // Seeded via the game RNG: ?seed= fixes the row order, so a puzzle that
  // only breaks on one arrangement replays on demand.
  const shuffled = useMemo(() => gameShuffle(config.rows), []);

  /** The authoritative number of rows to flag. A correct submission must flag
   *  EVERY answer row, so the cap has to equal the answer count — an authored
   *  `targetCount` that drifts from the number of marked answers makes the
   *  puzzle unsolvable (cap too low to cover all answers) or winnable with a
   *  wrong pick (cap too high). The answer count is therefore the source of
   *  truth; targetCount is only a fallback for a puzzle with no answers yet. */
  const answerCount = useMemo(() => config.rows.filter((r) => r.isAnswer).length, [config.rows]);
  const target = answerCount > 0 ? answerCount : config.targetCount;

  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState(false);
  const [flash, setFlash] = useState<"none" | "wrong" | "right">("none");
  const [attempts, setAttempts] = useState(0);

  const toggle = (id: string) => {
    if (locked) return;
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < target) next.add(id);
      return next;
    });
  };

  const submit = () => {
    if (locked || flagged.size !== target) return;
    // Correct iff the player flagged exactly the answer set. The empty-answer
    // case (a half-authored puzzle) must never read as "solved".
    const correct = answerCount > 0 && shuffled.filter((r) => r.isAnswer).every((r) => flagged.has(r.id));
    if (correct) {
      audio.success();
      audio.stinger();
      setFlash("right");
      setLocked(true);
      window.setTimeout(() => onSolved(), 1200);
    } else {
      audio.fail();
      setFlash("wrong");
      setAttempts((a) => a + 1);
      const canRetry = config.allowRetry !== false;
      if (!canRetry) {
        setLocked(true);
        window.setTimeout(() => onWrong(), 1400);
      } else {
        window.setTimeout(() => {
          setFlash("none");
          setFlagged(new Set());
        }, 900);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="pop-in relative w-full max-w-3xl border-2 border-gold/50 bg-noir-950 shadow-[0_0_60px_rgba(232,178,60,0.12)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gold/25 px-5 py-3">
          <div>
            <h3 className="font-pulp text-sm uppercase tracking-wide text-gold">{config.title}</h3>
            <p className="font-type text-[11px] text-paper/50">{config.instruction}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`font-pulp text-[10px] uppercase tracking-widest ${flagged.size === target ? "text-gold" : "text-paper/35"}`}>
              {flagged.size} / {target} flagged
            </span>
            <button onClick={onClose} className="text-lg leading-none text-paper/40 hover:text-neon" aria-label="Close">✕</button>
          </div>
        </div>

        <div className={`max-h-[50vh] overflow-y-auto transition-colors duration-300 ${flash === "wrong" ? "bg-crimson/10" : flash === "right" ? "bg-emerald-500/10" : ""}`}>
          {shuffled.map((row) => {
            const isFlagged = flagged.has(row.id);
            const showAnswer = locked && row.isAnswer;
            const showWrong = locked && isFlagged && !row.isAnswer;
            return (
              <button
                key={row.id}
                onClick={() => toggle(row.id)}
                disabled={locked}
                className={`flex w-full items-center gap-3 border-b border-noir-700/50 px-5 py-2.5 text-left transition-colors ${
                  showAnswer ? "bg-emerald-500/15" : showWrong ? "bg-crimson/15" : isFlagged ? "bg-gold/10" : "hover:bg-noir-800/60"
                }`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 text-[10px] ${
                  showAnswer ? "border-emerald-400 bg-emerald-400 text-noir-950"
                  : showWrong ? "border-crimson bg-crimson text-white"
                  : isFlagged ? "border-gold bg-gold text-noir-950"
                  : "border-paper/25"
                }`}>
                  {isFlagged || showAnswer ? "✓" : showWrong ? "✕" : ""}
                </span>
                <span className="w-16 shrink-0 font-type text-[11px] text-paper/45">{row.date}</span>
                <span className={`min-w-0 flex-1 truncate font-type text-[12px] ${row.isAnswer && locked ? "text-emerald-400" : "text-paper/80"}`}>{row.description}</span>
                <span className={`shrink-0 font-type text-[12px] tabular-nums ${row.isAnswer && locked ? "text-emerald-400" : "text-paper/60"}`}>{row.amount}</span>
              </button>
            );
          })}
        </div>

        {locked && flash === "right" && config.payoffText && (
          <div className="border-t border-emerald-500/30 bg-emerald-500/5 px-5 py-3">
            <p className="font-type text-[13px] leading-relaxed text-paper/85">{config.payoffText}</p>
          </div>
        )}

        {flash === "wrong" && !locked && config.wrongMessage && (
          <div className="border-t border-crimson/30 bg-crimson/5 px-5 py-2.5">
            <p className="font-type text-[12px] leading-relaxed text-crimson/90">✗ {config.wrongMessage}</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-noir-700 px-5 py-3">
          <div className="font-type text-[10px] text-paper/35">
            {attempts > 0 && !locked && `Attempt ${attempts + 1}`}
            {locked && flash === "right" && "✓ Pattern cracked"}
            {locked && flash === "wrong" && "✗ Incorrect"}
          </div>
          <button
            onClick={submit}
            disabled={flagged.size !== target || locked}
            className={`border-2 px-6 py-2 font-pulp text-xs uppercase tracking-widest transition-colors ${
              flagged.size === target && !locked ? "border-gold bg-gold/15 text-gold hover:bg-gold hover:text-noir-950" : "border-paper/20 text-paper/30 cursor-not-allowed"
            }`}
          >
            {flash === "right" ? "✓ Cracked" : flash === "wrong" && locked ? "✗ Failed" : "Flag pattern"}
          </button>
        </div>
      </div>
    </div>
  );
}
