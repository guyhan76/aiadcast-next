import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {ApiFailure} from '../generation-service.mjs';

// Bind the encrypted payout destination to its case. Lists contain only the bank and last four digits.
export function casePayout(secret){
 const key=typeof secret==='string'&&/^[a-f0-9]{64}$/i.test(secret)?Buffer.from(secret,'hex'):null;
 function requireKey(){if(!key)throw new ApiFailure('CASE_PAYOUT_UNAVAILABLE',503);return key;}
 return {
  available:!!key,
  seal(id,bank){
   const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',requireKey(),iv);
   cipher.setAAD(Buffer.from(id));
   const bytes=Buffer.concat([cipher.update(JSON.stringify(bank),'utf8'),cipher.final()]);
   return [iv,cipher.getAuthTag(),bytes].map(b=>b.toString('base64')).join('.');
  },
  open(id,secret){
   const [iv,tag,bytes]=secret.split('.').map(s=>Buffer.from(s,'base64'));
   const cipher=createDecipheriv('aes-256-gcm',requireKey(),iv);
   cipher.setAAD(Buffer.from(id));cipher.setAuthTag(tag);
   return JSON.parse(Buffer.concat([cipher.update(bytes),cipher.final()]).toString('utf8'));
  }
 };
}
