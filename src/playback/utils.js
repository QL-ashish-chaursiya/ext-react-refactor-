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
  
  export function sendMessageAsync(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
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
export function isElementCovered(element) {
  try {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Get the topmost element at the center point
    const topElement = document.elementFromPoint(centerX, centerY);
    
    if (!topElement) return { covered: true, reason: 'No element found at point' };
    
    // Check if the top element is the target or a descendant
    if (topElement === element || element.contains(topElement)) {
      return { covered: false, reason: 'Element is clickable' };
    }
    
    // Check if covering element is an overlay/loader/popup
    const coveringElement = topElement;
    const computedStyle = window.getComputedStyle(coveringElement);
    const tagName = coveringElement.tagName.toLowerCase();
    const className = coveringElement.className || '';
    const id = coveringElement.id || '';
    
    // Common patterns for overlays/loaders/popups
    const overlayPatterns = [
      /overlay/i, /modal/i, /popup/i, /loader/i, 
      /spinner/i, /loading/i, /backdrop/i, /dialog/i,
      /toast/i, /notification/i, /cover/i
    ];
    
    const isOverlay = overlayPatterns.some(pattern => 
      pattern.test(className) || pattern.test(id) || pattern.test(tagName)
    );
    
    // Check if element has high z-index (common for overlays)
    const zIndex = parseInt(computedStyle.zIndex) || 0;
    const hasHighZIndex = zIndex > 100;
    
    // Check if element has overlay-like styling
    const hasOverlayStyle = 
      computedStyle.position === 'fixed' || 
      computedStyle.position === 'absolute';
    
    if (isOverlay || (hasHighZIndex && hasOverlayStyle)) {
      return { 
        covered: true, 
        reason: `Element covered by other Element like  Loader/Overlay/Modal`,
        coveringElement 
      };
    }
    
    return { 
      covered: true, 
      reason: `Element covered by other Element like  Loader/Overlay/Modal`,
      coveringElement 
    };
    
  } catch (error) {
    return { covered: false, reason: 'Error checking coverage: ' + error.message };
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
  