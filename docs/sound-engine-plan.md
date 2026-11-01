# Guitar sound engine: improvement plan

Goal: make the chord playback in Practice sound as close to a real guitar as a
procedural (no samples) Web Audio synth can, and add selectable tone presets.

Read this whole file before editing. Implement phases in order; each phase is
shippable on its own and must leave the app working.

---

## 0. Ground rules for the implementer

- Edit directly on `main` (no worktrees). The user runs the app from `main`.
- Keep everything in `public/static/js/chord-audio.js`. No new runtime files, no
  dependencies, no build step. The site is static (Cloudflare Pages).
- CSP is `script-src 'self'` (see `public/_headers`). No CDN scripts, no `blob:`
  workers. Do **not** introduce an AudioWorklet; pre-rendered buffers are enough.
- No external audio samples or impulse-response files. All IRs are generated in
  code at runtime.
- After changing a script, bump its `?v=` query string in `public/index.html`
  (current value `20261101c`, e.g. to `20261102a`). Static files are cached for
  5 minutes and the version string is how this repo busts caches.
- `public/index.html`, `practice.js`, `metronome.js` currently have
  **uncommitted user edits**. Make additive edits only; do not revert or reformat
  surrounding code. Do not commit unless asked.

---

## 1. How it works today

| Piece | Where | What it does |
|---|---|---|
| String synth | `public/static/js/chord-audio.js` | Karplus-Strong (KS). One mono `AudioBuffer` per (pitch, string), 3.5 s long, cached forever. |
| Strum | `ChordAudio.play(time, frets)` | Six `AudioBufferSourceNode`s, 12 ms apart (±2 ms jitter), always low→high. Per-strum lowpass 3.8 kHz → gain 0.7 → destination. |
| Trigger | `practice.js` `onBeat()` (~line 781) | Calls `chordAudio.play(audioTime, chord.frets)` once per bar, on beat 1, when audio mode is `chord` or `both`. |
| Context | `practice.js` `_start()` (~line 686) | Reuses `metronome.audioCtx`. Scheduler lookahead is 100 ms (`metronome.js`). |
| Chord data | `public/library.json`, `store.js` | `frets` is a 6-element array, low E → high E, `null` = muted string. |

---

## 2. What is wrong (ranked by audible impact)

1. **Strings are out of tune with each other.** Delay length is
   `round(sr / f)`, and the two-tap average adds another 0.5 sample, so the real
   period is `N + 0.5`. Measured over frets 0–12 on all strings:

   | Sample rate | Worst error | Mean error |
   |---|---|---|
   | 44.1 kHz | −20.6 cents | −5.2 cents |
   | 48 kHz | −18.2 cents | −4.3 cents |

   Up to 20 cents flat, varying per note, is why chords sound "sour" and synthetic.
2. **Almost no decay.** Loop gain `2*decay` gives a fundamental T60 of 13 s
   (high E) to 279 s (low E). Strings ring at near-full level for the whole
   3.5 s buffer and are then cut by a 150 ms fade. Real steel strings fall away
   much faster, especially the treble.
3. **No string damping between chords.** Each strum adds six new voices while the
   previous six keep ringing for 3.5 s. On a real guitar re-plucking a string
   stops its old vibration, and strings not in the new chord are muted by the
   hand. Result: mud and wrong notes at chord changes. `Stop` also leaves notes
   ringing for up to 3.5 s.
4. **No guitar body.** A plucked string alone sounds like a harpsichord/"bell".
   Most of what makes it read as *guitar* is the body resonances
   (~100 Hz air mode, ~200 Hz top plate, etc.) and a little room.
5. **No pick-position filtering.** Real plucks at 1/8–1/5 of the string length
   notch out specific harmonics. Without it the spectrum is too smooth.
6. **Single decay stage.** Real strings have a fast initial drop then a slower
   sustain (two polarizations), with slight beating. KS with one loop has neither.
7. **Every strum is identical.** Buffers are cached with one noise seed, always a
   downstroke, same velocity, same brightness. The ear spots the repetition fast.
8. **Mono, fixed 3.8 kHz lowpass, no gain control.** No stereo spread, no
   velocity→brightness link, no limiter to catch summed peaks.

---

## 3. Target design (still one file)

