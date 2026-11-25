/** Tiny WebAudio synth for game sounds. No audio files needed. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private master: GainNode | null = null;
  enabled = true;
  private last = new Map<string, number>();

  /** for the Settings "Test sound" readout */
  get state(): string {
    return this.ctx ? this.ctx.state : "not started";
  }
  onState: (() => void) | null = null;

  /**
   * Create / resume audio. iOS only lets this work inside a real user gesture that ends a tap
   * (touchend, pointerup, click, keydown), not touchstart/pointerdown, so call it from those
   * on every gesture until the context is running. Cheap when already running.
   */
  unlock() {
    // iOS 17+: route as media playback so the ring/silent switch doesn't mute the game
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    try {
      if (nav.audioSession && nav.audioSession.type !== "playback") nav.audioSession.type = "playback";
    } catch {
      /* not supported */
    }
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.ctx.onstatechange = () => this.onState?.();
    }
    const c = this.ctx;
    if (c.state !== "running") {
      // "suspended" or iOS's "interrupted" (backgrounded, a call, Siri)
      void c.resume().then(() => this.onState?.()).catch(() => {});
      // a silent buffer started inside the gesture is what actually unlocks older iOS
      const b = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = b;
      src.connect(c.destination);
      src.start(0);
    }
  }

  /** Called when the page is hidden / shown. */
  visibility(visible: boolean) {
    if (!visible) return;
    if (this.ctx && this.ctx.state !== "running") void this.ctx.resume().catch(() => {});
  }

  /** Settings "Test sound": unlock (we're inside the tap) and play a short chime even if sound is off. */
  test(): string {
    this.unlock();
    if (!this.ctx) return "This browser has no Web Audio.";
    const go = () => {
      this.tone(523, 0.18, "triangle", 0.5);
      this.tone(659, 0.18, "triangle", 0.5, 0, 0.12);
      this.tone(784, 0.3, "triangle", 0.5, 0, 0.24);
    };
    if (this.ctx.state === "running") go();
    else void this.ctx.resume().then(go).catch(() => {});
    return this.ctx.state;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private hiss(dur: number, vol: number, freq: number, q = 1, type: BiquadFilterType = "bandpass", slide = 0, delay = 0) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t);
    s.stop(t + dur + 0.02);
  }

  play(name: string) {
    if (!this.enabled || !this.ctx) return;
    if (this.ctx.state !== "running") {
      void this.ctx.resume().catch(() => {});
      return;
    }
    const now = performance.now();
    const min = name === "hit" || name === "gold" ? 40 : 60;
    if (now - (this.last.get(name) ?? 0) < min) return;
    this.last.set(name, now);
    switch (name) {
      case "swing":
        this.hiss(0.16, 0.25, 900, 0.8, "bandpass", 2.5);
        break;
      case "hit":
        this.tone(140, 0.12, "square", 0.18, 0.4);
        this.hiss(0.08, 0.3, 1800, 1);
        break;
      case "crit":
        this.tone(110, 0.2, "sawtooth", 0.22, 0.3);
        this.hiss(0.12, 0.35, 2500, 1);
        break;
      case "miss":
        this.hiss(0.1, 0.12, 2400, 2);
        break;
      case "whiff":
        this.hiss(0.1, 0.08, 600, 2);
        break;
      case "hurt":
        this.tone(220, 0.15, "sawtooth", 0.18, 0.5);
        break;
      case "die_zombie":
        this.tone(90, 0.5, "sawtooth", 0.2, 0.4);
        this.hiss(0.3, 0.15, 400, 1, "lowpass");
        break;
      case "die_fallen":
        this.tone(520, 0.25, "square", 0.12, 0.35);
        break;
      case "drop":
        this.tone(1200, 0.08, "triangle", 0.15);
        this.tone(900, 0.12, "triangle", 0.12, 1, 0.06);
        break;
      case "gold":
        this.tone(1600, 0.06, "square", 0.08);
        this.tone(2100, 0.08, "square", 0.07, 1, 0.05);
        break;
      case "pickup":
      case "equip":
        this.tone(400, 0.08, "triangle", 0.2, 1.6);
        break;
      case "potion":
        for (let i = 0; i < 3; i++) this.tone(300 + i * 60, 0.09, "sine", 0.18, 1.4, i * 0.08);
        break;
      case "levelup":
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, "triangle", 0.18, 1, i * 0.1));
        break;
      case "learn":
        this.tone(660, 0.15, "triangle", 0.18, 1.5);
        break;
      case "leap":
        this.hiss(0.3, 0.2, 500, 0.8, "bandpass", 3);
        break;
      case "land":
        this.tone(70, 0.3, "sine", 0.4, 0.5);
        this.hiss(0.2, 0.25, 300, 1, "lowpass");
        break;
      case "howl":
        this.tone(160, 0.6, "sawtooth", 0.2, 1.8);
        this.tone(120, 0.6, "sawtooth", 0.15, 2);
        break;
      case "shout":
        this.tone(200, 0.4, "sawtooth", 0.2, 1.4);
        break;
      case "nomana":
        this.tone(160, 0.12, "square", 0.08);
        break;
      case "boss":
        this.tone(60, 1.2, "sawtooth", 0.3, 0.5);
        break;
      case "boss_aggro":
        this.tone(80, 0.8, "sawtooth", 0.25, 0.7);
        break;
      case "stairs":
        this.hiss(0.6, 0.2, 300, 1, "lowpass", 0.3);
        break;
      case "death":
        this.tone(200, 1.2, "sawtooth", 0.25, 0.25);
        break;
      case "click":
        this.tone(800, 0.04, "square", 0.06);
        break;
      case "shoot":
        this.hiss(0.12, 0.14, 2600, 1.4, "bandpass", 3);
        break;
      case "bolt":
        this.tone(700, 0.18, "sawtooth", 0.1, 0.5);
        this.hiss(0.15, 0.12, 1400, 1);
        break;
      case "explode":
        this.tone(55, 0.5, "sawtooth", 0.3, 0.4);
        this.hiss(0.45, 0.35, 500, 1, "lowpass");
        break;
      case "nova_warn":
        this.tone(180, 0.7, "triangle", 0.14, 2.2);
        break;
      case "nova":
        this.tone(90, 0.6, "sawtooth", 0.25, 0.4);
        this.hiss(0.5, 0.3, 900, 1, "lowpass");
        break;
      case "charge":
        this.tone(110, 0.4, "sawtooth", 0.18, 1.8);
        this.hiss(0.3, 0.15, 700, 0.8);
        break;
      case "summon":
        this.tone(240, 0.5, "triangle", 0.15, 0.5);
        break;
      case "artifact":
        [392, 523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.5, "triangle", 0.16, 1, i * 0.09));
        break;
      case "poison":
        this.tone(300, 0.2, "sine", 0.1, 0.6);
        break;
      case "chill":
        this.tone(1400, 0.2, "triangle", 0.08, 0.6);
        break;
    }
  }
}

