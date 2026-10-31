/* Practice Session Builder: create named sessions with ordered practice items. */
(function () {

  class PracticeSessionBuilder {
    constructor() {
      this.sessions = [];
      this.selectedSessionId = null;
      this.chords = [];
      this.progressions = [];

      this._cacheEls();
      this._wireControls();
    }

    _cacheEls() {
      this.elSessionsList = document.getElementById("pb-sessions-list");
      this.elItemsList = document.getElementById("pb-items-list");
      this.elPlaceholder = document.getElementById("pb-placeholder");
      this.elItemsContent = document.getElementById("pb-items-content");
      this.elSelectedName = document.getElementById("pb-selected-session-name");
      this.elNewSessionBtn = document.getElementById("pb-new-session-btn");
      this.elAddItemBtn = document.getElementById("pb-add-item-btn");
      this.elAddItemModal = document.getElementById("pb-add-item-modal");
      this.elItemType = document.getElementById("pb-item-type");
      this.elItemTarget = document.getElementById("pb-item-target");
      this.elItemDuration = document.getElementById("pb-item-duration");
      this.elItemBpm = document.getElementById("pb-item-bpm");
      this.elItemTs = document.getElementById("pb-item-ts");
      this.elItemBpcWrap = document.getElementById("pb-item-bpc-wrap");
      this.elItemBpc = document.getElementById("pb-item-bpc");
    }

    _wireControls() {
      this.elNewSessionBtn.addEventListener("click", () => this._promptNewSession());
      this.elAddItemBtn.addEventListener("click", () => this._openAddItemModal());

      document.getElementById("pb-item-close").addEventListener("click", () => {
        this.elAddItemModal.classList.add("hidden");
      });
      document.getElementById("pb-item-cancel").addEventListener("click", () => {
        this.elAddItemModal.classList.add("hidden");
      });
      document.getElementById("pb-item-save").addEventListener("click", () => this._saveNewItem());

      this.elItemType.addEventListener("change", () => this._updateTargetOptions());

      this.elAddItemModal.addEventListener("click", (e) => {
        if (e.target === this.elAddItemModal) this.elAddItemModal.classList.add("hidden");
      });
    }

    setData(chords, progressions) {
      this.chords = chords;
      this.progressions = progressions;
    }

    async load() {
      const sessions = await Api.listPracticeSessions();
      this.sessions = sessions;
      this._renderSessionsList();
      if (this.selectedSessionId) {
        const still = this.sessions.find((s) => s.id === this.selectedSessionId);
        if (still) {
          this._renderItems(still);
        } else {
          this.selectedSessionId = null;
          this._showPlaceholder();
        }
      }
    }

    _renderSessionsList() {
      this.elSessionsList.innerHTML = "";
      if (!this.sessions.length) {
        const e = document.createElement("div");
        e.className = "empty";
        e.textContent = "No sessions yet — create one to get started.";
        this.elSessionsList.appendChild(e);
        return;
      }
      for (const s of this.sessions) {
        const entry = document.createElement("div");
        entry.className = "pb-session-entry" + (s.id === this.selectedSessionId ? " selected" : "");
        entry.dataset.sessionId = String(s.id);

        const nameEl = document.createElement("span");
        nameEl.className = "pb-session-name";
        nameEl.textContent = s.name;

        const meta = document.createElement("span");
        meta.className = "pb-session-meta";
        meta.textContent = s.items.length + " item" + (s.items.length !== 1 ? "s" : "");

        const left = document.createElement("div");
        left.className = "pb-session-left";
        left.appendChild(nameEl);
        left.appendChild(meta);

        const delBtn = document.createElement("button");
        delBtn.className = "pb-session-del";
        delBtn.textContent = "×";
        delBtn.title = "Delete session";
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          this._deleteSession(s);
        });

        entry.appendChild(left);
        entry.appendChild(delBtn);
        entry.addEventListener("click", () => this._selectSession(s));
        this.elSessionsList.appendChild(entry);
      }
    }

    _selectSession(session) {
      this.selectedSessionId = session.id;
      this.elSessionsList.querySelectorAll(".pb-session-entry").forEach((e) => {
        e.classList.toggle("selected", Number(e.dataset.sessionId) === session.id);
      });
      this._renderItems(session);
    }

    _showPlaceholder() {
      this.elPlaceholder.classList.remove("hidden");
      this.elItemsContent.classList.add("hidden");
    }

    _renderItems(session) {
      this.elPlaceholder.classList.add("hidden");
      this.elItemsContent.classList.remove("hidden");
      this.elSelectedName.textContent = session.name;
      this.elItemsList.innerHTML = "";

      if (!session.items.length) {
        const e = document.createElement("div");
        e.className = "empty";
        e.textContent = "No items yet — add something to practice.";
        this.elItemsList.appendChild(e);
        return;
      }

      session.items.forEach((item, idx) => {
        const row = document.createElement("div");
        const todayStr = new Date().toLocaleDateString();
        const completedStr = item.completed_at ? new Date(item.completed_at).toLocaleDateString() : null;
        const isCompleted = completedStr === todayStr;
        row.className = "pb-item-row" + (isCompleted ? " completed" : "");
        row.dataset.itemId = String(item.id);

        const mins = Math.floor(item.duration_seconds / 60);
        const secs = item.duration_seconds % 60;
        const durStr = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;

        row.innerHTML = `
          <span class="pb-item-num">${idx + 1}</span>
          <span class="pb-item-status" title="Completed">✓</span>
          <div class="pb-item-info">
            <span class="pb-item-target"></span>
            <span class="pb-item-meta">${durStr} · ${item.bpm} bpm · ${item.time_signature}${item.target_type === "progression" ? " · " + item.bars_per_chord + " bars/chord" : ""}</span>
          </div>
        `;
        row.querySelector(".pb-item-target").textContent = item.target_name || item.target_type;

        const startBtn = document.createElement("button");
        startBtn.className = "btn-primary btn-small pb-item-start";
        startBtn.textContent = "Start";
        startBtn.addEventListener("click", () => this._startItem(session, item, row));

        const delBtn = document.createElement("button");
        delBtn.className = "pb-item-del";
        delBtn.textContent = "×";
        delBtn.title = "Remove item";
        delBtn.addEventListener("click", () => this._deleteItem(session, item));

        row.appendChild(startBtn);
        row.appendChild(delBtn);
        this.elItemsList.appendChild(row);
      });
    }

    async _startItem(session, item, row) {
      if (!window._practiceInstance) return;

      // Visually clear any other playing rows, mark this one playing,
      // strip any completed checkmark (we're re-practicing it).
      this.elItemsList.querySelectorAll(".pb-item-row.playing")
        .forEach((r) => r.classList.remove("playing"));
      row.classList.add("playing");
      row.classList.remove("completed");

      // Clear persisted completion on the server too, so a manual stop
      // doesn't leave a stale checkmark.
      if (item.completed_at) {
        try {
          await Api.setPracticeItemCompleted(session.id, item.id, false);
          item.completed_at = null;
        } catch (_) {}
      }

      window._practiceInstance.startBuilderItem(item, async (status) => {
        row.classList.remove("playing");
        if (status === "complete") {
          try {
            const updated = await Api.setPracticeItemCompleted(session.id, item.id, true);
            item.completed_at = updated.completed_at;
            row.classList.add("completed");
          } catch (_) {}
        }
      });
    }

    async _promptNewSession() {
      const name = prompt("Session name (e.g. Morning Warmup):");
      if (!name || !name.trim()) return;
      let created;
      try {
        created = await Api.createPracticeSession({ name: name.trim() });
      } catch (err) {
        alert("Failed to create session");
        return;
      }
      await this.load();
      const session = this.sessions.find((s) => s.id === created.id);
      if (session) this._selectSession(session);
    }

    async _deleteSession(session) {
      if (!confirm(`Delete session "${session.name}" and all its items?`)) return;
      try {
        await Api.deletePracticeSession(session.id);
      } catch (err) {
        alert("Failed to delete session");
        return;
      }
      if (this.selectedSessionId === session.id) {
        this.selectedSessionId = null;
        this._showPlaceholder();
      }
      await this.load();
    }

    _openAddItemModal() {
      this._updateTargetOptions();
      this.elItemDuration.value = "2";
      this.elItemBpm.value = "80";
      this.elItemTs.value = "4/4";
      this.elItemBpc.value = "1";
      this.elAddItemModal.classList.remove("hidden");
    }

    _updateTargetOptions() {
      const type = this.elItemType.value;
      this.elItemTarget.innerHTML = "";
      const items = type === "chord" ? this.chords : this.progressions;
      for (const item of items) {
        const opt = document.createElement("option");
        opt.value = String(item.id);
        opt.textContent = type === "chord" ? item.display_name : item.name;
        this.elItemTarget.appendChild(opt);
      }
      this.elItemBpcWrap.classList.toggle("hidden", type !== "progression");
    }

    async _saveNewItem() {
      const sessionId = this.selectedSessionId;
      if (!sessionId) return;
      const type = this.elItemType.value;
      const targetId = parseInt(this.elItemTarget.value, 10);
      const durationMins = parseFloat(this.elItemDuration.value) || 2;
      const durationSec = Math.round(durationMins * 60);
      const bpm = parseInt(this.elItemBpm.value, 10) || 80;
      const ts = this.elItemTs.value;
      const bpc = type === "progression" ? (parseInt(this.elItemBpc.value, 10) || 1) : 1;

      if (!targetId) { alert("Select a target"); return; }

      try {
        await Api.addPracticeSessionItem(sessionId, {
          target_type: type,
          target_id: targetId,
          duration_seconds: durationSec,
          bpm,
          time_signature: ts,
          bars_per_chord: bpc,
        });
      } catch (err) {
        alert("Failed: " + (err.message || err));
        return;
      }
      this.elAddItemModal.classList.add("hidden");
      await this.load();
      const session = this.sessions.find((s) => s.id === sessionId);
      if (session) this._renderItems(session);
    }

    async _deleteItem(session, item) {
      try {
        await Api.deletePracticeSessionItem(session.id, item.id);
      } catch (err) {
        alert("Failed to delete item");
        return;
      }
      await this.load();
      const updated = this.sessions.find((s) => s.id === session.id);
      if (updated) this._renderItems(updated);
    }
  }

  window.PracticeSessionBuilder = PracticeSessionBuilder;
})();
