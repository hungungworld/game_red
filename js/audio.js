// 모든 소리는 WebAudio로 합성합니다. 외부 음원 파일이 없어 첫 로딩이 가볍습니다.
const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// D 단조 ii-V 계열 워킹 베이스 (마디당 4분음표 4개)
const BASS = [
  [38, 41, 45, 42],
  [43, 46, 50, 41],
  [40, 43, 46, 44],
  [45, 49, 52, 39],
];
const CHORDS = [
  [53, 57, 60, 64],
  [53, 58, 62, 65],
  [50, 55, 58, 62],
  [55, 61, 64, 67],
];

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.tempo = 76;
    this.playing = false;
    this.timer = null;
    this.hum = null;
  }

  unlock() {
    if (!AC) return;
    if (!this.ctx) {
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.enabled ? 0.9 : 0;
      this.master.connect(c.destination);
      this.music = c.createGain();
      this.music.gain.value = 0.5;
      this.music.connect(this.master);
      this.sfx = c.createGain();
      this.sfx.gain.value = 0.9;
      this.sfx.connect(this.master);
      const len = c.sampleRate;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ok() { return !!this.ctx && this.enabled; }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  _noise(t, dur, { type = 'bandpass', freq = 3000, to, q = 1, gain = 0.2, attack = 0.002, bus } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
    f.Q.value = q;
    const g = c.createGain();
    this._env(g, t, attack, gain, dur);
    src.connect(f).connect(g).connect(bus || this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + dur + 0.05);
  }

  _tone(t, freq, dur, { type = 'sine', gain = 0.2, attack = 0.004, to, bus, lp } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
    const g = c.createGain();
    this._env(g, t, attack, gain, dur);
    let node = o;
    if (lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      node = o.connect(f);
    }
    node.connect(g).connect(bus || this.sfx);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  // ---------- 음악: 콘트라베이스와 브러시 드럼의 느린 재즈 ----------
  startMusic() {
    if (!this.ctx || this.playing) return;
    this.playing = true;
    this.beat = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    this.music.gain.cancelScheduledValues(this.ctx.currentTime);
    this.music.gain.setValueAtTime(0.5, this.ctx.currentTime);
    this.timer = setInterval(() => this._sched(), 25);
  }

  stopMusic(fade = 0.6) {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.music.gain.setTargetAtTime(0.0001, t, fade / 3);
      this.music.gain.setValueAtTime(0.5, t + fade + 0.4);
    }
  }

  _sched() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const spb = 60 / this.tempo;
    if (this.nextT < this.ctx.currentTime - 0.2) this.nextT = this.ctx.currentTime + 0.05;
    while (this.nextT < this.ctx.currentTime + 0.15) {
      this._beat(this.beat, this.nextT, spb);
      this.nextT += spb;
      this.beat++;
    }
  }

  _beat(b, t, spb) {
    const bar = Math.floor(b / 4) % 4;
    const q = b % 4;
    const m = this.music;
    // 콘트라베이스
    const n = BASS[bar][q];
    this._tone(t, midi(n), spb * 0.85, { type: 'triangle', gain: 0.32, attack: 0.008, bus: m, lp: 520 });
    this._tone(t, midi(n), spb * 0.4, { type: 'sine', gain: 0.16, attack: 0.004, bus: m });
    // 브러시 스윕과 스네어 터치
    this._noise(t, spb * 0.55, { freq: 2600, q: 0.5, gain: 0.03, attack: 0.04, bus: m });
    if (q === 1 || q === 3) this._noise(t, 0.09, { freq: 1900, q: 0.8, gain: 0.07, bus: m });
    // 라이드 (스윙)
    this._noise(t, 0.05, { type: 'highpass', freq: 7000, gain: 0.025, bus: m });
    if (q === 1 || q === 3) this._noise(t + spb * 0.66, 0.04, { type: 'highpass', freq: 7500, gain: 0.018, bus: m });
    // 두 마디에 한 번 낮은 화음
    if (q === 0 && bar % 2 === 0) {
      for (const cn of CHORDS[bar]) this._tone(t + 0.01, midi(cn), spb * 2.4, { gain: 0.018, attack: 0.03, bus: m });
    }
  }

  // ---------- 효과음 ----------
  tick(prox = 0, kind = 'pulse') {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const g = kind === 'move' ? 0.05 + prox * 0.12 : 0.06 + prox * 0.22;
    this._noise(t, 0.012, { freq: 4200 + prox * 2600, q: 3, gain: g });
    this._tone(t, 2400 + prox * 900, 0.015, { gain: g * 0.3 });
  }

  clunk() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 92, 0.28, { to: 52, gain: 0.55 });
    this._noise(t, 0.08, { type: 'lowpass', freq: 500, gain: 0.35 });
    this._noise(t, 0.02, { freq: 1300, q: 2, gain: 0.3 });
  }

  hit() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 150, 0.32, { to: 70, gain: 0.3 });
    this._noise(t, 0.25, { type: 'lowpass', freq: 600, gain: 0.12 });
  }

  warn() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 110, 0.08, { gain: 0.16 });
    this._tone(t + 0.12, 110, 0.08, { gain: 0.12 });
  }

  bell(i = 0) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const f = 523 * [1, 1.26, 1.5, 1.89, 2][i % 5];
    this._tone(t, f, 1.6, { gain: 0.1, attack: 0.005 });
    this._tone(t, f * 2.76, 0.7, { gain: 0.03, attack: 0.005 });
  }

  swish() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.32, { freq: 800, to: 2800, q: 0.7, gain: 0.16, attack: 0.05 });
  }

  chime() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 1318.5, 1.3, { gain: 0.06 });
    this._tone(t + 0.07, 1975.5, 1.1, { gain: 0.045 });
  }

  slow() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._tone(t, 62, 0.7, { gain: 0.22, attack: 0.05 });
    this._noise(t, 0.6, { type: 'lowpass', freq: 1800, to: 200, gain: 0.08, attack: 0.05 });
  }

  door() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 1.3, { type: 'lowpass', freq: 260, gain: 0.3, attack: 0.15 });
    this._tone(t, 48, 1.2, { gain: 0.3, attack: 0.1 });
    this._tone(t + 0.9, 92, 0.3, { to: 50, gain: 0.4 });
  }

  card() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this._noise(t, 0.12, { freq: 3400, q: 1, gain: 0.07, attack: 0.02 });
  }

  // 레드 박스: 경첩과 벨벳이 스치는 소리. 이 순간에만 씁니다.
  redbox() {
    if (!this.ok) return;
    const c = this.ctx;
    const t = c.currentTime + 0.45;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, t);
    o.frequency.linearRampToValueAtTime(230, t + 0.35);
    o.frequency.linearRampToValueAtTime(190, t + 0.8);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1100;
    f.Q.value = 9;
    const g = c.createGain();
    this._env(g, t, 0.08, 0.07, 0.8);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 1);
    this._noise(t + 0.6, 0.7, { freq: 1400, to: 600, q: 0.6, gain: 0.12, attack: 0.08 });
    this._tone(t + 1.15, 196, 2.2, { gain: 0.05, attack: 0.2 });
    this._tone(t + 1.15, 293.7, 2.2, { gain: 0.04, attack: 0.2 });
  }

  // 바꿔치기 게이지가 차오르는 동안의 낮은 울림
  humStart() {
    if (!this.ok || this.hum) return;
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = 110;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.06, c.currentTime + 0.1);
    o.connect(g).connect(this.sfx);
    o.start();
    this.hum = { o, g };
  }
  humSet(v) {
    if (this.hum) this.hum.o.frequency.setTargetAtTime(110 + v * 2.2, this.ctx.currentTime, 0.03);
  }
  humStop() {
    if (!this.hum) return;
    const { o, g } = this.hum;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0.0001, t, 0.03);
    o.stop(t + 0.2);
    this.hum = null;
  }
}

export const audio = new AudioEngine();
