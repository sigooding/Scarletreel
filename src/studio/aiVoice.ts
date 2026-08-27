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
  /** The raw MP3 — written to disk as a real voice file (see voiceFiles.ts). */
  blob: Blob;
  bytes: number;
  chars: number;
}

/** Synthesize one line with ElevenLabs and return it as a data URL ready
 *  for the media-library upload. Throws an Error with a readable message
 *  for every failure mode (bad key, credits, rate limit, voice/model).
 *  Pass `context` (the lines immediately around this one, with speaker
 *  labels) for ElevenLabs' conversational context — it reads the prior
 *  turn so the delivery responds to it naturally instead of in isolation. */
export async function synthesizeElevenLabs(
  text: string,
  voiceId: string,
  model: string,
  context?: { previousText?: string; nextText?: string }
): Promise<SynthesisResult> {
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
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
        // Conversational context: the surrounding turns help the model pace
        // and intone the line as a reply rather than an isolated read.
        ...(context?.previousText ? { previous_text: context.previousText.slice(-1000) } : {}),
        ...(context?.nextText ? { next_text: context.nextText.slice(-400) } : {}),
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
  return { dataUrl, blob, bytes: blob.size, chars: text.length };
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

/* ------------------------------------------------------------------ *
 *  ElevenLabs v3 audio tags — non-speech cues inserted into the line.
 *  Bracketed tags like [laughs] / [coughs] are a v3 feature; v2 and
 *  turbo read them literally, so they're offered when the v3 model is
 *  selected. Inserted at the cursor (or appended) by the beat editor.
 * ------------------------------------------------------------------ */
export interface AudioTag {
  tag: string;
  label: string;
  hint: string;
}

/** Curated, commonly-working v3 tags grouped by kind. The API supports
 *  many natural-language sound labels too — these are the reliable ones. */
export const ELEVENLABS_AUDIO_TAGS: { group: string; tags: AudioTag[] }[] = [
  {
    group: "Reactions",
    tags: [
      { tag: "[laughs]", label: "laugh", hint: "a short laugh" },
      { tag: "[chuckles]", label: "chuckle", hint: "a quiet chuckle" },
      { tag: "[sighs]", label: "sigh", hint: "an exhale" },
      { tag: "[gulps]", label: "gulp", hint: "a nervous swallow" },
      { tag: "[gasps]", label: "gasp", hint: "a sharp intake of breath" },
      { tag: "[groans]", label: "groan", hint: "a weary/annoyed groan" },
      { tag: "[grunts]", label: "grunt", hint: "a short grunt" },
    ],
  },
  {
    group: "Physical / throat",
    tags: [
      { tag: "[coughs]", label: "cough", hint: "a dry cough" },
      { tag: "[clears throat]", label: "clear throat", hint: "throat-clearing" },
      { tag: "[sneezes]", label: "sneeze", hint: "a sneeze" },
      { tag: "[yawns]", label: "yawn", hint: "a tired yawn" },
    ],
  },
  {
    group: "Mouth / emotion",
    tags: [
      { tag: "[whispers]", label: "whisper", hint: "drop to a whisper" },
      { tag: "[mumbles]", label: "mumble", hint: "muffled/mumbled" },
      { tag: "[laughs]", label: "laughing line", hint: "tag around laughing speech" },
      { tag: "[pauses]", label: "beat pause", hint: "a held beat" },
    ],
  },
];

/** Model ids that understand bracketed audio tags (v3 family). */
export function modelSupportsAudioTags(model: string): boolean {
  return model === "eleven_v3" || /v3/.test(model);
}
