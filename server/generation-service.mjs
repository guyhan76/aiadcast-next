import {makeDimensionPlan} from '../src/dimension-generation.ts';
import {preparePlanarSource,requestPlanarRatio} from './planar-proportion.mjs';
import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, closeSync, writeFileSync, readFileSync, unlinkSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { BillingLedger } from './billing.mjs';
import { GENERATION_SIZES, IMAGE_MODEL, IMAGE_REVISION, hashBytes, parseSourceAsset, ProviderFailure } from './openai-image-adapter.mjs';
import { normalizeAssistantRequest, TEXT_MODEL, TEXT_MAX_HOLD_MICROS } from './text-assistant.mjs';
import {createMarketingPlan} from '../src/marketing-plan.ts';
import {parseCampaign} from '../src/campaign.ts';

const LOCAL_USER = 'aiadcast-next-local-developer';
const MODEL_COST_HOLD_MICROS = 500_000; // Admission reservation, not a provider-enforced per-call spending cap.
export class ApiFailure extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const fail = (code, status) => { throw new ApiFailure(code, status); };
function identifier(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value); }
function boundedObject(value, depth = 0) {
  if (depth > 12) fail('INVALID_REQUEST');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length <= 3000) return value;
  if (Array.isArray(value) && value.length <= 80) return value.map(v => boundedObject(v, depth + 1));
  if (typeof value === 'object' && value && Object.keys(value).length <= 80) {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(key) || ['constructor','prototype','__proto__'].includes(key)) fail('INVALID_REQUEST');
      result[key] = boundedObject(value[key], depth + 1);
    }
    return result;
  }
  fail('INVALID_REQUEST');
}
export function normalizeGenerationRequest(value) {
  if (!value || typeof value !== 'object' || JSON.stringify(value).length > 50_000) fail('INVALID_REQUEST');
  if (value.version !== 1 || !['original','creative'].includes(value.mode) || !['physical-product','service'].includes(value.subjectType) || typeof value.productName !== 'string' || value.productName.length > 100 || !GENERATION_SIZES[value.output?.format]) fail('INVALID_REQUEST');
  if (value.operation === 'image-region' || value.requestedEditOperation === 'masked-product-appearance-edit') fail('REGION_EDIT_NOT_AVAILABLE');
  const expected = value.mode === 'creative' ? (value.subjectType === 'service' ? 'image-ad-creative' : 'image-product-concept') : (value.subjectType === 'service' ? 'compose-ad' : 'compose-original');
  if (value.operation !== expected) fail('INVALID_REQUEST');
  if (typeof value.brief !== 'string' || value.brief.length > 600 || !['ko','en'].includes(value.output.locale)) fail('INVALID_REQUEST');
  const specifications = value.specifications ?? [];
  if (!Array.isArray(specifications) || specifications.length > 3 || specifications.some(s => !['width','depth','height','diameter'].includes(s?.axis) || s.unit !== 'mm' || typeof s.value !== 'string' || !/^\d+(\.\d{1,8})?$/.test(s.value) || Number(s.value) <= 0 || Number(s.value) > 100000)) fail('INVALID_SPECIFICATIONS');
  if(new Set(specifications.map(s=>s.axis)).size!==specifications.length||(value.subjectType==='service'&&specifications.length))fail('INVALID_SPECIFICATIONS');
  if(!Array.isArray(value.references??[])||(value.references??[]).length>9)fail('INVALID_IMAGE');
  const photoInputs=[...(value.source?[value.source]:[]),...value.references??[]];
  if(photoInputs.some(photo=>!photo||!['subject','style'].includes(photo.purpose??'subject')))fail('INVALID_IMAGE');
  if(value.mode==='original'&&value.source?.purpose==='style')fail('INVALID_IMAGE');
  if(value.subjectType==='physical-product'&&photoInputs.length&&photoInputs.every(photo=>photo.purpose==='style'))fail('SOURCE_REQUIRED');
  let campaign;try{campaign=parseCampaign(Object.keys(value.campaign??{}).length?value.campaign:undefined);}catch{fail('INVALID_REQUEST');}
  const material=value.productProfile?.material??'';
  if(typeof material!=='string'||material.length>2000||typeof(value.copy?.company??'')!=='string'||typeof(value.productProfile?.category??'other')!=='string'||(value.productProfile?.category??'other').length>80)fail('INVALID_REQUEST');
  const attributes=[...(material?[{name:'소재',value:material}]:[]),...campaign.attributes];
  // Rebuild the guide on the server. Client-supplied targets, keywords and verification claims are not authoritative.
  const marketingPlan=createMarketingPlan({name:value.productName,category:value.productProfile?.category??'other',subjectType:value.subjectType,locale:value.output.locale,mode:value.mode,sourceHash:value.source?.sha256??null,brand:value.copy?.company??'',goal:campaign.goal,contentType:campaign.contentType,attributes,specifications});
  // Pick only supported context; never accept client model, price, credits, identity or API configuration.
  const compositionKey=value.output.compositionKey;
  if(compositionKey!==undefined&&(typeof compositionKey!=='string'||compositionKey.length>8192||!compositionKey.trim()))fail('INVALID_REQUEST');
  const normalized=boundedObject({ version: 1, mode: value.mode, operation: expected, subjectType: value.subjectType, productName: value.productName, productProfile: value.productProfile ?? {}, brief: value.brief, campaign, direction: value.direction ?? {}, creativeDirection: value.creativeDirection ?? null, scene: value.scene ?? {}, specifications, attributes, target:{...marketingPlan.target,method:marketingPlan.method},contentType:campaign.contentType,marketingPlan,copy: value.copy ?? {}, source: value.source ?? null, references: value.references ?? [], output: { format: value.output.format, locale: value.output.locale, displayUnit:['mm','cm','inch'].includes(value.output.displayUnit)?value.output.displayUnit:'mm', showDimensions: value.subjectType!=='service'&&specifications.length>0&&value.output.showDimensions === true, showDimensionLines: value.subjectType!=='service'&&specifications.length>0&&value.output.showDimensions === true&&value.output.showDimensionLines === true } });
  if(value.dimensionPlan!==undefined){
    if(value.mode!=='creative'||value.subjectType!=='physical-product'||!value.source||value.source.purpose==='style')fail('INVALID_DIMENSION_PLAN');
    try{normalized.dimensionPlan=makeDimensionPlan({sourceHash:value.source.sha256,variantLabel:value.dimensionPlan.variantLabel,basis:value.dimensionPlan.basis,specType:value.productProfile?.specType,specifications});}catch{fail('INVALID_DIMENSION_PLAN');}
  }
  if(value.proportionControl!==undefined){
    const control=value.proportionControl;
    if(!normalized.dimensionPlan||normalized.dimensionPlan.basis!=='outer-body'||control?.kind!=='flat-front-v1'||value.mode!=='creative'||value.subjectType!=='physical-product'||value.productProfile?.specType!=='flat'||!value.source||value.source.purpose==='style'||control.confirmedSourceHash!==value.source.sha256)fail('INVALID_PLANAR_CONTROL');
    try{requestPlanarRatio(normalized);}catch{fail('INVALID_PLANAR_CONTROL');}
    if((control.variantLabel??'')!==normalized.dimensionPlan.variantLabel||control.variantLabel!==undefined&&(typeof control.variantLabel!=='string'||control.variantLabel.length>80))fail('INVALID_PLANAR_CONTROL');
    normalized.proportionControl={kind:'flat-front-v1',confirmedSourceHash:value.source.sha256,variantLabel:control.variantLabel??''};
  }
  if(compositionKey!==undefined)normalized.output.compositionKey=compositionKey;
  return normalized;
}
function persistentLock(path) {
  if (path === ':memory:') return () => {};
  const lock = `${path}.lock`;
  const acquire = () => { const fd = openSync(lock, 'wx', 0o600); writeFileSync(fd, String(process.pid)); closeSync(fd); };
  try { acquire(); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let pid;
    try { pid = Number(readFileSync(lock, 'utf8')); } catch { throw Error('LOCAL_DATABASE_LOCKED'); }
    if (!Number.isSafeInteger(pid) || pid < 1) throw Error('LOCAL_DATABASE_LOCKED');
    let alive = true;
    try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
    if (alive) throw Error('LOCAL_DATABASE_LOCKED');
    unlinkSync(lock); acquire();
  }
  return () => { try { unlinkSync(lock); } catch {} };
}
export class GenerationService {
  constructor({ databasePath = ':memory:', adapter, assistantAdapter, assistantEnabled = false, enabled = false, budgetMicros = 0, providerConfigured = false, testCredits = 3, databaseLockManagedExternally = false, managedBudgetIncrease = false, budgetForPeriod, now = () => Date.now() } = {}) {
    if (!Number.isSafeInteger(budgetMicros) || budgetMicros < 0 || budgetMicros > 100_000_000) throw Error('INVALID_DEVELOPMENT_BUDGET');
    if (!Number.isSafeInteger(testCredits) || testCredits < 0 || testCredits > 30) throw Error('INVALID_TEST_CREDITS');
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    this.unlock = databaseLockManagedExternally ? () => {} : persistentLock(databasePath);
    try { this.ledger = new BillingLedger(databasePath, now); }
    catch (error) { this.unlock(); throw error; }
    if (databasePath !== ':memory:') chmodSync(databasePath, 0o600);
    this.db = this.ledger.db; this.now = now; this.adapter = adapter; this.enabled = enabled; this.assistantAdapter = assistantAdapter; this.assistantEnabled = assistantEnabled; this.budgetMicros = budgetMicros; this.providerConfigured = providerConfigured; this.tasks = new Set(); this.budgetForPeriod=budgetForPeriod;
    // The authenticated HTTP service sets this from the server-owned account
    // role. Request JSON, login form fields and client session labels cannot.
    this.adminTestUnlimited = false;
    if (managedBudgetIncrease && !budgetForPeriod) {
      const highest=this.db.prepare('SELECT COALESCE(MAX(limit_micros),0) value FROM budgets').get().value;
      if(highest>budgetMicros){this.ledger.close();this.unlock();throw Error('BUDGET_DECREASE_REQUIRES_REVIEW');}
      this.db.prepare('UPDATE budgets SET limit_micros=?').run(budgetMicros);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS generation_assets(hash TEXT PRIMARY KEY, mime TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, bytes BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS generation_records(id TEXT PRIMARY KEY REFERENCES jobs(id), project_id TEXT NOT NULL, fingerprint TEXT NOT NULL, request_json TEXT NOT NULL, source_hash TEXT, artifact_hash TEXT, artifact_role TEXT, error_code TEXT, metadata_json TEXT, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS generation_fingerprints ON generation_records(fingerprint);
      CREATE TABLE IF NOT EXISTS generation_keys(request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, job_id TEXT NOT NULL REFERENCES generation_records(id));
      CREATE TABLE IF NOT EXISTS local_development_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS assistant_requests(request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, period TEXT NOT NULL, held_micros INTEGER NOT NULL, actual_micros INTEGER, state TEXT NOT NULL, response_json TEXT, error_code TEXT, created_at INTEGER NOT NULL);
    `);
    this.db.prepare("UPDATE assistant_requests SET state='uncertain',error_code='PROVIDER_UNCERTAIN' WHERE state='pending'").run();
    // This is NOT a verified store purchase. Separate local fixture grant, never exposed as an HTTP operation.
    this.ledger.transaction(() => {
      const seeded = this.db.prepare("SELECT value FROM local_development_meta WHERE key='test-credit-grant-v1'").get();
      if (!seeded) {
        this.db.prepare('INSERT INTO wallets(user_id,available,reserved) VALUES (?,?,0) ON CONFLICT DO NOTHING').run(LOCAL_USER, testCredits);
        this.db.prepare("INSERT INTO local_development_meta VALUES ('test-credit-grant-v1','not-real-money')").run();
      }
    });
    // No resumed automatic dispatch. A process may have died after sending a request.
    const interrupted = this.db.prepare("SELECT a.id,a.job_id FROM attempts a JOIN generation_records g ON g.id=a.job_id WHERE a.status IN ('pending','uncertain')").all();
    for (const attempt of interrupted) {
      this.ledger.markAttemptUncertain(attempt.id);
      this.ledger.release(attempt.job_id, LOCAL_USER, 'system_error');
      this.db.prepare("UPDATE generation_records SET error_code='PROVIDER_UNCERTAIN' WHERE id=?").run(attempt.job_id);
    }
    const orphaned = this.db.prepare("SELECT j.id FROM jobs j JOIN generation_records g ON g.id=j.id WHERE j.status IN ('reserved','running')").all();
    for (const job of orphaned) { this.ledger.release(job.id, LOCAL_USER, 'system_error'); this.db.prepare("UPDATE generation_records SET error_code='RESTART_INTERRUPTED' WHERE id=?").run(job.id); }
    this.ledger.expire();
  }
  period() { return new Date(this.now()).toISOString().slice(0, 7); }
  increaseBudget(micros) {
    if(!Number.isSafeInteger(micros)||micros<this.budgetMicros||micros>100_000_000)fail('BUDGET_INCREASE_ONLY');
    if(!this.budgetForPeriod)this.ledger.transaction(()=>this.db.prepare('UPDATE budgets SET limit_micros=?').run(micros));
    this.budgetMicros=micros;
  }
  recordTestPurchase({purchaseId,credits}) { this.ledger.recordVerifiedPurchase({purchaseId,userId:LOCAL_USER,credits});return this.wallet(); }
  wallet() { return { ...this.ledger.wallet(LOCAL_USER), kind: this.adminTestUnlimited ? 'admin-test-unlimited' : 'test-credits', ...(this.adminTestUnlimited ? {unlimited:true} : {}) }; }
  budgetLimit(period){
    if(period!==this.period())fail('BUDGET_PERIOD_CHANGED',409);
    const value=this.budgetForPeriod?this.budgetForPeriod(period):this.budgetMicros;
    if(!Number.isSafeInteger(value)||value<0||value>100000000)fail('INVALID_DEVELOPMENT_BUDGET');
    if(period!==this.period())fail('BUDGET_PERIOD_CHANGED',409);
    return value;
  }
  status() {
    this.ledger.expire();
    const period=this.period(),limit=this.budgetLimit(period),budget = this.ledger.budget(period);
    const available = limit - (budget?.spent_micros ?? 0) - (budget?.held_micros ?? 0);
    const reason = !this.enabled ? 'GENERATION_DISABLED' : !this.providerConfigured ? 'PROVIDER_NOT_CONFIGURED' : limit < MODEL_COST_HOLD_MICROS || available < MODEL_COST_HOLD_MICROS ? 'BUDGET_NOT_AVAILABLE' : !this.adminTestUnlimited && this.wallet().available < 1 ? 'NO_TEST_CREDITS' : null;
    const assistantReason = !this.assistantEnabled ? 'ASSISTANT_DISABLED' : !this.providerConfigured ? 'PROVIDER_NOT_CONFIGURED' : this.budgetMicros-(budget?.spent_micros??0)-(budget?.held_micros??0) < TEXT_MAX_HOLD_MICROS ? 'BUDGET_NOT_AVAILABLE' : null;
    return { mode: 'local-development', commercialReady: false, generation: { enabled: reason === null, photoPurposes: true, planarControl: true, dimensionVariants: true, model: IMAGE_MODEL, revision: IMAGE_REVISION, quality: 'high', reason, perRequestReservationUsd: MODEL_COST_HOLD_MICROS / 1e6 }, assistant: { available: assistantReason === null, reason: assistantReason, model: TEXT_MODEL }, wallet: this.wallet(), budget: { currency: 'USD', period, limitMicros: limit, spentMicros: budget?.spent_micros ?? 0, heldMicros: budget?.held_micros ?? 0, availableMicros: Math.max(0, available), enforcedByProvider: false }, limitations: ['local-single-user','no-live-payment','no-automatic-quality-approval','no-background-removal','no-region-edit','no-production-auth'] };
  }
  storeAsset(asset) {
    this.db.prepare('INSERT INTO generation_assets VALUES (?,?,?,?,?) ON CONFLICT(hash) DO NOTHING').run(asset.sha256, asset.mime, asset.width, asset.height, asset.bytes);
  }
  asset(hash, { includeBytes = true } = {}) {
    if (!hash) return null;
    const a = this.db.prepare('SELECT * FROM generation_assets WHERE hash=?').get(hash);
    if (!a) return null;
    return { id: a.hash, sha256: a.hash, width: a.width, height: a.height, ...(includeBytes ? { dataUrl: `data:${a.mime};base64,${Buffer.from(a.bytes).toString('base64')}` } : {}) };
  }
  job(id, { includeArtifact = true } = {}) {
    if (!identifier(id)) fail('JOB_NOT_FOUND', 404);
    const row = this.db.prepare('SELECT * FROM generation_records WHERE id=?').get(id);
    if (!row) fail('JOB_NOT_FOUND', 404);
    const billing = this.ledger.job(id);
    const metadata = row.metadata_json ? JSON.parse(row.metadata_json) : null;
    const request = JSON.parse(row.request_json);
    const requestIds = this.db.prepare('SELECT request_id FROM generation_keys WHERE job_id=? ORDER BY rowid DESC').all(id).map(key => key.request_id);
    const state = row.error_code === 'PROVIDER_UNCERTAIN' ? 'uncertain' : row.error_code ? 'failed' : billing.status === 'released' ? (billing.reason === 'customer_rejected' ? 'rejected' : 'expired') : billing.status === 'refunded' ? 'refunded' : billing.status === 'reserved' ? 'running' : billing.status;
    return { id, ...(request.dimensionPlan?{dimensionPlan:request.dimensionPlan}:{}), ...(metadata?.planarReport?{planarReport:metadata.planarReport,...(includeArtifact?{planarOriginal:this.asset(metadata.planarReport.originalHash)}:{})}:{}), ...(billing.creditExempt ? {creditPolicy:'admin-unlimited',creditCost:0} : {}), requestId: requestIds[0] ?? null, requestIds, projectId: row.project_id, state, mode: request.mode, sourceHash: row.source_hash, createdAt: new Date(row.created_at).toISOString(), model: metadata?.model??IMAGE_MODEL, quality: 'high', outputFormat: request.output.format, ...(metadata?.composition?{composition:metadata.composition,...(metadata.composition==='complete-ad'?{compositionKey:request.output.compositionKey}:{})}:{}), artifact: ['ready','accepted'].includes(state) && includeArtifact && row.artifact_hash ? { ...this.asset(row.artifact_hash), role: row.artifact_role } : null, artifactId: row.artifact_hash, errorCode: row.error_code, usage: metadata?.usage ?? null, cost: metadata?.cost ?? null, providerRequestId: metadata?.providerRequestId ?? null, marketingPlan: request.marketingPlan ?? null, review: 'human-review-required', billingStatus: billing.status, expiresAt: billing.expires_at };
  }
  history(projectId) {
    if (projectId !== undefined && !identifier(projectId)) fail('INVALID_PROJECT_ID');
    const rows = projectId ? this.db.prepare('SELECT id FROM generation_records WHERE project_id=? ORDER BY created_at DESC LIMIT 30').all(projectId) : this.db.prepare('SELECT id FROM generation_records ORDER BY created_at DESC LIMIT 30').all();
    return { jobs: rows.map(row => this.job(row.id, { includeArtifact: false })), wallet: this.wallet() };
  }
  async create(body) {
    if (!body || !identifier(body.requestId) || !identifier(body.projectId)) fail('INVALID_REQUEST');
    const request = normalizeGenerationRequest(body.request);
    let source;
    try { source = await parseSourceAsset(body.source); }
    catch (error) { fail(error.message === 'SOURCE_MISMATCH' ? 'SOURCE_MISMATCH' : 'INVALID_IMAGE'); }
    if (source?.sha256 !== (request.source?.sha256 ?? undefined)) fail('SOURCE_MISMATCH');
    if(!Array.isArray(body.references??[])||(body.references??[]).length>9||!Array.isArray(request.references)||request.references.length!==(body.references??[]).length)fail('INVALID_IMAGE');
    const references=[];
    try { for(const value of body.references??[]) { const ref=await parseSourceAsset(value);if(!ref)throw Error('INVALID_IMAGE');references.push(ref); } } catch(error){fail(error.message==='SOURCE_MISMATCH'?'SOURCE_MISMATCH':'INVALID_IMAGE');}
    if(references.some((ref,i)=>ref.sha256!==request.references[i]?.sha256))fail('SOURCE_MISMATCH');
    const all=[...(source?[source]:[]),...references];
    if((!source&&references.length)||new Set(all.map(a=>a.sha256)).size!==all.length||all.reduce((n,a)=>n+a.bytes.length,0)>10*1024*1024)fail('INVALID_IMAGE');
    if (!source && request.subjectType === 'physical-product') fail('SOURCE_REQUIRED');
    if(request.proportionControl){try{await preparePlanarSource(source.bytes,requestPlanarRatio(request));}catch{fail('PLANAR_SOURCE_UNCONFIRMED');}}
    const fingerprint = hashBytes(JSON.stringify({ projectId: body.projectId, request, sourceHash: source?.sha256 ?? null, revision: IMAGE_REVISION }));
    const previous = this.db.prepare('SELECT * FROM generation_keys WHERE request_id=?').get(body.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 409);
      return { job: this.job(previous.job_id), wallet: this.wallet(), reused: true };
    }
    const matching = this.db.prepare("SELECT g.id FROM generation_records g JOIN jobs j ON j.id=g.id WHERE g.fingerprint=? AND (j.status IN ('reserved','running','uncertain','ready') OR g.error_code='PROVIDER_UNCERTAIN') ORDER BY g.created_at DESC LIMIT 1").get(fingerprint);
    if (matching) {
      this.db.prepare('INSERT INTO generation_keys VALUES (?,?,?)').run(body.requestId, fingerprint, matching.id);
      return { job: this.job(matching.id), wallet: this.wallet(), reused: true };
    }
    const rejected = this.db.prepare("SELECT count(*) n FROM generation_records g JOIN jobs j ON j.id=g.id WHERE g.fingerprint=? AND j.reason='customer_rejected'").get(fingerprint).n;
    if (rejected >= 2 && !this.adminTestUnlimited) fail('REVIEW_REQUIRED_AFTER_REJECTIONS', 409);
    const status = this.status();
    if (!status.generation.enabled) fail(status.generation.reason, 503);
    // Serial dispatch avoids a queue whose provider budget could change before execution.
    if (this.tasks.size) fail('GENERATION_ALREADY_RUNNING', 409);
    const id = randomUUID();
    const createdAt = this.now();
    if (source) this.storeAsset(source); // Content-addressed, immutable original bytes.
    for(const ref of references)this.storeAsset(ref);
    // Reserve credits and persist the request in one transaction, including the existing ledger methods.
    try {
      this.ledger.transaction(() => {
        this.ledger.reserve({ jobId: id, userId: LOCAL_USER, credits: 1, creditExempt: this.adminTestUnlimited, requestHash: fingerprint, modelRevision: IMAGE_REVISION, expiresAt: createdAt + 24 * 60 * 60 * 1000 });
        this.db.prepare('INSERT INTO generation_records(id,project_id,fingerprint,request_json,source_hash,created_at) VALUES (?,?,?,?,?,?)').run(id, body.projectId, fingerprint, JSON.stringify(request), source?.sha256 ?? null, createdAt);
        this.db.prepare('INSERT INTO generation_keys VALUES (?,?,?)').run(body.requestId, fingerprint, id);
      });
    } catch { fail('CREDIT_RESERVATION_FAILED', 409); }
    const work = this.dispatch(id, request, source, references);
    this.tasks.add(work); work.finally(() => this.tasks.delete(work));
    return { job: this.job(id), wallet: this.wallet(), reused: false };
  }
  async dispatch(id, request, source, references = []) {
    const attemptId = randomUUID(); let began = false;
    try {
      const period=this.period(),limit=this.budgetLimit(period);
      const attempt = this.ledger.beginAttempt({ jobId: id, attemptId, period, maximumMicros: MODEL_COST_HOLD_MICROS, limitMicros: limit, periodScoped:Boolean(this.budgetForPeriod) });
      if (!attempt.shouldDispatch) return;
      began = true;
      const result = await this.adapter.generate({ request, source: request.mode === 'creative' ? source : null, references:request.mode==='creative'?references:[], attemptId });
      // Persist provider metadata before any customer capture. Pixel validity is not semantic quality approval.
      if(result.planarOriginal)this.storeAsset(result.planarOriginal);
      this.storeAsset(result);
      this.db.prepare('UPDATE generation_records SET artifact_hash=?,artifact_role=?,metadata_json=? WHERE id=?').run(result.sha256, result.role, JSON.stringify({ model: result.model, revision: result.revision, ...(result.composition?{composition:result.composition}:{}), ...(result.planarReport?{planarReport:result.planarReport}:{}), usage: result.usage, cost: result.cost, providerRequestId: result.providerRequestId }), id);
      if (!result.cost) throw new ProviderFailure('PROVIDER_USAGE_UNCERTAIN');
      this.ledger.settleAttempt(attemptId, result.cost.microUsd, 'completed');
      this.ledger.markReady(id, result.sha256);
    } catch (error) {
      // No automatic retries. Unknown execution/usage preserves the supplier-cost hold.
      const knownFailure = error instanceof ProviderFailure && !error.uncertain;
      let code = !began ? 'BUDGET_NOT_AVAILABLE' : knownFailure ? error.code : 'PROVIDER_UNCERTAIN';
      try {
        if (began) {
          if (knownFailure) this.ledger.settleAttempt(attemptId, 0, 'failed');
          else this.ledger.markAttemptUncertain(attemptId);
        }
        this.ledger.release(id, LOCAL_USER, 'system_error');
        this.db.prepare('UPDATE generation_records SET error_code=? WHERE id=?').run(code, id);
      } catch { /* Persistent recovery will reconcile interrupted work on restart. */ }
    }
  }
  accept(id, artifactId) {
    const job = this.job(id);
    if (typeof artifactId !== 'string' || artifactId !== job.artifactId) fail('ARTIFACT_MISMATCH', 409);
    try { this.ledger.accept(id, LOCAL_USER, artifactId); }
    catch { fail('RESULT_NOT_ACCEPTABLE', 409); }
    return { job: this.job(id), wallet: this.wallet() };
  }
  reject(id) {
    const job = this.job(id);
    if (!['ready','rejected'].includes(job.state)) fail('RESULT_NOT_REJECTABLE', 409);
    this.ledger.release(id, LOCAL_USER, 'customer_rejected');
    return { job: this.job(id), wallet: this.wallet() };
  }
  async assist(body) {
    let request;
    try { request = normalizeAssistantRequest(body); } catch { fail('INVALID_ASSISTANT_REQUEST'); }
    const fingerprint = hashBytes(JSON.stringify(request));
    const existing = this.db.prepare('SELECT * FROM assistant_requests WHERE request_id=?').get(request.requestId);
    if (existing) {
      if (existing.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 409);
      if (existing.state === 'completed') return JSON.parse(existing.response_json);
      fail(existing.error_code ?? 'ASSISTANT_ALREADY_RUNNING', 409);
    }
    const status = this.status();
    if (!status.assistant.available) fail(status.assistant.reason, 503);
    const period = this.period(),limit=this.budgetLimit(period);
    try {
      this.ledger.transaction(() => {
        this.db.prepare('INSERT INTO budgets(period,limit_micros) VALUES (?,?) ON CONFLICT DO NOTHING').run(period, this.budgetMicros);
        if(this.budgetForPeriod){if(period!==this.period())throw Error('BUDGET_PERIOD_CHANGED');this.db.prepare('UPDATE budgets SET limit_micros=? WHERE period=?').run(limit,period);}
        // October image approval never enlarges the text assistant allowance.
        const held = this.db.prepare('UPDATE budgets SET held_micros=held_micros+? WHERE period=? AND limit_micros>=? AND spent_micros+held_micros+?<=?').run(TEXT_MAX_HOLD_MICROS, period, this.budgetMicros, TEXT_MAX_HOLD_MICROS, this.budgetMicros);
        if (held.changes !== 1) throw Error();
        this.db.prepare("INSERT INTO assistant_requests(request_id,fingerprint,period,held_micros,state,created_at) VALUES (?,?,?,?,'pending',?)").run(request.requestId, fingerprint, period, TEXT_MAX_HOLD_MICROS, this.now());
      });
    } catch { fail('BUDGET_NOT_AVAILABLE', 503); }
    const work = (async () => {
      try {
        const result = await this.assistantAdapter({ request, attemptId:request.requestId });
        if (!result.cost || !Number.isSafeInteger(result.cost.microUsd) || result.cost.microUsd < 0 || result.cost.microUsd > 1_000_000_000) throw new ProviderFailure('PROVIDER_USAGE_UNCERTAIN');
        this.ledger.transaction(() => {
          this.db.prepare('UPDATE budgets SET held_micros=held_micros-?,spent_micros=spent_micros+? WHERE period=?').run(TEXT_MAX_HOLD_MICROS, result.cost.microUsd, period);
          this.db.prepare("UPDATE assistant_requests SET state='completed',actual_micros=?,response_json=? WHERE request_id=?").run(result.cost.microUsd, JSON.stringify(result), request.requestId);
        });
        return result;
      } catch (error) {
        const known = error instanceof ProviderFailure && !error.uncertain;
        const code = known ? error.code : 'PROVIDER_UNCERTAIN';
        this.ledger.transaction(() => {
          if (known) this.db.prepare('UPDATE budgets SET held_micros=held_micros-? WHERE period=?').run(TEXT_MAX_HOLD_MICROS, period);
          this.db.prepare('UPDATE assistant_requests SET state=?,error_code=?,actual_micros=? WHERE request_id=?').run(known ? 'failed' : 'uncertain', code, known ? 0 : null, request.requestId);
        });
        fail(code, 502);
      }
    })();
    this.tasks.add(work);
    try { return await work; } finally { this.tasks.delete(work); }
  }
  async waitForIdle() { await Promise.all([...this.tasks]); }
  async close() { await this.waitForIdle(); this.ledger.close(); this.unlock(); }
}

