import {apiRequest} from './generation-client';
import {setBetaSession} from './beta-session';
import {signInBoundary} from './sign-in-boundary';
let pending:Promise<void>|undefined;
export class SignOutPreservationFailure extends Error {
 constructor(){super('WORKSPACE_PRESERVE_FAILED');}
}
// Local sign-out must work while offline or while the free server is asleep.
// Keep work first; then remove this device's token and attempt revocation once.
// Remote revocation is best effort, never a claim that all sessions were revoked.
export function signOut(preserve:()=>Promise<void>,returnPage='login'){
 if(pending)return pending;
 const guard=signInBoundary();
 const task=(async()=>{
  try{await preserve();}catch{throw new SignOutPreservationFailure();}
  guard();
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  // apiRequest captures the current credential synchronously. Its response
  // boundary cannot clear or replace a newer account after we leave this one.
  void apiRequest('/api/auth/logout',{},controller.signal).catch(()=>{}).finally(()=>clearTimeout(timer));
  setBetaSession(null,returnPage);
 })();
 const result=task.finally(()=>{if(pending===result)pending=undefined;});pending=result;return result;
}
