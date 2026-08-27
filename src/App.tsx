import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audio, type MixChannel } from "./audio";
import { STORIES } from "./data/stories";
import { GamePlayer, LensFlareLayer } from "./game/Game";
import { decodeStory, isEpisodic, latestSave, loadEndings, removeStoryEndings, seasonEpisodes, storySeasonProgress } from "./logic";
import { assetUrl } from "./assetPath";
import { Studio } from "./studio/Studio";
import { resolveAssetReference, resolveStoryMedia, compactStoryMedia, loadStoryAssetsForExport, importStoryAssets, deleteStoryAssets } from "./data/mediaLibrary";
import type { EndingLog, Story, TitleTheme } from "./types";

type PrimedAudio = { url: string; el: HTMLAudioElement };

type Mode =
  | { kind: "menu" }
  | {
      kind: "play";
      story: Story;
      resumeSlot?: number;
      resumeEpisodeId?: string;
      /** Studio "Play from here": open directly at this scene (episodic
       *  playtest launches the owning episode straight into it). */
      playFromSceneId?: string;
      primedMusic?: PrimedAudio | null;
      primedNarration?: PrimedAudio | null;
    }
  | { kind: "studio" }
  | { kind: "gallery" };

const SETTINGS_KEY = "scarlet-reel-settings-v1";
const HIDDEN_STORIES_KEY = "scarlet-reel-hidden-stories";
const CUSTOM_STORIES_KEY = "scarlet-reel-custom-stories-v1";
const publishedKey = (id: string) => `scarlet-reel-published-${id}`;
const draftKey = (id: string) => `scarlet-studio-draft-${id}`;
const GLOBAL_TITLE_THEME_KEY = "scarlet-reel-global-title-theme";
const STORY_SNAPSHOT_BUILD_KEY = "scarlet-reel-story-snapshot-build";
const APP_BUILD_ID = __SCARLET_REEL_BUILD_ID__;
const STUDIO_PLAY_HASH = "#studio-play=";
const studioPlayKey = (token: string) => `scarlet-studio-play-${token}`;
// Bump whenever a built-in story's content changes in a way that must reach
// players who already have a Studio draft or published copy cached. The
// newsstand reads published -> draft -> built-in, so without this a stale
// snapshot silently shadows the updated story file. Old copies are kept as
// `-backup-pre-r<n>` keys rather than deleted.
// r5: Nobody's Witness title sequence (montage, card motion, typeface).
// r6: catalogue trimmed to the flagship; clears every cached built-in copy,
//     including ones whose story file no longer ships.
const CONTENT_REVISION = "34";

export function loadGlobalTitleTheme(): TitleTheme {
  try {
    const raw = localStorage.getItem(GLOBAL_TITLE_THEME_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    titleText: "Scarlet Reel",
    tagline: "A Dime-Store Detective Serial",
    bgImageUrl: "/img/bg-alley.jpg",
    neonColor: "#ff2e88",
  };
}

function loadHiddenStories(): string[] {
  // The catalogue is a single flagship case, so nothing is hidden by default.
  // A saved list is still honoured, but can never hide every story — an empty
  // newsstand looks identical to a broken build, and there would be no card
  // left to click to reach the restore control.
  try {
    const saved = localStorage.getItem(HIDDEN_STORIES_KEY);
    if (saved === null) return [];
    const parsed = JSON.parse(saved) as string[];
    if (!Array.isArray(parsed)) return [];
    const visible = STORIES.filter((s) => !parsed.includes(s.id));
    return visible.length ? parsed : [];
  } catch {
    return [];
  }
}

function loadCustomStories(): Story[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_STORIES_KEY) ?? "[]") as Story[];
    return parsed.filter((story) => story?.id && typeof story.title === "string" && Array.isArray(story.scenes));
  } catch {
    return [];
  }
}

function saveCustomStories(stories: Story[]): boolean {
  try {
    localStorage.setItem(CUSTOM_STORIES_KEY, JSON.stringify(stories));
    return true;
  } catch {
    return false;
  }
}

function storySnapshotOwnerId(key: string): string | null {
  if (key.startsWith("scarlet-reel-published-")) return key.slice("scarlet-reel-published-".length);
  if (key.startsWith("scarlet-studio-draft-")) return key.slice("scarlet-studio-draft-".length);
  return null;
}

/**
 * On a new app build, drop cached Studio/published story snapshots that can
 * shadow the story files shipped in this build. This deliberately does NOT
 * touch save slots, season progress, endings, settings or the IndexedDB media
 * library, so Resume Game keeps working after an update.
 *
 * User-created custom story roots are kept; only their draft/published shadow
 * copies are skipped when the id is an exact custom id. Retired/unknown snapshot
 * keys are removed because they can only be stale catalogue ghosts.
 */
function clearStaleStorySnapshotsForBuild() {
  try {
    if (localStorage.getItem(STORY_SNAPSHOT_BUILD_KEY) === APP_BUILD_ID) return;

    const customIds = new Set(loadCustomStories().map((story) => story.id));
    const builtInIds = new Set(STORIES.map((story) => story.id));
    const keys: string[] = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const ownerId = storySnapshotOwnerId(key);
      if (!ownerId) continue;

      // Preserve exact custom-story snapshots; clear built-ins, retired ids and
      // old backup snapshots. The save/resume keys have different prefixes.
      if (builtInIds.has(ownerId) || !customIds.has(ownerId) || key.includes("-backup-")) keys.push(key);
    }

    keys.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(STORY_SNAPSHOT_BUILD_KEY, APP_BUILD_ID);
  } catch {
    // Storage unavailable: continue with the built-in catalogue.
  }
}

/** Built-in stories whose cached copies this revision must replace. A cached
 * draft/published snapshot always wins over the built-in story file, so an
 * updated built-in is invisible to anyone who ever opened it in Studio unless
 * its stale copy is cleared. Listing ids keeps that surgical: only these
 * stories are reset, and edits to every other story survive the upgrade.
 * Use "*" to clear every cached built-in copy. */
