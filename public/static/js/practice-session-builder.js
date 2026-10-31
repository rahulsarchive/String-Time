/* Practice Session Builder: create named routines with ordered practice items.
 *
 * Each item carries its own BPM, time signature, bars-per-chord, duration,
 * and an optional tempo-ramp percentage. "Start routine" plays items in order
 * and auto-advances when each one completes.
 */
(function () {

  class PracticeSessionBuilder {
    constructor() {
      this.sessions = [];
      this.selectedSessionId = null;
      this.chords = [];
      this.progressions = [];
      this.editingItemId = null;
      this.routineQueue = null;

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
      this.elStartRoutineBtn = document.getElementById("pb-start-routine-btn");
      this.elAddItemModal = document.getElementById("pb-add-item-modal");
      this.elModalTitle = document.getElementById("pb-item-modal-title");
      this.elItemType = document.getElementById("pb-item-type");
      this.elItemTarget = document.getElementById("pb-item-target");
      this.elItemDuration = document.getElementById("pb-item-duration");
      this.elItemBpm = document.getElementById("pb-item-bpm");
      this.elItemTs = document.getElementById("pb-item-ts");
      this.elItemBpcWrap = document.getElementById("pb-item-bpc-wrap");
      this.elItemBpc = document.getElementById("pb-item-bpc");
      this.elItemRamp = document.getElementById("pb-item-ramp");
      this.elItemSaveBtn = document.getElementById("pb-item-save");
    }

    _wireControls() {
      this.elNewSessionBtn.addEventListener("click", () => this._promptNewSession());
      this.elAddItemBtn.addEventListener("click", () => this._openAddItemModal());
      if (this.elStartRoutineBtn) {
        this.elStartRoutineBtn.addEventListener("click", () => this._startRoutine());
      }

      document.getElementById("pb-item-close").addEventListener("click", () => this._closeModal());
      document.getElementById("pb-item-cancel").addEventListener("click", () => this._closeModal());
      this.elItemSaveBtn.addEventListener("click", () => this._saveItem());

      this.elItemType.addEventListener("change", () => this._updateTargetOptions());

      this.elAddItemModal.addEventListener("click", (e) => {
        if (e.target === this.elAddItemModal) this._closeModal();
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
        e.textContent = "No routines yet — create one to get started.";
        this.elSessionsList.appendChild(e);
        return;
      }
      for (const s of this.sessions) {
        const entry = document.createElement("div");
        entry.className = "pb-session-entry" + (s.id === this.selectedSessionId ? " selected" : "");
        entry.dataset.sessionId = String(s.id);

        const left = document.createElement("div");
        left.className = "pb-session-left";

        const nameEl = document.createElement("span");
        nameEl.className = "pb-session-name";
        nameEl.textContent = s.name;

        const meta = document.createElement("span");
        meta.className = "pb-session-meta";
        meta.textContent = s.items.length + " item" + (s.items.length !== 1 ? "s" : "");

        left.appendChild(nameEl);
        left.appendChild(meta);

        const delBtn = document.createElement("button");
        delBtn.className = "pb-session-del";
        delBtn.textContent = "×";
        delBtn.title = "Delete routine";
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

      // Start-routine button is only useful if items exist.
      if (this.elStartRoutineBtn) {
        this.elStartRoutineBtn.disabled = session.items.length === 0;
      }

      if (!session.items.length) {
        const e = document.createElement("div");
        e.className = "empty";
        e.textContent = "No items yet — add something to practice.";
        this.elItemsList.appendChild(e);
        return;
      }

      session.items.forEach((item, idx) => this._appendItemRow(session, item, idx));
    }

    _appendItemRow(session, item, idx) {
      const row = document.createElement("div");
      const todayStr = new Date().toLocaleDateString();
      const completedStr = item.completed_at ? new Date(item.completed_at).toLocaleDateString() : null;
      const isCompleted = completedStr === todayStr;
      row.className = "pb-item-row" + (isCompleted ? " completed" : "");
      row.dataset.itemId = String(item.id);

      const mins = Math.floor(item.duration_seconds / 60);
      const secs = item.duration_seconds % 60;
      const durStr = secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
      const rampPct = parseInt(item.ramp_percent || 0, 10) || 0;
      const rampStr = rampPct > 0 ? `+${rampPct}%` : "—";
      const targetName = item.target_name || (item.target_type === "chord" ? "chord" : "progression");

      row.innerHTML = `
        <span class="pb-item-num st-mono">${idx + 1}</span>
        <span class="pb-item-status" title="${isCompleted ? "Completed today" : "Not yet done today"}">✓</span>
        <div class="pb-item-main">
          <span class="pb-item-target"></span>
          <span class="pb-item-kind st-cap-sm">${item.target_type}</span>
        </div>
        <span class="pb-item-field"><span class="pb-item-flabel">BPM</span><span class="pb-item-fval st-mono">${item.bpm}</span></span>
        <span class="pb-item-field"><span class="pb-item-flabel">TIME</span><span class="pb-item-fval st-mono">${item.time_signature}</span></span>
        <span class="pb-item-field"><span class="pb-item-flabel">DUR</span><span class="pb-item-fval st-mono">${durStr}</span></span>
        <span class="pb-item-field pb-item-ramp-field" title="Tempo ramp (per-item, as a percent of the item's BPM)">
          <span class="pb-item-flabel">RAMP</span><span class="pb-item-fval st-mono">${rampStr}</span>
        </span>
        <button class="btn btn-sm pb-item-edit" title="Edit">Edit</button>
        <button class="btn btn-sm btn-primary pb-item-start">Start</button>
        <button class="pb-item-del" title="Remove">×</button>
      `;
      row.querySelector(".pb-item-target").textContent = targetName;

      row.querySelector(".pb-item-start").addEventListener("click", () => this._startItem(session, item, row));
      row.querySelector(".pb-item-edit").addEventListener("click", () => this._openEditItemModal(item));
      row.querySelector(".pb-item-del").addEventListener("click", () => this._deleteItem(session, item));
      this.elItemsList.appendChild(row);
    }

    async _startItem(session, item, row) {
      if (!window._practiceInstance) return;

      this.elItemsList.querySelectorAll(".pb-item-row.playing")
        .forEach((r) => r.classList.remove("playing"));
      row.classList.add("playing");
      row.classList.remove("completed");

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
          // If a routine is running, advance to the next item.
          if (this.routineQueue && this.routineQueue.length) {
            const next = this.routineQueue.shift();
            setTimeout(() => {
              const nextRow = this.elItemsList.querySelector(`.pb-item-row[data-item-id="${next.item.id}"]`);
              if (nextRow) this._startItem(next.session, next.item, nextRow);
            }, 400);
          }
        } else {
          // Manual abort — cancel the queued routine too.
          this.routineQueue = null;
        }
      });
    }

    _startRoutine() {
      const session = this.sessions.find((s) => s.id === this.selectedSessionId);
      if (!session || !session.items.length) return;
      // Build a queue of all pending items; start from the first.
      const items = session.items.slice();
      const first = items.shift();
      this.routineQueue = items.map((it) => ({ session, item: it }));
      const firstRow = this.elItemsList.querySelector(`.pb-item-row[data-item-id="${first.id}"]`);
      if (firstRow) this._startItem(session, first, firstRow);
    }

    async _promptNewSession() {
      const name = prompt("Routine name (e.g. Morning Warmup):");
      if (!name || !name.trim()) return;
      let created;
      try {
        created = await Api.createPracticeSession({ name: name.trim() });
      } catch (err) {
        alert("Failed to create routine");
        return;
      }
      await this.load();
      const session = this.sessions.find((s) => s.id === created.id);
      if (session) this._selectSession(session);
    }

    async _deleteSession(session) {
      if (!confirm(`Delete routine "${session.name}" and all its items?`)) return;
      try {
        await Api.deletePracticeSession(session.id);
      } catch (err) {
        alert("Failed to delete routine");
        return;
      }
      if (this.selectedSessionId === session.id) {
        this.selectedSessionId = null;
        this._showPlaceholder();
      }
      await this.load();
    }

    _openAddItemModal() {
      this.editingItemId = null;
      if (this.elModalTitle) this.elModalTitle.textContent = "Add practice item";
      if (this.elItemSaveBtn) this.elItemSaveBtn.textContent = "Add item";
      this._updateTargetOptions();
      this.elItemDuration.value = "2";
      this.elItemBpm.value = "80";
      this.elItemTs.value = "4/4";
      this.elItemBpc.value = "1";
      if (this.elItemRamp) this.elItemRamp.value = "0";
      this.elAddItemModal.classList.remove("hidden");
    }

    _openEditItemModal(item) {
      this.editingItemId = item.id;
      if (this.elModalTitle) this.elModalTitle.textContent = "Edit practice item";
      if (this.elItemSaveBtn) this.elItemSaveBtn.textContent = "Save changes";
      this.elItemType.value = item.target_type;
      this._updateTargetOptions();
      this.elItemTarget.value = String(item.target_id);
      this.elItemDuration.value = String(Math.max(1, Math.round(item.duration_seconds / 60)));
      this.elItemBpm.value = String(item.bpm);
      this.elItemTs.value = item.time_signature;
      this.elItemBpc.value = String(item.bars_per_chord || 1);
      if (this.elItemRamp) this.elItemRamp.value = String(item.ramp_percent || 0);
      this.elAddItemModal.classList.remove("hidden");
    }

    _closeModal() {
      this.elAddItemModal.classList.add("hidden");
      this.editingItemId = null;
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

    async _saveItem() {
      const sessionId = this.selectedSessionId;
      if (!sessionId) return;
      const type = this.elItemType.value;
      const targetId = parseInt(this.elItemTarget.value, 10);
      const durationMins = parseFloat(this.elItemDuration.value) || 2;
      const durationSec = Math.round(durationMins * 60);
      const bpm = parseInt(this.elItemBpm.value, 10) || 80;
      const ts = this.elItemTs.value;
      const bpc = type === "progression" ? (parseInt(this.elItemBpc.value, 10) || 1) : 1;
      const rampPct = this.elItemRamp ? Math.max(0, Math.min(100, parseInt(this.elItemRamp.value, 10) || 0)) : 0;

      if (!targetId) { alert("Select a target"); return; }

      const payload = {
        target_type: type,
        target_id: targetId,
        duration_seconds: durationSec,
        bpm,
        time_signature: ts,
        bars_per_chord: bpc,
        ramp_percent: rampPct,
      };

      try {
        if (this.editingItemId != null) {
          await Api.updatePracticeSessionItem(sessionId, this.editingItemId, payload);
        } else {
          await Api.addPracticeSessionItem(sessionId, payload);
        }
      } catch (err) {
        alert("Failed: " + (err.message || err));
        return;
      }
      this._closeModal();
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
