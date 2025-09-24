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