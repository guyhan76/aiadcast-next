import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
export async function pgPool(folder,fault={}){
 const engine=new PGlite(folder);await engine.waitReady;
 await engine.exec("DO $$ DECLARE r text;BEGIN FOREACH r IN ARRAY ARRAY['postgres','anon','authenticated','service_role'] LOOP IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I',r);END IF;END LOOP;END $$;");
 let tail=Promise.resolve(),closed=false;
 return {engine,async connect(){
  if(closed)throw Error('POOL_CLOSED');let unlock;const previous=tail;tail=new Promise(r=>unlock=r);await previous;
  let released=false,readyWrite=false;return {on(){},async query(sql,args=[]){
   const r=(!args.length&&sql.trim().split(';').filter(s=>s.trim()).length>1)?(await engine.exec(sql)).at(-1):await engine.query(sql,args);
   if(sql.includes("UPDATE jobs SET status='ready'")||(sql.includes('UPDATE recommendation_jobs SET output_json')&&args.includes('completed')))readyWrite=true;
   if(sql==='COMMIT'&&readyWrite&&fault.loseReadyCommit){fault.loseReadyCommit=false;fault.lost=true;throw Error('fixture commit response lost');}
   // Match the production pg integer parsers for BIGINT/NUMERIC. PGlite
   // otherwise leaves SUM(bigint) as strings and concatenates allocations.
   const rows=r.rows.map(row=>Object.fromEntries(Object.entries(row).map(([name,value])=>{const field=r.fields.find(f=>f.name===name);return [name,value!==null&&[20,1700].includes(field?.dataTypeID)?pg.types.getTypeParser(field.dataTypeID)(String(value)):value];})));
   return {...r,rows,rowCount:r.command==='SELECT'?rows.length:r.affectedRows};
  },release(){if(!released){released=true;unlock();}}};
 },async end(){await tail;closed=true;await engine.close();}};
}
