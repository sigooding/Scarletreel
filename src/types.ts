/* ------------------------------------------------------------------ */
/*  Scarlet Reel — core data contracts                                 */
/* ------------------------------------------------------------------ */

export type MeterKey = "Sultry" | "Aggressive" | "Clever" | "Suspicion";
export type AttitudeTag = "Sultry" | "Aggressive" | "Clever" | "Neutral";
export type CursorKind = "look" | "take" | "talk" | "use" | "go";

export interface MeterChange {
  meter: MeterKey;
  delta: number;
}

export interface TrustChange {
  characterId: string;
  delta: number;
}

/** Shared gating rule used by hotspots, choices and dialogue beats. */
export interface Gating {
  requiresItems?: string[];
  requiresFlags?: string[];
  excludesItems?: string[];
  excludesFlags?: string[];
  /** when false, ANY of the requires* entries satisfies the gate (default true = all) */
  requiresAll?: boolean;
  minMeters?: Partial<Record<MeterKey, number>>;
  maxMeters?: Partial<Record<MeterKey, number>>;
  minTrust?: Record<string, number>;
  /** require that the player made one of these memory-tagged choices (see
   * Choice.memoryLog) before the gate opens. The keys may ALSO be story
   * flag names — a gate "remembers" a flag too (e.g. a character reacts
   * because you saw the body, not just because you said something).
   * Mirrors "the character recalls what you saw/said" rather than a bare
   * `requiresFlags` boolean. */
  requiresMemories?: string[];
}

export interface Consequences {
  setFlags?: string[];
  clearFlags?: string[];
  addItems?: string[];
  removeItems?: string[];
  meterChanges?: MeterChange[];
  trustChanges?: TrustChange[];
}

export type HotspotActionType =
  | "goToScene"
  | "giveItem"
  | "setFlag"
  | "showText"
  | "meterChange"
  | "openBoard"
  | "useItem"
  | "patternPuzzle";

export interface HotspotAction {
  type: HotspotActionType;
  targetSceneId?: string;
  itemGranted?: string;
  flagSet?: string;
  meterChange?: MeterChange;
  text?: string;
  /** for useItem hotspots: which held item is consumed */
  itemConsumed?: string;
  /** for patternPuzzle hotspots: the puzzle configuration */
  patternPuzzle?: import("./game/PatternPuzzleTypes").PatternPuzzleConfig;
}

export interface Hotspot {
  id: string;
  label: string;
  /** percentage bounds relative to the scene viewport */
  bounds: { x: number; y: number; w: number; h: number };
  cursor: CursorKind;
  isRepeatable?: boolean;
  gating?: Gating;
  action: HotspotAction;
  customFailMessage?: string;
  /** when true and the action grants an item, that item's image/emoji is drawn
   * inside the hotspot zone so players can literally see the object to pick up */
  showItemImage?: boolean;
  /** Scene-object image drawn inside the zone bounds — a cup, a watch, a key
   *  on a hook. Author it as a transparent-background image (PNG/WebP) so
   *  only the object is drawn over the background plate. The zone's bounds
   *  are the frame: drag/resize the zone to position and scale the object.
   *  It magnifies with the plate when the examine camera zooms in, and it
   *  follows the zone's visibility — hidden while the gate is shut, and
   *  gone for good once a one-shot zone is used (a picked-up object leaves
   *  the scene). */
  image?: string;
  /** How the object image fits its zone: "contain" keeps the whole object
   *  visible (default); "cover" fills the zone, cropping the overflow. */
  imageFit?: "contain" | "cover";
  /** EXAMINE interaction: instead of a click, the player HOLDS the pointer on
   * this hotspot. The scene camera zooms in on the hotspot bounds, an
   * "EXAMINING" meter fills over `examineSeconds` (default 2.5 — release
   * early and the examine aborts), and on completion the hotspot's normal
   * action fires: giveItem = you pick the object up, showText = the
   * description. The hotspot is then consumed (hidden). Pair the action's
   * flagSet with a beat gated on that flag to narrate the discovery.
   * Use a LARGE, detailed background image: the zoom is a CSS magnification,
   * so a small or low-res plate will blur when the camera pushes in. */
  examine?: boolean;
  /** Seconds the examine hold takes (default 2.5). */
  examineSeconds?: number;
}

export interface Choice {
  id: string;
  text: string;
  /** Where this choice navigates. Omitted for reply choices (reply: true),
   * which answer in place without moving; the validator warns if a reply
   * choice carries a target (it would navigate instead of replying). */
  targetSceneId?: string;
  attitudeTag?: AttitudeTag;
  gating?: Gating;
  consequences?: Consequences;
  /** A "conversational reply" that stays in the current scene: picking it applies
   * its consequences (flags/meters/trust/items) but does NOT navigate. It answers
   * the question in place — the next dialogue beat gated on the flag it sets
   * becomes the response. This is how branching Q&A dialogue is authored. */
  reply?: boolean;
  /** Hide this choice entirely until its gate is satisfied (instead of showing
   * it disabled with a hint). Ideal for sequential dialogue choices where the
   * upcoming questions shouldn't spoil the conversation. */
  hidden?: boolean;
  /** optional countdown; the choice evaporates when it hits zero */
  timeLimitSeconds?: number;
  /** Quick-time prompt: a hard deadline with a big on-screen prompt, a
   * countdown ring around the choice buttons, and (below ~30% remaining) an
   * optional heartbeat sting + shaky-cam cinematic swap for the choice. If the
   * window expires, the choice routes to `timedOutTargetSceneId` with
   * `timedOutConsequences` applied — a distinct "you hesitated" path, NOT just
   * silent removal. */
  quickTime?: boolean;
  /** big on-screen prompt text (defaults to `text`). */
  qtePrompt?: string;
  /** heartbeat SFX sting once the timer dips below ~30% remaining. */
  qteHeartbeat?: boolean;
  /** swap the scene's cinematic to SHAKY CAM once the timer dips below ~30%. */
  qteShakyCam?: boolean;
  /** where to route when the window expires (usually a consequence scene,
   * not necessarily a game-over). Defaults to `targetSceneId`. */
  timedOutTargetSceneId?: string;
  /** consequences applied when the window expires — the "you hesitated" effects
   * (e.g. set a flag so downstream beats can react to the silence). */
  timedOutConsequences?: Consequences;
  /** defaults to false for consequence choices and true for pure navigation */
  isRepeatable?: boolean;
  /** choices in the same group are mutually exclusive; choosing one resolves all */
  exclusiveGroup?: string;
  /** A short memory tag. When this choice is picked, the engine records the
   * player's exact line under this tag so a later DialogueBeat (or a gate) can
   * recall *this specific choice* — turning "the flag is set" into "the
   * character remembers what you said." */
  memoryLog?: string;
  /** Optional "X will remember that" impact line. After a navigating choice that
   * carries this, the game shows a Telltale-style full-screen card that fades in
   * and out (e.g. "Lydia will remember that.") — immediate, explicit feedback
   * that the choice mattered. */
  rememberLine?: string;
  /** The noir verb: this choice PRESENTS an item to the character in the
   * scene — you pull out the photograph and hold it up. The choice is
   * un-pickable until the item is actually held (the engine adds it to the
   * effective gate, so a hidden present choice stays hidden until you have
   * the thing to show). Presenting records an `item:<id>` memory (the
   * item's name), so a later beat can recall it ({said} = the item name)
   * or a gate can "remember" it — see Choice.memoryLog for the tag form. */
  presentItem?: string;
  /** Hand it over: the presented item leaves the satchel (they keep it).
   * Default false — you flash it, you keep it. The choice being one-shot
   * already prevents showing the same item twice for two reactions. */
  consumePresentedItem?: boolean;
}

