// playback.performer.js - Cross-webext compatible version
import webext from 'webextension-polyfill';
import {
  delay,
  locateElement,
  ensureClickable,
  waitForElementByXPath,
  normalizeUrl,
  sendMessageAsync,
  updateStatus,
  getClickablePoint,
  isElementCovered,
  waitForElementUncovered,
  waitForIframe,
  waitForNetworkIdle,
  resolveVariableValue,
  locateIframeByXPath,
} from "./utils.js";
import { runAssertions } from "./assertions.js";
import { captureAndUpload, compare, cropImage, decryptPassword, sendMessagePromise } from "../utils/helper.js";


export async function runAutomation() {
  let preSavedActions = new Set();
  const attachedframes = new Set();
  
  let {
    actions,
    currentStep = 0,
    allResults = [],
    tabOrder = 1,
    wait,
  } = await webext.storage.local.get([
    "actions",
    "currentStep",
    "allResults",
    "tabOrder",
    "wait"
  ]);
  
  const steps = actions || [];

  if (allResults.length === steps.length) {
    console.log("✅ No actions to process or all actions completed");
    updateStatus("ℹ️ Finished");

    if (allResults.length > 0) {
      const passed = allResults.filter((r) => r.status === "pass").length;
      const failed = allResults.length - passed;
      const skipped = steps.length - allResults.length;

      const finalReport = {
        passed,
        failed,
        skipped,
        total: steps.length,
        results: allResults,
        status: failed === 0 ? " TEST PASSED" : " TEST FAILED",
      };

      updateStatus(failed === 0 ? "✅ Test Passed" : "❌ Test Failed");
      console.log("📦 Final Test Result:", finalReport);

      try {
        await webext.runtime.sendMessage({
          command: "saveTestResults",
          data: {
            status: failed === 0 ? "pass" : "fail",
            result: finalReport,
          },
        });
        console.log("✅ Test results sent to background");
      } catch (error) {
        console.error("Error sending message to background:", error);
      }

      await webext.storage.local.remove([
        "actions",
        "currentStep",
        "allResults",
        "tabOrder",
        "wait"
      ]);
    }
    return;
  }

  currentStep =
    tabOrder !== 1 || allResults.length !== 0 ? currentStep + 1 : currentStep;
  let results = allResults;

  for (let i = currentStep; i < steps.length; i++) {
    const step = steps[i];


    try {
      const resp = await webext.runtime.sendMessage({ command: "IS_ACTIVE_PLAYBACK_TAB" });
      if (!resp || !resp.isActive) {
        console.log("Playback paused: this tab is not the active playback tab. Stopping here.");
        break;
      }
    } catch (err) {
      console.warn("Failed to verify active playback tab, stopping playback:", err);
      break;
    }

    // ── switchTab ────────────────────────────────────────────────────────────
    if (step.type === "switchTab") {
      console.log(`🔀 Encountered switchTab action for tabOrder ${step.tabOrder}`);
      await switchToTab(step.tabOrder);
      results.push({
        sequence: step.sequence,
        description: step.description || `Switched to tab ${step.tabOrder}`,
        status: "pass",
        message: `Switched to tab ${step.tabOrder}`,
        assertions: [],
      });
      await webext.storage.local.set({ allResults: results, currentStep: i });
      break;
    }
    if (step.type === "CLOSE_TAB") {
      results.push({
        sequence: step.sequence,
        description: step.description || `close to tab ${step.tabIndex}`,
        status: "pass",
        message: `close to tab ${step.tabIndex}`,
        assertions: [],
      });
      await webext.storage.local.set({ allResults: results, currentStep: i });
      await closeToTab(step.tabIndex);
      await delay(1000);
      continue;
    }

    const result = {
      sequence: step.sequence,
      description: step.description,
    };

    try {
      if (
        step.type === "mousedown" ||
        (step.type === "System_Navigate" && !preSavedActions.has(i))
      ) {
        console.log(`📝 Pre-saving mousedown action at step ${i}`);
        const preResult = {
          ...result,
          status: "pass",
          message: "Successfully clicked",
          assertions: [],
        };
        results.push(preResult);
        preSavedActions.add(i);
        await webext.storage.local.set({ currentStep: i, allResults: results });
        console.log(`✅ Mousedown action pre-saved to storage`);
      }

      let res;
      if (step.isTopFrame === false || step?.iframe?.length > 0) {
        await delay(1000);
        updateStatus("🚀 Running iframe action...");

        const targetIframe = await locateIframeByXPath(step.iframe);
        console.log("targetIframe", targetIframe);

        if (!targetIframe) {
          res = { success: false, message: "Iframe not found via xpath", assertions: [] };
        }

        if (targetIframe) {
          res = await new Promise((resolve) => {
            const timeout = setTimeout(() => {
              resolve({ success: false, message: "Iframe playback timeout", assertions: [] });
            }, 30000);

            const handler = (event) => {
              if (event.data?.type === "PLAYBACK_IFRAME_RESPONSE") {
                clearTimeout(timeout);
                window.removeEventListener("message", handler);
                resolve(event.data.result);
              }
            };

            window.addEventListener("message", handler);
            targetIframe.contentWindow.postMessage(
              { type: "PLAYBACK_IFRAME_ACTION", action: step, arr: steps, idx: i },
              "*"
            );
            console.log("send iframe action");
          });
        }
      } else {
        res = await performAction(step, steps, i);
      }

      if (!preSavedActions.has(i)) {
        results.push({
          ...result,
          status: res.success ? "pass" : "fail",
          message: res.message,
          assertions: res.assertions || [],
        });
        await webext.storage.local.set({ allResults: results });
      } else {
        console.log(`⚠️ Skipping duplicate save for pre-saved action at step ${i}`);
      }

      if (!res.success) {
        console.log(`🛑 Stopping execution due to failed step ${step.sequence}`);
        updateStatus("❌ Test Failed");
        results[results.length - 1] = {
          ...results[results.length - 1],
          status: "fail",
          message: res.message,
        };
        await webext.storage.local.set({ allResults: results });
        break;
      }
      updateStatus("⏳ Waiting for Network...");
      const networkResult = await waitForNetworkIdle();

      if (!networkResult.status) {
        // A non-2xx API call was detected — fail this step and stop
        
        updateStatus("❌ Test Failed — API Error");

        results[results.length - 1] = {
          ...results[results.length - 1],
          status: "fail",
          message: `API failure: ${networkResult.message} (URL: ${networkResult.url}, Status: ${networkResult.statusCode ?? 'N/A'})`,
        };
        await webext.storage.local.set({ allResults: results });
        break; // stop the loop entirely
      }

    } catch (err) {
      console.error(`🔴 Step ${step.sequence} failed:`, err);
      if (preSavedActions.has(i)) {
        const resultIndex = results.findIndex((r) => r.sequence === step.sequence);
        if (resultIndex !== -1) {
          results[resultIndex] = {
            ...result,
            status: "fail",
            message: err.message,
            assertions: [],
          };
        }
      } else {
        results.push({
          ...result,
          status: "fail",
          message: err.message,
          assertions: [],
        });
      }
      await webext.storage.local.set({ allResults: results });
      break;
    }

    if (!preSavedActions.has(i)) {
      await webext.storage.local.set({ currentStep: i });
    }

    const finalWait = wait == undefined ? 1 : wait;
    await delay(finalWait * 1000);
  }

  // ── Final report ─────────────────────────────────────────────────────────
  const isFailed = results.some((r) => r.status === "fail");
  if (results.length === steps.length || isFailed) {
    const passed = results.filter((r) => r.status === "pass").length;
    const failed = results.length - passed;
    const skipped = steps.length - results.length;

    const finalReport = {
      passed,
      failed,
      skipped,
      total: steps.length,
      results,
      status: failed === 0 ? "✅ TEST PASSED" : "TEST FAILED",
    };

    updateStatus(failed === 0 ? "✅ Test Passed" : "❌ Test Failed");
    console.log("📦 Final Test Result:", finalReport);

    try {
      await webext.runtime.sendMessage({
        command: "saveTestResults",
        data: {
          status: failed === 0 ? "pass" : "fail",
          result: finalReport,
        },
      });
      console.log("✅ Test results sent to background");
    } catch (error) {
      console.error("Error sending message to background:", error);
    }

    await webext.storage.local.remove([
      "actions",
      "currentStep",
      "allResults",
      "tabOrder",
      "wait"
    ]);
  }
}

