import {
  EQ_BANDS,
  EQ_PEAKING_Q,
  normalizeEqGains,
} from "./eqBands";

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ??
    null
  );
}

class MusicAudioEngine {
  private el: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private normGain: GainNode | null = null;
  private volGain: GainNode | null = null;

  private graphReady = false;
  private webAudioFailed = false;

  private volume = 1;
  private muted = false;
  private eqEnabled = false;
  private eqGains: number[] = normalizeEqGains(null);
  private normalizationEnabled = true;
  private loudnessDb: number | null = null;

  // --- lifecycle ----------------------------------------------------------

  /** Bind the single hidden <audio> element. Safe to call again on HMR. */
  attach(el: HTMLAudioElement): void {
    if (this.el === el) return;
    this.el = el;
    // Required for WebAudio to receive (non-silent) cross-origin samples.
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    // Rebuild the graph lazily on the next play()
    this.graphReady = false;
    this.sourceNode = null;
    this.applyGain();
  }

  private ensureGraph(): void {
    if (this.graphReady || this.webAudioFailed || !this.el) return;
    try {
      const Ctor = getAudioContextCtor();
      if (!Ctor) {
        this.webAudioFailed = true;
        return;
      }
      if (!this.ctx) this.ctx = new Ctor();

      this.sourceNode = this.ctx.createMediaElementSource(this.el);

      this.filters = EQ_BANDS.map((band) => {
        const f = this.ctx!.createBiquadFilter();
        f.type = band.type;
        f.frequency.value = band.frequency;
        f.Q.value = EQ_PEAKING_Q;
        f.gain.value = 0;
        return f;
      });

      this.normGain = this.ctx.createGain();
      this.volGain = this.ctx.createGain();

      let node: AudioNode = this.sourceNode;
      for (const f of this.filters) {
        node.connect(f);
        node = f;
      }
      node.connect(this.normGain);
      this.normGain.connect(this.volGain);
      this.volGain.connect(this.ctx.destination);

      this.graphReady = true;
      this.applyGain();
      this.applyEq();
    } catch (err) {
      console.warn(
        "[musicAudioEngine] WebAudio graph unavailable — degrading to element volume",
        err,
      );
      this.webAudioFailed = true;
      this.applyGain();
    }
  }

  // --- transport ----------------------------------------------------------

  async load(url: string): Promise<void> {
    if (!this.el) return;
    this.el.src = url;
    try {
      this.el.load();
    } catch {
    }
  }

  async play(): Promise<void> {
    if (!this.el) return;
    this.ensureGraph();
    if (this.ctx && this.ctx.state === "suspended") {
      try {
        await this.ctx.resume();
      } catch {
      }
    }
    try {
      await this.el.play();
    } catch (err) {
      console.warn("[musicAudioEngine] play() rejected", err);
    }
  }

  pause(): void {
    this.el?.pause();
  }

  seek(seconds: number): void {
    if (this.el && Number.isFinite(seconds)) {
      this.el.currentTime = Math.max(0, seconds);
    }
  }

  getCurrentTime(): number {
    return this.el?.currentTime ?? 0;
  }

  getDuration(): number {
    const d = this.el?.duration ?? 0;
    return Number.isFinite(d) ? d : 0;
  }

  // --- gain (volume + loudness normalization) -----------------------------

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  setLoudness(loudnessDb: number | null, enabled: boolean): void {
    this.loudnessDb = loudnessDb;
    this.normalizationEnabled = enabled;
    this.applyGain();
  }

  private normalizationFactor(): number {
    if (!this.normalizationEnabled || this.loudnessDb == null) return 1;
    return Math.min(1, Math.pow(10, -this.loudnessDb / 20));
  }

  private applyGain(): void {
    const norm = this.normalizationFactor();
    const vol = this.muted ? 0 : this.volume;

    if (this.graphReady && this.ctx && this.normGain && this.volGain) {
      const t = this.ctx.currentTime;
      this.normGain.gain.setTargetAtTime(norm, t, 0.012);
      this.volGain.gain.setTargetAtTime(vol, t, 0.012);
      if (this.el) {
        this.el.volume = 1;
        this.el.muted = false;
      }
    } else if (this.el) {
      this.el.volume = Math.max(0, Math.min(1, vol * norm));
      this.el.muted = this.muted;
    }
  }

  // --- equalizer ----------------------------------------------------------

  setEqEnabled(enabled: boolean): void {
    this.eqEnabled = enabled;
    this.applyEq();
  }

  setEqGains(gains: number[]): void {
    this.eqGains = normalizeEqGains(gains);
    this.applyEq();
  }

  setEqBand(index: number, gainDb: number): void {
    if (index < 0 || index >= this.eqGains.length) return;
    const next = [...this.eqGains];
    next[index] = gainDb;
    this.eqGains = normalizeEqGains(next);
    this.applyEq();
  }

  private applyEq(): void {
    if (!this.graphReady || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.filters.forEach((f, i) => {
      const g = this.eqEnabled ? this.eqGains[i] ?? 0 : 0;
      f.gain.setTargetAtTime(g, t, 0.012);
    });
  }
}

// Module singleton — survives route changes (lives outside the React tree).
export const musicAudioEngine = new MusicAudioEngine();
