// src/content/handlers.js
import { getElementInfo, generateXPaths } from "./xpath.js";
import { getState, setState } from "./content-states.js";
import { IMPORTANT_KEYS } from "../utils/constant.js";
import webext from 'webextension-polyfill';

let lastRecordedScrollY = 0;
export let pendingInputAction = null;

let scrollTimeout = null;
let scrollStartY;
let isScrolling = false;
let scrollStartSnapshot = null;
let pendingClickTimeout = null;
let draggedElement = null;
let isDragging = false;

// ✅ NEW: Track autofill detection
let autofillDetectionTimeout = null;
let pendingInputActions = new Map(); // Store multiple pending inputs

export function attachAllListeners() {
  document.addEventListener("mouseover", handleHoverIn, true);
  document.addEventListener("mouseout", handleHoverOut, true);
  document.addEventListener("input", handleInput, {
    capture: true,
    passive: false,
  });
  
  document.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: false });
  document.addEventListener('pointerup', handlePointerUp, { capture: true, passive: false });
  
  document.addEventListener("keydown", handleKeydown, {
    capture: true,
    passive: true,
  });
  document.addEventListener("scroll", handleScroll, {
    passive: true,
    capture: true,
  });

  // ✅ NEW: Listen for form changes (autofill detection)
  document.addEventListener("change", handleChange, {
    capture: true,
    passive: false,
  });
}

export function detectRealDrag(targetEl, timeout = 200) {
  return new Promise(resolve => {
    if (!targetEl || targetEl.nodeType !== 1) {
      return resolve(false);
    }

    const tag = targetEl.tagName.toLowerCase();
    if (["img", "a", "p"].includes(tag)) {
      return resolve(false);
    }

    if (targetEl.closest('[data-recorder-ui="true"]')) {
      return resolve(false);
    }

    const startRect = targetEl.getBoundingClientRect();
    let moved = false;

    function onMove() {
      const rect = targetEl.getBoundingClientRect();
      if (rect.x !== startRect.x || rect.y !== startRect.y) {
        moved = true;
        cleanup();
        resolve(true);
      }
    }

    function onEnd() {
      cleanup();
      resolve(moved);
    }

    function cleanup() {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onEnd, true);
      document.removeEventListener("pointercancel", onEnd, true);
    }

    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onEnd, true);
    document.addEventListener("pointercancel", onEnd, true);

    setTimeout(() => {
      cleanup();
      resolve(moved);
    }, timeout);
  });
}

export async function handlePointerDown(e) {
  const el = e.target;
  const info = getElementInfo(el);
  
  const clickInfo = {
    target: el,
    clientX: e.clientX,
    clientY: e.clientY,
    elementInfo: info
  };
  
  const state = await getState();
  
  if (!state.recording || !isRuntimeAvailable() || state.hoverModeActive || state.compareImg) {
    return;
  }
  
  if (e.target.closest('[data-recorder-ui="true"]')) return;
  
  if (pendingClickTimeout) {
    clearTimeout(pendingClickTimeout);
    pendingClickTimeout = null;
  }
  
  const isDrag = await detectRealDrag(el, 200);
  
  // ✅ FIX: Flush pending inputs before processing new action
  flushPendingInputs();

  if (isDrag) {
    console.log('🎯 Drag detected');
    isDragging = true;
    draggedElement = el;
    
    sendAction({
      type: "dragstart",
      element: info,
      clientX: e.clientX,
      clientY: e.clientY,
      description: `Drag started`
    }, el);
  } else {
    console.log('🎯 Click detected');
    handleClickFromPointer(clickInfo);
  }
}

