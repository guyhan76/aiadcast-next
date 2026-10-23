import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {BetaStore} from '../server/beta-store.mjs';
import {EmailAuth} from '../server/email-auth.mjs';
import {GoogleAuth} from '../server/google-auth.mjs';
function fixture(t){
 const dir=mkdtempSync('/tmp/google-link-');let now=Date.now(),mails=[],calls=0;
 const store=new BetaStore(dir,{now:()=>now});t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 const email=new EmailAuth(store,{now:()=>now,publicOrigin:'https://mock.invalid',sendMail:async m=>{mails.push(m);}});
 const owner=store.provision({label:'Existing',credits:17});store.db.prepare('INSERT INTO email_identities VALUES(?,?)').run('existing@example.com',owner.userId);
 const auth=new GoogleAuth(store,{now:()=>now,provider:{clientId:'mock',redirectUri:'https://mock.invalid/?google=1',exchange:async()=>{calls++;return {subject:'verified-subject',email:'existing@example.com'};}}});
 const pending=async(native=false)=>{const flow=auth.startGoogle(undefined,native?'com.selluplabs.aiadcast.next.demo':undefined,'en',true);if(native){await auth.approveNativeGoogle(flow.state,'mock');assert.equal(auth.pollNativeGoogle(flow).state,'link-required');}else assert.equal((await auth.finishGoogle({...flow,code:'mock'})).linkRequired,true);return flow;};
 return {store,email,auth,owner,mails,pending,calls:()=>calls,advance:(ms=600001)=>now+=ms,approve:()=>email.verify(new URLSearchParams(mails.at(-1).url.split('?')[1]).get('token'))};
}
for(const native of [false,true])for(const role of ['member','admin'])test(`${native?'native':'web'} one ownership proof links existing ${role}, preserves credits and subsequent Google skips email`,async t=>{
 const f=fixture(t);if(role==='admin')f.store.setRole(f.owner.userId,role);const flow=await f.pending(native);
 assert.equal(f.auth.linkStatus(flow).state,'confirmation');assert.equal(f.mails.length,0);
 await f.auth.requestLinkEmail({...flow,consent:true},undefined,f.email);await f.auth.requestLinkEmail({...flow,consent:true},undefined,f.email);assert.equal(f.mails.length,1);
 assert.equal(f.auth.completeLink(flow).state,'pending');assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);
 assert.deepEqual(f.approve(),{verified:true});const result=f.auth.completeLink(flow);assert.equal(result.session.user.id,f.owner.userId);assert.equal(result.session.user.role,role);assert.equal(f.store.authenticate('Bearer '+result.session.token).credits,17);assert.equal(f.calls(),1);
 assert.throws(()=>f.auth.completeLink(flow),/GOOGLE_LINK_INVALID/);
 const repeat=f.auth.startGoogle(undefined,undefined,'en',true),session=await f.auth.finishGoogle({...repeat,code:'mock'});assert.equal(session.user.id,f.owner.userId);assert.equal(f.mails.length,1);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM users').get().n,1);
});
test('wrong device proof, missing consent and replacement session cannot authorize pending link',async t=>{
 const f=fixture(t),flow=await f.pending();assert.throws(()=>f.auth.linkStatus({...flow,proof:'x'.repeat(43)}),/GOOGLE_LINK_INVALID/);
 await assert.rejects(f.auth.requestLinkEmail(flow,undefined,f.email),/GOOGLE_LINK_CONSENT_REQUIRED/);
 const other=f.store.provision({label:'Other'}),session=f.store.login(other.invite);assert.throws(()=>f.auth.completeLink(flow,'Bearer '+session.token),/GOOGLE_LINK_INVALID/);
 assert.equal(f.mails.length,0);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM google_identities').get().n,0);
});
test('email proof for another request/account cannot complete this link; mail verification returns no session',async t=>{
 const f=fixture(t),flow=await f.pending();await f.auth.requestLinkEmail({...flow,consent:true},undefined,f.email);
 const other=await f.email.request('other@example.com');assert.deepEqual(f.approve(),{verified:true});assert.equal(f.auth.completeLink(flow).state,'pending');
 const otherSession=f.email.exchange(other.requestId,other.pollToken).session;assert.throws(()=>f.auth.completeLink(flow,'Bearer '+otherSession.token),/GOOGLE_LINK_INVALID/);
 assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM google_identities').get().n,0);
});
test('expired and canceled native recovery cannot resume, replay or create an identity',async t=>{
 for(const expired of [false,true]){const f=fixture(t),flow=await f.pending(true);await f.auth.requestLinkEmail({...flow,consent:true},undefined,f.email);f.approve();if(expired)f.advance();else f.auth.cancelLink(flow);
 assert.throws(()=>f.auth.completeLink(flow),/GOOGLE_LINK_INVALID/);assert.throws(()=>f.auth.pollNativeGoogle(flow),/GOOGLE_LINK_INVALID/);assert.equal(f.store.db.prepare('SELECT COUNT(*) n FROM google_identities').get().n,0);}
});
test('disabled account and conflicting identity fail closed without changing role or balances',async t=>{
 for(const conflict of [false,true]){const f=fixture(t),flow=await f.pending();await f.auth.requestLinkEmail({...flow,consent:true},undefined,f.email);f.approve();
 if(conflict){const other=f.store.provision({label:'Other'});f.store.db.prepare('INSERT INTO google_identities VALUES(?,?)').run('verified-subject',other.userId);}else f.store.revoke(f.owner.userId);
 assert.throws(()=>f.auth.completeLink(flow),conflict?/GOOGLE_LINK_CONFLICT/:/AUTH_REQUIRED/);assert.equal(f.store.db.prepare('SELECT credits FROM users WHERE id=?').get(f.owner.userId).credits,17);}
});
test('overlapping sends coalesce and cancellation during delivery invalidates its email proof',async t=>{
 const f=fixture(t),flow=await f.pending();let finish;const gate=new Promise(r=>finish=r);const sender=f.email.sendMail;f.email.sendMail=async m=>{await gate;await sender(m);};
 const send=f.auth.requestLinkEmail({...flow,consent:true},undefined,f.email);assert.equal((await f.auth.requestLinkEmail({...flow,consent:true},undefined,f.email)).state,'waiting');f.auth.cancelLink(flow);finish();await assert.rejects(send,/GOOGLE_LINK_INVALID/);assert.throws(f.approve,/EMAIL_LINK_INVALID/);assert.equal(f.mails.length,1);
});
test('mail failure keeps a retryable intent; no connection or session is granted',async t=>{
 const f=fixture(t),flow=await f.pending();const send=f.email.sendMail;f.email.sendMail=async()=>{throw Error('mock delivery failed');};await assert.rejects(f.auth.requestLinkEmail({...flow,consent:true},undefined,f.email),/EMAIL_SEND_FAILED/);assert.equal(f.auth.linkStatus(flow).state,'confirmation');f.email.sendMail=send;await f.auth.requestLinkEmail({...flow,consent:true},undefined,f.email);assert.equal(f.mails.length,1);
});
test('native cold recovery uses the original proof without another provider exchange',async t=>{
 const f=fixture(t),flow=await f.pending(true);await f.auth.requestLinkEmail({...flow,consent:true},undefined,f.email);
 const restored=new GoogleAuth(f.store,{provider:f.auth.provider});assert.equal(restored.pollNativeGoogle(flow).state,'link-required');assert.equal(restored.linkStatus(flow).state,'waiting');f.approve();assert.equal(restored.completeLink(flow).session.user.id,f.owner.userId);assert.equal(f.calls(),1);
});