const REVISION_RESETS: Record<string, string[]> = {
  // The title sequence, montage and soundtrack live in the story file; a
  // pre-existing draft would keep showing the old static credits node.
  "5": ["nobodys-witness-flagship"],
  // The catalogue was trimmed to the flagship. Cached copies of the removed
  // stories must go too, so "*" sweeps by key prefix rather than by id —
  // iterating STORIES would miss every story that no longer ships.
  "6": ["*"],
  // Act Three (Parts 5-6) added to the flagship: new scenes, new endings, a
  // new character. Cached copies would stop at the Part 1 act break.
  "7": ["nobodys-witness-flagship"],
  // Act Three Parts 1-4b written in full: the temporary bridge scene is gone,
  // three new characters, and the spine flag now seeds at the cold open.
  "8": ["nobodys-witness-flagship"],
  // Saves gained an ordered `journey` log for the end-of-part flowchart.
  // Old saves simply have none and the chart is skipped for them.
  "9": ["nobodys-witness-flagship"],
  // Episode 3 version 2: Part 5 now forks on the price Jack pays, and the
  // licence branch adds three scenes and a seventh ending.
  "10": ["nobodys-witness-flagship"],
  // Scenes gained partBreak markers so the route chart appears between parts.
  "11": ["nobodys-witness-flagship"],
  // Acts are now first-class: Act Two exists, and Act One's closing choice
  // routes to it. Cached copies would still jump straight to Act Three.
  "12": ["nobodys-witness-flagship"],
  // Story-wide filmGrade added; cached copies would render ungraded.
  "13": ["nobodys-witness-flagship"],
  // A cached copy was still presenting the flagship as a SEASON ("Begin
  // Episode One") even though the story file has no episodes — a snapshot old
  // enough to predate the episodic experiment overrides the built-in story
  // wholesale and takes its stale scene graph with it. Sweep every cached
  // built-in copy by key prefix so no such snapshot can survive.
  "14": ["*"],
  // The WebGL film-grade layer is gone. Cached copies still carry the
  // story-wide `filmGrade` object; harmless now that nothing reads it, but
  // sweep anyway so stored data matches the shipped story exactly.
  "15": ["nobodys-witness-flagship"],
  // The title sequence gained 35mm gate weave; a cached copy would still
  // play the titles locked off.
  "16": ["nobodys-witness-flagship"],
  // New story "Last Call on Pier 7" joins the catalogue.
  "17": ["last-call-pier-7"],
  // The two demo cases return to the catalogue (the manual's Quick-Time Demo
  // and Perk Range proving grounds). A player who opened them before the
  // catalogue was trimmed may still carry a stale draft/published copy —
  // clear just those so the shipped demos win.
  "18": ["qte-demo", "perk-range"],
  // The Draft story gained its canvas layout, the soundtrack (theme at the
  // titles + finale) and the hard music hand-off into the diner. Cached
  // copies opened before those fixes would keep playing the leaked theme —
  // retire just this story's stale snapshot; the layout self-heal covers
  // anything newer.
  "19": ["nobodys-witness-draft"],
  // The Draft became a three-episode season (one per act, curtain endings
  // at the act breaks). Cached copies from the single-run build would keep
  // playing without chapters — retire just this story's snapshot again.
  "20": ["nobodys-witness-draft"],
  // Episode Two got its own generated art (laundromat, office at 3 a.m.,
  // the car, the pumps, the apartment, the rental, the yard). Retire the
  // cached copy once more so the new plates ship.
  "21": ["nobodys-witness-draft"],
  // Episodes One and Three got their own art (warehouse, the payphone
  // curtain, The Call in the strobes, two new season posters).
  "22": ["nobodys-witness-draft"],
  // The Draft's Act One branched: four diamond-point choices (D1-A/D1-B/D2/D4)
  // splitting the shared scenes, plus four alternate Act Two opening chapters
  // with route-locked unlocks. Cached copies would keep playing the
  // pre-branch straight line — retire this story's snapshot so the shipped
  // branching graph wins.
  "23": ["nobodys-witness-draft"],
  // Retire again: the v2 rename ships, and a Studio tab left open on the old
  // graph can re-save the stale draft over revision 23's retirement. A second
  // pass guarantees the shipped branching copy wins on next load.
  "24": ["nobodys-witness-draft"],
  // The four bridges: Act Two split into EP2a (gold front half: laundromat +
  // threeam) and EP2b (the shared road north, joined by every route). Part 1
  // 'to be continued' curtains replaced by the bridge chapters; canonical
  // downstream flag set (rosa_absent, on_payroll, refused_case, vera_held,
  // david_already_dead, ...) replaces the interim flags.
  "25": ["nobodys-witness-draft"],
  // Act Three replaced with the Ending B version ("She Stays"): Parts 3, 4,
  // 5, 6 rewritten — the mill lot confession, the cost (Rosa's warning
  // that the leaving version is the good one), the trade (Solomon's
  // "ability to leave" seed), and the diner ending where the bag goes back
  // down. Parts 1, 2, 4b and the game-over are unchanged.
  "26": ["nobodys-witness-draft"],
  // Ending B demoted from replacement to ALTERNATE ROUTE: the gold Act
  // Three (Ending A — Vera leaves, the cold coffee) is restored as the
  // gold spine; the B back half (mill/cost/trade/finale) is a parallel
  // spine forked at the end of Part 2 and re-forked after the shared Blue
  // Cue via nwd_ending_a / nwd_ending_b.
  "27": ["nobodys-witness-draft"],
  // Act Three ending architecture: the Part 2 A/B fork is gone (routes are
  // emergent from flags), the trade splits 5a/5b/5c with the hold-still
  // QTE (any input = violence -> D), the Blue Cue is skippable, the finale
  // is a resolver dispatching A/B/C/D (+ TELL HER / SAY NOTHING inside A
  // and B), and Endings C ("A Stopped Watch") and D ("Ten Past Nine")
  // arrive verbatim.
  "28": ["nobodys-witness-draft"],
  // r29: three step-by-step "Demo Lab" teaching cases join the catalogue
  // (Conversation / Scene Craft / Branching Reel), and the draft's
  // nwd_sn_p1 background typo (/img/nw2/ -> /img/nwd/) is fixed — retire the
  // draft snapshot so the corrected asset path reaches cached copies.
  "29": ["nobodys-witness-draft"],
  // r30: Scene Craft demo gains the color-grade/film-stock take and the
  // parallax-depth take; retire its snapshot so the new scenes appear.
  "30": ["demo-scene-craft-lab"],
  // r31: after-beat routing fields on dialogue beats + duplicate-story; the
  // Scene Craft demo uses an after-beat cut. Retire snapshots so they refresh.
  "31": ["demo-scene-craft-lab"],
  // r32: tab renames (Beats / Characters / Game Objective / Newsstand Theme)
  // and multiple stacked foreground images; refresh the Scene Craft demo
  // snapshot so the new foreground extras appear.
  "32": ["demo-scene-craft-lab"],
  // r33: the In-Game Theme tab (HUD palettes, fonts, text size) reads the
  // same dialogueBox field, so existing snapshots keep working — no reset
  // required. Listed for migration bookkeeping only.
  "33": [],
  // r34: batch ElevenLabs voice generation in the Beats tab — no data
  // migration needed (no story shape change); bump only for bookkeeping.
  "34": [],
};

function migrateLegacyStoryStorage() {
  try {
    clearStaleStorySnapshotsForBuild();

    const seen = localStorage.getItem("scarlet-reel-content-revision");
    if (seen === CONTENT_REVISION) return;

    const pending = Object.entries(REVISION_RESETS)
      // Apply every revision the player hasn't seen yet, not just the newest,
      // so upgrading across several releases at once still lands.
      .filter(([rev]) => Number(rev) > Number(seen ?? 0))
      .flatMap(([, ids]) => ids);
    // Revision 4 and earlier predate the targeted scheme and may be
    // arbitrarily stale, so they get the full sweep.
    const sweepAll = !seen || Number(seen) < 4 || pending.includes("*");
    const targeted = new Set(pending);

    const retire = (key: string) => {
      const old = localStorage.getItem(key);
      if (old) localStorage.setItem(`${key}-backup-pre-r${CONTENT_REVISION}`, old);
      localStorage.removeItem(key);
    };

    if (sweepAll) {
      // Walk the keyspace so copies of stories that are no longer in STORIES
      // (removed from the catalogue) are cleared as well. Snapshot the key list
      // first — removing entries mutates localStorage's index while iterating.
      const prefixes = ["scarlet-reel-published-", "scarlet-studio-draft-"];
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || key.includes("-backup-pre-r")) continue;
        if (prefixes.some((p) => key.startsWith(p))) keys.push(key);
      }
      keys.forEach(retire);
    } else {
      STORIES.forEach((story) => {
        if (!targeted.has(story.id)) return;
        [publishedKey(story.id), draftKey(story.id)].forEach(retire);
      });
    }
    localStorage.setItem("scarlet-reel-content-revision", CONTENT_REVISION);
  } catch {
    // If storage itself is unavailable, the built-in catalogue still works.
  }
}

