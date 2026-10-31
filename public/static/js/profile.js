/* String Time — Profile view.
 *
 * Everything on this page is read from and written to the user's own IndexedDB.
 * Nothing here reaches a server.
 */
(function () {
  "use strict";

  const STORE_LABELS = {
    chord: "Chords (stock + custom)",
    progression: "Progressions",
    progression_chord: "Progression members",
    chord_category: "Chord categories",
    chord_category_member: "Chord ↔ category links",
    progression_category: "Progression categories",
    progression_category_member: "Progression ↔ category links",
    session: "Logged practice sessions",
    practice_session: "Routines",
    practice_session_item: "Routine items",
    routine_exercise_completion: "Routine exercise completions",
    meta: "App metadata",
  };

  const EXCLUDE_FROM_STORAGE_TABLE = new Set(["meta"]);

  function fmtBytes(n) {
    if (!n) return "—";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  }

  function initials(name) {
    const n = (name || "").trim();
    if (!n) return "RK";
    const parts = n.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0].toUpperCase()).join("");
  }

  async function refresh() {
    const profile = await window.Api.getProfile();
    const nameInput = document.getElementById("profile-name");
    const nameStatus = document.getElementById("profile-name-status");
    if (nameInput) nameInput.value = profile.name || "";
    if (nameStatus) nameStatus.textContent = "";

    const summary = await window.Api.storageSummary();
    const sizeEl = document.getElementById("profile-storage-size");
    if (sizeEl) sizeEl.textContent = fmtBytes(summary.bytes);

    const table = document.getElementById("profile-storage-table");
    if (table) {
      const rows = Object.entries(summary.counts)
        .filter(([k]) => !EXCLUDE_FROM_STORAGE_TABLE.has(k))
        .map(([k, v]) => `<tr><td>${STORE_LABELS[k] || k}</td><td class="st-mono num">${v}</td></tr>`)
        .join("");
      table.innerHTML = `<tbody>${rows}</tbody>`;
    }

    updateAvatar(profile.name);
  }

  function updateAvatar(name) {
    const avatar = document.getElementById("app-avatar-btn");
    if (avatar) {
      avatar.textContent = initials(name);
      avatar.title = name ? `${name} · open profile` : "Open profile";
    }
  }

  async function saveName() {
    const nameInput = document.getElementById("profile-name");
    const nameStatus = document.getElementById("profile-name-status");
    if (!nameInput) return;
    const value = { name: nameInput.value.trim() };
    try {
      const saved = await window.Api.saveProfile(value);
      if (nameStatus) nameStatus.textContent = saved.name ? "Saved." : "Cleared.";
      updateAvatar(saved.name);
    } catch (err) {
      if (nameStatus) nameStatus.textContent = "Save failed.";
    }
  }

  function wire() {
    document.getElementById("profile-name-save")?.addEventListener("click", saveName);
    document.getElementById("profile-name")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveName();
    });

    document.getElementById("profile-export-btn")?.addEventListener("click", () => {
      if (window.ExportImport) window.ExportImport.exportBackup();
    });
    document.getElementById("profile-import-btn")?.addEventListener("click", () => {
      if (window.ExportImport) window.ExportImport.triggerImportDialog();
    });

    document.getElementById("profile-reset-stats-btn")?.addEventListener("click", async () => {
      if (!confirm("Delete every logged practice session? This resets each chord's time, BPM trend, accuracy and your streak. Your chords, progressions and routines are kept.")) return;
      try {
        await window.Api.resetStats();
        alert("Stats reset. Reloading…");
        location.reload();
      } catch (err) {
        alert("Reset failed: " + (err.message || err));
      }
    });

    document.getElementById("profile-wipe-btn")?.addEventListener("click", async () => {
      if (!confirm("This empties the ENTIRE database (sessions, custom chords, progressions, categories, routines, name) and restores the stock library. There is no undo. Continue?")) return;
      try {
        await window.Api.wipeAll();
        alert("All data wiped. Reloading…");
        location.reload();
      } catch (err) {
        alert("Wipe failed: " + (err.message || err));
      }
    });

    const avatar = document.getElementById("app-avatar-btn");
    if (avatar) {
      avatar.addEventListener("click", () => {
        if (window.Dashboard && window.Dashboard._go) window.Dashboard._go("profile");
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    wire();
    // Avatar initials for the first paint; refresh() will keep it in sync later.
    window.Api?.getProfile?.().then((p) => updateAvatar(p && p.name)).catch(() => {});
  });

  window.Profile = { refresh, updateAvatar };
})();
