import {readAdInput} from './ad-input.ts';
import {aiDimensionRequested} from './ai-dimension-display.ts';
import {isTextExample,generationContext,textExampleGeometryError} from './generation-input.ts';
import {dimensionControlErrors} from './dimension-control.ts';
import {makeDimensionPlan} from './dimension-generation.ts';
import {validMillimeters} from './dimension-units.ts';
import {photoRole} from './photo-roles.ts';
import {dimensionAxes,isServiceCategory} from './product.ts';
import {getImageFormat} from './formats.ts';
import type {Project} from './model.ts';
import {parseCampaign} from './campaign.ts';
import {marketingPlanForProject} from './marketing-plan.ts';
import {assessReference,specificationContract} from './specification.ts';
import {conversationContract} from './conversation.ts';
import {creativeContract} from './creative.ts';
import {boxProjectionActive,boxProjectionError} from './box-projection.ts';
import {completeAdKey} from './complete-ad.ts';
export type GenerationMode = 'original' | 'creative';
export type GenerationSettings = {mode:GenerationMode;brief:string;inputMode?:'photo'|'text-example';photoMode?:GenerationMode;planarSourceHash?:string;dimensionVariant?:string;dimensionBased?:boolean;dimensionBasis?:'outer-body'|'inner-body'|'body'|'garment-flat'};
export const defaultGeneration = ():GenerationSettings => ({mode:'original',brief:''});
export function parseGeneration(value:unknown):GenerationSettings {
  if(value===undefined)return defaultGeneration();
  if(!value||typeof value!=='object')throw Error('이미지 제작 방식이 올바르지 않습니다.');
  const settings=value as GenerationSettings;
  if(!['original','creative'].includes(settings.mode)||typeof settings.brief!=='string'||settings.brief.length>600)throw Error('이미지 제작 방식과 요청 내용을 확인해주세요.');
  if(settings.inputMode==='text-example'&&settings.mode!=='creative'||settings.inputMode!==undefined&&!['photo','text-example'].includes(settings.inputMode)||settings.photoMode!==undefined&&!['original','creative'].includes(settings.photoMode))throw Error('상품 이미지 만들기 방식을 확인해주세요.');
  if(settings.dimensionVariant!==undefined&&(typeof settings.dimensionVariant!=='string'||settings.dimensionVariant.length>80))throw Error('규격 이름을 확인해주세요.');
  if(settings.dimensionBased!==undefined&&typeof settings.dimensionBased!=='boolean'||settings.dimensionBasis!==undefined&&!['outer-body','inner-body','body','garment-flat'].includes(settings.dimensionBasis))throw Error('규격 기반 생성 옵션을 확인해주세요.');
  if(settings.planarSourceHash!==undefined&&!/^[a-f0-9]{64}$/.test(settings.planarSourceHash))throw Error('평면 비례 적용 사진을 확인해주세요.');
  return {mode:settings.mode,brief:settings.brief,...(settings.inputMode?{inputMode:settings.inputMode}:{}),...(settings.photoMode?{photoMode:settings.photoMode}:{}),...(settings.dimensionBased?{dimensionBased:true,dimensionVariant:settings.dimensionVariant??'',dimensionBasis:settings.dimensionBasis??'outer-body',...(settings.planarSourceHash?{planarSourceHash:settings.planarSourceHash}:{})}:{})};
}
// Retire new size-driven reshaping without rewriting historical result keys or metadata.
export function withoutDimensionReshape(p:Project):Project {
 if(!p.generation.dimensionBased&&!p.generation.planarSourceHash)return p;
 const {dimensionBased,planarSourceHash,dimensionVariant,dimensionBasis,...generation}=p.generation;
 return {...p,generation};
}
export function photoGenerationDraft(p:Project):Project {
 p=withoutDimensionReshape(p);
 if(p.generation.mode==='creative'&&p.generation.inputMode!=='text-example'&&!p.generation.photoMode)return p;
 const {inputMode,photoMode,...generation}=p.generation;
 return {...p,generation:{...generation,mode:'creative'}};
}
export function newGenerationIssues(p:Project):string[]{
 p=photoGenerationDraft(p);
 return !p.product?['광고에 참고할 상품·공간 사진을 추가해주세요.']:generationIssues(p);
}
export function buildNewGenerationRequest(p:Project){
 p=photoGenerationDraft(p);const issues=newGenerationIssues(p);if(issues.length)throw Error(issues.join(' '));
 return buildGenerationRequest(p);
}
export function generationIssues(p:Project):string[] {
  const textError=textExampleGeometryError(p);if(textError)return [textError];
  if(isTextExample(p)&&(p.generation.mode!=='creative'||!p.productName.trim()||!p.productProfile.material.trim()))return ['설명 예시는 AI 새 광고 모드에서 상품명과 상세설명이 필요합니다.'];
  if(p.dimensionControl)return dimensionControlErrors(p);
  const creative=(p.generation??defaultGeneration()).mode==='creative';
  const axes=dimensionAxes(p.productProfile);const errors:string[]=[];
  if(p.generation.dimensionBased&&(p.generation.mode!=='creative'||!axes.length||!p.product||photoRole(p,p.product.sha256)!=='subject'||p.generation.dimensionBasis==='garment-flat'&&p.productProfile.specType!=='flat'))errors.push('규격 기반 생성은 실제 상품 사진과 치수 기준에 맞는 숫자 규격이 필요합니다.');
  if(p.generation.planarSourceHash&&(!p.generation.dimensionBased||p.generation.dimensionBasis&&p.generation.dimensionBasis!=='outer-body'||p.generation.mode!=='creative'||p.productProfile.specType!=='flat'||p.generation.planarSourceHash!==p.product?.sha256||photoRole(p,p.generation.planarSourceHash)!=='subject'))errors.push('평면 비례 자동 적용은 현재 실제 상품의 정면 사진과 가로·세로 규격을 확인한 경우에만 사용합니다.');
  if(aiDimensionRequested(p)&&(!creative||!p.dimensions.visible||!axes.length||!p.product||photoRole(p,p.product.sha256)!=='subject'||p.dimensionControl||p.generation.planarSourceHash||!p.campaign?.creative))errors.push('AI 자동 규격 표시는 실제 상품 사진·입력 규격과 AI 새 광고 모드가 필요합니다. 평면 형상 제어와 함께 사용하지 않습니다.');
  const projectionError=boxProjectionError(p);if(projectionError)errors.push(projectionError);
  const service=isServiceCategory(p.productProfile.category);
  if(!p.product&&!service&&!isTextExample(p))errors.push(creative?'참고할 상품 사진을 추가해주세요.':'원본 상품 사진을 추가해주세요.');
  if(!creative&&p.product&&photoRole(p,p.product.sha256)==='style')errors.push('실사 그대로 사용하려면 실제 상품·공간 사진을 대표로 지정해주세요.');
  if(creative&&!service&&!isTextExample(p)&&p.product&&[p.product,...p.references??[]].every(a=>photoRole(p,a.sha256)==='style'))errors.push('디자인 참고 외에 실제 상품 사진을 한 장 이상 추가해주세요.');
  if(creative&&service&&!p.product&&!p.generation.brief.trim()&&!p.campaign?.creative&&!p.conversation?.turns.some(t=>t.state==='recorded'))errors.push('사진 없이 만들 광고의 내용과 요청사항을 입력해주세요.');
  if(axes.some(axis=>!validMillimeters(p.dimensions[axis])))errors.push('생성에 참고할 규격은 0보다 크고 100,000 mm 이하로 입력해주세요.');
  const assessment=assessReference(generationContext(p));if(['mismatch','invalid'].includes(assessment.status))errors.push(assessment.message);
  return errors;
}
// Describes intent only. No network call, provider charge or generation occurs here.
// Future server adapters must resolve/verify uploaded assets and sign the price quote.
export function buildGenerationRequest(p:Project) {
  if(p.dimensionControl)throw Error('LOCAL_DIMENSION_CONTROL_ONLY');
  const generation=parseGeneration(p.generation);const issues=generationIssues(p);
  if(issues.length)throw Error(issues.join(' '));
  p=generationContext(p);
  const input=readAdInput(p);
  const creative=generation.mode==='creative';
  const service=isServiceCategory(p.productProfile.category);
  const format=getImageFormat(p.format);
  const campaign=parseCampaign(p.campaign),marketingPlan=marketingPlanForProject(p);
  const direction=conversationContract(p),appearanceEdit=direction.productPolicy.maskRequired;
  if(direction.pendingQuickEditIds.length)throw Error('대화의 빠른 편집 변경안을 적용하거나 제외한 뒤 생성 요청을 준비해주세요.');
  if(appearanceEdit&&!p.product)throw Error('상품 인쇄·색상을 수정하려면 실제 상품 사진을 추가해주세요.');
  const specifications=dimensionAxes(p.productProfile).map(axis=>({axis:axis==='width'&&p.productProfile.specType==='cylindrical'?'diameter':axis,value:p.dimensions[axis],unit:'mm'}));
  return {
    ...(generation.dimensionBased?{dimensionPlan:makeDimensionPlan({sourceHash:p.product!.sha256,variantLabel:generation.dimensionVariant,basis:generation.dimensionBasis,specType:p.productProfile.specType,specifications})}:{}),
    ...(generation.planarSourceHash?{proportionControl:{kind:'flat-front-v1',confirmedSourceHash:generation.planarSourceHash,variantLabel:generation.dimensionVariant??''}}:{}),
    ...(isTextExample(p)?{inputMode:'text-example' as const}:{}),
    ...(aiDimensionRequested(p)?{dimensionDisplay:{version:1 as const,method:'ai' as const,layout:p.dimensionAnnotation!.mode as 'main'|'inset'}}:{}),
    version:1,mode:generation.mode,operation:appearanceEdit?'image-region':creative?(service?'image-ad-creative':'image-product-concept'):(service?'compose-ad':'compose-original'),
    source:p.product?{sha256:p.product.sha256,role:appearanceEdit?'appearance-edit-reference':creative?'visual-reference':service?'protected-visual':'protected-product',purpose:photoRole(p,p.product.sha256)}:null,
    references:(p.references??[]).map(a=>({sha256:a.sha256,role:'additional-product-reference',purpose:photoRole(p,a.sha256)})),
    preserveProduct:!creative&&!appearanceEdit&&!!p.product,brief:creative?generation.brief:'',direction,
    requestedEditOperation:appearanceEdit?'masked-product-appearance-edit':direction.instructions.length?'creative-direction':'none',
    productName:input.facts.productName,productProfile:input.facts.profile,
    scene:{backgroundColor:p.background.color,backgroundImageHash:p.background.image?.sha256??null,ink:p.ink,productScale:p.scale},
    subjectType:service?'service':'physical-product',copy:input.text.requestedCopy,
    campaign,creativeDirection:p.campaign?.creative?creativeContract(p):null,attributes:[...(p.productProfile.material?[{name:service?'서비스 내용':'소재',value:p.productProfile.material}]:[]),...campaign.attributes],
    marketingPlan,target:{...marketingPlan.target,method:marketingPlan.method},contentType:campaign.contentType,specificationContract:specificationContract(p),
    specifications:dimensionAxes(p.productProfile).map(axis=>({axis:axis==='width'&&p.productProfile.specType==='cylindrical'?'diameter':axis,value:p.dimensions[axis],unit:'mm'})),
    output:{format:p.format,width:format.width,height:format.height,locale:input.text.locale,displayUnit:p.dimensions.displayUnit??'mm',compositionKey:completeAdKey(p),showDimensions:(aiDimensionRequested(p)||!p.dimensionAnnotation||p.dimensionAnnotation.mode==='none')&&p.dimensions.visible&&dimensionAxes(p.productProfile).length>0,showDimensionLines:p.dimensions.visible&&(aiDimensionRequested(p)||p.dimensions.lines)&&dimensionAxes(p.productProfile).length>0},
    claims:{sameProduct:!creative&&!appearanceEdit&&!service&&!!p.product&&!boxProjectionActive(p),exactGeometry:false},
  };
}

