import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {ApiFailure} from './generation-service.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const fail=(code,status=400)=>{throw new ApiFailure(code,status);};
const validToken=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s);
export class EmailAuth {
 constructor(store,{sendMail,publicOrigin,now=()=>Date.now()}={}){
  this.store=store;this.db=store.db;this.sendMail=sendMail;this.origin=publicOrigin;this.now=now;
  this.db.exec(`CREATE TABLE IF NOT EXISTS email_identities(email TEXT PRIMARY KEY,user_id TEXT UNIQUE NOT NULL REFERENCES users(id));
   CREATE TABLE IF NOT EXISTS email_requests(id TEXT PRIMARY KEY,email TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,poll_hash TEXT NOT NULL,created INTEGER NOT NULL,expires INTEGER NOT NULL,approved INTEGER NOT NULL DEFAULT 0,consumed INTEGER NOT NULL DEFAULT 0);`);
 }
 async request(raw){
  if(!this.sendMail)fail('EMAIL_UNAVAILABLE',503);
  const email=typeof raw==='string'?raw.trim().toLowerCase():'';
  if(email.length>254||!/^[-a-z0-9.!#$%&'*+/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email))fail('INVALID_EMAIL');
  const now=this.now(),id=randomUUID(),secret=token(),pollToken=token(),expires=now+10*60_000;
  this.store.transaction(()=>{
   this.db.prepare('DELETE FROM email_requests WHERE created<?').run(now-60*60_000);
   const rate=this.db.prepare('SELECT COUNT(*) n,MAX(created) last FROM email_requests WHERE email=?').get(email);
   if(rate.n>=5||(rate.last!==null&&now-rate.last<60_000))fail('EMAIL_RATE_LIMIT',429);
   if(this.db.prepare('SELECT COUNT(*) n FROM email_requests').get().n>=1000)fail('EMAIL_RATE_LIMIT',429);
   this.db.prepare('INSERT INTO email_requests(id,email,token_hash,poll_hash,created,expires) VALUES(?,?,?,?,?,?)').run(id,email,hash(secret),hash(pollToken),now,expires);
  });
  try{await this.sendMail({email,url:this.origin+'/#verify?token='+secret,id});}
  catch{this.db.prepare('DELETE FROM email_requests WHERE id=?').run(id);fail('EMAIL_SEND_FAILED',503);}
  return {requestId:id,pollToken,expires};
 }
 verify(secret){
  if(!this.sendMail)fail('EMAIL_UNAVAILABLE',503);
  if(!validToken(secret))fail('EMAIL_LINK_INVALID',401);
  const row=this.db.prepare('SELECT * FROM email_requests WHERE token_hash=? AND expires>? AND consumed=0').get(hash(secret),this.now());
  if(!row)fail('EMAIL_LINK_INVALID',401);
  this.db.prepare('UPDATE email_requests SET approved=1 WHERE id=?').run(row.id);
  return {verified:true}; // No session is returned to the mail browser.
 }
 exchange(id,pollToken){
  if(!this.sendMail)fail('EMAIL_UNAVAILABLE',503);
  if(typeof id!=='string'||!validToken(pollToken))fail('EMAIL_REQUEST_INVALID',401);
  return this.store.transaction(()=>{
   const row=this.db.prepare('SELECT * FROM email_requests WHERE id=? AND poll_hash=? AND expires>? AND consumed=0').get(id,hash(pollToken),this.now());
   if(!row)fail('EMAIL_REQUEST_INVALID',401);
   if(!row.approved)return {state:'pending'};
   let user=this.db.prepare('SELECT u.* FROM email_identities e JOIN users u ON u.id=e.user_id WHERE e.email=?').get(row.email);
   if(!user){
    if(this.db.prepare('SELECT COUNT(*) n FROM users').get().n>=20)fail('BETA_ALLOCATION_EXCEEDED',409);
    const userId=randomUUID();this.db.prepare('INSERT INTO users(id,label,budget,credits) VALUES(?,?,0,0)').run(userId,row.email.slice(0,80));
    this.db.prepare('INSERT INTO email_identities VALUES(?,?)').run(row.email,userId);user=this.db.prepare('SELECT * FROM users WHERE id=?').get(userId);
   }
   if(user.disabled)fail('AUTH_REQUIRED',401);
   const session=this.store.createSession(user);
   this.db.prepare('UPDATE email_requests SET consumed=1 WHERE id=?').run(id);
   return {state:'verified',session};
  });
 }
}