```
per note:  renderString()  -> AudioBuffer (cached)
per voice: BufferSource (detune jitter) -> Gain (velocity) -> Biquad LP (velocity brightness) -> StereoPanner
                                                                                                   |
persistent bus (rebuilt on preset change):                                                         v
   inBus -> [dry]---------------------------------+-> preset EQ chain -> [WaveShaper drive?] -> cab/EQ
         -> [body Convolver (modal IR)] -> wet ---+                                              |
                                                     +--> room Convolver (send) ---------------+ v
                                                                                 DynamicsCompressor -> master Gain -> destination
```

Public API after all phases:

```js
const audio = new ChordAudio(ctx);
audio.setPreset("acoustic");                 // key of ChordAudio.PRESETS
audio.prepare([fretsA, fretsB, ...]);        // pre-render buffers, call before start
audio.play(time, frets, { direction: "down", velocity: 1 }); // opts optional
audio.stop(time);                            // damp everything (~120 ms release)
ChordAudio.renderString(opts) -> Float32Array // pure, no Web Audio; used by the check script
ChordAudio.PRESETS                            // preset table
```

`play(time, frets)` with no options must keep working (downstroke, velocity 1),
so the current caller works unchanged until Phase 5.

---

## Phase 1: Correct string model (biggest win)

Replace `_getBuffer`'s DSP with a pure static function
`ChordAudio.renderString(opts)` that returns a `Float32Array`. `_getBuffer` wraps
it in an `AudioBuffer` and caches it.

### 1.1 Inputs

```js
{
  sampleRate, freq, seconds,      // seconds = preset.bufferSeconds
  t60,                            // seconds for the fundamental to fall 60 dB
  stretch,                        // loop lowpass weight S in [0.05, 0.5]; 0.5 = darkest
  pluckCutoff,                    // Hz, one-pole lowpass on the excitation noise
  pickPos,                        // fraction of string length, e.g. 0.12
  pickupPos,                      // null for acoustic; fraction for electric (e.g. 0.08 bridge, 0.25 neck)
  polar: { fastRatio, fastMix, cents }, // second polarization
  seed,                           // integer for the PRNG (deterministic output)
}
```

### 1.2 Algorithm (implement exactly)

Use a small seeded PRNG (mulberry32, ~6 lines) instead of `Math.random()` so
renders are reproducible and testable. Seed from `stringIndex * 1000 + round(freq)`.

**Excitation** (length `L = ceil(P)` where `P = sampleRate / freq`):

1. White noise in [−1, 1] from the PRNG.
2. One-pole lowpass: `a = exp(-2π·pluckCutoff/sr)`, `y = (1−a)·x + a·y1`.
3. Pick-position comb on a copy: `e[n] = y[n] − y[n − M]`, `M = max(1, round(pickPos·P))`
   (treat out-of-range index as 0).
4. Subtract the mean, then scale so peak = 1.

**One string loop** (`renderLoop(exc, P, t60, stretch)`):

```js
const S = stretch;
const N = Math.floor(P - S - 0.1);   // integer delay
const d = P - S - N;                 // fractional remainder, lands in [0.1, 1.1)
const C = (1 - d) / (1 + d);         // first-order allpass coefficient for delay d
const g = Math.pow(10, -3 / (t60 * freq)); // per-period loss for target T60
const buf = new Float32Array(N); let idx = 0;
let lpPrev = 0, apX1 = 0, apY1 = 0;
for (let n = 0; n < total; n++) {
  const x = buf[idx];                        // y[n - N]
  const lp = (1 - S) * x + S * lpPrev; lpPrev = x;   // loop lowpass, phase delay ~S
  const ap = C * lp + apX1 - C * apY1; apX1 = lp; apY1 = ap; // fractional delay d
  const y = g * ap + (n < exc.length ? exc[n] : 0);
  buf[idx] = y; idx = (idx + 1) % N;
  out[n] = y;
}
```

Total loop delay is `N + S + d = P`, so pitch is exact. That fixes problem 1.

**Two polarizations** (fixes problem 6): render the loop twice from the same
excitation and mix:

- slow loop: `t60`, period `P`, weight `1 − fastMix`
- fast loop: `t60 · fastRatio`, period `P · 2^(−cents/1200)`, weight `fastMix`

**Output stage:**

1. If `pickupPos` is set: `out[n] -= out[n − round(pickupPos·P)]` (magnetic pickup comb).
2. DC blocker: `y = x − x1 + 0.995·y1`.
3. Linear fade over the last 50 ms.
4. Normalize peak to 0.9. Loudness balance between strings comes from the
   preset's `stringGain`, not from the render.

