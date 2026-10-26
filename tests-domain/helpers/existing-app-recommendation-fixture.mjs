import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import pg from 'pg';
import {PostgresDatabase,postgresConfiguration,cloudSchema,acquireInstanceLock} from '../../server/cloud/postgres.mjs';
import {createCloudBackend} from '../../server/cloud/beta.mjs';
import {ProviderFailure,IMAGE_MODEL,IMAGE_REVISION,hashBytes,imageUsageCost} from '../../server/openai-image-adapter.mjs';
import {betaStartupCode} from '../../server/beta-server.mjs';
const origin='https://beta.example.com',ref='sxpzbfapbizlmsuqlrfu';
const env={SUPABASE_URL:`https://${ref}.supabase.co`,SUPABASE_SECRET_KEY:'sb_secret_test_fixture'};
const config={publicUrl:origin,monthlyBudgetMicros:1_000_000,enabled:true,assistantEnabled:false};
const bytes=await sharp({create:{width:8,height:8,channels:4,background:'#eee'}}).png().toBuffer();
const hash=hashBytes(bytes),source={name:'product.png',data:`data:image/png;base64,${bytes.toString('base64')}`,width:8,height:8,sha256:hash};
const usage={input_tokens:2100,input_tokens_details:{text_tokens:100,image_tokens:2000},output_tokens:1756};
function generation(){return {requestId:randomUUID(),projectId:'project-cloud-test',source,request:{version:1,mode:'original',operation:'compose-original',subjectType:'physical-product',productName:'우체국3호박스',productProfile:{category:'box'},brief:'Warm studio background',source:{sha256:hash,role:'protected-product'},copy:{title:'든든한 배송의 시작'},specifications:[{axis:'width',value:'340',unit:'mm'},{axis:'depth',value:'250',unit:'mm'},{axis:'height',value:'210',unit:'mm'}],output:{format:'1:1',locale:'ko',showDimensions:true},scene:{backgroundColor:'#ffffff'}}};}

import {pgPool} from './recommendation-pg-pool.mjs';
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
export async function setup(t,{adapter,accounts,fault={},recommendationPolicy,recommendationTransport}={}){
 const folder=mkdtempSync(join(tmpdir(),'aiadcast-cloud-')),bucket=bucketFixture();let app,calls=0;
 const defaultAdapter={generate:async()=>{calls++;return {bytes,mime:'image/png',width:8,height:8,sha256:hash,role:'background',usage,cost:imageUsageCost(usage),model:IMAGE_MODEL,revision:IMAGE_REVISION,providerRequestId:'fixture-provider'};}};
 const start=async()=>{
  app=await createCloudBackend({...config,...(recommendationPolicy?{recommendationPolicy,key:'synthetic-test-placeholder'}:{})},env,{pool:await pgPool(join(folder,'pg'),fault),storageFetch:bucket.fetchImpl,recommendationTransport,adapter:adapter??defaultAdapter,accounts:accounts??{},staticDirectory:null,skipInstanceLock:true});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return app;
 };
 await start();t.after(async()=>{if(app)await app.close();rmSync(folder,{recursive:true,force:true});});
 const call=async(path,{token,body,requestOrigin=origin}={})=>{
  const r=await fetch('http://127.0.0.1:'+app.server.address().port+path,{method:body===undefined?'GET':'POST',headers:{Origin:requestOrigin,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json','X-Aiadcast-Client':'local-studio'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:r.status,data:await r.json()};
 };
 return {get app(){return app;},bucket,call,calls:()=>calls,async restart(){await app.close();app=null;return start();},async member(label='Tester',budgetMicros=0,credits=0){const i=await app.store.provision({label,budgetMicros,credits});const r=await call('/api/auth/login',{body:{invite:i.invite}});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;}};
}

export {generation};
