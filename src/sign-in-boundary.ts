import {apiIdentity} from './api-origin';
import {betaSession} from './beta-session';
let version=0;
window.addEventListener('aiadcast-session-change',()=>{version++;});
// Capture before the first await; a guest->account->guest transition also cancels.
export function signInBoundary(){
 const start=version,origin=apiIdentity(),token=betaSession()?.token;
 return ()=>{if(start!==version||origin!==apiIdentity()||token!==betaSession()?.token)throw Error('SESSION_CHANGED');};
}