**T60 per note:** presets give `t60: [atLowE, atHighE12]` (82 Hz and 660 Hz).
Interpolate in log space:
`k = clamp(log2(freq/82.41)/3, 0, 1)`, `t60 = exp(lerp(ln lo, ln hi, k))`.

### 1.3 Caching

- Key: `${presetKey}|${stringIndex}|${freq.toFixed(2)}`.
- Cap the `Map` at 96 entries. On insert past the cap, delete the oldest key
  (`map.keys().next().value`). One 4 s mono buffer at 48 kHz is ~770 KB.
- `prepare(fretsList)`: render every non-null note of every chord in the list.
  Call it from `practice.js` `_start()` right after `chordAudio` is created and
  before `metronome.start()`, with the selected chord or all progression chords.
  Cost is roughly 1–2 ms per note, fine on the click.

### 1.4 Check script (required)

Create `scripts/check-audio.mjs`, run with `node scripts/check-audio.mjs`
(Node 24 is installed). It loads `chord-audio.js` into `node:vm` with a stub
`{ window: {} }` context and calls `window.ChordAudio.renderString`. For every
preset, at both 44100 and 48000 Hz, for each string at frets 0, 5 and 12:

- **Pitch:** autocorrelation on a 100 ms window starting at 0.3 s, parabolic
  interpolation on the peak. Assert `|cents| < 3`.
- **Sanity:** no `NaN`/`Infinity`, peak ≤ 1, `|mean| < 1e-3`.
- **Decay:** RMS of the window at 2.0 s is below RMS at 0.2 s.
- **T60:** measured fundamental decay (RMS in dB at 0.5 s vs 1.5 s, extrapolated)
  is within ±35 % of the target. This is loose on purpose: the loop lowpass adds
  some extra loss.

Print one line per failure and `process.exit(1)` if any fail; print `ok` otherwise.
This file must stay plain asserts, no test framework.

---

## Phase 2: Voice management and humanization

Fixes problems 3 and 7.

1. Keep `this.voices = new Array(6)` holding `{ src, gain }` for the note
   currently ringing on each string (index 0 = low E). Store every extra source
   for that string (12-string courses, Phase 4) in the same entry.
2. In `play()`, for each string `i` at the moment it is struck, `t_i`:
   - If a voice is ringing on string `i`, damp it:
     `gain.gain.setTargetAtTime(0, t_i, 0.008)` and `src.stop(t_i + 0.08)`.
   - If the new chord has `null` on string `i`, still damp the old voice at the
     strum start (the fretting hand mutes it). Use a softer time constant (0.03).
3. `stop(time)`: damp all voices with time constant 0.04 and stop at `time + 0.3`.
   Call it from `practice.js` `_stop()` with `ctx.currentTime`, and from
   `startBuilderItem` before it starts a new item.
4. Per-voice variation, applied at play time so buffers stay shared:
   - `src.detune.value = (rand − 0.5) · 3` cents (±1.5).
   - Velocity per string: `v_i = velocity · (0.85 + 0.15·rand)`.
   - Gain: `stringGain[i] · v_i^1.5`.
   - Per-voice `BiquadFilter` lowpass, `frequency = preset.brightHz · (0.35 + 0.65·v_i)`, `Q = 0.5`.
     Softer strums sound darker, as on a real guitar.
5. Strum timing: total strum time scales inversely with velocity.
   `msPerString = preset.strumMs · (1.4 − 0.4·velocity)`, plus the existing
   ±2 ms jitter. Up-strokes go high→low, use `preset.strumMs · 0.7`, and play
   only the top 4 sounding strings.
6. Disconnect each voice's nodes in `src.onended`. The persistent bus is never
   torn down per strum.

---

## Phase 3: Output chain (body, room, stereo, limiter)

Fixes problems 4 and 8. Build the bus in `_buildBus(preset)`; rebuild on
`setPreset`. When rebuilding, fade the old master to 0 over 50 ms and disconnect
it after 3 s so tails don't click.

### 3.1 Body impulse response (procedural modal IR)

`ChordAudio.makeBodyIR(modes, sampleRate)` returns a `Float32Array`, 0.25 s long:

