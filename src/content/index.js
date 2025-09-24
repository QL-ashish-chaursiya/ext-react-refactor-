 // src/content/index.js
import { setupUI, updateBtnUI } from './ui.js';
 
import { subscribe } from './content-states.js';

(function () {
  if (window.hasOwnProperty('recordingInitialized')) {
    console.log('Content script already initialized');
    return;
  }
  window.recordingInitialized = true;

  // Inject alert override script
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('alert-override.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  // Keep alive connection
  const port = chrome.runtime.connect({ name: 'keepAlive' });
  setInterval(() => {
    port.postMessage({ ping: Date.now() });
  }, 25000);

  // UI setup
  setupUI();
  updateBtnUI();
   

   

 

   
})();
