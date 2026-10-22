import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {ApiFailure} from './generation-service.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
const valid=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s);
const fail=(code,status=401)=>{throw new ApiFailure(code,status);};
export class GoogleAuth {
 constructor(store,{provider,now=()=>Date.now()}={}){
  this.store=store;this.db=store.db;this.provider=provider;this.now=now;
  this.db.exec(`CREATE TABLE IF NOT EXISTS google_identities(subject TEXT PRIMARY KEY,user_id TEXT UNIQUE NOT NULL REFERENCES users(id));
   CREATE TABLE IF NOT EXISTS google_requests(state_hash TEXT PRIMARY KEY,proof_hash TEXT NOT NULL,nonce TEXT NOT NULL,verifier TEXT NOT NULL,session_hash TEXT NOT NULL,expires INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);`);
 }
 available(){return !!this.provider;}
 startGoogle(authorization){
  if(!this.available())fail('GOOGLE_UNAVAILABLE',503);
  // A link flow is bound to this exact already-authenticated session, never an email string.
  if(authorization)this.store.authenticate(authorization);
  const state=secret(),proof=secret(),nonce=secret(),verifier=secret(),expires=this.now()+600000;
  this.store.transaction(()=>{this.db.prepare('DELETE FROM google_requests WHERE expires<=?').run(this.now());if(this.db.prepare('SELECT COUNT(*) n FROM google_requests').get().n>=1000)fail('RATE_LIMITED',429);
   this.db.prepare('INSERT INTO google_requests(state_hash,proof_hash,nonce,verifier,session_hash,expires) VALUES(?,?,?,?,?,?)').run(hash(state),hash(proof),nonce,verifier,authorization?hash(authorization):'',expires);
  });
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:this.provider.clientId,redirect_uri:this.provider.redirectUri,response_type:'code',scope:'openid email',prompt:'select_account',state,nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
  return {state,proof,expires,url:url.href};
 }
 claimGoogle(body,authorization){
  if(!this.available())fail('GOOGLE_UNAVAILABLE',503);
  if(!valid(body?.state)||!valid(body?.proof))fail('GOOGLE_FLOW_INVALID');
  return this.store.transaction(()=>{
   const row=this.db.prepare('SELECT * FROM google_requests WHERE state_hash=? AND proof_hash=? AND expires>? AND consumed=0').get(hash(body.state),hash(body.proof),this.now());
   if(!row||row.session_hash!==(authorization?hash(authorization):''))fail('GOOGLE_FLOW_INVALID');
   if(authorization)this.store.authenticate(authorization);
   this.db.prepare('UPDATE google_requests SET consumed=1 WHERE state_hash=?').run(row.state_hash);return row;
  });
 }
 completeGoogle(flow,claims,authorization){
  return this.store.transaction(()=>{
   if(flow.expires<=this.now())fail('GOOGLE_FLOW_INVALID');
   const owner=authorization?this.store.authenticate(authorization):undefined;
   let identity=this.db.prepare('SELECT user_id FROM google_identities WHERE subject=?').get(claims.subject);
   if(owner){
    if(identity&&identity.user_id!==owner.id)fail('GOOGLE_LINK_CONFLICT',409);
    const existing=this.db.prepare('SELECT subject FROM google_identities WHERE user_id=?').get(owner.id);if(existing&&existing.subject!==claims.subject)fail('GOOGLE_LINK_CONFLICT',409);
    // Do not bind a Google email belonging to another pre-existing account.
    const email=this.db.prepare('SELECT user_id FROM email_identities WHERE email=?').get(claims.email);if(email&&email.user_id!==owner.id)fail('GOOGLE_LINK_CONFLICT',409);
    if(!identity)this.db.prepare('INSERT INTO google_identities VALUES(?,?)').run(claims.subject,owner.id);
    identity={user_id:owner.id};
   }
   if(!identity){
    if(this.db.prepare('SELECT user_id FROM email_identities WHERE email=?').get(claims.email))fail('GOOGLE_ACCOUNT_LINK_REQUIRED',409);
    if(this.db.prepare('SELECT COUNT(*) n FROM users').get().n>=20)fail('BETA_ALLOCATION_EXCEEDED',409);
    const id=randomUUID();this.db.prepare('INSERT INTO users(id,label,budget,credits) VALUES(?,?,0,0)').run(id,claims.email.slice(0,80));
    this.db.prepare('INSERT INTO google_identities VALUES(?,?)').run(claims.subject,id);
    this.db.prepare('INSERT INTO email_identities VALUES(?,?)').run(claims.email,id);identity={user_id:id};
   }
   const user=this.db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(identity.user_id);if(!user)fail('AUTH_REQUIRED');
   return this.store.createSession(user);
  });
 }
 async finishGoogle(body,authorization){
  const flow=this.claimGoogle(body,authorization);
  // A consumed/uncertain code is never exchanged twice. Restarting uses the same subject identity.
  let claims;try{claims=await this.provider.exchange(body.code,flow.verifier,flow.nonce);}catch{fail('GOOGLE_PROOF_INVALID');}
  return this.completeGoogle(flow,claims,authorization);
 }
}
