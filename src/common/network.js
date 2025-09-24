(function () {
    if (window.__networkInterceptorInstalled__) {
      console.log('🔄 Network interceptor already installed');
      return;
    }
  
    window.__networkInterceptorInstalled__ = true;
    console.log('🚀 Installing network interceptor...');
  
    let activeRequests = 0;
    let idleResolvers = new Set();
    let idleTimer = null;
    let lastNetworkState = 'idle';
  
    const IGNORED_URL_PATTERNS = [
      /j\.clarity\.ms\/collect/i,
      /google/i, // was "google"
      /googletagmanager\.com/i,
      /doubleclick\.net/i,
      /googlesyndication\.com/i,
      /sentry\.io/i,
      /hotjar\.com/i,
      /mixpanel\.com/i,
      /segment\.com/i,
      /amplitude\.com/i,
      /facebook\.com\/tr/i,
      /twitter\.com\/i\/jot/i,
      /linkedin\.com\/li\/track/i,
      /\.websocket/i,
      /ws:\/\//i,
      /wss:\/\//i,
      /\/socket\.io\//i,
      /\.png$/i,
      /\.jpg$/i,
      /\.jpeg$/i,
      /\.gif$/i,
      /\.svg$/i,
      /\.ico$/i,
      /\.css$/i,
      /\.js$/i,
      /\.woff/i,
      /\.ttf$/i,
      /\.map$/i,
      /tracking/i,
      /analytics/i,
      /metrics/i,
      /beacon/i,
      /ping/i,
      /heartbeat/i,
      /health/i,
      /alive/i,
      /status/i,
      /telemetry/i,
      /\.net/i, // added
      /session/i // added
    ];
    

    // Communication setup - listen for messages from content script
    function setupCommunication() {
      window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        
        if (event.data.type === 'REQUEST_NETWORK_STATUS') {
          // Send current network status to content script
          window.postMessage({
            type: 'NETWORK_STATUS_RESPONSE',
            source: 'network-monitor',
            data: {
              status: activeRequests > 0 ? 'inprogress' : 'done',
              activeRequests: activeRequests,
              timestamp: Date.now()
            }
          }, '*');
        }
        
        if (event.data.type === 'WAIT_FOR_NETWORK_IDLE') {
          // Wait for network idle and respond
          waitForMeaningfulNetworkIdle({
            debounce: event.data.debounce || 1000,
            timeout: event.data.timeout || 30000
          }).then((result) => {
            window.postMessage({
              type: 'NETWORK_IDLE_RESOLVED',
              source: 'network-monitor',
              requestId: event.data.requestId,
              data: result
            }, '*');
          });
        }
      });
    }

    // Initialize communication
    setupCommunication();
  
    function isMeaningfulRequest(url) {
      if (!url || typeof url !== 'string') return false;
      return !IGNORED_URL_PATTERNS.some((pattern) => pattern.test(url));
    }
  
    function maybeLogStatus() {
      const previousState = lastNetworkState;
      
      if (activeRequests > 0 && lastNetworkState !== 'inprogress') {
        lastNetworkState = 'inprogress';
        console.log("inprogress");
        
        // Notify content script of status change
        window.postMessage({
          type: 'NETWORK_STATUS_CHANGED',
          source: 'network-monitor',
          data: {
            status: 'inprogress',
            activeRequests: activeRequests,
            timestamp: Date.now()
          }
        }, '*');
        
      } else if (activeRequests === 0 && lastNetworkState === 'inprogress') {
        lastNetworkState = 'idle';
        console.log('done');
        
        // Notify content script of status change
        window.postMessage({
          type: 'NETWORK_STATUS_CHANGED',
          source: 'network-monitor',
          data: {
            status: 'done',
            activeRequests: 0,
            timestamp: Date.now()
          }
        }, '*');
      }
    }
  
    function scheduleIdleCheck(debounceMs = 1000) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (activeRequests === 0) {
          const resolvers = Array.from(idleResolvers);
          idleResolvers.clear();
          for (const resolve of resolvers) {
            try { resolve('done'); } catch {}
          }
        }
      }, debounceMs);
    }
  
    // Patch fetch
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const url = (args[0] && args[0].url) || args[0];
      const track = isMeaningfulRequest(url);
  
      if (track) {
        activeRequests++;
        maybeLogStatus();
      }
  
      try {
        const response = await originalFetch.apply(this, args);
        return response;
      } finally {
        if (track) {
          activeRequests = Math.max(0, activeRequests - 1);
          maybeLogStatus();
          if (activeRequests === 0) {
            scheduleIdleCheck();
          }
        }
      }
    };
  
    // Patch XMLHttpRequest
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
  
    XMLHttpRequest.prototype.open = function (...args) {
      this._url = args[1];
      this._track = isMeaningfulRequest(this._url);
      return originalOpen.apply(this, args);
    };
  
    XMLHttpRequest.prototype.send = function (...args) {
      if (this._track) {
        activeRequests++;
        maybeLogStatus();
  
        const complete = () => {
          if (this._completed) return;
          this._completed = true;
          activeRequests = Math.max(0, activeRequests - 1);
          maybeLogStatus();
          if (activeRequests === 0) {
            scheduleIdleCheck();
          }
        };
  
        this.addEventListener('loadend', complete, { once: true });
        this.addEventListener('error', complete, { once: true });
        this.addEventListener('abort', complete, { once: true });
        this.addEventListener('timeout', complete, { once: true });
      }
  
      return originalSend.apply(this, args);
    };
  
    // Wait function
    function waitForMeaningfulNetworkIdle({ debounce = 1000, timeout = 30000 } = {}) {
      return new Promise((resolve) => {
        if (activeRequests === 0) {
          resolve('done'); // resolved immediately if no API is running
          return;
        }
  
        let resolved = false;
  
        const wrappedResolve = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          idleResolvers.delete(wrappedResolve);
          resolve('done');
        };
  
        idleResolvers.add(wrappedResolve);
  
        const timeoutId = setTimeout(() => {
          if (resolved) return;
          resolved = true;
          idleResolvers.delete(wrappedResolve);
          resolve('done'); // resolve on timeout anyway
        }, timeout);
  
        scheduleIdleCheck(debounce); // kick off check
      });
    }
  
    // Make function available globally (for direct access if needed)
    window.waitForMeaningfulNetworkIdle = waitForMeaningfulNetworkIdle;
  
    // Helpers
    window.__getNetworkIdleInfo__ = () => ({
      activeRequests,
      pendingIdleWaiters: idleResolvers.size
    });
  
    window.__forceNetworkIdle__ = () => {
      activeRequests = 0;
      maybeLogStatus();
      scheduleIdleCheck(0);
    };

    // Send initial status after a short delay
    setTimeout(() => {
      window.postMessage({
        type: 'NETWORK_STATUS_RESPONSE',
        source: 'network-monitor',
        data: {
          status: activeRequests > 0 ? 'inprogress' : 'done',
          activeRequests: activeRequests,
          timestamp: Date.now()
        }
      }, '*');
    }, 100);
  
    console.log('✅ Optimized network interceptor installed with communication');
  })();