export interface DialogueBeat {
  id: string;
  characterId: string;
  text: string;
  expression?: string;
  conditionRule?: Gating;

  /** Optional replacement background image (url / gradient: / asset:) shown
   * while this beat plays. Reverts to the scene's default background when the
   * next beat starts (or the dialogue finishes). */
  background?: string;
  /** Cinematic camera/lighting applied to this beat's replacement background. */
  cinematic?: CinematicSettings;
  /** Transition used when this beat's replacement background appears. */
  backgroundTransition?: "cut" | "fade" | "crossfade" | "fade-black" | "slide-left" | "slide-right" | "iris-in";
  /** Duration of the background transition in seconds (default 0.5). */
  backgroundTransitionSpeed?: number;

  /** optional MP3 voice line — plays instead of Web Speech TTS */
  audioUrl?: string;
  /** if true, this beat is silent and the text just appears (no narration at all) */
  silent?: boolean;
  /** when false, the speaker's talking keyframe animation is suppressed for
   * THIS beat (they show their resting pose instead). Default true so a
   * character with talking frames animates whenever they speak. */
  useCharacterAnimation?: boolean;
  /** Memory recall substitutions. Keys are Choice.memoryLog tags; the value is
   * the line to show instead of `text` when the player made that choice. Use
   * the `{said}` placeholder to echo the player's exact words. When several
   * memories are present, the first matching tag in insertion order wins. */
  recalls?: Record<string, string>;

  /* ---- AFTER THIS BEAT: route to another scene ----
   * Normally a beat's replacement background reverts to the scene plate when
   * the dialogue finishes (before the scene's choices appear). These fields
   * instead send the player to another scene the moment this beat DONE is
   * dismissed — so the insert shot crossfades straight into the next scene,
   * with no cut back to the scene's own background. This is the clean way to
   * chain insert shots / build cutscenes out of beats. Only meaningful on a
   * beat that is visible at the end of a scene's beat queue (a following beat
   * merely routes when its turn ends; the LAST visible beat performs it). */
  /** Scene to go to when this beat is dismissed. Ignored on every beat except
   * the last visible one in the queue (later beats take over). */
  afterBeatTargetSceneId?: string;
  /** "auto" (default): routes itself after `afterBeatDelaySeconds` once the
   * line has finished typing. "continue": waits for the player's ▸ Continue
   * / Space press — good when you want them to read it before it cuts. */
  afterBeatMode?: "auto" | "continue";
  /** Hold time (seconds) between the finished line and the auto-route
   * (default 1.6). Ignored in "continue" mode. */
  afterBeatDelaySeconds?: number;
}

export interface EndingData {
  tier: "victory-gold" | "victory-silver" | "gameover";
  headline: string;
  recap: string;
  /** In an episodic story, an ending normally closes only the EPISODE — the
   * player is offered "Next time on…" and the following episode. Set this to
   * true for an ending that stops the whole season here (a true finale, or a
   * run-ending catastrophe), even when later episodes exist. */
  endsSeason?: boolean;
}

/* ------------------------------------------------------------------ */
/*  episodes — a Story packed into a Telltale-style season             */
/* ------------------------------------------------------------------ */

/** One line of a "Previously on…" recap. Lines are gateable, so the recap
 * reflects what THIS player actually did last episode rather than replaying a
 * fixed trailer. */
export interface RecapLine {
  id: string;
  text: string;
  /** only shown when the gate passes (e.g. requiresFlags: ["took_the_bribe"]) */
  gating?: Gating;
  /** optional speaker — renders as an attributed line with their portrait */
  characterId?: string;
  /** optional still shown behind this recap beat (url / gradient: / asset:) */
  image?: string;
}

/**
 * An episode is a named slice of a story's scene graph with its own title
 * card, its own "Previously on…" recap, its own save slots and its own
 * endings. Finishing one snapshots the world state and carries it into the
 * next, so choices persist across the season.
 *
 * A story with no `episodes` array behaves exactly as before — episodes are
 * purely additive.
 */
/** A dramatic act inside one continuous story.
 *
 * Acts differ from Episodes deliberately: an Episode is a self-contained
 * chapter with its own save slots, ending and recap, whereas an Act is a
 * division *within* a single run. Acts give the player a title card, a name
 * for where they are, and a natural boundary for the route flowchart — the
 * chart at an act break shows the whole act rather than a single part. */
