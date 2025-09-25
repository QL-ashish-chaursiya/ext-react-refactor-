 // src/content/ui.js
import { attachAllListeners, handleClick, removeAllListeners, sendAction } from './handlers.js';
import { getState, setState, subscribe } from './content-states.js';
import { HOVERUI, WRAPPER_CSS } from './ui.css.js';

let shadowRoot = null;
let shadowHost = null;

export async function updateBtnUI() {
  if (!shadowRoot) return;
  
  const startPauseBtn = shadowRoot.getElementById('startPauseRecordingBtn');
  const statusText = shadowRoot.getElementById('recordingStatusText');
  const addHoverBtn = shadowRoot.getElementById('addHoverBtn');
  const hoverConfigUI = shadowRoot.getElementById('hoverConfigUI');
  const multipleHoverCheckbox = shadowRoot.getElementById('multipleHoverCheckbox');
  const state = await getState();

  if (!state.recording) {
    startPauseBtn.textContent = 'Start Recording';
    addHoverBtn.disabled = true;
    addHoverBtn.classList.add('disabled');
    statusText.textContent = 'Not Recording';
  } else if (state.isPaused) {
    startPauseBtn.textContent = 'Resume Recording';
    addHoverBtn.disabled = true;
    addHoverBtn.classList.add('disabled');
    statusText.textContent = 'Paused';
  } else {
    startPauseBtn.textContent = 'Pause Recording';
    addHoverBtn.disabled = false;
    addHoverBtn.classList.remove('disabled');
    statusText.textContent = 'Recording...';
  }
  
  if(state.hoverModeActive){
    addHoverBtn.style.display = 'none';
    hoverConfigUI.style.display = 'flex';
  }
  
  if(state.multipleHover){
    multipleHoverCheckbox.checked = true;
  }
}

let hoverClickListener = null;

export async function setupUI() {
  // Remove existing shadow host if it exists
  if (shadowHost && document.body.contains(shadowHost)) {
    document.body.removeChild(shadowHost);
  }
  
  // Create shadow host element
  shadowHost = document.createElement('div');
  shadowHost.id = 'evertest-recorder-shadow-host';
  shadowHost.setAttribute('data-recorder-ui', 'true');
  
  // Create shadow root
  shadowRoot = shadowHost.attachShadow({ mode: 'closed' });
  
  // Add comprehensive styles to shadow DOM
  const style = document.createElement("style");
  style.textContent = HOVERUI;
  shadowRoot.appendChild(style);
  
  // Create the UI HTML
  const wrapper = document.createElement('div');
  wrapper.id = 'recording-status-overlay';
  wrapper.innerHTML =  WRAPPER_CSS
  
  // Append style and wrapper to shadow root
   
  shadowRoot.appendChild(wrapper);
  
  // Append shadow host to body
  document.body.appendChild(shadowHost);
  
  // Add global styles for highlight (outside shadow DOM)
  if (!document.getElementById('recorder-highlight-styles')) {
    const globalStyle = document.createElement('style');
    globalStyle.id = 'recorder-highlight-styles';
    globalStyle.textContent = `
      .__recorder-hover-highlight__ {
        outline: 2px dashed #008860 !important;
        outline-offset: 2px !important;
      }
    `;
    document.head.appendChild(globalStyle);
  }

  // Draggable logic for shadow host
  let isDragging = false, offsetX = 0, offsetY = 0;
  
  shadowHost.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 999999;
    cursor: move;
    user-select: none;
  `;
  
  shadowHost.addEventListener('mousedown', (e) => {
    const stopBtn = shadowRoot.getElementById('stopBtn');
    if (e.target === stopBtn) return;
    
    isDragging = true;
    const rect = shadowHost.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    shadowHost.style.top = `${e.clientY - offsetY}px`;
    shadowHost.style.left = `${e.clientX - offsetX}px`;
    shadowHost.style.right = 'auto';
  });
  
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = '';
    }
  });

  // Get elements from shadow DOM
  const addHoverBtn = shadowRoot.getElementById('addHoverBtn');
  const hoverConfigUI = shadowRoot.getElementById('hoverConfigUI');
  const multipleHoverCheckbox = shadowRoot.getElementById('multipleHoverCheckbox');
  const hoverBackBtn = shadowRoot.getElementById('hoverBackBtn');
  const startPauseBtn = shadowRoot.getElementById('startPauseRecordingBtn');
  const stopBtn = shadowRoot.getElementById('stopBtn');

  // Button event handlers
  addHoverBtn.onclick = async () => {
    const state = await getState();
    if (state.isPaused) return;

    await setState({ hoverModeActive: true, multipleHover: false });
    addHoverBtn.style.display = 'none';
    hoverConfigUI.style.display = 'flex';
    multipleHoverCheckbox.checked = false;
      
    if (!hoverClickListener) {
      
      hoverClickListener = (e) => handleClick(e, hoverClickListener, { shadowRoot, addHoverBtn, hoverConfigUI });
    }
  
    document.addEventListener("click", hoverClickListener, true);
  };

  multipleHoverCheckbox.onchange = async (e) => {
    await setState({ multipleHover: e.target.checked });
  };

  hoverBackBtn.onclick = async () => {
    await setState({ hoverModeActive: false, multipleHover: false, hoverElements: [] });
    hoverConfigUI.style.display = 'none';
    addHoverBtn.style.display = 'block';
    document.querySelectorAll('.__recorder-hover-highlight__').forEach((el) => {
      el.classList.remove('__recorder-hover-highlight__');
    });
    if (hoverClickListener) {
      document.removeEventListener("click", hoverClickListener, true);
      hoverClickListener = null;
    }
  };

  startPauseBtn.onclick = async (e) => {
    e.currentTarget.focus();
    const url = window.location.href;
    const action = {
      type: 'System_Navigate',
      url: url,
      description: `Navigated to ${url}`,
    };

    const state = await getState();

    if (!state.recording) {
      // Start
      await setState({ recording: true, isPaused: false });
      window.lastRecordedScrollY = window.scrollY;
      attachAllListeners();
      sendAction(action);
    } else if (!state.isPaused) {
      // Pause
      await setState({ isPaused: true });
      removeAllListeners();
      console.log("paused the listener");
    } else {
      // Resume
      await setState({ isPaused: false });
      attachAllListeners();
      sendAction(action);
    }
    
    console.log("recording test", state.isPaused);
    chrome.runtime.sendMessage({
      command: "change-recording-state",
      recording: state.isPaused,
      target: "background"
    });
  };

  stopBtn.onclick = async () => {
    stopBtn.disabled = true;
    stopBtn.classList.add('disabled');
    stopBtn.textContent = 'Saving...';

    await setState({ recording: false, isPaused: false });
    removeAllListeners();
    updateBtnUI();

    chrome.runtime.sendMessage({
      command: 'stop-recording',
      target: 'background',
    });
    console.log("stop, 1");
  };

  // Subscribe to state changes
  subscribe(() => {
    updateBtnUI();
  });
  
  // Initialize state-based listeners
  getState().then(res => {
    if (!res.isPaused) {
      attachAllListeners();
    }
  });
   
  updateBtnUI();
}