// ─── performAction ────────────────────────────────────────────────────────────
async function performAction(action, arr, index) {
  const statusOverlay = document.getElementById("__playback_status_overlay__");
  function updateStatus(text) {
    if (statusOverlay) statusOverlay.textContent = text;
  }

  function movePointerToElement(el) {
    const pointer = document.getElementById("__playback_pointer__");
    if (!pointer || !el) return;
    const rect = el.getBoundingClientRect();
    pointer.style.top = `${window.scrollY + rect.top + 20}px`;
    pointer.style.left = `${window.scrollX + rect.left + 50}px`;
  }

  function movePointerDrag(x, y) {
    const pointer = document.getElementById('__playback_pointer__');
    if (!pointer) return;
    pointer.style.top = `${window.scrollY + y}px`;
    pointer.style.left = `${window.scrollX + x}px`;
  }

  // Wait for idle before starting the action, and check for failures here too
  updateStatus("⏳ Waiting for Network...");
  const preNetworkResult = await waitForNetworkIdle();
  if (!preNetworkResult.status) {
    return {
      success: false,
      message: `API failure before action: ${preNetworkResult.message} (URL: ${preNetworkResult.url}, Status: ${preNetworkResult.statusCode ?? 'N/A'})`,
      assertions: [],
    };
  }
  updateStatus("🚀 Running test playback...");

  let element = null;
  if (action.element?.uniqueSelector || action.element?.xpath) {
    const { element: locatedElement, failed } = await locateElement(action);
    if (failed) {
      return {
        success: false,
        message: `Element not found: ${action.element?.uniqueSelector || "N/A"} or ${action.element?.xpath || "N/A"}`,
        assertions: [],
      };
    }
    element = locatedElement;
    element.scrollIntoView({ behavior: "auto", block: "center" });

    if (action.type === 'dragstart' || action.type === 'dragend') {
      movePointerDrag(action.clientX || element.getBoundingClientRect().left, action.clientY || element.getBoundingClientRect().top);
    } else {
      movePointerToElement(element);
    }

    await delay(300);
  }

  let actionSuccess = false;
  let resMessage = "";
  let assertions = [];

  try {
    switch (action.type) {
      case "System_Navigate":
        window.location.href = action.url;
        actionSuccess = true;
        resMessage = `Navigated to ${action.url}`;
        await delay(2000);
        break;

      case "navigate": {
        const expectedUrl = action.url;
        const timeout = 10000;
        const pollInterval = 1000;
        let isMatch = false;
        let elapsed = 0;
        const normalizedExpected = normalizeUrl(expectedUrl);
        let normalizedCurrent;

        while (elapsed < timeout) {
          normalizedCurrent = normalizeUrl(window.location.href);
          if (normalizedCurrent === normalizedExpected) {
            isMatch = true;
            break;
          }
          updateStatus("⏳ Waiting for page Navigation...");
          await delay(pollInterval);
          elapsed += pollInterval;
        }

        return {
          success: true,
          message: isMatch
            ? `Current URL matches expected (normalized): ${normalizedCurrent}`
            : `Current URL (normalized) ${normalizedCurrent} does not match expected (normalized): ${normalizedExpected}`,
          assertions: [],
        };
      }

      case 'dragstart': {
        const el = await waitForElementByXPath(action.element?.xpath, 1000);
        const rect = el.getBoundingClientRect();
        const clientX = Math.floor(rect.left + (action.offsetX || rect.width / 2));
        const clientY = Math.floor(rect.top + (action.offsetY || rect.height / 2));
        const safeY = Math.min(clientY, window.innerHeight - 10);
        await sendMessageAsync({ command: "pointerdragstart", x: clientX, y: safeY });
        actionSuccess = true;
        resMessage = "Drag started";
        break;
      }

      case 'dragend': {
        const el = await waitForElementByXPath(action.element?.xpath, 1000);
        const rect = el.getBoundingClientRect();
        const clientX = Math.floor(rect.left + (action.offsetX || rect.width / 2));
        const clientY = Math.floor(rect.top + (action.offsetY || rect.height / 2));
        const safeY = Math.min(clientY, window.innerHeight - 10);
        await sendMessageAsync({ command: "pointerdrop", x: clientX, y: safeY });
        actionSuccess = true;
        resMessage = "Drag completed";
        break;
      }

      case 'compareImage': {
        const overlay = document.getElementById('__playback_status_overlay__');
        if (overlay) overlay.style.display = 'none';

        window.scrollTo({ left: action.rect.scrollX || 0, top: action.rect.scrollY || 0, behavior: "smooth" });
        await delay(2000);

        const newUrl = await captureAndUpload(action.rect);
        if (overlay) overlay.style.display = 'block';
        updateStatus("⏳ Comparing Image...");

        const aiRes = await compare(action.image_url, newUrl);
        actionSuccess = !(aiRes.missing?.length > 0 || aiRes.text_changes?.length > 0) && aiRes.success;
        resMessage = aiRes.summary || aiRes.error;
        break;
      }

      case "Enter":
      case "Tab":
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight":
      case "Escape": {
        try {
          await webext.runtime.sendMessage({ command: "trustedKeyEvent", key: action.type });
          actionSuccess = true;
          resMessage = `✅ Simulated ${action.type} key via debugger`;
        } catch (err) {
          console.error(`❌ ${action.type} key simulation failed:`, err);
          actionSuccess = false;
          resMessage = err.message || `Failed to simulate ${action.type}`;
        }
        break;
      }

      case "mousedown": {
        const nextAction = arr?.length - 1 > index && arr[index + 1]?.type === "fileSelect";
        if (nextAction) {
          actionSuccess = true;
          resMessage = "File input: click skipped to avoid file dialog";
          break;
        }

        updateStatus("⏳ Waiting for Network...");
        const mousedownNetworkResult = await waitForNetworkIdle();
        if (!mousedownNetworkResult.status) {
          return {
            success: false,
            message: `API failure before mousedown: ${mousedownNetworkResult.message} (URL: ${mousedownNetworkResult.url}, Status: ${mousedownNetworkResult.statusCode ?? 'N/A'})`,
            assertions: [],
          };
        }
        updateStatus("🚀 Running test playback...");

        const clickResult = await ensureClickable(action.element?.xpath, 10000);
        if (clickResult.success) {
          const el = await waitForElementByXPath(action.element?.xpath, 1000);
          const coverCheck = isElementCovered(el, { x: action.offsetX, y: action.offsetY });

          if (coverCheck.covered) {
            console.log(`⚠️ Element covered: ${coverCheck.reason}`);
            updateStatus("⏳ Waiting for overlay to clear...");
            await waitForElementUncovered(el, 10000, { x: action.offsetX, y: action.offsetY });
          }

          const result = await getClickablePoint(el, action.offsetX, action.offsetY);

          if (result.success) {
            if (result.x !== null && result.y !== null) {
              await sendMessageAsync({ command: "trustedClick", x: result.x, y: result.y });
              console.log("✅ Clicked at", result.x, result.y, "-", result.reason);
            } else {
              console.log("✅ Used direct el.click() -", result.reason);
            }
            actionSuccess = true;
            resMessage = "✅ Successfully clicked";
          } else {
            console.error("❌ Failed to click:", result.reason);
            actionSuccess = false;
            resMessage = result.reason || "Failed to click";
          }
        } else {
          actionSuccess = false;
          resMessage = clickResult.message;
        }
        break;
      }

      case "scroll": {
        if (action.containerXPath) {
          const result = document.evaluate(
            action.containerXPath[0], document, null,
            XPathResult.FIRST_ORDERED_NODE_TYPE, null
          );
          const container = result.singleNodeValue;
          if (container && container.scrollTo) {
            container.scrollTo({ left: action.scrollX || 0, top: action.scrollY || 0, behavior: "smooth" });
            actionSuccess = true;
            resMessage = `Scroll container to (${action.scrollX}, ${action.scrollY}) successful`;
          } else {
            window.scrollTo({ left: action.scrollX || 0, top: action.scrollY || 0, behavior: "smooth" });
            actionSuccess = true;
            resMessage = `Scroll to (${action.scrollX}, ${action.scrollY}) fallback successful`;
          }
        } else {
          window.scrollTo({ left: action.scrollX || 0, top: action.scrollY || 0, behavior: "smooth" });
          actionSuccess = true;
          resMessage = `Scroll to (${action.scrollX}, ${action.scrollY}) successful`;
        }
        await delay(1000);
        break;
      }

      case "change": {
        element.focus();
        let finalValue = action?.variable?.name ? resolveVariableValue(action?.variable) : action.value;
        if (action.isPassword) {
          let { userId } = await webext.storage.local.get(["userId"]);
          finalValue = await decryptPassword(action.passKey, userId);
        }
        if (element.isContentEditable) {
          element.innerHTML = "";
          await delay(100);
          element.innerHTML = finalValue;
          element.dispatchEvent(new InputEvent("input", { bubbles: true, data: finalValue, inputType: "insertText" }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          actionSuccess = true;
        } else {
          element.value = "";
          await delay(100);
          element.value = finalValue;
          element.dispatchEvent(new InputEvent("input", { bubbles: true, data: finalValue, inputType: "insertText" }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
          actionSuccess = true;
        }
        resMessage = "Successfully changed value";
        break;
      }

      case "hover": {
        const rect = element.getBoundingClientRect();
        const x = Math.floor(rect.left + rect.width / 2);
        const y = Math.floor(rect.top + rect.height / 2);
        try {
          await webext.runtime.sendMessage({ command: "trustedHover", x, y });
          actionSuccess = true;
          resMessage = "Successfully hover";
        } catch (error) {
          console.error("Hover failed:", error);
          actionSuccess = false;
          resMessage = "Failed to hover";
        }
        break;
      }

      case "fileSelect": {
        const fileData = action.storageData;
        if (!fileData) {
          return { success: false, message: "No file data found", assertions: [] };
        }

        const byteString = atob(fileData.content.split(",")[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let j = 0; j < byteString.length; j++) ia[j] = byteString.charCodeAt(j);
        const blob = new Blob([ab], { type: fileData.type });
        const file = new File([blob], fileData.name, { type: fileData.type });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        element.files = dataTransfer.files;
        element.dispatchEvent(new Event("change", { bubbles: true }));
        actionSuccess = true;
        resMessage = `File "${fileData.name}" selected`;
        break;
      }

      default:
        return { success: false, message: `Unsupported action type: ${action.type}`, assertions: [] };
    }

    assertions = await runAssertions(action, element);
    const failedAssertions = assertions.some((a) => a.success === false);
    const failedMsg = assertions.find((a) => a.success === false)?.message || "No failed assertions";

    return {
      success: actionSuccess && !failedAssertions,
      message: failedAssertions ? failedMsg : resMessage,
      assertions,
    };
  } catch (err) {
    return { success: false, message: err.message, assertions: [] };
  }
}

// ─── Tab helpers ──────────────────────────────────────────────────────────────
export async function switchToTab(tabOrder) {
  await webext.runtime.sendMessage({ command: "SWITCH_TAB", tabOrder }).catch((error) => {
    console.error("Error switching tab:", error);
  });
}

export async function closeToTab(tabOrder) {
  await webext.runtime.sendMessage({ command: "CLOSE_TAB", tabOrder }).catch((error) => {
    console.error("Error closing tab:", error);
  });
}

export async function setupListner() {
  webext.runtime.onMessage.addListener(async (message) => {
    if (message.action === "TAB_SWITCHED") {
      console.log("Tab switched to order:", message.tabOrder);
      await delay(2000);
      runAutomation();
    }
  });
}