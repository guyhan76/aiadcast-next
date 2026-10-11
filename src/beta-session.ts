import {apiIdentity,configuredApiOrigin} from './api-origin';
export type BetaSession={token:string;expires:number;user:{id:string;label:string};origin?:string};
const key='aiadcast.beta-session';
export function betaSession():BetaSession|null {try{const s=JSON.parse(sessionStorage.getItem(key)??'null');return s&&/^[A-Za-z0-9_-]{43}$/.test(s.token)&&/^[A-Za-z0-9_-]{8,100}$/.test(s.user?.id)&&typeof s.user.label==='string'&&Number.isFinite(s.expires)&&(s.origin?s.origin===apiIdentity():!configuredApiOrigin())?s:null;}catch{return null;}}
export function setBetaSession(s:BetaSession|null,returnPage='home'){if(s)sessionStorage.setItem(key,JSON.stringify({...s,origin:apiIdentity()}));else sessionStorage.removeItem(key);window.dispatchEvent(new CustomEvent('aiadcast-session-change',{detail:{returnPage}}));}
export function accountNamespace(id:string){const origin=apiIdentity()==='local-demo://device'?'local-demo://device':configuredApiOrigin();return origin?id+'@'+encodeURIComponent(origin):id;}
export function storageNamespace(){const s=betaSession();return s?accountNamespace(s.user.id):'guest';}

