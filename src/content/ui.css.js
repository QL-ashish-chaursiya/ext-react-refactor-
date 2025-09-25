 export const HOVERUI = `
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  
  
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
  
  
  #recording-status-overlay {
    position: relative;
    width: 250px;
  }
  
  
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
  
  
  .disabled, :disabled {
    background-color: #d1d5db !important;
    color: #6b7280 !important;
    cursor: not-allowed !important;
    pointer-events: none !important;
    opacity: 0.7 !important;
    border-color: #d1d5db !important;
    transform: none !important;
  }
  
   
  #hoverConfigUI {
    display: none;
    flex-direction: column;
    gap: 8px;
    border-radius: 12px;
  }
  
  
  label {
    font-size: 13px;
    color: #374151;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
  }
  
   
  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    margin: 0;
    cursor: pointer;
    accent-color: rgb(0, 170, 120);
  }
  
  
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
  
   
  .__recorder-hover-highlight__ {
    outline: 2px dashed #008860 !important;
    outline-offset: 2px !important;
  }
  `
  export const WRAPPER_CSS = `
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
  `