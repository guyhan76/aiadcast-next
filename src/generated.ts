import {aiDimensionRequested,projectAiDimensionKey,parseAiDimensionDisplay,validAiDimensionReview,type AiDimensionDisplay,type AiDimensionReview} from './ai-dimension-display.ts';
import {isTextExample,generationSourceHash} from './generation-input.ts';
import {parseDimensionPlan,type DimensionPlan} from './dimension-generation.ts';
import {parsePlanarReport,type PlanarReport} from './planar-proportion.ts';
import {parseMarketingPlan} from './marketing-plan.ts';
import type {MarketingPlan} from './marketing-plan.ts';
import {validMillimeters} from './dimension-units.ts';
import {dimensionAxes,parseProfile} from './product.ts';
import type {Asset,Project} from './model.ts';
import {creativeCopy,creativeSettings} from './creative.ts';
import {photoRole,stylePhotoHashes} from './photo-roles.ts';
import {industryDirections} from './industry.ts';
import {completeAdKey} from './complete-ad.ts';

export type GeneratedAsset = {
 acceptedAt?:string;
 dimensionDisplay?:AiDimensionDisplay;dimensionReview?:AiDimensionReview;inputMode?:'text-example';jobId:string;mode:'original'|'creative';sourceHash:string|null;asset:Asset;
 role:'background'|'creative';model:string;createdAt:string;specificationKey:string;marketingPlan?:MarketingPlan;
 composition?:'complete-ad'|'photo-plate';compositionKey?:string;dimensionPlan?:DimensionPlan;planarReport?:PlanarReport;planarOriginal?:Asset;
};

// This is a local reuse key, not proof of provider origin or payment acceptance.
// Keep editable copy, aspect ratio, label visibility, anchors and brief out of it.
export function generatedCompatibilityKey(p:Project):string {
 return JSON.stringify({
  ...(aiDimensionRequested(p)?{aiDimensionInputKey:projectAiDimensionKey(p)}:{}),sourceHash:generationSourceHash(p),...(isTextExample(p)?{inputMode:'text-example'}:{}),
  ...(p.generation.dimensionBased?{dimensionBased:true,dimensionVariant:p.generation.dimensionVariant??'',dimensionBasis:p.generation.dimensionBasis??'outer-body'}:{}),
  ...(p.generation.planarSourceHash?{planarSourceHash:p.generation.planarSourceHash,dimensionVariant:p.generation.dimensionVariant??''}:{}),
  ...(!isTextExample(p)&&p.references?.length?{referenceHashes:p.references.map(a=>a.sha256)}:{}),
  ...(!isTextExample(p)&&stylePhotoHashes(p).length?{stylePhotoHashes:stylePhotoHashes(p)}:{}),
  mode:p.generation.mode,
  productProfile:{category:p.productProfile.category,specType:p.productProfile.specType,material:p.productProfile.material},
  specifications:dimensionAxes(p.productProfile).map(axis=>({axis,value:p.dimensions[axis],unit:'mm'})),
 });
}
export function hasUsableCreative(p:Project):boolean {
 const result=p.generated;
 return !!result&&result.inputMode===(isTextExample(p)?'text-example':undefined)&&p.generation.mode==='creative'&&result.mode==='creative'&&result.role==='creative'
  &&result.sourceHash===generationSourceHash(p)&&result.specificationKey===generatedCompatibilityKey(p)
  &&!!result.asset&&(result.composition!=='complete-ad'||result.compositionKey===completeAdKey(p));
}
export function visualAsset(p:Project):Asset|null {
 return hasUsableCreative(p)?p.generated!.asset:isTextExample(p)?null:p.product;
}
export function hasUsableOriginal(p:Project):boolean{
 const result=p.generated;
 return !!result&&p.generation.mode==='original'&&result.mode==='original'&&result.role==='background'
  &&(!p.product||photoRole(p,p.product.sha256)==='subject')
  &&result.sourceHash===generationSourceHash(p)&&result.specificationKey===generatedCompatibilityKey(p)
  &&p.background.image?.sha256===result.asset.sha256;
}

