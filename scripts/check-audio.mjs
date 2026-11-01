// Self-check for the guitar string model in public/static/js/chord-audio.js.
// Run: node scripts/check-audio.mjs   (prints "ok" or the failures, exit 1)
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../public/static/js/chord-audio.js", import.meta.url), "utf8");
const ctx = { window: {} };
vm.runInNewContext(src, ctx);
const { renderString, PRESETS, TUNING_HZ, t60For } = ctx.window.ChordAudio;

const failures = [];
const fail = (m) => failures.push(m);
const slice = (x, sr, t, dur) => x.subarray(Math.floor(t * sr), Math.floor((t + dur) * sr));

// Autocorrelation pitch, searched within ±1 semitone of the expected note,
// with parabolic interpolation on the peak.
function pitch(w, sr, expected) {
  const P = sr / expected;
  const lo = Math.floor(P / 1.06), hi = Math.ceil(P * 1.06);
  const n = w.length - hi - 1;
  const ac = (lag) => { let s = 0; for (let i = 0; i < n; i++) s += w[i] * w[i + lag]; return s; };
  let best = lo, bestV = -Infinity;
  for (let lag = lo; lag <= hi; lag++) { const v = ac(lag); if (v > bestV) { bestV = v; best = lag; } }
  const a = ac(best - 1), b = bestV, c = ac(best + 1);
  const shift = (a - c) / (2 * (a - 2 * b + c)) || 0;
  return sr / (best + shift);
}

// Magnitude of one frequency (Goertzel) over a window.
function goertzel(w, sr, f) {
  const k = 2 * Math.cos(2 * Math.PI * f / sr);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < w.length; i++) { const s = w[i] + k * s1 - s2; s2 = s1; s1 = s; }
  return Math.sqrt(s1 * s1 + s2 * s2 - k * s1 * s2);
}

const rms = (w) => Math.sqrt(w.reduce((s, v) => s + v * v, 0) / w.length);

for (const [key, p] of Object.entries(PRESETS)) {
  for (const sr of [44100, 48000]) {
    for (let s = 0; s < 6; s++) {
      for (const fret of [0, 5, 12]) {
        const freq = TUNING_HZ[s] * 2 ** (fret / 12);
        const t60 = t60For(p, freq);
        const x = renderString({
          sampleRate: sr, freq, seconds: p.bufferSeconds, t60,
          stretch: p.stretch, pluckCutoff: p.pluckCutoff, pickPos: p.pickPos,
          pickupPos: p.pickupPos, polar: p.polar, seed: s * 1000 + Math.round(freq),
        });
        const tag = `${key} sr=${sr} string=${s} fret=${fret}`;

        let peak = 0, mean = 0, finite = true;
        for (const v of x) { if (!Number.isFinite(v)) finite = false; peak = Math.max(peak, Math.abs(v)); mean += v; }
        mean /= x.length;
        if (!finite) { fail(`${tag}: non-finite sample`); continue; }
        if (peak > 1) fail(`${tag}: peak ${peak.toFixed(3)} > 1`);
        if (Math.abs(mean) > 1e-3) fail(`${tag}: DC ${mean.toExponential(2)}`);

        const cents = 1200 * Math.log2(pitch(slice(x, sr, 0.3, 0.1), sr, freq) / freq);
        if (Math.abs(cents) >= 3) fail(`${tag}: pitch off by ${cents.toFixed(2)} cents`);

        if (rms(slice(x, sr, 2.0, 0.1)) >= rms(slice(x, sr, 0.2, 0.1))) fail(`${tag}: not decaying`);

        // Fundamental decay between 0.5 s and 1.5 s, extrapolated to -60 dB.
        // Loose (±35 %): the loop lowpass adds a little extra loss.
        const a = goertzel(slice(x, sr, 0.5, 0.1), sr, freq);
        const b = goertzel(slice(x, sr, 1.5, 0.1), sr, freq);
        const dbPerSec = 20 * Math.log10(a / b);
        const measured = 60 / dbPerSec;
        if (!(Math.abs(measured / t60 - 1) <= 0.35)) {
          fail(`${tag}: T60 ${measured.toFixed(2)}s vs target ${t60.toFixed(2)}s`);
        }
      }
    }
  }
}

if (failures.length) {
  for (const f of failures) console.log(f);
  console.log(`${failures.length} failure(s)`);
  process.exit(1);
}
console.log("ok");
