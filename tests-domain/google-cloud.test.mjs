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
});
