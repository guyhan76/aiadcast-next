import {configuredApiOrigin} from './api-origin';
import {betaSession} from './beta-session';
export type NativeGoogleFlow={native:true;state:string;proof:string;expires:number;origin:string;owner:string};
type Host=Window&{AiadcastNative?:{postMessage:(s:string)=>void};__AIADCAST_GOOGLE_NATIVE__?:{version:number;packageId:string;pending?:NativeGoogleFlow}};
const host=()=>window as Host;
export function nativeGooglePackage(){const h=host(),p=h.__AIADCAST_GOOGLE_NATIVE__;return h.AiadcastNative&&p?.version===1&&/^com\.selluplabs\.aiadcast\.next(?:\.(?:demo|dev|preview))?$/.test(p.packageId)&&configuredApiOrigin()?p.packageId:undefined;}
export function nativeGoogleClear(state?:string){if(state)host().AiadcastNative?.postMessage(JSON.stringify({type:'google-sign-in-clear',state}));}
export function nativeGoogleRestore():NativeGoogleFlow|undefined {
 if(!nativeGooglePackage())return;
 let f:NativeGoogleFlow|undefined;try{f=JSON.parse(sessionStorage.getItem('aiadcast.google-flow')??'null')??host().__AIADCAST_GOOGLE_NATIVE__?.pending;}catch{return;}
 if(!f?.native)return;
 if(!/^[A-Za-z0-9_-]{43}$/.test(f.state)||!/^[A-Za-z0-9_-]{43}$/.test(f.proof)||f.expires<=Date.now()||f.origin!==configuredApiOrigin()||f.owner!==(betaSession()?.user.id??'guest')){nativeGoogleClear(f.state);sessionStorage.removeItem('aiadcast.google-flow');return;}
 sessionStorage.setItem('aiadcast.google-flow',JSON.stringify(f));return f;
}
export function nativeGoogleOpen(flow:{state:string;proof:string;expires:number;url:string}){
 if(!nativeGooglePackage())throw Error('GOOGLE_NATIVE_UNAVAILABLE');
 const pending:NativeGoogleFlow={...flow,native:true,origin:configuredApiOrigin(),owner:betaSession()?.user.id??'guest'};
 sessionStorage.setItem('aiadcast.google-flow',JSON.stringify(pending));host().AiadcastNative!.postMessage(JSON.stringify({...pending,type:'google-sign-in'}));return pending;
}