/**
 * The newsstand plays exactly what Studio last saved. Published takes priority,
 * then the live autosaved draft, then the built-in story — so what you build in
 * the backend is always what you play in the frontend.
 */
function loadPublishedCatalog(): Story[] {
  migrateLegacyStoryStorage();
  const hidden = new Set(loadHiddenStories());
  const read = (key: string): Story | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Story;
      return parsed.id && parsed.scenes?.length ? parsed : null;
    } catch {
      return null;
    }
  };
  // Guard against a cached snapshot that contradicts the shipped story's
  // shape. Episodes are the giveaway: if the built-in is a single continuous
  // case and the cached copy claims a season, that copy predates a structural
  // change and its scene graph can no longer be trusted.
  const usable = (cached: Story | null, builtIn: Story): Story | null => {
    if (!cached) return null;
    const cachedEpisodic = Array.isArray(cached.episodes) && cached.episodes.length > 0;
    const builtInEpisodic = Array.isArray(builtIn.episodes) && builtIn.episodes.length > 0;
    if (cachedEpisodic !== builtInEpisodic) return null;
    return cached;
  };
  const builtIns = STORIES.filter((story) => !hidden.has(story.id)).map(
    (fallback) =>
      usable(read(publishedKey(fallback.id)), fallback) ??
      usable(read(draftKey(fallback.id)), fallback) ??
      fallback
  );
  // A custom-stories entry carrying a BUILT-IN id would shadow the real story
  // forever: it is keyed separately, so no revision sweep ever touched it, and
  // the newsstand would keep playing an ancient snapshot (that is how a story
  // with no episodes kept presenting itself as a season). Built-ins always win.
  const builtInIds = new Set(STORIES.map((s) => s.id));
  const custom = loadCustomStories()
    .filter((story) => !hidden.has(story.id) && !builtInIds.has(story.id))
    .map((fallback) => read(publishedKey(fallback.id)) ?? read(draftKey(fallback.id)) ?? fallback);
  return [...builtIns, ...custom].filter((story, index, all) => all.findIndex((candidate) => candidate.id === story.id) === index);
}

interface Settings {
  volumes: Record<MixChannel, number>;
  typeSpeed: number;
}

function loadSettings(): Settings {
  const defaults = { volumes: { master: 0.8, music: 0.8, ambient: 0.45, voice: 0.9, sfx: 0.75 }, typeSpeed: 34 };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      // Merge so newly-added channels (e.g. music) get defaults on old saves.
      return { ...defaults, ...parsed, volumes: { ...defaults.volumes, ...(parsed.volumes ?? {}) } };
    }
  } catch {
    /* ignore */
  }
  return defaults;
}

function coverStyle(cover: string): React.CSSProperties {
  if (cover.startsWith("gradient:")) return { background: cover.slice(9) };
  return { backgroundImage: `url(${assetUrl(cover)})`, backgroundSize: "cover", backgroundPosition: "center" };
}

const TIER_LABEL: Record<string, { text: string; cls: string }> = {
  "victory-gold": { text: "★★ GOLD CASE", cls: "text-amber-600 border-amber-600" },
  "victory-silver": { text: "★ SILVER CASE", cls: "text-slate-500 border-slate-500" },
  gameover: { text: "✖ GAME OVER", cls: "text-crimson border-crimson" },
};

const WINDOW_RESOLUTIONS = [
  { label: "1280 × 720 — HD", width: 1280, height: 720 },
  { label: "1366 × 768 — Laptop", width: 1366, height: 768 },
  { label: "1600 × 900 — Wide", width: 1600, height: 900 },
  { label: "1920 × 1080 — Full HD", width: 1920, height: 1080 },
  { label: "2560 × 1440 — QHD", width: 2560, height: 1440 },
];

