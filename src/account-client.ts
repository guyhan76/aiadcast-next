import {apiRequest,ApiRequestFailure} from './generation-client';
import type {BetaSession} from './beta-session';
export type Capabilities={email:{enabled:boolean};password?:{enabled:boolean;test:true;adminReady:boolean;adminEmail:string};checkout:{enabled:boolean;test:true;currency:'KRW'}};
export type EmailRequest={requestId:string;pollToken:string;expires:number};
export type TestOrder={id:string;pack:string;credits:number;amount:number;currency:'KRW';state:'pending'|'verified'|'paid'|'canceled';created:number;test:true;checkoutUrl?:string};
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
 AUTH_RATE_LIMIT:['로그인 시도가 많습니다. 10분 후 다시 시도해주세요.','Too many sign-in attempts. Try again in 10 minutes.'],
 INVALID_CREDENTIALS:['이메일과 비밀번호를 확인해주세요.','Check your email and password.'],
 INVALID_PASSWORD:['비밀번호는 8~128자로 입력해주세요.','Use a password between 8 and 128 characters.'],
 INVALID_EMAIL:['이메일 주소를 확인해주세요.','Check your email address.'],
 ACCOUNT_EXISTS:['이미 가입된 계정입니다. 로그인해주세요.','This account already exists. Please sign in.'],
 ADMIN_LOGIN_REQUIRED:['관리자 계정은 관리자 로그인을 이용해주세요.','Use administrator sign-in for this account.'],
 TEST_AUTH_UNAVAILABLE:['테스트 가입·로그인이 현재 비활성화되어 있습니다.','Test registration and sign-in are currently disabled.'],
  EMAIL_LINK_INVALID:['인증 링크가 만료되었습니다. 원래 화면에서 다시 요청해주세요.','This link expired. Request a new email on your original device.'],
  EMAIL_REQUEST_INVALID:['인증 시간이 지났습니다. 인증메일을 다시 받아주세요.','Verification expired. Request a new email.'],
  BETA_ALLOCATION_EXCEEDED:['현재 테스트 참여 인원이 찼습니다.','The private test is currently full.'],
  AUTH_REQUIRED:['다시 로그인해주세요. 작성한 광고는 유지됩니다.','Please sign in again. Your ad is kept.'],
  ORDER_EXPIRED:['결제창이 만료되었습니다. 앱에서 이용권을 다시 선택해주세요.','Checkout expired. Select your credits again in the app.'],
  PAYMENT_UNCERTAIN:['결제 상태를 확인 중입니다. 다시 결제하지 말고 상태를 확인해주세요.','Payment status is uncertain. Check the status before paying again.'],
  DEMO_DECLINED:['체험 결제를 실패 처리했습니다. 이용권은 추가되지 않았습니다.','Simulated checkout failed. No credits were added.'],
  PAYMENT_MISMATCH:['결제 정보를 확인하지 못했습니다. 이용권은 추가되지 않았습니다.','Payment details did not match. No credits were added.'],
 };
 return messages[code]?.[ko?0:1]??(ko?'연결하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해주세요.':'Could not connect. Your input is kept. Please try again.');
}
export function readSession<T>(key:string):T|undefined{try{return JSON.parse(sessionStorage.getItem(key)??'null')??undefined;}catch{return undefined;}}

