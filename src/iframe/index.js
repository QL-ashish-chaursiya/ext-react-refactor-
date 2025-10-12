import { performIframeAction } from "../playback/utils";
 

(async function () {
  const isIframe = window.top !== window.self;
  
  if (isIframe) {
    console.log("📩 [Iframe] Listening for playback actions (once)");

       

    // Avoid duplicate listener
    if (!window.__PLAYBACK_IFRAME_LISTENER__) {
      console.log("attached");

      window.__PLAYBACK_IFRAME_LISTENER__ = async function (event) {
        console.log("event",event.data)
        if (!event.data || event.data.type !== "PLAYBACK_IFRAME_ACTION") return;

        const { action } = event.data;
        console.log("[Iframe] ▶️ Received action from main frame:", action);

        try {
          const result = await performIframeAction(action, [], 0);
          window.parent.postMessage({ type: "PLAYBACK_IFRAME_RESPONSE", result }, "*");
          console.log("[Iframe] ✅ Sent response back:", result);
        } catch (err) {
          window.parent.postMessage({
            type: "PLAYBACK_IFRAME_RESPONSE",
            result: { success: false, message: err.message, assertions: [] },
          }, "*");
          console.error("[Iframe] ❌ Error:", err);
        }
      };

      window.addEventListener("message", window.__PLAYBACK_IFRAME_LISTENER__);
    } else {
      console.log("⚠️ [Iframe] Listener already exists, skipping");
    }

    return;
  }
})();