// A temporary complete ad for review and the accepted project use exactly the same composition.
// This does not persist or charge a provider result, and never replaces source bytes.
export function projectWithGenerated(p:Project,result:GeneratedAsset):Project {
 if(aiDimensionRequested(p)?result.dimensionDisplay?.inputKey!==projectAiDimensionKey(p):!!result.dimensionDisplay)throw Error('STALE_PROJECT');
 if(result.inputMode!==(isTextExample(p)?'text-example':undefined))throw Error('STALE_PROJECT');
 if(result.sourceHash!==generationSourceHash(p)||result.mode!==p.generation.mode
  ||result.specificationKey!==generatedCompatibilityKey(p)||result.role!==(result.mode==='original'?'background':'creative'))throw Error('STALE_PROJECT');
 if(result.composition==='complete-ad'){
  if(result.compositionKey!==completeAdKey(p))throw Error('STALE_AD_COPY');
  return {...p,generated:result,...(p.proportionViews&&p.generated?.asset.sha256!==result.asset.sha256?{proportionViews:{...p.proportionViews,resultView:'unconfirmed' as const}}:{})};
 }
 const copy=p.copy[p.locale],proposed=creativeCopy(p);
 // Repair the old >80-character fallback, but retain individually edited advertising copy.
 const legacyFallback=p.productProfile.material.trim().length>80&&industryDirections(p.productProfile.category).some(d=>d.description===copy.description.trim());
 const repair=!copy.description.trim()||legacyFallback;
 const completedCopy=creativeSettings(p).copyMode==='manual'?copy:{...copy,...(!copy.title.trim()?{title:proposed.title}:{}),...(repair?{description:proposed.description,...(copy.title===p.productName?{title:proposed.title}:{})}:{})};
 return {...p,copy:{...p.copy,[p.locale]:completedCopy},
  ...(p.proportionViews&&p.generated?.asset.sha256!==result.asset.sha256?{proportionViews:{...p.proportionViews,resultView:'unconfirmed' as const}}:{}),
  generated:result,background:result.role==='background'?{...p.background,image:result.asset}:p.background};
}

