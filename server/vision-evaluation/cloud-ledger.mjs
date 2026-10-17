import {randomUUID} from 'node:crypto';
import {APPROVAL,HOLD_MICROS,MAX_CALLS,MAX_MICROS,TARGETS} from './ledger.mjs';
// Account-schema ledger is shared across administrators, workers and Render
// restarts. The existing Postgres transaction wrapper takes the schema lock.
export class CloudVisionLedger {
 async initialize(db){this.db=db;await db.exec(`CREATE TABLE IF NOT EXISTS dimension_analysis_calls(id TEXT PRIMARY KEY,approval TEXT NOT NULL,target TEXT NOT NULL,hash TEXT NOT NULL,state TEXT NOT NULL,hold INTEGER NOT NULL,actual INTEGER);`);await db.protectTables();return this;}
 async rows(){return this.db.prepare('SELECT * FROM dimension_analysis_calls WHERE approval=?').all(APPROVAL);}
 async reserve(target,hash){
  if(!TARGETS.includes(target)||!/^[a-f0-9]{64}$/.test(hash))throw Error('UNAUTHORIZED_IMAGE');
  return this.db.transaction(async()=>{
   const rows=await this.rows();
   if(rows.some(r=>['reserved','uncertain','exceeded'].includes(r.state)))throw Error('RECONCILE_REQUIRED');
   if(rows.length>=MAX_CALLS||rows.reduce((n,r)=>n+r.hold,0)+HOLD_MICROS>MAX_MICROS)throw Error('APPROVAL_LIMIT');
   const id=randomUUID();await this.db.prepare('INSERT INTO dimension_analysis_calls(id,approval,target,hash,state,hold) VALUES(?,?,?,?,?,?)').run(id,APPROVAL,target,hash,'reserved',HOLD_MICROS);return id;
  });
 }
 async settle(id,actual){
  const known=Number.isSafeInteger(actual)&&actual>=0,state=!known?'uncertain':actual>HOLD_MICROS?'exceeded':'settled';
  const result=await this.db.prepare("UPDATE dimension_analysis_calls SET state=?,actual=? WHERE id=? AND approval=? AND state='reserved'").run(state,known?actual:null,id,APPROVAL);
  if(result.changes!==1)throw Error('NOT_RESERVED');return state;
 }
 async close(){} // Owned by the account store; never close its shared pool.
}
