// Historical photo-analysis costs live outside the tenant image ledger.
// settled/exceeded actuals are costs, NOT costs plus the historical reservation.
export function externalSupplierTotals(rows,owner){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(owner??''))throw Error('EXTERNAL_SUPPLIER_OWNER_UNKNOWN');
 if(!Array.isArray(rows))throw Error('EXTERNAL_SUPPLIER_HISTORY_UNVERIFIED');
 let spent=0,held=0;const seen=new Set();
 for(const r of rows){
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(r.actor_id??''))throw Error('EXTERNAL_SUPPLIER_OWNER_UNKNOWN');
  if(r.actor_id!==owner)continue;
  if(typeof r.id!=='string'||seen.has(r.id))throw Error('EXTERNAL_SUPPLIER_RECORD_INVALID');seen.add(r.id);
  if(!Number.isSafeInteger(r.hold)||r.hold<=0)throw Error('EXTERNAL_SUPPLIER_RECORD_INVALID');
  if(['settled','exceeded'].includes(r.state)){
   if(!Number.isSafeInteger(r.actual)||r.actual<0)throw Error('EXTERNAL_SUPPLIER_RECORD_INVALID');spent+=r.actual;
  }else if(['reserved','uncertain'].includes(r.state)&&r.actual===null){held+=r.hold;}
  else throw Error('EXTERNAL_SUPPLIER_RECORD_INVALID');
 }
 if(!Number.isSafeInteger(spent+held))throw Error('EXTERNAL_SUPPLIER_RECORD_INVALID');
 return {spent,held};
}
export async function readExternalSupplierBudget(db,owner){
 const found=await db.prepare("SELECT to_regclass('aiadcast_accounts.dimension_analysis_calls') IS NOT NULL AS present").get();
 // Absence is not proof that historic records never existed. Activation requires inventory.
 if(!found.present)throw Error('EXTERNAL_SUPPLIER_HISTORY_UNVERIFIED');
 const rows=await db.prepare("SELECT id,actor_id,state,hold,actual FROM aiadcast_accounts.dimension_analysis_calls WHERE actor_id=? OR actor_id IS NULL OR actor_id !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'").all(owner);
 return externalSupplierTotals(rows,owner);
}
