import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BetaStore} from '../server/beta-store.mjs';
import {PasswordAuth} from '../server/password-auth.mjs';
import {createBetaServer,betaStartupMessage} from '../server/beta-server.mjs';
import {PasswordAuth as CloudPasswordAuth} from '../server/cloud/password-auth-base.mjs';
import {GenerationService} from '../server/generation-service.mjs';
import {accountConfiguration} from '../server/account-providers.mjs';
const owner='selluplabs@gmail.com',ownerPassword='Fixture-owner-2026!',memberPassword='Fixture-member-2026!';
function setup(t){
 const directory=mkdtempSync(join(tmpdir(),'aiadcast-password-'));let clock=Date.now();
 const store=new BetaStore(directory,{monthlyBudgetMicros:1_000_000,now:()=>clock});
 const options={enabled:true,adminEmail:owner,adminPassword:ownerPassword};
 const auth=new PasswordAuth(store,options,()=>clock);auth.bootstrapOwner();
 t.after(()=>{store.close();rmSync(directory,{recursive:true,force:true});});
 return {store,auth,directory,options,advance:ms=>clock+=ms};
}
test('members signup and sign in without invitation, never self-grant roles or budgets',t=>{
 const {store,auth,directory}=setup(t);
 const session=auth.signup({email:' Tester@Example.com ',password:memberPassword,name:'테스터',role:'admin',credits:999,budget:999});
 assert.equal(session.user.role,'member');assert.equal(session.user.label,'테스터');
 const u=store.authenticate('Bearer '+session.token);assert.equal(u.budget,0);assert.equal(u.credits,0);
 assert.equal(auth.signIn({email:'tester@example.com',password:memberPassword}).user.id,u.id);
 assert.throws(()=>auth.signup({email:'TESTER@example.com',password:memberPassword}),/ACCOUNT_EXISTS/);
 assert.throws(()=>auth.signup({email:owner,password:memberPassword}),/ADMIN_LOGIN_REQUIRED/);
 assert.throws(()=>auth.signup({email:'bad',password:memberPassword}),/INVALID_EMAIL/);
 assert.throws(()=>auth.signup({email:'b@example.com',password:'short'}),/INVALID_PASSWORD/);
 assert.ok(!readFileSync(join(directory,'accounts.sqlite')).includes(Buffer.from(memberPassword)));
 assert.ok(!readFileSync(join(directory,'accounts.sqlite')).includes(Buffer.from(ownerPassword)));
});
test('owner password bootstrap reuses the existing account and preserves credits, costs and projects on restart',t=>{
 const {store,auth,options}=setup(t),session=auth.signIn({email:owner,password:ownerPassword});
 const u=store.authenticate('Bearer '+session.token);assert.equal(u.role,'admin');assert.equal(u.budget,500_000);assert.equal(u.credits,3);
 store.save(u.id,'owner-project',{project:{id:'owner-project',version:1,name:'Keep'},revision:0});
 store.db.prepare('UPDATE users SET credits=1 WHERE id=?').run(u.id);
 const next=new PasswordAuth(store,options);next.bootstrapOwner();
 assert.equal(store.authenticate('Bearer '+session.token).id,u.id);
 assert.equal(store.db.prepare('SELECT credits FROM users WHERE id=?').get(u.id).credits,1);
 assert.equal(store.project(u.id,'owner-project').project.name,'Keep');assert.equal(next.ownerReady(),true);
 const changed=new PasswordAuth(store,{...options,adminPassword:'Fixture-owner-changed!'});changed.bootstrapOwner();
 assert.throws(()=>store.authenticate('Bearer '+session.token),/AUTH_REQUIRED/);
 assert.throws(()=>changed.signIn({email:owner,password:ownerPassword}),/INVALID_CREDENTIALS/);
 assert.equal(changed.signIn({email:owner,password:'Fixture-owner-changed!'}).user.id,u.id);
});
test('wrong password throttling persists and expiry, revocation, disabled mode are enforced',t=>{
 const {store,auth,advance}=setup(t),s=auth.signup({email:'member@example.com',password:memberPassword});
 for(let i=0;i<5;i++)assert.throws(()=>auth.signIn({email:'member@example.com',password:'Wrong-fixture-password'}),/INVALID_CREDENTIALS/);
 assert.throws(()=>auth.signIn({email:'member@example.com',password:memberPassword}),/AUTH_RATE_LIMIT/);
 advance(10*60_000+1);assert.equal(auth.signIn({email:'member@example.com',password:memberPassword}).user.id,s.user.id);
 store.revoke(s.user.id);assert.throws(()=>auth.signIn({email:'member@example.com',password:memberPassword}),/INVALID_CREDENTIALS/);
 advance(24*60*60_000+1);assert.throws(()=>store.authenticate('Bearer '+s.token),/AUTH_REQUIRED/);
 const disabled=new PasswordAuth(store);assert.throws(()=>disabled.signup({email:'next@example.com',password:memberPassword}),/UNAVAILABLE/);assert.throws(()=>disabled.signIn({email:owner,password:ownerPassword}),/UNAVAILABLE/);
});
test('owner setup refuses a different admin and does not expose a public first-owner claim',t=>{
 const {store}=setup(t);
 const noPassword=new PasswordAuth(store,{enabled:true,adminEmail:'different@example.com'});noPassword.bootstrapOwner();assert.equal(noPassword.ownerReady(),false);
 assert.throws(()=>noPassword.signup({email:'different@example.com',password:memberPassword}),/ADMIN_LOGIN_REQUIRED/);
 const different=new PasswordAuth(store,{enabled:true,adminEmail:'different@example.com',adminPassword:ownerPassword});assert.throws(()=>different.bootstrapOwner(),/OWNER_MISMATCH/);
 assert.equal(store.db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin'").get().n,1);
 assert.throws(()=>new PasswordAuth(store,{enabled:true,adminPassword:'short'}),/INVALID_TEST_AUTH_CONFIG/);
 const config=accountConfiguration({AIADCAST_EMAIL_ENABLED:'false'});assert.equal(config.password.enabled,true);
 assert.equal(accountConfiguration({AIADCAST_TEST_AUTH_ENABLED:'false'}).password.enabled,false);
 assert.equal(accountConfiguration({AIADCAST_EMAIL_ENABLED:'true'}).password.enabled,false);
});
test('HTTP test signup/login use real sessions and member cannot access administrator or owner work',async t=>{
 const {store,directory,options}=setup(t),origin='https://beta.example.com';
 const app=createBetaServer({store,publicUrl:origin,accounts:{password:options},serviceFactory:u=>new GenerationService({databasePath:join(directory,u.id+'.sqlite'),budgetMicros:u.budget,testCredits:u.credits})});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const call=async(path,body,token)=>{const r=await fetch('http://127.0.0.1:'+app.server.address().port+path,{method:body?'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json','X-Aiadcast-Client':'local-studio',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 const cap=(await call('/api/account/capabilities')).data;assert.equal(cap.password.adminReady,true);assert.ok(!JSON.stringify(cap).includes(ownerPassword));
 const admin=(await call('/api/auth/test/login',{email:owner,password:ownerPassword})).data;
 const member=(await call('/api/auth/test/signup',{email:'member@example.com',password:memberPassword,role:'admin'})).data;
 assert.equal((await call('/api/admin/overview',undefined,member.token)).status,403);
 assert.equal((await call('/api/admin/overview',undefined,admin.token)).status,200);
 assert.equal((await call('/api/status',undefined,member.token)).data.mode,'test-account-beta');
 assert.equal((await call('/api/auth/test/login',{email:owner,password:'Wrong-fixture-password'})).status,401);
 assert.equal((await call('/api/auth/logout',{},member.token)).status,200);
 assert.equal((await call('/api/status',undefined,member.token)).status,401);
});
test('invalid administrator settings identify every bad field before any local or cloud database access without logging values',async()=>{
 const emailField='AIADCAST_TEST_ADMIN_EMAIL',passwordField='AIADCAST_TEST_ADMIN_PASSWORD';
 const cases=[
  {adminEmail:'not-an-address',adminPassword:ownerPassword,fields:[emailField]},
  {adminEmail:owner,adminPassword:'',fields:[passwordField]},
  {adminEmail:owner,adminPassword:'x'.repeat(11),fields:[passwordField]},
  {adminEmail:owner,adminPassword:'x'.repeat(129),fields:[passwordField]},
  {adminEmail:'',adminPassword:'short',fields:[emailField,passwordField]},
 ];
 for(const config of cases){
  const store={db:{exec(){assert.fail('Invalid configuration must fail before database access');}}};
  const check=error=>{
   assert.equal(error.message,'INVALID_TEST_AUTH_CONFIG');assert.deepEqual(error.invalidFields,config.fields);
   const log=betaStartupMessage(error);
   for(const field of config.fields)assert.ok(log.includes(field));
   for(const field of [emailField,passwordField].filter(field=>!config.fields.includes(field)))assert.ok(!log.includes(field));
   for(const value of [config.adminEmail,config.adminPassword].filter(Boolean))assert.ok(!log.includes(value));
   return true;
  };
  assert.throws(()=>new PasswordAuth(store,{enabled:true,...config}),check);
  await assert.rejects(new CloudPasswordAuth().initialize(store,{enabled:true,...config}),check);
 }
});
test('administrator password boundaries remain unchanged and startup logs discard untrusted error fields',async()=>{
 for(const length of [12,128]){
  let writes=0;const store={db:{exec(){writes++;}}},options={enabled:true,adminEmail:owner,adminPassword:'x'.repeat(length)};
  new PasswordAuth(store,options);await new CloudPasswordAuth().initialize(store,options);assert.equal(writes,2);
 }
 const secret='not-for-logs-credential';
 const message=betaStartupMessage(Object.assign(Error('INVALID_TEST_AUTH_CONFIG'),{invalidFields:['AIADCAST_TEST_ADMIN_PASSWORD',secret],cause:secret}));
 assert.ok(message.includes('12-128'));assert.ok(!message.includes(secret));
 assert.ok(!betaStartupMessage(Error(secret)).includes(secret));
});
