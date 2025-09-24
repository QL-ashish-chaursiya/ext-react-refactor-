 //playback.assertion.js
import { sendMessageAsync } from './utils.js';

export async function runAssertions(action, element) {
  const results = [];
  const assertions = action.assertions || {};

  for (const [type, assertion] of Object.entries(assertions)) {
    const expected = assertion.value || "";
    let success = true;
    let message = "";

    switch (type) {
      case 'ValidEmail':
        success = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(element?.value || "");
        message = success ? "Valid email" : "Invalid email";
        break;
      case 'formHasValue':
        success = (element?.value || "") === expected;
        message = success
          ? "Value matches"
          : `Value is "${element?.value}", expected "${expected}"`;
        break;
      case 'pageHasTitle':
        success = document.title.toLowerCase().includes(expected.toLowerCase());
        message = success
          ? "Title includes value"
          : `Title does not include "${expected}"`;
        break;
      case "pageHasText":
        const pageText = document.body.innerText.toLowerCase();
        success = pageText.includes(expected.toLowerCase());
        message = success
          ? "Page contains expected text"
          : `Page does not contain "${expected}"`;
        break;
      case 'elementHasText':
        const actualText = element?.textContent?.trim().toLowerCase() || "";
        success = actualText.includes(expected.toLowerCase());
        message = success
          ? "Element has expected text"
          : `Text "${expected}" not found in element`;
        break;
      case 'elementIsVisible':
        success =
          element &&
          !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
        message = success ? "Element is visible" : "Element not visible";
        break;
      case "downloadStarted":
        try {
          success = false;
          let attempts = 0;
          const maxAttempts = 5;
          while (attempts < maxAttempts) {
            const response = await sendMessageAsync({ command: "CHECK_DOWNLOAD_STARTED" });
            if (response?.started) {
              success = true;
              break;
            }
            await new Promise(r => setTimeout(r, 500));
            attempts++;
          }
          message = success
            ? "Download has started"
            : "Expected download to start, but it did not within timeout";
        } catch (err) {
          success = false;
          message = "Error while checking download status";
        }
        break;
      default:
        message = `⚠️ Unsupported assertion: ${type}`;
        success = false;
        break;
    }
    const updatedMessage = success ? message : 'Assertion failed: ' + message;
    results.push({ type, message: updatedMessage, success });
    if (!success) {
      break;
    }
  }
  return results;
}