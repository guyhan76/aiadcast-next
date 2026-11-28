import {checkoutOffers,billingAnniversary,imageCredits} from '../src/pricing.ts';
import {activeVideoProvider} from './higgsfield-video.mjs';
import {quotedVideoProvider} from './quoted-video.mjs';
import {seedanceConfig,seedancePayload,seedanceTask,seedanceMovie} from './seedance-video.mjs';
import {videoDurationPrices} from './video-duration-prices.mjs';
import {planAdBatch} from './automatic-image-skills.mjs';
import {batchPrice,validBatch} from '../src/batch-price.ts';
import {verifiedPreservation} from '../src/selective-preservation.ts';
import {prepareSelectiveEdit,finalizeSelectiveEdit} from './selective-image-edit.mjs';
import {plannedAdText} from '../src/planned-ad-text.ts';
import {exactAdText,plannedTextInput} from '../src/exact-ad-text.ts';
import {submissionStage} from './submission-observation.mjs';
import {readinessMeasure} from './readiness-observation.mjs';
import {generationMatchKey} from '../src/generation-match.ts';
import {supportsImageMedia,imageMediaType} from '../src/image-media.ts';
import {aiDimensionInputKey,validAiDimensionReview} from '../src/ai-dimension-display.ts';
import {makeDimensionPlan} from '../src/dimension-generation.ts';
import {preparePlanarSource,requestPlanarRatio} from './planar-proportion.mjs';
import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, closeSync, writeFileSync, readFileSync, unlinkSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { BillingLedger } from './billing.mjs';
import { GENERATION_SIZES, IMAGE_MODEL, IMAGE_REVISION, hashBytes, parseSourceAsset, ProviderFailure, generationFailureDiagnostic } from './openai-image-adapter.mjs';
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
  if(!supportsImageMedia(value?.mediaType)||!supportsImageMedia(value?.output?.mediaType))fail('UNSUPPORTED_MEDIA');
  if (!value || typeof value !== 'object' || JSON.stringify(value).length > 50_000) fail('INVALID_REQUEST');
  if (value.version !== 1 || !['original','creative'].includes(value.mode) || !['physical-product','service'].includes(value.subjectType) || typeof value.productName !== 'string' || value.productName.length > 100 || !GENERATION_SIZES[value.output?.format]) fail('INVALID_REQUEST');
  if (value.operation === 'image-region' || value.requestedEditOperation === 'masked-product-appearance-edit') fail('REGION_EDIT_NOT_AVAILABLE');
  if(value.inputMode!==undefined&&!['photo','text-example'].includes(value.inputMode))fail('INVALID_TEXT_EXAMPLE');
  const textExample=value.inputMode==='text-example';
  if(textExample&&(value.subjectType!=='physical-product'||value.mode!=='creative'||value.source!=null||(value.references??[]).length||!value.productName.trim()||typeof value.productProfile?.material!=='string'||!value.productProfile.material.trim()||value.creativeDirection?.visual?.id!=='auto'||typeof value.output?.compositionKey!=='string'||!value.output.compositionKey.trim()))fail('INVALID_TEXT_EXAMPLE');
  if(textExample&&(value.dimensionPlan!==undefined||value.proportionControl!==undefined||value.output.showDimensionLines===true))fail('TEXT_EXAMPLE_UNSUPPORTED_GEOMETRY');
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
  const normalized=boundedObject({ ...(textExample?{inputMode:'text-example'}:{}),version: 1, mode: value.mode, operation: expected, subjectType: value.subjectType, productName: value.productName, productProfile: value.productProfile ?? {}, brief: value.brief, campaign, direction: value.direction ?? {}, creativeDirection: value.creativeDirection ?? null, scene: value.scene ?? {}, specifications, attributes, target:{...marketingPlan.target,method:marketingPlan.method},contentType:campaign.contentType,marketingPlan,copy: value.copy ?? {}, source: value.source ?? null, references: value.references ?? [], output: { format: value.output.format, locale: value.output.locale, displayUnit:['mm','cm','inch'].includes(value.output.displayUnit)?value.output.displayUnit:'mm', showDimensions: value.subjectType!=='service'&&specifications.length>0&&value.output.showDimensions === true, showDimensionLines: value.subjectType!=='service'&&specifications.length>0&&value.output.showDimensions === true&&value.output.showDimensionLines === true } });
  if(compositionKey){let key;try{key=JSON.parse(compositionKey);}catch{}if(key?.exactText!==undefined&&value.output.exactText===undefined)fail('INVALID_EXACT_TEXT');}
  if(value.output.exactText!==undefined){
    let expected,key;try{expected=value.output.exactText.version===2?plannedAdText(plannedTextInput({productName:normalized.productName,copy:normalized.copy,material:normalized.productProfile.material,copyMode:normalized.campaign.creative?.copyMode}),normalized.output.format):exactAdText({productName:normalized.productName,copy:normalized.copy});key=JSON.parse(compositionKey);}catch{fail('INVALID_EXACT_TEXT');}
    if(value.mode!=='creative'||value.creativeDirection?.visual?.id!=='auto'||value.proportionControl||JSON.stringify(value.output.exactText)!==JSON.stringify(expected)||JSON.stringify(key?.exactText)!==JSON.stringify(expected))fail('INVALID_EXACT_TEXT');
    normalized.output.exactText=expected;
  }
  if(value.output.manualDimensionBase!==undefined){
    if(value.output.manualDimensionBase!==true||value.dimensionDisplay||value.subjectType!=='physical-product'||value.mode!=='creative'||!value.source||value.source.purpose==='style'||textExample||!compositionKey||value.creativeDirection?.visual?.id!=='auto'||!specifications.length||normalized.output.showDimensions||normalized.output.showDimensionLines||value.proportionControl)fail('INVALID_MANUAL_DIMENSIONS');
    let key;try{key=JSON.parse(compositionKey);}catch{fail('INVALID_MANUAL_DIMENSIONS');}
    if(key?.manualDimensionBase!==true)fail('INVALID_MANUAL_DIMENSIONS');
    normalized.output.manualDimensionBase=true;
  }
  if(value.dimensionDisplay!==undefined){
    const d=value.dimensionDisplay,axes={rectangular:['width','depth','height'],flat:['width','depth'],cylindrical:['diameter','height']}[value.productProfile?.specType];
    if(!d||d.version!==1||d.method!=='ai'||!['main','inset'].includes(d.layout)||value.mode!=='creative'||value.subjectType!=='physical-product'||textExample||!value.source||value.source.purpose==='style'||!compositionKey||value.creativeDirection?.visual?.id!=='auto'||!normalized.output.showDimensions||!normalized.output.showDimensionLines||value.proportionControl||!axes||specifications.length!==axes.length||specifications.some((v,i)=>v.axis!==axes[i])||!['mm','cm','inch'].includes(value.output.displayUnit))fail('INVALID_AI_DIMENSION_DISPLAY');
    const inputKey=aiDimensionInputKey({...normalized,dimensionDisplay:d});
    normalized.dimensionDisplay={version:1,method:'ai',layout:d.layout,inputKey,inputHash:hashBytes(Buffer.from(inputKey))};
  }
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
    this.db = this.ledger.db; this.ledger.customerCosts=this.customerCosts; this.now = now; this.adapter = adapter; this.enabled = enabled; this.assistantAdapter = assistantAdapter; this.assistantEnabled = assistantEnabled; this.budgetMicros = budgetMicros; this.providerConfigured = providerConfigured; this.tasks = new Set(); this.budgetForPeriod=budgetForPeriod;
    // The authenticated HTTP service sets this from the server-owned account
    // role. Request JSON, login form fields and client session labels cannot.
    this.adminTestUnlimited = false; this.selectiveEditingEnabled = enabled && adapter?.selectiveEditReady === true;
    if (managedBudgetIncrease && !budgetForPeriod) {
      const highest=this.db.prepare('SELECT COALESCE(MAX(limit_micros),0) value FROM budgets').get().value;
      if(highest>budgetMicros){this.ledger.close();this.unlock();throw Error('BUDGET_DECREASE_REQUIRES_REVIEW');}
      this.db.prepare('UPDATE budgets SET limit_micros=?').run(budgetMicros);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS generation_assets(hash TEXT PRIMARY KEY, mime TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, bytes BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS generation_records(id TEXT PRIMARY KEY REFERENCES jobs(id), project_id TEXT NOT NULL, fingerprint TEXT NOT NULL, request_json TEXT NOT NULL, source_hash TEXT, artifact_hash TEXT, artifact_role TEXT, error_code TEXT, metadata_json TEXT, created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS generation_fingerprints ON generation_records(fingerprint);
      CREATE TABLE IF NOT EXISTS video_trials(id TEXT PRIMARY KEY REFERENCES jobs(id),fingerprint TEXT NOT NULL,provider_id TEXT,rate TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS higgsfield_video_jobs(
        id TEXT PRIMARY KEY REFERENCES jobs(id), fingerprint TEXT NOT NULL, replay_key TEXT NOT NULL,
        images_json TEXT, quoted_micros INTEGER NOT NULL, provider_id TEXT,
        lease_until INTEGER NOT NULL DEFAULT 0, submissions INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS video_submission_errors(id TEXT PRIMARY KEY REFERENCES jobs(id),code TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ad_batches(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, job_ids TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS generation_keys(request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, job_id TEXT NOT NULL REFERENCES generation_records(id));
      CREATE TABLE IF NOT EXISTS local_development_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS assistant_requests(request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, period TEXT NOT NULL, held_micros INTEGER NOT NULL, actual_micros INTEGER, state TEXT NOT NULL, response_json TEXT, error_code TEXT, created_at INTEGER NOT NULL);
    `);
    this.db.prepare('UPDATE higgsfield_video_jobs SET images_json=NULL WHERE images_json IS NOT NULL AND id IN (SELECT id FROM jobs WHERE expires_at<=?)').run(this.now());
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
  // One cutover per beta tenant. Keep purchases, reservations and job history for audit.
  initializeSharedWallet() {
    if(this.sharedWalletReady)return;
    this.ledger.transaction(()=>{
      const marker='shared-wallet-beta-v1';
      if(this.db.prepare('SELECT value FROM local_development_meta WHERE key=?').get(marker))return;
      for(const table of ['wallets','credit_wallets']){
        const balance=this.db.prepare(`SELECT available FROM ${table} WHERE user_id=?`).get(LOCAL_USER);
        if(balance?.available>0){
          this.ledger.event(marker+':'+table,LOCAL_USER,null,'beta-reset',balance.available);
          this.db.prepare(`UPDATE ${table} SET available=0 WHERE user_id=?`).run(LOCAL_USER);
        }
      }
      this.db.exec('INSERT INTO previous_beta_jobs SELECT id FROM jobs');
      this.db.prepare('INSERT INTO local_development_meta VALUES(?,?)').run(marker,'1');
    });
    this.sharedWalletReady=true;
  }
  videoQuote(body) {
    if(this.adminTestUnlimited)return {credits:1,creditExempt:true};
    const credits=videoDurationPrices()[body.seconds];
    if(!this.sharedWalletReady||!this.enabled||!Number.isSafeInteger(credits)||credits<=0)fail('VIDEO_TRIAL_UNAVAILABLE',403);
    if(body.expectedCredits!==credits)fail('VIDEO_PRICE_CHANGED',409);
    if(this.wallet().credits.available<credits)fail('NO_TEST_CREDITS',409);
    return {credits,unit:'credit-v2',customerFunded:Boolean(this.customerImagesEnabled)};
  }
  increaseBudget(micros) {
    if(!Number.isSafeInteger(micros)||micros<this.budgetMicros||micros>100_000_000)fail('BUDGET_INCREASE_ONLY');
    if(!this.budgetForPeriod)this.ledger.transaction(()=>this.db.prepare('UPDATE budgets SET limit_micros=?').run(micros));
    this.budgetMicros=micros;
  }
  testPurchaseReceipt(purchase) { return this.verifiedPurchaseReceipt(purchase); }
  verifiedPurchaseReceipt({purchaseId,credits,unit='legacy-ticket'}) {
    const row=this.db.prepare('SELECT * FROM purchases WHERE purchase_id=?').get(purchaseId);
    if(!row||row.user_id!==LOCAL_USER||row.credits!==credits||(this.db.prepare('SELECT unit FROM purchase_units WHERE purchase_id=?').get(purchaseId)?.unit??'legacy-ticket')!==unit)throw new ApiFailure('PURCHASE_NOT_VERIFIED',409);
    return {grantedCredits:row.credits,...(unit==='credit-v2'?{unit}:{}),balance:this.ledger.wallet(LOCAL_USER,unit).available};
  }
  recordTestPurchase(purchase) {
    const plan=checkoutOffers.find(offer=>offer.id===purchase.plan&&offer.period!=='topup');
    if(!plan)return this.recordVerifiedPurchase(purchase);
    if(purchase.credits!==plan.credits||!Number.isSafeInteger(purchase.startedAt))fail('INVALID_ORDER');
    return this.ledger.transaction(()=>{
      this.db.prepare('INSERT INTO subscription_terms(purchase_id,plan,started,months,issued,next_due) VALUES(?,?,?,?,1,?) ON CONFLICT DO NOTHING')
        .run(purchase.purchaseId,plan.id,purchase.startedAt,plan.period==='annual'?12:1,billingAnniversary(purchase.startedAt,1));
      return this.recordVerifiedPurchase(purchase);
    });
  }
  applySubscriptionCredits(){
    const now=this.now();
    const due=this.db.prepare('SELECT purchase_id FROM subscription_terms WHERE issued<months AND next_due<=?').all(now);
    for(const row of due)this.ledger.transaction(()=>{
      const term=this.db.prepare('SELECT * FROM subscription_terms WHERE purchase_id=?').get(row.purchase_id);
      const plan=checkoutOffers.find(offer=>offer.id===term.plan);
      let issued=term.issued;
      while(issued<term.months&&billingAnniversary(term.started,issued)<=now){
        this.ledger.recordVerifiedPurchase({purchaseId:term.purchase_id+':month:'+issued,userId:LOCAL_USER,credits:plan.credits,unit:'credit-v2'});
        issued++;
      }
      this.db.prepare('UPDATE subscription_terms SET issued=?,next_due=? WHERE purchase_id=?').run(issued,billingAnniversary(term.started,issued),term.purchase_id);
    });
  }
  recordVerifiedPurchase({purchaseId,credits,unit='legacy-ticket'}) { this.ledger.recordVerifiedPurchase({purchaseId,userId:LOCAL_USER,credits,unit});return this.wallet(); }
  wallet() { return { ...this.ledger.wallet(LOCAL_USER), credits:this.ledger.wallet(LOCAL_USER,'credit-v2'), kind: this.adminTestUnlimited ? 'admin-test-unlimited' : 'test-credits', ...(this.adminTestUnlimited ? {unlimited:true} : {}) }; }
  creditQuote(walletSnapshot) {
    const wallet=walletSnapshot??this.wallet();
    const unit=this.adminTestUnlimited||wallet.available>0?'legacy-ticket':'credit-v2';
    return {unit,amount:this.adminTestUnlimited?0:unit==='legacy-ticket'?1:imageCredits,policy:unit==='legacy-ticket'?'legacy-accept-v1':'delivered-2026-10-18'};
  }
  videoAdminSummary(){
    if(!this.adminTestUnlimited)fail('VIDEO_TRIAL_UNAVAILABLE',403);
    const provider=activeVideoProvider();
    const totals=this.db.prepare(`SELECT COUNT(*) AS jobs,
      COALESCE(SUM(CASE WHEN a.status='completed' THEN a.actual_micros ELSE 0 END),0) AS spent,
      COALESCE(SUM(CASE WHEN a.actual_micros IS NULL AND a.status<>'failed' THEN a.maximum_micros ELSE 0 END),0) AS held
      FROM jobs j JOIN attempts a ON a.job_id=j.id WHERE j.kind='video'`).get();
    return {provider,configured:provider==='byteplus'?!!seedanceConfig():!!quotedVideoProvider(provider)?.key(),
      jobs:Number(totals.jobs),spentMicros:Number(totals.spent),heldMicros:Number(totals.held)};
  }
  async startVideo(body){
    if(!this.adminTestUnlimited&&!this.sharedWalletReady)fail('VIDEO_TRIAL_UNAVAILABLE',403);
    if(!identifier(body?.requestId))fail('INVALID_VIDEO');
    // Existing quoted jobs keep their original model across provider changes.
    const saved=this.db.prepare('SELECT v.*,j.model_revision FROM higgsfield_video_jobs v JOIN jobs j ON v.id=j.id WHERE v.id=?').get(body.requestId);
    const legacy=this.db.prepare('SELECT j.model_revision FROM video_trials v JOIN jobs j ON j.id=v.id WHERE v.id=?').get(body.requestId);
    const pilot=body.pilot==='gemini';
    if(body.pilot!==undefined&&(!pilot||!this.adminTestUnlimited))fail('VIDEO_TRIAL_UNAVAILABLE',403);
    if(pilot&&!quotedVideoProvider('gemini').accepts(body))fail('INVALID_VIDEO');
    if((saved&&saved.model_revision.startsWith('gemini/')!==pilot)||(pilot&&legacy))fail('IDEMPOTENCY_CONFLICT',409);
    const provider=quotedVideoProvider(saved?saved.model_revision.split('/')[0]:pilot?'gemini':activeVideoProvider(),saved?.model_revision);
    if(!legacy&&provider)return this.startQuotedVideo(body,saved,provider);
    const config=seedanceConfig();
    if(!config||(!legacy&&activeVideoProvider()!=='byteplus'))fail('VIDEO_TRIAL_UNAVAILABLE',403);
    let payload;
    try{payload=seedancePayload(body,legacy?.model_revision??config.model);}catch{fail('INVALID_VIDEO');}
    const id=body.requestId,fingerprint=hashBytes(Buffer.from(JSON.stringify(payload)));
    const dispatch=this.ledger.transaction(()=>{
      const prior=this.db.prepare('SELECT fingerprint FROM video_trials WHERE id=?').get(id);
      if(prior){if(prior.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT',409);return false;}
      const quotePolicy=this.videoQuote(body);
      const period=this.period(),limit=quotePolicy.customerFunded?0:this.budgetLimit(period);
      if(!quotePolicy.customerFunded&&!limit)fail('BUDGET_UNAVAILABLE',409);
      this.ledger.reserve({jobId:id,userId:LOCAL_USER,kind:'video',requestHash:fingerprint,...quotePolicy,modelRevision:config.model,expiresAt:this.now()+86400000});
      this.db.prepare('INSERT INTO video_trials(id,fingerprint,rate) VALUES(?,?,?)').run(id,fingerprint,String(config.rate));
      this.ledger.beginAttempt({jobId:id,attemptId:id,period,maximumMicros:config.hold,limitMicros:limit,periodScoped:Boolean(this.budgetForPeriod)});
      return true;
    });
    if(dispatch){
      try{
        const task=await seedanceTask(config,'POST',payload);
        if(typeof task.id!=='string'||!/^[a-zA-Z0-9_-]{1,150}$/.test(task.id))throw Error('MISSING_TASK');
        this.db.prepare('UPDATE video_trials SET provider_id=? WHERE id=?').run(task.id,id);
      }catch{this.ledger.markAttemptUncertain(id);fail('VIDEO_SUBMISSION_UNCERTAIN',503);}
    }
    return {id};
  }
  async startQuotedVideo(body,saved,provider){
    const key=provider.key();
    if(!key)fail('VIDEO_TRIAL_UNAVAILABLE',403);
    let plan;
    try{plan=seedancePayload(body,provider.model);}catch{fail('INVALID_VIDEO');}
    const id=body.requestId;
    const originalPlan=plan;
    plan=provider.preparePlan?.(originalPlan, body)??originalPlan;
    let fingerprint=hashBytes(Buffer.from(JSON.stringify(plan)));
    if(!saved){
      const quotePolicy=this.videoQuote(body);
      const period=this.period(),limit=quotePolicy.customerFunded?0:this.budgetLimit(period);
      if(!quotePolicy.customerFunded&&!limit)fail('BUDGET_UNAVAILABLE',409);
      let images,quote;
      try{
        images=await provider.upload(key,plan.content,plan);
        quote=await provider.estimate(key,provider.input(plan,images));
      }catch(error){
        if(error.videoPreflightCode)fail(error.videoPreflightCode,503);
        if(error.providerStatus===401)fail('VIDEO_PROVIDER_AUTH',503);
        if(error.providerStatus===403&&provider.revision.startsWith('topview/'))fail('VIDEO_PROVIDER_PERMISSION',503);
        if([402,403].includes(error.providerStatus))fail('VIDEO_PROVIDER_BALANCE',503);
        fail('VIDEO_QUOTE_UNAVAILABLE',503);
      }
      saved=this.ledger.transaction(()=>{
        const existing=this.db.prepare('SELECT * FROM higgsfield_video_jobs WHERE id=?').get(id);
        if(existing)return existing;
        this.ledger.reserve({jobId:id,userId:LOCAL_USER,kind:'video',requestHash:fingerprint,
          ...quotePolicy,modelRevision:provider.revision,expiresAt:this.now()+86400000});
        this.ledger.beginAttempt({jobId:id,attemptId:id,period,maximumMicros:quote,limitMicros:limit,periodScoped:Boolean(this.budgetForPeriod)});
        this.db.prepare('INSERT INTO higgsfield_video_jobs(id,fingerprint,replay_key,images_json,quoted_micros) VALUES(?,?,?,?,?)')
          .run(id,fingerprint,randomUUID(),JSON.stringify(images),quote);
        return this.db.prepare('SELECT * FROM higgsfield_video_jobs WHERE id=?').get(id);
      });
    }
    // A previously admitted job must replay its exact original provider input.
    if(saved.fingerprint!==fingerprint&&originalPlan!==plan){
      fingerprint=hashBytes(Buffer.from(JSON.stringify(originalPlan)));
      plan=originalPlan;
    }
    if(saved.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT',409);
    const job=this.ledger.job(id);
    if(job.expires_at<=this.now())fail('VIDEO_EXPIRED',410);
    if(saved.provider_id||job.status==='released')return {id};
    const now=this.now();
    const claim=this.db.prepare(`UPDATE higgsfield_video_jobs SET lease_until=?,submissions=submissions+1
      WHERE id=? AND provider_id IS NULL AND images_json IS NOT NULL AND lease_until<=? AND (submissions=0 OR ?=0) RETURNING submissions`).get(now+60000,id,now,provider.singleSubmit?1:0);
    if(!claim)return {id};
    // Keep the original image URLs and key across timeouts, server restarts and concurrent clients.
    let providerId;
    try{
      providerId=await provider.submit(key,provider.input(plan,JSON.parse(saved.images_json)),saved.replay_key);
    }catch(error){
      if(claim.submissions===1&&[400,401,402,403,404,422,423,429].includes(error.providerStatus)){
        this.ledger.transaction(()=>{
          this.ledger.settleAttempt(id,0,'failed');
          this.ledger.release(id,LOCAL_USER,'system_error');
          this.db.prepare('UPDATE higgsfield_video_jobs SET images_json=NULL WHERE id=?').run(id);
          if(provider.revision.startsWith('topview/')||provider.singleSubmit){
            const reason={400:'VIDEO_PROVIDER_INPUT',401:'VIDEO_PROVIDER_AUTH',402:'VIDEO_PROVIDER_BALANCE',403:'VIDEO_PROVIDER_PERMISSION',404:'VIDEO_PROVIDER_MODEL',422:'VIDEO_PROVIDER_INPUT',423:'VIDEO_PROVIDER_PAUSED',429:'VIDEO_PROVIDER_LIMIT'}[error.providerStatus];
            this.db.prepare('INSERT INTO video_submission_errors(id,code) VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(id,reason);
          }
        });
        return {id};
      }
      this.ledger.transaction(()=>{
        this.ledger.markAttemptUncertain(id);
        this.db.prepare('UPDATE higgsfield_video_jobs SET lease_until=0 WHERE id=? AND provider_id IS NULL').run(id);
      });
      fail('VIDEO_SUBMISSION_UNCERTAIN',503);
    }
    this.db.prepare('UPDATE higgsfield_video_jobs SET provider_id=?,images_json=NULL WHERE id=?').run(providerId,id);
    return {id};
  }
  async quotedVideoResult(row,download){
    const job=this.ledger.job(row.id);
    if(job.expires_at<=this.now())fail('VIDEO_EXPIRED',410);
    if(job.status==='released'){
      const failure=this.db.prepare('SELECT code FROM video_submission_errors WHERE id=?').get(row.id);
      return failure?{state:'failed',code:failure.code}:{state:'failed'};
    }
    if(!row.provider_id)return {state:job.status==='uncertain'||row.lease_until<=this.now()?'uncertain':'running'};
    const provider=quotedVideoProvider(job.model_revision.split('/')[0]);
    const key=provider?.key();
    if(!key)fail('VIDEO_TRIAL_UNAVAILABLE',403);
    const replaceProviderId=(previous,next)=>this.db.prepare('UPDATE higgsfield_video_jobs SET provider_id=? WHERE id=? AND provider_id=? RETURNING id').get(next,row.id,previous);
    const result=await provider.poll(key,row.provider_id,download,replaceProviderId);
    if(result.state==='uncertain')return {state:'uncertain'};
    if(result.state==='payment_required')fail('VIDEO_PROVIDER_BALANCE',503);
    if(result.state==='running')return {state:'running'};
    this.ledger.transaction(()=>{
      if(result.state==='ready'){
        this.ledger.settleAttempt(row.id,result.actualMicros??row.quoted_micros,'completed');
        if(job.creditExempt)this.ledger.markReady(row.id,row.provider_id);
      }else{
        this.ledger.settleAttempt(row.id,result.actualMicros??0,'failed');
        this.ledger.release(row.id,LOCAL_USER,'system_error');
      }
    });
    if(result.state==='ready'&&download){
      const file=result.file??await seedanceMovie(result.url);
      if(!job.creditExempt)this.ledger.markReady(row.id,row.provider_id);
      return file;
    }
    return {state:result.state};
  }
  videoHistory(){
    return this.db.prepare("SELECT id,expires_at FROM jobs WHERE user_id=? AND kind='video' AND status IN ('ready','accepted') AND expires_at>? ORDER BY expires_at DESC,id DESC").all(LOCAL_USER,this.now());
  }
  async videoResult(id,download=false){
    if(!this.adminTestUnlimited&&!this.sharedWalletReady)fail('VIDEO_TRIAL_UNAVAILABLE',403);
    const hf=this.db.prepare('SELECT * FROM higgsfield_video_jobs WHERE id=?').get(id);
    if(hf)return this.quotedVideoResult(hf,download);
    const config=seedanceConfig();
    if(!config)fail('VIDEO_TRIAL_UNAVAILABLE',403);
    const row=this.db.prepare('SELECT * FROM video_trials WHERE id=?').get(id);
    if(!row)fail('VIDEO_NOT_FOUND',404);
    const job=this.ledger.job(id);
    if(job.expires_at<=this.now())fail('VIDEO_EXPIRED',410);
    if(!row.provider_id)return {state:job.status==='uncertain'?'uncertain':'running'};
    const task=await seedanceTask(config,'GET',row.provider_id);
    if(task.status==='succeeded'&&task.content?.video_url){
      const tokens=task.usage?.completion_tokens;
      if(!Number.isSafeInteger(tokens)||tokens<0)fail('VIDEO_USAGE_UNKNOWN',503);
      this.ledger.settleAttempt(id,Math.ceil(tokens*Number(row.rate)),'completed');
      if(job.creditExempt)this.ledger.markReady(id,row.provider_id);
      if(!download)return {state:'ready'};
      const file=await seedanceMovie(task.content.video_url);
      if(!job.creditExempt)this.ledger.markReady(id,row.provider_id);
      return file;
    }
    if(['failed','expired','cancelled'].includes(task.status)){
      // Failed tasks without usage data keep their cost hold for reconciliation.
      const tokens=task.usage?.completion_tokens;
      if(Number.isSafeInteger(tokens)&&tokens>=0)this.ledger.settleAttempt(id,Math.ceil(tokens*Number(row.rate)),'failed');
      else this.ledger.markAttemptUncertain(id);
      this.ledger.release(id,LOCAL_USER,'system_error');
      return {state:'failed'};
    }
    return {state:'running'};
  }
  reportDefect(id,{description}={}) {
    this.job(id);
    if(typeof description!=='string'||description.trim().length<10||description.length>2000)fail('INVALID_DEFECT_REPORT');
    const job=this.ledger.job(id);
    if(!job.captured&&job.status!=='accepted')fail('RESULT_NOT_DELIVERED',409);
    return this.ledger.transaction(()=>{
      this.db.prepare('INSERT INTO defect_reports(id,job_id,description,created_at) VALUES (?,?,?,?) ON CONFLICT(job_id) DO NOTHING').run(randomUUID(),id,description.trim(),this.now());
      return this.db.prepare('SELECT * FROM defect_reports WHERE job_id=?').get(id);
    });
  }
  defectEvidence(id) {
    if(!identifier(id)||!this.db.prepare('SELECT id FROM defect_reports WHERE job_id=?').get(id))fail('REPORT_NOT_FOUND',404);
    const row=this.db.prepare('SELECT * FROM generation_records WHERE id=?').get(id);
    return {input:JSON.parse(row.request_json),artifact:this.asset(row.artifact_hash),source:this.asset(row.source_hash)};
  }
  reviewDefect(id,{decision,resolution,reviewer}={}) {
    if(!['confirmed','declined'].includes(decision)||typeof resolution!=='string'||resolution.trim().length<10||resolution.length>2000||!identifier(reviewer))fail('INVALID_DEFECT_REVIEW');
    return this.ledger.transaction(()=>{
      const report=this.db.prepare('SELECT * FROM defect_reports WHERE job_id=?').get(id);
      if(!report)fail('REPORT_NOT_FOUND',404);
      if(report.state!=='pending'){
        if(report.state!==decision||report.resolution!==resolution.trim())fail('REVIEW_CONFLICT',409);
        return report;
      }
      if(decision==='confirmed')this.ledger.refundConfirmedDefect(id,report.id);
      this.db.prepare('UPDATE defect_reports SET state=?,resolution=?,reviewer=?,reviewed_at=? WHERE id=?').run(decision,resolution.trim(),reviewer,this.now(),report.id);
      return this.db.prepare('SELECT * FROM defect_reports WHERE id=?').get(report.id);
    });
  }
  supplierBudget(period,limit){
    this.ledger.budgetOwner=this.cloudUser;this.ledger.budgetAdmin=this.adminTestUnlimited===true;
    return this.ledger.supplierBudget(period,limit);
  }
  budgetLimit(period){
    if(period!==this.period())fail('BUDGET_PERIOD_CHANGED',409);
    const value=this.budgetForPeriod?this.budgetForPeriod(period):this.budgetMicros;
    if(!Number.isSafeInteger(value)||value<0||value>100000000)fail('INVALID_DEVELOPMENT_BUDGET');
    if(period!==this.period())fail('BUDGET_PERIOD_CHANGED',409);
    return this.supplierBudget(period,value)?.monthlyLimitMicros??value;
  }
  status() {
    readinessMeasure('expiry',()=>this.ledger.expire());
    const customer=this.customerImagesEnabled && !this.adminTestUnlimited;
    const period=this.period(),limit=customer?0:readinessMeasure('budget',()=>this.budgetLimit(period)),budget = readinessMeasure('budget',()=>this.ledger.budget(period));
    const cumulative=customer?null:this.supplierBudget(period,limit);
    const available = cumulative?.availableMicros ?? (limit - (budget?.spent_micros ?? 0) - (budget?.held_micros ?? 0));
    // Request-local only: expire first, then use one wallet read for reason/quote/body.
    // Admission still obtains a fresh quote and rechecks it inside its transaction.
    const wallet=readinessMeasure('wallet',()=>this.wallet());
    const reason = !this.enabled ? 'GENERATION_DISABLED' : !this.providerConfigured ? 'PROVIDER_NOT_CONFIGURED' : !customer && ((cumulative?.limitMicros??limit) < MODEL_COST_HOLD_MICROS || available < MODEL_COST_HOLD_MICROS) ? 'BUDGET_NOT_AVAILABLE' : !this.adminTestUnlimited && wallet.available < 1 && wallet.credits.available < imageCredits ? 'NO_TEST_CREDITS' : null;
    const assistantReason = customer || !this.assistantEnabled || (this.ledger.sharedBudget && !this.adminTestUnlimited) ? 'ASSISTANT_DISABLED' : !this.providerConfigured ? 'PROVIDER_NOT_CONFIGURED' : (cumulative?.availableMicros??(this.budgetMicros-(budget?.spent_micros??0)-(budget?.held_micros??0))) < TEXT_MAX_HOLD_MICROS ? 'BUDGET_NOT_AVAILABLE' : null;
    return { mode: 'local-development', commercialReady: false, omniPilot:this.adminTestUnlimited&&!!quotedVideoProvider('gemini').key(), videoTrial:(this.adminTestUnlimited||(this.sharedWalletReady&&this.enabled&&Object.keys(videoDurationPrices()).length>0))&&(activeVideoProvider()==='byteplus'?!!seedanceConfig():!!quotedVideoProvider(activeVideoProvider())?.key()), videoProvider:activeVideoProvider(),videoDurationPrices:videoDurationPrices(), generation: { batchVersion:1, selectiveEditProofVersion:1, selectiveEdit: this.selectiveEditingEnabled===true&&this.adapter?.selectiveEditReady===true, creditQuote:this.creditQuote(wallet), enabled: reason === null, exactAdText:false, plannedAdText:false, manualDimensionOverlay:true, aiDimensionDisplay: true, photoPurposes: true, textExamples: true, planarControl: true, dimensionVariants: true, model: IMAGE_MODEL, revision: IMAGE_REVISION, quality: 'high', reason, perRequestReservationUsd: MODEL_COST_HOLD_MICROS / 1e6 }, assistant: { available: assistantReason === null, reason: assistantReason, model: TEXT_MODEL }, wallet, budget: customer?{scope:'customer-entitlement',limitMicros:0,spentMicros:0,heldMicros:0}:{ currency: 'USD', period, limitMicros: limit, spentMicros: budget?.spent_micros ?? 0, heldMicros: budget?.held_micros ?? 0, availableMicros: Math.max(0, available), enforcedByProvider: false, ...(cumulative?{scope:cumulative.scope,historyMode:cumulative.historyMode,activatedAt:cumulative.activatedAt,limitMicros:cumulative.limitMicros,spentMicros:cumulative.spentMicros,heldMicros:cumulative.heldMicros,availableMicros:cumulative.availableMicros}:{}) }, limitations: ['local-single-user','no-live-payment','no-automatic-quality-approval','no-background-removal','no-region-edit','no-production-auth'] };
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
    const requestIds = this.db.prepare('SELECT request_id FROM generation_keys WHERE job_id=? ORDER BY rowid DESC').all(id).map(key => key.request_id);
    const defectReport=this.db.prepare('SELECT state FROM defect_reports WHERE job_id=?').get(id);
    return this.jobView(row,billing,requestIds,defectReport,{includeArtifact});
  }
  jobView(row,billing,requestIds,defectReport,{includeArtifact=true}={}) {
    const id=row.id,metadata=row.metadata_json?JSON.parse(row.metadata_json):null,request=JSON.parse(row.request_json);
    // The supplier cost can remain unknown after a customer edit has ended without delivery.
    const editEnded=request.selectiveEdit && row.error_code==='PROVIDER_UNCERTAIN' && billing.status==='released' && billing.reason==='system_error' && !billing.artifact_id;
    const editReview=includeArtifact && request.selectiveEdit && row.error_code==='EDIT_POSE_QUALITY_FAILED' && billing.expires_at>this.now() ? metadata?.editReview : null;
    const errorCode=editEnded?'EDIT_NOT_DELIVERED':row.error_code;
    const state = errorCode === 'PROVIDER_UNCERTAIN' ? 'uncertain' : errorCode ? 'failed' : billing.status === 'released' ? (billing.reason === 'customer_rejected' ? 'rejected' : 'expired') : billing.status === 'refunded' ? 'refunded' : billing.status === 'reserved' ? 'running' : billing.status;
    return { id, ...(editReview?{editReview}:{}), ...(request.selectiveEdit?{selectiveEdit:metadata?.preservation?.requestMaskHash===request.selectiveEdit.maskHash?{...request.selectiveEdit,maskHash:metadata.preservation.maskHash}:request.selectiveEdit,...(metadata?.preservation?{preservation:metadata.preservation}:{})}:{}), requestFingerprint:hashBytes(Buffer.from(generationMatchKey(request))), ...(request.dimensionDisplay?{dimensionDisplay:request.dimensionDisplay,...(metadata?.dimensionReview?{dimensionReview:metadata.dimensionReview}:{})}:{}), ...(request.inputMode==='text-example'?{inputMode:'text-example'}:{}),...(request.dimensionPlan?{dimensionPlan:request.dimensionPlan}:{}), ...(metadata?.planarReport?{planarReport:metadata.planarReport,...(includeArtifact?{planarOriginal:this.asset(metadata.planarReport.originalHash,{optional:true})}:{})}:{}), creditUnit:billing.unit,creditPolicy:billing.creditExempt?'admin-unlimited':billing.policy,creditCost:billing.creditExempt?0:billing.credits,creditCaptured:billing.captured,...(defectReport?{defectReport}:{}), requestId: requestIds[0] ?? null, requestIds, projectId: row.project_id, state, mode: request.mode, sourceHash: row.source_hash, createdAt: new Date(row.created_at).toISOString(), model: metadata?.model??IMAGE_MODEL, quality: 'high', outputFormat: request.output.format, ...(metadata?.composition?{composition:metadata.composition,...(metadata.composition==='complete-ad'?{compositionKey:request.output.compositionKey}:{})}:{}), artifact: ['ready','accepted'].includes(state) && includeArtifact && row.artifact_hash ? { ...this.asset(row.artifact_hash), role: row.artifact_role } : null, artifactId: editEnded?null:row.artifact_hash, errorCode, usage: metadata?.usage ?? null, cost: metadata?.cost ?? null, providerRequestId: metadata?.providerRequestId ?? null, marketingPlan: request.marketingPlan ?? null, review: 'human-review-required', billingStatus: billing.status, expiresAt: billing.expires_at };
  }
  requestStatus(requestId, projectId) {
    if (!identifier(requestId) || !identifier(projectId)) fail('INVALID_REQUEST');
    // This is a tenant-scoped key lookup, not the truncated recent-history view.
    // Missing means no committed key yet, NOT proof that no POST is in flight.
    const key = this.db.prepare('SELECT job_id FROM generation_keys WHERE request_id=?').get(requestId);
    if (!key) return {version:1,requestId,projectId,state:'not-recorded',jobId:null};
    const row = this.db.prepare('SELECT project_id FROM generation_records WHERE id=?').get(key.job_id);
    if (!row) fail('INTERNAL_ERROR',500);
    if (row.project_id !== projectId) fail('REQUEST_PROJECT_MISMATCH',409);
    return {version:1,requestId,projectId,state:'found',jobId:key.job_id};
  }
  history(projectId) {
    if (projectId !== undefined && !identifier(projectId)) fail('INVALID_PROJECT_ID');
    const rows = projectId ? this.db.prepare('SELECT id FROM generation_records WHERE project_id=? ORDER BY created_at DESC LIMIT 30').all(projectId) : this.db.prepare('SELECT id FROM generation_records ORDER BY created_at DESC LIMIT 30').all();
    return { jobs: rows.map(row => this.job(row.id, { includeArtifact: false })), wallet: this.wallet() };
  }

  batchSummary(id) {
    if(!/^ads-[a-f0-9]{64}$/.test(id))fail('INVALID_BATCH');
    const row=this.db.prepare('SELECT job_ids FROM ad_batches WHERE id=?').get(id);
    if(!row)fail('BATCH_NOT_FOUND',404);
    const jobs=JSON.parse(row.job_ids).map(jobId=>this.job(jobId,{includeArtifact:false}));
    return {id,jobs,wallet:this.wallet()};
  }
  async createBatch(body,request,source,references) {
    const {id,count,quote}=body.batch??{};
    if(!validBatch({id,count})||body.projectId!==id||body.requestId!==id||!quote||request.mode!=='creative'||request.inputMode||request.proportionControl||request.selectiveEdit||request.output?.exactText||request.creativeDirection?.visual?.id!=='auto'||!request.output.compositionKey)fail('INVALID_BATCH');
    const fingerprint=hashBytes(JSON.stringify({count,request,revision:IMAGE_REVISION}));
    const existing=this.db.prepare('SELECT fingerprint FROM ad_batches WHERE id=?').get(id);
    if(existing){
      if(existing.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT',409);
      return {...this.batchSummary(id),reused:true};
    }
    const status=this.status();
    if(!status.generation.enabled)fail(status.generation.reason,409);
    const images=[...(source?[source]:[]),...references];
    await this.assertOutputCapacity(request,images);
    for(const image of images) this.storeAsset(image);
    const plannedRequests=planAdBatch(request,count);
    const jobIds=[];
    this.ledger.transaction(()=>{
      const duplicate=this.db.prepare('SELECT fingerprint FROM ad_batches WHERE id=?').get(id);
      if(duplicate){if(duplicate.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT',409);return;}
      if(this.tasks.size||this.db.prepare("SELECT id FROM jobs WHERE kind=? AND user_id=? AND status IN ('reserved','running') LIMIT 1").get(imageMediaType,LOCAL_USER))fail('GENERATION_ALREADY_RUNNING',409);
      const price=batchPrice(this.wallet(),count);
      if(Object.keys(price).some(key=>price[key]!==quote[key]))fail('CREDIT_QUOTE_CHANGED',409);
      if(price.creditsAfter<0)fail('NO_TEST_CREDITS',409);
      const created=this.now();
      for(let i=0;i<count;i++){
        const jobId=randomUUID(), projectId=id+'-'+(i+1);
        const plannedRequest=plannedRequests[i];
        const key=hashBytes(JSON.stringify({projectId,request:plannedRequest,sourceHash:source?.sha256??null,revision:IMAGE_REVISION}));
        const legacy=price.admin||i<price.ticketsUsed;
        this.ledger.reserve({jobId,userId:LOCAL_USER,kind:imageMediaType,customerFunded:this.customerImagesEnabled && !price.admin && !legacy,unit:legacy?'legacy-ticket':'credit-v2',credits:legacy?1:imageCredits,creditExempt:price.admin,requestHash:key,modelRevision:IMAGE_REVISION,expiresAt:created+86400000});
        this.db.prepare('INSERT INTO generation_records(id,project_id,fingerprint,request_json,source_hash,created_at) VALUES (?,?,?,?,?,?)').run(jobId,projectId,key,JSON.stringify(plannedRequest),source?.sha256??null,created);
        this.db.prepare('INSERT INTO generation_keys VALUES (?,?,?)').run(projectId,key,jobId);
        jobIds.push(jobId);
      }
      this.db.prepare('INSERT INTO ad_batches(id,fingerprint,job_ids) VALUES (?,?,?)').run(id,fingerprint,JSON.stringify(jobIds));
    });
    if(jobIds.length){
      // One server-owned queue. Each dispatch retains the existing supplier budget and failure settlement.
      const work=(async()=>{for(const [i,jobId] of jobIds.entries())await this.dispatch(jobId,plannedRequests[i],source,references);})();
      this.tasks.add(work);
      work.then(()=>this.tasks.delete(work),()=>this.tasks.delete(work));
    }
    return {...this.batchSummary(id),reused:jobIds.length===0};
  }
  async assertOutputCapacity(request, originals) { /* Local disk implementation has no cloud quota. */ }
  selectiveRequestStatus(requestId,sourceJobId) {
    if(!identifier(requestId)||!identifier(sourceJobId))fail('INVALID_REQUEST');
    const key=this.db.prepare('SELECT job_id FROM generation_keys WHERE request_id=?').get(requestId);
    if(!key)return {state:'not-recorded',jobId:null};
    const job=this.job(key.job_id,{includeArtifact:false});
    if(job.selectiveEdit?.sourceJobId!==sourceJobId)fail('REQUEST_PROJECT_MISMATCH',409);
    return {state:'found',jobId:job.id,projectId:job.projectId};
  }
  async selectiveProductReferences(request,sourceHash) {
    // Derive evidence only from this tenant's immutable job history. The edit
    // client cannot add arbitrary URLs, hashes or another project's photographs.
    const visited=new Set();
    while(request.selectiveEdit&&!Array.isArray(request.selectiveEdit.productReferences)){
      const id=request.selectiveEdit.sourceJobId;
      if(!identifier(id)||visited.has(id)||visited.size>=32)fail('INVALID_EDIT_SOURCE',409);
      visited.add(id);
      const row=this.db.prepare('SELECT request_json FROM generation_records WHERE id=?').get(id);
      if(!row)fail('INVALID_EDIT_SOURCE',409);
      request=JSON.parse(row.request_json);
    }
    const descriptors=request.selectiveEdit?.productReferences??[request.source,...request.references??[]].filter(r=>r&&(r.purpose??'subject')==='subject');
    if(!Array.isArray(descriptors)||descriptors.length>10)fail('INVALID_EDIT_SOURCE',409);
    const references=[],seen=new Set([sourceHash]);
    for(const descriptor of descriptors){
      if(!descriptor||!/^[a-f0-9]{64}$/.test(descriptor.sha256))fail('INVALID_EDIT_SOURCE',409);
      if(seen.has(descriptor.sha256))continue;
      seen.add(descriptor.sha256);
      const saved=this.asset(descriptor.sha256);
      if(!saved)fail('INVALID_EDIT_SOURCE',409);
      let ref;try{ref=await parseSourceAsset({...saved,data:saved.dataUrl});}catch{fail('INVALID_EDIT_SOURCE',409);}
      references.push(ref);
    }
    if(references.reduce((n,r)=>n+r.bytes.length,0)>10*1024*1024)fail('INVALID_EDIT_SOURCE',409);
    return references;
  }
  async createUploadedEdit(body, interactive = false) {
    if(!this.selectiveEditingEnabled||this.adapter?.selectiveEditReady!==true)fail('REGION_EDIT_NOT_AVAILABLE',503);
    if(!body||!identifier(body.requestId)||!identifier(body.projectId)||typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>2000||!body.creditQuote)fail('INVALID_EDIT_REQUEST');
    if(!/^[a-f0-9]{64}$/.test(body.sourceHash)||body.original?.sha256!==body.sourceHash)fail('INVALID_EDIT_SOURCE');
    let prepared;
    try { prepared=await prepareSelectiveEdit(body.original,body.mask,interactive); } catch(error) { fail(error.message,400); }
    const sourceId='upload-'+body.sourceHash;
    const source={sha256:prepared.source.sha256,width:prepared.source.width,height:prepared.source.height,purpose:'subject'};
    const region={...prepared,references:[],sourceJobId:sourceId,sourceProjectId:sourceId,sourceHash:body.sourceHash,prompt:body.prompt.trim()};
    try { region.providerInput=await this.adapter.prepareSelectiveInput?.(region); }
    catch(error) { fail(error.code==='UNSUPPORTED_EDIT_SIZE'?error.code:'INVALID_EDIT_MASK'); }
    const request={version:1,mode:'creative',operation:'image-product-concept',subjectType:'physical-product',productName:'Image edit',brief:'',source,references:[],specifications:[],copy:{},output:{format:'1:1',locale:'ko',compositionKey:'{}'}};
    return this.create({requestId:body.requestId,projectId:body.projectId,creditQuote:body.creditQuote,request,source:{...source,data:'data:image/png;base64,'+prepared.source.bytes.toString('base64')}},{region});
  }
  async createSelectiveEdit(body, interactive = false) {
    if(!this.selectiveEditingEnabled||this.adapter?.selectiveEditReady!==true)fail('REGION_EDIT_NOT_AVAILABLE',503);
    if(!body||Object.keys(body).some(k=>!['sourceJobId','sourceHash','requestId','projectId','prompt','mask','creditQuote'].includes(k))||!identifier(body.sourceJobId)||!identifier(body.requestId)||!identifier(body.projectId)||typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>2000)fail('INVALID_EDIT_REQUEST');
    const original=this.job(body.sourceJobId),row=this.db.prepare('SELECT request_json FROM generation_records WHERE id=?').get(body.sourceJobId);
    const request=JSON.parse(row.request_json);
    if(!['ready','accepted'].includes(original.state)||!original.artifact||original.artifactId!==body.sourceHash||original.composition!=='complete-ad'||request.inputMode==='text-example'||request.output.manualDimensionBase||request.output.exactText||request.proportionControl||request.dimensionDisplay||body.projectId===original.projectId)fail('INVALID_EDIT_SOURCE',409);
    let prepared;try{prepared=await prepareSelectiveEdit(original.artifact,body.mask,interactive);}catch(error){fail(error.message,400);}
    prepared.references=await this.selectiveProductReferences(request,prepared.source.sha256);
    let providerInput;try{this.adapter.validateSelectiveInput?.(prepared);providerInput=await this.adapter.prepareSelectiveInput?.(prepared);}catch(error){fail(['UNSUPPORTED_EDIT_MODEL','UNSUPPORTED_EDIT_SIZE','INVALID_EDIT_MASK'].includes(error.code)?error.code:'INVALID_EDIT_REQUEST',400);}
    const region={...prepared,providerInput,prompt:body.prompt.trim(),sourceJobId:original.id,sourceProjectId:original.projectId,sourceHash:original.artifactId};
    const ref={sha256:prepared.source.sha256,width:prepared.source.width,height:prepared.source.height,purpose:'subject'};
    const normalized={...request,mode:'creative',operation:request.subjectType==='service'?'image-ad-creative':'image-product-concept',source:ref,references:[]};
    delete normalized.inputMode;delete normalized.dimensionPlan;
    return this.create({projectId:body.projectId,requestId:body.requestId,creditQuote:body.creditQuote,request:normalized,source:{...ref,data:'data:image/png;base64,'+prepared.source.bytes.toString('base64')}},{region});
  }
  async create(body, {region} = {}) {
    submissionStage('input_validation');
    if(!supportsImageMedia(body?.mediaType))fail('UNSUPPORTED_MEDIA');
    if (!body || !identifier(body.requestId) || !identifier(body.projectId)) fail('INVALID_REQUEST');
    const request = normalizeGenerationRequest(body.request);
    if(region){if(!this.selectiveEditingEnabled||this.adapter?.selectiveEditReady!==true)fail('REGION_EDIT_NOT_AVAILABLE',503);request.selectiveEdit={version:1,sourceJobId:region.sourceJobId,sourceProjectId:region.sourceProjectId,sourceHash:region.sourceHash,maskHash:region.mask.requestMaskHash ?? region.mask.sha256,prompt:region.prompt,productReferences:region.references.map(({sha256,width,height})=>({sha256,width,height,purpose:'subject'}))};}
    if(request.inputMode==='text-example'&&(body.source!=null||(body.references??[]).length))fail('TEXT_EXAMPLE_PHOTOS_NOT_ALLOWED');
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
    if (!source && request.subjectType === 'physical-product' && request.inputMode!=='text-example') fail('SOURCE_REQUIRED');
    if(request.proportionControl){try{await preparePlanarSource(source.bytes,requestPlanarRatio(request));}catch{fail('PLANAR_SOURCE_UNCONFIRMED');}}
    if(body.batch!==undefined)return this.createBatch(body,request,source,references);
    const fingerprint = hashBytes(JSON.stringify({ projectId: region?region.sourceJobId:body.projectId, request, sourceHash: source?.sha256 ?? null, revision: IMAGE_REVISION }));
    submissionStage('request_deduplication');
    const previous = this.db.prepare('SELECT * FROM generation_keys WHERE request_id=?').get(body.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 409);
      submissionStage('existing_response');
      return { job: this.job(previous.job_id), wallet: this.wallet(), reused: true };
    }
    // Replays of a request ID always return its job. A new user submission can
    // retry a released edit, while the original supplier reservation stays held.
    const reusableJobs=region
      ? "(j.status IN ('reserved','running','uncertain','ready','accepted') OR (g.error_code='PROVIDER_UNCERTAIN' AND NOT (j.status='released' AND j.reason='system_error' AND j.artifact_id IS NULL)))"
      : "(j.status IN ('reserved','running','uncertain','ready') OR g.error_code='PROVIDER_UNCERTAIN')";
    const compoundScene = region?.mask.scene === true;
    const modelRevision = compoundScene ? IMAGE_REVISION + '/whole-scene-v2-camera' : IMAGE_REVISION;
    const reviewFilter = compoundScene ? " AND (j.status NOT IN ('ready','accepted') OR j.model_revision=?)" : "";
    const matchSql = `SELECT g.id FROM generation_records g JOIN jobs j ON j.id=g.id WHERE g.fingerprint=? AND ${reusableJobs}${reviewFilter} ORDER BY g.created_at DESC LIMIT 1`;
    const matchArgs = compoundScene ? [fingerprint, modelRevision] : [fingerprint];
    const matching = this.db.prepare(matchSql).get(...matchArgs);
    if (matching) {
      this.db.prepare('INSERT INTO generation_keys VALUES (?,?,?)').run(body.requestId, fingerprint, matching.id);
      submissionStage('existing_response');
      return { job: this.job(matching.id), wallet: this.wallet(), reused: true };
    }
    if(region){
      const prior=this.db.prepare("SELECT g.metadata_json FROM generation_records g WHERE g.fingerprint=? AND g.error_code='EDIT_POSE_QUALITY_FAILED' ORDER BY g.created_at DESC LIMIT 1").get(fingerprint);
      if(prior){
        region.retryPoseReview=true;
        const review=JSON.parse(prior.metadata_json??'{}').editReview;
        region.repairChecks=review?.failedChecks;
        region.repairDifferences=review?.differences;
      }
    }
    const rejected = this.db.prepare("SELECT count(*) n FROM generation_records g JOIN jobs j ON j.id=g.id WHERE g.fingerprint=? AND j.reason='customer_rejected'").get(fingerprint).n;
    if (rejected >= 2 && !this.adminTestUnlimited && this.creditQuote().unit==='legacy-ticket') fail('REVIEW_REQUIRED_AFTER_REJECTIONS', 409);
    submissionStage('admission_readiness');
    const status = this.status();
    if (!status.generation.enabled) fail(status.generation.reason, 503);
    // Serial dispatch avoids a queue whose provider budget could change before execution.
    if (this.tasks.size) fail('GENERATION_ALREADY_RUNNING', 409);
    const quote=this.creditQuote();
    if((quote.unit==='credit-v2'||body.creditQuote)&&(!body.creditQuote||body.creditQuote.unit!==quote.unit||body.creditQuote.amount!==quote.amount||body.creditQuote.policy!==quote.policy))fail('CREDIT_QUOTE_CHANGED',409);
    submissionStage('storage_capacity');
    await this.assertOutputCapacity(request, region?[...all,region.mask,...region.references]:all);
    const id = randomUUID();
    const createdAt = this.now();
    submissionStage('original_persistence');
    if(region)this.storeAsset(region.mask);
    if (source) this.storeAsset(source); // Content-addressed, immutable original bytes.
    for(const ref of references)this.storeAsset(ref);
    // Preflight/storage can yield. Repeat admission under the ledger transaction so
    // concurrent retries reuse the committed job instead of reserving twice.
    submissionStage('admission_transaction');
    let reusedJobId;
    try {
      this.ledger.transaction(() => {
        const existing = this.db.prepare('SELECT * FROM generation_keys WHERE request_id=?').get(body.requestId);
        if(existing){
          if(existing.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT',409);
          reusedJobId=existing.job_id;return;
        }
        const duplicate=this.db.prepare(matchSql).get(...matchArgs);
        if(duplicate){
          this.db.prepare('INSERT INTO generation_keys VALUES (?,?,?)').run(body.requestId,fingerprint,duplicate.id);
          reusedJobId=duplicate.id;return;
        }
        if(this.tasks.size||this.db.prepare("SELECT id FROM jobs WHERE kind=? AND user_id=? AND status IN ('reserved','running') LIMIT 1").get(imageMediaType,LOCAL_USER))fail('GENERATION_ALREADY_RUNNING',409);
        const currentWallet=this.wallet(),currentQuote=this.creditQuote(currentWallet);
        if(this.customerImagesEnabled && !this.adminTestUnlimited && currentWallet.credits.available<imageCredits)fail('NO_TEST_CREDITS',409);
        if(currentQuote.unit!==quote.unit||currentQuote.amount!==quote.amount)fail('CREDIT_QUOTE_CHANGED',409);
        this.ledger.reserve({ customerFunded:this.customerImagesEnabled && !this.adminTestUnlimited && quote.unit==='credit-v2', kind:imageMediaType, jobId: id, userId: LOCAL_USER, credits: quote.amount||1, unit:quote.unit, creditExempt: quote.amount===0, requestHash: fingerprint, modelRevision, expiresAt: createdAt + 24 * 60 * 60 * 1000 });
        this.db.prepare('INSERT INTO generation_records(id,project_id,fingerprint,request_json,source_hash,created_at) VALUES (?,?,?,?,?,?)').run(id, body.projectId, fingerprint, JSON.stringify(request), source?.sha256 ?? null, createdAt);
        this.db.prepare('INSERT INTO generation_keys VALUES (?,?,?)').run(body.requestId, fingerprint, id);
      });
    } catch (error) { if(error instanceof ApiFailure)throw error;fail('CREDIT_RESERVATION_FAILED', 409); }
    submissionStage('accepted_response');
    if(reusedJobId)return {job:this.job(reusedJobId),wallet:this.wallet(),reused:true};
    const work = this.dispatch(id, request, source, references, region);
    this.tasks.add(work); work.finally(() => this.tasks.delete(work));
    return { job: this.job(id), wallet: this.wallet(), reused: false };
  }
  async dispatch(id, request, source, references = [], region) {
    const attemptId = randomUUID(); let began = false, stage='reserve';
    try {
      const attempt = this.ledger.transaction(() => {
        const period=this.period();
        const customerJob=this.db.prepare('SELECT job_id FROM customer_ad_jobs WHERE job_id=?').get(id);
        const limit=customerJob?0:this.budgetLimit(period);
        return this.ledger.beginAttempt({ jobId: id, attemptId, period, maximumMicros: MODEL_COST_HOLD_MICROS + (region?.mask.scene || region?.mask.instruction || region?.mask.explicit ? 80000 : 0), limitMicros: limit, periodScoped:Boolean(this.budgetForPeriod) });
      });
      if (!attempt.shouldDispatch) return;
      began = true;
      stage='provider';
      let result = region ? await this.adapter.editRegion({...region,attemptId}) : await this.adapter.generate({ request, source: request.mode === 'creative' ? source : null, references:request.mode==='creative'?references:[], attemptId });
      if(region){
        stage='edit-finalize';
        result=await finalizeSelectiveEdit(this.adapter,region,result,attemptId);
      }
      if(!supportsImageMedia(result.mediaType))throw new ProviderFailure('UNSUPPORTED_PROVIDER_MEDIA');
      // Persist provider metadata before any customer capture. Pixel validity is not semantic quality approval.
      stage='persist-image';
      if(result.planarOriginal)this.storeAsset(result.planarOriginal);
      this.storeAsset(result);
      stage='persist-metadata';
      this.db.prepare('UPDATE generation_records SET artifact_hash=?,artifact_role=?,metadata_json=? WHERE id=?').run(result.sha256, result.role, JSON.stringify({ model: result.model, revision: result.revision, ...(result.composition?{composition:result.composition}:{}), ...(result.planarReport?{planarReport:result.planarReport}:{}), ...(region&&result.preservation?{preservation:result.preservation}:{}), ...(result.poseReview ? { poseReview: result.poseReview } : {}), usage: result.usage, cost: result.cost, providerRequestId: result.providerRequestId }), id);
      stage='usage';
      if (!result.cost) throw new ProviderFailure('PROVIDER_USAGE_UNCERTAIN');
      stage='settle';
      this.ledger.settleAttempt(attemptId, result.cost.microUsd, 'completed');
      if(region&&result.preservation.changedSelectedPixels===0){
        this.ledger.release(id,LOCAL_USER,'quality_failed');
        this.db.prepare('UPDATE generation_records SET error_code=? WHERE id=?').run('EDIT_NO_CHANGE',id);
        return;
      }
      stage='ready';
      this.ledger.markReady(id, result.sha256);
    } catch (error) {
      // A delivery commit may succeed even when its response is lost. Preserve the
      // durable delivered result and charge instead of relabeling it as a failed/refunded job.
      try { const delivered=this.ledger.job(id);if(delivered.artifact_id&&(delivered.captured||['ready','accepted'].includes(delivered.status)))return; } catch { /* Reconciliation remains necessary if storage is unavailable. */ }
      try { console.warn(JSON.stringify(generationFailureDiagnostic({jobId:id,stage,error}))); } catch { /* Diagnostics must never alter recovery. */ }
      // No automatic retries. Unknown execution/usage preserves the supplier-cost hold.
      const knownFailure = error instanceof ProviderFailure && !error.uncertain;
      let code = !began ? 'BUDGET_NOT_AVAILABLE' : knownFailure ? error.code : 'PROVIDER_UNCERTAIN';
      try {
        if (began) {
          if (knownFailure) this.ledger.settleAttempt(attemptId, error.knownCostMicros ?? 0, 'failed');
          else this.ledger.markAttemptUncertain(attemptId);
        }
        this.ledger.release(id, LOCAL_USER, 'system_error');
        if(code==='EDIT_POSE_QUALITY_FAILED'&&error.editReview){
          this.db.prepare('UPDATE generation_records SET error_code=?,metadata_json=? WHERE id=?').run(code,JSON.stringify({editReview:error.editReview}),id);
        }else this.db.prepare('UPDATE generation_records SET error_code=? WHERE id=?').run(code, id);
      } catch { /* Persistent recovery will reconcile interrupted work on restart. */ }
    }
  }
  accept(id, artifactId, dimensionReview) {
    const job = this.job(id);
    if(job.selectiveEdit){const a=job.artifact,p=job.selectiveEdit;const proof=a&&verifiedPreservation(job.preservation,{sourceHash:p.sourceHash,maskHash:p.maskHash,resultHash:job.artifactId,width:a.width,height:a.height});if(!proof||!proof.changedSelectedPixels)fail('EDIT_PRESERVATION_UNVERIFIED',409);}
    if (typeof artifactId !== 'string' || artifactId !== job.artifactId) fail('ARTIFACT_MISMATCH', 409);
    if(job.dimensionDisplay&&!validAiDimensionReview(dimensionReview,job.dimensionDisplay,artifactId))fail('AI_DIMENSION_REVIEW_REQUIRED',409);
    try { this.ledger.transaction(()=>{this.ledger.accept(id, LOCAL_USER, artifactId);if(job.dimensionDisplay){const row=this.db.prepare('SELECT metadata_json FROM generation_records WHERE id=?').get(id),metadata=JSON.parse(row.metadata_json??'{}');metadata.dimensionReview={inputHash:job.dimensionDisplay.inputHash,artifactHash:artifactId,values:true,axes:true,complete:true};this.db.prepare('UPDATE generation_records SET metadata_json=? WHERE id=?').run(JSON.stringify(metadata),id);}}); }
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
    const period = this.period();
    try {
      this.ledger.transaction(() => {
        const imageLimit=this.budgetLimit(period),cumulative=this.supplierBudget(period,imageLimit);
        const limit=this.ledger.reserveSupplierBudget(period,TEXT_MAX_HOLD_MICROS,cumulative?imageLimit:Math.min(this.budgetMicros,imageLimit));
        this.db.prepare('INSERT INTO budgets(period,limit_micros) VALUES (?,?) ON CONFLICT DO NOTHING').run(period, limit);
        if(this.budgetForPeriod||cumulative){if(period!==this.period())throw Error('BUDGET_PERIOD_CHANGED');this.db.prepare('UPDATE budgets SET limit_micros=? WHERE period=?').run(limit,period);}
        // October image approval never enlarges the text assistant allowance.
        const held = this.db.prepare('UPDATE budgets SET held_micros=held_micros+? WHERE period=? AND limit_micros>=? AND spent_micros+held_micros+?<=?').run(TEXT_MAX_HOLD_MICROS, period, limit, TEXT_MAX_HOLD_MICROS, limit);
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
