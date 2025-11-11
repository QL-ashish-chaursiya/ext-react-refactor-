import {  handleInput, handlePointerDown } from "../content/handlers";

(() => {
     const isNotIframe = window.top == window.self;
     if(isNotIframe){
        return
     }
  // 🧠 Global guard to prevent duplicate listener attachments
  if (window.__LISTENER_INITIALIZED__) {
    console.log("⚠️ [Listener] Already initialized for this frame, skipping...");
    return;
  }

  window.__LISTENER_INITIALIZED__ = true;

  console.log("🎧 [Listener] Ready in frame:", window.location.href);

  // --- Handlers ---
   

  

  // --- Core function to attach listeners (only once) ---
  function attachListeners() {
    if (window.__LISTENERS_ATTACHED__) {
      console.log("⚠️ [Listener] Event listeners already attached for this frame.");
      return "already-attached";
    }

    document.addEventListener("input", handleInput, { capture: true, passive: true });
      document.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: false });

    window.__LISTENERS_ATTACHED__ = true;
    console.log("✅ [Listener] Event listeners attached.");
    return "attached";
  }

  // --- Expose safe callable function ---
  window.__attachFrameListeners__ = attachListeners;

  // Optionally auto-attach once on load
   attachListeners();
})();
