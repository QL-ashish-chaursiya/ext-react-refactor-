//background.recording.js
import { supabaseClient } from './supabase.js';
import { getState, setState, state } from './states.js';
import { NAVIGATE_TYPES } from '../utils/constant.js';
import { getCurrentActiveTabOrder } from './utils.js';

export async function stopRecording() {
  
  if (getState().recordingWindowId) {
      
    let payload =  {
      ...getState().testCasePayload,
      actions: getState().recordedActions
    }
    try {
      
      const { data, error } = await supabaseClient.from('test_cases').insert(payload).select();
      
      if (error) console.log('error', error);
    } catch (e) {
      console.error('Failed to save test case:', e);
    }

    try {
      await chrome.windows.remove(getState().recordingWindowId);
     setState(state)
    } catch (e) {
      console.warn('Window already closed or failed:', e);
    }

    
  }
}

export function recordAction(action) {
  const { recording } = getState();
  console.log("action",action)
  console.log("recording", recording)
  
  const isNavigate  =  NAVIGATE_TYPES.includes(action.type)
  const actionLength = getState().recordedActions?.length
  if(isNavigate && actionLength>0){
    
const prevType =  getState().recordedActions[actionLength - 1].type
 if(prevType=='navigate' && action.type=='navigate'){
  return
 } else if(prevType=='System_Navigate'){
  getState().recordedActions[actionLength - 1].url = action.url;
  getState().recordedActions[actionLength - 1].description = `Navigated to ${action.url}`;
  
  return
 }
  }
   
  
  action.sequence = getState().recordedActions.length + 1;
  action.tabOrder = getCurrentActiveTabOrder(getState().recordingWindowId)
  action.changeTab = getState().recordedActions?.length && getState().recordedActions[getState().recordedActions.length - 1].tabOrder==getCurrentActiveTabOrder(getState().recordingWindowId) ? false :true
  getState().recordedActions.push(action)
   
   
}