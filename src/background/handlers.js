// background.handler.js
import  webext from "webextension-polyfill";
import { supabaseClient } from "./supabase.js";
import {
  captureAndUploadScreenshot,
  setActiveTab,
  attachDebuggerToTab,
  attachContentScriptToIframe,
  dataURLtoBlob,
  captureTab,
} from "./utils.js";
import { stopRecording, recordAction } from "./recording.js";
import { getState, initialState, setState } from "./states.js";
import { codeMap, keyCodeMap, nonTextKeys } from "../utils/constant.js";

/**
 * Background message listeners (cross-webext safe)
 */
export function setupMessageListeners() {
  // Main internal message listener
  webext.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // We call sendResponse asynchronously in many branches -> return true at the end
    const handleCommand = async () => {
      try {
        switch (message.command) {
          // ----------------------------
          case "change-recording-state": {
             setState({ recording: message.recording });
            return { success: true };
          }

          // ----------------------------
          case "ATTACH_IFRAME_SCRIPT": {
            const { frameSrc } = message;
            const tabId = sender?.tab?.id;
            if (!tabId) return { success: false, error: "No tabId" };

            try {
              const result = await attachContentScriptToIframe(tabId, frameSrc);
              return { success: true, result };
            } catch (err) {
              return { success: false, error: err?.message ?? String(err) };
            }
          }

          // ----------------------------
          case "SWITCH_TAB": {
            try {
              const newTabOrder = message.tabOrder;
              const state =  getState();
              const tabs = (state.tabState && state.tabState[state.playbackWindowId]) || [];
              const target = tabs.find((t) => t.tabOrder === newTabOrder);
              if (!target) return { success: false, error: "Target tab not found" };

              const tabId = target.tabId;
              // Update memory state (await getState/setState)
              const upd1 =  setState({ currentPlayTab: tabId });
              // Ensure debugger attached
              await attachDebuggerToTab(tabId);

              // Activate tab (promise-based)
              await webext.tabs.update(tabId, { active: true });
               setActiveTab(( getState()).playbackWindowId, tabId);
              console.log("message rec", newTabOrder);
              await webext.storage.local.set({ tabOrder: newTabOrder });

              // Notify content script in the switched tab
              await webext.tabs.sendMessage(tabId, {
                action: "TAB_SWITCHED",
                tabOrder: newTabOrder,
              });

              return { success: true };
            } catch (e) {
              console.error("switch tab err", e);
              return { success: false, error: e?.message ?? String(e) };
            }
          }

          // ----------------------------
          case "CHECK_DOWNLOAD_STARTED": {
            const state =  getState();
            const started = !!state.lastDownloadStarted;
             setState({ lastDownloadStarted: false });
            return { started };
          }

          // ----------------------------
          case "trustedClick": {
            const { x, y } = message;
            const state =  getState();
            const tabId = sender?.tab?.id ?? state.attachedTabId;
            if (state.isDebuggerAttached && state.attachedTabId === tabId) {
              try {
                const dispatch = (params) =>
                  webext.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", params);

                await dispatch({ type: "mouseMoved", x, y });
                await dispatch({ type: "mousePressed", x, y, button: "left", clickCount: 1 });
                await new Promise((r) => setTimeout(r, 50));
                await dispatch({ type: "mouseReleased", x, y, button: "left", clickCount: 1 });

                return { ok: true, method: "debugger" };
              } catch (err) {
                console.error("Trusted click failed:", err);
                return { ok: false, error: err?.message ?? String(err) };
              }
            } else {
              return { ok: false, error: "Debugger not attached" };
            }
          }

          // ----------------------------
          case "trustedKeyEvent": {
            const { key } = message;
            const state =  getState();
            const tabIdKey = sender?.tab?.id ?? state.attachedTabId;

            if (state.isDebuggerAttached && state.attachedTabId === tabIdKey) {
              try {
                const isNonText = nonTextKeys.includes(key);
                const commonFields = {
                  key,
                  code: codeMap[key] || key,
                  windowsVirtualKeyCode: keyCodeMap[key] || 0,
                };

                // Key down
                await webext.debugger.sendCommand(
                  { tabId: tabIdKey },
                  "Input.dispatchKeyEvent",
                  {
                    type: "keyDown",
                    ...commonFields,
                    ...(isNonText ? {} : { text: key === "Enter" ? "\r" : key }),
                  }
                );

                // Key up
                await webext.debugger.sendCommand(
                  { tabId: tabIdKey },
                  "Input.dispatchKeyEvent",
                  {
                    type: "keyUp",
                    ...commonFields,
                  }
                );

                return { ok: true, method: "debugger" };
              } catch (err) {
                console.error(`Trusted ${key} key failed:`, err);
                return { ok: false, error: err?.message ?? String(err) };
              }
            } else {
              console.warn("Debugger not attached or wrong tab for key event");
              return { ok: false, error: "Debugger not attached" };
            }
          }

          // ----------------------------
          case "pointerdragstart": {
            const { x, y } = message;
            const state =  getState();
            const tabId = sender?.tab?.id ?? state.attachedTabId;
            if (state.isDebuggerAttached && state.attachedTabId === tabId) {
              try {
                // disable scrolling by injecting a style element (id-based so removal is easy)
                await webext.scripting.executeScript({
                  target: { tabId },
                  func: () => {
                    const styleId = "__no_scroll_style__";
                    if (!document.getElementById(styleId)) {
                      const style = document.createElement("style");
                      style.id = styleId;
                      style.textContent = `
                        html, body {
                          overflow: hidden !important;
                          height: 100% !important;
                          touch-action: none !important;
                        }
                      `;
                      document.head.appendChild(style);
                    }
                  },
                });

                // Move pointer to start position
                await webext.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
                  type: "mouseMoved",
                  x,
                  y,
                  button: "left",
                  pointerType: "mouse",
                });

                // Mouse down to begin drag
                await webext.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
                  type: "mousePressed",
                  x,
                  y,
                  button: "left",
                  clickCount: 1,
                  pointerType: "mouse",
                });

                return {
                  ok: true,
                  method: "debugger",
                  message: "Drag started via debugger",
                };
              } catch (err) {
                console.error("Trusted dragstart failed:", err);
                return { ok: false, error: err?.message ?? String(err) };
              }
            } else {
              return { ok: false, error: "Debugger not attached" };
            }
          }

          // ----------------------------
          case "pointerdrop": {
            const { x, y } = message;
            const state =  getState();
            const tabId = sender?.tab?.id ?? state.attachedTabId;
            if (state.isDebuggerAttached && state.attachedTabId === tabId) {
              try {
                // Move to drop position
                await webext.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
                  type: "mouseMoved",
                  x,
                  y,
                  buttons: 1,
                  pointerType: "mouse",
                });

                // Mouse up to drop
                await webext.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
                  type: "mouseReleased",
                  x,
                  y,
                  button: "left",
                  clickCount: 1,
                  pointerType: "mouse",
                });

                // remove injected style (by id) to re-enable scrolling
                await webext.scripting.executeScript({
                  target: { tabId },
                  func: () => {
                    const style = document.getElementById("__no_scroll_style__");
                    if (style && style.parentNode) style.parentNode.removeChild(style);
                  },
                });

                return {
                  ok: true,
                  method: "debugger",
                  message: "Drag dropped successfully",
                };
              } catch (err) {
                console.error("Trusted drop failed:", err);
                return { ok: false, error: err?.message ?? String(err) };
              }
            } else {
              return { ok: false, error: "Debugger not attached" };
            }
          }

          // ----------------------------
          case "trustedHover": {
            const { x, y } = message;
            const state =  getState();
            const tabIdHover = sender?.tab?.id ?? state.attachedTabId;
            if (state.isDebuggerAttached && state.attachedTabId === tabIdHover) {
              try {
                await webext.debugger.sendCommand(
                  { tabId: tabIdHover },
                  "Input.dispatchMouseEvent",
                  {
                    type: "mouseMoved",
                    x,
                    y,
                    pointerType: "mouse",
                  }
                );
                return { ok: true, method: "debugger" };
              } catch (err) {
                console.error("Trusted hover failed:", err);
                return { ok: false, error: err?.message ?? String(err) };
              }
            } else {
              return { ok: false, error: "Debugger not attached" };
            }
          }

          // ----------------------------
          case "stop-recording": {
            await stopRecording();
            return { success: true };
          }

          // ----------------------------
          case "saveTestResults": {
            try {
              const { status, result } = message.data;
              // reset playbackArr
               setState({ playbackArr: [] });

              let fail_screenShot = null;

              const state =  getState();

              if (state.isDebuggerAttached && state.attachedTabId) {
                try {
                  await webext.debugger.detach({ tabId: state.attachedTabId });
                } catch (err) {
                  // ignore errors on detach
                }
                 setState({ attachedTabId: null, isDebuggerAttached: false });
                console.log("Debugger detached after test");
              }

              if (status === "fail") {
                fail_screenShot = await captureAndUploadScreenshot();
              }

              // Upsert into supabase
              const { projectId, moduleId, ...rest } = state.saveTestResult || {};
              const { data, error: upsertError } = await supabaseClient
                .from("test_results")
                .upsert(
                  {
                    ...rest,
                    status,
                    fail_screenShot,
                  },
                  { onConflict: ["test_case"] }
                )
                .select();

              console.log("Upsert response:", { data, upsertError });

              if (upsertError) {
                console.error("Upsert error:", upsertError);
              } else {
                console.log("Upsert success:", data);
              }

              if (data && data.length > 0) {
                const { id, name, test_case } = data[0];
                const newHistoryEntry = {
                  project_id: projectId,
                  test_case_id: test_case,
                  test_result_id: id,
                  module_id: moduleId,
                  name,
                  status,
                  fail_screenshot: fail_screenShot,
                  result,
                };
                const { data: runData, error } = await supabaseClient
                  .from("run_history")
                  .insert(newHistoryEntry)
                  .select();
                if (error) console.error("history insert error", error);
                else console.log("history insert success", runData);
              }

              // Notify React app by finding one allowed host tab
              const allTabs = await webext.tabs.query({});
              const allowedState =  getState();
              const reactAppTab = allTabs.find(
                (tab) =>
                  tab.url && (allowedState.allowedHosts || []).some((host) => tab.url.includes(host))
              );

              if (reactAppTab) {
                try {
                  await webext.scripting.executeScript({
                    target: { tabId: reactAppTab.id },
                    func: () => {
                      window.postMessage({ type: "moduleTestComplete" }, "*");
                    },
                  });
                } catch (e) {
                  console.warn("Failed to notify React app:", e);
                }
              }

              // reset to initial state
               await chrome.windows.remove(getState().playbackWindowId);
               setState(initialState);

              return { status: "processed", message: "Test results received" };
            } catch (e) {
              console.error("Error saving test results:", e);
              return { status: "error", message: e?.message ?? String(e) };
            }
          }

          // ----------------------------
          case "CAPTURE_PAGE": {
            try {
              const tabId = sender?.tab?.id;
              const dataUrl = await captureTab(tabId, message.isBottom);
              return { dataUrl };
            } catch (e) {
              console.error("CAPTURE_PAGE error:", e);
              return { error: e?.message ?? String(e) };
            }
          }

          // ----------------------------
          case "UPLOAD_SCREENSHOT": {
            try {
              const { cropped, rect, isAction } = message;
              const fileName = `capture_${Date.now()}.png`;
              const blob = dataURLtoBlob(cropped);

              const { data, error } = await supabaseClient.storage
                .from("screenshots")
                .upload(fileName, blob, { contentType: "image/png" });

              if (error) {
                console.error("Upload failed:", error);
                return { success: false, error: error.message || String(error) };
              }

              const publicUrl = supabaseClient.storage.from("screenshots").getPublicUrl(fileName).data.publicUrl;

              const savedObj = {
                type: "compareImage",
                description: "Click on Compare Image",
                rect,
                image_url: publicUrl,
              };

              if (isAction) {
                recordAction(savedObj);
              }

              return { url: publicUrl };
            } catch (e) {
              console.error("UPLOAD_SCREENSHOT error:", e);
              return { success: false, error: e?.message ?? String(e) };
            }
          }

          // ----------------------------
          case "recordAction": {
            recordAction({ ...message.action });
            return { status: "recorded" };
          }

          // ----------------------------
          default:
            return { status: "error", message: `Unknown command: ${message.command}` };
        }
      } catch (error) {
        console.error("Error handling command:", error);
        return { status: "error", message: error?.message ?? String(error) };
      }
    };

    // Run handler and respond asynchronously
    handleCommand()
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ status: "error", message: err?.message ?? String(err) }));

    return true; // indicate we will call sendResponse asynchronously
  });

  // External message listener (e.g. native or other extension)
  webext.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {
    try {
      if (message.type === "start-recording") {
        const { url } = message.data;
         setState({
          tabOrder: 1,
          recordedActions: [],
          recording: true,
          testCasePayload: message.data,
        });

        // destructure safely to avoid overriding imported `webext`
        const {  browser: customBrowserSettings } = message.settings || {};
        const recordingWindow = await webext.windows.create({
          url,
          type: "normal",
          state: "maximized",
          focused: true,
          incognito: customBrowserSettings?.incognito || false,
        });

        // ensure tabs exist
        const firstTab = recordingWindow.tabs && recordingWindow.tabs[0];
          getState().recordingTabIds.add(firstTab.id);

              setState({recordingWindowId:recordingWindow.id})

         setState({ recordingWindowId: recordingWindow.id });

        // send response
        return { success: true };
        
        
      } else if (message.type === "runTest") {
        const actions = message.data;
        const testUrl = actions.url;
        const {  browser: customBrowserSettings } = message.projectSetting || {};

         setState({
          tabOrder: 1,
          playbackArr: actions.actions,
          saveTestResult: {
            user_id: message.userId,
            test_case: message.data.id,
            name: message.data.name,
            projectId: message.projectId,
            moduleId: message.moduleId,
          },
        });

        await webext.storage.local.set({
          actions: actions.actions,
          allResults: [],
          currentStep: 0,
        });

        const newWindow = await webext.windows.create({
          url: testUrl,
          type: "normal",
          state: "maximized",
          focused: true,
          incognito: customBrowserSettings?.incognito || false,
        });

         setState({
          currentPlayTab: newWindow.tabs && newWindow.tabs[0] ? newWindow.tabs[0].id : null,
          playbackWindowId: newWindow.id,
        });

        return  { success: true }
        
      } else if (message.type === "check-incognito-mode") {
        try {
          const res = await webext.extension.isAllowedIncognitoAccess();
           

          if (!res) {
            setTimeout(() => {
              // NOTE: opening a chrome:// or webext:// page may fail in some browsers. Adjust id/url per-store.
              webext.tabs.create({
                url: "chrome://extensions/?id=" + (webext.runtime.id || ""),
              }).catch(() => {});
            }, 1000);
          }

          return { success: res };
        } catch (err) {
         
          return { success: false, error: err?.message ?? String(err) };
        }
      } else {
        sendResponse({ success: false, error: "Unknown external message type" });
        return true;
      }
    } catch (error) {
      console.error("External message handler error:", error);
      sendResponse({ success: false, error: error?.message ?? String(error) });
      
    }
  });
}
