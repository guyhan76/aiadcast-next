import pg from 'pg';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync} from 'node:fs';
// All app amounts/timestamps are explicitly bounded below Number.MAX_SAFE_INTEGER.
const integer=value=>{if(!/^-?\d+(?:\.0+)?$/.test(value))throw Error('UNSAFE_DATABASE_INTEGER');const n=Number(value);if(!Number.isSafeInteger(n))throw Error('UNSAFE_DATABASE_INTEGER');return n;};
pg.types.setTypeParser(20,integer);
// SUM(bigint) returns NUMERIC, whose pg default is a string. Quota and budget
// additions must remain numeric rather than concatenating database strings.
pg.types.setTypeParser(1700,integer);
const context=new AsyncLocalStorage();
export function postgresConfiguration(connectionString,projectUrl,env=process.env){
 let u,p;try{u=new URL(connectionString);p=new URL(projectUrl);}catch{throw Error('DATABASE_URL_REQUIRED');}
 const ref=p.hostname.split('.')[0];
 if(!['postgres:','postgresql:'].includes(u.protocol)||!u.password||decodeURIComponent(u.username)!=='postgres.'+ref||!u.hostname.endsWith('.pooler.supabase.com')||u.port!=='5432'||u.pathname!=='/postgres'||u.hash)throw Error('SUPABASE_SESSION_POOLER_REQUIRED');
 // Never let sslmode=require in a URI silently disable certificate validation.
 if([...u.searchParams.keys()].some(k=>k!=='sslmode'))throw Error('INVALID_DATABASE_URL_OPTIONS');
 u.search='';
 const ca=env.AIADCAST_SUPABASE_DB_CA??(env.PGSSLROOTCERT?readFileSync(env.PGSSLROOTCERT,'utf8'):undefined);
 return {connectionString:u.toString(),max:4,connectionTimeoutMillis:15000,idleTimeoutMillis:30000,ssl:{rejectUnauthorized:true,...(ca?{ca}:{})}};
}
export function cloudSchema(userId){if(!/^[a-f0-9-]{36}$/.test(userId))throw Error('INVALID_CLOUD_USER');return 'aiadcast_user_'+userId.replaceAll('-','');}
function sqlDialect(text){
 return text.replace(/PRAGMA\s+[^;]+;/g,'').replace(/\bINTEGER\b/g,'BIGINT').replace(/\bBLOB\b/g,'BYTEA');
}
function parameters(text){let i=0;return text.replace(/\?/g,()=>'$'+(++i));}
export class PostgresDatabase {
 constructor(pool,schema,{guard=()=>{}}={}){if(!/^aiadcast_(accounts|user_[a-f0-9]{32})$/.test(schema))throw Error('INVALID_DATABASE_SCHEMA');this.pool=pool;this.schema=schema;this.guard=guard;}
 async initialize(){const c=await this.pool.connect();try{
  await c.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
  const {rows}=await c.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')");
  const roles=['PUBLIC',...rows.map(r=>'"'+r.rolname+'"')].join(',');
  await c.query(`REVOKE ALL ON SCHEMA "${this.schema}" FROM ${roles}`);
  await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${this.schema}" REVOKE ALL ON TABLES FROM ${roles}`);
  await c.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${this.schema}" REVOKE ALL ON FUNCTIONS FROM ${roles}`);
  return this;
 }finally{c.release();}}
 async using(fn){this.guard();const current=context.getStore();if(current?.db===this)return fn(current.client);const c=await this.pool.connect();try{this.guard();await c.query(`SET search_path TO "${this.schema}", pg_catalog`);return await fn(c);}finally{c.release();}}
 async query(text,values=[]){return this.using(async c=>{
  if(text.startsWith('PRAGMA table_info(')){const name=/PRAGMA table_info\((\w+)\)/.exec(text)?.[1];return c.query('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',[this.schema,name]);}
  return c.query(sqlDialect(parameters(text)),values);
 });}
 prepare(text){return {get:async(...args)=>(await this.query(text,args)).rows[0],all:async(...args)=>(await this.query(text,args)).rows,run:async(...args)=>({changes:(await this.query(text,args)).rowCount})};}
 async exec(text){const sql=sqlDialect(text).trim();if(sql)await this.using(c=>c.query(sql));}
 async transaction(fn){
  if(context.getStore()?.db===this)return fn();
  return this.using(async client=>{await client.query('BEGIN');try{await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[this.schema]);const result=await context.run({db:this,client},fn);this.guard();await client.query('COMMIT');return result;}catch(error){await client.query('ROLLBACK');throw error;}});
 }
 async protectTables(){await this.using(async c=>{
  const {rows}=await c.query('SELECT tablename FROM pg_tables WHERE schemaname=$1',[this.schema]);
  for(const r of rows){if(!/^[a-z_]+$/.test(r.tablename))throw Error('INVALID_TABLE');await c.query(`ALTER TABLE "${this.schema}"."${r.tablename}" ENABLE ROW LEVEL SECURITY`);}
  const result=await c.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')");
  const roles=['PUBLIC',...result.rows.map(r=>'"'+r.rolname+'"')].join(',');
  await c.query(`REVOKE ALL ON ALL TABLES IN SCHEMA "${this.schema}" FROM ${roles}`);
  await c.query(`REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "${this.schema}" FROM ${roles}`);
 });}
 async close(){} // The shared pool and instance lock are owned by the server lifecycle.
}
export async function acquireInstanceLock(pool,onLost,{onStandby,waitMs=300000,retryMs=1000}={}){
 const client=await pool.connect();
 let healthy=true,acquired=false,standby=false;client.on('error',()=>{healthy=false;if(acquired)onLost?.();});
 try{
  const until=Date.now()+waitMs;
  while(healthy){
   const {rows}=await client.query("SELECT pg_try_advisory_lock(hashtext('aiadcast-next-beta-v1')) AS acquired");
   if(rows[0]?.acquired){acquired=true;break;}
   if(!onStandby||Date.now()>=until)throw Error('CLOUD_SERVER_ALREADY_RUNNING');
   if(!standby){standby=true;await onStandby();}
   await new Promise(r=>setTimeout(r,retryMs));
  }
  if(!healthy)throw Error('CLOUD_INSTANCE_LOCK_LOST');
 }catch(e){client.release();throw e;}
 return {assert(){if(!healthy)throw Error('CLOUD_INSTANCE_LOCK_LOST');},async close(){healthy=false;try{await client.query("SELECT pg_advisory_unlock(hashtext('aiadcast-next-beta-v1'))");}finally{client.release();}}};
}
export const createPool=config=>new pg.Pool(config);
