import {apiIdentity} from './api-origin';
import {betaSession} from './beta-session';
import type {TestOrder} from './account-client';
export const DEMO_CHECKOUT_RETURN='aiadcast-demo://checkout/return';
const key='aiadcast.checkout-continuation';
export type Continuation={orderId:string;userId:string;origin:string;route:'create'|'studio'|'editor';created:number};
export function rememberCheckout(order:TestOrder,route:string){
 const user=betaSession()?.user;if(!user)throw Error('AUTH_REQUIRED');
 const value:Continuation={orderId:order.id,userId:user.id,origin:apiIdentity(),route:route==='studio'||route==='editor'?route:'create',created:Date.now()};
 localStorage.setItem(key,JSON.stringify(value));
}
export function checkoutContinuation():Continuation|undefined{
 try{const v=JSON.parse(localStorage.getItem(key)??'null');if(v&&/^[A-Za-z0-9_-]{8,100}$/.test(v.orderId)&&/^[A-Za-z0-9_-]{8,100}$/.test(v.userId)&&v.origin===apiIdentity()&&['create','studio','editor'].includes(v.route)&&Number.isFinite(v.created)&&v.created<=Date.now()&&Date.now()-v.created<86400000)return v;}catch{/* No unverified navigation. */}
}
export function verifiedReceipt(order:TestOrder){return order.state==='paid'&&order.receipt?.verified===true&&order.receipt.grantedCredits===order.credits&&Number.isSafeInteger(order.credits)&&order.credits>0&&Number.isSafeInteger(order.receipt.balance)&&order.receipt.balance>=0;}