export default function App() {
  const [mode, setMode] = useState<Mode>({ kind: "menu" });
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [endings, setEndings] = useState<EndingLog>(loadEndings);
  const [catalog, setCatalog] = useState<Story[]>(loadPublishedCatalog);
  const [hiddenStories, setHiddenStories] = useState<string[]>(loadHiddenStories);
  const [, setCustomStories] = useState<Story[]>(loadCustomStories);
  const [globalTitleTheme, setGlobalTitleTheme] = useState<TitleTheme>(loadGlobalTitleTheme);
  const [resolvedTitleTheme, setResolvedTitleTheme] = useState<TitleTheme>(loadGlobalTitleTheme);
  const [imported, setImported] = useState<Story | null>(null);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [verticalRack, setVerticalRack] = useState(false);
  const [fullscreenOn, setFullscreenOn] = useState(false);
  const [resolutionValue, setResolutionValue] = useState("1440x900");
  const menuMusicRef = useRef<HTMLAudioElement | null>(null);
  // Live view of settings so the menu-music helper can read current volumes
  // without making the menu re-mount on every slider tick.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      resolveAssetReference(globalTitleTheme.musicUrl),
      resolveAssetReference(globalTitleTheme.bgImageUrl),
    ]).then(([musicUrl, bgImageUrl]) => {
      if (!cancelled) setResolvedTitleTheme({ ...globalTitleTheme, musicUrl, bgImageUrl });
    });
    return () => {
      cancelled = true;
    };
  }, [globalTitleTheme]);

  const startMenuMusic = useCallback(() => {
    if (mode.kind !== "menu" || !resolvedTitleTheme.musicUrl) return;
    // Compare by the raw configured URL (not Audio.src, which is resolved to an
    // absolute URL) so we don't re-create + stack a new track every call.
    if (menuMusicRef.current?.dataset.src === resolvedTitleTheme.musicUrl && !menuMusicRef.current.paused) return;
    menuMusicRef.current?.pause();
    const track = new Audio(assetUrl(resolvedTitleTheme.musicUrl));
    track.loop = true;
    track.dataset.src = resolvedTitleTheme.musicUrl;
    // The title soundtrack is music — follow the same Master × Music mix as the
    // in-game scene music so the Sound Booth Music slider actually controls it.
    track.volume = Math.min(1, settingsRef.current.volumes.master * settingsRef.current.volumes.music);
    menuMusicRef.current = track;
    track.play().catch(() => {
      // Browser autoplay policy: the root pointer handler retries after the
      // player's first gesture.
    });
  }, [mode.kind, resolvedTitleTheme.musicUrl]);

  // apply volumes to engine (WebAudio buses) AND the raw menu-music element.
  useEffect(() => {
    (Object.keys(settings.volumes) as MixChannel[]).forEach((ch) => audio.setVolume(ch, settings.volumes[ch]));
    if (menuMusicRef.current) {
      menuMusicRef.current.volume = Math.min(1, settings.volumes.master * settings.volumes.music);
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // shared reel import / Studio playtest handoff from URL hash
  useEffect(() => {
    if (location.hash.startsWith(STUDIO_PLAY_HASH)) {
      const token = decodeURIComponent(location.hash.slice(STUDIO_PLAY_HASH.length));
      const key = studioPlayKey(token);
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const payload = JSON.parse(raw) as { story?: Story } | Story | null;
          const wrapped = payload && typeof payload === "object" && "story" in payload ? payload : null;
          const story = (wrapped ? wrapped.story : payload) as Story | null | undefined;
          const fromSceneId = (wrapped && (wrapped as { fromSceneId?: string }).fromSceneId) || undefined;
          if (story?.id && Array.isArray(story.scenes)) {
            // React StrictMode runs mount effects twice in dev. Do not remove the
            // handoff before the async media resolver finishes, or the second
            // effect sees an empty token and the new tab falls back to the
            // newsstand. Duplicate resolves are harmless; both land on the same
            // play mode, and the token is cleared only after a successful handoff.
            void resolveStoryMedia(story).then((resolved) => {
              setMode({ kind: "play", story: resolved, primedMusic: null, playFromSceneId: fromSceneId });
              localStorage.removeItem(key);
              window.history.replaceState(null, "", `${location.pathname}${location.search}`);
            });
            return;
          }
        } catch {
          // Bad or expired handoff: leave the new tab on the newsstand.
        }
      }
      // Missing/corrupt token: keep reloads from retrying a dead handoff forever.
      window.history.replaceState(null, "", `${location.pathname}${location.search}`);
    } else if (location.hash.startsWith("#reel=")) {
      const story = decodeStory(location.hash.slice(6));
      if (story) setImported(story);
    } else if (location.hash === "#studio" || new URLSearchParams(location.search).get("studio")) {
      setMode({ kind: "studio" });
    } else if (location.hash === "#play" || new URLSearchParams(location.search).get("play")) {
      const flagship = STORIES.find((s) => s.id === "nobodys-witness-flagship") ?? STORIES[0];
      if (flagship) {
        void resolveStoryMedia(flagship).then((resolved) => {
          setMode({ kind: "play", story: resolved, primedMusic: null });
        });
      }
    }
  }, []);

  useEffect(() => {
    if (mode.kind === "menu") {
      if (resolvedTitleTheme.musicUrl) {
        startMenuMusic();
        audio.setAmbient(null);
      } else {
        audio.setAmbient("rain");
      }
      setEndings(loadEndings());
      setCatalog(loadPublishedCatalog());
      setHiddenStories(loadHiddenStories());
      // Re-read settings so volumes changed inside a story (which persist
      // straight to localStorage) show up in the Sound Booth and menu music.
      setSettings(loadSettings());
    } else {
      if (menuMusicRef.current) {
        menuMusicRef.current.pause();
        menuMusicRef.current = null;
      }
    }
    if (mode.kind === "studio" || mode.kind === "gallery") audio.setAmbient(null);
  }, [mode.kind, resolvedTitleTheme.musicUrl, startMenuMusic]);

  const stories = useMemo(() => (imported ? [...catalog, imported] : catalog), [catalog, imported]);

  const primeOpeningNarration = useCallback((story: Story): PrimedAudio | null => {
    // Recorded prose MP3s are raw <audio> elements. Start-scene autoplay must be
    // kicked off inside the user's Play click, the same way opening music is
    // primed, or stricter browsers reject it when the React scene-entry effect
    // runs a tick later.
    if (isEpisodic(story)) return null;
    const startScene = story.scenes.find((s) => s.id === story.startSceneId);
    const url = startScene?.narrationAudioUrl;
    if (!startScene || startScene.autoNarrate === false || !url || url.startsWith("asset:")) return null;
    try {
      const el = new Audio(assetUrl(url));
      el.preload = "auto";
      el.volume = Math.min(1, audio.volumes.master * audio.volumes.voice);
      el.play().catch(() => {
        /* the player will adopt the element and retry on its own */
      });
      return { url, el };
    } catch {
      return null;
    }
  }, []);

  const play = useCallback((story: Story, resumeSlot?: number, resumeEpisodeId?: string, playFromSceneId?: string) => {
    audio.unlock();
    audio.stopSpeech();
    // The persisted story stores compact `asset:<id>` references instead of
    // base64 data URLs (so localStorage never overflows). Resolve them to real
    // URLs right before the game player reads them.
    //
    // Autoplay root-cause fix: the opening scene's soundtrack used to start
    // inside GamePlayer's mount effect — a macrotask AFTER this click — so the
    // browser's user-activation window had already closed and `play()` was
    // rejected on the credits node. Prime the opening track here, synchronously
    // inside the gesture, and hand the already-playing element to the player.
    let primedMusic: PrimedAudio | null = null;
    // Only a fresh run primes the opening narration. A resume lands mid-story,
    // where the start scene's prose MP3 is never adopted (playProse only
    // consumes the primer for the scene it is entering) and would otherwise
    // keep playing over the resumed scene until the player quit. Music priming
    // is safe on resume: an unused primer is paused when the scene mounts.
    const primedNarration = resumeSlot || resumeEpisodeId ? null : primeOpeningNarration(story);
    // An episodic season opens on its season screen, not on a scene, so there
    // is no opening track to prime — the episode's music starts after the
    // title card, well inside a later user gesture.
    const startScene = isEpisodic(story) ? undefined : story.scenes.find((s) => s.id === story.startSceneId);
    const openingTrack = startScene?.musicUrl ?? startScene?.sceneAudioUrl;
    if (startScene?.musicMode !== "none" && openingTrack && !/^(asset:|data:|video:)/.test(openingTrack)) {
      try {
        const el = new Audio(assetUrl(openingTrack));
        el.loop = true;
        el.volume = audio.volumes.master * audio.volumes.music;
        el.play().catch(() => {
          /* the player will adopt the element and retry on its own */
        });
        primedMusic = { url: openingTrack, el };
      } catch {
        /* fall back to the player's own attempt */
      }
    }
    resolveStoryMedia(story)
      .then((resolved) => setMode({ kind: "play", story: resolved, resumeSlot, resumeEpisodeId, playFromSceneId, primedMusic, primedNarration }))
      .catch((err) => {
        // Never leave the primed opening audio playing over the newsstand if
        // media resolution fails before the player mounts.
        if (primedNarration) primedNarration.el.pause();
        if (primedMusic) primedMusic.el.pause();
        console.warn("Couldn't resolve story media before play.", err);
      });
  }, [primeOpeningNarration]);

  // Robust export: try download, always try clipboard too, surface feedback via a
  // banner instead of silent failure (sandboxed previews often block downloads).
  const [notice, setNotice] = useState<string | null>(null);
  const say = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4200);
  };

  useEffect(() => {
    const syncFullscreen = () => {
      const bridge = window.scarletReelDesktop;
      if (bridge?.isFullscreen) {
        bridge.isFullscreen().then(setFullscreenOn).catch(() => setFullscreenOn(false));
      } else {
        setFullscreenOn(!!document.fullscreenElement);
      }
    };
    syncFullscreen();
    document.addEventListener("fullscreenchange", syncFullscreen);
    window.addEventListener("resize", syncFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      window.removeEventListener("resize", syncFullscreen);
    };
  }, []);

  const setFullscreenMode = useCallback(async (enabled: boolean) => {
    const bridge = window.scarletReelDesktop;
    try {
      if (bridge?.setFullscreen) {
        const active = await bridge.setFullscreen(enabled);
        setFullscreenOn(active);
        say(active ? "Fullscreen enabled." : "Windowed mode enabled.");
        return;
      }
      if (enabled) {
        await document.documentElement.requestFullscreen();
        setFullscreenOn(true);
        say("Fullscreen enabled.");
      } else {
        if (document.fullscreenElement) await document.exitFullscreen();
        setFullscreenOn(false);
        say("Windowed mode enabled.");
      }
    } catch {
      say(enabled ? "Fullscreen was blocked by the browser." : "Couldn't leave fullscreen.");
    }
  }, []);

  const applyResolution = useCallback(async (value: string) => {
    setResolutionValue(value);
    const choice = WINDOW_RESOLUTIONS.find((r) => `${r.width}x${r.height}` === value);
    if (!choice) return;
    const bridge = window.scarletReelDesktop;
    try {
      if (bridge?.setWindowSize) {
        const actual = await bridge.setWindowSize(choice.width, choice.height);
        setFullscreenOn(false);
        say(`Window set to ${actual.width} × ${actual.height}.`);
        return;
      }
      window.resizeTo(choice.width, choice.height);
      say("Resolution requested. Browsers only allow this for some popup windows; desktop builds support it fully.");
    } catch {
      say("Couldn't change window size here. Try the desktop build or use fullscreen.");
    }
  }, []);

  const quitGame = useCallback(async () => {
    const bridge = window.scarletReelDesktop;
    if (bridge?.quit) {
      await bridge.quit();
      return;
    }
    window.close();
    say("If this tab stays open, close it in your browser to quit.");
  }, []);

  const openStudioPlayWindow = useCallback((story: Story, fromSceneId?: string): boolean => {
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const key = studioPlayKey(token);
    // The playtest runs in a separate document, so an <audio> element primed
    // here could never be adopted there. Priming used to make the prose MP3
    // play behind Studio while skipOpeningNarration told the playtest tab to
    // wait for an element it would never receive — narration was silent in the
    // playtest and leaked out of the editor. Let the playtest start its own
    // narration; if a strict browser rejects the opening autoplay, the engine
    // retries the clip on the player's first real gesture.
    try {
      localStorage.setItem(key, JSON.stringify({ story, fromSceneId: fromSceneId ?? story.startSceneId, createdAt: Date.now() }));
    } catch {
      return false;
    }

    const baseUrl = location.href.split("#")[0];
    const sceneQ = fromSceneId ? `&scene=${encodeURIComponent(fromSceneId)}` : "";
    const child = window.open(`${baseUrl}${STUDIO_PLAY_HASH}${encodeURIComponent(token)}${sceneQ}`, "_blank");
    if (!child) {
      localStorage.removeItem(key);
      return false;
    }
    try {
      child.opener = null;
    } catch {
      /* noop — older browsers may not allow clearing opener */
    }
    return true;
  }, []);

  const downloadReel = async (data: unknown, filename: string) => {
    const text = JSON.stringify(data, null, 2);
    let downloaded = false;
    try {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      downloaded = true;
    } catch {
      downloaded = false;
    }
    try {
      await navigator.clipboard.writeText(text);
      say(downloaded ? `${filename} downloaded and copied to clipboard.` : `Clipboard ready — save it as ${filename}.`);
    } catch {
      say(downloaded ? `${filename} downloaded.` : `Download blocked — copy the JSON from Studio's Export modal instead.`);
    }
  };

  const endingsTotal = (s: Story) => s.scenes.filter((sc) => sc.isEnding).length;
  const endingsFound = (s: Story) => (endings[s.id] ?? []).length;

  return (
    <div
      className="h-full w-full overflow-hidden"
      onPointerDown={() => {
        audio.unlock();
        startMenuMusic();
      }}
    >
      {notice && (
        <div className="pop-in pointer-events-none fixed left-1/2 top-16 z-[95] -translate-x-1/2 border border-gold/60 bg-noir-950/95 px-4 py-2 font-type text-xs text-gold shadow-[0_0_40px_rgba(0,0,0,0.6)]">
          {notice}
        </div>
      )}
      {mode.kind === "play" && (
        <GamePlayer
          story={mode.story}
          typeSpeed={settings.typeSpeed}
          isNewGamePlus={endingsFound(mode.story) > 0}
          resumeSlot={mode.resumeSlot}
          resumeEpisodeId={mode.resumeEpisodeId}
          playFromSceneId={mode.playFromSceneId}
          primedMusic={mode.primedMusic}
          primedNarration={mode.primedNarration}
          onExit={() => setMode({ kind: "menu" })}
        />
      )}

      {mode.kind === "studio" && (
        <Studio
          baseStories={stories}
          onExit={() => setMode({ kind: "menu" })}
          onPlay={(s, opts) => {
            if (openStudioPlayWindow(s, opts?.fromSceneId)) {
              say("Playtest opened in a new window.");
            } else {
              say("Pop-up blocked or storage full — opening playtest here instead.");
              play(s, undefined, undefined, opts?.fromSceneId);
            }
          }}
          onPublish={(published) => {
            try {
              localStorage.setItem(publishedKey(published.id), JSON.stringify(published));
              setCatalog(loadPublishedCatalog());
              return true;
            } catch {
              return false;
            }
          }}
          onDeleteStory={(id, deleteMedia = false) => {
            const visible = [...STORIES, ...loadCustomStories()].filter((story) => !loadHiddenStories().includes(story.id));
            if (visible.length <= 1) return false;
            try {
              const hidden = new Set(loadHiddenStories());
              hidden.add(id);
              localStorage.setItem(HIDDEN_STORIES_KEY, JSON.stringify([...hidden]));
              localStorage.removeItem(publishedKey(id));
              localStorage.removeItem(draftKey(id));
              const nextCustom = loadCustomStories().filter((story) => story.id !== id);
              if (!saveCustomStories(nextCustom)) return false;
              // Wipe the ending record so the case leaves no trace behind.
              removeStoryEndings(id);
              setCustomStories(nextCustom);
              setHiddenStories([...hidden]);
              setEndings(loadEndings());
              setCatalog(loadPublishedCatalog());
              // Media assets stay in the library unless the author explicitly
              // asked to delete them too.
              if (deleteMedia) {
                deleteStoryAssets(id).catch(() => {});
              }
              return true;
            } catch {
              return false;
            }
          }}
          onCreateStory={(created) => {
            const nextCustom = [...loadCustomStories().filter((story) => story.id !== created.id), created];
            if (!saveCustomStories(nextCustom)) return false;
            setCustomStories(nextCustom);
            setCatalog(loadPublishedCatalog());
            return true;
          }}
          onUpdateTitleTheme={(theme) => {
            localStorage.setItem(GLOBAL_TITLE_THEME_KEY, JSON.stringify(theme));
            setGlobalTitleTheme(theme);
          }}
        />
      )}

      {mode.kind === "gallery" && (
        <div className="fx-grain relative h-full overflow-y-auto bg-noir-950 p-8">
          <div className="mx-auto max-w-4xl">
            <button
              onClick={() => setMode({ kind: "menu" })}
              className="mb-6 border border-paper/30 px-4 py-1.5 font-pulp text-[10px] uppercase tracking-widest text-paper/70 hover:text-neon"
            >
              ← Back to the newsstand
            </button>
            <h1 className="font-pulp text-4xl uppercase text-gold">Morgue File</h1>
            <p className="font-type mt-1 text-sm text-paper/60">
              Every headline you've earned, clipped and yellowing. Replay cases in New Game+ to collect the rest.
            </p>
            <div className="mt-8 space-y-8">
              {catalog.map((s) => {
                const found = endings[s.id] ?? [];
                const total = endingsTotal(s);
                return (
                  <section key={s.id}>
                    <h2 className="font-pulp text-xl uppercase tracking-wide text-paper">
                      {s.title} <span className="text-sm text-neon">{found.length}/{total} endings</span>
                    </h2>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {found.map((e) => (
                        <article key={e.sceneId} className="rotate-[-0.4deg] border-4 border-double border-noir-600 bg-paper p-3 text-noir-900">
                          <div className={`inline-block border px-1.5 font-pulp text-[9px] uppercase tracking-widest ${TIER_LABEL[e.tier].cls}`}>
                            {TIER_LABEL[e.tier].text}
                          </div>
                          <h3 className="font-pulp mt-1 text-lg leading-tight">{e.headline}</h3>
                          <div className="font-type mt-1 text-[10px] text-noir-700/70">
                            Filed {new Date(e.unlockedAt).toLocaleDateString()} — The Daily Sentinel
                          </div>
                        </article>
                      ))}
                      {Array.from({ length: Math.max(0, total - found.length) }).map((_, i) => (
                        <article
                          key={i}
                          className="flex min-h-24 items-center justify-center border-2 border-dashed border-noir-600 p-3 text-paper/30"
                        >
                          <span className="font-type text-xs">— headline not yet earned —</span>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {mode.kind === "menu" && (
        <div className="fx-grain fx-halftone fx-vignette relative h-full overflow-y-auto bg-noir-950">
          {/* Custom style block to support custom neon hex code */}
          {resolvedTitleTheme.neonColor && (
            <style>{`
              .neon-flicker-custom {
                color: ${resolvedTitleTheme.neonColor};
                text-shadow: 0 0 6px ${resolvedTitleTheme.neonColor}, 0 0 22px ${resolvedTitleTheme.neonColor}, 0 0 46px ${resolvedTitleTheme.neonColor}b0;
              }
            `}</style>
          )}
          {/* backdrop */}
          <div
            className="absolute inset-0 opacity-25 kenburns-a"
            style={{ backgroundImage: `url(${assetUrl(resolvedTitleTheme.bgImageUrl || "/img/bg-alley.jpg")})`, backgroundSize: "cover", backgroundPosition: "center" }}
            aria-hidden
          />
          <LensFlareLayer
            cinematic={{
              lensFlare: {
                preset: "anamorphic-blue",
                x: 65,
                y: 22,
                intensity: 0.85,
                streakIntensity: 0.95,
                streakWidth: 1.1,
                ghostIntensity: 0.75,
              },
            }}
          />
          <div className="relative z-40 mx-auto flex min-h-full max-w-5xl flex-col px-6 py-10">
            <header className="text-center">
              <div className="font-type text-[9px] uppercase tracking-[0.6em] text-paper/40">
                Gaslight Reelworks · Interactive Noir · v1.0
              </div>
              <div className="font-type text-xs uppercase tracking-[0.5em] text-cyan-neon neon-cyan mt-1">
                {resolvedTitleTheme.tagline || "A Dime-Store Detective Serial"}
              </div>
              <h1 className="neon-flicker-custom font-pulp mt-2 text-6xl uppercase md:text-7xl">
                {resolvedTitleTheme.titleText || "Scarlet Reel"}
              </h1>
              <p className="font-type mx-auto mt-3 max-w-xl text-sm text-paper/70">
                One clear flagship mystery, plus any cases you keep in your catalog. Investigate, solve mini-games, connect evidence, then accuse.
                Or step behind the camera in <span className="text-gold">Studio Mode</span> and shoot your own picture.
              </p>

              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => play(stories[0] ?? catalog[0])}
                  className="border-2 border-gold bg-gold/15 px-6 py-2.5 font-pulp text-xs uppercase tracking-[0.2em] text-gold shadow-[0_0_20px_rgba(232,178,60,0.3)] hover:bg-gold/25 transition-all hover:scale-105"
                >
                  ▶ Play Nobody's Witness (Dynamic Lens Flare)
                </button>
                <button
                  onClick={() => setMode({ kind: "studio" })}
                  className="border-2 border-cyan-neon bg-cyan-neon/15 px-6 py-2.5 font-pulp text-xs uppercase tracking-[0.2em] text-cyan-neon shadow-[0_0_20px_rgba(42,217,217,0.3)] hover:bg-cyan-neon/25 transition-all hover:scale-105"
                >
                  🎬 Open Studio Editor
                </button>
              </div>
            </header>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setMixerOpen((o) => !o)}
                className="border border-gold/50 bg-noir-950/80 px-3 py-1 font-pulp text-[10px] uppercase tracking-widest text-gold hover:border-neon hover:text-neon"
                title="Open the game menu"
                aria-expanded={mixerOpen}
              >
                ⚙ Game Menu
              </button>
              <button
                onClick={() => setVerticalRack((v) => !v)}
                className="border border-paper/30 bg-noir-950/70 px-3 py-1 font-pulp text-[10px] uppercase tracking-widest text-paper/70 hover:border-neon hover:text-neon"
                title="Toggle newsstand layout"
              >
                {verticalRack ? "Grid View" : "Magazine Rack"}
              </button>
            </div>

            <div className={`mt-4 ${verticalRack ? "space-y-4" : "grid gap-5 md:grid-cols-2 xl:grid-cols-3"}`}>
              {stories.map((s, idx) => {
                const found = endingsFound(s);
                const total = endingsTotal(s);
                return (
                  <button
                    key={s.id + idx}
                    onClick={() => play(s)}
                    className={`group relative overflow-hidden border-2 border-noir-600 bg-noir-800 text-left shadow-2xl transition-transform hover:-translate-y-1 hover:border-neon focus-visible:border-neon ${
                      verticalRack ? "flex w-full flex-col" : ""
                    }`}
                  >
                    <div className={`relative overflow-hidden ${verticalRack ? "h-72 w-full" : "h-44 w-full"}`}>
                      {s.coverImage.startsWith("gradient:") ? (
                        <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-110" style={coverStyle(s.coverImage)} />
                      ) : (
                        <img
                          src={assetUrl(s.coverImage)}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-noir-950 via-transparent" />
                      <div className="absolute left-2 top-2 border border-gold/70 bg-noir-950/85 px-2 py-0.5 font-pulp text-[9px] uppercase tracking-widest text-gold">
                        {s.id === "nobodys-witness"
                          ? "★ Flagship — Graphic Novel"
                          : s.id === "low-midnight"
                          ? "⭐ New — Neon Noir Horror"
                          : s.id === "jungle-juniper"
                          ? "⭐ New — Pulp Prehistoric"
                          : s.id === "war-of-the-worlds"
                          ? "⭐ New — Pulp Adaptation, H.G. Wells"
                          : s.id === "pulp-reel"
                          ? "⭐ New — Fan Homage, Original Dialogue"
                          : s.id === "blackwood-ledger"
                          ? "⭐ New — Neon Noir Break-In"
                          : s.id === "pier-four"
                          ? "⭐ New — Under Pier Four"
                          : s.id === "static-marlowe"
                          ? "🎞 Showcase — All Nodes"
                          : s.id === "glass-hour"
                          ? "⭐ Studio-Polished Case"
                          : s.id === "the-thing"
                          ? "⭐ New — Arctic Horror"
                          : s.id === "confession"
                            ? "New — Noir Thriller"
                            : s.id === "last-reel"
                              ? "Mystery Case"
                              : s.id === "velvet-sting"
                                ? "Charm Demo — Gating Test"
                                : "Library Case"}
                      </div>
                      {found > 0 && (
                        <div className="absolute right-2 top-2 border border-neon/70 bg-noir-950/85 px-2 py-0.5 font-pulp text-[9px] uppercase tracking-widest text-neon">
                          NG+ ready
                        </div>
                      )}
                      {isEpisodic(s) && (
                        <div className="absolute bottom-2 left-2 border border-crimson/70 bg-noir-950/90 px-2 py-0.5 font-pulp text-[9px] uppercase tracking-widest text-crimson">
                          🎞 {seasonEpisodes(s).length}-Part Season
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <h2 className="font-pulp text-lg uppercase leading-tight text-paper group-hover:text-neon">{s.title}</h2>
                      <p className="font-type mt-1 text-xs italic text-paper/60">{s.tagline}</p>
                      {isEpisodic(s) && (() => {
                        // Season progress strip: one pip per episode, filled as
                        // the player clears them.
                        const eps = seasonEpisodes(s);
                        const cleared = storySeasonProgress(s.id);
                        const done = eps.filter((ep) => cleared[ep.id]).length;
                        return (
                          <div className="mt-2">
                            <div className="flex items-center gap-1" aria-hidden>
                              {eps.map((ep) => (
                                <span
                                  key={ep.id}
                                  title={ep.title}
                                  className={`h-1 flex-1 ${cleared[ep.id] ? "bg-gold" : "bg-paper/15"}`}
                                />
                              ))}
                            </div>
                            <div className="mt-1 font-pulp text-[9px] uppercase tracking-widest text-gold/70">
                              {done}/{eps.length} episodes · {s.seasonTitle ?? "Season One"}
                            </div>
                          </div>
                        );
                      })()}
                      {s.briefing?.objective && (
                        <p className="font-type mt-2 border-l-2 border-cyan-neon/50 pl-2 text-[11px] leading-snug text-paper/70">
                          <span className="font-pulp text-[9px] uppercase tracking-widest text-cyan-neon">Case objective:</span> {s.briefing.objective}
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[10px] uppercase tracking-widest text-paper/40">
                          {s.scenes.length} scenes · {total} endings ({found} found)
                        </span>
                        <div className="flex items-center gap-1 text-[9px]">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const caseAssets = await loadStoryAssetsForExport(s);
                                const storyBundle: Story = { ...s, assets: caseAssets };
                                await downloadReel(storyBundle, `${s.id}.reel.json`);
                              } catch {
                                say("Failed to bundle media assets.");
                              }
                            }}
                            className="border border-emerald-500/30 px-1.5 py-0.5 font-pulp text-emerald-400 hover:bg-emerald-500/10"
                            title="Export case with all custom audio, video and images bundled"
                          >
                            ⤓
                          </button>
                          <label
                            onClick={(e) => e.stopPropagation()}
                            className="border border-emerald-500/30 px-1.5 py-0.5 font-pulp text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                            title="Import single case (restores custom assets)"
                          >
                            ⤒
                            <input
                              type="file"
                              accept=".json,.reel.json"
                              className="hidden"
                              onChange={async (e) => {
                                e.stopPropagation();
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (!file) return;
                                try {
                                  const text = await file.text();
                                  const importedBundle: Story = JSON.parse(text);
                                  if (!importedBundle.id || !importedBundle.scenes?.length) throw new Error("bad");
                                  
                                  if (Array.isArray(importedBundle.assets) && importedBundle.assets.length > 0) {
                                    await importStoryAssets(importedBundle.id, importedBundle.assets);
                                  }
                                  
                                  const { assets, ...cleanedStory } = importedBundle;
                                  const compacted = await compactStoryMedia(cleanedStory);
                                  
                                  localStorage.setItem(`scarlet-reel-published-${compacted.id}`, JSON.stringify(compacted));
                                  setCatalog(loadPublishedCatalog());
                                  say(`Imported "${compacted.title}" with ${assets?.length ?? 0} media asset(s).`);
                                } catch {
                                  say("Invalid case file or broken bundle.");
                                }
                              }}
                            />
                          </label>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (stories.length <= 1) {
                                say("At least one playable case must remain on the newsstand.");
                                return;
                              }
                              if (!confirm(`Hide "${s.title}" from the newsstand? You can restore it later.`)) return;
                              const hidden = new Set(loadHiddenStories());
                              hidden.add(s.id);
                              localStorage.setItem(HIDDEN_STORIES_KEY, JSON.stringify([...hidden]));
                              setHiddenStories([...hidden]);
                              setCatalog(loadPublishedCatalog());
                            }}
                            className="border border-crimson/40 px-1.5 py-0.5 font-pulp text-crimson hover:bg-crimson/10"
                            title="Hide case from newsstand"
                          >
                            ✕
                          </button>
                          {(() => {
                            // Episodic seasons keep save slots per episode, so
                            // "Resume" has to look across the whole season for
                            // the newest one rather than only slot 1.
                            const newest = latestSave(s);
                            return newest ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  play(s, newest.slot, newest.episodeId);
                                }}
                                className="border border-gold/60 px-2 py-0.5 font-pulp text-[9px] uppercase tracking-widest text-gold hover:bg-gold/15"
                                title={`Resume: ${newest.save.sceneTitle}`}
                              >
                                ▶ Resume
                              </button>
                            ) : null;
                          })()}
                          <span className="font-pulp text-[10px] uppercase tracking-widest text-gold group-hover:translate-x-1 transition-transform">
                            Play ▸
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={() => setMode({ kind: "studio" })}
                className="border-2 border-gold bg-gold/10 px-6 py-3 font-pulp text-sm uppercase tracking-[0.2em] text-gold hover:bg-gold/20"
              >
                🎬 Studio Mode — build your own reel
              </button>
              <button
                onClick={() => setMode({ kind: "gallery" })}
                className="border-2 border-paper/30 px-6 py-3 font-pulp text-sm uppercase tracking-[0.2em] text-paper/80 hover:border-cyan-neon hover:text-cyan-neon"
              >
                🗞 Morgue File — ending gallery
              </button>
              {/* Import / Export for the entire catalog */}
              <button
                onClick={async () => {
                  // Bulk Export — recursively fetch assets for all catalog stories
                  try {
                    const bundles: Story[] = [];
                    for (const s of catalog) {
                      const caseAssets = await loadStoryAssetsForExport(s);
                      bundles.push({ ...s, assets: caseAssets });
                    }
                    await downloadReel(bundles, "scarlet-reel-cases.reel.json");
                  } catch {
                    say("Failed to bundle media assets for all cases.");
                  }
                }}
                className="border-2 border-emerald-500/40 px-4 py-3 font-pulp text-xs uppercase tracking-[0.16em] text-emerald-400 hover:bg-emerald-500/10"
                title="Export your entire catalog including custom images and sounds"
              >
                ⤓ Export all
              </button>
              <label className="flex items-center justify-center cursor-pointer border-2 border-emerald-500/40 px-4 py-3 font-pulp text-xs uppercase tracking-[0.16em] text-emerald-400 hover:bg-emerald-500/10" title="Import single or multiple cases">
                ⤒ Import
                <input
                  type="file"
                  accept=".json,.reel.json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const parsed = JSON.parse(text);
                      const incoming: Story[] = Array.isArray(parsed) ? parsed : [parsed];
                      
                      let assetCount = 0;
                      for (const s of incoming) {
                        if (!s.id || !s.scenes?.length) continue;
                        
                        // Restore all bundled assets into IndexedDB
                        if (Array.isArray(s.assets) && s.assets.length > 0) {
                          await importStoryAssets(s.id, s.assets);
                          assetCount += s.assets.length;
                        }
                        
                        // Clean the large assets array from story metadata to avoid blowing localstorage quota
                        const { assets, ...cleanedStory } = s;
                        const compacted = await compactStoryMedia(cleanedStory);
                        localStorage.setItem(`scarlet-reel-published-${compacted.id}`, JSON.stringify(compacted));
                        localStorage.removeItem(`scarlet-studio-draft-${compacted.id}`);
                      }
                      
                      setCatalog(loadPublishedCatalog());
                      say(`Imported ${incoming.length} case(s) with ${assetCount} media asset(s).`);
                    } catch {
                      say("Invalid .reel.json file or broken bundle.");
                    }
                  }}
                />
              </label>

              {hiddenStories.length > 0 && (
                <button
                  onClick={() => {
                    localStorage.setItem(HIDDEN_STORIES_KEY, "[]");
                    setHiddenStories([]);
                    setCatalog(loadPublishedCatalog());
                  }}
                  className="border-2 border-paper/20 px-4 py-3 font-pulp text-xs uppercase tracking-[0.16em] text-paper/55 hover:border-gold hover:text-gold"
                >
                  Restore {hiddenStories.length} hidden case{hiddenStories.length === 1 ? "" : "s"}
                </button>
              )}
            </div>

            {mixerOpen && (
              <div className="pop-in fixed left-1/2 top-4 z-[90] max-h-[calc(100vh-2rem)] w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto border-2 border-gold/50 bg-noir-950/98 p-4 shadow-[0_0_60px_rgba(0,0,0,0.85)] backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3 border-b border-noir-600 pb-2">
                  <div>
                    <h3 className="font-pulp text-sm uppercase tracking-widest text-gold">⚙ Game Menu</h3>
                    <p className="font-type mt-0.5 text-[10px] text-paper/45">Sound, display and desktop controls. Saves and Resume Game are not affected.</p>
                  </div>
                  <button
                    onClick={() => setMixerOpen(false)}
                    className="border border-paper/20 px-2 py-1 font-pulp text-[9px] uppercase tracking-widest text-paper/60 hover:border-neon hover:text-neon"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 grid gap-5 md:grid-cols-2">
                  <section>
                    <h4 className="font-pulp text-[11px] uppercase tracking-widest text-cyan-neon">🎚 Sound Options</h4>
                    {(Object.keys(settings.volumes) as MixChannel[]).map((ch) => (
                      <label key={ch} className="mt-2 flex items-center gap-3 text-[11px] uppercase tracking-wider text-paper/60">
                        <span className="w-16">{ch}</span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={settings.volumes[ch]}
                          onChange={(e) =>
                            setSettings((s) => ({ ...s, volumes: { ...s.volumes, [ch]: Number(e.target.value) } }))
                          }
                          className="flex-1 accent-pink-500"
                        />
                        <span className="w-8 text-right">{Math.round(settings.volumes[ch] * 100)}</span>
                      </label>
                    ))}
                    <div className="mt-3 border-t border-noir-600 pt-3">
                      <label className="flex items-center gap-3 text-[11px] uppercase tracking-wider text-paper/60">
                        <span className="w-28">Typewriter speed</span>
                        <select
                          className="flex-1 border border-noir-600 bg-noir-800 px-2 py-1 text-xs text-paper"
                          value={settings.typeSpeed}
                          onChange={(e) => setSettings((s) => ({ ...s, typeSpeed: Number(e.target.value) }))}
                        >
                          <option value={45}>Slow burn</option>
                          <option value={22}>House style</option>
                          <option value={10}>Deadline mode</option>
                        </select>
                      </label>
                    </div>
                  </section>

                  <section>
                    <h4 className="font-pulp text-[11px] uppercase tracking-widest text-cyan-neon">🖥 Display</h4>
                    <label className="mt-2 block text-[10px] uppercase tracking-wider text-paper/55">
                      Screen resolution / window size
                      <select
                        value={resolutionValue}
                        onChange={(e) => void applyResolution(e.target.value)}
                        className="mt-1 w-full border border-noir-600 bg-noir-800 px-2 py-2 font-type text-xs text-paper"
                      >
                        <option value="1440x900">1440 × 900 — Default</option>
                        {WINDOW_RESOLUTIONS.map((res) => (
                          <option key={`${res.width}x${res.height}`} value={`${res.width}x${res.height}`}>
                            {res.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        onClick={() => void setFullscreenMode(true)}
                        className={`border px-3 py-2 font-pulp text-[10px] uppercase tracking-widest ${fullscreenOn ? "border-gold bg-gold/15 text-gold" : "border-paper/30 text-paper/70 hover:border-gold hover:text-gold"}`}
                      >
                        ⛶ Fullscreen
                      </button>
                      <button
                        onClick={() => void setFullscreenMode(false)}
                        className={`border px-3 py-2 font-pulp text-[10px] uppercase tracking-widest ${!fullscreenOn ? "border-gold bg-gold/15 text-gold" : "border-paper/30 text-paper/70 hover:border-gold hover:text-gold"}`}
                      >
                        ▣ Windowed
                      </button>
                    </div>
                    <p className="mt-2 font-type text-[10px] leading-relaxed text-paper/40">
                      Desktop builds apply window sizes directly. Browsers may block resizing; fullscreen still works after a click.
                      Shortcut: F11, or Ctrl+Cmd+F on macOS.
                    </p>

                    <div className="mt-4 border-t border-noir-600 pt-3">
                      <h4 className="font-pulp text-[11px] uppercase tracking-widest text-crimson">Quit</h4>
                      <button
                        onClick={() => void quitGame()}
                        className="mt-2 w-full border-2 border-crimson/60 bg-crimson/10 py-2 font-pulp text-[10px] uppercase tracking-widest text-crimson hover:bg-crimson/20"
                      >
                        ✕ Quit Game
                      </button>
                    </div>
                  </section>
                </div>
              </div>
            )}

            <footer className="mt-auto pt-10 text-center font-type text-[10px] text-paper/30">
              Keyboard: 1-9 / ↑↓ / WASD choices · Space advance · B corkboard · Esc quit · Ctrl+Z undo (Studio) — all vice
              strictly implied, never shown.
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
