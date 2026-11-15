/**
 * Audio engine — every sound is synthesised with the Web Audio API
 * (no audio files to download). Buses: sfx, ambient (wind/breathing/
 * rover engine) and music (generative ambient pad). Narration uses the
 * Web Speech API when enabled.
 */
import { emit } from './events.js';
import { getSettings } from './settings.js';

class AudioEngine {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.buses = {};
    this.noise = null;
    this.lastTick = 0;
    this.wind = null;
    this.breath = null;
    this.engine = null;
    this.music = null;
    this.musicWanted = false;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const master = this.ctx.createGain();
    master.connect(this.ctx.destination);
    this.buses.master = master;
    for (const name of ['sfx', 'ambient', 'music']) {
      const g = this.ctx.createGain();
      g.connect(master);
      this.buses[name] = g;
    }
    this.noise = this.createNoiseBuffer();
    this.applySettings();
    if (this.musicWanted) this.startMusic();
  }

  get ready() {
    return !!this.ctx;
  }

  applySettings(s = getSettings()) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.buses.master.gain.setTargetAtTime(s.muted ? 0 : s.masterVolume, now, 0.05);
    this.buses.sfx.gain.setTargetAtTime(s.sfxVolume, now, 0.05);
    this.buses.ambient.gain.setTargetAtTime(s.ambientVolume, now, 0.05);
    this.buses.music.gain.setTargetAtTime(s.musicVolume * 0.6, now, 0.05);
  }

  createNoiseBuffer() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  caption(key) {
    if (getSettings().soundCaptions) emit('sound:caption', key);
  }

  /** Short envelope-shaped oscillator blip. */
  blip({ freq = 880, endFreq = freq, type = 'sine', dur = 0.08, gain = 0.06, delay = 0, bus = 'sfx' } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.buses[bus]);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** Filtered noise burst. */
  burst({ freq = 800, q = 1, dur = 0.12, gain = 0.08, type = 'bandpass', bus = 'sfx', delay = 0 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.buses[bus]);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  /* ---------- UI / feedback ---------- */
  typeTick() {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastTick < 45) return; // rate limit: max ~22 ticks/s
    this.lastTick = now;
    this.blip({ freq: 1500 + Math.random() * 500, endFreq: 350, type: 'triangle', dur: 0.022, gain: 0.025 });
  }

  ui() {
    this.blip({ freq: 660, endFreq: 990, type: 'sine', dur: 0.06, gain: 0.04 });
  }

  step(sprint = false) {
    this.burst({ freq: sprint ? 520 : 380, q: 0.8, dur: 0.09, gain: sprint ? 0.06 : 0.04, type: 'lowpass' });
  }

  land() {
    this.burst({ freq: 240, q: 0.7, dur: 0.22, gain: 0.09, type: 'lowpass' });
  }

  collect() {
    [880, 1175, 1568].forEach((f, i) => this.blip({ freq: f, type: 'sine', dur: 0.25, gain: 0.05, delay: i * 0.08 }));
    this.caption('caption.collect');
  }

  progressTick(p) {
    this.blip({ freq: 400 + p * 600, type: 'square', dur: 0.03, gain: 0.015 });
  }

  success() {
    [523, 659, 784, 1047].forEach((f, i) => this.blip({ freq: f, type: 'triangle', dur: 0.4, gain: 0.05, delay: i * 0.12 }));
    this.caption('caption.success');
  }

  fail() {
    [392, 330, 262].forEach((f, i) => this.blip({ freq: f, type: 'sawtooth', dur: 0.35, gain: 0.04, delay: i * 0.18 }));
    this.caption('caption.fail');
  }

  alarm(critical = false) {
    const n = critical ? 3 : 2;
    for (let i = 0; i < n; i++) this.blip({ freq: 880, endFreq: 620, type: 'square', dur: 0.16, gain: 0.04, delay: i * 0.22 });
    this.caption(critical ? 'caption.o2Critical' : 'caption.o2Low');
  }

  achievement() {
    [784, 988, 1319].forEach((f, i) => this.blip({ freq: f, type: 'sine', dur: 0.3, gain: 0.05, delay: i * 0.1 }));
    this.caption('caption.achievement');
  }

  shutter() {
    this.burst({ freq: 3000, q: 2, dur: 0.05, gain: 0.08, type: 'highpass' });
    this.burst({ freq: 2000, q: 2, dur: 0.06, gain: 0.06, type: 'highpass', delay: 0.07 });
    this.caption('caption.photo');
  }

  /* ---------- Continuous ambient layers ---------- */
  startWind() {
    if (!this.ctx || this.wind) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(filter.frequency);
    src.connect(filter).connect(g).connect(this.buses.ambient);
    src.start();
    lfo.start();
    this.wind = { src, filter, g, lfo };
    this.setWind(0.25);
    this.caption('caption.wind');
  }

  /** @param {number} level 0..1 */
  setWind(level) {
    if (!this.wind) return;
    const now = this.ctx.currentTime;
    this.wind.g.gain.setTargetAtTime(0.03 + level * 0.16, now, 0.8);
    this.wind.filter.frequency.setTargetAtTime(300 + level * 700, now, 0.8);
  }

  stopWind() {
    if (!this.wind) return;
    const { src, lfo, g } = this.wind;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    setTimeout(() => {
      try {
        src.stop();
        lfo.stop();
      } catch {
        /* already stopped */
      }
    }, 800);
    this.wind = null;
  }

  /** Suit breathing loop; rate in breaths per minute. */
  setBreathing(active, rate = 14) {
    if (!this.ctx) return;
    if (!active) {
      if (this.breath) clearInterval(this.breath.timer);
      this.breath = null;
      return;
    }
    const period = 60000 / rate;
    if (this.breath && Math.abs(this.breath.period - period) < 200) return;
    if (this.breath) clearInterval(this.breath.timer);
    const breathe = () => {
      this.burst({ freq: 900, q: 0.5, dur: period / 2600, gain: 0.018, type: 'bandpass', bus: 'ambient' });
      this.burst({ freq: 600, q: 0.5, dur: period / 2200, gain: 0.014, type: 'bandpass', bus: 'ambient', delay: period / 2000 });
    };
    breathe();
    this.breath = { period, timer: setInterval(breathe, period) };
  }

  /** Rover electric motor hum; speed01 0..1, null stops it. */
  setEngine(speed01) {
    if (!this.ctx) return;
    if (speed01 == null) {
      if (this.engine) {
        this.engine.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        const e = this.engine;
        setTimeout(() => {
          try {
            e.osc.stop();
          } catch {
            /* ignore */
          }
        }, 500);
        this.engine = null;
      }
      return;
    }
    if (!this.engine) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      osc.connect(filter).connect(g).connect(this.buses.ambient);
      osc.start();
      this.engine = { osc, g };
    }
    const now = this.ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime(60 + speed01 * 120, now, 0.1);
    this.engine.g.gain.setTargetAtTime(0.012 + speed01 * 0.03, now, 0.1);
  }

  /* ---------- Generative music pad (menu / orbit) ---------- */
  startMusic() {
    this.musicWanted = true;
    if (!this.ctx || this.music) return;
    const chords = [
      [146.83, 220, 277.18, 329.63],
      [130.81, 196, 261.63, 311.13],
      [110, 164.81, 220, 277.18],
      [123.47, 185, 246.94, 293.66],
    ];
    const g = this.ctx.createGain();
    g.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    g.connect(filter).connect(this.buses.music);
    const oscs = chords[0].map((f) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const og = this.ctx.createGain();
      og.gain.value = 0.05;
      o.connect(og).connect(g);
      o.start();
      return o;
    });
    g.gain.setTargetAtTime(0.5, this.ctx.currentTime, 2);
    let idx = 0;
    const timer = setInterval(() => {
      idx = (idx + 1) % chords.length;
      const now = this.ctx.currentTime;
      oscs.forEach((o, i) => o.frequency.setTargetAtTime(chords[idx][i], now, 1.5));
    }, 9000);
    this.music = { g, oscs, timer };
  }

  stopMusic() {
    this.musicWanted = false;
    if (!this.music) return;
    const { g, oscs, timer } = this.music;
    clearInterval(timer);
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
    setTimeout(() => oscs.forEach((o) => o.stop()), 2500);
    this.music = null;
  }

  /* ---------- Narration (Web Speech API) ---------- */
  speak(text, lang) {
    const s = getSettings();
    if (!s.narration || s.muted || !('speechSynthesis' in window)) return;
    this.stopSpeech();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'pt' ? 'pt-BR' : 'en-US';
    u.rate = 1;
    u.volume = Math.min(1, s.masterVolume);
    const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase()));
    if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  }

  stopSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }

  /** Silence every continuous layer (used when leaving the surface). */
  stopSurfaceLayers() {
    this.stopWind();
    this.setBreathing(false);
    this.setEngine(null);
    this.stopSpeech();
  }
}

export const audio = new AudioEngine();
