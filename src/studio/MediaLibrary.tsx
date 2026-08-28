import { useCallback, useEffect, useMemo, useState } from "react";
import type { MediaAsset, AssetType } from "../types";
import { loadAssets, deleteAsset, uploadAsset, subscribeAssets, useAllAssets, ASSET_LIMITS, ASSET_TOTAL_LIMIT } from "../data/mediaLibrary";
import { listVoiceFilesForCharacter, voiceSlug, type VoiceFileEntry } from "./voiceFiles";
import { ImagePicker } from "./ImagePicker";
import builtinAudio from "virtual:builtin-audio";
import { assetUrl } from "../assetPath";

const inputCls = "w-full border border-noir-600 bg-noir-950 px-2 py-1 text-xs text-paper focus:border-neon outline-none";

/** Live-updating list of assets for one story. Refreshes whenever anything
 * (this component, an inline upload button, another dropdown) changes the
 * library, without needing prop drilling or manual refresh calls. */
export function useAssetList(storyId: string, assetType?: AssetType) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadAssets(storyId).then((all) => {
        if (cancelled) return;
        setAssets(assetType ? all.filter((a) => a.type === assetType) : all);
      });
    };
    refresh();
    const unsubscribe = subscribeAssets(storyId, refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [storyId, assetType]);

  return assets;
}

/** Reusable direct-upload button used next to any media field in Studio.
 * Uploads immediately apply to the field AND register in the shared library
 * so the same file is reusable from every dropdown afterward. */
export function MediaUploadButton({
  storyId,
  accept,
  label,
  onUploaded,
}: {
  storyId: string;
  accept: "audio/*" | "video/*" | "image/*";
  label: string;
  onUploaded: (url: string, assetId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <label
      className={`flex shrink-0 items-center justify-center gap-1 cursor-pointer border border-cyan-neon/40 px-3 py-1 font-pulp text-[10px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/10 ${
        busy ? "pointer-events-none opacity-50" : ""
      }`}
    >
      {busy ? "⏳ Uploading…" : label}
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          const result = await uploadAsset(storyId, file);
          setBusy(false);
          if (!result.success || !result.url || !result.assetId) {
            window.alert(result.error ?? "Upload failed.");
            return;
          }
          onUploaded(result.url, result.assetId);
        }}
      />
    </label>
  );
}

/** Dropdown of previously uploaded assets of one type, with a live preview of
 * whichever one is currently selected so authors can confirm it's the right
 * file before leaving the field.
 *
 * Reads the GLOBAL library (every asset of this type, across all stories) so
 * any image/audio/video is reachable from every pulldown — matching the scene
 * Background dropdown. Previously this was scoped to a single story, which is
 * why a background image you'd already used wouldn't show up in the foreground,
 * beat-background, avatar and other pickers. `storyId` is kept in the prop type
 * for call-site compatibility but is intentionally unused here. */
export function AssetDropdown({
  assetType,
  value,
  onChange,
  placeholder,
  returnReference = false,
}: {
  storyId?: string;
  assetType: AssetType;
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  /** return `asset:<id>` instead of a large data URL (for localStorage config) */
  returnReference?: boolean;
}) {
  const assets = useAllAssets(assetType);
  // Images get the rich browser: every built-in /img asset + all uploads +
  // gradient presets, with a rollover preview. Audio/video keep the compact
  // native select (with inline playback) below.
  if (assetType === "image") {
    return (
      <ImagePicker
        value={value}
        onChange={onChange}
        includeBuiltins
        includeGradients={false}
        allowClear
        returnReference={returnReference}
        placeholder={placeholder ?? "Pick an image…"}
      />
    );
  }
  const selected = assets.find((a) => a.dataUrl === value || `asset:${a.id}` === value);

  return (
    <div className="space-y-1">
      <select className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">{placeholder ?? `Select uploaded ${assetType}...`}</option>
        {assets.map((asset) => (
          <option key={asset.id} value={returnReference ? `asset:${asset.id}` : asset.dataUrl}>
            {asset.name} ({(asset.size / 1024).toFixed(0)}KB)
          </option>
        ))}
      </select>
      {selected && assetType === "audio" && <audio controls src={selected.dataUrl} className="h-8 w-full" />}
      {selected && assetType === "video" && <video controls src={selected.dataUrl} className="h-24 w-full object-cover" />}
      {!assets.length && <p className="font-type text-[9px] text-paper/35">No {assetType} uploaded yet — use Upload above or the 📦 Media tab.</p>}
    </div>
  );
}

