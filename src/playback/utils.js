import { IS_CUSTOM } from "../utils/constant";
import webext from 'webextension-polyfill';
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  export async function waitForNetworkIdlePolling(maxWait = 15000) {
    return new Promise((resolve) => {
      const requestId = Date.now() + Math.random();
      let resolved = false;
  
      const messageHandler = async (event) => {
        if (event.source !== window) return;
        if (event.data.type === 'NETWORK_IDLE_RESOLVED' && 
            event.data.source === 'network-monitor' &&
            event.data.requestId === requestId) {
          if (!resolved) {
            resolved = true;
            window.removeEventListener('message', messageHandler);
            clearTimeout(timeoutId);
            console.log('[playback] Network idle resolved from web page', event.data.data);
            resolve(event.data.data);
          }
        }
      };
  
      window.addEventListener('message', messageHandler);
      window.postMessage({
        type: 'WAIT_FOR_NETWORK_IDLE',
        requestId: requestId,
        debounce: 1000,
        timeout: maxWait
      }, '*');
  
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          window.removeEventListener('message', messageHandler);
          console.log('[playback] Network idle timeout reached');
          resolve('timeout');
        }
      }, maxWait + 1000);
    });
  }
  
  export async function locateElement(action) {
    const xpaths = action.element?.xpath || [];
  
    const tryLocate = async () => {
      for (let i = 0; i < xpaths.length; i++) {
        updateStatus('⏳ Waiting for Network...');
        await waitForNetworkIdlePolling();
        updateStatus('🚀 Running test playback...');
        const xpath = xpaths[i];
        await delay(100);
        try {
          const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          if (result.singleNodeValue) {
            console.log(`✅ Located element with XPath [${i}]: ${xpath}`);
            return result.singleNodeValue;
          } else {
            console.log(`❌ XPath [${i}] did not match: ${xpath}`);
          }
        } catch (e) {
          console.log(`⚠️ Invalid XPath [${i}]: ${xpath}`, e);
        }
      }
      return null;
    };
  
    let element = await tryLocate();
    if (element) return { element, failed: false };
  
    console.log(`⏳ Retrying element location after 10 seconds...`);
    updateStatus('⏳ Waiting for Element...');
    await delay(10000);
    element = await tryLocate();
    if (element) return { element, failed: false };
  
    console.log(`❌ Failed to locate element using any XPath.`);
    return { element: null, failed: true };
  }
  
  export async function ensureClickable(xpath, timeout = 10000) {
    async function checkOnce() {
      const el = await waitForElementByXPath(xpath, timeout);
      if (!el) return { success: false, message: "❌ Element not found" };
  
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) {
        return { success: false, message: "❌ Element found but not visible (zero size or animating)" };
      }
  
      if (el.disabled) {
        return { success: false, message: "❌ Element is disabled" };
      }
  
      return { success: true, message: "✅ Clickable" };
    }
  
    let result = await checkOnce();
    if (result.success) return result;
  
    await new Promise(res => setTimeout(res, 5000));
    result = await checkOnce();
    return result;
  }
  
  export async function waitForElementByXPath(xpaths, timeout = 10000) {
    if (!Array.isArray(xpaths)) xpaths = [xpaths];
    const pollInterval = 100;
    const start = Date.now();
    while (Date.now() - start < timeout) {
      for (const xpath of xpaths) {
        await delay(100);
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        const el = result.singleNodeValue;
        if (el && document.contains(el)) {
          return el;
        }
      }
      await new Promise(r => setTimeout(r, pollInterval));
    }
    throw new Error(`Target element not found via any of the provided XPaths after ${timeout}ms`);
  }
  
  export function normalizeUrl(url) {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      const staticSegments = [];
      for (const part of parts) {
        if (
          part === 'null' ||
          part === 'undefined' ||
          /^\d+$/.test(part) ||
          /^[a-f0-9]{8,}$/i.test(part) ||
          /^[a-zA-Z0-9]{25,}$/.test(part) ||
          /^[a-zA-Z0-9_-]{30,}$/.test(part) ||
          /^(session|tx|doc|res|rpt|art)_/.test(part) ||
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part) ||
          /^uuid-[0-9a-f-]{20,}$/i.test(part)
        ) {
          continue;
        }
        staticSegments.push(part);
      }
      const normalizedPath = '/' + staticSegments.join('/');
      return `${u.origin}${normalizedPath}`;
    } catch (e) {
      return url;
    }
  }
  
   export async function sendMessageAsync(message) {
  try {
    const response = await webext.runtime.sendMessage(message);
    return response;
  } catch (err) {
    throw err;
  }
}

   export function updateStatus(text) {
    const statusOverlay = document.getElementById('__playback_status_overlay__');
    if (statusOverlay) {
      statusOverlay.textContent = text;
    }
  }
  export  async function getClickablePoint(el, offsetX, offsetY) {
    if (!el) {
      return { success: false, reason: "Element not found" };
    }
  
    const rect = el.getBoundingClientRect();
  
    // Utility: check if a point is clickable
    const isPointClickable = (x, y) => {
      const elAt = document.elementFromPoint(x, y);
      return elAt === el || el.contains(elAt);
    };
  
    // 1. Recorded point
    const recordedX = Math.floor(rect.left + (offsetX ?? rect.width / 2));
    const recordedY = Math.floor(rect.top + (offsetY ?? rect.height / 2));
    if (isPointClickable(recordedX, recordedY)) {
      return { success: true, x: recordedX, y: recordedY, reason: "Recorded point clickable" };
    }
  console.log("given point is not clickable")
    // 2. Center point
    const centerX = Math.floor(rect.left + rect.width / 2);
    const centerY = Math.floor(rect.top + rect.height / 2);
    if (isPointClickable(centerX, centerY)) {
      return { success: true, x: centerX, y: centerY, reason: "Center clickable" };
    }
    console.log("center point is not clickable")
    // 3. Fallback points (corners + edges)
    const candidates = [
      { x: rect.left + 1, y: rect.top + 1, label: "Top-left" },
      { x: rect.right - 1, y: rect.top + 1, label: "Top-right" },
      { x: rect.left + 1, y: rect.bottom - 1, label: "Bottom-left" },
      { x: rect.right - 1, y: rect.bottom - 1, label: "Bottom-right" },
      { x: rect.left + rect.width / 2, y: rect.top + 1, label: "Top-center" },
      { x: rect.left + rect.width / 2, y: rect.bottom - 1, label: "Bottom-center" },
      { x: rect.left + 1, y: rect.top + rect.height / 2, label: "Left-center" },
      { x: rect.right - 1, y: rect.top + rect.height / 2, label: "Right-center" },
    ];
  
    for (const c of candidates) {
      const cx = Math.floor(c.x);
      const cy = Math.floor(c.y);
      if (isPointClickable(cx, cy)) {
        return { success: true, x: cx, y: cy, reason: `${c.label} clickable` };
      }
    }
    console.log("other edge case point is not clickable")
    // 4. Final fallback: try direct element.click()
    try {
      el.click();
      return { success: true, x: null, y: null, reason: "Fallback: direct element.click() used" };
    } catch (err) {
      return { success: false, reason: `No clickable point found, and el.click() failed: ${err.message}` };
    }
  }
  // Helper function to check if element is covered
 export function isElementCovered(element, customCoords = null) {
  try {
    if (!element || element.nodeType !== 1) {
      return { covered: true, reason: "Invalid DOM element" };
    }

    // 1) Get rect safely
    const rect = element.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { covered: true, reason: "Element has no visible size" };
    }

    // 2) Calculate interaction point
    let point = { x: 0, y: 0 };

    if (customCoords) {
      point = {
        x: rect.left + customCoords.x,
        y: rect.top + customCoords.y,
      };
    } else {
      point = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
    }

    // 3) Get element at point
    const topElement = document.elementFromPoint(point.x, point.y);

    // if (!topElement) {
    //   return { covered: true, reason: "No element found at click point" };
    // }

    // --- IMPORTANT: supports SVG <path> etc ---
    const isSame =
      topElement === element ||
      element.contains(topElement) ||
      topElement.contains(element);

    if (isSame) {
      return { covered: false, reason: "Element is clickable" };
    }

    // 4) Ensure topElement is a valid Element before styles
    if (!(topElement instanceof Element)) {
      return { covered: true, reason: "Top element is not a valid Element node" };
    }

    const computedStyle = window.getComputedStyle(topElement);
    const zIndex = parseInt(computedStyle.zIndex) || 0;

    const isHighLayer =
      zIndex > 100 &&
      (computedStyle.position === "fixed" ||
        computedStyle.position === "absolute");

    if ( isHighLayer) {
      return {
        covered: true,
        reason: "Covered by overlay/modal/loader",
        coveringElement: topElement,
      };
    }

    // fallback
    return {
      covered: true,
      reason: "Covered by another element",
      coveringElement: topElement,
    };
  } catch (err) {
    return { covered: false, reason: "Error: " + err.message };
  }
}


