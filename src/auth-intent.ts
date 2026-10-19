import {apiIdentity} from './api-origin';
export const protectedRoutes=['create','projects','studio','editor'] as const;
export type ProtectedRoute=typeof protectedRoutes[number];
const key='aiadcast.login-intent.v1';
export function loginIntent():{route:ProtectedRoute;back:string}|null{try{const v=JSON.parse(sessionStorage.getItem(key)??'null');return v&&v.origin===apiIdentity()&&protectedRoutes.includes(v.route)&&['home','portfolio','guide','credits'].includes(v.back)?v:null;}catch{return null;}}
export function rememberLogin(route:ProtectedRoute,back='home'){sessionStorage.setItem(key,JSON.stringify({route,back,origin:apiIdentity()}));}
export function requestLogin(route:ProtectedRoute,back='home'){rememberLogin(route,back);location.hash='login';}
export function clearLoginIntent(){sessionStorage.removeItem(key);}
export function loginDestination(fallback:string){const intent=loginIntent();clearLoginIntent();return ['checkout','checkout-return'].includes(fallback)?fallback:intent?.route??fallback;}
export function accountBack(fallback:string){return loginIntent()?.back??fallback;}
