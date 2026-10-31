# String Time 🎸

A guitar practice tracker that runs entirely in your browser. No account,
no backend, no tracking. Your practice data lives in IndexedDB on your own
device.

Live: **https://stringtime.com** · Source: this repo.

![String Time dashboard](docs/screenshot-dashboard.jpg)

## What it does

- **Practice** — pick a chord or progression, set BPM (40–240) and time
  signature (4/4, 3/4, 6/8). A 4-bar horizontal playhead stays locked to
  `audioContext.currentTime` so audio and visuals never drift.
- **Chord audio** — Karplus-Strong plucked-string synth with per-string
  decay, brightness and pick-attack. Each strum is staggered ~70 ms across
  six strings with jitter so it feels hand-played.
- **Progressions** — build custom chord sequences, choose bars-per-chord
  (1, 2 or 4), drag to reorder.
- **Custom chords** — click fretboard positions or type `x 3 2 0 1 0` style
  notation. Frets 0–24.
- **Routines** — named reusable practice sessions, each item with its own
  target, duration, BPM and ramp. Checked off as you complete them.
- **Categories** — group chords or progressions into tags.
- **History & stats** — GitHub-style 365-day heatmap, bar chart with
  days/weeks/months toggle, current and longest streak, average
  minutes/day, most active hour of day, per-chord totals.
- **Today's plan** — picks three chords and a progression to drill based on
  accuracy, days since practice, and BPM plateau detection.
- **Export / Import** — one-click JSON backup you can carry to another
  browser or machine.

## Architecture

```
Browser                                     Cloudflare Pages (CDN)
┌──────────────────────────┐                ┌──────────────────────┐
│  index.html              │ ◄───static ────│  public/             │
│  static/js/*.js          │                │   index.html         │
│  static/css/styles.css   │                │   static/            │
│                          │ ◄── library ───│   library.json       │
│  ┌────────────────────┐  │                │   terms.html         │
│  │ IndexedDB          │  │                │   privacy.html       │
│  │  • chord           │  │                │   _headers           │
│  │  • progression     │  │                └──────────────────────┘
│  │  • session         │  │
│  │  • practice_session│  │                No server. No DB. No logs.
│  │  • …               │  │                Each push to main
│  └────────────────────┘  │                auto-deploys the whole site.
└──────────────────────────┘
```

- **No backend.** All runtime data stays in each visitor's own IndexedDB,
  seeded on first visit from `/library.json` (26 chords, 29 progressions,
  16 practice modules).
- **No server state.** Cloudflare Pages serves static files from its CDN.
  There is nothing to log into, no DB to back up, no VM to patch.
- **Export / Import** is how you move your data between browsers.

## Project layout

```
public/                       ← Cloudflare Pages serves this directory
  index.html                    main app shell
  terms.html, privacy.html      legal pages
  404.html                      not-found page
  library.json                  baked seed data (chords, progressions, routines)
  _headers                      Cloudflare Pages: CSP, HSTS, cache rules
  static/
    css/styles.css
    js/
      store.js                  IndexedDB wrapper + Api facade
      app.js                    boot, wires modules together
      practice.js               practice flow, picker, mode toggle
      metronome.js              Web Audio scheduler + playhead SVG
      chord-audio.js            Karplus-Strong synth
      chord-diagram.js          fretboard SVG
      chord-builder.js          custom chord editor
      progression-builder.js    drag-reorder progression sequencer
      practice-session-builder.js  named routines
      dashboard.js              Today view
      history.js                heatmap, chart, sessions list
      widgets.js                shared chart/pill helpers
      export-import.js          footer buttons

scripts/
  bake-library.py             rebuilds public/library.json from a seeded SQLite DB
```

## Deploying

Pushed to `main` → Cloudflare Pages picks it up, uploads `public/` to the
CDN, swaps `https://stringtime.com` to the new version. No build step
needed. Preview URLs are kept for every previous deploy so you can roll
back in one click.

Cloudflare Pages settings:
- **Framework preset:** None
- **Build command:** (empty)
- **Build output directory:** `public`

## Local development

Any static server will do:

```bash
cd public && python -m http.server 8766
```

Then open <http://127.0.0.1:8766>. The app seeds itself on first load.

### Rebuilding `library.json`

The seed data (26 built-in chords, 29 progressions, 16 routine modules)
lives in SQLite only during the old-backend bake step. To change it, edit
the Python seed definitions on the `backup/pre-cloudflare` branch, run the
old Flask app once to populate `data/practice.db`, then:

```bash
python scripts/bake-library.py
```

That rewrites `public/library.json`. Commit and push.

## Security

- No authentication surface (no accounts, no cookies, no session tokens).
- No server, no API — the entire attack surface is a static CDN.
- `_headers` sets strict CSP (`script-src 'self'`), HSTS, X-Frame-Options
  DENY, Referrer-Policy no-referrer, and a Permissions-Policy that
  disables mic / camera / geo / payment.
- No analytics, no third-party JS beyond Google Fonts' CSS link.
- Imported JSON files are treated as untrusted input: fields are stored
  verbatim and rendered via `.textContent`, never `innerHTML`.

## Privacy

See [public/privacy.html](public/privacy.html) — the short version is: we
collect nothing, we run no server, your data stays in your browser.

## Legal

- [Terms of Use](public/terms.html)
- [Privacy Policy](public/privacy.html)

Not professional instruction, not medical advice. For personal practice.

## License

Open source — see repository for details.

---

🤖 This project uses [Claude Code](https://claude.com/claude-code) for
development assistance.
