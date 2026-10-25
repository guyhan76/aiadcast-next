import { readFileSync } from 'node:fs';
import { SharedRecommendationBudget } from './shared-budget.mjs';
import { randomUUID } from 'node:crypto';
import { hash, snapshotOf, validateOutput } from './contracts.mjs';
// Local PostgreSQL test implementation. Standalone API contract only; no production registration.
export class PostgresRecommendationService {
    async initialize(db, { resolveOwnedImage, adapter, enabled = false, version = 'mock-v1/prompt-v1', budgetMicros = 10000, reservationMicros = 1000, lookupEvidence, now = () => Date.now(), ttlMs = 3600000 }) {
        if (!Number.isSafeInteger(budgetMicros) || budgetMicros < 0 || !Number.isSafeInteger(reservationMicros) || reservationMicros < 1 || !version || !Number.isSafeInteger(ttlMs) || ttlMs < 1)
            throw Error('INVALID_MOCK_POLICY');
        Object.assign(this, { resolveOwnedImage, adapter, enabled, version, budgetMicros, reservationMicros, lookupEvidence, db, now, ttlMs });
        await db.exec(readFileSync(new URL('./migration-draft.sql', import.meta.url), 'utf8'));
        await db.exec('ALTER TABLE recommendation_jobs ADD COLUMN IF NOT EXISTS expires_at BIGINT');
        this.shared = new SharedRecommendationBudget(db, { limitMicros: budgetMicros });
        return this;
    }
    async transaction(fn) { return await this.db.transaction(fn); }
    principal(context) { if (!context || typeof context.userId !== 'string' || !context.userId)
        throw Error('AUTH_REQUIRED'); return context.userId; }
    async read(context, id) { const row = await this.db.prepare('SELECT * FROM recommendation_jobs WHERE id=? AND owner_id=?').get(id, this.principal(context)); if (!row)
        throw Error('NOT_FOUND'); return { generationId:row.generation_id,artifactHash:row.artifact_hash,snapshotHash:hash(JSON.parse(row.snapshot_json)),id: row.id, state: row.state, output: row.output_json ? JSON.parse(row.output_json) : null, error: row.error_code, customerPolicy: row.customer_policy, customerCharge: 0, version: row.version, locale: row.locale }; }
 async readForGeneration(context,generationId){const owner=this.principal(context);const row=await this.db.prepare('SELECT id FROM recommendation_jobs WHERE generation_id=? AND owner_id=?').get(generationId,owner);return row?await this.read(context,row.id):null;}
    async budget() { return await this.db.prepare('SELECT COALESCE(SUM(held_micros),0) held,COALESCE(SUM(actual_micros),0) spent FROM recommendation_attempts').get(); }
    async request(context, body) {
        const owner = this.principal(context);
        if (!body || Object.keys(body).some(k => !['generationId', 'requestId', 'locale'].includes(k)) || typeof body.generationId !== 'string' || !body.generationId || body.generationId.length > 100 || typeof body.requestId !== 'string' || !body.requestId || body.requestId.length > 100 || !['ko', 'en'].includes(body.locale))
            throw Error('INVALID_REQUEST');
        // Resolver is an authenticated server repository dependency, never a client record.
        const record = await this.resolveOwnedImage(owner, body.generationId), snapshot = snapshotOf(record, owner);
        const key = hash([owner, record.artifactHash, hash(snapshot), body.locale, this.version]);
        const fingerprint = hash([body.generationId, key]);
        const outcome = await this.transaction(async () => {
            const prior = await this.db.prepare('SELECT * FROM recommendation_requests WHERE owner_id=? AND request_id=?').get(owner, body.requestId);
            if (prior) {
                if (prior.fingerprint !== fingerprint)
                    throw Error('IDEMPOTENCY_CONFLICT');
                return { id: prior.job_id, dispatch: false };
            }
            const old = await this.db.prepare('SELECT * FROM recommendation_jobs WHERE owner_id=? AND (generation_id=? OR cache_key=?)').get(owner, body.generationId, key);
            if (old) {
                if (old.cache_key !== key)
                    throw Error('EXPLICIT_REFRESH_NOT_IMPLEMENTED');
                await this.db.prepare('INSERT INTO recommendation_requests VALUES(?,?,?,?)').run(owner, body.requestId, fingerprint, old.id);
                return { id: old.id, dispatch: false };
            }
            if (!this.enabled || !this.adapter)
                throw Error('RECOMMENDATIONS_DISABLED');
            const b = await this.budget();
            if (b.held + b.spent + this.reservationMicros > this.budgetMicros)
                throw Error('RECOMMENDATION_BUDGET_UNAVAILABLE');
            const id = randomUUID(), attempt = randomUUID();
            await this.shared.reserve({ id: attempt, owner, category: 'recommendation', amount: this.reservationMicros });
            await this.db.prepare('INSERT INTO recommendation_jobs(id,owner_id,generation_id,cache_key,snapshot_json,artifact_hash,locale,version,state) VALUES(?,?,?,?,?,?,?,?,?)').run(id, owner, body.generationId, key, JSON.stringify(snapshot), record.artifactHash, body.locale, this.version, 'pending');
            await this.db.prepare('UPDATE recommendation_jobs SET expires_at=? WHERE id=?').run(this.now() + this.ttlMs, id);
            await this.db.prepare('INSERT INTO recommendation_attempts VALUES(?,?,?,?,NULL)').run(attempt, id, 'pending', this.reservationMicros);
            await this.db.prepare('INSERT INTO recommendation_requests VALUES(?,?,?,?)').run(owner, body.requestId, fingerprint, id);
            return { id, attempt, dispatch: true };
        });
        if (outcome.dispatch) {
            try {
                const result = await this.adapter({ snapshot: structuredClone(snapshot), imageBytes: Buffer.from(record.imageBytes), locale: body.locale, attemptId: outcome.attempt });
                await this.finish(outcome.id, result);
            }
            catch (e) {
                await this.transaction(async () => {
                    const a = await this.db.prepare('SELECT * FROM recommendation_attempts WHERE job_id=?').get(outcome.id);
                    if (a.state !== 'pending')
                        return;
                    // Only a typed adapter proof of no dispatch permits a zero-cost release.
                    const zero = e instanceof NotDispatched;
                    if (zero)
                        await this.shared.settle(a.id, 0);
                    await this.db.prepare('UPDATE recommendation_attempts SET state=?,held_micros=?,actual_micros=? WHERE job_id=?').run(zero ? 'failed' : 'uncertain', zero ? 0 : a.held_micros, zero ? 0 : null, outcome.id);
                    await this.db.prepare('UPDATE recommendation_jobs SET state=?,error_code=? WHERE id=?').run(zero ? 'failed' : 'uncertain', zero ? 'NOT_DISPATCHED' : 'OUTCOME_UNKNOWN', outcome.id);
                });
            }
        }
        return await this.read(context, outcome.id);
    }
    async finish(id, result) {
        let output;
        try {
            output = validateOutput(result?.output);
        }
        catch { }
        const cost = result?.actualMicros, known = Number.isSafeInteger(cost) && cost >= 0;
        await this.transaction(async () => {
            const a = await this.db.prepare('SELECT * FROM recommendation_attempts WHERE job_id=?').get(id);
            if (!a || !['pending', 'uncertain'].includes(a.state))
                return;
            const old = await this.db.prepare('SELECT output_json FROM recommendation_jobs WHERE id=?').get(id);
            if (output && old.output_json && JSON.stringify(output) !== old.output_json)
                throw Error('EVIDENCE_CONFLICT');
            const json = output ? JSON.stringify(output) : old.output_json;
            if (known)
                await this.shared.settle(a.id, cost);
            await this.db.prepare('UPDATE recommendation_jobs SET output_json=?,state=?,error_code=? WHERE id=?').run(json, known ? (json ? 'completed' : 'failed') : (json ? 'output_ready_usage_pending' : 'uncertain'), known ? (json ? null : 'INVALID_OUTPUT') : 'USAGE_UNKNOWN', id);
            await this.db.prepare('UPDATE recommendation_attempts SET state=?,held_micros=?,actual_micros=? WHERE job_id=?').run(known ? 'settled' : 'uncertain', known ? 0 : a.held_micros, known ? cost : null, id);
        });
    }
    async reconcile(context, id) { await this.read(context, id); if (!this.lookupEvidence)
        throw Error('READ_ONLY_EVIDENCE_UNAVAILABLE'); const evidence = await this.lookupEvidence(id); if (evidence)
        await this.finish(id, evidence); return await this.read(context, id); }
    close() { }
    async expire(context, id) { await this.read(context, id); return await this.transaction(async () => { const row = await this.db.prepare('SELECT * FROM recommendation_jobs WHERE id=?').get(id); if (row.expires_at <= this.now() && ['pending', 'uncertain', 'output_ready_usage_pending'].includes(row.state)) {
        await this.db.prepare("UPDATE recommendation_jobs SET state='expired',error_code='EXPIRED_UNRESOLVED' WHERE id=?").run(id);
        await this.db.prepare("UPDATE recommendation_attempts SET state='uncertain' WHERE job_id=? AND state='pending'").run(id);
    } return await this.read(context, id); }); }
}
export class NotDispatched extends Error {
}
