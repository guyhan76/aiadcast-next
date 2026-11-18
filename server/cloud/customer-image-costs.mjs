// Only the server classifies traffic. Customer costs and sales never enter the test budget.
export async function initializeCustomerAccounting(db) {
 await db.exec(`
  CREATE TABLE IF NOT EXISTS customer_generation_policy(id BIGINT PRIMARY KEY CHECK(id=1));
  CREATE TABLE IF NOT EXISTS customer_image_costs(
   attempt_id TEXT PRIMARY KEY, job_id TEXT NOT NULL, account_id TEXT,
   started_at TIMESTAMPTZ NOT NULL DEFAULT now(), maximum BIGINT NOT NULL CHECK(maximum>0),
   state TEXT NOT NULL CHECK(state IN ('pending','uncertain','completed','failed')),
   actual BIGINT CHECK(actual>=0));
  CREATE INDEX IF NOT EXISTS customer_cost_time ON customer_image_costs(started_at);
  CREATE TABLE IF NOT EXISTS customer_image_sales(
   purchase_id TEXT PRIMARY KEY, account_id TEXT, restored BOOLEAN NOT NULL, credits BIGINT NOT NULL CHECK(credits>0),
   recorded_at TIMESTAMPTZ NOT NULL DEFAULT now());
  ALTER TABLE customer_image_sales ADD COLUMN IF NOT EXISTS revoked_credits bigint NOT NULL DEFAULT 0;
  CREATE INDEX IF NOT EXISTS customer_sale_account ON customer_image_sales(account_id,recorded_at);
  CREATE INDEX IF NOT EXISTS customer_sale_time ON customer_image_sales(recorded_at);
  CREATE TABLE IF NOT EXISTS customer_image_retries(
   hour TIMESTAMPTZ PRIMARY KEY, reused BIGINT NOT NULL DEFAULT 0);`);
}

// prefix and accountParameter are server-owned identifiers or bound placeholders.
export function customerBalanceSql(prefix,accountParameter,tagged=true) {
 const isCustomer=tagged?'c.job_id IS NOT NULL':'false';
 return `SELECT GREATEST(0, GREATEST(0,welcome+restored-legacy_used)+paid-customer_used) AS available, held AS reserved
  FROM (SELECT COALESCE(SUM(credits),0) AS welcome FROM ${prefix}credit_events WHERE kind='welcome') w
  CROSS JOIN (SELECT COALESCE(SUM(credits-revoked_credits) FILTER(WHERE restored),0) AS restored,
    COALESCE(SUM(credits-revoked_credits) FILTER(WHERE NOT restored),0) AS paid FROM aiadcast_accounts.customer_image_sales WHERE account_id=${accountParameter}) sales
  CROSS JOIN (SELECT COALESCE(SUM(j.credits) FILTER(WHERE ${isCustomer}),0) AS customer_used,
   COALESCE(SUM(j.credits) FILTER(WHERE NOT (${isCustomer})),0) AS legacy_used,
   COALESCE(SUM(j.credits) FILTER(WHERE ${isCustomer} AND p.captured=0),0) AS held
   FROM ${prefix}jobs j JOIN ${prefix}job_policies p ON p.job_id=j.id
   ${tagged?`LEFT JOIN ${prefix}customer_ad_jobs c ON c.job_id=j.id`:''}
   WHERE p.unit='credit-v2' AND ((p.captured=1 AND j.status<>'refunded') OR
    (p.captured=0 AND j.status IN ('reserved','running','uncertain')))) usage`;
}

export class CustomerImageCosts {
 constructor(db, accountId) { this.db=db; this.accountId=accountId; }
 async reserveOperatingCost(attemptId,jobId,maximum) {
  await this.db.prepare("INSERT INTO customer_image_costs(attempt_id,job_id,account_id,maximum,state) VALUES(?,?,?,?,'pending')").run(attemptId,jobId,this.accountId,maximum);
 }
 async settleOperatingCost(attemptId,actual,state) {
  const result=await this.db.prepare("UPDATE customer_image_costs SET actual=?,state=? WHERE attempt_id=? AND account_id=? AND state IN ('pending','uncertain')").run(actual,state,attemptId,this.accountId);
  if(result.changes!==1)throw Error('CUSTOMER_COST_RECONCILE_REQUIRED');
 }
 async flagUncertainCost(attemptId) {
  await this.db.prepare("UPDATE customer_image_costs SET state='uncertain' WHERE attempt_id=? AND state='pending'").run(attemptId);
 }
 async sale(receipt,restored) {
  await this.db.prepare('INSERT INTO customer_image_sales(purchase_id,account_id,credits,restored) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').run(receipt.purchaseId,this.accountId,receipt.credits,restored);
 }
 async customerPurchases() {
  return this.db.prepare(`SELECT purchase_id AS id, credits/10 AS ads, recorded_at AS verified, restored
   FROM customer_image_sales WHERE account_id=? ORDER BY recorded_at DESC,purchase_id LIMIT 30`).all(this.accountId);
 }
 async retry() {
  await this.db.prepare("INSERT INTO customer_image_retries VALUES(date_trunc('hour',now()),1) ON CONFLICT(hour) DO UPDATE SET reused=customer_image_retries.reused+1").run();
 }
}

// Uses the same repeatable-read snapshot as the administrator overview.
export async function readOperatingCosts(client) {
 const {rows:[r]}=await client.query(`SELECT
  COALESCE(SUM(actual) FILTER(WHERE started_at>=now()-interval '24 hours'),0) AS spent,
  COALESCE(SUM(actual) FILTER(WHERE started_at>=now()-interval '48 hours' AND started_at<now()-interval '24 hours'),0) AS previous,
  COALESCE(SUM(maximum) FILTER(WHERE state IN ('pending','uncertain')),0) AS held,
  COUNT(*) FILTER(WHERE state='uncertain') AS uncertain,
  COUNT(*) FILTER(WHERE started_at>=now()-interval '24 hours') AS attempts
  FROM aiadcast_accounts.customer_image_costs`);
 const {rows:[sales]}=await client.query(`SELECT
  (SELECT COALESCE(SUM(credits),0)/10 FROM aiadcast_accounts.customer_image_sales WHERE NOT restored AND recorded_at>=now()-interval '24 hours') AS sold,
  (SELECT COALESCE(SUM(reused),0) FROM aiadcast_accounts.customer_image_retries WHERE hour>=date_trunc('hour',now())-interval '23 hours') AS duplicates,
  (SELECT COUNT(*) FROM (SELECT account_id FROM aiadcast_accounts.customer_image_costs
    WHERE started_at>=now()-interval '10 minutes' AND account_id IS NOT NULL GROUP BY account_id HAVING COUNT(*)>=30) bursts) AS bursts`);
 return {spentMicros:r.spent,previousMicros:r.previous,heldMicros:r.held,uncertain:r.uncertain,attempts:r.attempts,
  soldAds:sales.sold,duplicateRequests:sales.duplicates,burstAccounts:sales.bursts,costSpike:r.spent>=1000000 && r.spent>=2*r.previous};
}
