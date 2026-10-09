import {verify,createHash} from 'node:crypto';

// Server-only release controller. No provider call, scheduler or money movement.
// The evaluator signing key belongs to the release service, never the mobile client.
export function discoverModels(providerResponse,knownIds=[]){
 if(!providerResponse||!Array.isArray(providerResponse.data))throw Error('Invalid model catalogue');
 const known=new Set(knownIds);
 return [...new Set(providerResponse.data.map(row=>row?.id).filter(id=>typeof id==='string'&&id.length>0&&id.length<200))].filter(id=>!known.has(id)).sort().map(modelId=>({provider:'openai',modelId,state:'discovered',capabilities:[],needsAdapterAndPricingReview:true}));
}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export function verifyEvaluation({candidate,envelope,policy,publicKey,now=Date.now(),baselineMeanCostUsd=null}){
 if(!candidate||candidate.provider!=='openai'||!candidate.modelId||/latest/i.test(candidate.modelId)||!candidate.revision||!candidate.adapterVersion||!/^[a-f0-9]{64}$/.test(candidate.adapterHash)||!candidate.pricingVersion||!Array.isArray(candidate.capabilities)||!candidate.capabilities.length)throw Error('Candidate needs a pinned model, adapter, capabilities and pricing');
 const payload=envelope?.payload;
 if(!payload||!envelope.signature||!publicKey||!verify(null,Buffer.from(JSON.stringify(payload)),publicKey,Buffer.from(envelope.signature,'base64')))throw Error('Evaluation signature is invalid');
 if(payload.candidateHash!==digest(candidate)||payload.suiteVersion!==policy.suiteVersion||!policy.approvedDatasetHashes.includes(payload.datasetHash))throw Error('Evaluation does not match candidate or approved dataset');
 const age=now-Date.parse(payload.evaluatedAt);
 if(!Number.isFinite(age)||age<0||age>policy.maxReportAgeDays*86400000)throw Error('Evaluation is stale or future-dated');
 if(!Array.isArray(payload.cases)||payload.cases.length<policy.minimumCases||new Set(payload.cases.map(c=>c.id)).size!==payload.cases.length||payload.cases.some(c=>!c.id||c.passed!==true))throw Error('Incomplete or failing quality cases');
 for(const group of policy.requiredGroups){if(payload.cases.filter(c=>c.group===group).length<policy.minimumPerGroup)throw Error('Missing required quality group: '+group);}
 const m=payload.metrics;
 if(!m||!finite(m.meanCostUsd)||m.meanCostUsd>policy.maxMeanCostUsd||!finite(m.p95LatencySeconds)||m.p95LatencySeconds>policy.maxP95LatencySeconds)throw Error('Cost or latency gate failed');
 if(baselineMeanCostUsd!==null&&(!finite(baselineMeanCostUsd)||m.meanCostUsd>baselineMeanCostUsd*policy.maxCostIncreaseRatio))throw Error('Cost regression against current model');
 return {candidateHash:digest(candidate),reportHash:digest(envelope),suiteVersion:payload.suiteVersion,meanCostUsd:m.meanCostUsd,evaluatedAt:payload.evaluatedAt};
}
export function candidateDigest(candidate){return digest(candidate);}

// Runtime input to this class must come from the authenticated job service. A
// mobile client cannot supply evaluations or decide whether a job passed quality.
// Persistence, distributed locking and a production scheduler remain integration work.
export class ModelEvolution {
 constructor({policy,publicKey,activeRevision=null,baselineMeanCostUsd=null}){
  this.policy=structuredClone(policy);this.publicKey=publicKey;this.activeRevision=activeRevision;this.baselineMeanCostUsd=baselineMeanCostUsd;this.canary=null;this.history=[];this.lastRollback=null;
 }
 stage(candidate,envelope,now=Date.now()){
  if(this.canary)throw Error('Another candidate is already in canary');
  if(this.history.some(e=>e.revision===candidate.revision))throw Error('Revision has already been evaluated; use an immutable new revision');
  const evidence=verifyEvaluation({candidate,envelope,policy:this.policy,publicKey:this.publicKey,now,baselineMeanCostUsd:this.baselineMeanCostUsd});
  this.canary={candidate:structuredClone(candidate),evidence,jobs:new Map()};
  this.history.push({event:'canary-started',revision:candidate.revision,evidence,at:new Date(now).toISOString()});
 }
 pinNewJob({jobId,internalPilot=false}){
  if(!jobId)throw Error('Job ID required');
  // Without an established production release, only explicitly internal pilots use a candidate.
  if(!this.activeRevision&&!internalPilot)throw Error('Initial production release is not configured');
  const bucket=parseInt(createHash('sha256').update(jobId).digest('hex').slice(0,8),16)%100;
  const candidate=this.canary&&(internalPilot||bucket<this.policy.canaryTrafficPercent);
  const revision=candidate?this.canary.candidate.revision:this.activeRevision;
  if(!revision)throw Error('No eligible model');
  // Persist this pin with the server-side price reservation; never recalculate for retries.
  return Object.freeze({jobId,revision,canary:!!candidate});
 }
 recordCanary({jobId,revision,qualityPassed,systemError,actualCostUsd}){
  if(!this.canary||revision!==this.canary.candidate.revision)throw Error('Not the current canary revision');
  if(!jobId||typeof qualityPassed!=='boolean'||typeof systemError!=='boolean'||!finite(actualCostUsd))throw Error('Invalid canary observation');
  const observation={qualityPassed,systemError,actualCostUsd};
  const existing=this.canary.jobs.get(jobId);if(existing){if(JSON.stringify(existing)!==JSON.stringify(observation))throw Error('Conflicting job observation');return this.status();}
  this.canary.jobs.set(jobId,observation);
  const samples=[...this.canary.jobs.values()],failures=samples.filter(s=>s.systemError||!s.qualityPassed).length;
  const meanCost=samples.reduce((sum,s)=>sum+s.actualCostUsd,0)/samples.length;
  // Identity/text/spec defects or cost overruns stop the rollout immediately.
  if(!qualityPassed||meanCost>this.policy.maxMeanCostUsd||(samples.length>=this.policy.minimumCanaryJobs&&failures/samples.length>this.policy.maxCanaryFailureRate)){
   this.lastRollback={revision,reason:!qualityPassed?'quality-failure':meanCost>this.policy.maxMeanCostUsd?'cost-overrun':'system-failure-rate'};
   this.history.push({event:'canary-rejected',...this.lastRollback});this.canary=null;return this.status();
  }
  if(samples.length>=this.policy.minimumCanaryJobs&&this.activeRevision){
   this.history.push({event:'promoted',revision,previous:this.activeRevision,sampleCount:samples.length,meanCostUsd:meanCost});
   this.activeRevision=revision;this.baselineMeanCostUsd=meanCost;this.canary=null;
  }
  return this.status();
 }
 status(){return {activeRevision:this.activeRevision,canaryRevision:this.canary?.candidate.revision??null,canaryJobs:this.canary?.jobs.size??0,lastRollback:this.lastRollback};}
}
