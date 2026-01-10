// src/background/index.js - UPDATED VERSION
// Import the webext polyfill at the very top
import webext from 'webextension-polyfill';

import { showOverlay, hideOverlay } from './injections.js';
import { supabaseClient } from './supabase.js';
import * as utils from './utils.js';
import { setupMessageListeners } from './handlers.js';
import { stopRecording, recordAction } from './recording.js';
import { getState, initialState, setState } from './states.js';

// Helper to check if webext supports debugger
const supportsDebugger = typeof webext.debugger !== 'undefined';

// Top-level listeners
webext.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await webext.tabs.create({ url: 'https://evertest.co/' });
  }
});

webext.webNavigation.onBeforeNavigate.addListener((details) => {
  if (
    details.frameId === 0 &&
    utils.isInjectableUrl(details.url) &&
    getState().recordingWindowId
  ) {
    webext.scripting
      .executeScript({
        target: { tabId: details.tabId },
        func: showOverlay,
      })
      .catch((err) => console.warn('Injection skipped:', err));
  }
});

webext.webNavigation.onCompleted.addListener((details) => {
  if (
    details.frameId === 0 &&
    utils.isInjectableUrl(details.url) &&
    getState().recordingWindowId
  ) {
    webext.scripting
      .executeScript({
        target: { tabId: details.tabId },
        func: hideOverlay,
      })
      .catch((err) => console.warn('Injection skipped:', err));
  }
});

webext.webNavigation.onCommitted.addListener(
  (details) => {
    if (
      getState().playbackWindowId &&
      details.tabId === getState().currentPlayTab &&
      details.frameId === 0
    ) {
      console.log('Tab committed URL:', details.url, ' - Attempting debugger attach');
      if (supportsDebugger) utils.attachDebuggerToTab(details.tabId);
    }
  },
  { url: [{ schemes: ['http', 'https', 'file'] }] }
);

webext.downloads.onCreated.addListener(() => {
  setState({ lastDownloadStarted: true });
});

webext.downloads.onChanged.addListener((delta) => {
  if (delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
    console.log('✅ Download finished/failed, resetting flag');
    setState({ lastDownloadStarted: false });
  }
});

webext.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepAlive') {
    setState({ activePort: port });
    port.onDisconnect.addListener(() => {
      console.log('Port disconnected:', webext.runtime.lastError);
      setState({ activePort: null });
    });
  }
});

// Only add debugger listener if supported
if (supportsDebugger) {
  webext.debugger.onDetach.addListener((source, reason) => {
    if (
      source.tabId === getState().attachedTabId &&
      getState().playbackWindowId &&
      reason !== 'target_closed'
    ) {
      console.log('Re-attaching debugger after detach...');
      setTimeout(() => utils.attachDebuggerToTab(source.tabId), 500);
    }
  });
}

// Setup handlers
setupMessageListeners();

// Tab/window listeners
webext.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    try {
      await utils.waitForPageReady(tabId);
       if (!(await utils.isValidUserTab(tabId))) return;

      // --- RECORDING FLOW ---
      if (getState().recordingTabIds.has(tabId)) {
        try {
          const injected = await utils.injectContentScriptSafely(tabId, 'content.bundle.js');
          const { recording } = getState();

          if (injected && recording) {
            recordAction({
              type: 'navigate',
              url: tab.url,
              tabOrder: getState().tabOrder,
              description: `Navigated to ${tab.url}`,
            });
          }
        } catch (error) {
          console.error('❌ Failed to reinject content script:', error);
        }
      }

      // --- PLAYBACK FLOW ---
      if (getState().playbackWindowId && tab.windowId === getState().playbackWindowId) {
        console.log('Playback navigation - tabOrder:', getState().tabOrder);
        try {
          await utils.injectContentScriptSafely(tabId, 'playback.bundle.js');
          console.log('✅ Playback script injected for tabOrder:', getState().tabOrder);
        } catch (error) {
          console.warn('⚠️ Playback script injection failed:', error);
        }
      }
    } catch (err) {
      console.warn('⚠️ waitForPageReady failed or tab closed:', err);
    }
  }
});
webext.tabs.onMoved.addListener(async (tabId, moveInfo) => {
  if (getState().recordingWindowId && tab.windowId === getState().recordingWindowId) {
     const state = getState();
  const tabs = state.openTabsData;

  const { fromIndex, toIndex } = moveInfo;

  // Shift indices of other tabs
  Object.values(tabs).forEach(tab => {
    if (fromIndex < toIndex) {
      // moving right
      if (tab.index > fromIndex && tab.index <= toIndex) {
        tab.index -= 1;
      }
    } else {
      // moving left
      if (tab.index >= toIndex && tab.index < fromIndex) {
        tab.index += 1;
      }
    }
  });

  // Update moved tab
  getState().openTabsData[tabId].index = toIndex;

  }
  
});

