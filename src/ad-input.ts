import type {Project} from './model.ts';
import {publicAdCopy} from './complete-ad.ts';
import {dimensionAxes} from './product.ts';
import {photoRole} from './photo-roles.ts';

// Read-only snapshot of user input, not verified product truth or new persisted schema.
// Original image bytes stay in Project; roles distinguish subject evidence from style references.
export function readAdInput(p:Project){
 return structuredClone({
  mediaType:'image' as const,
  facts:{productName:p.productName,profile:p.productProfile,specifications:dimensionAxes(p.productProfile).map(axis=>({axis,value:p.dimensions[axis],unit:'mm' as const})),attributes:p.campaign?.attributes??[],photos:[...(p.product?[p.product]:[]),...(p.references??[])].map(a=>({sha256:a.sha256,name:a.name,width:a.width,height:a.height,purpose:photoRole(p,a.sha256)}))},
  text:{locale:p.locale,requestedCopy:publicAdCopy(p),copyMode:p.campaign?.creative?.copyMode??'manual'},
  direction:{brief:p.generation.brief,creative:p.campaign?.creative??null,conversation:p.conversation??null},
 });
}
// Requested copy is a contract, not evidence that generated pixels reproduce it.
export function readImageResultBoundary(p:Project){
 return {mediaType:'image' as const,requestedText:readAdInput(p).text,visual:p.generated?{jobId:p.generated.jobId,sha256:p.generated.asset.sha256,composition:p.generated.composition??null,acceptedAt:p.generated.acceptedAt??null}:null,textAccuracy:'human-review-required' as const};
}
