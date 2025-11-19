// storage.js
import webext from "webextension-polyfill";

const STORAGE_KEY = "contentState";

// Default structure
const defaultState = {
  isPaused: false,
  recording: true,
  hoverElements: [],
  multipleHover: false,
  hoverModeActive: false,
  compareImg: false,
};

/**
 * Get complete saved state (cross-webext)
 */
export async function getState() {
  const result = await webext.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || { ...defaultState };
}

/**
 * Merge + save state (cross-webext)
 */
export async function setState(updates) {
  const current = await getState();
  const newState = { ...current, ...updates };
  await webext.storage.local.set({ [STORAGE_KEY]: newState });
  return newState;
}

/**
 * Subscribe to state changes (cross-webext)
 */
export function subscribe(callback) {
  webext.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      callback(changes[STORAGE_KEY].newValue, changes[STORAGE_KEY].oldValue);
    }
  });
}

/**
 * ---- Extra Helpers ----
 */

export async function addHoverElement(elInfo) {
  const state = await getState();
  const updated = [...state.hoverElements, elInfo];
  return setState({ hoverElements: updated });
}

export async function clearHoverElements() {
  return setState({ hoverElements: [] });
}
