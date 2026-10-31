# Guitar Practice Tracker — Market Study

**Date:** 2026-05-30
**Target user (this study):** self-taught hobbyist guitarists — adults learning on their own, no teacher, who want structure and accountability between beginner and intermediate.
**Subject app:** the local Flask + SQLite "Guitar Practice Tracker" (a.k.a. *String Time*) in this repo. Features summarized from [README.md](../README.md).

---

## 1. Executive summary

**The market has two camps and a gap.**

- **Camp A — Teaching apps.** Yousician, Fender Play, Simply Guitar, JustinGuitar, TrueFire. They sell *content* (lessons, songs). They're good at "what do I learn next?" Most are bad at "*how should I practice today, and did I actually get better?*" They use gamification (streaks, points) to mask the absence of a real practice methodology.
- **Camp B — Practice trackers.** Modacity, Andante, Instrumentive, tuneUPGRADE, TonalEnergy. They sell *journaling and metronome/tuner tooling* for musicians who already know what to practice. Most are instrument-agnostic, none are guitar-shaped, and most have no audio companion beyond a metronome/drone.

**The gap** the self-taught hobbyist falls into:
> *"I'm past the Yousician beginner curve, I don't have a teacher, I know roughly what to practice — chords, changes, progressions — but I want a structured routine, a way to play along to something musical, and proof I'm improving."*

Modacity is the closest cross-category competitor but is generic music, audio-light, and $120/yr. JustinGuitar's Practice Assistant is beloved but described in the community as "fiddly." Spreadsheets and pen-and-paper still dominate among intermediate self-taught players.

**The subject app already covers ~70% of that gap.** It's a routine builder + metronome + chord-audio engine + streak/heatmap tracker, with no subscription and no telemetry. The remaining 30% — what's missing relative to category leaders — is concentrated in five areas: deliberate-practice prompts, per-item notes/recording, tempo ramping, mobile/tablet access, and a "what should I practice today?" suggestion layer.

See §6 for the prioritized gap analysis and §7 for positioning.

---

## 2. Pain points — self-taught hobbyist guitarists

Sourced from r/Guitar, r/guitarlessons, JustinGuitar community threads, app-store reviews, and consumer-complaint aggregators. Where a quote appears it's verbatim from the linked source.

### 2.1 The "month 3 ceiling"

The single most cited complaint about Yousician and similar gamified apps:

> *"Around month three, learners hit a ceiling where the falling notes get faster but they don't feel like they're becoming musicians."* — MasterPiano review aggregation

Players notice they're scoring points without internalizing fretboard knowledge, theory, or musicality. They quit or move to lessons. The implication for a tracker app: **measure musical outcomes** (clean chord changes, tempo ranges practiced, repertoire size), not just minutes-with-the-app.

### 2.2 Past the beginner course, you're on your own

> *"I didn't have an issue in the beginning because I used the Justin App and just practiced whatever was suggested, but as I've advanced and needing to create my own routine, I'm struggling."* — JustinGuitar community thread

Self-taught intermediates lose the rails. They know they should drill chord changes, scales, songs — but not in what proportion, for how long, or in what sequence. **This is the single biggest unmet need** in the self-taught segment. Fender Play is explicitly criticized for this: *"Fender Play lacks a clear practice routine, prompting users to create their own by bookmarking exercises."* (Guitar Chalk)

### 2.3 Tracking is either too heavyweight or too distracting

> *"It's very low-friction and easy to use and I am not tempted to overthink it."* (on pen-and-paper)
> *"Another thing I need to update on my phone / pc is a distraction."*
> *"I don't like that sort of rigidity with my playing/practice…too much rigidity makes me bored."*
> — JustinGuitar community

Players reject apps that ask for lots of input *during* practice. Auto-start, big-button UIs, and "log it in two taps after you finish" wins.

### 2.4 Detection is unreliable and demoralizing

Yousician and Simply Guitar both rely on microphone-based note/chord recognition. Both attract heavy complaints:

- *"Yousician's microphone-based detection struggles with digital pianos at low volume, ambient noise, and chords played with overlapping notes."*
- *"The chord detection feature often seems incorrect in whether you're playing a chord correctly or not, which can be frustratingly inaccurate."* — Simply Guitar reviews

