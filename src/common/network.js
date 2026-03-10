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
  let isMonitoringStatus = false;

  let detectedFailure = null;

  const IGNORED_URL_PATTERNS = [
    /j\.clarity\.ms\/collect/i,
    /google/i,
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
    /\.net/i,
    /session/i,
    /public/i,
    /hubspot/i
    /static/i
  ];

  // ─── Communication ──────────────────────────────────────────────────────────
  function setupCommunication() {
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;

      if (event.data.type === 'REQUEST_NETWORK_STATUS') {
        isMonitoringStatus = true;
        detectedFailure = null;

        window.postMessage({
          type: 'NETWORK_STATUS_RESPONSE',
          source: 'network-monitor',
          data: {
            status: activeRequests > 0 ? 'inprogress' : 'done',
            activeRequests,
            timestamp: Date.now(),
          },
        }, '*');
      }

      if (event.data.type === 'WAIT_FOR_NETWORK_IDLE') {
        isMonitoringStatus = true;
        detectedFailure = null;

        waitForMeaningfulNetworkIdle({
          debounce: event.data.debounce || 1000,
          timeout: event.data.timeout || 30000,
        }).then(() => {
          isMonitoringStatus = false;

          // ✅ Success: message is a JSON string
          const response = detectedFailure
            ? detectedFailure
            : {
                status: true,
                message: JSON.stringify({
                  url: null,
                  statusCode: null,
                  apiResponse: null,
                  error: null,
                }),
              };

          window.postMessage({
            type: 'NETWORK_IDLE_RESOLVED',
            source: 'network-monitor',
            requestId: event.data.requestId,
            data: response,
          }, '*');
        });
      }
    });
  }

  setupCommunication();

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function isMeaningfulRequest(url) {
    if (!url || typeof url !== 'string') return false;
    return !IGNORED_URL_PATTERNS.some((pattern) => pattern.test(url));
  }

  function is2xx(code) {
    return typeof code === 'number' && code >= 200 && code < 300;
  }

  /**
   * Safely parse the response body — tries JSON first, falls back to plain text.
   */
  async function safeParseBody(response) {
    try {
      const cloned = response.clone();
      const text = await cloned.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch {
      return null;
    }
  }

  /**
   * Called after every meaningful request settles.
   * ✅ message is always a JSON string: { url, statusCode, apiResponse, error }
   */
  function handleRequestResult(url, statusCode, errorType, apiResponse = null) {
    if (!isMonitoringStatus) return;

    const failed = errorType !== null || !is2xx(statusCode);

    // ✅ message is a JSON string — ready to display directly on UI
    const message = JSON.stringify({
      url,
      statusCode: errorType ? null : statusCode,
      apiResponse,
      error: errorType ?? null,
    });

    console.log(`[API] ${url} | statusCode: ${errorType ?? statusCode} | failed: ${failed}`, apiResponse);

    // Broadcast every settled request
    window.postMessage({
      type: 'NETWORK_REQUEST_SETTLED',
      source: 'network-monitor',
      data: {
        status: !failed,
        message,
      },
    }, '*');

    if (failed && !detectedFailure) {
      detectedFailure = {
        status: false,
        message, // ✅ JSON string
      };

      window.postMessage({
        type: 'NETWORK_API_FAILED',
        source: 'network-monitor',
        data: detectedFailure,
      }, '*');
    }
  }

  function maybeLogStatus() {
    if (activeRequests > 0 && lastNetworkState !== 'inprogress') {
      lastNetworkState = 'inprogress';
      console.log('inprogress');
      window.postMessage({
        type: 'NETWORK_STATUS_CHANGED',
        source: 'network-monitor',
        data: { status: 'inprogress', activeRequests, timestamp: Date.now() },
      }, '*');
    } else if (activeRequests === 0 && lastNetworkState === 'inprogress') {
      lastNetworkState = 'idle';
      console.log('done');
      window.postMessage({
        type: 'NETWORK_STATUS_CHANGED',
        source: 'network-monitor',
        data: { status: 'done', activeRequests: 0, timestamp: Date.now() },
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

  // ─── Patch fetch ──────────────────────────────────────────────────────────
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

      if (track) {
        const apiResponse = await safeParseBody(response);
        handleRequestResult(url, response.status, null, apiResponse);
      }

      return response;
    } catch (err) {
      if (track) handleRequestResult(url, null, 'network-error', null);
      throw err;
    } finally {
      if (track) {
        activeRequests = Math.max(0, activeRequests - 1);
        maybeLogStatus();
        if (activeRequests === 0) scheduleIdleCheck();
      }
    }
  };

  // ─── Patch XMLHttpRequest ─────────────────────────────────────────────────
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

      const finalize = (errorType) => {
        if (this._completed) return;
        this._completed = true;

        let apiResponse = null;
        try {
          if (this.responseText) {
            try {
              apiResponse = JSON.parse(this.responseText);
            } catch {
              apiResponse = this.responseText;
            }
          }
        } catch {}

        handleRequestResult(this._url, this.status || null, errorType, apiResponse);
        activeRequests = Math.max(0, activeRequests - 1);
        maybeLogStatus();
        if (activeRequests === 0) scheduleIdleCheck();
      };

      this.addEventListener('loadend', () => finalize(null), { once: true });
      this.addEventListener('error',   () => finalize('network-error'), { once: true });
      this.addEventListener('abort',   () => finalize('aborted'), { once: true });
      this.addEventListener('timeout', () => finalize('timeout'), { once: true });
    }

    return originalSend.apply(this, args);
  };

  // ─── Wait function ────────────────────────────────────────────────────────
  function waitForMeaningfulNetworkIdle({ debounce = 1000, timeout = 30000 } = {}) {
    return new Promise((resolve) => {
      if (activeRequests === 0) {
        resolve('done');
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
        resolve('done');
      }, timeout);

      scheduleIdleCheck(debounce);
    });
  }

  window.waitForMeaningfulNetworkIdle = waitForMeaningfulNetworkIdle;

  window.__getNetworkIdleInfo__ = () => ({
    activeRequests,
    pendingIdleWaiters: idleResolvers.size,
  });

  window.__forceNetworkIdle__ = () => {
    activeRequests = 0;
    maybeLogStatus();
    scheduleIdleCheck(0);
  };

  setTimeout(() => {
    window.postMessage({
      type: 'NETWORK_STATUS_RESPONSE',
      source: 'network-monitor',
      data: {
        status: activeRequests > 0 ? 'inprogress' : 'done',
        activeRequests,
        timestamp: Date.now(),
      },
    }, '*');
  }, 100);

  console.log('✅ Optimized network interceptor installed with communication');
})();