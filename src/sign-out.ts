import {apiRequest,ApiRequestFailure} from './generation-client';
import {betaSession,setBetaSession} from './beta-session';
let pending:Promise<void>|undefined;
// A lost response leaves local authentication intact until a retry confirms expiry.
export function signOut(preserve:()=>Promise<void>,returnPage='login'){
 if(pending)return pending;
 const token=betaSession()?.token;
 const task=(async()=>{
  await preserve();
  if(betaSession()?.token!==token)throw Error('SESSION_CHANGED');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{await apiRequest('/api/auth/logout',{},controller.signal);}
  catch(error){if(!(error instanceof ApiRequestFailure)||error.status!==401)throw error;}
  finally{clearTimeout(timer);}
  if(betaSession()?.token!==token)throw Error('SESSION_CHANGED');
  setBetaSession(null,returnPage);
 })();
 const result=task.finally(()=>{if(pending===result)pending=undefined;});pending=result;return result;
}
