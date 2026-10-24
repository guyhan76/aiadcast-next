// Local integration bridge: budgets is the existing image supplier-cost authority.
// recommendation_supplier_costs is category audit only; NEVER add it to budgets.
export class ExistingImageBudget {
 constructor({db,owner,period,limit}){Object.assign(this,{db,owner,period,limit});}
 async totals(){const r=await this.db.prepare('SELECT held_micros,spent_micros FROM budgets WHERE period=?').get(this.period);return {held:r?.held_micros??0,spent:r?.spent_micros??0};}
 async reserve({id,owner,category,amount}){if(owner!==this.owner||category!=='recommendation'||!Number.isSafeInteger(amount)||amount<1)throw Error('INVALID_RESERVATION');return this.db.transaction(async()=>{
 const old=await this.db.prepare('SELECT * FROM recommendation_supplier_costs WHERE id=?').get(id);if(old){if(old.owner_id!==owner||old.period!==this.period||old.reservation_micros!==amount)throw Error('BUDGET_ID_CONFLICT');return false;}
 const cap=await this.limit();await this.db.prepare('INSERT INTO budgets(period,limit_micros) VALUES(?,?) ON CONFLICT DO NOTHING').run(this.period,cap);
 const r=await this.db.prepare('UPDATE budgets SET held_micros=held_micros+? WHERE period=? AND limit_micros=? AND spent_micros+held_micros+?<=?').run(amount,this.period,cap,amount,cap);
 if(r.changes!==1)throw Error('SHARED_BUDGET_UNAVAILABLE');
 await this.db.prepare('INSERT INTO recommendation_supplier_costs VALUES(?,?,?,?,?,NULL,?,?)').run(id,owner,category,this.period,amount,'held',amount);return true;
 });}
 async settle(id,cost){if(!Number.isSafeInteger(cost)||cost<0)throw Error('INVALID_USAGE');return this.db.transaction(async()=>{
 const r=await this.db.prepare('SELECT * FROM recommendation_supplier_costs WHERE id=? AND owner_id=?').get(id,this.owner);if(!r)throw Error('UNKNOWN_ATTEMPT');if(r.state==='settled'){if(r.actual_micros!==cost)throw Error('USAGE_CONFLICT');return;}
 const update=await this.db.prepare('UPDATE budgets SET held_micros=held_micros-?,spent_micros=spent_micros+? WHERE period=? AND held_micros>=?').run(r.held_micros,cost,r.period,r.held_micros);if(update.changes!==1)throw Error('BUDGET_RECONCILE_REQUIRED');
 await this.db.prepare("UPDATE recommendation_supplier_costs SET held_micros=0,actual_micros=?,state='settled' WHERE id=?").run(cost,id);
 });}
}
