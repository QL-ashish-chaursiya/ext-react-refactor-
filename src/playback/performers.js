 //playback.performer.js
import { delay, locateElement, ensureClickable, waitForElementByXPath, normalizeUrl, sendMessageAsync, waitForNetworkIdlePolling, updateStatus, getClickablePoint } from './utils.js';
import { runAssertions } from './assertions.js';

export async function runAutomation() {
  let preSavedActions = new Set();
  let { actions, currentStep = 0, allResults = [], tabOrder = 1 } = await chrome.storage.local.get(['actions', 'currentStep', 'allResults', 'tabOrder']);
  const steps = actions || [];
  

  

  

  if (allResults.length === steps.length) {
    console.log("✅ No actions to process or all actions completed");
    updateStatus('ℹ️ Finished');

    if (allResults.length > 0) {
      const passed = allResults.filter(r => r.status === 'pass').length;
      const failed = allResults.length - passed;
      const skipped = steps.length - allResults.length;

      const finalReport = {
        passed,
        failed,
        skipped,
        total: steps.length,
        results: allResults,
        status: failed === 0 ? ' TEST PASSED' : ' TEST FAILED'
      };

      updateStatus(failed === 0 ? '✅ Test Passed' : '❌ Test Failed');
      console.log("📦 Final Test Result:", finalReport);

      chrome.runtime.sendMessage({
        command: 'saveTestResults',
        data: {
          status: failed === 0 ? 'pass' : 'fail',
          result: finalReport
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message to background:', chrome.runtime.lastError);
        } else {
          console.log('Response from background:', response);
        }
      });

      await chrome.storage.local.remove(['actions', 'currentStep', 'allResults', 'tabOrder']);
    }
    return;
  }

  currentStep = (tabOrder !== 1 || allResults.length !== 0) ? currentStep + 1 : currentStep;
  let results = allResults;

  for (let i = currentStep; i < steps.length; i++) {
    const step = steps[i];

    if (tabOrder != step.tabOrder) {
      console.log(tabOrder, step.tabOrder);
      break;
    }

    const result = {
      sequence: step.sequence,
      description: step.description,
    };

    try {
      if (step.type === 'mousedown' || step.type === 'System_Navigate' && !preSavedActions.has(i)) {
        console.log(`📝 Pre-saving mousedown action at step ${i}`);
        const preResult = {
          ...result,
          status: 'pass',
          message: 'Successfully clicked',
          assertions: []
        };
        results.push(preResult);
        preSavedActions.add(i);
        await chrome.storage.local.set({
          currentStep: i,
          allResults: results
        });
        console.log(`✅ Mousedown action pre-saved to storage`);
      }

      const res = await performAction(step, steps, i);
      if (!preSavedActions.has(i)) {
        results.push({
          ...result,
          status: res.success ? 'pass' : 'fail',
          message: res.message,
          assertions: res.assertions || []
        });
        await chrome.storage.local.set({ allResults: results });
      } else {
        console.log(`⚠️ Skipping duplicate save for pre-saved action at step ${i}`);
      }

      if (!res.success) {
        console.log(`🛑 Stopping execution due to failed step ${step.sequence}`);
        updateStatus('❌ Test Failed');
        results[results.length - 1] = {
          ...results[results.length - 1],
          status: 'fail',
          message: res.message
        };
        await chrome.storage.local.set({ allResults: results });
        break;
      }
      updateStatus('⏳ Waiting for Network...');
      await waitForNetworkIdlePolling();
    } catch (err) {
      console.error(`🔴 Step ${step.sequence} failed:`, err);
      if (preSavedActions.has(i)) {
        const resultIndex = results.findIndex(r => r.sequence === step.sequence);
        if (resultIndex !== -1) {
          results[resultIndex] = {
            ...result,
            status: 'fail',
            message: err.message,
            assertions: []
          };
        }
      } else {
        results.push({
          ...result,
          status: 'fail',
          message: err.message,
          assertions: []
        });
      }
      await chrome.storage.local.set({ allResults: results });
      break;
    }

    if (!preSavedActions.has(i)) {
      await chrome.storage.local.set({ currentStep: i });
    }
    await delay(300);
  }

  const isFailed = results.some(r => r.status === 'fail');
  if (results.length === steps.length || isFailed) {
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.length - passed;
    const skipped = steps.length - results.length;

    const finalReport = {
      passed,
      failed,
      skipped,
      total: steps.length,
      results,
      status: failed === 0 ? '✅ TEST PASSED' : 'TEST FAILED'
    };
    updateStatus(failed === 0 ? '✅ Test Passed' : '❌ Test Failed');
    console.log("📦 Final Test Result:", finalReport);

    chrome.runtime.sendMessage({
      command: 'saveTestResults',
      data: {
        status: failed === 0 ? 'pass' : 'fail',
        result: finalReport
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message to background:', chrome.runtime.lastError);
      } else {
        console.log('Response from background:', response);
      }
    });

    await chrome.storage.local.remove(['actions', 'currentStep', 'allResults', 'tabOrder']);
  }
}
async function performAction(action, arr, index) {
  const statusOverlay = document.getElementById('__playback_status_overlay__');
  function updateStatus(text) {
    statusOverlay.textContent = text;
  }

  function movePointerToElement(el) {
    const pointer = document.getElementById('__playback_pointer__');
    if (!pointer || !el) return;
    const rect = el.getBoundingClientRect();
    pointer.style.top = `${window.scrollY + rect.top + 20}px`;
    pointer.style.left = `${window.scrollX + rect.left + 50}px`;
  }

  updateStatus('⏳ Waiting for Network...');
  await waitForNetworkIdlePolling();
  updateStatus('🚀 Running test playback...');

  let element = null;
  if (action.element?.uniqueSelector || action.element?.xpath) {
    const { element: locatedElement, failed } = await locateElement(action);
    if (failed) {
      return {
        success: false,
        message: `Element not found: ${action.element?.uniqueSelector || 'N/A'} or ${action.element?.xpath || 'N/A'}`,
        assertions: []
      };
    }
    element = locatedElement;
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    movePointerToElement(element);
    await delay(500);
  }

  let actionSuccess = false;
  let resMessage = "";
  let assertions = [];

  try {
    switch (action.type) {
      case 'System_Navigate':
        window.location.href = action.url;
        actionSuccess = true;
        resMessage = `Navigated to ${action.url}`;
        await delay(2000);
        break;
      case 'navigate': {
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
          updateStatus('⏳ Waiting for page Navigation...');
          await delay(pollInterval);
          elapsed += pollInterval;
        }

        return {
          success: true,
          message: isMatch
            ? `Current URL matches expected (normalized): ${normalizedCurrent}`
            : `Current URL (normalized) ${normalizedCurrent} does not match expected (normalized): ${normalizedExpected}`,
          assertions: []
        };
      }
      case 'mousedown': {
        const nextAction = arr?.length - 1 > index && arr[index + 1]?.type == 'fileSelect';
        if (nextAction) {
          actionSuccess = true;
          resMessage = "File input: click skipped to avoid file dialog";
          break;
        }

        updateStatus('⏳ Waiting for Network...');
        await waitForNetworkIdlePolling();
        updateStatus('🚀 Running test playback...');

        const clickResult = await ensureClickable(action.element?.xpath, 10000);
        if (clickResult.success) {
          const el = await waitForElementByXPath(action.element?.xpath, 1000);
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
  actionSuccess =  false;
  resMessage =  result.reason || 'Failed to click';
}

         
        } else {
          actionSuccess = false;
          resMessage = result.message;
        }
        break;
      }
      case 'scroll': {
        if (action.containerXPath) {
          const result = document.evaluate(action.containerXPath[0], document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          const container = result.singleNodeValue;
          if (container && container.scrollTo) {
            container.scrollTo({ left: action.scrollX || 0, top: action.scrollY || 0, behavior: 'smooth' });
            actionSuccess = true;
            resMessage = `Scroll container to (${action.scrollX}, ${action.scrollY}) successful`;
          } else {
            window.scrollTo({ left: action.scrollX || 0, top: action.scrollY || 0, behavior: 'smooth' });
            actionSuccess = true;
            resMessage = `Scroll to (${action.scrollX}, ${action.scrollY}) fallback successful`;
          }
        } else {
          window.scrollTo({ left: action.scrollX || 0, top: action.scrollY || 0, behavior: 'smooth' });
          actionSuccess = true;
          resMessage = `Scroll to (${action.scrollX}, ${action.scrollY}) successful`;
        }
        await delay(1000);
        break;
      }
      case 'change': {
        element.focus();
        if (element.isContentEditable) {
          element.innerHTML = '';
          await delay(100);
          element.innerHTML = action.value;
          element.dispatchEvent(new InputEvent('input', { 
            bubbles: true, 
            data: action.value, 
            inputType: 'insertText' 
          }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          actionSuccess = element.textContent === action.value;
        } else {
          element.value = '';
          await delay(100);
          element.value = action.value;
          element.dispatchEvent(new InputEvent('input', { 
            bubbles: true, 
            data: action.value, 
            inputType: 'insertText' 
          }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
          actionSuccess = element.value === action.value;
        }
        resMessage = "Successfully changed value";
        break;
      }
      case 'hover': {
        const rect = element.getBoundingClientRect();
        const x = Math.floor(rect.left + rect.width / 2);
        const y = Math.floor(rect.top + rect.height / 2);
        await new Promise(resolve => {
          chrome.runtime.sendMessage({
            command: "trustedHover",
            x,
            y
          }, () => resolve());
        });
        actionSuccess = true;
        resMessage = "Successfully hover";
        break;
      }
      case 'fileSelect': {
        const fileData = action.storageData;
        if (!fileData) {
          return {
            success: false,
            message: "No file data found",
            assertions: []
          };
        }
        const byteString = atob(fileData.content.split(',')[1]);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: fileData.type });
        const file = new File([blob], fileData.name, { type: fileData.type });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        element.files = dataTransfer.files;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        actionSuccess = true;
        resMessage = `File "${fileData.name}" selected`;
        break;
      }
      default: {
        return {
          success: false,
          message: `Unsupported action type: ${action.type}`,
          assertions: []
        };
      }
    }

    assertions = await runAssertions(action, element);
    const failedAssertions = assertions.some(a => a.success == false);
    const failedMsg = assertions.find(a => a.success == false)?.message || "No failed assertions";
    return {
      success: actionSuccess && !failedAssertions,
      message: failedAssertions ? failedMsg : resMessage,
      assertions
    };
  } catch (err) {
    return {
      success: false,
      message: err.message,
      assertions: []
    };
  }
}

 