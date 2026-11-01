/* Chord audio synth: physically-modelled guitar, strummed.
 *
 * Each note is an extended Karplus-Strong string rendered once into a cached
 * AudioBuffer (see renderString): exact tuning via a fractional-delay allpass,
 * per-note T60 decay, pick-position comb, two polarizations (fast + slow
 * decay), optional magnetic-pickup comb. Voices then run through a persistent
 * bus: procedural guitar-body IR, preset EQ, optional drive + cab, stereo
 * room, limiter.
 *
 * Standard tuning, low E -> high E. frets[i] = null means muted string.
 *
 * Public API:
 *   const audio = new ChordAudio(audioCtx);
 *   audio.setPreset("acoustic");                  // key of ChordAudio.PRESETS
 *   audio.prepare([frets, ...]);                  // pre-render buffers
 *   audio.play(time, frets, { direction: "down"|"up", velocity: 0..1 });
 *   audio.stop(time);                             // damp everything
 *   ChordAudio.renderString(opts) -> Float32Array // pure, no Web Audio
 */
(function () {
  const TUNING_HZ = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];
  const CACHE_MAX = 72;              // ~768 KB per 4 s buffer at 48 kHz

  // Body modes: [freq Hz, Q, gain dB]. Approximations of measured guitar
  // body modes — tuning knobs, not truth.
  const DREADNOUGHT = [[98, 12, 6], [204, 20, 4], [390, 25, 2], [550, 30, 0],
    [820, 30, -2], [1200, 25, -3], [2400, 15, -5]];
  const CLASSICAL = [[95, 10, 5], [190, 18, 4], [260, 22, 2], [380, 25, 1],
    [580, 30, -1], [1000, 25, -3], [2000, 15, -6]];

  const acoustic = {
    label: "Acoustic (steel)",
    bufferSeconds: 4,
    t60: [6, 2.5],                   // seconds at low E open, at high E 12th fret
    stretch: 0.35,                   // loop lowpass weight, 0.5 = darkest
    pluckCutoff: 6000,
    pickPos: 0.12,
    pickupPos: null,
    polar: { fastRatio: 0.3, fastMix: 0.55, cents: 0.8 },
    brightHz: 7000,
    strumMs: 11,
    stringGain: [0.17, 0.17, 0.16, 0.16, 0.16, 0.17],
    panSpread: 0.3,
    body: { modes: DREADNOUGHT, wet: 0.65 },
    eq: [{ type: "highpass", f: 70, q: 0.7 }, { type: "highshelf", f: 6000, gain: -3 }],
    drive: null,
    cabHz: null,
    room: { seconds: 1.4, wet: 0.12 },
    courses: null,
    // Output level, calibrated by ear/RMS so every preset strums at about
    // the same loudness (F barre ~0.05 RMS, a touch above the old engine).
    master: 1.25,
  };

  const electric = {
    ...acoustic,
    label: "Electric clean",
    bufferSeconds: 5,
    t60: [9, 4],
    stretch: 0.25,
    pluckCutoff: 7000,
    pickPos: 0.1,
    pickupPos: 0.25,                 // neck pickup
    polar: { fastRatio: 0.5, fastMix: 0.3, cents: 0.4 },
    brightHz: 6500,
    strumMs: 9,
    stringGain: [0.17, 0.17, 0.17, 0.17, 0.17, 0.17],
    body: null,
    eq: [{ type: "highpass", f: 80, q: 0.7 }, { type: "peaking", f: 2500, q: 1, gain: 2 },
      { type: "lowpass", f: 7000, q: 0.7 }],
    room: { seconds: 1.0, wet: 0.1 },
    master: 0.75,
  };

  const OCTAVE = { mult: 2, cents: 2, gain: 0.6, offsetMs: -4 };
  const UNISON = { mult: 1, cents: 3, gain: 0.9, offsetMs: -3 };

  const PRESETS = {
    acoustic,
    nylon: {
      ...acoustic,
      label: "Classical (nylon)",
      bufferSeconds: 3.5,
      t60: [4.5, 1.6],
      stretch: 0.45,
      pluckCutoff: 2500,
      pickPos: 0.18,
      polar: { fastRatio: 0.35, fastMix: 0.5, cents: 0.5 },
      brightHz: 4000,
      strumMs: 14,
      stringGain: [0.18, 0.17, 0.16, 0.16, 0.16, 0.16],
      body: { modes: CLASSICAL, wet: 0.7 },
      eq: [{ type: "highpass", f: 70, q: 0.7 }, { type: "peaking", f: 250, q: 1, gain: 2 },
        { type: "lowpass", f: 4500, q: 0.7 }],
      room: { seconds: 1.6, wet: 0.15 },
      master: 0.3,
    },
    twelve: {
      ...acoustic,
      label: "12-string",
      pluckCutoff: 6500,
      brightHz: 8000,
      strumMs: 12,
      stringGain: [0.14, 0.14, 0.14, 0.14, 0.14, 0.14],
      body: { modes: DREADNOUGHT, wet: 0.6 },
      eq: [...acoustic.eq, { type: "highshelf", f: 8000, gain: 1 }],
      room: { seconds: 1.4, wet: 0.14 },
      master: 1.5,
      // Extra strings per course: octave on E A D G, unison on B E.
      courses: [[OCTAVE], [OCTAVE], [OCTAVE], [OCTAVE], [UNISON], [UNISON]],
    },
    electric,
    crunch: {
      ...electric,
      label: "Electric crunch",
      bufferSeconds: 4,
      t60: [8, 3.5],
      pickupPos: 0.08,               // bridge pickup
      brightHz: 5000,
      strumMs: 8,
      stringGain: [0.15, 0.15, 0.15, 0.15, 0.15, 0.15],
      eq: [{ type: "peaking", f: 800, q: 0.8, gain: 3 }],
      drive: 3,
      cabHz: 4800,
      room: { seconds: 0.8, wet: 0.08 },
      master: 0.32,
    },
  };
  const DEFAULT_PRESET = "acoustic";

  // ---- Pure DSP (no Web Audio; exercised by scripts/check-audio.mjs) ----

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // T60 for a note, interpolated in log space between low E (82 Hz) and
  // high E 12th fret (~660 Hz, three octaves up).
  function t60For(preset, freq) {
    const k = Math.min(1, Math.max(0, Math.log2(freq / TUNING_HZ[0]) / 3));
    const [lo, hi] = preset.t60;
    return Math.exp(Math.log(lo) + k * (Math.log(hi) - Math.log(lo)));
  }

  // One Karplus-Strong loop. Total loop delay N + S + d equals the period P
  // exactly, so pitch is exact (plain KS rounds N and is up to 20 cents flat).
  // t60Periods = T60 measured in periods of the note (t60 seconds * freq).
  function renderLoop(exc, P, t60Periods, S, total) {
    const N = Math.floor(P - S - 0.1);       // integer delay
    const d = P - S - N;                     // fractional remainder in [0.1, 1.1)
    const C = (1 - d) / (1 + d);             // first-order allpass for delay d
    const gain = Math.pow(10, -3 / t60Periods); // per-period loss for target T60
    const buf = new Float32Array(N);
    const out = new Float32Array(total);
    let idx = 0, lpPrev = 0, apX1 = 0, apY1 = 0;
    const excLen = exc.length;
    for (let n = 0; n < total; n++) {
      const x = buf[idx];                    // y[n - N]
      const lp = (1 - S) * x + S * lpPrev;   // loop lowpass, phase delay ~S
      lpPrev = x;
      const ap = C * lp + apX1 - C * apY1;   // fractional delay d
      apX1 = lp; apY1 = ap;
      const y = gain * ap + (n < excLen ? exc[n] : 0);
      buf[idx] = y;
      if (++idx === N) idx = 0;
      out[n] = y;
    }
    return out;
  }

  function renderString(o) {
    const sr = o.sampleRate;
    const P = sr / o.freq;
    const total = Math.floor(sr * o.seconds);
    const rand = mulberry32(o.seed || 1);

    // Excitation: lowpassed noise, pick-position comb, zero mean, peak 1.
    const L = Math.ceil(P);
    const raw = new Float32Array(L);
    const a = Math.exp(-2 * Math.PI * o.pluckCutoff / sr);
    let y1 = 0;
    for (let i = 0; i < L; i++) {
      y1 = (1 - a) * (rand() * 2 - 1) + a * y1;
      raw[i] = y1;
    }
    const M = Math.max(1, Math.round(o.pickPos * P));
    const exc = new Float32Array(L);
    let mean = 0;
    for (let i = 0; i < L; i++) {
      exc[i] = raw[i] - (i >= M ? raw[i - M] : 0);
      mean += exc[i];
    }
    mean /= L;
    let peak = 0;
    for (let i = 0; i < L; i++) { exc[i] -= mean; peak = Math.max(peak, Math.abs(exc[i])); }
    if (peak > 0) for (let i = 0; i < L; i++) exc[i] /= peak;

    // Two polarizations: slow loop at the target T60, fast loop decays
    // sooner and is detuned slightly — gives the two-stage decay and shimmer.
    // T60 is converted to periods: loss per period = 10^(-3 / (t60 * freq)).
    const pol = o.polar || { fastRatio: 1, fastMix: 0, cents: 0 };
    const slow = renderLoop(exc, P, o.t60 * o.freq, o.stretch, total);
    const out = slow;
    if (pol.fastMix > 0) {
      const fastP = P * Math.pow(2, -pol.cents / 1200);
      const fast = renderLoop(exc, fastP, o.t60 * pol.fastRatio * (sr / fastP), o.stretch, total);
      for (let n = 0; n < total; n++) out[n] = (1 - pol.fastMix) * slow[n] + pol.fastMix * fast[n];
    }

    // Magnetic pickup comb (backwards so out[n - K] is still unmodified).
    if (o.pickupPos) {
      const K = Math.max(1, Math.round(o.pickupPos * P));
      for (let n = total - 1; n >= K; n--) out[n] -= out[n - K];
    }

    // DC blocker.
    let x1 = 0, yb = 0;
    for (let n = 0; n < total; n++) {
      const x = out[n];
      yb = x - x1 + 0.995 * yb;
      x1 = x;
      out[n] = yb;
    }

    // Fade the last 50 ms so a buffer that plays to the end can't click.
    const fadeLen = Math.min(total, Math.floor(sr * 0.05));
    for (let i = 0; i < fadeLen; i++) out[total - fadeLen + i] *= 1 - i / fadeLen;

    peak = 0;
    for (let n = 0; n < total; n++) peak = Math.max(peak, Math.abs(out[n]));
    if (peak > 0) { const k = 0.9 / peak; for (let n = 0; n < total; n++) out[n] *= k; }
    return out;
  }

  // Guitar body impulse response: sum of decaying modal sinusoids plus a
  // tiny broadband click (keeps the top end). Scaled to unit energy so the
  // wet path is about as loud as the dry path.
  function makeBodyIR(modes, sr) {
    const len = Math.floor(sr * 0.25);
    const ir = new Float32Array(len);
    const rand = mulberry32(777);
    for (let n = 0; n < len; n++) {
      const t = n / sr;
      let s = 0.3 * (rand() * 2 - 1) * Math.exp(-t / 0.0015);
      for (const [f, q, db] of modes) {
        s += Math.pow(10, db / 20) * Math.exp(-Math.PI * f * t / q) * Math.sin(2 * Math.PI * f * t);
      }
      ir[n] = s;
    }
    return unitEnergy(ir);
  }

  // Stereo room: independent decaying noise per channel, 10 ms pre-delay,
  // -60 dB at `seconds`, one-pole lowpassed at 5 kHz.
  function makeRoomIR(seconds, sr) {
    const len = Math.floor(sr * seconds);
    const pre = Math.floor(sr * 0.01);
    const a = Math.exp(-2 * Math.PI * 5000 / sr);
    const chans = [];
    for (let c = 0; c < 2; c++) {
      const rand = mulberry32(1234 + c);
      const ch = new Float32Array(len);
      let y = 0;
      for (let n = pre; n < len; n++) {
        y = (1 - a) * (rand() * 2 - 1) + a * y;
        ch[n] = y * Math.exp(-6.9 * (n - pre) / (sr * seconds));
      }
      chans.push(unitEnergy(ch));
    }
    return chans;
  }

  function unitEnergy(arr) {
    let e = 0;
    for (let i = 0; i < arr.length; i++) e += arr[i] * arr[i];
    const k = e > 0 ? 1 / Math.sqrt(e) : 0;
    for (let i = 0; i < arr.length; i++) arr[i] *= k;
    return arr;
  }

  // ---- Web Audio engine ----

  class ChordAudio {
    constructor(audioCtx) {
      this.ctx = audioCtx;
      this.bufferCache = new Map();
      this.voices = new Array(6).fill(null);
      this.bus = null;
      this.presetKey = DEFAULT_PRESET;
      this.preset = PRESETS[DEFAULT_PRESET];
    }

    setPreset(key) {
      if (!PRESETS[key] || key === this.presetKey) return;
      this.presetKey = key;
      this.preset = PRESETS[key];
      // Fade the old bus out (ringing voices go with it), rebuild lazily.
      if (this.bus) {
        const old = this.bus.master;
        const now = this.ctx.currentTime;
        old.gain.setTargetAtTime(0, now, 0.015);
        setTimeout(() => { try { old.disconnect(); } catch (_) {} }, 3000);
        this.bus = null;
        this.voices.fill(null);
      }
    }

    prepare(fretsList) {
      if (!this.ctx) return;
      for (const frets of fretsList || []) {
        for (let i = 0; i < 6; i++) {
          const fret = frets && frets[i];
          if (fret === null || fret === undefined) continue;
          const freq = TUNING_HZ[i] * Math.pow(2, fret / 12);
          this._getBuffer(freq, i);
          for (const c of (this.preset.courses && this.preset.courses[i]) || []) {
            this._getBuffer(freq * c.mult, i);
          }
        }
      }
    }

    play(time, frets, opts) {
      if (!this.ctx || !frets) return;
      const ctx = this.ctx;
      const p = this.preset;
      const bus = this._ensureBus();
      const up = !!(opts && opts.direction === "up");
      const velocity = Math.min(1, Math.max(0.05, (opts && opts.velocity) != null ? opts.velocity : 1));

      const sounding = [];
      for (let i = 0; i < 6; i++) {
        const f = frets[i];
        if (f === null || f === undefined) {
          // Fretting hand mutes strings that aren't in the chord.
          this._damp(i, time, 0.03, 0.2);
        } else {
          sounding.push(i);
        }
      }
      if (!sounding.length) return;

      // Down: low -> high, all strings. Up: high -> low, top 4 sounding only.
      const hit = up ? sounding.slice(-4).reverse() : sounding;
      const msPer = p.strumMs * (1.4 - 0.4 * velocity) * (up ? 0.7 : 1);
      const first = hit[0];

      for (const i of hit) {
        const k = Math.abs(i - first);       // string slots crossed so far
        const jitter = k ? (Math.random() - 0.5) * 0.004 : 0;
        const t = time + k * msPer / 1000 + jitter;
        this._damp(i, t, 0.008, 0.08);       // re-pluck stops the old vibration

        const vi = velocity * (0.85 + 0.15 * Math.random());
        const gain = ctx.createGain();
        gain.gain.value = p.stringGain[i] * Math.pow(vi, 1.5);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = p.brightHz * (0.35 + 0.65 * vi);
        lp.Q.value = 0.5;
        let tail = gain.connect(lp);
        let pan = null;
        if (ctx.createStereoPanner) {
          pan = ctx.createStereoPanner();
          pan.pan.value = p.panSpread * (i / 5 * 2 - 1);
          tail = tail.connect(pan);
        }
        tail.connect(bus.input);

        const voice = { gain, sources: [] };
        let live = 0;
        const cleanup = () => {
          if (--live > 0) return;
          for (const n of [gain, lp, pan]) { try { n && n.disconnect(); } catch (_) {} }
          if (this.voices[i] === voice) this.voices[i] = null;
        };
        const freq = TUNING_HZ[i] * Math.pow(2, frets[i] / 12);
        const addSource = (f, cents, startT, level) => {
          const src = ctx.createBufferSource();
          src.buffer = this._getBuffer(f, i);
          src.detune.value = cents + (Math.random() - 0.5) * 3;   // ±1.5 c finger pressure
          let dest = gain;
          if (level !== 1) {
            dest = ctx.createGain();
            dest.gain.value = level;
            dest.connect(gain);
          }
          src.connect(dest);
          const st = Math.max(startT, 0);
          src.start(st);
          src.stop(st + src.buffer.duration);
          src.onended = () => {
            try { src.disconnect(); } catch (_) {}
            if (dest !== gain) { try { dest.disconnect(); } catch (_) {} }
            cleanup();
          };
          voice.sources.push(src);
          live++;
        };
        addSource(freq, 0, t, 1);
        for (const c of (p.courses && p.courses[i]) || []) {
          // Thin course string is hit first on a downstroke, last on an up.
          addSource(freq * c.mult, c.cents, t + (up ? -c.offsetMs : c.offsetMs) / 1000, c.gain);
        }
        this.voices[i] = voice;
      }
    }

    stop(time) {
      if (!this.ctx) return;
      const t = time != null ? time : this.ctx.currentTime;
      for (let i = 0; i < 6; i++) this._damp(i, t, 0.04, 0.3);
    }

    _damp(i, t, timeConstant, stopAfter) {
      const v = this.voices[i];
      if (!v) return;
      this.voices[i] = null;
      try { v.gain.gain.setTargetAtTime(0, t, timeConstant); } catch (_) {}
      for (const src of v.sources) { try { src.stop(t + stopAfter); } catch (_) {} }
    }

    _ensureBus() {
      if (this.bus) return this.bus;
      const ctx = this.ctx;
      const p = this.preset;
      const sr = ctx.sampleRate;

      const input = ctx.createGain();
      const mix = ctx.createGain();
      if (p.body) {
        const dry = ctx.createGain();
        dry.gain.value = 1 - p.body.wet;
        input.connect(dry).connect(mix);
        const conv = ctx.createConvolver();
        conv.normalize = false;
        const ir = makeBodyIR(p.body.modes, sr);
        const irBuf = ctx.createBuffer(1, ir.length, sr);
        irBuf.getChannelData(0).set(ir);
        conv.buffer = irBuf;
        const wet = ctx.createGain();
        wet.gain.value = p.body.wet;
        input.connect(conv).connect(wet).connect(mix);
      } else {
        input.connect(mix);
      }

      let node = mix;
      for (const e of p.eq || []) {
        const bq = ctx.createBiquadFilter();
        bq.type = e.type;
        bq.frequency.value = e.f;
        if (e.q != null) bq.Q.value = e.q;
        if (e.gain != null) bq.gain.value = e.gain;
        node = node.connect(bq);
      }

      if (p.drive) {
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 120;
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(2048);
        const norm = Math.tanh(p.drive);
        for (let i = 0; i < curve.length; i++) {
          const x = (i / (curve.length - 1)) * 2 - 1;
          curve[i] = Math.tanh(p.drive * x) / norm;
        }
        shaper.curve = curve;
        shaper.oversample = "4x";
        const cab = ctx.createBiquadFilter();
        cab.type = "lowpass";
        cab.frequency.value = p.cabHz || 4800;
        cab.Q.value = 0.7;
        node = node.connect(hp).connect(shaper).connect(cab);
      }

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 6;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.25;
      node.connect(comp);

      if (p.room && p.room.wet > 0) {
        const chans = makeRoomIR(p.room.seconds, sr);
        const roomBuf = ctx.createBuffer(2, chans[0].length, sr);
        roomBuf.getChannelData(0).set(chans[0]);
        roomBuf.getChannelData(1).set(chans[1]);
        const room = ctx.createConvolver();
        room.normalize = false;
        room.buffer = roomBuf;
        const send = ctx.createGain();
        send.gain.value = p.room.wet;
        node.connect(send).connect(room).connect(comp);
      }

      const master = ctx.createGain();
      master.gain.value = p.master;
      comp.connect(master).connect(ctx.destination);

      this.bus = { input, master };
      return this.bus;
    }

    _getBuffer(freq, stringIndex) {
      const key = this.presetKey + "|" + stringIndex + "|" + freq.toFixed(2);
      let buf = this.bufferCache.get(key);
      if (buf) {
        // Refresh LRU position.
        this.bufferCache.delete(key);
        this.bufferCache.set(key, buf);
        return buf;
      }
      const p = this.preset;
      const sr = this.ctx.sampleRate;
      const data = renderString({
        sampleRate: sr,
        freq,
        seconds: p.bufferSeconds,
        t60: t60For(p, freq),
        stretch: p.stretch,
        pluckCutoff: p.pluckCutoff,
        pickPos: p.pickPos,
        pickupPos: p.pickupPos,
        polar: p.polar,
        seed: stringIndex * 1000 + Math.round(freq),
      });
      buf = this.ctx.createBuffer(1, data.length, sr);
      buf.getChannelData(0).set(data);
      this.bufferCache.set(key, buf);
      if (this.bufferCache.size > CACHE_MAX) {
        this.bufferCache.delete(this.bufferCache.keys().next().value);
      }
      return buf;
    }
  }

  ChordAudio.PRESETS = PRESETS;
  ChordAudio.DEFAULT_PRESET = DEFAULT_PRESET;
  ChordAudio.TUNING_HZ = TUNING_HZ;
  ChordAudio.renderString = renderString;
  ChordAudio.makeBodyIR = makeBodyIR;
  ChordAudio.t60For = t60For;

  window.ChordAudio = ChordAudio;
})();
