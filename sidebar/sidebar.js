// Dynamically fetch version from manifest.json
document.addEventListener("DOMContentLoaded", () => {
    const manifest = chrome.runtime.getManifest();
    const versionEl = document.getElementById("version");
  
    if (versionEl) {
      versionEl.textContent = `Version: ${manifest.version}`;
    }
  });
  