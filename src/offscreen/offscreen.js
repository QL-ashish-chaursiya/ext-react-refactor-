// offscreen.js
setInterval(async () => {
  // Send a message to the service worker every 20 seconds
  (await navigator.serviceWorker.ready).active.postMessage('keepAlive');
}, 20000);