```
ir[n] = Σ_modes A·exp(−π·f·t/Q)·sin(2π·f·t)    t = n/sr, A = 10^(gainDb/20)
      + 0.3·noise·exp(−t/0.0015)               // short broadband click keeps top end
```

Scale the IR so the sum of squares is 1. That keeps loudness roughly equal
between dry and wet paths. Load it into a `ConvolverNode` with
`normalize = false`. Mix with the dry path using `preset.body.wet` (dry gain =
`1 − wet`). The dry path keeps attack clarity.

Mode tables are in the presets below. They are approximations of published
dreadnought and classical guitar mode measurements. Treat them as tuning knobs,
not truth.

### 3.2 Room

Stereo `ConvolverNode` fed from a send. IR is 2 channels of independent
seeded noise × `exp(−6.9·t/roomSeconds)` (−60 dB at `roomSeconds`), with
10 ms of silence at the start (pre-delay). Run each channel through a one-pole
lowpass at 5 kHz while generating it so the tail isn't hissy. Send level is
`preset.room.wet`.

### 3.3 Stereo

Per voice `StereoPannerNode`, `pan = preset.panSpread · (i/5·2 − 1)`. That puts
low E slightly left and high E slightly right, like a mic in front of the player.
Default `panSpread` 0.3.

### 3.4 Tone and drive

- `preset.eq`: array of `{ type, f, q, gain }` → chain of `BiquadFilterNode`s.
- `preset.drive` (number or null): `WaveShaperNode`, curve
  `tanh(k·x)/tanh(k)` with `k = drive`, 2048 points, `oversample = "4x"`. Put a
  120 Hz highpass before it and a lowpass at `preset.cabHz` after it (simple cab).

### 3.5 Limiter and level

`DynamicsCompressorNode`: threshold −14 dB, knee 6, ratio 4, attack 0.003,
release 0.25. Then master gain `preset.master` (start at 0.8). Check by ear that
an F-barre at velocity 1 doesn't clip and that the metronome tick, which goes
straight to `destination`, is still balanced against the chord.

---

## Phase 4: Presets and UI

### 4.1 Preset table

Put `PRESETS` at the top of `chord-audio.js`. Values are starting points and
should be tuned by ear.

| Field | acoustic | nylon | twelve | electric | crunch |
|---|---|---|---|---|---|
| label | Acoustic (steel) | Classical (nylon) | 12-string | Electric clean | Electric crunch |
| bufferSeconds | 4 | 3.5 | 4 | 5 | 4 |
| t60 [lowE, highE12] | [6, 2.5] | [4.5, 1.6] | [6, 2.5] | [9, 4] | [8, 3.5] |
| stretch | 0.35 | 0.45 | 0.35 | 0.25 | 0.25 |
| pluckCutoff Hz | 6000 | 2500 | 6500 | 7000 | 7000 |
| pickPos | 0.12 | 0.18 | 0.12 | 0.10 | 0.10 |
| pickupPos | null | null | null | 0.25 (neck) | 0.08 (bridge) |
| polar {fastRatio, fastMix, cents} | .3, .55, .8 | .35, .5, .5 | .3, .55, .8 | .5, .3, .4 | .5, .3, .4 |
| brightHz (velocity LP top) | 7000 | 4000 | 8000 | 6500 | 5000 |
| strumMs | 11 | 14 | 12 | 9 | 8 |
| stringGain | .17 .17 .16 .16 .16 .17 | .18 .17 .16 .16 .16 .16 | .14 each | .17 each | .15 each |
| body | dreadnought, wet .65 | classical, wet .7 | dreadnought, wet .6 | null | null |
| eq | HP 70; highshelf 6k −3 dB | HP 70; peaking 250 Hz +2 dB; LP 4.5k | as acoustic + highshelf 8k +1 | HP 80; peaking 2.5k +2; LP 7k | peaking 800 Hz +3 |
| drive / cabHz | null | null | null | null | 3 / 4800 |
| room {seconds, wet} | 1.4, .12 | 1.6, .15 | 1.4, .14 | 1.0, .10 | 0.8, .08 |
| courses | none | none | see 4.2 | none | none |

Body mode tables (f Hz, Q, gainDb):

- **dreadnought**: (98, 12, +6), (204, 20, +4), (390, 25, +2), (550, 30, 0),
  (820, 30, −2), (1200, 25, −3), (2400, 15, −5)