export interface Act {
  id: string;
  /** roman/wordy label shown above the title, e.g. "Act One" */
  label: string;
  /** the act's dramatic title, e.g. "The Woman Who Sold Herself Twice" */
  title: string;
  /** optional line under the title on the act card */
  tagline?: string;
  /** where the act begins — the scene the act-break choice routes to */
  startSceneId: string;
  /** still behind the act title card (url / gradient: / asset:) */
  titleCardImage?: string;
  /** seconds the card holds before it can be dismissed (default 2.6) */
  titleCardSeconds?: number;
}

export interface Episode {
  id: string;
  /** 1-based number shown on the title card ("Episode Two"). Defaults to its
   * position in the season. */
  number?: number;
  /** Optional suffix after the number for sub-chapters ("Episode 2a"). Used
   * when an act is split into several short episodes instead of one long one. */
  numberSuffix?: string;
  title: string;
  /** small kicker above the title (default: the story title) */
  kicker?: string;
  /** tagline under the title on the card */
  tagline?: string;
  /** every scene this episode owns. A scene belongs to exactly one episode. */
  sceneIds: string[];
  /** where the episode opens — must be one of `sceneIds` */
  startSceneId: string;
  /** still behind the title card (url / gradient: / asset:). Falls back to the
   * start scene's background. */
  titleCardImage?: string;
  /** cover art for this episode on the season screen */
  posterImage?: string;
  /** music that plays over the recap + title card */
  titleCardMusicUrl?: string;
  /** seconds the title card holds before it can be dismissed (default 2.4) */
  titleCardSeconds?: number;
  /** "Previously on…" beats, shown before the title card */
  recapLines?: RecapLine[];
  /** also replay the player's own remembered lines in the recap */
  recapFromMemories?: boolean;
  /** "Next time on…" teaser lines shown after this episode's ending card */
  nextTimeLines?: string[];
  /** playable from the season screen without clearing the previous episode */
  unlockedByDefault?: boolean;
  /** Alternate-route seasons: when set, this episode is unlocked only if one
   *  of the listed episodes was cleared — on one of its `endingSceneIds` when
   *  given, on ANY of its endings when omitted. Replaces the positional
   *  "previous episode cleared" rule for this episode. Already-cleared
   *  (replayable) copies still unlock. This is what lets a forked season keep
   *  each route's continuation chapter locked to the route that earned it. */
  unlockAfter?: { episodeId: string; endingSceneIds?: string[] }[];
  /** Per-ending "next time on…" routing: ending scene id → episode id.
   *  Overrides the positional next episode for that ending, so each fork of a
   *  season can point its curtain at its own continuation chapter. */
  nextEpisodeByEnding?: Record<string, string>;
  /** Per-ending "next time on…" teaser lines: ending scene id → lines.
   *  Falls back to `nextTimeLines`. */
  nextTimeByEnding?: Record<string, string[]>;
}

/** One line of a credits roll: a role label ("Directed by") and a name ("Sam Cole"). */
export interface CreditsLine {
  role: string;
  name: string;
}

/** Text-animation settings for a `credits` node. The node renders a proper
 * film-style intro: a kicker, a big title, a subtitle, a divider, then a list
 * of role/name credits. When `title` / `subtitle` / `lines` are omitted they
 * fall back to the scene's prose (line 1 = title, line 2 = subtitle, the rest =
 * name-only lines) so older stories keep working. */
export interface CreditsSettings {
  /** big title (defaults to prose line 1) */
  title?: string;
  /** smaller subtitle/tagline under the title (defaults to prose line 2) */
  subtitle?: string;
  /** the rolling role/name credits (defaults to prose lines 3+) */
  lines?: CreditsLine[];
  /** Typeface for the title sequence. Each maps to a loaded web font:
   * - pulp: Alfa Slab One — heavy pulp-paperback slab (default)
   * - poster: Bebas Neue — tall condensed film-poster caps
   * - elegant: Playfair Display — high-contrast prestige serif
   * - epic: Cinzel — chiselled Roman capitals
   * - modern: Josefin Sans — light geometric sans
   * - type: Newsreader — clean literary serif */
  font?: "pulp" | "poster" | "elegant" | "epic" | "modern" | "type";
  /** Motion applied to each card as it enters and leaves (default "blur-rise").
   * Only used by the "cards" style. "slam" is the pulp main-title punch: the
   * card lands oversized and snaps to size — the Tarantino chapter-card move. */
  cardMotion?: "blur-rise" | "letterspace" | "scale-down" | "slide" | "flicker" | "fade" | "slam";
  /** how the title enters (default "fade-up"); "slam" punches it in oversized */
  titleEntrance?: "fade-up" | "typewriter" | "slam";
  /** colour of the big title itself (default the neon gold, with a matching
   * glow). A stark yellow here over hard-cut stills is the classic title-card
   * look. Roles/labels stay on `accentColor`. */
  titleColor?: string;
  /** how the credits list presents:
   * - fade-up (default): the whole list staggers into place and stays
   * - scroll: rolling credits
   * - cards: a film title sequence — each credit fades IN, holds, fades OUT
   *   before the next one arrives, so the screen is mostly image */
  style?: "fade-up" | "scroll" | "cards";
  /** "cards" only: seconds each card is on screen, fade in + hold + fade out
   * (default 3.4). Total sequence = cardSeconds × (2 + lines.length). */
  cardSeconds?: number;
  /** Full-bleed stills that cross-dissolve behind the credits — a title
   * sequence montage. Replaces the scene background while the credits play.
   * Each entry is a url / `gradient:` / `asset:` reference. */
  montage?: string[];
  /** seconds each montage still holds before dissolving to the next (default 5) */
  montageSeconds?: number;
  /** how one still hands over to the next:
   * - dissolve (default): long cross-fade
   * - cut: hard cut — the Tarantino title-sequence bang, still to still */
  montageTransition?: "dissolve" | "cut";
  /** loop the montage back to the first still (default true). When false it
   * holds on the last image. */
  montageLoop?: boolean;
  /** seconds between successive line entrances (default 0.4) */
  stagger?: number;
  /** seconds each line takes to fade/slide in (default 0.85) */
  duration?: number;
  /** for "scroll": seconds for one full loop (default 24) */
  scrollDuration?: number;
  /** accent colour for the subtitle and role labels (default the cyan neon) */
  accentColor?: string;
  /** 35mm gate weave on the titles. Optically-printed titles were married to
   * the picture on a separate pass, so the type drifted against the plate:
   * a slow lateral sway (sprocket slop in the perforations) plus a tiny
   * per-frame registration error from the pulldown claw.
   * - off (default): dead steady, digital
   * - subtle: a well-maintained projector, barely perceptible
   * - worn: a print that has been round the circuit a few times
   * - projector: a tired rep-house machine, with occasional splice bumps */
  gateWeave?: "off" | "subtle" | "worn" | "projector";
}

