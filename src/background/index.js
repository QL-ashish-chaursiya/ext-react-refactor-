 
import { showOverlay, hideOverlay } from './injections.js';
import { supabaseClient } from './supabase.js';
import * as utils from './utils.js';
import { setupMessageListeners } from './handlers.js';
import { stopRecording, recordAction } from './recording.js';
import { getState, initialState, setState, state } from './states.js';
 
 
// Top-level listeners
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'https://evertest.co/' });
  }
});

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (
    details.frameId === 0 &&
    utils.isInjectableUrl(details.url) &&
    getState().recordingWindowId
  ) {
    chrome.scripting
      .executeScript({
        target: { tabId: details.tabId },
        func: showOverlay,
      })
      .catch((err) => console.warn('Injection skipped:', err));
  }
});

chrome.webNavigation.onCompleted.addListener((details) => {
  if (
    details.frameId === 0 &&
    utils.isInjectableUrl(details.url) &&
    getState().recordingWindowId
  ) {
    chrome.scripting
      .executeScript({
        target: { tabId: details.tabId },
        func: hideOverlay,
      })
      .catch((err) => console.warn('Injection skipped:', err));
  }
});

chrome.webNavigation.onCommitted.addListener(
  (details) => {
    if (
      getState().playbackWindowId &&
      details.tabId === getState().currentPlayTab &&
      details.frameId === 0
    ) {
      console.log('Tab committed URL:', details.url, ' - Attempting debugger attach');
      utils.attachDebuggerToTab(details.tabId);
    }
  },
  { url: [{ schemes: ['http', 'https', 'file'] }] }
);

chrome.downloads.onCreated.addListener((downloadItem) => {
  
  setState({  lastDownloadStarted: true });
});

chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
    console.log('✅ Download finished/failed, resetting flag');
    setState({  lastDownloadStarted:  false });
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepAlive') {
    
    setState({   activePort: port });
    port.onDisconnect.addListener(() => {
      console.log('Port disconnected:', chrome.runtime.lastError);
      setState({   activePort: null });
    });
  }
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (
    source.tabId === getState().attachedTabId &&
    getState().playbackWindowId &&
    reason !== 'target_closed'
  ) {
    console.log('Re-attaching debugger after detach...');
    setTimeout(() => {
      utils.attachDebuggerToTab(source.tabId);
    }, 500);
  }
});

// Setup handlers
setupMessageListeners();

// Tab/window listeners
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    try {
      await utils.waitForPageReady(tabId);

      // --- RECORDING FLOW ---
      if (getState().recordingTabIds.has(tabId)) {
        try {
          const injected = await utils.injectContentScriptSafely(tabId, 'content.bundle.js');
          const { recording } = getState();

          
       
          if (injected &&  recording) {
            const action = {
              type: 'navigate',
              url: tab.url,
              tabOrder: getState().tabOrder,
              description: `Navigated to ${tab.url}`,
            };
            recordAction(action);
            
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

chrome.tabs.onCreated.addListener(async (tab) => {
  try {
    if (getState().recordingWindowId && tab.windowId === getState().recordingWindowId) {
      getState().recordingTabIds.add(tab.id);
      setState({    tabOrder: getState().recordingTabIds.size });
      console.log("tabOrder", getState().recordingTabIds.size)
      utils.setTabOrder(tab,getState().recordingWindowId)
      await utils.waitForPageReady(tab.id);
      await utils.injectContentScriptSafely(tab.id, 'content.bundle.js');
    }

    if (getState().playbackWindowId && tab.windowId === getState().playbackWindowId) {
      const windowTabs = await chrome.tabs.query({ windowId: getState().playbackWindowId });
     
     
      setState({tabOrder:windowTabs.length})
      utils.setTabOrder(tab,getState().playbackWindowId)
      setState({ currentPlayTab:tab.id})
      await utils.waitForPageReady(tab.id);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['playback.bundle.js'],
        });
      } catch (err) {
        console.warn('⚠️ Script injection failed after navigation:', err);
      }
      await chrome.storage.local.set({ tabOrder: utils.getCurrentActiveTabOrder(getState().playbackWindowId,tab.id), actions: getState().playbackArr });
    }
  } catch (error) {
    console.error('Tab creation handler error:', error);
  }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  if (windowId === getState().recordingWindowId) {
    if (getState().activePort) {
      getState().activePort.disconnect();
      setState({activePort:null})
    }
    
  } else if (windowId === getState().playbackWindowId) {
    if (getState().isDebuggerAttached && getState().attachedTabId) {
      try {
        await new Promise((resolve) => {
          chrome.debugger.detach({ tabId: getState().attachedTabId }, resolve);
        });
    
      } catch (e) {
        console.warn('Failed to detach debugger:', e);
      }
     
      setState({ currentPlayTab: null, tabOrder: null,isDebuggerAttached: false, attachedTabId: null })
       
    }
  }
  await chrome.storage.local.clear();
  setState(initialState);
 
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  const { windowId } = removeInfo;
  if (getState().recording) {
   

    if (getState().tabState[windowId]) {
      getState().tabState[windowId] = getState().tabState[windowId].filter(t => t.tabId !== tabId);
  
      // Reorder tabOrder sequentially
      utils.reorderTabs(windowId);
    }
  
     
  }
 
});
chrome.tabs.onActivated.addListener(activeInfo => {
  const { tabId, windowId } = activeInfo;
   
  if (getState().recording) {
    if (getState().tabState[windowId]) {
      utils.setActiveTab(windowId, tabId);
    }
  
    
  }
   
});