import {externalSupplierTotals} from './external-supplier-budget.mjs';
// Explicit, read-only preactivation audit. Callers must provide complete snapshots,
// not paginated history results. Never turns the policy on or repairs discrepancies.
export function auditSupplierHistory({budgets,attempts,assistants,recommendations,externalLedgersVerifiedEmpty=false,externalRows,ownerId}){
 const external=Array.isArray(externalRows)?externalSupplierTotals(externalRows,ownerId):null;
 if(!external&&!externalLedgersVerifiedEmpty)throw Error('EXTERNAL_SUPPLIER_HISTORY_UNVERIFIED');
 if(![budgets,attempts,assistants,recommendations].every(Array.isArray))throw Error('SUPPLIER_HISTORY_INCOMPLETE');
 const amount=n=>{if(!Number.isSafeInteger(n)||n<0)throw Error('INVALID_SUPPLIER_AMOUNT');return n;};
 const sums=new Map();
 for(const b of budgets){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.period)||sums.has(b.period))throw Error('INVALID_SUPPLIER_PERIOD');sums.set(b.period,{spent:0,held:0,expectedSpent:amount(b.spent_micros),expectedHeld:amount(b.held_micros)});}
 const add=(period,spent,held)=>{const b=sums.get(period);if(!b)throw Error('SUPPLIER_PERIOD_MISSING');b.spent+=amount(spent);b.held+=amount(held);amount(b.spent);amount(b.held);};
 for(const a of attempts){if(!['pending','uncertain','completed','failed'].includes(a.status))throw Error('UNKNOWN_SUPPLIER_STATE');const open=['pending','uncertain'].includes(a.status);if(open&&a.actual_micros!=null)throw Error('CONFLICTING_SUPPLIER_COST');add(a.period,open?0:amount(a.actual_micros),open?a.maximum_micros:0);}
 for(const a of assistants){if(!['pending','uncertain','completed','failed'].includes(a.state))throw Error('UNKNOWN_SUPPLIER_STATE');const open=['pending','uncertain'].includes(a.state);if(open&&a.actual_micros!=null)throw Error('CONFLICTING_SUPPLIER_COST');add(a.period,open?0:amount(a.actual_micros),open?a.held_micros:0);}
 for(const a of recommendations){if(ownerId&&a.owner_id!==ownerId)throw Error('SUPPLIER_HISTORY_OWNER_MISMATCH');if(a.category!=='recommendation'||!['held','settled'].includes(a.state))throw Error('UNKNOWN_SUPPLIER_STATE');if(a.state==='held'&&a.actual_micros!=null)throw Error('CONFLICTING_SUPPLIER_COST');if(a.state==='settled'&&a.held_micros!==0)throw Error('CONFLICTING_SUPPLIER_COST');add(a.period,a.state==='settled'?amount(a.actual_micros):0,a.held_micros);}
 let spent=0,held=0;for(const b of sums.values()){if(b.spent!==b.expectedSpent||b.held!==b.expectedHeld)throw Error('SUPPLIER_HISTORY_MISMATCH');spent+=b.spent;held+=b.held;}
 spent+=external?.spent??0;held+=external?.held??0;
 amount(spent);amount(held);amount(spent+held);return {periods:sums.size,spentMicros:spent,heldMicros:held,limitMicros:100000000,availableMicros:Math.max(0,100000000-spent-held)};
}