/** A mid-ground parallax depth plane (see CinematicSettings.parallaxLayers). */
export interface ParallaxLayer {
  /** image url / `gradient:` / `asset:` reference — transparent cutouts work best */
  image: string;
  /** 0 (far plane, shifts the least) → 1 (near plane, shifts like the foreground) */
  depth: number;
  /** how the image fits its plane (same semantics as foregroundFit) */
  fit?: "contain" | "cover" | "fill" | "native";
  /** plane scale (default 1) */
  scale?: number;
  /** anchor position, % of frame (default 50 / 50) */
  x?: number;
  y?: number;
}

/** Named colour grade presets (see GRADE_PRESETS in src/cinematic.ts). */
export type GradePresetId =
  | "nolan-imax"
  | "tarantino-35mm"
  | "spielberg-golden"
  | "noir-1940s";

/** Cinematic camera/lighting settings applied to an image (scene background
 * or a dialogue beat's replacement background). */
export interface CinematicSettings {
  /** camera style: pan, zoom-to-subject, static, handheld shake, a rail/dolly
   * track slide across a wide image, or a vertigo dolly-zoom */
  mode?: "pan" | "zoom-hold" | "static" | "shake" | "dolly" | "dolly-zoom";
  /** where the camera zooms toward / holds (CSS background-position value) */
  focalPoint?: string;
  /** how long the zoom-in takes in seconds (default 8) */
  zoomDuration?: number;
  /** handheld shake intensity 0–1 (default 0.5) — drives jitter amplitude */
  shakeAmount?: number;
  /** extra roll/rotation in degrees for the handheld shake (default derives
   * from shakeAmount so old scenes keep their exact look) */
  shakeRotation?: number;
  /** seconds for one full jitter cycle (default 0.5 — lower = faster, jitterier) */
  shakeDuration?: number;
  /** dolly travel direction across the image (default "right") */
  dollyDirection?: "left" | "right";
  /** dolly travel distance as % of the image width (default 8) */
  dollyDistance?: number;
  /** seconds for one full dolly pass (default 10) */
  dollyDuration?: number;
  /** vertical drift % layered onto the dolly (0 = pure horizontal, default 0)
   * — turns a rail track into a diagonal/crane pan */
  dollyVertical?: number;
  /** peak background zoom for the vertigo dolly-zoom as a scale factor
   * (default 1.35 — the background eases from 1× to this and back) */
  dollyZoomAmount?: number;
  /** seconds for one full push-in / pull-out dolly-zoom cycle (default 8) */
  dollyZoomDuration?: number;
  /** which half of the vertigo move to play: push in, pull out, or both
   * (default "both" — eases in and back, looping) */
  dollyZoomDirection?: "push" | "pull" | "both";
  /** background blur in px applied while the vertigo zoom plays (default 0).
   * The foreground subject is a separate layer, so it stays sharp while the
   * world blurs behind it — the classic soft-focus dolly-zoom. */
  dollyZoomBlur?: number;
  /** transparent foreground overlay (subject) that stays fixed while the
   * camera moves — the vertigo/dolly-zoom anchor. Also renders over any other
   * moving camera mode when set. */
  foregroundImage?: string;
  /** scale of the foreground image (default 1) */
  foregroundScale?: number;
  /** how the foreground image is sized within the frame:
   * - contain: whole image fits, letterboxed (default)
   * - cover: fills the frame, cropping edges
   * - fill: stretches to fill the frame (ignores aspect ratio)
   * - native: drawn at its real pixel size (pair with scale) */
  foregroundFit?: "contain" | "cover" | "fill" | "native";
  /** the point ON the foreground image that is pinned at foregroundX/foregroundY
   * and that the animated zoom focuses on. CSS background-position style, e.g.
   * "50% 20%" for a face, "50% 100%" for feet. Default "50% 50%" (centre). */
  foregroundAnchor?: string;
  /** where the anchor point sits in the frame: % of frame width (default 50) */
  foregroundX?: number;
  /** where the anchor point sits in the frame: % of frame height (default 50) */
  foregroundY?: number;
  /** animated push-in (or pull-out) zoom applied to the foreground, focused on
   * foregroundAnchor. 1 = no zoom (default); >1 zooms in, <1 zooms out. */
  foregroundZoom?: number;
  /** seconds for the foreground zoom to complete (default 8) */
  foregroundZoomDuration?: number;
  /** optional keyframe animation that cycles the foreground subject through
   * several poses. When set, its `frames` replace the single foregroundImage
   * (every frame shares the same scale / fit / position). */
  foregroundAnimation?: ForegroundAnimation;
  /** drift distance for the slow "pan" mode as % of image width (default 0 —
   * keeps the gentle push-in only) */
  panDistance?: number;
  /** drift direction for the slow "pan" mode (default "right") */
  panDirection?: "left" | "right";
  /** overall image brightness 0–1 (default 1) */
  dimAmount?: number;
  /** one or more animated light glows layered over the image */
  lights?: LightPoint[];
  /** dynamic optical lens flare cinematic effect layered over the scene */
  lensFlare?: LensFlareSettings;
  /** multiple lens flare sources (when multiple distinct flares are authored) */
  flares?: LensFlareSettings[];