test('HTTP recovery keeps mail-browser approval separate from originating-device completion',async t=>{
 const {createBetaServer}=await import('../server/beta-server.mjs');const f=fixture(t),origin='https://mock.invalid';
 const app=createBetaServer({store:f.store,publicUrl:origin,accounts:{google:f.auth.provider,sendMail:async m=>{f.mails.push(m);}},serviceFactory:()=>{throw Error('NO_GENERATION');}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base='http://127.0.0.1:'+app.server.address().port;
 const post=async(path,body,extra={})=>{const r=await fetch(base+path,{method:'POST',headers:{Origin:origin,'X-Aiadcast-Client':'local-studio','Content-Type':'application/json',...extra},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const flow=(await post('/api/auth/google/start',{linkRecovery:true})).body;
 assert.equal((await post('/api/auth/google/finish',{...flow,code:'mock'})).body.linkRequired,true);
 assert.equal((await post('/api/auth/google/link/request',{...flow,consent:true,email:'attacker@example.com'})).status,200);assert.equal(f.mails[0].email,'existing@example.com');
 const token=new URLSearchParams(f.mails[0].url.split('?')[1]).get('token');assert.deepEqual((await post('/api/auth/email/verify',{token})).body,{verified:true});
 assert.equal((await post('/api/auth/google/link/complete',{...flow,proof:'x'.repeat(43)})).status,401);
 const result=await post('/api/auth/google/link/complete',flow);assert.equal(result.status,200);assert.equal(result.body.session.user.id,f.owner.userId);assert.equal((await post('/api/auth/google/link/complete',flow)).status,401);
});


test('separate Google attempts cannot borrow ownership approval or replace an already linked subject',async t=>{
 const f=fixture(t),a=await f.pending();await f.auth.requestLinkEmail({...a,consent:true},undefined,f.email);f.approve();
 f.advance(60001);f.auth.provider.exchange=async()=>({subject:'different-subject',email:'existing@example.com'});const b=await f.pending();await f.auth.requestLinkEmail({...b,consent:true},undefined,f.email);
 assert.equal(f.auth.completeLink(b).state,'pending');assert.equal(f.auth.completeLink(a).session.user.id,f.owner.userId);f.approve();assert.throws(()=>f.auth.completeLink(b),/GOOGLE_LINK_CONFLICT/);assert.equal(f.store.db.prepare('SELECT subject FROM google_identities WHERE user_id=?').get(f.owner.userId).subject,'verified-subject');
});
