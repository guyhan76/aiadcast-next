import {projectGeometryKey} from './dimension-geometry.ts';
import {aiDimensionRequested,projectAiDimensionKey} from './ai-dimension-display.ts';
import type {Project} from './model.ts';
import {dimensionAxes,specSummary} from './product.ts';
import {getImageFormat} from './formats.ts';

// A finished image contains its typography. This snapshot is a local reuse guard,
// not an attestation of the model's facts, geometry, provenance or billing.
export function publicAdCopy(p:Project){
 const copy=p.copy[p.locale];
 const shown=(key:'company'|'contact'|'email'|'website')=>(p.footer?.[key]??true)?copy[key]??'':'';
 return {title:copy.title,description:copy.description,company:shown('company'),contact:shown('contact'),email:shown('email'),website:shown('website'),
  dimensionText:p.dimensions.visible&&dimensionAxes(p.productProfile).length?specSummary(p.dimensions,p.productProfile):''};
}
export function completeAdKey(p:Project):string {
 return JSON.stringify({...(projectGeometryKey(p)?{dimensionGeometry:projectGeometryKey(p)}:{}),...(aiDimensionRequested(p)?{aiDimensionInputKey:projectAiDimensionKey(p)}:{}),locale:p.locale,productName:p.productName,copy:publicAdCopy(p),attributes:p.campaign?.attributes??[],...(p.campaign?.creative?.copyMode?{copyMode:p.campaign.creative.copyMode}:{}),dimensionLines:p.dimensions.visible&&dimensionAxes(p.productProfile).length>0&&p.dimensions.lines});
}
export function hasCompleteAd(p:Project):boolean {
 return p.generation.mode==='creative'&&p.generated?.composition==='complete-ad'&&p.generated.role==='creative';
}
// Uniform contain: a different export ratio adds margins, never crops or stretches
// the finished ad, and never sends another paid provider request.
export function completeAdPlacement(p:Project){
 const {width,height}=getImageFormat(p.format),asset=p.generated!.asset;
 const scale=Math.min(width/asset.width,height/asset.height),w=asset.width*scale,h=asset.height*scale;
 return {width,height,x:(width-w)/2,y:(height-h)/2,w,h};
}