// Helper to wait for element to be uncovered
export async function waitForElementUncovered(element, timeout = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const coverCheck = isElementCovered(element);
    
    if (!coverCheck.covered) {
      return { success: true, message: 'Element is now clickable' };
    }
    
    console.log(`⏳ Waiting for overlay to clear: ${coverCheck.reason}`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  return { 
    success: false, 
    message: 'Timeout: Element still covered after waiting' 
  };
}
export async function  locateIframeElement(action) {
    const xpaths = action.element?.xpath || [];

    const tryLocate = async () => {
      for (let i = 0; i < xpaths.length; i++) {
        
        const xpath = xpaths[i];
        await delay(100);
        try {
          const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
           if (result.singleNodeValue) {
  let node = result.singleNodeValue;
  
  // Ensure it's an element
  if (node.nodeType !== Node.ELEMENT_NODE && node.parentElement) {
   
    node = node.parentElement;
  }
  
  if (node && typeof node.click === "function") {
    console.log(`✅ Located clickable element [${i}]: ${xpath}`);
  } else {
  
    
  }
  
  return node;
}

        } catch (e) {
          console.log(`⚠️ Invalid XPath [${i}]: ${xpath}`, e);
        }
      }
      return null;
    };

    // First attempt
    let element = await tryLocate();
    if (element) return { element, failed: false };

    // Retry after delay
    console.log(`⏳ Retrying element location after 10 seconds...`);
     
    await delay(10000);

    element = await tryLocate();
    if (element) return { element, failed: false };

    // Failed after retry
    console.log(`❌ Failed to locate element using any XPath.`);
    return { element: null, failed: true };
  }
export async function performIframeAction(action) {
   

  let element = null;
  if (action.element?.uniqueSelector || action.element?.xpath) {
    const { element: locatedElement, failed } = await locateIframeElement(
      action
    );
    if (failed) {
      return {
        success: false,
        message: `Element not found: ${
          action.element?.uniqueSelector || "N/A"
        } or ${action.element?.xpath || "N/A"}`,
        assertions: [],
      };
    }
    element = locatedElement;
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    await delay(500);
  }

  let actionSuccess = false;
  let resMessage = "";
  let assertions = [];

  try {
    switch (action.type) {
      case "mousedown": {
        const clickEvent = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
        });
        element.dispatchEvent(clickEvent);
        actionSuccess = true;
        resMessage = "✅ Successfully clicked";
        break;
      }

      case "change": {
        element.focus();

        if (element.isContentEditable) {
          // For contentEditable elements
          element.innerHTML = "";
          await delay(100);
          element.innerHTML = action.value;

          element.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              data: action.value,
              inputType: "insertText",
            })
          );
          element.dispatchEvent(new Event("change", { bubbles: true }));

          actionSuccess = element.textContent === action.value;
        } else {
          // For normal form inputs
          element.value = "";
          await delay(100);
          element.value = action.value;

          element.dispatchEvent(
            new InputEvent("input", {
              bubbles: true,
              data: action.value,
              inputType: "insertText",
            })
          );
          element.dispatchEvent(new Event("change", { bubbles: true }));

          actionSuccess = element.value === action.value;
        }

        resMessage = "Successfully changed value";
        break;
      }
      case "fileSelect": {
        const fileData = action.storageData;
        if (!fileData) {
          return {
            success: false,
            message: "No file data found",
            assertions: [],
          };
        }
        const byteString = atob(fileData.content.split(",")[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++)
          ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: fileData.type });
        const file = new File([blob], fileData.name, { type: fileData.type });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        element.files = dataTransfer.files;
        element.dispatchEvent(new Event("change", { bubbles: true }));
        actionSuccess = true;
        resMessage = `File "${fileData.name}" selected`;
        break;
      }
      case "scroll":{
        break
      }
      default: {
        return {
          success: false,
          message: `Unsupported action type: ${action.type}`,
          assertions: [],
        };
      }
    }
     return {
        success:  true,
        message:  '',
        assertions:[]
      };
  } catch (err) {
    return {
      success: false,
      message: err.message,
      assertions: [],
    };
  }
}
export function normalizePath(path) {
  return path
    .split('/')                 
    .filter(Boolean)               
    .filter(segment => !isIdSegment(segment)) 
    .join('/');
}

