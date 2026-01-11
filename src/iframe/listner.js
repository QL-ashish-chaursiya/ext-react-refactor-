import { getElementInfo } from "../content/xpath";

 

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

 

let pendingInputActions = new Map();
let autofillTimer = null;

/* ===========================
   Utility
=========================== */

function getInputKey(el) {
  if (el.id) return el.id;
  if (el.name) return "name-" + el.name;
  return `${el.tagName}-${el.type || ""}-${el.className || ""}-${el.placeholder || ""}`.replace(/\s+/g, "-");
}

function post(action) {
  window.parent.postMessage({
    type: "IFRAME_ACTION",
    action
  }, "*");
}

document.addEventListener("input", e => {
  if (window.top === window) return;
  if (e.target.closest('[data-recorder-ui="true"]')) return;

  const el = e.target;
  const info = getElementInfo(el);

  // FILE
  if (el.tagName === "INPUT" && el.type === "file") {
    const file = el.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      post({
        type: "fileSelect",
          description: `Select file "${file.name}"`,
        element: info,
        value: file.name,
        storageData: {
          name: file.name,
          type: file.type,
          content: reader.result
        }
      });
    };
    reader.readAsDataURL(file);
    return;
  }

  // CONTENTEDITABLE
  if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
    const value = el.textContent || "";
    const action = {
      type: "change",
      element: info,
      value,
      description: `Enter "${value}"`
    };

    const key = getInputKey(el);
    pendingInputActions.set(key, action);
    return;
  }

  const value = el.value;

  // OTP
  const isOtp =
    (typeof el.maxLength === "number" && el.maxLength === 1) ||
    el.getAttribute("maxlength") === "1";

  if (isOtp) {
    post({
      type: "change",
      element: info,
      value,
      description: `Enter OTP "${value}"`
    });
    return;
  }

  // NORMAL INPUT
  const key = getInputKey(el);
  pendingInputActions.set(key, {
    type: "change",
    element: info,
    value,
    description: `Enter "${value}"`
  });
}, true);

document.addEventListener("change", () => {
  if (window.top === window) return;

  clearTimeout(autofillTimer);
  autofillTimer = setTimeout(() => {
    pendingInputActions.forEach(a => post(a));
    pendingInputActions.clear();
  }, 300);
}, true);

document.addEventListener("pointerdown", e => {
  if (window.top === window) return;
  if (e.target.closest('[data-recorder-ui="true"]')) return;

  const el = e.target;
  const info = getElementInfo(el);
  const rect = el.getBoundingClientRect();

  pendingInputActions.forEach(a => post(a));
  pendingInputActions.clear();

  post({
    type: "mousedown",
    element: info,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
    description: `Click on ${info.id || info.name || info.tagName}`
  });
}, true);

document.addEventListener("keydown", e => {
  if (window.top === window) return;
  if (e.target.closest('[data-recorder-ui="true"]')) return;

  const important = ["Enter", "Tab", "Escape"];
  if (!important.includes(e.key)) return;

  pendingInputActions.forEach(a => post(a));
  pendingInputActions.clear();

  post({
    type: e.key,
    key: e.key,
    description: `Press ${e.key}`
  });
}, true);
})();
