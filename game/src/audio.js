// SOLBAY HEAT — synthesised sound. Every note is a WebAudio oscillator or a burst
// of noise: engine hum that follows speed, a two-tone siren, a lazy synth groove, and
// one-shots for shots, hits, pickups and UI clicks. No audio files.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.ready = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);

      // Engine: sawtooth through a lowpass, pitch follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 320;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(lowpass);
      lowpass.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();

      // Siren: triangle wave wobbling between two tones.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      const wobble = this.ctx.createOscillator();
      wobble.frequency.value = 0.7;
      const wobbleGain = this.ctx.createGain();
      wobbleGain.gain.value = 180;
      wobble.connect(wobbleGain);
      wobbleGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      wobble.start();

      this.ready = true;
      this.startGroove();
    } catch {
      // Audio unavailable — the game stays silent and keeps playing.
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  setEngine(speed01, driving) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.engineGain.gain.setTargetAtTime(driving ? 0.05 + speed01 * 0.06 : 0, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
  }

  setSiren(on) {
    if (!this.ctx) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.2);
  }

  // Sunset groove: Am – F – C – G arpeggios, soft triangle, low volume.
  startGroove() {
    if (this.musicTimer || !this.ctx) return;
    const chords = [
      [220, 261.6, 329.6],
      [174.6, 220, 261.6],
      [130.8, 164.8, 196],
      [196, 246.9, 293.7],
    ];
    const stepLen = 0.22;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const chord = chords[Math.floor(this.musicStep / 4) % chords.length];
      const note = chord[this.musicStep % 3];
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = note * 2;
      const gain = this.ctx.createGain();
      const t = this.ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.045, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + stepLen);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + stepLen + 0.05);
      this.musicStep++;
    }, stepLen * 1000);
  }

  blip(freq, dur = 0.08, type = 'square', vol = 0.08) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  shot() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = 0.12;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(gain);
    gain.connect(this.master);
    src.start(t);
    this.blip(180, 0.06, 'sawtooth', 0.06);
  }

  chime() {
    this.blip(880, 0.1, 'sine', 0.1);
    setTimeout(() => this.blip(1320, 0.14, 'sine', 0.1), 90);
  }

  thud() {
    this.blip(70, 0.15, 'sine', 0.18);
  }

  click() {
    this.blip(660, 0.05, 'square', 0.05);
  }
}
