   // src/content/ui.js
import { attachAllListeners, handleClick, removeAllListeners, sendAction } from './handlers.js';
import { getState, setState, subscribe } from './content-states.js';

export async function updateBtnUI() {
  const startPauseBtn = document.getElementById('startPauseRecordingBtn');
  const statusText = document.getElementById('recordingStatusText');
  const addHoverBtn = document.getElementById('addHoverBtn');
  const hoverConfigUI = document.getElementById('hoverConfigUI');
  const multipleHoverCheckbox = document.getElementById('multipleHoverCheckbox');
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
    multipleHoverCheckbox.checked =  true;
   }
}
let hoverClickListener = null;
export async function setupUI() {
  
  // Add styles
  if (!document.getElementById('stopBtn-disable-style')) {
    const style = document.createElement('style');
    style.id = 'stopBtn-disable-style';
    style.textContent = `
      #stopBtn.disabled,
      #stopBtn:disabled,
      #addHoverBtn.disabled,
      #addHoverBtn:disabled {
        background-color: #d1d5db !important;
        color: #6b7280 !important;
        cursor: not-allowed !important;
        pointer-events: none !important;
        opacity: 0.7 !important;
        border: none !important;
      }

      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }

      .__recorder-hover-highlight__ {
        outline: 2px dashed #008860 !important;
        outline-offset: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  if (!document.getElementById('startPauseRecordingBtnStyles')) {
    const style = document.createElement('style');
    style.id = 'startPauseRecordingBtnStyles';
    style.textContent = `
      #startPauseRecordingBtn:focus {
        border: 2px solid rgb(0, 170, 120);
        outline: none;
      }
    `;
    document.head.appendChild(style);
  }

  // Create overlay UI
  const wrapper = document.createElement('div');
  wrapper.id = 'recording-status-overlay';
  wrapper.style = `
    position: fixed;
    top: 10px;
    right: 10px;
    z-index: 999999;
    font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;
    cursor: move;
    user-select: none;
  `;
  wrapper.innerHTML = `
    <div class="container" style="background:white;border-radius:20px;padding:16px;width:250px;box-shadow:0 10px 30px rgba(0,0,0,0.1);display:flex;flex-direction:column;gap:12px;">
      <div class="header" style="display:flex;margin-bottom:20px;justify-content:space-between;align-items:center;">
        <span class="brand-name" style="font-weight:600;color:#008860;">Evertest</span>
        <div class="recording-indicator" style="display:flex;align-items:center;gap:6px;color:#ef4444;font-size:12px;font-weight:500;">
          <span class="rec-dot" style="width:8px;height:8px;background:#ef4444;border-radius:50%;animation:pulse 1.5s ease-in-out infinite;"></span>
          <span id="recordingStatusText">Not Recording</span>
        </div>
      </div>
      <div class="button-list" style="display:flex;flex-direction:column;gap:8px;">
        <button id="addHoverBtn" class="button" style="padding:8px;border:2px solid rgb(0 170 120);border-radius:50px;background:white;color:rgb(0 136 96);cursor:pointer;font-size:14px;border-color: rgb(0 170 120);" disabled>Add Hover</button>
        <div id="hoverConfigUI" style="display:none;flex-direction:column;gap:6px;">
          <label style="font-size:13px;color:#374151;">
            <input type="checkbox" id="multipleHoverCheckbox"   /> Multiple Hover
          </label>
          <button id="hoverBackBtn" style="padding:8px 14px;border-radius:50px;border:2px solid rgb(0 170 120);background:white;color:rgb(0 136 96);cursor:pointer;font-size:13px;">Back</button>
        </div>
        <button id="startPauseRecordingBtn" style="padding:8px;color:rgb(0 136 96);border-radius:50px;cursor:pointer;font-size:14px;border:2px solid rgb(0 170 120);background:white;">Start Recording</button>
        <button id="stopBtn" style="padding:8px;border-radius:50px;background:rgb(0 170 120);color:white;cursor:pointer;font-size:14px;border:2px solid rgb(0 170 120);">Stop</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  // Draggable logic
  wrapper.setAttribute('data-recorder-ui', 'true');
  let isDragging = false,
    offsetX = 0,
    offsetY = 0;
  wrapper.addEventListener('mousedown', (e) => {
    if (e.target.id === 'stopBtn') return;
    isDragging = true;
    offsetX = e.clientX - wrapper.getBoundingClientRect().left;
    offsetY = e.clientY - wrapper.getBoundingClientRect().top;
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    wrapper.style.top = `${e.clientY - offsetY}px`;
    wrapper.style.left = `${e.clientX - offsetX}px`;
    wrapper.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.userSelect = '';
    }
  });

  // Button handlers
  const addHoverBtn = document.getElementById('addHoverBtn');
  const hoverConfigUI = document.getElementById('hoverConfigUI');
  const multipleHoverCheckbox = document.getElementById('multipleHoverCheckbox');
  const hoverBackBtn = document.getElementById('hoverBackBtn');
  const startPauseBtn = document.getElementById('startPauseRecordingBtn');
  const stopBtn = document.getElementById('stopBtn');

  addHoverBtn.onclick = async () => {
    const state = await getState();
    if (state.isPaused) return;

    await setState({ hoverModeActive: true, multipleHover: false });
    addHoverBtn.style.display = 'none';
    hoverConfigUI.style.display = 'flex';
    multipleHoverCheckbox.checked = false;
      
     if (!hoverClickListener) {
      hoverClickListener = (e) => handleClick(e,  state,hoverClickListener); // use sync state
    }
  
    document.addEventListener("click", hoverClickListener, true);
  };

  multipleHoverCheckbox.onchange = async (e) => {
    await setState({ multipleHover: e.target.checked });
  };

  hoverBackBtn.onclick = async () => {
    await setState({ hoverModeActive: false, multipleHover: false,hoverElements: [] });
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
      console.log("paused the listenr")
    } else {
      // Resume
      await setState({ isPaused: false });
      attachAllListeners();
      sendAction(action);
    }
    console.log("recording tets",state.isPaused)
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
    console.log("stop, 1")
  };

  // Sync UI whenever state changes
  subscribe(() => {
    updateBtnUI();
  });
   getState().then( res => {
    if(!res.isPaused){
      attachAllListeners()
    }
   })
  
   
  updateBtnUI();
}