function metadataString(value:unknown,max:number):string {
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f]/.test(value))throw Error('생성 결과 정보를 확인해주세요.');
 return value;
}
function validHash(value:unknown):value is string|null {return value===null||(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value));}
export async function parseGenerated(value:unknown,readAsset:(value:unknown)=>Promise<Asset|null>):Promise<GeneratedAsset|undefined> {
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('생성 결과 형식이 올바르지 않습니다.');
 const r=value as GeneratedAsset;
 const jobId=metadataString(r.jobId,128),model=metadataString(r.model,160),createdAt=metadataString(r.createdAt,40),specificationKey=metadataString(r.specificationKey,4096);
 if(!/^[A-Za-z0-9_-]+$/.test(jobId)||!/^[A-Za-z0-9._:/-]+$/.test(model)||!['original','creative'].includes(r.mode)||!validHash(r.sourceHash)
  ||r.role!==(r.mode==='original'?'background':'creative')||!Number.isFinite(Date.parse(createdAt))||new Date(createdAt).toISOString()!==createdAt)throw Error('생성 결과의 제작 정보가 올바르지 않습니다.');
 // Reject malformed metadata before decoding any imported data URL.
 if(r.composition!==undefined&&!['complete-ad','photo-plate'].includes(r.composition))throw Error('생성 결과의 광고 형식을 확인해주세요.');
 let compositionKey:string|undefined;
 if(r.composition==='complete-ad'){
  if(r.mode!=='creative')throw Error('생성 결과의 광고 형식을 확인해주세요.');
  compositionKey=metadataString(r.compositionKey,8192);
  let snapshot:unknown;try{snapshot=JSON.parse(compositionKey);}catch{throw Error('생성 결과의 문구 정보를 확인해주세요.');}
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw Error('생성 결과의 문구 정보를 확인해주세요.');
 }
 let key:unknown;try{key=JSON.parse(specificationKey);}catch{throw Error('생성 결과의 규격 정보를 확인해주세요.');}
 if(!key||typeof key!=='object'||Array.isArray(key))throw Error('생성 결과의 규격 정보를 확인해주세요.');
 const details=key as {sourceHash:unknown;mode:unknown;productProfile:unknown;specifications:unknown;planarSourceHash?:unknown;dimensionVariant?:unknown;dimensionBased?:unknown;dimensionBasis?:unknown;inputMode?:unknown};
 if(r.inputMode!==undefined&&r.inputMode!=='text-example'||details.inputMode!==r.inputMode||r.inputMode==='text-example'&&(r.sourceHash!==null||r.mode!=='creative'||r.composition!=='complete-ad'))throw Error('생성 예시 정보를 확인해주세요.');
 if(details.sourceHash!==r.sourceHash||details.mode!==r.mode||!Array.isArray(details.specifications))throw Error('생성 결과의 원본·규격 정보가 일치하지 않습니다.');
 if(!details.productProfile||typeof details.productProfile!=='object'||Array.isArray(details.productProfile))throw Error('생성 결과의 상품 정보를 확인해주세요.');
 const profile=parseProfile(details.productProfile),axes=dimensionAxes(profile);
 if(details.specifications.length!==axes.length||details.specifications.some((entry,index)=>!entry||typeof entry!=='object'||entry.axis!==axes[index]||entry.unit!=='mm'||typeof entry.value!=='string'||!validMillimeters(entry.value)))throw Error('생성 결과의 규격 정보를 확인해주세요.');
 const marketingPlan=parseMarketingPlan(r.marketingPlan);
 if(marketingPlan&&(marketingPlan.input.sourceHash!==r.sourceHash||marketingPlan.input.mode!==r.mode))throw Error('생성 결과의 광고 기획과 원본 정보가 일치하지 않습니다.');
 const dimensionPlan=parseDimensionPlan(r.dimensionPlan);
 if(details.dimensionBased===true&&!dimensionPlan)throw Error('INVALID_DIMENSION_PLAN');
 if(dimensionPlan&&(dimensionPlan.sourceHash!==r.sourceHash||details.dimensionBased!==true||dimensionPlan.variantLabel!==details.dimensionVariant||dimensionPlan.basis!==details.dimensionBasis||dimensionPlan.specType!==(details.productProfile as {specType:string}).specType||dimensionPlan.measurements.length!==(details.specifications as unknown[]).length||dimensionPlan.measurements.some((m,i)=>{const spec=(details.specifications as {axis:string;value:string;unit:string}[])[i];return m.value!==spec?.value||m.axis!==(profile.specType==='cylindrical'&&spec?.axis==='width'?'diameter':spec?.axis)||m.unit!==spec?.unit;})))throw Error('INVALID_DIMENSION_PLAN');
 const planarReport=parsePlanarReport(r.planarReport),planarOriginal=r.planarOriginal?await readAsset(r.planarOriginal):undefined;
 if(details.planarSourceHash&&!planarReport||planarOriginal&&!planarReport)throw Error('INVALID_PLANAR_REPORT');
 if(planarReport&&(details.planarSourceHash!==r.sourceHash||details.dimensionVariant!==(planarReport.variantLabel??'')))throw Error('INVALID_PLANAR_REPORT');
 if(planarReport&&(!planarOriginal||planarOriginal.sha256!==planarReport.originalHash))throw Error('INVALID_PLANAR_REPORT');
 const dimensionDisplay=await parseAiDimensionDisplay(r.dimensionDisplay);if(dimensionDisplay&&(!('aiDimensionInputKey' in details)||details.aiDimensionInputKey!==dimensionDisplay.inputKey||r.composition!=='complete-ad'))throw Error('INVALID_AI_DIMENSION_DISPLAY');if('aiDimensionInputKey' in details&&!dimensionDisplay)throw Error('INVALID_AI_DIMENSION_DISPLAY');
 const asset=await readAsset(r.asset);
 if(!asset)throw Error('생성 결과 이미지가 누락되었습니다.');
 if(r.dimensionReview&&(!dimensionDisplay||!validAiDimensionReview(r.dimensionReview,dimensionDisplay,asset.sha256)))throw Error('INVALID_AI_DIMENSION_REVIEW');
 if(planarReport?.outputRatio&&Math.abs(asset.width/asset.height-planarReport.outputRatio)>1e-9)throw Error('INVALID_PLANAR_REPORT');
 if(r.acceptedAt!==undefined&&(!Number.isFinite(Date.parse(r.acceptedAt))||new Date(r.acceptedAt).toISOString()!==r.acceptedAt))throw Error('INVALID_ACCEPTANCE');
 return {...(r.acceptedAt?{acceptedAt:r.acceptedAt}:{}),...(dimensionDisplay?{dimensionDisplay}:{}),...(r.dimensionReview?{dimensionReview:r.dimensionReview}:{}),...(r.inputMode?{inputMode:r.inputMode}:{}),...(dimensionPlan?{dimensionPlan}:{}),...(planarReport?{planarReport,planarOriginal:planarOriginal!}:{}),jobId,mode:r.mode,sourceHash:r.sourceHash,asset,role:r.role,model,createdAt,specificationKey,...(marketingPlan?{marketingPlan}:{}),...(r.composition?{composition:r.composition}:{}),...(compositionKey?{compositionKey}:{})};
}


// Legacy versions persisted generated metadata only after successful acceptance.
// Keep those complete saved records visible without treating an input draft,
// pending request ID or thumbnail as acceptance. Current acceptance is explicit.
export function hasSavedAcceptedAd(p:Project):boolean {
 const g=p.generated;
 return !!g&&typeof g.jobId==='string'&&g.jobId.length>0&&typeof g.specificationKey==='string'&&g.specificationKey.length>0&&Number.isFinite(Date.parse(g.createdAt))&&!!g.asset&&/^[a-f0-9]{64}$/.test(g.asset.sha256)&&g.asset.width>0&&g.asset.height>0&&(g.mode==='creative'&&g.role==='creative'||g.mode==='original'&&g.role==='background')&&(g.acceptedAt===undefined||Number.isFinite(Date.parse(g.acceptedAt)));
}