function handleClickFromPointer(clickInfo) {
  const { target, clientX, clientY, elementInfo } = clickInfo;
  
  const rect = target.getBoundingClientRect();
  const offsetX = clientX - rect.left;
  const offsetY = clientY - rect.top;

  const action = {
    type: "mousedown",
    element: elementInfo,
    offsetX,
    offsetY,
    description: `Click on ${
      elementInfo.name
        ? elementInfo.name
        : hasMoreThanOneNonAlphabet(elementInfo.id)
        ? `#${elementInfo.tagName.toLowerCase()}`
        : elementInfo.id
    }`,
  };
  sendAction(action, target);
}

async function handlePointerUp(event) {
  const state = await getState();
  if (!state.recording || state.hoverModeActive || state.compareImg || !isDragging || !draggedElement) return;
  event.preventDefault();
  
  const clientX = event.clientX ?? (event.touches?.[0]?.clientX);
  const clientY = event.clientY ?? (event.touches?.[0]?.clientY);
  const sourceInfo = getElementInfo(draggedElement);
  
  const target = document.body;
  const targetInfo = getElementInfo(target);
  
  const rect = target.getBoundingClientRect();
  const offsetX = clientX - rect.left;
  const offsetY = clientY - rect.top;

  const action = {
    type: 'dragend',
    element: targetInfo,
    sourceElement: sourceInfo,
    clientX, clientY,
    offsetX, offsetY,
    description: `Drag ended: ${sourceInfo.tagName} → ${targetInfo.tagName}`
  };
  sendAction(action, 'dragend');

  draggedElement = null;
  isDragging = false;
}

export function removeAllListeners() {
  document.removeEventListener("input", handleInput, true);
  document.removeEventListener("change", handleChange, true); // ✅ NEW
  document.removeEventListener('pointerdown', handlePointerDown, true);
  document.removeEventListener('pointerup', handlePointerUp, true);
  document.removeEventListener("mouseover", handleHoverIn, true);
  document.removeEventListener("mouseout", handleHoverOut, true);
  document.removeEventListener("scroll", handleScroll, true);
  document.removeEventListener("keydown", handleKeydown, true);

  clearTimeout(scrollTimeout);
  clearTimeout(autofillDetectionTimeout); // ✅ NEW
  isScrolling = false;
  pendingInputActions.clear(); // ✅ NEW
}

export function getIframeElementForClickedNode(clickedElement) {
  try {
    const ownerDoc = clickedElement.ownerDocument;
    const frameWindow = ownerDoc.defaultView;

    if (frameWindow === window.top) return null;

    let parentDoc = null;
    try {
      parentDoc = frameWindow.parent.document;
    } catch (err) {
      console.log("frameWindow", frameWindow);
      return {
        crossOrigin: true,
        src: frameWindow.location?.href || null,
        id: null,
        title: null,
      };
    }

    const iframes = Array.from(parentDoc.querySelectorAll("iframe"));
    console.log("all frame", iframes);
    for (const iframe of iframes) {
      try {
        if (iframe.contentWindow === frameWindow) {
          const src = iframe.getAttribute("src") || "";
          const isBlank = !src || src === "about:blank";

          if (isBlank) {
            const doc = iframe.contentDocument;
            const hasContent = doc && doc.body && doc.body.children.length > 0;
            if (!hasContent) {
              console.log("🕳 Ignoring truly blank iframe");
              continue;
            }
          }

          return {
            crossOrigin: false,
            id: iframe.id || null,
            title: iframe.title || null,
            src: src || iframe.baseURI || "about:blank",
          };
        }
      } catch (innerErr) {
        console.warn("⚠️ Unable to fully inspect iframe:", innerErr);
      }
    }

    return null;
  } catch (err) {
    console.warn("⚠️ Unable to find iframe for clicked node:", err);
    return null;
  }
}

export async function sendAction(action, el) {
  const state = await getState();
  if (!state.recording) return;
  
  const isInIframe = window.self !== window.top;
  console.log("iframe", window.self !== window.top);
  const iframeIdentifier = isInIframe
    ? getIframeElementForClickedNode(el)
    : null;
  const updatedAction = {
    ...action,
    isTopFrame: !isInIframe,
    iframeIdentifier,
  };
  if (!isRuntimeAvailable()) return;
  console.log("action 1", action);
  webext.runtime
    .sendMessage({ command: "recordAction", action: updatedAction })
    .then(() => {})
    .catch(() => {});
}

function isRuntimeAvailable() {
  try {
    return (
      !!webext.runtime && !!webext.runtime.sendMessage && !!webext.runtime.id
    );
  } catch {
    return false;
  }
}

function storeFileData(file, uniqueId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve({
          name: file.name,
          type: file.type,
          content: reader.result,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export async function handleClick(e, hoverClickListener, shadowContext = null) {
  if (e.target.closest('[data-recorder-ui="true"]')) return;
  e.preventDefault();
  e.stopPropagation();

  const el = e.target;
  el.classList.add("__recorder-hover-highlight__");
  const info = getElementInfo(el);
  const action = {
    type: "hover",
    element: info,
    description: `Hover on ${info.tagName.toLowerCase()}${
      info.id ? `#${info.id}` : ""
    }`,
  };
  sendAction(action, "hover");
  let newState = await getState();
  if (newState?.multipleHover) return;
  if (!newState?.multipleHover) {
    let addHoverBtn, hoverConfigUI;

    if (shadowContext && shadowContext.shadowRoot) {
      addHoverBtn = shadowContext.shadowRoot.getElementById("addHoverBtn");
      hoverConfigUI = shadowContext.shadowRoot.getElementById("hoverConfigUI");
    } else {
      addHoverBtn = document.getElementById("addHoverBtn");
      hoverConfigUI = document.getElementById("hoverConfigUI");
    }

    if (addHoverBtn && hoverConfigUI) {
      await setState({ hoverModeActive: false });
      hoverConfigUI.style.display = "none";
      addHoverBtn.style.display = "block";
      document
        .querySelectorAll(".__recorder-hover-highlight__")
        .forEach((el) => {
          el.classList.remove("__recorder-hover-highlight__");
        });
      document.removeEventListener("click", hoverClickListener, true);
    }
  }
}

async function handleHoverIn(e) {
  const state = await getState();
  if (!state.recording || state.hoverModeActive || state.compareImg) return;
  if (e.target.closest('[data-recorder-ui="true"]')) return;
  e.target.classList.add("__recorder-hover-highlight__");
}

async function handleHoverOut(e) {
  const state = await getState();
  if (state.hoverModeActive) return;
  e.target.classList.remove("__recorder-hover-highlight__");
}

function hasMoreThanOneNonAlphabet(str) {
  if (!str) return true;
  const nonAlphaMatches = str.match(/[^a-zA-Z]/g);
  return nonAlphaMatches && nonAlphaMatches.length > 1;
}

// ✅ NEW: Generate unique key for input field
 function getInputKey(target) {
  const elementInfo = getElementInfo(target);
  if (elementInfo.id) {
    return elementInfo.id;
  }
  
  if (target.name) {
    return `name-${target.name}`;
  }
  
  // ✅ FIX: Use a stable fallback instead of Date.now()
  // Create a unique key based on element properties
  const tagName = elementInfo.tagName || 'unknown';
  const type = target.type || '';
  const className = target.className || '';
  const placeholder = target.placeholder || '';
  
  // Generate a hash-like stable key
  return `${tagName}-${type}-${className}-${placeholder}`.replace(/\s+/g, '-');
}

// ✅ NEW: Flush all pending inputs
function flushPendingInputs() {
  if (pendingInputActions.size === 0) return;
  
  console.log(`📤 Flushing ${pendingInputActions.size} pending input(s)`);
  
  pendingInputActions.forEach((action, key) => {
    sendAction(action.action, action.target);
  });
  
  pendingInputActions.clear();
  pendingInputAction = null;
}

// ✅ NEW: Handle change events (detects autofill completion)
async function handleChange(event) {
  const state = await getState();
  if (!state.recording || !isRuntimeAvailable()) return;
  if (event.target.closest('[data-recorder-ui="true"]')) return;

  const target = event.target;
  
  // Detect if this is part of an autofill
  clearTimeout(autofillDetectionTimeout);
  
  autofillDetectionTimeout = setTimeout(() => {
    // After 300ms, flush all pending inputs (autofill is complete)
    flushPendingInputs();
  }, 300);
}

export function handleInput(event) {
  if (event.target.closest('[data-recorder-ui="true"]')) return;
  const target = event.target;
  if (!target) return;

  // ✅ File upload handling
  if (target.tagName === "INPUT" && target.type === "file") {
    const elementInfo = getElementInfo(target);
    const file = target.files[0];
    if (!file) return;

    const uniqueId = `${
      elementInfo.xpath?.[0] || elementInfo.id || elementInfo.tagName
    }-${Date.now()}`;

    const newAction = {
      type: "fileSelect",
      element: elementInfo,
      value: file.name,
      filePath: file.name,
      fileStorageKey: `file_${uniqueId}`,
      url: window.location.href,
      description: `Select file "${file.name}" in ${
        elementInfo.id || elementInfo.tagName.toLowerCase()
      }`,
    };

    storeFileData(file, uniqueId)
      .then((data) => {
        newAction.storageData = data;
        sendAction(newAction, target);
      })
      .catch(() => {});

    return;
  }

  // ✅ Handle contenteditable
  if (
    target.isContentEditable ||
    target.getAttribute?.("contenteditable") === "true"
  ) {
    const value = target.textContent || "";
    console.log("value testing", value);
    const elementInfo = getElementInfo(target);

    pendingInputAction = {
      type: "change",
      element: elementInfo,
      value,
      description: `Enter "${value}"`,
    };
const inputKey = getInputKey(target);
   

  pendingInputActions.set(inputKey, {
    action:pendingInputAction,
    target,
    timestamp: Date.now()
  });
    return;
  }

  const elementInfo = getElementInfo(target);
  const value = target.value;

  // ✅ Simple OTP detection
  const isOtp =
    (typeof target.maxLength === "number" && target.maxLength === 1) ||
    target.getAttribute("maxlength") === "1";

  // ✅ OTP → send immediately
  if (isOtp) {
    const otpAction = {
      type: "change",
      element: elementInfo,
      value,
      description: `Enter OTP digit "${value}"`,
    };

    sendAction(otpAction, target);
    return;
  }

  // ✅ NEW: Store in Map instead of overwriting
  const inputKey = getInputKey(target);
  const action = {
    type: "change",
    element: elementInfo,
    value,
    description: `Enter "${value}" in ${elementInfo.name || elementInfo.id || elementInfo.tagName.toLowerCase()}`,
  };

  pendingInputActions.set(inputKey, {
    action,
    target,
    timestamp: Date.now()
  });

  // Also keep backward compatibility with single pendingInputAction
  pendingInputAction = action;

  console.log(`📝 Stored pending input for ${inputKey}, total: ${pendingInputActions.size}`);
}

function getDOMSnapshot() {
  return {
    elementCount: document.body.getElementsByTagName("*").length,
    bodyHeight: document.body.scrollHeight,
    imageCount: document.querySelectorAll("img").length,
    videoCount: document.querySelectorAll("video").length,
    timestamp: Date.now(),
  };
}

function hasNewContentLoaded(oldSnapshot, newSnapshot) {
  if (!oldSnapshot) return false;

  const elementDiff = newSnapshot.elementCount - oldSnapshot.elementCount;
  const heightDiff = newSnapshot.bodyHeight - oldSnapshot.bodyHeight;
  const imageDiff = newSnapshot.imageCount - oldSnapshot.imageCount;
  const videoDiff = newSnapshot.videoCount - oldSnapshot.videoCount;

  const hasNewContent =
    elementDiff > 5 || heightDiff > 200 || imageDiff > 0 || videoDiff > 0;

  return hasNewContent;
}

async function handleScroll(event) {
  const state = await getState();
  if (!state.recording || !isRuntimeAvailable() || state.hoverModeActive)
    return;

  const target = event.target;

  if (
    target === document ||
    target === document.documentElement ||
    target === window
  ) {
    const currentY = window.scrollY;

    if (!isScrolling) {
      isScrolling = true;
      scrollStartY = currentY;
      scrollStartSnapshot = getDOMSnapshot();
    }

    clearTimeout(scrollTimeout);

    scrollTimeout = setTimeout(() => {
      const scrollDiff = Math.abs(currentY - lastRecordedScrollY);

      if (scrollDiff >= 150) {
        const currentSnapshot = getDOMSnapshot();
        const contentAdded = hasNewContentLoaded(
          scrollStartSnapshot,
          currentSnapshot
        );

        if (contentAdded) {
          const action = {
            type: "scroll",
            scrollX: window.scrollX,
            scrollY: currentY,
            description: `Scroll page to (${window.scrollX}, ${currentY})`,
          };
          sendAction(action, "scroll");
          lastRecordedScrollY = currentY;
        }
      }

      isScrolling = false;
    }, 1000);
  } else if (target instanceof Element) {
    const scrollY = target.scrollTop;

    if (typeof target._lastRecordedScrollY === "undefined") {
      target._lastRecordedScrollY = 0;
    }

    if (!target._isScrolling) {
      target._isScrolling = true;
      target._scrollStartY = scrollY;
      target._scrollStartSnapshot = {
        childCount: target.children.length,
        scrollHeight: target.scrollHeight,
      };
    }

    clearTimeout(target._scrollTimeout);

    target._scrollTimeout = setTimeout(() => {
      const scrollDiff = Math.abs(scrollY - target._lastRecordedScrollY);

      if (scrollDiff >= 100) {
        const currentSnapshot = {
          childCount: target.children.length,
          scrollHeight: target.scrollHeight,
        };

        const childDiff =
          currentSnapshot.childCount - target._scrollStartSnapshot.childCount;
        const heightDiff =
          currentSnapshot.scrollHeight -
          target._scrollStartSnapshot.scrollHeight;
        const contentAdded = childDiff > 3 || heightDiff > 100;

        if (contentAdded) {
          const action = {
            type: "scroll",
            scrollX: target.scrollLeft,
            scrollY: scrollY,
            description: `Scroll container <${target.tagName.toLowerCase()}${
              target.id ? "#" + target.id : ""
            }> to (${target.scrollLeft}, ${scrollY})`,
            containerXPath: generateXPaths(target),
          };
          sendAction(action, "scroll");
          target._lastRecordedScrollY = scrollY;
        }
      }

      target._isScrolling = false;
    }, 1000);
  }
}

export async function handleKeydown(event) {
  const state = await getState();
  if (!state.recording || !isRuntimeAvailable() || state.hoverModeActive)
    return;

  const { key, target } = event;
  if (!IMPORTANT_KEYS.includes(key)) return;
  if (target.closest('[data-recorder-ui="true"]')) return;

  // ✅ FIX: Flush all pending inputs on important keys
  flushPendingInputs();

  const action = {
    type: key,
    key,
    description: `Press ${key}`,
  };
  sendAction(action, target);
}