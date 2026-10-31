/* String Time — Export / Import helpers used by both the footer and the Profile page. */
(function () {
  "use strict";

  async function exportBackup() {
    try {
      const data = await window.Api.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `stringtime-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert("Export failed: " + (err.message || err));
    }
  }

  function triggerImportDialog() {
    const fileInput = document.getElementById("import-file-input");
    if (fileInput) fileInput.click();
  }

  async function handleImportFile(file) {
    if (!file) return;
    if (!confirm(
      `Import "${file.name}"?\n\nThis REPLACES all your current practice data in this browser.\n` +
      `A backup first? Click Cancel, then Export.`
    )) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await window.Api.importAll(payload, { replace: true });
      alert("Import successful. Reloading…");
      location.reload();
    } catch (err) {
      alert("Import failed: " + (err.message || err));
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const expBtn = document.getElementById("export-data-btn");
    const impBtn = document.getElementById("import-data-btn");
    const fileInput = document.getElementById("import-file-input");

    if (expBtn) expBtn.addEventListener("click", exportBackup);
    if (impBtn) impBtn.addEventListener("click", triggerImportDialog);
    if (fileInput) {
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0];
        fileInput.value = "";
        await handleImportFile(file);
      });
    }
  });

  window.ExportImport = { exportBackup, triggerImportDialog, handleImportFile };
})();
