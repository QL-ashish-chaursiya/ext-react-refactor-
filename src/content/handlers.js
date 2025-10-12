 // src/content/handlers.js
import { getElementInfo, generateXPaths } from "./xpath.js";
import { getState, setState, addHoverElement } from "./content-states.js";
 
let tempValue = null;
let searchableDropdownTimeout = null;
let scrollDebounceTimer = null;
let lastRecordedScrollY = 0;
let lastDOMSnapshot = null;
let scrollTimeout = null;
let isScrolling = false;
let scrollStartSnapshot = null;
let scrollStartY = 0;

export function attachAllListeners() {
  document.addEventListener("mouseover", handleHoverIn, true);
  document.addEventListener("mouseout", handleHoverOut, true);
  document.addEventListener("input", handleInput, { capture: true, passive: true });
  document.addEventListener("change", handleChange, { capture: true, passive: true });
   document.addEventListener("mousedown", handleMouseDown, { capture: true, passive: true });
   document.addEventListener("scroll", handleScroll, { passive: true, capture: true });
}

export function removeAllListeners() {
  document.removeEventListener("input", handleInput, true);
  document.removeEventListener("change", handleChange, true);
   document.removeEventListener("mousedown", handleMouseDown, true);
  document.removeEventListener("mouseover", handleHoverIn, true);
  document.removeEventListener("mouseout", handleHoverOut, true);
  document.removeEventListener("scroll", handleScroll, true); // ✅ Changed
  
  // Clear any pending scroll checks
  clearTimeout(scrollTimeout);
  isScrolling = false;
}
export  function getIframeElementForClickedNode(clickedElement) {
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
      console.log("frameWindow",frameWindow)
      return {
        crossOrigin: true,
        src: frameWindow.location?.href || null,
        id: null,
        title: null
      };
    }

    // Try to locate this iframe in the parent
    const iframes = Array.from(parentDoc.querySelectorAll("iframe"));
    console.log("all frame",iframes)
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
            src: src || iframe.baseURI || "about:blank"
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
    console.log("iframe",window.self !== window.top)
  const iframeIdentifier = isInIframe ?    getIframeElementForClickedNode(el) : null;
    const updatedAction = {...action,isTopFrame:!isInIframe,iframeIdentifier}
  if (!isRuntimeAvailable()) return;
  console.log("action 1",action)
  chrome.runtime
    .sendMessage({ command: "recordAction", action:updatedAction })
    .then(() =>  {})
    .catch(() => {});
}

