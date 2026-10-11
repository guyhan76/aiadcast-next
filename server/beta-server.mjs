import {createServer} from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BetaStore} from './beta-store.mjs';
import {GenerationService,ApiFailure} from './generation-service.mjs';
import {OpenAIImageAdapter,ProviderFailure} from './openai-image-adapter.mjs';
import {assistCopy} from './text-assistant.mjs';
import {EmailAuth} from './email-auth.mjs';
import {TestCheckout} from './test-checkout.mjs';
import {accountConfiguration} from './account-providers.mjs';
export const ANDROID_ORIGIN='https://appassets.androidplatform.net';
export function providerGate(max=2){let active=0;return async task=>{if(active>=max)throw new ProviderFailure('PROVIDER_BUSY',{uncertain:false});active++;try{return await task();}finally{active--;}};}
export function publicOrigin(value){const u=new URL(value);if(u.protocol!=='https:'||!u.hostname||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('HTTPS_ORIGIN_REQUIRED');return u.origin;}
export function createBetaServer({store,publicUrl,serviceFactory,now=()=>Date.now(),extraOrigins=[],staticDirectory,accounts={}}) {
 const assets=new Map();
 if(staticDirectory){const scan=(folder,prefix='')=>{for(const item of readdirSync(folder,{withFileTypes:true})){const name=prefix+item.name;if(item.isDirectory())scan(join(folder,item.name),name+'/');else assets.set('/'+name,readFileSync(join(folder,item.name)));}};scan(staticDirectory);}
 const origin=publicOrigin(publicUrl),allowed=new Set([origin,ANDROID_ORIGIN,...extraOrigins.map(publicOrigin)]),services=new Map();
 // Bounded in-memory limiter: all traffic shares a global ceiling, including behind a proxy.
 let windowStart=now(),requests=0,logins=0,bodies=0;
 const limit=isLogin=>{if(now()-windowStart>=60_000){windowStart=now();requests=0;logins=0;}if(++requests>600||(isLogin&&++logins>20))throw new ApiFailure('RATE_LIMITED',429);};
 const service=user=>{if(!services.has(user.id))services.set(user.id,serviceFactory(user));return services.get(user.id);};
 const email=new EmailAuth(store,{sendMail:accounts.sendMail,publicOrigin:origin,now});
 const checkout=new TestCheckout(store,{...accounts,publicOrigin:origin,now,creditPurchase:async(id,purchase)=>{const user=store.db.prepare('SELECT * FROM users WHERE id=? AND disabled=0').get(id);if(!user)throw new ApiFailure('AUTH_REQUIRED',401);return service(user).recordTestPurchase(purchase);}});
 const send=(res,status,value,cors)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...(cors?{'Access-Control-Allow-Origin':cors,'Vary':'Origin'}:{})});res.end(JSON.stringify(value));};
 const read=async(req,max)=>{if(!/^application\/json(?:;.*)?$/i.test(req.headers['content-type']??''))throw new ApiFailure('JSON_REQUIRED',415);if(Number(req.headers['content-length']??0)>max)throw new ApiFailure('REQUEST_TOO_LARGE',413);if(bodies>=2)throw new ApiFailure('SERVER_BUSY',429);bodies++;try{let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>max)throw new ApiFailure('REQUEST_TOO_LARGE',413);parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new ApiFailure('INVALID_JSON',400);}}finally{bodies--;}};
 const server=createServer(async(req,res)=>{
  const cors=allowed.has(req.headers.origin)?req.headers.origin:null;
  try {
   const url=new URL(req.url,origin);
   if(req.method==='GET'&&!url.pathname.startsWith('/api/')){const path=url.pathname==='/'?'/index.html':url.pathname;const bytes=assets.get(path);if(!bytes)throw new ApiFailure('NOT_FOUND',404);const ext=path.split('.').pop();res.writeHead(200,{'Content-Type':({html:'text/html; charset=utf-8',js:'text/javascript',css:'text/css',woff2:'font/woff2',png:'image/png',webp:'image/webp',svg:'image/svg+xml'})[ext]??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':ext==='html'?'no-store':'public, max-age=31536000, immutable','Content-Security-Policy':"default-src 'self'; script-src 'self' https://js.tosspayments.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' data: blob: https://*.tosspayments.com; frame-src https://*.tosspayments.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer'});res.end(bytes);return;}
   limit(['/api/auth/login','/api/auth/email/request','/api/auth/email/verify','/api/checkout/confirm','/api/checkout/launch'].includes(url.pathname));
   if(req.headers.origin&&!cors)throw new ApiFailure('ORIGIN_NOT_ALLOWED',403);
   if(req.method==='OPTIONS'){if(!cors)throw new ApiFailure('ORIGIN_NOT_ALLOWED',403);res.writeHead(204,{'Access-Control-Allow-Origin':cors,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,X-Aiadcast-Client','Vary':'Origin'});res.end();return;}
   if(req.method==='GET'&&url.pathname==='/api/health'){send(res,200,{mode:'invite-beta',commercialReady:false},cors);return;}
   if(req.method==='POST'&&!cors)throw new ApiFailure('ORIGIN_REQUIRED',403);
   if(req.method==='POST'&&req.headers['x-aiadcast-client']!=='local-studio')throw new ApiFailure('CLIENT_HEADER_REQUIRED',403);
   if(req.method==='POST'&&url.pathname==='/api/auth/login'){const b=await read(req,1024);send(res,200,store.login(b?.invite),cors);return;}
   if(req.method==='GET'&&url.pathname==='/api/account/capabilities'){send(res,200,{email:{enabled:Boolean(accounts.sendMail)},checkout:{enabled:checkout.available(),test:true,currency:'KRW'}},cors);return;}
   if(req.method==='POST'&&url.pathname.startsWith('/api/auth/email/')){const b=await read(req,2048);let result;
    if(url.pathname==='/api/auth/email/request')result=await email.request(b?.email);
    else if(url.pathname==='/api/auth/email/verify')result=email.verify(b?.token);
    else if(url.pathname==='/api/auth/email/exchange')result=email.exchange(b?.requestId,b?.pollToken);
    else throw new ApiFailure('NOT_FOUND',404);
    send(res,200,result,cors);return;}
   if(req.method==='POST'&&['/api/checkout/launch','/api/checkout/confirm'].includes(url.pathname)){const b=await read(req,2048);send(res,200,await (url.pathname.endsWith('/launch')?checkout.launch(b):checkout.confirm(b)),cors);return;}
   const user=store.authenticate(req.headers.authorization);
   if(url.pathname==='/api/checkout/orders'&&req.method==='POST'){send(res,201,checkout.create(user,await read(req,2048)),cors);return;}
   if(url.pathname==='/api/checkout/orders'&&req.method==='GET'){send(res,200,{orders:checkout.history(user)},cors);return;}
   const order=/^\/api\/checkout\/orders\/([A-Za-z0-9_-]{8,100})$/.exec(url.pathname);
   if(order&&req.method==='GET'){send(res,200,await checkout.status(user,order[1]),cors);return;}
   if(req.method==='POST'&&url.pathname==='/api/auth/logout'){store.logout(req.headers.authorization);send(res,200,{signedOut:true},cors);return;}
   if(req.method==='GET'&&url.pathname==='/api/auth/me'){send(res,200,{user:{id:user.id,label:user.label}},cors);return;}
   if(req.method==='GET'&&url.pathname==='/api/projects'){send(res,200,{projects:store.list(user.id)},cors);return;}
   const project=/^\/api\/projects\/([A-Za-z0-9_-]{8,100})$/.exec(url.pathname);
   if(project&&req.method==='GET'){send(res,200,store.project(user.id,project[1]),cors);return;}
   if(project&&req.method==='POST'){send(res,200,store.save(user.id,project[1],await read(req,40_001_000)),cors);return;}
   if(req.method==='GET'&&url.pathname==='/api/status'){const s=service(user).status();send(res,200,{...s,mode:'invite-beta',limitations:s.limitations.filter(x=>!['local-single-user','no-production-auth'].includes(x)).concat(['invite-only','single-instance-beta','no-live-payment']),user:{id:user.id,label:user.label}},cors);return;}
   if(req.method==='GET'&&url.pathname==='/api/generations'){send(res,200,service(user).history(url.searchParams.get('projectId')??undefined),cors);return;}
   const job=/^\/api\/generations\/([A-Za-z0-9_-]{8,100})(?:\/(accept|reject))?$/.exec(url.pathname);
   if(req.method==='GET'&&job&&!job[2]){const s=service(user);send(res,200,{job:s.job(job[1]),wallet:s.wallet()},cors);return;}
   if(req.method==='POST'&&['/api/generations','/api/assistant'].includes(url.pathname)){const body=await read(req,14_100_000),s=service(user);send(res,url.pathname==='/api/generations'?202:200,await(url.pathname==='/api/generations'?s.create(body):s.assist(body)),cors);return;}
   if(req.method==='POST'&&job?.[2]){const body=await read(req,2048),s=service(user);send(res,200,job[2]==='accept'?s.accept(job[1],body.artifactId):s.reject(job[1]),cors);return;}
   throw new ApiFailure('NOT_FOUND',404);
  }catch(e){send(res,e instanceof ApiFailure?e.status:500,{error:{code:e instanceof ApiFailure?e.code:'INTERNAL_ERROR'}},cors);}
 });
 server.requestTimeout=30_000;server.headersTimeout=10_000;server.maxConnections=100;
 return {server,close:async()=>{await new Promise(resolve=>server.close(resolve));await Promise.all([...services.values()].map(s=>s.close()));services.clear();}};
}
export function betaConfig(env=process.env){
 const publicUrl=publicOrigin(env.AIADCAST_BETA_PUBLIC_ORIGIN??env.RENDER_EXTERNAL_URL??''),directory=resolve(env.AIADCAST_BETA_DATA_DIR??'release/beta-runtime');
 const budgetUsd=Number(env.AIADCAST_BETA_MONTHLY_BUDGET_USD??0),port=Number(env.PORT??8790);
 if(!Number.isFinite(budgetUsd)||budgetUsd<0||budgetUsd>100||!Number.isInteger(budgetUsd*1e6)||!Number.isInteger(port)||port<1024||port>65535)throw Error('INVALID_BETA_CONFIG');
 const key=env.AIADCAST_BETA_OPENAI_KEY_FILE?readFileSync(env.AIADCAST_BETA_OPENAI_KEY_FILE,'utf8').trim():env.AIADCAST_NEXT_STAGING_OPENAI_API_KEY;
 return {publicUrl,directory,monthlyBudgetMicros:budgetUsd*1e6,port,key,enabled:env.AIADCAST_BETA_ENABLE_GENERATION==='true',assistantEnabled:env.AIADCAST_BETA_ENABLE_ASSISTANT==='true'};
}
async function main(){
 if(process.env.AIADCAST_BETA_PROCESS_LOCKED!=='1')throw Error('USE_BETA_LAUNCHER');
 const c=betaConfig(),store=new BetaStore(c.directory,c),gate=providerGate(2);
 const adapter=new OpenAIImageAdapter({apiKey:c.key});
 const app=createBetaServer({store,publicUrl:c.publicUrl,accounts:accountConfiguration(),staticDirectory:resolve('dist'),serviceFactory:user=>new GenerationService({databasePath:join(c.directory,'users',user.id+'.sqlite'),databaseLockManagedExternally:true,managedBudgetIncrease:true,enabled:c.enabled,assistantEnabled:c.assistantEnabled,budgetMicros:user.budget,testCredits:user.credits,providerConfigured:Boolean(c.key),adapter:{generate:options=>gate(()=>adapter.generate(options))},assistantAdapter:options=>gate(()=>assistCopy({...options,apiKey:c.key}))})});
 app.server.listen(c.port,'0.0.0.0',()=>console.log('Invite beta server started; real payments disabled.'));
 let closing=false;const stop=async()=>{if(closing)return;closing=true;await app.close();store.close();};process.once('SIGTERM',()=>void stop());process.once('SIGINT',()=>void stop());
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Beta startup failed. Use the beta launcher and verify origin, data and budget configuration.');process.exitCode=1;});
