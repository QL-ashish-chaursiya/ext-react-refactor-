 
import { getState, setState } from './states.js';
import { supabaseClient } from './supabase.js';
export  function isInjectableUrl(url) {
    if (!url) return false;
    return (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("file://")
    );
  }
  
  export  async function injectContentScriptSafely(tabId,fileName) {
    try {
      // First check if tab still exists and is valid
      const tab = await chrome.tabs.get(tabId);
      if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        console.warn('Cannot inject into chrome:// or extension URLs');
        return false;
      }
  
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [fileName]
      });
      
      // Wait a bit for script to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
      
      return true;
    } catch (error) {
      console.warn('Script injection failed:', error);
      return false;
    }
  }
  
  export  async function captureAndUploadScreenshot() {
    function captureTab() {
      return new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, function(dataUrl) {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve(dataUrl);
        });
      });
    }
  
    function b64toBlob(b64Data, contentType = '', sliceSize = 512) {
      const byteCharacters = atob(b64Data);
      const byteArrays = [];
      for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        byteArrays.push(new Uint8Array(byteNumbers));
      }
      return new Blob(byteArrays, { type: contentType });
    }
  
    try {
      const dataUrl = await captureTab();
      const base64Data = dataUrl.split(',')[1];
      const imageBlob = b64toBlob(base64Data, 'image/png');
      const imageName = `screenshot_${Date.now()}.png`;
  
      const { error: uploadError } = await supabaseClient.storage
        .from('screenshots')
        .upload(imageName, imageBlob, { cacheControl: '3600', upsert: false });
  
      if (uploadError) {
        console.error('Supabase upload error:', uploadError);
        return null;
      }
  
      const { data: publicUrlObj } = supabaseClient.storage
        .from('screenshots')
        .getPublicUrl(imageName);
  
      return publicUrlObj ? publicUrlObj.publicUrl : null;
    } catch (err) {
      console.error('Error capturing/uploading screenshot:', err);
      return null;
    }
  }
  
 
 
export  async function attachDebuggerToTab(tabId, retries = 5, delayMs = 1000) {
  if (getState().isDebuggerAttached && getState().attachedTabId === tabId) {
      console.log(`Debugger already attached to tab ${tabId}, skipping re-attach.`);
      return true;
    }
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Step 1: Validate tab and targets
        const currentTab = await chrome.tabs.get(tabId);
        if (!currentTab || !isInjectableUrl(currentTab.url)) {
          console.warn(`Cannot attach to invalid tab (URL: ${currentTab?.url || 'unknown'})`);
          return false;
        }
  
        // Check available targets
        const targets = await new Promise((resolve) => {
          chrome.debugger.getTargets((t) => resolve(t));
        });
        const tabTarget = targets.find(t => t.tabId === tabId);
        if (!tabTarget) {
          console.warn(`No target available for tab ${tabId}. Targets:`, targets.map(t => ({tabId: t.tabId, url: t.url})));
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, delayMs * 2)); // Longer wait if no target
            continue;
          }
          return false;
        }
        console.log(`Target found for tab ${tabId}:`, tabTarget.url);
  
        // Step 2: Force detach if already attached
        await new Promise((resolve) => {
          chrome.debugger.detach({ tabId }, () => {
            console.log("Detach complete (ignore if not attached):", chrome.runtime.lastError?.message || 'none');
            resolve();
          });
        });
  
        // Step 3: Try attach with version 1.3, fallback to 1.2
        const versions = attempt <= 3 ? ["1.3"] : ["1.2"]; // Fallback after 3 tries
        let attached = false;
        for (const version of versions) {
          try {
            await new Promise((resolve, reject) => {
              chrome.debugger.attach({ tabId }, version, () => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve();
                }
              });
            });
            
            setState({isDebuggerAttached:true,attachedTabId:tabId})
            console.log(`Debugger attached with ${version} on attempt ${attempt} for tab ${tabId}`);
            // Log platform for diagnostics
            chrome.runtime.getPlatformInfo(info => console.log("Platform info:", info));
            return true;
          } catch (e) {
            console.error(`Attach failed with ${version}:`, e.message);
          }
        }
  
        if (!attached) throw new Error("All versions failed");
  
      } catch (e) {
        console.error(`Attach attempt ${attempt} failed:`, e.message);
        if (attempt < retries) {
          console.log(`Retrying in ${delayMs}ms...`);
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
  
    console.error("Final attach failure - Debugger not attached");
    setState({isDebuggerAttached:false,attachedTabId:null})
    // Optional: Notify UI of failure
    // chrome.runtime.sendMessage({ type: 'debuggerFailed', tabId });
    return false;
  }
  
  export  async function waitForPageReady(tabId) {
    // 1. Wait for tab.status === 'complete'
    await new Promise((resolve) => {
      const check = async () => {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab.status === "complete") {
            resolve();
          } else {
            setTimeout(check, 200);
          }
        } catch (e) {
          resolve(); // tab closed
        }
      };
      check();
    });
  
    // 2. Double-check inside the page for document.readyState
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return new Promise((res) => {
            if (document.readyState === "complete") {
              res(true);
            } else {
              window.addEventListener("load", () => res(true), { once: true });
            }
          });
        },
      });
    } catch (err) {
      console.warn("⚠️ Could not confirm document readiness:", err);
    }
  }