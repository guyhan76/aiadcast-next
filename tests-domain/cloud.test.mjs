import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import pg from 'pg';
import {PostgresDatabase,postgresConfiguration,cloudSchema,acquireInstanceLock} from '../server/cloud/postgres.mjs';
import {createCloudBackend} from '../server/cloud/beta.mjs';
import {ProviderFailure,IMAGE_MODEL,IMAGE_REVISION,hashBytes,imageUsageCost} from '../server/openai-image-adapter.mjs';
import {betaStartupCode} from '../server/beta-server.mjs';
const origin='https://beta.example.com',ref='sxpzbfapbizlmsuqlrfu';
const env={SUPABASE_URL:`https://${ref}.supabase.co`,SUPABASE_SECRET_KEY:'sb_secret_test_fixture'};
const config={publicUrl:origin,monthlyBudgetMicros:1_000_000,enabled:true,assistantEnabled:false};
const bytes=await sharp({create:{width:8,height:8,channels:4,background:'#eee'}}).png().toBuffer();
const hash=hashBytes(bytes),source={name:'product.png',data:`data:image/png;base64,${bytes.toString('base64')}`,width:8,height:8,sha256:hash};
const usage={input_tokens:2100,input_tokens_details:{text_tokens:100,image_tokens:2000},output_tokens:1756};
function generation(){return {requestId:randomUUID(),projectId:'project-cloud-test',source,request:{version:1,mode:'original',operation:'compose-original',subjectType:'physical-product',productName:'우체국3호박스',productProfile:{category:'box'},brief:'Warm studio background',source:{sha256:hash,role:'protected-product'},copy:{title:'든든한 배송의 시작'},specifications:[{axis:'width',value:'340',unit:'mm'},{axis:'depth',value:'250',unit:'mm'},{axis:'height',value:'210',unit:'mm'}],output:{format:'1:1',locale:'ko',showDimensions:true},scene:{backgroundColor:'#ffffff'}}};}

