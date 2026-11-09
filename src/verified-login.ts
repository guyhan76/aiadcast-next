import {apiIdentity} from './api-origin';
import {betaSession,setBetaSession,type BetaSession} from './beta-session';

// Only a just-completed, proof-bound server login may skip the redundant GET.
// This receipt is memory-only: reloads, expiry, logout and account/server changes
// must still validate stored credentials. It grants no server authorization.
let receipt:{session:string;origin:string;until:number}|undefined;
window.addEventListener('aiadcast-session-change',()=>{receipt=undefined;});
export function installVerifiedLogin(session:BetaSession,returnPage:string){
 if(!session||!/^[A-Za-z0-9_-]{43}$/.test(session.token)||!Number.isFinite(session.expires)||session.expires<=Date.now()||!/^[A-Za-z0-9_-]{8,100}$/.test(session.user?.id)||typeof session.user?.label!=='string')throw Error('INVALID_AUTH_RESPONSE');
 setBetaSession(session,returnPage);
 receipt={session:JSON.stringify(betaSession()),origin:apiIdentity(),until:Math.min(session.expires,Date.now()+30_000)};
}
export function hasVerifiedLogin(){
 const session=betaSession();
 return !!session&&!!receipt&&receipt.until>Date.now()&&receipt.origin===apiIdentity()&&receipt.session===JSON.stringify(session);
}