False negatives ("you played it wrong" when you didn't) actively teach players to distrust the app. **Implication:** don't add bad detection. If you can't do it well, don't do it.

### 2.5 Subscription fatigue and dark-pattern cancellation

PissedConsumer / Trustpilot complaint themes on Yousician (1.2★ on PissedConsumer):
- Auto-renewal annual charges, hard cancel flow
- *"20 – 30$ just seems a bit greedy to me, even Netflix doesn't cost that much."*
- Fender Play: *"It can be a real hassle to cancel a free trial that requires a credit card"* and offers no refund (vs Guitar Tricks' 60-day money-back).

This is a moat for a **one-time-purchase, local, or free** product, and it should be in your headline positioning.

### 2.6 Gamification creates streak anxiety and burnout

Although less documented on Reddit than the above, app-review threads consistently surface frustration when a missed day breaks a long streak — players feel punished for life events. The literature (consolidated in industry reviews) calls this "gamification-induced obligation." **Implication:** streak displays should be encouraging but lenient — e.g. "freeze days," week-level streaks, or showing both current and longest streak so the longest is preserved even if current resets.

### 2.7 Generic backing tracks and recycled lesson content

> *"Songs that sounded nothing like the originals, leading some to give up on it"* — Fender Play (bass)
> *"Fender re-uses a lot of content, with little difference between each course"*
> *"The song quality has dropped lately… play-along tracks now include midi guitar"* — Yousician

Players want to play *to* something musical and recognizable. A synthesized chord backing — exactly what the subject app does — is a viable alternative to bad licensed audio, *as long as it sounds reasonable.* See §6 on extending the synth into "comping" patterns.

### 2.8 "Lookup tool, not a practice environment"

A recurring criticism of free/cheap tools: chord libraries, tab sites (Ultimate Guitar), and isolated metronomes don't connect to the act of practicing. *"Users look up a chord chart, then go use another tool to actually practice it."* The subject app's bundling of chord picker + metronome + chord audio + session timer is already a differentiator versus this fragmented status quo.

### 2.9 No spaced repetition for motor skills

> *"Spaced repetition tailored to motor skills (not flashcards)"* — wishlist quote from JustinGuitar community

Anki-style SRS exists for theory and ear training, but no mainstream guitar app surfaces chord changes, lick reps, or progression drills on a spaced schedule. This is a real unserved need.

### 2.10 Common practice mistakes that a tracker could prevent

Aggregated from instructional sources:
1. Unfocused practice (no goal per session)
2. No metronome / sloppy timing
3. Playing too fast too early (no tempo ramp)
4. Inconsistent schedule
5. No feedback loop (don't record themselves)
6. Comparing to others (vs tracking own delta)

Each of these is a tracker-app design lever, not a teaching-content lever.

---

## 3. Competitor teardown

### 3.1 Yousician

| | |
|---|---|
| **Pricing (2026)** | Premium $14.99/mo or $89.99/yr; Premium+ $29.99/mo or $139.99/yr; Premium+ Family $44.99/mo or $209.99/yr. 7-day trial. |
| **Positioning** | Gamified, multi-instrument learning. Falling-notes UI. |
| **Strengths** | Engagement loop is excellent for first 3 months. Multi-instrument (guitar, piano, bass, uke, voice, drums). Large song catalog at Premium+. |
| **Weaknesses** | The "month 3 ceiling." Mic-based detection unreliable. Auto-renewal complaints. Real skill measurement absent — *"tracks points, stars and leaderboard rankings — game metrics rather than genuine guitar improvement."* |
| **Threat to subject app** | Low. Different category — Yousician is a course; subject app is a practice tool. Players who quit Yousician at month 3 are the **prime acquisition target**. |

### 3.2 Fender Play

| | |
|---|---|
| **Pricing (2026)** | $19.99/mo or $149.99/yr. No refunds. |
| **Positioning** | Polished beginner-friendly video lessons, song-driven. |
| **Strengths** | Production quality, multi-angle camera, structured beginner path, amp-preset downloads. |
| **Weaknesses** | Lacks depth past beginner (*"oversimplified for advanced and intermediate"*). No practice routine guidance. Content re-use across courses. Hard cancellation. |
| **Threat to subject app** | Low. Same dynamic as Yousician. |

### 3.3 JustinGuitar (free + app)

| | |
|---|---|
| **Pricing** | Website: free. App: freemium subscription. |
| **Positioning** | The de facto standard for free self-taught guitar education. Strong community. |
| **Strengths** | Free, beloved, structured Module 1–N curriculum. Built-in Practice Assistant. Active community forums. |
| **Weaknesses** | Practice Assistant is described as *"too fiddly."* App and website don't sync practice progress. No tracking visualization to speak of. |
| **Threat to subject app** | **Moderate — and an opportunity.** JustinGuitar users are *already convinced practice tracking matters*; they just don't love the in-house tool. Many fall back to spreadsheets. The subject app could explicitly target this audience with import/export of Justin's module list as starter routines. |

### 3.4 TrueFire

| | |
|---|---|
| **Pricing** | $29/mo or $249/yr. 14-day trial. |
| **Positioning** | Enormous video library (~85,000 lessons) for intermediate-to-advanced players. |
| **Strengths** | Genre breadth, big-name instructors, multi-cam, "In The Jam" play-with-band feature. |
| **Weaknesses** | Overwhelming, not hand-held, expensive. Not a beginner system. |
| **Threat to subject app** | None directly. Complementary — a TrueFire user could log their TrueFire-derived exercises in a tracker. |

### 3.5 Modacity — **closest direct competitor**

| | |
|---|---|
| **Pricing** | $12.99/mo or $119/yr. |
| **Positioning** | Pure deliberate-practice tracker for serious musicians (instrument-agnostic). |
| **Strengths** | Practice items list, per-item timer, recording, notes, cloud sync, deliberate-practice prompts, history log, break reminders, streaks. |
| **Weaknesses** | *"Seems more geared towards logging and recording your practice"* — users say it doesn't build routines, just logs them. Generic across instruments (no chord/fretboard primitives). No backing audio beyond metronome/drone. Subscription. |
| **Threat to subject app** | **High in feature overlap, low in positioning overlap.** Modacity is for the trained-musician segment (orchestra, classical, jazz students). The subject app's chord/progression/fretboard primitives plus synth backing is a strict superset for *guitarists*. |

### 3.6 Other practice trackers (quick takes)

- **Andante** — practice journal with mood/focus logging, streaks. Mobile-only.
- **Instrumentive** — session recording + notes + metronome. Mobile.
- **tuneUPGRADE** — reflective notes, problem-spot identification.
- **TonalEnergy** — $5.99 one-time. Tuner + metronome + recorder + intonation history + practice streaks. **Beloved.** Pricing model is the standout — *one-time payment is what the market quietly wants.*

### 3.7 Tab/notation tools (adjacent)

- **Soundslice** — $5/mo. Sync'd tab + notation + audio/YouTube. Slow-down + key change. Practice environment, not a tracker. Subject app could integrate or import.
- **Guitar Pro** — $69.95 one-time. Tab editor, playback, slow-down. Power-user tool.

### 3.8 Simply Guitar (JoyTunes)

| | |
|---|---|
| **Pricing** | $19.99/mo. 3-week trial. |
| **Positioning** | Absolute beginner, song-driven. |
| **Weaknesses** | Heavy detection complaints, missing metronome on Android, oversimplified. |
| **Threat** | None. |

---

## 4. Competitor matrix

| App | $/yr | Lessons | Routine builder | Tracking | Metronome | Backing audio | Chord/fretboard primitives | Recording | Mobile | Subscription |
|---|---|---|---|---|---|---|---|---|---|---|
| **Subject app** | **$0** | — | ✓ named, ordered, per-item BPM | ✓ heatmap + streaks + per-chord stats | ✓ | ✓ **synthesized chord strum** | ✓ custom chords + progressions | — | (web, local) | **none** |
| Yousician | $90–210 | ✓✓ | — | gamified points | ✓ | ✓ (mixed quality) | partial | — | ✓ | ✓ |
| Fender Play | $150 | ✓✓ | — | progress through path | ✓ | ✓ | — | — | ✓ | ✓ |
| JustinGuitar app | ~$70 | ✓✓✓ | partial (Practice Assistant) | partial | ✓ | ✓ (song mode) | ✓ | — | ✓ | ✓ |
| TrueFire | $249 | ✓✓✓ | — | per-course progress | — | ✓ (jam tracks) | — | — | ✓ | ✓ |
| Modacity | $119 | — | ✓ items list | ✓ full log + analytics | ✓ + drone | — | — (generic) | ✓ | ✓ | ✓ |
| TonalEnergy | $6 one-time | — | — | ✓ streaks + intonation | ✓ | — | — | ✓ | ✓ | **none** |
| Soundslice | $50 | — | — | — | ✓ | ✓ (sync tab) | ✓ tab | — | ✓ | ✓ |
| Simply Guitar | $240 | ✓ | — | — | partial | ✓ | — | — | ✓ | ✓ |

---

## 5. What the subject app uniquely does today

From [README.md](../README.md):

1. **Per-chord and per-progression metronome with synthesized strum.** Karplus-Strong per-string parameters, staggered strum, jitter. No competitor at this price/positioning does in-engine chord backing. *(Modacity has drone only. Soundslice has audio sync but no synth.)*
2. **Reusable, ordered named practice routines** with per-item BPM, time signature, bars/chord. *(Modacity has items lists; few others have any.)*
3. **Custom chords by fretboard click** and **custom progressions** with drag reorder.
4. **GitHub-style 365-day heatmap, current/longest streak, avg minutes/day, most-active hour, weekly total.** Modacity-class analytics, included free.
5. **Many-to-many chord/progression categories.** Useful filtering primitive few competitors expose.
6. **Local, single-user, no auth, no network, no telemetry, no subscription.** This is increasingly rare and increasingly valuable post-Yousician-cancellation discourse.
7. **SQLite + Flask = portable, auditable, hackable.** Power-user appeal.

**Combined, this is a strict feature superset of TonalEnergy + a guitar-shaped Modacity-lite, for $0.** That's the headline.

---

## 6. Gap analysis — what's missing vs the market

Ranked by user-pain impact × implementation cost. **P1 = ship next**, P2 = next quarter, P3 = consider.

### P1 — "What should I practice today?" assistant

**The single largest unmet need in the self-taught segment** (see §2.2). Modacity has a *deliberate-practice prompt* (categories of things to improve on). The subject app has none.

**Minimum viable:** when starting a session, surface 3 suggestions:
- A chord or progression you haven't practiced in N days
- A chord/progression where last-used BPM < a target
- One you've practiced ≥5 times (reinforcement)

This is achievable with the data you already store. No ML required — straightforward SQL over the `session` table.

### P1 — Per-item notes and quick recording

Modacity, Andante, Instrumentive all have this. Players want to leave a sticky-note for future-self: *"left-hand cramping at bar 3, slow this down tomorrow."*

**Minimum viable:** free-text note field on `session` (already exists per README) and on each `practice_session_item`. Add a single record-and-attach button using `MediaRecorder` API → blob in SQLite. No cloud, no streaming, just a 30-second snapshot you can replay tomorrow.

### P1 — Tempo ramping (slow-down to target)

Universal in the practice-tool space (Modacity, Soundslice, Guitar Pro). Cited in §2.10 as a top mistake-prevention feature.

**Minimum viable:** on a practice item, "ramp from 60 to 100 BPM over 5 minutes" — metronome auto-increments. UI: two BPM fields + duration. Backend already drives BPM per beat; this is a small scheduler change.

### P2 — Spaced repetition for chord changes

§2.9 — explicitly requested, unserved. The subject app has per-chord last-used-BPM and total time. Adding "next-review date" per chord/progression and a daily review queue is a small extension of existing schema.

**Mechanic:** track success self-reported on a 1–4 scale at end of item (like Anki). Items move further out on success, closer in on failure. Optional — players who hate gamification can ignore the queue.

### P2 — Streak leniency

§2.6 — design "freeze days" (1–2 per month), and prominently display *longest* streak alongside current. Already partly done; just emphasize the longest streak so missed days don't feel destructive.

### P2 — Tablet/phone-friendly responsive UI

Subject app is a single-page web app, but realistically people practice with a phone or tablet on a stand, not a laptop. Modacity, Yousician, etc. are mobile-first. Subject app needs to be at least responsive enough to drive from a tablet held in landscape on a music stand — big tap targets, big BPM readout.

### P2 — Comping patterns beyond downbeat strum

Currently chord backing strums on the downbeat of every bar. Adding 3–4 strum patterns (down-down-up-up-down-up, boom-chick, arpeggio) would dramatically increase how "musical" it feels to play along with. Engine groundwork is there ([chord-audio.js](../static/js/chord-audio.js)).

### P3 — Tab/notation rendering

Soundslice owns this. Open-source options exist (VexFlow, AlphaTab). Heavy lift, ambiguous user demand for the self-taught hobbyist segment (most know chord charts, fewer read tab). **Defer.**

### P3 — Song integration / play-along to recordings

Yousician's actual moat. Building this means licensing or YouTube embeds + sync — large scope. **Defer.**

### P3 — Goals and weekly plans

"Practice 5 hours this week," "learn 3 new chords this month." Lightweight. Could pair with the heatmap nicely. Lower urgency than P1/P2.

### Explicitly **not** recommended

- **Pitch/chord detection.** §2.4 — bad detection is worse than none. Don't do it unless you can do it well, which is a 6-month engineering project on its own.
- **Lessons / video content.** Don't compete with Yousician/Fender/TrueFire on their turf. Stay in the routine + tracker + backing lane.
- **Multi-instrument generalization.** Modacity occupies this niche. The subject app's value is being guitar-shaped.
- **Cloud sync as a forced feature.** Would compromise the "local, no telemetry" positioning that is itself a differentiator. If added, make it opt-in self-hosted (Dropbox folder, etc.).

---

## 7. Positioning recommendation

### Tagline candidates

- *"Your practice routine, not your subscription."*
- *"The practice room — for guitarists who already know what to play."*
- *"Local, free, no microphone listening to you. Just practice."*

### Who it's for (explicit)

- Self-taught hobbyist past the absolute-beginner stage (post-Module-7 JustinGuitar, post-month-3 Yousician).
- Players who keep a notebook or spreadsheet today and want something a bit better but not a $120/yr subscription.
- Privacy-conscious players turned off by Yousician/Fender Play's billing patterns.
- Tinkerers who like that it's a small open Flask + SQLite app they can run forever.

### Who it's **not** for

- Absolute beginners who need a teacher/curriculum — send them to JustinGuitar.
- Players who want video lessons or licensed songs — TrueFire / Fender Play.
- Phone-only users who never touch a computer — until mobile-responsive is shipped.

### Three-bullet pitch

1. **Build a real routine in 60 seconds** — ordered list of chords, progressions, and drills, each with its own BPM and duration. Run it, check things off, history is saved.
2. **A metronome that actually plays the chord** — synthesized strum on every downbeat so you're playing along to music, not a click.
3. **See your progress without a subscription** — heatmap, streaks, per-chord stats. Lives on your machine, no account.

### Pricing model recommendation

The current "free + local" is the strongest single piece of positioning given the §2.5 backlash. If monetization ever matters:

- **Stay free / open source** for the local app.
- **One-time license** ($15–25) for an optional packaged build (single-click installer for non-technical users) — TonalEnergy's $5.99 one-time is the proof point. Avoid subscriptions; the market is allergic to them in this niche.
- **Or "pay what you want" / donations.** Aligns with the audience.

---

## 8. Recommended next moves (engineering order)

1. **Ship the "what to practice today" assistant** (P1, §6.1). Highest user-value, smallest scope, uses data you already have.
2. **Per-item notes + 30s recording** (P1, §6.2). High emotional value, modest engineering.
3. **Tempo ramping** (P1, §6.3). Differentiator from Modacity, small scheduler change.
4. **Mobile/tablet responsive pass** (P2, §6.6). Unlocks the music-stand use case which is how guitarists *actually* practice.
5. **Streak leniency + prominent longest-streak** (P2, §6.5). One-line UI change, big psychological win.
6. **Comping patterns** (P2, §6.7). Plays to the app's unique audio strength.
7. **SRS chord-change queue** (P2, §6.4). Validate first with a small subset of users — could be a power feature or a flop.

---

## 9. Open questions worth user-testing

- Does the synthesized chord backing actually feel musical enough that users prefer it to silence or a click? *(If yes — lean harder into comping patterns. If no — fix the synth before adding features.)*
- Would self-taught intermediates pay $15 one-time for a packaged installer + light cloud-sync (Dropbox-style folder), or does any payment kill the "free local" appeal?
- Is the heatmap motivating or anxiety-inducing for hobbyists with irregular schedules? *(Test: A/B current-streak-only vs heatmap-with-freeze-days.)*
- Would importing a JustinGuitar module's exercise list as a starter routine be worth the engineering? *(Likely yes — it would acquire a built-in audience.)*

---

## Sources

**Reddit / community threads**
- [How do you track your Guitar Practice? — JustinGuitar Community](https://community.justinguitar.com/t/how-do-you-track-your-guitar-practice/409931)
- [Practice Routine App? — JustinGuitar Community](https://community.justinguitar.com/t/practice-routine-app/264879)
- [Difference between app and website? — JustinGuitar Community](https://community.justinguitar.com/t/difference-between-app-and-website/315199)
- [App and Website sync — JustinGuitar Community](https://community.justinguitar.com/t/app-and-website-sync/155854)

**Competitor reviews and pricing**
- [Yousician Cost and Pricing (2026) — Guitar Chalk](https://www.guitarchalk.com/yousician-cost/)
- [Yousician Review (2026) — MasterPiano](https://www.masterpiano.com/yousician-review)
- [Yousician Reviews — PissedConsumer](https://yousician.pissedconsumer.com/review.html)
- [Yousician Reviews — Trustpilot](https://www.trustpilot.com/review/yousician.com)
- [Fender Play Review (2026) — Guitar Chalk](https://www.guitarchalk.com/fender-play-review/)
- [Fender Play Review — TheGuitarLesson.com](https://www.theguitarlesson.com/fender-play-review/)
- [Fender Play review — Guitar World](https://www.guitarworld.com/reviews/fender-play-review)
- [TrueFire review — Guitar World](https://www.guitarworld.com/reviews/truefire-review)
- [TrueFire Cost & Pricing Rundown — Guitar Chalk](https://www.guitarchalk.com/truefire-cost/)
- [Modacity: Pro Music Practice — App Store](https://apps.apple.com/us/app/modacity-pro-music-practice/id1351617981)
- [Best Practice Apps for Musicians: Instrumentive vs Modacity — Ensemble Schools](https://www.ensembleschools.com/blog/apps-for-musicians/)
- [An Authentic Review of the Modacity App — akbradley.com](https://akbradley.com/2021/07/12/an-authentic-review-of-the-modacity-app/)
- [TonalEnergy Tuner & Metronome — App Store](https://apps.apple.com/us/app/tonalenergy-tuner-metronome/id497716362)
- [TonalEnergy Tuner Review — The Practice of Practice](https://thepracticeofpractice.com/2018/11/30/tonalenergy-tuner-review-just-go-get-it-already/)
- [Soundslice plans and pricing](https://www.soundslice.com/plans/)
- [Soundslice vs Guitar Pro — Active Melody Forum](https://www.activemelody.com/forums/topic/soundslice-v-guitar-pro-any-thoughts/)
- [Simply Guitar review — Guitar.com](https://guitar.com/reviews/accessories/simply-guitar-review/)
- [Simply Guitar Review — StringShock](https://stringshock.com/simply-guitar-app-review/)
- [Best Guitar Learning Apps in 2026 — Notey](https://notey.co/blog/best-guitar-learning-apps-in-2026-ranked-reviewed-beginner-to-advanced)
- [Best Guitar Apps — Guitar World](https://www.guitarworld.com/features/best-guitar-apps)
- [Best Guitar Learning Apps I've Tried (2026) — American Songwriter](https://americansongwriter.com/best-guitar-learning-app/)
- [Fender Play vs Yousician 2026 — Equipboard](https://equipboard.com/posts/fender-play-vs-yousician)

**Practice methodology**
- [How to Develop an Organized Practice Routine — Andy Lemaire](https://andylemaire.com/practice-routine/)
- [5 Tips to Create an Effective Daily Guitar Practice Routine — Musicians Institute](https://www.mi.edu/in-the-know/5-tips-effective-daily-guitar-practice-routine/)
- [The Guitar Practice Log — Classical Guitar Shed](https://classicalguitarshed.com/guitar-practice-log-journal/)
- [Avoid the Rut — Guitar Tricks Blog](https://www.guitartricks.com/blog/Avoid-the-Rut-10-Boredom-Busting-Tips-for-Guitarists)