function isRuntimeAvailable() {
  try {
    return !!chrome.runtime && !!chrome.runtime.sendMessage && !!chrome.runtime.id;
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
          content: reader.result
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
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
  el.classList.add('__recorder-hover-highlight__');
  const info = getElementInfo(el);
  const action = {
    type: 'hover',
    element: info,
    description: `Hover on ${info.tagName.toLowerCase()}${info.id ? `#${info.id}` : ''}`
  };
  sendAction(action, 'hover');
  let newState = await getState()
  if (newState?.multipleHover) return;
  if (!newState?.multipleHover) {
    // Use shadowContext if provided, otherwise fall back to document
    let addHoverBtn, hoverConfigUI;
    
    if (shadowContext && shadowContext.shadowRoot) {
      // Get elements from shadow DOM
      addHoverBtn = shadowContext.shadowRoot.getElementById('addHoverBtn');
      hoverConfigUI = shadowContext.shadowRoot.getElementById('hoverConfigUI');
    } else {
      // Fallback to regular DOM (for backward compatibility)
      addHoverBtn = document.getElementById('addHoverBtn');
      hoverConfigUI = document.getElementById('hoverConfigUI');
    }
    
    // Only proceed if elements are found
    if (addHoverBtn && hoverConfigUI) {
      await setState({ hoverModeActive: false });
      hoverConfigUI.style.display = "none";
      addHoverBtn.style.display = "block";
      document.querySelectorAll('.__recorder-hover-highlight__').forEach((el) => {
        el.classList.remove('__recorder-hover-highlight__');
      });
      document.removeEventListener("click", hoverClickListener, true);
    }
  }
}

async function handleHoverIn(e) {
  const state = await getState();
  if (!state.recording || state.hoverModeActive) return;
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

export async function handleMouseDown(event) {
  const state = await getState();
   
  if (!state.recording || !isRuntimeAvailable() || state.hoverModeActive) return;
  console.log("call")
  if (event.target.closest('[data-recorder-ui="true"]')) return;
  const target = event.target;
  const rect = target.getBoundingClientRect();
  const offsetX = event.clientX - rect.left;
  const offsetY = event.clientY - rect.top;
  const elementInfo = getElementInfo(target);

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

  setTimeout(() => {
    if (tempValue?.value) {
      sendAction(tempValue, target);
      tempValue = null;
    }
    sendAction(action, target);
  }, 0);
}

function isPartOfOtpGroup(input) {
  const parent = input.parentElement;
  if (!parent) return false;
  const inputs = Array.from(parent.querySelectorAll("input"));
  if (inputs.length < 4 || inputs.length > 6) return false;
  return inputs.every((inp) => inp.maxLength === 1 || inp.getAttribute("maxlength") === "1");
}

export async function handleChange(event) {
  const state = await getState();
  if (!state.recording || !isRuntimeAvailable() || state.hoverModeActive) return;
  if (event.target.closest('[data-recorder-ui="true"]')) return;

  const target = event.target;
  const autocomplete = target.getAttribute('autocomplete');
  const isAutoCompleteInput = autocomplete && autocomplete.toLowerCase() === 'off';
  const isOtp = isPartOfOtpGroup(target);
  if (isAutoCompleteInput && !isOtp) return;
  const elementInfo = getElementInfo(target);

  if (target.tagName === 'INPUT' && target.type === 'file') {
    const file = target.files[0];
    if (!file) return;
    const uniqueId = `${elementInfo.xpath[0] || elementInfo.id || elementInfo.tagName}-${Date.now()}`;
    const newAction = {
      type: 'fileSelect',
      element: elementInfo,
      value: file.name,
      filePath: file.name,
      fileStorageKey: `file_${uniqueId}`,
      url: window.location.href,
      description: `Select file "${file.name}" in ${elementInfo.id || elementInfo.tagName.toLowerCase()}`,
    };
    storeFileData(file, uniqueId)
      .then((data) => {
        newAction.storageData = data;
        sendAction(newAction,  target);
      })
      .catch(() => {});
    return;
  }
  
  const action = {
    type: "change",
    element: elementInfo,
    value: target.value,
    description: `Enter "${target.value}" `,
  };
  tempValue = null;
  sendAction(action, target);
}

export async function handleInput(event) {
  const state = await getState();
  if (!state.recording || !isRuntimeAvailable() || state.hoverModeActive) return;
  if (event.target.closest('[data-recorder-ui="true"]')) return;

  const target = event.target;
  if (target.type === "file") return;
  const elementInfo = getElementInfo(target);

  if (target.isContentEditable || target.getAttribute("contenteditable") === "true") {
    const value = target.textContent;
    clearTimeout(searchableDropdownTimeout);
    searchableDropdownTimeout =  setTimeout(() => {
      const action = {
        type: "change",
        element: elementInfo,
        value,
        description: `Enter "${value}" `,
      };
      sendAction(action,  target);
    }, 500);
    return;
  }

  tempValue = {
    type: "change",
    element: elementInfo,
    value: target.value,
    description: `Type "${target.value}" `,
  };
  if (target.tagName !== 'INPUT' || target.type === 'file') return;
  const autocomplete = target.getAttribute('autocomplete');
  const isAutoCompleteInput = autocomplete && autocomplete.toLowerCase() === 'off';
  const isOtp = isPartOfOtpGroup(target);
  if (isOtp || !isAutoCompleteInput) return;
  clearTimeout(searchableDropdownTimeout);
  searchableDropdownTimeout =  setTimeout(() => {
    const action = {
      type: "change",
      element: elementInfo,
      value: target.value,
      description: `Enter "${target.value}" `,
    };
    sendAction(action, target);
    tempValue = null;
  }, 500);
}
function getDOMSnapshot() {
  return {
    elementCount: document.body.getElementsByTagName('*').length,
    bodyHeight: document.body.scrollHeight,
    imageCount: document.querySelectorAll('img').length,
    videoCount: document.querySelectorAll('video').length,
    timestamp: Date.now()
  };
}

function hasNewContentLoaded(oldSnapshot, newSnapshot) {
  if (!oldSnapshot) return false;
  
  const elementDiff = newSnapshot.elementCount - oldSnapshot.elementCount;
  const heightDiff = newSnapshot.bodyHeight - oldSnapshot.bodyHeight;
  const imageDiff = newSnapshot.imageCount - oldSnapshot.imageCount;
  const videoDiff = newSnapshot.videoCount - oldSnapshot.videoCount;
  
  const hasNewContent = elementDiff > 5 || heightDiff > 200 || imageDiff > 0 || videoDiff > 0;
  
  return hasNewContent;
}
async function handleScroll(event) {
  const state = await getState();
  if (!state.recording || !isRuntimeAvailable() || state.hoverModeActive) return;

  const target = event.target;

  // Handle window/document scroll
  if (target === document || target === document.documentElement || target === window) {
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
        const contentAdded = hasNewContentLoaded(scrollStartSnapshot, currentSnapshot);
        
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
    if (typeof target._lastRecordedScrollY === 'undefined') {
      target._lastRecordedScrollY = 0;
    }
    
    // Start of container scroll
    if (!target._isScrolling) {
      target._isScrolling = true;
      target._scrollStartY = scrollY;
      target._scrollStartSnapshot = {
        childCount: target.children.length,
        scrollHeight: target.scrollHeight
      };
    }
    
    clearTimeout(target._scrollTimeout);
    
    target._scrollTimeout = setTimeout(() => {
      const scrollDiff = Math.abs(scrollY - target._lastRecordedScrollY);
      
      if (scrollDiff >= 100) {
        const currentSnapshot = {
          childCount: target.children.length,
          scrollHeight: target.scrollHeight
        };
        
        const childDiff = currentSnapshot.childCount - target._scrollStartSnapshot.childCount;
        const heightDiff = currentSnapshot.scrollHeight - target._scrollStartSnapshot.scrollHeight;
        const contentAdded = childDiff > 3 || heightDiff > 100;
        
        if (contentAdded) {
          const action = {
            type: "scroll",
            scrollX: target.scrollLeft,
            scrollY: scrollY,
            description: `Scroll container <${target.tagName.toLowerCase()}${target.id ? "#" + target.id : ""}> to (${target.scrollLeft}, ${scrollY})`,
            containerXPath: generateXPaths(target)
          };
          sendAction(action, "scroll");
          target._lastRecordedScrollY = scrollY;
        }
      }
      
      target._isScrolling = false;
    }, 1000);
  }
}