webext.tabs.onCreated.addListener(async (tab) => {
  try {
    // --- RECORDING WINDOW ---
    if (getState().recordingWindowId && tab.windowId === getState().recordingWindowId) {
      getState().openTabsData[tab.id] = { id: tab.id, index: tab.index };
      getState().recordingTabIds.add(tab.id);
      setState({ tabOrder: getState().recordingTabIds.size });

      utils.setTabOrder(tab, getState().recordingWindowId);

      await utils.waitForPageReady(tab.id);
      await utils.injectContentScriptSafely(tab.id, 'content.bundle.js');
    }

    // --- PLAYBACK WINDOW ---
    if (getState().playbackWindowId && tab.windowId === getState().playbackWindowId) {
      const windowTabs = await webext.tabs.query({ windowId: getState().playbackWindowId });

      setState({ tabOrder: windowTabs.length });
      utils.setTabOrder(tab, getState().playbackWindowId);
      setState({ currentPlayTab: tab.id });

      await utils.waitForPageReady(tab.id);

      try {
        await webext.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['playback.bundle.js'],
        });
      } catch (err) {
        console.warn('⚠️ Script injection failed after navigation:', err);
      }

      await webext.storage.local.set({
        actions: getState().playbackArr,
      });
    }
  } catch (error) {
    console.error('Tab creation handler error:', error);
  }
});

webext.windows.onRemoved.addListener(async () => {
  if (getState().recordingWindowId || getState().playbackWindowId) {
    const tabs = await webext.tabs.query({});
    const reactAppTab = tabs.find(
      (tab) =>
        tab.url && initialState.allowedHosts.some((host) => tab.url.includes(host))
    );

    if (reactAppTab) {
      try {
        await webext.scripting.executeScript({
          target: { tabId: reactAppTab.id },
          func: () => {
            window.postMessage({ type: 'browserClosed' }, '*');
          },
        });
        console.log('✅ React app notified of moduleTestComplete');
      } catch (err) {
        console.warn('Failed to inject notification script:', err);
      }
    }
  }

  await webext.storage.local.clear();
  setState(initialState);
});

webext.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
   
  const { windowId } = removeInfo;

  if (getState().recording && getState().tabState[windowId]) {
     
     const state = getState();
  const tabs = state.openTabsData;

  const removedIndex = tabs[tabId]?.index;
 console.log("remove index",removedIndex)
  if (removedIndex === undefined) return;
  recordAction({
    type: "CLOSE_TAB",
    description:`close tab ${removedIndex}`,
    tabIndex: removedIndex
  });

  // Remove the tab
  delete getState().openTabsData[tabId];

  // Shift remaining tabs left
  Object.values(tabs).forEach(tab => {
    if (tab.index > removedIndex) {
      tab.index -= 1;
    }
  });
  getState().tabState[windowId] = getState().tabState[windowId].filter(
      (t) => t.tabId !== tabId
    );

    utils.reorderTabs(windowId);
  }
});

webext.tabs.onActivated.addListener(async (activeInfo) => {
  const { tabId, windowId } = activeInfo;

  if (getState().recording && getState().tabState[windowId]) {
    // update in-memory active flag
      if (!(await utils.isValidUserTab(tabId))) return;
    utils.setActiveTab(windowId, tabId);

    try {
      const actions = getState().recordedActions || [];
      if (actions.length === 0) return;
const  tabOrder = await utils.getCurrentActiveTabOrder();
      const last = actions[actions.length - 1];
      if (last && last.type === 'switchTab') {
        // if it already points to the same tabOrder, do nothing
        if (last.tabOrder === tabOrder) return;
        last.tabOrder = tabOrder;
        last.description = `Switched to tab ${tabOrder}`;
        return;
      }
      recordAction({ type: 'switchTab', description: `Switched to tab ${tabOrder}` });
    } catch (err) {
      console.warn('Error while recording tab switch:', err);
    }
  }
});

// Export webext object for use in other files
export { webext, supportsDebugger };
