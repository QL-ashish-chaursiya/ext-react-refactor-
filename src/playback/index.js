import { runAutomation } from './performers.js';
import { waitForNetworkIdlePolling, delay, updateStatus } from './utils.js';

(async function () {
  if (window.top !== window.self) {
    console.warn("🛑 Skipping playback.js in iframe:", window.location.pathname);
    return;
  }

  if (window.hasOwnProperty('playbackInitialized')) {
    console.log('playback script already initialized');
    return;
  }

  window.playbackInitialized = true;

  async function injectScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL(file);
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = (err) => reject(err);
      (document.head || document.documentElement).appendChild(script);
    });
  }

  await injectScript('network.js');
  await injectScript('alert-override.js');

  const statusOverlay = document.createElement('div');
  statusOverlay.id = '__playback_status_overlay__';
  statusOverlay.style = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #1f2937;
    color: white;
    padding: 8px 16px;
    border-radius: 6px;
    font-family: sans-serif;
    z-index: 999999999;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    pointer-events: none;
  `;
   
  document.documentElement.appendChild(statusOverlay);

  function createPointerArrow() {
    const container = document.createElement('div');
    container.id = '__playback_pointer__';
    container.style.cssText = `
      position: absolute;
      width: 30px;
      height: 30px;
      pointer-events: none;
      z-index: 999999999;
      filter: drop-shadow(2px 2px 4px rgba(0, 0, 0, 0.5));
      transition: top 0.3s ease, left 0.3s ease;
    `;
    container.innerHTML = `
      <svg width="30" height="30" viewBox="0 0 30 30">
        <polygon points="0,0 7,29 8,19 10,12 25,11" fill="blue" />
      </svg>
    `;
    document.documentElement.appendChild(container);
    return container;
  }

  createPointerArrow();

  (async () => {

    updateStatus('🚀 Running test playback...');
    if (document.readyState === 'complete') {
      await waitForNetworkIdlePolling();
    } else {
      await new Promise(resolve => {
        window.addEventListener('load', resolve, { once: true });
      });
      await waitForNetworkIdlePolling();
    }
    await delay(1000);
   
    updateStatus('🚀 Running test playback...');
    runAutomation();
  })();
})();