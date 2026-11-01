/* String Time — browser-local store.
 *
 * Replaces the Flask backend. All data lives in IndexedDB in each visitor's
 * browser, seeded once from /library.json. Exposes window.Api with the exact
 * response shapes the old Flask routes returned, so the rest of the frontend
 * doesn't have to change beyond swapping fetch(...) for Api.*(...).
 */
(function () {
  "use strict";

  const DB_NAME = "stringtime";
  const DB_VERSION = 1;
  const STORES = [
    { name: "chord",                       opts: { keyPath: "id" } },
    { name: "progression",                 opts: { keyPath: "id" } },
    { name: "progression_chord",           opts: { keyPath: ["progression_id", "position"] } },
    { name: "chord_category",              opts: { keyPath: "id" } },
    { name: "chord_category_member",       opts: { keyPath: ["category_id", "chord_id"] } },
    { name: "progression_category",        opts: { keyPath: "id" } },
    { name: "progression_category_member", opts: { keyPath: ["category_id", "progression_id"] } },
    { name: "session",                     opts: { keyPath: "id", autoIncrement: true },
      indexes: [{ name: "started_at", keyPath: "started_at" }] },
    { name: "practice_session",            opts: { keyPath: "id" } },
    { name: "practice_session_item",       opts: { keyPath: "id" },
      indexes: [{ name: "session_id", keyPath: "session_id" }] },
    { name: "routine_exercise_completion", opts: { keyPath: "exercise_id" } },
    { name: "meta",                        opts: { keyPath: "key" } },
  ];

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s.name)) {
            const os = db.createObjectStore(s.name, s.opts);
            for (const idx of s.indexes || []) {
              os.createIndex(idx.name, idx.keyPath, idx.options || {});
            }
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function tx(storeNames, mode) {
    return openDB().then((db) => db.transaction(storeNames, mode));
  }

  function req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAll(storeName) {
    const t = await tx([storeName], "readonly");
    return req(t.objectStore(storeName).getAll());
  }

  async function get(storeName, key) {
    const t = await tx([storeName], "readonly");
    return req(t.objectStore(storeName).get(key));
  }

  async function put(storeName, obj) {
    const t = await tx([storeName], "readwrite");
    return req(t.objectStore(storeName).put(obj));
  }

  async function del(storeName, key) {
    const t = await tx([storeName], "readwrite");
    return req(t.objectStore(storeName).delete(key));
  }

  async function clearStore(storeName) {
    const t = await tx([storeName], "readwrite");
    return req(t.objectStore(storeName).clear());
  }

  async function count(storeName) {
    const t = await tx([storeName], "readonly");
    return req(t.objectStore(storeName).count());
  }

  // ---------- Seed from library.json ----------

  const LIBRARY_META_KEY = "library_version";

  async function seedIfNeeded() {
    const meta = await get("meta", LIBRARY_META_KEY);
    // Bypass the HTTP cache so a deploy's new seed data is picked up on the
    // next load, not an hour later when the stale JSON finally revalidates.
    const res = await fetch("library.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("library.json fetch failed: " + res.status);
    const lib = await res.json();
    if (meta && meta.value === lib.schema_version) return; // already seeded

    const t = await tx([
      "chord", "progression", "progression_chord",
      "chord_category", "chord_category_member",
      "progression_category", "progression_category_member",
      "meta",
    ], "readwrite");

    const putOne = (storeName, obj) => t.objectStore(storeName).put(obj);

    for (const c of lib.chords) {
      putOne("chord", { ...c, is_custom: false });
    }
    for (const p of lib.progressions) {
      putOne("progression", { ...p, is_custom: false });
    }
    for (const pc of lib.progression_chords) {
      putOne("progression_chord", pc);
    }
    for (const cat of lib.chord_categories) {
      putOne("chord_category", cat);
    }
    for (const m of lib.chord_category_members) {
      putOne("chord_category_member", m);
    }
    for (const cat of lib.progression_categories) {
      putOne("progression_category", cat);
    }
    for (const m of lib.progression_category_members) {
      putOne("progression_category_member", m);
    }
    putOne("meta", { key: LIBRARY_META_KEY, value: lib.schema_version });

    await new Promise((resolve, reject) => {
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  }

  // ---------- ID allocation for user-created items ----------
  // Library IDs are small ints (1..~1000). User IDs are timestamps so they
  // never collide and sort stably by creation time.
  let _lastId = 0;
  function newId() {
    const now = Date.now();
    _lastId = now > _lastId ? now : _lastId + 1;
    return _lastId;
  }

  // ---------- Helpers ----------

  function nowIso() { return new Date().toISOString(); }
  function todayIso() { return new Date().toISOString().slice(0, 10); }

  function parseIsoDate(s) {
    try { return new Date(s.replace(/Z$/, "")); } catch { return null; }
  }

  function dateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function startOfLocalDay(iso) {
    // SQLite date(x) in old backend used UTC; we match local-day to keep heatmap
    // intuitive for the user ("today" means the user's calendar today).
    const d = new Date(iso);
    return dateStr(d);
  }

  async function sessionsForTarget(targetType, targetId, allSessions) {
    const list = allSessions || (await getAll("session"));
    return list.filter((s) => s.target_type === targetType && s.target_id === targetId);
  }

  // ---------- Stats helpers (mirror backend joins) ----------

  function chordStatsFrom(sessions, chordId) {
    const own = sessions.filter((s) => s.target_type === "chord" && s.target_id === chordId);
    own.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
    const total = own.reduce((a, s) => a + (s.duration_seconds || 0), 0);
    const trend = own.slice(0, 10).map((s) => s.bpm).reverse();
    const cutoff30 = new Date(Date.now() - 30 * 86400000).toISOString();
    const acc30 = own.filter((s) => s.started_at >= cutoff30 && s.accuracy != null);
    const acc30avg = acc30.length ? acc30.reduce((a, s) => a + s.accuracy, 0) / acc30.length : null;
    return {
      total_practice_seconds: total,
      sessions_count: own.length,
      last_practiced_at: own[0] ? own[0].started_at : null,
      last_bpm: own[0] ? own[0].bpm : null,
      accuracy_30d: acc30avg,
      bpm_trend: trend,
    };
  }

  function progStatsFrom(sessions, progId) {
    const own = sessions.filter((s) => s.target_type === "progression" && s.target_id === progId);
    own.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
    const total = own.reduce((a, s) => a + (s.duration_seconds || 0), 0);
    const trend = own.slice(0, 10).map((s) => s.bpm).reverse();
    return {
      total_practice_seconds: total,
      sessions_count: own.length,
      last_practiced_at: own[0] ? own[0].started_at : null,
      last_bpm: own[0] ? own[0].bpm : null,
      bpm_trend: trend,
    };
  }

  // ---------- Validators ----------
  const VALID_TS = new Set(["4/4", "3/4", "6/8"]);
  const VALID_BPC = new Set([1, 2, 4]);

  // ---------- API facade (mirrors old Flask responses) ----------

  const Api = {
    async init() {
      await openDB();
      await seedIfNeeded();
    },

    // --- Chords ---
    async listChords() {
      const [chords, sessions] = await Promise.all([getAll("chord"), getAll("session")]);
      chords.sort((a, b) => {
        if (!!a.is_custom !== !!b.is_custom) return (a.is_custom ? 1 : 0) - (b.is_custom ? 1 : 0);
        return a.display_name.localeCompare(b.display_name, undefined, { sensitivity: "base" });
      });
      return chords.map((c) => ({
        id: c.id,
        name: c.name,
        display_name: c.display_name,
        frets: c.frets,
        fingers: c.fingers,
        is_custom: !!c.is_custom,
        ...chordStatsFrom(sessions, c.id),
      }));
    },

    async createChord({ display_name, frets, fingers }) {
      display_name = (display_name || "").trim();
      if (!display_name) throw httpError(400, "display_name required");
      if (!Array.isArray(frets) || frets.length !== 6) throw httpError(400, "frets must be 6-element list");
      for (const f of frets) {
        if (f != null && (!Number.isInteger(f) || f < 0 || f > 24)) {
          throw httpError(400, "fret values must be null or int 0..24");
        }
      }
      fingers = fingers && fingers.length === 6 ? fingers : [null, null, null, null, null, null];
      const all = await getAll("chord");
      const base = `${display_name}_custom`;
      let suffix = 1;
      let name = `${base}_${suffix}`;
      const taken = new Set(all.map((c) => c.name));
      while (taken.has(name)) name = `${base}_${++suffix}`;
      const obj = { id: newId(), name, display_name, frets, fingers, is_custom: true };
      await put("chord", obj);
      return { ...obj, total_practice_seconds: 0, last_bpm: null };
    },

    async deleteChord(id) {
      const existing = await get("chord", id);
      if (!existing) throw httpError(404, "not found");
      const pcs = await getAll("progression_chord");
      if (pcs.some((pc) => pc.chord_id === id)) {
        throw httpError(400, "chord is used by a progression — remove it from the progression first");
      }
      // Also clean up category memberships referencing this chord
      const mem = await getAll("chord_category_member");
      const t = await tx(["chord", "chord_category_member"], "readwrite");
      t.objectStore("chord").delete(id);
      for (const m of mem) if (m.chord_id === id) t.objectStore("chord_category_member").delete([m.category_id, m.chord_id]);
      await txDone(t);
    },

    async chordTrend(chordId, limit = 10) {
      const sessions = await getAll("session");
      const own = sessions
        .filter((s) => s.target_type === "chord" && s.target_id === chordId)
        .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
        .slice(0, limit)
        .reverse();
      return {
        bpm: own.map((s) => s.bpm),
        accuracy: own.map((s) => (s.accuracy != null ? s.accuracy : null)),
      };
    },

    // --- Progressions ---
    async listProgressions() {
      const [progs, pcs, chords, sessions] = await Promise.all([
        getAll("progression"), getAll("progression_chord"),
        getAll("chord"), getAll("session"),
      ]);
      const chordById = new Map(chords.map((c) => [c.id, c]));
      const pcByProg = new Map();
      for (const pc of pcs) {
        if (!pcByProg.has(pc.progression_id)) pcByProg.set(pc.progression_id, []);
        pcByProg.get(pc.progression_id).push(pc);
      }
      progs.sort((a, b) => {
        if (!!a.is_custom !== !!b.is_custom) return (a.is_custom ? 1 : 0) - (b.is_custom ? 1 : 0);
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
      return progs.map((p) => {
        const members = (pcByProg.get(p.id) || []).sort((a, b) => a.position - b.position);
        const chordsInline = members
          .map((m) => chordById.get(m.chord_id))
          .filter(Boolean)
          .map((c) => ({
            id: c.id,
            name: c.name,
            display_name: c.display_name,
            frets: c.frets,
            fingers: c.fingers,
            is_custom: !!c.is_custom,
            ...chordStatsFrom(sessions, c.id),
          }));
        return {
          id: p.id,
          name: p.name,
          time_signature: p.time_signature,
          bars_per_chord: p.bars_per_chord,
          is_custom: !!p.is_custom,
          chords: chordsInline,
          ...progStatsFrom(sessions, p.id),
        };
      });
    },

    async createProgression({ name, chord_ids, time_signature = "4/4", bars_per_chord = 1 }) {
      name = (name || "").trim();
      if (!name || !Array.isArray(chord_ids) || chord_ids.length === 0) {
        throw httpError(400, "name and chord_ids required");
      }
      if (!VALID_TS.has(time_signature)) throw httpError(400, "time_signature must be 4/4, 3/4, or 6/8");
      bars_per_chord = parseInt(bars_per_chord, 10);
      if (!VALID_BPC.has(bars_per_chord)) throw httpError(400, "bars_per_chord must be 1, 2, or 4");

      const id = newId();
      const t = await tx(["progression", "progression_chord"], "readwrite");
      t.objectStore("progression").put({
        id, name, time_signature, bars_per_chord, is_custom: true,
      });
      chord_ids.forEach((cid, pos) => {
        t.objectStore("progression_chord").put({ progression_id: id, position: pos, chord_id: parseInt(cid, 10) });
      });
      await txDone(t);
      return { id };
    },

    async deleteProgression(id) {
      const existing = await get("progression", id);
      if (!existing) throw httpError(404, "not found");
      const sessions = await getAll("session");
      if (sessions.some((s) => s.target_type === "progression" && s.target_id === id)) {
        throw httpError(400, "progression has logged sessions");
      }
      const pcs = await getAll("progression_chord");
      const mems = await getAll("progression_category_member");
      const t = await tx(["progression", "progression_chord", "progression_category_member"], "readwrite");
      t.objectStore("progression").delete(id);
      for (const pc of pcs) if (pc.progression_id === id) t.objectStore("progression_chord").delete([pc.progression_id, pc.position]);
      for (const m of mems) if (m.progression_id === id) t.objectStore("progression_category_member").delete([m.category_id, m.progression_id]);
      await txDone(t);
    },

    // --- Chord categories ---
    async listChordCategories() {
      const [cats, mems] = await Promise.all([getAll("chord_category"), getAll("chord_category_member")]);
      cats.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      return cats.map((c) => ({
        id: c.id,
        name: c.name,
        chord_ids: mems.filter((m) => m.category_id === c.id).map((m) => m.chord_id),
      }));
    },

    async createChordCategory({ name }) {
      name = (name || "").trim();
      if (!name) throw httpError(400, "name required");
      const all = await getAll("chord_category");
      if (all.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw httpError(409, "category already exists");
      const id = newId();
      await put("chord_category", { id, name });
      return { id, name, chord_ids: [] };
    },

    async deleteChordCategory(id) {
      const existing = await get("chord_category", id);
      if (!existing) throw httpError(404, "not found");
      const mems = await getAll("chord_category_member");
      const t = await tx(["chord_category", "chord_category_member"], "readwrite");
      t.objectStore("chord_category").delete(id);
      for (const m of mems) if (m.category_id === id) t.objectStore("chord_category_member").delete([m.category_id, m.chord_id]);
      await txDone(t);
    },

    async addChordToCategory(catId, chordId) {
      if (!(await get("chord_category", catId))) throw httpError(404, "category not found");
      if (!(await get("chord", chordId))) throw httpError(404, "chord not found");
      await put("chord_category_member", { category_id: catId, chord_id: chordId });
    },

    async removeChordFromCategory(catId, chordId) {
      await del("chord_category_member", [catId, chordId]);
    },

    // --- Progression categories ---
    async listProgressionCategories() {
      const [cats, mems] = await Promise.all([
        getAll("progression_category"), getAll("progression_category_member"),
      ]);
      cats.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      return cats.map((c) => ({
        id: c.id,
        name: c.name,
        progression_ids: mems.filter((m) => m.category_id === c.id).map((m) => m.progression_id),
      }));
    },

    async createProgressionCategory({ name }) {
      name = (name || "").trim();
      if (!name) throw httpError(400, "name required");
      const all = await getAll("progression_category");
      if (all.some((c) => c.name.toLowerCase() === name.toLowerCase())) throw httpError(409, "category already exists");
      const id = newId();
      await put("progression_category", { id, name });
      return { id, name, progression_ids: [] };
    },

    async deleteProgressionCategory(id) {
      const existing = await get("progression_category", id);
      if (!existing) throw httpError(404, "not found");
      const mems = await getAll("progression_category_member");
      const t = await tx(["progression_category", "progression_category_member"], "readwrite");
      t.objectStore("progression_category").delete(id);
      for (const m of mems) if (m.category_id === id) t.objectStore("progression_category_member").delete([m.category_id, m.progression_id]);
      await txDone(t);
    },

    async addProgressionToCategory(catId, progId) {
      if (!(await get("progression_category", catId))) throw httpError(404, "category not found");
      if (!(await get("progression", progId))) throw httpError(404, "progression not found");
      await put("progression_category_member", { category_id: catId, progression_id: progId });
    },

    async removeProgressionFromCategory(catId, progId) {
      await del("progression_category_member", [catId, progId]);
    },

    // --- Practice sessions (named routines) ---
    async listPracticeSessions() {
      const [sessions, items, chords, progs] = await Promise.all([
        getAll("practice_session"), getAll("practice_session_item"),
        getAll("chord"), getAll("progression"),
      ]);
      const chordById = new Map(chords.map((c) => [c.id, c]));
      const progById = new Map(progs.map((p) => [p.id, p]));
      sessions.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      const today = todayIso();
      return sessions.map((s) => {
        const itemsForSession = items
          .filter((i) => i.session_id === s.id)
          .sort((a, b) => a.position - b.position)
          .map((i) => ({
            ...i,
            target_name:
              i.target_type === "chord"
                ? (chordById.get(i.target_id) || {}).display_name
                : (progById.get(i.target_id) || {}).name,
          }));
        const total_today = itemsForSession
          .filter((i) => i.completed_at && i.completed_at.startsWith(today))
          .reduce((a, i) => a + (i.duration_seconds || 0), 0);
        return {
          id: s.id,
          name: s.name,
          created_at: s.created_at,
          target_minutes: s.target_minutes ?? null,
          streak_days: s.streak_days || 0,
          last_completed_at: s.last_completed_at || null,
          total_done_seconds_today: total_today,
          items: itemsForSession,
        };
      });
    },

    async createPracticeSession({ name }) {
      name = (name || "").trim();
      if (!name) throw httpError(400, "name required");
      const now = nowIso();
      const id = newId();
      await put("practice_session", {
        id, name, created_at: now, target_minutes: null, streak_days: 0, last_completed_at: null,
      });
      return { id, name, created_at: now, items: [] };
    },

    async updatePracticeSession(id, { name, target_minutes }) {
      name = (name || "").trim();
      if (!name) throw httpError(400, "name required");
      const existing = await get("practice_session", id);
      if (!existing) throw httpError(404, "not found");
      if (target_minutes != null) {
        target_minutes = parseInt(target_minutes, 10);
        if (Number.isNaN(target_minutes)) throw httpError(400, "target_minutes must be an integer");
      } else {
        target_minutes = null;
      }
      await put("practice_session", { ...existing, name, target_minutes });
      return { id, name, target_minutes };
    },

    async deletePracticeSession(id) {
      const existing = await get("practice_session", id);
      if (!existing) throw httpError(404, "not found");
      const items = await getAll("practice_session_item");
      const t = await tx(["practice_session", "practice_session_item"], "readwrite");
      t.objectStore("practice_session").delete(id);
      for (const i of items) if (i.session_id === id) t.objectStore("practice_session_item").delete(i.id);
      await txDone(t);
    },

    async addPracticeSessionItem(sessionId, data) {
      if (!(await get("practice_session", sessionId))) throw httpError(404, "session not found");
      const { target_type, target_id } = data;
      if (!["chord", "progression"].includes(target_type)) throw httpError(400, "target_type must be chord or progression");
      if (!target_id) throw httpError(400, "target_id required");
      const items = await getAll("practice_session_item");
      const siblings = items.filter((i) => i.session_id === sessionId);
      const position = siblings.length ? Math.max(...siblings.map((i) => i.position)) + 1 : 0;
      const duration_seconds = parseInt(data.duration_seconds ?? 120, 10);
      const bpm = parseInt(data.bpm ?? 80, 10);
      const bars_per_chord = parseInt(data.bars_per_chord ?? 1, 10);
      const time_signature = data.time_signature || "4/4";
      if (!VALID_TS.has(time_signature)) throw httpError(400, "invalid time_signature");
      const ramp_percent = data.ramp_percent != null
        ? Math.max(0, Math.min(100, parseInt(data.ramp_percent, 10) || 0))
        : 0;
      const id = newId();
      const item = {
        id, session_id: sessionId, position, target_type, target_id: parseInt(target_id, 10),
        duration_seconds, bpm, time_signature, bars_per_chord,
        ramp_percent, completed_at: null,
      };
      await put("practice_session_item", item);
      const chord = target_type === "chord" ? await get("chord", item.target_id) : null;
      const prog = target_type === "progression" ? await get("progression", item.target_id) : null;
      return { ...item, target_name: chord ? chord.display_name : prog ? prog.name : null };
    },

    async updatePracticeSessionItem(sessionId, itemId, data) {
      const item = await get("practice_session_item", itemId);
      if (!item || item.session_id !== sessionId) throw httpError(404, "not found");
      const target_type = data.target_type || item.target_type;
      if (!["chord", "progression"].includes(target_type)) throw httpError(400, "invalid target_type");
      const target_id = data.target_id != null ? parseInt(data.target_id, 10) : item.target_id;
      const duration_seconds = data.duration_seconds != null ? parseInt(data.duration_seconds, 10) : item.duration_seconds;
      const bpm = data.bpm != null ? parseInt(data.bpm, 10) : item.bpm;
      const time_signature = data.time_signature || item.time_signature;
      if (!VALID_TS.has(time_signature)) throw httpError(400, "invalid time_signature");
      const bars_per_chord = data.bars_per_chord != null ? parseInt(data.bars_per_chord, 10) : item.bars_per_chord;
      const ramp_percent = data.ramp_percent != null
        ? Math.max(0, Math.min(100, parseInt(data.ramp_percent, 10) || 0))
        : (item.ramp_percent || 0);
      const next = {
        ...item, target_type, target_id, duration_seconds, bpm,
        time_signature, bars_per_chord, ramp_percent,
      };
      await put("practice_session_item", next);
      return next;
    },

    async deletePracticeSessionItem(sessionId, itemId) {
      const item = await get("practice_session_item", itemId);
      if (!item || item.session_id !== sessionId) throw httpError(404, "not found");
      await del("practice_session_item", itemId);
    },

    async setPracticeItemCompleted(sessionId, itemId, completed = true) {
      const item = await get("practice_session_item", itemId);
      if (!item || item.session_id !== sessionId) throw httpError(404, "not found");
      item.completed_at = completed ? nowIso() : null;
      await put("practice_session_item", item);
      return { id: itemId, completed_at: item.completed_at };
    },

    // --- Logged practice sessions ---
    async listSessions({ limit = 50, offset = 0 } = {}) {
      const all = await getAll("session");
      all.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
      const total = all.length;
      const page = all.slice(offset, offset + limit);
      const [chords, progs] = await Promise.all([getAll("chord"), getAll("progression")]);
      const chordById = new Map(chords.map((c) => [c.id, c]));
      const progById = new Map(progs.map((p) => [p.id, p]));
      const items = page.map((s) => ({
        ...s,
        target_name:
          s.target_type === "chord"
            ? (chordById.get(s.target_id) || {}).display_name
            : (progById.get(s.target_id) || {}).name,
      }));
      return { items, total };
    },

    async createSession(data) {
      const required = ["started_at", "ended_at", "duration_seconds", "bpm", "time_signature", "target_type", "target_id"];
      for (const k of required) if (!(k in data)) throw httpError(400, `${k} required`);
      if (!["chord", "progression"].includes(data.target_type)) throw httpError(400, "target_type must be 'chord' or 'progression'");
      let accuracy = null;
      if (data.accuracy != null) {
        accuracy = Number(data.accuracy);
        if (Number.isNaN(accuracy) || accuracy < 0 || accuracy > 1) throw httpError(400, "accuracy must be between 0.0 and 1.0");
      }
      const id = newId();
      await put("session", {
        id,
        started_at: data.started_at,
        ended_at: data.ended_at,
        duration_seconds: parseInt(data.duration_seconds, 10),
        bpm: parseInt(data.bpm, 10),
        time_signature: data.time_signature,
        bars_per_chord: parseInt(data.bars_per_chord ?? 1, 10),
        target_type: data.target_type,
        target_id: parseInt(data.target_id, 10),
        notes: data.notes || null,
        accuracy,
      });
      return { id };
    },

    async deleteSession(id) {
      const existing = await get("session", id);
      if (!existing) throw httpError(404, "not found");
      await del("session", id);
    },

    // --- Stats ---
    async statsHeatmap({ days = 365 } = {}) {
      const sessions = await getAll("session");
      const cutoff = new Date(Date.now() - days * 86400000);
      const cutoffStr = dateStr(cutoff);
      const byDay = new Map();
      for (const s of sessions) {
        const d = startOfLocalDay(s.started_at);
        if (d < cutoffStr) continue;
        byDay.set(d, (byDay.get(d) || 0) + (s.duration_seconds || 0));
      }
      return Array.from(byDay.entries())
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, total_seconds]) => ({ date, total_seconds }));
    },

    async statsProgress({ range = "days", count = 14 } = {}) {
      const sessions = await getAll("session");
      const today = new Date();
      const byDay = new Map();
      for (const s of sessions) {
        const d = startOfLocalDay(s.started_at);
        byDay.set(d, (byDay.get(d) || 0) + (s.duration_seconds || 0));
      }

      if (range === "days") {
        const n = Math.min(parseInt(count, 10) || 14, 90);
        const out = [];
        for (let i = n - 1; i >= 0; i--) {
          const d = new Date(today); d.setDate(d.getDate() - i);
          const key = dateStr(d);
          const label = `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`;
          out.push({ label, total_seconds: byDay.get(key) || 0 });
        }
        return out;
      }

      if (range === "weeks") {
        const dayIdx = (today.getDay() + 6) % 7; // Monday=0
        const monday = new Date(today); monday.setDate(monday.getDate() - dayIdx);
        const out = [];
        for (let w = 9; w >= 0; w--) {
          const ws = new Date(monday); ws.setDate(ws.getDate() - w * 7);
          let total = 0;
          for (let j = 0; j < 7; j++) {
            const d = new Date(ws); d.setDate(d.getDate() + j);
            total += byDay.get(dateStr(d)) || 0;
          }
          const label = `${ws.toLocaleString("en", { month: "short" })} ${ws.getDate()}`;
          out.push({ label, total_seconds: total });
        }
        return out;
      }

      if (range === "months") {
        const months = [];
        let y = today.getFullYear(), m = today.getMonth() + 1;
        for (let i = 0; i < 10; i++) {
          months.push([y, m]);
          m--; if (m === 0) { m = 12; y--; }
        }
        months.reverse();
        const byMonth = new Map();
        for (const [k, v] of byDay) {
          const ym = k.slice(0, 7);
          byMonth.set(ym, (byMonth.get(ym) || 0) + v);
        }
        return months.map(([yr, mo]) => {
          const key = `${yr}-${String(mo).padStart(2, "0")}`;
          const label = new Date(yr, mo - 1, 1).toLocaleString("en", { month: "short", year: "2-digit" }).replace(" ", " '");
          return { label, total_seconds: byMonth.get(key) || 0 };
        });
      }

      return [];
    },

    async statsSummary() {
      const sessions = await getAll("session");
      const today = new Date();
      const todayStr = dateStr(today);

      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - 6);
      const weekStartStr = dateStr(weekStart);
      const week_seconds = sessions
        .filter((s) => startOfLocalDay(s.started_at) >= weekStartStr)
        .reduce((a, s) => a + (s.duration_seconds || 0), 0);

      const daySet = new Set(sessions.map((s) => startOfLocalDay(s.started_at)));
      const sortedDays = Array.from(daySet).sort();

      let streak = 0;
      let cursor = new Date(today);
      if (!daySet.has(dateStr(cursor))) cursor.setDate(cursor.getDate() - 1);
      while (daySet.has(dateStr(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }

      let longest = 0;
      if (sortedDays.length) {
        let run = 1;
        for (let i = 1; i < sortedDays.length; i++) {
          const prev = new Date(sortedDays[i - 1]);
          const curr = new Date(sortedDays[i]);
          const diff = Math.round((curr - prev) / 86400000);
          if (diff === 1) run++;
          else { longest = Math.max(longest, run); run = 1; }
        }
        longest = Math.max(longest, run);
      }

      const avgCutoff = new Date(today); avgCutoff.setDate(avgCutoff.getDate() - 29);
      const avgCutoffStr = dateStr(avgCutoff);
      const total30 = sessions
        .filter((s) => startOfLocalDay(s.started_at) >= avgCutoffStr)
        .reduce((a, s) => a + (s.duration_seconds || 0), 0);
      const avg_min_per_day = Math.round(((total30 / 30) / 60) * 10) / 10;

      const hourCounts = new Map();
      for (const s of sessions) {
        const h = new Date(s.started_at).getHours();
        hourCounts.set(h, (hourCounts.get(h) || 0) + 1);
      }
      let most_active_hour = null, best = -1;
      for (const [h, n] of hourCounts) if (n > best) { best = n; most_active_hour = h; }

      return {
        week_seconds,
        streak_days: streak,
        longest_streak: longest,
        avg_min_per_day,
        most_active_hour,
      };
    },

    // --- Plan ---
    async planToday() {
      const [chords, sessions] = await Promise.all([getAll("chord"), getAll("session")]);
      if (!chords.length) return [];
      const today = new Date();
      const cutoff30 = new Date(today); cutoff30.setDate(cutoff30.getDate() - 30);
      const cutoff7 = new Date(today); cutoff7.setDate(cutoff7.getDate() - 7);
      const cutoff30Iso = cutoff30.toISOString();
      const cutoff7Iso = cutoff7.toISOString();

      const scored = chords.map((c) => {
        const own = sessions.filter((s) => s.target_type === "chord" && s.target_id === c.id);
        own.sort((a, b) => (a.started_at < b.started_at ? 1 : -1));
        const last = own[0] ? own[0].started_at : null;
        let days_since = 999;
        if (last) {
          const d = new Date(last);
          days_since = Math.max(0, Math.floor((today - d) / 86400000));
        }
        const acc30items = own.filter((s) => s.started_at >= cutoff30Iso && s.accuracy != null);
        const accuracy = acc30items.length
          ? acc30items.reduce((a, s) => a + s.accuracy, 0) / acc30items.length
          : 0.75;
        const current_bpm = own[0] ? own[0].bpm : 0;
        const older = own.find((s) => s.started_at <= cutoff7Iso);
        const old_bpm = older ? older.bpm : 0;
        const bpm_plateau = !!(current_bpm && current_bpm === old_bpm);
        const score = days_since * 2 + (1 - accuracy) * 50 + (bpm_plateau ? 10 : 0);
        return {
          id: c.id,
          display_name: c.display_name,
          score, accuracy, days_since, bpm_plateau,
        };
      });

      scored.sort((a, b) => b.score - a.score);
      const byAccuracy = scored.slice().sort((a, b) => a.accuracy - b.accuracy);
      const byDays = scored.slice().sort((a, b) => b.days_since - a.days_since);

      const seen = new Set();
      const items = [];
      const picks = [
        [byAccuracy[0], "high", "Lowest accuracy · last 30d"],
        [byDays[0], "high",
         byDays[0] && byDays[0].days_since < 999
           ? `Not practiced in ${byDays[0].days_since}d`
           : "Never practiced"],
      ];
      for (const [c, urgency, reason] of picks) {
        if (c && !seen.has(c.id)) {
          seen.add(c.id);
          items.push({ kind: "chord", target_id: c.id, target_name: c.display_name, reason, urgency, goal_min: 3 });
        }
      }
      for (const c of scored) {
        if (c.bpm_plateau && !seen.has(c.id) && items.length < 4) {
          seen.add(c.id);
          items.push({ kind: "chord", target_id: c.id, target_name: c.display_name, reason: "BPM plateau · no progress in 7d", urgency: "med", goal_min: 3 });
        }
      }
      for (const c of scored) {
        if (items.length >= 3) break;
        if (!seen.has(c.id)) {
          seen.add(c.id);
          items.push({ kind: "chord", target_id: c.id, target_name: c.display_name, reason: "Needs attention", urgency: "med", goal_min: 3 });
        }
      }

      // 1 progression suggestion
      const pcs = await getAll("progression_chord");
      const progs = await getAll("progression");
      let prog = null;
      if (seen.size) {
        const containing = progs.filter((p) =>
          pcs.some((pc) => pc.progression_id === p.id && seen.has(pc.chord_id))
        );
        if (containing.length) prog = containing[Math.floor(Math.random() * containing.length)];
      }
      if (!prog && progs.length) prog = progs[Math.floor(Math.random() * progs.length)];
      if (prog) items.push({ kind: "progression", target_id: prog.id, target_name: prog.name, reason: "Suggested progression", urgency: "low", goal_min: 4 });
      return items;
    },

    // --- Export / Import ---
    async exportAll() {
      const payload = { app: "stringtime", exported_at: nowIso(), schema_version: 1, data: {} };
      for (const s of STORES) {
        payload.data[s.name] = await getAll(s.name);
      }
      return payload;
    },

    async importAll(payload, { replace = true } = {}) {
      if (!payload || payload.app !== "stringtime" || !payload.data) {
        throw new Error("Not a String Time backup file");
      }
      const names = STORES.map((s) => s.name);
      const t = await tx(names, "readwrite");
      if (replace) for (const n of names) t.objectStore(n).clear();
      for (const n of names) {
        const rows = payload.data[n] || [];
        for (const r of rows) t.objectStore(n).put(r);
      }
      await txDone(t);
      // Re-seed library if we wiped it out and it wasn't in the import
      if (replace && !(payload.data.meta || []).some((m) => m.key === LIBRARY_META_KEY)) {
        await seedIfNeeded();
      }
    },

    async wipeAll() {
      const names = STORES.map((s) => s.name);
      const t = await tx(names, "readwrite");
      for (const n of names) t.objectStore(n).clear();
      await txDone(t);
      await seedIfNeeded();
    },

    // Clear only logged practice sessions (resets stats on every chord/progression)
    // but keeps the library, custom chords, categories, routines, and completions.
    async resetStats() {
      await clearStore("session");
    },

    // --- User profile (name, etc.) ---
    async getProfile() {
      const row = await get("meta", "profile");
      return row ? row.value : { name: "" };
    },

    async saveProfile(profile) {
      const value = { name: (profile && profile.name) ? String(profile.name).trim().slice(0, 80) : "" };
      await put("meta", { key: "profile", value });
      return value;
    },

    // --- Simple counts for the profile page ---
    async storageSummary() {
      const out = {};
      for (const s of STORES) out[s.name] = await count(s.name);
      let bytes = 0;
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const est = await navigator.storage.estimate();
          bytes = est.usage || 0;
        }
      } catch (_) {}
      return { counts: out, bytes };
    },
  };

  function txDone(t) {
    return new Promise((resolve, reject) => {
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("tx aborted"));
    });
  }

  function httpError(status, msg) {
    const e = new Error(msg);
    e.status = status;
    return e;
  }

  window.Store = { openDB, getAll, get, put, del, clearStore, count };
  window.Api = Api;
})();
