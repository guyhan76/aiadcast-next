import {recommendationPolicyFromEnv} from './recommendations/policy-config.mjs';
import {observeSubmission,submissionStage,submissionError} from './submission-observation.mjs';
import {observeReadiness,readinessMeasure} from './readiness-observation.mjs';
import {serverBuild} from './build-info.mjs';
import {singleBoxService} from './vision-evaluation/single-box-service.mjs';
import {dimensionAnalysisService} from './vision-evaluation/service.mjs';
import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BetaStore} from './beta-store.mjs';
import {GenerationService,ApiFailure} from './generation-service.mjs';
import {OpenAIImageAdapter,ProviderFailure} from './openai-image-adapter.mjs';
import {assistCopy} from './text-assistant.mjs';
import {GoogleAuth} from './google-auth.mjs';
import {googleReturnPage,googleUiLanguage,googleReturnCsp} from './google-return-page.mjs';
import {EmailAuth} from './email-auth.mjs';
import {PasswordAuth} from './password-auth.mjs';
import {TestCheckout} from './test-checkout.mjs';
import {accountConfiguration} from './account-providers.mjs';
import {demoSupport} from './demo-support.mjs';
import {AdminApi} from './admin-api.mjs';
export const ANDROID_ORIGIN='https://appassets.androidplatform.net';
export function providerGate(max=2){let active=0;return async task=>{if(active>=max)throw new ProviderFailure('PROVIDER_BUSY',{uncertain:false});active++;try{return await task();}finally{active--;}};}
export function publicOrigin(value){const u=new URL(value);if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('HTTPS_ORIGIN_REQUIRED');return u.origin;}
export function createBetaServer({store,publicUrl,serviceFactory,overviewReader,generationHistoryReader,recommendations,now=()=>Date.now(),extraOrigins=[],staticDirectory,accounts={},dimensionAnalysis=dimensionAnalysisService(),singleBox=singleBoxService()}) {
 const assets=new Map();
 if(staticDirectory){const scan=(folder,prefix='')=>{for(const item of readdirSync(folder,{withFileTypes:true})){const name=prefix+item.name;if(item.isDirectory())scan(join(folder,item.name),name+'/');else assets.set('/'+name,readFileSync(join(folder,item.name)));}};scan(staticDirectory);}
 const origin=publicOrigin(publicUrl),allowed=new Set([origin,ANDROID_ORIGIN,...extraOrigins.map(publicOrigin)]),services=new Map();
 // Bounded in-memory limiter: all traffic shares a global ceiling, including behind a proxy.
 let windowStart=now(),requests=0,logins=0,bodies=0;
 const limit=isLogin=>{if(now()-windowStart>=60_000){windowStart=now();requests=0;logins=0;}if(++requests>600||(isLogin&&++logins>20))throw new ApiFailure('RATE_LIMITED',429);};
 const service=user=>{if(!services.has(user.id))services.set(user.id,serviceFactory(user));const instance=services.get(user.id);instance.adminTestUnlimited=user.role==='admin';return instance;};
 const email=new EmailAuth(store,{sendMail:accounts.sendMail,publicOrigin:origin,now});
 const google=new GoogleAuth(store,{provider:accounts.google,now});
 const password=new PasswordAuth(store,accounts.password,now);password.bootstrapOwner();
 const checkout=new TestCheckout(store,{...accounts,publicOrigin:origin,now,readPurchase:async(id,purchase)=>{const user=store.db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(id);if(!user)throw new ApiFailure('AUTH_REQUIRED',401);return service(user).testPurchaseReceipt(purchase);},creditPurchase:async(id,purchase)=>{const user=store.db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(id);if(!user)throw new ApiFailure('AUTH_REQUIRED',401);return service(user).recordTestPurchase(purchase);}});
 const admin=new AdminApi(store,{service,accounts,checkout,ownerEmail:password.adminEmail,overviewReader,now});
 const send=(res,status,value,cors)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...(cors?{'Access-Control-Allow-Origin':cors,'Vary':'Origin'}:{})});res.end(JSON.stringify(value));};
 const read=async(req,max)=>{if(!/^application\/json(?:;.*)?$/i.test(req.headers['content-type']??''))throw new ApiFailure('JSON_REQUIRED',415);if(Number(req.headers['content-length']??0)>max)throw new ApiFailure('REQUEST_TOO_LARGE',413);if(bodies>=2)throw new ApiFailure('SERVER_BUSY',429);bodies++;try{let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>max)throw new ApiFailure('REQUEST_TOO_LARGE',413);parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new ApiFailure('INVALID_JSON',400);}}finally{bodies--;}};
 const handle=async(req,res)=>{
  const cors=allowed.has(req.headers.origin)?req.headers.origin:null;
  try {
   const url=new URL(req.url,origin);
   if(req.method==='GET'&&!url.pathname.startsWith('/api/')){const path=['/','/exact-text-trial'].includes(url.pathname)?'/index.html':url.pathname;const bytes=assets.get(path);if(!bytes)throw new ApiFailure('NOT_FOUND',404);const ext=path.split('.').pop();res.writeHead(200,{'Content-Type':({html:'text/html; charset=utf-8',json:'application/json',js:'text/javascript',css:'text/css',woff2:'font/woff2',png:'image/png',webp:'image/webp',svg:'image/svg+xml'})[ext]??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':path.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self' https://js.tosspayments.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' data: blob: https://*.tosspayments.com; frame-src https://*.tosspayments.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'});res.end(bytes);return;}
   limit(['/api/auth/google/start','/api/auth/google/finish','/api/auth/google/native-callback','/api/auth/google/link/request','/api/auth/login','/api/auth/test/signup','/api/auth/test/login','/api/auth/email/request','/api/auth/email/verify','/api/checkout/confirm','/api/checkout/launch'].includes(url.pathname));
   if(req.headers.origin&&!cors)throw new ApiFailure('ORIGIN_NOT_ALLOWED',403);
   if(req.method==='OPTIONS'){if(!cors)throw new ApiFailure('ORIGIN_NOT_ALLOWED',403);res.writeHead(204,{'Access-Control-Allow-Origin':cors,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,X-Aiadcast-Client','Vary':'Origin'});res.end();return;}
   if(req.method==='GET'&&url.pathname==='/api/version'){send(res,200,serverBuild,cors);return;}
   if(req.method==='GET'&&url.pathname==='/api/health'){send(res,200,{mode:'invite-beta',commercialReady:false},cors);return;}
   if(req.method==='POST'&&!cors)throw new ApiFailure('ORIGIN_REQUIRED',403);
   if(req.method==='POST'&&req.headers['x-aiadcast-client']!=='local-studio')throw new ApiFailure('CLIENT_HEADER_REQUIRED',403);
   if(req.method==='POST'&&url.pathname==='/api/auth/login'){const b=await read(req,1024);send(res,200,store.login(b?.invite),cors);return;}
   if(req.method==='GET'&&url.pathname==='/api/account/capabilities'){send(res,200,{email:{enabled:Boolean(accounts.sendMail)},...(google.available()?{google:{enabled:true}}:{}),...(password.available()?{password:{enabled:true,test:true,adminReady:password.ownerReady(),adminEmail:password.adminEmail}}:{}),checkout:{enabled:checkout.available(),test:true,currency:'KRW'}},cors);return;}
   if(req.method==='POST'&&['/api/auth/test/signup','/api/auth/test/login'].includes(url.pathname)){
    const b=await read(req,2048);send(res,200,url.pathname.endsWith('/signup')?password.signup(b):password.signIn(b),cors);return;
   }
   if(req.method==='POST'&&url.pathname.startsWith('/api/auth/email/')){const b=await read(req,2048);let result;
    if(url.pathname==='/api/auth/email/request')result=await email.request(b?.email);
    else if(url.pathname==='/api/auth/email/verify')result=email.verify(b?.token);
    else if(url.pathname==='/api/auth/email/exchange')result=email.exchange(b?.requestId,b?.pollToken);
    else throw new ApiFailure('NOT_FOUND',404);
    send(res,200,result,cors);return;}
   if(req.method==='POST'&&url.pathname.startsWith('/api/auth/google/link/')){const b=await read(req,2048);let result;
    if(url.pathname.endsWith('/status'))result=google.linkStatus(b,req.headers.authorization);
    else if(url.pathname.endsWith('/request'))result=await google.requestLinkEmail(b,req.headers.authorization,email);
    else if(url.pathname.endsWith('/complete'))result=google.completeLink(b,req.headers.authorization);
    else if(url.pathname.endsWith('/cancel'))result=google.cancelLink(b,req.headers.authorization);
    else throw new ApiFailure('NOT_FOUND',404);send(res,200,result,cors);return;
   }
   if(req.method==='POST'&&url.pathname==='/api/auth/google/start'){const b=await read(req,1024);send(res,200,google.startGoogle(req.headers.authorization,b?.packageId,googleUiLanguage(b?.language,req.headers['accept-language']),b?.linkRecovery),cors);return;}
   if(req.method==='GET'&&url.pathname==='/api/auth/google/native-callback'){const state=url.searchParams.get('state'),target=await google.approveNativeGoogle(state,url.searchParams.get('code')),language=await google.nativeGoogleLanguage(state)??googleUiLanguage(undefined,req.headers['accept-language']);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':googleReturnCsp});res.end(googleReturnPage(target,language));return;}
   if(req.method==='POST'&&url.pathname==='/api/auth/google/native-poll'){send(res,200,google.pollNativeGoogle(await read(req,2048),req.headers.authorization),cors);return;}
   if(req.method==='POST'&&url.pathname==='/api/auth/google/finish'){send(res,200,await google.finishGoogle(await read(req,8192),req.headers.authorization),cors);return;}
   if(req.method==='POST'&&url.pathname==='/api/checkout/receipt'){send(res,200,await checkout.receipt(await read(req,2048)),cors);return;}
   if(req.method==='POST'&&['/api/checkout/launch','/api/checkout/confirm'].includes(url.pathname)){const b=await read(req,2048);send(res,200,await (url.pathname.endsWith('/launch')?checkout.launch(b):checkout.confirm(b)),cors);return;}
   submissionStage('authentication');
   const user=readinessMeasure('authentication',()=>store.authenticate(req.headers.authorization));
   if(req.method==='GET'&&url.pathname==='/api/auth/session'){send(res,200,{user:{id:user.id,label:user.label,role:user.role}},cors);return;}
   if(/^\/api\/(?:generations\/[A-Za-z0-9_-]{1,100}\/recommendations|recommendations\/[A-Za-z0-9_-]{1,100})$/.test(url.pathname)){
    if(!recommendations){send(res,503,{error:{code:'RECOMMENDATIONS_DISABLED'}},cors);return;}
    const body=req.method==='POST'?JSON.stringify(await read(req,2048)):undefined;
    const response=await recommendations.handle(new Request(url,{method:req.method,headers:{authorization:req.headers.authorization??'',origin:req.headers.origin??'','content-type':req.headers['content-type']??'','x-aiadcast-client':req.headers['x-aiadcast-client']??''},...(body?{body}:{})}));
    send(res,response.status,await response.json(),cors);return;
   }
   if(req.method==='GET'&&url.pathname==='/api/dimension-analysis'){send(res,200,dimensionAnalysis.capability(user),cors);return;}
   if(req.method==='POST'&&url.pathname==='/api/dimension-analysis'){throw new ApiFailure('REFERENCE_EVALUATION_ONLY',403);}
   if(url.pathname.startsWith('/api/admin/')){
    admin.require(user);
    if(url.pathname==='/api/admin/exact-text-trial'){const capability=admin.exactTextTrial(user);if(req.method!=='GET')throw new ApiFailure('PAID_TRIAL_NOT_APPROVED',403);send(res,200,capability,cors);return;}
    if(url.pathname==='/api/admin/defect-review'&&req.method==='POST'){
     const body=await read(req,8192),target=store.db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(body.userId);
     if(!target)throw new ApiFailure('USER_NOT_FOUND',404);
     send(res,200,service(target).reviewDefect(body.jobId,{decision:body.decision,resolution:body.resolution,reviewer:user.id}),cors);return;
    }
    if(['/api/admin/defect-reports','/api/admin/defect-evidence'].includes(url.pathname)&&req.method==='GET'){
     const target=store.db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(url.searchParams.get('userId'));
     if(!target)throw new ApiFailure('USER_NOT_FOUND',404);
     send(res,200,url.pathname==='/api/admin/defect-evidence'?service(target).defectEvidence(url.searchParams.get('jobId')):{reports:service(target).db.prepare('SELECT * FROM defect_reports ORDER BY created_at DESC LIMIT 100').all()},cors);return;
    }
    if(req.method==='POST'&&['/api/admin/single-box-evaluation','/api/admin/dimension-evaluation'].includes(url.pathname)){const s=service(user);if(s.supplierBudget(s.period(),0))throw new ApiFailure('CUMULATIVE_BUDGET_TRIAL_DISABLED',409);}
    if(url.pathname==='/api/admin/single-box-evaluation'){if(req.method==='GET'){send(res,200,await singleBox.status(user,url.searchParams.get('requestId')??undefined),cors);return;}if(req.method==='POST'){send(res,200,await singleBox.analyze(await read(req,14100000),user),cors);return;}}
    if(url.pathname==='/api/admin/dimension-evaluation'){if(req.method==='GET'){send(res,200,await dimensionAnalysis.status(user,url.searchParams.get('requestId')??undefined),cors);return;}if(req.method==='POST'){send(res,200,await dimensionAnalysis.analyze(await read(req,14_100_000),user),cors);return;}}
    if(req.method==='POST'&&['/api/admin/demo-support-preview','/api/admin/demo-support'].includes(url.pathname)){send(res,200,await demoSupport(admin,user,await read(req,2048),url.pathname==='/api/admin/demo-support'),cors);return;}
    if(req.method==='POST'&&url.pathname==='/api/admin/october-budget'){send(res,200,admin.activateOctoberBudget(user,await read(req,1024)),cors);return;}
    if(req.method==='GET'&&url.pathname==='/api/admin/generations'){admin.require(user);if(!generationHistoryReader)throw new ApiFailure('ADMIN_HISTORY_UNAVAILABLE',503);send(res,200,await generationHistoryReader(user,url.search),cors);return;}
    if(req.method==='GET'&&url.pathname==='/api/admin/overview'){send(res,200,admin.overview(user,{omitJobs:url.searchParams.get('jobs')==='none'}),cors);return;}
    if(req.method==='POST'&&['/api/admin/grants','/api/admin/allocations','/api/admin/test-ready','/api/admin/revoke'].includes(url.pathname)){
     const body=await read(req,2048);send(res,200,url.pathname.endsWith('/grants')?admin.grant(user,body):url.pathname.endsWith('/allocations')?admin.allocate(user,body):url.pathname.endsWith('/test-ready')?admin.prepareTest(user,body):admin.revoke(user,body),cors);return;
    }
    throw new ApiFailure('NOT_FOUND',404);
   }
   if(url.pathname==='/api/checkout/orders'&&req.method==='POST'){send(res,201,checkout.create(user,await read(req,2048)),cors);return;}
   if(url.pathname==='/api/account/credits'&&req.method==='GET'){const orders=checkout.history(user),grants=store.db.prepare('SELECT id,credits,state,created FROM admin_grants WHERE user_id=? ORDER BY created DESC LIMIT 30').all(user.id);send(res,200,{wallet:service(user).wallet(),orders,grants},cors);return;}
   if(url.pathname==='/api/checkout/orders'&&req.method==='GET'){send(res,200,{orders:checkout.history(user)},cors);return;}
   const order=/^\/api\/checkout\/orders\/([A-Za-z0-9_-]{8,100})$/.exec(url.pathname);
   if(order&&req.method==='GET'){send(res,200,await checkout.status(user,order[1]),cors);return;}
   if(req.method==='POST'&&url.pathname==='/api/auth/logout'){store.logout(req.headers.authorization);send(res,200,{signedOut:true},cors);return;}
   if(req.method==='GET'&&url.pathname==='/api/auth/me'){send(res,200,{user:{id:user.id,label:user.label,role:user.role}},cors);return;}
   if(req.method==='GET'&&url.pathname==='/api/projects'){send(res,200,{projects:store.list(user.id)},cors);return;}
   const project=/^\/api\/projects\/([A-Za-z0-9_-]{8,100})$/.exec(url.pathname);
   if(project&&req.method==='GET'){send(res,200,store.project(user.id,project[1]),cors);return;}
   if(project&&req.method==='POST'){send(res,200,store.save(user.id,project[1],await read(req,40_001_000)),cors);return;}
   if(req.method==='GET'&&url.pathname==='/api/status'){const instance=readinessMeasure('service_initialization',()=>service(user)),s=instance.status();send(res,200,{...s,mode:password.available()?'test-account-beta':'invite-beta',limitations:s.limitations.filter(x=>!['local-single-user','no-production-auth'].includes(x)).concat([password.available()?'test-email-unverified':'invite-only','single-instance-beta','no-live-payment']),user:{id:user.id,label:user.label}},cors);return;}
   if(req.method==='POST'&&url.pathname==='/api/selective-edits/upload'){const body=await read(req,19_500_000);send(res,202,await service(user).createUploadedEdit(body),cors);return;}
   const selectiveLookup=/^\/api\/selective-edits\/requests\/([A-Za-z0-9_-]{8,100})$/.exec(url.pathname);
   if(req.method==='GET'&&selectiveLookup){send(res,200,service(user).selectiveRequestStatus(selectiveLookup[1],url.searchParams.get('sourceJobId')),cors);return;}
   if(req.method==='POST'&&url.pathname==='/api/selective-edits'){const body=await read(req,6000000);send(res,202,await service(user).createSelectiveEdit(body),cors);return;}
   const batch=/^\/api\/ad-batches\/(ads-[a-f0-9]{64})$/.exec(url.pathname);
   if(req.method==='GET'&&batch){send(res,200,service(user).batchSummary(batch[1]),cors);return;}
   if(req.method==='GET'&&url.pathname==='/api/generations'){send(res,200,service(user).history(url.searchParams.get('projectId')??undefined),cors);return;}
   const requestLookup=/^\/api\/generation-requests\/([A-Za-z0-9_-]{8,100})$/.exec(url.pathname);
   if(req.method==='GET'&&requestLookup){send(res,200,service(user).requestStatus(requestLookup[1],url.searchParams.get('projectId')),cors);return;}
   const job=/^\/api\/generations\/([A-Za-z0-9_-]{8,100})(?:\/(accept|reject|report))?$/.exec(url.pathname);
   if(req.method==='GET'&&job&&!job[2]){const s=service(user);send(res,200,{job:s.job(job[1]),wallet:s.wallet()},cors);return;}
   if(req.method==='POST'&&['/api/generations','/api/assistant'].includes(url.pathname)){submissionStage('body_read');const body=await read(req,14_100_000);if(url.pathname==='/api/generations'&&body?.request?.output?.exactText!==undefined)throw new ApiFailure('PAID_TRIAL_NOT_APPROVED',403);submissionStage('service_initialization');const s=service(user);submissionStage('generation_admission');const result=await (url.pathname==='/api/generations'?s.create(body):s.assist(body));submissionStage('response');send(res,url.pathname==='/api/generations'?202:200,result,cors);return;}
   if(req.method==='POST'&&job?.[2]){const body=await read(req,8192),s=service(user);send(res,200,job[2]==='report'?s.reportDefect(job[1],body):job[2]==='accept'?s.accept(job[1],body.artifactId,body.dimensionReview):s.reject(job[1]),cors);return;}
   throw new ApiFailure('NOT_FOUND',404);
  }catch(e){submissionError(e instanceof ApiFailure?e.code:'INTERNAL_ERROR');send(res,e instanceof ApiFailure?e.status:500,{error:{code:e instanceof ApiFailure?e.code:'INTERNAL_ERROR'}},cors);}
 };
 const server=createServer((req,res)=>observeSubmission(req,res,()=>observeReadiness(req,res,()=>handle(req,res))));
 server.requestTimeout=30_000;server.headersTimeout=10_000;server.maxConnections=100;
 return {server,close:async()=>{await new Promise(resolve=>server.close(resolve));await Promise.all([...services.values()].map(s=>s.close()));services.clear();await dimensionAnalysis.close();await singleBox.close();}};
}
export function betaConfig(env=process.env){
 const publicUrl=publicOrigin(env.AIADCAST_BETA_PUBLIC_ORIGIN??env.RENDER_EXTERNAL_URL??''),directory=resolve(env.AIADCAST_BETA_DATA_DIR??'release/beta-runtime');
 const budgetUsd=Number(env.AIADCAST_BETA_MONTHLY_BUDGET_USD??0),port=Number(env.PORT??8790);
 if(!Number.isFinite(budgetUsd)||budgetUsd<0||budgetUsd>100||!Number.isInteger(budgetUsd*1e6)||!Number.isInteger(port)||port<1024||port>65535)throw Error('INVALID_BETA_CONFIG');
 const key=env.AIADCAST_BETA_OPENAI_KEY_FILE?readFileSync(env.AIADCAST_BETA_OPENAI_KEY_FILE,'utf8').trim():env.AIADCAST_NEXT_STAGING_OPENAI_API_KEY;
 return {recommendationPolicy:recommendationPolicyFromEnv(env),publicUrl,directory,monthlyBudgetMicros:budgetUsd*1e6,port,key,enabled:env.AIADCAST_BETA_ENABLE_GENERATION==='true',assistantEnabled:env.AIADCAST_BETA_ENABLE_ASSISTANT==='true'};
}
async function main(){
 if(process.env.AIADCAST_BETA_PROCESS_LOCKED!=='1')throw Error('USE_BETA_LAUNCHER');
 if(process.env.SUPABASE_URL||process.env.SUPABASE_SECRET_KEY||process.env.DATABASE_URL){
  const c=betaConfig();
  const {startCloudServer}=await import('./cloud/runtime.mjs');
  const app=await startCloudServer(c);
  console.log('Supabase-backed beta server started; real payments disabled.');
  let closing=false;const stop=async()=>{if(closing)return;closing=true;await app.close();};process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());return;
 }
 const c=betaConfig(),store=new BetaStore(c.directory,c),gate=providerGate(2);
 const adapter=new OpenAIImageAdapter({apiKey:c.key,enableEdits:c.enabled});
 const app=createBetaServer({store,publicUrl:c.publicUrl,accounts:accountConfiguration(),staticDirectory:resolve('dist'),serviceFactory:user=>new GenerationService({databasePath:join(c.directory,'users',user.id+'.sqlite'),databaseLockManagedExternally:true,managedBudgetIncrease:true,budgetForPeriod:period=>store.effectiveBudget(user.id,period),enabled:c.enabled,assistantEnabled:c.assistantEnabled,budgetMicros:user.budget,testCredits:user.credits,providerConfigured:Boolean(c.key),adapter:{selectiveEditReady:adapter.selectiveEditReady,prepareSelectiveInput:input=>adapter.prepareSelectiveInput(input),editRegion:options=>gate(()=>adapter.editRegion(options)),generate:options=>gate(()=>adapter.generate(options))},assistantAdapter:options=>gate(()=>assistCopy({...options,apiKey:c.key}))})});
 app.server.listen(c.port,'0.0.0.0',()=>console.log('Invite beta server started; real payments disabled.'));
 let closing=false;const stop=async()=>{if(closing)return;closing=true;await app.close();store.close();};process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
}
export function betaStartupCode(error){
 const code=error?.code??error?.message;
 const safe=new Set(['USE_BETA_LAUNCHER','DATABASE_URL_REQUIRED','SUPABASE_SESSION_POOLER_REQUIRED','INVALID_DATABASE_URL_OPTIONS','SUPABASE_URL_REQUIRED','SUPABASE_SECRET_CONFIGURATION_REQUIRED','CLOUD_SERVER_ALREADY_RUNNING','CLOUD_INSTANCE_LOCK_LOST','BETA_BUDGET_CONFIG_CHANGED','SUPABASE_CONNECTION_FAILED','SUPABASE_BUCKET_SETUP_FAILED','SUPABASE_PRIVATE_BUCKET_REQUIRED','TOSS_TEST_KEY_REQUIRED','TOSS_TEST_CLIENT_KEY_REQUIRED','HTTPS_ORIGIN_REQUIRED','INVALID_BETA_CONFIG','INVALID_TEST_AUTH_CONFIG','TEST_AUTH_OWNER_MISMATCH','TEST_AUTH_OWNER_DISABLED','TEST_AUTH_OWNER_LIMIT']);
 if(safe.has(code))return code;
 if(['SELF_SIGNED_CERT_IN_CHAIN','DEPTH_ZERO_SELF_SIGNED_CERT','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code))return 'SUPABASE_DB_CA_REQUIRED';
 if(code==='28P01')return 'POSTGRES_AUTH_FAILED';
 if(['ENOTFOUND','ETIMEDOUT','ECONNREFUSED'].includes(code))return 'DATABASE_CONNECTION_FAILED';
 return 'CONFIGURATION_OR_CONNECTION_FAILED';
}
export function betaStartupMessage(error){
 const code=betaStartupCode(error);
 // Only fixed field names and instructions may reach logs, never supplied values or error details.
 const hints={AIADCAST_TEST_ADMIN_EMAIL:'AIADCAST_TEST_ADMIN_EMAIL must contain a valid email address (not an empty value).',AIADCAST_TEST_ADMIN_PASSWORD:'AIADCAST_TEST_ADMIN_PASSWORD must contain 12-128 characters (not an empty value).'};
 const invalid=code==='INVALID_TEST_AUTH_CONFIG'&&Array.isArray(error?.invalidFields)?error.invalidFields:[];
 const details=Object.entries(hints).filter(([field])=>invalid.includes(field)).map(([,hint])=>hint);
 return 'Beta startup failed: '+code+'. '+(details.length?'Check Render Environment: '+details.join(' ')+' Save the values and deploy again.':'Verify private server configuration.');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(betaStartupMessage(e));process.exitCode=1;});


