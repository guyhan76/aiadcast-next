import test from 'node:test';
import assert from 'node:assert/strict';
import {readAdminOverview} from '../server/cloud/admin-overview.mjs';
import {cloudSchema} from '../server/cloud/postgres.mjs';
const id=i=>`${i.toString(16).padStart(8,'0')}-0000-0000-0000-000000000000`;
function fixture(count,{partial=false,failRead=false,missing=false}={}){
 const members=Array.from({length:count},(_,i)=>({id:id(i),label:'member '+i,email:i?'member'+i+'@example.com':'owner@example.com',role:i?'member':'admin',disabled:0,projects:0,credits:3,budget:500000}));
 const statements=[];let connects=0,releases=0;
 const pool={async connect(){connects++;return {release(){releases++;},async query(sql,values){
  statements.push(sql);assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|REVOKE|GRANT)\b/);
  if(sql.includes('aiadcast_accounts.users'))return {rows:[{members,approval:null,support:null,orders:[],audit:[]}]};
  if(sql.includes('pg_catalog.pg_namespace'))return {rows:missing?[]:members.map(u=>({nspname:cloudSchema(u.id),tables:['wallets','credit_wallets','budgets','generation_records',...(partial?[]:['jobs'])]}))};
  if(sql.includes('row_to_json(w)')){if(failRead)throw Error('simulated database timeout');return {rows:members.map(u=>({id:u.id,wallet:{available:2,reserved:1},credits:{available:20,reserved:0},budget:{spent_micros:10,held_micros:20},jobs:[{id:'job-'+u.id,created_at:Date.UTC(2026,9,20),error_code:null,status:'ready',reason:null,mode:'creative',format:'9:16',model:'mock',cost:'42'}]}))};}
  return {rows:[]};
 }}}};
 const args={pool,actor:{id:id(0),role:'admin'},admin:{store:{cap:100000000},ownerEmail:'owner@example.com',accounts:{},checkout:{available:()=>false},service(){throw Error('must not initialize members');}},enabled:true,providerConfigured:true,now:()=>Date.UTC(2026,9,20)};
 return {args,statements,counts:()=>({connects,releases})};
}
test('200 members use one connection and six bounded read/control queries; no services or writes',async()=>{
 const f=fixture(200),r=await readAdminOverview(f.args);assert.equal(r.users.length,200);assert.equal(r.jobs.length,60);assert.equal(r.budget.spentMicros,2000);assert.equal(r.users[1].wallet.reserved,1);assert.equal(r.users[1].wallet.credits.available,20);assert.equal(f.statements.length,6);assert.match(f.statements[0],/REPEATABLE READ READ ONLY/);assert.match(f.statements[1],/statement_timeout='2500ms'/);assert.deepEqual(f.counts(),{connects:1,releases:1});
});
test('unauthorized read acquires no connection',async()=>{const f=fixture(2);await assert.rejects(readAdminOverview({...f.args,actor:{role:'member'}}),e=>e.status===403);assert.equal(f.counts().connects,0);});
test('empty members return truthful empty snapshot without generation query',async()=>{const f=fixture(0),r=await readAdminOverview(f.args);assert.deepEqual(r.users,[]);assert.deepEqual(r.jobs,[]);assert.equal(r.budget.spentMicros,0);assert.equal(f.statements.length,5);});
test('partial schema and query failures fail the whole snapshot instead of inventing balances',async()=>{for(const options of [{partial:true},{failRead:true}]){const f=fixture(2,options);await assert.rejects(readAdminOverview(f.args),e=>e.status===503);assert.equal(f.statements.at(-1),'ROLLBACK');assert.equal(f.counts().releases,1);}});
test('uninitialized accounts use recorded initial grants without creating a ledger',async()=>{const f=fixture(2,{missing:true}),r=await readAdminOverview(f.args);assert.equal(r.users[1].wallet.available,3);assert.equal(r.users[1].ledgerInitialized,false);assert.equal(f.statements.length,5);});
test('member cap rejects rather than returning incomplete totals',async()=>{const f=fixture(201);await assert.rejects(readAdminOverview(f.args),e=>e.status===503&&e.code==='ADMIN_OVERVIEW_MEMBER_LIMIT');assert.equal(f.statements.length,4);});
