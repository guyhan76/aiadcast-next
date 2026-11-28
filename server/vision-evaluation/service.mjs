import {ApiFailure} from '../generation-service.mjs';
import {parseSourceAsset} from '../openai-image-adapter.mjs';
import {analyzeApprovedImage} from './analysis.mjs';
import {APPROVED_HASHES,APPROVED_REFERENCES} from './references.mjs';
import {validateProposal} from './overlay.mjs';
import {requestView} from './cloud-ledger.mjs';
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(id);
export function dimensionAnalysisService({apiKey,ledgerFactory,statusReader,gate=fn=>fn(),analyze=analyzeApprovedImage,approvedHashes=APPROVED_HASHES,references=APPROVED_REFERENCES,evaluationEnabled=false,limitCalls=10,limitMicros=300000}={}){
 let ledger;
 const allowed=user=>Boolean(evaluationEnabled&&apiKey&&ledgerFactory&&user?.role==='admin'&&Object.values(approvedHashes).some(Boolean));
 const admin=user=>{if(user?.role!=='admin')throw new ApiFailure('EVALUATION_ADMIN_ONLY',403);};
 return {
  // General-ad analysis remains OFF even after the reference manifest is bound.
  capability:()=>({available:false,scope:'approved-reference-evaluation',reason:'REFERENCE_EVALUATION_ONLY'}),
  async status(user,requestId){
   admin(user);if(requestId!==undefined&&!validId(requestId))throw new ApiFailure('INVALID_REQUEST_ID',400);
   const budget=statusReader?await statusReader(user.id,requestId):null;
   const available=allowed(user)&&!!budget&&!(budget.unresolvedCalls>0)&&budget.remainingCalls>0&&(budget.allowanceUsedMicros??0)+30000<=limitMicros;
   return {available,providerConfigured:Boolean(apiKey),generalAnalysisEnabled:false,limitCalls,limitMicros,perCallHoldMicros:30000,references:references.map(({name,bytes,sha256,dimensions,basis,label})=>({name,bytes,sha256,dimensions,basis,label})),budget};
  },
  async analyze(body,user){
   admin(user);if(!allowed(user))throw new ApiFailure('DIMENSION_ANALYSIS_DISABLED',409);
   if(!validId(body?.requestId))throw new ApiFailure('INVALID_REQUEST_ID',400);
   let source;try{source=await parseSourceAsset(body?.source);}catch{throw new ApiFailure('INVALID_SOURCE',400);}
   if(!source)throw new ApiFailure('INVALID_SOURCE',400);
   const target=Object.entries(approvedHashes).find(([,hash])=>hash===source.sha256)?.[0];
   const reference=references.find(r=>r.name===target);
   if(!target||reference&&reference.bytes!==source.bytes.length)throw new ApiFailure('IMAGE_OUTSIDE_ANALYSIS_APPROVAL',403);
   ledger??=Promise.resolve().then(ledgerFactory);const shared=await ledger;
   const recover=async()=>{const row=await shared.request(user.id,body.requestId);if(!row)return null;if(row.hash!==source.sha256)throw new ApiFailure('REQUEST_CONFLICT',409);return requestView(row,body.requestId);};
   const previous=await recover();if(previous)return previous;
   const bound={reserve:(t,h)=>shared.reserve(t,h,{id:body.requestId,actor:user.id}),settle:(...args)=>shared.settle(...args)};
   let result;
   try{result=await gate(()=>analyze({bytes:source.bytes,target,ledger:bound,apiKey}));}
   catch{const existing=await recover();if(existing)return existing;throw new ApiFailure('ANALYSIS_LIMIT_OR_RECONCILIATION',409);}
   let response={requestId:body.requestId,state:'failed',sourceHash:source.sha256,verified:false,reason:'LOCATION_UNCERTAIN'};
   if(result?.proposal){try{const p=validateProposal(result.proposal);response={requestId:body.requestId,state:'ready',sourceHash:source.sha256,verified:false,proposal:{located:true,product:p.product,axes:{width:p.axes.width,depth:p.axes.depth,height:p.axes.height},protectedText:p.protectedText,existingAnnotations:p.existingAnnotations,inset:p.inset}};}catch{}}
   if(result?.reason==='ANALYSIS_UNCERTAIN')response.reason='COST_RECONCILIATION_REQUIRED';
   await shared.finish(user.id,body.requestId,response);return response;
  },
  async close(){if(ledger){const l=await ledger;await l.close?.();}},
 };
}
