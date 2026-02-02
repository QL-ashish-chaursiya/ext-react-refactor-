//background.recording.js
  import webext from 'webextension-polyfill';
import { getState, initialState, setState, state } from './states.js';
import { NAVIGATE_TYPES } from '../utils/constant.js';
import { getCurrentActiveTabOrder, getSupaBaseClient } from './utils.js';
import { encryptPassword } from '../utils/helper.js';

 export async function stopRecording() {
  const state =  getState();
 const userId = state.testCasePayload?.user_id
  if (!state.recordingWindowId) return;

  
  const updatedActions = await Promise.all(
    (state.recordedActions || []).map(async (act) => {
      if (act.isPassword && act.type === 'change') {
        const passKey = await encryptPassword(act.value || '',userId);

        return {
          ...act,
          passKey,
          value: '*****',
          element: {
            ...act.element,
            value: '*****'
          },
          description:"Enter ***** in Password"
        };
      }

      return act;
    })
  );

  const payload = {
    ...state.testCasePayload,
    actions: updatedActions
  };
const spClient = getSupaBaseClient()
  try {
    const { error } = await  spClient
      .from('test_cases')
      .insert(payload);

    if (error) console.error('error', error);
  } catch (e) {
    console.error('Failed to save test case:', e);
  }

  try {
    await webext.windows.remove(state.recordingWindowId);
     setState(initialState);
  } catch (e) {
    console.warn('Window already closed or failed:', e);
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