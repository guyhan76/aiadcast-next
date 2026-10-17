import {ApiFailure} from '../generation-service.mjs';
import {parseSourceAsset} from '../openai-image-adapter.mjs';
import {APPROVED_HASHES,analyzeApprovedImage} from './analysis.mjs';
import {validateProposal} from './overlay.mjs';

// Current approval is exclusively the two attached reference ads. There is no
// generic paid-operation flag and client-supplied hashes cannot extend approval.
export function dimensionAnalysisService({apiKey,ledgerFactory,gate=fn=>fn(),analyze=analyzeApprovedImage,approvedHashes=APPROVED_HASHES}={}){
 let ledger;
 const capability=user=>({available:Boolean(apiKey&&ledgerFactory&&user?.role==='admin'&&Object.values(approvedHashes).some(Boolean)),scope:'approved-reference-evaluation',reason:!Object.values(approvedHashes).some(Boolean)?'REFERENCES_NOT_VERIFIED':user?.role!=='admin'?'EVALUATION_ADMIN_ONLY':!apiKey?'PROVIDER_NOT_CONFIGURED':!ledgerFactory?'LEDGER_UNAVAILABLE':null});
 return {
  capability,
  async analyze(body,user){
   if(user?.role!=='admin')throw new ApiFailure('EVALUATION_ADMIN_ONLY',403);
   if(!capability(user).available)throw new ApiFailure('DIMENSION_ANALYSIS_DISABLED',409);
   let source;try{source=await parseSourceAsset(body?.source);}catch{throw new ApiFailure('INVALID_SOURCE',400);}
   if(!source)throw new ApiFailure('INVALID_SOURCE',400);
   const target=Object.entries(approvedHashes).find(([,hash])=>hash===source.sha256)?.[0];
   if(!target)throw new ApiFailure('IMAGE_OUTSIDE_ANALYSIS_APPROVAL',403);
   ledger??=Promise.resolve().then(ledgerFactory);
   const shared=await ledger;
   let result;
   try{result=await gate(()=>analyze({bytes:source.bytes,target,ledger:shared,apiKey}));}
   catch{throw new ApiFailure('ANALYSIS_LIMIT_OR_RECONCILIATION',409);}
   if(!result?.proposal)throw new ApiFailure('DIMENSION_ANALYSIS_UNAVAILABLE',409);
   try{validateProposal(result.proposal);}catch{throw new ApiFailure('DIMENSION_LOCATION_UNCERTAIN',409);}
   return {sourceHash:source.sha256,proposal:result.proposal,verified:false,scope:'approved-reference-evaluation'};
  },
  async close(){if(ledger){const l=await ledger;await l.close?.();}},
 };
}
