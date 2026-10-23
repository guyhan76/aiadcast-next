import {googleProvider} from './google-provider.mjs';
import {readFileSync} from 'node:fs';
import {ApiFailure} from './generation-service.mjs';
const fail=(code,status=503)=>{throw new ApiFailure(code,status);};
export function resendMailer({apiKey,from,fetchImpl=fetch}){
 if(!apiKey||typeof from!=='string'||!from.includes('@')||/[\r\n]/.test(from))return undefined;
 return async({email,url,id})=>{
  const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15_000),headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':'email-'+id},body:JSON.stringify({from,to:[email],subject:'Verify your email for aiadcast',text:`Did you request to sign in to aiadcast?\n\nOpen the link below to verify your email, then return to the app or tab where you requested it to finish signing in. This link expires in 10 minutes.\n${url}\n\nIf you did not request this, ignore this email.`})});
  if(!response.ok)fail('EMAIL_SEND_FAILED');
  const result=await response.json();if(typeof result.id!=='string')fail('EMAIL_SEND_FAILED');
 };
}
export class TossTestProvider {
 constructor({secretKey,fetchImpl=fetch}){
  // Never accept a production key in the test payment path.
  if(typeof secretKey!=='string'||!/^test_sk_[A-Za-z0-9_-]+$/.test(secretKey))throw Error('TOSS_TEST_KEY_REQUIRED');
  this.authorization='Basic '+Buffer.from(secretKey+':').toString('base64');this.fetch=fetchImpl;
 }
 async call(path,body,idempotencyKey){
  let response;try{response=await this.fetch('https://api.tosspayments.com'+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15_000),headers:{Authorization:this.authorization,...(body?{'Content-Type':'application/json','Idempotency-Key':idempotencyKey}:{})},...(body?{body:JSON.stringify(body)}:{})});}catch{fail('PAYMENT_UNCERTAIN');}
  if(!response.ok){if(response.status===404)fail('PAYMENT_NOT_FOUND',404);fail('PAYMENT_UNCERTAIN');}
  try{return await response.json();}catch{fail('PAYMENT_UNCERTAIN');}
 }
 confirm({paymentKey,orderId,amount}){return this.call('/v1/payments/confirm',{paymentKey,orderId,amount},orderId);}
 lookup(orderId){return this.call('/v1/payments/orders/'+encodeURIComponent(orderId));}
}
export function accountConfiguration(env=process.env){
 const emailEnabled=env.AIADCAST_EMAIL_ENABLED==='true';
 const email=emailEnabled?resendMailer({apiKey:env.AIADCAST_RESEND_API_KEY,from:env.AIADCAST_EMAIL_FROM}):undefined;
 const clientKey=env.AIADCAST_TOSS_TEST_CLIENT_KEY??'';
 const paymentEnabled=env.AIADCAST_TOSS_TEST_ENABLED==='true';
 if(paymentEnabled&&!/^test_ck_[A-Za-z0-9_-]+$/.test(clientKey))throw Error('TOSS_TEST_CLIENT_KEY_REQUIRED');
 return {google:env.AIADCAST_GOOGLE_ENABLED==='true'?googleProvider({clientId:env.AIADCAST_GOOGLE_CLIENT_ID,clientSecret:env.AIADCAST_GOOGLE_CLIENT_SECRET,redirectUri:(env.AIADCAST_BETA_PUBLIC_ORIGIN??'')+'/?google=1'}):undefined,sendMail:email,password:{enabled:env.AIADCAST_TEST_AUTH_ENABLED===undefined?!emailEnabled:env.AIADCAST_TEST_AUTH_ENABLED==='true',adminEmail:env.AIADCAST_TEST_ADMIN_EMAIL??'selluplabs@gmail.com',adminPassword:env.AIADCAST_TEST_ADMIN_PASSWORD},clientKey:paymentEnabled?clientKey:null,provider:paymentEnabled?new TossTestProvider({secretKey:env.AIADCAST_TOSS_TEST_SECRET_KEY_FILE?readFileSync(env.AIADCAST_TOSS_TEST_SECRET_KEY_FILE,'utf8').trim():env.AIADCAST_TOSS_TEST_SECRET_KEY}):undefined};
}

