import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {BetaStore} from '../server/cloud/beta-store-base.mjs';
import {EmailAuth} from '../server/cloud/email-auth-base.mjs';
import {GoogleAuth} from '../server/cloud/google-auth-base.mjs';
// Local PostgreSQL engine: real constraints, no Supabase connection or credentials.
test('PostgreSQL Google identity transactions retain one account and original credits across concurrent logins',async t=>{
 const engine=new PGlite();await engine.waitReady;t.after(()=>engine.close());let active=engine,tail=Promise.resolve();
 const sql=s=>s.replace(/PRAGMA[^;]+;/g,'').replace(/\bINTEGER\b/g,'BIGINT').replace(/\?/g,(()=>{let i=0;return()=>'$'+(++i);})());
 const db={async exec(s){await active.exec(sql(s));},prepare(s){const query=async args=>s.startsWith('PRAGMA table_info')?{rows:(await active.query("SELECT column_name AS name FROM information_schema.columns WHERE table_name='users'")).rows}:active.query(sql(s),args);return {async get(...args){return(await query(args)).rows[0];},async all(...args){return(await query(args)).rows;},async run(...args){return query(args);}};},async transaction(fn){let release;const previous=tail;tail=new Promise(r=>release=r);await previous;try{return await engine.transaction(async tx=>{active=tx;try{return await fn();}finally{active=engine;}});}finally{release();}}};
 const store=await new BetaStore().initialize(db);await new EmailAuth().initialize(store);
 const auth=await new GoogleAuth().initialize(store,{provider:{clientId:'fixture',redirectUri:'https://beta.example.com/?google=1',async exchange(){return {subject:'stable-google-sub',email:'cloud@example.com'};}}});
 const start=await auth.startGoogle();const a=await auth.finishGoogle({...start,code:'mock'});await db.prepare('UPDATE users SET credits=17 WHERE id=?').run(a.user.id);
 const flows=await Promise.all([auth.startGoogle(),auth.startGoogle()]);const sessions=await Promise.all(flows.map(f=>auth.finishGoogle({...f,code:'mock'})));assert.ok(sessions.every(s=>s.user.id===a.user.id));assert.equal(Number((await db.prepare('SELECT COUNT(*) n FROM users').get()).n),1);assert.equal(Number((await store.authenticate('Bearer '+sessions[1].token)).credits),17);
 await assert.rejects(auth.finishGoogle({...start,code:'mock'}),/GOOGLE_FLOW_INVALID/);
 const native=await auth.startGoogle(undefined,'com.selluplabs.aiadcast.next.demo','ko');assert.equal(await auth.nativeGoogleLanguage(native.state),'ko');assert.deepEqual(await auth.pollNativeGoogle(native),{state:'pending'});assert.equal(await auth.approveNativeGoogle(native.state,'mock'),'com.selluplabs.aiadcast.next.demo://google/return');assert.equal(await auth.nativeGoogleLanguage(native.state),'ko');const restored=await auth.pollNativeGoogle(native);assert.equal(restored.session.user.id,a.user.id);assert.equal(Number((await store.authenticate('Bearer '+restored.session.token)).credits),17);await assert.rejects(auth.pollNativeGoogle(native),/GOOGLE_FLOW_INVALID/);
 // New recovery table and async transactions are tested with the local PostgreSQL engine.
 const legacy=await store.provision({label:'Legacy recovery',credits:19});await db.prepare('INSERT INTO email_identities VALUES(?,?)').run('legacy@example.com',legacy.userId);
 let mail,sends=0;const email=await new EmailAuth().initialize(store,{publicOrigin:'https://mock.invalid',sendMail:async m=>{sends++;mail=m;}});
 const recovery=await new GoogleAuth().initialize(store,{provider:{clientId:'mock',redirectUri:'https://mock.invalid/?google=1',async exchange(){return {subject:'legacy-subject',email:'legacy@example.com'};}}});
 const pending=await recovery.startGoogle(undefined,'com.selluplabs.aiadcast.next.demo','en',true);await recovery.approveNativeGoogle(pending.state,'mock');assert.equal((await recovery.pollNativeGoogle(pending)).state,'link-required');
 await Promise.all([recovery.requestLinkEmail({...pending,consent:true},undefined,email),recovery.requestLinkEmail({...pending,consent:true},undefined,email)]);assert.equal(sends,1);
 assert.deepEqual(await email.verify(new URLSearchParams(mail.url.split('?')[1]).get('token')),{verified:true});
 const outcomes=await Promise.allSettled([recovery.completeLink(pending),recovery.completeLink(pending)]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);assert.equal(outcomes.filter(r=>r.status==='rejected').length,1);
 const restoredRecovery=await new GoogleAuth().initialize(store,{provider:recovery.provider});const next=await restoredRecovery.startGoogle();const again=await restoredRecovery.finishGoogle({...next,code:'mock'});assert.equal(again.user.id,legacy.userId);assert.equal(Number((await store.authenticate('Bearer '+again.token)).credits),19);

});
