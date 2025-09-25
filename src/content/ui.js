 // src/content/ui.js
import { attachAllListeners, handleClick, removeAllListeners, sendAction } from './handlers.js';
import { getState, setState, subscribe } from './content-states.js';

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
  const style = document.createElement('style');
  style.textContent = `
    /* Reset and base styles */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    /* Host positioning */
    :host {
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      cursor: move;
      user-select: none;
      font-size: 14px;
      line-height: 1.4;
    }
    
    /* Main wrapper */
    #recording-status-overlay {
      position: relative;
      width: 250px;
    }
    
    /* Container styles */
    .container {
      background: white;
      border-radius: 20px;
      padding: 16px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
      display: flex;
      flex-direction: column;
      gap: 12px;
      border: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    /* Header styles */
    .header {
      display: flex;
      margin-bottom: 20px;
      justify-content: space-between;
      align-items: center;
    }
    
    .brand-name {
      font-weight: 600;
      color: #008860;
      font-size: 16px;
    }
    
    .recording-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #ef4444;
      font-size: 12px;
      font-weight: 500;
    }
    
    .rec-dot {
      width: 8px;
      height: 8px;
      background: #ef4444;
      border-radius: 50%;
      animation: pulse 1.5s ease-in-out infinite;
    }
    
    /* Button list */
    .button-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    /* Base button styles */
    .button, button {
      padding: 8px 16px;
      border-radius: 50px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
      border: 2px solid;
      background: white;
      font-family: inherit;
      outline: none;
      text-align: center;
      min-height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    /* Primary button (Add Hover, Start/Pause) */
    #addHoverBtn, #startPauseRecordingBtn {
      border-color: rgb(0, 170, 120);
      color: rgb(0, 136, 96);
      background: white;
    }
    
    #addHoverBtn:hover:not(.disabled), #startPauseRecordingBtn:hover {
      background: rgba(0, 170, 120, 0.05);
      transform: translateY(-1px);
    }
    
    #startPauseRecordingBtn:focus {
      border-color: rgb(0, 170, 120);
      box-shadow: 0 0 0 3px rgba(0, 170, 120, 0.1);
    }
    
    /* Secondary button (Stop) */
    #stopBtn {
      padding: 8px 16px;
      border-radius: 50px;
      background: rgb(0, 170, 120);
      color: white;
      cursor: pointer;
      font-size: 14px;
      border: 2px solid rgb(0, 170, 120);
      font-weight: 500;
      transition: all 0.2s ease;
    }
    
    #stopBtn:hover:not(.disabled) {
      background: rgb(0, 150, 100);
      border-color: rgb(0, 150, 100);
      transform: translateY(-1px);
    }
    
    /* Back button */
    #hoverBackBtn {
      padding: 6px 12px;
      border-radius: 50px;
      border: 2px solid rgb(0, 170, 120);
      background: white;
      color: rgb(0, 136, 96);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }
    
    #hoverBackBtn:hover {
      background: rgba(0, 170, 120, 0.05);
    }
    
    /* Disabled states */
    .disabled, :disabled {
      background-color: #d1d5db !important;
      color: #6b7280 !important;
      cursor: not-allowed !important;
      pointer-events: none !important;
      opacity: 0.7 !important;
      border-color: #d1d5db !important;
      transform: none !important;
    }
    
    /* Hover config UI */
    #hoverConfigUI {
      display: none;
      flex-direction: column;
      gap: 8px;
      border-radius: 12px;
      
    }
    
    /* Checkbox label */
    label {
      font-size: 13px;
      color: #374151;
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      user-select: none;
    }
    
    /* Checkbox styling */
    input[type="checkbox"] {
      width: 16px;
      height: 16px;
      margin: 0;
      cursor: pointer;
      accent-color: rgb(0, 170, 120);
    }
    
    /* Animations */
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.5; }
      100% { opacity: 1; }
    }
    
    /* Hover highlight for elements outside shadow DOM */
    .__recorder-hover-highlight__ {
      outline: 2px dashed #008860 !important;
      outline-offset: 2px !important;
    }
  `;
  
  // Create the UI HTML
  const wrapper = document.createElement('div');
  wrapper.id = 'recording-status-overlay';
  wrapper.innerHTML = `
    <div class="container">
      <div class="header">
        <span class="brand-name">Evertest</span>
        <div class="recording-indicator">
          <span class="rec-dot"></span>
          <span id="recordingStatusText">Not Recording</span>
        </div>
      </div>
      <div class="button-list">
        <button id="addHoverBtn" class="button disabled" disabled>Add Hover</button>
        <div id="hoverConfigUI">
          <label>
            <input type="checkbox" id="multipleHoverCheckbox" />
            Multiple Hover
          </label>
          <button id="hoverBackBtn">Back</button>
        </div>
        <button id="startPauseRecordingBtn" class="button">Start Recording</button>
        <button id="stopBtn">Stop</button>
      </div>
    </div>
  `;
  
  // Append style and wrapper to shadow root
  shadowRoot.appendChild(style);
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