import {apiRequest,ApiRequestFailure} from './generation-client';
import type {BetaSession} from './beta-session';
export type Capabilities={email:{enabled:boolean};checkout:{enabled:boolean;test:true;currency:'KRW'}};
export type EmailRequest={requestId:string;pollToken:string;expires:number};
export type TestOrder={id:string;pack:string;credits:number;amount:number;currency:'KRW';state:'pending'|'verified'|'paid';created:number;test:true;checkoutUrl?:string};
const exchanges=new Map<string,Promise<{state:'pending'|'verified';session?:BetaSession}>>();
export function exchangeEmail(request:EmailRequest){
 let p=exchanges.get(request.requestId);
 if(!p){p=apiRequest<{state:'pending'|'verified';session?:BetaSession}>('/api/auth/email/exchange',request);exchanges.set(request.requestId,p);void p.then(result=>{if(result.state==='pending')exchanges.delete(request.requestId);},()=>exchanges.delete(request.requestId));}
 return p;
}
export function accountError(error:unknown,ko:boolean){
 const code=error instanceof ApiRequestFailure?error.code:'';
 const messages:Record<string,[string,string]>={
  EMAIL_RATE_LIMIT:['잠시 후 다시 요청해주세요.','Please wait before requesting another email.'],
  RATE_LIMITED:['잠시 후 다시 시도해주세요.','Please try again shortly.'],
  EMAIL_LINK_INVALID:['인증 링크가 만료되었습니다. 원래 화면에서 다시 요청해주세요.','This link expired. Request a new email on your original device.'],
  EMAIL_REQUEST_INVALID:['인증 시간이 지났습니다. 인증메일을 다시 받아주세요.','Verification expired. Request a new email.'],
  BETA_ALLOCATION_EXCEEDED:['현재 테스트 참여 인원이 찼습니다.','The private test is currently full.'],
  AUTH_REQUIRED:['다시 로그인해주세요. 작성한 광고는 유지됩니다.','Please sign in again. Your ad is kept.'],
  ORDER_EXPIRED:['결제창이 만료되었습니다. 앱에서 이용권을 다시 선택해주세요.','Checkout expired. Select your credits again in the app.'],
  PAYMENT_UNCERTAIN:['결제 상태를 확인 중입니다. 다시 결제하지 말고 상태를 확인해주세요.','Payment status is uncertain. Check the status before paying again.'],
  PAYMENT_MISMATCH:['결제 정보를 확인하지 못했습니다. 이용권은 추가되지 않았습니다.','Payment details did not match. No credits were added.'],
 };
 return messages[code]?.[ko?0:1]??(ko?'연결하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해주세요.':'Could not connect. Your input is kept. Please try again.');
}
export function readSession<T>(key:string):T|undefined{try{return JSON.parse(sessionStorage.getItem(key)??'null')??undefined;}catch{return undefined;}}
