//background.handler.js
 
import { supabaseClient } from './supabase.js';
import { captureAndUploadScreenshot } from './utils.js';
import { stopRecording, recordAction } from './recording.js';
import { getState, setState } from './states.js';
// using getState().allowedHosts

export function setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const handleCommand = async () => {
          try {
            switch (message.command) {
               case "change-recording-state":
               
               setState({recording:message.recording})
              
                return sendResponse({ success: true });
                 
                 case "CHECK_DOWNLOAD_STARTED":
                  sendResponse({ started: getState().lastDownloadStarted });
                  setState({ lastDownloadStarted:false})
                  return true
                case 'trustedClick': {
                  const { x, y } = message;
                  const tabId = sender.tab.id || getState().attachedTabId;
                
                  if (getState().isDebuggerAttached && getState().attachedTabId === tabId) {
                    // Use debugger
                    const dispatch = (params) =>
                      chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", params);
                    try {
                      await dispatch({ type: "mouseMoved", x, y });
                      await dispatch({ type: "mousePressed", x, y, button: "left", clickCount: 1 });
                      await new Promise(r => setTimeout(r, 50));
                      await dispatch({ type: "mouseReleased", x, y, button: "left", clickCount: 1 });
                      sendResponse({ ok: true, method: 'debugger' });
                    } catch (err) {
                      console.error("Trusted click failed:", err);
                      sendResponse({ ok: false, error: err.message });
                    }
                  } 
                  
                  return true;
                }
                
                case 'trustedHover':
                  const tabIdHover = sender.tab.id || getState().attachedTabId;
                  if (getState().isDebuggerAttached && getState().attachedTabId === tabIdHover) {
                    try {
                      await chrome.debugger.sendCommand({ tabId: tabIdHover }, "Input.dispatchMouseEvent", {
                        type: "mouseMoved",
                        x: message.x,
                        y: message.y,
                        pointerType: "mouse"
                      });
                      sendResponse({ ok: true, method: 'debugger' });
                    } catch (err) {
                      console.error("Trusted hover failed:", err);
                      sendResponse({ ok: false, error: err.message });
                    }
                  } 
                  
                  return true;
                  
              case 'stop-recording':
                 
                await stopRecording();
                return sendResponse({ success: true });
                
                case 'saveTestResults':
                  try {
                    const { status, result } = message.data;
                     setState({ playbackArr:[]})
                    let fail_screenShot = null
                    let reason = null
                
                    if (getState().isDebuggerAttached && getState().attachedTabId) {
                      await new Promise((resolve) => {
                        chrome.debugger.detach({ tabId: getState().attachedTabId }, () => {
                          setState({ attachedTabId:null,isDebuggerAttached:false})
                          console.log("Debugger detached after test");
                          resolve();
                        });
                      });
                    }
                
                   
                
                    if (status === 'fail') {
                      fail_screenShot = await captureAndUploadScreenshot();
                       
                    }
                
                    
                
                    
                
                    
                
                    // 🔎 Try upsert
                    const {projectId,moduleId,...rest} = getState().saveTestResult
                    const { data, error: upsertError } = await supabaseClient
                      .from("test_results")
                      .upsert(
                        {
                          ...rest,
                          status,
                          fail_screenShot: fail_screenShot,
                         
                        },
                        { onConflict: ["test_case"] }
                      )
                      .select(); // ensures Supabase returns saved row
                
                    console.log("Upsert response:", { data, upsertError });
                
                    if (upsertError) {
                      console.error("Upsert error:", upsertError);
                    } else {
                      console.log("Upsert success:", data);
                    }
                   
                    if(data && data?.length>0){
                      const {id,name,test_case} = data[0]
                      const  newHistoryEntry =  {
                        project_id:projectId,        
                        test_case_id:test_case,      
                        test_result_id:id,  
                        module_id:moduleId,  
                        name,               
                        status,             
                        fail_screenshot:fail_screenShot,    
                        result              
                      }
                      const { data:runData, error } = await supabaseClient.from('run_history').insert(newHistoryEntry).select()
                      console.log("history error", newHistoryEntry)
                    }
                    
                    // Notify React app
                    const tabs = await chrome.tabs.query({});
                    const reactAppTab = tabs.find(tab => 
                      tab.url && getState().allowedHosts.some(host => tab.url.includes(host))
                    );
                
                    if (reactAppTab) {
                      
                      try {
                        await chrome.scripting.executeScript({
                          target: { tabId: reactAppTab.id },
                          func: () => {
                            window.postMessage({ type: 'moduleTestComplete', }, '*');
                          },
                        });
                      } catch (e) {
                        console.warn('Failed to notify React app:', e);
                      }
                    }
                
                        await chrome.windows.remove(getState().playbackWindowId);
                    console.log('Test window closed automatically');
                    setState({playbackWindowId:null,currentPlayTab:null,tabOrder: null})
                
                    return sendResponse({ status: 'processed', message: 'Test results received' });
                
                  } catch (e) {
                    console.error("Error saving test results:", e);
                  }
                
               
      
              case 'recordAction':
                
                recordAction({ ...message.action, tabOrder: getState().tabOrder });
                return { status: 'recorded' }; 
                
              default:
                throw new Error(`Unknown command: ${message.command}`);
            }
          } catch (error) {
            console.error('Error handling command:', error);
            throw error;
          }
        };
      
        handleCommand()
          .then(sendResponse)
          .catch(error => {
            sendResponse({ status: 'error', message: error.message });
          });
      
        return true;
      });

      chrome.runtime.onMessageExternal.addListener(
        async function(message, sender, sendResponse) {
          try {
            if(message.type=='start-recording'){
              // Initialize tabOrder to 1 for the first tab
               
              
             
              const { url } = message.data;
              
              setState({tabOrder:1,recordedActions:[],recording:true,testCasePayload:message.data})
              const {browser,variables} = message.settings
              const recordingWindow = await chrome.windows.create({
                url,
                type: "normal",
                state: "maximized",
                focused: true,
                incognito: browser?.incognito || false
              });
                    
             
              const firstTab = recordingWindow.tabs[0];
              getState().recordingTabIds.add(firstTab.id);

              setState({recordingWindowId:recordingWindow.id})
              console.log("Recording started - Initial tabOrder:", getState().tabOrder);
              
              
              return sendResponse({ success: true });
      
            } else if (message.type === 'runTest') {
              // Initialize tabOrder to 1 for the first tab
              
              const actions = message.data;
              const testUrl = actions.url;
              console.log("test url", testUrl)
              const {browser} = message.projectSetting
            
              setState({tabOrder:1,playbackArr:actions.actions,saveTestResult:{user_id: message.userId, test_case: message.data.id,name: message.data.name,projectId:message.projectId,moduleId:message.moduleId}})
              await chrome.storage.local.set({ 
                actions: actions.actions,
                allResults: [],
                currentStep: 0
              });
            
              const newWindow = await chrome.windows.create({
                url: testUrl,
                type: "normal",
                state: "maximized",
                focused: true,
                 incognito: browser?.incognito || false 
              });
            
               
              setState({currentPlayTab:newWindow.tabs[0].id,playbackWindowId:newWindow.id})
              
              console.log("Playback started - Initial tabOrder:", getState().tabOrder);
              return sendResponse({ success: true });
            } else if(message.type==='check-incognito-mode'){
              let res = await chrome.extension.isAllowedIncognitoAccess()
               
                sendResponse({ success: res });
                setTimeout(() => {
                  chrome.tabs.create({
                    url: "chrome://extensions/?id=gdlneolfhnjeddfbchnfnlmmnnnofemc",
                  });
                }, 1000);
              return
            }
          } catch (error) {
            console.error('External message handler error:', error);
            sendResponse({ success: false, error: error.message });
          }
        }
      );
}