// PGlite runs the real PostgreSQL SQL/constraints/transactions. Its one connection
// is leased through a mutex; this is not a mock SQL engine or a remote TLS test.
async function pgPool(folder){
 const engine=new PGlite(folder);await engine.waitReady;
 await engine.exec("DO $$ DECLARE r text;BEGIN FOREACH r IN ARRAY ARRAY['postgres','anon','authenticated','service_role'] LOOP IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I',r);END IF;END LOOP;END $$;");
 let tail=Promise.resolve(),closed=false;
 return {engine,async connect(){
  if(closed)throw Error('POOL_CLOSED');let unlock;const previous=tail;tail=new Promise(r=>unlock=r);await previous;
  let released=false;return {on(){},async query(sql,args=[]){
   const r=(!args.length&&sql.trim().split(';').filter(s=>s.trim()).length>1)?(await engine.exec(sql)).at(-1):await engine.query(sql,args);
   // Match the production pg integer parsers for BIGINT/NUMERIC. PGlite
   // otherwise leaves SUM(bigint) as strings and concatenates allocations.
   const rows=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([name,value])=>{const field=r.fields.find(f=>f.name===name);return [name,value!==null&&[20,1700].includes(field?.dataTypeID)?pg.types.getTypeParser(field.dataTypeID)(String(value)):value];})));
   return {...r,rows,rowCount:r.command==='SELECT'?rows.length:r.affectedRows};
  },release(){if(!released){released=true;unlock();}}};
 },async end(){await tail;closed=true;await engine.close();}};
}
function bucketFixture(){
 const objects=new Map(),calls=[];let exists=false;
 const fetchImpl=async(input,o={})=>{
  const u=new URL(input);assert.equal(u.origin,env.SUPABASE_URL);assert.equal(o.headers.apikey,env.SUPABASE_SECRET_KEY);assert.equal(o.headers.Authorization,undefined);assert.equal(o.redirect,'error');calls.push({path:u.pathname,method:o.method});
  if(u.pathname==='/storage/v1/bucket/aiadcast-private-beta')return exists?Response.json({public:false}):new Response('',{status:404});
  if(u.pathname==='/storage/v1/bucket'){assert.equal(JSON.parse(o.body).public,false);exists=true;return Response.json({});}
  const prefix='/storage/v1/object/aiadcast-private-beta';
  if(u.pathname.startsWith('/storage/v1/object/authenticated/aiadcast-private-beta/')){
   const p=u.pathname.slice('/storage/v1/object/authenticated/aiadcast-private-beta/'.length);
   return objects.has(p)?new Response(objects.get(p)):new Response('',{status:404});
  }
  if(u.pathname===prefix&&o.method==='DELETE'){for(const p of JSON.parse(o.body).prefixes)objects.delete(p);return Response.json({});}
  if(u.pathname.startsWith(prefix+'/')){
   const p=u.pathname.slice(prefix.length+1);
   if(o.method==='POST'){objects.set(p,Buffer.from(o.body));return Response.json({});}
   return objects.has(p)?new Response(objects.get(p)):new Response('',{status:404});
  }
  throw Error('UNEXPECTED_FIXTURE_ROUTE');
 };
 return {objects,calls,fetchImpl};
}
async function setup(t,{adapter,accounts}={}){
 const folder=mkdtempSync(join(tmpdir(),'aiadcast-cloud-')),bucket=bucketFixture();let app,calls=0;
 const defaultAdapter={generate:async()=>{calls++;return {bytes,mime:'image/png',width:8,height:8,sha256:hash,role:'background',usage,cost:imageUsageCost(usage),model:IMAGE_MODEL,revision:IMAGE_REVISION,providerRequestId:'fixture-provider'};}};
 const start=async()=>{
  app=await createCloudBackend(config,env,{pool:await pgPool(join(folder,'pg')),storageFetch:bucket.fetchImpl,adapter:adapter??defaultAdapter,accounts:accounts??{},staticDirectory:null,skipInstanceLock:true});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return app;
 };
 await start();t.after(async()=>{if(app)await app.close();rmSync(folder,{recursive:true,force:true});});
 const call=async(path,{token,body,requestOrigin=origin}={})=>{
  const r=await fetch('http://127.0.0.1:'+app.server.address().port+path,{method:body===undefined?'GET':'POST',headers:{Origin:requestOrigin,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json','X-Aiadcast-Client':'local-studio'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json()};
 };
 return {get app(){return app;},bucket,call,calls:()=>calls,async restart(){await app.close();app=null;return start();},async member(label='Tester',budgetMicros=0,credits=0){const i=await app.store.provision({label,budgetMicros,credits});const r=await call('/api/auth/login',{body:{invite:i.invite}});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}};
}
test('cloud test password accounts and owner login survive restart without invitation or repeated credits',async t=>{
 const password='Fixture-private-admin-2026!',memberPassword='Fixture-private-member-2026!';
 const s=await setup(t,{accounts:{password:{enabled:true,adminEmail:'selluplabs@gmail.com',adminPassword:password}}});
 assert.equal((await s.call('/api/account/capabilities')).data.password.adminReady,true);
 const login=await s.call('/api/auth/test/login',{body:{email:'selluplabs@gmail.com',password}});assert.equal(login.status,200,JSON.stringify(login.data));
 const admin=login.data;assert.equal(admin.user.role,'admin');
 const member=(await s.call('/api/auth/test/signup',{body:{email:'member@example.com',password:memberPassword,role:'admin'}})).data;
 assert.equal(member.user.role,'member');assert.equal((await s.call('/api/admin/overview',{token:member.token})).status,403);
 const readyBody={userId:member.user.id,requestId:'cloud-member-ready'};
 assert.equal((await s.call('/api/admin/test-ready',{token:member.token,body:readyBody})).status,403);
 const ready=await s.call('/api/admin/test-ready',{token:admin.token,body:readyBody});assert.equal(ready.status,200,JSON.stringify(ready.data));assert.equal(ready.data.generation.enabled,true);assert.equal(ready.data.wallet.available,1);
 assert.equal((await s.call('/api/admin/test-ready',{token:admin.token,body:readyBody})).data.wallet.available,1);
 const p={version:1,id:'password-project',name:'Saved test'};assert.equal((await s.call('/api/projects/'+p.id,{token:admin.token,body:{project:p,revision:0}})).status,200);
 assert.equal((await s.call('/api/projects/'+p.id,{token:member.token})).status,404);
 await s.restart();
 assert.equal((await s.call('/api/projects/'+p.id,{token:admin.token})).data.project.name,p.name);
 assert.equal((await s.call('/api/auth/test/login',{body:{email:'member@example.com',password:memberPassword}})).data.user.id,member.user.id);
 assert.equal((await s.call('/api/status',{token:admin.token})).data.wallet.available,3);
 assert.equal((await s.call('/api/status',{token:member.token})).data.wallet.available,1);assert.equal((await s.call('/api/status',{token:member.token})).data.budget.limitMicros,500000);
 assert.equal((await s.call('/api/admin/overview',{token:admin.token})).status,200);
 const stored=await s.app.store.db.prepare('SELECT * FROM test_passwords').all();assert.ok(!JSON.stringify(stored).includes(password));
 for(let i=0;i<5;i++)assert.equal((await s.call('/api/auth/test/login',{body:{email:'member@example.com',password:'Wrong-fixture-password'}})).status,401);
 assert.equal((await s.call('/api/auth/test/login',{body:{email:'member@example.com',password:memberPassword}})).status,429);
 assert.equal(s.calls(),0);
});

test('cloud administrator tests need zero credits, persist through restart and reject member-supplied exemption flags',async t=>{
 const tiny={generate:async()=>({bytes,mime:'image/png',width:8,height:8,sha256:hash,role:'background',usage:{},cost:{microUsd:1},model:IMAGE_MODEL,revision:IMAGE_REVISION})};
 const s=await setup(t,{adapter:tiny});
 const admin=await s.member('Admin',500000,0);await s.app.store.setRole(admin.user.id,'admin');const token=(await s.call('/api/auth/login',{body:{invite:(await s.app.store.issueInvite(admin.user.id)).invite}})).data.token;
 const member=await s.member('Member',500000,0);
 const forged=generation();forged.adminTestUnlimited=true;forged.request.creditExempt=true;forged.request.role='admin';
 const denied=await s.call('/api/generations',{token:member.token,body:forged});assert.equal(denied.data.error.code,'NO_TEST_CREDITS');
 const before=await s.call('/api/status',{token});assert.equal(before.data.wallet.unlimited,true);assert.equal(before.data.generation.enabled,true);
 const input=generation(),created=await s.call('/api/generations',{token,body:input});assert.equal(created.status,202,JSON.stringify(created.data));
 let job;for(let i=0;i<100;i++){job=(await s.call('/api/generations/'+created.data.job.id,{token})).data.job;if(job.state!=='running')break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(job.state,'ready');assert.equal(job.creditCost,0);assert.equal(job.creditPolicy,'admin-unlimited');
 await s.restart();const recovered=(await s.call('/api/generations/'+job.id,{token})).data.job;assert.equal(recovered.creditCost,0);assert.equal(recovered.state,'ready');
 const accepted=await s.call('/api/generations/'+job.id+'/accept',{token,body:{artifactId:job.artifactId}});assert.equal(accepted.status,200,JSON.stringify(accepted.data));
 assert.equal(accepted.data.wallet.available,0);assert.equal(accepted.data.wallet.reserved,0);assert.equal(accepted.data.wallet.unlimited,true);
 assert.equal((await s.call('/api/status',{token})).data.budget.spentMicros,1);
 await s.app.store.setRole(admin.user.id,'member');const demoted=(await s.call('/api/auth/login',{body:{invite:(await s.app.store.issueInvite(admin.user.id)).invite}})).data;
 assert.equal((await s.call('/api/status',{token:demoted.token})).data.wallet.unlimited,undefined);
});
test('cloud database configuration requires the project session pooler with strict TLS',()=>{
 const uri=`postgresql://postgres.${ref}:fixture%21password@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`;
 assert.equal(postgresConfiguration(uri,env.SUPABASE_URL).ssl.rejectUnauthorized,true);
 assert.equal(new URL(postgresConfiguration(uri+'?sslmode=require',env.SUPABASE_URL).connectionString).search,'');
 for(const bad of [uri.replace(':5432',':6543'),uri.replace('postgres.'+ref,'postgres.wrong'),uri.replace('.pooler.supabase.com','.example.com'),uri+'?ssl=false'])assert.throws(()=>postgresConfiguration(bad,env.SUPABASE_URL));
 assert.throws(()=>cloudSchema('../public'));
 assert.equal(pg.types.getTypeParser(1700)('500000')+500000,1_000_000);
 assert.throws(()=>pg.types.getTypeParser(1700)('0.1'),/UNSAFE_DATABASE_INTEGER/);
 assert.equal(betaStartupCode(Error('postgres://private-password@host')),'CONFIGURATION_OR_CONNECTION_FAILED');
 assert.equal(betaStartupCode(Error('DATABASE_URL_REQUIRED')),'DATABASE_URL_REQUIRED');
});
test('rolling-deploy standby waits for the existing instance before accepting paid work',async()=>{
 let queries=0,standby=0,released=false,lost,loss=0;
 const pool={connect:async()=>({on(event,fn){lost=fn;},async query(){return {rows:[{acquired:++queries>=3}]};},release(){released=true;}})};
 const lock=await acquireInstanceLock(pool,()=>loss++,{onStandby:async()=>standby++,waitMs:1000,retryMs:1});assert.equal(standby,1);assert.equal(queries,3);lock.assert();lost();assert.equal(loss,1);assert.throws(()=>lock.assert(),/LOCK_LOST/);await lock.close();assert.equal(released,true);
});
test('PostgreSQL transaction rollback and concurrency do not partially change balances',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'aiadcast-pg-')),pool=await pgPool(join(folder,'pg'));t.after(async()=>{await pool.end();rmSync(folder,{recursive:true,force:true});});
 const db=await new PostgresDatabase(pool,'aiadcast_accounts').initialize();await db.exec('CREATE TABLE counters(n INTEGER);INSERT INTO counters VALUES(0);');
 await assert.rejects(db.transaction(async()=>{await db.prepare('UPDATE counters SET n=n+1').run();throw Error('ROLLBACK_TEST');}),/ROLLBACK_TEST/);
 await Promise.all(Array.from({length:5},()=>db.transaction(async()=>{const old=await db.prepare('SELECT n FROM counters').get();await db.prepare('UPDATE counters SET n=?').run(old.n+1);})));assert.equal((await db.prepare('SELECT n FROM counters').get()).n,5);
});
test('cloud HTTP signup, role checks, project revisions and private storage survive a cold restart',async t=>{
 const mails=[],s=await setup(t,{accounts:{sendMail:async mail=>mails.push(mail)}});
 const auth=await s.call('/api/auth/email/request',{body:{email:'tester@example.com'}});assert.equal(auth.status,200,JSON.stringify(auth.data));assert.equal(mails.length,1);
 const token=new URL(mails[0].url).hash.match(/token=([^&]+)/)?.[1];assert.ok(token);
 const verified=await s.call('/api/auth/email/verify',{body:{token}});assert.equal(verified.status,200,JSON.stringify(verified.data));
 const signed=await s.call('/api/auth/email/exchange',{body:{requestId:auth.data.requestId,pollToken:auth.data.pollToken}});assert.equal(signed.status,200,JSON.stringify(signed.data));const a=signed.data.session;
 assert.equal((await s.call('/api/admin/overview',{token:a.token})).status,403);
 const b=await s.member('Other');const project={version:1,id:'project-private-001',name:'셀업랩스 광고',source};
 assert.equal((await s.call('/api/projects/'+project.id,{token:a.token,body:{project,revision:0}})).data.revision,1);
 assert.equal((await s.call('/api/projects/'+project.id,{token:b.token})).status,404);
 assert.equal((await s.call('/api/projects/'+project.id,{token:a.token,body:{project,revision:0}})).status,409);
 await s.restart();assert.equal((await s.call('/api/auth/me',{token:a.token})).status,200);
 const loaded=await s.call('/api/projects/'+project.id,{token:a.token});assert.equal(loaded.status,200,JSON.stringify(loaded.data));assert.deepEqual(loaded.data.project,project);
 const row=await s.app.store.db.prepare('SELECT json FROM projects WHERE id=?').get(project.id);assert.ok(!row.json.includes(source.data));
 const rl=await s.app.store.db.prepare("SELECT relrowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='aiadcast_accounts' AND relname='users'").get();assert.equal(rl.relrowsecurity,true);
});
test('cloud concurrent image retries call the provider once; credits, usage and artifact survive restart',async t=>{
 const s=await setup(t),a=await s.member('Owner',1_000_000,3),body=generation();
 const replies=await Promise.all([s.call('/api/generations',{token:a.token,body}),s.call('/api/generations',{token:a.token,body:{...body,requestId:randomUUID()}})]);
 for(const r of replies)assert.equal(r.status,202,JSON.stringify(r.data));assert.equal(replies[0].data.job.id,replies[1].data.job.id);
 const id=replies[0].data.job.id;let preview;
 for(let i=0;i<40;i++){preview=await s.call('/api/generations/'+id,{token:a.token});if(preview.data.job.state!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(preview.data.job.state,'ready',JSON.stringify(preview.data));assert.equal(s.calls(),1);
 const before=(await s.call('/api/status',{token:a.token})).data;assert.equal(before.wallet.reserved,1);assert.equal(before.budget.spentMicros,imageUsageCost(usage).microUsd);
 await s.restart();preview=await s.call('/api/generations/'+id,{token:a.token});assert.equal(preview.data.job.state,'ready');assert.equal(preview.data.job.artifact.dataUrl,source.data);
 const acceptBody={artifactId:preview.data.job.artifact.id};for(let i=0;i<2;i++)assert.equal((await s.call('/api/generations/'+id+'/accept',{token:a.token,body:acceptBody})).data.wallet.available,2);
 assert.equal((await s.call('/api/status',{token:a.token})).data.budget.spentMicros,before.budget.spentMicros);
 assert.equal(s.calls(),1);
});
test('cloud administrator credit grants are idempotent and allocations persist without resetting spend',async t=>{
 const s=await setup(t),invite=await s.app.store.provision({label:'Admin',credits:0});await s.app.store.setRole(invite.userId,'admin');
 const admin=(await s.call('/api/auth/login',{body:{invite:invite.invite}})).data,member=await s.member();
 assert.equal((await s.call('/api/admin/overview',{token:admin.token})).status,200);
 const body={userId:member.user.id,credits:3,requestId:'same-admin-grant'};
 for(let i=0;i<2;i++){const r=await s.call('/api/admin/grants',{token:admin.token,body});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.wallet.available,3);}
 const allocation=await s.call('/api/admin/allocations',{token:admin.token,body:{userId:member.user.id,budgetMicros:1_000_000}});assert.equal(allocation.status,200,JSON.stringify(allocation.data));
 await s.restart();assert.equal((await s.call('/api/status',{token:member.token})).data.budget.limitMicros,1_000_000);
 assert.equal((await s.call('/api/admin/grants',{token:admin.token,body})).data.wallet.available,3);
});
test('unknown provider outcomes persist the cost hold and do not dispatch again after restart',async t=>{
 let calls=0;const s=await setup(t,{adapter:{generate:async()=>{calls++;throw new ProviderFailure('fixture-timeout');}}}),a=await s.member('Tester',1_000_000,3),body=generation();
 const r=await s.call('/api/generations',{token:a.token,body});assert.equal(r.status,202,JSON.stringify(r.data));await s.restart();
 const status=await s.call('/api/status',{token:a.token});assert.equal(status.data.budget.heldMicros,500_000);assert.equal(status.data.wallet.available,3);
 const retry=await s.call('/api/generations',{token:a.token,body:{...body,requestId:randomUUID()}});assert.equal(retry.status,202);assert.equal(retry.data.job.state,'uncertain');assert.equal(calls,1);
});
test('private SQL bootstrap issues one-time owner invitations and cannot change an existing owner',async t=>{
 const s=await setup(t),sql='SELECT * FROM aiadcast_accounts.create_owner_invitation(?)';
 const i=await s.app.store.db.prepare(sql).get('selluplabs@gmail.com');assert.match(i.invite,/^[A-Za-z0-9_-]{43}$/);
 const login=await s.call('/api/auth/login',{body:{invite:i.invite}});assert.equal(login.status,200,JSON.stringify(login.data));assert.equal(login.data.user.role,'admin');
 assert.equal((await s.call('/api/auth/login',{body:{invite:i.invite}})).status,401);
 const status=await s.call('/api/status',{token:login.data.token});assert.equal(status.data.wallet.available,3);assert.equal(status.data.budget.limitMicros,1_000_000);
 await assert.rejects(s.app.store.db.prepare(sql).get('intruder@example.com'),/OWNER_ALREADY_EXISTS/);
 const fresh=await s.app.store.db.prepare(sql).get('selluplabs@gmail.com');assert.notEqual(fresh.invite,i.invite);assert.equal((await s.call('/api/auth/me',{token:login.data.token})).status,401);
 for(const role of ['public','anon','authenticated','service_role']){const permissions=await s.app.store.db.prepare("SELECT has_function_privilege(?,'aiadcast_accounts.create_owner_invitation(text)','EXECUTE') AS allowed").get(role);assert.equal(permissions.allowed,false);}
});
test('cloud test checkout confirms only once and preserves credits and orders after restart',async t=>{
 let receipt,calls=0;const provider={lookup:async()=>{if(!receipt){const e=Error('PAYMENT_NOT_FOUND');e.code='PAYMENT_NOT_FOUND';throw e;}return receipt;},confirm:async quote=>{calls++;receipt={...quote,currency:'KRW',totalAmount:quote.amount,status:'DONE'};return receipt;}};
 const s=await setup(t,{accounts:{provider,clientKey:'test_ck_fixture'}}),a=await s.member('Buyer');
 const order=await s.call('/api/checkout/orders',{token:a.token,body:{pack:'basic',requestId:'checkout-fixture',agreed:true}});assert.equal(order.status,201,JSON.stringify(order.data));
 const q=new URLSearchParams(new URL(order.data.checkoutUrl).hash.split('?')[1]),body={orderId:q.get('orderId'),ticket:q.get('ticket'),paymentKey:'test-payment-fixture',amount:order.data.amount};
 const responses=await Promise.all([s.call('/api/checkout/confirm',{body}),s.call('/api/checkout/confirm',{body})]);for(const r of responses)assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(calls,1);
 await s.restart();assert.equal((await s.call('/api/status',{token:a.token})).data.wallet.available,10);assert.equal((await s.call('/api/checkout/confirm',{body})).data.state,'paid');assert.equal(calls,1);
});
test('private storage reserves quota before upload and rejects corrupted bytes',async t=>{
 const s=await setup(t),a=await s.member('Storage tester'),storage=s.app.storage;
 const path=await storage.put(a.user.id,hash+'.png',bytes,'image/png');assert.deepEqual(await storage.get(a.user.id,path),bytes);
 await assert.rejects(storage.get(randomUUID(),path),/OWNER_MISMATCH/);
 await s.app.store.db.prepare('INSERT INTO storage_objects VALUES(?,?,?)').run(a.user.id+'/quota-fixture',a.user.id,100_000_000-bytes.length);
 const b=Buffer.from('extra'),second=hashBytes(b)+'.png',uploads=s.bucket.calls.filter(c=>c.method==='POST').length;
 await assert.rejects(storage.put(a.user.id,second,b,'image/png'),/STORAGE_LIMIT/);assert.equal(s.bucket.calls.filter(c=>c.method==='POST').length,uploads);
 await s.restart();const corrupt=Buffer.from(bytes);corrupt[0]^=1;s.bucket.objects.set(path,corrupt);
 await assert.rejects(s.app.storage.get(a.user.id,path),/CONTENT_MISMATCH/);
});
test('a lost ownership lock blocks subsequent database writes',async t=>{
 const folder=mkdtempSync(join(tmpdir(),'aiadcast-guard-')),pool=await pgPool(join(folder,'pg'));t.after(async()=>{await pool.end();rmSync(folder,{recursive:true,force:true});});
 let healthy=true;const db=await new PostgresDatabase(pool,'aiadcast_accounts',{guard:()=>{if(!healthy)throw Error('LOCK_LOST');}}).initialize();await db.exec('CREATE TABLE protected(n INTEGER);');healthy=false;
 await assert.rejects(db.prepare('INSERT INTO protected VALUES(?)').run(1),/LOCK_LOST/);
});