  /** Cinematic COLOR GRADE applied to the background plate: a named
   * director/stock look (see GRADE_PRESETS in src/cinematic.ts). Grades work
   * on ANY camera mode — they are a CSS filter + split-tone wash layered over
   * the moving plate, not a camera move. */
  colorGrade?: GradePresetId;
  /** Film-stock emulation: animated 35mm grain (stronger than the global
   * grain), gate weave, a soft halation bloom around highlights, light
   * flicker and the occasional dust/scratch pass. Sits ABOVE the grade so it
   * reads as the physical print of the graded image. */
  filmGrade?: boolean;
  /** Strength of the film-stock treatment, 0–1 (default 0.7). */
  filmGradeStrength?: number;

  /** Mouse/pointer PARALLAX depth: the camera subtly follows the cursor, and
   * the layers drift against each other (background slowest, foreground
   * fastest) for a diorama feel. 0/off–1 strong; default 0.35 when set.
   * Falls back to a gentle idle sway on devices with no pointer. */
  parallaxDepth?: number;
  /** Extra mid-ground depth planes between plate and subject. Each plane is a
   * transparent cutout that parallaxes at its own rate; `depth` 0 (far) → 1
   * (near) drives its shift. Great for window frames, crowds, fog banks. */
  parallaxLayers?: ParallaxLayer[];

  /** @deprecated legacy single light — merged into `lights` on next edit. */
  lightSource?: string;
  /** @deprecated legacy single light colour. */
  lightColor?: string;
  /** @deprecated legacy single light size. */
  lightRadius?: number;
}

/** How a foreground overlay animates through its keyframes. */
export type ForegroundAnimationMode = "dissolve" | "frames";

/** Keyframe animation for the foreground overlay subject (a character, prop or
 * frame). The frames are stacked at the same position/scale/fit and cycled in
 * order. `dissolve` smoothly opacity-fades between poses (e.g. a neutral pose
 * melting into a head-turned shock); `frames` hard-swaps sequential sprites
 * without interpolation — traditional comic-panel progression, the way Ace
 * Attorney or Hotel Dusk do limited animation. */
export interface ForegroundAnimation {
  mode: ForegroundAnimationMode;
  /** ordered image frames (url / asset:). This is the complete sequence —
   * include every pose you want played, including any starting pose. */
  frames: string[];
  /** seconds each keyframe is shown (default 0.2) */
  frameDuration?: number;
  /** dissolve only: seconds the cross-fade itself takes (default = frameDuration) */
  fadeDuration?: number;
  /** how many times to play through the sequence. undefined/0 = loop forever. */
  loops?: number;
}

/** One animated point of light. Renders additively (screen blend) and breathes
 * on a smooth sine-wave opacity curve, so it reads as living light rather than
 * a flat highlight. */
export interface LightPoint {
  /** glow centre as a CSS % position (0–100) */
  x: number;
  y: number;
  /** glow hue — any CSS colour (default warm amber #e8b23c) */
  color?: string;
  /** peak brightness 0–1 (default 0.5) */
  intensity?: number;
  /** glow diameter as a % of the container width (default 40) */
  size?: number;
  /** seconds for one full breath cycle (default 2.8) */
  pulseSeconds?: number;
  /** how strongly it breathes: 0 = steady, 1 = full swing (default 1) */
  pulseAmount?: number;
  /** optional lens flare attached to this light point */
  flare?: boolean | LensFlareSettings;
}

/** Optical style presets for cinematic lens flare effects. */
export type LensFlarePreset =
  | "anamorphic-blue"
  | "warm-amber"
  | "sci-fi-cyan"
  | "neon-noir"
  | "vintage-35mm"
  | "natural-sun"
  | "interrogation"
  | "emerald"
  | "custom";

/** Optical ghost reflections detail / count tier. */
export type LensFlareGhostTier = "subtle" | "standard" | "rich";

/** Dynamic lens flare cinematic effect configuration. Simulates optical lens
 * internal reflections, anamorphic laser streak beams, starburst diffraction
 * spikes, and multi-spectral chromatic ghost rings along the optical axis. */
export interface LensFlareSettings {
  /** whether the dynamic lens flare is active (default true when present) */
  enabled?: boolean;
  /** optical preset style (default "anamorphic-blue") */
  preset?: LensFlarePreset;
  /** light source origin X as a % of viewport width (0–100, default 50) */
  x?: number;
  /** light source origin Y as a % of viewport height (0–100, default 30) */
  y?: number;
  /** overall flare intensity / peak brightness 0–1 (default 0.75) */
  intensity?: number;
  /** primary flare color (hex or CSS color, defaults by preset) */
  color?: string;
  /** secondary / chromatic ghost ring tint (hex or CSS color) */
  secondaryColor?: string;
  /** anamorphic horizontal streak beam intensity 0–1 (default 0.85) */
  streakIntensity?: number;
  /** anamorphic streak vertical thickness / dispersion (0.2–3, default 1) */
  streakWidth?: number;
  /** anamorphic streak angle in degrees (-45 to 45, default 0 for horizontal) */
  streakAngle?: number;
  /** optical ghost reflections intensity 0–1 (default 0.7) */
  ghostIntensity?: number;
  /** ghost reflections spread / spacing along optical axis (0.5–2.0, default 1) */
  ghostSpread?: number;
  /** ghost artifact detail count (default "standard") */
  ghostCount?: LensFlareGhostTier;
  /** starburst diffraction rays intensity 0–1 (default 0.6) */
  starburstIntensity?: number;
  /** number of starburst ray spikes (4, 6, 8, or 12, default 6) */
  starburstRays?: number;
  /** central core glow and corona halo diameter % (10–100, default 40) */
  coreSize?: number;
  /** dynamic shimmer / pulse duration in seconds (0.5–8, default 2.6) */
  pulseSeconds?: number;
  /** dynamic shimmer / breathing depth 0–1 (default 0.4) */
  pulseAmount?: number;
  /** reactivity / parallax response to camera motion 0–2 (default 1) */
  reactivity?: number;
  /** optional index of a point light to link this flare's position to */
  linkToLight?: number;
}

