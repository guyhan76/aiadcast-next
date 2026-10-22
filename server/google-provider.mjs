import {createPublicKey,verify as verifySignature} from 'node:crypto';
import {ApiFailure} from './generation-service.mjs';
const fail=()=>{throw new ApiFailure('GOOGLE_PROOF_INVALID',401);};
// Fixed Google endpoints only: JWT headers never choose a key URL.
export function googleProvider({clientId,clientSecret,redirectUri,fetchImpl=fetch,now=()=>Date.now()}){
 if(!clientId||!clientSecret)return undefined;
 const redirect=new URL(redirectUri);if(redirect.protocol!=='https:'||redirect.username||redirect.password||redirect.hash)throw Error('GOOGLE_REDIRECT_INVALID');
 let keys=[],until=0;
 async function verifyToken(jwt,nonce){
  if(typeof jwt!=='string'||jwt.length>16000)fail();const parts=jwt.split('.');if(parts.length!==3)fail();
  let h,p;try{h=JSON.parse(Buffer.from(parts[0],'base64url'));p=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{fail();}
  if(h.alg!=='RS256'||typeof h.kid!=='string'||h.kid.length>200||h.jku||h.x5u||h.crit)fail();
  if(now()>=until||!keys.some(k=>k.kid===h.kid)){
   const r=await fetchImpl('https://www.googleapis.com/oauth2/v3/certs',{redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)fail();
   const data=await r.json();if(!Array.isArray(data.keys)||data.keys.length>20)fail();keys=data.keys;until=now()+300000;
  }
  const key=keys.find(k=>k.kid===h.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));if(!key)fail();
  try{if(!verifySignature('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))fail();}catch{fail();}
  const time=now()/1000;
  if(!['https://accounts.google.com','accounts.google.com'].includes(p.iss)||p.aud!==clientId||(p.azp!==undefined&&p.azp!==clientId)||!Number.isFinite(p.exp)||p.exp<=time||!Number.isFinite(p.iat)||p.iat>time+60||time-p.iat>600||(p.nbf!==undefined&&(!Number.isFinite(p.nbf)||p.nbf>time+60))||p.nonce!==nonce||typeof p.sub!=='string'||!p.sub.length||p.sub.length>255||p.email_verified!==true||typeof p.email!=='string'||p.email.length>254||!/^\S+@\S+\.\S+$/.test(p.email))fail();
  return {subject:p.sub,email:p.email.toLowerCase()};
 }
 return {clientId,redirectUri,async exchange(code,verifier,nonce){
  if(typeof code!=='string'||!code.length||code.length>4096)fail();
  const r=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,code_verifier:verifier}).toString()});
  if(!r.ok)fail();const result=await r.json();return verifyToken(result.id_token,nonce);
 }};
}
