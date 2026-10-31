/* Custom chord builder modal: visual click-on-fretboard + text fallback. */
(function () {
  const SVG_NS = "http://www.w3.org/2000/svg";

  function el(name, attrs, parent) {
    const e = document.createElementNS(SVG_NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // Builder shows a 6-fret window (frets 1..6). Strings (low E → high E).
  const W = 220, H = 260;
  const padLeft = 36, padRight = 18, padTop = 40, padBottom = 18;
  const NUM_FRETS = 6;
  const stringSpacing = (W - padLeft - padRight) / 5;
  const fretSpacing = (H - padTop - padBottom) / NUM_FRETS;

  class ChordBuilder {
    constructor({ modalEl, svgEl, nameInput, textInput, clearBtn, saveBtn, closeBtn, onSave }) {
      this.modal = modalEl;
      this.svg = svgEl;
      this.nameInput = nameInput;
      this.textInput = textInput;
      this.clearBtn = clearBtn;
      this.saveBtn = saveBtn;
      this.closeBtn = closeBtn;
      this.onSave = onSave;

      this.frets = [null, null, null, null, null, null]; // start fully muted
      this.fingers = [null, null, null, null, null, null]; // click-order finger numbers
      this._fingerCounter = 0;

      this._buildSvg();
      this._wireEvents();
    }

    _buildSvg() {
      const svg = this.svg;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      while (svg.firstChild) svg.removeChild(svg.firstChild);

      // Nut
      el("rect", {
        x: padLeft - 1, y: padTop - 3,
        width: stringSpacing * 5 + 2, height: 4,
        fill: "#0f172a", rx: 1.5,
      }, svg);

      // Fret lines
      for (let i = 1; i <= NUM_FRETS; i++) {
        const y = padTop + i * fretSpacing;
        el("line", {
          x1: padLeft, y1: y, x2: padLeft + stringSpacing * 5, y2: y,
          stroke: "#334155", "stroke-width": 1,
        }, svg);
      }

      // Strings
      for (let s = 0; s < 6; s++) {
        const x = padLeft + s * stringSpacing;
        el("line", {
          x1: x, y1: padTop, x2: x, y2: padTop + fretSpacing * NUM_FRETS,
          stroke: "#64748b", "stroke-width": 1.2,
        }, svg);
      }

      // Fret number labels (1..N) on left
      for (let i = 1; i <= NUM_FRETS; i++) {
        el("text", {
          x: padLeft - 8, y: padTop + (i - 0.5) * fretSpacing + 4,
          fill: "#94a3b8", "font-size": 11, "text-anchor": "end",
          "font-family": "'Plus Jakarta Sans', sans-serif",
        }, svg).textContent = String(i);
      }

      // String top markers (clickable to toggle open/muted)
      this.stringMarkers = [];
      for (let s = 0; s < 6; s++) {
        const x = padLeft + s * stringSpacing;
        const g = el("g", {
          "data-string": s,
          style: "cursor:pointer",
        }, svg);
        // Hit area
        el("rect", {
          x: x - stringSpacing / 2 + 2, y: 0,
          width: stringSpacing - 4, height: padTop - 6,
          fill: "transparent",
        }, g);
        const marker = el("text", {
          x: x, y: padTop - 12,
          fill: "#94a3b8",
          "font-size": 18, "text-anchor": "middle",
          "font-family": "'Plus Jakarta Sans', sans-serif", "font-weight": "700",
        }, g);
        marker.textContent = "×";
        g.addEventListener("click", () => this._toggleStringTop(s));
        this.stringMarkers.push(marker);
      }

      // Fret cells (clickable to set fret on a string)
      for (let s = 0; s < 6; s++) {
        const x = padLeft + s * stringSpacing;
        for (let f = 1; f <= NUM_FRETS; f++) {
          const y = padTop + (f - 1) * fretSpacing;
          const cell = el("rect", {
            x: x - stringSpacing / 2 + 1,
            y, width: stringSpacing - 2, height: fretSpacing,
            fill: "transparent",
            style: "cursor:pointer",
            "data-string": s, "data-fret": f,
          }, svg);
          cell.addEventListener("click", () => this._setFret(s, f));
        }
      }

      // Active dots layer (added/removed dynamically)
      this.dotsLayer = el("g", { id: "builder-dots" }, svg);
    }

    _toggleStringTop(stringIdx) {
      const cur = this.frets[stringIdx];
      if (cur === null) this.frets[stringIdx] = 0;
      else if (cur === 0) this.frets[stringIdx] = null;
      else this.frets[stringIdx] = 0; // any fret -> open
      // open/muted strings have no finger
      this.fingers[stringIdx] = null;
      this._renderDots();
      this._syncTextFromFrets();
    }

    _setFret(stringIdx, fret) {
      // Clicking the same fret again clears it (back to muted).
      if (this.frets[stringIdx] === fret) {
        this.frets[stringIdx] = null;
        this.fingers[stringIdx] = null;
      } else {
        const hadFinger = this.fingers[stringIdx] != null;
        this.frets[stringIdx] = fret;
        if (!hadFinger) {
          this._fingerCounter++;
          this.fingers[stringIdx] = ((this._fingerCounter - 1) % 4) + 1;
        }
      }
      this._renderDots();
      this._syncTextFromFrets();
    }

    _renderDots() {
      // Update top markers
      for (let s = 0; s < 6; s++) {
        const m = this.stringMarkers[s];
        const v = this.frets[s];
        if (v === null) {
          m.textContent = "×";
          m.setAttribute("fill", "#94a3b8");
        } else if (v === 0) {
          m.textContent = "O";
          m.setAttribute("fill", "#16a34a");
        } else {
          m.textContent = "";
        }
      }

      // Clear and redraw fingered dots
      while (this.dotsLayer.firstChild) this.dotsLayer.removeChild(this.dotsLayer.firstChild);
      const dotR = Math.min(stringSpacing, fretSpacing) * 0.32;
      for (let s = 0; s < 6; s++) {
        const v = this.frets[s];
        if (v === null || v === 0) continue;
        const f = v;
        if (f > NUM_FRETS) continue; // out of visible range
        const x = padLeft + s * stringSpacing;
        const y = padTop + (f - 0.5) * fretSpacing;
        el("circle", {
          cx: x, cy: y, r: dotR,
          fill: "#9333ea",
        }, this.dotsLayer);
        const fingerNum = this.fingers[s];
        if (fingerNum != null) {
          const label = el("text", {
            x: x, y: y + dotR * 0.42,
            fill: "#ffffff",
            "font-size": Math.round(dotR * 1.25),
            "text-anchor": "middle",
            "font-family": "'Plus Jakarta Sans', sans-serif",
            "font-weight": "700",
          }, this.dotsLayer);
          label.textContent = String(fingerNum);
        }
      }
    }

    _syncTextFromFrets() {
      this.textInput.value = window.ChordDiagram.fretsToString(this.frets);
    }

    _syncFretsFromText() {
      const parsed = window.ChordDiagram.parseFretString(this.textInput.value);
      if (parsed) {
        this.frets = parsed.slice();
        // Text input doesn't carry click order, so reset finger numbers
        this.fingers = [null, null, null, null, null, null];
        this._fingerCounter = 0;
        this._renderDots();
        this.textInput.style.borderColor = "";
      } else {
        this.textInput.style.borderColor = "#db2777";
      }
    }

    _wireEvents() {
      this.closeBtn.addEventListener("click", () => this.hide());
      this.modal.addEventListener("click", (e) => {
        if (e.target === this.modal) this.hide();
      });
      this.clearBtn.addEventListener("click", () => {
        this.frets = [null, null, null, null, null, null];
        this.fingers = [null, null, null, null, null, null];
        this._fingerCounter = 0;
        this.nameInput.value = "";
        this._renderDots();
        this._syncTextFromFrets();
      });
      this.textInput.addEventListener("input", () => this._syncFretsFromText());
      this.saveBtn.addEventListener("click", () => this._save());
    }

    async _save() {
      const name = this.nameInput.value.trim();
      if (!name) {
        this.nameInput.style.borderColor = "#db2777";
        this.nameInput.focus();
        return;
      }
      this.nameInput.style.borderColor = "";
      const hasAny = this.frets.some((f) => f !== null);
      if (!hasAny) {
        alert("Set at least one string position (open or fretted).");
        return;
      }
      const payload = {
        display_name: name,
        frets: this.frets,
        fingers: this.fingers,
      };
      try {
        const created = await Api.createChord(payload);
        this.hide();
        if (this.onSave) this.onSave(created);
      } catch (e) {
        alert("Save failed: " + (e.message || e));
      }
    }

    show() {
      this.frets = [null, null, null, null, null, null];
      this.fingers = [null, null, null, null, null, null];
      this._fingerCounter = 0;
      this.nameInput.value = "";
      this._renderDots();
      this._syncTextFromFrets();
      this.modal.classList.remove("hidden");
      this.nameInput.focus();
    }

    hide() {
      this.modal.classList.add("hidden");
    }
  }

  window.ChordBuilder = ChordBuilder;
})();