// Updated playback.js changes (add these changes to your existing playback.js):
// Replace the waitForNetworkIdlePolling function with this new implementation:

function waitForNetworkIdleFromWebPage(maxWait = 15000) {
  return new Promise((resolve) => {
    const requestId = Date.now() + Math.random();
    let resolved = false;

    const messageHandler = (event) => {
      if (event.source !== window) return;
      
      if (event.data.type === 'NETWORK_IDLE_RESOLVED' && 
          event.data.source === 'network-monitor' &&
          event.data.requestId === requestId) {
        
        if (!resolved) {
          resolved = true;
          window.removeEventListener('message', messageHandler);
          clearTimeout(timeoutId);
          console.log('[playback] Network idle resolved from web page');
          resolve(event.data.data);
        }
      }
    };

    window.addEventListener('message', messageHandler);

    // Send request to network.js
    window.postMessage({
      type: 'WAIT_FOR_NETWORK_IDLE',
      requestId: requestId,
      debounce: 1000,
      timeout: maxWait
    }, '*');

    // Fallback timeout
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', messageHandler);
        console.log('[playback] Network idle timeout reached');
        resolve('timeout');
      }
    }, maxWait + 1000); // Add 1 second buffer
  });
}

// Also add this function to get current network status:
function getCurrentNetworkStatus() {
  return new Promise((resolve) => {
    let resolved = false;

    const messageHandler = (event) => {
      if (event.source !== window) return;
      
      if (event.data.type === 'NETWORK_STATUS_RESPONSE' && 
          event.data.source === 'network-monitor') {
        
        if (!resolved) {
          resolved = true;
          window.removeEventListener('message', messageHandler);
          clearTimeout(timeoutId);
          resolve(event.data.data.status);
        }
      }
    };

    window.addEventListener('message', messageHandler);

    // Request current status
    window.postMessage({
      type: 'REQUEST_NETWORK_STATUS'
    }, '*');

    // Fallback timeout
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('message', messageHandler);
        resolve('done'); // Default to done if no response
      }
    }, 2000);
  });
}