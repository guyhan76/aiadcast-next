import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BetaStore} from '../server/beta-store.mjs';
import {EmailAuth} from '../server/email-auth.mjs';
import {GoogleAuth} from '../server/google-auth.mjs';
import {googleProvider} from '../server/google-provider.mjs';
import {createBetaServer} from '../server/beta-server.mjs';
const origin='https://beta.example.com';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'google-local-'));let clock=Date.now();const store=new BetaStore(dir,{now:()=>clock});new EmailAuth(store);t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});let subject='google-subject-A',email='a@example.com',calls=0,gate=Promise.resolve();const provider={clientId:'fixture-client',redirectUri:origin+'/?google=1',async exchange(){calls++;await gate;return {subject,email};}};const auth=new GoogleAuth(store,{provider,now:()=>clock});return {store,auth,calls:()=>calls,set:(s,e)=>{subject=s;email=e;},hold:g=>gate=g,advance:()=>clock+=600001};}
const complete=(auth,authorization)=>{const flow=auth.startGoogle(authorization);return auth.finishGoogle({...flow,code:'mock-code'},authorization);};
test('Google subject survives new devices/email changes, creates one member with zero grant and keeps existing balances',async t=>{
 const f=fixture(t),first=await complete(f.auth);assert.equal(first.user.role,'member');f.store.db.prepare('UPDATE users SET credits=23 WHERE id=?').run(first.user.id);
 f.set('google-subject-A','changed@example.com');const sessions=await Promise.all([complete(f.auth),complete(f.auth)]);assert.ok(sessions.every(s=>s.user.id===first.user.id));assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM users').get().n,1);for(const s of sessions)assert.equal(f.store.authenticate('Bearer '+s.token).credits,23);
});
test('email collision never merges or promotes; authenticated explicit linking preserves administrator and legacy ownership',async t=>{
 const f=fixture(t),old=f.store.provision({label:'Owner',credits:7});f.store.db.prepare('INSERT INTO email_identities VALUES(?,?)').run('a@example.com',old.userId);f.store.setRole(old.userId,'admin');
 await assert.rejects(complete(f.auth),/GOOGLE_ACCOUNT_LINK_REQUIRED/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM google_identities').get().n,0);
 const owner=f.store.login(old.invite),linked=await complete(f.auth,'Bearer '+owner.token);assert.equal(linked.user.id,old.userId);assert.equal(linked.user.role,'admin');assert.equal(f.store.authenticate('Bearer '+linked.token).credits,7);assert.equal((await complete(f.auth)).user.id,old.userId);
 const other=f.store.provision({label:'Other',credits:0}),otherSession=f.store.login(other.invite);await assert.rejects(complete(f.auth,'Bearer '+otherSession.token),/GOOGLE_LINK_CONFLICT/);
});
test('wrong state/proof, stale flow, duplicate completion and uncertain exchange cannot create repeated sessions',async t=>{
 const f=fixture(t),flow=f.auth.startGoogle();assert.equal(new URL(flow.url).searchParams.get('prompt'),'select_account');assert.equal(new URL(flow.url).searchParams.get('code_challenge_method'),'S256');
 await assert.rejects(f.auth.finishGoogle({...flow,proof:'x'.repeat(43),code:'x'}),/GOOGLE_FLOW_INVALID/);assert.equal(f.calls(),0);
 let release;f.hold(new Promise(r=>release=r));const pending=f.auth.finishGoogle({...flow,code:'x'});await assert.rejects(f.auth.finishGoogle({...flow,code:'x'}),/GOOGLE_FLOW_INVALID/);release();await pending;assert.equal(f.calls(),1);
 const stale=f.auth.startGoogle();f.advance();await assert.rejects(f.auth.finishGoogle({...stale,code:'x'}),/GOOGLE_FLOW_INVALID/);
 const u=f.store.db.prepare('SELECT * FROM users').get();f.store.revoke(u.id);await assert.rejects(complete(f.auth),/AUTH_REQUIRED/);
});
test('linking is bound to exact active session and cannot finish after logout',async t=>{
 const f=fixture(t),old=f.store.provision({label:'Existing',credits:9}),s=f.store.login(old.invite),header='Bearer '+s.token,flow=f.auth.startGoogle(header);
 await assert.rejects(f.auth.finishGoogle({...flow,code:'x'}),/GOOGLE_FLOW_INVALID/);let release;f.hold(new Promise(r=>release=r));const pending=f.auth.finishGoogle({...flow,code:'x'},header);f.store.logout(header);release();await assert.rejects(pending,/AUTH_REQUIRED/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM google_identities').get().n,0);
});
const key=generateKeyPairSync('rsa',{modulusLength:2048});const jwk={...key.publicKey.export({format:'jwk'}),kid:'fixture',alg:'RS256',use:'sig'};
function jwt(payload,header={alg:'RS256',kid:'fixture'}){const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),text=b(header)+'.'+b(payload);return text+'.'+sign('RSA-SHA256',Buffer.from(text),key.privateKey).toString('base64url');}
test('Google JWT signature, issuer, audience, expiry, nonce and PKCE token request are validated with mock HTTPS',async()=>{
 const now=Date.now(),valid={iss:'https://accounts.google.com',aud:'fixture-client',sub:'subject',email:'a@example.com',email_verified:true,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+3600,nonce:'fixture-nonce'};let token=jwt(valid),posts=0;
 const provider=googleProvider({clientId:'fixture-client',clientSecret:'fixture-only-not-a-secret',redirectUri:origin+'/?google=1',now:()=>now,fetchImpl:async(url,options)=>{if(url.includes('/certs'))return new Response(JSON.stringify({keys:[jwk]}));assert.equal(url,'https://oauth2.googleapis.com/token');const b=new URLSearchParams(options.body);assert.equal(b.get('code_verifier'),'fixture-verifier');assert.equal(b.get('redirect_uri'),origin+'/?google=1');posts++;return new Response(JSON.stringify({id_token:token}));}});
 assert.deepEqual(await provider.exchange('code','fixture-verifier','fixture-nonce'),{subject:'subject',email:'a@example.com'});
 for(const change of [{iss:'https://evil.example.com'},{aud:'other-client'},{azp:'other-client'},{exp:0},{iat:Math.floor(now/1000)+120},{nonce:'other'},{email_verified:false},{sub:''}]){token=jwt({...valid,...change});await assert.rejects(provider.exchange('code','fixture-verifier','fixture-nonce'),/GOOGLE_PROOF_INVALID/);}
 token=jwt(valid,{alg:'none',kid:'fixture'});await assert.rejects(provider.exchange('code','fixture-verifier','fixture-nonce'),/GOOGLE_PROOF_INVALID/);
 token=jwt(valid).slice(0,-12)+'AAAAAAAAAAAA';await assert.rejects(provider.exchange('code','fixture-verifier','fixture-nonce'),/GOOGLE_PROOF_INVALID/);assert.equal(posts,11);
});
test('HTTP Google endpoints enforce CSRF and server identity, ignore forged credits/admin fields',async t=>{
 const f=fixture(t),app=createBetaServer({store:f.store,publicUrl:origin,accounts:{google:f.auth.provider},serviceFactory:()=>{throw Error('NO_GENERATION');}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(path,body,headers={})=>{const r=await fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Aiadcast-Client':'local-studio',...headers},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 assert.equal((await post('/api/auth/google/start',{}, {Origin:'https://evil.example.com'})).status,403);const flow=(await post('/api/auth/google/start',{})).body;
 const result=await post('/api/auth/google/finish',{...flow,code:'mock',role:'admin',credits:999999,userId:'victim'});assert.equal(result.status,200);assert.equal(result.body.user.role,'member');assert.equal(f.store.authenticate('Bearer '+result.body.token).credits,0);
 const r=await fetch(base+'/api/auth/session',{headers:{Authorization:'Bearer '+result.body.token}});assert.equal((await r.json()).user.id,result.body.user.id);
 assert.equal((await fetch(base+'/api/auth/session',{headers:{Authorization:'Bearer '+'x'.repeat(43)}})).status,401);
});
