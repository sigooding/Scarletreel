/**
 * ElevenLabs line-by-line voice generation for the Studio.
 *
 * Scope is deliberately narrow: ONE dialogue line at a time, billed to the
 * author's ElevenLabs account per character (credits), with an explicit
 * confirm showing the character count before any spend. The API key lives
 * in localStorage only — it is never written into the story data, saves or
 * exports. Generated MP3s upload into the media library and attach to the
 * beat as a normal `asset:<id>` audioUrl, so playback is the existing
 * MP3-first path (TTS is bypassed for that line; the music duck fires on it
 * exactly as it does for TTS).
 */

export const ELEVENLABS_MODELS = [
  { id: "eleven_v3", label: "Eleven v3 (v3 voices)" },
  { id: "eleven_multilingual_v2", label: "Multilingual v2 (v2 voices)" },
  { id: "eleven_turbo_v2_5", label: "Turbo v2.5 (fast, cheaper)" },
] as const;

const KEY_STORAGE = "scarlet-ai-voice-key";
const MODEL_STORAGE = "scarlet-ai-voice-model";

export function getElevenKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setElevenKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* storage unavailable — the key lasts the session */
  }
}

export function getElevenModel(): string {
  try {
    return localStorage.getItem(MODEL_STORAGE) ?? "eleven_v3";
  } catch {
    return "eleven_v3";
  }
}

export function setElevenModel(id: string): void {
  try {
    localStorage.setItem(MODEL_STORAGE, id);
  } catch {
    /* session only */
  }
}

export interface SynthesisResult {
  dataUrl: string;
  bytes: number;
  chars: number;
}

/** Synthesize one line with ElevenLabs and return it as a data URL ready
 *  for the media-library upload. Throws an Error with a readable message
 *  for every failure mode (bad key, credits, rate limit, voice/model). */
export async function synthesizeElevenLabs(text: string, voiceId: string, model: string): Promise<SynthesisResult> {
  const key = getElevenKey();
  if (!key) throw new Error("No ElevenLabs API key set — add it in the AI Voice section of the People tab first.");
  let res: Response;
  try {
    res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
  } catch {
    throw new Error("Could not reach the ElevenLabs API — check your connection and try again.");
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string; detail?: string | { message?: string }[] };
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((d) => d?.message ?? "").filter(Boolean).join("; ");
      else detail = body.message ?? "";
    } catch {
      /* non-JSON error body — statusText is enough */
    }
    const msg = detail || res.statusText;
    if (res.status === 401) throw new Error(`ElevenLabs rejected the API key (401). ${msg}`);
    if (res.status === 422)
      throw new Error(`ElevenLabs refused the request (422) — usually an out-of-credits balance or a voice/model mismatch. ${msg}`);
    if (res.status === 429) throw new Error("Rate limited by ElevenLabs (429) — wait a few seconds and try again.");
    throw new Error(`ElevenLabs error ${res.status}. ${msg}`);
  }
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
  return { dataUrl, bytes: blob.size, chars: text.length };
}

/** The confirm copy — the credit cost is always on the table before any
 *  spend. ElevenLabs bills by characters, so the count is the estimate. */
export function convertConfirmMessage(charName: string, voiceId: string, model: string, line: string): string {
  const shown = line.length > 140 ? `${line.slice(0, 140)}…` : line;
  return [
    "ElevenLabs conversion — this spends credits on your account.",
    "",
    `Character: ${charName}`,
    `Voice:     ${voiceId} (${model})`,
    `Line:      "${shown}"`,
    `Length:    ${line.length} characters (ElevenLabs charges per character)`,
    "",
    "Convert this line?",
  ].join("\n");
}
