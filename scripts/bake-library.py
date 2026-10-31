"""Bake the shared, read-only seed library from data/practice.db to public/library.json.

Run whenever seed.py changes. The output JSON is the shared starter data every
visitor's browser loads on first visit (chords, progressions, routines, built-in
categories). Per-user data (sessions, custom chords, completion state) lives in
each browser's IndexedDB and never touches this file.
"""
import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "practice.db"
OUT = ROOT / "public" / "library.json"


def rows(conn, sql, *args):
    cur = conn.execute(sql, args)
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def main():
    if not DB.exists():
        print(f"ERROR: {DB} not found. Run `python app.py` once to seed it.", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(DB)
    lib = {
        "schema_version": 1,
        "chords": rows(conn, "SELECT id, name, display_name, frets, fingers FROM chord WHERE is_custom=0 ORDER BY id"),
        "progressions": rows(conn, "SELECT id, name, time_signature, bars_per_chord FROM progression WHERE is_custom=0 ORDER BY id"),
        "progression_chords": rows(conn,
            "SELECT pc.progression_id, pc.position, pc.chord_id "
            "FROM progression_chord pc JOIN progression p ON p.id=pc.progression_id "
            "WHERE p.is_custom=0 ORDER BY pc.progression_id, pc.position"),
        "chord_categories": rows(conn, "SELECT id, name FROM chord_category ORDER BY id"),
        "chord_category_members": rows(conn, "SELECT category_id, chord_id FROM chord_category_member"),
        "progression_categories": rows(conn, "SELECT id, name FROM progression_category ORDER BY id"),
        "progression_category_members": rows(conn, "SELECT category_id, progression_id FROM progression_category_member"),
        "routine_modules": rows(conn, "SELECT id, grade, position, title, description FROM routine_module ORDER BY grade, position"),
        "routine_exercises": rows(conn,
            "SELECT id, module_id, position, title, instructions, target_type, target_id, "
            "default_bpm, default_duration_seconds, default_time_signature, default_bars_per_chord "
            "FROM routine_exercise ORDER BY module_id, position"),
    }

    # Parse JSON-encoded frets/fingers so the browser doesn't have to double-parse.
    for c in lib["chords"]:
        for k in ("frets", "fingers"):
            if isinstance(c.get(k), str):
                try:
                    c[k] = json.loads(c[k])
                except (ValueError, TypeError):
                    pass

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(lib, indent=2))
    size_kb = OUT.stat().st_size / 1024
    print(f"Wrote {OUT} ({size_kb:.1f} KB)")
    print(f"  chords:        {len(lib['chords'])}")
    print(f"  progressions:  {len(lib['progressions'])}")
    print(f"  categories:    {len(lib['chord_categories'])} chord / {len(lib['progression_categories'])} progression")
    print(f"  routines:      {len(lib['routine_modules'])} modules / {len(lib['routine_exercises'])} exercises")


if __name__ == "__main__":
    main()
