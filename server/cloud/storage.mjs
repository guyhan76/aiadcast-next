import {createHash} from 'node:crypto';
import {ApiFailure} from '../generation-service.mjs';
const fail=(code,status=503)=>{throw new ApiFailure(code,status);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export class SupabaseStorage {
 constructor({url,secretKey,accountsDb,fetchImpl=fetch}){
  let u;try{u=new URL(url);}catch{throw Error('SUPABASE_URL_REQUIRED');}
  if(u.protocol!=='https:'||!/^([a-z0-9]{20})\.supabase\.co$/.test(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/'||typeof secretKey!=='string'||!/^sb_secret_[A-Za-z0-9_-]+$/.test(secretKey))throw Error('SUPABASE_SECRET_CONFIGURATION_REQUIRED');
  this.origin=u.origin;this.key=secretKey;this.db=accountsDb;this.fetch=fetchImpl;this.bucket='aiadcast-private-beta';this.cache=new Map();this.cacheBytes=0;
 }
 async call(path,{method='GET',body,mime='application/json',raw=false,upsert=true}={}){
  let res;try{res=await this.fetch(this.origin+path,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{apikey:this.key,...(body?{'Content-Type':mime}:{}),...(raw&&method==='POST'&&upsert?{'x-upsert':'true'}:{})},...(body?{body:raw?body:JSON.stringify(body)}:{})});}catch{fail('SUPABASE_CONNECTION_FAILED');}
  return res;
 }
 async initialize(){
  await this.db.exec('CREATE TABLE IF NOT EXISTS storage_objects(path TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),bytes INTEGER NOT NULL CHECK(bytes>0));');
  let res=await this.call('/storage/v1/bucket/'+this.bucket);
  if(res.status===404||res.status===400){const created=await this.call('/storage/v1/bucket',{method:'POST',body:{id:this.bucket,name:this.bucket,public:false,file_size_limit:40000000,allowed_mime_types:['image/png','image/jpeg','image/webp','application/json']}});if(!created.ok)fail('SUPABASE_BUCKET_SETUP_FAILED');res=await this.call('/storage/v1/bucket/'+this.bucket);}
  if(!res.ok)fail('SUPABASE_BUCKET_SETUP_FAILED');
  const info=await res.json();if(info.public!==false)fail('SUPABASE_PRIVATE_BUCKET_REQUIRED');return this;
 }
 path(userId,name){if(!/^[a-f0-9-]{36}$/.test(userId)||!/^([a-f0-9]{64}\.(png|jpeg|webp)|project-[A-Za-z0-9_-]{8,100}-[a-f0-9-]{36}\.json)$/.test(name))fail('INVALID_STORAGE_PATH',400);return userId+'/'+name;}
 async accountLimit(userId){
  // Storage allowance only: read the current server role, never client claims
  // or a cached session role. This does not change supplier/credit budgets.
  const user=await this.db.prepare('SELECT role,storage_plan FROM users WHERE id=? AND disabled=0').get(userId);
  return user?.role==='admin'||user?.storage_plan==='standard'?600000000:100000000;
 }
 async assertGenerationCapacity(userId,originals,outputBytes){
  let needed=outputBytes;
  for(const asset of originals){
   const extension=asset.mime==='image/png'?'png':asset.mime==='image/jpeg'?'jpeg':'webp';
   const path=this.path(userId,asset.sha256+'.'+extension);
   const old=await this.db.prepare('SELECT bytes FROM storage_objects WHERE path=?').get(path);
   if(old&&old.bytes!==asset.bytes.length)fail('STORAGE_CONTENT_CONFLICT',409);
   if(!old)needed+=asset.bytes.length;
  }
  const total=await this.db.prepare('SELECT COALESCE(SUM(bytes),0) n FROM storage_objects').get();
  const user=await this.db.prepare('SELECT COALESCE(SUM(bytes),0) n FROM storage_objects WHERE user_id=?').get(userId);
  if(total.n+needed>900000000||user.n+needed>await this.accountLimit(userId))fail('STORAGE_CAPACITY_UNAVAILABLE',413);
 }
 async renewAsset(userId,hash){
  await this.db.prepare("UPDATE storage_objects SET expires_at=GREATEST(expires_at,now()+interval '24 hours') WHERE user_id=? AND split_part(split_part(path,'/',2),'.',1)=?").run(userId,hash);
 }
 async verifyAsset(userId,asset){
  if(!Buffer.isBuffer(asset.bytes)||sha(asset.bytes)!==asset.sha256)fail('STORAGE_CONTENT_MISMATCH');
  const extension=asset.mime==='image/png'?'png':asset.mime==='image/jpeg'?'jpeg':'webp';
  const path=this.path(userId,asset.sha256+'.'+extension);
  const record=await this.db.prepare('SELECT bytes FROM storage_objects WHERE path=? AND user_id=?').get(path,userId);
  if(!record)return false;
  if(record.bytes!==asset.bytes.length)fail('STORAGE_CONTENT_CONFLICT',409);
  // Bypass the in-memory cache: committed metadata is not proof of a live blob.
  const res=await this.call('/storage/v1/object/authenticated/'+this.bucket+'/'+path);
  if(res.status===404)return false;
  if(!res.ok)fail('SUPABASE_DOWNLOAD_FAILED');
  if(Number(res.headers.get('content-length')??0)>asset.bytes.length)fail('STORAGE_CONTENT_MISMATCH');
  const hash=createHash('sha256');let size=0;
  for await(const chunk of res.body){size+=chunk.length;if(size>asset.bytes.length)fail('STORAGE_CONTENT_MISMATCH');hash.update(chunk);}
  if(size!==asset.bytes.length||hash.digest('hex')!==asset.sha256)fail('STORAGE_CONTENT_MISMATCH');
  return true;
 }
 async put(userId,name,bytes,mime,{immutable=false}={}){
  const path=this.path(userId,name);if(!Buffer.isBuffer(bytes)||bytes.length<1||bytes.length>40000000)fail('STORAGE_LIMIT',413);
  if(immutable&&name!==sha(bytes)+'.'+(mime==='image/png'?'png':mime==='image/jpeg'?'jpeg':'webp'))fail('STORAGE_CONTENT_MISMATCH');
  // Reserve storage quota before upload. Unknown outcomes retain the reservation.
  await this.db.transaction(async()=>{
   const old=await this.db.prepare('SELECT bytes FROM storage_objects WHERE path=?').get(path);
   if(old){if(old.bytes!==bytes.length)fail('STORAGE_CONTENT_CONFLICT',409);return;}
   const total=await this.db.prepare('SELECT COALESCE(SUM(bytes),0) n FROM storage_objects').get();
   const user=await this.db.prepare('SELECT COALESCE(SUM(bytes),0) n FROM storage_objects WHERE user_id=?').get(userId);
   if(total.n+bytes.length>900000000||user.n+bytes.length>await this.accountLimit(userId))fail('STORAGE_LIMIT',413);
   await this.db.prepare('INSERT INTO storage_objects(path,user_id,bytes) VALUES(?,?,?)').run(path,userId,bytes.length);
  });
  const res=await this.call('/storage/v1/object/'+this.bucket+'/'+path,{method:'POST',body:bytes,mime,raw:true,upsert:!immutable});
  if(!res.ok){
   // Create-only upload: a racing writer must not be overwritten. An error
   // acknowledgement is successful only if the actual winner's bytes match.
   if(!immutable||!await this.verifyAsset(userId,{bytes,mime,sha256:sha(bytes)}))fail('SUPABASE_UPLOAD_FAILED');
  }
  return path;
 }
 async get(userId,path){
  if(!path.startsWith(userId+'/'))fail('STORAGE_OWNER_MISMATCH',403);
  const record=await this.db.prepare('SELECT bytes FROM storage_objects WHERE path=? AND user_id=? AND expires_at>now()').get(path,userId);if(!record)fail('STORAGE_NOT_FOUND',404);
  if(this.cache.has(path))return Buffer.from(this.cache.get(path));
  const res=await this.call('/storage/v1/object/authenticated/'+this.bucket+'/'+path);if(!res.ok)fail('SUPABASE_DOWNLOAD_FAILED');
  if(Number(res.headers.get('content-length')??0)>40000000)fail('STORAGE_LIMIT',413);
  const parts=[];let size=0;for await(const chunk of res.body){size+=chunk.length;if(size>40000000)fail('STORAGE_LIMIT',413);parts.push(chunk);}const bytes=Buffer.concat(parts);
  if(bytes.length!==record.bytes)fail('STORAGE_CONTENT_MISMATCH');
  const hash=/\/([a-f0-9]{64})\./.exec(path)?.[1];if(hash&&sha(bytes)!==hash)fail('STORAGE_CONTENT_MISMATCH');
  while(this.cacheBytes+bytes.length>24000000&&this.cache.size){const first=this.cache.keys().next().value;this.cacheBytes-=this.cache.get(first).length;this.cache.delete(first);}
  if(bytes.length<=24000000){this.cache.set(path,bytes);this.cacheBytes+=bytes.length;}return bytes;
 }
 async remove(userId,path){
  if(!path.startsWith(userId+'/'))fail('STORAGE_OWNER_MISMATCH',403);
  const res=await this.call('/storage/v1/object/'+this.bucket,{method:'DELETE',body:{prefixes:[path]}});if(!res.ok)fail('SUPABASE_DELETE_FAILED');
  await this.db.prepare('DELETE FROM storage_objects WHERE path=? AND user_id=?').run(path,userId);
  if(this.cache.has(path)){this.cacheBytes-=this.cache.get(path).length;this.cache.delete(path);}
 }
 async sendAuthEmail({email,url}){
  // Operator must configure the Magic Link template to use {{ .RedirectTo }}.
  const res=await this.call('/auth/v1/otp?redirect_to='+encodeURIComponent(url),{method:'POST',body:{email,create_user:true}});
  if(!res.ok)fail('EMAIL_SEND_FAILED');
 }
}