/** Every audio file a beat can use, in one picker:
 *
 *  - the character's own takes from `voices/<person>/<scene>/` — read live from
 *    the desktop voices folder (IPC) or the author's linked folder, merged with
 *    the build-time scan of `public/`, so the list also works in the browser
 *    preview where neither a bridge nor a linked folder exists;
 *  - then every other audio file in the project (imports, music, other
 *    characters), so nothing sitting on disk is unreachable.
 *
 *  Picking a file assigns it AND puts a player under the list, so the take is
 *  auditioned the moment it's chosen. */
export function CharacterVoiceFiles({
  characterId,
  characterName,
  value,
  onChange,
}: {
  characterId: string;
  characterName?: string;
  value?: string;
  onChange: (url: string) => void;
}) {
  const [files, setFiles] = useState<VoiceFileEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [liveNote, setLiveNote] = useState<string | null>(null);
  const allAudio = useAllAssets("audio");

  /** Re-read the live voices folder (desktop IPC / linked folder). */
  const refresh = useCallback(async () => {
    if (!characterId || characterId === "narrator") {
      setFiles([]);
      setLiveNote(null);
      return;
    }
    setBusy(true);
    try {
      const list = await listVoiceFilesForCharacter(characterId);
      setFiles(list);
      setLiveNote(list.length ? null : "Live folder empty — the list below is what the build scanned from public/.");
    } catch (err) {
      setLiveNote((err as Error).message);
    } finally {
      setBusy(false);
    }
  }, [characterId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const who = characterName?.trim() || characterId;
  const person = characterId && characterId !== "narrator" ? voiceSlug(characterId) : "";

  // This character's takes: live folder first (freshest), then the build scan.
  const seen = new Set<string>();
  const mine: { url: string; label: string }[] = [];
  for (const f of files) {
    if (seen.has(f.url)) continue;
    seen.add(f.url);
    mine.push({ url: f.url, label: `${f.scene}/${f.name}${f.size ? ` (${(f.size / 1024).toFixed(0)}KB)` : ""}` });
  }
  for (const a of builtinAudio) {
    if (a.person !== person || seen.has(a.url)) continue;
    seen.add(a.url);
    mine.push({ url: a.url, label: `${a.scene}/${a.label}` });
  }
  // Everything else in the project, so no audio file is hidden from the picker.
  const others = builtinAudio.filter((a) => a.person !== person && !seen.has(a.url));

  /** A URL the browser can actually play: public paths need the deploy base,
   *  `asset:` references resolve through the library, file:// is desktop-only. */
  const previewSrc = useMemo(() => {
    if (!value) return undefined;
    if (value.startsWith("data:") || value.startsWith("http")) return value;
    if (value.startsWith("asset:")) return allAudio.find((a) => `asset:${a.id}` === value)?.dataUrl;
    if (value.startsWith("/")) return assetUrl(value);
    return undefined;
  }, [value, allAudio]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-1">
        <span
          className="font-pulp text-[8px] uppercase tracking-widest text-cyan-neon/80"
          title={person ? `Files under voices/${person}/ plus every other audio file in the project` : "Every audio file in this project"}
        >
          \ud83d\udcc2 Audio for {who}
          {mine.length ? ` (${mine.length})` : ""}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          title="Re-scan the voices folder"
          className="border border-noir-600 px-1.5 py-0.5 font-pulp text-[8px] uppercase tracking-widest text-paper/60 hover:border-cyan-neon/50 hover:text-cyan-neon disabled:opacity-40"
        >
          {busy ? "\u23f3" : "\u21bb"}
        </button>
      </div>
      <select
        className={inputCls}
        value={value ?? ""}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
      >
        <option value="">Pick an audio file\u2026</option>
        {mine.length > 0 && (
          <optgroup label={`\ud83c\udf99 ${who} \u2014 voices/${person} (${mine.length})`}>
            {mine.map((f) => (
              <option key={f.url} value={f.url}>
                {f.label}
              </option>
            ))}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label={`\ud83d\udcc1 All other audio in this project (${others.length})`}>
            {others.map((a) => (
              <option key={a.url} value={a.url}>
                {a.folder ? `${a.folder}/` : ""}
                {a.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {previewSrc ? (
        <audio key={previewSrc} controls autoPlay src={previewSrc} className="h-8 w-full" />
      ) : value ? (
        <p className="font-type text-[9px] text-paper/40">
          Saved as a desktop file path — it plays in the game, but the browser cannot stream it here.
        </p>
      ) : null}
      {liveNote && <p className="font-type text-[9px] leading-snug text-paper/40">{liveNote}</p>}
      {!mine.length && !others.length && (
        <p className="font-type text-[9px] leading-snug text-paper/40">
          No audio files found — upload one above, or drop files into public/ and rebuild.
        </p>
      )}
    </div>
  );
}

export function MediaLibrary({ storyId }: { storyId: string }) {
  const assets = useAssetList(storyId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const result = await uploadAsset(storyId, file);
      if (!result.success) {
        setError(result.error ?? "Upload failed");
        break;
      }
    }
    setUploading(false);
    e.target.value = "";
  };

  const handleDelete = async (assetId: string) => {
    if (!confirm("Delete this asset? Any scene still pointing at it will need a new file selected.")) return;
    await deleteAsset(storyId, assetId);
  };

  const totalSize = assets.reduce((sum, a) => sum + a.size, 0);
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
  const totalLimitMB = (ASSET_TOTAL_LIMIT / 1024 / 1024).toFixed(0);

  const groups: { type: AssetType; icon: string; label: string }[] = [
    { type: "audio", icon: "🎵", label: "Audio" },
    { type: "video", icon: "🎥", label: "Video" },
    { type: "image", icon: "🖼️", label: "Images" },
  ];

  return (
    <div className="space-y-4">
      <div className="border border-gold/40 bg-gold/5 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-pulp text-[11px] uppercase tracking-widest text-gold">📦 Media Library</div>
          <div className="font-type text-[10px] text-paper/60">{totalSizeMB}MB / {totalLimitMB}MB used</div>
        </div>

        <label className="flex items-center justify-center cursor-pointer border border-cyan-neon/40 px-4 py-2 font-pulp text-[11px] uppercase tracking-widest text-cyan-neon hover:bg-cyan-neon/10">
          {uploading ? "⏳ Uploading..." : "⇧ Upload Files"}
          <input type="file" multiple accept="audio/*,video/*,image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>

        {error && <div className="mt-2 border border-crimson/40 bg-crimson/10 p-2 font-type text-[10px] text-crimson">⚠ {error}</div>}

        <p className="mt-2 font-type text-[9px] text-paper/45">
          Audio up to {(ASSET_LIMITS.audio / 1024 / 1024).toFixed(0)}MB, video up to {(ASSET_LIMITS.video / 1024 / 1024).toFixed(0)}MB, images up to{" "}
          {(ASSET_LIMITS.image / 1024 / 1024).toFixed(0)}MB. In the desktop app, uploads are copied into the game media folder automatically; in browsers they are stored in IndexedDB.
        </p>
      </div>

      {groups.map(({ type, icon, label }) => {
        const items = assets.filter((a) => a.type === type);
        if (!items.length) return null;
        return (
          <div key={type} className="border border-noir-600 p-2">
            <div className="mb-2 font-pulp text-[10px] uppercase tracking-widest text-cyan-neon">
              {icon} {label} ({items.length})
            </div>
            <div className="space-y-2">
              {items.map((asset) => (
                <div key={asset.id} className="border border-noir-700 bg-noir-900/50 p-1.5">
                  <div className="flex items-center gap-2">
                    {type === "image" && <img src={asset.dataUrl} alt={asset.name} className="h-8 w-8 shrink-0 object-cover" />}
                    <span className="flex-1 truncate font-type text-[10px] text-paper/80">{asset.name}</span>
                    <span className="shrink-0 font-type text-[9px] text-paper/40">
                      {asset.size > 1024 * 1024 ? `${(asset.size / 1024 / 1024).toFixed(1)}MB` : `${(asset.size / 1024).toFixed(0)}KB`}
                    </span>
                    <button onClick={() => handleDelete(asset.id)} className="shrink-0 text-[10px] text-crimson hover:underline">
                      Delete
                    </button>
                  </div>
                  {type === "audio" && <audio controls src={asset.dataUrl} className="mt-1 h-8 w-full" />}
                  {type === "video" && <video controls src={asset.dataUrl} className="mt-1 h-28 w-full object-cover" />}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {assets.length === 0 && (
        <div className="border border-noir-600 p-4 text-center font-type text-[11px] text-paper/45">
          No media uploaded yet. Upload audio, video, or images to use in your story.
        </div>
      )}
    </div>
  );
}
