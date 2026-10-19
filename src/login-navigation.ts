import {apiIdentity} from './api-origin';
import {checkoutContinuation} from './checkout-return';
const key='aiadcast.login-destination';
type Destination='checkout'|'checkout-return';
export function clearLoginDestination(){
 sessionStorage.removeItem(key);
 sessionStorage.removeItem('aiadcast.auth-return');
 sessionStorage.removeItem('aiadcast.checkout-login-return');
}
// Only explicit payment actions may override the normal post-login home route.
export function rememberLoginDestination(target:Destination){
 clearLoginDestination();sessionStorage.setItem(key,JSON.stringify({target,origin:apiIdentity(),created:Date.now()}));
}
export function consumeLoginDestination():Destination|'home'{
 const raw=sessionStorage.getItem(key);clearLoginDestination();
 try{const v=JSON.parse(raw??'null');if(v?.origin===apiIdentity()&&Number.isFinite(v.created)&&v.created<=Date.now()&&Date.now()-v.created<15*60000){
  if(v.target==='checkout')return 'checkout';
  if(v.target==='checkout-return'&&checkoutContinuation())return 'checkout-return';
 }}catch{/* Invalid or obsolete navigation hints never select a login destination. */}
 return 'home';
}
