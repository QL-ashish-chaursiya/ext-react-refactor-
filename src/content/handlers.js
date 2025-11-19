  // src/content/handlers.js
import { getElementInfo, generateXPaths } from "./xpath.js";
import { getState, setState } from "./content-states.js";
import { IMPORTANT_KEYS } from "../utils/constant.js";
 import webext from 'webextension-polyfill';
let lastRecordedScrollY = 0;
export let pendingInputAction = null;


let scrollTimeout = null;
let scrollStartY
let isScrolling = false;
let scrollStartSnapshot = null;
let pendingClickTimeout = null;
 let draggedElement = null; // Track dragged element
  let isDragging = false; // Track dragging state
  
export function attachAllListeners() {
  document.addEventListener("mouseover", handleHoverIn, true);
  document.addEventListener("mouseout", handleHoverOut, true);
  document.addEventListener("input", handleInput, {
    capture: true,
    passive: true,
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
}
 
  export function detectRealDrag(targetEl, timeout = 200) {
  return new Promise(resolve => {
    if (!targetEl || targetEl.nodeType !== 1) {
      return resolve(false);
    }

    // IGNORE IMG / A / P
    const tag = targetEl.tagName.toLowerCase();
    if (["img", "a", "p"].includes(tag)) {
      return resolve(false);
    }

    // IGNORE extension UI
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
  const state = await getState();
  
  // Skip if not recording or in special modes
  if (!state.recording || !isRuntimeAvailable() || state.hoverModeActive || state.compareImg) {
    return;
  }
  
  // Skip recorder UI
  if (e.target.closest('[data-recorder-ui="true"]')) return;
  
  const el = e.target;
  
  // Store click info immediately
  const clickInfo = {
    target: el,
    clientX: e.clientX,
    clientY: e.clientY,
  };
  
  // Clear any pending click
  if (pendingClickTimeout) {
    clearTimeout(pendingClickTimeout);
    pendingClickTimeout = null;
  }
  
  // Check if this is a real drag (wait up to 200ms instead of 1500ms for better UX)
  const isDrag = await detectRealDrag(el, 200);
  if (pendingInputAction) {
  sendAction(pendingInputAction, e.target);
  pendingInputAction = null;
}

  if (isDrag) {
    // ✅ Handle as DRAG
    console.log('🎯 Drag detected');
    isDragging = true;
    draggedElement = el;
    
    const info = getElementInfo(el);
    sendAction({
      type: "dragstart",
      element: info,
      clientX: e.clientX,
      clientY: e.clientY,
      description: `Drag started`
    }, el);
  } else {
    // ✅ Handle as CLICK
    console.log('🎯 Click detected');
    handleClickFromPointer(clickInfo);
  }
}

// New function to handle click detection
function handleClickFromPointer(clickInfo) {
  const { target, clientX, clientY } = clickInfo;
  
  const rect = target.getBoundingClientRect();
  const offsetX = clientX - rect.left;
  const offsetY = clientY - rect.top;
  const elementInfo = getElementInfo(target);

  const action = {
    type: "mousedown", // or "mousedown" if you prefer
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
  
  
  const target =   document.body;
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

  // Reset
  draggedElement = null;
  isDragging = false;
}
export function removeAllListeners() {
  document.removeEventListener("input", handleInput, true);
  
  
  
     document.removeEventListener('pointerdown', handlePointerDown, true);
    document.removeEventListener('pointerup', handlePointerUp, true);
  document.removeEventListener("mouseover", handleHoverIn, true);
  document.removeEventListener("mouseout", handleHoverOut, true);
  document.removeEventListener("scroll", handleScroll, true); // ✅ Changed
  document.removeEventListener("keydown", handleKeydown, true);

  // Clear any pending scroll checks
  clearTimeout(scrollTimeout);
  isScrolling = false;
}
export function getIframeElementForClickedNode(clickedElement) {
  try {
    const ownerDoc = clickedElement.ownerDocument;
    const frameWindow = ownerDoc.defaultView;

    // If the element is in the main window
    if (frameWindow === window.top) return null;

    let parentDoc = null;
    try {
      parentDoc = frameWindow.parent.document; // ❗ may throw cross-origin error
    } catch (err) {
      // Cross-origin frame
      console.log("frameWindow", frameWindow);
      return {
        crossOrigin: true,
        src: frameWindow.location?.href || null,
        id: null,
        title: null,
      };
    }

    // Try to locate this iframe in the parent
    const iframes = Array.from(parentDoc.querySelectorAll("iframe"));
    console.log("all frame", iframes);
    for (const iframe of iframes) {
      try {
        if (iframe.contentWindow === frameWindow) {
          const src = iframe.getAttribute("src") || "";
          const isBlank = !src || src === "about:blank";

          // Handle about:blank smartly
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
        // contentWindow access failed (cross-origin)
        console.warn("⚠️ Unable to fully inspect iframe:", innerErr);
      }
    }

    return null;
  } catch (err) {
    console.warn("⚠️ Unable to find iframe for clicked node:", err);
    return null;
  }
}

export function sendAction(action, el) {
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

// In your handlers.js file, update the handleClick function:

// In your handlers.js file, update the handleClick function:

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
    // Use shadowContext if provided, otherwise fall back to document
    let addHoverBtn, hoverConfigUI;

    if (shadowContext && shadowContext.shadowRoot) {
      // Get elements from shadow DOM
      addHoverBtn = shadowContext.shadowRoot.getElementById("addHoverBtn");
      hoverConfigUI = shadowContext.shadowRoot.getElementById("hoverConfigUI");
    } else {
      // Fallback to regular DOM (for backward compatibility)
      addHoverBtn = document.getElementById("addHoverBtn");
      hoverConfigUI = document.getElementById("hoverConfigUI");
    }

    // Only proceed if elements are found
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

 

 
 
 
 

  export async function handleInput(event) {
  const state = await getState();
  if (!state.recording || !isRuntimeAvailable() || state.hoverModeActive) return;
  if (event.target.closest('[data-recorder-ui="true"]')) return;

  const target = event.target;
  if (!target) return;

  // ✅ File upload handling (added)
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
    console.log("value testing",value)
      const elementInfo = getElementInfo(target);

      pendingInputAction = {
        type: "change",
        element: elementInfo,
        value,
        description: `Enter "${value}"`,
      };

     

    return;
  }

  const elementInfo = getElementInfo(target);
  const value = target.value;

  // ✅ Simple OTP detection (maxlength = 1)
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

  // ✅ Normal input → store pending
  pendingInputAction = {
    type: "change",
    element: elementInfo,
    value,
    description: `Enter "${value}"`,
  };
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

  // Handle window/document scroll
  if (
    target === document ||
    target === document.documentElement ||
    target === window
  ) {
    const currentY = window.scrollY;

    // Start of scrolling - take initial snapshot
    if (!isScrolling) {
      isScrolling = true;
      scrollStartY = currentY;
      scrollStartSnapshot = getDOMSnapshot();
    }

    // Clear existing timeout
    clearTimeout(scrollTimeout);

    // Wait 2 seconds after user stops scrolling
    scrollTimeout = setTimeout(() => {
      const scrollDiff = Math.abs(currentY - lastRecordedScrollY);

      // Only process if scrolled significantly
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
  }
  // Handle scrollable containers
  else if (target instanceof Element) {
    const scrollY = target.scrollTop;

    // Initialize container tracking
    if (typeof target._lastRecordedScrollY === "undefined") {
      target._lastRecordedScrollY = 0;
    }

    // Start of container scroll
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

  // const elementInfo = getElementInfo(target);
if (pendingInputAction) {
  sendAction(pendingInputAction, target);
  pendingInputAction = null;
}

  const action = {
    type: key,
    key,
    // element: elementInfo,
    description: `Press ${key}`,
  };
  sendAction(action, target);
  // Ensure async batching consistency like your mouse handler
}