/**
 * Explicit win/lose contract shown to the player in the Case File panel.
 * Without this, players have no idea what they are aiming at or what kills them.
 */
export interface CaseBriefing {
  /** one-line statement of the case goal */
  objective: string;
  /** how the player achieves the best outcome */
  winConditions: string[];
  /** what will end the case badly */
  loseConditions: string[];
  /** Suspicion value that triggers an automatic bust. 0/undefined disables it. */
  heatLimit?: number;
  /** scene the player is sent to when heatLimit is reached */
  heatFailSceneId?: string;
}

export interface OnEnterAction {
  consequences?: Consequences;
  /** Optional gate: the consequences apply only when the rule passes against
   * the state at entry. Lets a scene fire a flag conditionally (e.g. a
   * budget running out before a certain point) without a choice involved. */
  conditionRule?: Gating;
}

/** Composure-pressure interrogation on the scene's suspect. Talking is the
 * core loop, so it gets tension: every PRESSING reply (a reply choice with a
 * non-Neutral attitude tag) chips the suspect's composure. When it hits zero
 * the suspect is at their limit and TRUST DECIDES: at/above crackTrust they
 * CRACK (broke beat + brokeFlag + the big swing), below it they CLAMP
 * (clamped beat + clampFlag + the backfire). Charm your way up first and the
 * pressure pays; press cold and it rebounds.
 *
 * Composure is DERIVED — it's the initial value minus the pressing replies
 * already in usedChoices — so it persists across saves and re-entries and
 * can't be ground: a press is one-shot and never comes back. */
export interface Interrogation {
  /** The character being pressed — their name labels the composure gauge. */
  characterId: string;
  /** Composure hits before the suspect breaks (default 3). */
  composure?: number;
  /** Seconds the suspect stays "pressed" before they STEADY if you stop
   * pressing — one +1 recovery, once per scene. This is the urgency: hesitate
   * and the moment passes. Default 7, range 3–12. */
  steadySeconds?: number;
  /** Optional short reaction lines shown as the suspect is pressed down,
   * indexed from composure = composure-1 (index 0) down to 1. Adds the
   * "they're winding up" dynamism. A default escalating set is used when
   * omitted or an index is missing. */
  pressReactions?: string[];
  /** Trust at/above which zero composure = CRACK instead of CLAMP (default 0). */
  crackTrust?: number;
  /** The "broke" beat — plays the moment they crack. */
  brokeBeat: DialogueBeat;
  /** Flag set on the crack — gate the payoff content on it. */
  brokeFlag: string;
  /** The big swing on the crack (trust/heat/meters). */
  brokeConsequences?: Consequences;
  /** The "clamped" beat — plays when they shut down instead. */
  clampedBeat?: DialogueBeat;
  /** Flag set on the clamp — gate the fallout on it. */
  clampFlag?: string;
  /** The backfire on the clamp (usually heat+ / trust-). */
  clampConsequences?: Consequences;
}

export interface SceneNode {
  id: string;
  title: string;
  /** Author's sticky note for the Studio canvas — shown as a strip on the
   * scene's node card. Studio metadata only; the game never renders it. */
  note?: string;
  /** standard, credits (no HUD, big typography), or cutscene (no HUD, full-screen video) */
  nodeType?: "standard" | "credits" | "cutscene";
  /** Marks this scene as the END OF A PART. On leaving it, the game shows the
   * route flowchart for the part just played before continuing. The string is
   * the part's display name (e.g. "Part 3 — Two Hundred and Eleven Thousand").
   * Endings show their chart automatically and don't need this. */
  partBreak?: string;
  /** image url, `gradient:<css-gradient>`, `video:<mp4>` */
  background: string;
  /** synth ambient preset id, `mp3:<url>` or `video:` audio track */
  ambientAudio?: string;
  /** MP3 URL that plays over this scene as background music / narration */
  sceneAudioUrl?: string; // new: MP3 file URL for scene audio
  /** looping background music file; sceneAudioUrl remains a legacy alias */
  musicUrl?: string;
  /** How scene music behaves on entry:
   * - inherit (default): keep playing whatever the previous scene started
   * - track: play musicUrl (switches tracks; same track keeps looping)
   * - none: stop the soundtrack entirely */
  musicMode?: "inherit" | "track" | "none";
  /** Seconds to cross-fade the soundtrack when this scene changes it.
   *  Applies to both the outgoing track and the incoming one, so a switch is
   *  a true crossfade. Defaults to 1.4s. 0 = hard cut (the old behaviour). */
  musicFadeSeconds?: number;
  /** one-shot recorded prose narration, used instead of Web Speech */
  narrationAudioUrl?: string;
  /** scene-level narration override; defaults to true */
  autoNarrate?: boolean;
  /** Minimum seconds the scene holds before its choices (and, on credits /
   * cutscene nodes, the continue button) become available. 0/undefined = instant.
   * A cinematic pacing knob, most useful on credits/cutscene nodes. */
  choiceDelaySeconds?: number;
  /** When set, a scene with no available choices automatically routes here
   * after the timer once prose + dialogue + any cinematic hold have finished. */
  autoAdvanceTargetSceneId?: string;
  /** Seconds to wait before auto-routing to autoAdvanceTargetSceneId. */
  autoAdvanceDelaySeconds?: number;
  /** Hide the on-screen auto-advance countdown from the player. */
  autoAdvanceHideTimer?: boolean;
  /** text-animation settings for the credits node's intro (ignored on other node types) */
  credits?: CreditsSettings;
  /** when true, prose renders instantly with no typewriter tick — use when MP3 voice is the real narration */
  noTypewriter?: boolean;
  /** visual particle overlay; if undefined, falls back to legacy auto-matching based on ambient audio */
  particles?: "none" | "rain" | "smoke" | "storm";
  /** cinematic camera motion applied to the scene background image */
  cinematic?: CinematicSettings;
  /** Show Telltale-style letterbox bars (top/bottom black bands) over the scene. */
  letterbox?: boolean;
  /** How the scene enters over the previous one. "fade" = dissolve, "fade-black"
   * = dip to black then back, "cut" = instant. Defaults to "fade". */
  transition?: "fade" | "fade-black" | "cut";
  /** Seconds for the scene entry transition (default 0.5). */
  transitionSpeed?: number;
  prose: string;
  dialogueBeats?: DialogueBeat[];
  hotspots?: Hotspot[];
  choices?: Choice[];
  onEnterActions?: OnEnterAction[];
  /** Composure-pressure interrogation on this scene's suspect (see
   * Interrogation). Pressing replies chip composure; at zero, trust decides
   * crack vs clamp. */
  interrogation?: Interrogation;
  isEnding?: boolean;
  endingData?: EndingData;
}

