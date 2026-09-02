import { useCallback, useEffect, useState } from "react";
import type { AssetType, CinematicSettings, MediaAsset, Story } from "../types";

/**
 * Media assets are stored in IndexedDB instead of localStorage.
 * localStorage is capped at ~5MB per origin in most browsers, which silently
 * fails (or throws QuotaExceededError) the moment anyone uploads a real video
 * clip — that was the root cause of "upload video doesn't work". IndexedDB
 * gives every story a realistic amount of headroom for audio/video/images.
 */

const DB_NAME = "scarlet-reel-media";
const STORE_NAME = "assets";
const DB_VERSION = 1;

const MAX_ASSET_SIZE: Record<AssetType, number> = {
  audio: 8 * 1024 * 1024,
  video: 20 * 1024 * 1024,
  image: 4 * 1024 * 1024,
};
const MAX_TOTAL_SIZE = 60 * 1024 * 1024;

type StoredAsset = MediaAsset & { storyId: string };

type DesktopMediaBridge = {
  saveUpload(payload: {
    storyId: string;
    assetId: string;
    name: string;
    mimeType: string;
    type: AssetType;
    bytes: ArrayBuffer;
  }): Promise<{ url?: string; path?: string }>;
  /** Copy a generated ElevenLabs voice line into the game folder's
   *  `voices/<person>/<scene>/` tree. `relativePath` is validated on the
   *  main side to stay inside that tree. */
  saveVoice?(payload: {
    relativePath: string;
    bytes: ArrayBuffer;
    name: string;
    mimeType: string;
  }): Promise<{ url?: string; path?: string }>;
  /** Read a voice MP3 back (packaged apps reference them by file:// URL).
   *  `fileUrl` is validated on the main side to stay inside the voices tree. */
  readVoice?(fileUrl: string): Promise<{ base64: string; size: number; name: string }>;
  /** List every MP3 already on disk for one person (`voices/<person>/…`),
   *  across all their scenes, newest first. `person` is a `voiceSlug`. */
  listVoices?(person: string): Promise<Array<{
    relPath: string;
    url: string;
    scene: string;
    name: string;
    size: number;
    mtime: number;
  }>>;
  setFullscreen?(enabled: boolean): Promise<boolean>;
  isFullscreen?(): Promise<boolean>;
  setWindowSize?(width: number, height: number): Promise<{ width: number; height: number }>;
  quit?(): Promise<void>;
  /* ---- player save files (real .sreel files in the user's saves folder) ---- */
  savesDir?(): Promise<string>;
  saveGameFile?(payload: {
    storyId: string;
    episodeId?: string;
    slot: number;
    saveJson: string;
  }): Promise<{ path?: string }>;
  listSaveFiles?(storyId: string): Promise<
    Array<{ name: string; path: string; save: Record<string, unknown> }>
  >;
  exportSaveFile?(payload: { suggestedName: string; json: string }): Promise<{ canceled?: boolean; path?: string }>;
  importSaveFile?(): Promise<{ canceled?: boolean; path?: string; json?: string }>;
  openSavesDir?(): Promise<string>;
  /** Native File menu events ("save" | "load" | "export-save" | "import-save" | "open-saves-dir").
   *  Returns an unsubscribe function. */
  onMenu?(cb: (action: string) => void): () => void;
};

declare global {
  interface Window {
    scarletReelDesktop?: DesktopMediaBridge;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("This browser does not support file storage (IndexedDB unavailable)."));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("storyId", "storyId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open media database"));
  });
  return dbPromise;
}

/* ---------------------------- live subscriptions --------------------------- */
// Multiple components (Media tab, per-scene dropdowns, upload buttons) all need
// to reflect the same asset list instantly, regardless of which one triggered
// the change. This is a minimal pub/sub keyed by story id.

const listeners: Record<string, Set<() => void>> = {};
/** Wildcard subscription key — listeners here refresh on ANY library change. */
const ALL_LISTENERS = "*";

export function subscribeAssets(storyId: string, cb: () => void): () => void {
  (listeners[storyId] ??= new Set()).add(cb);
  return () => {
    listeners[storyId]?.delete(cb);
  };
}

function notify(storyId: string) {
  listeners[storyId]?.forEach((cb) => cb());
  if (storyId !== ALL_LISTENERS) listeners[ALL_LISTENERS]?.forEach((cb) => cb());
}

/* --------------------------------- reads ---------------------------------- */

