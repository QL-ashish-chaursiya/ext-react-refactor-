// storage.js
const STORAGE_KEY = "contentState";

// default structure (used if nothing exists in storage yet)
const defaultState = {
  isPaused: false,
  recording:  true,
  hoverElements: [],
 multipleHover:false,
 hoverModeActive:false

};
 
 
 
 
 
/**
 * Get the full state object from chrome.storage.local
 */
export async function getState() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      console.log("storage data",result[STORAGE_KEY])
      resolve(result[STORAGE_KEY] || { ...defaultState });
    });
  });
}

/**
 * Merge new data into state and save back to chrome.storage.local
 */
export async function setState(updates) {
  const current = await getState();
  const newState = { ...current, ...updates };

  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: newState }, () => {
      resolve(newState);
    });
  });
}

/**
 * Subscribe to state changes (like zustand)
 */
export function subscribe(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      callback(changes[STORAGE_KEY].newValue, changes[STORAGE_KEY].oldValue);
    }
  });
}
export async function addHoverElement(elInfo) {
    const state = await getState();
    const updated = [...state.hoverElements, elInfo];
    return setState({ hoverElements: updated });
  }
  
  export async function clearHoverElements() {
    return setState({ hoverElements: [] });
  }
