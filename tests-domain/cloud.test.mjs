import manifest from '../package.json' with {type:'json'};
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import pg from 'pg';
import {PostgresDatabase,postgresConfiguration,cloudSchema,acquireInstanceLock} from '../server/cloud/postgres.mjs';
import {createCloudBackend} from '../server/cloud/beta.mjs';
import {OpenAIImageAdapter,ProviderFailure,IMAGE_MODEL,IMAGE_REVISION,hashBytes,imageUsageCost} from '../server/openai-image-adapter.mjs';
import {playAccountId} from '../server/play-billing.mjs';
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
async function pgPool(folder,fault={}){
 const engine=new PGlite(folder);await engine.waitReady;
 await engine.exec("DO $$ DECLARE r text;BEGIN FOREACH r IN ARRAY ARRAY['postgres','anon','authenticated','service_role'] LOOP IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I',r);END IF;END LOOP;END $$;");
 let tail=Promise.resolve(),closed=false;
 return {engine,async connect(){
  if(closed)throw Error('POOL_CLOSED');let unlock;const previous=tail;tail=new Promise(r=>unlock=r);await previous;
  let released=false,readyWrite=false;return {on(){},async query(sql,args=[]){
   fault.observeQuery?.(sql);
   const r=(!args.length&&sql.trim().split(';').filter(s=>s.trim()).length>1)?(await engine.exec(sql)).at(-1):await engine.query(sql,args);
   if(sql.includes("UPDATE jobs SET status='ready'"))readyWrite=true;
   if(sql==='COMMIT'&&readyWrite&&fault.loseReadyCommit){fault.loseReadyCommit=false;fault.lost=true;throw Error('fixture commit response lost');}
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
  if(u.pathname==='/storage/v1/object/list/aiadcast-private-beta'){const {prefix}=JSON.parse(o.body);return Response.json([...objects.keys()].filter(k=>k.startsWith(prefix)).map(k=>({name:k.slice(prefix.length)})));}
  const prefix='/storage/v1/object/aiadcast-private-beta';
  if(u.pathname.startsWith('/storage/v1/object/authenticated/aiadcast-private-beta/')){
   const p=u.pathname.slice('/storage/v1/object/authenticated/aiadcast-private-beta/'.length);
   return objects.has(p)?new Response(objects.get(p)):new Response('',{status:404});
  }
  if(u.pathname===prefix&&o.method==='DELETE'){for(const p of JSON.parse(o.body).prefixes)objects.delete(p);return Response.json({});}
  if(u.pathname.startsWith(prefix+'/')){
   const p=u.pathname.slice(prefix.length+1);
   if(o.method==='POST'){if(objects.has(p)&&o.headers['x-upsert']!=='true')return new Response('',{status:409});objects.set(p,Buffer.from(o.body));return Response.json({});}
   return objects.has(p)?new Response(objects.get(p)):new Response('',{status:404});
  }
  throw Error('UNEXPECTED_FIXTURE_ROUTE');
 };
 return {objects,calls,fetchImpl};
}
async function setup(t,{adapter,accounts,fault={}}={}){
 const folder=mkdtempSync(join(tmpdir(),'aiadcast-cloud-')),bucket=bucketFixture();let app,calls=0,customerGeneration=false;
 const defaultAdapter={generate:async()=>{calls++;return {bytes,mime:'image/png',width:8,height:8,sha256:hash,role:'background',usage,cost:imageUsageCost(usage),model:IMAGE_MODEL,revision:IMAGE_REVISION,providerRequestId:'fixture-provider'};}};
 const start=async()=>{
  app=await createCloudBackend(config,{...env,AIADCAST_CUSTOMER_GENERATION_ENABLED:String(customerGeneration)},{pool:await pgPool(join(folder,'pg'),fault),storageFetch:bucket.fetchImpl,adapter:adapter??defaultAdapter,accounts:accounts??{},staticDirectory:null,skipInstanceLock:true});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return app;
 };
 await start();t.after(async()=>{if(app)await app.close();rmSync(folder,{recursive:true,force:true});});
 const call=async(path,{token,body,requestOrigin=origin}={})=>{
  const r=await fetch('http://127.0.0.1:'+app.server.address().port+path,{method:body===undefined?'GET':'POST',headers:{Origin:requestOrigin,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json','X-Aiadcast-Client':'local-studio'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json()};
 };
 return {get app(){return app;},bucket,call,calls:()=>calls,async restart(enableCustomers=false){customerGeneration=enableCustomers;await app.close();app=null;return start();},async member(label='Tester',budgetMicros=0,credits=0){const i=await app.store.provision({label,budgetMicros,credits});const r=await call('/api/auth/login',{body:{invite:i.invite}});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}};
}
async function legacyProject(app,userId,project){
 const bytes=Buffer.from(JSON.stringify(project));
 const path=await app.storage.put(userId,'project-'+project.id+'-'+randomUUID()+'.json',bytes,'application/json');
 await app.store.db.prepare('INSERT INTO projects(user_id,id,revision,name,json,bytes,updated) VALUES(?,?,1,?,?,?,?)')
  .run(userId,project.id,project.name,JSON.stringify({storagePath:path,sha256:hashBytes(bytes)}),bytes.length,new Date().toISOString());
 return path;
}

async function activateMemberFunding(s,enableCustomers=false){
 const owner=await s.member('Lifetime budget owner');
 await s.call('/api/status',{token:owner.token});
 await s.app.store.setRole(owner.user.id,'admin');
 const ownerService=s.app.store.membership.jobs.get(owner.user.id);
 await ownerService.db.prepare("INSERT INTO supplier_budget_policy VALUES(1,?,100000000,'all-history',0,1)").run(owner.user.id);
 await s.app.store.db.exec('CREATE TABLE dimension_analysis_calls(id TEXT PRIMARY KEY,actor_id TEXT,state TEXT,hold BIGINT,actual BIGINT)');
 await s.app.store.sharedGenerationBudget.initialize(owner.user.id);
 // No environment opt-in on restart: a durable policy must never silently fall back.
 await s.restart(enableCustomers);return owner.user.id;
}
async function finishGeneration(s,token,body=generation()){
 const status=await s.call('/api/status',{token});assert.equal(status.status,200,JSON.stringify(status.data));
 const made=await s.call('/api/generations',{token,body:{...body,creditQuote:status.data.generation.creditQuote}});
 assert.equal(made.status,202,JSON.stringify(made.data));
 const user=await s.app.store.authenticate('Bearer '+token);
 await s.app.store.membership.jobs.get(user.id).waitForIdle();
 return s.call('/api/generations/'+made.data.job.id,{token});
}

async function emailCustomer(s,mails,email){
 const auth=await s.call('/api/auth/email/request',{body:{email}});
 assert.equal(auth.status,200);
 const token=new URL(mails.at(-1).url).hash.match(/token=([^&]+)/)?.[1];assert.ok(token);
 assert.equal((await s.call('/api/auth/email/verify',{body:{token}})).status,200);
 const signed=await s.call('/api/auth/email/exchange',{body:auth.data});assert.equal(signed.status,200);
 return signed.data.session;
}
test('commercial customers keep free and paid ads when the test budget is exhausted',async t=>{
 const mails=[];let buyer,consumed=false,isTest=false;
 const play={lookup:async()=>({obfuscatedExternalAccountId:playAccountId(buyer),...(isTest?{testPurchaseContext:{}}:{}),
  purchaseStateContext:{purchaseState:'PURCHASED'},productLineItem:[{productId:'credits_30',productOfferDetails:{quantity:1,consumptionState:consumed?'CONSUMPTION_STATE_CONSUMED':'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}]}),consume:async()=>{consumed=true;}};
 const s=await setup(t,{accounts:{sendMail:async mail=>mails.push(mail),play}});
 const owner=await activateMemberFunding(s,true),invite=await s.app.store.issueInvite(owner);
 const admin=(await s.call('/api/auth/login',{body:{invite:invite.invite}})).data;
 await s.call('/api/status',{token:admin.token});
 const ledger=s.app.store.membership.jobs.get(owner).ledger,jobId=randomUUID(),attemptId=randomUUID();
 await ledger.reserve({jobId,userId:'aiadcast-next-local-developer',credits:1,creditExempt:true,requestHash:'budget-fixture',modelRevision:'fixture',expiresAt:Date.now()+60000});
 await ledger.beginAttempt({jobId,attemptId,period:new Date().toISOString().slice(0,7),maximumMicros:500000,limitMicros:100000000,periodScoped:true});
 await ledger.settleAttempt(attemptId,100000000,'failed');await ledger.release(jobId,'aiadcast-next-local-developer','system_error');
 assert.equal((await s.call('/api/status',{token:admin.token})).data.generation.reason,'BUDGET_NOT_AVAILABLE');
 const {token,user}=await emailCustomer(s,mails,'customer-budget@example.com');buyer=user.id;
 const before=(await s.call('/api/status',{token})).data;
 assert.equal(before.generation.enabled,true);assert.equal(before.wallet.credits.available,10);assert.equal(before.budget.scope,'customer-entitlement');assert.equal(before.budget.limitMicros,0);
 const body=generation();assert.equal((await finishGeneration(s,token,body)).data.job.state,'ready');
 const again=await s.call('/api/generations',{token,body:{...body,creditQuote:before.generation.creditQuote}});assert.equal(again.data.reused,true);
 assert.equal(s.calls(),1);
 const customer=s.app.store.membership.jobs.get(user.id);
 await customer.recordTestPurchase({purchaseId:'fake-toss-fixture',unit:'credit-v2',credits:30});
 assert.equal((await s.call('/api/status',{token})).data.wallet.credits.available,0);
 isTest=true;const purchase=()=>s.call('/api/checkout/play/verify',{token,body:{token:'fixture-customer-purchase'}});
 assert.equal((await purchase()).status,409);isTest=false;
 for(let i=0;i<2;i++){const result=await purchase();assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.balance,30);}
 const paid=generation();paid.request.copy.title='Paid ad fixture';
 assert.equal((await finishGeneration(s,token,paid)).data.wallet.credits.available,20);
 const credits=await s.call('/api/account/credits',{token});assert.equal(credits.status,200);
 assert.equal(credits.data.wallet.credits.available,20);assert.deepEqual(credits.data.sales.map(x=>x.ads),[3]);assert.deepEqual(credits.data.orders,[]);
 assert.equal((await s.call('/api/checkout/orders',{token,body:{}})).status,403);
 const second=await emailCustomer(s,mails,'independent-budget@example.com');
 assert.equal((await s.call('/api/status',{token:second.token})).data.wallet.credits.available,10);
 await s.restart();
 assert.equal((await s.call('/api/status',{token})).data.wallet.credits.available,20);
 const result=await s.call('/api/admin/overview',{token:admin.token});assert.equal(result.status,200,JSON.stringify(result.data));
 const report=result.data;assert.equal(report.budget.spentMicros,100000000);assert.equal(report.budget.heldMicros,0);
 const member=report.users.find(u=>u.id===user.id);assert.equal(member.customerFunded,true);assert.equal(member.generation.enabled,true);assert.equal(member.wallet.credits.available,20);assert.equal(member.supplierBudget,undefined);
 assert.equal(report.operatingCosts.soldAds,3);assert.equal(report.operatingCosts.attempts,2);assert.equal(report.operatingCosts.duplicateRequests,1);
 assert.equal(report.operatingCosts.spentMicros,2*imageUsageCost(usage).microUsd);assert.equal(report.operatingCosts.heldMicros,0);assert.equal(s.calls(),2);
});

test('receipt numbering backfills prior cases in Seoul date order and survives reinitialization',async t=>{
 const db=new PGlite();await db.waitReady;t.after(()=>db.close());
 await db.exec("CREATE SCHEMA aiadcast_accounts;SET search_path TO aiadcast_accounts,pg_catalog; CREATE TABLE protected_complaints(case_id text PRIMARY KEY,received_at timestamptz NOT NULL,description text NOT NULL,resolution text,erase_at timestamptz NOT NULL)");
 const add=(key,time)=>db.query("INSERT INTO protected_complaints(case_id,received_at,description,erase_at) VALUES($1,$2,'fixture',now()+interval '3 years')",[key,time]);
 await add('after','2026-11-18T15:00:00Z');await add('before','2026-11-18T14:59:59Z');
 const migration=readFileSync(new URL('../server/cloud/commerce-records.sql',import.meta.url),'utf8');
 await db.exec(migration);await db.exec(migration);await add('next','2026-11-18T15:00:01Z');
 const {rows}=await db.query('SELECT case_id,receipt_no FROM protected_complaints ORDER BY received_at');
 assert.deepEqual(rows.map(row=>row.receipt_no),['20261118-0001','20261119-0001','20261119-0002']);
 assert.deepEqual(rows.map(row=>row.case_id),['before','after','next']);
});

test('retained order and complaint evidence survives withdrawal and expires independently',async t=>{
 const orderNo='GPA.retention-fixture',mails=[],key='fixture-retained-receipt',paidAt='2026-10-20T10:00:00.000Z';
 const money=units=>({currencyCode:'KRW',units:String(units)});
 let buyer,consumed=false,partial=false;
 const play={
  lookup:async()=>({orderId:orderNo,obfuscatedExternalAccountId:playAccountId(buyer),purchaseStateContext:{purchaseState:'PURCHASED'},
   productLineItem:[{productId:'credits_30',productOfferDetails:{quantity:1,consumptionState:consumed?'CONSUMPTION_STATE_CONSUMED':'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}]}),
  consume:async()=>{consumed=true;},
  order:async()=>({orderId:orderNo,purchaseToken:key,createTime:paidAt,lastEventTime:partial?'2026-10-21T12:00:00Z':paidAt,
   state:partial?'PARTIALLY_REFUNDED':'PROCESSED',lineItems:[{productId:'credits_30'}],total:money(2700),
   orderHistory:{partialRefundEvents:partial?[{processTime:'2026-10-21T12:00:00Z',state:'PROCESSED_SUCCESSFULLY',refundDetails:{total:money(900)}}]:[]}})
 };
 const s=await setup(t,{accounts:{sendMail:async m=>mails.push(m),play}});
 const owner=await activateMemberFunding(s,true),invite=await s.app.store.issueInvite(owner);
 const admin=(await s.call('/api/auth/login',{body:{invite:invite.invite}})).data.token;
 const customer=await emailCustomer(s,mails,'retention@example.com'),other=await s.member('Other');
 buyer=customer.user.id;const token=customer.token,base='/api/membership/records/';
 const call=(route,actor,body)=>s.call(base+route,{token:actor,...(body?{body}:{})});
 const purchase=()=>s.call('/api/checkout/play/verify',{token,body:{token:key}});
 for(let i=0;i<2;i++){const r=await purchase();assert.equal(r.status,200,JSON.stringify(r.data));}
 for(let i=0;i<2;i++){const g=generation();g.request.copy.title='Delivery '+i;assert.equal((await finishGeneration(s,token,g)).data.job.state,'ready');}
 const lookup=async key=>(await call('lookup',admin,{key})).data;
 const [o]=(await lookup(orderNo)).orders;assert.equal(o.ads,3);assert.equal(o.delivered,1);assert.equal(o.remaining,2);
 assert.equal(o.paid,'2700000000000');assert.equal(o.estimated,'1800000000000');assert.equal(o.refunded,'0');
 const input={orderNo,description:'환불 검토를 요청합니다.',category:'refund',requestId:randomUUID()};
 assert.equal((await call('lookup',other.token,{key:orderNo})).status,403);
 assert.equal((await call('cases',other.token,input)).status,404);
 const receipt=(await call('cases',token,input)).data.caseId;assert.match(receipt,/^\d{8}-\d{4,}$/);
 assert.equal((await call('cases',token,input)).data.caseId,receipt);
 assert.equal((await lookup('CS-'+input.requestId)).cases[0].case_id,receipt);
 const otherCases=await Promise.all(['first','second'].map(description=>call('cases',token,{category:'complaint',description,requestId:randomUUID()})));
 assert.ok(otherCases.every(r=>r.status===200),JSON.stringify(otherCases));
 const serials=otherCases.map(r=>r.data.caseId);
 const initial=Number(receipt.split('-')[1]);
 assert.deepEqual(serials.map(id=>Number(id.split('-')[1])).sort((a,b)=>a-b),[initial+1,initial+2]);
 const w=await s.call('/api/membership/withdraw',{token,body:{confirm:'delete-my-account',requestRefund:true}});
 assert.equal(w.status,200,JSON.stringify(w.data));assert.deepEqual(w.data.cases,[receipt]);
 await s.app.store.membership.run();
 const db=s.app.store.db;
 for(const table of ['users','commerce_order_links','complaint_member_links']){
  const column=table==='users'?'id':'account_id';
  assert.equal(await db.prepare('SELECT 1 FROM '+table+' WHERE '+column+'=?').get(buyer),undefined);
 }
 assert.equal((await call('mine',token)).status,401);
 const rejoined=await emailCustomer(s,mails,'retention@example.com');assert.deepEqual((await call('mine',rejoined.token)).data,{orders:[],cases:[]});
 assert.equal((await lookup(receipt)).orders[0].delivered,1);
 partial=true;const refreshed=await call('sync',admin,{orderNo});assert.equal(refreshed.status,200,JSON.stringify(refreshed.data));
 assert.equal(refreshed.data.order.refunded,'900000000000');assert.equal(refreshed.data.order.refunds.length,1);
 await call('sync',admin,{orderNo});assert.equal((await lookup(orderNo)).orders[0].refunds.length,1);
 assert.equal((await call('resolve',admin,{caseId:receipt,resolution:'결제처 환불 내역을 확인했습니다.'})).status,200);
 assert.ok((await lookup(orderNo)).cases[0].resolved_at);
 assert.equal((await db.prepare("SELECT erase_at>=resolved_at+interval '3 years' AS ok FROM protected_complaints WHERE receipt_no=?").get(receipt)).ok,true);
 await db.prepare("UPDATE protected_complaints SET erase_at=now()-interval '1 second' WHERE receipt_no=?").run(receipt);
 await s.app.store.membership.sweep();assert.equal((await lookup(orderNo)).cases.length,0);assert.equal((await lookup(orderNo)).orders[0].refund_requests.length,1);
 await db.prepare("UPDATE commerce_orders SET erase_at=now()-interval '1 second' WHERE order_no=?").run(orderNo);
 await s.app.store.membership.sweep();
 for(const table of ['commerce_orders','commerce_deliveries','commerce_withdrawals'])assert.equal(await db.prepare('SELECT 1 FROM '+table+' WHERE order_no=?').get(orderNo),undefined);
});

test('commercial customer failure restores ad and retains uncertain operating cost across restart',async t=>{
 const mails=[];let unknown=false,calls=0;
 const adapter={generate:async()=>{calls++;if(unknown)throw Error('fixture lost response');throw new ProviderFailure('FIXTURE_REJECTED',{uncertain:false});}};
 const s=await setup(t,{adapter,accounts:{sendMail:async mail=>mails.push(mail)}});
 const owner=await activateMemberFunding(s,true),invite=await s.app.store.issueInvite(owner);
 const admin=(await s.call('/api/auth/login',{body:{invite:invite.invite}})).data;
 const {token,user}=await emailCustomer(s,mails,'customer-failure@example.com');
 const failed=await finishGeneration(s,token);assert.equal(failed.data.job.state,'failed');assert.equal(failed.data.wallet.credits.available,10);
 unknown=true;const body=generation();body.request.copy.title='Lost response fixture';
 const uncertain=await finishGeneration(s,token,body);assert.equal(uncertain.data.job.state,'uncertain');assert.equal(uncertain.data.wallet.credits.available,10);
 await s.restart();
 const retry=await s.call('/api/generations',{token,body:{...body,creditQuote:(await s.call('/api/status',{token})).data.generation.creditQuote}});
 assert.equal(retry.data.reused,true);assert.equal(calls,2);
 const adminOverview=async()=>{const r=await s.call('/api/admin/overview',{token:admin.token});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 const report=await adminOverview();assert.equal(report.budget.heldMicros,0);assert.equal(report.operatingCosts.heldMicros,500000);
 assert.equal(report.operatingCosts.uncertain,1);assert.equal(report.operatingCosts.duplicateRequests,1);
 await s.app.store.db.prepare(`INSERT INTO customer_image_costs(attempt_id,job_id,account_id,maximum,state,actual)
  SELECT 'fixture-attempt-'||n,'fixture-job-'||n,?,500000,'completed',50000 FROM generate_series(1,30) n`).run(user.id);
 const alerts=(await adminOverview()).operatingCosts;assert.equal(alerts.burstAccounts,1);assert.equal(alerts.costSpike,true);
 assert.equal((await s.call('/api/status',{token})).data.generation.enabled,true);
});

test('shared member budget connects signup, free generation, verified Play purchase and restart without manual allocation',async t=>{
 let buyer,consumed=false;
 const play={lookup:async()=>({obfuscatedExternalAccountId:playAccountId(buyer),purchaseStateContext:{purchaseState:'PURCHASED'},productLineItem:[{productId:'credits_30',productOfferDetails:{quantity:1,consumptionState:consumed?'CONSUMPTION_STATE_CONSUMED':'CONSUMPTION_STATE_YET_TO_BE_CONSUMED'}}]}),consume:async()=>{consumed=true;}};
 const s=await setup(t,{accounts:{password:{enabled:true},play}});const ownerId=await activateMemberFunding(s);
 const signup=await s.call('/api/auth/test/signup',{body:{email:'funded-member@example.com',password:'Fixture-funded-1234',budget:100000000,role:'admin'}});
 assert.equal(signup.status,200,JSON.stringify(signup.data));const {token,user}=signup.data;buyer=user.id;
 const before=(await s.call('/api/status',{token})).data;
 assert.equal(before.generation.enabled,true);assert.equal(before.budget.scope,'lifetime');assert.equal(before.wallet.credits.available,10);
 assert.equal((await s.app.store.db.prepare('SELECT budget FROM users WHERE id=?').get(user.id)).budget,0);
 const free=await finishGeneration(s,token);assert.equal(free.data.job.state,'ready');assert.equal(free.data.wallet.credits.available,0);
 assert.equal((await s.call('/api/status',{token})).data.generation.reason,'NO_TEST_CREDITS');
 for(let i=0;i<2;i++){
  const paid=await s.call('/api/checkout/play/verify',{token,body:{token:'fixture-funding-purchase',credits:99999}});
  assert.equal(paid.status,200,JSON.stringify(paid.data));assert.equal(paid.data.balance,30);
 }
 const second=generation();second.projectId='second-paid-project';second.request.copy.title='새로운 광고';
 const paidAd=await finishGeneration(s,token,second);assert.equal(paidAd.data.job.state,'ready');assert.equal(paidAd.data.wallet.credits.available,20);
 const cost=(await s.app.store.sharedGenerationBudget.snapshot()).spentMicros;assert.ok(cost>0);
 const invite=await s.app.store.issueInvite(ownerId),ownerLogin=await s.call('/api/auth/login',{body:{invite:invite.invite}});
 const overview=await s.call('/api/admin/overview',{token:ownerLogin.data.token});
 assert.equal(overview.status,200,JSON.stringify(overview.data));assert.equal(overview.data.budget.shared,true);
 assert.equal(overview.data.budget.spentMicros,cost);assert.equal(overview.data.budget.limitMicros,100000000);
 assert.equal(overview.data.users.find(u=>u.id===user.id).generation.enabled,true);
 await s.restart();const after=(await s.call('/api/status',{token})).data;
 assert.equal(after.generation.enabled,true);assert.equal(after.wallet.credits.available,20);assert.equal(after.budget.spentMicros,cost);assert.equal(s.calls(),2);
});

test('shared member budget restores free credit on provider failure and preserves uncertain costs across restart',async t=>{
 let calls=0,unknown=false;
 const s=await setup(t,{accounts:{password:{enabled:true}},adapter:{generate:async()=>{calls++;if(unknown)throw Error('fixture lost response');throw new ProviderFailure('FIXTURE_REJECTED',{uncertain:false});}}});
 await activateMemberFunding(s);
 const {data:{token}}=await s.call('/api/auth/test/signup',{body:{email:'failed-funded@example.com',password:'Fixture-failed-1234'}});
 let result=await finishGeneration(s,token);assert.equal(result.data.job.state,'failed');assert.equal(result.data.wallet.credits.available,10);
 assert.equal((await s.app.store.sharedGenerationBudget.snapshot()).heldMicros,0);
 unknown=true;const body=generation();body.request.copy.title='다른 요청';result=await finishGeneration(s,token,body);
 assert.equal(result.data.job.state,'uncertain');assert.equal(result.data.wallet.credits.available,10);
 await s.restart();assert.equal((await s.app.store.sharedGenerationBudget.snapshot()).heldMicros,500000);
 const retry=await s.call('/api/generations',{token,body:{...body,creditQuote:(await s.call('/api/status',{token})).data.generation.creditQuote}});
 assert.equal(retry.status,202);assert.equal(retry.data.reused,true);assert.equal(calls,2);
});

test('shared member withdrawal deletes signup eligibility while retaining cumulative supplier cost',async t=>{
 const s=await setup(t,{accounts:{password:{enabled:true}}});await activateMemberFunding(s);
 const {data:{token,user}}=await s.call('/api/auth/test/signup',{body:{email:'leaving-funded@example.com',password:'Fixture-leaving-1234'}});
 const made=await finishGeneration(s,token);assert.equal(made.data.job.state,'ready');
 const before=await s.app.store.sharedGenerationBudget.snapshot();
 assert.equal((await s.call('/api/membership/withdraw',{token,body:{confirm:'delete-my-account'}})).status,200);
 await s.app.store.membership.run();
 assert.equal(await s.app.store.db.prepare('SELECT id FROM users WHERE id=?').get(user.id),undefined);
 assert.equal(await s.app.store.db.prepare('SELECT user_id FROM welcome_ad_eligibility WHERE user_id=?').get(user.id),undefined);
 const after=await s.app.store.sharedGenerationBudget.snapshot();assert.equal(after.spentMicros,before.spentMicros);assert.equal(after.heldMicros,before.heldMicros);
 await s.restart();assert.equal((await s.app.store.sharedGenerationBudget.snapshot()).spentMicros,before.spentMicros);
});

test('new signup welcome ad is granted once across concurrent reads and cloud restart',async t=>{
 const s=await setup(t,{accounts:{password:{enabled:true}}});
 const signup=await s.call('/api/auth/test/signup',{body:{email:'welcome-cloud@example.com',password:'Fixture-member-1234',credits:999}});
 assert.equal(signup.status,200,JSON.stringify(signup.data));
 const {token,user}=signup.data;
 for(const result of await Promise.all(Array.from({length:3},()=>s.call('/api/status',{token})))){
  assert.equal(result.status,200,JSON.stringify(result.data));
  assert.deepEqual(result.data.wallet.credits,{available:10,reserved:0});
 }
 await s.app.store.setAllocation(user.id,500000);
 const status=(await s.call('/api/status',{token})).data;
 const made=await s.call('/api/generations',{token,body:{...generation(),creditQuote:status.generation.creditQuote}});
 assert.equal(made.status,202,JSON.stringify(made.data));
 let result;
 for(let i=0;i<100;i++){
  result=await s.call('/api/generations/'+made.data.job.id,{token});
  if(result.data.job.state!=='running')break;
  await new Promise(r=>setTimeout(r,10));
 }
 assert.equal(result.data.job.state,'ready');
 assert.deepEqual(result.data.wallet.credits,{available:0,reserved:0});
 await s.restart();
 assert.deepEqual((await s.call('/api/status',{token})).data.wallet.credits,{available:0,reserved:0});
 assert.equal(s.calls(),1);
});
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
 const p={version:1,id:'password-project',name:'Saved test'};assert.equal((await s.call('/api/projects/'+p.id,{token:admin.token,body:{project:p,revision:0}})).status,403);
 assert.equal((await s.call('/api/projects/'+p.id,{token:member.token})).status,404);
 await s.restart();
 assert.equal((await s.call('/api/projects/'+p.id,{token:admin.token})).status,404);
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
test('cloud HTTP signup, role checks, read-only legacy projects and private storage survive a cold restart',async t=>{
 const mails=[],s=await setup(t,{accounts:{sendMail:async mail=>mails.push(mail)}});
 const auth=await s.call('/api/auth/email/request',{body:{email:'tester@example.com'}});assert.equal(auth.status,200,JSON.stringify(auth.data));assert.equal(mails.length,1);
 const token=new URL(mails[0].url).hash.match(/token=([^&]+)/)?.[1];assert.ok(token);
 const pending=await s.call('/api/auth/email/exchange',{body:auth.data});assert.deepEqual(pending.data,{state:'pending'});assert.equal((await s.call('/api/projects')).status,401);assert.equal((await s.call('/api/auth/test/signup',{body:{email:'unverified@example.com',password:'Fixture-password!'}})).status,503);
 const verified=await s.call('/api/auth/email/verify',{body:{token}});assert.equal(verified.status,200,JSON.stringify(verified.data));
 const signed=await s.call('/api/auth/email/exchange',{body:{requestId:auth.data.requestId,pollToken:auth.data.pollToken}});assert.equal(signed.status,200,JSON.stringify(signed.data));const a=signed.data.session;
 assert.equal((await s.call('/api/auth/email/exchange',{body:auth.data})).status,401);assert.equal((await s.call('/api/auth/email/verify',{body:{token}})).status,401);
 assert.equal((await s.call('/api/admin/overview',{token:a.token})).status,403);
 await s.app.store.db.prepare("UPDATE users SET storage_plan='standard' WHERE id=?").run(a.user.id);
 const b=await s.member('Other');const project={version:1,id:'project-private-001',name:'셀업랩스 광고',source};
 assert.equal((await s.call('/api/projects/'+project.id,{token:a.token,body:{project,revision:0}})).status,403);
 await legacyProject(s.app,a.user.id,project);
 assert.equal((await s.call('/api/projects/'+project.id,{token:b.token})).status,404);
 assert.equal((await s.call('/api/projects/'+project.id,{token:a.token,body:{project,revision:0}})).status,403);
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
 const order=await s.call('/api/checkout/orders',{token:a.token,body:{pack:'credits-v2-100',requestId:'checkout-fixture',agreed:true}});assert.equal(order.status,201,JSON.stringify(order.data));
 const q=new URLSearchParams(new URL(order.data.checkoutUrl).hash.split('?')[1]),body={orderId:q.get('orderId'),ticket:q.get('ticket'),paymentKey:'test-payment-fixture',amount:order.data.amount};
 const responses=await Promise.all([s.call('/api/checkout/confirm',{body}),s.call('/api/checkout/confirm',{body})]);for(const r of responses)assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(calls,1);
 const verified=await s.call('/api/checkout/receipt',{body:{orderId:body.orderId,ticket:body.ticket}});assert.equal(verified.status,200,JSON.stringify(verified.data));assert.deepEqual(verified.data.receipt,{grantedCredits:100,balance:100,verified:true,unit:'credit-v2'});
 await s.restart();assert.equal((await s.call('/api/status',{token:a.token})).data.wallet.credits.available,100);assert.equal((await s.call('/api/checkout/confirm',{body})).data.state,'paid');assert.equal(calls,1);
});
test('cloud wallet reconciles a missed callback and returns the paid purchase and updated balance together',async t=>{
 let receipt,lookups=0,confirms=0;
 const provider={lookup:async()=>{lookups++;return receipt;},confirm:async()=>{confirms++;throw Error('Unexpected approval');}};
 const s=await setup(t,{accounts:{provider,clientKey:'test_ck_fixture'}}),a=await s.member('Wallet buyer');
 const order=(await s.call('/api/checkout/orders',{token:a.token,body:{pack:'credits-v2-100',requestId:'missing-callback',agreed:true}})).data;
 receipt={orderId:order.id,paymentKey:'simulated-approved',currency:'KRW',totalAmount:order.amount,status:'DONE'};
 for(let i=0;i<2;i++){
  const response=await s.call('/api/account/credits',{token:a.token});
  assert.equal(response.status,200);assert.equal(response.data.orders[0].state,'paid');
  assert.equal(response.data.wallet.credits.available,100);
 }
 assert.equal(lookups,1);assert.equal(confirms,0);
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
test('cloud planar generation keeps raw and corrected private artifacts and measured variant through restart',async t=>{
 const {OpenAIImageAdapter}=await import('../server/openai-image-adapter.mjs');const {newProject}=await import('../src/model.ts');const {buildGenerationRequest}=await import('../src/generation.ts');let calls=0;
 const raw=await sharp(Buffer.from('<svg width="1024" height="1024"><rect width="1024" height="1024" fill="white"/><rect x="200" y="260" width="600" height="340" fill="#305060"/></svg>')).png().toBuffer();
 const adapter=new OpenAIImageAdapter({apiKey:'local-fixture-only',fetchImpl:async()=>{calls++;return Response.json({data:[{b64_json:raw.toString('base64')}],usage});}});
 const s=await setup(t,{adapter}),member=await s.member('Variant tester',1000000,1),p=newProject();const photo=await sharp(Buffer.from('<svg width="300" height="300"><rect width="300" height="300" fill="white"/><rect x="50" y="60" width="180" height="120" fill="#305060"/></svg>')).png().toBuffer();
 p.product={name:'flat.png',data:'data:image/png;base64,'+photo.toString('base64'),sha256:hashBytes(photo),width:300,height:300};p.productProfile.specType='flat';p.dimensions.width='180';p.dimensions.depth='120';p.generation={mode:'creative',brief:'Flat product',dimensionBased:true,dimensionVariant:'A',planarSourceHash:p.product.sha256};
 const body={requestId:randomUUID(),projectId:p.id,request:buildGenerationRequest(p),source:p.product};const created=await s.call('/api/generations',{token:member.token,body});assert.equal(created.status,202,JSON.stringify(created.data));
 let job;for(let i=0;i<100;i++){job=(await s.call('/api/generations/'+created.data.job.id,{token:member.token})).data.job;if(job.state!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(job.state,'ready');assert.equal(job.planarReport.state,'adjusted');assert.equal(job.planarOriginal.sha256,hashBytes(raw));assert.equal(job.dimensionPlan.variantLabel,'A');assert.notEqual(job.artifactId,job.planarOriginal.sha256);
 assert.equal((await s.call('/api/generations/'+job.id+'/accept',{token:member.token,body:{artifactId:job.artifactId}})).status,200);await s.restart();const restored=(await s.call('/api/generations/'+job.id,{token:member.token})).data.job;assert.equal(restored.state,'accepted');assert.deepEqual(restored.planarOriginal,job.planarOriginal);assert.deepEqual(restored.dimensionPlan,job.dimensionPlan);assert.deepEqual(restored.artifact,job.artifact);assert.equal(calls,1);
});

test('cloud dimension analysis budget persists in the shared account schema and serializes competing reservations',async()=>{
 const {CloudVisionLedger}=await import('../server/vision-evaluation/cloud-ledger.mjs');
 const pool=await pgPool();try{
  const db=await new PostgresDatabase(pool,'aiadcast_accounts').initialize();
  const first=await new CloudVisionLedger().initialize(db),second=await new CloudVisionLedger().initialize(db);
  const attempts=await Promise.allSettled([first.reserve('22932.jpg',hash),second.reserve('22935.jpg',hash)]);
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(attempts.filter(r=>r.status==='rejected').length,1);
  const id=attempts.find(r=>r.status==='fulfilled').value;await first.settle(id,1000);
  for(let i=1;i<10;i++){const restarted=await new CloudVisionLedger().initialize(db);await restarted.settle(await restarted.reserve(i%2?'22935.jpg':'22932.jpg',hash),1000);}
  const restored=await new CloudVisionLedger().initialize(db);assert.equal((await restored.rows()).length,10);await assert.rejects(restored.reserve('22932.jpg',hash),/APPROVAL_LIMIT/);
 }finally{await pool.end();}
});

test('reference evaluation GET is read-only; duplicate submissions and restarts recover one durable result',async()=>{
 const {CloudVisionLedger,readCloudEvaluation}=await import('../server/vision-evaluation/cloud-ledger.mjs');
 const {dimensionAnalysisService}=await import('../server/vision-evaluation/service.mjs');
 const pool=await pgPool();try{
  const db=await new PostgresDatabase(pool,'aiadcast_accounts').initialize();
  const absent=await readCloudEvaluation(db,'admin-one');assert.equal(absent.ledgerExists,false);assert.equal(absent.usedCalls,null);
  assert.equal((await db.prepare("SELECT to_regclass('aiadcast_accounts.dimension_analysis_calls') AS name").get()).name,null);
  let calls=0,release,entered;const started=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
  const make=()=>dimensionAnalysisService({evaluationEnabled:true,apiKey:'local-mock-only',references:[{name:'22932.jpg',bytes:bytes.length}],approvedHashes:{'22932.jpg':hash},statusReader:(actor,id)=>readCloudEvaluation(db,actor,id),ledgerFactory:()=>new CloudVisionLedger().initialize(db),analyze:async({ledger,target})=>{
   const id=await ledger.reserve(target,hash);calls++;entered();await wait;await ledger.settle(id,1000);return {proposal:{located:true,product:[.1,.2,.4,.35],axes:{width:[[.12,.5],[.36,.5]],depth:[[.36,.5],[.48,.4]],height:[[.48,.4],[.48,.22]]},protectedText:[],existingAnnotations:[],inset:[.65,.35,.3,.4]}};
  }});
  const a=make(),b=make(),admin={id:'admin-one',role:'admin'},request={requestId:'request_reference_0001',source};
  await assert.rejects(a.status({role:'member'}),e=>e.code==='EVALUATION_ADMIN_ONLY');
  assert.equal((await a.status(admin)).available,true);assert.equal(a.capability(admin).available,false);
  const first=a.analyze(request,admin);await started;
  const duplicate=await b.analyze(request,admin);assert.equal(duplicate.state,'pending');assert.equal(calls,1);
  const pending=await b.status(admin,request.requestId);assert.equal(pending.available,false);assert.equal(pending.budget.usedCalls,1);assert.equal(pending.budget.allowanceUsedMicros,30000);assert.equal(pending.budget.unresolvedCalls,1);
  assert.equal((await b.status({id:'admin-two',role:'admin'},request.requestId)).budget.request,null);
  release();const result=await first;assert.equal(result.state,'ready');
  const restarted=make();assert.deepEqual(await restarted.analyze(request,admin),result);assert.equal(calls,1);
  const status=await restarted.status(admin,request.requestId);assert.deepEqual(status.budget.request,result);assert.equal(status.budget.knownCostMicros,1000);assert.equal(status.budget.unresolvedCalls,0);assert.equal(status.budget.usedCalls,1);
  const ledger=await new CloudVisionLedger().initialize(db),id=await ledger.reserve('22935.jpg',hash,{id:'uncertain_request_0002',actor:admin.id});await ledger.settle(id,null);await ledger.finish(admin.id,'uncertain_request_0002',{state:'failed'});
  assert.equal((await restarted.status(admin)).available,false);await assert.rejects(ledger.reserve('22932.jpg',hash),/RECONCILE_REQUIRED/);
 }finally{await pool.end();}
});

test('single approved box has its own one-call durable ledger, no GET writes and no reset of reference allowance',async()=>{
 const {SingleBoxLedger,readSingleBoxEvaluation}=await import('../server/vision-evaluation/single-box-ledger.mjs');
 const {CloudVisionLedger}=await import('../server/vision-evaluation/cloud-ledger.mjs');
 const {BOX_REFERENCE}=await import('../server/vision-evaluation/single-box-approval.mjs');
 const pool=await pgPool();try{
  const db=await new PostgresDatabase(pool,'aiadcast_accounts').initialize();
  assert.equal((await readSingleBoxEvaluation(db,'admin-one')).ledgerExists,false);
  assert.equal((await db.prepare("SELECT to_regclass('aiadcast_accounts.dimension_analysis_calls') AS name").get()).name,null);
  const original=await new CloudVisionLedger().initialize(db),oldId=await original.reserve('22932.jpg',hash);await original.settle(oldId,1000);
  const a=await new SingleBoxLedger().initialize(db),b=await new SingleBoxLedger().initialize(db),request={id:'single_box_request_0001',actor:'admin-one'};
  await assert.rejects(a.reserve('22986.png',hash,request),/UNAUTHORIZED_IMAGE/);
  const runs=await Promise.allSettled([a.reserve('22986.png',BOX_REFERENCE.sha256,request),b.reserve('22986.png',BOX_REFERENCE.sha256,{...request,id:'single_box_request_0002'})]);assert.equal(runs.filter(r=>r.status==='fulfilled').length,1);
  const row=(await a.rows())[0];assert.equal(row.hold,30000);await a.settle(row.id,null);await a.finish(row.actor_id,row.request_id,{state:'failed',reason:'COST_RECONCILIATION_REQUIRED'});
  const restarted=await new SingleBoxLedger().initialize(db);await assert.rejects(restarted.reserve('22986.png',BOX_REFERENCE.sha256,{...request,id:'single_box_request_0003'}),/RECONCILE_REQUIRED/);
  const status=await readSingleBoxEvaluation(db,row.actor_id,row.request_id);assert.equal(status.remainingCalls,0);assert.equal(status.unresolvedCalls,1);assert.equal(status.allowanceUsedMicros,30000);assert.equal(status.request.reason,'COST_RECONCILIATION_REQUIRED');
  assert.equal((await original.rows()).length,1);await original.reserve('22935.jpg',hash);assert.equal((await restarted.rows()).length,1);
 }finally{await pool.end();}
});

test('settled single-box approval cannot spend its unused balance on a second analysis',async()=>{
 const {SingleBoxLedger,readSingleBoxEvaluation}=await import('../server/vision-evaluation/single-box-ledger.mjs');const {BOX_REFERENCE}=await import('../server/vision-evaluation/single-box-approval.mjs');
 const pool=await pgPool();try{const db=await new PostgresDatabase(pool,'aiadcast_accounts').initialize(),ledger=await new SingleBoxLedger().initialize(db),actor='single-admin',id='single_known_request_0001';
 const call=await ledger.reserve('22986.png',BOX_REFERENCE.sha256,{id,actor});await ledger.settle(call,1000);await ledger.finish(actor,id,{requestId:id,sourceHash:BOX_REFERENCE.sha256,state:'ready',verified:false});
 const restored=await new SingleBoxLedger().initialize(db);assert.equal((await readSingleBoxEvaluation(db,actor,id)).request.state,'ready');await assert.rejects(restored.reserve('22986.png',BOX_REFERENCE.sha256,{id:'single_known_request_0002',actor}),/APPROVAL_LIMIT/);assert.equal((await restored.rows()).length,1);
 }finally{await pool.end();}
});

test('cloud text-only product jobs omit photos, enforce ownership and keep a single charge after cold restart',async t=>{
 const {starterProject,prepareCampaign}=await import('../src/consumer-campaign.ts');const {withGenerationInput}=await import('../src/generation-input.ts');const {buildGenerationRequest}=await import('../src/generation.ts');
 let calls=0;const s=await setup(t,{adapter:{generate:async options=>{calls++;assert.equal(options.source,null);assert.deepEqual(options.references,[]);return {bytes,mime:'image/png',width:8,height:8,sha256:hash,role:'creative',composition:'complete-ad',usage:{},cost:{microUsd:1},model:'fixture'};}}});
 const member=await s.member('Text examples',1000000,3),other=await s.member('Other',0,0),token=member.token;
 let p=starterProject('other');p=prepareCampaign(withGenerationInput({...p,productName:'텀블러',productProfile:{...p.productProfile,material:'450mL 스테인리스'}},'text-example'));
 const body={projectId:p.id,requestId:randomUUID(),request:buildGenerationRequest(p),source:null,references:[]};assert.equal((await s.call('/api/status',{token})).data.generation.textExamples,true);
 const bad=await s.call('/api/generations',{token,body:{...body,source}});assert.equal(bad.data.error.code,'TEXT_EXAMPLE_PHOTOS_NOT_ALLOWED');assert.equal(calls,0);
 const [a,b]=await Promise.all([s.call('/api/generations',{token,body}),s.call('/api/generations',{token,body})]);assert.equal(a.status,202,JSON.stringify(a.data));assert.equal(a.data.job.id,b.data.job.id);const id=a.data.job.id;let pending;for(let i=0;i<100;i++){pending=(await s.call('/api/generations/'+id,{token})).data.job;if(pending.state!=='running')break;await new Promise(r=>setTimeout(r,5));}assert.equal(pending.state,'ready');assert.equal(calls,1);
 assert.equal((await s.call('/api/generations/'+id,{token:other.token})).status,404);
 await s.restart();const ready=(await s.call('/api/generations/'+id,{token})).data.job;assert.equal(ready.inputMode,'text-example');assert.equal(ready.sourceHash,null);assert.equal(ready.state,'ready');
 for(let i=0;i<2;i++)assert.equal((await s.call('/api/generations/'+id+'/accept',{token,body:{artifactId:ready.artifactId}})).status,200);
 const status=(await s.call('/api/status',{token})).data;assert.equal(status.wallet.available,2);assert.equal(status.wallet.reserved,0);assert.equal(status.budget.spentMicros,1);assert.equal(calls,1);
});
test('cloud AI dimension review is owner-only, atomic, durable and never repeats a provider call',async t=>{
 const {starterProject,prepareCampaign}=await import('../src/consumer-campaign.ts');const {buildGenerationRequest}=await import('../src/generation.ts');
 let calls=0;const s=await setup(t,{adapter:{generate:async()=>{calls++;return {bytes,mime:'image/png',width:8,height:8,sha256:hash,role:'creative',composition:'complete-ad',usage:{},cost:{microUsd:1},model:'fixture'};}}});
 const member=await s.member('AI display',1000000,3),other=await s.member('Other',0,0),token=member.token;
 let p=starterProject('other');p=prepareCampaign({...p,product:source,productName:'Fixture product',productProfile:{...p.productProfile,specType:'rectangular',material:'Fixture material'},dimensions:{...p.dimensions,width:'300',depth:'200',height:'100',visible:true},dimensionAnnotation:{method:'ai',mode:'inset',snapshot:''}});
 const body={projectId:p.id,requestId:randomUUID(),request:buildGenerationRequest(p),source,references:[]};assert.equal((await s.call('/api/status',{token})).data.generation.aiDimensionDisplay,true);
 const [a,b]=await Promise.all([s.call('/api/generations',{token,body}),s.call('/api/generations',{token,body})]);assert.equal(a.status,202,JSON.stringify(a.data));assert.equal(a.data.job.id,b.data.job.id);const id=a.data.job.id;let ready;for(let i=0;i<100;i++){ready=(await s.call('/api/generations/'+id,{token})).data.job;if(ready.state!=='running')break;await new Promise(r=>setTimeout(r,5));}assert.equal(ready.state,'ready');assert.equal(calls,1);
 assert.equal((await s.call('/api/generations/'+id+'/accept',{token,body:{artifactId:hash}})).data.error.code,'AI_DIMENSION_REVIEW_REQUIRED');const dimensionReview={inputHash:ready.dimensionDisplay.inputHash,artifactHash:hash,values:true,axes:true,complete:true};
 assert.equal((await s.call('/api/generations/'+id+'/accept',{token:other.token,body:{artifactId:hash,dimensionReview}})).status,404);
 for(let i=0;i<2;i++)assert.equal((await s.call('/api/generations/'+id+'/accept',{token,body:{artifactId:hash,dimensionReview}})).status,200);
 await s.restart();assert.deepEqual((await s.call('/api/generations/'+id,{token})).data.job.dimensionReview,dimensionReview);assert.equal((await s.call('/api/generations',{token,body})).data.job.id,id);const status=(await s.call('/api/status',{token})).data;assert.equal(status.wallet.available,2);assert.equal(status.wallet.reserved,0);assert.equal(status.budget.spentMicros,1);assert.equal(calls,1);
});

test('cloud public version read returns build identity without provider or account operations',async t=>{const s=await setup(t);const r=await s.call('/api/version');assert.equal(r.status,200);assert.deepEqual(Object.keys(r.data).sort(),['commit','schemaVersion','service','version']);assert.equal(r.data.schemaVersion,1);assert.equal(r.data.service,'aiadcast-next');assert.equal(r.data.version,manifest.version);});

test('v2 delivery, concurrent retries, restart, and human defect review preserve separate balances and authority',async t=>{
 let payment;const provider={lookup:async()=>{if(!payment){const e=Error('PAYMENT_NOT_FOUND');e.code='PAYMENT_NOT_FOUND';throw e;}return payment;},confirm:async q=>payment={...q,currency:'KRW',totalAmount:q.amount,status:'DONE'}};
 const s=await setup(t,{accounts:{provider,clientKey:'test_ck_fixture'}}),a=await s.member('Credits member',1000000,0),owner=await s.member('Review admin');await s.app.store.setRole(owner.user.id,'admin');const invitation=await s.app.store.issueInvite(owner.user.id);owner.token=(await s.call('/api/auth/login',{body:{invite:invitation.invite}})).data.token;
 assert.equal((await s.call('/api/checkout/orders',{token:a.token,body:{pack:'basic',requestId:'retired-order',agreed:true}})).data.error.code,'SKU_RETIRED');
 const order=(await s.call('/api/checkout/orders',{token:a.token,body:{pack:'credits-v2-30',requestId:'credits-v2-order',agreed:true}})).data;
 assert.equal(order.amount,3300);assert.equal(order.credits,30);assert.equal(order.unit,'credit-v2');const params=new URLSearchParams(new URL(order.checkoutUrl).hash.split('?')[1]);
 const confirmation={orderId:order.id,ticket:params.get('ticket'),paymentKey:'v2-payment',amount:3300};const paid=await Promise.all([s.call('/api/checkout/confirm',{body:confirmation}),s.call('/api/checkout/confirm',{body:confirmation})]);for(const r of paid)assert.equal(r.data.receipt.balance,30);
 const status=(await s.call('/api/status',{token:a.token})).data,body={...generation(),creditQuote:status.generation.creditQuote};assert.equal(status.wallet.available,0);
 const replies=await Promise.all([s.call('/api/generations',{token:a.token,body}),s.call('/api/generations',{token:a.token,body})]);for(const r of replies)assert.equal(r.status,202,JSON.stringify(r.data));const id=replies[0].data.job.id;assert.equal(replies[1].data.job.id,id);
 let preview;for(let i=0;i<40;i++){preview=await s.call('/api/generations/'+id,{token:a.token});if(preview.data.job.state!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(preview.data.job.state,'ready',JSON.stringify(preview.data));assert.equal(preview.data.job.creditCaptured,true);assert.equal(preview.data.wallet.credits.available,20);assert.equal(preview.data.wallet.credits.reserved,0);assert.equal(s.calls(),1);
 await s.restart();assert.equal((await s.call('/api/generations',{token:a.token,body})).data.job.id,id);assert.equal(s.calls(),1);
 const reportPath='/api/generations/'+id+'/report';assert.equal((await s.call(reportPath,{token:owner.token,body:{description:'Cannot report another customer result.'}})).status,404);
 const report=await s.call(reportPath,{token:a.token,body:{description:'The requested headline is missing from the delivered image.'}});assert.equal(report.status,200,JSON.stringify(report.data));
 const evidence=await s.call('/api/admin/defect-evidence?userId='+a.user.id+'&jobId='+id,{token:owner.token});assert.equal(evidence.status,200,JSON.stringify(evidence.data));assert.equal(evidence.data.artifact.sha256,hash);assert.equal(evidence.data.source.sha256,hash);assert.equal((await s.call('/api/admin/defect-evidence?userId='+a.user.id+'&jobId='+id,{token:a.token})).status,403);
 const review={userId:a.user.id,jobId:id,decision:'confirmed',resolution:'Reviewer verified the supplied headline was omitted.'};assert.equal((await s.call('/api/admin/defect-review',{token:a.token,body:review})).status,403);
 const queue=await s.call('/api/admin/defect-reports?userId='+a.user.id,{token:owner.token});assert.equal(queue.data.reports[0].id,report.data.id);
 for(let i=0;i<2;i++){const r=await s.call('/api/admin/defect-review',{token:owner.token,body:review});assert.equal(r.status,200,JSON.stringify(r.data));}
 const final=(await s.call('/api/status',{token:a.token})).data;assert.equal(final.wallet.available,0);assert.deepEqual(final.wallet.credits,{available:30,reserved:0});assert.equal(final.budget.spentMicros,imageUsageCost(usage).microUsd);await s.restart();assert.equal((await s.call('/api/status',{token:a.token})).data.wallet.credits.available,30);
});

test('admin overview is a read-only snapshot: no expired reservation release or unused member schema initialization',async t=>{
 const s=await setup(t),admin=await s.member('Overview administrator',500000,2);
 await s.app.store.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.user.id);
 const generated=await s.call('/api/generations',{token:admin.token,body:generation()});assert.equal(generated.status,202);
 const db=new PostgresDatabase(s.app.pool,cloudSchema(admin.user.id));
 await db.prepare('UPDATE jobs SET expires_at=0 WHERE id=?').run(generated.data.job.id);
 const untouched=await s.app.store.provision({label:'Never initialized',credits:3,budgetMicros:0});
 const before={jobs:await db.prepare('SELECT * FROM jobs').all(),wallets:await db.prepare('SELECT * FROM wallets').all(),events:await db.prepare('SELECT * FROM credit_events').all(),budgets:await db.prepare('SELECT * FROM budgets').all()};
 const response=await s.call('/api/admin/overview',{token:admin.token});assert.equal(response.status,200,JSON.stringify(response.data));assert.equal(response.data.users.length,2);assert.equal(response.data.jobs[0].state,'ready');assert.equal(response.data.users.find(u=>u.id===untouched.userId).ledgerInitialized,false);
 const after={jobs:await db.prepare('SELECT * FROM jobs').all(),wallets:await db.prepare('SELECT * FROM wallets').all(),events:await db.prepare('SELECT * FROM credit_events').all(),budgets:await db.prepare('SELECT * FROM budgets').all()};assert.deepEqual(after,before);
 assert.equal((await s.app.store.db.prepare('SELECT nspname FROM pg_namespace WHERE nspname=?').all(cloudSchema(untouched.userId))).length,0);
 assert.equal(s.calls(),1);
});

for(const admin of [false,true])test(`pending cloud generation survives a lost delivery commit response and restart (${admin?'admin':'member'})`,async t=>{
 let release,calls=0;const waiting=new Promise(r=>release=r),fault={loseReadyCommit:true};
 const s=await setup(t,{fault,adapter:{generate:async()=>{calls++;await waiting;return {bytes,mime:'image/png',width:8,height:8,sha256:hash,role:'background',usage,cost:imageUsageCost(usage),model:IMAGE_MODEL,revision:IMAGE_REVISION};}}});
 const a=await s.member('Recovery',1_000_000,admin?0:3);let token=a.token;
 if(admin){await s.app.store.setRole(a.user.id,'admin');token=(await s.call('/api/auth/login',{body:{invite:(await s.app.store.issueInvite(a.user.id)).invite}})).data.token;}
 const body=generation(),created=await s.call('/api/generations',{token,body}),id=created.data.job.id;
 assert.equal(created.status,202);assert.equal((await s.call('/api/generations/'+id,{token})).data.job.state,'running');
 const duplicate=await s.call('/api/generations',{token,body:{...body,requestId:randomUUID()}});assert.equal(duplicate.data.job.id,id);
 release();let job;for(let i=0;i<100;i++){job=(await s.call('/api/generations/'+id,{token})).data.job;if(job.state!=='running')break;await new Promise(r=>setTimeout(r,5));}
 assert.equal(fault.lost,true);assert.equal(job.state,'ready');assert.equal(job.artifact.dataUrl,source.data);assert.equal(calls,1);
 await s.restart();job=(await s.call('/api/generations/'+id,{token})).data.job;assert.equal(job.state,'ready');assert.equal(job.artifact.dataUrl,source.data);
 const status=(await s.call('/api/status',{token})).data;assert.equal(status.wallet.available,admin?0:2);assert.equal(status.wallet.reserved,admin?0:1);assert.equal(status.budget.spentMicros,imageUsageCost(usage).microUsd);
 assert.equal((await s.call('/api/generations',{token,body})).data.job.id,id);assert.equal(calls,1);
 const other=await s.member('Other');assert.equal((await s.call('/api/generations/'+id,{token:other.token})).status,404);
});

test('cloud result upload failure remains uncertain through status, retry and restart without another provider call',async t=>{
 // A distinct output is essential: identical source/output hashes correctly reuse
 // the verified original and never perform a second upload.
 const output=await sharp({create:{width:8,height:8,channels:4,background:'#123456'}}).png().toBuffer();
 const outputHash=hashBytes(output);let calls=0,failedUploads=0;
 const adapter={generate:async()=>{calls++;return {bytes:output,mime:'image/png',width:8,height:8,sha256:outputHash,role:'background',usage,cost:imageUsageCost(usage),model:IMAGE_MODEL,revision:IMAGE_REVISION,providerRequestId:'fixture-provider'};}};
 const s=await setup(t,{adapter}),a=await s.member('Storage failure',1_000_000,3),body=generation();
 const put=s.app.storage.put.bind(s.app.storage);
 s.app.storage.put=async(userId,name,...args)=>{if(name===outputHash+'.png'){failedUploads++;throw Error('fixture result upload lost');}return put(userId,name,...args);};
 const made=await s.call('/api/generations',{token:a.token,body});assert.equal(made.status,202);await s.restart();
 assert.equal(failedUploads,1,'the generated-result upload fault must actually fire');
 const job=(await s.call('/api/generations/'+made.data.job.id,{token:a.token})).data.job;
 assert.equal(job.state,'uncertain');assert.equal(job.artifact,null);assert.equal(calls,1);
 assert.equal((await s.call('/api/generations',{token:a.token,body:{...body,requestId:randomUUID()}})).data.job.id,job.id);assert.equal(calls,1);
 const status=(await s.call('/api/status',{token:a.token})).data;assert.equal(status.wallet.available,3);assert.equal(status.budget.heldMicros,500000);
});

// Exercise the real HTTP server, image adapter, PostgreSQL transactions and restart.
// Only the provider transport/storage are local fixtures; no external requests occur.
for(const failure of ['response-timeout','body-timeout','missing-usage'])test(`cloud transport diagnosis: ${failure} persists uncertain without redispatch`,async t=>{
 const logs=[];t.mock.method(console,'warn',message=>logs.push(JSON.parse(message)));
 const {OpenAIImageAdapter}=await import('../server/openai-image-adapter.mjs');
 const png=await sharp({create:{width:1024,height:1024,channels:3,background:'#aaa'}}).png().toBuffer();
 let calls=0,release;const gate=new Promise(r=>release=r);
 const adapter=new OpenAIImageAdapter({apiKey:'local-fixture-only',timeoutMs:1000,fetchImpl:async(_url,{signal})=>{
  calls++;await gate;
  if(failure==='missing-usage')return Response.json({data:[{b64_json:png.toString('base64')}]});
  if(failure==='body-timeout')return new Response(new ReadableStream({start(controller){signal.addEventListener('abort',()=>controller.error(signal.reason),{once:true});}}));
  return new Promise((_,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
 }});
 const s=await setup(t,{adapter}),a=await s.member('Transport fixture',1_000_000,3),body=generation();
 const made=await s.call('/api/generations',{token:a.token,body});assert.equal(made.status,202);const id=made.data.job.id;
 assert.equal((await s.call('/api/generations/'+id,{token:a.token})).data.job.state,'running');release();
 let job;for(let i=0;i<200;i++){job=(await s.call('/api/generations/'+id,{token:a.token})).data.job;if(job.state!=='running')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(job.state,'uncertain');assert.equal(job.errorCode,'PROVIDER_UNCERTAIN');assert.equal(job.artifact,null);assert.equal(calls,1);
 const diagnostic=logs.find(x=>x.jobId===id);assert.equal(diagnostic.code,{'response-timeout':'PROVIDER_TIMEOUT','body-timeout':'PROVIDER_BODY_TIMEOUT','missing-usage':'PROVIDER_USAGE_UNCERTAIN'}[failure]);assert.equal(diagnostic.stage,failure==='missing-usage'?'usage':'provider');
 const db=await new PostgresDatabase(s.app.pool,cloudSchema(a.user.id)).initialize();
 const record=await db.prepare('SELECT artifact_hash,metadata_json FROM generation_records WHERE id=?').get(id);
 assert.equal(Boolean(record.artifact_hash),failure==='missing-usage');
 if(failure==='missing-usage')assert.equal(JSON.parse(record.metadata_json).cost,null);
 await s.restart();assert.equal((await s.call('/api/generations/'+id,{token:a.token})).data.job.state,'uncertain');
 const retry=await s.call('/api/generations',{token:a.token,body:{...body,requestId:randomUUID()}});assert.equal(retry.data.job.id,id);assert.equal(calls,1);
 const status=(await s.call('/api/status',{token:a.token})).data;assert.equal(status.wallet.available,3);assert.equal(status.budget.heldMicros,500000);
});

test('cloud request-key lookup is authenticated, tenant/project bound, restart durable and read-only',async t=>{
 const s=await setup(t),a=await s.member('Lookup owner',1_000_000,3),b=await s.member('Other owner',0,0),input=generation();
 const path=`/api/generation-requests/${input.requestId}?projectId=${input.projectId}`;
 assert.equal((await s.call(path)).status,401);
 const before=await s.call(path,{token:a.token});assert.equal(before.status,200);assert.equal(before.data.state,'not-recorded');assert.equal(s.calls(),0);
 const created=await s.call('/api/generations',{token:a.token,body:input});assert.equal(created.status,202);
 let job;for(let i=0;i<100;i++){job=(await s.call('/api/generations/'+created.data.job.id,{token:a.token})).data.job;if(job.state==='ready')break;await new Promise(r=>setTimeout(r,10));}assert.equal(job.state,'ready');
 const original=(await s.call('/api/status',{token:a.token})).data;
 const found=await s.call(path,{token:a.token});assert.equal(found.data.jobId,job.id);assert.equal(found.data.state,'found');
 const other=await s.call(path,{token:b.token});assert.equal(other.data.state,'not-recorded');assert.equal(other.data.jobId,null);
 assert.equal((await s.call(`/api/generation-requests/${input.requestId}?projectId=wrong-project`,{token:a.token})).status,409);
 await s.restart();assert.equal((await s.call(path,{token:a.token})).data.jobId,job.id);
 const after=(await s.call('/api/status',{token:a.token})).data;assert.deepEqual(after.wallet,original.wallet);assert.deepEqual(after.budget,original.budget);assert.equal(s.calls(),1);
});
test('cloud transport diagnosis: client abort during source persistence does not cancel or duplicate provider work',async t=>{
 const s=await setup(t),a=await s.member('Client disconnect',1_000_000,3),body=generation();
 // Observe this HTTP connection directly. Production telemetry intentionally
 // samples at most 20 requests/minute and is not a reliable test barrier.
 let disconnected;
 const closed=new Promise(resolve=>disconnected=resolve);
 s.app.server.prependOnceListener('request',(req,res)=>{
  assert.equal(req.url,'/api/generations');
  res.once('close',()=>disconnected({finished:res.writableFinished}));
 });
 let entered,release,first=true;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r),put=s.app.storage.put.bind(s.app.storage);
 s.app.storage.put=async(...args)=>{if(first){first=false;entered();await gate;}return put(...args);};
 const controller=new AbortController();
 const pending=fetch('http://127.0.0.1:'+s.app.server.address().port+'/api/generations',{method:'POST',signal:controller.signal,headers:{Origin:origin,Authorization:'Bearer '+a.token,'Content-Type':'application/json','X-Aiadcast-Client':'local-studio'},body:JSON.stringify(body)});
 await waiting;const missing=await s.call(`/api/generation-requests/${body.requestId}?projectId=${body.projectId}`,{token:a.token});assert.equal(missing.data.state,'not-recorded');assert.equal(s.calls(),0);controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');let timer;
 try{
  const connection=await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('server did not observe disconnect')),5000);})]);
  assert.equal(connection.finished,false);assert.equal(s.calls(),0,'source persistence is still gated');
 }finally{clearTimeout(timer);release();}
 let job;for(let i=0;i<100;i++){job=(await s.call('/api/generations?projectId='+body.projectId,{token:a.token})).data.jobs[0];if(job?.state==='ready')break;await new Promise(r=>setTimeout(r,10));}
 assert.equal(job.state,'ready');assert.ok(job.artifactId);assert.equal(s.calls(),1);
 const retry=await s.call('/api/generations',{token:a.token,body});assert.equal(retry.data.job.id,job.id);assert.equal(s.calls(),1);
 await s.restart();assert.equal((await s.call('/api/generations/'+job.id,{token:a.token})).data.job.state,'ready');
});

for(const admin of [false,true])test(`cloud storage preflight refuses full account before provider or credit reservation (${admin?'admin':'member'})`,async t=>{
 const s=await setup(t),a=await s.member('Storage admission',1_000_000,admin?0:3);let token=a.token;
 if(admin){await s.app.store.setRole(a.user.id,'admin');token=(await s.call('/api/auth/login',{body:{invite:(await s.app.store.issueInvite(a.user.id)).invite}})).data.token;}
 await s.app.store.db.prepare('INSERT INTO storage_objects VALUES(?,?,?)').run(a.user.id+'/existing-fixture',a.user.id,admin?599_000_000:99_000_000);
 const before=(await s.call('/api/status',{token})).data,body=generation();body.request.output.format='9:16';body.role='admin';body.storageLimit=900000000;
 const uploads=s.bucket.calls.length;
 const result=await s.call('/api/generations',{token,body});assert.equal(result.status,413);assert.equal(result.data.error.code,'STORAGE_CAPACITY_UNAVAILABLE');
 assert.equal(s.calls(),0);assert.equal(s.bucket.calls.length,uploads);
 const after=(await s.call('/api/status',{token})).data;assert.deepEqual(after.wallet,before.wallet);assert.deepEqual(after.budget,before.budget);
 assert.equal((await s.call('/api/generations',{token})).data.jobs.length,0);
});
test('cloud storage preflight accounts for global usage, deduplicated originals and two planar outputs without deleting data',async t=>{
 const s=await setup(t),a=await s.member('A'),b=await s.member('B'),storage=s.app.storage;
 const original={bytes,mime:'image/png',sha256:hash};
 await storage.put(a.user.id,hash+'.png',bytes,'image/png');
 await s.app.store.db.prepare('INSERT INTO storage_objects VALUES(?,?,?)').run(a.user.id+'/existing-fixture',a.user.id,84_000_000-bytes.length);
 await storage.assertGenerationCapacity(a.user.id,[original],16_000_000);
 await assert.rejects(storage.assertGenerationCapacity(a.user.id,[original],32_000_000),/STORAGE_CAPACITY_UNAVAILABLE/);
 await s.app.store.db.prepare('INSERT INTO storage_objects VALUES(?,?,?)').run(b.user.id+'/global-fixture',b.user.id,801_000_001);
 await assert.rejects(storage.assertGenerationCapacity(a.user.id,[original],16_000_000),/STORAGE_CAPACITY_UNAVAILABLE/);
 assert.equal((await s.app.store.db.prepare('SELECT SUM(bytes) n FROM storage_objects').get()).n,885_000_001);
 assert.deepEqual(await storage.get(a.user.id,a.user.id+'/'+hash+'.png'),bytes);
});

test('cloud quota filled after admission reproduces persist-image STORAGE_LIMIT and retains uncertain deduplication',async t=>{
 const logs=[];t.mock.method(console,'warn',message=>logs.push(JSON.parse(message)));
 const output=await sharp({create:{width:8,height:8,channels:3,background:'#123456'}}).png().toBuffer();
 let calls=0,s,a;const adapter={generate:async()=>{
  calls++;
  // Another save fills the account after preflight; model bytes are valid but not stored.
  await s.app.store.db.prepare('INSERT INTO storage_objects VALUES(?,?,?)').run(a.user.id+'/concurrent-save',a.user.id,100_000_000-bytes.length);
  return {bytes:output,mime:'image/png',width:8,height:8,sha256:hashBytes(output),role:'background',usage,cost:imageUsageCost(usage),model:IMAGE_MODEL,revision:IMAGE_REVISION};
 }};
 s=await setup(t,{adapter});a=await s.member('Quota race',1_000_000,3);const body=generation();body.request.output.format='9:16';
 const created=await s.call('/api/generations',{token:a.token,body});assert.equal(created.status,202);await s.restart();
 assert.equal(logs[0].stage,'persist-image');assert.equal(logs[0].code,'STORAGE_LIMIT');
 const job=(await s.call('/api/generations/'+created.data.job.id,{token:a.token})).data.job;
 assert.equal(job.state,'uncertain');assert.equal(job.artifact,null);
 assert.equal((await s.call('/api/generations',{token:a.token,body})).data.job.id,job.id);
 assert.equal((await s.call('/api/generations',{token:a.token,body:{...body,requestId:randomUUID()}})).data.job.id,job.id);
 const status=(await s.call('/api/status',{token:a.token})).data;assert.equal(status.wallet.available,3);assert.equal(status.budget.heldMicros,500000);assert.equal(calls,1);
});

 test('cloud admin storage allowance is finite, server-owned and never bypasses global capacity',async t=>{
 const s=await setup(t),a=await s.member('Storage policy'),storage=s.app.storage;
 assert.equal(await storage.accountLimit(a.user.id),100_000_000);
 await s.app.store.db.prepare('INSERT INTO storage_objects VALUES(?,?,?)').run(a.user.id+'/fixture',a.user.id,98_707_402);
 await assert.rejects(storage.assertGenerationCapacity(a.user.id,[],16_000_000),/STORAGE_CAPACITY_UNAVAILABLE/);
 await s.app.store.setRole(a.user.id,'admin');assert.equal(await storage.accountLimit(a.user.id),600_000_000);
 await storage.assertGenerationCapacity(a.user.id,[],16_000_000);
 const data=Buffer.alloc(2_000_000,1);await storage.put(a.user.id,hashBytes(data)+'.png',data,'image/png');
 await s.app.store.setRole(a.user.id,'member');assert.equal(await storage.accountLimit(a.user.id),100_000_000);
 await assert.rejects(storage.put(a.user.id,hashBytes(Buffer.from('new'))+'.png',Buffer.from('new'),'image/png'),/STORAGE_LIMIT/);
 await s.app.store.setRole(a.user.id,'admin');
 await s.app.store.db.prepare('UPDATE storage_objects SET bytes=? WHERE path=?').run(599_000_000,a.user.id+'/fixture');
 await assert.rejects(storage.assertGenerationCapacity(a.user.id,[],1),/STORAGE_CAPACITY_UNAVAILABLE/);
 await assert.rejects(storage.put(a.user.id,hashBytes(Buffer.from('new'))+'.png',Buffer.from('new'),'image/png'),/STORAGE_LIMIT/);
 await s.app.store.db.prepare('UPDATE storage_objects SET bytes=? WHERE path=?').run(98_707_402,a.user.id+'/fixture');
 const b=await s.member('Other storage');await s.app.store.db.prepare('INSERT INTO storage_objects VALUES(?,?,?)').run(b.user.id+'/fixture',b.user.id,799_292_598);
 await assert.rejects(storage.assertGenerationCapacity(a.user.id,[],1),/STORAGE_CAPACITY_UNAVAILABLE/);
 await assert.rejects(storage.put(a.user.id,hashBytes(Buffer.from('new'))+'.png',Buffer.from('new'),'image/png'),/STORAGE_LIMIT/);
 assert.equal((await s.app.store.db.prepare('SELECT SUM(bytes) n FROM storage_objects').get()).n,900_000_000);
 await s.app.store.db.prepare('UPDATE users SET disabled=1 WHERE id=?').run(a.user.id);
 assert.equal(await storage.accountLimit(a.user.id),100_000_000);
 });

test('readiness cold initialization performs schema work once and shares concurrent startup without provider dispatch',async t=>{
 const stats={queries:0,userSchema:0,ddl:0};const reset=()=>{stats.queries=stats.userSchema=stats.ddl=0;};
 const fault={observeQuery:sql=>{stats.queries++;if(/^CREATE SCHEMA IF NOT EXISTS "aiadcast_user_/.test(sql))stats.userSchema++;if(/^(CREATE|ALTER|REVOKE)/.test(sql.trim()))stats.ddl++;}};
 const s=await setup(t,{fault}),member=await s.member('Readiness fixture',500000,3);reset();
 const first=await s.call('/api/status',{token:member.token});assert.equal(first.status,200);const cold={...stats};assert.equal(cold.userSchema,1);assert.ok(cold.ddl>0);reset();
 const second=await s.call('/api/status',{token:member.token});assert.equal(second.status,200);const warm={...stats};assert.equal(warm.userSchema,0);assert.equal(warm.ddl,0);assert.deepEqual(second.data.wallet,first.data.wallet);assert.deepEqual(second.data.budget,first.data.budget);
 await s.restart();reset();const results=await Promise.all(Array.from({length:3},()=>s.call('/api/status',{token:member.token})));assert.ok(results.every(r=>r.status===200));assert.equal(stats.userSchema,1);for(const r of results){assert.deepEqual(r.data.wallet,first.data.wallet);assert.deepEqual(r.data.budget,first.data.budget);}assert.equal(s.calls(),0);
 t.diagnostic(JSON.stringify({cold,warm,restartThreeRequests:{...stats},providerCalls:s.calls()}));
});

test('table protection skips already-enabled RLS but restores disabled RLS and still revokes access',async t=>{
 let enables=0;const s=await setup(t,{fault:{observeQuery:sql=>{if(/^ALTER TABLE .* ENABLE ROW LEVEL SECURITY/.test(sql))enables++;}}});const member=await s.member('Protection fixture',500000,3);await s.call('/api/status',{token:member.token});
 const schema=cloudSchema(member.user.id),db=new PostgresDatabase(s.app.pool,schema);enables=0;await db.protectTables();assert.equal(enables,0);
 await db.exec(`ALTER TABLE "${schema}".wallets DISABLE ROW LEVEL SECURITY; GRANT SELECT ON "${schema}".wallets TO anon;`);
 await db.protectTables();assert.equal(enables,1);
 const row=await db.prepare("SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=? AND c.relname='wallets'").get(schema);assert.equal(row.relrowsecurity,true);
 const access=await db.prepare('SELECT has_table_privilege(?, ?, ?) AS allowed').get('anon',`"${schema}".wallets`,'SELECT');assert.equal(access.allowed,false);
 assert.equal(s.calls(),0);
});

for(const missing of [false,true])test(`committed immutable assets are verified and missing blobs restored for edited ads (${missing})`,async t=>{
 const s=await setup(t),a=await s.member('Immutable asset owner',1_000_000,3),body=generation();
 const first=await s.call('/api/generations',{token:a.token,body});assert.equal(first.status,202);
 const ready=async id=>{let job;for(let i=0;i<100;i++){job=(await s.call('/api/generations/'+id,{token:a.token})).data.job;if(job.state==='ready')return job;await new Promise(r=>setTimeout(r,10));}assert.fail('fixture job did not complete');};
 await ready(first.data.job.id);
 const uploads=()=>s.bucket.calls.filter(c=>c.method==='POST'&&c.path.endsWith('/'+a.user.id+'/'+hash+'.png')).length;
 const before=uploads(),quotaBefore=(await s.app.store.db.prepare('SELECT SUM(bytes) n FROM storage_objects WHERE user_id=?').get(a.user.id)).n;
 if(missing)s.bucket.objects.delete(a.user.id+'/'+hash+'.png'); // Local mock bucket only.
 body.requestId=randomUUID();body.request.brief='A different approved studio scene';
 const second=await s.call('/api/generations',{token:a.token,body});assert.equal(second.status,202);await ready(second.data.job.id);
 assert.equal(uploads(),before+(missing?1:0),'restore a missing object once; never trust metadata alone');assert.equal(s.calls(),2);
 assert.equal((await s.app.store.db.prepare('SELECT SUM(bytes) n FROM storage_objects WHERE user_id=?').get(a.user.id)).n,quotaBefore);
 assert.deepEqual(s.bucket.objects.get(a.user.id+'/'+hash+'.png'),bytes);
 const lookup=await s.call(`/api/generation-requests/${body.requestId}?projectId=${body.projectId}`,{token:a.token});assert.equal(lookup.data.jobId,second.data.job.id);
});

test('cloud returns durable request-key acceptance while the mock provider is still pending',async t=>{
 let release,entered,calls=0;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r);
 const s=await setup(t,{adapter:{generate:async()=>{calls++;entered();await gate;return {bytes,mime:'image/png',width:8,height:8,sha256:hash,role:'background',usage,cost:imageUsageCost(usage),model:IMAGE_MODEL,revision:IMAGE_REVISION};}}});
 const a=await s.member('Durable acceptance',1_000_000,3),body=generation();let timer;
 try{
  const created=await Promise.race([s.call('/api/generations',{token:a.token,body}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('acceptance waited for provider result')),5000);})]);clearTimeout(timer);
  assert.equal(created.status,202);assert.equal(created.data.job.state,'running');await started;
  const lookup=await s.call(`/api/generation-requests/${body.requestId}?projectId=${body.projectId}`,{token:a.token});assert.equal(lookup.data.state,'found');assert.equal(lookup.data.jobId,created.data.job.id);
  const duplicate=await s.call('/api/generations',{token:a.token,body});assert.equal(duplicate.data.job.id,created.data.job.id);assert.equal(calls,1);
 }finally{clearTimeout(timer);release();}
});

test('membership rejects server saves for both plans, isolates withdrawal and retries failed object deletion',async t=>{
 const s=await setup(t),member=await s.member(),other=await s.member('Other'),admin=await s.member('Admin');
 await s.app.store.setRole(admin.user.id,'admin');
 admin.token=(await s.call('/api/auth/login',{body:{invite:(await s.app.store.issueInvite(admin.user.id)).invite}})).data.token;
 const path='/api/projects/member-project',project={id:'member-project',name:'Fixture',version:1};
 const save=revision=>s.call(path,{token:member.token,body:{project,revision}});
 assert.equal((await save(0)).status,403);
 assert.equal((await s.call('/api/membership/plan',{token:member.token,body:{plan:'standard',userId:member.user.id}})).status,403);
 assert.equal((await s.call('/api/membership/plan',{token:admin.token,body:{plan:'standard',userId:member.user.id}})).status,200);
 assert.equal((await save(0)).data.error.code,'DEVICE_ONLY');
 await legacyProject(s.app,member.user.id,project);
 const listed=()=>s.call('/api/projects',{token:member.token});
 const expiry=(await listed()).data.projects[0].expiresAt;
 assert.equal((await save(1)).status,403);assert.equal((await listed()).data.projects[0].expiresAt,expiry);
 assert.equal((await s.call('/api/membership/withdraw',{token:member.token,body:{}})).status,400);
 const storage=s.app.storage,orig=storage.remove.bind(storage);
 storage.remove=async()=>{throw Error('simulated outage');};
 const withdraw=await s.call('/api/membership/withdraw',{token:member.token,body:{confirm:'delete-my-account'}});
 assert.equal(withdraw.status,200,JSON.stringify(withdraw.data));assert.equal((await listed()).status,401);
 await s.app.store.membership.run();
 const events=async()=> (await s.call('/api/membership/admin',{token:admin.token})).data.events.filter(e=>e.receipt===withdraw.data.receipt).map(e=>e.kind);
 assert.ok((await events()).includes('retry'));assert.ok(!(await events()).includes('completed'));
 storage.remove=orig;await s.app.store.membership.run();
 assert.ok((await events()).includes('completed'));assert.ok(![...s.bucket.objects.keys()].some(p=>p.startsWith(member.user.id+'/')));
 assert.equal((await s.call('/api/membership',{token:other.token})).status,200);
});
test('expiration removes temporary bytes and self-contained snapshots without extending revisions or touching another owner',async t=>{
 const s=await setup(t),a=await s.member('Retention'),other=await s.member('Unrelated');
 const store=s.app.store,db=store.db,storage=s.app.storage;
 await db.prepare("UPDATE users SET storage_plan='standard' WHERE id=?").run(a.user.id);
 const before=await s.call('/api/membership',{token:a.token});assert.equal(before.data.storage,'device');assert.equal(before.data.downloadWindowHours,24);
 const bytes=Buffer.from('temporary fixture'),hash=hashBytes(bytes);
 const p1=await storage.put(a.user.id,hash+'.png',bytes,'image/png');
 const p2=await storage.put(other.user.id,hash+'.png',bytes,'image/png');
 const id='expire-project-fixture',project={id,version:1,name:'Expiry'};
 const path=await legacyProject(s.app,a.user.id,project);
 await db.prepare("UPDATE projects SET expires_at=now()-interval '1 second' WHERE user_id=?").run(a.user.id);
 await db.prepare("UPDATE storage_objects SET expires_at=now()-interval '1 second' WHERE user_id=?").run(a.user.id);
 assert.equal((await s.call('/api/projects/'+id,{token:a.token})).status,404);
 assert.deepEqual(await store.list(a.user.id),[]);
 await store.membership.run();
 assert.ok(!s.bucket.objects.has(p1));assert.ok(!s.bucket.objects.has(path));assert.ok(s.bucket.objects.has(p2));
 const full=await s.call('/api/projects/'+id,{token:a.token,body:{project,revision:0}});
 assert.equal(full.status,403);assert.equal(full.data.error.code,'DEVICE_ONLY');
});

test('new downloads keep one 24-hour deadline after delivery, across owners, reads and restart',async t=>{
 const s=await setup(t),owner=await s.member('Delivery',1_000_000,3),other=await s.member('Unrelated');
 const submitted=await s.call('/api/generations',{token:owner.token,body:generation()});
 const id=submitted.data.job.id,path='/api/generations/'+id;
 let job;
 for(let i=0;i<80;i++){
  job=(await s.call(path,{token:owner.token})).data.job;if(job.state==='ready')break;
  await new Promise(r=>setTimeout(r,10));
 }
 assert.equal(job.state,'ready');
 const deadline=Date.parse(job.downloadExpiresAt);
 assert.ok(deadline>=Date.parse(job.createdAt)+86400000 && deadline<=Date.now()+86400001);
 const list=token=>s.call('/api/membership/downloads',{token});
 assert.deepEqual((await list(other.token)).data.downloads,[]);
 assert.equal((await list(owner.token)).data.downloads[0].expiresAt,job.downloadExpiresAt);
 await s.restart();assert.equal((await s.call(path,{token:owner.token})).data.job.downloadExpiresAt,job.downloadExpiresAt);
 const tenant=new PostgresDatabase(s.app.pool,cloudSchema(owner.user.id));
 await tenant.prepare('UPDATE jobs SET expires_at=? WHERE id=?').run(Date.now()-1,id);
 assert.deepEqual((await list(owner.token)).data.downloads,[]);
 const after=await s.call(path,{token:owner.token});
 assert.ok(after.status===404 || after.data.job?.artifact===null);
});

test('download reads only the delivered image after restart, even if its auxiliary image is missing',async t=>{
 const s=await setup(t),owner=await s.member('Download owner',1_000_000,3),other=await s.member('Other member');
 const created=await s.call('/api/generations',{token:owner.token,body:generation()});
 assert.equal(created.status,202);
 const id=created.data.job.id;
 await s.app.store.membership.jobs.get(owner.user.id).waitForIdle();
 assert.equal((await s.call('/api/generations/'+id+'/accept',{token:owner.token,body:{artifactId:hash}})).status,200);
 const tenant=new PostgresDatabase(s.app.pool,cloudSchema(owner.user.id));
 const {metadata_json}=await tenant.prepare('SELECT metadata_json FROM generation_records WHERE id=?').get(id);
 const aux='a'.repeat(64);
 await tenant.prepare('INSERT INTO generation_assets VALUES(?,?,?,?,?)').run(aux,'image/png',8,8,bytes.length);
 await tenant.prepare('UPDATE generation_records SET metadata_json=? WHERE id=?').run(JSON.stringify({...JSON.parse(metadata_json),planarReport:{originalHash:aux}}),id);
 await s.restart();
 const path='/api/membership/downloads/'+id;
 assert.equal((await s.call(path+'/preview',{token:owner.token})).status,200);
 const historical=await s.call('/api/generations/'+id,{token:owner.token});
 assert.equal(historical.status,200);assert.equal(historical.data.job.planarOriginal,null);
 assert.equal(historical.data.job.artifact.dataUrl,source.data);
 const original=()=>s.call(path+'/original',{token:owner.token});
 const {status,data}=await original();
 assert.equal(status,200);
 assert.equal(data.id,id);assert.equal(data.artifactId,hash);
 assert.equal(data.artifact.dataUrl,source.data);
 assert.equal(data.reviewRequired,false);
 assert.equal((await s.call(path+'/original',{token:other.token})).status,404);
 s.bucket.objects.delete(owner.user.id+'/'+hash+'.png');
 await s.restart(); // Evict the read cache as well as the physical original.
 const recovery=await original();
 assert.equal(recovery.status,200);assert.equal(recovery.data.artifact,null);
 assert.equal(recovery.data.artifactId,hash);
 await new PostgresDatabase(s.app.pool,cloudSchema(owner.user.id)).prepare('UPDATE jobs SET expires_at=? WHERE id=?').run(Date.now()-1,id);
 const expired=await original();assert.ok([404,410].includes(expired.status));
 assert.equal(expired.data.artifact,undefined);
});

test('download previews and deletion are owner-scoped, preserve shared objects, release only reserved tickets and survive restart',async t=>{
 const s=await setup(t),owner=await s.member('Original owner',1_000_000,3),other=await s.member('Other owner');
 const make=async name=>{
  const body=generation();body.request.productName=name;
  const created=await s.call('/api/generations',{token:owner.token,body});assert.equal(created.status,202);
  const id=created.data.job.id;await s.app.store.membership.jobs.get(owner.user.id).waitForIdle();return id;
 };
 const first=await make('첫 광고'),second=await make('두 번째 광고');
 const preview=(token,id)=>s.call('/api/membership/downloads/'+id+'/preview',{token});
 const remove=(token,ids)=>s.call('/api/membership/remove-downloads',{token,body:{ids}});
 assert.equal((await preview(other.token,first)).status,404);
 const thumb=await preview(owner.token,first);assert.equal(thumb.status,200);
 const meta=await sharp(Buffer.from(thumb.data.preview.split(',')[1],'base64')).metadata();assert.equal(meta.format,'webp');
 assert.equal((await remove(other.token,[first])).status,200);
 const accepted=await s.call('/api/generations/'+first+'/accept',{token:owner.token,body:{artifactId:hash}});assert.equal(accepted.status,200);
 assert.equal((await remove(owner.token,[first])).status,200);assert.equal((await preview(owner.token,first)).status,404);
 assert.equal((await s.call('/api/generations/'+first,{token:owner.token})).data.job.artifact,null);
 assert.equal((await preview(owner.token,second)).status,200);
 assert.equal((await remove(owner.token,[first,second])).status,200);assert.equal((await remove(owner.token,[second])).status,200);
 assert.equal((await s.call('/api/status',{token:owner.token})).data.wallet.available,2);
 await s.app.store.membership.run();
 assert.equal(s.bucket.objects.has(owner.user.id+'/'+hash+'.png'),false);
 await s.restart();assert.deepEqual((await s.call('/api/membership/downloads',{token:owner.token})).data.downloads,[]);
});


test('cloud upload reviews the composited pose and delivers the same artifact after restart',async t=>{
 const prompt='오른쪽 남자 캐릭터를 다른 포즈의 남성 캐릭터로 변경하고 캐릭터는 3D애니메이션으로 해주세요. 날씨는 먹구름 가득한 하늘로 변경해주세요.';
 const steps=[];
 const adapter=new OpenAIImageAdapter({apiKey:'fixture',enableEdits:true,fetchImpl:async(url,options)=>{
  if(url.endsWith('/images/edits')){
   steps.push('image');
   assert.ok(options.body.get('prompt').includes(prompt));
   assert.equal(options.body.has('mask'),false);
   assert.ok(options.body.get('image'));
   const edited=await sharp({create:{width:1024,height:1024,channels:4,background:'red'}}).png().toBuffer();
   return Response.json({data:[{b64_json:edited.toString('base64')}],usage:{input_tokens:2,input_tokens_details:{text_tokens:1,image_tokens:1},output_tokens:1}});
  }
  const request=JSON.parse(options.body),stage=request.response_format.json_schema.name;
  steps.push(stage);
  const answers={review_full_scene:{requestedChangesApplied:true,sceneContinuous:true,unrelatedContentPreserved:true,copy:[],protectedObjects:[]}};
  assert.ok(answers[stage],stage);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answers[stage])}}],usage:{prompt_tokens:100,completion_tokens:60}});
 }});
 const s=await setup(t,{adapter}),{token}=await s.member('Precision edit',1_000_000,3);
 const status=await s.call('/api/status',{token});
 const body={original:{width:8,height:8,sha256:hash,dataUrl:source.data},sourceHash:hash,prompt,mask:{mode:'instruction'},requestId:randomUUID(),projectId:randomUUID(),creditQuote:status.data.generation.creditQuote};
 const submitted=await s.call('/api/selective-edits/upload',{token,body});
 assert.equal(submitted.status,202,JSON.stringify(submitted.data));
 const path='/api/generations/'+submitted.data.job.id;
 let job;
 for(let i=0;i<150;i++){
  job=(await s.call(path,{token})).data.job;
  if(job.state!=='running')break;
  await new Promise(r=>setTimeout(r,10));
 }
 assert.deepEqual(steps,['image','review_full_scene']);
 assert.equal(job.state,'ready');assert.equal(job.preservation.changedOutsidePixels,0);
 assert.ok(job.preservation.changedSelectedPixels>0);
 assert.equal(hashBytes(Buffer.from(job.artifact.dataUrl.split(',')[1],'base64')),job.artifactId);
 await s.restart();
 const accepted=await s.call(path+'/accept',{token,body:{artifactId:job.artifactId}});
 assert.equal(accepted.status,200,JSON.stringify(accepted.data));
 assert.equal(accepted.data.job.state,'accepted');
 assert.equal(accepted.data.job.artifactId,job.artifactId);
 assert.equal((await s.call('/api/selective-edits/upload',{token,body})).data.job.id,job.id);
 assert.equal(steps.length,2);

 // Reproduce the old adapter crash and recover that persisted job after another restart.
 adapter.reviewPose=()=>{throw new TypeError('missing final review');};
 const interrupted={...body,requestId:randomUUID(),projectId:randomUUID(),prompt:prompt+' 왼쪽의 글씨를 유지해주세요.'};
 const second=await s.call('/api/selective-edits/upload',{token,body:interrupted});
 assert.equal(second.status,202,JSON.stringify(second.data));
 const interruptedPath='/api/generations/'+second.data.job.id;
 let ended;
 for(let i=0;i<150;i++){
  ended=(await s.call(interruptedPath,{token})).data.job;
  if(ended.state!=='running')break;
  await new Promise(r=>setTimeout(r,10));
 }
 assert.equal(ended.state,'failed');assert.equal(ended.errorCode,'EDIT_NOT_DELIVERED');
 assert.equal(ended.creditCaptured,false);assert.equal(ended.artifact,null);
 await s.restart();
 assert.equal((await s.call(interruptedPath,{token})).data.job.errorCode,'EDIT_NOT_DELIVERED');
 assert.equal((await s.call('/api/selective-edits/upload',{token,body:interrupted})).data.job.id,ended.id);
 assert.equal((await s.call('/api/status',{token})).data.budget.heldMicros,580000);
 assert.equal(steps.filter(stage=>stage==='image').length,2);
});

test('legacy rectangles are soft location hints; review catches scene seams and retries only on a fresh submission',async t=>{
 const prompt='오른쪽 남자 캐릭터를 다른 포즈의 남성 캐릭터로 변경하고 캐릭터는 3D애니메이션으로 해주세요. 날씨는 먹구름 가득한 하늘로 변경해주세요.';
 const steps=[],imagePrompts=[];
 const adapter=new OpenAIImageAdapter({apiKey:'fixture',enableEdits:true,fetchImpl:async(url,options)=>{
  if(url.endsWith('/images/edits')){
   steps.push('image');imagePrompts.push(options.body.get('prompt'));
   assert.equal(options.body.has('mask'),false);assert.match(imagePrompts.at(-1),/approximate locations/);
   const png=await sharp({create:{width:1024,height:1024,channels:4,background:'green'}}).png().toBuffer();
   return Response.json({data:[{b64_json:png.toString('base64')}],usage:{input_tokens:2,input_tokens_details:{text_tokens:1,image_tokens:1},output_tokens:1}});
  }
  const stage=JSON.parse(options.body).response_format.json_schema.name;
  steps.push(stage);
  const answers={review_full_scene:{requestedChangesApplied:true,sceneContinuous:imagePrompts.length===2,unrelatedContentPreserved:true,
   copy:[{source:'내 미래를 위한, 두 번째 커리어',replacement:null,observed:imagePrompts.length===1?'내 미래를 위한':'내 미래를 위한, 두 번째 커리어'}],
   protectedObjects:[{subject:'드론',originalCount:2,editedCount:imagePrompts.length===1?1:2}]}};
  assert.ok(answers[stage],stage);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(answers[stage])}}],usage:{prompt_tokens:100,completion_tokens:60}});
 }});
 const s=await setup(t,{adapter}),{token}=await s.member('Edit feedback',1_000_000,3);
 const quote=(await s.call('/api/status',{token})).data.generation.creditQuote;
 const body={original:{width:8,height:8,sha256:hash,dataUrl:source.data},sourceHash:hash,prompt,mask:{mode:'regions',regions:[[400,400,750,800],[0,0,500,210]]},requestId:randomUUID(),projectId:randomUUID(),creditQuote:quote};
 async function run(request){
  const posted=await s.call('/api/selective-edits/upload',{token,body:request});assert.equal(posted.status,202,JSON.stringify(posted.data));
  for(let i=0;i<200;i++){
   const job=(await s.call('/api/generations/'+posted.data.job.id,{token})).data.job;
   if(job.state!=='running')return job;
   await new Promise(r=>setTimeout(r,10));
  }
  assert.fail('edit did not finish');
 }
 const first=await run(body);
 assert.equal(first.state,'failed');assert.equal(first.creditCaptured,false);assert.equal(first.artifact,null);
 assert.deepEqual(first.editReview.failedChecks,['sceneContinuous','unrelatedContentPreserved']);
 assert.deepEqual(first.editReview.differences,[{kind:'copy',expected:'내 미래를 위한, 두 번째 커리어',observed:'내 미래를 위한'},{kind:'object',subject:'드론',expected:2,observed:1}]);assert.ok(first.editReview.preview.startsWith('data:image/jpeg;base64,'));
 assert.deepEqual(steps,['image','review_full_scene']);
 await s.restart();
 assert.equal((await run(body)).id,first.id);assert.equal(imagePrompts.length,1);
 const second=await run({...body,requestId:randomUUID(),projectId:randomUUID()});
 assert.equal(second.state,'ready');assert.equal(second.preservation.changedOutsidePixels,0);
 assert.deepEqual(steps.slice(2),['image','review_full_scene']);
 assert.equal(imagePrompts.length,2);assert.ok(imagePrompts[1].includes('Remove abrupt joins'));assert.ok(imagePrompts[1].includes('두 번째 커리어'));assert.ok(imagePrompts[1].includes('드론'));
});