export async function loadAssets(storyId: string): Promise<MediaAsset[]> {
  try {
    const db = await openDb();
    return await new Promise<MediaAsset[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const index = tx.objectStore(STORE_NAME).index("storyId");
      const req = index.getAll(IDBKeyRange.only(storyId));
      req.onsuccess = () => {
        const rows = (req.result as StoredAsset[]).sort((a, b) => b.uploadedAt - a.uploadedAt);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

/** Load every asset in the library (optionally filtered by type), newest first.
 * Used for the global "reuse anywhere" pickers, independent of which story an
 * asset was uploaded in. */
export async function loadAllAssets(assetType?: AssetType): Promise<MediaAsset[]> {
  try {
    const db = await openDb();
    return await new Promise<MediaAsset[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => {
        const rows = (req.result as StoredAsset[])
          .filter((a) => !assetType || a.type === assetType)
          .sort((a, b) => b.uploadedAt - a.uploadedAt);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export function getAssetType(file: File): AssetType | null {
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("image/")) return "image";
  return null;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/* --------------------------------- writes --------------------------------- */

async function copyUploadToDesktopGameFolder(
  storyId: string,
  assetId: string,
  name: string,
  mimeType: string,
  type: AssetType,
  bytes: ArrayBuffer
): Promise<string | undefined> {
  const bridge = typeof window !== "undefined" ? window.scarletReelDesktop : undefined;
  if (!bridge) return undefined;
  try {
    const result = await bridge.saveUpload({ storyId, assetId, name, mimeType, type, bytes });
    return result.url;
  } catch (err) {
    console.warn("[media] Desktop media copy failed; falling back to browser storage.", err);
    return undefined;
  }
}

async function copyDataUrlToDesktopGameFolder(
  storyId: string,
  assetId: string,
  name: string,
  type: AssetType,
  dataUrl: string
): Promise<string | undefined> {
  if (typeof window === "undefined" || !window.scarletReelDesktop) return undefined;
  try {
    const res = await fetch(dataUrl);
    const bytes = await res.arrayBuffer();
    const mimeType = dataUrl.match(/^data:([^;,]+)/)?.[1] ?? res.headers.get("content-type") ?? `${type}/*`;
    return await copyUploadToDesktopGameFolder(storyId, assetId, name, mimeType, type, bytes);
  } catch (err) {
    console.warn("[media] Desktop data URL copy failed; keeping browser storage copy.", err);
    return undefined;
  }
}

export async function addAsset(storyId: string, asset: MediaAsset): Promise<{ success: boolean; error?: string }> {
  const limit = MAX_ASSET_SIZE[asset.type];
  if (asset.size > limit) {
    return {
      success: false,
      error: `${asset.type} files must be under ${(limit / 1024 / 1024).toFixed(0)}MB (this file is ${(asset.size / 1024 / 1024).toFixed(1)}MB).`,
    };
  }
  try {
    const existing = await loadAssets(storyId);
    const currentTotal = existing.reduce((sum, a) => sum + a.size, 0);
    if (currentTotal + asset.size > MAX_TOTAL_SIZE) {
      return {
        success: false,
        error: `Story media library is full (${(MAX_TOTAL_SIZE / 1024 / 1024).toFixed(0)}MB limit). Delete something first.`,
      };
    }
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ ...asset, storyId } satisfies StoredAsset);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    notify(storyId);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save media file." };
  }
}

export async function deleteAsset(storyId: string, assetId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(assetId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    notify(storyId);
  } catch {
    /* best effort — nothing else to do if delete fails */
  }
}

/** Delete every media asset tagged to a story. Used by "permanently delete a
 * story" when the author explicitly opts to remove its files too — by default
 * media assets are kept in the library so they stay reusable elsewhere. */
export async function deleteStoryAssets(storyId: string): Promise<void> {
  try {
    const all = await loadAssets(storyId);
    await Promise.all(all.map((a) => deleteAsset(storyId, a.id)));
  } catch {
    /* best effort */
  }
}

/** Import and write a batch of media assets directly to IndexedDB.
 * This is the magic step that allows cases shared between users to retain
 * 100% of their custom graphics and sound files. */
export async function importStoryAssets(storyId: string, assets: MediaAsset[]): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      assets.forEach(({ fileUrl: _fileUrl, ...asset }) => {
        store.put({ ...asset, storyId } satisfies StoredAsset);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    notify(storyId);
  } catch {
    /* best effort */
  }
}

/**
 * One-shot helper used by every direct "Upload" button across Studio
 * (scene music, scene narration, scene video background, dialogue voice
 * lines). It validates the file, converts it, stores it in the shared
 * library, and returns a playable URL to use immediately in the field that
 * triggered the upload — so the same file is both applied instantly AND
 * shows up later in every asset dropdown. In Electron, the file is also copied
 * to the game media folder while the portable base64 copy stays available for
 * exports/imports.
 */
export async function uploadAsset(
  storyId: string,
  file: File
): Promise<{ success: boolean; url?: string; assetId?: string; error?: string }> {
  const type = getAssetType(file);
  if (!type) return { success: false, error: `Unsupported file type: "${file.name}". Use an audio, video, or image file.` };
  try {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const bytes = await file.arrayBuffer();
    const fileUrl = await copyUploadToDesktopGameFolder(storyId, id, file.name, file.type, type, bytes);
    const dataUrl = await fileToBase64(file);
    const asset: MediaAsset = {
      id,
      name: file.name,
      type,
      dataUrl,
      fileUrl,
      size: file.size,
      uploadedAt: Date.now(),
    };
    const result = await addAsset(storyId, asset);
    return {
      success: result.success,
      url: result.success ? fileUrl ?? dataUrl : undefined,
      assetId: result.success ? asset.id : undefined,
      error: result.error,
    };
  } catch {
    return { success: false, error: `Failed to process "${file.name}".` };
  }
}

/** Resolve a compact `asset:<id>` reference into the IndexedDB data URL. */
export async function resolveAssetReference(value?: string): Promise<string | undefined> {
  if (!value) return undefined;
  if (!value.startsWith("asset:")) return value;
  const assetId = value.slice(6);
  try {
    const db = await openDb();
    return await new Promise<string | undefined>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(assetId);
      req.onsuccess = () => {
        const row = req.result as StoredAsset | undefined;
        resolve(row ? row.fileUrl ?? row.dataUrl : undefined);
      };
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

/** Resolve one media value against an in-memory `assetId -> dataUrl` map.
 * `asset:<id>` becomes the data URL, `video:asset:<id>` becomes `video:<dataUrl>`.
 * Anything else (paths, gradients, `video:` paths, already-resolved data URLs)
 * passes through untouched. Returns `undefined` when a reference cannot be
 * resolved yet (asset not loaded or missing). */
export function resolveMediaValue(value: string | undefined, map: Record<string, string>): string | undefined {
  if (!value) return value;
  if (value.startsWith("asset:")) return map[value.slice(6)];
  if (value.startsWith("video:asset:")) {
    const dataUrl = map[value.slice(12)];
    return dataUrl ? `video:${dataUrl}` : undefined;
  }
  return value;
}

/** Walk every media reference in a story — every field that can hold an image,
 *  audio clip, video, `asset:<id>` or `video:asset:<id>` — and call `visit`
 *  on it. This is the SINGLE source of truth for which fields carry media, so
 *  the play-time resolver and the export bundler stay in lock-step as the
 *  schema grows (acts, episodes, cinematic layers, …). Add a new media-bearing
 *  field here once and both pick it up — that is what keeps import/export
 *  complete.
 *
 *  (compactStoryMedia is type-aware — image/audio/video fallbacks differ — so
 *  it walks fields by hand; keep its list in sync with this one.) */
function visitStoryMediaRefs(story: Story, visit: (value: string | undefined) => void): void {
  const cinematic = (c?: CinematicSettings) => {
    if (!c) return;
    visit(c.foregroundImage);
    c.foregroundAnimation?.frames?.forEach(visit);
    c.foregroundExtras?.forEach((e) => {
      visit(e.image);
      visit(e.sheet?.image);
    });
    c.parallaxLayers?.forEach((l) => visit(l.image));
  };
  // A DialogueBeat carries audio/background/cinematic. The contradiction
  // sub-beats (caught / bluff-called) are full beats nested inside a beat's
  // `lie`, so walk them with the same visitor.
  const visitBeatMedia = (
    beat: { audioUrl?: string; background?: string; cinematic?: CinematicSettings },
    visit: (value: string | undefined) => void,
    cinematic: (c?: CinematicSettings) => void
  ) => {
    visit(beat.audioUrl);
    visit(beat.background);
    cinematic(beat.cinematic);
  };
  story.scenes.forEach((sc) => {
    visit(sc.background);
    visit(sc.musicUrl);
    visit(sc.sceneAudioUrl);
    visit(sc.narrationAudioUrl);
    // Stage node sprites — the walker and its walk-cycle frames (image
    // url / asset: only, not emoji:).
    if (sc.stage?.playerImage && !sc.stage.playerImage.startsWith("emoji:")) visit(sc.stage.playerImage);
    sc.stage?.walkFrames?.forEach(visit);
    visit(sc.stage?.playerSheet?.image);
    sc.stage?.npcs?.forEach((n) => {
      if (n.image && !n.image.startsWith("emoji:")) visit(n.image);
      visit(n.sheet?.image);
    });
    cinematic(sc.cinematic);
    sc.credits?.montage?.forEach(visit);
    // Hotspot media: the object's image, its voice clips (base action, verb
    // actions, per-item replies) and — for MULTI-STATE objects — every
    // state's image and action clip.
    sc.hotspots?.forEach((h) => {
      visit(h.image);
      visit(h.action.audioUrl);
      Object.values(h.verbs ?? {}).forEach((a) => visit(a?.audioUrl));
      Object.values(h.itemAudio ?? {}).forEach(visit);
      (h.states ?? []).forEach((st) => {
        visit(st.image);
        visit(st.action?.audioUrl);
      });
    });
    sc.dialogueBeats?.forEach((b) => {
      visit(b.audioUrl);
      visit(b.background);
      cinematic(b.cinematic);
      // A "press the lie" beat carries two extra DialogueBeats (the caught
      // reaction and the bluff-called line) with their own media.
      b.lie?.caughtBeat && visitBeatMedia(b.lie.caughtBeat, visit, cinematic);
      b.lie?.wrongBeat && visitBeatMedia(b.lie.wrongBeat, visit, cinematic);
    });
  });
  story.items.forEach((i) => visit(i.iconUrl));
  story.characters.forEach((c) => {
    visit(c.avatarUrl);
    c.talkingFrames?.forEach(visit);
    visit(c.talkingRest);
    visit(c.talkingSheet?.image);
    c.talkingSheets?.forEach((v) => visit(v.sheet?.image));
  });
  story.acts?.forEach((a) => visit(a.titleCardImage));
  story.episodes?.forEach((ep) => {
    visit(ep.titleCardImage);
    visit(ep.posterImage);
    visit(ep.titleCardMusicUrl);
    ep.recapLines?.forEach((line) => visit(line.image));
  });
  visit(story.coverImage);
  visit(story.dialogueBox?.backgroundImage);
  visit(story.map?.backgroundImage);
}

/** Every IndexedDB asset id a story references (via `asset:` or `video:asset:`),
 *  anywhere in its data — scenes, items, characters, acts, episodes, the cover
 *  and the dialogue box. Powers play-time resolution and export bundling. */
export function collectStoryAssetIds(story: Story): Set<string> {
  const ids = new Set<string>();
  visitStoryMediaRefs(story, (v) => {
    if (!v) return;
    if (v.startsWith("asset:")) ids.add(v.slice(6));
    else if (v.startsWith("video:asset:")) ids.add(v.slice(12));
  });
  return ids;
}

/** Replace every `asset:<id>` reference inside a story with the actual data URL
 * from IndexedDB, returning a new story (the input is never mutated). The game
 * player and previews then only ever see real URLs. Used before playing a case,
 * so the persisted story can stay tiny (references only) and never blow the
 * localStorage quota. */
export async function resolveStoryMedia(story: Story): Promise<Story> {
  const ids = collectStoryAssetIds(story);

  const map: Record<string, string> = {};
  if (ids.size) {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        ids.forEach((id) => {
          const req = store.get(id);
          req.onsuccess = () => {
            const row = req.result as StoredAsset | undefined;
            if (row?.dataUrl) map[id] = row.fileUrl ?? row.dataUrl;
          };
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      /* leave references unresolved if the store is unavailable */
    }
  }

  const next = JSON.parse(JSON.stringify(story)) as Story;
  const apply = (obj: unknown, key: string) => {
    if (!obj || typeof obj !== "object") return;
    const record = obj as Record<string, unknown>;
    const v = record[key];
    if (typeof v === "string") record[key] = resolveMediaValue(v, map) ?? v;
  };
  const applyCinematic = (c?: CinematicSettings) => {
    if (!c) return;
    apply(c, "foregroundImage");
    if (c.foregroundAnimation?.frames?.length) {
      c.foregroundAnimation.frames = c.foregroundAnimation.frames.map((f) => resolveMediaValue(f, map) ?? f);
    }
    // Stacked foreground extras and mid-ground parallax planes carry images too
    // — visitStoryMediaRefs (and so the export bundler) visits them, so the
    // play-time resolver must as well or their refs survive as literal
    // "asset:<id>" URLs and render nothing.
    c.foregroundExtras?.forEach((e) => {
      apply(e, "image");
      if (e.sheet) apply(e.sheet, "image");
    });
    c.parallaxLayers?.forEach((l) => apply(l, "image"));
  };
  const applyLieBeat = (beat?: { audioUrl?: string; background?: string; cinematic?: CinematicSettings }) => {
    if (!beat) return;
    apply(beat, "audioUrl");
    apply(beat, "background");
    applyCinematic(beat.cinematic);
  };
  next.scenes.forEach((sc) => {
    apply(sc, "background");
    apply(sc, "musicUrl");
    apply(sc, "sceneAudioUrl");
    apply(sc, "narrationAudioUrl");
    if (sc.stage?.playerImage) apply(sc.stage, "playerImage");
    if (sc.stage?.walkFrames?.length) sc.stage.walkFrames = sc.stage.walkFrames.map((f) => resolveMediaValue(f, map) ?? f);
    if (sc.stage?.playerSheet) apply(sc.stage.playerSheet, "image");
    sc.stage?.npcs?.forEach((n) => {
      if (n.image) apply(n, "image");
      if (n.sheet) apply(n.sheet, "image");
    });
    applyCinematic(sc.cinematic);
    if (sc.credits?.montage?.length) {
      sc.credits.montage = sc.credits.montage.map((m) => resolveMediaValue(m, map) ?? m);
    }
    sc.hotspots?.forEach((h) => {
      apply(h, "image");
      apply(h.action, "audioUrl");
      Object.values(h.verbs ?? {}).forEach((a) => a && apply(a, "audioUrl"));
      if (h.itemAudio) h.itemAudio = Object.fromEntries(Object.entries(h.itemAudio).map(([k, v]) => [k, resolveMediaValue(v, map) ?? v]));
      (h.states ?? []).forEach((st) => {
        apply(st, "image");
        if (st.action) apply(st.action, "audioUrl");
      });
    });
    sc.dialogueBeats?.forEach((b) => {
      apply(b, "audioUrl");
      apply(b, "background");
      applyCinematic(b.cinematic);
      b.lie?.caughtBeat && applyLieBeat(b.lie.caughtBeat);
      b.lie?.wrongBeat && applyLieBeat(b.lie.wrongBeat);
    });
  });
  next.items.forEach((i) => apply(i, "iconUrl"));
  next.characters.forEach((c) => {
    apply(c, "avatarUrl");
    if (c.talkingFrames?.length) c.talkingFrames = c.talkingFrames.map((f) => resolveMediaValue(f, map) ?? f);
    if (c.talkingRest) c.talkingRest = resolveMediaValue(c.talkingRest, map) ?? c.talkingRest;
    if (c.talkingSheet) apply(c.talkingSheet, "image");
    c.talkingSheets?.forEach((v) => { if (v.sheet) apply(v.sheet, "image"); });
  });
  next.acts?.forEach((a) => apply(a, "titleCardImage"));
  next.episodes?.forEach((ep) => {
    apply(ep, "titleCardImage");
    apply(ep, "posterImage");
    apply(ep, "titleCardMusicUrl");
    ep.recapLines?.forEach((line) => apply(line, "image"));
  });
  apply(next, "coverImage");
  if (next.dialogueBox) apply(next.dialogueBox, "backgroundImage");
  if (next.map) apply(next.map, "backgroundImage");
  return next;
}

/** Store an already-encoded data URL (e.g. a resized avatar) in the media
 * library and hand back its `asset:<id>` reference. */
export async function uploadDataUrlAsset(
  storyId: string,
  name: string,
  type: AssetType,
  dataUrl: string,
  folder?: string
): Promise<{ success: boolean; assetId?: string; error?: string }> {
  const comma = dataUrl.indexOf(",");
  const base64Length = Math.max(0, dataUrl.length - comma - 1);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const fileUrl = await copyDataUrlToDesktopGameFolder(storyId, id, name, type, dataUrl);
  const asset: MediaAsset = {
    id,
    name,
    type,
    ...(folder ? { folder } : {}),
    dataUrl,
    fileUrl,
    size: Math.round((base64Length * 3) / 4),
    uploadedAt: Date.now(),
  };
  const result = await addAsset(storyId, asset);
  return { success: result.success, assetId: result.success ? asset.id : undefined, error: result.error };
}

/** Move an asset to a library folder (empty/undefined = unfiled). */
export async function setAssetFolder(storyId: string, assetId: string, folder?: string): Promise<void> {
  const assets = await loadAssets(storyId);
  const asset = assets.find((a) => a.id === assetId);
  if (!asset) return;
  const next: MediaAsset = { ...asset };
  if (folder && folder.trim()) next.folder = folder.trim();
  else delete next.folder;
  // Direct put (not addAsset): the asset already counts toward the quota, so
  // re-running the size checks would double-count it.
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ ...next, storyId } satisfies StoredAsset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  notify(storyId);
}

/** Convert any embedded base64 `data:` URLs inside a story into `asset:<id>`
 * references (creating IndexedDB assets for ones that don't exist yet) so the
 * story stays small enough to persist in localStorage. Legacy drafts and old
 * exports that still embed data URLs are migrated automatically. Returns a new
 * story; the input is never mutated. */
export async function compactStoryMedia(story: Story): Promise<Story> {
  const next = JSON.parse(JSON.stringify(story)) as Story;

  // Safe fallback for an image/video field whose data URL can't be persisted
  // (e.g. too large or IndexedDB unavailable). Dropping the raw base64 keeps
  // the story small enough to persist; the author can re-upload a smaller file.
  const IMAGE_FALLBACK = "gradient:linear-gradient(135deg,#0c0c14 0%,#2b2b3f 100%)";

  let known: MediaAsset[] = [];
  try {
    known = await loadAssets(story.id);
  } catch {
    /* library unavailable — data URLs will be dropped below, not persisted */
  }
  const byUrl = new Map(known.map((a) => [a.dataUrl, a.id]));

  const getOrCreate = async (dataUrl: string, type: AssetType, name: string): Promise<string | undefined> => {
    const existingId = byUrl.get(dataUrl);
    if (existingId) return existingId;
    const result = await uploadDataUrlAsset(story.id, name, type, dataUrl);
    if (result.success && result.assetId) {
      byUrl.set(dataUrl, result.assetId);
      return result.assetId;
    }
    return undefined;
  };

  // Always returns a persistable value: an `asset:` reference when the data can
  // be stored, the input when it's already a path/ref, or a safe fallback when
  // a raw data URL can't be migrated — NEVER the raw base64 itself.
  const compact = async (value: string | undefined, type: AssetType, name: string): Promise<string | undefined> => {
    if (!value) return value;
    if (value.startsWith("video:data:")) {
      const id = await getOrCreate(value.slice(6), "video", name);
      if (id) return `video:asset:${id}`;
      console.warn(`[media] Couldn't persist video "${name}" — dropped to keep the story saveable.`);
      return IMAGE_FALLBACK;
    }
    if (value.startsWith("data:")) {
      const id = await getOrCreate(value, type, name);
      if (id) return `asset:${id}`;
      console.warn(`[media] Couldn't persist ${type} "${name}" — dropped to keep the story saveable.`);
      return type === "image" ? IMAGE_FALLBACK : undefined;
    }
    return value;
  };

  // Compact a contradiction sub-beat (the caught / bluff-called line), which
  // is a full DialogueBeat nested inside a beat's `lie`.
  const compactLieBeat = async (
    beat: { audioUrl?: string; background?: string },
    compactFn: (v: string | undefined, t: AssetType, n: string) => Promise<string | undefined>,
    name: string
  ) => {
    beat.audioUrl = await compactFn(beat.audioUrl, "audio", `${name} contradiction`);
    if (beat.background) {
      const t: AssetType = beat.background.startsWith("video:") ? "video" : "image";
      beat.background = (await compactFn(beat.background, t, `${name} contradiction shot`)) ?? beat.background;
    }
  };

  for (const sc of next.scenes) {
    const bgType: AssetType = sc.background.startsWith("video:") ? "video" : "image";
    sc.background = (await compact(sc.background, bgType, sc.title)) ?? IMAGE_FALLBACK;
    sc.musicUrl = await compact(sc.musicUrl, "audio", sc.title);
    sc.sceneAudioUrl = await compact(sc.sceneAudioUrl, "audio", sc.title);
    sc.narrationAudioUrl = await compact(sc.narrationAudioUrl, "audio", sc.title);
    if (sc.stage?.playerImage && !sc.stage.playerImage.startsWith("emoji:")) {
      const imgType: AssetType = sc.stage.playerImage.startsWith("video:") ? "video" : "image";
      sc.stage.playerImage = (await compact(sc.stage.playerImage, imgType, `${sc.title} stage character`)) ?? sc.stage.playerImage;
    }
    if (sc.stage?.playerSheet?.image) {
      sc.stage.playerSheet.image =
        (await compact(sc.stage.playerSheet.image, "image", `${sc.title} walker sheet`)) ?? sc.stage.playerSheet.image;
    }
    if (sc.stage?.npcs?.length) {
      for (const n of sc.stage.npcs) {
        if (n.image && !n.image.startsWith("emoji:")) {
          n.image = (await compact(n.image, "image", `${sc.title} NPC ${n.id}`)) ?? n.image;
        }
        if (n.sheet?.image) {
          n.sheet.image = (await compact(n.sheet.image, "image", `${sc.title} NPC ${n.id} sheet`)) ?? n.sheet.image;
        }
      }
    }
    if (sc.stage?.walkFrames?.length) {
      sc.stage.walkFrames = await Promise.all(
        sc.stage.walkFrames.map(async (f) => (await compact(f, "image", `${sc.title} stage walk frame`)) ?? f)
      );
    }
    if (sc.credits?.montage?.length) {
      sc.credits.montage = (
        await Promise.all(sc.credits.montage.map((m) => compact(m, "image", `${sc.title} montage`)))
      ).filter((m): m is string => !!m);
    }
    for (const h of sc.hotspots ?? []) {
      h.image = await compact(h.image, "image", h.label || sc.title);
      h.action.audioUrl = await compact(h.action.audioUrl, "audio", `${h.label || sc.title} action`);
      for (const a of Object.values(h.verbs ?? {})) if (a) a.audioUrl = await compact(a.audioUrl, "audio", `${h.label || sc.title} verb`);
      if (h.itemAudio) {
        for (const [id, clip] of Object.entries(h.itemAudio)) {
          h.itemAudio[id] = (await compact(clip, "audio", `${h.label || sc.title} item ${id}`)) ?? clip;
        }
      }
      for (const st of h.states ?? []) {
        st.image = await compact(st.image, "image", `${h.label || sc.title} state ${st.id}`);
        if (st.action) st.action.audioUrl = await compact(st.action.audioUrl, "audio", `${h.label || sc.title} state ${st.id}`);
      }
    }
    if (sc.cinematic?.foregroundImage) {
      sc.cinematic.foregroundImage = (await compact(sc.cinematic.foregroundImage, "image", sc.title)) || undefined;
    }
    if (sc.cinematic?.foregroundAnimation?.frames?.length) {
      sc.cinematic.foregroundAnimation.frames = (
        await Promise.all(sc.cinematic.foregroundAnimation.frames.map((f) => compact(f, "image", sc.title)))
      ).filter((f): f is string => !!f);
    }
    if (sc.cinematic?.foregroundExtras?.length) {
      for (const e of sc.cinematic.foregroundExtras) {
        const out = await compact(e.image, "image", sc.title);
        e.image = out ?? e.image;
        if (e.sheet?.image) e.sheet.image = (await compact(e.sheet.image, "image", `${sc.title} extra sheet`)) ?? e.sheet.image;
      }
    }
    if (sc.cinematic?.parallaxLayers?.length) {
      for (const l of sc.cinematic.parallaxLayers) {
        if (l.image.startsWith("asset:") || l.image.startsWith("data:")) {
          const out = await compact(l.image, "image", sc.title);
          if (out) l.image = out;
        }
      }
    }
    for (const b of sc.dialogueBeats ?? []) {
      b.audioUrl = await compact(b.audioUrl, "audio", sc.title);
      b.background = await compact(b.background, "image", sc.title);
      if (b.cinematic?.foregroundImage) {
        b.cinematic.foregroundImage = (await compact(b.cinematic.foregroundImage, "image", sc.title)) || undefined;
      }
      if (b.cinematic?.foregroundAnimation?.frames?.length) {
        b.cinematic.foregroundAnimation.frames = (
          await Promise.all(b.cinematic.foregroundAnimation.frames.map((f) => compact(f, "image", sc.title)))
        ).filter((f): f is string => !!f);
      }
      if (b.cinematic?.foregroundExtras?.length) {
        for (const e of b.cinematic.foregroundExtras) {
          const out = await compact(e.image, "image", sc.title);
          e.image = out ?? e.image;
          if (e.sheet?.image) e.sheet.image = (await compact(e.sheet.image, "image", `${sc.title} extra sheet`)) ?? e.sheet.image;
        }
      }
      if (b.cinematic?.parallaxLayers?.length) {
        for (const l of b.cinematic.parallaxLayers) {
          if (l.image.startsWith("asset:") || l.image.startsWith("data:")) {
            const out = await compact(l.image, "image", sc.title);
            if (out) l.image = out;
          }
        }
      }
      // The contradiction sub-beats carry their own audio/images.
      if (b.lie?.caughtBeat) await compactLieBeat(b.lie.caughtBeat, compact, sc.title);
      if (b.lie?.wrongBeat) await compactLieBeat(b.lie.wrongBeat, compact, sc.title);
    }
  }
  for (const it of next.items) {
    it.iconUrl = await compact(it.iconUrl, "image", it.name);
  }
  for (const c of next.characters) {
    c.avatarUrl = (await compact(c.avatarUrl, "image", c.name)) ?? "emoji:👤";
    if (c.talkingFrames?.length) {
      c.talkingFrames = (
        await Promise.all(c.talkingFrames.map((f) => compact(f, "image", `${c.name} talking`)))
      ).filter((f): f is string => !!f);
    }
    c.talkingRest = (await compact(c.talkingRest, "image", `${c.name} resting`)) || undefined;
    if (c.talkingSheet?.image)
      c.talkingSheet.image = (await compact(c.talkingSheet.image, "image", `${c.name} talking sheet`)) ?? c.talkingSheet.image;
    for (const v of c.talkingSheets ?? []) {
      if (v.sheet?.image)
        v.sheet.image = (await compact(v.sheet.image, "image", `${c.name} sheet: ${v.name}`)) ?? v.sheet.image;
    }
  }
  for (const a of next.acts ?? []) {
    a.titleCardImage = await compact(a.titleCardImage, "image", a.title || a.label || "act");
  }
  for (const ep of next.episodes ?? []) {
    ep.titleCardImage = await compact(ep.titleCardImage, "image", ep.title || "episode");
    ep.posterImage = await compact(ep.posterImage, "image", ep.title || "episode");
    ep.titleCardMusicUrl = await compact(ep.titleCardMusicUrl, "audio", ep.title || "episode");
    if (ep.recapLines?.length) {
      for (const line of ep.recapLines) line.image = await compact(line.image, "image", ep.title || "episode");
    }
  }
  next.coverImage = (await compact(next.coverImage, "image", next.title)) ?? IMAGE_FALLBACK;
  if (next.dialogueBox?.backgroundImage) {
    next.dialogueBox.backgroundImage =
      (await compact(next.dialogueBox.backgroundImage, "image", `${next.title} dialogue box`)) || undefined;
  }
  if (next.map?.backgroundImage) {
    next.map.backgroundImage =
      (await compact(next.map.backgroundImage, "image", `${next.title} travel map`)) || undefined;
  }
  return next;
}

/** React hook: loads every asset for `storyId` into an `assetId -> dataUrl`
 * map (and keeps it live via the existing subscription), returning a resolver
 * function that Studio previews use to show `asset:` references as real URLs. */
export function useResolvedMedia(storyId: string): (value?: string) => string | undefined {
  const [map, setMap] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadAssets(storyId).then((all) => {
        if (cancelled) return;
        setMap(Object.fromEntries(all.map((a) => [a.id, a.fileUrl ?? a.dataUrl])));
      });
    };
    refresh();
    const unsubscribe = subscribeAssets(storyId, refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [storyId]);
  return useCallback((value?: string) => resolveMediaValue(value, map), [map]);
}

/** React hook: the full global asset list (optionally filtered by type),
 * kept live across every story's uploads. Used by the background picker so an
 * image uploaded anywhere is reusable in any scene of any story. */
export function useAllAssets(assetType?: AssetType): MediaAsset[] {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadAllAssets(assetType).then((all) => {
        if (cancelled) return;
        setAssets(all);
      });
    };
    refresh();
    const unsubscribe = subscribeAssets(ALL_LISTENERS, refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [assetType]);
  return assets;
}

/** Collect the assets a story needs for a self-contained export: its own
 * library rows plus any `asset:` references it points at (which may live in a
 * shared/global bucket after cross-scene reuse). */
export async function loadStoryAssetsForExport(story: Story): Promise<MediaAsset[]> {
  const ids = collectStoryAssetIds(story);

  try {
    const db = await openDb();
    const all = await new Promise<StoredAsset[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as StoredAsset[]);
      req.onerror = () => reject(req.error);
    });
    const map = new Map<string, StoredAsset>();
    all.forEach((a) => {
      if (a.storyId === story.id || ids.has(a.id)) map.set(a.id, a);
    });
    return [...map.values()]
      .sort((a, b) => b.uploadedAt - a.uploadedAt)
      .map(({ fileUrl: _fileUrl, ...asset }) => asset);
  } catch {
    return loadAssets(story.id);
  }
}

/** Blob → data URL. FileReader in the browser; a base64 fallback for
 *  non-DOM runtimes (the engine tests exercise this under plain Node). */
async function blobToDataUrl(blob: Blob): Promise<string> {
  const mime = blob.type || "application/octet-stream";
  if (typeof FileReader !== "undefined") {
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error ?? new Error("Could not read voice file."));
      fr.readAsDataURL(blob);
    });
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

/** Read one voice-file reference as a base64 data URL: `/voices/...` public
 *  paths are fetched (dev server / static build), `file://` URLs go through
 *  the desktop bridge (packaged app). null when the file can't be read. */
async function readVoiceFileAsDataUrl(value: string): Promise<{ dataUrl: string; name: string } | null> {
  try {
    if (value.startsWith("/voices/")) {
      const res = await fetch(value);
      if (!res.ok) return null;
      const blob = await res.blob();
      return { dataUrl: await blobToDataUrl(blob), name: value.slice("/voices/".length) };
    }
    if (value.startsWith("file://")) {
      const bridge = typeof window !== "undefined" ? window.scarletReelDesktop : undefined;
      if (!bridge?.readVoice) return null;
      const res = await bridge.readVoice(value);
      if (!res?.base64) return null;
      return { dataUrl: "data:audio/mpeg;base64," + res.base64, name: res.name || "voice.mp3" };
    }
  } catch (err) {
    console.warn("[media] Could not read voice file for export.", err);
  }
  return null;
}

/**
 * Make an export self-contained for file-based voice lines. Every reference
 * to a voice MP3 stored as a real file (a `/voices/<person>/<scene>/<line>.mp3`
 * path in dev/browser, or a `file://` URL in a packaged app) is read off disk
 * and converted into a bundled `asset:<id>` row carrying the base64 payload —
 * the same shape as uploaded media, so the import path needs no changes.
 *
 * Returns a new story (input untouched) plus the bundled assets; `missing`
 * lists referenced files that could not be read, so the export UI can warn
 * instead of silently shipping a silent line.
 *
 * (Field walk mirrors resolveStoryMedia above — keep the lists in sync.)
 */
export async function bundleVoiceFileRefs(
  story: Story
): Promise<{ story: Story; assets: MediaAsset[]; missing: string[] }> {
  const next: Story = JSON.parse(JSON.stringify(story));
  const assets: MediaAsset[] = [];
  const missing: string[] = [];
  const byRef = new Map<string, string>();

  // A string in, a string out (same value or an asset: ref) — the generic
  // keeps required-string fields (background, coverImage…) satisfied.
  const bundleValue = async <T extends string | undefined>(value: T): Promise<T> => {
    if (!value || (!value.startsWith("/voices/") && !value.startsWith("file://"))) return value;
    let id = byRef.get(value);
    if (!id) {
      const read = await readVoiceFileAsDataUrl(value);
      if (!read) {
        if (!missing.includes(value)) missing.push(value);
        return value; // leave the reference as-is; the export UI warns about it
      }
      id = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      assets.push({
        id,
        name: read.name,
        type: "audio",
        dataUrl: read.dataUrl,
        size: Math.max(0, Math.round(((read.dataUrl.length - read.dataUrl.indexOf(",") - 1) * 3) / 4)),
        uploadedAt: Date.now(),
      });
      byRef.set(value, id);
    }
    return `asset:${id}` as T;
  };

  const apply = async (obj: unknown, key: string) => {
    if (!obj || typeof obj !== "object") return;
    const record = obj as Record<string, unknown>;
    const v = record[key];
    if (typeof v === "string") record[key] = await bundleValue(v);
  };
  const applyCinematic = async (c?: CinematicSettings) => {
    if (!c) return;
    c.foregroundImage = await bundleValue(c.foregroundImage);
    if (c.foregroundAnimation?.frames?.length) {
      c.foregroundAnimation.frames = (
        await Promise.all(c.foregroundAnimation.frames.map((f) => bundleValue(f)))
      ).filter((f): f is string => !!f);
    }
  };

  for (const sc of next.scenes) {
    sc.background = await bundleValue(sc.background);
    sc.musicUrl = await bundleValue(sc.musicUrl);
    sc.sceneAudioUrl = await bundleValue(sc.sceneAudioUrl);
    sc.narrationAudioUrl = await bundleValue(sc.narrationAudioUrl);
    if (sc.stage?.playerImage && !sc.stage.playerImage.startsWith("emoji:")) {
      sc.stage.playerImage = (await bundleValue(sc.stage.playerImage)) ?? sc.stage.playerImage;
    }
    if (sc.stage?.playerSheet?.image) {
      sc.stage.playerSheet.image = (await bundleValue(sc.stage.playerSheet.image)) ?? sc.stage.playerSheet.image;
    }
    for (const n of sc.stage?.npcs ?? []) {
      if (n.image && !n.image.startsWith("emoji:")) n.image = (await bundleValue(n.image)) ?? n.image;
      if (n.sheet?.image) n.sheet.image = (await bundleValue(n.sheet.image)) ?? n.sheet.image;
    }
    if (sc.stage?.walkFrames?.length) {
      sc.stage.walkFrames = await Promise.all(sc.stage.walkFrames.map(async (f) => (await bundleValue(f)) ?? f));
    }
    if (sc.credits?.montage?.length) {
      sc.credits.montage = (
        await Promise.all(sc.credits.montage.map((m) => bundleValue(m)))
      ).filter((m): m is string => !!m);
    }
    for (const h of sc.hotspots ?? []) {
      h.image = await bundleValue(h.image);
      h.action.audioUrl = await bundleValue(h.action.audioUrl);
      for (const a of Object.values(h.verbs ?? {})) if (a) a.audioUrl = await bundleValue(a.audioUrl);
      if (h.itemAudio) {
        for (const [id, clip] of Object.entries(h.itemAudio)) {
          h.itemAudio[id] = (await bundleValue(clip)) ?? clip;
        }
      }
      for (const st of h.states ?? []) {
        st.image = await bundleValue(st.image);
        if (st.action) st.action.audioUrl = await bundleValue(st.action.audioUrl);
      }
    }
    await applyCinematic(sc.cinematic);
    for (const b of sc.dialogueBeats ?? []) {
      b.audioUrl = await bundleValue(b.audioUrl);
      b.background = await bundleValue(b.background);
      await applyCinematic(b.cinematic);
      if (b.lie?.caughtBeat) {
        b.lie.caughtBeat.audioUrl = await bundleValue(b.lie.caughtBeat.audioUrl);
        b.lie.caughtBeat.background = await bundleValue(b.lie.caughtBeat.background);
        await applyCinematic(b.lie.caughtBeat.cinematic);
      }
      if (b.lie?.wrongBeat) {
        b.lie.wrongBeat.audioUrl = await bundleValue(b.lie.wrongBeat.audioUrl);
        b.lie.wrongBeat.background = await bundleValue(b.lie.wrongBeat.background);
        await applyCinematic(b.lie.wrongBeat.cinematic);
      }
    }
  }
  for (const it of next.items) {
    it.iconUrl = await bundleValue(it.iconUrl);
  }
  for (const c of next.characters) {
    c.avatarUrl = await bundleValue(c.avatarUrl);
    if (c.talkingFrames?.length) {
      c.talkingFrames = (
        await Promise.all(c.talkingFrames.map((f) => bundleValue(f)))
      ).filter((f): f is string => !!f);
    }
    c.talkingRest = await bundleValue(c.talkingRest);
    if (c.talkingSheet?.image) c.talkingSheet.image = (await bundleValue(c.talkingSheet.image)) ?? c.talkingSheet.image;
    for (const v of c.talkingSheets ?? []) {
      if (v.sheet?.image) v.sheet.image = (await bundleValue(v.sheet.image)) ?? v.sheet.image;
    }
  }
  for (const a of next.acts ?? []) {
    a.titleCardImage = await bundleValue(a.titleCardImage);
  }
  for (const ep of next.episodes ?? []) {
    ep.titleCardImage = await bundleValue(ep.titleCardImage);
    ep.posterImage = await bundleValue(ep.posterImage);
    ep.titleCardMusicUrl = await bundleValue(ep.titleCardMusicUrl);
    if (ep.recapLines?.length) {
      for (const line of ep.recapLines) line.image = await bundleValue(line.image);
    }
  }
  next.coverImage = await bundleValue(next.coverImage);
  if (next.dialogueBox) {
    await apply(next.dialogueBox, "backgroundImage");
  }
  if (next.map) {
    await apply(next.map, "backgroundImage");
  }

  return { story: next, assets, missing };
}

/** React hook: whether IndexedDB (file storage) is available in this browser.
 * `null` while checking, then true/false. Studio surfaces a warning when
 * storage is unavailable so uploads that can't persist are never a mystery. */
export function useStorageAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (typeof indexedDB === "undefined") {
      setAvailable(false);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => {
      if (!cancelled) setAvailable(true);
      try { req.result.close(); } catch { /* noop */ }
    };
    req.onerror = () => {
      if (!cancelled) setAvailable(false);
    };
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}

export const ASSET_LIMITS = MAX_ASSET_SIZE;
export const ASSET_TOTAL_LIMIT = MAX_TOTAL_SIZE;
