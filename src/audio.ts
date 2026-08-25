import { assetUrl } from "./assetPath";
import type { AudioTrack } from "./types";

export type MixChannel = "master" | "music" | "ambient" | "voice" | "sfx";

/**
 * Procedural pulp-noir sound engine. Everything is synthesized through the
 * Web Audio API; the AudioTrack contract allows dropping in mp3 files later.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  /** False until the first user gesture — gates AudioContext creation so synth
   * audio never starts (and warns) before the player has interacted. */
  private unlocked = false;
  private buses: Partial<Record<MixChannel, GainNode>> = {};
  volumes: Record<MixChannel, number> = { master: 0.8, music: 0.8, ambient: 0.45, voice: 0.9, sfx: 0.75 };

  private ambientHandle: { gain: GainNode; stop: () => void } | null = null;
  private ambientId: string | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  readonly registry: AudioTrack[] = [
    { id: "rain", label: "Night Rain", kind: "synth", preset: "rain" },
    { id: "jazz", label: "Smoky Jazz Pad", kind: "synth", preset: "jazz" },
    { id: "drone", label: "Low Drone", kind: "synth", preset: "drone" },
    { id: "tension", label: "Tension Strings", kind: "synth", preset: "tension" },
  ];

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    // Don't create (or resume) the AudioContext until a real user gesture has
    // unlocked sound — creating it at page load triggers the browser's
    // "AudioContext was not allowed to start" warning and leaves synth audio
    // (ambience/SFX) silent under a strict autoplay policy.
    if (!this.unlocked) return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      const master = this.ctx.createGain();
      master.gain.value = this.volumes.master;
      master.connect(this.ctx.destination);
      this.buses.master = master;
      (["music", "ambient", "voice", "sfx"] as MixChannel[]).forEach((ch) => {
        const g = this.ctx!.createGain();
        g.gain.value = this.volumes[ch];
        g.connect(master);
        this.buses[ch] = g;
      });
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  unlock() {
    this.unlocked = true;
    this.ensure();
    // Ambient that was requested before the context existed (e.g. the menu's
    // rain fallback) gets applied now that sound is allowed.
    this.applyAmbient();
    // A prose clip the autoplay policy rejected at scene entry (Studio
    // playtest tabs, strict webviews) gets one more chance on a real gesture.
    this.retryPendingNarration();
  }

  setVolume(ch: MixChannel, v: number) {
    this.volumes[ch] = v;
    const ctx = this.ctx;
    const bus = this.buses[ch];
    if (ctx && bus) bus.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    // A recorded voice clip (playClip) is a raw Audio() outside the WebAudio
    // buses, so re-apply its effective volume live when voice/master change.
    if ((ch === "voice" || ch === "master") && this.clip) {
      this.clip.volume = Math.min(1, this.volumes.voice * this.volumes.master);
    }
  }

  private getNoise(ctx: AudioContext): AudioBuffer {
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  private blip(freq: number, type: OscillatorType, dur: number, vol: number, delay = 0, slideTo?: number) {
    const ctx = this.ensure();
    if (!ctx || !this.buses.sfx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.buses.sfx);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noiseHit(dur: number, vol: number, freq: number, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.buses.sfx) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(this.buses.sfx);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  click() { this.blip(1400, "square", 0.045, 0.06, 0, 700); }
  tick() { this.blip(2100 + Math.random() * 500, "square", 0.018, 0.022); }
  hover() { this.blip(900, "sine", 0.05, 0.03); }
  pickup() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.blip(f, "triangle", 0.28, 0.12, i * 0.07));
  }
  combine() {
    [392, 493.88, 587.33, 783.99, 987.77].forEach((f, i) => this.blip(f, "triangle", 0.4, 0.13, i * 0.06));
    this.noiseHit(0.35, 0.08, 3200, 0.28);
  }
  stinger() {
    [110, 220, 261.63, 311.13].forEach((f) => this.blip(f, "sawtooth", 1.4, 0.09));
    this.noiseHit(0.8, 0.12, 400);
  }
  success() {
    [523.25, 659.25, 880, 1318.5].forEach((f, i) => this.blip(f, "sine", 0.5, 0.12, i * 0.09));
  }
  fail() {
    this.blip(196, "sawtooth", 0.4, 0.12, 0, 92);
    this.blip(139, "sawtooth", 0.5, 0.1, 0.12, 70);
  }
  lockTick() { this.blip(3000, "square", 0.02, 0.05); }
  /** A short, weighty "thunk" — a press of pressure landing on a suspect. */
  press() {
    this.blip(160, "sine", 0.22, 0.16, 0, 70);
    this.noiseHit(0.5, 0.06, 220);
  }
  /** A soft, low exhale — the suspect steadies themselves after you hesitate. */
  steady() {
    this.blip(220, "sine", 0.5, 0.06, 0, 120);
    this.blip(180, "sine", 0.5, 0.05, 0.05, 100);
  }
  /** A tense two-beat heartbeat thump for quick-time prompts — a deep, muted
   * "lub-dub" that reads as a pulse rather than a sting. Each beat is a soft
   * low sine thump followed by a quieter one, so it feels like a heart under
   * pressure instead of a warning bell. Routed through the sfx bus. */
  heartbeat() {
    const ctx = this.ensure();
    if (!ctx || !this.buses.sfx) return;
    const bus = this.buses.sfx; // capture so the inner closure stays typed
    const t0 = ctx.currentTime + 0.02;
    const thump = (at: number, freq: number, vol: number, dur: number) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(freq, at);
      o.frequency.exponentialRampToValueAtTime(Math.max(28, freq * 0.6), at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g).connect(bus);
      o.start(at);
      o.stop(at + dur + 0.05);
    };
    thump(t0, 72, 0.28, 0.22);          // "lub"
    thump(t0 + 0.17, 58, 0.2, 0.26);    // "dub"
  }
  /** A deep, low rolling thunder rumble for the storm. Built so it reads as
   * distant thunder rather than a single clap: a soft low thud for the onset, a
   * sub-bass pressure swell, a low-passed noise bed whose filter and volume are
   * slowly wobbled by LFOs (the "rolling" texture), and one to four delayed,
   * quieter rumbles rolling in behind it. Every parameter — intensity, length,
   * frequencies, LFO rates, the number of aftershocks — is randomized per
   * strike, so no two rolls sound the same. Routed through the sfx bus so the
   * Effects mixer controls it. */
  thunder() {
    const ctx = this.ensure();
    if (!ctx || !this.buses.sfx) return;
    const t0 = ctx.currentTime + 0.05;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    // Per-strike intensity — every roll lands at a different volume.
    const strength = rand(0.45, 0.95);
    // One long rolling rumble, 3–6 seconds.
    const rumbleDur = rand(3, 6);

    // 1) Soft low onset — a short burst of dark noise (not a bright crack).
    {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoise(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(rand(120, 220), t0);
      lp.frequency.exponentialRampToValueAtTime(rand(60, 90), t0 + 0.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(rand(0.2, 0.36) * strength, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      src.connect(lp).connect(g).connect(this.buses.sfx);
      src.start(t0);
      src.stop(t0 + 0.55);
    }

    // 2) Sub-bass pressure body — a sine that sinks slowly, swelling then fading.
    {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(rand(64, 80), t0);
      o.frequency.exponentialRampToValueAtTime(rand(24, 30), t0 + rumbleDur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(rand(0.26, 0.4) * strength, t0 + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + rumbleDur);
      o.connect(g).connect(this.buses.sfx);
      o.start(t0);
      o.stop(t0 + rumbleDur + 0.1);
    }

    // 3) Rolling low rumble bed — low-passed noise whose filter frequency and
    //    volume are wobbled by slow LFOs, so it swells in waves.
    {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoise(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(rand(140, 220), t0);
      lp.frequency.exponentialRampToValueAtTime(rand(38, 60), t0 + rumbleDur);
      // Filter wobble — the slow "rolling" motion of the rumble.
      const filterLfo = ctx.createOscillator();
      filterLfo.frequency.value = rand(0.25, 0.7);
      const filterLfoG = ctx.createGain();
      filterLfoG.gain.value = rand(25, 60);
      filterLfo.connect(filterLfoG).connect(lp.frequency);
      filterLfo.start(t0);
      filterLfo.stop(t0 + rumbleDur);
      // Volume envelope + a slow amplitude wobble that fades with the rumble.
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(rand(0.3, 0.48) * strength, t0 + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + rumbleDur);
      const ampLfo = ctx.createOscillator();
      ampLfo.frequency.value = rand(0.2, 0.5);
      const ampLfoG = ctx.createGain();
      ampLfoG.gain.setValueAtTime(0.0001, t0);
      ampLfoG.gain.linearRampToValueAtTime(rand(0.04, 0.1) * strength, t0 + 0.3);
      ampLfoG.gain.setValueAtTime(rand(0.04, 0.1) * strength, t0 + rumbleDur - 0.4);
      ampLfoG.gain.linearRampToValueAtTime(0.0001, t0 + rumbleDur);
      ampLfo.connect(ampLfoG).connect(g.gain);
      ampLfo.start(t0);
      ampLfo.stop(t0 + rumbleDur);
      src.connect(lp).connect(g).connect(this.buses.sfx);
      src.start(t0);
      src.stop(t0 + rumbleDur + 0.05);
    }

    // 4) Rolling aftershocks — 1–4 delayed low rumbles behind the main one.
    const aftershocks = Math.floor(rand(1, 5));
    for (let i = 0; i < aftershocks; i++) {
      const delay = 0.4 + rand(0.2, 0.6) + i * rand(0.5, 1.1);
      const dur = rand(1.6, 3.2);
      const src = ctx.createBufferSource();
      src.buffer = this.getNoise(ctx);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(rand(90, 150), t0 + delay);
      lp.frequency.exponentialRampToValueAtTime(rand(32, 48), t0 + delay + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + delay);
      g.gain.exponentialRampToValueAtTime(rand(0.08, 0.2) * strength, t0 + delay + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
      src.connect(lp).connect(g).connect(this.buses.sfx);
      src.start(t0 + delay);
      src.stop(t0 + delay + dur + 0.05);
    }
  }
  unlockClunk() {
    this.noiseHit(0.2, 0.16, 900);
    this.blip(180, "square", 0.18, 0.12, 0.03, 120);
  }
  dialTurn() { this.blip(2400, "square", 0.015, 0.03); }
  stringSnap() { this.blip(660, "triangle", 0.14, 0.12, 0, 220); }

  /* ------------------------- ambience ------------------------- */

  setAmbient(id: string | null) {
    if (id === this.ambientId && this.ambientHandle) return;
    this.ambientId = id;
    this.applyAmbient();
  }

  /** Build/teardown the ambient graph against the current `ambientId`. No-ops
   * until the AudioContext exists (i.e. after the first user gesture). */
  private applyAmbient() {
    const id = this.ambientId;
    const ctx = this.ensure();
    if (!ctx || !this.buses.ambient) return;
    if (this.ambientHandle) {
      const old = this.ambientHandle;
      old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.6);
      window.setTimeout(() => old.stop(), 2200);
      this.ambientHandle = null;
    }
    if (!id || id === "none") return;
    const handle = this.buildAmbient(ctx, id);
    if (handle) {
      handle.gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      handle.gain.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
      this.ambientHandle = handle;
    }
  }

  private buildAmbient(ctx: AudioContext, id: string): { gain: GainNode; stop: () => void } | null {
    const bus = this.buses.ambient!;
    const out = ctx.createGain();
    out.connect(bus);
    const stops: (() => void)[] = [];
    const t = ctx.currentTime;

    const noise = (freq: number, q: number, vol: number, type: BiquadFilterType = "bandpass") => {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoise(ctx);
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(out);
      src.start(t);
      stops.push(() => { try { src.stop(); } catch { /* noop */ } });
      return { f, g };
    };
    const tone = (freq: number, type: OscillatorType, vol: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = vol;
      o.connect(g).connect(out);
      o.start(t);
      stops.push(() => { try { o.stop(); } catch { /* noop */ } });
      return { o, g };
    };
    const lfo = (rate: number, depth: number, target: AudioParam) => {
      const o = ctx.createOscillator();
      o.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(target);
      o.start(t);
      stops.push(() => { try { o.stop(); } catch { /* noop */ } });
    };

    switch (id) {
      case "rain": {
        const r = noise(1400, 0.4, 0.16);
        lfo(0.11, 300, r.f.frequency);
        noise(240, 0.6, 0.1, "lowpass");
        break;
      }
      case "jazz": {
        const chord = [110, 130.81, 164.81, 196];
        chord.forEach((f, i) => {
          const v = tone(f, "triangle", 0.028, i % 2 ? 4 : -3);
          lfo(0.07 + i * 0.013, 0.012, v.g.gain);
        });
        noise(4200, 0.3, 0.012, "highpass"); // vinyl hiss
        break;
      }
      case "drone": {
        const a = tone(55, "sine", 0.09);
        tone(58, "sine", 0.07);
        lfo(0.05, 4, a.o.frequency);
        break;
      }
      case "tension": {
        const s = tone(65.4, "sawtooth", 0.05);
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 300;
        s.g.disconnect();
        s.g.connect(f).connect(out);
        lfo(0.09, 180, f.frequency);
        tone(98, "sine", 0.045, 6);
        break;
      }
      default:
        return null;
    }
    return { gain: out, stop: () => stops.forEach((fn) => fn()) };
  }

  /* ------------------------- narration ------------------------- */

  speak(text: string, persona?: string, override?: { voiceName?: string; pitch?: number; rate?: number }) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (this.volumes.voice <= 0.01) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const personaHash = persona ? [...persona].reduce((sum, char) => sum + char.charCodeAt(0), 0) : 0;
    u.rate = override?.rate ?? 0.88;
    u.pitch = override?.pitch ?? (persona ? 0.72 + (personaHash % 5) * 0.08 : 0.72);
    u.volume = Math.min(1, this.volumes.voice * this.volumes.master);
    const voices = window.speechSynthesis.getVoices();
    const english = voices.filter((v) => v.lang.startsWith("en"));
    const narrator =
      voices.find((v) => /samantha|victoria|zira|aria|jenny/i.test(v.name)) ??
      english[0];
    const chosen = override?.voiceName ? voices.find((v) => v.name === override.voiceName) : undefined;
    const pick = chosen ?? (persona && english.length ? english[personaHash % english.length] : narrator);
    if (pick) u.voice = pick;
    window.speechSynthesis.speak(u);
  }

  /** Play a pre-recorded MP3 voice line (overrides TTS when set on a beat). */
  private clip: HTMLAudioElement | null = null;
  /**
   * A prose clip whose play() was rejected by the autoplay policy. Kept armed
   * so the next real user gesture (unlock() on any pointerdown) can retry it —
   * a narration blocked at scene entry used to be silently unrecoverable.
   * Cleared by stopSpeech() so a deliberate dismissal (Continue) always wins
   * over a pending retry.
   */
  private pendingNarration: { el: HTMLAudioElement; retrying: boolean } | null = null;

  private clearPendingNarration() {
    this.pendingNarration = null;
  }

  private retryPendingNarration() {
    const pending = this.pendingNarration;
    if (!pending || pending.retrying) return;
    pending.retrying = true;
    const el = pending.el;
    el.volume = Math.min(1, this.volumes.voice * this.volumes.master);
    // CRITICAL: this runs synchronously inside the user gesture (unlock() is
    // called from a pointerdown). Retrying via a setTimeout would call play()
    // outside the activation window and be blocked again — transient
    // activation only covers the current event dispatch, not timers.
    void el
      .play()
      .then(() => {
        if (this.clip === el) this.clearPendingNarration();
      })
      .catch((err) => {
        const name = (err as DOMException | undefined)?.name;
        if (name === "NotAllowedError" || name === "AbortError") {
          // Still blocked — stay armed for the next gesture.
          if (this.pendingNarration === pending) pending.retrying = false;
        } else {
          // Not an autoplay problem: give up on this clip.
          if (this.clip === el) this.clip = null;
          this.clearPendingNarration();
          console.warn("Recorded narration still couldn't be played.", err);
        }
      });
  }

  playClip(url: string, prepared?: HTMLAudioElement): Promise<boolean> {
    this.stopSpeech();
    const a = prepared ?? new Audio(assetUrl(url));
    a.preload = "auto";
    a.volume = Math.min(1, this.volumes.voice * this.volumes.master);
    this.clip = a;
    // Opening prose can be "primed" inside the user's Play click. If it is
    // already running by the time the scene mounts, adopt it instead of
    // restarting it — restarting would make the first words stutter or replay.
    if (!a.paused && !a.ended) return Promise.resolve(true);
    if (a.ended) a.currentTime = 0;
    return a
      .play()
      .then(() => {
        // An earlier blocked attempt for this same clip is now obsolete.
        if (this.clip === a) this.clearPendingNarration();
        return true;
      })
      .catch((err) => {
        // Don't fail silently: a missing file or a browser autoplay block used
        // to look exactly like "the prose audio didn't play". Keep the UI calm,
        // but leave a useful breadcrumb in dev tools.
        const name = (err as DOMException | undefined)?.name;
        if (this.clip === a) {
          if (name === "NotAllowedError" || name === "AbortError") {
            // Autoplay policy: keep the clip armed so the next real user
            // gesture (unlock() on any pointerdown) can retry it.
            this.pendingNarration = { el: a, retrying: false };
          } else {
            this.clip = null;
          }
        }
        console.warn("Recorded narration couldn't be played.", err);
        return false;
      });
  }

  stopSpeech() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    // A pending autoplay retry belongs to the clip being dismissed — cancel it
    // so an old narration can't start after the player moved on.
    this.clearPendingNarration();
    if (this.clip) {
      this.clip.pause();
      this.clip = null;
    }
  }
}

export const audio = new AudioEngine();
