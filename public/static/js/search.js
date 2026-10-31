/* String Time — top-bar search + info-dot tooltips. */
(function () {
  "use strict";

  function applyFilter(q) {
    q = (q || "").trim().toLowerCase();
    const show = (card, name) => {
      card.style.display = (!q || name.includes(q)) ? "" : "none";
    };
    let chordHits = 0, progHits = 0;
    document.querySelectorAll(".chord-card").forEach((c) => {
      const name = (c.querySelector(".cc-name")?.textContent || "").toLowerCase();
      show(c, name);
      if (q && name.includes(q)) chordHits++;
    });
    document.querySelectorAll(".prog-card").forEach((c) => {
      const name = (c.querySelector(".name")?.textContent || "").toLowerCase();
      show(c, name);
      if (q && name.includes(q)) progHits++;
    });
    // Keep the "+ Add custom" / "Build progression" tiles always visible.
    document.querySelectorAll(".add-card").forEach((c) => { c.style.display = ""; });

    // If the query only matches progressions (or vice-versa), auto-flip to that
    // tab so the user sees the hits.
    if (q) {
      const chordTabBtn = document.querySelector('.picker .tab[data-tab="chord"]');
      const progTabBtn = document.querySelector('.picker .tab[data-tab="progression"]');
      if (chordHits === 0 && progHits > 0 && progTabBtn && !progTabBtn.classList.contains("active")) {
        progTabBtn.click();
      } else if (progHits === 0 && chordHits > 0 && chordTabBtn && !chordTabBtn.classList.contains("active")) {
        chordTabBtn.click();
      }
    }
  }

  function wireSearch() {
    const input = document.getElementById("global-search");
    if (!input) return;
    input.addEventListener("input", () => {
      // Typing a query without being on the Library view does nothing visible —
      // the cards only exist there. Jump the user over on first keystroke so
      // the filter has something to filter.
      if (input.value && window.Dashboard && window.Dashboard._go) {
        const current = document.querySelector('.app-nav a.active')?.dataset.view;
        if (current !== "library") window.Dashboard._go("library");
      }
      applyFilter(input.value);
    });
    input.addEventListener("focus", () => {
      // Focusing the search also implies "I want to search" — switch to Library
      // so the user sees cards appear/filter as they type.
      if (window.Dashboard && window.Dashboard._go) {
        const current = document.querySelector('.app-nav a.active')?.dataset.view;
        if (current !== "library") window.Dashboard._go("library");
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { input.value = ""; applyFilter(""); input.blur(); }
    });

    window.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (window.Dashboard && window.Dashboard._go) window.Dashboard._go("library");
        input.focus();
        input.select();
      }
    });
  }

  // Lightweight tooltip for the little (i) dots on dashboard section headers.
  // Hover shows the native title; click (and keyboard focus / Enter) shows a
  // bubble that stays visible until you click away.
  function wireInfoTips() {
    document.querySelectorAll(".info-dot").forEach((dot) => {
      dot.setAttribute("role", "button");
      const tip = dot.getAttribute("data-tip") || "";
      dot.setAttribute("title", tip);
      dot.addEventListener("click", (e) => {
        e.stopPropagation();
        showBubble(dot, tip);
      });
      dot.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showBubble(dot, tip); }
      });
    });
    document.addEventListener("click", hideBubble);
  }

  let activeBubble = null;
  function hideBubble() {
    if (activeBubble) { activeBubble.remove(); activeBubble = null; }
  }
  function showBubble(anchor, text) {
    hideBubble();
    if (!text) return;
    const el = document.createElement("div");
    el.className = "info-bubble";
    el.textContent = text;
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const bw = Math.min(280, window.innerWidth - 24);
    el.style.width = bw + "px";
    const top = window.scrollY + r.bottom + 8;
    let left = window.scrollX + r.left - bw / 2 + r.width / 2;
    left = Math.max(12, Math.min(left, window.scrollX + window.innerWidth - bw - 12));
    el.style.top = top + "px";
    el.style.left = left + "px";
    activeBubble = el;
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireSearch();
    wireInfoTips();
  });
})();
