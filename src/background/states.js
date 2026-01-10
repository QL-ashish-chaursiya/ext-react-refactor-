// background/store.js
export const state = {
    recording: true,
    openTabsData:{},
    tabOrder: null,
    recordedActions: [],
    playbackArr: [],
    testCasePayload: {},
    recordingWindowId: null,
    playbackWindowId: null,
    recordingTabIds: new Set(),
    saveTestResult: null,
    isListening: false,
    isDebuggerAttached: false,
    attachedTabId: null,
    activePort: null,
    currentPlayTab: null,
    lastDownloadStarted:false,
    tabState: {},
    allowedHosts: [
      "localhost",
      "evertest.co",
      "dev-everest.qkkalabs.com",
      "qa-everest.qkkalabs.com",
      "stupendous-speculoos-48b46c.netlify.app",
    ],
  };
  export const initialState  = {
    recording: true,
    tabOrder: null,
     openTabsData:{},
    recordedActions: [],
    playbackArr: [],
    testCasePayload: {},
    recordingWindowId: null,
    playbackWindowId: null,
    recordingTabIds: new Set(),
    saveTestResult: null,
    isListening: false,
    isDebuggerAttached: false,
    attachedTabId: null,
    activePort: null,
    currentPlayTab: null,
    lastDownloadStarted:false,
    tabState :{},
    allowedHosts: [
      "evertest.co",
      "qa-everest.qkkalabs.com",
      "dev-everest.qkkalabs.com",
      "stupendous-speculoos-48b46c.netlify.app",
      "localhost",
    ],
  };
  // Optional helpers to update state safely
  export function setState(partial) {
    Object.assign(state, partial);
  }
  
  export function getState() {
    return state;
  }
  
  