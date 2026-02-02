// utils.js (FULLY UPDATED)
// --------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import { ENVIRONMENTS } from "../utils/constant.js";
import { getState, setState } from "./states.js";
import webext from "webextension-polyfill";
export function isInjectableUrl(url) {
  if (!url) return false;
  return (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("file://")
  );
}

 
export async function injectContentScriptSafely(tabId, fileName) {
  try {
    const tab = await webext.tabs.get(tabId);

    if (
      !tab ||
      !tab.url ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://")
    ) {
      console.warn("Cannot inject into browser:// or extension URLs");
      return false;
    }

    await webext.scripting.executeScript({
      target: { tabId },
      files: [fileName],
    });

    // Inject iframe script for content.bundle.js
    if (fileName === "content.bundle.js") {
      setTimeout(() => {
        webext.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ["iframeContent.bundle.js"],
        });
      }, 2000);
    } else if(fileName === "playback.bundle.js"){
        setTimeout(() => {
        webext.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ["iframe.bundle.js"],
        });
      }, 2000);
    }
    

    // slight delay
    await new Promise((r) => setTimeout(r, 100));

    return true;
  } catch (err) {
    console.warn("Script injection failed:", err);
    return false;
  }
}
 
export async function captureTab(tabId, isBottom) {
  if (isBottom) {
    try {
      await webext.debugger.detach({ tabId });
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 8000));
  }

  const dataUrl = await webext.tabs.captureVisibleTab(null, { format: "png" });

  if (isBottom) {
    try {
      await webext.debugger.attach({ tabId }, "1.3");
    } catch (err) {
      console.warn("Re-attach failed:", err);
    }
  }

  return dataUrl;
}

 

export async function captureAndUploadScreenshot() {
  function b64toBlob(b64Data, contentType = "", sliceSize = 512) {
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
    const base64Data = dataUrl.split(",")[1];

    const imageBlob = b64toBlob(base64Data, "image/png");
    const imageName = `screenshot_${Date.now()}.png`;
       const spClient = getSupaBaseClient()
    const { error: uploadError } = await  spClient.storage
      .from("screenshots")
      .upload(imageName, imageBlob, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      console.error("Supabase upload error:", uploadError);
      return null;
    }

    const { data } =  spClient.storage
      .from("screenshots")
      .getPublicUrl(imageName);

    return data?.publicUrl || null;
  } catch (err) {
    console.error("Error capturing/uploading screenshot:", err);
    return null;
  }
}

 

export async function attachDebuggerToTab(tabId, retries = 5, delayMs = 1000) {
  const state = getState();

  if (state.isDebuggerAttached && state.attachedTabId === tabId) {
    console.log(`Debugger already attached to ${tabId}`);
    return true;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const tab = await webext.tabs.get(tabId);
      if (!tab || !isInjectableUrl(tab.url)) return false;

      const targets = await webext.debugger.getTargets();
      const tabTarget = targets.find((x) => x.tabId === tabId);

      if (!tabTarget) {
        if (attempt < retries) {
          await wait(delayMs * 2);
          continue;
        }
        return false;
      }

      try {
        await webext.debugger.detach({ tabId });
      } catch (_) {}

      const protocols = attempt <= 3 ? ["1.3"] : ["1.2"];

      for (const version of protocols) {
        try {
          await webext.debugger.attach({ tabId }, version);

          setState({
            isDebuggerAttached: true,
            attachedTabId: tabId,
          });

          console.log(`Debugger attached via ${version}`);
          return true;
        } catch (err) {
          console.warn(`Attach via ${version} failed`);
        }
      }
    } catch (err) {
      console.log(`Error attach attempt ${attempt}`, err);
    }

    if (attempt < retries) await wait(delayMs);
  }

  setState({
    isDebuggerAttached: false,
    attachedTabId: null,
  });

  return false;
}

// --------------------------------------------------------
// WAIT FOR PAGE READY
// --------------------------------------------------------

export async function waitForPageReady(tabId) {
  // polling for tab.status
  await new Promise((resolve) => {
    const check = async () => {
      try {
        const tab = await webext.tabs.get(tabId);
        if (tab.status === "complete") return resolve();
      } catch {
        return resolve();
      }
      setTimeout(check, 200);
    };
    check();
  });

  try {
    await webext.scripting.executeScript({
      target: { tabId },
      func: () => {
        return new Promise((res) => {
          if (document.readyState === "complete") res(true);
          else window.addEventListener("load", () => res(true), { once: true });
        });
      },
    });
  } catch (err) {
    console.warn("Ready check failed:", err);
  }
}

// --------------------------------------------------------
// TAB TRACKING FUNCTIONS
// --------------------------------------------------------

export function reorderTabs(windowId) {
  const st = getState();
  if (!st?.tabState[windowId]) return;

  st.tabState[windowId].forEach((t, i) => {
    t.tabOrder = i + 1;
  });
}

export function setActiveTab(windowId, activeTabId) {
  const st = getState();
  if (!st?.tabState[windowId]) return;

  st.tabState[windowId] = st.tabState[windowId].map((t) => ({
    ...t,
    isCurrentTab: t.tabId === activeTabId,
  }));
}

export function setTabOrder(tab, windowId) {
  const st = getState();
  if (!st.tabState[windowId]) st.tabState[windowId] = [];

  st.tabState[windowId].push({
    tabId: tab.id,
    tabOrder: st.tabState[windowId].length + 1,
    isCurrentTab: false,
  });
}

export async function getCurrentActiveTabOrder() {
    const currentWindow = await  webext.windows.getCurrent();
const windowId = currentWindow.id;
console.log("Current window ID:", windowId);

// Get all tabs in the current window
const allTabs = await  webext.tabs.query({ windowId });

// Get the currently active (focused) tab
const activeTab = allTabs.find(tab => tab.active);

if (!activeTab) {
  console.warn("No active tab found");
  return;
}

// Current focused tab order (0-based index)
const  tabOrder = activeTab.index;
return tabOrder
}

// --------------------------------------------------------
// IFRAME SCRIPT ATTACH
// --------------------------------------------------------






// --------------------------------------------------------
// DATA URL TO BLOB
// --------------------------------------------------------

export function dataURLtoBlob(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);

  return new Blob([array], { type: mime });
}

// --------------------------------------------------------
export function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function isValidUserTab(tabId) {
  try {
    const tab = await webext.tabs.get(tabId);
    const url = tab?.url || "";
    if (
      !url ||
      url === "about:blank" ||
      url.startsWith("about:") ||
      url.startsWith("chrome:") ||
      url.startsWith("chrome-extension:") ||
      url.startsWith("edge:") ||
      url.startsWith("file:")
      
    ) {
      return false;
    }

    return true;
  } catch (err) {
    // tab may be closing or inaccessible
    return false;
  }
}
export function getSupaBaseClient(){
  const state = getState();
  const finalEnv =  state.env || 'production'
   const {supabaseUrl,supabaseAnonKey} = ENVIRONMENTS[finalEnv];
   const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
   return supabaseClient
}
