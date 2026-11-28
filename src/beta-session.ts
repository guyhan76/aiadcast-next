import {apiIdentity,configuredApiOrigin} from './api-origin';
export type BetaSession={token:string;expires:number;user:{id:string;label:string;role?:'member'|'admin'};origin?:string};
const key='aiadcast.beta-session';
export function betaSession():BetaSession|null {try{const s=JSON.parse(sessionStorage.getItem(key)??'null');return s&&/^[A-Za-z0-9_-]{43}$/.test(s.token)&&/^[A-Za-z0-9_-]{8,100}$/.test(s.user?.id)&&typeof s.user.label==='string'&&Number.isFinite(s.expires)&&s.expires>Date.now()&&(s.origin?s.origin===apiIdentity():!configuredApiOrigin())?s:null;}catch{return null;}}
export function setBetaSession(s:BetaSession|null,returnPage='home'){if(s)sessionStorage.setItem(key,JSON.stringify({...s,origin:apiIdentity()}));else sessionStorage.removeItem(key);window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage}}));}
export function accountNamespace(id:string){const origin=apiIdentity()==='local-demo://device'?'local-demo://device':configuredApiOrigin();return origin?id+'@'+encodeURIComponent(origin):id;}
export function storageNamespace(){const s=betaSession();return s?accountNamespace(s.user.id):'guest';}


// Expiration is local UI invalidation, not a server logout or data deletion.
export function watchSessionExpiry(onExpired:()=>void){
 let timer:ReturnType<typeof setTimeout>|undefined;
 const check=()=>{
  clearTimeout(timer);
  const session=betaSession();
  if(!session){onExpired();return;}
  timer=setTimeout(check,Math.min(2147483647,Math.max(1,session.expires-Date.now())));
 };
 check();window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
 return()=>{clearTimeout(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
}