export interface Item {
  id: string;
  name: string;
  icon: string; // emoji glyph
  /** image URL for item icon; falls back to emoji if set */
  iconUrl?: string;
  description: string;
  flavorText: string;
  isClue?: boolean;
  combinableWith?: { targetItemId: string; resultItemId: string };
}

export type AssetType = "audio" | "video" | "image";

export interface MediaAsset {
  id: string;
  name: string;
  type: AssetType;
  /** portable base64 data URL used for export/import and browser fallback */
  dataUrl: string;
  /** desktop-only playable copy written to the game media folder */
  fileUrl?: string;
  /** size in bytes */
  size: number;
  uploadedAt: number;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  /** image url or `emoji:<glyph>` token */
  avatarUrl: string;
  trustMeter: number;
  /** optional Web Speech voice settings chosen in Studio */
  voice?: { voiceName?: string; pitch?: number; rate?: number };
  /** ElevenLabs `voice_id` (a stock voice or a clone from the ElevenLabs
   *  console) used to generate this character's dialogue lines as MP3s in
   *  Studio. The API key itself is kept in the browser (localStorage),
   *  never in the story data. */
  elevenVoiceId?: string;
  /** Talking keyframes — sprite frames that auto-cycle as an on-scene portrait
   * while this character is the active speaker (a dialogue beat), the
   * VN / Ace-Attorney "animated while talking" look. Each entry is a url /
   * `asset:` reference; transparent PNGs work best. */
  talkingFrames?: string[];
  /** seconds each talking frame holds (default ~0.16) */
  talkingFrameDuration?: number;
  /** horizontal position of the talking sprite, % from left (default 50) */
  talkingX?: number;
  /** scale of the talking sprite (default 1) */
  talkingScale?: number;
  /** resting/neutral pose shown when this character is on-scene but NOT the
   * active speaker (falls back to talkingFrames[0] if unset). */
  talkingRest?: string;
  /** mirror the sprite horizontally (face left) so two speakers can face
   * each other across the frame. */
  talkingFlip?: boolean;
  /** vertical position of the sprite, % up from the floor (default 0). */
  talkingY?: number;
}

export interface DeductionConnection {
  a: string; // clue item id or character id
  b: string;
  flagSet: string;
  revelation: string;
}

export interface DeductionBoard {
  suspectIds: string[];
  connections: DeductionConnection[];
}

export interface Story {
  id: string;
  title: string;
  tagline: string;
  coverImage: string;
  startSceneId: string;
  scenes: SceneNode[];
  items: Item[];
  characters: Character[];
  deduction?: DeductionBoard;
  /** explicit win/lose rules surfaced to the player */
  briefing?: CaseBriefing;
  /** Optional episodic structure. When present the story is presented as a
   * season: a season screen, per-episode title cards + recaps, per-episode
   * save slots, and per-episode endings. When absent the story plays as one
   * continuous case exactly as before. */
  episodes?: Episode[];
  /** label for the season on the episode screen (default "Season One") */
  seasonTitle?: string;
  /** Optional act structure.
   *
   * Membership is DERIVED, never declared: an act owns every scene reachable
   * by choice edges from its `startSceneId`, stopping at any other act's
   * start scene (see routeGraph.scenesInAct). Authors therefore only nominate
   * where each act BEGINS — the graph decides the rest, and it can never fall
   * out of sync with the story the player actually walks.
   *
   * The trade-off is that a single cross-act link silently merges two acts,
   * so validateStory() checks for overlap, empty acts and orphaned scenes.
   *
   * Acts are a *presentational* grouping inside a
   * single continuous run — unlike episodes they don't split saves or endings.
   * They give the story act title cards and scope the route flowchart, so the
   * chart shown at the end of an act covers that act only. */
  acts?: Act[];
  /** Author notes for story flags: flag id -> one short line of what the
   * flag MEANS in-story. Shown in Studio's 🏷 Flags tab (next to where the
   * flag is set), echoed by a dialogue beat that recalls the flag (in place
   * of the player's exact words), and listed in the player's Case Progress
   * "Story so far" readout. */
  flagNotes?: Record<string, string>;
  /** Look of the bottom dialogue/choice panel. Story-wide, so the reading
   * surface stays consistent from scene to scene. */
  dialogueBox?: DialogueBoxTheme;
  /** studio canvas layout: sceneId -> position */
  layout?: Record<string, { x: number; y: number }>;
  /** transport-only array to package IndexedDB assets during import/export */
  assets?: MediaAsset[];
}

/**
 * Look and behaviour of the dialogue/choice panel at the bottom of the frame.
 *
 * The panel is anchored to the bottom of the screen, so anything that changes
 * its height moves every control inside it. While prose types out line by
 * line the box grows upward, which used to drag the inline narrate/skip
 * buttons up with it — a moving target the player is trying to click.
 * `reserveLines` fixes a floor for the text area so the panel keeps one
 * height for the whole scene and the controls stay put.
 */
