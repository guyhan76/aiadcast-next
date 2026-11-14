// Shared test budget: each attempt appears exactly once, regardless of category.
export class SharedRecommendationBudget {
 constructor(db,{limitMicros,period='mock-period'}){if(!Number.isSafeInteger(limitMicros)||limitMicros<0)throw Error('INVALID_BUDGET');Object.assign(this,{db,limitMicros,period});}
 async totals(){return this.db.prepare('SELECT COALESCE(SUM(held_micros),0) held,COALESCE(SUM(actual_micros),0) spent FROM recommendation_supplier_costs WHERE period=?').get(this.period);}
 async reserve({id,owner,category,amount}){if(!['image','recommendation'].includes(category)||!Number.isSafeInteger(amount)||amount<1)throw Error('INVALID_RESERVATION');return this.db.transaction(async()=>{
 const old=await this.db.prepare('SELECT * FROM recommendation_supplier_costs WHERE id=?').get(id);
 if(old){if(old.owner_id!==owner||old.category!==category||old.period!==this.period||old.reservation_micros!==amount)throw Error('BUDGET_ID_CONFLICT');return false;}
 const total=await this.totals();if(total.held+total.spent+amount>this.limitMicros)throw Error('SHARED_BUDGET_UNAVAILABLE');
 await this.db.prepare('INSERT INTO recommendation_supplier_costs VALUES(?,?,?,?,?,NULL,?,?)').run(id,owner,category,this.period,amount,'held',amount);return true;
 });}
 async settle(id,cost){if(!Number.isSafeInteger(cost)||cost<0)throw Error('INVALID_USAGE');return this.db.transaction(async()=>{const row=await this.db.prepare('SELECT * FROM recommendation_supplier_costs WHERE id=?').get(id);if(!row)throw Error('UNKNOWN_ATTEMPT');if(row.state==='settled'){if(row.actual_micros!==cost)throw Error('USAGE_CONFLICT');return;}await this.db.prepare("UPDATE recommendation_supplier_costs SET held_micros=0,actual_micros=?,state='settled' WHERE id=?").run(cost,id);});}
}
