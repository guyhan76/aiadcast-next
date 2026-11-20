// Pure view of existing supplier-cost ledgers. No activation, reset or writes.
export function cumulativeBudgetView(policy,totals,{ownerId,isAdmin,now=Date.now()}={}) {
 if(!policy)return null;
 const valid=n=>Number.isSafeInteger(n)&&n>=0;
 if(policy.id!==1||policy.owner_id!==ownerId||isAdmin!==true||
 !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(ownerId??'')||
 policy.limit_micros!==100000000||policy.history_mode!=='all-history'||
 policy.excluded_spent_micros!==0||!valid(policy.activated_at)||policy.activated_at===0||policy.activated_at>now||
 (policy.history_mode==='all-history'&&policy.excluded_spent_micros!==0)||
 !valid(totals.spent)||!valid(totals.held)||policy.excluded_spent_micros>totals.spent||
 !Number.isSafeInteger(totals.spent+totals.held))throw Error('CUMULATIVE_BUDGET_POLICY_INVALID');
 const spent=totals.spent-policy.excluded_spent_micros;
 return {scope:'lifetime',historyMode:policy.history_mode,activatedAt:policy.activated_at,limitMicros:policy.limit_micros,spentMicros:spent,heldMicros:totals.held,availableMicros:Math.max(0,policy.limit_micros-spent-totals.held)};
}
