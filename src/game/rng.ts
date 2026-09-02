/**
 * DETERMINISTIC SEEDED RNG — one stream for every GAMEPLAY draw.
 *
 * Two runs of the same story with the same seed and the same inputs should
 * play identically. Today a bug that only appears on an unlucky roll is
 * unreproducible; with a seed it replays on demand, and a seeded run doubles
 * as a regression test next to the playtest-coverage tally.
 *
 * Boot: put ?seed=1234 (any string) on the URL — Game.tsx applies it once at
 * import. Tests and future Studio toggles call setGameSeed directly.
 *
 * What is SEEDED (gameplay — outcomes change if the roll changes):
 *   - minigame shuffles (PatternPuzzle's row order),
 *   - minigame spawns (RideGame obstacle timing / lane / sprite),
 *   - anything that calls gameRandom/gamePick/gameShuffle from here on.
 * What stays UNSEEDED (cosmetic or infrastructural):
 *   - ids and tokens (uid, library keys),
 *   - audio noise and UI blips,
 *   - storm particles and lightning bolts (weather should feel wild),
 *   - Studio canvas layout.
 */

/** The PRNG shape: a stateful draw in [0, 1). */
export type Rng = () => number;

/** mulberry32 — tiny, fast, well-distributed 32-bit PRNG. Same seed in, same
 *  stream out, forever. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** String → 32-bit seed (the xmur3 finalizer), so ?seed=fred works as well
 *  as ?seed=1234. Same text always hashes to the same number. */
export function hashSeed(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The seed fixed for this run, or null while the stream is live Math.random. */
let activeSeed: string | null = null;
let stream: Rng = () => Math.random();

/** Fix (or unfixed) the gameplay stream. A number, a numeric string or any
 *  non-empty string seeds it; null/undefined/"" hands it back to Math.random. */
export function setGameSeed(seed?: string | number | null): void {
  if (seed === null || seed === undefined || `${seed}`.trim() === "") {
    activeSeed = null;
    stream = () => Math.random();
    return;
  }
  activeSeed = `${seed}`.trim();
  stream = mulberry32(hashSeed(activeSeed));
}

/** The seed this run is pinned to, or null if draws are live. */
export function currentGameSeed(): string | null {
  return activeSeed;
}

/** One gameplay draw in [0, 1). */
export function gameRandom(): number {
  return stream();
}

/** A gameplay float in [a, b). */
export function gameRange(a: number, b: number): number {
  return a + stream() * (b - a);
}

/** A gameplay pick from a non-empty array. */
export function gamePick<T>(arr: readonly T[]): T {
  return arr[Math.floor(stream() * arr.length)];
}

/** A gameplay Fisher-Yates shuffle — returns a NEW array; the input is
 *  untouched. Same seed, same input order → same permutation. */
export function gameShuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(stream() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Pull the run seed out of a query string: "?seed=42&x=1" → "42". Absent,
 *  empty or a bare "?seed=" all mean "no seed". */
export function seedFromSearch(search: string): string | null {
  const m = /[?&]seed=([^&]*)/.exec(search ?? "");
  const v = m && m[1] ? decodeURIComponent(m[1]).trim() : "";
  return v ? v : null;
}

/** Apply the seed from the live URL's query string (boot-time). Returns the
 *  seed applied, if any. */
export function initGameSeedFromUrl(): string | null {
  let search = "";
  try {
    search = globalThis.location?.search ?? "";
  } catch {
    search = "";
  }
  const seed = seedFromSearch(search);
  if (seed) setGameSeed(seed);
  return seed;
}
