import test from 'node:test';
import pg from 'pg';
import assert from 'node:assert/strict';
import {pgPool} from './helpers/recommendation-pg-pool.mjs';
import {readAdminGenerationPage} from '../server/cloud/admin-generation-page.mjs';
import {generationPageQuery} from '../server/admin-generation-page.mjs';
import {cloudSchema} from '../server/cloud/postgres.mjs';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
test('bounded SQL cursor pages across owners, old history and equal timestamps; read only, filters preserve states/cost',async()=>{
 const pool=await pgPool();try{
 await pool.engine.exec('CREATE SCHEMA aiadcast_accounts;CREATE TABLE aiadcast_accounts.users(id text primary key,label text);');
 for(const [id,label] of [[a,'Admin'],[b,'Member']]){
  await pool.engine.query('INSERT INTO aiadcast_accounts.users VALUES($1,$2)',[id,label]);const s=cloudSchema(id);
  await pool.engine.exec(`CREATE SCHEMA "${s}";CREATE TABLE "${s}".generation_records(id text primary key,created_at bigint,error_code text,request_json text,metadata_json text);CREATE TABLE "${s}".jobs(id text primary key,status text,reason text);`);
  for(let i=0;i<36;i++){const error=i===2?'PROVIDER_UNCERTAIN':i===3?'PROVIDER_HTTP':null;
   await pool.engine.query(`INSERT INTO "${s}".generation_records VALUES($1,$2,$3,$4,$5)`,['job-'+String(i).padStart(3,'0'),Date.UTC(2026,9,27)-i*86400000,error,JSON.stringify({output:{format:'9:16'}}),JSON.stringify({model:'mock',...(i%2?{cost:{microUsd:1234}}:{})})]);
   await pool.engine.query(`INSERT INTO "${s}".jobs VALUES($1,$2,$3)`,['job-'+String(i).padStart(3,'0'),i===0?'accepted':i===1?'released':'ready',i===1?'customer_rejected':null]);
  }
 }
 const statements=[],wrapped={async connect(){const c=await pool.connect();return {release:()=>c.release(),async query(sql,args){statements.push(sql);assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|expire)\b/i);const result=await c.query(sql,args);if(sql.includes('array_agg')){assert.match(sql,/array_agg\(c\.relname::text\)/);for(const row of result.rows){const oid=sql.includes('c.relname::text')?1009:1003;row.tables=pg.types.getTypeParser(oid)('{'+row.tables.join(',')+'}');assert.ok(Array.isArray(row.tables));}}return result;}};}};
 const options={pool:wrapped,actor:{id:a,role:'admin'},now:()=>Date.UTC(2026,9,27)};
 let cursor='',seen=[];do{const page=await readAdminGenerationPage({...options,search:new URLSearchParams({cursor}).toString()});assert.ok(page.jobs.length<=10);seen.push(...page.jobs.map(j=>j.userLabel+j.id));cursor=page.nextCursor;}while(cursor);
 assert.equal(seen.length,72);assert.equal(new Set(seen).size,72);assert.ok(seen.includes('Adminjob-035'));
 const accepted=await readAdminGenerationPage({...options,search:'state=accepted&days=7'});assert.equal(accepted.jobs.length,2);assert.equal(accepted.jobs[0].state,'accepted');assert.equal(accepted.jobs[0].costMicros,null);
 const uncertain=await readAdminGenerationPage({...options,search:'state=uncertain'});assert.equal(uncertain.jobs.length,2);assert.equal(uncertain.jobs[0].errorCode,'PROVIDER_UNCERTAIN');
 const recent=await readAdminGenerationPage({...options,search:'days=7'});assert.equal(recent.jobs.length,10);assert.ok(recent.nextCursor);
 assert.ok(statements.filter(s=>s.includes('UNION ALL')).every(s=>s.includes('LIMIT 11')));
 const before=statements.length;await assert.rejects(readAdminGenerationPage({...options,actor:{id:b,role:'member'}}),e=>e.status===403);await assert.rejects(readAdminGenerationPage({...options,actor:{id:a,role:'admin',disabled:1}}),e=>e.status===403);assert.equal(statements.length,before);
 }finally{await pool.end();}
});
test('invalid filters and malicious cursors reject before any DB call',async()=>{
 for(const search of ['state=made-up','days=100000','cursor=bogus','cursor='+Buffer.from(JSON.stringify([1,'schema"attack','id'])).toString('base64url')])assert.throws(()=>generationPageQuery(search),e=>e.status===400);
 let connected=false;await assert.rejects(readAdminGenerationPage({pool:{connect(){connected=true;}},actor:{role:'admin'},search:'state=bad'}));assert.equal(connected,false);
});
