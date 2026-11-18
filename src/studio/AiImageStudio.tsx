import { useState } from "react";
import { uploadDataUrlAsset, useStorageAvailable } from "../data/mediaLibrary";
import {
  AI_PROVIDERS,
  generateAiImage,
  loadAiSettings,
  saveAiSettings,
  type AiImageSettings,
  type AiProviderSettings,
} from "../data/aiImages";

const inputCls =
  "w-full border border-noir-600 bg-noir-950 px-2 py-1 text-xs text-paper focus:border-neon outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-[10px] uppercase tracking-wider text-paper/50">
      {label}
      <div className="mt-0.5 normal-case tracking-normal">{children}</div>
    </label>
  );
}

/** Noir style suffix appended to every prompt so generated art matches the
 * game's look. Toggleable and editable — turn it off for full control. */
const NOIR_SUFFIX = "film noir, dark moody palette with gold and neon accents, cinematic lighting, film grain, no text";

const OPENAI_MODELS = [
  { id: "gpt-image-1", label: "gpt-image-1 (1024–1536px)" },
  { id: "dall-e-3", label: "dall-e-3 (1024–1792px)" },
];
const OPENAI_SIZES = ["1024x1024", "1536x1024", "1024x1536", "1792x1024", "1024x1792"];
const TOGETHER_MODELS = [
  { id: "black-forest-labs/FLUX.1-schnell-Free", label: "FLUX.1 schnell (free tier)" },
  { id: "black-forest-labs/FLUX.1-schnell", label: "FLUX.1 schnell" },
  { id: "black-forest-labs/FLUX.1-dev", label: "FLUX.1 dev" },
  { id: "stabilityai/stable-diffusion-3.5-large", label: "SD 3.5 Large" },
];
const A1111_SAMPLERS = ["DPM++ 2M Karras", "DPM++ SDE Karras", "Euler a", "Euler", "DDIM", "UniPC"];
const COMFY_SAMPLERS = ["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_2m_sde", "ddim"];
const COMFY_SCHEDULERS = ["normal", "karras", "exponential", "sgm_uniform"];

const PROMPT_IDEAS = [
  "Rain-slick alley at night, neon signs",
  "Femme fatale portrait in a trench coat",
  "Harbor under a pier, storm rolling in",
  "Vintage detective office, venetian blinds",
];

