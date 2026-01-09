//background.recording.js
  import webext from 'webextension-polyfill';
import { supabaseClient } from './supabase.js';
import { getState, initialState, setState, state } from './states.js';
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
      await  webext.windows.remove(getState().recordingWindowId);
     setState(initialState)
    } catch (e) {
      console.warn('Window already closed or failed:', e);
    }

    
  }
}

export async function recordAction(action) {
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
  action.tabOrder = await getCurrentActiveTabOrder()
  getState().recordedActions.push(action)
   
   
}