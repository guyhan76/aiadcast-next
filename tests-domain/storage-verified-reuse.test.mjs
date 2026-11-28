import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SupabaseStorage} from '../server/cloud/storage.mjs';
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
function fixture(){
 const records=new Map(),objects=new Map(),calls=[];let insertions=0,beforePost;
 const bytes=Buffer.from('verified fixture image'),sha256=createHash('sha256').update(bytes).digest('hex'),asset={bytes,sha256,mime:'image/png'};
 const db={transaction:async fn=>fn(),prepare:sql=>({get:async(path,user)=>{
  if(sql.includes('SELECT bytes')){const row=records.get(path);return row&&(!sql.includes('AND user_id')||row.user_id===user)?row:undefined;}
  if(sql.includes('SELECT role'))return {role:'member'};
  if(sql.includes('SUM(bytes)'))return {n:[...records.values()].filter(r=>!sql.includes('WHERE user_id')||r.user_id===path).reduce((n,r)=>n+r.bytes,0)};
  throw Error('unexpected fixture query');
 },run:async(path,user,bytes)=>{assert.match(sql,/INSERT INTO storage_objects/);assert.equal(records.has(path),false);records.set(path,{user_id:user,bytes});insertions++;}})};
 const storage=new SupabaseStorage({url:'https://sxpzbfapbizlmsuqlrfu.supabase.co',secretKey:'sb_secret_fixture',accountsDb:db,fetchImpl:async(url,options)=>{
  const path=new URL(url).pathname.split('aiadcast-private-beta/')[1];calls.push({path,method:options.method,upsert:options.headers['x-upsert']});
  if(options.method==='GET')return objects.has(path)?new Response(objects.get(path)):new Response('',{status:404});
  assert.equal(options.headers['x-upsert'],undefined);beforePost?.(path);if(objects.has(path))return new Response('',{status:409});objects.set(path,Buffer.from(options.body));return Response.json({});
 }});
 return {storage,asset,records,objects,calls,insertions:()=>insertions,setRace:fn=>beforePost=fn,path:id=>id+'/'+sha256+'.png'};
}
test('live verification bypasses cache and enforces owner/canonical path/hash',async()=>{
 const f=fixture(),p=f.path(owner);f.records.set(p,{user_id:owner,bytes:f.asset.bytes.length});f.objects.set(p,f.asset.bytes);
 assert.equal(await f.storage.verifyAsset(owner,f.asset),true);assert.equal(await f.storage.verifyAsset(other,f.asset),false);
 f.storage.cache.set(p,f.asset.bytes);f.objects.delete(p);assert.equal(await f.storage.verifyAsset(owner,f.asset),false);
 await assert.rejects(f.storage.verifyAsset('../'+owner,f.asset),/INVALID_STORAGE_PATH/);
 f.objects.set(p,Buffer.alloc(f.asset.bytes.length,7));await assert.rejects(f.storage.verifyAsset(owner,f.asset),/STORAGE_CONTENT_MISMATCH/);assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
});
test('missing blob restoration reuses its quota reservation without overwrite or duplicate bytes accounting',async()=>{
 const f=fixture(),p=f.path(owner);f.records.set(p,{user_id:owner,bytes:f.asset.bytes.length});
 assert.equal(await f.storage.verifyAsset(owner,f.asset),false);
 await f.storage.put(owner,f.asset.sha256+'.png',f.asset.bytes,f.asset.mime,{immutable:true});
 assert.equal(f.insertions(),0);assert.equal(f.records.size,1);assert.deepEqual(f.objects.get(p),f.asset.bytes);assert.equal(await f.storage.verifyAsset(owner,f.asset),true);
});
for(const same of [true,false])test(`racing create-only writer is verified and never overwritten (same bytes=${same})`,async()=>{
 const f=fixture(),p=f.path(owner),winner=same?f.asset.bytes:Buffer.alloc(f.asset.bytes.length,8);f.records.set(p,{user_id:owner,bytes:f.asset.bytes.length});f.setRace(path=>f.objects.set(path,winner));
 const work=f.storage.put(owner,f.asset.sha256+'.png',f.asset.bytes,f.asset.mime,{immutable:true});
 if(same)assert.equal(await work,p);else await assert.rejects(work,/STORAGE_CONTENT_MISMATCH/);
 assert.deepEqual(f.objects.get(p),winner);assert.equal(f.insertions(),0);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('same hash in another owner has an independent quota row and private object',async()=>{
 const f=fixture();await f.storage.put(owner,f.asset.sha256+'.png',f.asset.bytes,f.asset.mime,{immutable:true});assert.equal(await f.storage.verifyAsset(other,f.asset),false);
 await f.storage.put(other,f.asset.sha256+'.png',f.asset.bytes,f.asset.mime,{immutable:true});assert.equal(f.records.size,2);assert.equal(f.insertions(),2);assert.equal(f.objects.size,2);
});
