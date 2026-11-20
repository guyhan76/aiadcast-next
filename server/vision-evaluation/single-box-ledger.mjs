import {randomUUID} from 'node:crypto';
import {APPROVAL,HOLD_MICROS,MAX_CALLS,MAX_MICROS,TARGETS,BOX_REFERENCE} from './single-box-approval.mjs';
// Account-schema ledger is shared across administrators, workers and Render
// restarts. The existing Postgres transaction wrapper takes the schema lock.
export class SingleBoxLedger {
 async initialize(db){this.db=db;await db.exec(`CREATE TABLE IF NOT EXISTS dimension_analysis_calls(id TEXT PRIMARY KEY,approval TEXT NOT NULL,target TEXT NOT NULL,hash TEXT NOT NULL,state TEXT NOT NULL,hold INTEGER NOT NULL,actual INTEGER);
 ALTER TABLE dimension_analysis_calls ADD COLUMN IF NOT EXISTS request_id TEXT;
 ALTER TABLE dimension_analysis_calls ADD COLUMN IF NOT EXISTS actor_id TEXT;
 ALTER TABLE dimension_analysis_calls ADD COLUMN IF NOT EXISTS result_json TEXT;
 CREATE UNIQUE INDEX IF NOT EXISTS dimension_analysis_request_unique ON dimension_analysis_calls(approval,actor_id,request_id);`);await db.protectTables();return this;}
 async rows(){return this.db.prepare('SELECT * FROM dimension_analysis_calls WHERE approval=?').all(APPROVAL);}
 async reserve(target,hash,request){
  if(!TARGETS.includes(target)||hash!==BOX_REFERENCE.sha256)throw Error('UNAUTHORIZED_IMAGE');
  return this.db.transaction(async()=>{
   const rows=await this.rows();
   if(request&&rows.some(r=>r.request_id===request.id&&r.actor_id===request.actor))throw Error('REQUEST_EXISTS');
   if(rows.some(r=>['reserved','uncertain','exceeded'].includes(r.state)||r.request_id&&!r.result_json))throw Error('RECONCILE_REQUIRED');
   if(rows.length>=MAX_CALLS||rows.reduce((n,r)=>n+r.hold,0)+HOLD_MICROS>MAX_MICROS)throw Error('APPROVAL_LIMIT');
   const id=randomUUID();await this.db.prepare('INSERT INTO dimension_analysis_calls(id,approval,target,hash,state,hold,request_id,actor_id) VALUES(?,?,?,?,?,?,?,?)').run(id,APPROVAL,target,hash,'reserved',HOLD_MICROS,request?.id??null,request?.actor??null);return id;
  });
 }
 async settle(id,actual){
  const known=Number.isSafeInteger(actual)&&actual>=0,state=!known?'uncertain':actual>HOLD_MICROS?'exceeded':'settled';
  const result=await this.db.prepare("UPDATE dimension_analysis_calls SET state=?,actual=? WHERE id=? AND approval=? AND state='reserved'").run(state,known?actual:null,id,APPROVAL);
  if(result.changes!==1)throw Error('NOT_RESERVED');return state;
 }
 async request(actor,id){return this.db.prepare('SELECT hash,result_json FROM dimension_analysis_calls WHERE approval=? AND actor_id=? AND request_id=?').get(APPROVAL,actor,id);}
 async finish(actor,id,result){const json=JSON.stringify(result);if(json.length>50000)throw Error('RESULT_TOO_LARGE');const r=await this.db.prepare('UPDATE dimension_analysis_calls SET result_json=? WHERE approval=? AND actor_id=? AND request_id=? AND result_json IS NULL').run(json,APPROVAL,actor,id);if(r.changes!==1)throw Error('RESULT_ALREADY_STORED');}
 async close(){} // Owned by the account store; never close its shared pool.
}

export async function readSingleBoxEvaluation(db,actor,requestId){
 // GET must not create a table, migrate a schema, initialize a ledger, or imply
 // that absent records equal a verified zero balance.
 const exists=await db.prepare("SELECT to_regclass('aiadcast_accounts.dimension_analysis_calls') AS name").get();
 if(!exists?.name)return {ledgerExists:false,usedCalls:null,allowanceUsedMicros:null,knownCostMicros:null,unresolvedCalls:null,remainingCalls:MAX_CALLS,request:null};
 const rows=await db.prepare('SELECT * FROM dimension_analysis_calls WHERE approval=?').all(APPROVAL);
 const unresolved=rows.filter(r=>['reserved','uncertain','exceeded'].includes(r.state)||r.request_id&&!r.result_json).length;
 const own=requestId?rows.find(r=>r.actor_id===actor&&r.request_id===requestId):null;
 return {ledgerExists:true,usedCalls:rows.length,allowanceUsedMicros:rows.reduce((n,r)=>n+r.hold,0),knownCostMicros:rows.reduce((n,r)=>n+(r.actual??0),0),unresolvedCalls:unresolved,remainingCalls:Math.max(0,MAX_CALLS-rows.length),request:own?requestView(own,requestId):null};
}
export function requestView(row,id){
 if(row?.result_json){try{return JSON.parse(row.result_json);}catch{}}
 return {requestId:id,state:'pending',sourceHash:row.hash,verified:false};
}
