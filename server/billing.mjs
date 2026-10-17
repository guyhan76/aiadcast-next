// Local server-domain reference. Never import into the browser or expose these
// methods directly as HTTP handlers. Authentication, store receipt verification,
// provider callbacks and artifact quality checks belong to trusted server adapters.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const active = ['reserved', 'running', 'uncertain', 'ready'];
const reasons = ['system_error', 'quality_failed', 'customer_rejected', 'cancelled', 'preview_expired'];
function identifier(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 240) throw Error('Invalid identifier');
}
function integer(value, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum || value > 1_000_000_000) throw Error('Invalid amount');
}

export class BillingLedger {
  constructor(path = ':memory:', now = () => Date.now()) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA busy_timeout=5000;');
    this.db.exec(readFileSync(new URL('./billing.sql', import.meta.url), 'utf8'));
    this.now = now;
    this.transactionDepth = 0;
  }
  close() { this.db.close(); }
  transaction(fn) {
    const depth = this.transactionDepth++;
    const savepoint = `ledger_transaction_${depth}`;
    try {
      this.db.exec(depth ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
      try {
        const value = fn();
        this.db.exec(depth ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT');
        return value;
      } catch (error) {
        this.db.exec(depth ? `ROLLBACK TO SAVEPOINT ${savepoint}` : 'ROLLBACK');
        if (depth) this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        throw error;
      }
    } finally { this.transactionDepth--; }
  }
  job(id) {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
    if (!row) throw Error('Job not found');
    return { ...row, creditExempt: Boolean(this.db.prepare('SELECT job_id FROM admin_test_jobs WHERE job_id=?').get(id)) };
  }
  wallet(userId) {
    const row = this.db.prepare('SELECT available,reserved FROM wallets WHERE user_id=?').get(userId);
    return row ? { ...row } : { available: 0, reserved: 0 };
  }
  event(key, user, job, kind, credits) {
    this.db.prepare('INSERT INTO credit_events VALUES (?,?,?,?,?)').run(key, user, job, kind, credits);
  }
  // Call only AFTER the server has verified a real purchase/receipt.
  recordVerifiedPurchase({ purchaseId, userId, credits }) {
    identifier(purchaseId); identifier(userId); integer(credits);
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT * FROM purchases WHERE purchase_id=?').get(purchaseId);
      if (previous) {
        if (previous.user_id !== userId || previous.credits !== credits) throw Error('Purchase replay mismatch');
        return this.wallet(userId);
      }
      this.db.prepare('INSERT INTO wallets(user_id) VALUES (?) ON CONFLICT DO NOTHING').run(userId);
      this.db.prepare('INSERT INTO purchases VALUES (?,?,?)').run(purchaseId, userId, credits);
      this.db.prepare('UPDATE wallets SET available=available+? WHERE user_id=?').run(credits, userId);
      this.event(`purchase:${purchaseId}`, userId, null, 'purchase', credits);
      return this.wallet(userId);
    });
  }
  // credits, modelRevision and expiresAt must come from a server-signed quote.
  reserve({ jobId, userId, credits, requestHash, modelRevision, kind = 'image', expiresAt, creditExempt = false }) {
    [jobId, userId, requestHash, modelRevision].forEach(identifier); integer(credits);
    if (!['image','video'].includes(kind) || !Number.isSafeInteger(expiresAt) || typeof creditExempt !== 'boolean') throw Error('Invalid job');
    return this.transaction(() => {
      const old = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
      if (old) {
        if (old.user_id !== userId || old.credits !== credits || old.request_hash !== requestHash || old.model_revision !== modelRevision || old.kind !== kind || old.expires_at !== expiresAt || this.job(jobId).creditExempt !== creditExempt) throw Error('Job replay mismatch');
        return this.job(jobId);
      }
      if (expiresAt <= this.now()) throw Error('Quote expired');
      if (creditExempt) {
        this.db.prepare('INSERT INTO wallets(user_id) VALUES (?) ON CONFLICT DO NOTHING').run(userId);
      } else {
        const moved = this.db.prepare('UPDATE wallets SET available=available-?, reserved=reserved+? WHERE user_id=? AND available>=?').run(credits, credits, userId, credits);
        if (moved.changes !== 1) throw Error('Insufficient credits');
      }
      this.db.prepare('INSERT INTO jobs(id,user_id,credits,request_hash,model_revision,kind,status,expires_at) VALUES (?,?,?,?,?,?,?,?)').run(jobId, userId, credits, requestHash, modelRevision, kind, 'reserved', expiresAt);
      if (creditExempt) this.db.prepare('INSERT INTO admin_test_jobs(job_id) VALUES (?)').run(jobId);
      this.event(`reserve:${jobId}`, userId, jobId, creditExempt ? 'admin-test-reserve' : 'reserve', credits);
      return this.job(jobId);
    });
  }
  // Artifact must already be durably stored and pass server-side quality gates.
  markReady(jobId, artifactId) {
    identifier(artifactId);
    return this.transaction(() => {
      const job = this.job(jobId);
      if (!active.includes(job.status)) return job; // Late callbacks cannot charge or revive jobs.
      if (job.expires_at <= this.now()) return this.releaseInside(job, 'preview_expired');
      if (job.status === 'uncertain') throw Error('Resolve the provider attempt first');
      if (this.db.prepare("SELECT id FROM attempts WHERE job_id=? AND status IN ('pending','uncertain')").get(jobId)) throw Error('Provider attempt is not settled');
      if (job.status === 'ready') {
        if (job.artifact_id !== artifactId) throw Error('Artifact replay mismatch');
        return job;
      }
      this.db.prepare("UPDATE jobs SET status='ready',artifact_id=? WHERE id=?").run(artifactId, jobId);
      return this.job(jobId);
    });
  }
  accept(jobId, userId, artifactId) {
    return this.transaction(() => {
      const job = this.job(jobId);
      if (job.user_id !== userId) throw Error('Not the job owner');
      if (job.artifact_id !== artifactId) throw Error('Wrong preview version');
      if (job.status === 'accepted') return job;
      if (job.status !== 'ready') throw Error('Result is not ready for acceptance');
      if (job.expires_at <= this.now()) return this.releaseInside(job, 'preview_expired');
      if (!job.creditExempt) this.db.prepare('UPDATE wallets SET reserved=reserved-? WHERE user_id=?').run(job.credits, userId);
      this.db.prepare("UPDATE jobs SET status='accepted' WHERE id=?").run(jobId);
      this.event(`capture:${jobId}`, userId, jobId, job.creditExempt ? 'admin-test-accept' : 'capture', job.credits);
      return this.job(jobId);
    });
  }
  releaseInside(job, reason) {
    if (job.status === 'released' || job.status === 'refunded') return job;
    if (job.status === 'accepted') throw Error('Accepted jobs require a confirmed-defect refund');
    if (!job.creditExempt) this.db.prepare('UPDATE wallets SET available=available+?, reserved=reserved-? WHERE user_id=?').run(job.credits, job.credits, job.user_id);
    this.db.prepare("UPDATE jobs SET status='released',reason=? WHERE id=?").run(reason, job.id);
    this.event(`release:${job.id}`, job.user_id, job.id, job.creditExempt ? 'admin-test-release' : 'release', job.credits);
    return this.job(job.id);
  }
  release(jobId, userId, reason) {
    if (!reasons.includes(reason)) throw Error('Invalid release reason');
    return this.transaction(() => {
      const job = this.job(jobId);
      if (job.user_id !== userId) throw Error('Not the job owner');
      return this.releaseInside(job, reason);
    });
  }
  // A user's report must be evaluated by a separate server review workflow.
  refundConfirmedDefect(jobId, incidentId) {
    identifier(incidentId);
    return this.transaction(() => {
      const job = this.job(jobId);
      if (job.status === 'refunded') return job;
      if (job.status !== 'accepted') throw Error('Only captured credits can be refunded');
      if (!job.creditExempt) this.db.prepare('UPDATE wallets SET available=available+? WHERE user_id=?').run(job.credits, job.user_id);
      this.db.prepare("UPDATE jobs SET status='refunded',reason=? WHERE id=?").run(incidentId, jobId);
      this.event(`refund:${jobId}`, job.user_id, jobId, job.creditExempt ? 'admin-test-refund' : 'refund', job.credits);
      return this.job(jobId);
    });
  }
  expire() {
    return this.transaction(() => {
      const jobs = this.db.prepare("SELECT * FROM jobs WHERE expires_at<=? AND status IN ('reserved','running','uncertain','ready')").all(this.now());
      return jobs.map(job => this.releaseInside(this.job(job.id), 'preview_expired'));
    });
  }
  // USD micro-units (1 USD = 1,000,000); these are NEVER customer credits.
  beginAttempt({ jobId, attemptId, period, maximumMicros, limitMicros }) {
    [attemptId, period].forEach(identifier); integer(maximumMicros); integer(limitMicros);
    return this.transaction(() => {
      const old = this.db.prepare('SELECT * FROM attempts WHERE id=?').get(attemptId);
      if (old) {
        if (old.job_id !== jobId || old.period !== period || old.maximum_micros !== maximumMicros) throw Error('Attempt replay mismatch');
        return { ...old, shouldDispatch: false };
      }
      const job = this.job(jobId);
      if (!['reserved','running'].includes(job.status) || job.expires_at <= this.now()) throw Error('Job is not dispatchable');
      if (this.db.prepare("SELECT id FROM attempts WHERE job_id=? AND status IN ('pending','uncertain','completed')").get(jobId)) throw Error('Reconcile existing attempt; do not generate again');
      if (this.db.prepare('SELECT count(*) n FROM attempts WHERE job_id=?').get(jobId).n >= 2) throw Error('Retry limit reached');
      this.db.prepare('INSERT INTO budgets(period,limit_micros) VALUES (?,?) ON CONFLICT DO NOTHING').run(period, limitMicros);
      const held = this.db.prepare('UPDATE budgets SET held_micros=held_micros+? WHERE period=? AND limit_micros=? AND spent_micros+held_micros+?<=limit_micros').run(maximumMicros, period, limitMicros, maximumMicros);
      if (held.changes !== 1) throw Error('Provider budget unavailable');
      this.db.prepare('INSERT INTO attempts(id,job_id,period,maximum_micros,status) VALUES (?,?,?,?,?)').run(attemptId, jobId, period, maximumMicros, 'pending');
      this.db.prepare("UPDATE jobs SET status='running' WHERE id=?").run(jobId);
      return { ...this.db.prepare('SELECT * FROM attempts WHERE id=?').get(attemptId), shouldDispatch: true };
    });
  }
  markAttemptUncertain(attemptId) {
    return this.transaction(() => {
      const a = this.db.prepare('SELECT * FROM attempts WHERE id=?').get(attemptId);
      if (!a) throw Error('Attempt not found');
      if (['completed','failed'].includes(a.status)) return;
      this.db.prepare("UPDATE attempts SET status='uncertain' WHERE id=?").run(attemptId);
      this.db.prepare("UPDATE jobs SET status='uncertain' WHERE id=? AND status IN ('running','reserved')").run(a.job_id);
      // Keep the provider-cost hold until cost is known, even if customer credits expire.
    });
  }
  settleAttempt(attemptId, actualMicros, outcome) {
    integer(actualMicros, 0);
    if (!['completed','failed'].includes(outcome)) throw Error('Invalid provider outcome');
    return this.transaction(() => {
      const a = this.db.prepare('SELECT * FROM attempts WHERE id=?').get(attemptId);
      if (!a) throw Error('Attempt not found');
      if (['completed','failed'].includes(a.status)) {
        if (a.actual_micros !== actualMicros || a.status !== outcome) throw Error('Cost replay mismatch');
        return;
      }
      this.db.prepare('UPDATE budgets SET held_micros=held_micros-?, spent_micros=spent_micros+? WHERE period=?').run(a.maximum_micros, actualMicros, a.period);
      this.db.prepare('UPDATE attempts SET actual_micros=?,status=? WHERE id=?').run(actualMicros, outcome, attemptId);
      this.db.prepare("UPDATE jobs SET status=? WHERE id=? AND status IN ('running','uncertain')").run(outcome === 'failed' ? 'reserved' : 'running', a.job_id);
    });
  }
  budget(period) {
    const row = this.db.prepare('SELECT * FROM budgets WHERE period=?').get(period);
    return row ? { ...row } : null;
  }
}