export function isIdSegment(segment) {
  return /^[0-9]+$/.test(segment) || /^[0-9a-fA-F]{6,}$/.test(segment);
}
export function waitForIframe(refSrc, timeoutMs = 5000, intervalMs = 1000) {
  console.log("all frame",Array.from(document.querySelectorAll("iframe")))
  return new Promise((resolve) => {
    const startTime = Date.now();

    const checkIframe = () => {
      const targetIframe = Array.from(document.querySelectorAll("iframe")).find(iframe => {
   try {
  const recorded = new URL(refSrc);
  const current = new URL(iframe.src);

  const sameOrigin = current.origin === recorded.origin;
  const samePath   = normalizePath(current.pathname) === normalizePath(recorded.pathname);

  return sameOrigin && samePath;
} catch (e) {
  return false;
}
});

      if (targetIframe) {
        console.log("✅ [waitForIframe] Found iframe:", targetIframe.src);
        resolve(targetIframe);
        return;
      }

      if (Date.now() - startTime >= timeoutMs) {
        console.warn("⏱️ [waitForIframe] Timed out after", timeoutMs, "ms");
        resolve(null);
        return;
      }

      setTimeout(checkIframe, intervalMs);
    };

    checkIframe();
  });
}
export function resolveVariableValue(variable) {
  if (!variable) return "";

  // 🧩 Built-in variable generators
  const generateRandomString = (len = 10) =>
    Array.from({ length: len }, () =>
      String.fromCharCode(Math.floor(Math.random() * 26) + 97)
    ).join("");

  const generateRandomNumber = (len = 10) =>
    Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join("");

  const generateAlphaNumeric = (len = 10) => {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: len }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
  };

  const generateRandomEmail = (len = 10) => {
    const name = generateAlphaNumeric(Math.max(4, len));
    return `${name.toLowerCase()}@example.com`;
  };

  // 🧠 Built-in variable logic
  const { name, length, value } = variable;
 
  if (IS_CUSTOM.includes(name)) {
    switch (name) {
      case "randomName":
        return generateRandomString(length);
      case "randomNumber":
        return generateRandomNumber(length);
      case "randomAlphaNumeric":
        return generateAlphaNumeric(length);
      case "randomEmail":
        return generateRandomEmail(length);
      default:
        return ""; // unknown built-in
    }
  }

  // 🧾 Custom variable (use stored value)
  return value || "";
}

  