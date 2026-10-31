/* String Time — top-bar search + info-dot tooltips. */
(function () {
  "use strict";

  function applyFilter(q) {
    q = (q || "").trim().toLowerCase();
    const show = (card, name) => {
      card.style.display = (!q || name.includes(q)) ? "" : "none";
    };
    document.querySelectorAll(".chord-card").forEach((c) => {
      show(c, (c.querySelector(".cc-name")?.textContent || "").toLowerCase());
    });
    document.querySelectorAll(".prog-card").forEach((c) => {
      show(c, (c.querySelector(".name")?.textContent || "").toLowerCase());
    });
    // Keep the "+ Add custom" / "Build progression" tiles always visible.
    document.querySelectorAll(".add-card").forEach((c) => { c.style.display = ""; });
  }

  function wireSearch() {
    const input = document.getElementById("global-search");
    if (!input) return;
    input.addEventListener("input", () => applyFilter(input.value));
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