- **classical**: (95, 10, +5), (190, 18, +4), (260, 22, +2), (380, 25, +1),
  (580, 30, −1), (1000, 25, −3), (2000, 15, −6)

### 4.2 12-string courses

`courses` is an array of 6 lists of extra sources per string:
`{ mult, cents, gain, offsetMs }`.

- Strings 0–3 (E A D G): one octave string `{ mult: 2, cents: +2, gain: 0.6, offsetMs: −4 }`.
  On a downstroke the thin octave string is hit just before the main one.
  On an upstroke negate `offsetMs`.
- Strings 4–5 (B E): one unison string `{ mult: 1, cents: +3, gain: 0.9, offsetMs: −3 }`.

Render course strings with `renderString` at `freq·mult` (cached like any note).
Apply `cents` via `src.detune`.

### 4.3 UI

- In `public/index.html`, next to the existing "Sound" control (the
  `.audio-mode-group` block), add a `control` with a `<label for="tone-preset">Tone</label>`
  and a native `<select id="tone-preset">` with options from the preset keys and labels.
  Reuse the existing `.control` / `.field` markup used for "Bars / chord".
- In `practice.js`, mirror the audio-mode pattern: a `TONE_KEY = "gpt_tone_preset"`
  in `localStorage` wrapped in try/catch, default `"acoustic"`, validated against
  `ChordAudio.PRESETS`. On change call `chordAudio.setPreset(key)` if it exists,
  and apply the stored preset when `chordAudio` is created in `_start()`.
- Changing the tone while playing should take effect on the next strum.
- Update the one sentence in `public/about.html` (~line 109) if the description
  of the synth changes. "Karplus-Strong plucked string synth with a modeled
  guitar body" is accurate after Phase 3.

---

## Phase 5 (optional): Strum patterns

Today the chord is struck once per bar. Real rhythm playing is the other half of
"sounds like a guitar". Do this only after Phases 1–4 sound right.

- Add `<select id="strum-pattern">` next to Tone, persisted as `gpt_strum_pattern`.
- Patterns are eighth-note strings per bar, `D` = down, `U` = up, `-` = rest:

  | Key | 4/4 | 3/4 |
  |---|---|---|
  | `bar` (default, current behavior) | `D-------` | `D-----` |
  | `quarters` | `D-D-D-D-` | `D-D-D-` |
  | `folk` | `D-DU-UDU` | `D-DUDU` |
  | `eighths` | `DUDUDUDU` | `DUDUDU` |

  For other time signatures, fall back to `D` on every beat.
- In `onBeat(beatIdx, audioTime)`, look up the two eighths for this beat
  (`beatIdx % beatsPerBar`). Schedule the on-beat stroke at `audioTime`, and the
  off-beat at `audioTime + 0.5 · 60 / this.metronome.bpm`.
- Velocity: bar downbeat 1.0, other downs 0.8, ups 0.6. Add ±5 ms timing jitter.
- Chord changes still only happen on the bar boundary already computed in `onBeat`.

---

## 6. Acceptance checklist

1. `node scripts/check-audio.mjs` prints `ok`.
2. In the browser, for each preset, play G, C, D, Em and an F barre at 60 and
   140 BPM, in both `chord` and `both` modes:
   - chords sound in tune, with no beating between strings beyond the subtle
     polarization shimmer;
   - no clicks or pops at chord changes;
   - the old chord is cut off at the new strum, with no overlap mud;
   - pressing Stop silences the guitar within ~0.3 s;
   - no clipping on the F barre;
   - no console errors.
3. The tone preset survives a reload.
4. Chrome and Safari both play (Safari ≥ 14.1 for `StereoPannerNode`).

---

## 7. Out of scope, and the honest ceiling

- **AudioWorklet / real-time synthesis.** Not needed: notes are fixed once
  struck, so pre-rendered buffers give the same result with less code, and the
  CSP doesn't allow blob workers.
- **Sympathetic string resonance, fret buzz, slide and finger noise.** Small gains
  for a lot of code.
- **The ceiling.** A good physical model with body and room reads as
  "a real guitar recorded a bit cleanly". It will not be indistinguishable from a
  recording. If that is the bar, the next step is a sampled preset: one recorded
  note per string every 3 frets, pitch-shifted with `playbackRate`, using the same
  voice manager, bus and strum code from this plan. Samples need a license-clean
  source (record your own, or CC0) and add a few MB to the site.
