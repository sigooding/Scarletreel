import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Connection,
  type Edge,
  type EdgeProps,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { audio } from "../audio";
import { CREDITS_PRESETS, CREDITS_PRESET_GROUPS, CREDITS_PRESET_LIST, applyCreditsPreset, creditsLookSummary, matchCreditsPreset } from "../credits";
import {
  BODY_FONTS,
  defaultLensFlare,
  defaultLight,
  GRADE_PRESETS,
  GRADE_PRESET_LIST,
  HEADING_FONTS,
  HUD_THEMES,
  HUD_THEME_LIST,
  inGameThemeVars,
  LENS_FLARE_PRESETS,
  lightPoints,
  lightStyle,
  parallaxStyle,
  parseGlowColor,
  resolveLensFlare,
  resolveLights,
} from "../cinematic";
import { cinematicLayer, CinematicOverlays, ForegroundExtras, ForegroundLayer, LensFlareLayer, ParallaxMidLayers, parseAnchor, spriteGradeStyle } from "../game/Game";
import {
  characterOpinion,
  clamp,
  collectFlags,
  normalizeLegacyStory,
  collectMemoryTags,
  deepClone,
  effectiveChoiceGating,
  encodeStory,
  flagSetSources,
  meetsGating,
  METER_LABELS,
  METER_SHORT,
  prettyFlagName,
  episodeOfScene,
  unassignedScenes,
  seasonEpisodes,
  stageFloor as stageFloorOf,
  storyEdges,
  CURSOR_ICON,
  CURSOR_SLOTS,
  CORE_VERB_IDS,
  VERB_ICON,
  VERB_IDS,
  VERB_LABEL,
  uid,
  validateStory,
  type ValidationIssue,
} from "../logic";
import { MediaLibrary, AssetDropdown, MediaUploadButton, CharacterVoiceFiles } from "./MediaLibrary";
import { ImagePicker } from "./ImagePicker";
import { EXTRA_PRESET, SheetLab, SpriteSheetControls, TALKING_PRESET, WALKER_PRESET } from "./SheetEditor";
import { SheetSprite } from "../game/SheetSprite";
import { sheetDrawable } from "../game/spriteSheet";
import { SpriteCutoutLab } from "./SpriteCutout";
import { BackgroundRemover } from "./BackgroundRemover";
import { PlaytestCoveragePanel } from "./PlaytestCoverage";
import { ANIM_PRESETS, EASES, describeMotion, type MotionPath } from "../game/animation";
import { SpriteBoxEditor } from "./SpriteBoxEditor";
import { AiImageStudio } from "./AiImageStudio";
import { EpisodeEditor } from "./EpisodeEditor";
import { ActEditor, ACT_TINTS } from "./ActEditor";
import { HelpNote, StudioHelpModal } from "./StudioHelp";
import { healLayout, tidyLayoutPositions } from "./canvas";
import {
  audioTagsForModel,
  ELEVENLABS_MODELS,
  convertConfirmMessage,
  estimateVoiceCost,
  getElevenKey,
  getElevenModel,
  modelSupportsAudioTags,
  setElevenKey,
  setElevenModel,
  synthesizeElevenLabs,
} from "./aiVoice";
import {
  clearVoiceFolder,
  isDesktop,
  linkVoiceFolder,
  loadPersistedVoiceFolder,
  requestVoiceFolderPermission,
  saveGeneratedVoice,
  voiceFolderSupported,
} from "./voiceFiles";
import { scenesInAct } from "../game/routeGraph";
import { assetBackground, assetUrl } from "../assetPath";
import {
  bundleVoiceFileRefs,
  importStoryAssets,
  compactStoryMedia,
  uploadAsset,
  uploadDataUrlAsset,
  useResolvedMedia,
  useAllAssets,
  useStorageAvailable,
  loadStoryAssetsForExport,
} from "../data/mediaLibrary";
import type {
  Character,
  Choice,
  CinematicSettings,
  Consequences,
  Contradiction,
  CreditsSettings,
  CursorKind,
  ForegroundAnimation,
  ForegroundAnimationMode,
  ForegroundExtra,
  CursorArt,
  Gating,
  GlobalState,
  Hotspot,
  InventorySettings,
  Item,
  LensFlareGhostTier,
  LensFlarePreset,
  LensFlareSettings,
  LightPoint,
  MapLocation,
  MeterKey,
  SceneNode,
  Story,
} from "../types";

/* ------------------------------------------------------------------ */

const ATTITUDE_STROKE: Record<string, string> = {
  Sultry: "#ff2e88",
  Aggressive: "#e23b4e",
  Clever: "#2ad9d9",
  Neutral: "#8b8b9e",
  Hotspot: "#e8b23c",
};

const BACKGROUNDS = [
  "/img/bg-office.jpg",
  "/img/bg-club.jpg",
  "/img/bg-alley.jpg",
  "/img/bg-penthouse.jpg",
  "/img/bg-dressing.jpg",
  "gradient:linear-gradient(135deg,#1e1b4b 0%,#831843 100%)",
  "gradient:linear-gradient(135deg,#134e4a 0%,#312e81 100%)",
  "gradient:linear-gradient(160deg,#713f12 0%,#0c0c14 70%)",
  "gradient:linear-gradient(135deg,#0c0c14 0%,#2b2b3f 100%)",
  // More ready-made pulp locations shipped in /img, so authors have a real set
  // to pick from without uploading. APPENDED after the first nine so the index
  // defaults used elsewhere (BACKGROUNDS[0], [2], [8]) stay stable.
  "/img/bg-diner-booth.jpg",
  "/img/bg-neon-diner.jpg",
  "/img/bg-jazz-club.jpg",
  "/img/bg-casino.jpg",
  "/img/bg-backroom-casino.jpg",
  "/img/bg-docks.jpg",
  "/img/bg-corridor.jpg",
  "/img/bg-basement.jpg",
  "/img/bg-vault.jpg",
  "/img/bg-safehouse.jpg",
  "/img/bg-mini-mart.jpg",
  "/img/bg-saltflats.jpg",
];

const AMBIENTS = ["none", "rain", "jazz", "drone", "tension"];

/** The title-sequence faces as CSS variables — used by the credits preset
 * picker to render each card's name in the very typeface the look dials in.
 * Inline vars rather than `font-*` classes so the map stays data-driven. */
const CREDITS_FONT_VAR: Record<string, string> = {
  pulp: "var(--font-pulp)",
  poster: "var(--font-poster)",
  elegant: "var(--font-elegant)",
  epic: "var(--font-epic)",
  modern: "var(--font-modern)",
  type: "var(--font-type)",
};
const METERS: MeterKey[] = ["Sultry", "Aggressive", "Clever", "Suspicion"];

function bgStyle(bg: string): React.CSSProperties {
  const resolved = assetBackground(bg);
  if (resolved.startsWith("gradient:")) return { background: resolved.slice(9) };
  if (resolved.startsWith("video:")) return { background: "#0c0c14" };
  return { backgroundImage: `url(${resolved})`, backgroundSize: "cover", backgroundPosition: "center" };
}

/**
 * StageFloorEditor — the walkable-stage authoring plate. Drag the floor
 * band's top/bottom edges, the spawn dot, and any marker to reposition it;
 * everything writes straight back into the scene. Markers sit at a
 * hotspot's base (bottom-centre of its zone), exactly where the game draws
 * them, so what you lay out here is what plays.
 */
function StageFloorEditor({
  background,
  media,
  floor,
  spawn,
  hotspots,
  player,
  onFloor,
  onSpawn,
  onMoveMarker,
  selectedHotspotId,
  onSelectHotspot,
}: {
  background: string;
  media: (v?: string) => string | undefined;
  floor: { top: number; bottom: number };
  spawn: { x: number; y: number };
  hotspots: { id: string; label: string; cursor: string; bounds: { x: number; y: number; w: number; h: number } }[];
  /** The player's appearance, so the room preview shows the REAL walker (its
   *  sprite sheet / image / emoji) standing on the plate at spawn — not a
   *  stand-in 🕵️. See docs/adventure-mode.md §"Placing the character". */
  player?: { image?: string; sheet?: import("./../game/spriteSheet").SpriteSheet };
  onFloor: (top: number, bottom: number) => void;
  onSpawn: (x: number, y: number) => void;
  onMoveMarker: (hotspotId: string, cx: number, baseY: number) => void;
  selectedHotspotId?: string | null;
  onSelectHotspot?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { kind: "floor-top" | "floor-bottom" | "spawn" | { hsId: string }; offX: number }>(null);

  const pct = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const marker = (h: { bounds: { x: number; y: number; w: number; h: number } }) => ({
    x: h.bounds.x + h.bounds.w / 2,
    y: h.bounds.y + h.bounds.h,
  });

  return (
    <div
      ref={ref}
      className="relative aspect-video w-full touch-none select-none overflow-hidden border border-noir-600"
      style={bgStyle(media(background) ?? background)}
      onPointerDown={(e) => {
        const kind = (e.target as HTMLElement).dataset.drag;
        if (!kind) return;
        if (kind.startsWith("hs:")) {
          const hs = hotspots.find((h) => h.id === kind.slice(3));
          if (!hs) return;
          drag.current = { kind: { hsId: hs.id }, offX: pct(e).x - marker(hs).x };
          onSelectHotspot?.(hs.id);
        } else {
          drag.current = { kind: kind as "floor-top" | "floor-bottom" | "spawn", offX: 0 };
        }
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        e.preventDefault();
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const p = pct(e);
        const d = drag.current;
        if (d.kind === "spawn") {
          onSpawn(round1(Math.min(99, Math.max(1, p.x))), round1(Math.min(100, Math.max(0, p.y))));
        } else if (d.kind === "floor-top") {
          onFloor(round1(Math.min(floor.bottom - 4, Math.max(0, p.y))), floor.bottom);
        } else if (d.kind === "floor-bottom") {
          onFloor(floor.top, round1(Math.min(100, Math.max(floor.top + 4, p.y))));
        } else if (typeof d.kind === "object") {
          const hs = hotspots.find((h) => h.id === (d.kind as { hsId: string }).hsId);
          if (!hs) return;
          const w = hs.bounds.w;
          const cx = Math.min(100 - w / 2, Math.max(w / 2, p.x - d.offX));
          const baseY = Math.min(100, Math.max(0, p.y));
          onMoveMarker(hs.id, round1(cx), round1(baseY));
        }
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      {/* above-floor / below-floor shading */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/55" style={{ height: `${floor.top}%` }} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55" style={{ height: `${100 - floor.bottom}%` }} />
      <div
        className="pointer-events-none absolute inset-x-0 border-y border-dashed border-neon/50 bg-neon/[0.04]"
        style={{ top: `${floor.top}%`, height: `${floor.bottom - floor.top}%` }}
      />
      {/* floor edge handles */}
      <div
        data-drag="floor-top"
        className="absolute inset-x-0 -top-1.5 z-10 flex h-3 cursor-ns-resize items-center justify-center"
        style={{ top: `calc(${floor.top}% - 6px)` }}
        title="Drag: floor top"
      >
        <span className="h-1 w-full bg-neon/70" />
      </div>
      <div
        data-drag="floor-bottom"
        className="absolute inset-x-0 z-10 flex h-3 cursor-ns-resize items-center justify-center"
        style={{ top: `calc(${floor.bottom}% - 6px)` }}
        title="Drag: floor bottom"
      >
        <span className="h-1 w-full bg-neon/70" />
      </div>
      {/* markers — one per hotspot, at its zone base */}
      {hotspots.map((h) => {
        const m = marker(h);
        const sel = selectedHotspotId === h.id;
        return (
          <div
            key={h.id}
            data-drag={`hs:${h.id}`}
            className={`absolute z-20 flex -translate-x-1/2 -translate-y-full cursor-move flex-col items-center ${
              sel ? "text-neon" : "text-gold"
            }`}
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
            title={`${h.label} — drag to move`}
          >
            <span className="whitespace-nowrap border border-current bg-noir-950/90 px-1 text-[8px] uppercase tracking-wider">
              {h.label.slice(0, 22)}
            </span>
            <span className="h-2.5 w-2.5 rotate-45 border border-current bg-black/30" />
          </div>
        );
      })}
      {/* spawn — the REAL walker standing on the plate */}
      <div
        data-drag="spawn"
        className="absolute z-30 flex h-[26%] -translate-x-1/2 -translate-y-full cursor-move flex-col items-center"
        style={{ left: `${spawn.x}%`, top: `${spawn.y}%` }}
        title="Drag: character spawn point"
      >
        {player && sheetDrawable(player.sheet) ? (
          <SheetSprite sheet={player.sheet!} anim="idle" fallbacks={["walk", "loop"]} height="100%" freezeOnFallback />
        ) : player?.image && !player.image.startsWith("emoji:") ? (
          <img
            src={assetUrl(media(player.image) ?? player.image)}
            alt=""
            className="h-full w-auto object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
            draggable={false}
          />
        ) : (
          <span className="text-3xl leading-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]">
            {player?.image?.startsWith("emoji:") ? player.image.slice("emoji:".length) : "🕵️"}
          </span>
        )}
        <span className="mx-auto mt-1 block h-1.5 w-10 rounded-[100%] bg-black/40 blur-[2px]" />
      </div>
    </div>
  );
}

const draftKey = (id: string) => `scarlet-studio-draft-${id}`;

/** Remove stale `*-backup-pre-r*` keys left behind by content migrations.
 * These are the biggest hidden consumer of localStorage quota and are never
 * needed again — clearing them is safe and frees room for new saves. */
function clearStaleStorageBackups() {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /-backup-pre-r/.test(k)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage may already be unusable — nothing else to do */
  }
}

/* ------------------------------------------------------------------ */
/*  scene node card                                                    */
/* ------------------------------------------------------------------ */

type SceneNodeData = {
  scene: SceneNode;
  isStart: boolean;
  issueCount: number;
  /** which episode owns this scene, when the story is packed into a season */
  episodeNumber?: number;
  episodeTitle?: string;
  /** true when this scene opens its episode */
  isEpisodeStart?: boolean;
  /** which act owns this scene, derived from the graph walk (not declared) */
  actLabel?: string;
  actTitle?: string;
  actDot?: string;
  /** true when this scene is an act's nominated opening scene */
  isActStart?: boolean;
  /** true when more than one act's walk reaches this scene */
  actConflict?: boolean;
  /** true when this scene is on the lit path from the start scene to the
   *  selected one — the "where the story is" highlight */
  onPath?: boolean;
  /** Raw background reference (asset: / path / gradient: / video:) — kept tiny
   * so ReactFlow node data stays serializable and cheap. Resolved to a real URL
   * at render time via the MediaResolverContext below. */
  backgroundRef: string;
};

/** Provides the media resolver to node cards without putting a (non-serializable
 * and potentially stale) function or huge data URLs into ReactFlow node data —
 * both of which have caused the canvas to blank out. */
const MediaResolverContext = createContext<(v?: string) => string | undefined>(() => undefined);

const SceneFlowNode = memo(function SceneFlowNode({ data }: NodeProps) {
  const { scene, isStart, issueCount, backgroundRef, episodeNumber, episodeTitle, isEpisodeStart, actLabel, actTitle, actDot, isActStart, actConflict, onPath } = data as SceneNodeData;
  const resolveMedia = useContext(MediaResolverContext);
  const backgroundPreview = resolveMedia(backgroundRef) ?? backgroundRef;
  const isEnd = !!scene.isEnding;
  const cardBorder =
    scene.nodeType === "credits"
      ? "border-neon shadow-[0_0_15px_rgba(255,46,136,0.3)]"
      : scene.nodeType === "cutscene"
        ? "border-cyan-neon shadow-[0_0_15px_rgba(42,217,217,0.3)]"
        : onPath
          ? "border-gold/80 shadow-[0_0_14px_rgba(232,178,60,0.3)]"
          : isStart
            ? "border-gold/80"
            : isEnd
            ? "border-crimson/60"
            : "border-noir-600";

  // Inline rename editor. window.prompt() does not exist in the Electron
  // shell (or a sandboxed iframe), so the card edits its own title in place:
  // click to type, Enter or click away saves, Esc cancels.
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const editingRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (editing) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editing]);
  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftTitle(scene.title);
    editingRef.current = true;
    setEditing(true);
  };
  const commitRename = () => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
    const title = draftTitle.trim();
    // Notes may be empty (the card shows a placeholder); scene titles may not.
    if ((title || scene.nodeType === "note") && title !== scene.title) {
      window.dispatchEvent(
        new CustomEvent("scarlet-rename-scene", { detail: { sceneId: scene.id, title, isNote: scene.nodeType === "note" } })
      );
    }
  };
  const cancelRename = () => {
    if (!editingRef.current) return;
    editingRef.current = false;
    setEditing(false);
  };

  // ---- note placeholder node -------------------------------------------
  // An author marker ("Missing Scene Here") that wires into the graph on both
  // sides but is BYPASSED in play. One clickable body (type what belongs
  // here), one target handle, one outgoing "route out" handle.
  if (scene.nodeType === "note") {
    const route = (scene.choices ?? [])[0];
    return (
      <div className="scene-card w-56 border-2 border-dashed border-gold/70 bg-[#171410] text-paper shadow-[0_0_14px_rgba(232,178,60,0.2)]">
        <Handle type="target" position={Position.Left} style={{ background: "#e8b23c" }} />
        <div className="flex items-center justify-between gap-1 border-b border-dashed border-gold/30 px-2 py-1">
          <span className="min-w-0 flex-1 truncate font-pulp text-[10px] uppercase tracking-wider text-gold">
            📝 Note — bypassed in play
          </span>
          <span className="flex items-center gap-1 text-[9px]">
            {issueCount > 0 && (
              <span className="text-crimson" title={`${issueCount} issue(s)`}>
                ⚠{issueCount}
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete note "${scene.title || "(empty)"}"?`)) {
                  window.dispatchEvent(new CustomEvent("scarlet-delete-scene", { detail: scene.id }));
                }
              }}
              className="ml-1 font-pulp px-1 text-crimson hover:text-white"
              title="Delete this note"
            >
              ✕
            </button>
          </span>
        </div>
        {editing ? (
          <textarea
            ref={(el) => {
              titleInputRef.current = el;
            }}
            className="nodrag nopan m-1 min-h-[64px] resize-none border border-gold/70 bg-noir-950 p-2 font-type text-[11px] leading-snug text-paper outline-none focus:border-gold"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") commitRename();
              else if (e.key === "Escape") cancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label="Note text"
            title="Ctrl+Enter or click away saves · Esc cancels"
            spellCheck={false}
          />
        ) : (
          <div
            className="m-1 min-h-[64px] cursor-text rounded border border-dashed border-gold/25 bg-noir-950/40 p-2 font-type text-[11px] leading-snug text-paper/85 hover:border-gold/50"
            title="Click to type what belongs here · drag to move the note"
            onClick={() => {
              setDraftTitle(scene.title);
              editingRef.current = true;
              setEditing(true);
            }}
          >
            {scene.title || <span className="italic text-paper/35">Missing Scene Here</span>}
          </div>
        )}
        <div className="relative border-t border-dashed border-gold/30 px-2 py-1 text-[9px] italic text-gold/70">
          {route?.targetSceneId ? "route out → wired" : "drag from here to route out →"}
          <Handle
            type="source"
            id={route ? `choice:${route.id}` : "new"}
            position={Position.Right}
            style={{ top: "50%", background: "#e8b23c" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`scene-card w-56 border-2 shadow-xl text-paper ${cardBorder} bg-noir-800`}>
      {!isStart && <Handle type="target" position={Position.Left} style={{ background: "#8b8b9e" }} />}
      <div className="flex items-center justify-between gap-1 border-b border-noir-600 px-2 py-1">
        {editing ? (
          <input
            ref={(el) => {
              titleInputRef.current = el;
            }}
            className="nodrag nopan min-w-0 flex-1 border border-gold/70 bg-noir-950 px-1 font-pulp text-[10px] uppercase tracking-wider text-paper outline-none focus:border-gold"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitRename();
              else if (e.key === "Escape") cancelRename();
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label="Scene name"
            title="Enter saves · Esc cancels"
            spellCheck={false}
          />
        ) : (
          <span
            className="min-w-0 flex-1 cursor-text truncate font-pulp text-[10px] uppercase tracking-wider text-gold hover:text-paper"
            title="Click to rename this scene"
            onClick={startRename}
          >
            {scene.nodeType === "credits" && "🎬 CREDITS · "}
            {scene.nodeType === "cutscene" && "🎥 CUTSCENE · "}
            {scene.nodeType === "stage" && "🚶 STAGE · "}
            {isStart && "★ START · "}
            {isEnd && !isStart && !scene.nodeType && "🏁 END · "}
            {scene.title}
          </span>
        )}
        <span className="flex items-center gap-1 text-[9px]">
          {scene.isEnding && <span title="Ending — no output">🏁</span>}
          {isStart && <span title="Start — no input">★</span>}
          {issueCount > 0 && (
            <span className="text-crimson" title={`${issueCount} issue(s)`}>
              ⚠{issueCount}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (isStart) {
                alert("Cannot delete the start scene. Assign another start scene first.");
                return;
              }
              if (confirm(`Delete scene "${scene.title}"?`)) {
                // We dispatch a custom delete trigger or handle it in StudioInner
                const ev = new CustomEvent("scarlet-delete-scene", { detail: scene.id });
                window.dispatchEvent(ev);
              }
            }}
            className="ml-1 text-crimson hover:text-white font-pulp px-1"
            title="Delete this scene"
          >
            ✕
          </button>
        </span>
      </div>
      <div className="relative h-14 w-full" style={bgStyle(backgroundPreview ?? scene.background)}>
        {scene.background.startsWith("video:") && (
          <span className="absolute inset-0 flex items-center justify-center text-2xl" title="Video cutscene">🎥</span>
        )}
        {isStart && <span className="absolute left-1 top-1 rounded bg-gold/20 px-1 text-[8px] text-gold">NO INPUT</span>}
        {isEnd && <span className="absolute right-1 top-1 rounded bg-crimson/20 px-1 text-[8px] text-crimson">NO OUTPUT</span>}
      </div>
      {episodeNumber !== undefined && (
        <div className="flex items-center gap-1 border-b border-crimson/25 bg-crimson/10 px-2 py-0.5" title={`Episode ${episodeNumber}: ${episodeTitle}`}>
          <span className="font-pulp text-[8px] uppercase tracking-widest text-crimson">
            {isEpisodeStart ? "▸ OPENS" : "🎞"} Ep {episodeNumber}
          </span>
          <span className="min-w-0 flex-1 truncate font-type text-[8px] text-paper/50">{episodeTitle}</span>
        </div>
      )}
      {actLabel && (
        <div
          className="flex items-center gap-1 border-b px-2 py-0.5"
          style={{ borderColor: `${actDot}40`, background: `${actDot}14` }}
          title={actConflict ? `Claimed by more than one act — a choice links across the boundary` : `${actLabel}${actTitle ? `: ${actTitle}` : ""}`}
        >
          <span className="font-pulp text-[8px] uppercase tracking-widest" style={{ color: actDot }}>
            {isActStart ? "▸ OPENS" : "🎭"} {actLabel}
          </span>
          <span className="min-w-0 flex-1 truncate font-type text-[8px] text-paper/50">{actTitle}</span>
          {actConflict && <span className="shrink-0 text-[8px] text-crimson" title="Two acts reach this scene">⚠</span>}
        </div>
      )}
      {scene.note && (
        <div className="border-b border-gold/25 bg-gold/10 px-2 py-1" title={scene.note}>
          <span className="font-pulp text-[8px] uppercase tracking-widest text-gold">📝 note · </span>
          <span className="font-type text-[8px] leading-tight text-paper/70 line-clamp-2">{scene.note}</span>
        </div>
      )}
      <div className="px-2 py-1 text-[9px] text-paper/50">
        ⌖ {scene.hotspots?.length ?? 0} hotspots · 💬 {scene.dialogueBeats?.length ?? 0} beats
      </div>
      <div className="divide-y divide-noir-600/60 border-t border-noir-600">
        {!isEnd &&
          (scene.choices ?? []).map((c) => (
            <div key={c.id} className="relative px-2 py-1 pr-4 text-[9px] leading-tight text-paper/75">
              <span style={{ color: ATTITUDE_STROKE[c.attitudeTag ?? "Neutral"] }}>▸</span> {c.text.slice(0, 34)}
              {c.text.length > 34 && "…"}
              <Handle
                type="source"
                id={`choice:${c.id}`}
                position={Position.Right}
                style={{ top: "50%", background: ATTITUDE_STROKE[c.attitudeTag ?? "Neutral"] }}
              />
            </div>
          ))}
        {!isEnd &&
          (scene.hotspots ?? [])
            .filter((h) => h.action.targetSceneId)
            .map((h) => (
              <div key={h.id} className="relative px-2 py-1 pr-4 text-[9px] leading-tight text-gold/75">
                ⌖ {h.label.slice(0, 30)}
                <Handle
                  type="source"
                  id={`hotspot:${h.id}`}
                  position={Position.Right}
                  style={{ top: "50%", background: "#e8b23c" }}
                />
              </div>
            ))}
        {!isEnd && scene.autoAdvanceTargetSceneId && (
          <div className="relative px-2 py-1 pr-4 text-[9px] leading-tight text-cyan-neon/75">
            ⏱ auto after {scene.autoAdvanceDelaySeconds ?? 0}s{scene.autoAdvanceHideTimer ? " (hidden)" : ""}
            <Handle type="source" id="auto" position={Position.Right} style={{ top: "50%", background: "#2ad9d9" }} />
          </div>
        )}
        {!isEnd && (
          <div className="relative px-2 py-1 pr-4 text-[9px] italic text-paper/35">
            drag to add choice →
            <Handle type="source" id="new" position={Position.Right} style={{ top: "50%", background: "#4a4a5e" }} />
          </div>
        )}
        {isEnd && (
          <div className="px-2 py-1 text-[9px] italic text-crimson/60">ending — no outgoing connections</div>
        )}
      </div>
    </div>
  );
});

const nodeTypes = { scene: SceneFlowNode };

const RemovableEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
        >
          <button
            className="flex h-5 w-5 items-center justify-center rounded-full border border-crimson bg-noir-950 text-[10px] text-crimson hover:scale-125 hover:bg-crimson hover:text-white transition-all shadow-[0_0_10px_rgba(226,59,78,0.5)]"
            onClick={(e) => {
              e.stopPropagation();
              const ev = new CustomEvent("scarlet-delete-edge", { detail: id });
              window.dispatchEvent(ev);
            }}
            title="Remove connection"
          >
            ✕
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

const edgeTypes = { removable: RemovableEdge };

/* ------------------------------------------------------------------ */
/*  small form helpers                                                 */
/* ------------------------------------------------------------------ */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[10px] uppercase tracking-wider text-paper/50">
      {label}
      <div className="mt-0.5 normal-case tracking-normal">{children}</div>
    </label>
  );
}

/** Local-state text area that only commits to the story on blur / Enter /
 *  unmount. Keeping text in component state means typing doesn't re-render
 *  the inspector or clone the whole story on every keystroke — which was
 *  causing the beat line to drop focus / reject typing mid-edit. */
function CommitTextArea({
  value,
  onCommit,
  className,
  rows = 4,
  placeholder,
}: {
  value: string;
  onCommit: (next: string) => void;
  className?: string;
  rows?: number;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  // Re-sync only when the external value changes AND we're not focused (e.g.
  // after an undo, duplicate, or sound-tag insertion elsewhere).
  useEffect(() => {
    if (ref.current && document.activeElement === ref.current) return;
    setText(value);
  }, [value]);
  const commit = () => {
    if (text !== value) onCommit(text);
  };
  return (
    <textarea
      ref={ref}
      className={className}
      rows={rows}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      // Commit on Enter? For dialogue we keep newlines natural, so Enter is a
      // line break; save happens on blur. Keep a Ctrl/Cmd+Enter to save early.
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          commit();
          ref.current?.blur();
        }
      }}
    />
  );
}

const inputCls =
  "w-full border border-noir-600 bg-noir-950 px-2 py-1 text-xs text-paper focus:border-neon outline-none";

/** Media fields store compact `asset:<id>` references (not base64 data URLs), so
 * the text input should stay blank for those and only show real paths/URLs. */
function mediaField(v?: string): string {
  if (!v) return "";
  if (v.startsWith("data:") || v.startsWith("asset:") || v.startsWith("video:asset:")) return "";
  return v;
}

const sectionStateKey = (id: string) => `scarlet-studio-section-${id}`;

/** A collapsible inspector section. The open/closed state is persisted per-id in
 * localStorage, so authors can minimise the panels they rarely touch (the
 * workflow/readiness summaries, camera, foreground, lighting…) and keep the
 * inspector from getting cramped — their choices survive reloads.
 *
 * Sections default to MINIMISED so the inspector starts compact (authors expand
 * only what they need). `headerRight` lets callers render a small action (e.g.
 * a delete button) in the header without nesting a button inside the toggle. */
function CollapsibleSection({
  id,
  title,
  children,
  defaultOpen = false,
  hint,
  titleClass = "text-cyan-neon",
  className = "border border-noir-600/70 bg-noir-900/40",
  headerRight,
  controlledOpen,
  onToggle,
  draggable,
  dragOver,
  onDragStartHandle,
  onDragEnterHandle,
  onDragOverHandle,
  onDropHandle,
  onDragEndHandle,
}: {
  id: string;
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  hint?: string;
  titleClass?: string;
  className?: string;
  headerRight?: React.ReactNode;
  /** when supplied, open state is owned by the parent (no localStorage) */
  controlledOpen?: boolean;
  onToggle?: (next: boolean) => void;
  /** enable drag-to-reorder: true while a drag is over this card */
  draggable?: boolean;
  dragOver?: boolean;
  onDragStartHandle?: (e: React.DragEvent) => void;
  onDragEnterHandle?: (e: React.DragEvent) => void;
  onDragOverHandle?: (e: React.DragEvent) => void;
  onDropHandle?: (e: React.DragEvent) => void;
  onDragEndHandle?: (e: React.DragEvent) => void;
}) {
  const [localOpen, setLocalOpen] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(sectionStateKey(id));
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch {
      /* storage unavailable — fall back to the default */
    }
    return defaultOpen;
  });
  const open = controlledOpen !== undefined ? controlledOpen : localOpen;
  const toggle = () => {
    const next = !open;
    if (controlledOpen !== undefined) {
      onToggle?.(next);
      return;
    }
    setLocalOpen(next);
    try {
      localStorage.setItem(sectionStateKey(id), next ? "1" : "0");
    } catch {
      /* storage unavailable — state still toggles for this session */
    }
  };
  return (
    <div
      className={`${className} ${dragOver ? "ring-2 ring-gold bg-gold/10" : ""}`}
      onDragEnter={onDragEnterHandle}
      onDragOver={onDragOverHandle}
      onDrop={onDropHandle}
    >
      <div className="flex w-full items-center justify-between gap-2 px-2 py-1.5 hover:bg-noir-800/60">
        {draggable && (
          <span
            draggable
            onDragStart={onDragStartHandle}
            onDragEnd={onDragEndHandle}
            title="Drag to reorder"
            className="flex cursor-grab touch-none select-none items-center text-paper/35 hover:text-gold active:cursor-grabbing"
            aria-label="Drag to reorder"
          >
            <svg width="8" height="14" viewBox="0 0 8 14" aria-hidden>
              <circle cx="2" cy="2.5" r="1.3" fill="currentColor" />
              <circle cx="6" cy="2.5" r="1.3" fill="currentColor" />
              <circle cx="2" cy="7" r="1.3" fill="currentColor" />
              <circle cx="6" cy="7" r="1.3" fill="currentColor" />
              <circle cx="2" cy="11.5" r="1.3" fill="currentColor" />
              <circle cx="6" cy="11.5" r="1.3" fill="currentColor" />
            </svg>
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          title={open ? "Minimise this section" : "Maximise this section"}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className={`min-w-0 truncate font-pulp text-[9px] uppercase tracking-widest ${titleClass}`}>{title}</span>
          {hint && <span className="shrink-0 font-type text-[8px] uppercase tracking-wider text-paper/40">{hint}</span>}
          <span className="shrink-0 text-paper/50" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        </button>
        {headerRight && <div className="flex shrink-0 items-center gap-1">{headerRight}</div>}
      </div>
      {open && <div className="space-y-2 p-2">{children}</div>}
    </div>
  );
}

/** Live animated preview of the chosen cinematic — the same camera layer the
 * player sees, so authors can watch the motion instead of guessing. */
function CinematicPreview({
  cinematic,
  url,
  media,
}: {
  cinematic: CinematicSettings | undefined;
  url: string;
  media: (v?: string) => string | undefined;
}) {
  if (url.startsWith("video:")) {
    return (
      <div className="flex aspect-video w-full items-center justify-center border border-gold/30 bg-noir-950 font-pulp text-[8px] uppercase tracking-widest text-paper/40">
        🎥 video cutscene — camera motion doesn't apply
      </div>
    );
  }
  const { className, style } = cinematicLayer(cinematic, url);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const pOn = (cinematic?.parallaxDepth ?? 0) > 0;
  // Pointer parallax in the preview — write the same --par-x / --par-y vars the
  // game uses so the preview is live and truthful.
  const onPreviewMove = (e: React.PointerEvent) => {
    const el = previewRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--par-x", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    el.style.setProperty("--par-y", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };
  const onPreviewLeave = () => {
    previewRef.current?.style.removeProperty("--par-x");
    previewRef.current?.style.removeProperty("--par-y");
  };
  return (
    <div
      ref={previewRef}
      onPointerMove={pOn ? onPreviewMove : undefined}
      onPointerLeave={pOn ? onPreviewLeave : undefined}
      className="relative aspect-video w-full overflow-hidden border border-gold/30 bg-noir-950"
      style={pOn ? parallaxStyle(cinematic) : undefined}
    >
      <div className={`absolute inset-0 ${pOn ? "parallax-plate" : ""}`} style={pOn ? parallaxStyle(cinematic) : undefined}>
        <div className={`absolute inset-0 ${className}`} style={style}>
          {resolveLights(cinematic).map((l, i) => (
            <div key={i} className="cin-light" style={lightStyle(l)} />
          ))}
          <LensFlareLayer cinematic={cinematic} />
          <CinematicOverlays cinematic={cinematic} />
        </div>
      </div>
      {pOn && <ParallaxMidLayers cinematic={cinematic} resolve={media} />}
      <div className={pOn ? "parallax-fg absolute inset-0" : "absolute inset-0"} style={spriteGradeStyle(cinematic)}>
        <ForegroundExtras cinematic={cinematic} resolve={media} />
        <ForegroundLayer cinematic={cinematic} resolve={media} />
      </div>
      <span className="pointer-events-none absolute bottom-1 right-1 z-[5] rounded bg-noir-950/70 px-1 py-0.5 font-pulp text-[7px] uppercase tracking-widest text-gold/70">
        {cinematic?.mode ?? "pan"}
        {cinematic?.colorGrade ? ` · ${GRADE_PRESETS[cinematic.colorGrade]?.name?.split(" — ")[0] ?? ""}` : ""}
        {pOn ? " · parallax" : ""}
      </span>
    </div>
  );
}

/** Drag-to-place editor for the foreground overlay. Shows the actual scene
 * background with the foreground subject (and any keyframe animation) overlaid
 * at its current scale / fit / position, so authors can drag the subject's
 * anchor point anywhere in the frame — or click a spot on the image to set the
 * zoom focus (anchor) — exactly as it will appear in the game. Renders the real
 * ForegroundLayer, so the preview is pixel-truthful. */
function ForegroundPositionEditor({
  previewUrl,
  cinematic,
  media,
  x,
  y,
  anchor,
  replayEpoch,
  onChange,
  onAnchorAt,
}: {
  previewUrl: string;
  cinematic?: CinematicSettings;
  media: (v?: string) => string | undefined;
  x: number;
  y: number;
  anchor: string;
  /** bump to restart the foreground zoom animation in this preview */
  replayEpoch?: number;
  onChange: (x: number, y: number) => void;
  /** click-to-anchor: pin this image point at this frame position (no jump) */
  onAnchorAt: (anchor: string, x: number, y: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const moving = useRef(false);
  const movedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  // Measured preview size drives the pixel-offset readouts and sliders, so the
  // X/Y controls show concrete pixels (offset from centre) instead of abstract
  // percentages. The stored value stays a %, so scenes still scale responsively.
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Same guard as the player's frame observer: skip no-op writes and defer
    // to the next frame, so resizing never re-enters the observation pass.
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      let raf = 0;
      const ro = new ResizeObserver(() => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(update);
      });
      ro.observe(el);
      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
      };
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const toPx = (p: number, axis: "x" | "y") => Math.round(((p - 50) / 100) * (axis === "x" ? size.w : size.h));
  const fromPx = (px: number, axis: "x" | "y") => {
    const half = axis === "x" ? size.w : size.h;
    if (!half) return 50;
    return clamp(50 + (px / half) * 100, 0, 100);
  };
  const offsetX = toPx(x, "x");
  const offsetY = toPx(y, "y");

  const moveTo = (clientX: number, clientY: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    onChange(
      Math.round(clamp(((clientX - r.left) / r.width) * 100, 0, 100)),
      Math.round(clamp(((clientY - r.top) / r.height) * 100, 0, 100))
    );
  };

  /** Click = define the anchor: the clicked point ON THE SUBJECT becomes the
   * zoom-focus anchor, and it is pinned at the clicked frame position, so the
   * subject doesn't jump — the clicked spot just becomes the pivot. */
  const anchorAt = (clientX: number, clientY: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const box = ref.current?.querySelector("[data-fg-anchor-box]");
    const br = box?.getBoundingClientRect();
    const fx = Math.round(clamp(((clientX - r.left) / r.width) * 100, 0, 100));
    const fy = Math.round(clamp(((clientY - r.top) / r.height) * 100, 0, 100));
    if (!br || br.width <= 0 || br.height <= 0) return;
    // Only anchor when the click lands on the subject itself.
    if (clientX < br.left || clientX > br.right || clientY < br.top || clientY > br.bottom) return;
    const ax = Math.round(clamp(((clientX - br.left) / br.width) * 100, 0, 100));
    const ay = Math.round(clamp(((clientY - br.top) / br.height) * 100, 0, 100));
    onAnchorAt(`${ax}% ${ay}%`, fx, fy);
  };

  const a = parseAnchor(anchor);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="font-pulp text-[8px] uppercase tracking-widest text-paper/45">Position &amp; focus point</span>
        <span className="rounded bg-noir-950/70 px-1 font-type text-[8px] text-gold">focus {a.ax}% {a.ay}%</span>
      </div>
      <div
        ref={ref}
        className="relative aspect-video w-full cursor-move touch-none overflow-hidden border border-gold/30"
        style={{ ...bgStyle(previewUrl) }}
        title="Click a point on the subject to set the zoom focus · drag to move it"
        onPointerDown={(e) => {
          moving.current = true;
          movedRef.current = false;
          startRef.current = { x: e.clientX, y: e.clientY };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!moving.current) return;
          if (!movedRef.current && startRef.current) {
            const d = Math.hypot(e.clientX - startRef.current.x, e.clientY - startRef.current.y);
            if (d < 6) return; // still a click
            movedRef.current = true;
          }
          moveTo(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          if (!moving.current) return;
          moving.current = false;
          const start = startRef.current;
          startRef.current = null;
          if (!movedRef.current && start) anchorAt(start.x, start.y);
        }}
        onPointerCancel={() => {
          moving.current = false;
          startRef.current = null;
        }}
      >
        <div key={replayEpoch ?? 0} className="absolute inset-0" style={spriteGradeStyle(cinematic)}>
          <ForegroundLayer cinematic={cinematic} resolve={media} />
        </div>
        {/* crosshair marker at the anchor / focus point (also the pin) */}
        <div
          className="pointer-events-none absolute z-[2] h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold shadow-[0_0_10px_#e8b23c]"
          style={{ left: `${x}%`, top: `${y}%` }}
        />
        <p className="pointer-events-none absolute inset-x-0 bottom-1 z-[2] text-center font-pulp text-[8px] uppercase tracking-widest text-paper/70">
          Click the subject to set the focus point · drag to move
        </p>
      </div>

      {/* Offset from centre, in pixels of this preview — concrete numbers the
          author can read against the scene, stored as % so it stays responsive. */}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[10px] uppercase tracking-wider text-paper/50">
          Horizontal offset <span className="text-paper/70">{offsetX >= 0 ? "+" : ""}{offsetX}px</span>
          <input
            type="range"
            min={size.w ? -Math.round(size.w / 2) : -400}
            max={size.w ? Math.round(size.w / 2) : 400}
            step={1}
            value={offsetX}
            className="mt-0.5 w-full accent-pink-500"
            aria-label="Horizontal offset (pixels from centre)"
            onChange={(e) => onChange(fromPx(Number(e.target.value), "x"), y)}
          />
        </label>
        <label className="block text-[10px] uppercase tracking-wider text-paper/50">
          Vertical offset <span className="text-paper/70">{offsetY >= 0 ? "+" : ""}{offsetY}px</span>
          <input
            type="range"
            min={size.h ? -Math.round(size.h / 2) : -72}
            max={size.h ? Math.round(size.h / 2) : 72}
            step={1}
            value={offsetY}
            className="mt-0.5 w-full accent-pink-500"
            aria-label="Vertical offset (pixels from centre)"
            onChange={(e) => onChange(x, fromPx(Number(e.target.value), "y"))}
          />
        </label>
      </div>
    </div>
  );
}

/** Reusable cinematic camera/lighting controls (mode, motion, focal point, dim,
 * lights) bound to one image. Used for the scene background and for each
 * dialogue beat with a replacement background image. */
function CinematicControls({
  cinematic,
  previewUrl,
  storyId,
  media,
  onChange,
}: {
  cinematic: CinematicSettings | undefined;
  previewUrl: string;
  storyId: string;
  media: (v?: string) => string | undefined;
  onChange: (next: CinematicSettings | undefined) => void;
}) {
  const c = cinematic ?? {};
  const set = (patch: Partial<CinematicSettings>) => onChange({ ...c, ...patch });
  const isActive = !!cinematic;
  const mode = c.mode ?? "pan";
  // Editable light list — legacy single-light fields merge into the first entry
  // so old drafts keep their glow and migrate to the `lights` array on edit.
  const points = lightPoints(c);
  const commitPoints = (next: LightPoint[]) =>
    set({ lights: next.length ? next : undefined, lightSource: undefined, lightColor: undefined, lightRadius: undefined });
  // Roll defaults to intensity-derived so existing shake scenes keep their look
  // until the author explicitly overrides it.
  const shake = c.shakeAmount ?? 0.5;
  const shakeRot = c.shakeRotation ?? Math.round(shake * 0.7 * 100) / 100;
  // Dynamic lens flare state
  const flare = resolveLensFlare(c);
  const hasFlare = !!(c.lensFlare && c.lensFlare.enabled !== false);
  const setFlare = (patch: Partial<LensFlareSettings>) => {
    const base = flare ?? defaultLensFlare("anamorphic-blue", points[0] ? { x: points[0].x, y: points[0].y } : undefined);
    set({ lensFlare: { ...base, ...patch } });
  };
  const flareGlow = parseGlowColor(flare?.color);
  const flareSecGlow = parseGlowColor(flare?.secondaryColor);
  // Foreground keyframe animation state.
  const animMode: ForegroundAnimationMode | "none" = c.foregroundAnimation?.mode ?? "none";
  const frames = c.foregroundAnimation?.frames ?? [];
  const hasForeground = !!(c.foregroundImage || frames.length);
  // Bump to restart the foreground zoom animation in the position preview.
  const [zoomEpoch, setZoomEpoch] = useState(0);
  const setAnim = (patch: Partial<ForegroundAnimation>) =>
    set({ foregroundAnimation: { mode: "frames", frames: [], ...(c.foregroundAnimation ?? {}), ...patch } });
  // Uploaded images for this story — used to display each keyframe's real file
  // name and populate the "pick an uploaded keyframe" pulldown. Reads the
  // GLOBAL library so a keyframe pointing at an image uploaded anywhere
  // resolves its name (consistent with the global asset pickers).
  const imageAssets = useAllAssets("image");
  const frameName = (f: string): string => {
    if (!f) return "";
    if (f.startsWith("asset:")) return imageAssets.find((a) => `asset:${a.id}` === f)?.name ?? f;
    if (f.startsWith("data:")) return "(embedded image)";
    return f;
  };

  return (
    <div className="space-y-3">
      <Field label="Camera mode">
        <select
          className={inputCls}
          value={mode}
          onChange={(e) => set({ mode: e.target.value as CinematicSettings["mode"] })}
        >
          <option value="pan">🎞 Slow pan — gentle drift across the frame</option>
          <option value="zoom-hold">🔍 Zoom to subject — zooms in and holds on the focal point</option>
          <option value="shake">📹 Shaky cam — handheld jitter</option>
          <option value="dolly">🛤 Rail / dolly track — slides across a wide image</option>
          <option value="dolly-zoom">🌀 Dolly zoom — vertigo push-pull</option>
          <option value="static">🖼 Static — no movement, locked frame</option>
        </select>
      </Field>

      <CollapsibleSection id="cin-camera" title="📷 Camera" hint="live preview">
        <CinematicPreview cinematic={cinematic} url={previewUrl} media={media} />

        {mode !== "static" && (
          <>
            {mode === "shake" && (
            <div className="space-y-2">
              <Field label={`Shake intensity ${Math.round(shake * 100)}%`}>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={shake}
                    className="flex-1 accent-pink-500"
                    onChange={(e) => set({ shakeAmount: Number(e.target.value) })}
                  />
                  <span className="w-8 text-right font-type text-[10px] text-paper/70">{Math.round(shake * 100)}%</span>
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={`Roll ${shakeRot.toFixed(2)}°`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={3}
                      step={0.05}
                      value={shakeRot}
                      className="flex-1 accent-pink-500"
                      onChange={(e) => set({ shakeRotation: Number(e.target.value) })}
                    />
                    <span className="w-7 text-right font-type text-[10px] text-paper/70">{shakeRot.toFixed(1)}°</span>
                  </div>
                </Field>
                <Field label={`Jitter speed ${(c.shakeDuration ?? 0.5).toFixed(2)}s`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0.15}
                      max={1.5}
                      step={0.05}
                      value={c.shakeDuration ?? 0.5}
                      className="flex-1 accent-pink-500"
                      onChange={(e) => set({ shakeDuration: Number(e.target.value) })}
                    />
                    <span className="w-7 text-right font-type text-[10px] text-paper/70">{(c.shakeDuration ?? 0.5).toFixed(2)}s</span>
                  </div>
                </Field>
              </div>
              <p className="font-type text-[9px] text-paper/40">
                Intensity = jitter size · Roll = camera twist · Speed = how fast it trembles (lower = faster, more panicked).
              </p>
            </div>
          )}

          {mode === "dolly" && (
            <div className="space-y-2">
              <Field label="Dolly direction">
                <select
                  className={inputCls}
                  value={c.dollyDirection ?? "right"}
                  onChange={(e) => set({ dollyDirection: e.target.value as CinematicSettings["dollyDirection"] })}
                >
                  <option value="right">Travel right →</option>
                  <option value="left">Travel left ←</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={`Distance ${c.dollyDistance ?? 8}%`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={2}
                      max={20}
                      step={1}
                      value={c.dollyDistance ?? 8}
                      className="flex-1 accent-pink-500"
                      onChange={(e) => set({ dollyDistance: Number(e.target.value) })}
                    />
                    <span className="w-7 text-right font-type text-[10px] text-paper/70">{c.dollyDistance ?? 8}%</span>
                  </div>
                </Field>
                <Field label={`Vertical drift ${c.dollyVertical ?? 0}%`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={8}
                      step={0.5}
                      value={c.dollyVertical ?? 0}
                      className="flex-1 accent-pink-500"
                      onChange={(e) => set({ dollyVertical: Number(e.target.value) })}
                    />
                    <span className="w-7 text-right font-type text-[10px] text-paper/70">{c.dollyVertical ?? 0}%</span>
                  </div>
                </Field>
              </div>
              <Field label="Duration (seconds per pass)">
                <input
                  type="number"
                  min={3}
                  max={60}
                  step={1}
                  className={inputCls}
                  value={c.dollyDuration ?? 10}
                  onChange={(e) => set({ dollyDuration: Number(e.target.value) || 10 })}
                />
              </Field>
              <p className="border border-cyan-neon/20 bg-cyan-neon/5 p-2 font-type text-[9px] text-paper/55">
                The camera travels sideways, so use a <b className="text-cyan-neon">wide panoramic image</b>. Add{" "}
                <b className="text-cyan-neon">vertical drift</b> to tilt the track into a diagonal crane pan.
              </p>
            </div>
          )}

          {mode === "dolly-zoom" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label={`Background zoom ${(c.dollyZoomAmount ?? 1.35).toFixed(2)}×`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={2}
                      step={0.05}
                      value={c.dollyZoomAmount ?? 1.35}
                      className="flex-1 accent-pink-500"
                      onChange={(e) => set({ dollyZoomAmount: Number(e.target.value) })}
                    />
                    <span className="w-9 text-right font-type text-[10px] text-paper/70">{(c.dollyZoomAmount ?? 1.35).toFixed(2)}×</span>
                  </div>
                </Field>
                <Field label={`Cycle ${c.dollyZoomDuration ?? 8}s`}>
                  <input
                    type="number"
                    min={2}
                    max={30}
                    step={1}
                    className={inputCls}
                    value={c.dollyZoomDuration ?? 8}
                    onChange={(e) => set({ dollyZoomDuration: Number(e.target.value) || 8 })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Zoom direction">
                  <select
                    className={inputCls}
                    value={c.dollyZoomDirection ?? "both"}
                    onChange={(e) => set({ dollyZoomDirection: e.target.value as CinematicSettings["dollyZoomDirection"] })}
                  >
                    <option value="both">Push &amp; pull — in and back, looping</option>
                    <option value="push">Push in — zoom in and hold</option>
                    <option value="pull">Pull out — zoom out and hold</option>
                  </select>
                </Field>
                <Field label={`Background blur ${(c.dollyZoomBlur ?? 0).toFixed(1)}px`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={20}
                      step={0.5}
                      value={c.dollyZoomBlur ?? 0}
                      className="flex-1 accent-pink-500"
                      onChange={(e) => set({ dollyZoomBlur: Number(e.target.value) })}
                    />
                    <span className="w-9 text-right font-type text-[10px] text-paper/70">{(c.dollyZoomBlur ?? 0).toFixed(1)}px</span>
                  </div>
                </Field>
              </div>

              <p className="border border-cyan-neon/20 bg-cyan-neon/5 p-2 font-type text-[9px] text-paper/55">
                The classic <b className="text-cyan-neon">Hitchcock vertigo</b>: push in, pull out, or breathe both ways. Add{" "}
                <b className="text-cyan-neon">blur</b> to soften the moving background — pair it with a{" "}
                <b className="text-cyan-neon">foreground overlay</b> so the subject stays sharp, which is what sells the vertigo.
              </p>
            </div>
          )}

          {mode === "pan" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Pan direction">
                  <select
                    className={inputCls}
                    value={c.panDirection ?? "right"}
                    onChange={(e) => set({ panDirection: e.target.value as CinematicSettings["panDirection"] })}
                  >
                    <option value="right">Drift right →</option>
                    <option value="left">Drift left ←</option>
                  </select>
                </Field>
                <Field label={`Pan drift ${c.panDistance ?? 0}%`}>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={12}
                      step={1}
                      value={c.panDistance ?? 0}
                      className="flex-1 accent-pink-500"
                      onChange={(e) => set({ panDistance: Number(e.target.value) })}
                    />
                    <span className="w-7 text-right font-type text-[10px] text-paper/70">{c.panDistance ?? 0}%</span>
                  </div>
                </Field>
              </div>
              <p className="font-type text-[9px] text-paper/40">
                Pan drift slides the frame while it eases in — 0% keeps the gentle push-in only.
              </p>
            </div>
          )}

          {mode === "zoom-hold" && (
            <Field label="Zoom duration (seconds before it holds)">
              <input
                type="number"
                min={2}
                max={30}
                step={1}
                className={inputCls}
                value={c.zoomDuration ?? 8}
                onChange={(e) => set({ zoomDuration: Number(e.target.value) || 8 })}
              />
            </Field>
          )}

          {(mode === "pan" || mode === "zoom-hold") && (
            <Field label="Focal point (where camera looks — CSS % e.g. '60% 40%' for upper right)">
              <div className="space-y-1">
                <input
                  className={inputCls}
                  placeholder="50% 50%"
                  value={c.focalPoint ?? ""}
                  onChange={(e) => set({ focalPoint: e.target.value || undefined })}
                />
                <p className="font-type text-[9px] text-paper/40">
                  X% Y% — top-left is 0% 0%, bottom-right is 100% 100%, centre is 50% 50%.
                </p>
                {/* click-to-set focal point on a live preview */}
                <div
                  className="relative mt-1 aspect-video w-full cursor-crosshair overflow-hidden border border-gold/30"
                  style={{ ...bgStyle(previewUrl) }}
                  title="Click to set focal point"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const x = Math.round(((e.clientX - r.left) / r.width) * 100);
                    const y = Math.round(((e.clientY - r.top) / r.height) * 100);
                    set({ focalPoint: `${x}% ${y}%` });
                  }}
                >
                  {c.focalPoint && (() => {
                    const [px, py] = c.focalPoint.split(" ").map((v) => parseFloat(v));
                    return (
                      <div
                        className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neon shadow-[0_0_10px_#ff2e88]"
                        style={{ left: `${px}%`, top: `${py}%` }}
                      />
                    );
                  })()}
                  <p className="pointer-events-none absolute inset-0 flex items-end justify-center pb-1 font-pulp text-[8px] uppercase tracking-widest text-paper/60">
                    Click to set focal point
                  </p>
                </div>
              </div>
            </Field>
          )}
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="cin-grade" title="🎨 Color grade & film stock" titleClass="text-neon">
        <Field label="Director / stock grade">
          <select
            className={inputCls}
            value={c.colorGrade ?? ""}
            onChange={(e) => set({ colorGrade: (e.target.value || undefined) as CinematicSettings["colorGrade"] })}
          >
            <option value="">— no grade (straight plate) —</option>
            {GRADE_PRESET_LIST.map((g) => (
              <option key={g.id} value={g.id}>{g.badge} {g.name}</option>
            ))}
          </select>
        </Field>
        {c.colorGrade && (
          <p className="border border-neon/20 bg-neon/5 p-2 font-type text-[9px] leading-snug text-paper/55">
            <b className="text-neon">{GRADE_PRESETS[c.colorGrade]?.name}</b> — {GRADE_PRESETS[c.colorGrade]?.tagline}{" "}
            The grade works on every camera mode and on insert-shot beat backgrounds.
          </p>
        )}
        <label className="flex items-start gap-2 border border-gold/25 bg-gold/5 px-2 py-1.5 text-[10px] uppercase tracking-wider text-paper/70">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!!c.filmGrade}
            onChange={(e) => set({ filmGrade: e.target.checked || undefined })}
          />
          <span>
            🎞 Film grade — 35mm print emulation
            <span className="block font-type text-[9px] normal-case tracking-normal text-paper/45">
              Animated grain (heavier than the ambient grain), gate weave, highlight halation bloom, light flicker and the
              occasional scratch/dust pass. Sits above the color grade like the physical print of the graded image.
            </span>
          </span>
        </label>
        {c.filmGrade && (
          <Field label={`Film strength ${Math.round((c.filmGradeStrength ?? 0.7) * 100)}%`}>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0.15}
                max={1}
                step={0.05}
                value={c.filmGradeStrength ?? 0.7}
                className="flex-1 accent-pink-500"
                onChange={(e) => set({ filmGradeStrength: Number(e.target.value) })}
              />
              <span className="w-8 text-right font-type text-[10px] text-paper/70">{Math.round((c.filmGradeStrength ?? 0.7) * 100)}%</span>
            </div>
          </Field>
        )}
      </CollapsibleSection>

      <CollapsibleSection id="cin-parallax" title="🌆 Parallax depth" titleClass="text-cyan-neon">
        <Field label={`Depth ${Math.round((c.parallaxDepth ?? 0) * 100)}%`}>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={c.parallaxDepth ?? 0}
              className="flex-1 accent-cyan-400"
              onChange={(e) => set({ parallaxDepth: Number(e.target.value) || undefined })}
            />
            <span className="w-8 text-right font-type text-[10px] text-paper/70">{Math.round((c.parallaxDepth ?? 0) * 100)}%</span>
          </div>
        </Field>
        <p className="font-type text-[9px] leading-snug text-paper/45">
          The camera subtly follows the cursor — the plate drifts slowest, mid planes and the foreground subject faster,
          like a diorama. A gentle idle sway plays when the mouse is still. Move your mouse over the live preview above to
          feel it.
        </p>
        <Field label="Mid-ground depth planes (transparent cutouts)">
          {(c.parallaxLayers ?? []).map((layer, i) => (
            <div key={i} className="mb-2 space-y-1 border border-cyan-neon/20 bg-cyan-neon/5 p-2">
              <div className="flex items-center justify-between gap-2">
                <AssetDropdown
                  assetType="image"
                  value={layer.image}
                  returnReference
                  storyId={storyId}
                  placeholder="Pick a transparent plane image…"
                  onChange={(v) => {
                    const layers = [...(c.parallaxLayers ?? [])];
                    layers[i] = { ...layer, image: v ?? "" };
                    set({ parallaxLayers: layers.filter((l) => l.image) });
                  }}
                />
                <button
                  className="shrink-0 border border-crimson/50 px-2 py-1 font-pulp text-[9px] uppercase text-crimson hover:bg-crimson/10"
                  onClick={() => set({ parallaxLayers: (c.parallaxLayers ?? []).filter((_, j) => j !== i) })}
                >
                  ✕
                </button>
              </div>
              <Field label={`Depth ${Math.round(layer.depth * 100)}% (0=far / 1=near)`}>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={layer.depth}
                  className="w-full accent-cyan-400"
                  onChange={(e) => {
                    const layers = [...(c.parallaxLayers ?? [])];
                    layers[i] = { ...layer, depth: Number(e.target.value) };
                    set({ parallaxLayers: layers });
                  }}
                />
              </Field>
            </div>
          ))}
          <div className="flex gap-2">
            <MediaUploadButton
              accept="image/*"
              storyId={storyId}
              label="⤒ Upload plane"
              onUploaded={(_url, assetId) =>
                set({ parallaxLayers: [...(c.parallaxLayers ?? []), { image: `asset:${assetId}`, depth: 0.5 }] })
              }
            />
            <button
              className="shrink border border-cyan-neon/40 px-2 py-1 font-pulp text-[9px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/10"
              onClick={() => set({ parallaxLayers: [...(c.parallaxLayers ?? []), { image: "gradient:linear-gradient(180deg, rgba(10,12,20,0) 40%, rgba(10,12,20,0.55) 100%)", depth: 0.35 }] })}
              title="Add a gradient fog plane (uses the picker above to swap for an image)"
            >
              ＋ Fog plane
            </button>
          </div>
        </Field>
      </CollapsibleSection>

      <CollapsibleSection id="cin-foreground" title="🧍 Foreground overlay">
        <p className="font-type text-[9px] text-paper/40">
          Layers a fixed image over the scene, in front of any camera motion — great for a character, prop or frame. Works with every
          camera mode (and static).
        </p>

        <Field label="Foreground image (transparent PNG works best)">
          <div className="flex gap-1">
            <input
              className={inputCls}
              placeholder="/img/foreground.png"
              value={mediaField(c.foregroundImage)}
              onChange={(e) => set({ foregroundImage: e.target.value || undefined })}
            />
            <MediaUploadButton
              storyId={storyId}
              accept="image/*"
              label="⇧"
              onUploaded={(_url, assetId) => set({ foregroundImage: `asset:${assetId}` })}
            />
          </div>
          <div className="mt-1">
            <AssetDropdown
              storyId={storyId}
              assetType="image"
              returnReference
              value={c.foregroundImage}
              onChange={(url) => set({ foregroundImage: url ?? undefined })}
              placeholder="Or pick an uploaded image..."
            />
          </div>
        </Field>

        {hasForeground && (
          <>
            <ForegroundPositionEditor
              previewUrl={previewUrl}
              cinematic={cinematic}
              media={media}
              x={c.foregroundX ?? 50}
              y={c.foregroundY ?? 50}
              anchor={c.foregroundAnchor ?? "50% 50%"}
              replayEpoch={zoomEpoch}
              onChange={(x, y) => set({ foregroundX: x, foregroundY: y })}
              onAnchorAt={(anchor, x, y) => set({ foregroundAnchor: anchor, foregroundX: x, foregroundY: y })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field label={`Scale ${(c.foregroundScale ?? 1).toFixed(2)}×`}>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.25}
                    max={2.5}
                    step={0.05}
                    value={c.foregroundScale ?? 1}
                    className="flex-1 accent-pink-500"
                    onChange={(e) => set({ foregroundScale: Number(e.target.value) })}
                  />
                  <span className="w-9 text-right font-type text-[10px] text-paper/70">{(c.foregroundScale ?? 1).toFixed(2)}×</span>
                </div>
              </Field>
              <Field label="Fit">
                <select
                  className={inputCls}
                  value={c.foregroundFit ?? "contain"}
                  onChange={(e) => set({ foregroundFit: e.target.value as CinematicSettings["foregroundFit"] })}
                >
                  <option value="contain">Contain — whole image fits</option>
                  <option value="cover">Cover — fill the frame, crop edges</option>
                  <option value="fill">Fill — stretch to fill the frame</option>
                  <option value="native">Native — draw at its real size</option>
                </select>
              </Field>
            </div>
            <p className="border border-gold/25 bg-gold/5 p-2 font-type text-[9px] leading-snug text-paper/55">
              The <b className="text-gold">focus point</b> is set by <b className="text-gold">clicking the spot on the subject</b> in the
              preview above — it stays fixed while the foreground zoom plays. Drag to move the subject.
            </p>
            <div className="space-y-2 border border-gold/25 bg-gold/5 p-2">
              <span className="font-pulp text-[9px] uppercase tracking-widest text-gold">🔍 Foreground zoom</span>
              {/* Direction quick-set: push in (multiplier >1), pull out (multiplier <1), or off (1×). */}
              <div className="flex gap-1">
                <button
                  onClick={() => set({ foregroundZoom: 1.25 })}
                  className={`flex-1 border py-1 font-pulp text-[9px] uppercase tracking-widest ${(c.foregroundZoom ?? 1) > 1 ? "border-gold bg-gold/15 text-gold" : "border-paper/30 text-paper/70 hover:border-gold hover:text-gold"}`}
                  title="Push in — zoom toward the anchor"
                >
                  ↗ Push in
                </button>
                <button
                  onClick={() => set({ foregroundZoom: 0.8 })}
                  className={`flex-1 border py-1 font-pulp text-[9px] uppercase tracking-widest ${(c.foregroundZoom ?? 1) < 1 ? "border-gold bg-gold/15 text-gold" : "border-paper/30 text-paper/70 hover:border-gold hover:text-gold"}`}
                  title="Pull out — zoom away from the anchor"
                >
                  ↘ Pull out
                </button>
                <button
                  onClick={() => set({ foregroundZoom: undefined })}
                  className={`flex-1 border py-1 font-pulp text-[9px] uppercase tracking-widest ${(c.foregroundZoom ?? 1) === 1 ? "border-paper/40 text-paper" : "border-paper/30 text-paper/50 hover:border-paper/60 hover:text-paper"}`}
                  title="No zoom — leave the foreground at its base scale"
                >
                  Off
                </button>
              </div>
              <Field label={`Zoom ${(c.foregroundZoom ?? 1) === 1 ? "off (1.00×)" : `${(c.foregroundZoom ?? 1) < 1 ? "1.00× → pull to " : "1.00× → push to "}${(c.foregroundZoom ?? 1).toFixed(2)}×`}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.05}
                    value={c.foregroundZoom ?? 1}
                    className="flex-1 accent-pink-500"
                    aria-label="Foreground zoom amount (below 1× = pull out, above 1× = push in)"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      set({ foregroundZoom: Math.abs(v - 1) < 0.001 ? undefined : v });
                    }}
                  />
                  <span className="w-12 text-right font-type text-[10px] text-paper/70">
                    {(c.foregroundZoom ?? 1) === 1 ? "off" : `${(c.foregroundZoom ?? 1).toFixed(2)}×`}
                  </span>
                </div>
              </Field>
              {(c.foregroundZoom ?? 1) !== 1 && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Zoom duration ${Math.round(c.foregroundZoomDuration ?? 8)}s`}>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      step={1}
                      className={inputCls}
                      value={c.foregroundZoomDuration ?? 8}
                      onChange={(e) => set({ foregroundZoomDuration: Math.max(1, Number(e.target.value) || 8) })}
                    />
                  </Field>
                  <div className="flex items-end">
                    <button
                      onClick={() => setZoomEpoch((n) => n + 1)}
                      className="w-full border border-gold/50 py-1 font-pulp text-[9px] uppercase tracking-widest text-gold hover:bg-gold/10"
                      title="Replay the zoom animation in the preview"
                    >
                      ↺ Replay zoom
                    </button>
                  </div>
                </div>
              )}
              <p className="font-type text-[9px] text-paper/45">
                A slow push-in (or pull-out, below 1×) that stays focused on the anchor point. The anchor is pinned at the offset set in the preview above.
              </p>
            </div>

            {/* ---- keyframe animation ---- */}
            <div className="space-y-2 border border-cyan-neon/25 bg-cyan-neon/5 p-2">
              <span className="font-pulp text-[9px] uppercase tracking-widest text-cyan-neon">🎞 Keyframe animation</span>
              <Field label="Animation style">
                <select
                  className={inputCls}
                  value={animMode}
                  onChange={(e) => {
                    const mode = e.target.value as ForegroundAnimationMode | "none";
                    if (mode === "none") {
                      set({ foregroundAnimation: undefined });
                      return;
                    }
                    const next: ForegroundAnimation = {
                      ...(c.foregroundAnimation ?? { frames: [] }),
                      mode,
                    };
                    if (!next.frames.length && c.foregroundImage) next.frames = [c.foregroundImage];
                    set({ foregroundAnimation: next });
                  }}
                >
                  <option value="none">🖼 Static — single pose (no animation)</option>
                  <option value="dissolve">🌫 Dissolve — cross-fade between poses</option>
                  <option value="frames">🎞 Keyframes — hard sprite swap (Ace Attorney style)</option>
                </select>
              </Field>

              {animMode !== "none" && (
                <>
                  <Field label={`Keyframes (${frames.length}) — played in order`}>
                    <div className="space-y-1">
                      {frames.map((f, i) => (
                        <div key={i} className="space-y-1 border border-noir-700/60 p-1.5">
                          <div className="flex items-center gap-1">
                            <span className="w-4 shrink-0 text-center font-pulp text-[10px] text-paper/50">{i + 1}</span>
                            <input
                              className={inputCls}
                              placeholder={`/img/frame${i + 1}.png`}
                              value={frameName(f)}
                              title={f}
                              onChange={(e) => {
                                const next = [...frames];
                                next[i] = e.target.value;
                                setAnim({ frames: next });
                              }}
                            />
                            <MediaUploadButton
                              storyId={storyId}
                              accept="image/*"
                              label="⇧"
                              onUploaded={(_url, assetId) => {
                                const next = [...frames];
                                next[i] = `asset:${assetId}`;
                                setAnim({ frames: next });
                              }}
                            />
                            <button
                              onClick={() => {
                                const next = [...frames];
                                next.splice(i, 1);
                                if (next.length) setAnim({ frames: next });
                                else set({ foregroundAnimation: undefined });
                              }}
                              className="shrink-0 border border-crimson/40 px-1.5 py-1 font-pulp text-[9px] uppercase text-crimson hover:bg-crimson/10"
                              title="Remove this frame"
                            >
                              ✕
                            </button>
                          </div>
                          <AssetDropdown
                            storyId={storyId}
                            assetType="image"
                            returnReference
                            value={f.startsWith("asset:") || f.startsWith("data:") ? f : undefined}
                            onChange={(url) => {
                              const next = [...frames];
                              if (url) next[i] = url;
                              else next.splice(i, 1);
                              if (next.length) setAnim({ frames: next });
                              else set({ foregroundAnimation: undefined });
                            }}
                            placeholder="📁 Pick an uploaded keyframe…"
                          />
                        </div>
                      ))}
                      <div className="flex gap-1">
                        <button
                          onClick={() => setAnim({ frames: [...frames, frames[frames.length - 1] ?? c.foregroundImage ?? ""] })}
                          className="border border-cyan-neon/40 px-2 py-1 font-pulp text-[9px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/10"
                        >
                          ＋ Add frame
                        </button>
                        {c.foregroundImage && !frames.includes(c.foregroundImage) && (
                          <button
                            onClick={() => setAnim({ frames: [...frames, c.foregroundImage!] })}
                            className="border border-paper/30 px-2 py-1 font-pulp text-[9px] uppercase tracking-widest text-paper/70 hover:border-gold hover:text-gold"
                            title="Append the static foreground image as another keyframe"
                          >
                            ＋ Use foreground image
                          </button>
                        )}
                      </div>
                    </div>
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label={`Frame time ${(c.foregroundAnimation?.frameDuration ?? 0.2).toFixed(2)}s`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0.05}
                          max={1.5}
                          step={0.05}
                          value={c.foregroundAnimation?.frameDuration ?? 0.2}
                          className="flex-1 accent-pink-500"
                          onChange={(e) => setAnim({ frameDuration: Number(e.target.value) })}
                        />
                        <span className="w-9 text-right font-type text-[10px] text-paper/70">
                          {(c.foregroundAnimation?.frameDuration ?? 0.2).toFixed(2)}s
                        </span>
                      </div>
                    </Field>
                    {animMode === "dissolve" ? (
                      <Field
                        label={`Fade time ${(c.foregroundAnimation?.fadeDuration ?? c.foregroundAnimation?.frameDuration ?? 0.2).toFixed(2)}s`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.05}
                            value={c.foregroundAnimation?.fadeDuration ?? c.foregroundAnimation?.frameDuration ?? 0.2}
                            className="flex-1 accent-pink-500"
                            onChange={(e) => setAnim({ fadeDuration: Number(e.target.value) })}
                          />
                          <span className="w-9 text-right font-type text-[10px] text-paper/70">
                            {(c.foregroundAnimation?.fadeDuration ?? c.foregroundAnimation?.frameDuration ?? 0.2).toFixed(2)}s
                          </span>
                        </div>
                      </Field>
                    ) : (
                      <Field label="Playback">
                        <select
                          className={inputCls}
                          value={(c.foregroundAnimation?.loops ?? 0) <= 0 ? "loop" : String(c.foregroundAnimation?.loops)}
                          onChange={(e) => setAnim({ loops: e.target.value === "loop" ? undefined : Number(e.target.value) })}
                        >
                          <option value="loop">∞ Loop forever</option>
                          <option value="1">▶ Play once — hold last frame</option>
                          <option value="2">▶▶ Play twice</option>
                          <option value="3">▶▶▶ Play 3×</option>
                        </select>
                      </Field>
                    )}
                  </div>
                  {animMode === "dissolve" && (
                    <div className="grid grid-cols-1">
                      <Field label="Playback">
                        <select
                          className={inputCls}
                          value={(c.foregroundAnimation?.loops ?? 0) <= 0 ? "loop" : String(c.foregroundAnimation?.loops)}
                          onChange={(e) => setAnim({ loops: e.target.value === "loop" ? undefined : Number(e.target.value) })}
                        >
                          <option value="loop">∞ Loop forever</option>
                          <option value="1">▶ Play once — hold last frame</option>
                          <option value="2">▶▶ Play twice</option>
                          <option value="3">▶▶▶ Play 3×</option>
                        </select>
                      </Field>
                    </div>
                  )}
                  <p className="font-type text-[9px] text-paper/45">
                    {animMode === "dissolve"
                      ? "Each pose holds for the frame time, then cross-fades into the next — smooth, dreamlike (a neutral pose melting into a head-turned shock)."
                      : "Keyframes swap instantly, one per frame time — traditional comic-panel / limited-frame animation, the Ace Attorney & Hotel Dusk look."}
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => set({ foregroundX: 50, foregroundY: 50, foregroundAnchor: undefined, foregroundZoom: undefined, foregroundZoomDuration: undefined })}
                className="flex-1 border border-paper/30 py-1 font-pulp text-[9px] uppercase tracking-widest text-paper/70 hover:border-gold hover:text-gold"
              >
                ⟲ Center foreground
              </button>
              <button
                onClick={() =>
                  set({
                    foregroundImage: undefined,
                    foregroundScale: undefined,
                    foregroundFit: undefined,
                    foregroundX: undefined,
                    foregroundY: undefined,
                    foregroundAnchor: undefined,
                    foregroundZoom: undefined,
                    foregroundZoomDuration: undefined,
                    foregroundAnimation: undefined,
                  })
                }
                className="flex-1 border border-crimson/40 py-1 font-pulp text-[9px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
              >
                ✕ Remove foreground
              </button>
            </div>
          </>
        )}
      </CollapsibleSection>

      {/* ---- sprite sheet editor: stacked foreground sprites ---- */}
      <CollapsibleSection id="cin-foreground-extras" title="🎞 Sprite sheet editor — foreground sprites" titleClass="text-neon">
        <p className="font-type text-[9px] text-paper/40">
          Layer sprites over the plate — characters, props, cars, signs. Each one is positioned, scaled and
          mirrored on the preview below, can loop a sprite-sheet animation, and parallaxes by its own depth.
        </p>
        <div className="space-y-1 border border-gold/25 bg-gold/5 p-2 font-type text-[9px] leading-snug text-paper/55">
          <div className="font-pulp text-[9px] uppercase tracking-widest text-gold">📐 How to make a sprite sheet (the whole recipe)</div>
          <p>
            <b className="text-paper/75">The fast way (no rules to remember):</b> get art with frames side by side on
            ONE flat backdrop colour — from the 🤖 AI tab (sprite starters, or style-transfer your own upload), a
            drawing, or a photo — then press <b>⚡ Upload art → auto-build</b> below. It removes the backdrop, slices
            the frames, sets the sizes and animations, and files the sheet under 📁 sprites in the media library.
            If removal eats into the art, set backdrop removal to <b>gentle</b>; if specks survive, <b>strong</b>;
            for full manual control use Media Tools ▸ ✂ Sprite Cutout Lab.
          </p>
          <p>
            <b className="text-paper/75">Doing it by hand instead:</b> one transparent PNG, every frame EXACTLY the
            same size, side by side. Frames count 0, 1, 2… left to right (extra rows continue the count). 3 frames of
            200 × 300 → one 600 × 300 image, and Frame W/H below = 200 × 300 (a SINGLE frame, not the whole image).
          </p>
          <p>
            <b className="text-paper/75">Sizes.</b> Exact size doesn't matter — the engine scales everything. Aim for
            frames ≈ 384–512 px tall for characters, ≈ 256 px for props/signs, up to ≈ 640 px for big pieces (a car),
            and keep the whole sheet under ≈ 4096 px a side. Bigger = crisper but heavier.
          </p>
          <p>
            <b className="text-paper/75">Animations.</b> Just lists of frame numbers, e.g. loop = 0, 1, 2, 1.
            Foreground sprites here play <b>loop</b> · stage walkers use <b>walk</b> + <b>idle</b> · talking
            portraits use <b>talk</b> + <b>rest</b> (characters can also hold 🎭 alternate sheets — outfits/moods
            switched by a beat's expression, see the Characters tab).
          </p>
          <p>
            <b className="text-paper/75">Placing it.</b> Every sprite gets a live preview — drag it into position on
            the scene, drag the ◢ corner (or scroll) to resize. Colour grades apply to sprites the same as the
            background, so they always sit in the scene's look.
          </p>
        </div>
        {(c.foregroundExtras ?? []).map((extra: ForegroundExtra, i: number) => {
          const update = (patch: Partial<ForegroundExtra>) => {
            const n = [...(c.foregroundExtras ?? [])];
            n[i] = { ...extra, ...patch };
            set({ foregroundExtras: n });
          };
          const remove = () => set({ foregroundExtras: (c.foregroundExtras ?? []).filter((_: ForegroundExtra, j: number) => j !== i) });
          return (
          <div key={i} className="space-y-1.5 border border-neon/20 bg-neon/5 p-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-pulp text-[9px] uppercase tracking-widest text-neon">Image {i + 1}{!extra.image ? " — choose an image" : ""}</span>
              <button
                className="shrink-0 border border-crimson/50 px-2 py-0.5 font-pulp text-[9px] uppercase text-crimson hover:bg-crimson/10"
                onClick={remove}
              >
                ✕
              </button>
            </div>
            <AssetDropdown
              storyId={storyId}
              assetType="image"
              returnReference
              preferFolder="sprites"
              value={extra.image || undefined}
              placeholder="Pick a transparent image…"
              onChange={(url) => update({ image: url ?? "" })}
            />
            {/* Live preview — drag the sprite onto the plate, corner-drag to resize. */}
            <SpriteBoxEditor
              mode="extra"
              backgroundUrl={previewUrl}
              image={media(extra.image) ?? extra.image ?? undefined}
              sheet={extra.sheet}
              resolve={media}
              x={extra.x ?? 50}
              y={extra.y ?? 80}
              scale={extra.scale ?? 1}
              flip={!!extra.flip}
              onChange={(p) => update(p)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Field label={`Position X ${extra.x ?? 50}% · Y ${extra.y ?? 80}%`}>
                <div className="space-y-1">
                  <input type="range" min={0} max={100} step={1} value={extra.x ?? 50} className="w-full accent-pink-500"
                    onChange={(e) => update({ x: Number(e.target.value) })} />
                  <input type="range" min={0} max={100} step={1} value={extra.y ?? 80} className="w-full accent-pink-500"
                    onChange={(e) => update({ y: Number(e.target.value) })} />
                </div>
              </Field>
              <Field label={`Scale ${(extra.scale ?? 1).toFixed(2)}×`}>
                <input type="range" min={0.2} max={2.5} step={0.05} value={extra.scale ?? 1} className="w-full accent-pink-500"
                  onChange={(e) => update({ scale: Number(e.target.value) })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fit">
                <select className={inputCls} value={extra.fit ?? "contain"} onChange={(e) => update({ fit: e.target.value as never })}>
                  <option value="contain">Contain (whole fits)</option>
                  <option value="cover">Cover (fill frame)</option>
                  <option value="fill">Fill (stretch)</option>
                  <option value="native">Native size</option>
                </select>
              </Field>
              <Field label={`Parallax depth ${Math.round((extra.depth ?? 0) * 100)}%`}>
                <input type="range" min={0} max={1} step={0.05} value={extra.depth ?? 0} className="w-full accent-cyan-400"
                  onChange={(e) => update({ depth: Number(e.target.value) || undefined })} />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/60">
              <input type="checkbox" checked={!!extra.flip} onChange={(e) => update({ flip: e.target.checked || undefined })} />
              ↔ Flip horizontally (face the other way)
            </label>
            {/* ---- walk-behind mask: the cutout IS the mask ---- */}
            <div className="space-y-1 border border-amber-400/30 bg-amber-400/5 p-2">
              <div className="font-pulp text-[9px] uppercase tracking-widest text-amber-300">🚶 Walk-behind mask (🚶 stage rooms)</div>
              <label className="flex items-center gap-2 font-type text-[10px] text-paper/70">
                <input type="checkbox" checked={!!extra.occludes} onChange={(e) => update({ occludes: e.target.checked || undefined })} />
                Draw this OVER the player when they walk behind it
              </label>
              <p className="font-type text-[9px] leading-snug text-paper/45">
                Turn any foreground cutout into an occluder — no second asset. While the walker's feet are ABOVE the
                depth line they are standing behind the object, so the art is drawn over them (they vanish behind the
                counter, the truck, the pillar). Step below the line and they're in front of it again. Pair it with a
                🚧 barrier so they can't walk through it either.
              </p>
              {extra.occludes ? (
                <Field label={`Depth line (base of the object) — ${extra.occludeBaseline ?? extra.y ?? 80}% down the plate`}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={extra.occludeBaseline ?? extra.y ?? 80}
                    className="w-full accent-amber-400"
                    onChange={(e) => update({ occludeBaseline: Number(e.target.value) })}
                  />
                </Field>
              ) : null}
            </div>
            {/* ---- animate with a sprite sheet (flickering neon, rain-lashed flags) ---- */}
            <div className="space-y-1 border border-cyan-neon/30 bg-cyan-neon/5 p-2">
              <div className="font-pulp text-[9px] uppercase tracking-widest text-cyan-neon">🎞 Animate with a sprite sheet</div>
              <p className="font-type text-[9px] leading-snug text-paper/45">
                Loop a frame grid instead of the static image — a flickering neon sign, a rain-lashed flag. The
                "loop" animation plays on repeat; the static image above stays as your fallback. Position, scale,
                flip and depth still apply.
              </p>
              <SpriteSheetControls
                value={extra.sheet}
                storyId={storyId}
                preset={EXTRA_PRESET}
                onChange={(sheet) => update({ sheet })}
              />
            </div>
            {/* ---- motion path + idle preset (🎬 the gull flies across) ---- */}
            <div className="space-y-1 border border-emerald-400/30 bg-emerald-400/5 p-2">
              <div className="font-pulp text-[9px] uppercase tracking-widest text-emerald-300">🎬 Motion &amp; idle animation</div>
              <p className="font-type text-[9px] leading-snug text-paper/45">
                <b>Idle motion</b> loops a CSS preset — no extra art. A <b>motion path</b> flies the sprite along its
                waypoints at a constant speed: a gull crossing the harbour, a car passing outside, a rat along the
                skirting. Paths compile to real keyframes, so nothing runs in JavaScript while they play.
              </p>
              <Field label="Idle motion">
                <select
                  className={inputCls}
                  value={extra.anim?.preset ?? "none"}
                  onChange={(e) => update({ anim: { ...(extra.anim ?? {}), preset: e.target.value as never } })}
                >
                  {ANIM_PRESETS.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.label} — {pr.blurb}
                    </option>
                  ))}
                </select>
              </Field>
              {(extra.anim?.preset ?? "none") !== "none" && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Speed ${(extra.anim?.speed ?? 1).toFixed(2)}×`}>
                    <input
                      type="range"
                      min={0.25}
                      max={3}
                      step={0.05}
                      value={extra.anim?.speed ?? 1}
                      className="w-full accent-emerald-400"
                      onChange={(e) => update({ anim: { ...(extra.anim ?? {}), speed: Number(e.target.value) } })}
                    />
                  </Field>
                  <Field label={`Intensity ${(extra.anim?.intensity ?? 1).toFixed(2)}`}>
                    <input
                      type="range"
                      min={0.2}
                      max={2}
                      step={0.05}
                      value={extra.anim?.intensity ?? 1}
                      className="w-full accent-emerald-400"
                      onChange={(e) => update({ anim: { ...(extra.anim ?? {}), intensity: Number(e.target.value) } })}
                    />
                  </Field>
                </div>
              )}
              <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                <input
                  type="checkbox"
                  checked={!!extra.motion}
                  onChange={(e) =>
                    update({
                      motion: e.target.checked
                        ? { points: [{ x: 8, y: 28 }, { x: 92, y: 20 }], duration: 11, ease: "arc", loop: "loop", holdSeconds: 2, faceTravel: true }
                        : undefined,
                    })
                  }
                />
                Fly along a path
              </label>
              {extra.motion &&
                (() => {
                  const m = extra.motion;
                  const setM = (patch: Partial<MotionPath>) => update({ motion: { ...m, ...patch } });
                  const setPt = (i: number, patch: Partial<{ x: number; y: number }>) =>
                    setM({ points: m.points.map((pt, j) => (j === i ? { ...pt, ...patch } : pt)) });
                  const last = m.points[m.points.length - 1];
                  return (
                    <div className="space-y-1.5 border border-noir-600 bg-noir-950/60 p-2">
                      <div className="font-type text-[9px] text-emerald-300/90">{describeMotion(m)}</div>
                      {m.points.map((pt, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <span className="w-5 shrink-0 font-pulp text-[8px] text-paper/40">{i + 1}</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={Math.round(pt.x)}
                            title="X — % across the frame"
                            className={`${inputCls} w-14`}
                            onChange={(e) => setPt(i, { x: Number(e.target.value) })}
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={Math.round(pt.y)}
                            title="Y — % down the frame"
                            className={`${inputCls} w-14`}
                            onChange={(e) => setPt(i, { y: Number(e.target.value) })}
                          />
                          <button
                            type="button"
                            className="shrink-0 px-1 font-pulp text-[9px] text-crimson disabled:opacity-30"
                            title="Remove this waypoint"
                            disabled={m.points.length <= 2}
                            onClick={() => setM({ points: m.points.filter((_, j) => j !== i) })}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="w-full border border-emerald-400/40 py-0.5 font-pulp text-[8px] uppercase tracking-widest text-emerald-300 hover:bg-emerald-400/10"
                        onClick={() => setM({ points: [...m.points, { x: Math.min(100, Math.round(last.x + 12)), y: last.y }] })}
                      >
                        ＋ add waypoint
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label={`Pass time ${m.duration}s`}>
                          <input
                            type="range"
                            min={0.5}
                            max={60}
                            step={0.5}
                            value={m.duration}
                            className="w-full accent-emerald-400"
                            onChange={(e) => setM({ duration: Number(e.target.value) })}
                          />
                        </Field>
                        <Field label={`Pause at end ${(m.holdSeconds ?? 0).toFixed(1)}s`}>
                          <input
                            type="range"
                            min={0}
                            max={20}
                            step={0.5}
                            value={m.holdSeconds ?? 0}
                            className="w-full accent-emerald-400"
                            onChange={(e) => setM({ holdSeconds: Number(e.target.value) || undefined })}
                          />
                        </Field>
                        <Field label="Repeat">
                          <select className={inputCls} value={m.loop ?? "loop"} onChange={(e) => setM({ loop: e.target.value as never })}>
                            <option value="loop">loop (restart)</option>
                            <option value="pingpong">ping-pong (there &amp; back)</option>
                            <option value="once">once (play and hold)</option>
                          </select>
                        </Field>
                        <Field label="Easing">
                          <select className={inputCls} value={m.ease ?? "linear"} onChange={(e) => setM({ ease: e.target.value as never })}>
                            {EASES.map((ez) => (
                              <option key={ez.id} value={ez.id}>
                                {ez.label}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label={`End size ${(m.scaleTo ?? 1).toFixed(2)}×`}>
                          <input
                            type="range"
                            min={0.2}
                            max={2}
                            step={0.05}
                            value={m.scaleTo ?? 1}
                            className="w-full accent-emerald-400"
                            onChange={(e) => setM({ scaleTo: Number(e.target.value) })}
                          />
                        </Field>
                        <Field label={`End fade ${(m.fadeTo ?? 1).toFixed(2)}`}>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={m.fadeTo ?? 1}
                            className="w-full accent-emerald-400"
                            onChange={(e) => setM({ fadeTo: Number(e.target.value) })}
                          />
                        </Field>
                      </div>
                      <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                        <input
                          type="checkbox"
                          checked={m.faceTravel !== false}
                          onChange={(e) => setM({ faceTravel: e.target.checked })}
                        />
                        Turn to face the way it travels
                      </label>
                    </div>
                  );
                })()}
            </div>
          </div>
          );
        })}
        <div className="flex gap-2">
          <button
            className="flex-1 border border-neon/50 py-1.5 font-pulp text-[9px] uppercase tracking-widest text-neon hover:bg-neon/10"
            onClick={() =>
              set({
                foregroundExtras: [
                  ...(c.foregroundExtras ?? []),
                  { image: "", x: 50, y: 80, scale: 1, fit: "contain", anchor: "50% 100%", depth: 0.6 },
                ],
              })
            }
          >
            ＋ Add foreground image
          </button>
          <MediaUploadButton
            storyId={storyId}
            accept="image/*"
            label="⤒ Upload new"
            onUploaded={(_url, assetId) =>
              set({
                foregroundExtras: [
                  ...(c.foregroundExtras ?? []),
                  { image: `asset:${assetId}`, x: 50, y: 80, scale: 1, fit: "contain", anchor: "50% 100%", depth: 0.6 },
                ],
              })
            }
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection id="cin-lighting" title="💡 Lighting" titleClass="text-gold">
        <Field label="Image dimming (0 = full brightness, 1 = fully dark)">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={0.9}
              step={0.05}
              value={c.dimAmount ?? 0}
              className="flex-1 accent-pink-500"
              onChange={(e) => set({ dimAmount: Number(e.target.value) || undefined })}
            />
            <span className="w-8 text-right font-type text-[10px] text-paper/70">
              {((c.dimAmount ?? 0) * 100).toFixed(0)}%
            </span>
          </div>
        </Field>

        <div className="border-t border-gold/20 pt-2 space-y-2">
        <div className="flex items-center justify-between">
          <div className="font-pulp text-[9px] uppercase tracking-wider text-gold">
            💡 Light glows {points.length ? `· ${points.length}` : ""}
          </div>
          <button
            onClick={() => commitPoints([...points, defaultLight()])}
            className="border border-gold/50 px-2 py-0.5 font-pulp text-[9px] uppercase tracking-widest text-gold hover:bg-gold/10"
          >
            ＋ Add light
          </button>
        </div>

        {points.length === 0 && (
          <p className="font-type text-[9px] text-paper/45">
            No lights yet. Add one to make a lamp, window, or neon sign feel alive — each glows additively (screen blend) and
            breathes on a smooth sine wave.
          </p>
        )}

        {points.map((light, i) => {
          const glow = parseGlowColor(light.color);
          const upd = (patch: Partial<typeof light>) =>
            commitPoints(points.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
          return (
            <div key={i} className="space-y-1.5 border border-noir-600 p-2">
              <div className="flex items-center justify-between">
                <span className="font-pulp text-[9px] uppercase text-gold">Light {i + 1}</span>
                <button
                  onClick={() => commitPoints(points.filter((_, idx) => idx !== i))}
                  className="text-[9px] uppercase text-crimson hover:underline"
                >
                  ✕ remove
                </button>
              </div>

              {/* click-to-place preview showing every light, this one ringed.
                  The dim overlay sits BELOW the light glows — a light source
                  stays bright when the image darkens — so only the image dims. */}
              <div
                className="relative aspect-video w-full cursor-crosshair overflow-hidden isolate border border-gold/30"
                style={{ ...bgStyle(previewUrl) }}
                title="Click to move this light"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  upd({ x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) });
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 z-[1] bg-black"
                  style={{ opacity: c.dimAmount ?? 0 }}
                />
                {resolveLights(c).map((l, li) => (
                  <div key={li} className="cin-light" style={lightStyle(l)} />
                ))}
                <LensFlareLayer cinematic={c} />
                <div
                  className="pointer-events-none absolute z-[4] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neon shadow-[0_0_8px_#ff2e88]"
                  style={{ left: `${light.x}%`, top: `${light.y}%` }}
                />
                <p className="pointer-events-none absolute inset-0 z-[4] flex items-end justify-center pb-1 font-pulp text-[8px] uppercase tracking-widest text-paper/60">
                  Click to move light {i + 1}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Colour">
                  <input
                    type="color"
                    className="h-8 w-full border border-noir-600 bg-noir-950 cursor-pointer"
                    value={glow.hex}
                    onChange={(e) => upd({ color: e.target.value })}
                  />
                </Field>
                <Field label={`Size ${light.size ?? 40}%`}>
                  <input
                    type="range"
                    min={10}
                    max={90}
                    step={1}
                    className="w-full accent-pink-500"
                    value={light.size ?? 40}
                    onChange={(e) => upd({ size: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <Field label={`Brightness ${Math.round((light.intensity ?? 0.5) * 100)}%`}>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={1}
                  className="w-full accent-pink-500"
                  value={Math.round((light.intensity ?? 0.5) * 100)}
                  onChange={(e) => upd({ intensity: Number(e.target.value) / 100 })}
                />
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label={`Position X ${light.x}%`}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    className="w-full accent-pink-500"
                    value={light.x}
                    onChange={(e) => upd({ x: Number(e.target.value) })}
                  />
                </Field>
                <Field label={`Position Y ${light.y}%`}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    className="w-full accent-pink-500"
                    value={light.y}
                    onChange={(e) => upd({ y: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label={`Pulse speed ${(light.pulseSeconds ?? 2.8).toFixed(1)}s`}>
                  <input
                    type="range"
                    min={0.5}
                    max={8}
                    step={0.1}
                    className="w-full accent-pink-500"
                    value={light.pulseSeconds ?? 2.8}
                    onChange={(e) => upd({ pulseSeconds: Number(e.target.value) })}
                  />
                </Field>
                <Field label={`Pulse depth ${Math.round((light.pulseAmount ?? 1) * 100)}%`}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    className="w-full accent-pink-500"
                    value={Math.round((light.pulseAmount ?? 1) * 100)}
                    onChange={(e) => upd({ pulseAmount: Number(e.target.value) / 100 })}
                  />
                </Field>
              </div>

              <button
                type="button"
                onClick={() => {
                  setFlare({
                    x: light.x,
                    y: light.y,
                    color: glow.hex,
                    preset: "warm-amber",
                    intensity: Math.max(0.6, light.intensity ?? 0.75),
                  });
                }}
                className="w-full border border-cyan-neon/40 bg-cyan-neon/5 py-1 font-pulp text-[8px] uppercase tracking-wider text-cyan-neon hover:bg-cyan-neon/15 transition-colors"
              >
                ✨ Cast dynamic lens flare from Light {i + 1}
              </button>
            </div>
          );
        })}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="cin-lensflare"
        title="✨ Dynamic Lens Flare"
        titleClass="text-cyan-neon"
        hint={hasFlare && flare ? (LENS_FLARE_PRESETS[flare.preset]?.name ?? flare.preset) : undefined}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-pulp text-[10px] uppercase tracking-wider text-paper/90">
                Dynamic Lens Flare
              </span>
              <p className="font-type text-[9px] text-paper/45">
                Simulates optical anamorphic laser streaks, diffraction starbursts, and chromatic ghost reflections along the optical axis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (hasFlare) {
                  set({ lensFlare: undefined });
                } else {
                  const firstLight = points[0];
                  set({
                    lensFlare: defaultLensFlare(
                      "anamorphic-blue",
                      firstLight ? { x: firstLight.x, y: firstLight.y } : undefined
                    ),
                  });
                }
              }}
              className={`border px-2.5 py-1 font-pulp text-[9px] uppercase tracking-widest transition-colors ${
                hasFlare
                  ? "border-crimson/50 text-crimson hover:bg-crimson/10"
                  : "border-cyan-neon bg-cyan-neon/10 text-cyan-neon hover:bg-cyan-neon/20 shadow-[0_0_8px_rgba(42,217,217,0.3)]"
              }`}
            >
              {hasFlare ? "✕ Remove flare" : "＋ Enable lens flare"}
            </button>
          </div>

          {hasFlare && flare && (
            <>
              {/* Presets Grid */}
              <div className="space-y-1.5 border border-noir-600 bg-noir-900/60 p-2">
                <span className="font-pulp text-[9px] uppercase tracking-wider text-cyan-neon">
                  Optical Profiles & Presets
                </span>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {(Object.keys(LENS_FLARE_PRESETS) as LensFlarePreset[]).map((pkey) => {
                    const pr = LENS_FLARE_PRESETS[pkey];
                    const isSel = (flare.preset ?? "anamorphic-blue") === pkey;
                    return (
                      <button
                        key={pkey}
                        type="button"
                        onClick={() => {
                          const base = defaultLensFlare(pkey, { x: flare.x, y: flare.y });
                          setFlare({ ...base, x: flare.x, y: flare.y });
                        }}
                        className={`flex flex-col items-start rounded border p-1.5 text-left transition-all ${
                          isSel
                            ? "border-cyan-neon bg-cyan-neon/15 shadow-[0_0_8px_rgba(42,217,217,0.3)]"
                            : "border-noir-700 bg-noir-950/70 hover:border-paper/40 hover:bg-noir-800"
                        }`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span className="font-pulp text-[8.5px] font-semibold text-paper truncate">
                            {pr.name}
                          </span>
                          <span
                            className="h-2 w-2 rounded-full border border-black/40 shrink-0"
                            style={{ backgroundColor: pr.color, boxShadow: `0 0 4px ${pr.color}` }}
                          />
                        </div>
                        <span className="mt-0.5 font-type text-[7.5px] text-paper/50 truncate w-full">
                          {pr.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="font-type text-[8.5px] text-paper/50 italic pt-0.5">
                  {LENS_FLARE_PRESETS[flare.preset]?.tagline ?? ""}
                </p>
              </div>

              {/* Click-to-Place Interactive Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-pulp text-[9px] uppercase tracking-wider text-gold">
                    Position ({flare.x}%, {flare.y}%)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setFlare({ x: 50, y: 50 })}
                      className="border border-paper/20 px-1.5 py-0.5 font-pulp text-[7.5px] uppercase tracking-widest text-paper/70 hover:border-gold hover:text-gold"
                    >
                      ⟲ Center
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlare({ x: 25, y: 20 })}
                      className="border border-paper/20 px-1.5 py-0.5 font-pulp text-[7.5px] uppercase tracking-widest text-paper/70 hover:border-gold hover:text-gold"
                    >
                      ↖ Top-L
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlare({ x: 75, y: 20 })}
                      className="border border-paper/20 px-1.5 py-0.5 font-pulp text-[7.5px] uppercase tracking-widest text-paper/70 hover:border-gold hover:text-gold"
                    >
                      ↗ Top-R
                    </button>
                    {points.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const l = points[0];
                          if (l) setFlare({ x: l.x, y: l.y, color: l.color });
                        }}
                        className="border border-cyan-neon/40 bg-cyan-neon/10 px-1.5 py-0.5 font-pulp text-[7.5px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/20"
                        title="Snap flare to light 1 position and color"
                      >
                        🔗 Snap to Light 1
                      </button>
                    )}
                  </div>
                </div>

                <div
                  className="relative aspect-video w-full cursor-crosshair overflow-hidden isolate border border-cyan-neon/40 shadow-inner"
                  style={{ ...bgStyle(previewUrl) }}
                  title="Click to place the lens flare light source"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    const nx = Math.round(((e.clientX - r.left) / r.width) * 100);
                    const ny = Math.round(((e.clientY - r.top) / r.height) * 100);
                    setFlare({ x: clamp(nx, 0, 100), y: clamp(ny, 0, 100) });
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 z-[1] bg-black"
                    style={{ opacity: c.dimAmount ?? 0 }}
                  />
                  {resolveLights(c).map((l, li) => (
                    <div key={li} className="cin-light" style={lightStyle(l)} />
                  ))}

                  {/* Real-time Lens Flare Preview */}
                  <LensFlareLayer flareOverride={flare} />

                  {/* Optical Axis line */}
                  <svg className="pointer-events-none absolute inset-0 h-full w-full z-[5] opacity-40">
                    <line
                      x1={`${flare.x}%`}
                      y1={`${flare.y}%`}
                      x2={`${100 - flare.x}%`}
                      y2={`${100 - flare.y}%`}
                      stroke="#2ad9d9"
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                    <circle cx="50%" cy="50%" r="3" fill="#2ad9d9" />
                  </svg>

                  {/* Light Source Target Ring */}
                  <div
                    className="pointer-events-none absolute z-[6] h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-neon shadow-[0_0_10px_#2ad9d9]"
                    style={{ left: `${flare.x}%`, top: `${flare.y}%` }}
                  >
                    <div className="absolute inset-1 rounded-full bg-cyan-neon/30 animate-ping" />
                  </div>

                  <p className="pointer-events-none absolute bottom-1 inset-x-0 z-[6] flex justify-center font-pulp text-[8px] uppercase tracking-widest text-paper/70 bg-black/40 py-0.5">
                    Click to move flare source · Optical axis lines up across center
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Position X: ${flare.x}%`}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      className="w-full accent-cyan-400"
                      value={flare.x}
                      onChange={(e) => setFlare({ x: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={`Position Y: ${flare.y}%`}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      className="w-full accent-cyan-400"
                      value={flare.y}
                      onChange={(e) => setFlare({ y: Number(e.target.value) })}
                    />
                  </Field>
                </div>
              </div>

              {/* Colors & Overall Intensity */}
              <div className="space-y-2 border-t border-noir-700 pt-2">
                <Field label={`Overall Intensity: ${Math.round(flare.intensity * 100)}%`}>
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={1}
                    className="w-full accent-cyan-400"
                    value={Math.round(flare.intensity * 100)}
                    onChange={(e) => setFlare({ intensity: Number(e.target.value) / 100 })}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Primary Flare Color">
                    <input
                      type="color"
                      className="h-8 w-full border border-noir-600 bg-noir-950 cursor-pointer"
                      value={flareGlow.hex}
                      onChange={(e) => setFlare({ color: e.target.value })}
                    />
                  </Field>
                  <Field label="Secondary / Ghost Tint">
                    <input
                      type="color"
                      className="h-8 w-full border border-noir-600 bg-noir-950 cursor-pointer"
                      value={flareSecGlow.hex}
                      onChange={(e) => setFlare({ secondaryColor: e.target.value })}
                    />
                  </Field>
                </div>
              </div>

              {/* Anamorphic Streak Controls */}
              <div className="space-y-2 border-t border-noir-700 pt-2">
                <div className="font-pulp text-[9px] uppercase tracking-wider text-cyan-neon">
                  🎬 Anamorphic Streak Beam
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Beam Intensity: ${Math.round(flare.streakIntensity * 100)}%`}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      className="w-full accent-cyan-400"
                      value={Math.round(flare.streakIntensity * 100)}
                      onChange={(e) => setFlare({ streakIntensity: Number(e.target.value) / 100 })}
                    />
                  </Field>
                  <Field label={`Beam Thickness: ${flare.streakWidth.toFixed(1)}×`}>
                    <input
                      type="range"
                      min={0.2}
                      max={3.0}
                      step={0.1}
                      className="w-full accent-cyan-400"
                      value={flare.streakWidth}
                      onChange={(e) => setFlare({ streakWidth: Number(e.target.value) })}
                    />
                  </Field>
                </div>
                <Field label={`Streak Angle: ${flare.streakAngle}° (0° = horizontal)`}>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    step={1}
                    className="w-full accent-cyan-400"
                    value={flare.streakAngle}
                    onChange={(e) => setFlare({ streakAngle: Number(e.target.value) })}
                  />
                </Field>
              </div>

              {/* Optical Ghost Reflections */}
              <div className="space-y-2 border-t border-noir-700 pt-2">
                <div className="font-pulp text-[9px] uppercase tracking-wider text-cyan-neon">
                  🔮 Optical Ghost Reflections
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Ghost Brightness: ${Math.round(flare.ghostIntensity * 100)}%`}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      className="w-full accent-cyan-400"
                      value={Math.round(flare.ghostIntensity * 100)}
                      onChange={(e) => setFlare({ ghostIntensity: Number(e.target.value) / 100 })}
                    />
                  </Field>
                  <Field label={`Axis Spread: ${flare.ghostSpread.toFixed(2)}×`}>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      className="w-full accent-cyan-400"
                      value={flare.ghostSpread}
                      onChange={(e) => setFlare({ ghostSpread: Number(e.target.value) })}
                    />
                  </Field>
                </div>

                <Field label="Ghost Reflection Detail">
                  <select
                    className={inputCls}
                    value={flare.ghostCount}
                    onChange={(e) => setFlare({ ghostCount: e.target.value as LensFlareGhostTier })}
                  >
                    <option value="subtle">Subtle — 4 key aperture rings & discs</option>
                    <option value="standard">Standard — 8 chromatic elements & rainbow halo</option>
                    <option value="rich">Rich — 12 multi-spectral cinema optical elements</option>
                  </select>
                </Field>
              </div>

              {/* Starburst Diffraction & Core Size */}
              <div className="space-y-2 border-t border-noir-700 pt-2">
                <div className="font-pulp text-[9px] uppercase tracking-wider text-cyan-neon">
                  ⭐ Starburst Diffraction & Core Halo
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Starburst Intensity: ${Math.round(flare.starburstIntensity * 100)}%`}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      className="w-full accent-cyan-400"
                      value={Math.round(flare.starburstIntensity * 100)}
                      onChange={(e) => setFlare({ starburstIntensity: Number(e.target.value) / 100 })}
                    />
                  </Field>
                  <Field label="Starburst Rays">
                    <select
                      className={inputCls}
                      value={flare.starburstRays}
                      onChange={(e) => setFlare({ starburstRays: Number(e.target.value) })}
                    >
                      <option value={4}>4 Rays (Classic Cross)</option>
                      <option value={6}>6 Rays (Cinema Star)</option>
                      <option value={8}>8 Rays (Sunburst)</option>
                      <option value={12}>12 Rays (Fine Diffraction)</option>
                    </select>
                  </Field>
                </div>

                <Field label={`Core Glow & Corona Diameter: ${flare.coreSize}%`}>
                  <input
                    type="range"
                    min={15}
                    max={85}
                    step={1}
                    className="w-full accent-cyan-400"
                    value={flare.coreSize}
                    onChange={(e) => setFlare({ coreSize: Number(e.target.value) })}
                  />
                </Field>
              </div>

              {/* Dynamic Shimmer & Motion */}
              <div className="space-y-2 border-t border-noir-700 pt-2">
                <div className="font-pulp text-[9px] uppercase tracking-wider text-cyan-neon">
                  🌊 Dynamic Shimmer & Camera Reactivity
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={`Shimmer Speed: ${flare.pulseSeconds.toFixed(1)}s`}>
                    <input
                      type="range"
                      min={0.5}
                      max={8.0}
                      step={0.1}
                      className="w-full accent-cyan-400"
                      value={flare.pulseSeconds}
                      onChange={(e) => setFlare({ pulseSeconds: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={`Shimmer Depth: ${Math.round(flare.pulseAmount * 100)}%`}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      className="w-full accent-cyan-400"
                      value={Math.round(flare.pulseAmount * 100)}
                      onChange={(e) => setFlare({ pulseAmount: Number(e.target.value) / 100 })}
                    />
                  </Field>
                </div>

                <Field label={`Camera Parallax Reactivity: ${flare.reactivity.toFixed(1)}×`}>
                  <input
                    type="range"
                    min={0}
                    max={2.0}
                    step={0.1}
                    className="w-full accent-cyan-400"
                    value={flare.reactivity}
                    onChange={(e) => setFlare({ reactivity: Number(e.target.value) })}
                  />
                </Field>
              </div>
            </>
          )}
        </div>
      </CollapsibleSection>

      {isActive && (
        <button
          onClick={() => onChange(undefined)}
          className="w-full border border-crimson/40 py-1 font-pulp text-[9px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
        >
          Reset all cinematic settings
        </button>
      )}
    </div>
  );
}

function resizeImageFile(file: File, maxSize = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Unsupported image"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- cursor art (in-game theme) ---------- */
/** Per-verb cursor art. Lives on the 🎮 In-game theme tab and previews in the
 *  case's own theme, at real size, over a scrap of the plate — because a cursor
 *  is the one piece of UI the player touches literally everywhere. */
function CursorArtEditor({
  story,
  onUpdate,
  media,
  themeVars,
}: {
  story: Story;
  onUpdate: (next: Story) => void;
  media: (v?: string) => string | undefined;
  themeVars: React.CSSProperties;
}) {
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const art = story.cursorArt ?? {};
  const setSlot = (slot: string, patch: Partial<CursorArt>) => {
    const next = deepClone(story);
    next.cursorArt = { ...(next.cursorArt ?? {}) };
    (next.cursorArt as Record<string, CursorArt>)[slot] = { ...((art as Record<string, CursorArt>)[slot] ?? {}), ...patch };
    onUpdate(next);
  };
  const clearSlot = (slot: string) => {
    const next = deepClone(story);
    next.cursorArt = { ...(next.cursorArt ?? {}) };
    delete (next.cursorArt as Record<string, CursorArt | undefined>)[slot];
    if (!Object.keys(next.cursorArt).length) next.cursorArt = undefined;
    onUpdate(next);
  };
  return (
    <div className="space-y-1.5 border border-gold/30 bg-gold/5 p-2" style={themeVars}>
      <div className="font-pulp text-[9px] uppercase tracking-widest text-gold">🖱 Cursor art (per verb)</div>
      <p className="font-type text-[9px] leading-snug text-paper/45">
        Replace the system cursors with art: a pointing hand for <b>take</b>, an eye for <b>look</b>, a turning key
        for <b>use</b>. Give a verb a static <b>image</b> and it becomes the real mouse cursor; give it a <b>sprite
        sheet</b> and it animates as it follows the mouse. <b>default</b> is the plain arrow everywhere else. Nothing
        here is required — no art means the game keeps its system cursors.
      </p>
      {CURSOR_SLOTS.map((slot) => {
        const a = (art as Record<string, CursorArt | undefined>)[slot];
        const size = a?.size ?? 32;
        const open = openSlot === slot;
        const preview = (() => {
          if (a && sheetDrawable(a.sheet)) return <SheetSprite sheet={a.sheet!} anim="loop" fallbacks={["idle"]} height={Math.min(48, size)} />;
          if (a?.image) return <img src={assetUrl(media(a.image) ?? a.image)} alt="" className="w-auto object-contain" style={{ height: Math.min(48, size) }} />;
          return <span className="font-type text-[9px] uppercase tracking-widest text-paper/35">system cursor</span>;
        })();
        return (
          <div key={slot} className="border border-noir-700/70">
            <button
              className="flex w-full items-center gap-2 px-1.5 py-1 text-left hover:bg-noir-800/40"
              onClick={() => setOpenSlot(open ? null : slot)}
            >
              {/* the preview is a scrap of the plate, in the case's own theme */}
              <span className="relative flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden border border-gold/30 bg-noir-950">
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(232,178,60,0.12),transparent_70%)]" aria-hidden />
                {preview}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-pulp text-[9px] uppercase tracking-widest text-gold">
                  {CURSOR_ICON[slot] ?? "➤"} {slot}
                </span>
                <span className="block truncate font-type text-[9px] text-paper/45">
                  {a ? (sheetDrawable(a.sheet) ? "animated sprite sheet" : a.image ? "static image" : "empty") : "system cursor"}
                  {a ? ` · ${size}px · ${a.anchor === "center" ? "centred" : "tip: top-left"}` : ""}
                </span>
              </span>
              <span className="shrink-0 font-pulp text-[9px] text-paper/40">{open ? "▾" : "▸"}</span>
            </button>
            {open ? (
              <div className="space-y-1.5 border-t border-noir-700/70 p-1.5">
                <Field label="Static image (transparent PNG/WebP, ≤128px)">
                  <AssetDropdown
                    storyId={story.id}
                    assetType="image"
                    returnReference
                    preferFolder="sprites"
                    value={a?.image || undefined}
                    placeholder="Pick cursor art…"
                    onChange={(url) => setSlot(slot, { image: url ?? undefined, sheet: undefined })}
                  />
                </Field>
                {a?.image ? (
                  <div className="flex items-center gap-1">
                    <img src={assetUrl(media(a.image) ?? a.image)} alt="" className="h-8 w-auto object-contain" />
                    <button
                      className="border border-crimson/40 px-2 py-0.5 font-pulp text-[8px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
                      onClick={() => setSlot(slot, { image: undefined })}
                    >
                      ✕ remove
                    </button>
                  </div>
                ) : null}
                <div className="space-y-1 border border-cyan-neon/25 bg-cyan-neon/5 p-1.5">
                  <div className="font-pulp text-[9px] uppercase tracking-widest text-cyan-neon">🎞 Animated cursor (sprite sheet)</div>
                  <p className="font-type text-[9px] leading-snug text-paper/45">
                    A looping sprite that follows the mouse — a reaching hand, a blinking eye. Beats the 128px CSS
                    cursor limit and can be any size.
                  </p>
                  <SpriteSheetControls
                    value={a?.sheet}
                    storyId={story.id}
                    preset={EXTRA_PRESET}
                    onChange={(sheet) => setSlot(slot, { sheet, image: sheet ? undefined : a?.image })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <Field label="Hotspot point">
                    <select className={inputCls} value={a?.anchor ?? "top-left"} onChange={(e) => setSlot(slot, { anchor: e.target.value as CursorArt["anchor"] })}>
                      <option value="top-left">top-left (pointing)</option>
                      <option value="center">centre (reticle)</option>
                    </select>
                  </Field>
                  <Field label={`Size ${size}px`}>
                    <input type="range" min={16} max={96} step={2} className="w-full accent-gold" value={size} onChange={(e) => setSlot(slot, { size: Number(e.target.value) })} />
                  </Field>
                </div>
                <button
                  className="w-full border border-paper/30 py-0.5 font-pulp text-[8px] uppercase tracking-widest text-paper/50 hover:text-crimson"
                  onClick={() => clearSlot(slot)}
                >
                  ⟲ back to the system cursor
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- character editor ---------- */
function ItemEditor({ story, onUpdate }: { story: Story; onUpdate: (next: Story) => void }) {
  return (
    <div className="space-y-2 border border-noir-600 p-2 bg-noir-800/40">
      <h3 className="font-pulp text-[10px] uppercase tracking-widest text-gold">Story Inventory (items granted by hotspots/choices)</h3>
      <p className="font-type text-[9px] text-paper/40">Add new items here — they become available in node dropdowns.</p>
      <div className="space-y-1.5">
        {story.items.map((item) => (
          <div key={item.id} className="flex gap-2 items-start border border-noir-600/70 p-2">
            <div className="flex flex-col gap-1 items-center">
              <input
                aria-label={`${item.name} icon emoji`}
                className="w-10 border border-noir-600 bg-noir-950 p-1 text-center text-xl"
                value={item.icon}
                onChange={(e) => {
                  const next = deepClone(story);
                  next.items.find((candidate) => candidate.id === item.id)!.icon = e.target.value;
                  onUpdate(next);
                }}
              />
              <label className="flex items-center justify-center cursor-pointer border border-cyan-neon/40 px-2 py-1 font-pulp text-[8px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/10">
                ⇧
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    const result = await uploadAsset(story.id, file);
                    if (!result.success || !result.assetId) {
                      window.alert(result.error ?? "Upload failed.");
                      return;
                    }
                    const next = deepClone(story);
                    next.items.find((candidate) => candidate.id === item.id)!.iconUrl = `asset:${result.assetId}`;
                    onUpdate(next);
                  }}
                />
              </label>
              {item.iconUrl && (
                <button
                  onClick={() => {
                    const next = deepClone(story);
                    next.items.find((candidate) => candidate.id === item.id)!.iconUrl = undefined;
                    onUpdate(next);
                  }}
                  className="text-[8px] text-crimson hover:underline"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-type text-[9px] text-paper/35">{item.id}</span>
                <button
                  className="text-[9px] uppercase text-crimson hover:underline"
                  onClick={() => {
                    if (!window.confirm(`Delete ${item.name}? Existing gates will be flagged by Validator.`)) return;
                    const next = deepClone(story);
                    next.items = next.items.filter((candidate) => candidate.id !== item.id);
                    onUpdate(next);
                  }}
                >
                  delete
                </button>
              </div>
              <input
                className={inputCls}
                value={item.name}
                placeholder="Item name"
                onChange={(e) => {
                  const next = deepClone(story);
                  const it = next.items.find((x) => x.id === item.id)!;
                  it.name = e.target.value;
                  onUpdate(next);
                }}
              />
              <input
                className={inputCls}
                value={item.description}
                placeholder="Description"
                onChange={(e) => {
                  const next = deepClone(story);
                  const it = next.items.find((x) => x.id === item.id)!;
                  it.description = e.target.value;
                  onUpdate(next);
                }}
              />
              <label className="flex items-center gap-1 text-[9px] text-paper/40">
                <input
                  type="checkbox"
                  checked={!!item.isClue}
                  onChange={(e) => {
                    const next = deepClone(story);
                    const it = next.items.find((x) => x.id === item.id)!;
                    it.isClue = e.target.checked;
                    onUpdate(next);
                  }}
                />
                📌 is clue (appears on corkboard)
              </label>
              <div className="grid grid-cols-2 gap-1">
                <select
                  className={inputCls}
                  aria-label={`${item.name} combines with`}
                  value={item.combinableWith?.targetItemId ?? ""}
                  onChange={(e) => {
                    const next = deepClone(story);
                    const it = next.items.find((candidate) => candidate.id === item.id)!;
                    it.combinableWith = e.target.value
                      ? { targetItemId: e.target.value, resultItemId: it.combinableWith?.resultItemId ?? "" }
                      : undefined;
                    onUpdate(next);
                  }}
                >
                  <option value="">No recipe</option>
                  {story.items.filter((candidate) => candidate.id !== item.id).map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>+ {candidate.name}</option>
                  ))}
                </select>
                <select
                  className={inputCls}
                  aria-label={`${item.name} recipe result`}
                  disabled={!item.combinableWith?.targetItemId}
                  value={item.combinableWith?.resultItemId ?? ""}
                  onChange={(e) => {
                    const next = deepClone(story);
                    const it = next.items.find((candidate) => candidate.id === item.id)!;
                    if (it.combinableWith) it.combinableWith.resultItemId = e.target.value;
                    onUpdate(next);
                  }}
                >
                  <option value="">Result...</option>
                  {story.items.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={() => {
          const next = deepClone(story);
          next.items.push({
            id: `item_${uid()}`,
            name: "New Evidence",
            icon: "📜",
            description: "A newly discovered clue or prop.",
            flavorText: "Every mystery needs a fresh clue.",
            isClue: false,
          });
          onUpdate(next);
        }}
        className="w-full border border-cyan-neon/40 py-1.5 font-pulp text-[10px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/10"
      >
        ＋ Add new item
      </button>
    </div>
  );
}

function useSpeechVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  return voices;
}

/** Live preview of a character's talking keyframes — cycles them on a timer so
 *  the author can see the mouth/pose animation they're building. */
function TalkingPreview({
  frames,
  duration,
  media,
}: {
  frames: string[];
  duration: number;
  media: (v?: string) => string | undefined;
}) {
  const resolved = frames.map((f) => media(f) ?? f).filter(Boolean);
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
  }, [resolved.join("\u0000")]);
  useEffect(() => {
    if (resolved.length <= 1) return;
    const hold = Math.max(0.04, duration) * 1000;
    let cancelled = false;
    let timer: number | null = null;
    const step = () => {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        setI((v) => (v + 1) % resolved.length);
        step();
      }, hold);
    };
    step();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [resolved.length, duration]);
  if (!resolved.length) return <span className="font-type text-[9px] italic text-paper/35">No frames yet.</span>;
  return <img src={assetUrl(resolved[i])} alt="" className="h-24 w-auto max-w-full object-contain" />;
}

/** Global ElevenLabs settings for the Characters tab. The API key lives in
 *  localStorage only — never in the story data, saves, or exports. */
function AiVoiceSettings() {
  const [key, setKey] = useState(getElevenKey());
  const [model, setModel] = useState(getElevenModel());
  const desktop = isDesktop();
  const supported = voiceFolderSupported();
  const [folderName, setFolderName] = useState<string | null>(null);
  const [needsAuthorize, setNeedsAuthorize] = useState(false);

  // On load, re-discover a previously linked voice folder and whether it still
  // has write permission for this session.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    void (async () => {
      const handle = await loadPersistedVoiceFolder();
      if (cancelled || !handle) return;
      const perm = await (handle.queryPermission?.({ mode: "readwrite" }) ?? "prompt");
      if (cancelled) return;
      if (perm === "granted") {
        setFolderName(handle.name);
        setNeedsAuthorize(false);
      } else if (perm === "prompt") {
        setFolderName(handle.name);
        setNeedsAuthorize(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const link = async () => {
    try {
      const handle = await linkVoiceFolder();
      if (!handle) return;
      setFolderName(handle.name);
      setNeedsAuthorize(false);
    } catch {
      /* the author cancelled the folder picker — nothing to do */
    }
  };
  const reauthorize = async () => {
    const handle = await loadPersistedVoiceFolder();
    if (!handle) {
      setFolderName(null);
      return;
    }
    const perm = await requestVoiceFolderPermission(handle);
    if (perm === "granted") setNeedsAuthorize(false);
    else window.alert("Voice-folder access wasn't authorised — MP3s will stay in the browser until it is. Use the browser prompt to allow it.");
  };
  const unlink = async () => {
    await clearVoiceFolder();
    setFolderName(null);
    setNeedsAuthorize(false);
  };

  return (
    <CollapsibleSection id="ai-voice-settings" title="🎙 AI Voice (ElevenLabs)" titleClass="text-neon" defaultOpen={false}>
      <p className="font-type text-[9px] leading-relaxed text-paper/45">
        Generate individual dialogue lines as MP3s from your ElevenLabs account — one line at a time, with a
        credit-cost confirm before every conversion. Assign each character a voice ID below (copy it from the
        ElevenLabs console — stock or cloned), then use the <b className="text-paper/70">🎙 Generate MP3</b> button on
        any dialogue line in a scene's Beats tab.
      </p>
      <Field label="API key (xi-api-key…)">
        <input
          className={inputCls}
          type="password"
          value={key}
          placeholder="Paste your ElevenLabs API key"
          onChange={(e) => {
            const v = e.target.value.trim();
            setKey(v);
            setElevenKey(v);
          }}
        />
      </Field>
      <Field label="Model">
        <select
          className={inputCls}
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setElevenModel(e.target.value);
          }}
        >
          {ELEVENLABS_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
      </Field>
      {desktop ? (
        <p className="font-type text-[8px] leading-relaxed text-paper/45">
          <b className="text-neon">Where MP3s go:</b> saved automatically as real files —{" "}
          <code className="text-gold">public/voices/&lt;person&gt;/&lt;scene&gt;/&lt;line&gt;.mp3</code> in this
          checkout — so they're in the repo and you can git-commit them with the story.
        </p>
      ) : supported ? (
        <div className="space-y-1.5">
          <Field label="Voice folder — where the MP3 files are saved">
            <div className="flex flex-wrap items-center gap-2">
              {folderName ? (
                <span className={needsAuthorize ? "text-gold" : "text-neon"}>
                  📁 {folderName} {needsAuthorize ? "· needs re-authorise" : "· linked ✓"}
                </span>
              ) : (
                <span className="text-paper/40">not linked — MP3s would stay in the browser only</span>
              )}
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => void link()} className="btn-tool" title="Pick the repo's public/voices folder">
              📁 {folderName ? "Re-link folder…" : "Link public/voices folder…"}
            </button>
            {folderName && needsAuthorize && (
              <button onClick={() => void reauthorize()} className="btn-tool">
                Authorise access
              </button>
            )}
            {folderName && !needsAuthorize && (
              <button onClick={() => void unlink()} className="btn-tool">
                Unlink
              </button>
            )}
          </div>
          <p className="font-type text-[8px] leading-relaxed text-paper/35">
            Pick your repo's <code className="text-paper/60">public/voices</code> folder (create it first if
            missing). Each converted line is then written as a real file —{" "}
            <code className="text-paper/60">&lt;person&gt;/&lt;scene&gt;/&lt;line&gt;.mp3</code> — so it's in the
            repo and you can git-commit it. Without a linked folder the MP3 lives in this browser only.
          </p>
        </div>
      ) : (
        <p className="font-type text-[8px] leading-relaxed text-paper/45">
          <b className="text-gold">Where MP3s go:</b> this browser can't write files into the repo, so converted
          MP3s are kept in the browser's media library only (they export fine, but aren't in the repo). Use a
          Chromium browser with folder access, or the desktop app, to save them as committable files.
        </p>
      )}
      <p className="font-type text-[8px] text-paper/35">
        The key is stored in local browser/app storage only — it is never written into the story, saves, or
        exports. Match the model to your voices (v3 voices need Eleven v3).
      </p>
    </CollapsibleSection>
  );
}

function CharacterEditor({
  story,
  onUpdate,
  media,
}: {
  story: Story;
  onUpdate: (next: Story) => void;
  media: (v?: string) => string | undefined;
}) {
  const voices = useSpeechVoices();
  const [aiTestBusy, setAiTestBusy] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <h3 className="font-pulp text-[10px] uppercase tracking-widest text-gold">Characters (suspects/clues on board)</h3>
      <AiVoiceSettings />
      {story.characters.map((c) => (
        <div key={c.id} className="flex gap-2 border border-noir-600 p-1.5">
          <div className="flex w-16 shrink-0 flex-col items-center gap-1">
            <div className="h-14 w-14 overflow-hidden border border-gold/40 bg-noir-950">
              {c.avatarUrl.startsWith("emoji:") ? (
                <div className="flex h-full w-full items-center justify-center text-2xl">{c.avatarUrl.slice(6) || "👤"}</div>
              ) : (
                <img src={assetUrl(media(c.avatarUrl) ?? c.avatarUrl)} alt={c.name} className="h-full w-full object-cover" />
              )}
            </div>
            <label className="cursor-pointer border border-cyan-neon/40 px-1 py-0.5 text-center text-[8px] uppercase tracking-wider text-cyan-neon hover:bg-cyan-neon/10">
              Upload
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  try {
                    const resized = await resizeImageFile(file);
                    const result = await uploadDataUrlAsset(
                      story.id,
                      file.name.replace(/\.[^.]+$/, "") + ".jpg",
                      "image",
                      resized
                    );
                    if (!result.success || !result.assetId) {
                      window.alert(result.error ?? "Upload failed.");
                      return;
                    }
                    const next = deepClone(story);
                    next.characters.find((x) => x.id === c.id)!.avatarUrl = `asset:${result.assetId}`;
                    onUpdate(next);
                  } catch {
                    window.alert("That image could not be processed. Try JPG, PNG or WebP under 10 MB.");
                  }
                }}
              />
            </label>
            {!c.avatarUrl.startsWith("emoji:") && (
              <button
                className="text-[8px] uppercase text-crimson hover:underline"
                onClick={() => {
                  const next = deepClone(story);
                  next.characters.find((x) => x.id === c.id)!.avatarUrl = "emoji:👤";
                  onUpdate(next);
                }}
              >
                clear
              </button>
            )}
          </div>
          <div className="flex-1 space-y-0.5">
            <input
              className={inputCls}
              value={c.name}
              onChange={(e) => {
                const next = deepClone(story);
                const ch = next.characters.find((x) => x.id === c.id)!;
                ch.name = e.target.value;
                onUpdate(next);
              }}
            />
            <AssetDropdown
              storyId={story.id}
              assetType="image"
              value={c.avatarUrl.startsWith("data:") || c.avatarUrl.startsWith("asset:") ? c.avatarUrl : undefined}
              returnReference
              onChange={(url) => {
                const next = deepClone(story);
                next.characters.find((x) => x.id === c.id)!.avatarUrl = url ?? "emoji:👤";
                onUpdate(next);
              }}
              placeholder="Or pick uploaded portrait..."
            />
            <input
              className={inputCls}
              placeholder="Emoji fallback (e.g. 🎭) or image URL"
              value={c.avatarUrl.startsWith("emoji:") ? c.avatarUrl.slice(6) : mediaField(c.avatarUrl)}
              onChange={(e) => {
                const next = deepClone(story);
                const raw = e.target.value.trim();
                next.characters.find((x) => x.id === c.id)!.avatarUrl = raw
                  ? raw.startsWith("http") || raw.startsWith("/") || raw.startsWith("data:") || raw.startsWith("asset:")
                    ? raw
                    : `emoji:${raw}`
                  : "emoji:👤";
                onUpdate(next);
              }}
            />
            <input
              className={inputCls}
              value={c.role}
              placeholder="Role"
              onChange={(e) => {
                const next = deepClone(story);
                const ch = next.characters.find((x) => x.id === c.id)!;
                ch.role = e.target.value;
                onUpdate(next);
              }}
            />
            <label className="flex items-center gap-1 text-[9px] text-paper/45">
              <input
                type="checkbox"
                checked={story.deduction?.suspectIds.includes(c.id) ?? false}
                onChange={(e) => {
                  const next = deepClone(story);
                  next.deduction = next.deduction ?? { suspectIds: [], connections: [] };
                  if (e.target.checked && !next.deduction.suspectIds.includes(c.id)) next.deduction.suspectIds.push(c.id);
                  if (!e.target.checked) {
                    next.deduction.suspectIds = next.deduction.suspectIds.filter((id) => id !== c.id);
                    next.deduction.connections = next.deduction.connections.filter((link) => link.a !== c.id && link.b !== c.id);
                  }
                  onUpdate(next);
                }}
              />
              Show this met character on corkboard
            </label>
            <div className="space-y-1 border border-noir-600/60 p-1.5">
              <div className="font-pulp text-[8px] uppercase tracking-widest text-cyan-neon">🎙 Voice (Web Speech)</div>
              <select
                className={inputCls}
                value={c.voice?.voiceName ?? ""}
                onChange={(e) => {
                  const next = deepClone(story);
                  const ch = next.characters.find((x) => x.id === c.id)!;
                  ch.voice = { ...(ch.voice ?? {}), voiceName: e.target.value || undefined };
                  onUpdate(next);
                }}
              >
                <option value="">Auto (persona-based)</option>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-1">
                <label className="text-[8px] uppercase tracking-wider text-paper/45">
                  Pitch {c.voice?.pitch ?? 1}
                  <input
                    type="range" min={0.5} max={2} step={0.1}
                    value={c.voice?.pitch ?? 1}
                    className="w-full accent-pink-500"
                    onChange={(e) => {
                      const next = deepClone(story);
                      const ch = next.characters.find((x) => x.id === c.id)!;
                      ch.voice = { ...(ch.voice ?? {}), pitch: Number(e.target.value) };
                      onUpdate(next);
                    }}
                  />
                </label>
                <label className="text-[8px] uppercase tracking-wider text-paper/45">
                  Rate {c.voice?.rate ?? 0.9}
                  <input
                    type="range" min={0.5} max={1.5} step={0.05}
                    value={c.voice?.rate ?? 0.9}
                    className="w-full accent-pink-500"
                    onChange={(e) => {
                      const next = deepClone(story);
                      const ch = next.characters.find((x) => x.id === c.id)!;
                      ch.voice = { ...(ch.voice ?? {}), rate: Number(e.target.value) };
                      onUpdate(next);
                    }}
                  />
                </label>
              </div>
              <button
                onClick={() => audio.speak(`Well hello, detective. ${c.name} speaking — do I sound right to you?`, c.id, c.voice)}
                className="w-full border border-neon/40 py-1 font-pulp text-[8px] uppercase tracking-widest text-neon hover:bg-neon/10"
              >
                ▶ Test voice
              </button>
              <p className="font-type text-[8px] text-paper/35">Tip: per-line MP3 voice files can be set on each dialogue beat (Beats tab).</p>
            </div>
            <div className="space-y-1 border border-noir-600/60 p-1.5">
              <div className="font-pulp text-[8px] uppercase tracking-widest text-neon">🎙 Voice (ElevenLabs AI)</div>
              <input
                className={inputCls}
                placeholder="Voice ID — from the ElevenLabs console (stock or clone)"
                value={c.elevenVoiceId ?? ""}
                onChange={(e) => {
                  const next = deepClone(story);
                  const ch = next.characters.find((x) => x.id === c.id)!;
                  ch.elevenVoiceId = e.target.value.trim() || undefined;
                  onUpdate(next);
                }}
              />
              <button
                disabled={!c.elevenVoiceId || aiTestBusy === c.id}
                onClick={async () => {
                  if (!c.elevenVoiceId) return;
                  const sample = `Well hello, detective. ${c.name || "Mystery voice"} speaking — do I sound right to you?`;
                  if (!window.confirm(convertConfirmMessage(`${c.name} (sample line)`, c.elevenVoiceId, getElevenModel(), sample))) return;
                  setAiTestBusy(c.id);
                  try {
                    const { dataUrl } = await synthesizeElevenLabs(sample, c.elevenVoiceId, getElevenModel());
                    await new Audio(dataUrl).play();
                  } catch (err) {
                    window.alert((err as Error).message);
                  } finally {
                    setAiTestBusy(null);
                  }
                }}
                className="w-full border border-neon/40 py-1 font-pulp text-[8px] uppercase tracking-widest text-neon hover:bg-neon/10 disabled:opacity-40"
              >
                {aiTestBusy === c.id ? "Converting sample…" : "▶ Test AI voice (spends credits)"}
              </button>
            </div>

            <CollapsibleSection
              id={`char-talking-${c.id}`}
              title="🗣 Talking animation"
              hint={(c.talkingFrames?.length ?? 0) ? `${c.talkingFrames!.length} frames` : undefined}
              titleClass="text-cyan-neon"
            >
              <p className="font-type text-[9px] leading-relaxed text-paper/45">
                Sprite frames that auto-cycle as a portrait while {c.name || "this character"} speaks in any scene — the animated-while-talking look. Transparent PNGs work best; they appear in-game the moment a dialogue beat in their voice starts.
              </p>

              <div className="flex items-center gap-2 border border-noir-600 bg-noir-950 p-1">
                <div className="flex h-24 items-center justify-center">
                  <TalkingPreview frames={c.talkingFrames ?? []} duration={c.talkingFrameDuration ?? 0.16} media={media} />
                </div>
                <span className="font-type text-[9px] text-paper/40">Live preview — this is how it animates in-game while they speak.</span>
              </div>

              {/* ---- one-image sprite sheet (takes over from the keyframes while set) ---- */}
              <div className="space-y-1 border border-cyan-neon/30 bg-cyan-neon/5 p-2">
                <div className="font-pulp text-[9px] uppercase tracking-widest text-cyan-neon">🎞 Sprite-sheet portrait</div>
                <p className="font-type text-[9px] leading-snug text-paper/45">
                  One image holding all the mouth/pose frames in a grid instead of loose files. Name a
                  "talk" animation (plays while speaking) and a "rest" pose (held otherwise — a missing
                  "rest" holds talk frame 1). While a sheet is set it takes over from the keyframes below;
                  your keyframes stay saved and come back the moment you clear it. Position, scale and flip
                  still use the sliders below.
                </p>
                <SpriteSheetControls
                  value={c.talkingSheet}
                  storyId={story.id}
                  preset={TALKING_PRESET}
                  onChange={(sheet) => {
                    const next = deepClone(story);
                    next.characters.find((x) => x.id === c.id)!.talkingSheet = sheet;
                    onUpdate(next);
                  }}
                />
                {/* ---- alternate sheets: outfits / moods / poses ---- */}
                {(c.talkingSheet || (c.talkingSheets ?? []).length > 0) && (
                  <div className="mt-1 space-y-1 border border-purple-400/25 bg-purple-400/5 p-1.5">
                    <div className="font-pulp text-[9px] uppercase tracking-widest text-purple-300">🎭 Alternate sheets (outfits · moods · poses)</div>
                    <p className="font-type text-[8px] leading-snug text-paper/45">
                      Give a variant a name (e.g. <b>raincoat</b>, <b>furious</b>), then type that same name into a
                      dialogue beat's <b>expression</b> field — while this character speaks that beat, the variant's
                      sheet takes over. Every other beat uses the main sheet above.
                    </p>
                    {(c.talkingSheets ?? []).map((v, vi) => (
                      <div key={vi} className="space-y-1 border border-noir-700 p-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            className="flex-1 border border-noir-600 bg-noir-950 px-2 py-1 text-xs text-paper focus:border-purple-300 outline-none"
                            value={v.name}
                            placeholder="variant name (matches beat expression)…"
                            onChange={(e) => {
                              const next = deepClone(story);
                              next.characters.find((x) => x.id === c.id)!.talkingSheets![vi].name = e.target.value;
                              onUpdate(next);
                            }}
                          />
                          <button
                            className="shrink-0 border border-crimson/50 px-2 py-1 font-pulp text-[9px] uppercase text-crimson hover:bg-crimson/10"
                            onClick={() => {
                              const next = deepClone(story);
                              const ch = next.characters.find((x) => x.id === c.id)!;
                              ch.talkingSheets = (ch.talkingSheets ?? []).filter((_, j) => j !== vi);
                              if (!ch.talkingSheets.length) delete ch.talkingSheets;
                              onUpdate(next);
                            }}
                          >
                            ✕
                          </button>
                        </div>
                        <SpriteSheetControls
                          value={v.sheet}
                          storyId={story.id}
                          preset={TALKING_PRESET}
                          onChange={(sheet) => {
                            const next = deepClone(story);
                            const ch = next.characters.find((x) => x.id === c.id)!;
                            if (sheet) ch.talkingSheets![vi].sheet = sheet;
                            else {
                              ch.talkingSheets = (ch.talkingSheets ?? []).filter((_, j) => j !== vi);
                              if (!ch.talkingSheets.length) delete ch.talkingSheets;
                            }
                            onUpdate(next);
                          }}
                        />
                      </div>
                    ))}
                    <button
                      className="border border-purple-400/50 px-2 py-1 font-pulp text-[9px] uppercase tracking-widest text-purple-300 hover:bg-purple-400/10"
                      onClick={() => {
                        const next = deepClone(story);
                        const ch = next.characters.find((x) => x.id === c.id)!;
                        const seed = ch.talkingSheet ?? ch.talkingSheets?.[0]?.sheet;
                        if (!seed) return;
                        ch.talkingSheets = [
                          ...(ch.talkingSheets ?? []),
                          { name: `variant ${(ch.talkingSheets?.length ?? 0) + 1}`, sheet: deepClone(seed) },
                        ];
                        onUpdate(next);
                      }}
                    >
                      ＋ Add alternate sheet
                    </button>
                  </div>
                )}
              </div>

              <Field label="Resting pose (shown when they're on scene but NOT speaking)">
                <div className="flex gap-1">
                  <ImagePicker
                    storyId={story.id}
                    includeBuiltins
                    includeGradients={false}
                    value={c.talkingRest}
                    onChange={(url) => { const next = deepClone(story); next.characters.find((x) => x.id === c.id)!.talkingRest = url || undefined; onUpdate(next); }}
                    placeholder="Resting pose (optional)…"
                  />
                  <MediaUploadButton
                    storyId={story.id}
                    accept="image/*"
                    label="⇧"
                    onUploaded={(_u, assetId) => { const next = deepClone(story); next.characters.find((x) => x.id === c.id)!.talkingRest = `asset:${assetId}`; onUpdate(next); }}
                  />
                </div>
                {c.talkingRest && (
                  <button onClick={() => { const next = deepClone(story); next.characters.find((x) => x.id === c.id)!.talkingRest = undefined; onUpdate(next); }} className="mt-1 text-[8px] uppercase text-crimson hover:underline">✕ clear resting pose</button>
                )}
              </Field>

              <div className="space-y-1">
                {(c.talkingFrames ?? []).map((f, i) => (
                  <div key={i} className="flex items-center gap-1 border border-noir-700/60 p-1">
                    <span className="w-4 shrink-0 text-center font-pulp text-[10px] text-paper/50">{i + 1}</span>
                    <img src={assetUrl(media(f) ?? f)} alt="" className="h-10 w-10 shrink-0 object-contain border border-noir-600 bg-noir-950" />
                    <span className="min-w-0 flex-1 truncate font-type text-[9px] text-paper/45" title={f}>
                      {f.startsWith("asset:") ? "uploaded image" : f.startsWith("data:") ? "(embedded)" : (f.split("/").pop() ?? f)}
                    </span>
                    <button
                      className="px-1 text-[10px] text-paper/50 hover:text-gold disabled:opacity-25"
                      disabled={i === 0}
                      title="Move earlier"
                      onClick={() => {
                        const next = deepClone(story);
                        const ch = next.characters.find((x) => x.id === c.id)!;
                        const arr = [...(ch.talkingFrames ?? [])];
                        [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
                        ch.talkingFrames = arr;
                        onUpdate(next);
                      }}
                    >▲</button>
                    <button
                      className="px-1 text-[10px] text-paper/50 hover:text-gold disabled:opacity-25"
                      disabled={i === (c.talkingFrames?.length ?? 0) - 1}
                      title="Move later"
                      onClick={() => {
                        const next = deepClone(story);
                        const ch = next.characters.find((x) => x.id === c.id)!;
                        const arr = [...(ch.talkingFrames ?? [])];
                        [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
                        ch.talkingFrames = arr;
                        onUpdate(next);
                      }}
                    >▼</button>
                    <button
                      className="px-1 text-[10px] text-crimson hover:underline"
                      title="Remove this frame"
                      onClick={() => {
                        const next = deepClone(story);
                        const ch = next.characters.find((x) => x.id === c.id)!;
                        ch.talkingFrames = (ch.talkingFrames ?? []).filter((_, idx) => idx !== i);
                        onUpdate(next);
                      }}
                    >✕</button>
                  </div>
                ))}
              </div>

              <div className="flex gap-1">
                <ImagePicker
                  storyId={story.id}
                  includeBuiltins
                  includeGradients={false}
                  allowClear={false}
                  onChange={(url) => {
                    if (!url) return;
                    const next = deepClone(story);
                    const ch = next.characters.find((x) => x.id === c.id)!;
                    ch.talkingFrames = [...(ch.talkingFrames ?? []), url];
                    onUpdate(next);
                  }}
                  placeholder="＋ Pick a frame…"
                />
                <MediaUploadButton
                  storyId={story.id}
                  accept="image/*"
                  label="⇧ Upload"
                  onUploaded={(_u, assetId) => {
                    const next = deepClone(story);
                    const ch = next.characters.find((x) => x.id === c.id)!;
                    ch.talkingFrames = [...(ch.talkingFrames ?? []), `asset:${assetId}`];
                    onUpdate(next);
                  }}
                />
              </div>

              {/* Live preview over the opening scene — drag to place, corner-drag to resize. */}
              <SpriteBoxEditor
                mode="talking"
                backgroundUrl={(() => {
                  const bg = story.scenes.find((s) => s.id === story.startSceneId)?.background;
                  return bg ? media(bg) ?? bg : undefined;
                })()}
                image={(() => {
                  const f = c.talkingRest ?? (c.talkingFrames ?? []).find(Boolean);
                  return f ? media(f) ?? f : undefined;
                })()}
                sheet={c.talkingSheet}
                resolve={media}
                x={c.talkingX ?? 50}
                y={c.talkingY ?? 0}
                scale={c.talkingScale ?? 1}
                flip={!!c.talkingFlip}
                onChange={(p) => {
                  const next = deepClone(story);
                  const ch = next.characters.find((x) => x.id === c.id)!;
                  if (p.x !== undefined) ch.talkingX = p.x;
                  if (p.y !== undefined) ch.talkingY = p.y;
                  if (p.scale !== undefined) ch.talkingScale = p.scale;
                  onUpdate(next);
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field label={`Position X ${c.talkingX ?? 50}%`}>
                  <input type="range" min={0} max={100} step={1} className="w-full accent-pink-500" value={c.talkingX ?? 50}
                    onChange={(e) => { const next = deepClone(story); next.characters.find((x) => x.id === c.id)!.talkingX = Number(e.target.value); onUpdate(next); }} />
                </Field>
                <Field label={`Vertical ${c.talkingY ?? 0}%`}>
                  <input type="range" min={0} max={60} step={1} className="w-full accent-pink-500" value={c.talkingY ?? 0}
                    onChange={(e) => { const next = deepClone(story); next.characters.find((x) => x.id === c.id)!.talkingY = Number(e.target.value); onUpdate(next); }} />
                </Field>
                <Field label={`Scale ${(c.talkingScale ?? 1).toFixed(2)}×`}>
                  <input type="range" min={0.3} max={2} step={0.05} className="w-full accent-pink-500" value={c.talkingScale ?? 1}
                    onChange={(e) => { const next = deepClone(story); next.characters.find((x) => x.id === c.id)!.talkingScale = Number(e.target.value); onUpdate(next); }} />
                </Field>
                <Field label={`Frame time ${(c.talkingFrameDuration ?? 0.16).toFixed(2)}s`}>
                  <input type="range" min={0.04} max={0.6} step={0.02} className="w-full accent-pink-500" value={c.talkingFrameDuration ?? 0.16}
                    onChange={(e) => { const next = deepClone(story); next.characters.find((x) => x.id === c.id)!.talkingFrameDuration = Number(e.target.value); onUpdate(next); }} />
                </Field>
                <Field label={`Visibility when NOT speaking ${Math.round((c.talkingDim ?? 0.72) * 100)}% (100% = never fades)`}>
                  <input type="range" min={0.2} max={1} step={0.02} className="w-full accent-pink-500" value={c.talkingDim ?? 0.72}
                    onChange={(e) => {
                      const next = deepClone(story);
                      next.characters.find((x) => x.id === c.id)!.talkingDim = Number(e.target.value);
                      onUpdate(next);
                    }} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-[9px] text-paper/55">
                <input type="checkbox" checked={!!c.talkingFlip} onChange={(e) => { const next = deepClone(story); next.characters.find((x) => x.id === c.id)!.talkingFlip = e.target.checked || undefined; onUpdate(next); }} />
                Mirror horizontally (face left) — pair with Position X so two speakers face each other
              </label>
              <p className="font-type text-[9px] text-paper/40">Cast: anyone who speaks in a scene appears here. Give characters different X positions (and mirror one) so they can face each other across the frame; the active speaker animates while the others hold their resting pose.</p>
            </CollapsibleSection>
          </div>
        </div>
      ))}
      <button
        onClick={() => {
          const next = deepClone(story);
          next.characters.push({ id: `ch_${uid()}`, name: "New Suspect", role: "Unknown", avatarUrl: "emoji:👤", trustMeter: 0 });
          onUpdate(next);
        }}
        className="w-full border border-cyan-neon/40 py-1.5 font-pulp text-[10px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/10"
      >
        ＋ Add character (suspect for board)
      </button>
    </div>
  );
}

/** Multi-flag picker. Selected flags render as removable chips, and typing
 * shows a dropdown (datalist) of every flag already defined in the story, so
 * authors can reuse names instead of re-typing them — the dropdown is how you
 * keep track of which flags exist. */
function FlagPicker({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value?: string[];
  onChange: (v: string[] | undefined) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = useRef(`flags-${uid()}`).current;
  const current = value ?? [];
  const available = (suggestions ?? []).filter((f) => !current.includes(f));

  const commitDraft = () => {
    const tokens = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (!tokens.length) {
      setDraft("");
      return;
    }
    const merged = [...current];
    for (const t of tokens) if (!merged.includes(t)) merged.push(t);
    onChange(merged.length ? merged : undefined);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border border-noir-600 bg-noir-950 px-2 py-1 focus-within:border-neon">
      {current.map((f) => (
        <span key={f} className="flex items-center gap-1 border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-[10px] leading-none text-gold" title={f}>
          <span className="max-w-[160px] truncate">{f}</span>
          <button
            type="button"
            onClick={() => onChange(current.filter((x) => x !== f).length ? current.filter((x) => x !== f) : undefined)}
            className="text-crimson hover:text-white"
            aria-label={`Remove flag ${f}`}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        className="min-w-[110px] flex-1 bg-transparent py-0.5 text-xs text-paper outline-none placeholder:text-paper/30"
        list={listId}
        value={draft}
        placeholder={placeholder ?? "type or pick a flag…"}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commitDraft();
          } else if (e.key === "Backspace" && !draft && current.length) {
            onChange(current.slice(0, -1).length ? current.slice(0, -1) : undefined);
          }
        }}
        onBlur={commitDraft}
      />
      {available.length > 0 && (
        <datalist id={listId}>
          {available.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      )}
    </div>
  );
}

/** Compact editor for a contradiction's outcome consequences: one heat
 * delta, one trust swing against the scene speaker, and any set flags. */
function LieConsequences({
  lie,
  field,
  story,
  onChange,
}: {
  lie: Contradiction;
  field: "contradictedConsequences" | "wrongConsequences";
  story: Story;
  onChange: (cons: Consequences | undefined) => void;
}) {
  const cons = lie[field];
  const setCons = (next: Consequences) => onChange(Object.values(next).some((v) => Array.isArray(v) && v.length) ? next : undefined);
  const heat = cons?.meterChanges?.find((m) => m.meter === "Suspicion")?.delta ?? 0;
  const trust = cons?.trustChanges?.[0]?.delta ?? 0;
  const trustChar = cons?.trustChanges?.[0]?.characterId ?? story.characters[0]?.id ?? "";
  const setHeat = (v: number) => {
    const list = (cons?.meterChanges ?? []).filter((m) => m.meter !== "Suspicion");
    if (v !== 0) list.push({ meter: "Suspicion", delta: v });
    setCons({ ...cons, meterChanges: list.length ? list : undefined });
  };
  const setTrust = (v: number) => {
    const list = (cons?.trustChanges ?? []).filter((t) => t.characterId !== trustChar);
    if (v !== 0) list.push({ characterId: trustChar, delta: v });
    setCons({ ...cons, trustChanges: list.length ? list : undefined });
  };
  return (
    <div className="space-y-1">
      <input
        type="number"
        className={inputCls}
        placeholder="Heat delta (e.g. -1 catch / +2 bluff)"
        value={heat || ""}
        onChange={(e) => setHeat(Number(e.target.value) || 0)}
      />
      <div className="flex gap-1">
        <select
          className={`${inputCls} w-24`}
          value={trustChar}
          onChange={(e) => {
            const list = (cons?.trustChanges ?? []).map((t) => ({ ...t, characterId: e.target.value }));
            setCons({ ...cons, trustChanges: list.length ? list : undefined });
          }}
        >
          {story.characters.map((c) => (
            <option key={c.id} value={c.id}>{c.name.split(" ")[0]}</option>
          ))}
        </select>
        <input
          type="number"
          className={inputCls}
          placeholder="Trust delta"
          value={trust || ""}
          onChange={(e) => setTrust(Number(e.target.value) || 0)}
        />
      </div>
      <FlagPicker
        value={cons?.setFlags}
        suggestions={[]}
        onChange={(v) => setCons({ ...cons, setFlags: v })}
        placeholder="set flag…"
      />
    </div>
  );
}

/** Single-flag input with a dropdown of every known flag in the story. */
function FlagInput({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value?: string;
  onChange: (v: string | undefined) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const listId = useRef(`flaginput-${uid()}`).current;
  const available = (suggestions ?? []).filter((f) => f !== value);
  return (
    <>
      <input
        className={inputCls}
        list={listId}
        value={value ?? ""}
        placeholder={placeholder ?? "set a flag…"}
        onChange={(e) => onChange(e.target.value || undefined)}
      />
      {available.length > 0 && (
        <datalist id={listId}>
          {available.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      )}
    </>
  );
}

function MeterGrid({
  value,
  onChange,
  label,
}: {
  value?: Partial<Record<MeterKey, number>>;
  onChange: (v: Partial<Record<MeterKey, number>> | undefined) => void;
  label: string;
}) {
  return (
    <Field label={label}>
      <div className="grid grid-cols-4 gap-1">
        {METERS.map((m) => (
          <input
            key={m}
            type="number"
            title={METER_LABELS[m]}
            placeholder={METER_SHORT[m]}
            className={inputCls}
            value={value?.[m] ?? ""}
            onChange={(e) => {
              const next = { ...(value ?? {}) };
              if (e.target.value === "") delete next[m];
              else next[m] = Number(e.target.value);
              onChange(Object.keys(next).length ? next : undefined);
            }}
          />
        ))}
      </div>
    </Field>
  );
}

function GatingEditor({
  gating,
  onChange,
  items = [],
  characters = [],
  flags = [],
  memoryTags = [],
  sectionId,
}: {
  gating?: Gating;
  onChange: (g: Gating | undefined) => void;
  items?: Item[];
  characters?: Character[];
  flags?: string[];
  /** Choice.memoryLog tags — the dropdown source for requiresMemories. */
  memoryTags?: string[];
  /** Unique id for this gate's own collapsible section (e.g. `beat-<id>`). */
  sectionId: string;
}) {
  const g = gating ?? {};
  const set = (patch: Partial<Gating>) => {
    const next = { ...g, ...patch };
    const empty =
      !next.requiresItems?.length &&
      !next.requiresFlags?.length &&
      !next.excludesItems?.length &&
      !next.excludesFlags?.length &&
      !next.requiresMemories?.length &&
      !next.minMeters &&
      !next.maxMeters &&
      !next.minTrust &&
      next.requiresAll === undefined;
    onChange(empty ? undefined : next);
  };
  const isActive =
    !!g.requiresItems?.length ||
    !!g.requiresFlags?.length ||
    !!g.excludesItems?.length ||
    !!g.excludesFlags?.length ||
    !!g.requiresMemories?.length ||
    !!g.minMeters ||
    !!g.maxMeters ||
    !!g.minTrust;
  return (
    <CollapsibleSection
      id={`gating-${sectionId}`}
      title="🔒 Gating rules"
      hint={isActive ? "active" : "none set"}
      titleClass="text-crimson"
    >
      <p className="border border-cyan-neon/20 bg-cyan-neon/5 p-2 font-type text-[9px] leading-snug text-paper/65">
        <b className="text-cyan-neon">What do these rules do?</b> A choice or hotspot is only offered when every gating rule is satisfied.
        Meters track the player's <b className="text-neon">Charm</b> (smooth-talking), <b className="text-crimson">Intimidate</b> (force),
        <b className="text-cyan-neon"> Deduce</b> (insight), and <b className="text-gold">Heat</b> (suspicion). They rise from
        choices tagged with that attitude. Use <b>Min meters</b> to require e.g. Charm 3+, or <b>Max meters</b> to lock out
        options once Heat gets too high. Use <b>Requires items/flags</b> for concrete story evidence.
      </p>
      <Field label="Requires item (player must be holding this)">
        <select
          className={inputCls}
          value={g.requiresItems?.[0] ?? ""}
          onChange={(e) => set({ requiresItems: e.target.value ? [e.target.value] : undefined })}
        >
          <option value="">— no required item —</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>{item.icon} {item.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Requires flags (from previous choices/hotspots)">
        <FlagPicker value={g.requiresFlags} onChange={(v) => set({ requiresFlags: v })} suggestions={flags} />
      </Field>
      <Field label="Remembers (memory tag OR flag — the player made that choice, or that flag is set)">
        <FlagPicker value={g.requiresMemories} onChange={(v) => set({ requiresMemories: v })} suggestions={memoryTags} placeholder="pick a memory tag or flag…" />
      </Field>
      <div className="grid grid-cols-2 gap-1">
        <Field label="Excludes item">
          <select
            className={inputCls}
            value={g.excludesItems?.[0] ?? ""}
            onChange={(e) => set({ excludesItems: e.target.value ? [e.target.value] : undefined })}
          >
            <option value="">— none —</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>{item.icon} {item.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Excludes flags">
          <FlagPicker value={g.excludesFlags} onChange={(v) => set({ excludesFlags: v })} suggestions={flags} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/60">
        <input
          type="checkbox"
          checked={g.requiresAll !== false}
          onChange={(e) => set({ requiresAll: e.target.checked ? undefined : false })}
        />
        require ALL (unchecked = ANY satisfies)
      </label>
      <div className="border-t border-noir-700 pt-1">
        <MeterGrid
          label="Min meters — player must have AT LEAST this much (Charm/Intimidate/Deduce/Heat)"
          value={g.minMeters}
          onChange={(v) => set({ minMeters: v })}
        />
        <MeterGrid
          label="Max meters — player must have AT MOST this much"
          value={g.maxMeters}
          onChange={(v) => set({ maxMeters: v })}
        />
        <p className="mt-1 font-type text-[9px] text-paper/40">
          Meters go 0-10. To make a choice require a smooth opener: set Min meters → Charm 3. To hide a choice under too much heat: Max meters → Heat 3.
        </p>
      </div>
      {characters.length > 0 && (
        <div className="border-t border-noir-700 pt-1">
          <Field label="Minimum trust — a character must trust you this much before this unlocks (-5…+5)">
            <div className="grid grid-cols-2 gap-1">
              {characters.map((ch) => {
                const cur = g.minTrust?.[ch.id] ?? "";
                return (
                  <label key={ch.id} className="flex items-center gap-1 text-[9px] text-paper/60">
                    <span className="w-16 truncate">{ch.name.split(" ")[0]}</span>
                    <input
                      type="number"
                      className={inputCls}
                      value={cur}
                      onChange={(e) => {
                        const next = { ...(g.minTrust ?? {}) };
                        if (e.target.value === "") delete next[ch.id];
                        else next[ch.id] = Number(e.target.value);
                        set({ minTrust: Object.keys(next).length ? next : undefined });
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </Field>
        </div>
      )}
    </CollapsibleSection>
  );
}

/* ------------------------------------------------------------------ */
/*  hotspot drawer preview                                             */
/* ------------------------------------------------------------------ */

function HotspotCanvas({
  scene,
  items = [],
  selectedId,
  onSelect,
  onDraw,
  media,
  barrierMode,
  barriers = [],
  selectedBarrier,
  onBarrierSelect,
  onBarrierDraw,
  spawn,
  spawnMode,
  onSpawnMove,
  player,
}: {
  scene: SceneNode;
  items?: Item[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDraw: (bounds: { x: number; y: number; w: number; h: number }) => void;
  media: (v?: string) => string | undefined;
  /** Draw NO-GO BARRIERS instead of hotspots (🚶 stage rooms). */
  barrierMode?: boolean;
  /** The room's no-go rectangles, always shown faintly as context. */
  barriers?: { x: number; y: number; w: number; h: number }[];
  selectedBarrier?: number | null;
  onBarrierSelect?: (i: number | null) => void;
  onBarrierDraw?: (bounds: { x: number; y: number; w: number; h: number }) => void;
  /** 🚶 where the player character starts (scene %), drawn on the plate. */
  spawn?: { x: number; y: number };
  /** Dragging on the plate moves the player instead of drawing a box. */
  spawnMode?: boolean;
  onSpawnMove?: (p: { x: number; y: number }) => void;
  /** The walker art, so the marker is the actual character. */
  player?: { image?: string; sheet?: import("./../game/spriteSheet").SpriteSheet; scale?: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const floorBand = scene.stage?.floor;
  const onBarrierDrawRef = useRef(onBarrierDraw);
  onBarrierDrawRef.current = onBarrierDraw;
  const onSpawnMoveRef = useRef(onSpawnMove);
  onSpawnMoveRef.current = onSpawnMove;

  const pct = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };

  return (
    <div
      ref={ref}
      className="relative aspect-video w-full cursor-crosshair overflow-hidden border border-noir-600"
      style={bgStyle(media(scene.background) ?? scene.background)}
      onPointerMove={(e) => {
        if (!start.current) return;
        const p = pct(e);
        // 🚶 player start: dragging moves the character (clamped to the floor
        // band, because that's where they can actually stand).
        if (spawnMode) {
          onSpawnMoveRef.current?.({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
          return;
        }
        setDraft({
          x: Math.min(start.current.x, p.x),
          y: Math.min(start.current.y, p.y),
          w: Math.abs(p.x - start.current.x),
          h: Math.abs(p.y - start.current.y),
        });
      }}
      onPointerDown={(e) => {
        // In spawn mode a plain click places the character too.
        if (spawnMode && !(e.target as HTMLElement).dataset.bar && !(e.target as HTMLElement).dataset.hs) {
          start.current = pct(e);
          onSpawnMoveRef.current?.({ x: Math.round(start.current.x * 10) / 10, y: Math.round(start.current.y * 10) / 10 });
          return;
        }
        if ((e.target as HTMLElement).dataset.hs) return;
        if ((e.target as HTMLElement).dataset.bar) return;
        start.current = pct(e);
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerUp={() => {
        if (spawnMode) {
          start.current = null;
          setDraft(null);
          return;
        }
        if (draft && draft.w > 2 && draft.h > 2) {
          const bounds = {
            x: Math.round(draft.x * 10) / 10,
            y: Math.round(draft.y * 10) / 10,
            w: Math.round(draft.w * 10) / 10,
            h: Math.round(draft.h * 10) / 10,
          };
          if (barrierMode) onBarrierDrawRef.current?.(bounds);
          else onDraw(bounds);
        }
        start.current = null;
        setDraft(null);
      }}
    >
      {scene.background.startsWith("video:") && (
        <video
          src={assetBackground(media(scene.background) ?? scene.background).slice(6)}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          muted
          loop
          autoPlay
        />
      )}
      {/* the walkable floor band — where the character may stand, and so
          where a barrier actually means something */}
      {floorBand ? (
        <div
          className="pointer-events-none absolute inset-x-0 border-y border-dashed border-cyan-neon/40 bg-cyan-neon/5"
          style={{ top: `${floorBand.top}%`, height: `${Math.max(0, floorBand.bottom - floorBand.top)}%` }}
        >
          <span className="absolute left-1 top-0 font-pulp text-[7px] uppercase tracking-widest text-cyan-neon/70">walkable floor</span>
        </div>
      ) : null}
      {/* 🚶 THE PLAYER — where they start. Bright and named in spawn mode,
          a ghost in the other modes so you can place things around them. */}
      {spawn ? (
        <div
          className={`pointer-events-none absolute flex flex-col items-center ${spawnMode ? "" : "opacity-40"}`}
          style={{ left: `${spawn.x}%`, top: `${spawn.y}%`, transform: "translate(-50%,-100%)", height: "28%" }}
          title="Player start"
        >
          {player && sheetDrawable(player.sheet) ? (
            <SheetSprite sheet={player.sheet!} anim="idle" fallbacks={["walk", "loop"]} height="100%" freezeOnFallback />
          ) : player?.image ? (
            <img src={assetUrl(media(player.image) ?? player.image)} alt="" className="h-full w-auto object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]" />
          ) : (
            <span className="text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.7)]">🚶</span>
          )}
          <span className={`mt-0.5 whitespace-nowrap font-pulp text-[7px] uppercase tracking-widest ${spawnMode ? "text-cyan-neon" : "text-paper/60"}`}>
            {spawnMode ? "🚶 player start — drag to move" : "🚶 start"}
          </span>
        </div>
      ) : null}
      {/* NO-GO BARRIERS — hatched crimson. Click to select (then redraw to
          reshape); visible in both modes because they place the hotspots. */}
      {barriers.map((b, bi) => (
        <button
          key={`bar-${bi}`}
          data-bar="1"
          onClick={() => {
            onBarrierSelect?.(selectedBarrier === bi ? null : bi);
            onSelect("");
          }}
          className={`absolute border-2 ${selectedBarrier === bi ? "border-crimson" : barrierMode ? "border-crimson/70" : "border-crimson/25"} text-[8px] uppercase tracking-wider text-crimson`}
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: `${b.w}%`,
            height: `${b.h}%`,
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(226,59,78,0.35) 0 6px, rgba(226,59,78,0.08) 6px 12px)",
          }}
          title={`No-go barrier ${bi + 1} — click to select, then drag a new box to reshape`}
        >
          <span className="absolute left-1 top-0.5 truncate">{barrierMode || selectedBarrier === bi ? "🚧 no-go" : ""}</span>
        </button>
      ))}
      {(scene.hotspots ?? []).map((h) => {
        const grantedItem = h.showItemImage && h.action.itemGranted ? items.find((i) => i.id === h.action.itemGranted) : undefined;
        return (
          <button
            key={h.id}
            data-hs="1"
            onClick={() => onSelect(h.id)}
            className={`absolute border-2 text-[8px] uppercase tracking-wider ${
              selectedId === h.id ? "border-neon bg-neon/20 text-neon" : "border-gold/70 bg-gold/10 text-gold"
            } ${barrierMode ? "pointer-events-none opacity-40" : ""}`}
            style={{ left: `${h.bounds.x}%`, top: `${h.bounds.y}%`, width: `${h.bounds.w}%`, height: `${h.bounds.h}%` }}
            title={h.label}
          >
            {h.image ? (
              <>
                <img
                  src={assetUrl(media(h.image) ?? h.image)}
                  alt=""
                  className={`pointer-events-none absolute inset-0 ${
                    h.imageFit === "cover" ? "h-full w-full object-cover" : "m-auto max-h-full max-w-full object-contain"
                  }`}
                />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-noir-950/75 px-1 py-0.5 text-[7px]">
                  {h.label}
                </span>
              </>
            ) : grantedItem ? (
              grantedItem.iconUrl ? (
                <img src={assetUrl(media(grantedItem.iconUrl) ?? grantedItem.iconUrl)} alt={grantedItem.name} className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain" />
              ) : (
                <span className="pointer-events-none text-xl">{grantedItem.icon}</span>
              )
            ) : (
              h.label.slice(0, 12)
            )}
          </button>
        );
      })}
      {draft && (
        <div
          className={`absolute border-2 border-dashed ${barrierMode ? "border-crimson bg-crimson/10" : "border-cyan-neon bg-cyan-neon/10"}`}
          style={{ left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%` }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  simulated playtester                                               */
/* ------------------------------------------------------------------ */

function Playtester({ story, scene }: { story: Story; scene: SceneNode | null }) {
  const flags = useMemo(() => collectFlags(story), [story]);
  const memoryTags = useMemo(() => collectMemoryTags(story), [story]);
  const [on, setOn] = useState<Set<string>>(new Set());
  const [items, setItems] = useState<Set<string>>(new Set());
  const [meters, setMeters] = useState<Record<MeterKey, number>>({ Sultry: 0, Aggressive: 0, Clever: 0, Suspicion: 0 });
  const [trust, setTrust] = useState<Record<string, number>>({});
  const [mems, setMems] = useState<Record<string, string>>({});

  const sim: GlobalState = useMemo(
    () => ({
      activeFlags: on,
      inventory: story.items.filter((i) => items.has(i.id)),
      meters,
      characterTrust: trust,
      memories: mems,
    }),
    [on, items, meters, trust, mems, story.items]
  );

  const toggle = (set: Set<string>, v: string, fn: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    fn(next);
  };

  return (
    <div className="space-y-3 text-xs">
      <p className="font-type text-paper/60">Fake the world state, then see what a live player could actually reach in this scene.</p>
      <div>
        <div className="font-pulp text-[9px] uppercase tracking-widest text-gold mb-1">Flags</div>
        <div className="flex flex-wrap gap-1">
          {flags.map((f) => (
            <button
              key={f}
              onClick={() => toggle(on, f, setOn)}
              className={`border px-1.5 py-0.5 text-[9px] ${on.has(f) ? "border-gold bg-gold/20 text-gold" : "border-noir-600 text-paper/50"}`}
            >
              {f}
            </button>
          ))}
          {!flags.length && <span className="text-paper/40">no flags in story</span>}
        </div>
      </div>
      <div>
        <div className="font-pulp text-[9px] uppercase tracking-widest text-gold mb-1">Inventory</div>
        <div className="flex flex-wrap gap-1">
          {story.items.map((i) => (
            <button
              key={i.id}
              onClick={() => toggle(items, i.id, setItems)}
              className={`border px-1.5 py-0.5 text-[9px] ${items.has(i.id) ? "border-cyan-neon bg-cyan-neon/15 text-cyan-neon" : "border-noir-600 text-paper/50"}`}
            >
              {i.icon} {i.id}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="font-pulp text-[9px] uppercase tracking-widest text-gold mb-1">Meters</div>
        {METERS.map((m) => (
          <label key={m} className="flex items-center gap-2 text-[10px] text-paper/60">
            <span className="w-20">{METER_LABELS[m]}</span>
            <input
              type="range"
              min={0}
              max={10}
              value={meters[m]}
              onChange={(e) => setMeters((s) => ({ ...s, [m]: Number(e.target.value) }))}
              className="flex-1 accent-pink-500"
            />
            <span className="w-4 text-right">{meters[m]}</span>
          </label>
        ))}
      </div>
      <div>
        <div className="font-pulp text-[9px] uppercase tracking-widest text-gold mb-1">Trust</div>
        {story.characters.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-[10px] text-paper/60">
            <span className="w-20 truncate">{c.name}</span>
            <input
              type="range"
              min={-5}
              max={5}
              value={trust[c.id] ?? 0}
              onChange={(e) => setTrust((s) => ({ ...s, [c.id]: Number(e.target.value) }))}
              className="flex-1 accent-pink-500"
            />
            <span className="w-4 text-right">{trust[c.id] ?? 0}</span>
          </label>
        ))}
      </div>
      <div>
        <div className="font-pulp text-[9px] uppercase tracking-widest text-gold mb-1">Memories</div>
        <div className="flex flex-wrap gap-1">
          {memoryTags.map((tag) => (
            <button
              key={tag}
              onClick={() =>
                setMems((s) => {
                  const next = { ...s };
                  if (next[tag] != null) delete next[tag];
                  else next[tag] = `“${tag}”`;
                  return next;
                })
              }
              className={`border px-1.5 py-0.5 text-[9px] ${mems[tag] != null ? "border-gold bg-gold/20 text-gold" : "border-noir-600 text-paper/50"}`}
            >
              {tag}
            </button>
          ))}
          {!memoryTags.length && <span className="text-paper/40">no memoryLog tags in story</span>}
        </div>
      </div>
      <div className="border-t border-noir-600 pt-2">
        <div className="font-pulp text-[9px] uppercase tracking-widest text-neon mb-1">
          Live check — {scene ? scene.title : "select a scene node"}
        </div>
        {scene && (
          <ul className="space-y-1">
            {(scene.choices ?? []).map((c) => {
              const ok = meetsGating(effectiveChoiceGating(c), sim);
              return (
                <li key={c.id} className={ok ? "text-emerald-400" : "text-crimson"}>
                  {ok ? "✔" : "✖"} choice: {c.text.slice(0, 46)}
                </li>
              );
            })}
            {(scene.hotspots ?? []).map((h) => {
              const ok = meetsGating(h.gating, sim);
              return (
                <li key={h.id} className={ok ? "text-emerald-400" : "text-crimson"}>
                  {ok ? "✔" : "✖"} hotspot: {h.label}
                </li>
              );
            })}
            {(scene.dialogueBeats ?? []).map((b) => {
              const ok = meetsGating(b.conditionRule, sim);
              return (
                <li key={b.id} className={ok ? "text-emerald-400/70" : "text-paper/35"}>
                  {ok ? "💬" : "🚫"} beat: {b.text.slice(0, 44)}…
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="border-t border-noir-600 pt-2">
        <div className="font-pulp text-[9px] uppercase tracking-widest text-gold mb-1">Relationships (Trust + flags)</div>
        {story.characters.length ? (
          <div className="space-y-1">
            {story.characters.map((c) => {
              const op = characterOpinion(c, trust[c.id] ?? c.trustMeter, on);
              const col =
                op.sentiment === "devoted" || op.sentiment === "trusting"
                  ? "text-emerald-400"
                  : op.sentiment === "warming"
                    ? "text-gold"
                    : op.sentiment === "hostile" || op.sentiment === "terrified"
                      ? "text-crimson"
                      : "text-paper/60";
              return (
                <div key={c.id} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="truncate text-paper/70">{c.name.split(" ")[0]}</span>
                  <span className={`${col} text-right`}>{op.line}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="font-type text-[10px] text-paper/40">No characters yet — add some in the Characters tab to see relationship opinions.</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  main studio                                                        */
/* ------------------------------------------------------------------ */

function StudioInner({
  baseStories,
  initialStoryId,
  initialSceneId,
  onExit,
  onPlay,
  onPublish,
  onDeleteStory,
  onCreateStory,
  onUpdateTitleTheme,
}: {
  baseStories: Story[];
  /** open on this story (e.g. "edit this scene in Studio" from the game) */
  initialStoryId?: string;
  /** and select this scene once open */
  initialSceneId?: string;
  onExit: () => void;
  onPlay: (story: Story, opts?: { fromSceneId?: string }) => void;
  onPublish: (story: Story) => boolean;
  onDeleteStory: (storyId: string, deleteMedia?: boolean) => boolean;
  onCreateStory: (story: Story) => boolean;
  onUpdateTitleTheme: (theme: TitleTheme) => void;
}) {
  const loadDraft = (id: string): Story => {
    try {
      const raw = localStorage.getItem(draftKey(id));
      if (raw) {
        const stored = JSON.parse(raw) as Story;
        const base = baseStories.find((s) => s.id === id);
        // Self-heal the canvas layout. Two failure modes are repaired:
        //   1. MISSING positions (a draft saved before the story had a
        //      layout, or before scenes were added) — cards stack at origin.
        //   2. PILED positions (many scenes sharing one coordinate) — a
        //      corrupt or hand-wrecked draft.
        // The built-in layout is the floor; the author's own distinct drags
        // always win. Nobody loses real work, but the graph always opens
        // readable instead of as one pile of cards.
        if (base?.layout && stored.scenes?.length) {
          stored.layout = healLayout(stored.layout, base.layout);
        }
        return stored;
      }
    } catch {
      /* ignore */
    }
    return deepClone(baseStories.find((s) => s.id === id) ?? baseStories[0]);
  };

  const createBlankStory = (): Story => {
    const id = `case_${uid()}`;
    return {
      id,
      title: "Untitled Case",
      tagline: "A new mystery waits in the dark.",
      coverImage: "gradient:linear-gradient(160deg,#07111e 0%,#1d0c22 55%,#07070c 100%)",
      startSceneId: "",
      scenes: [],
      items: [],
      characters: [],
      layout: {},
      briefing: {
        objective: "Define the mystery your detective must solve.",
        winConditions: [],
        loseConditions: [],
      },
    };
  };

  const [story, setStory] = useState<Story>(() => {
    // Studio reopens the last story you were editing (its draft, or the
    // built-in copy if there's no draft). If that story was deleted in the
    // meantime, fall back to the first case in the catalogue.
    let lastId: string | null = null;
    try {
      lastId = localStorage.getItem("scarlet-studio-last-story");
    } catch {
      /* storage unavailable — open the first story as before */
    }
    const openId =
      initialStoryId && baseStories.some((s) => s.id === initialStoryId)
        ? initialStoryId
        : lastId && baseStories.some((s) => s.id === lastId)
          ? lastId
          : baseStories[0].id;
    return loadDraft(openId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });
  // Remember which story is being edited so the next session reopens it.
  useEffect(() => {
    try {
      localStorage.setItem("scarlet-studio-last-story", story.id);
    } catch {
      /* storage unavailable — this session only */
    }
  }, [story.id]);
  const past = useRef<Story[]>([]);
  const future = useRef<Story[]>([]);
  const [, forceTick] = useState(0);
  // "Edit this scene in Studio" arrives with a target scene; select it on open
  // (only if it actually belongs to the story that was loaded).
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    initialSceneId && story.scenes.some((s) => s.id === initialSceneId) ? initialSceneId : null
  );
  // beat id currently being synthesized by ElevenLabs (one line at a time)
  const [aiBusyBeat, setAiBusyBeat] = useState<string | null>(null);
  // where the most recent converted MP3 ended up (file path, or a warning)
  const [aiNote, setAiNote] = useState<{ text: string; at: number } | null>(null);
  // Batch voice generation state — converts every eligible beat (per scene
  // or the whole story) one character's voice at a time, saving each as its
  // own correctly-attributed MP3.
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [batchDone, setBatchDone] = useState<string | null>(null);
  // ElevenLabs model, mirrored into React state: setElevenModel() only writes
  // localStorage, so without this the cost preview / insert-cue list rendered
  // from the stored value would never update when the author picks a model.
  const [voiceModel, setVoiceModel] = useState(getElevenModel());
  const changeVoiceModel = (id: string) => {
    setVoiceModel(id);
    setElevenModel(id);
  };
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>(null);
  /** Hotspots tab: drawing hotspots, or drawing 🚧 no-go barriers. */
  const [zoneMode, setZoneMode] = useState<"hotspot" | "barrier" | "spawn">("hotspot");
  const [selectedBarrier, setSelectedBarrier] = useState<number | null>(null);
  const [focusedChoiceId, setFocusedChoiceId] = useState<string | null>(null);
  const [focusedBeatId, setFocusedBeatId] = useState<string | null>(null);
  // Which single beat is maximised in the Beats tab. Beats default to
  // minimised and at most one is open at a time: expanding a beat collapses
  // whichever was open before (accordion). Adding a beat opens just that one.
  const [expandedBeatId, setExpandedBeatId] = useState<string | null>(null);
  // Drag-and-drop beat reordering: the beat id being dragged and the one
  // currently dragged over.
  const [dragBeatId, setDragBeatId] = useState<string | null>(null);
  const [dragOverBeatId, setDragOverBeatId] = useState<string | null>(null);
  // Move a beat to before/after the target index within the selected scene.
  const reorderBeat = (dragId: string, targetId: string) => {
    if (dragId === targetId) return;
    mutate((draft) => {
      const sc = draft.scenes.find((x) => x.id === selectedId) ?? draft.scenes[0];
      const beats = sc.dialogueBeats;
      if (!beats) return;
      const from = beats.findIndex((x) => x.id === dragId);
      const to = beats.findIndex((x) => x.id === targetId);
      if (from < 0 || to < 0) return;
      const [moved] = beats.splice(from, 1);
      beats.splice(to, 0, moved);
    });
  };
  const [tab, setTab] = useState<"scene" | "beats" | "hotspots" | "choices" | "test" | "characters" | "audio" | "items" | "flags" | "briefing" | "acts" | "episodes" | "media" | "ai" | "dialogueBox" | "globalTitle" | "map">("scene");
  // Storage is the source of truth for the ElevenLabs model (the Characters
  // tab can change it elsewhere), so re-read it whenever the tab changes.
  useEffect(() => {
    setVoiceModel(getElevenModel());
  }, [tab]);
  const [globalTitleTheme, setGlobalTitleThemeState] = useState<TitleTheme>(() => {
    // Read the title settings on boot from the same key
    try {
      const raw = localStorage.getItem("scarlet-reel-global-title-theme");
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {
      titleText: "Scarlet Reel",
      tagline: "A Dime-Store Detective Serial",
      bgImageUrl: "/img/bg-alley.jpg",
      neonColor: "#ff2e88",
    };
  });
  const [showValidator, setShowValidator] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{ x: number; y: number; sceneId: string } | null>(null);
  const clipboardScene = useRef<SceneNode | null>(null);
  const [exportPayload, setExportPayload] = useState<string | null>(null);
  // Shown when both clipboard AND window.prompt are unavailable (Electron
  // shell / sandboxed iframe): a select-all box for the share link.
  const [shareBox, setShareBox] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  // Save reminder: work autosaves to local storage only — this browser's
  // storage on the web, the app's data folder in the compiled app. It never
  // goes to the repo, GitHub or the cloud, so remind the author to Export a
  // .reel.json as the permanent copy. Dismissible, but re-showable via the
  // toolbar 💾 button so it's always one click away.
  const desktopApp = isDesktop();
  const [saveReminderDismissed, setSaveReminderDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("scarlet-studio-savereminder-dismissed") === "1";
    } catch {
      return false;
    }
  });
  const dismissSaveReminder = useCallback(() => {
    setSaveReminderDismissed(true);
    try {
      localStorage.setItem("scarlet-studio-savereminder-dismissed", "1");
    } catch {
      /* ignore */
    }
  }, []);
  const showSaveReminder = useCallback(() => {
    setSaveReminderDismissed(false);
    try {
      localStorage.removeItem("scarlet-studio-savereminder-dismissed");
    } catch {
      /* ignore */
    }
  }, []);
  const [notice, setNotice] = useState<string | null>(null);
  const rf = useReactFlow();
  const dragSnapshot = useRef<Story | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Inspector panel width — user-resizable (drag the divider between canvas and
  // inspector) and expandable via the header button. Persisted so the chosen
  // size survives reloads.
  const [inspectorWidth, setInspectorWidth] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem("scarlet-studio-inspector-width"));
      if (saved >= 320 && saved <= 960) return saved;
    } catch {
      /* ignore */
    }
    return 420;
  });
  const resizeInspector = useRef<{ startX: number; startW: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem("scarlet-studio-inspector-width", String(inspectorWidth));
    } catch {
      /* storage may be unavailable */
    }
  }, [inspectorWidth]);

  const beginInspectorResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeInspector.current = { startX: e.clientX, startW: inspectorWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveInspectorResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeInspector.current) return;
    const viewportMax = Math.round(window.innerWidth * 0.75);
    const max = Math.min(960, Math.max(320, viewportMax));
    const next = Math.min(max, Math.max(320, resizeInspector.current.startW + (resizeInspector.current.startX - e.clientX)));
    setInspectorWidth(next);
  };
  const endInspectorResize = () => {
    resizeInspector.current = null;
  };
  const toggleInspectorWidth = () => setInspectorWidth((w) => (w >= 640 ? 420 : 720));

  const scene = story.scenes.find((s) => s.id === selectedId) ?? null;
  const issues = useMemo(() => validateStory(story), [story]);
  // Every flag referenced anywhere in the story — the source list for the flag
  // dropdowns so authors can pick (and keep track of) existing flag names.
  const allFlags = useMemo(() => collectFlags(story), [story]);
  // Every Choice.memoryLog tag — the dropdown source for the "Remembers" gate
  // and the memory-recall editor on dialogue beats.
  const memoryTags = useMemo(() => collectMemoryTags(story), [story]);
  // The "Remembers" gate and the beat "Memories recalled" editor also offer
  // story FLAGS as recall keys — a character can remember what you SAW (a
  // flag is set) as well as what you SAID (a memoryLog tag).
  const recallSuggestions = useMemo(
    () => [...new Set([...memoryTags, ...allFlags])].sort(),
    [memoryTags, allFlags]
  );

  // Which image the Cinematic Image Controls currently grade: the scene
  // background or a dialogue beat's replacement image.
  const [cinematicTarget, setCinematicTarget] = useState<string>("__scene__");

  // Keep the inspector in sync after undo/redo/imports that remove the
  // currently-selected scene, so tabs don't silently point at a ghost node.
  useEffect(() => {
    if (selectedId && !story.scenes.some((s) => s.id === selectedId)) {
      setSelectedId(null);
      setSelectedHotspot(null);
      setCinematicTarget("__scene__");
    }
  }, [story, selectedId]);

  // If the beat being graded loses its background image (or is removed), fall
  // back to grading the scene background.
  useEffect(() => {
    if (cinematicTarget !== "__scene__" && scene) {
      const beat = (scene.dialogueBeats ?? []).find((b) => b.id === cinematicTarget);
      if (!beat || !beat.background) setCinematicTarget("__scene__");
    }
  }, [scene, cinematicTarget]);

  // Resolves `asset:<id>` references to real data URLs for Studio previews.
  // The story state itself keeps references (so autosave/publish stay small).
  const resolveMedia = useResolvedMedia(story.id);
  const media = useCallback((v?: string) => resolveMedia(v) ?? v, [resolveMedia]);

  // Every image in the library (global), surfaced directly in the Background
  // dropdown so an upload is reusable in any scene of any story.
  const uploadedImages = useAllAssets("image");
  const storageAvailable = useStorageAvailable();

  const say = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 2600);
  };

  /* ---------- history ---------- */
  const lastCommitAt = useRef(0);
  const commit = useCallback((next: Story) => {
    // Coalesce a burst of rapid commits (typing in a text field) into ONE
    // undo step: only push when this commit lands >600ms after the
    // previous. The entry pushed is the state before the burst's first
    // commit, so one Ctrl+Z rewinds the whole run of typing instead of a
    // single character. Structural edits (add scene, delete, …) are
    // normally >600ms apart and still get their own step.
    const now = Date.now();
    if (!lastCommitAt.current || now - lastCommitAt.current > 600) {
      past.current.push(deepClone(storyRef.current));
      if (past.current.length > 100) past.current.shift();
    }
    lastCommitAt.current = now;
    future.current = [];
    setStory(next);
    forceTick((t) => t + 1);
  }, []);
  const storyRef = useRef(story);
  storyRef.current = story;

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(deepClone(storyRef.current));
    setStory(prev);
    // Break the coalesce window: the next edit must get a fresh undo
    // anchor, or typing right after a Ctrl+Z would be un-undoable.
    lastCommitAt.current = 0;
    forceTick((t) => t + 1);
    audio.click();
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(deepClone(storyRef.current));
    setStory(next);
    lastCommitAt.current = 0;
    forceTick((t) => t + 1);
    audio.click();
  }, []);

  /* ---------- autosave ---------- */
  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        // Persist compact `asset:<id>` references (never base64 data URLs) so
        // localStorage keeps working even after large audio/video uploads.
        const compacted = await compactStoryMedia(story);
        if (cancelled) return;
        try {
          localStorage.setItem(draftKey(story.id), JSON.stringify(compacted));
        } catch (quotaErr) {
          // Reclaim stale migration backups, then retry once.
          clearStaleStorageBackups();
          localStorage.setItem(draftKey(story.id), JSON.stringify(compacted));
          console.warn("Autosave needed to reclaim stale backups.", quotaErr);
        }
        setSavedFlash(true);
        window.setTimeout(() => setSavedFlash(false), 1200);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (/quota|exceeded/i.test(msg)) {
          say("Autosave failed: browser storage is full. Export your case, then clear stale data with 'Storage' repair.");
        } else {
          say(`Autosave failed: ${msg}`);
        }
        audio.fail();
      }
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [story]);

  /* ---------- mutation helpers ---------- */
  const updateScene = (id: string, patch: Partial<SceneNode>) => {
    commit({ ...story, scenes: story.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  };
  const mutate = (fn: (draft: Story) => void) => {
    const next = deepClone(story);
    fn(next);
    commit(next);
  };
  // Like mutate, but always clones the LATEST committed state — safe for
  // async work that fires many updates over time (batch voice generation,
  // multi-step imports). Cloning the stale `story` closure would have each
  // update overwrite the last; this accumulates them instead.
  const mutateLatest = (fn: (draft: Story) => void) => {
    const next = deepClone(storyRef.current);
    fn(next);
    commit(next);
  };

  const addScene = (fx: number, fy: number) => {
    const id = `scene_${uid()}`;
    const isFirstScene = story.scenes.length === 0;
    // 🧭 Mode switch: in an ADVENTURE case a new room is a walkable stage
    // (🚶 node) by default, not a prose plate — that IS the mode.
    const adv = story.gameKind === "adventure";
    mutate((d) => {
      d.scenes.push({
        id,
        title: isFirstScene ? "Opening Scene" : (adv ? "New Room" : "New Scene"),
        background: BACKGROUNDS[8],
        ambientAudio: "drone",
        prose: adv
          ? ""
          : isFirstScene
            ? "Your story starts here. Set the mood, introduce the problem, and give the detective a reason to keep looking."
            : "The scene opens on...",
        ...(adv
          ? {
              nodeType: "stage" as const,
              stage: {
                keyboard: true,
                speed: 15,
                reach: 4,
                depthScale: 0.3,
                hints: "proximity" as const,
                floor: { top: 66, bottom: 95 },
                spawn: { x: 50, y: 90 },
              },
            }
          : {}),
        choices: [],
        hotspots: [],
        dialogueBeats: [],
      });
      d.layout = { ...(d.layout ?? {}), [id]: { x: fx, y: fy } };
      if (isFirstScene) d.startSceneId = id;
    });
    setSelectedId(id);
    setTab("scene");
    if (isFirstScene && !adv) say("Opening scene created and marked as your start scene — no input connection needed. Add exits from here.");
    if (adv) say("Room created as a 🚶 walkable stage. Put a plate on it, draw 🚧 obstacles, then hang 👁 look / ✋ take / 💬 talk / ➜ go hotspots on it.");
    audio.pickup();
  };

  const addEndScene = (fx: number, fy: number) => {
    const id = `scene_${uid()}`;
    mutate((d) => {
      d.scenes.push({
        id,
        title: "Ending — Case Closed",
        background: BACKGROUNDS[2],
        ambientAudio: "jazz",
        prose: "The final reel. How the case ends is up to what the player proved.",
        choices: [],
        hotspots: [],
        dialogueBeats: [],
        isEnding: true,
        endingData: {
          tier: "victory-silver",
          headline: "CASE CLOSED",
          recap: "The story ends here. Customize the headline and recap to fit your ending.",
        },
      });
      d.layout = { ...(d.layout ?? {}), [id]: { x: fx, y: fy } };
    });
    setSelectedId(id);
    setTab("scene");
    say("End scene created — it has no output node. Connect other scenes into it.");
    audio.pickup();
  };

  const addCreditsScene = (fx: number, fy: number) => {
    const id = `scene_${uid()}`;
    mutate((d) => {
      d.scenes.push({
        id,
        title: "Opening Credits",
        nodeType: "credits",
        background: "gradient:linear-gradient(135deg, #07070c 0%, #14141f 100%)",
        prose: "MIDNIGHT CONFESSION\n\nDirected by Sam Cole\nWritten by the City\n\nTap to continue",
        choices: [
          { id: `c_${uid()}`, text: "Begin the Case", targetSceneId: "", attitudeTag: "Neutral" }
        ],
        hotspots: [],
        dialogueBeats: [],
      });
      d.layout = { ...(d.layout ?? {}), [id]: { x: fx, y: fy } };
    });
    setSelectedId(id);
    setTab("scene");
    say("Opening Credits node created. This node auto-hides the main HUD for a gorgeous, clean cinema introduction.");
    audio.pickup();
  };

  const addCutsceneScene = (fx: number, fy: number) => {
    const id = `scene_${uid()}`;
    mutate((d) => {
      d.scenes.push({
        id,
        title: "Cinematic Cutscene",
        nodeType: "cutscene",
        background: "gradient:linear-gradient(135deg, #000000 0%, #0c0c14 100%)",
        prose: "A slow fade to black... as the rain hammers the roof.",
        choices: [
          { id: `c_${uid()}`, text: "Next Scene", targetSceneId: "", attitudeTag: "Neutral" }
        ],
        hotspots: [],
        dialogueBeats: [],
      });
      d.layout = { ...(d.layout ?? {}), [id]: { x: fx, y: fy } };
    });
    setSelectedId(id);
    setTab("scene");
    say("Cutscene node created. Hide the main HUD to maximize your screen layout during transitions.");
    audio.pickup();
  };

  const addStageScene = (fx: number, fy: number) => {
    const id = `scene_${uid()}`;
    mutate((d) => {
      d.scenes.push({
        id,
        title: "Walkable Stage",
        nodeType: "stage",
        background: BACKGROUNDS[8],
        ambientAudio: "drone",
        prose: "",
        stage: {
          playerImage: "emoji:🕵️",
          spawn: { x: 50, y: 86 },
          speed: 18,
          reach: 4,
          keyboard: true,
          floor: { top: 62, bottom: 94 },
          depthScale: 0.35,
          hints: "proximity",
          enterCaption: "The room, in one line — what the player should feel walking in.",
        },
        choices: [],
        hotspots: [
          {
            id: `hs_${uid()}`,
            label: "The way out",
            bounds: { x: 84, y: 72, w: 12, h: 20 },
            cursor: "go",
            isRepeatable: true,
            action: { type: "goToScene", targetSceneId: "" },
          },
        ],
        dialogueBeats: [],
      });
      d.layout = { ...(d.layout ?? {}), [id]: { x: fx, y: fy } };
    });
    setSelectedId(id);
    setTab("scene");
    say("Walkable Stage created — a free-roam exploration scene. No prose panel: the player walks the floor, walks up to markers to interact, and conversations play via 🗣 Start-conversation hotspots. Wire the exit marker's target.");
    audio.pickup();
  };

  const addNoteScene = (fx: number, fy: number) => {
    const id = `scene_${uid()}`;
    mutate((d) => {
      d.scenes.push({
        id,
        title: "Missing Scene Here",
        nodeType: "note",
        background: "gradient:linear-gradient(135deg,#1a150c 0%,#0c0c14 100%)",
        prose: "",
        choices: [],
        hotspots: [],
        dialogueBeats: [],
      });
      d.layout = { ...(d.layout ?? {}), [id]: { x: fx, y: fy } };
    });
    setSelectedId(id);
    setTab("scene");
    say("Note added — click its text to type what belongs here. Wire it in on both sides; the game bypasses it in play.");
    audio.pickup();
  };

  const deleteScene = (id: string) => {
    const isStart = id === story.startSceneId;
    mutate((d) => {
      d.scenes = d.scenes.filter((s) => s.id !== id);
      // If we deleted the start scene, pick a new one or clear it
      if (isStart) {
        if (d.scenes.length > 0) d.startSceneId = d.scenes[0].id;
        else d.startSceneId = "";
      }
      // Clean links that pointed at the deleted scene.
      d.scenes.forEach((sc) => {
        if (sc.autoAdvanceTargetSceneId === id) {
          sc.autoAdvanceTargetSceneId = undefined;
          sc.autoAdvanceDelaySeconds = undefined;
          sc.autoAdvanceHideTimer = undefined;
        }
      });
      // Clean layout
      if (d.layout) delete d.layout[id];
    });
    if (selectedId === id) setSelectedId(null);
    if (isStart) say("Start scene deleted — first remaining scene is now start (change it in Scene tab if needed).");
    else say("Scene deleted.");
  };

  /* ---------- node clipboard: duplicate / copy / paste ---------- */
  const cloneSceneWithNewIds = (src: SceneNode): SceneNode => {
    const copy = deepClone(src);
    copy.id = `scene_${uid()}`;
    copy.choices = (copy.choices ?? []).map((c) => ({ ...c, id: `c_${uid()}` }));
    copy.hotspots = (copy.hotspots ?? []).map((h) => ({ ...h, id: `hs_${uid()}` }));
    copy.dialogueBeats = (copy.dialogueBeats ?? []).map((b) => ({ ...b, id: `b_${uid()}` }));
    return copy;
  };

  const duplicateScene = (id: string, at?: { x: number; y: number }) => {
    const src = story.scenes.find((s) => s.id === id);
    if (!src) return;
    const copy = cloneSceneWithNewIds(src);
    const base = story.layout?.[id] ?? { x: 60, y: 60 };
    const pos = at ?? { x: base.x + 48, y: base.y + 48 };
    mutate((d) => {
      d.scenes.push(copy);
      d.layout = { ...(d.layout ?? {}), [copy.id]: pos };
      // A duplicated scene must not steal the start marker.
      if (src.id === d.startSceneId) copy.title = `${src.title} (copy)`;
    });
    setSelectedId(copy.id);
    setTab("scene");
    say(`Duplicated "${src.title}". Rewire its exits where needed.`);
    audio.pickup();
  };

  const copyScene = (id: string) => {
    const src = story.scenes.find((s) => s.id === id);
    if (!src) return;
    clipboardScene.current = deepClone(src);
    say(`Copied "${src.title}" — right-click the canvas to paste.`);
    audio.click();
  };

  const pasteScene = (at: { x: number; y: number }) => {
    const src = clipboardScene.current;
    if (!src) {
      say("Nothing on the clipboard yet — copy a node first.");
      return;
    }
    const copy = cloneSceneWithNewIds(src);
    mutate((d) => {
      d.scenes.push(copy);
      d.layout = { ...(d.layout ?? {}), [copy.id]: { x: at.x, y: at.y } };
    });
    setSelectedId(copy.id);
    setTab("scene");
    say(`Pasted "${src.title}" on the canvas.`);
    audio.pickup();
  };

  /* ---------- graph derivation ---------- */
  const issueCountByScene = useMemo(() => {
    const m: Record<string, number> = {};
    issues.forEach((i) => {
      if (i.sceneId) m[i.sceneId] = (m[i.sceneId] ?? 0) + 1;
    });
    return m;
  }, [issues]);

  // sceneId -> its episode, so the canvas can badge each node with the chapter
  // it belongs to and mark the one that opens it.
  const sceneEpisodes = useMemo(() => {
    const map: Record<string, { number: number; title: string; isStart: boolean }> = {};
    seasonEpisodes(story).forEach((ep) => {
      ep.sceneIds.forEach((sceneId) => {
        map[sceneId] = { number: ep.number ?? 0, title: ep.title, isStart: sceneId === ep.startSceneId };
      });
    });
    return map;
  }, [story]);

  // sceneId -> the act that owns it. Membership is DERIVED by walking choice
  // edges from each act's start scene, so this recomputes on every graph edit
  // and the canvas shows act boundaries moving as the author wires links.
  // A scene reached by two acts is flagged rather than silently assigned.
  const sceneActs = useMemo(() => {
    const map: Record<string, { label: string; title: string; dot: string; isStart: boolean; conflict: boolean }> = {};
    (story.acts ?? []).forEach((act, i) => {
      const tint = ACT_TINTS[i % ACT_TINTS.length];
      scenesInAct(story, act.id).forEach((sceneId) => {
        if (map[sceneId]) {
          map[sceneId].conflict = true;
          return;
        }
        map[sceneId] = {
          label: act.label || `Act ${i + 1}`,
          title: act.title ?? "",
          dot: tint.dot,
          isStart: sceneId === act.startSceneId,
          conflict: false,
        };
      });
    });
    return map;
  }, [story]);

  // The road the story takes to reach the selected scene: a BFS from the
  // start scene over the scene edges. Selecting a node lights that path so
  // "where the story is" is visible at a glance — which branch feeds the
  // scene, what it passes through — without tracing 68 cards by hand.
  const pathToSelected = useMemo(() => {
    if (!selectedId) return null;
    if (selectedId === story.startSceneId)
      return { scenes: new Set([story.startSceneId]), edges: new Set<string>() };
    const adj = new Map<string, { edgeId: string; to: string }[]>();
    storyEdges(story).forEach((e) => {
      if (!story.scenes.some((s) => s.id === e.target)) return;
      const list = adj.get(e.source) ?? [];
      list.push({ edgeId: e.id, to: e.target });
      adj.set(e.source, list);
    });
    const prev = new Map<string, { edgeId: string; from: string }>();
    const seen = new Set([story.startSceneId]);
    const queue = [story.startSceneId];
    while (queue.length) {
      const id = queue.shift()!;
      if (id === selectedId) break;
      for (const { edgeId, to } of adj.get(id) ?? []) {
        if (seen.has(to)) continue;
        seen.add(to);
        prev.set(to, { edgeId, from: id });
        queue.push(to);
      }
    }
    if (!prev.has(selectedId)) return null; // orphan — no road reaches it
    const scenes = new Set<string>();
    const edges = new Set<string>();
    let cur: string | undefined = selectedId;
    while (cur) {
      scenes.add(cur);
      const p = prev.get(cur);
      if (!p) break;
      edges.add(p.edgeId);
      cur = p.from;
    }
    return { scenes, edges };
  }, [story, selectedId]);

  const nodes: Node[] = useMemo(
    () =>
      story.scenes.map((sc) => ({
        id: sc.id,
        type: "scene",
        position: story.layout?.[sc.id] ?? { x: 0, y: 0 },
        selected: sc.id === selectedId,
        data: {
          scene: sc,
          isStart: sc.id === story.startSceneId,
          issueCount: issueCountByScene[sc.id] ?? 0,
          backgroundRef: sc.background,
          episodeNumber: sceneEpisodes[sc.id]?.number,
          episodeTitle: sceneEpisodes[sc.id]?.title,
          isEpisodeStart: sceneEpisodes[sc.id]?.isStart,
          actLabel: sceneActs[sc.id]?.label,
          actTitle: sceneActs[sc.id]?.title,
          actDot: sceneActs[sc.id]?.dot,
          isActStart: sceneActs[sc.id]?.isStart,
          actConflict: sceneActs[sc.id]?.conflict,
          onPath: pathToSelected ? pathToSelected.scenes.has(sc.id) && sc.id !== selectedId : false,
        } satisfies SceneNodeData,
      })),
    [story, selectedId, issueCountByScene, sceneEpisodes, sceneActs, pathToSelected]
  );

  const edges: Edge[] = useMemo(
    () =>
      storyEdges(story)
        .filter((e) => story.scenes.some((s) => s.id === e.target))
        .map((e) => {
          const onPath = pathToSelected?.edges.has(e.id) ?? false;
          const stroke = onPath ? "#ffd166" : ATTITUDE_STROKE[e.attitude] ?? "#8b8b9e";
          return {
            id: e.id,
            type: "removable",
            source: e.source,
            target: e.target,
            sourceHandle:
              e.kind === "choice"
                ? `choice:${(e.ref as Choice).id}`
                : e.kind === "hotspot"
                  ? `hotspot:${(e.ref as Hotspot).id}`
                  : "auto",
            animated: e.kind === "hotspot" || e.kind === "auto",
            style: {
              stroke,
              strokeWidth: onPath ? 2.5 : 1.5,
              opacity: onPath ? 1 : 0.75,
              strokeDasharray: e.kind === "hotspot" ? "5 4" : e.kind === "auto" ? "3 6" : undefined,
            },
            markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
            data: { sceneId: e.source, kind: e.kind, refId: e.kind === "choice" ? (e.ref as Choice).id : e.kind === "hotspot" ? (e.ref as Hotspot).id : "auto" },
          };
        }),
    [story, pathToSelected]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      changes.forEach((ch) => {
        if (ch.type === "position" && ch.position) {
          setStory((s) => ({ ...s, layout: { ...(s.layout ?? {}), [ch.id]: { x: ch.position!.x, y: ch.position!.y } } }));
        } else if (ch.type === "select" && ch.selected) {
          setSelectedId(ch.id);
        } else if (ch.type === "remove") {
          deleteScene(ch.id);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [story, selectedId]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      changes.forEach((ch) => {
        if (ch.type === "remove") {
          const edge = edges.find((e) => e.id === ch.id);
          const d = edge?.data as { sceneId: string; kind: string; refId: string } | undefined;
          if (!d) return;
          mutate((draft) => {
            const sc = draft.scenes.find((s) => s.id === d.sceneId);
            if (!sc) return;
            if (d.kind === "choice") {
              const c = sc.choices?.find((x) => x.id === d.refId);
              if (c) c.targetSceneId = "";
            } else if (d.kind === "hotspot") {
              const h = sc.hotspots?.find((x) => x.id === d.refId);
              if (h) h.action.targetSceneId = undefined;
            } else if (d.kind === "auto") {
              sc.autoAdvanceTargetSceneId = undefined;
              sc.autoAdvanceDelaySeconds = undefined;
              sc.autoAdvanceHideTimer = undefined;
            }
          });
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edges, story]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape") {
        setMenu(null);
      }
    };
    const onDeleteCustom = (e: Event) => {
      const sceneId = (e as CustomEvent<string>).detail;
      if (sceneId) deleteScene(sceneId);
    };
    const onRenameCustom = (e: Event) => {
      const detail = (e as CustomEvent<{ sceneId: string; title: string; isNote?: boolean }>).detail;
      if (!detail?.sceneId) return;
      const title = detail.title.trim();
      // Notes may be left empty (the card shows a placeholder); titles may not.
      if (!title && !detail.isNote) return;
      mutate((draft) => {
        const sc = draft.scenes.find((s) => s.id === detail.sceneId);
        if (sc) sc.title = title;
      });
    };
    const onDeleteEdge = (e: Event) => {
      const edgeId = (e as CustomEvent<string>).detail;
      const edge = edges.find((edge) => edge.id === edgeId);
      const d = edge?.data as { sceneId: string; kind: string; refId: string } | undefined;
      if (!d) return;
      mutate((draft) => {
        const sc = draft.scenes.find((s) => s.id === d.sceneId);
        if (!sc) return;
        if (d.kind === "choice") {
          const c = sc.choices?.find((x) => x.id === d.refId);
          if (!c) return;
          // A note's route IS its single choice — removing the wire removes
          // the route (and the card's handle drops back to "connect me").
          if (sc.nodeType === "note") sc.choices = sc.choices?.filter((x) => x.id !== d.refId) ?? [];
          else c.targetSceneId = "";
        } else if (d.kind === "hotspot") {
          const h = sc.hotspots?.find((x) => x.id === d.refId);
          if (h) h.action.targetSceneId = undefined;
        } else if (d.kind === "auto") {
          sc.autoAdvanceTargetSceneId = undefined;
          sc.autoAdvanceDelaySeconds = undefined;
          sc.autoAdvanceHideTimer = undefined;
        }
      });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scarlet-delete-scene", onDeleteCustom as EventListener);
    window.addEventListener("scarlet-delete-edge", onDeleteEdge as EventListener);
    window.addEventListener("scarlet-rename-scene", onRenameCustom as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scarlet-delete-scene", onDeleteCustom as EventListener);
      window.removeEventListener("scarlet-delete-edge", onDeleteEdge as EventListener);
      window.removeEventListener("scarlet-rename-scene", onRenameCustom as EventListener);
    };
  }, [undo, redo, edges, mutate, deleteScene]);

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target) return;
      // Newly-created choices need their id captured so we can auto-focus them
      // in the Choices tab immediately — otherwise a fresh "New choice..." is
      // silently dropped into the list with no way to know where it went.
      let newChoiceId: string | null = null;
      let focusChoice = true;
      mutate((d) => {
        const sc = d.scenes.find((s) => s.id === conn.source);
        if (!sc) return;
        const handle = conn.sourceHandle ?? "new";
        if (handle.startsWith("choice:")) {
          const c = sc.choices?.find((x) => `choice:${x.id}` === handle);
          if (c) c.targetSceneId = conn.target!;
        } else if (handle.startsWith("hotspot:")) {
          const h = sc.hotspots?.find((x) => `hotspot:${x.id}` === handle);
          if (h) h.action.targetSceneId = conn.target!;
        } else if (handle === "auto") {
          sc.autoAdvanceTargetSceneId = conn.target!;
          sc.autoAdvanceDelaySeconds = sc.autoAdvanceDelaySeconds ?? 3;
        } else {
          sc.choices = sc.choices ?? [];
          newChoiceId = `c_${uid()}`;
          // A note's single "route out" handle: the first connection becomes
          // its bypass route.
          const isNote = sc.nodeType === "note";
          if (isNote) focusChoice = false;
          sc.choices.push({
            id: newChoiceId,
            text: isNote ? "Bypass route" : "New choice — click to edit",
            targetSceneId: conn.target!,
            attitudeTag: "Neutral",
          });
        }
      });
      audio.stringSnap();
      if (newChoiceId && focusChoice) {
        setSelectedId(conn.source!);
        setTab("choices");
        setFocusedChoiceId(newChoiceId);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [story]
  );

  /**
   * Auto-repair the common authoring faults that silently strand players:
   * dead-end scenes, fully-gated scenes, dangling targets, phantom item gates
   * and broken crafting recipes.
   */
  const repairStory = () => {
    const next = deepClone(story);
    const sceneIds = new Set(next.scenes.map((s) => s.id));
    const itemIds = new Set(next.items.map((i) => i.id));
    const fixes: string[] = [];

    if (!sceneIds.has(next.startSceneId)) {
      // Notes are placeholders, never a start scene.
      const firstReal = next.scenes.find((s) => s.nodeType !== "note");
      if (firstReal) {
        next.startSceneId = firstReal.id;
        fixes.push("reset start scene");
      }
    }
    const start = next.startSceneId;

    next.scenes.forEach((sc) => {
      // strip gates that reference items which no longer exist
      const scrub = (g?: Gating) => {
        if (!g) return;
        (["requiresItems", "excludesItems"] as const).forEach((key) => {
          if (g[key]?.some((id) => !itemIds.has(id))) {
            g[key] = g[key]!.filter((id) => itemIds.has(id));
            if (!g[key]!.length) delete g[key];
            fixes.push(`cleaned phantom item gate in "${sc.title}"`);
          }
        });
      };
      sc.choices?.forEach((c) => {
        scrub(c.gating);
        // Conversational replies stay in their scene — never re-point them.
        if (!c.reply && (!c.targetSceneId || !sceneIds.has(c.targetSceneId))) {
          c.targetSceneId = start;
          fixes.push(`re-pointed dangling choice in "${sc.title}"`);
        }
        if (c.consequences?.addItems?.some((i) => !itemIds.has(i))) {
          c.consequences.addItems = c.consequences.addItems.filter((i) => itemIds.has(i));
          fixes.push(`removed unknown reward item in "${sc.title}"`);
        }
      });
      if (sc.autoAdvanceTargetSceneId && !sceneIds.has(sc.autoAdvanceTargetSceneId)) {
        sc.autoAdvanceTargetSceneId = start === sc.id && next.scenes[1] ? next.scenes[1].id : start;
        sc.autoAdvanceDelaySeconds = sc.autoAdvanceDelaySeconds ?? 3;
        fixes.push(`re-pointed auto-advance in "${sc.title}"`);
      }
      sc.hotspots?.forEach((h) => {
        scrub(h.gating);
        const needsTarget = ["goToScene", "useItem"].includes(h.action.type);
        if (needsTarget && (!h.action.targetSceneId || !sceneIds.has(h.action.targetSceneId))) {
          h.action.targetSceneId = start;
          fixes.push(`gave "${h.label}" a valid target scene`);
        }
        if (h.isRepeatable && ["giveItem", "setFlag", "meterChange"].includes(h.action.type)) {
          h.isRepeatable = false;
          fixes.push(`made reward hotspot "${h.label}" one-shot`);
        }
        if (h.action.itemGranted && !itemIds.has(h.action.itemGranted)) {
          delete h.action.itemGranted;
          fixes.push(`cleared unknown granted item on "${h.label}"`);
        }
        if (h.action.itemConsumed && !itemIds.has(h.action.itemConsumed)) {
          delete h.action.itemConsumed;
          fixes.push(`cleared unknown consumed item on "${h.label}"`);
        }
      });

      if (sc.isEnding && !sc.endingData) {
        sc.endingData = { tier: "victory-silver", headline: "CASE CLOSED", recap: "The reel runs out." };
        fixes.push(`added ending data to "${sc.title}"`);
      }

      if (!sc.isEnding) {
        const exits = [
          ...(sc.autoAdvanceTargetSceneId ? [{ gated: false }] : []),
          ...(sc.choices ?? []).map((c) => ({ gated: !!effectiveChoiceGating(c) })),
          ...(sc.hotspots ?? []).filter((h) => h.action.targetSceneId).map((h) => ({ gated: !!h.gating })),
        ];
        const hasOpenExit = exits.some((e) => !e.gated);
        if (!hasOpenExit) {
          sc.choices = sc.choices ?? [];
          sc.choices.push({
            id: `c_${uid()}`,
            text: exits.length ? "Step back and look for another angle." : "Move on.",
            targetSceneId: start === sc.id && next.scenes[1] ? next.scenes[1].id : start,
            attitudeTag: "Neutral",
          });
          fixes.push(`added a guaranteed exit to "${sc.title}"`);
        }
      }
    });

    next.items.forEach((item) => {
      if (item.combinableWith) {
        const { targetItemId, resultItemId } = item.combinableWith;
        if (!itemIds.has(targetItemId) || !itemIds.has(resultItemId)) {
          delete item.combinableWith;
          fixes.push(`removed broken recipe on "${item.name}"`);
        }
      }
    });

    if (!fixes.length) {
      say("Nothing to repair — this reel is structurally sound.");
      return;
    }
    commit(next);
    say(`Repaired ${fixes.length} issue(s): ${fixes.slice(0, 2).join("; ")}${fixes.length > 2 ? "…" : ""}`);
    audio.success();
  };

  /* ---------- import / export / share ---------- */
  const exportJson = async () => {
    try {
      const [libraryAssets, bundled] = await Promise.all([
        loadStoryAssetsForExport(story),
        bundleVoiceFileRefs(story),
      ]);
      // Library rows (uploaded media, base64) plus the voice MP3s that were
      // saved as files — so the export is self-contained either way.
      const caseAssets = [...libraryAssets, ...bundled.assets];
      const storyBundle: Story = { ...bundled.story, assets: caseAssets };
      const json = JSON.stringify(storyBundle, null, 2);
      setExportPayload(json);
      const voicePart = bundled.assets.length ? ` (including ${bundled.assets.length} voice MP3 file${bundled.assets.length === 1 ? "" : "s"})` : "";
      const missingPart = bundled.missing.length
        ? ` WARNING: ${bundled.missing.length} voice file(s) referenced but not found on this machine are NOT in the export: ${bundled.missing.join(", ")}`
        : "";
      say(
        caseAssets.length
          ? `Bundled ${caseAssets.length} media asset(s)${voicePart} into the export. Use Download or Copy.${missingPart}`
          : `Case bundled. Use Download or Copy — the JSON is yours.${missingPart}`
      );
    } catch {
      say("Failed to export case bundle.");
    }
  };

  const downloadExportPayload = () => {
    if (!exportPayload) return;
    try {
      const blob = new Blob([exportPayload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${story.id}.reel.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      say("Download started.");
    } catch {
      say("Download was blocked — use Copy and paste into a .reel.json file.");
    }
  };

  const copyExportPayload = async () => {
    if (!exportPayload) return;
    try {
      await navigator.clipboard.writeText(exportPayload);
      say("Case JSON copied to clipboard.");
      audio.success();
    } catch {
      // Clipboard blocked: select the textarea contents so the author can copy manually.
      const ta = document.getElementById("reel-export-textarea") as HTMLTextAreaElement | null;
      ta?.focus();
      ta?.select();
      say("Clipboard blocked — the JSON is selected in the box below. Press Ctrl+C.");
    }
  };

  const shareLink = async () => {
    // Sharing via URL limits size, so we export references or compress.
    // For deep sharing, we recommend using .reel.json files.
    const url = `${location.origin}${location.pathname}#reel=${encodeStory(story)}`;
    try {
      await navigator.clipboard.writeText(url);
      say("Share link copied to clipboard! 📋");
    } catch {
      // Clipboard blocked: prompt() is the classic fallback, but it doesn't
      // exist in the Electron shell — show the link in a select-all box
      // instead of throwing.
      let showed = false;
      try {
        if (typeof window.prompt === "function") {
          window.prompt("Copy your share link:", url);
          showed = true;
        }
      } catch {
        /* dialog blocked in this shell */
      }
      if (!showed) {
        setShareBox(url);
        say("Clipboard blocked — the share link is in the box below, select and copy it.");
      }
    }
  };

  /* ---------- duplicate the whole story ----------
   * Makes an independent, editable copy of the CURRENT story (the built-in,
   * a custom case, or a draft): new story id and title, regenerated scene +
   * beat + hotspot ids remapped across every internal reference (choices,
   * hotspots, puzzles, acts, episodes, auto-advance, part breaks, start
   * scene) so the graph wires up identically, and the canvas layout is
   * offset so the copy doesn't stack on the original. Saved as a custom
   * story so the built-ins are never modified. */
  const duplicateStory = async () => {
    const src = deepClone(story);
    const newStoryId = `case_${uid()}`;
    const sceneIdMap = new Map<string, string>();
    src.scenes.forEach((s) => {
      // Keep end/credits-style ids readable-ish but unique.
      sceneIdMap.set(s.id, `${s.id}_copy_${uid().slice(0, 5)}`);
    });
    const remap = (id?: string) => (id ? sceneIdMap.get(id) ?? id : id);

    const copy: Story = {
      ...src,
      id: newStoryId,
      title: `${src.title.replace(/\s*\(copy\).*$/, "")} (copy)`,
      startSceneId: remap(src.startSceneId) ?? "",
      layout: Object.fromEntries(
        Object.entries(src.layout ?? {}).map(([id, pos]) => [
          remap(id) ?? id,
          { x: pos.x + 80, y: pos.y + 90 },
        ])
      ),
      scenes: src.scenes.map((s) => ({
        ...s,
        id: remap(s.id) as string,
        autoAdvanceTargetSceneId: remap(s.autoAdvanceTargetSceneId),
        choices: s.choices?.map((ch) => ({
          ...ch,
          id: `c_${uid()}`,
          targetSceneId: remap(ch.targetSceneId),
          timedOutTargetSceneId: remap(ch.timedOutTargetSceneId),
        })),
        hotspots: s.hotspots?.map((h) => ({
          ...h,
          id: `hs_${uid()}`,
          action: {
            ...h.action,
            targetSceneId: remap(h.action.targetSceneId),
            patternPuzzle: h.action.patternPuzzle
              ? {
                  ...h.action.patternPuzzle,
                  targetSceneId: remap(h.action.patternPuzzle.targetSceneId),
                  wrongTargetSceneId: remap(h.action.patternPuzzle.wrongTargetSceneId),
                }
              : undefined,
          },
        })),
        dialogueBeats: s.dialogueBeats?.map((b) => ({
          ...b,
          id: `b_${uid()}`,
          afterBeatTargetSceneId: remap(b.afterBeatTargetSceneId),
        })),
        onEnterActions: s.onEnterActions,
      })),
      acts: src.acts?.map((a) => ({ ...a, id: `act_${uid()}`, startSceneId: remap(a.startSceneId) ?? a.startSceneId })),
      // Episodes are rebuilt with new ids below where the episode-id map exists.
      episodes: src.episodes?.map((e) => ({
        ...e,
        id: `ep_${uid()}`,
        startSceneId: remap(e.startSceneId) ?? e.startSceneId,
        sceneIds: e.sceneIds.map((id) => remap(id) ?? id),
      })),
      briefing: src.briefing
        ? { ...src.briefing, heatFailSceneId: remap(src.briefing.heatFailSceneId) }
        : src.briefing,
      deduction: src.deduction,
      // Custom copies don't carry bundled media; asset:/ url references
      // resolve against the shared media library, which already holds them.
      assets: undefined,
    };
    // Re-point episode unlock references to the new episode ids.
    if (copy.episodes && src.episodes) {
      const epMap = new Map<string, string>();
      src.episodes.forEach((e, i) => epMap.set(e.id, copy.episodes![i].id));
      copy.episodes = copy.episodes.map((e, i) => ({
        ...e,
        unlockAfter: src.episodes![i].unlockAfter?.map((u) => ({
          ...u,
          episodeId: epMap.get(u.episodeId) ?? u.episodeId,
        })),
        nextEpisodeByEnding: e.nextEpisodeByEnding
          ? Object.fromEntries(Object.entries(e.nextEpisodeByEnding).map(([k, v]) => [k, epMap.get(v) ?? v]))
          : undefined,
      }));
    }
    const compact = await compactStoryMedia(copy);
    if (!onCreateStory(compact)) {
      say("Could not duplicate — browser storage may be full.");
      audio.fail();
      return;
    }
    past.current = [];
    future.current = [];
    setStory(compact);
    setSelectedId(null);
    setSelectedHotspot(null);
    setFocusedChoiceId(null);
    localStorage.setItem("scarlet-studio-last-story", compact.id);
    say(`Duplicated "${src.title}" as "${compact.title}" — a fully independent copy.`);
    audio.success();
  };

  /* ---------- batch ElevenLabs voice generation ----------
   * Converts every eligible beat in ONE scene to a per-character MP3.
   * Each line is billed/synthesized separately and saved through the same
   * pipeline as the single Generate button, so the file lands in
   * public/voices/<person>/<scene>/ on desktop (linked folder / media
   * library in browser) with the correct character's voice on the line.
   * Conversational context (the surrounding turns) is sent so the delivery
   * responds to the previous speaker. Updates apply progressively onto the
   * latest draft so every line sticks. */
  const batchGenerateVoices = async (scopeSceneId: string, modelOverride?: string) => {
    const key = getElevenKey();
    if (!key) {
      window.alert("Add your ElevenLabs API key first — Characters tab → 🎙 AI Voice (ElevenLabs).");
      setTab("characters");
      return;
    }
    const scene = story.scenes.find((x) => x.id === scopeSceneId);
    if (!scene) return;
    const model = modelOverride ?? getElevenModel();

    type Job = { beatId: string; characterId: string; characterName: string; line: string; hasAudio: boolean; prev: string; next: string };
    const jobs: Job[] = [];
    const beats = scene.dialogueBeats ?? [];
    for (let bi = 0; bi < beats.length; bi += 1) {
      const b = beats[bi];
      const ch = story.characters.find((x) => x.id === b.characterId);
      const line = b.text?.trim();
      if (!line || b.silent) continue;
      if (b.recalls && Object.keys(b.recalls).length) continue; // route-dependent text stays on TTS
      if (!ch?.elevenVoiceId) continue; // speaker has no assigned voice
      // Label each turn with its speaker so ElevenLabs knows WHO is in the
      // exchange (e.g. a Vera/Jack back-and-forth) and voices the line as a
      // reply to the correct character rather than an isolated read.
      const spoken = (idx: number) => {
        const bb = beats[idx];
        if (!bb || !bb.text.trim()) return "";
        if (bb.characterId === "narrator") return `(Narration) ${bb.text.trim()}`;
        const who = story.characters.find((c) => c.id === bb.characterId)?.name ?? "Speaker";
        return `${who}: ${bb.text.trim()}`;
      };
      // Full preceding conversation in the scene (the API truncates to its
      // own context limit); next line is just the immediate follow-up.
      const prev = beats
        .slice(0, bi)
        .map((_bb, k) => spoken(k))
        .filter(Boolean)
        .join("\n");
      jobs.push({
        beatId: b.id,
        characterId: b.characterId,
        characterName: ch.name,
        line,
        hasAudio: !!b.audioUrl,
        prev,
        next: bi + 1 < beats.length ? spoken(bi + 1) : "",
      });
    }

    if (!jobs.length) {
      window.alert(
        "No convertible lines in this scene. Each beat needs spoken text and a character whose ElevenLabs voice ID is set in the Characters tab. Silent beats and memory-recall lines stay on text-to-speech."
      );
      return;
    }
    const existing = jobs.filter((j) => j.hasAudio).length;
    const modelLabel = ELEVENLABS_MODELS.find((m) => m.id === model)?.label ?? model;

    // Work out which lines would actually be generated (regenerate-all vs
    // only gaps) so the warning prices the real spend, not the whole scene.
    let onlyMissing = false;
    if (existing > 0) {
      onlyMissing = !window.confirm(
        `${jobs.length} line(s) in "${scene.title}" (${new Set(jobs.map((j) => j.characterName)).size} character(s)).\n\n` +
          `${existing} line(s) already have an MP3.\n\nOK = regenerate ALL ${jobs.length} lines.\nCancel = only generate the ${jobs.length - existing} that don't have an MP3 yet.`
      );
    }
    const toGenerate = onlyMissing ? jobs.filter((j) => !j.hasAudio) : jobs;
    const genChars = toGenerate.reduce((n, j) => n + j.line.length, 0);
    const genCost = estimateVoiceCost(model, genChars);
    const money =
      genCost.usd >= 5 ? `~$${genCost.usd.toFixed(0)}` : `~$${genCost.usd.toFixed(2)}`;

    // ---- Double-check / cost warning -------------------------------------
    const warning =
      `⚠ YOU ARE ABOUT TO SPEND ELEVENLABS CREDITS\n\n` +
      `Scene: ${scene.title}\nModel: ${modelLabel}\n` +
      `Lines to generate: ${toGenerate.length}\n` +
      `Characters: ${genChars.toLocaleString()}  (≈ ${Math.round(genChars / 6).toLocaleString()} words)\n\n` +
      `Estimated cost: ~${genCost.credits.toLocaleString()} credits (${money} list overage).\n` +
      `(Your plan's monthly credit grant may cover this; you are only charged overage.)\n\n` +
      `Each line is generated separately in its character's voice and applied automatically. This cannot be undone once the API call is made.\n\n` +
      `Proceed? Click OK to spend the credits, Cancel to abort.`;
    if (!window.confirm(warning)) return;
    // Second confirmation for any spend over a small threshold so an
    // accidental click never burns a large batch.
    if (genCost.credits >= 500) {
      let sure: string | null = null;
      let dialogOk = false;
      try {
        if (typeof window.prompt === "function") {
          sure = window.prompt(
            `Final check: this spends ~${genCost.credits.toLocaleString()} credits on ${toGenerate.length} line(s). Type GENERATE to proceed.`,
            ""
          );
          dialogOk = true;
        }
      } catch {
        /* dialog blocked in this shell */
      }
      if (!dialogOk) {
        // Fail closed: without the typed GENERATE confirmation we must not
        // spend credits, so abort with an explanation instead of throwing.
        setBatchDone(
          "Cancelled — this shell can't show the typed GENERATE confirmation, so the batch was not run. Try from a normal browser window, or keep each scene under the confirmation threshold."
        );
        return;
      }
      if ((sure ?? "").trim().toUpperCase() !== "GENERATE") return;
    }
    const queue = toGenerate;
    if (!queue.length) {
      setBatchDone("Nothing to generate — every line in this scene already has an MP3.");
      return;
    }
    setBatchBusy(true);
    setBatchDone(null);
    let ok = 0;
    let failed = 0;
    const failures: string[] = [];
    for (let i = 0; i < queue.length; i += 1) {
      const job = queue[i];
      setBatchProgress({ done: i, total: queue.length, label: `${job.characterName}` });
      try {
        const { dataUrl, blob } = await synthesizeElevenLabs(
          job.line,
          story.characters.find((x) => x.id === job.characterId)!.elevenVoiceId!,
          model,
          { previousText: job.prev, nextText: job.next }
        );
        const saved = await saveGeneratedVoice({
          storyId: story.id,
          characterId: job.characterId,
          sceneId: scene.id,
          beatId: job.beatId,
          blob,
          dataUrl,
          assetName: `voice-${job.characterId}-${job.beatId}`,
        });
        // Apply onto the LATEST draft so rapid async saves accumulate instead
        // of overwriting each other.
        mutateLatest((d) => {
          const s = d.scenes.find((x) => x.id === scene.id)!;
          const b = s.dialogueBeats!.find((x) => x.id === job.beatId)!;
          b.audioUrl = saved.url;
        });
        ok += 1;
      } catch (err) {
        failed += 1;
        failures.push(`${job.characterName}: ${(err as Error).message}`);
        const msg = (err as Error).message || "";
        // Fatal for the whole batch: bad key, missing voice, model mismatch,
        // out of credits. Continuing would burn the same failure on every line.
        if (
          msg.includes("401") ||
          msg.includes("403") ||
          msg.includes("400") ||
          msg.includes("404") ||
          msg.includes("refused") ||
          msg.includes("422") ||
          msg.includes("No ElevenLabs") ||
          msg.includes("voice not found")
        ) {
          break;
        }
        // Rate limit: brief back-off then continue with the next line.
        if (msg.includes("429") || msg.includes("Rate limited")) await new Promise((r) => setTimeout(r, 4000));
      }
    }
    setBatchProgress(null);
    setBatchBusy(false);
    const summary =
      `"${scene.title}" — ${ok} MP3${ok === 1 ? "" : "s"} saved & applied to beats` +
      (failed ? `, ${failed} failed.` : ".") +
      (failures.length ? `\n\n${failures.slice(0, 4).join("\n")}` : "");
    setBatchDone(summary);
    say(`Batch voices: ${ok} saved${failed ? `, ${failed} failed` : ""}.`);
    if (failed === 0) audio.success();
  };

  const importJson = async (file: File) => {
    try {
      const text = await file.text();
      const storyBundle: Story = JSON.parse(text);
      if (!storyBundle.scenes || !storyBundle.startSceneId) throw new Error("bad");

      if (Array.isArray(storyBundle.assets) && storyBundle.assets.length > 0) {
        await importStoryAssets(storyBundle.id, storyBundle.assets);
      }

      const { assets, ...cleanedStory } = storyBundle;
      // Old exports carried the bolt-on `stage2d` layer; imports map it to the
      // stage NODE so those cases keep walking.
      commit(await compactStoryMedia(normalizeLegacyStory(cleanedStory)));
      say(`Imported "${cleanedStory.title}" with ${assets?.length ?? 0} assets.`);
    } catch {
      say("That file isn't a valid reel. Tragic.");
    }
  };

  /* ---------- render ---------- */
  return (
    <MediaResolverContext.Provider value={media}>
      <div className="flex h-full flex-col bg-noir-900 text-paper">
        {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-noir-700 bg-noir-950/80 px-2.5 py-1.5 font-sans">
        <span className="mr-1 select-none text-[13px] font-semibold uppercase tracking-[0.16em] text-gold">Studio</span>
        <select
          className="tb-select"
          value={story.id}
          onChange={(e) => {
            past.current = [];
            future.current = [];
            setStory(loadDraft(e.target.value));
            setSelectedId(null);
          }}
          aria-label="Choose story to edit"
        >
          {[...baseStories, ...(baseStories.some((s) => s.id === story.id) ? [] : [story])].map((s) => (
            <option key={s.id} value={s.id}>
              🎬 {s.title}
            </option>
          ))}
        </select>
        <input
          className="tb-input"
          value={story.title}
          onChange={(e) => commit({ ...story, title: e.target.value })}
          aria-label="Story title"
        />
        <select
          className="tb-select"
          value={story.gameKind ?? "noir-rail"}
          onChange={(e) => {
            const kind = e.target.value as "noir-rail" | "adventure" | "vn";
            commit({ ...story, gameKind: kind });
            say(
              kind === "adventure"
                ? "Adventure mode: new scenes come out as 🚶 walkable rooms, and the Scene tab opens on the Walkable Stage panel."
                : kind === "vn"
                  ? "Visual novel mode: build around portraits and dialogue beats."
                  : "Noir rail mode: prose + choice rail, the house style.",
            );
            audio.pickup();
          }}
          aria-label="Kind of game"
          title="What kind of game this case is — decides what a new scene looks like and which tooling Studio surfaces."
        >
          <option value="noir-rail">🕵 Noir Rail</option>
          <option value="adventure">🚶 Adventure</option>
          <option value="vn">🎭 Visual Novel</option>
        </select>
        <span className="tb-sep" />
        <button onClick={undo} disabled={!past.current.length} className="btn-tool" title="Undo (Ctrl+Z)">
          ↶ Undo
        </button>
        <button onClick={redo} disabled={!future.current.length} className="btn-tool" title="Redo (Ctrl+Shift+Z)">
          ↷ Redo
        </button>
        <span className="tb-sep" />
        <button
          onClick={() => {
            const blank = createBlankStory();
            if (!onCreateStory(blank)) {
              say("Could not save the new blank story. Browser storage may be full.");
              audio.fail();
              return;
            }
            past.current = [];
            future.current = [];
            setStory(blank);
            setSelectedId(null);
            setSelectedHotspot(null);
            setFocusedChoiceId(null);
            setTab("briefing");
            say("Blank canvas created. Start with the Case File, then add your first scene.");
            audio.success();
          }}
          className="btn-tool"
          title="Start a brand-new empty case"
        >
          ＋ New Story
        </button>
        <button
          onClick={() => { void duplicateStory(); }}
          className="btn-tool"
          title="Duplicate this whole case into a brand-new, independent story (every scene, beat, hotspot and wire copied with fresh ids)"
        >
          ⧉ Duplicate Story
        </button>
        <button onClick={() => addScene(80 + Math.random() * 200, 80 + Math.random() * 200)} className="btn-tool" title="Add standard game scene">
          ＋ Scene
        </button>
        <button
          onClick={() => addNoteScene(80 + Math.random() * 200, 80 + Math.random() * 200)}
          className="btn-tool"
          title="Add a placeholder note — wires into the graph on both sides but is bypassed in play (e.g. 'Missing Scene Here')"
        >
          📝 Note
        </button>
        <button
          onClick={() => addCreditsScene(80 + Math.random() * 200, 80 + Math.random() * 200)}
          className="btn-tool"
          title="Add opening/ending cinematic credits panel (No main HUD)"
        >
          🎬 Credits
        </button>
        <button
          onClick={() => addCutsceneScene(80 + Math.random() * 200, 80 + Math.random() * 200)}
          className="btn-tool"
          title="Add borderline full-screen video/storyboard cutscene (No main HUD)"
        >
          🎥 Cutscene
        </button>
        <button
          onClick={() => addStageScene(80 + Math.random() * 200, 80 + Math.random() * 200)}
          className="btn-tool"
          title="Add a walkable stage — the player walks a character around the floor and interacts by approaching markers"
        >
          🚶 Stage
        </button>
        <button
          onClick={() => addEndScene(560 + Math.random() * 200, 120 + Math.random() * 80)}
          className="btn-tool"
          title="Add an end scene — has no output node, marks a story ending"
        >
          🏁 End
        </button>
        <span className="tb-sep" />
        <button onClick={() => setShowValidator((v) => !v)} className="btn-tool" title="Toggle the continuity checker">
          {issues.length ? `⚠ ${issues.length}` : "✔"} Check
        </button>
        <button
          onClick={repairStory}
          className="btn-tool"
          title="Auto-fix dead ends, dangling links and phantom gates"
        >
          🛠 Repair
        </button>
        <span className="tb-sep" />
        <button
          onClick={showSaveReminder}
          className="btn-tool"
          title={
            desktopApp
              ? "Your work lives in this app's data folder — not the cloud or your repo. Shows the save reminder so you can Export a .reel.json to keep a copy."
              : "Your work lives in THIS browser — not the repo or GitHub. Shows the save reminder so you can Export a .reel.json to keep a copy."
          }
        >
          💾 Save
        </button>
        <button onClick={exportJson} className="btn-tool" title="Export this case as .reel.json">⤓ Export</button>
        <button onClick={() => fileRef.current?.click()} className="btn-tool" title="Import a .reel.json case">⤒ Import</button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])}
        />
        <button onClick={shareLink} className="btn-tool" title="Copy a shareable link">🔗 Share</button>
        <span className="tb-sep" />
        <button
          onClick={() => {
            const fallback = baseStories.find((candidate) => candidate.id === story.id);
            if (!fallback || !window.confirm("Discard this draft and restore the built-in story?")) return;
            past.current = [];
            future.current = [];
            localStorage.removeItem(draftKey(story.id));
            setStory(deepClone(fallback));
            setSelectedId(null);
            say("Draft reset to the built-in version.");
          }}
          className="btn-tool"
          title="Discard this draft and restore the built-in story"
        >
          Reset
        </button>
        <button
          onClick={() => {
            let freed = 0;
            try {
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && /-backup-pre-r/.test(k)) {
                  freed += (localStorage.getItem(k) ?? "").length;
                  localStorage.removeItem(k);
                }
              }
            } catch {
              /* ignore */
            }
            const kb = Math.round(freed / 1024);
            say(kb > 0 ? `Reclaimed ${kb}KB of stale backup data.` : "No stale backup data to reclaim.");
            audio.click();
          }}
          className="btn-tool"
          title="Clear stale migration backups to free browser storage"
        >
          🗜 Storage
        </button>
        <button
          onClick={() => {
            if (baseStories.length <= 1) {
              say("At least one playable story must remain.");
              return;
            }
            if (
              !window.confirm(
                `PERMANENTLY delete "${story.title}"?\n\nThis removes the story, its draft, and its published copy. This cannot be undone.`
              )
            ) {
              return;
            }
            // Default keeps media in the library; choosing Cancel explicitly deletes it too.
            const deleteMedia = !window.confirm(
              `Keep "${story.title}"'s media assets in the library?\n\nOK — keep audio, video and images (reusable in other stories).\nCancel — permanently delete them too.`
            );
            if (!onDeleteStory(story.id, deleteMedia)) {
              say("Could not delete that story.");
              audio.fail();
              return;
            }
            const nextStory = baseStories.find((candidate) => candidate.id !== story.id);
            if (nextStory) setStory(loadDraft(nextStory.id));
            setSelectedId(null);
            say(deleteMedia ? `"${story.title}" deleted permanently — media assets removed too.` : `"${story.title}" deleted permanently — media assets kept in the library.`);
          }}
          className="btn-tool btn-danger"
          title="Permanently delete this story (its media assets are kept unless you choose otherwise)"
        >
          🗑 Delete
        </button>
        <span className={`ml-auto tb-status ${savedFlash ? "text-emerald-400" : "text-paper/30"}`}>
          {savedFlash ? "✓ autosaved" : "autosave on"}
        </span>
        <button
          onClick={() => {
            setTab("globalTitle");
            setSelectedId(null);
          }}
          className={`btn-tool ${tab === "globalTitle" ? "is-active" : ""}`}
          title="Edit the Scarlet Reel main title page and autoplay soundtrack"
        >
          🎼 Theme
        </button>
        <button
          onClick={() => setShowHelp(true)}
          className="btn-tool"
          title="Open the field manual — workflow, gating rules, quick-time prompts, shortcuts, troubleshooting"
        >
          ? Help
        </button>
        <button
          onClick={async () => {
            if (story.scenes.length === 0) {
              setShowValidator(true);
              say("Publish blocked: a blank case needs at least one scene. Add a scene, then mark it as the start scene.");
              audio.fail();
              return;
            }
            const errors = issues.filter((issue) => issue.severity === "error");
            if (errors.length) {
              setShowValidator(true);
              say(`Publish blocked: fix ${errors.length} error(s), or click Repair.`);
              audio.fail();
              return;
            }
            const compacted = await compactStoryMedia(deepClone(story));
            let published = onPublish(compacted);
            if (!published) {
              // Reclaim stale backups and try once more.
              clearStaleStorageBackups();
              published = onPublish(compacted);
            }
            if (!published) {
              say("Publish failed: browser storage is full. Export your case, then clear stale data.");
              audio.fail();
              return;
            }
            say("Published. The newsstand now uses this version.");
            audio.success();
          }}
          className="btn-ok"
          title="Publish to the newsstand"
        >
          Publish
        </button>
        <button
          onClick={() => {
            if (story.scenes.length === 0) {
              setShowValidator(true);
              say("Add a first scene to play — or use the Test tab to check gates.");
              audio.fail();
              return;
            }
            const bad = issues.filter((i) => i.severity === "error");
            if (bad.length) {
              say(`Playing with ${bad.length} error(s) — open the Validator to review. Unfinished paths may dead-end.`);
              // Don't block — let the author test what they have so far.
            }
            onPlay(deepClone(story));
          }}
          className="btn-go"
          title="Play this draft"
        >
          ▶ Play
        </button>
        <button onClick={onExit} className="btn-tool" title="Exit Studio">✕</button>
      </div>

      {/* Save reminder — work autosaves to THIS browser only (localStorage +
          IndexedDB), NOT the repo or GitHub. Remind the author to Export a
          .reel.json to keep a permanent, committable copy. Dismissible, but
          the toolbar 💾 button brings it back. */}
      {!saveReminderDismissed && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-gold/30 bg-gold/10 px-3 py-2">
          <span className="select-none text-base" aria-hidden>
            💾
          </span>
          <span className="min-w-0 flex-1 font-type text-[11px] leading-snug text-paper/85">
            {desktopApp ? (
              <>
                <b className="text-gold">Your work autosaves to this app's data folder only</b> — it stays on this
                machine (Windows: %APPDATA%\Scarlet Reel), not in the cloud or your repo, and reinstalling the app
                or clearing its data erases it.{" "}
                <b className="text-gold">Export a .reel.json to keep a permanent copy</b> — the export bundles all
                media, including voice MP3s — and save that file somewhere safe.
              </>
            ) : (
              <>
                <b className="text-gold">Your work autosaves to this browser only</b> — it lives in this browser's
                storage, not in your repo or on GitHub, and clearing the browser erases it.{" "}
                <b className="text-gold">Export a .reel.json to keep a permanent copy</b>, then commit that file to
                your repo to share it or version your work.
              </>
            )}
          </span>
          <button onClick={exportJson} className="btn-go shrink-0" title="Export this case as .reel.json">
            ⤓ Export .reel.json
          </button>
          <button
            onClick={dismissSaveReminder}
            className="btn-tool shrink-0"
            title="Dismiss this reminder — bring it back with the 💾 Save button in the toolbar"
            aria-label="Dismiss save reminder"
          >
            ✕
          </button>
        </div>
      )}

      {notice && (
        <div className="pointer-events-none absolute left-1/2 top-14 z-[80] -translate-x-1/2 border border-gold/60 bg-noir-950/95 px-4 py-2 font-type text-xs text-gold pop-in">
          {notice}
        </div>
      )}

      {shareBox && (
        <div className="absolute bottom-4 left-1/2 z-[85] w-[min(92vw,640px)] -translate-x-1/2 border border-gold/60 bg-noir-950/95 p-2 shadow-2xl pop-in">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-pulp text-[9px] uppercase tracking-widest text-gold">
              📋 Share link — select all and copy
            </span>
            <button
              onClick={() => setShareBox(null)}
              className="px-1 text-paper/50 hover:text-neon"
              aria-label="Close share link box"
            >
              ✕
            </button>
          </div>
          <input
            readOnly
            value={shareBox}
            onFocus={(e) => e.target.select()}
            className="w-full border border-noir-600 bg-noir-900 px-2 py-1.5 font-mono text-[10px] text-paper/80 outline-none"
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* canvas */}
        <div className="relative min-w-0 flex-1" onClick={() => { setMenu(null); setNodeMenu(null); }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => {
              setSelectedId(n.id);
              setSelectedHotspot(null);
            }}
            onNodeContextMenu={(e, n) => {
              e.preventDefault();
              const evt = e as unknown as MouseEvent;
              setSelectedId(n.id);
              setNodeMenu({ x: evt.clientX, y: evt.clientY, sceneId: n.id });
              setMenu(null);
            }}
            onEdgeClick={(_, edge) => {
              // Clicking an edge on the canvas jumps to the source scene AND
              // opens the correct editor tab, so authors can edit the newly
              // wired choice or hotspot immediately.
              const data = edge.data as { sceneId?: string; kind?: string; refId?: string } | undefined;
              if (!data?.sceneId) return;
              setSelectedId(data.sceneId);
              if (data.kind === "choice" && data.refId) {
                setTab("choices");
                setFocusedChoiceId(data.refId);
              } else if (data.kind === "hotspot" && data.refId) {
                setTab("hotspots");
                setSelectedHotspot(data.refId);
              }
            }}
            onNodeDragStart={() => {
              dragSnapshot.current = deepClone(storyRef.current);
            }}
            onNodeDragStop={() => {
              if (dragSnapshot.current) {
                past.current.push(dragSnapshot.current);
                future.current = [];
                dragSnapshot.current = null;
              }
            }}
            onPaneContextMenu={(e) => {
              e.preventDefault();
              const evt = e as unknown as MouseEvent;
              const p = rf.screenToFlowPosition({ x: evt.clientX, y: evt.clientY });
              setMenu({ x: evt.clientX, y: evt.clientY, fx: p.x, fy: p.y });
            }}
            snapToGrid
            snapGrid={[20, 20]}
            fitView
            minZoom={0.2}
            maxZoom={2}
            selectionOnDrag={false}
            deleteKeyCode={["Delete", "Backspace"]}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="#2b2b3f" />
            <MiniMap
              pannable
              zoomable
              // Endings keep gold; everything else takes its act's tint, so
              // the minimap reads as the film's act structure at a glance.
              nodeColor={(n) => {
                const d = n.data as SceneNodeData;
                return d.scene.isEnding ? "#e8b23c" : d.actDot ?? "#2b2b3f";
              }}
              maskColor="rgba(7,7,12,0.75)"
              style={{ background: "#0c0c14" }}
            />
            <Controls showInteractive={false} />
          </ReactFlow>

          {menu && (
            <div
              className="fixed z-[90] border border-noir-600 bg-noir-950 py-1 shadow-2xl"
              style={{ left: menu.x, top: menu.y }}
              role="menu"
            >
              <button
                role="menuitem"
                className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700"
                onClick={() => {
                  addScene(menu.fx, menu.fy);
                  setMenu(null);
                }}
              >
                ＋ Add scene here
              </button>
              <button
                role="menuitem"
                className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700 text-gold"
                onClick={() => {
                  addNoteScene(menu.fx, menu.fy);
                  setMenu(null);
                }}
              >
                📝 Add note here
              </button>
              <button
                role="menuitem"
                className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700 text-neon"
                onClick={() => {
                  addCreditsScene(menu.fx, menu.fy);
                  setMenu(null);
                }}
              >
                🎬 Add credits here
              </button>
              <button
                role="menuitem"
                className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700 text-cyan-neon"
                onClick={() => {
                  addCutsceneScene(menu.fx, menu.fy);
                  setMenu(null);
                }}
              >
                🎥 Add cutscene here
              </button>
              <button
                role="menuitem"
                className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700 text-gold"
                onClick={() => {
                  addStageScene(menu.fx, menu.fy);
                  setMenu(null);
                }}
              >
                🚶 Add walkable stage here
              </button>
              <button
                role="menuitem"
                className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700 text-crimson"
                onClick={() => {
                  addEndScene(menu.fx, menu.fy);
                  setMenu(null);
                }}
              >
                🏁 Add end scene here
              </button>
              {selectedId && (
                <button
                  role="menuitem"
                  className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700 text-crimson"
                  onClick={() => {
                    deleteScene(selectedId);
                    setMenu(null);
                  }}
                >
                  🗑 Delete selected scene
                </button>
              )}
              {clipboardScene.current && (
                <button
                  role="menuitem"
                  className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700 text-cyan-neon"
                  onClick={() => {
                    pasteScene({ x: menu.fx, y: menu.fy });
                    setMenu(null);
                  }}
                >
                  📋 Paste "{clipboardScene.current.title}" here
                </button>
              )}
              <div className="my-1 h-px bg-noir-700" />
              <button
                role="menuitem"
                className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700"
                title="Re-flow every card into act rows — repairs a piled-up canvas"
                onClick={() => {
                  // Tidy layout: one row band per act (when the story has
                  // acts; rows of six otherwise), scenes in authoring order
                  // left → right. Deterministic, undoable, and the fastest
                  // cure for a canvas that has become one pile of cards.
                  const tidy = tidyLayoutPositions(story);
                  mutate((d) => {
                    d.layout = tidy;
                  });
                  say("Canvas tidied — every scene re-flowed into act rows. Ctrl+Z puts it back.");
                  audio.click();
                  setMenu(null);
                  window.setTimeout(() => rf.fitView({ duration: 400 }), 60);
                }}
              >
                🧹 Tidy layout (act rows)
              </button>
              <button
                role="menuitem"
                className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700"
                onClick={() => {
                  rf.fitView({ duration: 400 });
                  setMenu(null);
                }}
              >
                ⤢ Fit view
              </button>
            </div>
          )}

          {/* node right-click menu */}
          {nodeMenu && (() => {
            const target = story.scenes.find((s) => s.id === nodeMenu.sceneId);
            if (!target) return null;
            const isStart = target.id === story.startSceneId;
            return (
              <div
                className="fixed z-[90] min-w-52 border border-noir-600 bg-noir-950 py-1 shadow-2xl"
                style={{ left: nodeMenu.x, top: nodeMenu.y }}
                role="menu"
              >
                <div className="border-b border-noir-700 px-3 py-1 font-pulp text-[9px] uppercase tracking-widest text-gold">
                  {isStart && "★ "}
                  {target.isEnding && "🏁 "}
                  {target.title}
                </div>
                <button role="menuitem" className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700"
                  onClick={() => { setSelectedId(target.id); setTab("scene"); setNodeMenu(null); }}>
                  ✎ Edit scene
                </button>
                <button role="menuitem" className="block w-full px-4 py-1.5 text-left text-xs text-neon hover:bg-noir-700"
                  onClick={() => { onPlay(deepClone(story), { fromSceneId: target.id }); setNodeMenu(null); }}
                  title="Launch the game starting at this scene (fresh state)">
                  ▶ Play from here
                </button>
                <button role="menuitem" className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700"
                  onClick={() => { duplicateScene(target.id); setNodeMenu(null); }}>
                  ⧉ Duplicate node
                </button>
                <button role="menuitem" className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700"
                  onClick={() => { copyScene(target.id); setNodeMenu(null); }}>
                  ⎘ Copy node
                </button>
                {clipboardScene.current && (
                  <button role="menuitem" className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700 text-cyan-neon"
                    onClick={() => { pasteScene({ x: (story.layout?.[target.id]?.x ?? 80) + 48, y: (story.layout?.[target.id]?.y ?? 80) + 48 }); setNodeMenu(null); }}>
                    📋 Paste next to it
                  </button>
                )}
                <div className="my-1 h-px bg-noir-700" />
                <button role="menuitem" className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700 text-gold"
                  onClick={() => {
                    if (!isStart) { commit({ ...story, startSceneId: target.id }); say(`"${target.title}" is now the start scene.`); }
                    setNodeMenu(null);
                  }}>
                  ★ {isStart ? "This is the start scene" : "Set as start scene"}
                </button>
                <button role="menuitem" className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700 text-crimson"
                  onClick={() => {
                    updateScene(target.id, {
                      isEnding: !target.isEnding,
                      endingData: !target.isEnding
                        ? (target.endingData ?? { tier: "victory-silver", headline: "CASE CLOSED", recap: "The story ends here." })
                        : target.endingData,
                    });
                    say(target.isEnding ? `"${target.title}" is now a regular scene.` : `"${target.title}" is now an ending.`);
                    setNodeMenu(null);
                  }}>
                  🏁 {target.isEnding ? "Remove ending flag" : "Mark as ending"}
                </button>
                <button role="menuitem" className="block w-full px-4 py-1.5 text-left text-xs hover:bg-noir-700 text-crimson"
                  onClick={() => { deleteScene(target.id); setNodeMenu(null); }}>
                  🗑 Delete node
                </button>
              </div>
            );
          })()}

          {/* validator drawer */}
          {showValidator && (
            <div className="absolute bottom-0 left-0 right-0 z-30 max-h-40 overflow-y-auto border-t border-noir-600 bg-noir-950/95 px-3 py-2 backdrop-blur">
              <div className="font-pulp text-[9px] uppercase tracking-widest text-paper/50 mb-1">
                Continuity Department — {issues.length ? `${issues.length} note(s)` : "spotless reel 🎉"}
                <span className="ml-2 font-type text-[8px] normal-case tracking-normal text-paper/35">
                  red ERROR blocks Publish &amp; Play · gold WARNING is advisory · click a note to fly to its scene · 🛠 Repair auto-fixes the common ones
                </span>
              </div>
              <ul className="space-y-0.5">
                {issues.map((iss: ValidationIssue, i) => (
                  <li key={i}>
                    <button
                      className={`text-left text-[11px] hover:underline ${iss.severity === "error" ? "text-crimson" : "text-gold"}`}
                      onClick={() => {
                        if (iss.sceneId) {
                          setSelectedId(iss.sceneId);
                          const p = story.layout?.[iss.sceneId];
                          if (p) rf.setCenter(p.x + 110, p.y + 100, { zoom: 1.1, duration: 500 });
                        }
                      }}
                    >
                      {iss.severity === "error" ? "⛔" : "⚠"} {iss.message}
                      {iss.sceneId && <span className="text-paper/40"> — jump to node ↗</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* inspector resize handle */}
        <div
          className="relative z-10 w-1.5 shrink-0 cursor-col-resize border-x border-noir-700/50 bg-noir-800 transition-colors hover:bg-neon/40"
          onPointerDown={beginInspectorResize}
          onPointerMove={moveInspectorResize}
          onPointerUp={endInspectorResize}
          onPointerCancel={endInspectorResize}
          title="Drag to resize the inspector panel"
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[8px] text-paper/40">⋮</span>
        </div>

        {/* inspector */}
        <div
          className="flex shrink-0 flex-col border-l border-noir-600 bg-noir-950"
          style={{ width: inspectorWidth, maxWidth: "75vw" }}
        >
          <div className="flex items-center justify-between border-b border-noir-700 bg-noir-900/50 px-2 py-1">
            <span className="font-pulp text-[9px] uppercase tracking-widest text-paper/45">⚙ Inspector</span>
            <button
              onClick={toggleInspectorWidth}
              className="border border-gold/40 px-2 py-0.5 font-pulp text-[8px] uppercase tracking-widest text-gold hover:bg-gold/10"
              title={inspectorWidth >= 640 ? "Collapse the inspector panel" : "Expand the inspector panel"}
            >
              {inspectorWidth >= 640 ? "⤡ Collapse" : "⤢ Expand"}
            </button>
          </div>
          <div className="grid grid-cols-4 border-b border-noir-600">
            {/* Tab order follows the build: build a SCENE (Scene → Beats →
                Hotspots → Choices → its Audio), then the STORY SETUP it uses
                (Game Objective → Characters → Items → Flags), then STRUCTURE
                (Acts → Episodes) and the in-game look, then ASSETS, then ▶
                Test. Story-wide tabs sit above the scene panels as before. */}
            {(["scene", "beats", "hotspots", "choices", "audio", "briefing", "characters", "items", "flags", "acts", "episodes", "map", "dialogueBox", "globalTitle", "media", "ai", "test"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b border-r border-noir-700 px-1 py-2 font-pulp text-[9px] uppercase tracking-wider ${
                  tab === t ? "bg-noir-800 text-neon" : "text-paper/50 hover:text-paper"
                }`}
              >
                {{
                  scene: "Scene",
                  beats: "Beats",
                  hotspots: "Hotspots",
                  choices: "Choices",
                  audio: "🔊 Audio",
                  briefing: "🎯 Game Objective",
                  characters: "Characters",
                  items: "Items",
                  flags: "🏷 Flags",
                  acts: "🎭 Acts",
                  episodes: "🎞 Episodes",
                  media: "🛠 Media Tools",
                  ai: "🎨 AI Images",
                  map: "🗺 Map",
                  dialogueBox: "🎮 In-Game Theme",
                  globalTitle: "🎼 Newsstand Theme",
                  test: "▶ Test",
                }[t]}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            <CollapsibleSection id="workflow" title="Creator workflow" className="border border-cyan-neon/30 bg-cyan-neon/5">
              <div className="grid grid-cols-5 gap-1 font-type text-[9px] text-center">
                <button onClick={() => setTab("briefing")} className={`border p-1 ${story.briefing?.objective ? "border-emerald-500/40 text-emerald-400" : "border-crimson/50 text-crimson"}`}>
                  1. Case File<br />{story.briefing?.objective ? "✓" : "required"}
                </button>
                <button onClick={() => setTab("characters")} className={`border p-1 ${story.characters.length ? "border-emerald-500/40 text-emerald-400" : "border-crimson/50 text-crimson"}`}>
                  2. Characters<br />{story.characters.length} total
                </button>
                <button onClick={() => setTab("items")} className={`border p-1 ${story.items.length ? "border-emerald-500/40 text-emerald-400" : "border-gold/50 text-gold"}`}>
                  3. Items<br />{story.items.length} total
                </button>
                <button onClick={() => setTab("scene")} className={`border p-1 ${story.scenes.length >= 3 ? "border-emerald-500/40 text-emerald-400" : "border-gold/50 text-gold"}`}>
                  4. Scenes<br />{story.scenes.length} total
                </button>
                <button onClick={() => setTab("test")} className={`border p-1 ${issues.some((i) => i.severity === "error") ? "border-crimson/50 text-crimson" : "border-emerald-500/40 text-emerald-400"}`}>
                  5. Test<br />{issues.length ? `${issues.length} notes` : "✓ ready"}
                </button>
              </div>
            </CollapsibleSection>
            <CollapsibleSection id="readiness" title="Ship Readiness" titleClass="text-gold" className="border border-gold/35 bg-gold/5">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowValidator(true)}
                  className="border border-paper/20 px-2 py-0.5 font-pulp text-[8px] uppercase tracking-widest text-paper/60 hover:border-neon hover:text-neon"
                >
                  Open validator
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1 font-type text-[10px]">
                <div className={story.startSceneId ? "text-emerald-400" : "text-crimson"}> {story.startSceneId ? "✓" : "✖"} Start scene</div>
                <div className={story.scenes.some((s) => s.isEnding) ? "text-emerald-400" : "text-crimson"}> {story.scenes.some((s) => s.isEnding) ? "✓" : "✖"} Ending scene</div>
                <div className={issues.some((i) => i.severity === "error") ? "text-crimson" : "text-emerald-400"}> {issues.some((i) => i.severity === "error") ? "✖" : "✓"} No hard errors</div>
                <div className={story.briefing?.objective ? "text-emerald-400" : "text-gold"}> {story.briefing?.objective ? "✓" : "!"} Case objective</div>
                {!!story.episodes?.length && (() => {
                  const eps = seasonEpisodes(story);
                  const clearable = eps.filter((ep) =>
                    story.scenes.some((sc) => ep.sceneIds.includes(sc.id) && sc.isEnding && sc.endingData?.tier?.startsWith("victory"))
                  ).length;
                  const orphanCount = unassignedScenes(story).length;
                  return (
                    <>
                      <div className={clearable === eps.length ? "text-emerald-400" : "text-crimson"}>
                        {clearable === eps.length ? "✓" : "✖"} {clearable}/{eps.length} episodes clearable
                      </div>
                      <div className={orphanCount ? "text-gold" : "text-emerald-400"}>
                        {orphanCount ? "!" : "✓"} {orphanCount ? `${orphanCount} scene(s) unassigned` : "All scenes in an episode"}
                      </div>
                    </>
                  );
                })()}
              </div>
            </CollapsibleSection>
            <CollapsibleSection id="reference" title="Quick Reference" titleClass="text-gold" className="border border-noir-700 bg-noir-900/70">
              <div className="flex items-center justify-between gap-2">
                <div className="font-type text-[10px] text-paper/55">
                  {story.scenes.length} scenes · {story.characters.length} characters · {story.items.length} items
                </div>
                {scene && <span className="font-pulp text-[9px] uppercase tracking-widest text-neon">Editing: {scene.title}</span>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <div className="mb-1 font-pulp uppercase tracking-wider text-cyan-neon">Characters</div>
                  <div className="flex flex-wrap gap-1">
                    {story.characters.map((c) => (
                      <span key={c.id} className="border border-noir-600 px-1 py-0.5 text-paper/70">{c.name}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 font-pulp uppercase tracking-wider text-crimson">Items</div>
                  <div className="flex flex-wrap gap-1">
                    {story.items.map((i) => (
                      <span key={i.id} className="border border-noir-600 px-1 py-0.5 text-paper/70">{i.icon} {i.name}</span>
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleSection>
            {tab === "test" && (
              <>
                <HelpNote id="test-tab" title="Playtester">
                  Fake the world state here — flags, inventory, meters, trust and memories — then check which choices,
                  hotspots and beats a player could actually reach in the selected scene. Much faster than replaying a
                  whole case to test one gate. The Relationships read-out shows the same opinions the player's 🎭
                  ledger will display in-game.
                </HelpNote>
                <Playtester story={story} scene={scene} />
                <PlaytestCoveragePanel
                  story={story}
                  onSelectScene={(sceneId) => {
                    setSelectedId(sceneId);
                    setTab("scene");
                  }}
                />
              </>
            )}
            {tab === "characters" && (
              <>
                <HelpNote id="characters-tab" title="Characters">
                  Characters voice their dialogue beats (pick a Web Speech voice and audition it with <b>Test voice</b>)
                  and carry a trust score (−5…+5) that gates and consequences can move. Tick{" "}
                  <b>Show this met character on corkboard</b> to make a suspect appear on the deduction board once the
                  player has met them.
                </HelpNote>
                <CharacterEditor story={story} onUpdate={commit} media={media} />
              </>
            )}
            {tab === "items" && (
              <>
                <HelpNote id="items-tab" title="Items">
                  Mark a clue with <b>📌 is clue</b> so it appears on the corkboard. Set a <b>recipe</b> (partner +
                  result) to let players drag one item onto another in the inventory and combine them. Anything a gate
                  requires must be granted somewhere — by a hotspot, a choice's reward, or a recipe result — or the
                  validator flags it as an impossible gate.
                </HelpNote>
                {/* ---- how the inventory is PRESENTED (per case) ---- */}
                {(() => {
                  const inv = story.inventoryDisplay ?? {};
                  const setInv = (patch: Partial<InventorySettings>) =>
                    commit({ ...story, inventoryDisplay: { ...inv, ...patch } });
                  const mode = inv.mode ?? "classic";
                  return (
                    <div className="space-y-1.5 border border-gold/30 bg-gold/5 p-2">
                      <h3 className="font-pulp text-[10px] uppercase tracking-widest text-gold">🎒 Inventory display</h3>
                      <p className="font-type text-[9px] leading-snug text-paper/45">
                        How the player's inventory LOOKS in this case. Every case defaults to <b>Classic</b> — the chip
                        rail it already has — so nothing changes until you opt in. Pick <b>Container</b> for a pouch,
                        case or saddlebag sprite with the items inside it, and drop in your own art; <b>Hidden</b> for
                        no dock at all.
                      </p>
                      <Field label="Mode">
                        <select className={inputCls} value={mode} onChange={(e) => setInv({ mode: e.target.value as InventorySettings["mode"] })}>
                          <option value="classic">Classic — chip rail (default, unchanged)</option>
                          <option value="container">Container — a bag/case sprite with items inside</option>
                          <option value="hidden">Hidden — no on-screen inventory</option>
                        </select>
                      </Field>
                      {mode !== "hidden" ? (
                        <>
                          <Field label="Heading (e.g. Satchel, Saddlebags, Case File)">
                            <input
                              className={inputCls}
                              value={inv.label ?? ""}
                              placeholder="Inventory"
                              onChange={(e) => setInv({ label: e.target.value })}
                            />
                          </Field>
                          <Field label="Corner">
                            <select className={inputCls} value={inv.anchor ?? "bottom-left"} onChange={(e) => setInv({ anchor: e.target.value as InventorySettings["anchor"] })}>
                              <option value="bottom-left">bottom-left</option>
                              <option value="bottom-right">bottom-right</option>
                              <option value="top-left">top-left</option>
                              <option value="top-right">top-right</option>
                            </select>
                          </Field>
                          {mode === "container" ? (
                            <>
                              <Field label="Container art (transparent PNG — a bag, a case, a tool roll)">
                                <AssetDropdown
                                  storyId={story.id}
                                  assetType="image"
                                  returnReference
                                  preferFolder="sprites"
                                  value={inv.image || undefined}
                                  placeholder="Default: the house leather case…"
                                  onChange={(url) => setInv({ image: url ?? undefined })}
                                />
                              </Field>
                              <div className="flex flex-wrap items-center gap-1">
                                <button
                                  className="border border-gold/40 px-2 py-0.5 font-pulp text-[8px] uppercase tracking-widest text-gold hover:bg-gold/10"
                                  onClick={() => setInv({ image: "/assets/ui/inventory-case.png" })}
                                >
                                  👜 use the leather case
                                </button>
                                {inv.image ? (
                                  <button
                                    className="border border-crimson/40 px-2 py-0.5 font-pulp text-[8px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
                                    onClick={() => setInv({ image: undefined })}
                                  >
                                    ✕ clear art (house panel)
                                  </button>
                                ) : null}
                              </div>
                              {inv.image ? (
                                <img src={assetUrl(media(inv.image) ?? inv.image)} alt="" className="h-24 w-auto object-contain" />
                              ) : (
                                <p className="font-type text-[9px] text-paper/40">No art set — the dock draws a stitched leather panel.</p>
                              )}
                              <div className="grid grid-cols-3 gap-1">
                                <Field label={`Columns ${inv.columns ?? 4}`}>
                                  <input type="range" min={1} max={8} step={1} className="w-full accent-gold" value={inv.columns ?? 4} onChange={(e) => setInv({ columns: Number(e.target.value) })} />
                                </Field>
                                <Field label={`Inset ${inv.inset ?? 14}%`}>
                                  <input type="range" min={0} max={45} step={1} className="w-full accent-gold" value={inv.inset ?? 14} onChange={(e) => setInv({ inset: Number(e.target.value) })} />
                                </Field>
                                <Field label={`Height ${inv.height ?? 260}px`}>
                                  <input type="range" min={140} max={460} step={10} className="w-full accent-gold" value={inv.height ?? 260} onChange={(e) => setInv({ height: Number(e.target.value) })} />
                                </Field>
                              </div>
                              <label className="flex items-center gap-1 font-type text-[10px] text-paper/60">
                                <input type="checkbox" checked={!!inv.startClosed} onChange={(e) => setInv({ startClosed: e.target.checked || undefined })} />
                                Start collapsed (just the heading and the count)
                              </label>
                            </>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  );
                })()}
                <ItemEditor story={story} onUpdate={commit} />
              </>
            )}
            {tab === "flags" && (
              <div className="space-y-2">
                <HelpNote id="flags-tab" title="Flags">
                  Every flag used anywhere in the story — choices, gating, hotspots, quick-time
                  timeouts, pattern puzzles, the corkboard and on-enter effects — with a note box
                  for each. Notes are how you keep track of what a flag <b>means</b>, and they double
                  as content: a dialogue beat can <b>recall a flag</b> (pick the flag name in
                  “Memories recalled”) and echo the note where <code>{`{said}`}</code> would go, and
                  the player’s <b>Story so far</b> (Case Progress panel) lists each set flag with its
                  note. Gating’s <b>Remembers</b> picker accepts flag names too — “she remembers you
                  saw the body” without needing a memory tag.
                </HelpNote>
                <h3 className="font-pulp text-[10px] uppercase tracking-widest text-gold">
                  🏷 Story flags ({allFlags.length})
                </h3>
                {allFlags.length === 0 && (
                  <p className="font-type text-[10px] leading-relaxed text-paper/45">
                    No flags yet — set one on a choice (“Sets flags”), a hotspot (Set flag action), a
                    pattern puzzle reward, a quick-time timeout, an on-enter effect, or a corkboard
                    deduction, and it appears here with a note box.
                  </p>
                )}
                {allFlags.map((flag) => {
                  const sources = flagSetSources(story, flag);
                  return (
                    <div key={flag} className="border border-noir-600 p-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-[11px] text-gold" title={flag}>{flag}</span>
                        <span className="truncate font-type text-[9px] uppercase tracking-wider text-paper/35" title={prettyFlagName(flag)}>
                          “{prettyFlagName(flag)}”
                        </span>
                      </div>
                      {sources.length > 0 && (
                        <p className="mt-1 font-type text-[9px] leading-snug text-paper/45">
                          Set: {sources.slice(0, 4).join(" · ")}{sources.length > 4 ? ` · +${sources.length - 4} more` : ""}
                        </p>
                      )}
                      <textarea
                        className={`${inputCls} mt-1.5 h-14 font-type`}
                        placeholder="What does this flag mean? (Echoed when a beat recalls it, and shown in the player's Story so far.)"
                        value={story.flagNotes?.[flag] ?? ""}
                        onChange={(e) => {
                          const notes = { ...(story.flagNotes ?? {}) };
                          if (e.target.value.trim()) notes[flag] = e.target.value;
                          else delete notes[flag];
                          commit({ ...story, flagNotes: Object.keys(notes).length ? notes : undefined });
                        }}
                      />
                    </div>
                  );
                })}
                {/* ---- verb coin: the story's "that doesn't work" lines ---- */}
                <div className="mt-3 border border-gold/30 bg-gold/5 p-2">
                  <h3 className="font-pulp text-[10px] uppercase tracking-widest text-gold">🎛 Verb coin — refusal lines</h3>
                  <p className="mt-1 font-type text-[9px] leading-snug text-paper/45">
                    What the player is told when they try a verb an object doesn't answer to (or use the wrong item
                    on it) in a room with the 🎛 verb coin on. One line per row — the engine varies them, so a failed
                    verb doesn't read like a stuck record. A hotspot's own “Refusal line” beats these.
                  </p>
                  {VERB_IDS.map((v) => (
                    <div key={v} className="mt-1">
                      <div className="font-pulp text-[9px] uppercase tracking-widest text-paper/40">
                        <span aria-hidden>{VERB_ICON[v]}</span> {VERB_LABEL[v]}
                      </div>
                      <textarea
                        className={`${inputCls} h-14 font-type`}
                        placeholder="One refusal line per row…"
                        value={(story.verbResponses?.[v] ?? []).join("\n")}
                        onChange={(e) => {
                          const lines = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
                          const next = { ...(story.verbResponses ?? {}) };
                          if (lines.length) next[v] = lines;
                          else delete next[v];
                          commit({ ...story, verbResponses: Object.keys(next).length ? next : undefined });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab === "acts" && (
              <ActEditor
                story={story}
                onUpdate={commit}
                onSelectScene={(sceneId) => {
                  setSelectedId(sceneId);
                  setTab("scene");
                }}
              />
            )}
            {tab === "map" && (
              <MapEditor story={story} onUpdate={commit} />
            )}
            {tab === "episodes" && (
              <EpisodeEditor
                story={story}
                onUpdate={commit}
                onSelectScene={(sceneId) => {
                  setSelectedId(sceneId);
                  setTab("scene");
                }}
              />
            )}
            {tab === "media" && (
              <>
                <HelpNote id="media-tab" title="Media tools">
                  Uploads are stored once per story and reused everywhere via the asset dropdowns (images in
                  background/foreground pickers, audio in music/narration/voice pickers, video in cutscenes). Drafts
                  keep compact <code>asset:</code> references so big files don't blow the local storage quota — the
                  indicator tells you whether uploads will survive a reload.
                </HelpNote>
                <MediaLibrary storyId={story.id} />
                <BackgroundRemover storyId={story.id} />
                <SheetLab storyId={story.id} />
                <SpriteCutoutLab storyId={story.id} />
              </>
            )}
            {tab === "ai" && <AiImageStudio storyId={story.id} />}
            {tab === "dialogueBox" && (() => {
              const dbox = story.dialogueBox ?? {};
              const setBox = (patch: Partial<typeof dbox>) =>
                commit({ ...story, dialogueBox: { ...dbox, ...patch } });
              const reserve = dbox.reserveLines ?? 3;
              const opacity = dbox.backgroundOpacity ?? 0.85;
              return (
                <div className="space-y-2">
                  <h3 className="font-pulp text-[10px] uppercase tracking-widest text-gold">🎮 In-game theme</h3>
                  <p className="font-type text-[9px] leading-relaxed text-paper/45">
                    Story-wide look: the dialogue panel, the reading text type &amp; size, and the HUD accent colours.
                    Everything here applies to the whole case so the reading surface and HUD stay consistent scene to scene.
                  </p>

                  {/* ---- HUD colour scheme ---- */}
                  <div className="border border-gold/30 bg-gold/5 p-2 space-y-1.5" style={inGameThemeVars(dbox)}>
                    <div className="font-pulp text-[9px] uppercase tracking-widest text-gold">🎨 HUD colour scheme</div>
                    <select
                      className={inputCls}
                      value={dbox.hudTheme ?? "classic"}
                      onChange={(e) => setBox({ hudTheme: (e.target.value || "classic") as never })}
                    >
                      {HUD_THEME_LIST.map((h) => (
                        <option key={h.id} value={h.id}>{h.badge} {h.name} — {h.tagline}</option>
                      ))}
                    </select>
                    <p className="font-type text-[9px] leading-snug text-paper/45">
                      {HUD_THEMES[dbox.hudTheme ?? "classic"]?.tagline}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Custom accent">
                        <input type="color" className={`${inputCls} h-8 p-0.5`}
                          value={dbox.accentColor ?? HUD_THEMES[dbox.hudTheme ?? "classic"].colors.gold}
                          onChange={(e) => setBox({ accentColor: e.target.value })} />
                      </Field>
                      <Field label="Custom danger">
                        <input type="color" className={`${inputCls} h-8 p-0.5`}
                          value={dbox.dangerColor ?? HUD_THEMES[dbox.hudTheme ?? "classic"].colors.crimson}
                          onChange={(e) => setBox({ dangerColor: e.target.value })} />
                      </Field>
                    </div>
                    {(dbox.accentColor || dbox.dangerColor) && (
                      <button
                        className="w-full border border-paper/30 py-1 font-pulp text-[9px] uppercase tracking-widest text-paper/60 hover:text-gold"
                        onClick={() => setBox({ accentColor: undefined, dangerColor: undefined })}
                      >
                        ⟲ Use the scheme colours
                      </button>
                    )}
                    <label className="flex items-start gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                      <input type="checkbox" className="mt-0.5"
                        checked={!!dbox.minimalHud}
                        onChange={(e) => setBox({ minimalHud: e.target.checked || undefined })} />
                      <span>Minimal HUD
                        <span className="block font-type text-[9px] normal-case tracking-normal text-paper/45">
                          Fades scene-label/lead readouts until you hover — a cleaner, more cinematic frame.
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* ---- CURSOR ART (per verb) ---- */}
                  <CursorArtEditor story={story} onUpdate={commit} media={media} themeVars={inGameThemeVars(dbox)} />

                  {/* ---- PLAYER CHARACTER (story-wide walker) ---- */}
                  {(() => {
                    const ps = story.playerSprite ?? {};
                    const setPs = (patch: Partial<typeof ps>) =>
                      commit({ ...story, playerSprite: Object.keys({ ...ps, ...patch }).length ? { ...ps, ...patch } : undefined });
                    return (
                      <div className="border border-gold/30 bg-gold/5 p-2 space-y-1.5">
                        <div className="font-pulp text-[9px] uppercase tracking-widest text-gold">🚶 Player character (story-wide walker)</div>
                        <p className="font-type text-[9px] leading-snug text-paper/45">
                          The walker every 🚶 stage scene uses unless that scene sets its own sprite in the
                          <b> Walkable Stage</b> panel. Define the protagonist ONCE here. Leave empty to keep
                          the per-scene default.
                        </p>
                        <Field label="Character image (emoji:… or image url / asset)">
                          <input
                            className={inputCls}
                            value={ps.image ?? ""}
                            placeholder="emoji:🏍 or /img/… or asset:…"
                            onChange={(e) => setPs({ image: e.target.value || undefined })}
                          />
                        </Field>
                        <div className="space-y-1 border border-cyan-neon/30 bg-cyan-neon/5 p-2">
                          <div className="font-pulp text-[9px] uppercase tracking-widest text-cyan-neon">🎞 Sprite-sheet walker</div>
                          <p className="font-type text-[9px] leading-snug text-paper/45">
                            One image, gridded frames with <b>walk</b> / <b>idle</b> (and optional directional
                            <b> walk-up / walk-down / idle-up / idle-down</b>). Overrides the image field above while set.
                          </p>
                          <SpriteSheetControls
                            value={ps.sheet}
                            storyId={story.id}
                            preset={WALKER_PRESET}
                            onChange={(sheet) => setPs({ sheet })}
                          />
                        </div>
                        {Object.keys(ps).length ? (
                          <button
                            className="w-full border border-paper/30 py-1 font-pulp text-[9px] uppercase tracking-widest text-paper/60 hover:text-gold"
                            onClick={() => commit({ ...story, playerSprite: undefined })}
                          >
                            ⟲ Clear (use per-scene walkers)
                          </button>
                        ) : null}
                      </div>
                    );
                  })()}

                  {/* ---- investigation panels ---- */}
                  <div className="border border-gold/30 bg-gold/5 p-2 space-y-1.5">
                    <div className="font-pulp text-[9px] uppercase tracking-widest text-gold">🗂 Investigation panels</div>
                    <p className="font-type text-[9px] leading-snug text-paper/45">
                      Each panel is automatic: it only appears when this story actually uses the feature
                      (corkboard needs a deduction board, travel map needs 🗺 Map locations). Tick a box to
                      force one OFF for a cleaner frame even when the story defines it.
                    </p>
                    <label className="flex items-start gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                      <input type="checkbox" className="mt-0.5"
                        checked={!!dbox.hideCaseProgress}
                        onChange={(e) => setBox({ hideCaseProgress: e.target.checked || undefined })} />
                      <span>Hide ▤ Case Progress drawer
                        <span className="block font-type text-[9px] normal-case tracking-normal text-paper/45">
                          {story.deduction || story.map?.locations?.length ? "Shown by default." : "Shown by default (tracks perks, people met, clues)."}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                      <input type="checkbox" className="mt-0.5"
                        checked={!!dbox.hideCorkboard}
                        onChange={(e) => setBox({ hideCorkboard: e.target.checked || undefined })} />
                      <span>Hide 📌 Corkboard
                        <span className="block font-type text-[9px] normal-case tracking-normal text-paper/45">
                          {story.deduction ? "This story HAS a deduction board — hiding removes the menu entry and the B key." : "This story has no deduction board, so the corkboard is already hidden automatically."}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                      <input type="checkbox" className="mt-0.5"
                        checked={!!dbox.hideMap}
                        onChange={(e) => setBox({ hideMap: e.target.checked || undefined })} />
                      <span>Hide 🗺 Travel Map
                        <span className="block font-type text-[9px] normal-case tracking-normal text-paper/45">
                          {story.map?.locations?.length ? "This story HAS map locations — hiding removes the menu entry and the T key." : "This story has no map locations yet (add them on the 🗺 Map tab), so the map is already hidden automatically."}
                        </span>
                      </span>
                    </label>
                  </div>

                  {/* ---- text type & size ---- */}
                  <div className="border border-neon/30 bg-neon/5 p-2 space-y-1.5" style={inGameThemeVars(dbox)}>
                    <div className="font-pulp text-[9px] uppercase tracking-widest text-neon">📝 Text type &amp; size</div>
                    <Field label="Body font (prose & dialogue)">
                      <select className={inputCls} value={dbox.bodyFont ?? "type"}
                        onChange={(e) => setBox({ bodyFont: e.target.value as never })}>
                        {BODY_FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Heading font (nameplates, HUD labels)">
                      <select className={inputCls} value={dbox.headingFont ?? "pulp"}
                        onChange={(e) => setBox({ headingFont: e.target.value as never })}>
                        {HEADING_FONTS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </Field>
                    <Field label={`Reading text size ${Math.round((dbox.textScale ?? 1) * 100)}%`}>
                      <input type="range" min={0.8} max={1.4} step={0.05}
                        className="w-full accent-pink-500"
                        value={dbox.textScale ?? 1}
                        onChange={(e) => setBox({ textScale: Number(e.target.value) })} />
                      <p className="mt-1 font-type text-[9px] text-paper/45">
                        Resizes the prose/dialogue text and the reserved line height so the panel stays stable.
                      </p>
                    </Field>
                  </div>

                  <div className="border border-paper/15 p-2 space-y-1.5">
                    <div className="font-pulp text-[9px] uppercase tracking-widest text-paper/70">🗨 Dialogue panel</div>


                  <Field label={`Reserve ${reserve === 0 ? "no" : reserve} line${reserve === 1 ? "" : "s"} of space`}>
                    <input
                      type="range"
                      min={0}
                      max={8}
                      step={1}
                      className="w-full"
                      value={reserve}
                      onChange={(e) => setBox({ reserveLines: parseInt(e.target.value, 10) })}
                    />
                    <p className="mt-1 font-type text-[9px] leading-relaxed text-paper/45">
                      Holds the text area open at a fixed height so the box does not grow while the
                      typewriter runs. Without it the panel resizes on every line and the Back /
                      Skip / narrate buttons move under the player's cursor. Longer prose still
                      expands past the reservation — this is a floor, not a limit.
                      <span className="text-paper/30"> 0 restores the old resizing behaviour.</span>
                    </p>
                  </Field>

                  <Field label="Backdrop image (optional)">
                    <input
                      className={inputCls}
                      placeholder="/img/panel-parchment.jpg  ·  or gradient:linear-gradient(...)"
                      value={dbox.backgroundImage ?? ""}
                      onChange={(e) => setBox({ backgroundImage: e.target.value || undefined })}
                    />
                    <div className="mt-1">
                      <AssetDropdown
                        storyId={story.id}
                        assetType="image"
                        returnReference
                        value={dbox.backgroundImage?.startsWith("asset:") || dbox.backgroundImage?.startsWith("data:") ? dbox.backgroundImage : undefined}
                        onChange={(url) => setBox({ backgroundImage: url ?? undefined })}
                        placeholder="Or pick an uploaded image..."
                      />
                    </div>
                  </Field>

                  <Field label={`Backdrop opacity ${Math.round(opacity * 100)}%`}>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      className="w-full"
                      value={opacity}
                      onChange={(e) => setBox({ backgroundOpacity: parseFloat(e.target.value) })}
                    />
                    <p className="mt-1 font-type text-[9px] text-paper/45">
                      How solid the panel sits over the scene art. Low values keep the shot visible;
                      high values make dialogue easiest to read.
                    </p>
                  </Field>

                  <div className="grid grid-cols-2 gap-1">
                    <Field label="Tint colour">
                      <input
                        type="color"
                        className={`${inputCls} h-8 p-0.5`}
                        value={dbox.backgroundColor ?? "#07080c"}
                        onChange={(e) => setBox({ backgroundColor: e.target.value })}
                      />
                    </Field>
                    <Field label={`Blur ${dbox.backdropBlur ?? 0}px`}>
                      <input
                        type="range"
                        min={0}
                        max={16}
                        step={1}
                        className="w-full"
                        value={dbox.backdropBlur ?? 0}
                        onChange={(e) => setBox({ backdropBlur: parseInt(e.target.value, 10) })}
                      />
                    </Field>
                  </div>

                    <label className="flex items-center gap-2 font-type text-[10px] text-paper/70">
                      <input
                        type="checkbox"
                        checked={!!dbox.bordered}
                        onChange={(e) => setBox({ bordered: e.target.checked })}
                      />
                      Draw a border + drop shadow (reads as a card rather than a gradient)
                    </label>
                  </div>

                  {/* Live preview of the panel against a stand-in scene. */}
                  <div className="mt-2">
                    <p className="mb-1 font-pulp text-[9px] uppercase tracking-widest text-paper/40">Preview — reflects HUD colours, fonts &amp; size</p>
                    <div
                      className="relative h-40 w-full overflow-hidden border border-noir-600"
                      style={{ ...inGameThemeVars(dbox), background: "linear-gradient(135deg,#1b2b3a,#432038 60%,#0b0d12)" }}
                    >
                      {/* a faux HUD label so the accent/heading font is visible */}
                      <div className="absolute left-2 top-2 flex items-center gap-2">
                        <span className="h-2.5 w-[3px] bg-gold" aria-hidden />
                        <span className="font-pulp text-[10px] uppercase tracking-widest text-gold">🎙 Narrator</span>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 p-2">
                        <div
                          className={`relative p-2 ${dbox.bordered ? "border border-paper/15 shadow-2xl shadow-black/60" : ""}`}
                          style={{
                            backgroundColor: dbox.backgroundColor ?? "#07080c",
                            opacity: opacity,
                            ...(dbox.backgroundImage && !dbox.backgroundImage.startsWith("asset:")
                              ? bgStyle(dbox.backgroundImage)
                              : {}),
                          }}
                        >
                          <p
                            className="ingame-prose font-type text-paper"
                            style={{ ["--ingame-text-scale" as string]: String(dbox.textScale ?? 1), minHeight: reserve > 0 ? `${(reserve * 1.375 * (dbox.textScale ?? 1)).toFixed(3)}em` : undefined }}
                          >
                            The rain hadn't let up since Tuesday.
                          </p>
                        </div>
                      </div>
                    </div>
                    <p className="mt-1 font-type text-[9px] text-paper/35">
                      Try a HUD scheme, swap the body font, or move the text-size slider — the preview updates live.
                    </p>
                  </div>
                </div>
              );
            })()}

            {tab === "globalTitle" && (
              <div className="space-y-4">
                <div className="border border-gold/40 bg-gold/5 p-2.5">
                  <div className="font-pulp text-[10px] uppercase tracking-widest text-gold">👑 Global Title Page Theme</div>
                  <p className="font-type text-[9px] text-paper/50 mt-1">
                    These settings apply globally to the main landing menu of Scarlet Reel. Changes are autosaved and applied instantly to the newsstand.
                  </p>
                </div>

                <Field label="Main title text">
                  <input
                    className={inputCls}
                    value={globalTitleTheme.titleText ?? ""}
                    placeholder="Scarlet Reel"
                    onChange={(e) => {
                      const next = { ...globalTitleTheme, titleText: e.target.value };
                      setGlobalTitleThemeState(next);
                      onUpdateTitleTheme(next);
                    }}
                  />
                </Field>

                <Field label="Title page tagline / header text">
                  <input
                    className={inputCls}
                    value={globalTitleTheme.tagline ?? ""}
                    placeholder="A Dime-Store Detective Serial"
                    onChange={(e) => {
                      const next = { ...globalTitleTheme, tagline: e.target.value };
                      setGlobalTitleThemeState(next);
                      onUpdateTitleTheme(next);
                    }}
                  />
                </Field>

                <Field label="Main soundtrack music (paste URL or upload MP3)">
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      <input
                        className={inputCls}
                        placeholder="/audio/main_theme.mp3"
                        value={globalTitleTheme.musicUrl?.startsWith("data:") || globalTitleTheme.musicUrl?.startsWith("asset:") ? "" : globalTitleTheme.musicUrl ?? ""}
                        onChange={(e) => {
                          const next = { ...globalTitleTheme, musicUrl: e.target.value || undefined };
                          setGlobalTitleThemeState(next);
                          onUpdateTitleTheme(next);
                        }}
                      />
                      <MediaUploadButton
                        storyId="__global__"
                        accept="audio/*"
                        label="⇧ Upload"
                        onUploaded={(_url, assetId) => {
                          const next = { ...globalTitleTheme, musicUrl: `asset:${assetId}` };
                          setGlobalTitleThemeState(next);
                          onUpdateTitleTheme(next);
                        }}
                      />
                    </div>
                    <AssetDropdown
                      storyId="__global__"
                      assetType="audio"
                      value={globalTitleTheme.musicUrl}
                      returnReference
                      onChange={(value) => {
                        const next = { ...globalTitleTheme, musicUrl: value };
                        setGlobalTitleThemeState(next);
                        onUpdateTitleTheme(next);
                      }}
                      placeholder="Pick an uploaded main theme..."
                    />
                    {globalTitleTheme.musicUrl && !globalTitleTheme.musicUrl.startsWith("asset:") && (
                      <div className="flex items-center gap-2">
                        <audio controls src={assetUrl(globalTitleTheme.musicUrl)} className="h-8 flex-1" />
                        <button
                          onClick={() => {
                            const next = { ...globalTitleTheme, musicUrl: undefined };
                            setGlobalTitleThemeState(next);
                            onUpdateTitleTheme(next);
                          }}
                          className="border border-crimson/40 px-2 py-0.5 font-pulp text-[9px] uppercase text-crimson hover:bg-crimson/10"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                </Field>

                <Field label="Title page background image (paste URL or upload image)">
                  <div className="space-y-1">
                    <div className="flex gap-1">
                      <input
                        className={inputCls}
                        placeholder="/img/bg-alley.jpg"
                        value={globalTitleTheme.bgImageUrl?.startsWith("data:") || globalTitleTheme.bgImageUrl?.startsWith("asset:") ? "" : globalTitleTheme.bgImageUrl ?? ""}
                        onChange={(e) => {
                          const next = { ...globalTitleTheme, bgImageUrl: e.target.value || undefined };
                          setGlobalTitleThemeState(next);
                          onUpdateTitleTheme(next);
                        }}
                      />
                      <MediaUploadButton
                        storyId="__global__"
                        accept="image/*"
                        label="⇧ Upload"
                        onUploaded={(_url, assetId) => {
                          const next = { ...globalTitleTheme, bgImageUrl: `asset:${assetId}` };
                          setGlobalTitleThemeState(next);
                          onUpdateTitleTheme(next);
                        }}
                      />
                    </div>
                    <AssetDropdown
                      storyId="__global__"
                      assetType="image"
                      value={globalTitleTheme.bgImageUrl}
                      returnReference
                      onChange={(value) => {
                        const next = { ...globalTitleTheme, bgImageUrl: value };
                        setGlobalTitleThemeState(next);
                        onUpdateTitleTheme(next);
                      }}
                      placeholder="Pick an uploaded title background..."
                    />
                    {globalTitleTheme.bgImageUrl && !globalTitleTheme.bgImageUrl.startsWith("asset:") && (
                      <div className="flex items-center gap-2">
                        <img src={assetUrl(globalTitleTheme.bgImageUrl)} alt="Background preview" className="h-14 w-full object-cover" />
                        <button
                          onClick={() => {
                            const next = { ...globalTitleTheme, bgImageUrl: undefined };
                            setGlobalTitleThemeState(next);
                            onUpdateTitleTheme(next);
                          }}
                          className="border border-crimson/40 px-2 py-1 font-pulp text-[10px] uppercase text-crimson hover:bg-crimson/10"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                </Field>

                <Field label="Neon pink glow override color (HEX code)">
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      className="w-10 h-8 border border-noir-600 bg-noir-950 cursor-pointer"
                      value={globalTitleTheme.neonColor ?? "#ff2e88"}
                      onChange={(e) => {
                        const next = { ...globalTitleTheme, neonColor: e.target.value };
                        setGlobalTitleThemeState(next);
                        onUpdateTitleTheme(next);
                      }}
                    />
                    <input
                      className={inputCls}
                      value={globalTitleTheme.neonColor ?? "#ff2e88"}
                      placeholder="#ff2e88"
                      onChange={(e) => {
                        const next = { ...globalTitleTheme, neonColor: e.target.value };
                        setGlobalTitleThemeState(next);
                        onUpdateTitleTheme(next);
                      }}
                    />
                  </div>
                </Field>
              </div>
            )}
            {tab === "briefing" && (
              <div className="space-y-2">
                <HelpNote id="briefing-tab" title="Case File">
                  The objective is always visible to players — leave it blank and they're guessing. Set a{" "}
                  <b>heat limit</b> plus a <b>bust scene</b> for real stakes: the moment Heat reaches the limit the
                  engine sends the player to that ending (“Too much heat. The city closes in.”). The ending audit below
                  counts your victory / game-over outcomes — the validator wants at least one of each.
                </HelpNote>
                <h3 className="font-pulp text-[10px] uppercase tracking-widest text-gold">🗂 Case File — win &amp; lose rules</h3>
                <p className="font-type text-[9px] text-paper/45">Players open this in-game. If you leave it blank they get generic defaults and won't understand your case.</p>
                <Field label="Objective (one line)">
                  <textarea
                    className={`${inputCls} h-14 font-type`}
                    placeholder="What is the detective actually trying to achieve?"
                    value={story.briefing?.objective ?? ""}
                    onChange={(e) => commit({ ...story, briefing: { ...(story.briefing ?? { objective: "", winConditions: [], loseConditions: [] }), objective: e.target.value } })}
                  />
                </Field>
                <Field label="Win conditions (one per line)">
                  <textarea
                    className={`${inputCls} h-24 font-type`}
                    placeholder={"Collect both photo halves\nWire the ledger to Rocco\nAccuse with full evidence"}
                    value={(story.briefing?.winConditions ?? []).join("\n")}
                    onChange={(e) => commit({ ...story, briefing: { ...(story.briefing ?? { objective: "", winConditions: [], loseConditions: [] }), winConditions: e.target.value.split("\n").filter((l) => l.trim()) } })}
                  />
                </Field>
                <Field label="Lose conditions (one per line)">
                  <textarea
                    className={`${inputCls} h-24 font-type`}
                    placeholder={"Accuse without evidence\nLet Heat max out"}
                    value={(story.briefing?.loseConditions ?? []).join("\n")}
                    onChange={(e) => commit({ ...story, briefing: { ...(story.briefing ?? { objective: "", winConditions: [], loseConditions: [] }), loseConditions: e.target.value.split("\n").filter((l) => l.trim()) } })}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-1">
                  <Field label="Heat limit (0 = off)">
                    <input
                      type="number"
                      min={0}
                      max={10}
                      className={inputCls}
                      value={story.briefing?.heatLimit ?? 0}
                      onChange={(e) => commit({ ...story, briefing: { ...(story.briefing ?? { objective: "", winConditions: [], loseConditions: [] }), heatLimit: Math.max(0, Math.min(10, parseInt(e.target.value, 10) || 0)) } })}
                    />
                  </Field>
                  <Field label="Bust scene when heat maxes">
                    <select
                      className={inputCls}
                      value={story.briefing?.heatFailSceneId ?? ""}
                      onChange={(e) => commit({ ...story, briefing: { ...(story.briefing ?? { objective: "", winConditions: [], loseConditions: [] }), heatFailSceneId: e.target.value || undefined } })}
                    >
                      <option value="">— warn only —</option>
                      {story.scenes.filter((s) => s.isEnding).map((s) => (
                        <option key={s.id} value={s.id}>{s.title}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="border border-noir-600 p-2">
                  <div className="mb-1 font-pulp text-[9px] uppercase tracking-widest text-cyan-neon">Ending audit</div>
                  {["victory-gold", "victory-silver", "gameover"].map((tier) => {
                    const count = story.scenes.filter((s) => s.isEnding && s.endingData?.tier === tier).length;
                    return (
                      <div key={tier} className={`font-type text-[10px] ${count ? "text-paper/65" : "text-crimson"}`}>
                        {count ? "✔" : "✖"} {tier}: {count} ending{count === 1 ? "" : "s"}
                        {!count && tier !== "victory-silver" && <span className="ml-1">— players need this outcome</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {tab === "audio" && scene && (
              <div className="space-y-3">
                <HelpNote id="audio-tab" title="Audio">
                  <b>Scene music</b>: “continue” keeps the previous scene's track playing, “play a track” hands off
                  to the file you pick (and loops it), “no music” hands the track OFF — it stops when this scene
                  opens. Set the <b>hand-off</b> length below the selector: 0.0s is a hard cut (the theme stops
                  dead, title-card style), 1–2s is a film-reel crossfade. A track set anywhere keeps playing through
                  every “continue” scene until a scene stops it or switches — so if music is still playing where it
                  shouldn't, the scene it leaked into needs “no music”. The recorded <b>prose narration</b> MP3
                  replaces the robotic Web Speech voice for this scene's prose on first entry.
                </HelpNote>
                <Field label="Scene music">
                  <select
                    className={inputCls}
                    value={scene.musicMode === "none" ? "none" : scene.musicMode === "track" || scene.musicUrl ? "track" : "inherit"}
                    onChange={(e) => {
                      if (e.target.value === "none") {
                        updateScene(scene.id, { musicMode: "none", musicUrl: undefined, sceneAudioUrl: undefined });
                      } else if (e.target.value === "track") {
                        updateScene(scene.id, { musicMode: "track" });
                      } else {
                        updateScene(scene.id, { musicMode: undefined, musicUrl: undefined, sceneAudioUrl: undefined });
                      }
                    }}
                  >
                    <option value="inherit">🔁 Continue previous music — the track keeps playing across scenes</option>
                    <option value="track">🎵 Play a track — hand off to this file (loops until changed)</option>
                    <option value="none">🔇 No music — hand the track OFF here (stop it at the cut)</option>
                  </select>
                </Field>
                {scene.musicMode && scene.musicMode !== "inherit" && (
                  <Field label={`Music hand-off ${(scene.musicFadeSeconds ?? 1.4).toFixed(1)}s`}>
                    <input
                      type="range"
                      min={0}
                      max={6}
                      step={0.1}
                      className="w-full"
                      value={scene.musicFadeSeconds ?? 1.4}
                      onChange={(e) =>
                        updateScene(scene.id, { musicFadeSeconds: parseFloat(e.target.value) })
                      }
                    />
                    <p className="mt-1 font-type text-[9px] text-paper/40">
                      How this scene hands the soundtrack over: the outgoing track ramps down while a new one ramps
                      up (a crossfade). <b className="text-gold">0.0s = a hard cut</b> — the theme stops dead at the
                      scene boundary, the way a title card kills the music sharp. Use it for shock cuts and title
                      sequences; use 1–2s everywhere else.
                    </p>
                  </Field>
                )}
                {(scene.musicMode === "track" || (!scene.musicMode && (scene.musicUrl || scene.sceneAudioUrl))) && (
                  <Field label="Looping music MP3 URL">
                    <div className="flex gap-1">
                      <input
                        className={inputCls}
                        placeholder="/audio/music.mp3 or https://..."
                        value={mediaField(scene.musicUrl ?? scene.sceneAudioUrl)}
                        onChange={(e) => updateScene(scene.id, { musicMode: "track", musicUrl: e.target.value || undefined, sceneAudioUrl: undefined })}
                      />
                      <MediaUploadButton
                        storyId={story.id}
                        accept="audio/*"
                        label="⇧ Upload"
                        onUploaded={(_url, assetId) => updateScene(scene.id, { musicMode: "track", musicUrl: `asset:${assetId}`, sceneAudioUrl: undefined })}
                      />
                    </div>
                    <div className="mt-1">
                      <AssetDropdown
                        storyId={story.id}
                        assetType="audio"
                        returnReference
                        value={scene.musicUrl ?? scene.sceneAudioUrl}
                        onChange={(url) => updateScene(scene.id, { musicMode: "track", musicUrl: url, sceneAudioUrl: undefined })}
                        placeholder="Or use uploaded audio..."
                      />
                    </div>
                    <p className="mt-1 font-type text-[9px] text-paper/40">
                      This track loops until another scene chooses a different track or a scene with <b className="text-crimson">No music</b> is reached.
                    </p>
                    <Field label={`Music level (${Math.round((scene.musicLevel ?? 1) * 100)}%) — loudness of THIS track`}>
                      <input
                        type="range"
                        min={0.1}
                        max={1.6}
                        step={0.05}
                        className="w-full accent-gold"
                        value={scene.musicLevel ?? 1}
                        onChange={(e) => updateScene(scene.id, { musicLevel: parseFloat(e.target.value) })}
                      />
                      <p className="mt-1 font-type text-[9px] text-paper/40">
                        Default starting volume for this scene's track — e.g. lower it for an ambient bed under dialogue, raise it for a title theme.
                        Stacks with the player's own music volume; 100% is the normal level.
                      </p>
                    </Field>
                  </Field>
                )}
                {scene.musicMode === "none" && (
                  <p className="border border-crimson/30 bg-crimson/5 p-2 font-type text-[9px] text-paper/60">
                    🔇 Music stops when the player reaches this scene and stays silent until a later scene picks a track.
                  </p>
                )}
                <Field label="Recorded prose narration MP3 (one-shot, optional)">
                  <div className="flex gap-1">
                    <input
                      className={inputCls}
                      placeholder="/audio/prose.mp3 — replaces Web Speech for this scene"
                      value={mediaField(scene.narrationAudioUrl)}
                      onChange={(e) => updateScene(scene.id, { narrationAudioUrl: e.target.value || undefined })}
                    />
                    <MediaUploadButton
                      storyId={story.id}
                      accept="audio/*"
                      label="⇧ Upload"
                      onUploaded={(_url, assetId) => updateScene(scene.id, { narrationAudioUrl: `asset:${assetId}` })}
                    />
                  </div>
                  <div className="mt-1">
                    <AssetDropdown
                      storyId={story.id}
                      assetType="audio"
                      returnReference
                      value={scene.narrationAudioUrl}
                      onChange={(url) => updateScene(scene.id, { narrationAudioUrl: url })}
                      placeholder="Or use uploaded audio..."
                    />
                  </div>
                </Field>
                <Field label="Narration">
                  <label className="flex items-center gap-2 text-[10px] text-paper/60">
                    <input
                      type="checkbox"
                      checked={scene.autoNarrate !== false}
                      onChange={(e) => updateScene(scene.id, { autoNarrate: e.target.checked })}
                    />
                    Auto-play prose voice on first scene entry
                  </label>
                </Field>
                <p className="font-type text-[10px] text-paper/40">Music loops until the next scene. Recorded narration plays once. If no narration MP3 is set, the selected Web Speech narrator is used.</p>
              </div>
            )}

            {!scene && !["test", "briefing", "characters", "items", "flags", "acts", "episodes", "dialogueBox", "globalTitle", "media", "ai"].includes(tab) && (
              <p className="font-type text-xs text-paper/50">
                Select a scene node on the canvas — or right-click the canvas to spawn a fresh one. Drag from a choice's pink
                handle straight onto another scene to wire the plot.
              </p>
            )}

            {scene && scene.nodeType === "note" && ["scene", "beats", "hotspots", "choices"].includes(tab) && (
              <div className="space-y-3">
                <div className="border border-gold/40 bg-gold/5 p-3">
                  <h3 className="font-pulp text-xs uppercase tracking-widest text-gold">📝 Note placeholder</h3>
                  <p className="mt-1 font-type text-[10px] leading-snug text-paper/60">
                    A marker for a scene that doesn't exist yet. It wires into the graph on both sides, but the game{" "}
                    <b className="text-gold">bypasses</b> it in play — a player who reaches it passes straight through to
                    the scene its right handle points at. When you've written the real scene, convert this note into a
                    full scene (or delete it and re-wire).
                  </p>
                </div>
                <Field label="What belongs here">
                  <textarea
                    className={`${inputCls} h-24 font-type`}
                    value={scene.title}
                    placeholder="e.g. Missing Scene Here"
                    onChange={(e) => updateScene(scene.id, { title: e.target.value })}
                  />
                </Field>
                {(() => {
                  const es = storyEdges(story);
                  const incoming = es.filter((e) => e.target === scene.id);
                  const outgoing = es.filter((e) => e.source === scene.id);
                  const name = (sid: string) => story.scenes.find((s) => s.id === sid)?.title ?? sid;
                  return (
                    <div className="space-y-1.5 border border-noir-600 bg-noir-900/40 p-2 font-type text-[10px] leading-snug text-paper/60">
                      <div>
                        ⬅ <b className="text-paper/80">In from:</b>{" "}
                        {incoming.length
                          ? incoming.map((e) => `${name(e.source)} (“${e.label}”)`).join(" · ")
                          : <span className="text-paper/35">nothing yet — drag a choice handle from a scene into its left side</span>}
                      </div>
                      <div>
                        ➡ <b className="text-paper/80">Route out (bypass target):</b>{" "}
                        {outgoing.length ? name(outgoing[0].target) : <span className="text-crimson">nowhere — a player reaching this note would be stuck</span>}
                      </div>
                    </div>
                  );
                })()}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      updateScene(scene.id, {
                        nodeType: undefined,
                        background: scene.background.startsWith("gradient:") ? BACKGROUNDS[8] : scene.background,
                        prose: scene.prose || "The scene opens on...",
                      });
                      say("Note converted to a full scene — author it in the Scene tab and give it exits.");
                    }}
                    className="flex-1 border border-cyan-neon/50 py-1.5 font-pulp text-[10px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/10"
                  >
                    🎬 Convert to full scene
                  </button>
                  <button
                    onClick={() => deleteScene(scene.id)}
                    className="flex-1 border border-crimson/50 py-1.5 font-pulp text-[10px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
                  >
                    🗑 Delete note
                  </button>
                </div>
              </div>
            )}

            {scene && scene.nodeType !== "note" && tab === "scene" && (
              <>
                <HelpNote id="scene-tab" title="Scene tab">
                  The <b>background</b> accepts an image path (e.g. <code>/img/alley.jpg</code>), a{" "}
                  <code>gradient:…</code> CSS gradient, an uploaded asset (<code>asset:…</code>), or{" "}
                  <code>video:…</code> to override the image with a video. Toggle <b>Start scene</b> on the case's
                  entry node, and <b>This scene is an ending</b> to unlock tier / headline / recap. The{" "}
                  <b>End-of-part route chart</b> field makes this scene a part boundary — its flowchart (and, across
                  an act boundary, the act's route map) plays when the player leaves it. Deeper polish — camera
                  moves, light glows, letterbox — lives in the cinematic sections below.
                </HelpNote>
                <CollapsibleSection id={`scene-${scene.id}-basics`} title="🪪 Scene basics" defaultOpen>
                <Field label="Scene id">
                  <input className={inputCls} value={scene.id} disabled />
                </Field>
                <Field label="Node Layout Type">
                  <select
                    className={inputCls}
                    value={scene.nodeType ?? "standard"}
                    onChange={(e) => updateScene(scene.id, { nodeType: e.target.value === "standard" ? undefined : e.target.value as any })}
                  >
                    <option value="standard">📁 Standard Game Scene (with HUD)</option>
                    <option value="credits">🎬 Opening Credits (Centered text, NO HUD)</option>
                    <option value="cutscene">🎥 Cinematic Cutscene (Widescreen, NO HUD)</option>
                    <option value="stage">🚶 Walkable Stage (free-roam exploration)</option>
                  </select>
                </Field>
                </CollapsibleSection>
                {(scene.nodeType === "credits" || scene.nodeType === "cutscene") && (
                  <Field label="⏳ Cinematic hold — seconds before choices appear (0 = instant)">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={120}
                        className={inputCls}
                        value={scene.choiceDelaySeconds ?? 0}
                        onChange={(e) =>
                          updateScene(scene.id, {
                            choiceDelaySeconds: Math.max(0, Math.min(120, parseInt(e.target.value, 10) || 0)) || undefined,
                          })
                        }
                      />
                      <span className="shrink-0 font-type text-[9px] text-paper/40">seconds</span>
                    </div>
                      <p className="mt-1 font-type text-[9px] text-paper/40">
                        Holds the scene's continue button and choices for this long so the cinematic can breathe before the player can proceed.
                      </p>
                    </Field>
                )}
                {/* A beat-level auto route already ends this scene: the scene
                    timer is redundant (and could fight it), so hide it and tell
                    the author where to edit instead. */}
                {(scene.dialogueBeats ?? []).some((beat) => beat.afterBeatTargetSceneId && (beat.afterBeatMode ?? "auto") === "auto") ? (
                  <div className="space-y-1 border border-cyan-neon/20 bg-cyan-neon/5 p-2">
                    <div className="font-pulp text-[9px] uppercase tracking-widest text-cyan-neon">⏱ Auto-advance</div>
                    <p className="font-type text-[9px] leading-snug text-paper/50">
                      A final beat on this scene is set to <b>auto-continue to another scene</b>, so the scene-level
                      auto-advance timer is hidden (the beat cut is the timer). Edit it on that beat in the Beats tab.
                    </p>
                  </div>
                ) : (
                <div className="space-y-2 border border-cyan-neon/30 bg-cyan-neon/5 p-2">
                  <div className="font-pulp text-[9px] uppercase tracking-widest text-cyan-neon">⏱ Auto-advance when no choices are available</div>
                  <Field label="Target scene">
                    <select
                      className={inputCls}
                      value={scene.autoAdvanceTargetSceneId ?? ""}
                      onChange={(e) =>
                        updateScene(scene.id, {
                          autoAdvanceTargetSceneId: e.target.value || undefined,
                          autoAdvanceDelaySeconds: e.target.value ? scene.autoAdvanceDelaySeconds ?? 3 : undefined,
                          autoAdvanceHideTimer: e.target.value ? scene.autoAdvanceHideTimer : undefined,
                        })
                      }
                    >
                      <option value="">Off — wait for choices / player input</option>
                      {story.scenes
                        .filter((candidate) => candidate.id !== scene.id)
                        .map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.title}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="Timer before transition">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={600}
                        className={inputCls}
                        value={scene.autoAdvanceDelaySeconds ?? 3}
                        disabled={!scene.autoAdvanceTargetSceneId}
                        onChange={(e) =>
                          updateScene(scene.id, {
                            autoAdvanceDelaySeconds: Math.max(0, Math.min(600, parseInt(e.target.value, 10) || 0)),
                          })
                        }
                      />
                      <span className="shrink-0 font-type text-[9px] text-paper/40">seconds</span>
                    </div>
                    <label className="mt-2 flex items-center gap-2 font-type text-[10px] text-paper/65">
                      <input
                        type="checkbox"
                        disabled={!scene.autoAdvanceTargetSceneId}
                        checked={!!scene.autoAdvanceHideTimer}
                        onChange={(e) => updateScene(scene.id, { autoAdvanceHideTimer: e.target.checked || undefined })}
                      />
                      Hide countdown timer in player
                    </label>
                    <p className="mt-1 font-type text-[9px] text-paper/40">
                      Runs after prose, dialogue and the cinematic hold finish, but only if the scene currently has no selectable choices to show.
                    </p>
                  </Field>
                </div>
                )}
                {scene.nodeType === "credits" && (
                  <div className="space-y-2 border border-gold/40 bg-gold/5 p-2">
                    <div className="font-pulp text-[9px] uppercase tracking-widest text-gold">🎬 Credits intro</div>

                    {/* Look presets — one click sets the whole style bundle.
                        Authored text and montage stills are never touched.
                        Grouped into sections, and every card previews itself:
                        the preset's own typeface, title colour and a one-line
                        knob read-out. */}
                    {(() => {
                      const matchedPreset = matchCreditsPreset(scene.credits);
                      return (
                        <div className="space-y-1.5 border border-gold/25 bg-noir-950/40 p-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-pulp text-[9px] uppercase tracking-widest text-gold">Look presets</span>
                            <span className="font-type text-[8px] text-paper/40">
                              {matchedPreset ? (
                                <>
                                  matches: <b className="text-gold/90">{CREDITS_PRESETS[matchedPreset].name}</b>
                                </>
                              ) : (
                                "custom look"
                              )}
                            </span>
                          </div>
                          {CREDITS_PRESET_GROUPS.map((g) => {
                            const presets = CREDITS_PRESET_LIST.filter((p) => p.group === g.id);
                            if (!presets.length) return null;
                            return (
                              <div key={g.id}>
                                <div className="mb-1 flex items-baseline justify-between gap-2">
                                  <span className="font-pulp text-[8px] uppercase tracking-widest text-paper/45">{g.label}</span>
                                  <span className="truncate font-type text-[7.5px] italic text-paper/30">{g.blurb}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                                  {presets.map((p) => {
                                    const isSel = matchedPreset === p.id;
                                    const sampleColor = p.look.titleColor ?? p.swatch;
                                    return (
                                      <button
                                        key={p.id}
                                        type="button"
                                        title={p.tagline}
                                        onClick={() => updateScene(scene.id, { credits: applyCreditsPreset(p.id, scene.credits) })}
                                        className={`relative flex flex-col items-start rounded border p-1.5 text-left transition-all ${
                                          isSel
                                            ? "border-gold bg-gold/15 shadow-[0_0_8px_rgba(232,178,60,0.3)]"
                                            : "border-noir-700 bg-noir-950/70 hover:border-paper/40 hover:bg-noir-800"
                                        }`}
                                      >
                                        {isSel && <span className="absolute right-1 top-1 text-[8px] text-gold">✓</span>}
                                        {/* The look's own typeface + title colour —
                                            the card is its own preview. */}
                                        <span
                                          className="block w-full truncate text-[13px] leading-tight uppercase"
                                          style={{
                                            fontFamily: CREDITS_FONT_VAR[p.look.font ?? "pulp"] ?? CREDITS_FONT_VAR.pulp,
                                            color: sampleColor,
                                            textShadow: `0 0 7px ${sampleColor}55`,
                                          }}
                                        >
                                          {p.name}
                                        </span>
                                        <span className="mt-0.5 w-full truncate font-type text-[7.5px] text-paper/50">{p.badge}</span>
                                        <span className="mt-0.5 block w-full truncate font-type text-[7px] text-paper/35" title={creditsLookSummary(p.look)}>
                                          {creditsLookSummary(p.look)}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                          <p className="pt-0.5 font-type text-[8.5px] italic leading-snug text-paper/50">
                            {matchedPreset
                              ? CREDITS_PRESETS[matchedPreset].tagline
                              : "One click sets the typeface, motion, colours, gate weave and pacing — your title, credit lines and montage stills are kept. Every knob below stays editable."}
                          </p>
                        </div>
                      );
                    })()}

                    <Field label="Title">
                      <input
                        className={inputCls}
                        placeholder="Defaults to prose line 1"
                        value={scene.credits?.title ?? ""}
                        onChange={(e) => updateScene(scene.id, { credits: { ...(scene.credits ?? {}), title: e.target.value || undefined } })}
                      />
                    </Field>
                    <Field label="Subheading">
                      <input
                        className={inputCls}
                        placeholder="Defaults to prose line 2"
                        value={scene.credits?.subtitle ?? ""}
                        onChange={(e) => updateScene(scene.id, { credits: { ...(scene.credits ?? {}), subtitle: e.target.value || undefined } })}
                      />
                    </Field>

                    <Field label="Credits lines (role → name)">
                      <div className="space-y-1">
                        {(scene.credits?.lines ?? []).map((line, i) => (
                          <div key={i} className="flex items-center gap-1">
                            <input
                              className={inputCls}
                              placeholder="Role"
                              value={line.role}
                              onChange={(e) =>
                                mutate((d) => {
                                  const sc = d.scenes.find((x) => x.id === scene.id)!;
                                  const lines = [...(sc.credits?.lines ?? [])];
                                  lines[i] = { ...lines[i], role: e.target.value };
                                  sc.credits = { ...(sc.credits ?? {}), lines };
                                })
                              }
                            />
                            <input
                              className={inputCls}
                              placeholder="Name"
                              value={line.name}
                              onChange={(e) =>
                                mutate((d) => {
                                  const sc = d.scenes.find((x) => x.id === scene.id)!;
                                  const lines = [...(sc.credits?.lines ?? [])];
                                  lines[i] = { ...lines[i], name: e.target.value };
                                  sc.credits = { ...(sc.credits ?? {}), lines };
                                })
                              }
                            />
                            <button
                              className="shrink-0 text-crimson hover:underline"
                              title="Remove line"
                              onClick={() =>
                                mutate((d) => {
                                  const sc = d.scenes.find((x) => x.id === scene.id)!;
                                  sc.credits = { ...(sc.credits ?? {}), lines: (sc.credits?.lines ?? []).filter((_, idx) => idx !== i) };
                                })
                              }
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          className="w-full border border-cyan-neon/40 py-1 font-pulp text-[9px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/10"
                          onClick={() =>
                            mutate((d) => {
                              const sc = d.scenes.find((x) => x.id === scene.id)!;
                              sc.credits = { ...(sc.credits ?? {}), lines: [...(sc.credits?.lines ?? []), { role: "", name: "Name" }] };
                            })
                          }
                        >
                          ＋ Add credits line
                        </button>
                      </div>
                    </Field>

                    <Field label="Title typeface">
                      <select
                        className={inputCls}
                        value={scene.credits?.font ?? "pulp"}
                        onChange={(e) =>
                          updateScene(scene.id, {
                            credits: { ...(scene.credits ?? {}), font: e.target.value as CreditsSettings["font"] },
                          })
                        }
                      >
                        <option value="pulp">Alfa Slab One — heavy pulp slab</option>
                        <option value="poster">Bebas Neue — condensed film poster</option>
                        <option value="elegant">Playfair Display — prestige serif</option>
                        <option value="epic">Cinzel — chiselled Roman caps</option>
                        <option value="modern">Josefin Sans — light geometric</option>
                        <option value="type">Newsreader — clean literary serif</option>
                      </select>
                      <p className="mt-1 font-type text-[9px] text-paper/40">
                        Tracking is tuned per face. Long titles step down a size automatically.
                      </p>
                    </Field>
                    {scene.credits?.style === "cards" && (
                      <Field label="Card motion">
                        <select
                          className={inputCls}
                          value={scene.credits?.cardMotion ?? "blur-rise"}
                          onChange={(e) =>
                            updateScene(scene.id, {
                              credits: {
                                ...(scene.credits ?? {}),
                                cardMotion: e.target.value as CreditsSettings["cardMotion"],
                              },
                            })
                          }
                        >
                          <option value="blur-rise">Blur rise — lifts out of soft focus</option>
                          <option value="letterspace">Letterspace — tracking pulls in, releases</option>
                          <option value="scale-down">Scale down — settles from oversize</option>
                          <option value="slide">Slide — drifts across frame</option>
                          <option value="flicker">Flicker — failing neon</option>
                          <option value="fade">Fade — plain dissolve</option>
                          <option value="slam">Slam — lands oversized, snaps to size (Tarantino chapter card)</option>
                        </select>
                        <p className="mt-1 font-type text-[9px] text-paper/40">
                          Every motion keyframes to the same in/hold/out schedule, so changing it
                          never changes the sequence length.
                        </p>
                      </Field>
                    )}

                    <Field label="Gate weave (35mm)">
                      <select
                        className={inputCls}
                        value={scene.credits?.gateWeave ?? "off"}
                        onChange={(e) =>
                          updateScene(scene.id, {
                            credits: {
                              ...(scene.credits ?? {}),
                              gateWeave: e.target.value as CreditsSettings["gateWeave"],
                            },
                          })
                        }
                      >
                        <option value="off">Off — locked off, digital</option>
                        <option value="subtle">Subtle — well-kept projector</option>
                        <option value="worn">Worn — print that has done the rounds</option>
                        <option value="projector">Projector — tired machine, splice bumps</option>
                      </select>
                      <p className="mt-1 font-type text-[9px] text-paper/40">
                        Optical titles were married to the picture on a second pass, so the type
                        drifted: a slow sideways sway from slop in the perforations, plus a
                        one-frame registration error from the pulldown claw. Suppressed under
                        reduced-motion.
                      </p>
                    </Field>

                    <Field label="Title entrance">
                      <select
                        className={inputCls}
                        value={scene.credits?.titleEntrance ?? "fade-up"}
                        onChange={(e) =>
                          updateScene(scene.id, { credits: { ...(scene.credits ?? {}), titleEntrance: e.target.value as CreditsSettings["titleEntrance"] } })
                        }
                      >
                        <option value="fade-up">⤴ Fade &amp; rise</option>
                        <option value="typewriter">⌨ Typewriter</option>
                        <option value="slam">💥 Slam — punches in oversized</option>
                      </select>
                    </Field>
                    <Field label="Title colour (leave blank for neon gold)">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          className="h-7 w-10 cursor-pointer border border-noir-600 bg-noir-950"
                          value={scene.credits?.titleColor ?? "#e8b23c"}
                          onChange={(e) =>
                            updateScene(scene.id, { credits: { ...(scene.credits ?? {}), titleColor: e.target.value } })
                          }
                          title="The big title's own colour — the glow re-tints to match"
                        />
                        <input
                          className={inputCls}
                          placeholder="#f5c518 (e.g. Tarantino yellow) — blank = default gold"
                          value={scene.credits?.titleColor ?? ""}
                          onChange={(e) =>
                            updateScene(scene.id, { credits: { ...(scene.credits ?? {}), titleColor: e.target.value.trim() || undefined } })
                          }
                        />
                      </div>
                    </Field>
                    <Field label="Credits style">
                      <select
                        className={inputCls}
                        value={scene.credits?.style ?? "fade-up"}
                        onChange={(e) => updateScene(scene.id, { credits: { ...(scene.credits ?? {}), style: e.target.value as CreditsSettings["style"] } })}
                      >
                        <option value="fade-up">⤴ Staggered fade-up</option>
                        <option value="scroll">📜 Rolling scroll</option>
                        <option value="cards">🎬 Title cards (one at a time)</option>
                      </select>
                    </Field>
                    {scene.credits?.style === "cards" && (
                      <Field label={`Seconds per card ${(scene.credits?.cardSeconds ?? 3.4).toFixed(1)}s`}>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={1.2}
                            max={8}
                            step={0.2}
                            value={scene.credits?.cardSeconds ?? 3.4}
                            onChange={(e) =>
                              updateScene(scene.id, {
                                credits: { ...(scene.credits ?? {}), cardSeconds: parseFloat(e.target.value) },
                              })
                            }
                            className="w-full"
                          />
                        </div>
                        <p className="mt-1 font-type text-[9px] text-paper/40">
                          Each credit fades in, holds, then fades out before the next.
                          Sequence runs {(((scene.credits?.lines?.length ?? 0) + 2) * (scene.credits?.cardSeconds ?? 3.4)).toFixed(0)}s.
                        </p>
                      </Field>
                    )}

                    {/* Montage — cross-dissolving stills behind the titles */}
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-pulp text-[9px] uppercase tracking-widest text-gold/80">Title montage stills</span>
                        <span className="font-type text-[8px] text-paper/40">{scene.credits?.montage?.length ?? 0} stills</span>
                      </div>
                      <p className="mb-1 font-type text-[9px] text-paper/40">
                        Stills cross-dissolve full-bleed behind the credits, replacing the scene background. Leave empty for a single static plate.
                      </p>
                      <div className="space-y-1">
                        {(scene.credits?.montage ?? []).map((m, i) => {
                          const arr = scene.credits?.montage ?? [];
                          const setMontage = (next: string[] | undefined) => updateScene(scene.id, { credits: { ...(scene.credits ?? {}), montage: next } });
                          return (
                            <div key={i} className="flex items-center gap-1 border border-noir-700/60 p-1">
                              <span className="w-4 shrink-0 text-center font-pulp text-[10px] text-paper/50">{i + 1}</span>
                              <img src={assetUrl(media(m) ?? m)} alt="" className="h-8 w-12 shrink-0 object-cover border border-noir-600 bg-noir-950" />
                              <span className="min-w-0 flex-1 truncate font-type text-[9px] text-paper/45" title={m}>
                                {m.startsWith("asset:") ? "uploaded" : m.startsWith("data:") ? "(embedded)" : (m.split("/").pop() ?? m)}
                              </span>
                              <button className="px-1 text-[10px] text-paper/50 hover:text-gold disabled:opacity-25" disabled={i === 0} title="Move earlier"
                                onClick={() => { const a = [...arr]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setMontage(a); }}>▲</button>
                              <button className="px-1 text-[10px] text-paper/50 hover:text-gold disabled:opacity-25" disabled={i === arr.length - 1} title="Move later"
                                onClick={() => { const a = [...arr]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setMontage(a); }}>▼</button>
                              <button className="px-1 text-[10px] text-crimson hover:underline" title="Remove this still"
                                onClick={() => setMontage(arr.filter((_, idx) => idx !== i).length ? arr.filter((_, idx) => idx !== i) : undefined)}>✕</button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-1 flex gap-1">
                        <ImagePicker
                          storyId={story.id}
                          includeBuiltins
                          includeGradients={false}
                          allowClear={false}
                          onChange={(url) => { if (!url) return; updateScene(scene.id, { credits: { ...(scene.credits ?? {}), montage: [...(scene.credits?.montage ?? []), url] } }); }}
                          placeholder="＋ Add a still…"
                        />
                        <MediaUploadButton
                          storyId={story.id}
                          accept="image/*"
                          label="⇧ Upload"
                          onUploaded={(_u, assetId) => { updateScene(scene.id, { credits: { ...(scene.credits ?? {}), montage: [...(scene.credits?.montage ?? []), `asset:${assetId}`] } }); }}
                        />
                      </div>
                    </div>
                    {(scene.credits?.montage?.length ?? 0) > 0 && (
                      <>
                        <Field label={`Seconds per still ${(scene.credits?.montageSeconds ?? 5).toFixed(1)}s`}>
                          <input
                            type="range"
                            min={2}
                            max={12}
                            step={0.5}
                            value={scene.credits?.montageSeconds ?? 5}
                            onChange={(e) =>
                              updateScene(scene.id, {
                                credits: { ...(scene.credits ?? {}), montageSeconds: parseFloat(e.target.value) },
                              })
                            }
                            className="w-full"
                          />
                          <p className="mt-1 font-type text-[9px] text-paper/40">
                            {(scene.credits?.montage?.length ?? 0)} stills ·{" "}
                            {((scene.credits?.montage?.length ?? 0) * (scene.credits?.montageSeconds ?? 5)).toFixed(0)}s
                            per pass
                          </p>
                        </Field>
                        <Field label="Still transition">
                          <select
                            className={inputCls}
                            value={scene.credits?.montageTransition ?? "dissolve"}
                            onChange={(e) =>
                              updateScene(scene.id, {
                                credits: { ...(scene.credits ?? {}), montageTransition: e.target.value as CreditsSettings["montageTransition"] },
                              })
                            }
                          >
                            <option value="dissolve">Dissolve — long cross-fade</option>
                            <option value="cut">Cut — hard cut, still to still (Tarantino title sequence)</option>
                          </select>
                        </Field>
                        <label className="flex items-center gap-2 py-1 font-type text-[10px] text-paper/70">
                          <input
                            type="checkbox"
                            checked={scene.credits?.montageLoop ?? true}
                            onChange={(e) =>
                              updateScene(scene.id, {
                                credits: { ...(scene.credits ?? {}), montageLoop: e.target.checked },
                              })
                            }
                          />
                          Loop montage (off = hold on the last still)
                        </label>
                      </>
                    )}
                    <Field label={`Line stagger ${(scene.credits?.stagger ?? 0.4).toFixed(2)}s`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={0.05}
                          value={scene.credits?.stagger ?? 0.4}
                          className="flex-1 accent-pink-500"
                          onChange={(e) => updateScene(scene.id, { credits: { ...(scene.credits ?? {}), stagger: Number(e.target.value) } })}
                        />
                        <span className="w-9 text-right font-type text-[10px] text-paper/70">{(scene.credits?.stagger ?? 0.4).toFixed(2)}s</span>
                      </div>
                    </Field>
                    <Field label={`Line duration ${(scene.credits?.duration ?? 0.85).toFixed(2)}s`}>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={0.2}
                          max={2}
                          step={0.05}
                          value={scene.credits?.duration ?? 0.85}
                          className="flex-1 accent-pink-500"
                          onChange={(e) => updateScene(scene.id, { credits: { ...(scene.credits ?? {}), duration: Number(e.target.value) } })}
                        />
                        <span className="w-9 text-right font-type text-[10px] text-paper/70">{(scene.credits?.duration ?? 0.85).toFixed(2)}s</span>
                      </div>
                    </Field>
                    {(scene.credits?.style ?? "fade-up") === "scroll" && (
                      <Field label={`Scroll loop ${scene.credits?.scrollDuration ?? 24}s`}>
                        <input
                          type="number"
                          min={6}
                          max={120}
                          step={1}
                          className={inputCls}
                          value={scene.credits?.scrollDuration ?? 24}
                          onChange={(e) => updateScene(scene.id, { credits: { ...(scene.credits ?? {}), scrollDuration: Number(e.target.value) || 24 } })}
                        />
                      </Field>
                    )}
                    <Field label="Accent colour">
                      <input
                        type="color"
                        className="h-8 w-full cursor-pointer border border-noir-600 bg-noir-950"
                        value={scene.credits?.accentColor ?? "#2ad9d9"}
                        onChange={(e) => updateScene(scene.id, { credits: { ...(scene.credits ?? {}), accentColor: e.target.value } })}
                      />
                    </Field>
                    <p className="font-type text-[9px] text-paper/45">
                      Title, subheading and credits lines are optional — leave them blank to fall back to the scene's prose (line 1 =
                      title, line 2 = subheading, the rest = name-only lines).
                    </p>
                  </div>
                )}
                <CollapsibleSection id={`scene-${scene.id}-title`} title="🏷 Title & notes" defaultOpen>
                <Field label="Title">
                  <input className={inputCls} value={scene.title} onChange={(e) => updateScene(scene.id, { title: e.target.value })} />
                </Field>
                <label className="flex items-center gap-2 border border-cyan-neon/20 bg-cyan-neon/5 px-2 py-1 text-[10px] uppercase tracking-wider text-paper/60">
                  <input
                    type="checkbox"
                    checked={!!scene.hideSceneTitle}
                    onChange={(e) => updateScene(scene.id, { hideSceneTitle: e.target.checked || undefined })}
                  />
                  🚫 Hide this title in-game (no title card on scene start)
                </label>

                <Field label="Note (shows on the canvas card)">
                  <textarea
                    className={`${inputCls} h-14 resize-y leading-snug`}
                    placeholder="Author's sticky for this node — what it's for, what not to touch, where it sits in the story…"
                    value={scene.note ?? ""}
                    onChange={(e) => updateScene(scene.id, { note: e.target.value || undefined })}
                  />
                </Field>

                </CollapsibleSection>
                <CollapsibleSection id={`scene-${scene.id}-look`} title="🖼 Look, atmosphere & camera">
                <Field label="Background image / gradient">
                  {scene.background.startsWith("video:") ? (
                    <p className="border border-gold/30 bg-gold/5 px-2 py-1 font-type text-[10px] text-gold">
                      🎥 Video cutscene active — remove it below to pick an image.
                    </p>
                  ) : (
                    <ImagePicker
                      value={scene.background}
                      onChange={(v) => updateScene(scene.id, { background: v ?? BACKGROUNDS[0] })}
                      storyId={story.id}
                      includeBuiltins
                      includeGradients
                      allowClear={false}
                      placeholder="Browse all images…"
                    />
                  )}
                  <div className="mt-1 flex gap-1">
                    <MediaUploadButton
                      storyId={story.id}
                      accept="image/*"
                      label="⇧ Upload image"
                      onUploaded={(_url, assetId) => updateScene(scene.id, { background: `asset:${assetId}` })}
                    />
                    {(scene.background.startsWith("data:") || scene.background.startsWith("asset:")) && (
                      <button
                        onClick={() => updateScene(scene.id, { background: BACKGROUNDS[0] })}
                        className="border border-crimson/40 px-2 py-1 font-pulp text-[10px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
                      >
                        ✕ Remove uploaded image
                      </button>
                    )}
                  </div>
                  <p className="mt-1 font-type text-[9px] text-paper/40">
                    Browse every built-in scene plus your {uploadedImages.length} uploaded image{uploadedImages.length === 1 ? "" : "s"} — hover any name to preview it.
                    {storageAvailable === false && (
                      <span className="text-crimson"> ⚠ This browser can't store files — uploads won't survive a reload.</span>
                    )}
                  </p>
                </Field>
                <Field label="🎥 Video cutscene (overrides the background image above)">
                  <div className="flex gap-1">
                    <MediaUploadButton
                      storyId={story.id}
                      accept="video/*"
                      label="⇧ Upload video"
                      onUploaded={(_url, assetId) => updateScene(scene.id, { background: `video:asset:${assetId}` })}
                    />
                    {scene.background.startsWith("video:") && (
                      <button
                        onClick={() => updateScene(scene.id, { background: BACKGROUNDS[0] })}
                        className="border border-crimson/40 px-2 py-1 font-pulp text-[10px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
                      >
                        ✕ Remove video, use image instead
                      </button>
                    )}
                  </div>
                  <div className="mt-1">
                    <AssetDropdown
                      storyId={story.id}
                      assetType="video"
                      returnReference
                      value={scene.background.startsWith("video:") ? scene.background.slice(6) : undefined}
                      onChange={(url) => updateScene(scene.id, { background: url ? `video:${url}` : BACKGROUNDS[0] })}
                      placeholder="Or pick a previously uploaded video..."
                    />
                  </div>
                </Field>
                <div className="border border-noir-600 p-1">
                  <div className="mb-1 font-pulp text-[9px] uppercase tracking-widest text-paper/40">Live preview</div>
                  {scene.background.startsWith("video:") ? (
                    <video src={assetBackground(media(scene.background) ?? scene.background).slice(6)} className="h-24 w-full object-cover" muted loop autoPlay />
                  ) : (
                    <div className="h-20 w-full" style={bgStyle(media(scene.background) ?? scene.background)} />
                  )}
                </div>
                <Field label="Ambient loop (synth)">
                  <select
                    className={inputCls}
                    value={scene.ambientAudio ?? "none"}
                    onChange={(e) => updateScene(scene.id, { ambientAudio: e.target.value })}
                  >
                    {AMBIENTS.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Particle Effects (Weather/Atmosphere)">
                  <select
                    className={inputCls}
                    value={scene.particles ?? ""}
                    onChange={(e) => updateScene(scene.id, { particles: e.target.value ? (e.target.value as any) : undefined })}
                  >
                    <option value="">Auto (based on audio loop)</option>
                    <option value="none">🚫 None (Off)</option>
                    <option value="rain">🌧️ Rain</option>
                    <option value="smoke">💨 Smoke</option>
                    <option value="storm">⛈️ Storm — rain, lightning &amp; thunder</option>
                  </select>
                </Field>

                {/* ---- Stage node — free-roam walkable exploration ---- */}
                <CollapsibleSection id={`scene-stage-${scene.id}`} title="🚶 Walkable Stage (free-roam)">
                  <div className="space-y-2">
                    {scene.nodeType !== "stage" ? (
                      <p className="border border-gold/30 bg-gold/5 p-2 font-type text-[10px] leading-snug text-paper/60">
                        These settings only run on a <b>🚶 Walkable Stage</b> node — set <b>Node Layout Type</b> above to
                        "🚶 Walkable Stage". A stage scene has <b>no prose panel</b>: the player walks a character around
                        the floor, walks up to interaction markers to use them, talks via 🗣 Start-conversation markers,
                        and exits by walking to a door marker.
                      </p>
                    ) : !scene.stage ? (
                      <button
                        className="btn-tool w-full"
                        onClick={() =>
                          updateScene(scene.id, {
                            stage: {
                              playerImage: "emoji:🕵️",
                              spawn: { x: 50, y: 86 },
                              speed: 18,
                              reach: 4,
                              keyboard: true,
                              floor: { top: 62, bottom: 94 },
                              depthScale: 0.35,
                              hints: "proximity",
                            },
                          })
                        }
                      >
                        ＋ Add stage settings (floor, spawn, character)
                      </button>
                    ) : (
                      <>
                        <p className="font-type text-[10px] leading-snug text-paper/55">
                          Drag the neon floor edges, the 🕵️ spawn dot, and any marker on the plate. Markers sit where
                          the game draws them — at each hotspot's base. Prose is <b>not shown</b> on a stage node:
                          narrative is the caption below + 💬 show-text markers.
                        </p>
                        <StageFloorEditor
                          background={scene.background}
                          media={media}
                          floor={
                            stageFloorOf(scene.stage)
                          }
                          spawn={{ x: scene.stage.spawn?.x ?? 50, y: scene.stage.spawn?.y ?? 90 }}
                          player={{
                            image: scene.stage.playerImage,
                            sheet: scene.stage.playerSheet,
                          }}
                          hotspots={(scene.hotspots ?? []).map((h) => ({ id: h.id, label: h.label, cursor: h.cursor, bounds: h.bounds }))}
                          selectedHotspotId={null}
                          onFloor={(top, bottom) =>
                            updateScene(scene.id, { stage: { ...scene.stage!, floor: { top, bottom } } })
                          }
                          onSpawn={(x, y) => updateScene(scene.id, { stage: { ...scene.stage!, spawn: { x, y } } })}
                          onMoveMarker={(hsId, cx, baseY) =>
                            updateScene(scene.id, {
                              hotspots: (scene.hotspots ?? []).map((h) =>
                                h.id === hsId
                                  ? { ...h, bounds: { ...h.bounds, x: Math.round((cx - h.bounds.w / 2) * 10) / 10, y: Math.round((baseY - h.bounds.h) * 10) / 10 } }
                                  : h
                              ),
                            })
                          }
                        />
                        <Field label="Caption on scene entry (the stage's opening line — replaces prose)">
                          <textarea
                            className={`${inputCls} h-14 font-type`}
                            value={scene.stage.enterCaption ?? ""}
                            placeholder="One short line — what the player should feel walking in."
                            onChange={(e) =>
                              updateScene(scene.id, { stage: { ...scene.stage!, enterCaption: e.target.value || undefined } })
                            }
                          />
                        </Field>
                        <Field label="Character sprite (emoji:… or an image url / asset)">
                          <input
                            className={inputCls}
                            value={scene.stage.playerImage ?? ""}
                            placeholder="emoji:🕵️ or /img/… or asset:…"
                            onChange={(e) =>
                              updateScene(scene.id, {
                                stage: { ...scene.stage!, playerImage: e.target.value || undefined },
                              })
                            }
                          />
                        </Field>
                        <Field label="Walk-cycle frames (one image url / asset: per line, optional)">
                          <textarea
                            className={`${inputCls} h-16 font-type`}
                            value={(scene.stage.walkFrames ?? []).join("\n")}
                            placeholder={"/img/walk1.png\n/img/walk2.png\n/img/walk3.png"}
                            onChange={(e) =>
                              updateScene(scene.id, {
                                stage: {
                                  ...scene.stage!,
                                  walkFrames: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                                },
                              })
                            }
                          />
                          <p className="mt-1 font-type text-[9px] text-paper/40">
                            2–4 frames cycled while walking (frame 1 doubles as the idle pose). Leave empty for the
                            procedural bob.
                          </p>
                        </Field>
                        {/* ---- sprite-sheet walker (one image, gridded frames) ---- */}
                        <div className="space-y-1 border border-cyan-neon/30 bg-cyan-neon/5 p-2">
                          <div className="font-pulp text-[9px] uppercase tracking-widest text-cyan-neon">🎞 Sprite-sheet walker</div>
                          <p className="font-type text-[9px] leading-snug text-paper/45">
                            One image holding a grid of frames (left→right, top→bottom, starting at 0). Beats loose
                            frame files: define "walk" and "idle" and the walker animates and stands still properly.
                            Overrides the sprite/walk-frame fields above while set.
                          </p>
                          <SpriteSheetControls
                            value={scene.stage.playerSheet}
                            storyId={story.id}
                            preset={WALKER_PRESET}
                            onChange={(sheet) => updateScene(scene.id, { stage: { ...scene.stage!, playerSheet: sheet } })}
                          />
                          {/* ---- directional preview: walk away / towards ---- */}
                          {(() => {
                            const sheet = scene.stage.playerSheet;
                            if (!sheetDrawable(sheet)) return null;
                            return (
                              <div className="space-y-1 border-t border-cyan-neon/20 pt-1.5">
                                <div className="font-pulp text-[8px] uppercase tracking-widest text-paper/50">
                                  Directional preview (add <span className="text-cyan-neon">walk-up</span> / <span className="text-cyan-neon">walk-down</span> / <span className="text-cyan-neon">idle-up</span> / <span className="text-cyan-neon">idle-down</span> to the sheet)
                                </div>
                                <div className="flex items-end gap-2">
                                  {(
                                    [
                                      ["up", "walk-up", "⬆ away"],
                                      ["down", "walk-down", "⬇ toward"],
                                      ["left", "walk", "⬅ left"],
                                      ["right", "walk", "➡ right"],
                                    ] as const
                                  ).map(([key, anim, label]) => (
                                    <div key={key} className="flex flex-col items-center gap-0.5">
                                      <div className="flex h-14 items-end justify-center overflow-hidden rounded border border-noir-700 bg-noir-950/70">
                                        <SheetSprite
                                          sheet={sheet}
                                          anim={anim}
                                          fallbacks={anim === "walk-up" || anim === "walk-down" ? ["walk", "idle"] : ["idle"]}
                                          height={44}
                                          freezeOnFallback
                                          style={key === "left" ? { transform: "scaleX(-1)" } : undefined}
                                        />
                                      </div>
                                      <span className="font-type text-[8px] leading-none text-paper/50">{label}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                        {/* ---- obstacles: furniture the walker routes around ---- */}
                        {(() => {
                          const obs = scene.stage!.obstacles ?? [];
                          const setObs = (list: { x: number; y: number; w: number; h: number }[]) =>
                            updateScene(scene.id, { stage: { ...scene.stage!, obstacles: list.length ? list : undefined } });
                          const setOb = (i: number, patch: Partial<{ x: number; y: number; w: number; h: number }>) =>
                            setObs(obs.map((o, j) => (j === i ? { ...o, ...patch } : o)));
                          return (
                            <div className="space-y-1 border border-amber-400/30 bg-amber-400/5 p-2">
                              <div className="font-pulp text-[9px] uppercase tracking-widest text-amber-300">🚧 Obstacles (walk around)</div>
                              <p className="font-type text-[9px] leading-snug text-paper/45">
                                Furniture the character walks <b>around</b> instead of through — a bar, a counter, a parked
                                bike. Click-to-walk routes around them (A* on a coarse grid, then smoothed to the corners a
                                person would turn at); the keyboard slides along them. All values are scene percentages.
                              </p>
                              {obs.map((o, oi) => (
                                <div key={oi} className="flex items-center gap-1">
                                  <input type="number" min={0} max={100} className={`${inputCls} w-12`} title="X %" value={Math.round(o.x)} onChange={(e) => setOb(oi, { x: Number(e.target.value) })} />
                                  <input type="number" min={0} max={100} className={`${inputCls} w-12`} title="Y %" value={Math.round(o.y)} onChange={(e) => setOb(oi, { y: Number(e.target.value) })} />
                                  <input type="number" min={1} max={100} className={`${inputCls} w-12`} title="Width %" value={Math.round(o.w)} onChange={(e) => setOb(oi, { w: Number(e.target.value) })} />
                                  <input type="number" min={1} max={100} className={`${inputCls} w-12`} title="Height %" value={Math.round(o.h)} onChange={(e) => setOb(oi, { h: Number(e.target.value) })} />
                                  <button
                                    type="button"
                                    className="shrink-0 px-1 font-pulp text-[9px] text-crimson"
                                    title="Remove this obstacle"
                                    onClick={() => setObs(obs.filter((_, j) => j !== oi))}
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                className="w-full border border-amber-400/40 py-0.5 font-pulp text-[8px] uppercase tracking-widest text-amber-300 hover:bg-amber-400/10"
                                onClick={() => setObs([...obs, { x: 42, y: 70, w: 16, h: 12 }])}
                              >
                                ＋ add obstacle
                              </button>
                            </div>
                          );
                        })()}
                        {/* ---- verb coin: pick a verb, then the object ---- */}
                        {(() => {
                          const st = scene.stage!;
                          const coinOn = !!st.verbCoin;
                          const objectMenuOn = !!st.objectVerbMenu;
                          const extendedOn = !!st.extendedVerbs;
                          const chosen = st.verbs ?? [];
                          const setVerbs = (list: (typeof VERB_IDS)[number][]) =>
                            updateScene(scene.id, { stage: { ...st, verbCoin: coinOn, verbs: list.length ? list : undefined } });
                          const shown = extendedOn ? VERB_IDS : CORE_VERB_IDS;
                          return (
                            <div className="space-y-1 border border-gold/30 bg-gold/5 p-2">
                              <div className="font-pulp text-[9px] uppercase tracking-widest text-gold">🎛 Verb coin (pick a verb, then click)</div>
                              <label className="flex items-center gap-1 font-type text-[10px] text-paper/70">
                                <input
                                  type="checkbox"
                                  checked={coinOn}
                                  onChange={(e) => updateScene(scene.id, { stage: { ...st, verbCoin: e.target.checked || undefined } })}
                                />
                                Show the verb coin in this room
                              </label>
                              <label className="flex items-start gap-1.5 border border-noir-700/70 bg-noir-900/30 p-1.5 font-type text-[10px] leading-snug text-paper/70">
                                <input
                                  type="checkbox"
                                  className="mt-0.5"
                                  checked={objectMenuOn}
                                  onChange={(e) => updateScene(scene.id, { stage: { ...st, objectVerbMenu: e.target.checked || undefined } })}
                                />
                                <span>
                                  <span className="font-pulp uppercase tracking-widest text-cyan-neon">💀 Object-first verb menu (Full Throttle's skull)</span>
                                  <br />
                                  Click the OBJECT first, then pick a verb from a small pie menu that pops up next to it
                                  (USE expands to your inventory). Off (default): the bottom-left verb coin, and classic
                                  click-to-activate rooms, are unchanged.
                                </span>
                              </label>
                              <label className="flex items-start gap-1.5 border border-noir-700/70 bg-noir-900/30 p-1.5 font-type text-[10px] leading-snug text-paper/70">
                                <input
                                  type="checkbox"
                                  className="mt-0.5"
                                  checked={extendedOn}
                                  onChange={(e) => updateScene(scene.id, { stage: { ...st, extendedVerbs: e.target.checked || undefined } })}
                                />
                                <span>
                                  <span className="font-pulp uppercase tracking-widest text-amber-300">👢 Kick · 👊 Punch</span>
                                  <br />
                                  Opt this room in to the two EXTRA body-verbs (they appear in the coin or the object
                                  menu). Off (default), the coin stays the classic five — visual novels and other cases
                                  never see kick/punch.
                                </span>
                              </label>
                              {coinOn ? (
                                <>
                                  <div className="flex flex-wrap gap-1">
                                    {shown.map((v) => {
                                      const on = chosen.includes(v) || (chosen.length === 0 && true);
                                      const picked = chosen.length ? chosen.includes(v) : true;
                                      return (
                                        <button
                                          key={v}
                                          type="button"
                                          className={`flex items-center gap-1 border px-2 py-0.5 font-pulp text-[9px] uppercase tracking-widest ${
                                            picked ? "border-gold bg-gold/20 text-gold" : "border-noir-700 text-paper/50"
                                          }`}
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => {
                                            const base = chosen.length ? chosen : [...VERB_IDS];
                                            setVerbs(base.includes(v) ? base.filter((x) => x !== v) : [...base, v]);
                                          }}
                                          title={`${VERB_LABEL[v]} — ${on ? "on" : "off"}`}
                                        >
                                          <span aria-hidden>{VERB_ICON[v]}</span> {v}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  <p className="font-type text-[9px] leading-snug text-paper/40">
                                    The player picks a verb, then clicks an object — and USE arms an inventory item
                                    first. Leave every verb on (default) to offer all {extendedOn ? "seven" : "five"}; untick the
                                    ones this room can't answer. Objects reply per verb via each hotspot's <b>🎚 Verb coin</b> box,
                                    and anything they don't answer gets the story's "that doesn't work" line.
                                  </p>
                                </>
                              ) : null}
                            </div>
                          );
                        })()}
                        <div className="grid grid-cols-2 gap-1">
                          <Field label="Spawn X (%)">
                            <input
                              type="number" min={1} max={99} className={inputCls}
                              value={scene.stage.spawn?.x ?? 50}
                              onChange={(e) =>
                                updateScene(scene.id, {
                                  stage: { ...scene.stage!, spawn: { x: Number(e.target.value) || 50, y: scene.stage!.spawn?.y ?? 86 } },
                                })
                              }
                            />
                          </Field>
                          <Field label="Spawn Y (%)">
                            <input
                              type="number" min={1} max={99} className={inputCls}
                              value={scene.stage.spawn?.y ?? 86}
                              onChange={(e) =>
                                updateScene(scene.id, {
                                  stage: { ...scene.stage!, spawn: { x: scene.stage!.spawn?.x ?? 50, y: Number(e.target.value) || 86 } },
                                })
                              }
                            />
                          </Field>
                          <Field label={`Close-up size ${(scene.stage.playerNearScale ?? 1).toFixed(2)}× (nearest)`}>
                            <input
                              type="range" min={0.5} max={2} step={0.05} className="w-full accent-cyan-400"
                              value={scene.stage.playerNearScale ?? 1}
                              onChange={(e) => updateScene(scene.id, { stage: { ...scene.stage!, playerNearScale: Number(e.target.value) } })}
                            />
                          </Field>
                          <Field label={`Distance size ${(scene.stage.playerFarScale ?? 1 - (scene.stage.depthScale ?? 0.35)).toFixed(2)}× (furthest)`}>
                            <input
                              type="range" min={0.3} max={1.5} step={0.05} className="w-full accent-cyan-400"
                              value={scene.stage.playerFarScale ?? 1 - (scene.stage.depthScale ?? 0.35)}
                              onChange={(e) => updateScene(scene.id, { stage: { ...scene.stage!, playerFarScale: Number(e.target.value) } })}
                            />
                          </Field>
                          <Field label="Walk speed (% width / sec)">
                            <input
                              type="number" min={4} max={60} className={inputCls}
                              value={scene.stage.speed ?? 18}
                              onChange={(e) =>
                                updateScene(scene.id, {
                                  stage: { ...scene.stage!, speed: Number(e.target.value) || 18 },
                                })
                              }
                            />
                          </Field>
                          <Field label="Reach distance (%)">
                            <input
                              type="number" min={1} max={12} step={0.5} className={inputCls}
                              value={scene.stage.reach ?? 4}
                              onChange={(e) =>
                                updateScene(scene.id, {
                                  stage: { ...scene.stage!, reach: Number(e.target.value) || 4 },
                                })
                              }
                            />
                          </Field>
                          <Field label="Floor top (%)">
                            <input
                              type="number" min={0} max={98} className={inputCls}
                              value={scene.stage.floor?.top ?? 62}
                              onChange={(e) =>
                                updateScene(scene.id, {
                                  stage: { ...scene.stage!, floor: { top: Number(e.target.value) || 0, bottom: scene.stage!.floor?.bottom ?? 94 } },
                                })
                              }
                            />
                          </Field>
                          <Field label="Floor bottom (%)">
                            <input
                              type="number" min={2} max={100} className={inputCls}
                              value={scene.stage.floor?.bottom ?? 94}
                              onChange={(e) =>
                                updateScene(scene.id, {
                                  stage: { ...scene.stage!, floor: { top: scene.stage!.floor?.top ?? 62, bottom: Number(e.target.value) || 94 } },
                                })
                              }
                            />
                          </Field>
                          <Field label="Depth shrink at floor top (0–0.9)">
                            <input
                              type="number" min={0} max={0.9} step={0.05} className={inputCls}
                              value={scene.stage.depthScale ?? 0.35}
                              onChange={(e) =>
                                updateScene(scene.id, {
                                  stage: { ...scene.stage!, depthScale: Number(e.target.value) },
                                })
                              }
                            />
                          </Field>
                          <Field label="Sprite scale (default 1)">
                            <input
                              type="number" min={0.3} max={3} step={0.1} className={inputCls}
                              value={scene.stage.playerScale ?? 1}
                              onChange={(e) =>
                                updateScene(scene.id, {
                                  stage: { ...scene.stage!, playerScale: Number(e.target.value) || undefined },
                                })
                              }
                            />
                          </Field>
                        </div>
                        <Field label="Interaction labels on markers">
                          <select
                            className={inputCls}
                            value={scene.stage.hints ?? "proximity"}
                            onChange={(e) =>
                              updateScene(scene.id, {
                                stage: { ...scene.stage!, hints: e.target.value as "proximity" | "always" | "none" },
                              })
                            }
                          >
                            <option value="proximity">Proximity — labels fade in as you approach</option>
                            <option value="always">Always — every marker wears its label</option>
                            <option value="none">None — reticles only (hover to peek)</option>
                          </select>
                        </Field>
                        <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/70">
                          <input
                            type="checkbox"
                            checked={scene.stage.keyboard !== false}
                            onChange={(e) =>
                              updateScene(scene.id, {
                                stage: { ...scene.stage!, keyboard: e.target.checked },
                              })
                            }
                          />
                          Arrow / WASD movement enabled
                        </label>
                        <p className="border border-cyan-neon/20 bg-cyan-neon/5 p-2 font-type text-[10px] leading-snug text-paper/60">
                          <b className="text-cyan-neon">The walkable loop:</b> Hotspots tab lays the markers (💬
                          show-text for looks, 🎁 for pickups, <b>🗣 Start conversation</b> to talk, <b>→ Go to scene</b>{" "}
                          for doors). The Beats tab is the conversation a 🗣 marker starts; give the scene's choices{" "}
                          <b>time limits</b> for real "decide now" pressure.
                        </p>
                      </>
                    )}
                  </div>
                </CollapsibleSection>

                {/* ---- Letterbox & entry transition (cinematic polish) ---- */}
                <div className="border border-gold/40 bg-gold/5 p-2 space-y-2">
                  <div className="font-pulp text-[10px] uppercase tracking-widest text-gold">🎞 Letterbox &amp; transition</div>
                  <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                    <input
                      type="checkbox"
                      checked={!!scene.letterbox}
                      onChange={(e) => updateScene(scene.id, { letterbox: e.target.checked || undefined })}
                    />
                    🎬 Letterbox bars (top &amp; bottom black bands)
                  </label>
                  <div className="grid grid-cols-2 gap-1">
                    <Field label="Entry transition">
                      <select
                        className={inputCls}
                        value={scene.transition ?? "fade"}
                        onChange={(e) => updateScene(scene.id, { transition: e.target.value as SceneNode["transition"] })}
                      >
                        <option value="fade">⬛ Fade (dissolve)</option>
                        <option value="fade-black">🌑 Fade to black then back</option>
                        <option value="cut">⚡ Cut (instant)</option>
                      </select>
                    </Field>
                    <Field label={`Transition speed ${(scene.transitionSpeed ?? 0.5).toFixed(2)}s`}>
                      <input
                        type="range"
                        min={0.1}
                        max={3}
                        step={0.05}
                        value={scene.transitionSpeed ?? 0.5}
                        className="w-full accent-pink-500"
                        onChange={(e) => updateScene(scene.id, { transitionSpeed: Number(e.target.value) })}
                      />
                    </Field>
                  </div>
                </div>

                {/* ---- Cinematic Image Controls ---- */}
                <div className="border border-gold/40 bg-gold/5 p-3 space-y-3">
                  <div className="font-pulp text-[11px] uppercase tracking-widest text-gold">🎬 Cinematic Image Controls</div>
                  <p className="font-type text-[9px] text-paper/50">
                    Pick which image to grade, then set its camera motion and lighting. Each dialogue beat with a replacement background image gets its own settings.
                  </p>
                  <Field label="Apply cinematic to">
                    <select
                      className={inputCls}
                      value={cinematicTarget}
                      onChange={(e) => setCinematicTarget(e.target.value)}
                    >
                      <option value="__scene__">🖼 Scene background</option>
                      {(scene.dialogueBeats ?? []).filter((b) => b.background).map((b, i) => (
                        <option key={b.id} value={b.id}>💬 Beat {i + 1} — {b.text.slice(0, 32)}</option>
                      ))}
                    </select>
                  </Field>
                  {!(scene.dialogueBeats ?? []).some((b) => b.background) && (
                    <p className="border border-cyan-neon/20 bg-cyan-neon/5 p-2 font-type text-[9px] text-paper/55">
                      Add a <b className="text-cyan-neon">replacement background image</b> to a beat in the Beats tab to give it its own cinematic settings here.
                    </p>
                  )}
                  <CinematicControls
                    cinematic={cinematicTarget === "__scene__" ? scene.cinematic : scene.dialogueBeats?.find((b) => b.id === cinematicTarget)?.cinematic}
                    previewUrl={media(cinematicTarget === "__scene__" ? scene.background : (scene.dialogueBeats?.find((b) => b.id === cinematicTarget)?.background ?? scene.background)) ?? (cinematicTarget === "__scene__" ? scene.background : (scene.dialogueBeats?.find((b) => b.id === cinematicTarget)?.background ?? scene.background))}
                    storyId={story.id}
                    media={media}
                    onChange={(next) => {
                      if (cinematicTarget === "__scene__") {
                        updateScene(scene.id, { cinematic: next });
                      } else {
                        mutate((d) => {
                          const s = d.scenes.find((x) => x.id === scene.id)!;
                          s.dialogueBeats!.find((x) => x.id === cinematicTarget)!.cinematic = next;
                        });
                      }
                    }}
                  />
                </div>
                <p className="border border-cyan-neon/20 bg-cyan-neon/5 p-2 font-type text-[10px] text-paper/55">
                  Need real music or recorded narration? Use the <b className="text-cyan-neon">Audio</b> tab — music and voice are separate there.
                </p>
                </CollapsibleSection>
                <CollapsibleSection id={`scene-${scene.id}-prose`} title="📜 Prose, pacing & structure">
                {scene.nodeType === "stage" && (
                  <p className="mb-2 border border-gold/30 bg-gold/5 p-2 font-type text-[10px] leading-snug text-paper/60">
                    🚶 <b>Stage nodes never show prose.</b> Anything typed here stays author-only — put the scene's
                    opening line in <b>🚶 Walkable Stage → "Caption on scene entry"</b>, and its narration into 💬
                    show-text markers.
                  </p>
                )}
                <Field label="Prose (narrator)">
                  <textarea
                    className={`${inputCls} h-28 font-type`}
                    value={scene.prose}
                    onChange={(e) => updateScene(scene.id, { prose: e.target.value })}
                  />
                </Field>
                <label className="flex items-center gap-2 border border-cyan-neon/20 bg-cyan-neon/5 px-2 py-1 text-[10px] uppercase tracking-wider text-paper/60">
                  <input
                    type="checkbox"
                    checked={!!scene.noTypewriter}
                    onChange={(e) => updateScene(scene.id, { noTypewriter: e.target.checked || undefined })}
                  />
                  ⚡ Instant text — disable typewriter (use when MP3 voice is main narration)
                </label>
                <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                  <input
                    type="checkbox"
                    checked={story.startSceneId === scene.id}
                    onChange={() => commit({ ...story, startSceneId: scene.id })}
                  />
                  ★ start scene
                </label>
                <Field label="End-of-part route chart (shown when leaving this scene)">
                  <input
                    className={inputCls}
                    placeholder='e.g. "Part Two — The Long Drop" — leave empty for none'
                    value={scene.partBreak ?? ""}
                    onChange={(e) => updateScene(scene.id, { partBreak: e.target.value.trim() || undefined })}
                  />
                  <p className="mt-1 font-type text-[9px] leading-snug text-paper/40">
                    When the player leaves this scene, the flowchart of the stretch just played is shown — and if
                    the exit crosses an act boundary, the act's route map follows. Point it at a <b>choke point</b>
                    the player must pass through: a hub you backtrack through will re-chart on every exit.
                  </p>
                </Field>
                {scene && (
                  <button
                    onClick={() => { onPlay(deepClone(story), { fromSceneId: scene.id }); }}
                    className="w-full border border-neon/50 py-1.5 font-pulp text-[10px] uppercase tracking-widest text-neon hover:bg-neon/10"
                    title="Launch the game starting at this scene (fresh world state, does not change your start scene)"
                  >
                    ▶ Play from this scene
                  </button>
                )}
                {scene.background.startsWith("video:") && (
                  <p className="border border-gold/30 bg-gold/5 px-2 py-1 font-type text-[10px] text-gold">
                    🎥 This scene plays a video cutscene instead of a static background. Manage it above.
                  </p>
                )}
                <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                  <input
                    type="checkbox"
                    checked={!!scene.isEnding}
                    onChange={(e) =>
                      updateScene(scene.id, {
                        isEnding: e.target.checked,
                        endingData: e.target.checked
                          ? scene.endingData ?? { tier: "victory-silver", headline: "HEADLINE!", recap: "How it ended." }
                          : scene.endingData,
                      })
                    }
                  />
                  🏁 this scene is an ending
                </label>
                {scene.isEnding && scene.endingData && (
                  <div className="space-y-1.5 border border-gold/40 p-2">
                    <Field label="Tier">
                      <select
                        className={inputCls}
                        value={scene.endingData.tier}
                        onChange={(e) =>
                          updateScene(scene.id, { endingData: { ...scene.endingData!, tier: e.target.value as never } })
                        }
                      >
                        <option value="victory-gold">victory-gold</option>
                        <option value="victory-silver">victory-silver</option>
                        <option value="gameover">gameover</option>
                      </select>
                    </Field>
                    <Field label="Pulp headline">
                      <input
                        className={inputCls}
                        value={scene.endingData.headline}
                        onChange={(e) => updateScene(scene.id, { endingData: { ...scene.endingData!, headline: e.target.value } })}
                      />
                    </Field>
                    <Field label="Recap">
                      <textarea
                        className={`${inputCls} h-16`}
                        value={scene.endingData.recap}
                        onChange={(e) => updateScene(scene.id, { endingData: { ...scene.endingData!, recap: e.target.value } })}
                      />
                    </Field>
                    {story.episodes?.length ? (
                      <>
                        <label className="flex items-start gap-2 border-t border-gold/20 pt-1.5 text-[10px] text-paper/60">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={!!scene.endingData.endsSeason}
                            onChange={(e) =>
                              updateScene(scene.id, { endingData: { ...scene.endingData!, endsSeason: e.target.checked || undefined } })
                            }
                          />
                          <span>
                            Ends the whole season here
                            <span className="block font-type text-[9px] normal-case text-paper/35">
                              Off (default): this closes the EPISODE and hands off to "Next time on…". On: a true finale — no next episode is offered.
                            </span>
                          </span>
                        </label>
                        {(() => {
                          const owner = episodeOfScene(story, scene.id);
                          return (
                            <p className={`font-type text-[9px] ${owner ? "text-paper/40" : "text-crimson"}`}>
                              {owner
                                ? `Closes Episode ${owner.number}: ${owner.title}.`
                                : "⚠ This ending isn't in any episode — assign it on the Episodes tab."}
                            </p>
                          );
                        })()}
                      </>
                    ) : null}
                  </div>
                )}
                </CollapsibleSection>
                <CollapsibleSection
                  id={`interrogation-${scene.id}`}
                  title="🎭 Interrogation (composure pressure)"
                  hint={scene.interrogation ? "active" : undefined}
                  titleClass="text-gold"
                >
                  <p className="font-type text-[9px] leading-snug text-paper/45">
                    Talking gets tension. Every <b>attitude-tagged reply</b> in this scene (Sultry / Aggressive /
                    Clever — neutral follow-ups don't count) chips the suspect's <b>composure</b>. At zero their{" "}
                    <b>trust</b> decides: at/above the crack threshold they <b className="text-gold">BREAK</b> (broke
                    beat + flag + the big swing); below it they <b className="text-crimson">CLAMP</b> (clamped beat +
                    flag + the backfire). Composure is derived from the presses you've made — one-shot, save-proof,
                    ungrindable. Gate the payoff content on the broke flag.
                  </p>
                  {!scene.interrogation ? (
                    <button
                      onClick={() => {
                        const ch = story.characters[0]?.id ?? "narrator";
                        updateScene(scene.id, {
                          interrogation: {
                            characterId: ch,
                            composure: 3,
                            crackTrust: 0,
                            brokeBeat: {
                              id: `iq_broke_${scene.id}`,
                              characterId: ch,
                              text: "They finally talk — write what spills.",
                            },
                            brokeFlag: `broke_${scene.id}`,
                            clampedBeat: {
                              id: `iq_clamp_${scene.id}`,
                              characterId: ch,
                              text: "They shut down — write the door closing.",
                            },
                            clampFlag: `clamped_${scene.id}`,
                          },
                        });
                      }}
                      className="w-full border border-gold/50 py-1.5 font-pulp text-[10px] uppercase tracking-widest text-gold hover:bg-gold/10"
                    >
                      ＋ Enable interrogation on this scene
                    </button>
                  ) : (
                    (() => {
                      const iq = scene.interrogation!;
                      const setIq = (patch: Partial<typeof iq>) =>
                        updateScene(scene.id, { interrogation: { ...iq, ...patch } });
                      const setBrokeBeat = (patch: Partial<typeof iq.brokeBeat>) =>
                        setIq({ brokeBeat: { ...iq.brokeBeat, ...patch } });
                      const swingOf = (cons: Consequences | undefined, characterId: string) => ({
                        trust: String(cons?.trustChanges?.find((t) => t.characterId === characterId)?.delta ?? ""),
                        heat: String(cons?.meterChanges?.find((m) => m.meter === "Suspicion")?.delta ?? ""),
                      });
                      const setSwing = (key: "brokeConsequences" | "clampConsequences", trust: string, heat: string) => {
                        const cons: Consequences = {};
                        if (trust !== "" && Number(trust) !== 0) cons.trustChanges = [{ characterId: iq.characterId, delta: Number(trust) }];
                        if (heat !== "" && Number(heat) !== 0) cons.meterChanges = [{ meter: "Suspicion", delta: Number(heat) }];
                        setIq({ [key]: Object.keys(cons).length ? cons : undefined });
                      };
                      const brokeSwing = swingOf(iq.brokeConsequences, iq.characterId);
                      const clampSwing = swingOf(iq.clampConsequences, iq.characterId);
                      return (
                      <>
                        <div className="grid grid-cols-2 gap-1">
                          <Field label="Suspect being pressed">
                            <select
                              className={inputCls}
                              value={iq.characterId}
                              onChange={(e) =>
                                setIq({
                                  characterId: e.target.value,
                                  brokeBeat: { ...iq.brokeBeat, characterId: e.target.value },
                                  clampedBeat: iq.clampedBeat ? { ...iq.clampedBeat, characterId: e.target.value } : undefined,
                                })
                              }
                            >
                              <option value="narrator">🎙 Narrator</option>
                              {story.characters.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label={`Composure (${iq.composure ?? 3} hits to break)`}>
                            <input
                              type="number"
                              min={1}
                              max={5}
                              className={inputCls}
                              value={iq.composure ?? 3}
                              onChange={(e) => setIq({ composure: Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 3)) })}
                            />
                          </Field>
                        </div>
                        <Field label={`Crack threshold — trust ≥ this at zero composure = CRACK (now: ${iq.crackTrust ?? 0})`}>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={-5}
                              max={5}
                              step={1}
                              className="flex-1 accent-pink-500"
                              value={iq.crackTrust ?? 0}
                              onChange={(e) => setIq({ crackTrust: Number(e.target.value) })}
                            />
                            <span className="w-6 text-right font-type text-[10px] text-paper/70">{iq.crackTrust ?? 0}</span>
                          </div>
                          <p className="mt-1 font-type text-[9px] leading-snug text-paper/40">
                            The risk in the risk/reward: press cold and their trust is below the line, the pressure
                            rebounds. Charm them up first (trust-positive replies) and it pays.
                          </p>
                        </Field>
                        <div className="space-y-1.5 border border-gold/30 bg-gold/5 p-2">
                          <div className="font-pulp text-[9px] uppercase tracking-widest text-gold">★ On crack (they talk)</div>
                          <Field label="Broke beat — plays the moment they break">
                            <textarea className={`${inputCls} h-14 font-type`} value={iq.brokeBeat.text} onChange={(e) => setBrokeBeat({ text: e.target.value })} />
                          </Field>
                          <div className="grid grid-cols-3 gap-1">
                            <Field label="Broke flag">
                              <FlagInput value={iq.brokeFlag} suggestions={allFlags} onChange={(v) => setIq({ brokeFlag: v ?? iq.brokeFlag })} />
                            </Field>
                            <Field label="Trust swing">
                              <input type="number" className={inputCls} value={brokeSwing.trust} placeholder="0"
                                onChange={(e) => setSwing("brokeConsequences", e.target.value, brokeSwing.heat)} />
                            </Field>
                            <Field label="Heat swing">
                              <input type="number" className={inputCls} value={brokeSwing.heat} placeholder="0"
                                onChange={(e) => setSwing("brokeConsequences", brokeSwing.trust, e.target.value)} />
                            </Field>
                          </div>
                        </div>
                        <div className="space-y-1.5 border border-crimson/30 bg-crimson/5 p-2">
                          <div className="font-pulp text-[9px] uppercase tracking-widest text-crimson">✖ On clamp (they shut down)</div>
                          <Field label="Clamped beat — plays when they refuse to break (optional text)">
                            <textarea className={`${inputCls} h-14 font-type`} value={iq.clampedBeat?.text ?? ""} placeholder="Leave empty for no clamped beat (flag + swings still apply)"
                              onChange={(e) => setIq({ clampedBeat: { id: `iq_clamp_${scene.id}`, characterId: iq.characterId, text: e.target.value } })} />
                          </Field>
                          <div className="grid grid-cols-3 gap-1">
                            <Field label="Clamp flag">
                              <FlagInput value={iq.clampFlag} suggestions={allFlags} onChange={(v) => setIq({ clampFlag: v || undefined })} />
                            </Field>
                            <Field label="Trust swing">
                              <input type="number" className={inputCls} value={clampSwing.trust} placeholder="0"
                                onChange={(e) => setSwing("clampConsequences", e.target.value, clampSwing.heat)} />
                            </Field>
                            <Field label="Heat swing">
                              <input type="number" className={inputCls} value={clampSwing.heat} placeholder="0"
                                onChange={(e) => setSwing("clampConsequences", clampSwing.trust, e.target.value)} />
                            </Field>
                          </div>
                          <p className="font-type text-[9px] leading-snug text-paper/40">
                            Usually the backfire: Heat +, trust −. Gate the fallout on the clamp flag.
                          </p>
                        </div>
                        <p className="font-type text-[9px] leading-snug text-paper/40">
                          Presses = this scene's attitude-tagged REPLY choices ({(scene.choices ?? []).filter((c) => c.reply && (c.attitudeTag ?? "Neutral") !== "Neutral").length} found).
                          Author at least composure many of them, or the validator will warn that composure can never break.
                        </p>
                        <button
                          onClick={() => updateScene(scene.id, { interrogation: undefined })}
                          className="w-full border border-crimson/40 py-1 font-pulp text-[9px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
                        >
                          ✕ Remove interrogation
                        </button>
                      </>
                      );
                    })()
                  )}
                </CollapsibleSection>
                <button
                  onClick={() => deleteScene(scene.id)}
                  className="w-full border border-crimson/50 py-1.5 font-pulp text-[10px] uppercase tracking-widest text-crimson hover:bg-crimson/15"
                >
                  🗑 Delete scene
                </button>
              </>
            )}

            {scene && tab === "beats" && (
              <>
                <HelpNote id="beats-tab" title="Beats">
                  Beats play <b>in order</b> after the scene prose — <b>drag the ⠿ grip</b> on a beat's title bar to reorder
                  them (or use the ▲/▼ buttons). Click a beat's <b>▾/▸</b> header to minimise it, or use the buttons below to
                  fold everything away and find beats in long lists. A beat's <b>condition rule</b> hides it until a gate passes (pair it
                  with a 💬 reply choice's flag for conversational Q&amp;A), and <b>Memories recalled</b> swaps in a
                  different line when the player made a specific earlier choice (<code>{"{said}"}</code> echoes their words).
                </HelpNote>

                <div className="flex gap-1">
                  <button
                    type="button"
                    className="flex-1 border border-noir-600 py-1 font-pulp text-[9px] uppercase tracking-widest text-paper/60 hover:border-gold hover:text-gold"
                    onClick={() => setExpandedBeatId(null)}
                  >
                    ▸ Collapse all
                  </button>
                </div>

                {/* Batch ElevenLabs voice generation for THIS scene — every
                    eligible line converted separately, each in its speaker's
                    assigned voice with conversational context, then applied
                    to the beat automatically. Scene-scoped on purpose: do one
                    conversation at a time so delivery and credits stay sane. */}
                <div className="space-y-1.5 border border-neon/30 bg-neon/5 p-2">
                  <div className="font-pulp text-[9px] uppercase tracking-widest text-neon">
                    🎙 Batch voice — this scene
                  </div>
                  <Field label="Voice model">
                    <select
                      className={inputCls}
                      value={voiceModel}
                      onChange={(e) => changeVoiceModel(e.target.value)}
                    >
                      {ELEVENLABS_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                  </Field>
                  {/* Live cost preview for this scene, for the selected model. */}
                  {(() => {
                    const model = voiceModel;
                    const genChars = (scene.dialogueBeats ?? [])
                      .filter((b) => {
                        const t = b.text?.trim();
                        if (!t || b.silent) return false;
                        if (b.recalls && Object.keys(b.recalls).length) return false;
                        const ch = story.characters.find((x) => x.id === b.characterId);
                        return !!ch?.elevenVoiceId;
                      })
                      .reduce((n, b) => n + b.text.trim().length, 0);
                    const est = estimateVoiceCost(model, genChars);
                    return (
                      <div className="rounded border border-gold/30 bg-gold/5 px-2 py-1.5 text-center">
                        <p className="font-type text-[9px] leading-tight text-gold/90">
                          {genChars > 0 ? (
                            <>
                              ≈ {genChars.toLocaleString()} chars → <b>~{est.credits.toLocaleString()} credits</b>
                              {est.usd >= 0.5 ? ` (~$${est.usd.toFixed(2)} overage)` : ""}
                            </>
                          ) : (
                            "No convertible lines in this scene (set character voice IDs first)."
                          )}
                        </p>
                      </div>
                    );
                  })()}
                  <button
                    disabled={batchBusy}
                    onClick={() => { setBatchDone(null); void batchGenerateVoices(scene.id, voiceModel); }}
                    className="w-full border border-neon/50 py-1.5 font-pulp text-[10px] uppercase tracking-widest text-neon hover:bg-neon/10 disabled:opacity-40"
                    title="Generate MP3s for every convertible beat in THIS scene — each in its speaker's voice with conversational context, then applied automatically. Spends ElevenLabs credits; you'll confirm first."
                  >
                    {batchBusy
                      ? `Converting… ${batchProgress ? `${batchProgress.done + 1}/${batchProgress.total}` : ""}`
                      : "▶ Generate this scene's voices"}
                  </button>
                  {batchBusy && batchProgress && (
                    <>
                      <div className="h-1 w-full overflow-hidden rounded bg-noir-700">
                        <div
                          className="h-full bg-neon transition-all"
                          style={{ width: `${Math.round(((batchProgress.done) / batchProgress.total) * 100)}%` }}
                        />
                      </div>
                      <p className="font-type text-[9px] leading-snug text-gold">
                        {batchProgress.done + 1} / {batchProgress.total} · {batchProgress.label}
                      </p>
                    </>
                  )}
                  {batchDone && (
                    <p className="whitespace-pre-line border border-emerald-500/30 bg-emerald-500/5 p-1.5 font-type text-[9px] leading-snug text-emerald-300/90">
                      {batchDone}
                    </p>
                  )}
                  <p className="font-type text-[9px] leading-snug text-paper/45">
                    Converts the whole <b>conversation in this scene</b> — each line in that character's assigned voice,
                    reading the lines around it for natural back-and-forth, then applies each MP3 to its beat automatically.
                    Skips silent/recall lines and characters without a voice ID. Set voices (and the API key) in the
                    Characters tab.
                  </p>
                </div>
                {(scene.dialogueBeats ?? []).map((b, i) => {
                  const speakerName =
                    b.characterId === "narrator"
                      ? "Narrator"
                      : story.characters.find((c) => c.id === b.characterId)?.name ?? "Narrator";
                  const snippet = b.text.replace(/\s+/g, " ").trim().slice(0, 30);
                  // Accordion: a beat is open only when it is the single
                  // expanded one. Everything else stays minimised, so a long
                  // list reads as a compact stack of title bars.
                  const isOpen = expandedBeatId === b.id;
                  return (
                    <CollapsibleSection
                      key={b.id}
                      id={`beat-${b.id}`}
                      title={<span>💬 Beat {i + 1} · {speakerName}{snippet ? ` — ${snippet}` : ""}</span>}
                      titleClass="text-gold"
                      defaultOpen={focusedBeatId === b.id}
                      controlledOpen={isOpen}
                      onToggle={(next) => setExpandedBeatId(next ? b.id : null)}
                      draggable
                      dragOver={dragOverBeatId === b.id && dragBeatId !== b.id}
                      onDragStartHandle={(e) => {
                        setDragBeatId(b.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", b.id);
                      }}
                      onDragEnterHandle={(e) => {
                        e.preventDefault();
                        if (dragBeatId && dragBeatId !== b.id) setDragOverBeatId(b.id);
                      }}
                      onDragOverHandle={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDropHandle={(e) => {
                        e.preventDefault();
                        const dropped = e.dataTransfer.getData("text/plain") || dragBeatId;
                        if (dropped) reorderBeat(dropped, b.id);
                        setDragBeatId(null);
                        setDragOverBeatId(null);
                      }}
                      onDragEndHandle={() => {
                        setDragBeatId(null);
                        setDragOverBeatId(null);
                      }}
                      headerRight={
                        <span className="flex items-center gap-1">
                          <button
                            className="px-1 text-[10px] text-paper/50 hover:text-gold disabled:opacity-25"
                            disabled={i === 0}
                            onClick={() =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                const beats = s.dialogueBeats!;
                                const j = beats.findIndex((x) => x.id === b.id);
                                if (j > 0) [beats[j - 1], beats[j]] = [beats[j], beats[j - 1]];
                              })
                            }
                            title="Move this beat earlier"
                            aria-label={`Move beat ${i + 1} up`}
                          >
                            ▲
                          </button>
                          <button
                            className="px-1 text-[10px] text-paper/50 hover:text-gold disabled:opacity-25"
                            disabled={i === (scene.dialogueBeats?.length ?? 0) - 1}
                            onClick={() =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                const beats = s.dialogueBeats!;
                                const j = beats.findIndex((x) => x.id === b.id);
                                if (j >= 0 && j < beats.length - 1) [beats[j + 1], beats[j]] = [beats[j], beats[j + 1]];
                              })
                            }
                            title="Move this beat later"
                            aria-label={`Move beat ${i + 1} down`}
                          >
                            ▼
                          </button>
                          <button
                            className="text-[10px] text-crimson hover:underline"
                            onClick={() =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                s.dialogueBeats = s.dialogueBeats?.filter((x) => x.id !== b.id);
                              })
                            }
                            title="Delete this beat"
                          >
                            ✕
                          </button>
                        </span>
                      }
                    >
                    <CollapsibleSection id={`beat-${b.id}-dlg`} title="💬 Dialogue" defaultOpen>
                    <div className="grid grid-cols-2 gap-1">
                      <Field label="Speaker">
                        <select
                          className={inputCls}
                          value={b.characterId}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.dialogueBeats!.find((x) => x.id === b.id)!.characterId = e.target.value;
                            })
                          }
                        >
                          <option value="narrator">🎙 Narrator (V.O.)</option>
                          {story.characters.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Expression">
                        <input
                          className={inputCls}
                          value={b.expression ?? ""}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.dialogueBeats!.find((x) => x.id === b.id)!.expression = e.target.value;
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Line (click to type — saves when you click away)">
                      <CommitTextArea
                        className={`${inputCls} h-16 font-type`}
                        value={b.text}
                        onCommit={(next) =>
                          mutateLatest((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            s.dialogueBeats!.find((x) => x.id === b.id)!.text = next;
                          })
                        }
                      />
                      <Field label="Voice MP3 URL (optional — replaces TTS for this line)">
                        <div className="flex gap-1">
                          <input
                            className={inputCls}
                            placeholder="/audio/line_01.mp3 or https://..."
                            value={mediaField(b.audioUrl)}
                            onChange={(e) =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                s.dialogueBeats!.find((x) => x.id === b.id)!.audioUrl = e.target.value || undefined;
                              })
                            }
                          />
                          <MediaUploadButton
                            storyId={story.id}
                            accept="audio/*"
                            label="⇧ Upload"
                            onUploaded={(_url, assetId) => mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.dialogueBeats!.find((x) => x.id === b.id)!.audioUrl = `asset:${assetId}`;
                            })}
                          />
                        </div>
                        <div className="mt-1">
                          <AssetDropdown
                            storyId={story.id}
                            assetType="audio"
                            returnReference
                            value={b.audioUrl}
                            onChange={(url) => mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.dialogueBeats!.find((x) => x.id === b.id)!.audioUrl = url;
                            })}
                            placeholder="Or use uploaded audio..."
                          />
                        </div>
                        <div className="mt-1">
                          <CharacterVoiceFiles
                            characterId={b.characterId}
                            characterName={story.characters.find((x) => x.id === b.characterId)?.name}
                            value={b.audioUrl}
                            onChange={(url) =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                s.dialogueBeats!.find((x) => x.id === b.id)!.audioUrl = url;
                              })
                            }
                          />
                        </div>
                        <div className="mt-1 flex gap-1">
                          <button
                            disabled={
                              aiBusyBeat === b.id ||
                              !!b.silent ||
                              !b.text.trim() ||
                              !!(b.recalls && Object.keys(b.recalls).length) ||
                              !story.characters.find((x) => x.id === b.characterId)?.elevenVoiceId
                            }
                            title={
                              b.silent
                                ? "Silent beat — no line to convert"
                                : !b.text.trim()
                                  ? "Write the line first"
                                  : b.recalls && Object.keys(b.recalls).length
                                    ? "This line recalls memories — its text changes by route, so it stays on TTS"
                                    : !story.characters.find((x) => x.id === b.characterId)?.elevenVoiceId
                                      ? "Assign this character's ElevenLabs voice ID in the Characters tab first"
                                      : "Synthesize this line with ElevenLabs — spends credits, you'll be asked to confirm"
                            }
                            onClick={async () => {
                              const ch = story.characters.find((x) => x.id === b.characterId);
                              if (!ch?.elevenVoiceId) {
                                window.alert("Assign this character's ElevenLabs voice ID in the Characters tab first.");
                                return;
                              }
                              const line = b.text.trim();
                              if (!line) return;
                              if (!window.confirm(convertConfirmMessage(`${ch.name} — ${scene.title}`, ch.elevenVoiceId, getElevenModel(), line))) return;
                              setAiBusyBeat(b.id);
                              setAiNote(null);
                              try {
                                const { dataUrl, blob } = await synthesizeElevenLabs(line, ch.elevenVoiceId, getElevenModel());
                                // Save the MP3 as a real file (public/voices/<person>/<scene>/
                                // on desktop, the linked folder in the browser) and point the
                                // beat at wherever it actually landed.
                                const saved = await saveGeneratedVoice({
                                  storyId: story.id,
                                  characterId: b.characterId,
                                  sceneId: scene.id,
                                  beatId: b.id,
                                  blob,
                                  dataUrl,
                                  assetName: `voice-${b.characterId}-${b.id}`,
                                });
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  s.dialogueBeats!.find((x) => x.id === b.id)!.audioUrl = saved.url;
                                });
                                setAiNote({ text: saved.note, at: Date.now() });
                                void new Audio(dataUrl).play(); // audition the result straight away
                              } catch (err) {
                                window.alert((err as Error).message);
                              } finally {
                                setAiBusyBeat(null);
                              }
                            }}
                            className="w-full border border-neon/40 py-1 font-pulp text-[8px] uppercase tracking-widest text-neon hover:bg-neon/10 disabled:opacity-40"
                          >
                            {aiBusyBeat === b.id ? "Converting…" : b.audioUrl ? "↺ Regenerate MP3 (ElevenLabs)" : "🎙 Generate MP3 (ElevenLabs)"}
                          </button>
                          {aiNote && (
                            <p className="font-type text-[8px] leading-snug text-gold/90" title={aiNote.text}>
                              {aiNote.text}
                            </p>
                          )}
                          {b.audioUrl && (
                            <button
                              onClick={() =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  s.dialogueBeats!.find((x) => x.id === b.id)!.audioUrl = undefined;
                                })
                              }
                              title="Clear the MP3 — this line falls back to TTS"
                              className="border border-crimson/40 px-2 py-1 font-pulp text-[8px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
                            >
                              ✕ TTS
                            </button>
                          )}
                        </div>
                      </Field>
                      {/* Audio tags — v3 performs sound cues (laugh/cough);
                          older models get only voice-delivery direction like
                          whisper, with a note. */}
                      {b.characterId !== "narrator" && (() => {
                        const tags = audioTagsForModel(voiceModel);
                        const v3 = modelSupportsAudioTags(voiceModel);
                        if (!tags.length) return null;
                        return (
                          <div className="mt-1 rounded border border-neon/25 bg-neon/5 p-1.5">
                            <div className="font-pulp text-[8px] uppercase tracking-widest text-neon">
                              🎙 Insert cue · {v3 ? "sound + delivery" : "delivery only"}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {tags.map((t) => (
                                <button
                                  key={t.tag}
                                  type="button"
                                  title={t.hint}
                                  onClick={() =>
                                    mutate((d) => {
                                      const beat = d.scenes
                                        .find((x) => x.id === scene.id)!
                                        .dialogueBeats!.find((x) => x.id === b.id)!;
                                      beat.text = `${beat.text ? beat.text.replace(/\s*$/, "") + " " : ""}${t.tag} `;
                                    })
                                  }
                                  className="border border-neon/40 px-1.5 py-0.5 font-pulp text-[9px] uppercase tracking-wide text-neon hover:bg-neon/15"
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                            <p className="mt-1 font-type text-[8px] leading-snug text-paper/40">
                              {v3 ? (
                                <>Bracketed cues like <b>[laughs]</b> are performed by the v3 voice — place them where the sound happens.</>
                              ) : (
                                <>This model only handles delivery cues like <b>[whispers]</b>. Switch to <b>Eleven v3</b> for performed sounds ([laughs], [coughs]…) — other models read the brackets aloud.</>
                              )}
                            </p>
                          </div>
                        );
                      })()}
                    </Field>
                    </CollapsibleSection>
                    <CollapsibleSection id={`beat-${b.id}-bg`} title="🖼 Background & camera">
                    <Field label="🖼 Replacement background image (persists over later beats by default — see options below)">
                      <div className="flex gap-1">
                        <input
                          className={inputCls}
                          placeholder="/img/scene.jpg or gradient:… (leave blank for scene default)"
                          value={mediaField(b.background)}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.dialogueBeats!.find((x) => x.id === b.id)!.background = e.target.value || undefined;
                            })
                          }
                        />
                        <MediaUploadButton
                          storyId={story.id}
                          accept="image/*"
                          label="⇧"
                          onUploaded={(_url, assetId) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.dialogueBeats!.find((x) => x.id === b.id)!.background = `asset:${assetId}`;
                            })
                          }
                        />
                        {b.background && (
                          <button
                            onClick={() =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                s.dialogueBeats!.find((x) => x.id === b.id)!.background = undefined;
                              })
                            }
                            className="shrink-0 border border-crimson/40 px-2 font-pulp text-[9px] uppercase text-crimson hover:bg-crimson/10"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      <div className="mt-1">
                        <AssetDropdown
                          storyId={story.id}
                          assetType="image"
                          returnReference
                          value={b.background?.startsWith("asset:") || b.background?.startsWith("data:") ? b.background : undefined}
                          onChange={(url) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.dialogueBeats!.find((x) => x.id === b.id)!.background = url;
                            })
                          }
                          placeholder="Or pick an uploaded image..."
                        />
                      </div>
                      {b.background && (
                        <div
                          className="mt-1 h-14 w-full border border-noir-600"
                          style={bgStyle(media(b.background) ?? b.background)}
                        />
                      )}
                      {b.background && (
                        <div className="grid grid-cols-2 gap-1">
                          <Field label="Image transition">
                            <select
                              className={inputCls}
                              value={b.backgroundTransition ?? "fade"}
                              onChange={(e) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  s.dialogueBeats!.find((x) => x.id === b.id)!.backgroundTransition = e.target.value as never;
                                })
                              }
                            >
                              <option value="cut">⚡ Cut</option>
                              <option value="fade">⬛ Fade</option>
                              <option value="crossfade">〰 Crossfade</option>
                              <option value="fade-black">🌑 Fade from black</option>
                              <option value="slide-left">⬅ Slide left</option>
                              <option value="slide-right">➡ Slide right</option>
                              <option value="iris-in">◉ Iris in</option>
                            </select>
                          </Field>
                          <Field label={`Transition speed ${(b.backgroundTransitionSpeed ?? 0.5).toFixed(1)}s`}>
                            <input
                              type="range"
                              min={0}
                              max={2}
                              step={0.1}
                              className="w-full accent-pink-500"
                              value={b.backgroundTransitionSpeed ?? 0.5}
                              onChange={(e) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  s.dialogueBeats!.find((x) => x.id === b.id)!.backgroundTransitionSpeed = Number(e.target.value);
                                })
                              }
                            />
                          </Field>
                        </div>
                      )}
                      {b.background && (
                        <div className="mt-1 space-y-2 border border-gold/20 bg-gold/5 p-2">
                          <div className="font-pulp text-[9px] uppercase tracking-widest text-gold">
                            🎬 Beat camera — zoom to subject &amp; motion
                          </div>
                          <CinematicControls
                            cinematic={b.cinematic}
                            previewUrl={media(b.background) ?? b.background}
                            storyId={story.id}
                            media={media}
                            onChange={(next) =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                s.dialogueBeats!.find((x) => x.id === b.id)!.cinematic = next;
                              })
                            }
                          />
                        </div>
                      )}
                      <div className="mt-1 space-y-1 border border-gold/20 bg-gold/5 p-1.5">
                        <label className="flex items-start gap-2 text-[10px] uppercase tracking-wider text-paper/70">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={b.backgroundHold !== false}
                            onChange={(e) =>
                              mutate((d) => {
                                const beat = d.scenes.find((x) => x.id === scene.id)!.dialogueBeats!.find((x) => x.id === b.id)!;
                                beat.backgroundHold = e.target.checked ? undefined : false;
                              })
                            }
                          />
                          <span>
                            📌 Keep image on later beats
                            <span className="block font-type text-[9px] normal-case tracking-normal text-paper/45">
                              On by default — this insert stays up while later beats talk over it, until another beat
                              sets a new image. Turn OFF to show it only during this beat, then snap back to the scene.
                            </span>
                          </span>
                        </label>
                      </div>
                    </Field>
                    {/* On any beat: end a held insert and return to the scene plate. */}
                    <label className="flex items-start gap-2 border border-cyan-neon/25 bg-cyan-neon/5 px-2 py-1 text-[10px] uppercase tracking-wider text-paper/70">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={!!b.backgroundRevert}
                        onChange={(e) =>
                          mutate((d) => {
                            const beat = d.scenes.find((x) => x.id === scene.id)!.dialogueBeats!.find((x) => x.id === b.id)!;
                            beat.backgroundRevert = e.target.checked || undefined;
                          })
                        }
                      />
                      <span>
                        🔙 End insert shot here — return to the scene image
                        <span className="block font-type text-[9px] normal-case tracking-normal text-paper/45">
                          Drops a held replacement background when this beat begins (use on a beat with no image of its own).
                        </span>
                      </span>
                    </label>
                    <label className="flex items-center gap-2 border border-neon/20 bg-neon/5 px-2 py-1 text-[10px] uppercase tracking-wider text-paper/60">
                      <input
                        type="checkbox"
                        checked={!!b.silent}
                        onChange={(e) =>
                          mutate((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            s.dialogueBeats!.find((x) => x.id === b.id)!.silent = e.target.checked || undefined;
                          })
                        }
                      />
                      🔇 Silent beat — no narration (text only)
                    </label>
                    </CollapsibleSection>
                    <CollapsibleSection id={`beat-${b.id}-route`} title="🎬 Routing & animation">
                    {/* ---- after this beat: route to another scene ---- */}
                    <div className="border border-cyan-neon/30 bg-cyan-neon/5 p-2 space-y-1.5">
                      <Field label="🎬 After this beat — cut to scene (insert shot ends the scene)">
                        <select
                          className={inputCls}
                          value={b.afterBeatTargetSceneId ?? ""}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              const beat = s.dialogueBeats!.find((x) => x.id === b.id)!;
                              beat.afterBeatTargetSceneId = e.target.value || undefined;
                              if (e.target.value && beat.afterBeatMode === undefined) {
                                beat.afterBeatMode = "auto";
                                beat.afterBeatDelaySeconds = 1.6;
                              }
                            })
                          }
                        >
                          <option value="">— stay in this scene after the beat —</option>
                          {story.scenes
                            .filter((s) => s.id !== scene.id)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.isEnding ? "🏁 " : "🎞 "}
                                {s.title}
                              </option>
                            ))}
                        </select>
                      </Field>
                      {b.afterBeatTargetSceneId && (
                        <>
                          <p className="font-type text-[9px] leading-snug text-paper/45">
                            When this beat (the LAST visible line) is dismissed, the game cuts straight to that scene —
                            this insert background fades directly into the next, with no flash back to the scene plate.
                            Put it on the scene's final beat.
                          </p>
                          <Field label="When to cut">
                            <select
                              className={inputCls}
                              value={b.afterBeatMode ?? "auto"}
                              onChange={(e) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  s.dialogueBeats!.find((x) => x.id === b.id)!.afterBeatMode = e.target.value as "auto" | "continue";
                                })
                              }
                            >
                              <option value="auto">⏱ Auto — hold on a timer, then cut</option>
                              <option value="continue">▸ Continue button / Space — the player cuts</option>
                            </select>
                          </Field>
                          {(b.afterBeatMode ?? "auto") === "auto" && (
                            <Field label={`Hold ${b.afterBeatDelaySeconds ?? 1.6}s after the line finishes (the timer guarantees the beat is read)`}>
                              <input
                                type="range"
                                min={0.5}
                                max={12}
                                step={0.5}
                                className="w-full accent-cyan-400"
                                value={b.afterBeatDelaySeconds ?? 1.6}
                                onChange={(e) =>
                                  mutate((d) => {
                                    const s = d.scenes.find((x) => x.id === scene.id)!;
                                    s.dialogueBeats!.find((x) => x.id === b.id)!.afterBeatDelaySeconds = Number(e.target.value);
                                  })
                                }
                              />
                            </Field>
                          )}
                        </>
                      )}
                    </div>
                    {b.characterId !== "narrator" && story.characters.some((ch) => ch.id === b.characterId) && (
                      <label className="flex items-center gap-2 border border-cyan-neon/20 bg-cyan-neon/5 px-2 py-1 text-[10px] uppercase tracking-wider text-paper/60">
                        <input
                          type="checkbox"
                          checked={b.useCharacterAnimation !== false}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.dialogueBeats!.find((x) => x.id === b.id)!.useCharacterAnimation = e.target.checked || undefined;
                            })
                          }
                        />
                        🗣 Talking animation — {b.useCharacterAnimation !== false ? "animate" : "resting pose"} while they speak
                        {!(story.characters.find((ch) => ch.id === b.characterId)?.talkingFrames?.length) && (
                          <span className="text-paper/35 normal-case">(set frames in the Characters tab first)</span>
                        )}
                      </label>
                    )}
                    </CollapsibleSection>
                    <CollapsibleSection id={`beat-${b.id}-cond`} title="🧠 Conditions & memories">
                    {/* Memory recall substitutions — the NPC echoes a specific
                        earlier choice instead of a generic line. */}
                    <Field label="Memories recalled (memory tag OR flag → line). Replaces the Line above when that choice was made — or that flag is set. Use {said} for the player's exact words (or the flag's note from the 🏷 Flags tab).">
                      <div className="space-y-1">
                        {(Object.entries(b.recalls ?? {})).map(([tag, line]) => (
                          <div key={tag} className="grid grid-cols-[1fr_2fr_auto] items-center gap-1">
                            <input
                              className={inputCls}
                              value={tag}
                              placeholder="tag"
                              list={`recall-tags-${b.id}`}
                              onChange={(e) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  const rec = { ...(s.dialogueBeats!.find((x) => x.id === b.id)!.recalls ?? {}) };
                                  const nv = e.target.value;
                                  if (nv === tag) return;
                                  const entry = rec[tag];
                                  delete rec[tag];
                                  if (entry != null) rec[nv] = entry;
                                  s.dialogueBeats!.find((x) => x.id === b.id)!.recalls = Object.keys(rec).length ? rec : undefined;
                                })
                              }
                            />
                            <datalist id={`recall-tags-${b.id}`}>
                              {recallSuggestions.filter((t) => t !== tag && !(b.recalls?.[t] != null)).map((t) => (
                                <option key={t} value={t} />
                              ))}
                            </datalist>
                            <input
                              className={inputCls}
                              value={line}
                              placeholder="recall line (use {said})"
                              onChange={(e) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  const rec = { ...(s.dialogueBeats!.find((x) => x.id === b.id)!.recalls ?? {}) };
                                  rec[tag] = e.target.value;
                                  s.dialogueBeats!.find((x) => x.id === b.id)!.recalls = rec;
                                })
                              }
                            />
                            <button
                              onClick={() =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  const rec = { ...(s.dialogueBeats!.find((x) => x.id === b.id)!.recalls ?? {}) };
                                  delete rec[tag];
                                  s.dialogueBeats!.find((x) => x.id === b.id)!.recalls = Object.keys(rec).length ? rec : undefined;
                                })
                              }
                              className="shrink-0 border border-crimson/40 px-1.5 py-1 font-pulp text-[9px] uppercase text-crimson hover:bg-crimson/10"
                              title="Remove this recall"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              const rec = { ...(s.dialogueBeats!.find((x) => x.id === b.id)!.recalls ?? {}) };
                              rec[recallSuggestions.find((t) => !(rec[t] != null)) ?? "recall_tag"] = "You said: {said}";
                              s.dialogueBeats!.find((x) => x.id === b.id)!.recalls = rec;
                            })
                          }
                          className="w-full border border-cyan-neon/40 py-1 font-pulp text-[9px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/10"
                        >
                          ＋ Add recall
                        </button>
                      </div>
                    </Field>
                    <GatingEditor
                      sectionId={`beat-${b.id}`}
                      gating={b.conditionRule}
                      items={story.items}
                      characters={story.characters}
                      flags={allFlags}
                      memoryTags={recallSuggestions}
                      onChange={(g) =>
                        mutate((d) => {
                          const s = d.scenes.find((x) => x.id === scene.id)!;
                          s.dialogueBeats!.find((x) => x.id === b.id)!.conditionRule = g;
                        })
                      }
                    />
                    </CollapsibleSection>

                    {/* PRESS THE LIE — the contradiction verb. This beat is a
                        false claim; the player presses and must present the
                        evidence that breaks it. */}
                    <CollapsibleSection id={`beat-${b.id}-lie`} title="🎯 Press the Lie (contradiction)">
                      {!b.lie ? (
                        <button
                          onClick={() =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              const beat = s.dialogueBeats!.find((x) => x.id === b.id)!;
                              beat.lie = {
                                evidenceItemIds: [],
                                contradictedFlag: `${scene.id.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_lie_broken`,
                                caughtBeat: {
                                  id: `b_${uid()}`,
                                  characterId: b.characterId,
                                  text: "That's not — how did you…? All right. You've got me.",
                                  conditionRule: { requiresFlags: [] },
                                },
                              };
                            })
                          }
                          className="w-full border border-crimson/40 py-1 font-pulp text-[9px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
                        >
                          ＋ This line is a lie the player can catch
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <p className="font-type text-[10px] leading-snug text-paper/60">
                            While this line is on screen the player gets a <b className="text-crimson">🎯 Press them on that</b> button.
                            They open their inventory and must present the clue that proves it false. Right clue → the caught
                            line plays and the flag sets; wrong clue → heat/trust cost, and they get only a few tries.
                          </p>
                          <Field label="The claim (what the player challenges — defaults to the line above)">
                            <input
                              className={inputCls}
                              value={b.lie.claim ?? ""}
                              placeholder={b.text.slice(0, 80)}
                              onChange={(e) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  const lie = s.dialogueBeats!.find((x) => x.id === b.id)!.lie!;
                                  lie.claim = e.target.value || undefined;
                                })
                              }
                            />
                          </Field>
                          <Field label="Breaking evidence — the clue item(s) that prove this false (player must be HOLDING one)">
                            <div className="space-y-1">
                              {story.items.length === 0 && (
                                <p className="font-type text-[10px] text-crimson">No items in this story yet — add a clue item first.</p>
                              )}
                              {story.items.map((it) => {
                                const on = b.lie!.evidenceItemIds.includes(it.id);
                                return (
                                  <label key={it.id} className="flex items-center gap-1.5 font-type text-[11px] text-paper/85">
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={(e) =>
                                        mutate((d) => {
                                          const s = d.scenes.find((x) => x.id === scene.id)!;
                                          const lie = s.dialogueBeats!.find((x) => x.id === b.id)!.lie!;
                                          lie.evidenceItemIds = e.target.checked
                                            ? [...lie.evidenceItemIds, it.id]
                                            : lie.evidenceItemIds.filter((x) => x !== it.id);
                                        })
                                      }
                                    />
                                    {it.icon} {it.name}{it.isClue ? " 📌" : ""}
                                  </label>
                                );
                              })}
                            </div>
                          </Field>
                          <Field label="Caught flag (set when the lie breaks — gate the aftermath on it)">
                            <input
                              className={inputCls}
                              list={`flag-tags-${b.id}`}
                              value={b.lie.contradictedFlag}
                              onChange={(e) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  s.dialogueBeats!.find((x) => x.id === b.id)!.lie!.contradictedFlag = e.target.value;
                                })
                              }
                            />
                            <datalist id={`flag-tags-${b.id}`}>
                              {allFlags.filter((f) => f !== b.lie!.contradictedFlag).map((f) => (
                                <option key={f} value={f} />
                              ))}
                            </datalist>
                          </Field>
                          <div className="border border-gold/30 bg-gold/5 p-2">
                            <p className="mb-1 font-pulp text-[9px] uppercase tracking-widest text-gold">Caught-in-a-lie reaction (plays when the right evidence lands)</p>
                            <div className="grid grid-cols-2 gap-1">
                              <Field label="Speaker">
                                <select
                                  className={inputCls}
                                  value={b.lie.caughtBeat.characterId}
                                  onChange={(e) =>
                                    mutate((d) => {
                                      const s = d.scenes.find((x) => x.id === scene.id)!;
                                      s.dialogueBeats!.find((x) => x.id === b.id)!.lie!.caughtBeat.characterId = e.target.value;
                                    })
                                  }
                                >
                                  <option value="narrator">🎙 Narrator (V.O.)</option>
                                  {story.characters.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </Field>
                              <Field label="Gate (auto-set to the caught flag)">
                                <span className="font-type text-[10px] text-paper/50">
                                  requires: <b className="text-gold">{b.lie.contradictedFlag}</b>
                                </span>
                              </Field>
                            </div>
                            <Field label="Reaction line">
                              <CommitTextArea
                                className={`${inputCls} h-14 font-type`}
                                value={b.lie.caughtBeat.text}
                                onCommit={(next) =>
                                  mutateLatest((d) => {
                                    const s = d.scenes.find((x) => x.id === scene.id)!;
                                    const lie = s.dialogueBeats!.find((x) => x.id === b.id)!.lie!;
                                    lie.caughtBeat.text = next;
                                    lie.caughtBeat.conditionRule = { requiresFlags: [lie.contradictedFlag] };
                                  })
                                }
                              />
                            </Field>
                          </div>
                          <Field label='"They will remember that" card on a successful catch (optional)'>
                            <input
                              className={inputCls}
                              value={b.lie.rememberLine ?? ""}
                              placeholder='e.g. Vera knows you’ve got her.'
                              onChange={(e) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  s.dialogueBeats!.find((x) => x.id === b.id)!.lie!.rememberLine = e.target.value || undefined;
                                })
                              }
                            />
                          </Field>
                          <div className="grid grid-cols-2 gap-1">
                            <Field label="Composure damage (in an interrogation; 0 = none, 2+ cracks)">
                              <input
                                type="number" min={0} max={6}
                                className={inputCls}
                                value={b.lie.composureDamage ?? 0}
                                onChange={(e) =>
                                  mutate((d) => {
                                    const s = d.scenes.find((x) => x.id === scene.id)!;
                                    s.dialogueBeats!.find((x) => x.id === b.id)!.lie!.composureDamage = Number(e.target.value) || 0;
                                  })
                                }
                              />
                            </Field>
                            <Field label="Wrong-evidence guesses before they shut down (default 2)">
                              <input
                                type="number" min={1} max={9}
                                className={inputCls}
                                value={b.lie.wrongEvidenceLimit ?? 2}
                                onChange={(e) =>
                                  mutate((d) => {
                                    const s = d.scenes.find((x) => x.id === scene.id)!;
                                    s.dialogueBeats!.find((x) => x.id === b.id)!.lie!.wrongEvidenceLimit = Number(e.target.value) || 2;
                                  })
                                }
                              />
                            </Field>
                          </div>
                          <Field label="Bluff-called line (wrong evidence — defaults to a generic scoff)">
                            <CommitTextArea
                              className={`${inputCls} h-12 font-type`}
                              value={b.lie.wrongBeat?.text ?? ""}
                              onCommit={(next) =>
                                mutateLatest((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  const lie = s.dialogueBeats!.find((x) => x.id === b.id)!.lie!;
                                  if (next.trim()) {
                                    lie.wrongBeat = lie.wrongBeat ?? { id: `b_${uid()}`, characterId: b.characterId, text: "" };
                                    lie.wrongBeat.text = next;
                                  } else {
                                    lie.wrongBeat = undefined;
                                  }
                                })
                              }
                            />
                          </Field>
                          <div className="grid grid-cols-2 gap-1">
                            <Field label="Correct-catch consequences (trust + / heat − / flags)">
                              <LieConsequences
                                lie={b.lie}
                                field="contradictedConsequences"
                                story={story}
                                onChange={(cons) =>
                                  mutate((d) => {
                                    const s = d.scenes.find((x) => x.id === scene.id)!;
                                    s.dialogueBeats!.find((x) => x.id === b.id)!.lie!.contradictedConsequences = cons;
                                  })
                                }
                              />
                            </Field>
                            <Field label="Bluff-called consequences (heat + / trust −)">
                              <LieConsequences
                                lie={b.lie}
                                field="wrongConsequences"
                                story={story}
                                onChange={(cons) =>
                                  mutate((d) => {
                                    const s = d.scenes.find((x) => x.id === scene.id)!;
                                    s.dialogueBeats!.find((x) => x.id === b.id)!.lie!.wrongConsequences = cons;
                                  })
                                }
                              />
                            </Field>
                          </div>
                          <button
                            onClick={() =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                s.dialogueBeats!.find((x) => x.id === b.id)!.lie = undefined;
                              })
                            }
                            className="w-full border border-crimson/40 py-1 font-pulp text-[9px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
                          >
                            ✕ Remove the lie
                          </button>
                        </div>
                      )}
                    </CollapsibleSection>
                    </CollapsibleSection>
                  );
                })}
                <button
                  onClick={() => {
                    const id = `b_${uid()}`;
                    mutate((d) => {
                      const s = d.scenes.find((x) => x.id === scene.id)!;
                      s.dialogueBeats = s.dialogueBeats ?? [];
                      s.dialogueBeats.push({
                        id,
                        characterId: story.characters[0]?.id ?? "narrator",
                        text: "New line of smoky dialogue...",
                      });
                    });
                    // The fresh beat becomes the one maximised card (and folds
                    // whatever was open), so the author lands straight in it.
                    setExpandedBeatId(id);
                    setFocusedBeatId(id);
                    window.setTimeout(() => setFocusedBeatId(null), 1600);
                  }}
                  className="w-full border border-cyan-neon/50 py-1.5 font-pulp text-[10px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/10"
                >
                  ＋ Add dialogue beat
                </button>
              </>
            )}

            {scene && scene.nodeType !== "note" && tab === "hotspots" && (
              <>
                <HelpNote id="hotspots-tab" title="Hotspots">
                  A hotspot is a clickable zone on the art. One action each: go to scene, give item, set flag, show
                  text, meter change, open corkboard, or use item (consume it, then run the rest). Only{" "}
                  <b>go to scene</b> / <b>use item</b> need a target — a give-item or set-flag hotspot legitimately
                  stays in place (that's how you build safes and cipher puzzles). Add <b>gating</b> to lock it; the
                  custom fail message replaces the generic “locked up tighter…” hint. Give a zone an{" "}
                  <b>object image</b> (a transparent PNG of a cup, a watch, a key) and it's drawn inside the zone —
                  drag the zone to position and scale it, and it zooms with the scene under the examine camera.
                </HelpNote>
                {scene.nodeType === "stage" ? (
                  <div className="flex items-center gap-1">
                    <span className="font-pulp text-[9px] uppercase tracking-widest text-paper/40">Draw</span>
                    <button
                      className={`border px-2 py-0.5 font-pulp text-[9px] uppercase tracking-widest ${
                        zoneMode === "spawn" ? "border-cyan-neon bg-cyan-neon/15 text-cyan-neon" : "border-noir-600 text-paper/50"
                      }`}
                      onClick={() => setZoneMode("spawn")}
                      title="Where the player character starts — click or drag on the plate"
                    >
                      🚶 Player start
                    </button>
                    <button
                      className={`border px-2 py-0.5 font-pulp text-[9px] uppercase tracking-widest ${
                        zoneMode === "hotspot" ? "border-neon bg-neon/15 text-neon" : "border-noir-600 text-paper/50"
                      }`}
                      onClick={() => setZoneMode("hotspot")}
                    >
                      ⌖ Hotspots
                    </button>
                    <button
                      className={`border px-2 py-0.5 font-pulp text-[9px] uppercase tracking-widest ${
                        zoneMode === "barrier" ? "border-crimson bg-crimson/15 text-crimson" : "border-noir-600 text-paper/50"
                      }`}
                      onClick={() => setZoneMode("barrier")}
                      title="No-go areas: walls, counters, furniture the walker must route around"
                    >
                      🚧 Barriers (no-go)
                    </button>
                  </div>
                ) : null}
                <p className="font-type text-[11px] text-paper/60">
                  {zoneMode === "spawn" && scene.nodeType === "stage"
                    ? "Click or drag on the plate to place the PLAYER CHARACTER — they stand where you drop them, clamped to the walkable floor."
                    : zoneMode === "barrier" && scene.nodeType === "stage"
                      ? "Drag on the plate to fence off a NO-GO area — a wall, a counter, a parked truck. The walker routes around it; click one to select, then drag a new box to reshape it."
                      : "Drag directly on the preview to draw bounds — it updates the selected hotspot, or creates a new one."}
                </p>
                {zoneMode === "barrier" && scene.nodeType === "stage"
                  ? (() => {
                      const obs = scene.stage?.obstacles ?? [];
                      const setObs = (list: { x: number; y: number; w: number; h: number }[]) =>
                        updateScene(scene.id, { stage: { ...(scene.stage ?? {}), obstacles: list.length ? list : undefined } });
                      return (
                        <div className="space-y-1 border border-crimson/30 bg-crimson/5 p-2">
                          <div className="font-pulp text-[9px] uppercase tracking-widest text-crimson">
                            🚧 No-go areas ({obs.length})
                          </div>
                          {obs.length === 0 ? (
                            <p className="font-type text-[9px] text-paper/45">
                              None yet — drag a box on the plate to fence something off.
                            </p>
                          ) : null}
                          {obs.map((o, oi) => (
                            <div key={oi} className="flex items-center gap-1">
                              <button
                                className={`flex-1 border px-1.5 py-0.5 text-left font-type text-[10px] ${
                                  selectedBarrier === oi ? "border-crimson bg-crimson/15 text-crimson" : "border-noir-700 text-paper/60"
                                }`}
                                onClick={() => setSelectedBarrier(selectedBarrier === oi ? null : oi)}
                              >
                                🚧 {Math.round(o.x)},{Math.round(o.y)} — {Math.round(o.w)}×{Math.round(o.h)}%
                              </button>
                              <button
                                className="shrink-0 px-1 font-pulp text-[9px] text-crimson"
                                title="Remove this barrier"
                                onClick={() => {
                                  setObs(obs.filter((_, j) => j !== oi));
                                  setSelectedBarrier(null);
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                          <button
                            className="w-full border border-crimson/40 py-0.5 font-pulp text-[8px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
                            onClick={() => {
                              setObs([...obs, { x: 40, y: 68, w: 18, h: 12 }]);
                              setSelectedBarrier(obs.length);
                            }}
                          >
                            ＋ add barrier
                          </button>
                        </div>
                      );
                    })()
                  : null}
                <HotspotCanvas
                  scene={scene}
                  items={story.items}
                  selectedId={selectedHotspot}
                  media={media}
                  barrierMode={zoneMode === "barrier" && scene.nodeType === "stage"}
                  spawnMode={zoneMode === "spawn" && scene.nodeType === "stage"}
                  spawn={scene.stage?.spawn ?? { x: 50, y: 88 }}
                  player={{
                    ...(scene.stage?.playerImage ? { image: scene.stage.playerImage } : {}),
                    ...(scene.stage?.playerSheet ? { sheet: scene.stage.playerSheet } : {}),
                    ...(scene.stage?.playerScale ? { scale: scene.stage.playerScale } : {}),
                  }}
                  onSpawnMove={(p) => {
                    const floor = stageFloorOf(scene.stage);
                    updateScene(scene.id, {
                      stage: {
                        ...(scene.stage ?? {}),
                        spawn: { x: p.x, y: clamp(p.y, floor.top, floor.bottom) },
                      },
                    });
                  }}
                  barriers={scene.stage?.obstacles ?? []}
                  selectedBarrier={selectedBarrier}
                  onBarrierSelect={(i) => setSelectedBarrier(i)}
                  onBarrierDraw={(bounds) => {
                    const obs = scene.stage?.obstacles ?? [];
                    const next =
                      selectedBarrier !== null && obs[selectedBarrier]
                        ? obs.map((o, j) => (j === selectedBarrier ? bounds : o))
                        : [...obs, bounds];
                    updateScene(scene.id, { stage: { ...(scene.stage ?? {}), obstacles: next } });
                    if (selectedBarrier === null) setSelectedBarrier(next.length - 1);
                  }}
                  onSelect={(id) => {
                    setSelectedHotspot(id);
                    if (id) setSelectedBarrier(null);
                  }}
                  onDraw={(bounds) => {
                    if (selectedHotspot && scene.hotspots?.some((h) => h.id === selectedHotspot)) {
                      mutate((d) => {
                        const s = d.scenes.find((x) => x.id === scene.id)!;
                        s.hotspots!.find((h) => h.id === selectedHotspot)!.bounds = bounds;
                      });
                    } else {
                      const id = `hs_${uid()}`;
                      mutate((d) => {
                        const s = d.scenes.find((x) => x.id === scene.id)!;
                        s.hotspots = s.hotspots ?? [];
                        s.hotspots.push({
                          id,
                          label: "New hotspot",
                          bounds,
                          cursor: "look",
                          isRepeatable: true,
                          action: { type: "showText", text: "You see something interesting." },
                        });
                      });
                      setSelectedHotspot(id);
                    }
                  }}
                />
                {(scene.hotspots ?? []).map((h) => (
                  <div key={h.id} onClick={() => setSelectedHotspot(h.id)}>
                    <CollapsibleSection
                      id={`hotspot-${h.id}`}
                      title={<span>⌖ {h.label || "Hotspot"}</span>}
                      titleClass="text-gold"
                      defaultOpen={selectedHotspot === h.id}
                      className={`border ${selectedHotspot === h.id ? "border-neon" : "border-noir-600"}`}
                      headerRight={
                        <button
                          className="text-[10px] text-crimson hover:underline"
                          onClick={() =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.hotspots = s.hotspots?.filter((x) => x.id !== h.id);
                            })
                          }
                          title="Delete this hotspot"
                        >
                          ✕
                        </button>
                      }
                    >
                    <div className="grid grid-cols-2 gap-1">
                      <Field label="Label">
                        <input
                          className={inputCls}
                          value={h.label}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.hotspots!.find((x) => x.id === h.id)!.label = e.target.value;
                            })
                          }
                        />
                      </Field>
                      <Field label="Cursor">
                        <select
                          className={inputCls}
                          value={h.cursor}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.hotspots!.find((x) => x.id === h.id)!.cursor = e.target.value as CursorKind;
                            })
                          }
                        >
                          {VERB_IDS.map((c) => (
                            <option key={c} value={c}>
                              {VERB_ICON[c]} {VERB_LABEL[c]}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <Field label="Action type">
                        <select
                          className={inputCls}
                          value={h.action.type}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.hotspots!.find((x) => x.id === h.id)!.action.type = e.target.value as never;
                            })
                          }
                        >
                          {[
                            { v: "goToScene", label: "→ Go to scene" },
                            { v: "giveItem", label: "🎁 Give item" },
                            { v: "useItem", label: "🗝 Use item (consumes)" },
                            { v: "setFlag", label: "🚩 Set flag" },
                            { v: "showText", label: "💬 Show text" },
                            { v: "openBoard", label: "📌 Open corkboard" },
                            { v: "openMap", label: "🗺 Open travel map" },
                            { v: "patternPuzzle", label: "🔍 Pattern puzzle" },
                            { v: "startDialogue", label: "🗣 Start conversation (stage)" },
                          ].map((t) => (
                            <option key={t.v} value={t.v}>{t.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Target scene">
                        <select
                          className={inputCls}
                          value={h.action.targetSceneId ?? ""}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.hotspots!.find((x) => x.id === h.id)!.action.targetSceneId = e.target.value || undefined;
                            })
                          }
                        >
                          <option value="">—</option>
                          {story.scenes.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <Field label="Object image (transparent)">
                        <ImagePicker
                          value={h.image}
                          onChange={(v) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.hotspots!.find((x) => x.id === h.id)!.image = v;
                            })
                          }
                          storyId={story.id}
                          includeGradients={false}
                          placeholder="Pick an object image…"
                        />
                        <div className="mt-1 flex gap-1">
                          <MediaUploadButton
                            storyId={story.id}
                            accept="image/*"
                            label="⇧ Upload PNG"
                            onUploaded={(_url, assetId) =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                s.hotspots!.find((x) => x.id === h.id)!.image = `asset:${assetId}`;
                              })
                            }
                          />
                          {h.image && (
                            <button
                              onClick={() =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  const hs = s.hotspots!.find((x) => x.id === h.id)!;
                                  hs.image = undefined;
                                  hs.imageFit = undefined;
                                })
                              }
                              className="border border-crimson/40 px-2 py-1 font-pulp text-[10px] uppercase tracking-widest text-crimson hover:bg-crimson/10"
                            >
                              ✕ Remove
                            </button>
                          )}
                        </div>
                        <p className="mt-1 font-type text-[9px] leading-snug text-paper/40">
                          Transparent PNG/WebP of the object — the zone's bounds are its frame, so drag the zone to
                          position and scale it. It zooms with the scene and vanishes when the zone is used.
                        </p>
                      </Field>
                      <div className="flex flex-col gap-1">
                        <Field label="Image fit">
                          <select
                            className={inputCls}
                            value={h.imageFit ?? "contain"}
                            onChange={(e) =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                s.hotspots!.find((x) => x.id === h.id)!.imageFit = e.target.value as "contain" | "cover";
                              })
                            }
                          >
                            <option value="contain">contain — whole object</option>
                            <option value="cover">cover — fill the zone</option>
                          </select>
                        </Field>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <Field label="Grants item">
                        <select
                          className={inputCls}
                          value={h.action.itemGranted ?? ""}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.hotspots!.find((x) => x.id === h.id)!.action.itemGranted = e.target.value || undefined;
                            })
                          }
                        >
                          <option value="">—</option>
                          {story.items.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.icon} {i.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Sets flag">
                        <FlagInput
                          value={h.action.flagSet}
                          suggestions={allFlags}
                          onChange={(v) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.hotspots!.find((x) => x.id === h.id)!.action.flagSet = v;
                            })
                          }
                        />
                      </Field>
                    </div>
                    {/* ---- VERB COIN: what else this object answers to ---- */}
                    {(() => {
                      const hsSet = (patch: Partial<Hotspot>) =>
                        mutate((d) => {
                          const s = d.scenes.find((x) => x.id === scene.id)!;
                          Object.assign(s.hotspots!.find((x) => x.id === h.id)!, patch);
                        });
                      const verbs = h.verbs ?? {};
                      const used = Object.keys(verbs) as (typeof VERB_IDS)[number][];
                      const setVerbAction = (v: string, action: Hotspot["action"]) =>
                        hsSet({ verbs: { ...verbs, [v]: { ...(verbs as Record<string, Hotspot["action"]>)[v], ...action } } });
                      const dropVerb = (v: string) => {
                        const next: Record<string, Hotspot["action"]> = { ...verbs };
                        delete next[v];
                        hsSet({ verbs: Object.keys(next).length ? (next as Hotspot["verbs"]) : undefined });
                      };
                      const accepts = h.acceptsItems ?? [];
                      const toggleAccept = (id: string) =>
                        hsSet({ acceptsItems: accepts.includes(id) ? accepts.filter((x) => x !== id) : [...accepts, id] });
                      const setResponse = (id: string, text: string) =>
                        hsSet({ itemResponses: { ...(h.itemResponses ?? {}), [id]: text } });
                      const unsetVerbs = VERB_IDS.filter((v) => !used.includes(v));
                      const actType = (v: string) => (verbs as Record<string, Hotspot["action"]>)[v]?.type ?? "showText";
                      return (
                        <div className="space-y-1 border border-gold/30 bg-gold/5 p-2">
                          <div className="font-pulp text-[9px] uppercase tracking-widest text-gold">🎚 Verb coin — other verbs</div>
                          <p className="font-type text-[9px] leading-snug text-paper/45">
                            What this object says when the player uses a DIFFERENT verb on it (the action above is the
                            default, and is what plays with the coin off). Verb actions are repeatable — looking at a
                            thing never uses it up. Anything not listed gets the story's "that doesn't work" line.
                          </p>
                          {used.map((v) => {
                            const a = (verbs as Record<string, Hotspot["action"]>)[v];
                            return (
                              <div key={v} className="space-y-1 border border-noir-700/60 p-1">
                                <div className="flex items-center gap-1">
                                  <span className="w-14 shrink-0 font-pulp text-[9px] uppercase tracking-widest text-gold/80">
                                    <span aria-hidden>{VERB_ICON[v]}</span> {v}
                                  </span>
                                  <select
                                    className={inputCls}
                                    value={actType(v)}
                                    onChange={(e) => {
                                      const ty = e.target.value as Hotspot["action"]["type"];
                                      const base: Hotspot["action"] =
                                        ty === "showText" ? { type: "showText", text: "" }
                                        : ty === "giveItem" ? { type: "giveItem", itemGranted: undefined }
                                        : ty === "goToScene" ? { type: "goToScene", targetSceneId: undefined }
                                        : ty === "useItem" ? { type: "useItem", itemConsumed: undefined }
                                        : { type: "showText", text: "" };
                                      setVerbAction(v, base);
                                    }}
                                  >
                                    <option value="showText">💬 Say a line</option>
                                    <option value="giveItem">🎁 Give item</option>
                                    <option value="goToScene">→ Go to scene</option>
                                    <option value="useItem">🗝 Use item (consumes it)</option>
                                  </select>
                                  <button className="shrink-0 px-1 font-pulp text-[9px] text-crimson" title="Remove this verb" onClick={() => dropVerb(v)}>✕</button>
                                </div>
                                {a?.type === "showText" ? (
                                  <textarea
                                    className={`${inputCls} h-14 font-type`}
                                    placeholder="What it says…"
                                    value={a.text ?? ""}
                                    onChange={(e) => setVerbAction(v, { ...a, text: e.target.value })}
                                  />
                                ) : null}
                                {a?.type === "giveItem" ? (
                                  <select className={inputCls} value={a.itemGranted ?? ""} onChange={(e) => setVerbAction(v, { ...a, itemGranted: e.target.value || undefined })}>
                                    <option value="">— pick an item —</option>
                                    {story.items.map((it) => (<option key={it.id} value={it.id}>{it.icon} {it.name}</option>))}
                                  </select>
                                ) : null}
                                {a?.type === "goToScene" ? (
                                  <select className={inputCls} value={a.targetSceneId ?? ""} onChange={(e) => setVerbAction(v, { ...a, targetSceneId: e.target.value || undefined })}>
                                    <option value="">— pick a scene —</option>
                                    {story.scenes.map((s) => (<option key={s.id} value={s.id}>{s.title}</option>))}
                                  </select>
                                ) : null}
                                {a?.type === "useItem" ? (
                                  <select className={inputCls} value={a.itemConsumed ?? ""} onChange={(e) => setVerbAction(v, { ...a, itemConsumed: e.target.value || undefined })}>
                                    <option value="">— which item does this consume? —</option>
                                    {story.items.map((it) => (<option key={it.id} value={it.id}>{it.icon} {it.name}</option>))}
                                  </select>
                                ) : null}
                              </div>
                            );
                          })}
                          {unsetVerbs.length ? (
                            <select
                              className={inputCls}
                              value=""
                              onChange={(e) => {
                                if (!e.target.value) return;
                                setVerbAction(e.target.value, { type: "showText", text: "" });
                              }}
                            >
                              <option value="">＋ add a verb action…</option>
                              {unsetVerbs.map((v) => (
                                <option key={v} value={v}>{VERB_ICON[v]} {VERB_LABEL[v]}</option>
                              ))}
                            </select>
                          ) : null}

                          {/* ---- items this object accepts (the USE verb) ---- */}
                          <div className="border-t border-gold/20 pt-1">
                            <div className="font-pulp text-[9px] uppercase tracking-widest text-gold/80">🎒 Accepts these items (USE)</div>
                            <p className="font-type text-[9px] leading-snug text-paper/45">
                              Tick what WORKS here. The player arms it in the coin and clicks this object; anything
                              else gets refused. Write the line it gets back — that's the joke, and the clue.
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {story.items.map((it) => {
                                const on = accepts.includes(it.id);
                                return (
                                  <button
                                    key={it.id}
                                    type="button"
                                    className={`border px-1.5 py-0.5 font-type text-[10px] ${on ? "border-gold bg-gold/20 text-gold" : "border-noir-700 text-paper/50"}`}
                                    onClick={() => toggleAccept(it.id)}
                                  >
                                    {it.icon} {it.name}
                                  </button>
                                );
                              })}
                            </div>
                            {accepts.map((id) => {
                              const it = story.items.find((x) => x.id === id);
                              return (
                                <div key={id} className="mt-1">
                                  <div className="font-pulp text-[9px] uppercase tracking-widest text-paper/40">
                                    {it?.icon} {it?.name ?? id} — line
                                  </div>
                                  <textarea
                                    className={`${inputCls} h-14 font-type`}
                                    placeholder="What happens when they use it here…"
                                    value={h.itemResponses?.[id] ?? ""}
                                    onChange={(e) => setResponse(id, e.target.value)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <Field label="Refusal line (wrong verb / wrong item)">
                            <input
                              className={inputCls}
                              value={h.wrongVerbText ?? ""}
                              placeholder="Leave blank for the story's default"
                              onChange={(e) => hsSet({ wrongVerbText: e.target.value || undefined })}
                            />
                          </Field>
                        </div>
                      );
                    })()}
                    {h.action.type === "patternPuzzle" && (
                      (() => {
                        const pp = h.action.patternPuzzle ?? { title: "Bank Statements", instruction: "Find the entries that don't belong", rows: [], targetCount: 3, payoffText: "" };
                        const setPP = (patch: Partial<typeof pp>) => mutate((d) => {
                          const s = d.scenes.find((x) => x.id === scene.id)!;
                          const hs = s.hotspots!.find((x) => x.id === h.id)!;
                          hs.action.patternPuzzle = { ...pp, ...patch };
                        });
                        // The player must flag every marked answer, so the flag
                        // count is derived from the answers — not a free slider.
                        const marked = pp.rows.filter((r) => r.isAnswer).length;
                        const setReward = (patch: Partial<Consequences>) => setPP({ rewardConsequences: { ...(pp.rewardConsequences ?? {}), ...patch } });
                        const setWrong = (patch: Partial<Consequences>) => setPP({ wrongSubmissionConsequences: { ...(pp.wrongSubmissionConsequences ?? {}), ...patch } });
                        const meterOf = (cons: Consequences | undefined, meter: MeterKey) => cons?.meterChanges?.find((m) => m.meter === meter)?.delta ?? "";
                        const setMeter = (cons: Consequences | undefined, setCons: (patch: Partial<Consequences>) => void, meter: MeterKey, val: string) => {
                          const list = (cons?.meterChanges ?? []).filter((m) => m.meter !== meter);
                          if (val !== "" && Number(val) !== 0) list.push({ meter, delta: Number(val) });
                          setCons({ meterChanges: list.length ? list : undefined });
                        };
                        return (
                          <div className="space-y-2 border border-cyan-neon/25 bg-cyan-neon/5 p-2">
                            <div className="font-pulp text-[9px] uppercase tracking-widest text-cyan-neon">🔍 Pattern Puzzle</div>
                            <p className="font-type text-[9px] text-paper/45">A ledger mini-game: the player flags rows that share a hidden pattern. Correct → payoff + rewards; wrong → narrative consequences (Heat, flags, trust).</p>
                            <Field label="Puzzle title"><input className={inputCls} value={pp.title} onChange={(e) => setPP({ title: e.target.value })} placeholder="Bank Statements" /></Field>
                            <Field label="Instruction"><input className={inputCls} value={pp.instruction} onChange={(e) => setPP({ instruction: e.target.value })} placeholder="Find the three withdrawals that don't belong" /></Field>
                            <Field label={`Flag count — ${marked} answer(s) marked${marked > 0 ? " · syncs automatically" : " · mark answers below"}`}>
                              <input type="range" min={1} max={6} className="w-full accent-pink-500" value={marked > 0 ? marked : pp.targetCount} onChange={(e) => setPP({ targetCount: Number(e.target.value) })} />
                              <p className="mt-1 font-type text-[9px] text-paper/40">In play the player must flag every row you tick as an answer, so the count tracks your answers automatically.</p>
                            </Field>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-pulp text-[9px] uppercase tracking-widest text-paper/40">Rows ({pp.rows.length})</span>
                                <button onClick={() => setPP({ rows: [...pp.rows, { id: `r_${uid()}`, date: "", description: "", amount: "", isAnswer: false }] })} className="border border-cyan-neon/40 px-2 py-0.5 font-pulp text-[9px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/10">＋ Row</button>
                              </div>
                              {pp.rows.map((row, ri) => (
                                <div key={row.id} className="space-y-1 border border-noir-700/60 p-1.5">
                                  <div className="flex items-center gap-1">
                                    <input className={`${inputCls} w-16`} placeholder="Aug 6" value={row.date} onChange={(e) => { const next = [...pp.rows]; next[ri] = { ...row, date: e.target.value }; setPP({ rows: next }); }} />
                                    <input className={`${inputCls} flex-1`} placeholder="Blackwood First Nat'l — Main Br." value={row.description} onChange={(e) => { const next = [...pp.rows]; next[ri] = { ...row, description: e.target.value }; setPP({ rows: next }); }} />
                                    <input className={`${inputCls} w-24`} placeholder="-$9,800" value={row.amount} onChange={(e) => { const next = [...pp.rows]; next[ri] = { ...row, amount: e.target.value }; setPP({ rows: next }); }} />
                                    <button onClick={() => setPP({ rows: pp.rows.filter((_, idx) => idx !== ri) })} className="shrink-0 text-crimson hover:underline text-[10px]">✕</button>
                                  </div>
                                  <label className="flex items-center gap-1 text-[9px] text-paper/50">
                                    <input type="checkbox" checked={row.isAnswer} onChange={(e) => { const next = [...pp.rows]; next[ri] = { ...row, isAnswer: e.target.checked }; const ac = next.filter((r) => r.isAnswer).length; setPP({ rows: next, targetCount: ac > 0 ? ac : pp.targetCount }); }} />
                                    Part of the pattern (answer)
                                  </label>
                                </div>
                              ))}
                              {marked === 0 && <p className="border border-crimson/30 bg-crimson/5 px-2 py-1 font-type text-[9px] text-crimson">⚠ No rows are marked as answers yet — the puzzle is unsolvable until at least one is.</p>}
                            </div>
                            <Field label="Payoff text (shown when cracked)"><textarea className={`${inputCls} h-16 font-type`} value={pp.payoffText} onChange={(e) => setPP({ payoffText: e.target.value })} placeholder="Jack's voice echoes: 'Three branches, three days, near ten grand each. Someone was draining the account before the audit...'" /></Field>

                            {/* ---- On solve: reward + route ---- */}
                            <div className="space-y-2 border-t border-emerald-500/20 pt-2">
                              <div className="font-pulp text-[9px] uppercase tracking-widest text-emerald-400">✓ On solve — reward &amp; route</div>
                              <div className="grid grid-cols-2 gap-1">
                                <Field label="Grant item">
                                  <select className={inputCls} value={pp.rewardConsequences?.addItems?.[0] ?? ""} onChange={(e) => setReward({ addItems: e.target.value ? [e.target.value] : undefined })}>
                                    <option value="">— none —</option>
                                    {story.items.map((it) => (<option key={it.id} value={it.id}>{it.icon} {it.name}</option>))}
                                  </select>
                                </Field>
                                <Field label="Deduce delta">
                                  <input type="number" className={inputCls} value={meterOf(pp.rewardConsequences, "Clever")} onChange={(e) => setMeter(pp.rewardConsequences, setReward, "Clever", e.target.value)} />
                                </Field>
                              </div>
                              <Field label="Sets flags"><FlagPicker value={pp.rewardConsequences?.setFlags} suggestions={allFlags} onChange={(v) => setReward({ setFlags: v })} /></Field>
                              <Field label="Go to scene on solve (optional — leave blank to stay put)">
                                <select className={inputCls} value={pp.targetSceneId ?? ""} onChange={(e) => setPP({ targetSceneId: e.target.value || undefined })}>
                                  <option value="">— stay in this scene —</option>
                                  {story.scenes.map((s) => (<option key={s.id} value={s.id}>{s.title}</option>))}
                                </select>
                              </Field>
                            </div>

                            {/* ---- On wrong: consequences + route ---- */}
                            <div className="space-y-2 border-t border-crimson/20 pt-2">
                              <div className="font-pulp text-[9px] uppercase tracking-widest text-crimson">✗ On wrong — message, consequences &amp; route</div>
                              <label className="flex items-center gap-2 text-[9px] text-paper/50">
                                <input type="checkbox" checked={pp.allowRetry !== false} onChange={(e) => setPP({ allowRetry: e.target.checked || undefined })} />
                                Allow retry after a wrong guess (off = a wrong submission is narratively final — apply the consequences and route below)
                              </label>
                              <Field label="Wrong-guess message (shown on a retryable miss)"><input className={inputCls} value={pp.wrongMessage ?? ""} onChange={(e) => setPP({ wrongMessage: e.target.value || undefined })} placeholder="Those three are clean — look again." /></Field>
                              <div className="grid grid-cols-2 gap-1">
                                <Field label="Heat delta (on final wrong)"><input type="number" className={inputCls} value={meterOf(pp.wrongSubmissionConsequences, "Suspicion")} onChange={(e) => setMeter(pp.wrongSubmissionConsequences, setWrong, "Suspicion", e.target.value)} /></Field>
                                <Field label="Go to scene on final wrong (optional)">
                                  <select className={inputCls} value={pp.wrongTargetSceneId ?? ""} onChange={(e) => setPP({ wrongTargetSceneId: e.target.value || undefined })}>
                                    <option value="">— stay in this scene —</option>
                                    {story.scenes.map((s) => (<option key={s.id} value={s.id}>{s.title}</option>))}
                                  </select>
                                </Field>
                              </div>
                              <Field label="Sets flags (on final wrong)"><FlagPicker value={pp.wrongSubmissionConsequences?.setFlags} suggestions={allFlags} onChange={(v) => setWrong({ setFlags: v })} /></Field>
                              {pp.allowRetry !== false && (pp.wrongSubmissionConsequences || pp.wrongTargetSceneId) && (
                                <p className="border border-gold/25 bg-gold/5 px-2 py-1 font-type text-[9px] text-gold/80">ℹ Retry is ON, so these wrong-consequences only fire if you switch retry OFF — otherwise the player just tries again.</p>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    )}
                    {h.action.type === "showText" && (
                      <Field label="Text shown">
                        <textarea
                          className={`${inputCls} h-14 font-type`}
                          value={h.action.text ?? ""}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.hotspots!.find((x) => x.id === h.id)!.action.text = e.target.value;
                            })
                          }
                        />
                      </Field>
                    )}
                    {h.action.type === "useItem" && (
                      <Field label="Consumes item (from Gating requirement)">
                        <select
                          className={inputCls}
                          value={h.action.itemConsumed ?? ""}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.hotspots!.find((x) => x.id === h.id)!.action.itemConsumed = e.target.value || undefined;
                            })
                          }
                        >
                          <option value="">— none —</option>
                          {story.items.map((i) => (
                            <option key={i.id} value={i.id}>{i.icon} {i.name}</option>
                          ))}
                        </select>
                      </Field>
                    )}
                    {(h.action.type === "giveItem" || h.action.type === "showText") && (
                      <div className="space-y-1.5 border border-gold/30 bg-gold/5 p-2">
                        <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                          <input
                            type="checkbox"
                            checked={!!h.examine}
                            onChange={(e) =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                const hs = s.hotspots!.find((x) => x.id === h.id)!;
                                hs.examine = e.target.checked || undefined;
                                if (!e.target.checked) hs.examineSeconds = undefined;
                              })
                            }
                          />
                          🔍 EXAMINE — hold to inspect (camera zooms in)
                        </label>
                        {h.examine && (
                          <>
                            <Field label={`Examine hold — ${(h.examineSeconds ?? 2.5).toFixed(1)}s`}>
                              <input
                                type="range"
                                min={1}
                                max={6}
                                step={0.5}
                                className="w-full accent-amber-500"
                                value={h.examineSeconds ?? 2.5}
                                onChange={(e) =>
                                  mutate((d) => {
                                    const s = d.scenes.find((x) => x.id === scene.id)!;
                                    s.hotspots!.find((x) => x.id === h.id)!.examineSeconds = Number(e.target.value);
                                  })
                                }
                              />
                            </Field>
                            <p className="font-type text-[9px] leading-snug text-paper/45">
                              The player HOLDS this zone: the camera zooms in, an “EXAMINING” meter fills, and on
                              completion the {h.action.type === "giveItem" ? "item is picked up" : "description shows"}
                              — then the zone is hidden. Set a <b>flag</b> on the action and gate a beat on it to
                              narrate the discovery. Use a <b>LARGE, detailed</b> background image: the zoom is a CSS
                              magnification, so a small plate will blur.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                    <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                      <input
                        type="checkbox"
                        checked={!!h.isRepeatable}
                        onChange={(e) =>
                          mutate((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            s.hotspots!.find((x) => x.id === h.id)!.isRepeatable = e.target.checked;
                          })
                        }
                      />
                      repeatable
                    </label>
                    {h.action.itemGranted && (
                      <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                        <input
                          type="checkbox"
                          checked={!!h.showItemImage}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.hotspots!.find((x) => x.id === h.id)!.showItemImage = e.target.checked;
                            })
                          }
                        />
                        🖼 show the item's image in the scene (players see the object to grab)
                      </label>
                    )}
                    <Field label="Custom fail message">
                      <input
                        className={inputCls}
                        value={h.customFailMessage ?? ""}
                        onChange={(e) =>
                          mutate((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            s.hotspots!.find((x) => x.id === h.id)!.customFailMessage = e.target.value || undefined;
                          })
                        }
                      />
                    </Field>
                    <GatingEditor
                      sectionId={`hotspot-${h.id}`}
                      gating={h.gating}
                      items={story.items}
                      characters={story.characters}
                      flags={allFlags}
                      memoryTags={recallSuggestions}
                      onChange={(g) =>
                        mutate((d) => {
                          const s = d.scenes.find((x) => x.id === scene.id)!;
                          s.hotspots!.find((x) => x.id === h.id)!.gating = g;
                        })
                      }
                    />
                    </CollapsibleSection>
                  </div>
                ))}
              </>
            )}

            {scene && scene.nodeType !== "note" && tab === "choices" && (
              <>
                <HelpNote id="choices-tab" title="Choices">
                  A choice either <b>navigates</b> (it has a target scene) or is a <b>💬 reply</b> — replies answer in
                  place and never navigate; pair one with a dialogue beat gated on the flag it sets. <b>Hidden</b>{" "}
                  keeps a choice invisible until its gate passes, an <b>exclusive group</b> makes sibling choices
                  resolve each other, and <b>⚡ quick-time</b> adds a hard deadline with a “you hesitated” expiry
                  branch. State-changing choices are one-shot by default — pure navigation is repeatable.
                </HelpNote>
                {(scene.choices ?? []).map((c, i) => (
                  <div
                    key={c.id}
                    ref={(el) => {
                      if (el && focusedChoiceId === c.id) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                        window.setTimeout(() => setFocusedChoiceId(null), 1600);
                      }
                    }}
                  >
                    <CollapsibleSection
                      id={`choice-${c.id}`}
                      title={
                        <span style={{ color: ATTITUDE_STROKE[c.attitudeTag ?? "Neutral"] }}>
                          ▸ Choice {i + 1} · {c.text.replace(/\s+/g, " ").trim().slice(0, 24)}
                          {c.text.length > 24 && "…"}
                        </span>
                      }
                      titleClass=""
                      defaultOpen={focusedChoiceId === c.id}
                      className={`border ${focusedChoiceId === c.id ? "border-neon bg-neon/10" : "border-noir-600"}`}
                      headerRight={
                        <button
                          className="text-[10px] text-crimson hover:underline"
                          onClick={() =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.choices = s.choices?.filter((x) => x.id !== c.id);
                            })
                          }
                          title="Delete this choice"
                        >
                          ✕
                        </button>
                      }
                    >
                    <Field label="Text">
                      <textarea
                        className={`${inputCls} h-14 font-type`}
                        value={c.text}
                        onChange={(e) =>
                          mutate((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            s.choices!.find((x) => x.id === c.id)!.text = e.target.value;
                          })
                        }
                      />
                    </Field>
                    <label className="flex items-center gap-2 border border-cyan-neon/25 bg-cyan-neon/5 p-1.5 text-[9px] text-paper/70">
                      <input
                        type="checkbox"
                        checked={!!c.reply}
                        onChange={(e) =>
                          mutate((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            s.choices!.find((x) => x.id === c.id)!.reply = e.target.checked || undefined;
                          })
                        }
                      />
                      <span>
                        💬 <b className="text-cyan-neon">Conversational reply</b> — stays in this scene instead of navigating.
                        Set a flag below, then gate a Dialogue beat on it: that beat becomes the reply.
                      </span>
                    </label>
                    <label className="flex items-center gap-2 border border-noir-600/60 p-1.5 text-[9px] text-paper/55">
                      <input
                        type="checkbox"
                        checked={!!c.hidden}
                        onChange={(e) =>
                          mutate((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            s.choices!.find((x) => x.id === c.id)!.hidden = e.target.checked || undefined;
                          })
                        }
                      />
                      <span>
                        🙈 <b className="text-gold">Hidden until unlocked</b> — don't show this choice at all until its gating is satisfied
                        (keeps sequential dialogue from spoiling upcoming questions).
                      </span>
                    </label>
                    <div className={`grid gap-1 ${c.reply ? "grid-cols-2" : "grid-cols-3"}`}>
                      <Field label="Attitude">
                        <select
                          className={inputCls}
                          value={c.attitudeTag ?? "Neutral"}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.choices!.find((x) => x.id === c.id)!.attitudeTag = e.target.value as never;
                            })
                          }
                        >
                          {["Neutral", "Sultry", "Aggressive", "Clever"].map((a) => (
                            <option key={a} value={a}>
                              {a === "Neutral" ? a : METER_LABELS[a as MeterKey]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {!c.reply && (
                        <Field label="Target">
                          <select
                            className={inputCls}
                            value={c.targetSceneId}
                            onChange={(e) =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                s.choices!.find((x) => x.id === c.id)!.targetSceneId = e.target.value;
                              })
                            }
                          >
                            <option value="">— dangling —</option>
                            {story.scenes.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                      <Field label="Timer (s)">
                        <input
                          type="number"
                          className={inputCls}
                          value={c.timeLimitSeconds ?? ""}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              s.choices!.find((x) => x.id === c.id)!.timeLimitSeconds = e.target.value
                                ? Number(e.target.value)
                                : undefined;
                            })
                          }
                        />
                      </Field>
                    </div>
                    {/* ---- Quick-time prompt ---- */}
                    <label className="flex items-center gap-2 border border-crimson/25 bg-crimson/5 p-1.5 text-[9px] text-paper/70">
                      <input
                        type="checkbox"
                        checked={!!c.quickTime}
                        onChange={(e) =>
                          mutate((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            const ch = s.choices!.find((x) => x.id === c.id)!;
                            ch.quickTime = e.target.checked || undefined;
                            // A quick-time prompt with no timer produces no countdown
                            // ring or banner in-game. Give it a sensible default
                            // deadline so the feature is visible the moment it's on.
                            if (e.target.checked && !ch.timeLimitSeconds) ch.timeLimitSeconds = 5;
                          })
                        }
                      />
                      <span>
                        ⚡ <b className="text-crimson">Quick-time prompt</b> — a hard deadline with a big on-screen prompt and a countdown ring. Expiry routes to a "you hesitated" consequence path.
                      </span>
                    </label>
                    {c.quickTime && (
                      <div className="space-y-1.5 border border-crimson/25 bg-crimson/5 p-1.5">
                        <Field label="Timer (seconds) — the hard deadline (enables the countdown ring &amp; banner)">
                          <input
                            type="number"
                            min={1}
                            max={120}
                            className={inputCls}
                            value={c.timeLimitSeconds ?? ""}
                            onChange={(e) =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                s.choices!.find((x) => x.id === c.id)!.timeLimitSeconds = e.target.value
                                  ? Number(e.target.value)
                                  : undefined;
                              })
                            }
                          />
                        </Field>
                        <Field label="Big on-screen prompt (defaults to the choice text)">
                          <input
                            className={inputCls}
                            placeholder="DECIDE!"
                            value={c.qtePrompt ?? ""}
                            onChange={(e) =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                s.choices!.find((x) => x.id === c.id)!.qtePrompt = e.target.value || undefined;
                              })
                            }
                          />
                        </Field>
                        <div className="grid grid-cols-2 gap-1">
                          <label className="flex items-center gap-1 text-[9px] text-paper/60">
                            <input
                              type="checkbox"
                              checked={!!c.qteHeartbeat}
                              onChange={(e) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  s.choices!.find((x) => x.id === c.id)!.qteHeartbeat = e.target.checked || undefined;
                                })
                              }
                            />
                            💓 heartbeat sting
                          </label>
                          <label className="flex items-center gap-1 text-[9px] text-paper/60">
                            <input
                              type="checkbox"
                              checked={!!c.qteShakyCam}
                              onChange={(e) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  s.choices!.find((x) => x.id === c.id)!.qteShakyCam = e.target.checked || undefined;
                                })
                              }
                            />
                            📹 shaky cam on low time
                          </label>
                        </div>
                        <Field label="Timed-out target scene (the 'you hesitated' path — usually a consequence scene)">
                          <select
                            className={inputCls}
                            value={c.timedOutTargetSceneId ?? ""}
                            onChange={(e) =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                s.choices!.find((x) => x.id === c.id)!.timedOutTargetSceneId = e.target.value || undefined;
                              })
                            }
                          >
                            <option value="">(default to the choice's own target)</option>
                            {story.scenes.map((s) => (
                              <option key={s.id} value={s.id}>{s.title}</option>
                            ))}
                          </select>
                        </Field>
                        <div className="grid grid-cols-2 gap-1">
                          <Field label="Timed-out sets flag (react to the silence)">
                            <FlagPicker
                              value={c.timedOutConsequences?.setFlags}
                              suggestions={allFlags}
                              onChange={(v) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  const ch = s.choices!.find((x) => x.id === c.id)!;
                                  ch.timedOutConsequences = { ...(ch.timedOutConsequences ?? {}), setFlags: v };
                                })
                              }
                            />
                          </Field>
                          <Field label="Timed-out Heat delta">
                            <input
                              type="number"
                              className={inputCls}
                              value={c.timedOutConsequences?.meterChanges?.find((m) => m.meter === "Suspicion")?.delta ?? ""}
                              onChange={(e) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  const ch = s.choices!.find((x) => x.id === c.id)!;
                                  const list = (ch.timedOutConsequences?.meterChanges ?? []).filter((x) => x.meter !== "Suspicion");
                                  if (e.target.value !== "" && Number(e.target.value) !== 0)
                                    list.push({ meter: "Suspicion", delta: Number(e.target.value) });
                                  ch.timedOutConsequences = { ...(ch.timedOutConsequences ?? {}), meterChanges: list.length ? list : undefined };
                                })
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    )}
                    <label className="flex items-center gap-2 border border-noir-600/60 p-1.5 text-[9px] text-paper/55">
                      <input
                        type="checkbox"
                        checked={c.isRepeatable ?? !Object.values(c.consequences ?? {}).some((value) => Array.isArray(value) && value.length > 0)}
                        onChange={(e) =>
                          mutate((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            s.choices!.find((x) => x.id === c.id)!.isRepeatable = e.target.checked;
                          })
                        }
                      />
                      <span>
                        <b className="text-gold">Repeatable choice</b> — enable only for navigation/backtracking. Reward, trust and meter choices should stay one-shot.
                      </span>
                    </label>
                    <Field label="Exclusive group (optional — choosing one resolves all with the same group)">
                      <input
                        className={inputCls}
                        placeholder="e.g. opening-approach"
                        value={c.exclusiveGroup ?? ""}
                        onChange={(e) =>
                          mutate((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            s.choices!.find((x) => x.id === c.id)!.exclusiveGroup = e.target.value || undefined;
                          })
                        }
                      />
                    </Field>
                    <Field label="Memory tag (memoryLog) — record this choice so an NPC can recall it later. Use matching tags in a beat's 'Memories recalled'.">
                      <input
                        className={inputCls}
                        placeholder="e.g. opening_sultry"
                        value={c.memoryLog ?? ""}
                        onChange={(e) =>
                          mutate((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            s.choices!.find((x) => x.id === c.id)!.memoryLog = e.target.value || undefined;
                          })
                        }
                      />
                    </Field>
                    <Field label="&quot;X will remember that&quot; card (impact card shown after picking this choice)">
                      <input
                        className={inputCls}
                        placeholder="e.g. Lydia will remember that."
                        value={c.rememberLine ?? ""}
                        onChange={(e) =>
                          mutate((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            s.choices!.find((x) => x.id === c.id)!.rememberLine = e.target.value || undefined;
                          })
                        }
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-1">
                      <Field label="Sets flags">
                        <FlagPicker
                          value={c.consequences?.setFlags}
                          suggestions={allFlags}
                          onChange={(v) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              const ch = s.choices!.find((x) => x.id === c.id)!;
                              ch.consequences = { ...(ch.consequences ?? {}), setFlags: v };
                            })
                          }
                        />
                      </Field>
                      <Field label="Clears flags (undoes previous choices)">
                        <FlagPicker
                          value={c.consequences?.clearFlags}
                          suggestions={allFlags}
                          onChange={(v) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              const ch = s.choices!.find((x) => x.id === c.id)!;
                              ch.consequences = { ...(ch.consequences ?? {}), clearFlags: v };
                            })
                          }
                        />
                      </Field>
                      <Field label="Reward item">
                        <select
                          className={inputCls}
                          value={c.consequences?.addItems?.[0] ?? ""}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              const ch = s.choices!.find((x) => x.id === c.id)!;
                              ch.consequences = {
                                ...(ch.consequences ?? {}),
                                addItems: e.target.value ? [e.target.value] : undefined,
                              };
                            })
                          }
                        >
                          <option value="">— none —</option>
                          {story.items.map((it) => (
                            <option key={it.id} value={it.id}>{it.icon} {it.name}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <Field label="Consume item">
                      <select
                        className={inputCls}
                        value={c.consequences?.removeItems?.[0] ?? ""}
                        onChange={(e) =>
                          mutate((d) => {
                            const s = d.scenes.find((x) => x.id === scene.id)!;
                            const ch = s.choices!.find((x) => x.id === c.id)!;
                            ch.consequences = {
                              ...(ch.consequences ?? {}),
                              removeItems: e.target.value ? [e.target.value] : undefined,
                            };
                          })
                        }
                      >
                        <option value="">— none —</option>
                        {story.items.map((it) => (
                          <option key={it.id} value={it.id}>{it.icon} {it.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Present item (the noir verb — show it to the character)">
                      <div className="flex items-center gap-2">
                        <select
                          className={inputCls}
                          value={c.presentItem ?? ""}
                          onChange={(e) =>
                            mutate((d) => {
                              const s = d.scenes.find((x) => x.id === scene.id)!;
                              const ch = s.choices!.find((x) => x.id === c.id)!;
                              ch.presentItem = e.target.value || undefined;
                            })
                          }
                        >
                          <option value="">— none —</option>
                          {story.items.map((it) => (
                            <option key={it.id} value={it.id}>{it.icon} {it.name}</option>
                          ))}
                        </select>
                        <label
                          className="flex shrink-0 items-center gap-1 text-[9px] text-paper/55"
                          title="Hand it over: the item leaves your inventory (they keep it). Off = you flash it and keep it."
                        >
                          <input
                            type="checkbox"
                            disabled={!c.presentItem}
                            checked={!!c.consumePresentedItem}
                            onChange={(e) =>
                              mutate((d) => {
                                const s = d.scenes.find((x) => x.id === scene.id)!;
                                const ch = s.choices!.find((x) => x.id === c.id)!;
                                ch.consumePresentedItem = e.target.checked || undefined;
                              })
                            }
                          />
                          hand it over
                        </label>
                      </div>
                      <p className="mt-1 font-type text-[9px] leading-snug text-paper/40">
                        The choice locks (and, if hidden, stays hidden) until the player holds the item. Presenting
                        records <code>item:{c.presentItem ?? "…"}</code> as a memory — recall it in a beat
                        (<code>{'recalls: { "item:photo": "You flashed {said}." }'}</code>, where <code>{"{said}"}</code> = the
                        item's name) or gate on it with "Remembers".
                      </p>
                    </Field>
                    <Field label="Meter deltas (Chm/Int/Ded/Heat)">
                      <div className="grid grid-cols-4 gap-1">
                        {METERS.map((m) => {
                          const cur = c.consequences?.meterChanges?.find((x) => x.meter === m)?.delta ?? "";
                          return (
                            <input
                              key={m}
                              type="number"
                              title={METER_LABELS[m]}
                              placeholder={METER_SHORT[m]}
                              className={inputCls}
                              value={cur}
                              onChange={(e) =>
                                mutate((d) => {
                                  const s = d.scenes.find((x) => x.id === scene.id)!;
                                  const ch = s.choices!.find((x) => x.id === c.id)!;
                                  const list = (ch.consequences?.meterChanges ?? []).filter((x) => x.meter !== m);
                                  if (e.target.value !== "" && Number(e.target.value) !== 0)
                                    list.push({ meter: m, delta: Number(e.target.value) });
                                  ch.consequences = { ...(ch.consequences ?? {}), meterChanges: list.length ? list : undefined };
                                })
                              }
                            />
                          );
                        })}
                      </div>
                    </Field>
                    {story.characters.length > 0 && (
                      <Field label="Trust deltas — how this reply moves each person's trust (-5…+5)">
                        <div className="grid grid-cols-2 gap-1">
                          {story.characters.map((ch) => {
                            const cur = c.consequences?.trustChanges?.find((x) => x.characterId === ch.id)?.delta ?? "";
                            return (
                              <label key={ch.id} className="flex items-center gap-1 text-[9px] text-paper/60">
                                <span className="w-16 truncate">{ch.name.split(" ")[0]}</span>
                                <input
                                  type="number"
                                  className={inputCls}
                                  value={cur}
                                  onChange={(e) =>
                                    mutate((d) => {
                                      const s = d.scenes.find((x) => x.id === scene.id)!;
                                      const choice = s.choices!.find((x) => x.id === c.id)!;
                                      const list = (choice.consequences?.trustChanges ?? []).filter((x) => x.characterId !== ch.id);
                                      if (e.target.value !== "" && Number(e.target.value) !== 0)
                                        list.push({ characterId: ch.id, delta: Number(e.target.value) });
                                      choice.consequences = { ...(choice.consequences ?? {}), trustChanges: list.length ? list : undefined };
                                    })
                                  }
                                />
                              </label>
                            );
                          })}
                        </div>
                      </Field>
                    )}
                    <GatingEditor
                      sectionId={`choice-${c.id}`}
                      gating={c.gating}
                      items={story.items}
                      characters={story.characters}
                      flags={allFlags}
                      memoryTags={recallSuggestions}
                      onChange={(g) =>
                        mutate((d) => {
                          const s = d.scenes.find((x) => x.id === scene.id)!;
                          s.choices!.find((x) => x.id === c.id)!.gating = g;
                        })
                      }
                    />
                    </CollapsibleSection>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const id = `c_${uid()}`;
                    mutate((d) => {
                      const s = d.scenes.find((x) => x.id === scene.id)!;
                      s.choices = s.choices ?? [];
                      s.choices.push({ id, text: "A new dangerous idea...", targetSceneId: "", attitudeTag: "Neutral" });
                    });
                    setFocusedChoiceId(id);
                    window.setTimeout(() => setFocusedChoiceId(null), 1600);
                  }}
                  className="w-full border border-neon/50 py-1.5 font-pulp text-[10px] uppercase tracking-widest text-neon hover:bg-neon/10"
                >
                  ＋ Add choice
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {showHelp && <StudioHelpModal onClose={() => setShowHelp(false)} />}

      {exportPayload !== null && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setExportPayload(null)}
        >
          <div
            className="pop-in flex max-h-[85vh] w-full max-w-2xl flex-col border-2 border-gold/60 bg-noir-950 shadow-[0_0_60px_rgba(232,178,60,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gold/30 px-4 py-2">
              <h3 className="font-pulp text-sm uppercase tracking-wide text-gold">
                ⇩ Export "{story.title}" · {(exportPayload.length / 1024).toFixed(0)} KB
              </h3>
              <button onClick={() => setExportPayload(null)} className="px-2 text-lg leading-none text-paper/60 hover:text-neon" aria-label="Close export">
                ✕
              </button>
            </div>
            <p className="border-b border-noir-700 px-4 py-2 font-type text-[10px] text-paper/55">
              Self-contained .reel.json — includes every uploaded image, voice line, and video in this case. Import it from any
              newsstand or Studio to restore it exactly.
            </p>
            <textarea
              id="reel-export-textarea"
              readOnly
              spellCheck={false}
              value={exportPayload}
              className="min-h-0 flex-1 resize-none border-b border-noir-700 bg-noir-900 p-3 font-mono text-[10px] leading-relaxed text-paper/70 outline-none"
            />
            <div className="flex items-center gap-2 px-4 py-3">
              <button
                onClick={downloadExportPayload}
                className="border border-emerald-500/60 bg-emerald-500/10 px-4 py-2 font-pulp text-[10px] uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/20"
              >
                ⇩ Download .reel.json
              </button>
              <button
                onClick={copyExportPayload}
                className="border border-cyan-neon/60 bg-cyan-neon/10 px-4 py-2 font-pulp text-[10px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/20"
              >
                ⎘ Copy JSON
              </button>
              <span className="ml-auto font-type text-[10px] text-paper/45">
                If download is blocked, Copy and save it as <b>{story.id}.reel.json</b>.
              </span>
            </div>
          </div>
        </div>
      )}

        <style>{`
.btn-tool{display:inline-flex;align-items:center;gap:.3rem;border:1px solid #26263a;background:#13131f;color:#b6abd0;padding:4px 9px;border-radius:6px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:500;letter-spacing:.01em;line-height:1;cursor:pointer;transition:background-color .12s,border-color .12s,color .12s}
.btn-tool:hover{border-color:#ff2e88;color:#fff;background:#1a1326}
.btn-tool:disabled{opacity:.3;pointer-events:none}
.btn-tool.is-active{border-color:#ff2e88;color:#ff7ac0;background:#1a1326}
.btn-danger:hover{border-color:#e23b4e;color:#ff7180;background:#1d1014}
.btn-go{display:inline-flex;align-items:center;gap:.3rem;border:1px solid #b8862f;background:#2a2110;color:#f4cf6b;padding:4px 11px;border-radius:6px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:600;line-height:1;cursor:pointer}
.btn-go:hover{background:#3a2c14;color:#ffd97a}
.btn-ok{display:inline-flex;align-items:center;gap:.3rem;border:1px solid #1f6f74;background:#0f2a2c;color:#56d6db;padding:4px 11px;border-radius:6px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;font-weight:600;line-height:1;cursor:pointer}
.btn-ok:hover{background:#103438;color:#7ef0f5}
.tb-sep{display:inline-block;width:1px;height:18px;background:#2a2a3a;margin:0 .3rem;flex:0 0 auto}
.tb-status{font-family:ui-sans-serif,system-ui,sans-serif;font-size:10px;letter-spacing:.04em;text-transform:uppercase}
.tb-input,.tb-select{border:1px solid #26263a;background:#13131f;color:#e9e2f3;border-radius:6px;padding:4px 8px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px;line-height:1;outline:none}
.tb-input:focus,.tb-select:focus{border-color:#ff2e88}
`}</style>
      </div>
    </MediaResolverContext.Provider>
  );
}

import type { TitleTheme } from "../types";

export function Studio(props: {
  baseStories: Story[];
  initialStoryId?: string;
  initialSceneId?: string;
  onExit: () => void;
  onPlay: (story: Story, opts?: { fromSceneId?: string }) => void;
  onPublish: (story: Story) => boolean;
  onDeleteStory: (storyId: string, deleteMedia?: boolean) => boolean;
  onCreateStory: (story: Story) => boolean;
  onUpdateTitleTheme: (theme: TitleTheme) => void;
}) {
  return (
    <ReactFlowProvider>
      <StudioInner {...props} />
    </ReactFlowProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  travel-map editor (🗺 Map tab)                                     */
/* ------------------------------------------------------------------ */

/**
 * Editor for Story.map — the flag-gated travel screen. Pins are placed by
 * clicking the preview (the selected location moves to where you click), and
 * unlocking uses the same gating vocabulary as choices: a comma-separated
 * flag list here writes `gating.requiresFlags`. Deleting the last location
 * removes `story.map` entirely so the player-side map vanishes cleanly.
 */
function MapEditor({ story, onUpdate }: { story: Story; onUpdate: (s: Story) => void }) {
  const map = story.map ?? { locations: [] };
  const resolveMedia = useResolvedMedia(story.id);
  const flags = useMemo(() => collectFlags(story), [story]);
  const [selectedLocId, setSelectedLocId] = useState<string | null>(map.locations[0]?.id ?? null);
  const previewRef = useRef<HTMLDivElement>(null);

  const setMap = (patch: Partial<typeof map>) => onUpdate({ ...story, map: { ...map, ...patch } });
  const updateLoc = (id: string, patch: Partial<MapLocation>) =>
    setMap({ locations: map.locations.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const removeLoc = (id: string) => {
    const rest = map.locations.filter((l) => l.id !== id);
    if (rest.length === 0 && !map.backgroundImage && !map.title) {
      const { map: _gone, ...noMap } = story;
      onUpdate(noMap as Story);
    } else {
      setMap({ locations: rest });
    }
    if (selectedLocId === id) setSelectedLocId(rest[0]?.id ?? null);
  };
  const addLoc = () => {
    const id = `loc-${Date.now().toString(36)}`;
    const loc: MapLocation = {
      id,
      label: `Location ${map.locations.length + 1}`,
      targetSceneId: story.scenes[0]?.id ?? "",
      x: 20 + ((map.locations.length * 17) % 60),
      y: 25 + ((map.locations.length * 23) % 50),
    };
    setMap({ locations: [...map.locations, loc] });
    setSelectedLocId(id);
  };

  const bgRaw = map.backgroundImage;
  const bgResolved = resolveMedia(bgRaw) ?? bgRaw;
  const bgStyle: React.CSSProperties = bgResolved
    ? bgResolved.startsWith("gradient:")
      ? { background: bgResolved.slice(9) }
      : { backgroundImage: `url(${assetUrl(bgResolved)})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { background: "linear-gradient(160deg,#14141f 0%,#0c0c14 70%)" };

  const placePin = (e: React.MouseEvent) => {
    if (!selectedLocId || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
    updateLoc(selectedLocId, { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
  };

  const selected = map.locations.find((l) => l.id === selectedLocId) ?? null;

  return (
    <div className="space-y-3">
      <div className="border border-gold/30 bg-gold/5 p-2">
        <div className="font-pulp text-[10px] uppercase tracking-widest text-gold">🗺 Travel Map</div>
        <p className="mt-1 font-type text-[10px] leading-snug text-paper/55">
          A screen of destinations the player can jump to (menu → 🗺 Travel map, or T). Each location
          unlocks when its required flags are set — earn the tip, open the door. Locked pins show as
          “???” unless you hide them entirely. In play, travel resolves through note placeholders like
          every other route, and the validator checks every pin.
        </p>
      </div>

      <Field label="Map title (heading on the player's screen)">
        <input className={inputCls} value={map.title ?? ""} placeholder="Travel Map"
          onChange={(e) => setMap({ title: e.target.value || undefined })} />
      </Field>

      <Field label="Map artwork (pins are placed on this)">
        <ImagePicker value={map.backgroundImage} storyId={story.id}
          onChange={(v) => setMap({ backgroundImage: v })} placeholder="Pick the map image…" />
      </Field>

      {/* ---- map absorbs pure travel choices ---- */}
      <div className="space-y-1 border border-gold/30 bg-gold/5 p-2">
        <label className="flex items-start gap-2 text-[10px] uppercase tracking-wider text-paper/70">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!!map.replaceTravelChoices}
            onChange={(e) => setMap({ replaceTravelChoices: e.target.checked || undefined })}
          />
          <span>🗺 Map absorbs travel choices</span>
        </label>
        <p className="font-type text-[9px] leading-snug text-paper/45">
          When on, a choice whose ONLY job is going to a scene an unlocked pin also reaches is hidden in
          play — the choice rail shows a single “🗺 Open the map” action instead, so travel has one home.
          Safety rails: choices that set flags, move meters, give items, reply in place, present evidence
          or run a timer are NEVER absorbed (the map applies no consequences), and a locked pin never
          absorbs a choice — the authored line stays until the pin is earned. Your choices are untouched
          in the draft; this is purely a play-time swap.
        </p>
      </div>

      {/* click-to-place preview */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="font-pulp text-[9px] uppercase tracking-widest text-paper/50">
            {selected ? `Click the map to place “${selected.label}”` : "Add a location, then click the map to place its pin"}
          </span>
          <button onClick={addLoc} className="border border-gold/60 px-2 py-0.5 font-pulp text-[9px] uppercase tracking-widest text-gold hover:bg-gold/15">
            + Add location
          </button>
        </div>
        <div ref={previewRef} onClick={placePin}
          className={`relative aspect-video w-full overflow-hidden border-2 border-noir-600 ${selected ? "cursor-crosshair" : ""}`}
          style={bgStyle}>
          {map.locations.map((loc) => (
            <button
              key={loc.id}
              onClick={(e) => { e.stopPropagation(); setSelectedLocId(loc.id); }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${loc.x}%`, top: `${loc.y}%` }}
              title={`${loc.label} → ${story.scenes.find((s) => s.id === loc.targetSceneId)?.title ?? loc.targetSceneId}`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm shadow-[0_2px_8px_rgba(0,0,0,0.8)] ${
                loc.id === selectedLocId ? "border-neon bg-neon/25" : "border-gold bg-noir-950/85"
              }`}>
                {loc.icon ?? (loc.gating ? "🔒" : "📍")}
              </span>
              <span className={`mt-0.5 block whitespace-nowrap border px-1 font-pulp text-[8px] uppercase tracking-widest backdrop-blur-sm ${
                loc.id === selectedLocId ? "border-neon/60 bg-noir-950/85 text-neon" : "border-gold/50 bg-noir-950/85 text-gold"
              }`}>
                {loc.label}
              </span>
            </button>
          ))}
          {map.locations.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center font-type text-xs italic text-paper/45">
              No locations yet — “+ Add location” to drop the first pin.
            </div>
          )}
        </div>
      </div>

      {/* per-location editors */}
      <div className="space-y-2">
        {map.locations.map((loc) => {
          const gateFlags = loc.gating?.requiresFlags ?? [];
          const isSel = loc.id === selectedLocId;
          return (
            <div key={loc.id}
              className={`space-y-1.5 border p-2 ${isSel ? "border-neon/60 bg-neon/5" : "border-noir-600 bg-noir-900/50"}`}
              onClick={() => setSelectedLocId(loc.id)}>
              <div className="flex items-center gap-2">
                <input className={inputCls} value={loc.label}
                  onChange={(e) => updateLoc(loc.id, { label: e.target.value })} placeholder="Location name" />
                <input className={`${inputCls} !w-14 text-center`} value={loc.icon ?? ""} maxLength={4}
                  onChange={(e) => updateLoc(loc.id, { icon: e.target.value || undefined })} placeholder="📍" title="Pin emoji" />
                <button onClick={(e) => { e.stopPropagation(); removeLoc(loc.id); }}
                  className="shrink-0 border border-crimson/40 px-2 py-1 font-pulp text-[9px] uppercase text-crimson hover:bg-crimson/10">
                  ✕
                </button>
              </div>
              <Field label="Travels to scene">
                <select className={inputCls} value={loc.targetSceneId}
                  onChange={(e) => updateLoc(loc.id, { targetSceneId: e.target.value })}>
                  {story.scenes.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      {sc.nodeType === "note" ? `📝 ${sc.title} (note — passes through)` : sc.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Unlocked by flags (comma-separated — empty = always open)">
                <input className={inputCls} value={gateFlags.join(", ")} list={`map-flags-${story.id}`}
                  onChange={(e) => {
                    const requiresFlags = e.target.value.split(",").map((f) => f.trim()).filter(Boolean);
                    const gating: Gating | undefined = requiresFlags.length
                      ? { ...(loc.gating ?? {}), requiresFlags }
                      : (() => {
                          const { requiresFlags: _r, ...rest } = loc.gating ?? {};
                          return Object.keys(rest).length ? rest : undefined;
                        })();
                    updateLoc(loc.id, { gating });
                  }}
                  placeholder="e.g. found_pier_tip" />
              </Field>
              {!!loc.gating && (
                <>
                  <Field label="Teaser on the locked pin (else an automatic hint)">
                    <input className={inputCls} value={loc.lockedHint ?? ""}
                      onChange={(e) => updateLoc(loc.id, { lockedHint: e.target.value || undefined })}
                      placeholder="Someone in the diner knows the pier number…" />
                  </Field>
                  <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/60">
                    <input type="checkbox" checked={!!loc.hiddenWhenLocked}
                      onChange={(e) => updateLoc(loc.id, { hiddenWhenLocked: e.target.checked || undefined })} />
                    Hide the pin completely until unlocked (a secret place)
                  </label>
                </>
              )}
            </div>
          );
        })}
      </div>
      <datalist id={`map-flags-${story.id}`}>
        {flags.map((f) => <option key={f} value={f} />)}
      </datalist>
    </div>
  );
}