export interface DialogueBoxTheme {
  /** Reserve room for this many lines of prose so the panel doesn't grow as
   * text types in. 0 disables the reservation (the old reflowing behaviour).
   * Default 3. */
  reserveLines?: number;
  /** Backdrop image behind the panel (url / gradient: / asset:). When unset
   * the panel keeps the plain scrim. */
  backgroundImage?: string;
  /** Opacity of the panel backdrop, 0–1. Default 0.85. */
  backgroundOpacity?: number;
  /** Tint drawn under the backdrop image, as a CSS colour. Default near-black. */
  backgroundColor?: string;
  /** Blur the scene art behind the panel, in px. Default 0 (no blur). */
  backdropBlur?: number;
  /** Draw a hairline border + shadow around the panel so it reads as a
   * physical card rather than a gradient. Default false. */
  bordered?: boolean;
}

/** Global config for the main title / landing page */
export interface TitleTheme {
  titleText?: string;
  tagline?: string;
  musicUrl?: string;
  bgImageUrl?: string;
  neonColor?: string; // custom flicker neon hex code
}

export interface GlobalState {
  activeFlags: Set<string>;
  inventory: Item[];
  meters: Record<MeterKey, number>;
  characterTrust: Record<string, number>;
  /** memoryLog tag -> the player's exact line. Set when a choice carrying a
   * memoryLog tag is picked; read by DialogueBeat.recalls and Gating.requiresMemories.
   * This is what lets NPCs recall *your* words, not merely a boolean. */
  memories: Record<string, string>;
}

/* ---------------- audio extensibility contract ---------------- */

export interface AudioTrack {
  id: string;
  label: string;
  kind: "synth" | "file";
  /** mp3/ogg url when kind === "file" */
  url?: string;
  /** synth preset name when kind === "synth" */
  preset?: string;
  baseVolume?: number;
}

/* ---------------- persistence ---------------- */

export interface UnlockedEnding {
  sceneId: string;
  headline: string;
  tier: EndingData["tier"];
  unlockedAt: number;
  /** which episode this ending closed, when the story is episodic */
  episodeId?: string;
}

/** Per-episode completion record: which episodes a player has cleared, how they
 * ended them, and the world state carried out of each one. The carry-over is
 * what makes episode 2 open with the consequences of episode 1. */
export interface EpisodeProgress {
  episodeId: string;
  /** the ending scene that closed it */
  endingSceneId: string;
  endingHeadline: string;
  endingTier: EndingData["tier"];
  completedAt: number;
  /** world state snapshot at the moment the episode ended — loaded as the
   * starting state of the next episode */
  carry: {
    activeFlags: string[];
    inventory: string[];
    meters: Record<MeterKey, number>;
    characterTrust: Record<string, number>;
    memories: Record<string, string>;
  };
}

/** storyId -> episodeId -> progress */
export type SeasonLog = Record<string, Record<string, EpisodeProgress>>;

export type EndingLog = Record<string, UnlockedEnding[]>; // storyId -> endings

/** A single save-slot snapshot of a playthrough, kept small so it fits easily
 * in localStorage. Item ids and flags are stored as strings and rebuilt against
 * the story on load. */
/** One decision point in the ordered record of a playthrough. Sets can't
 * express order, so the flowchart needs its own append-only log: which scene,
 * which choice was taken, and — crucially — which sibling choices existed at
 * that moment and were not taken. That's what makes the chart legible as
 * "here's the road you didn't walk". */
export interface JourneyStep {
  sceneId: string;
  sceneTitle: string;
  /** the chosen choice's id, or null for an automatic//single transition */
  choiceId: string | null;
  choiceText?: string;
  attitudeTag?: AttitudeTag;
  /** sibling choices present at this node. `taken` marks the one picked;
   * `locked` marks options that were visible but gated shut. */
  options: {
    id: string;
    text: string;
    taken: boolean;
    locked?: boolean;
    attitudeTag?: AttitudeTag;
  }[];
  /** the "X will remember that" line, if this choice carried one */
  rememberLine?: string;
  /** timed-out quick-time events are decisions too — the player decided by
   * not deciding, and the chart should say so. */
  timedOut?: boolean;
  /** trust deltas applied here, for the relationship rail */
  trustChanges?: TrustChange[];
  /** flags this decision set — the choice's own consequences, or the
   * timed-out consequences of an expired quick-time prompt. Recorded so the
   * end-of-part flowchart and end-of-act route map can list the "route
   * notes" (with Story.flagNotes) for the stretch just played. */
  flagsSet?: string[];
}

export interface GameSave {
  /** Save-slot schema version (see SAVE_SCHEMA / migrateSave in logic.ts).
   *  Absent on saves written before versioning existed — those ARE v1.
   *  Reads refuse versions NEWER than the running build rather than
   *  mis-loading a shape they don't understand. */
  schema?: number;
  storyId: string;
  /** which episode this save belongs to — save slots are per-episode so each
   * chapter keeps its own three slots, Telltale-style. */
  episodeId?: string;
  sceneId: string;
  sceneTitle: string;
  savedAt: number;
  activeFlags: string[];
  inventory: string[]; // item ids — rebuilt from the story on load
  meters: Record<MeterKey, number>;
  characterTrust: Record<string, number>;
  memories: Record<string, string>;
  proseAcknowledged: boolean;
  beatIdx: number;
  usedHotspots: string[];
  usedChoices: string[];
  visitedScenes: string[];
  encounteredCharacters: string[];
  expiredChoices: string[];
  choiceClocks: Record<string, number>;
  /** live interrogation composure by sceneId (initial until first pressed,
   * 0 = broken/clamped). Persists so a mid-interrogation save keeps its state. */
  composure?: Record<string, number>;
  /** scenes whose suspect has already steadied once (recovery is one-shot). */
  steadied?: Record<string, boolean>;
  /** ordered decision log powering the end-of-part flowchart */
  journey?: JourneyStep[];
  /** how many journey steps were already charted at the last part break */
  chartedUpTo?: number;
  /** acts whose title card has already played, so loading mid-story doesn't
   * replay a card the player has seen */
  seenActs?: string[];
}
