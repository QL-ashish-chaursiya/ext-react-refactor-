 // src/content/index.js
import { setupUI, updateBtnUI } from './ui.js';
  import webext from 'webextension-polyfill';
import { subscribe } from './content-states.js';
import { sendAction } from './handlers.js';
import { generateXPaths } from './xpath.js';

(function () {
  if (window.hasOwnProperty('recordingInitialized')) {
    console.log('Content script already initialized');
    return;
  }
  window.recordingInitialized = true;
   

  window.addEventListener("message", e => {
  if (e.data?.type !== "IFRAME_ACTION") return;

  const iframe = [...document.querySelectorAll("iframe")]
    .find(f => f.contentWindow === e.source);

  if (!iframe) return;

  const iframeXpath = generateXPaths(iframe);

  sendAction({
    ...e.data.action,
    iframe: iframeXpath,
    isTopFrame: false
  });
});


  // Inject alert override script
  const script = document.createElement('script');
  script.src = webext.runtime.getURL('alert-override.js');
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);

  // Keep alive connection
  const port = webext.runtime.connect({ name: 'keepAlive' });
  setInterval(() => {
    port.postMessage({ ping: Date.now() });
  }, 10000);

  // UI setup
  setupUI();
  updateBtnUI();


   

 

   
})();