export function AiImageStudio({ storyId }: { storyId: string }) {
  const [settings, setSettings] = useState<AiImageSettings>(loadAiSettings);
  const [prompt, setPrompt] = useState("");
  const [applyStyle, setApplyStyle] = useState(true);
  const [styleSuffix, setStyleSuffix] = useState(NOIR_SUFFIX);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const storageAvailable = useStorageAvailable();

  const provider = settings.provider;
  const cfg: AiProviderSettings = settings.providers[provider] ?? { id: provider };

  const updateSettings = (next: AiImageSettings) => {
    setSettings(next);
    saveAiSettings(next);
  };
  const setProvider = (id: typeof provider) => updateSettings({ ...settings, provider: id });
  const setCfg = (patch: Partial<AiProviderSettings>) =>
    updateSettings({ ...settings, providers: { ...settings.providers, [provider]: { ...cfg, ...patch } } });

  const finalPrompt = (applyStyle && styleSuffix.trim() ? `${prompt}${prompt.trim() ? ", " : ""}${styleSuffix.trim()}` : prompt).trim();

  const generate = async () => {
    if (!finalPrompt) {
      setError("Write a prompt first.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setSaved(null);
    const res = await generateAiImage(settings, finalPrompt);
    setBusy(false);
    if (res.ok && res.dataUrl) setResult(res.dataUrl);
    else setError(res.error ?? "Generation failed.");
  };

  const saveToLibrary = async () => {
    if (!result) return;
    const r = await uploadDataUrlAsset(storyId, `ai-${Date.now()}.png`, "image", result);
    if (r.success) setSaved("Saved to this story's media library — it's now available in every image dropdown (Background, Foreground, Keyframes) and the 📦 Media tab.");
    else setError(r.error ?? "Could not save the image.");
  };

  const meta = AI_PROVIDERS.find((m) => m.id === provider)!;

  return (
    <div className="space-y-3">
      <div className="border border-neon/40 bg-neon/5 p-2.5">
        <div className="font-pulp text-[11px] uppercase tracking-widest text-neon">🎨 AI Image Studio</div>
        <p className="mt-1 font-type text-[9px] leading-snug text-paper/60">
          Generate artwork from a text prompt and drop it straight into this story. Commercial providers bill per image and need an
          API key; local generators (AUTOMATIC1111 / Forge, ComfyUI) run free on your own GPU. Keys stay in this browser's storage —
          never paste them on a shared machine.
        </p>
        {storageAvailable === false && (
          <p className="mt-1 border border-crimson/40 bg-crimson/10 p-1.5 font-type text-[9px] text-crimson">
            ⚠ This browser can't store files — generated images won't survive a reload.
          </p>
        )}
      </div>

      <Field label="Image generator">
        <select className={inputCls} value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
          {AI_PROVIDERS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.kind === "commercial" ? "☁ " : "🖥 "}
              {m.label}
            </option>
          ))}
        </select>
        <p className="mt-1 font-type text-[9px] leading-snug text-paper/45">{meta.blurb}</p>
      </Field>

      {/* ---- per-provider configuration ---- */}
      {meta.needsKey && (
        <Field label="API key">
          <input
            type="password"
            className={inputCls}
            placeholder={`Paste your ${meta.label.split(" — ")[0]} API key…`}
            value={cfg.apiKey ?? ""}
            onChange={(e) => setCfg({ apiKey: e.target.value })}
            autoComplete="off"
          />
          <p className="mt-1 font-type text-[8px] text-paper/35">Stored locally on this device only, and sent only to {meta.label.split(" — ")[0]}.</p>
        </Field>
      )}

      {provider === "openai" && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Model">
            <select className={inputCls} value={cfg.model ?? "gpt-image-1"} onChange={(e) => setCfg({ model: e.target.value })}>
              {OPENAI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Size">
            <select
              className={inputCls}
              value={`${cfg.width ?? 1024}x${cfg.height ?? 1024}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split("x").map(Number);
                setCfg({ width: w, height: h });
              }}
            >
              {OPENAI_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {provider === "stability" && (
        <Field label="Aspect ratio">
          <select className={inputCls} value={cfg.aspectRatio ?? "16:9"} onChange={(e) => setCfg({ aspectRatio: e.target.value })}>
            {["1:1", "16:9", "21:9", "3:2", "2:3", "9:16"].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </Field>
      )}

      {provider === "together" && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Model">
            <select className={inputCls} value={cfg.model ?? TOGETHER_MODELS[0].id} onChange={(e) => setCfg({ model: e.target.value })}>
              {TOGETHER_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Width">
            <input type="number" min={512} max={1440} step={32} className={inputCls} value={cfg.width ?? 1024} onChange={(e) => setCfg({ width: Number(e.target.value) || 1024 })} />
          </Field>
          <Field label="Height">
            <input type="number" min={512} max={1440} step={32} className={inputCls} value={cfg.height ?? 768} onChange={(e) => setCfg({ height: Number(e.target.value) || 768 })} />
          </Field>
        </div>
      )}

      {(provider === "a1111" || provider === "comfyui") && (
        <>
          <Field label="Server URL">
            <input className={inputCls} placeholder={provider === "a1111" ? "http://127.0.0.1:7860" : "http://127.0.0.1:8188"} value={cfg.baseUrl ?? ""} onChange={(e) => setCfg({ baseUrl: e.target.value })} />
          </Field>
          {provider === "comfyui" && (
            <Field label="Checkpoint filename (from ComfyUI/models/checkpoints)">
              <input className={inputCls} placeholder="e.g. sd_xl_base_1.0.safetensors" value={cfg.model ?? ""} onChange={(e) => setCfg({ model: e.target.value })} />
            </Field>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Field label="Width">
              <input type="number" min={256} max={2048} step={64} className={inputCls} value={cfg.width ?? 1024} onChange={(e) => setCfg({ width: Number(e.target.value) || 1024 })} />
            </Field>
            <Field label="Height">
              <input type="number" min={256} max={2048} step={64} className={inputCls} value={cfg.height ?? 768} onChange={(e) => setCfg({ height: Number(e.target.value) || 768 })} />
            </Field>
            <Field label="Steps">
              <input type="number" min={1} max={60} className={inputCls} value={cfg.steps ?? 20} onChange={(e) => setCfg({ steps: Number(e.target.value) || 20 })} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="CFG scale">
              <input type="number" min={1} max={20} step={0.5} className={inputCls} value={cfg.cfgScale ?? 7} onChange={(e) => setCfg({ cfgScale: Number(e.target.value) || 7 })} />
            </Field>
            <Field label="Sampler">
              <select className={inputCls} value={cfg.sampler ?? ""} onChange={(e) => setCfg({ sampler: e.target.value })}>
                {(provider === "a1111" ? A1111_SAMPLERS : COMFY_SAMPLERS).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            {provider === "comfyui" && (
              <Field label="Scheduler">
                <select className={inputCls} value={cfg.scheduler ?? "normal"} onChange={(e) => setCfg({ scheduler: e.target.value })}>
                  {COMFY_SCHEDULERS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <Field label="Negative prompt">
            <input className={inputCls} value={cfg.negativePrompt ?? ""} onChange={(e) => setCfg({ negativePrompt: e.target.value })} placeholder="blurry, low quality, deformed" />
          </Field>
        </>
      )}

      {/* ---- prompt ---- */}
      <Field label="Prompt">
        <textarea className={`${inputCls} h-20 font-type`} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the scene you want…" />
      </Field>
      <div className="flex flex-wrap gap-1">
        {PROMPT_IDEAS.map((idea) => (
          <button
            key={idea}
            onClick={() => setPrompt(idea)}
            className="border border-paper/20 px-1.5 py-0.5 font-type text-[9px] text-paper/60 hover:border-neon hover:text-neon"
          >
            {idea}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-paper/60">
        <input type="checkbox" checked={applyStyle} onChange={(e) => setApplyStyle(e.target.checked)} />
        Append noir style (keeps art consistent with the game)
      </label>
      {applyStyle && (
        <input className={inputCls} value={styleSuffix} onChange={(e) => setStyleSuffix(e.target.value)} />
      )}

      <button
        onClick={generate}
        disabled={busy || !finalPrompt}
        className={`w-full border py-2 font-pulp text-[11px] uppercase tracking-widest ${
          busy ? "border-paper/20 text-paper/40 cursor-wait" : "border-neon bg-neon/10 text-neon hover:bg-neon/20"
        }`}
      >
        {busy ? "⏳ Generating…" : "🎨 Generate image"}
      </button>

      {error && <div className="border border-crimson/40 bg-crimson/10 p-2 font-type text-[10px] text-crimson">⚠ {error}</div>}

      {result && (
        <div className="border border-gold/40 bg-gold/5 p-2">
          <img src={result} alt="Generated" className="w-full border border-noir-600" />
          <button onClick={saveToLibrary} className="mt-2 w-full border border-emerald-500/60 bg-emerald-500/10 py-1.5 font-pulp text-[10px] uppercase tracking-widest text-emerald-400 hover:bg-emerald-500/20">
            💾 Save to media library
          </button>
        </div>
      )}
      {saved && <div className="border border-emerald-500/40 bg-emerald-500/10 p-2 font-type text-[10px] text-emerald-400">✓ {saved}</div>}
    </div>
  );
}
