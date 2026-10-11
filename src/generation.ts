import {validMillimeters} from './dimension-units.ts';
import {dimensionAxes,isServiceCategory} from './product.ts';
import {getImageFormat} from './formats.ts';
import type {Project} from './model.ts';
import {campaignGuide,parseCampaign} from './campaign.ts';
import {assessReference,specificationContract} from './specification.ts';
import {conversationContract} from './conversation.ts';
import {creativeContract} from './creative.ts';
import {boxProjectionActive,boxProjectionError} from './box-projection.ts';
export type GenerationMode = 'original' | 'creative';
export type GenerationSettings = {mode:GenerationMode;brief:string};
export const defaultGeneration = ():GenerationSettings => ({mode:'original',brief:''});
export function parseGeneration(value:unknown):GenerationSettings {
  if(value===undefined)return defaultGeneration();
  if(!value||typeof value!=='object')throw Error('이미지 제작 방식이 올바르지 않습니다.');
  const settings=value as GenerationSettings;
  if(!['original','creative'].includes(settings.mode)||typeof settings.brief!=='string'||settings.brief.length>600)throw Error('이미지 제작 방식과 요청 내용을 확인해주세요.');
  return {mode:settings.mode,brief:settings.brief};
}
export function generationIssues(p:Project):string[] {
  const creative=(p.generation??defaultGeneration()).mode==='creative';
  const axes=dimensionAxes(p.productProfile);const errors:string[]=[];
  const projectionError=boxProjectionError(p);if(projectionError)errors.push(projectionError);
  const service=isServiceCategory(p.productProfile.category);
  if(!p.product&&!service)errors.push(creative?'참고할 상품 사진을 추가해주세요.':'원본 상품 사진을 추가해주세요.');
  if(creative&&service&&!p.product&&!p.generation.brief.trim()&&!p.campaign?.creative&&!p.conversation?.turns.some(t=>t.state==='recorded'))errors.push('사진 없이 만들 광고의 내용과 요청사항을 입력해주세요.');
  if(axes.some(axis=>!validMillimeters(p.dimensions[axis])))errors.push('생성에 참고할 규격은 0보다 크고 100,000 mm 이하로 입력해주세요.');
  const assessment=assessReference(p);if(['mismatch','invalid'].includes(assessment.status))errors.push(assessment.message);
  return errors;
}
// Describes intent only. No network call, provider charge or generation occurs here.
// Future server adapters must resolve/verify uploaded assets and sign the price quote.
export function buildGenerationRequest(p:Project) {
  const generation=parseGeneration(p.generation);const issues=generationIssues(p);
  if(issues.length)throw Error(issues.join(' '));
  const creative=generation.mode==='creative';
  const service=isServiceCategory(p.productProfile.category);
  const format=getImageFormat(p.format);
  const campaign=parseCampaign(p.campaign),guide=campaignGuide(p);
  const direction=conversationContract(p),appearanceEdit=direction.productPolicy.maskRequired;
  if(direction.pendingQuickEditIds.length)throw Error('대화의 빠른 편집 변경안을 적용하거나 제외한 뒤 생성 요청을 준비해주세요.');
  if(appearanceEdit&&!p.product)throw Error('상품 인쇄·색상을 수정하려면 실제 상품 사진을 추가해주세요.');
  return {
    version:1,mode:generation.mode,operation:appearanceEdit?'image-region':creative?(service?'image-ad-creative':'image-product-concept'):(service?'compose-ad':'compose-original'),
    source:p.product?{sha256:p.product.sha256,role:appearanceEdit?'appearance-edit-reference':creative?'visual-reference':service?'protected-visual':'protected-product'}:null,
    references:(p.references??[]).map(a=>({sha256:a.sha256,role:'additional-product-reference'})),
    preserveProduct:!creative&&!appearanceEdit&&!!p.product,brief:creative?generation.brief:'',direction,
    requestedEditOperation:appearanceEdit?'masked-product-appearance-edit':direction.instructions.length?'creative-direction':'none',
    productName:p.productName,productProfile:p.productProfile,
    scene:{backgroundColor:p.background.color,backgroundImageHash:p.background.image?.sha256??null,ink:p.ink,productScale:p.scale},
    subjectType:service?'service':'physical-product',copy:p.copy[p.locale],
    campaign,creativeDirection:p.campaign?.creative?creativeContract(p):null,attributes:[...(p.productProfile.material?[{name:service?'서비스 내용':'소재',value:p.productProfile.material}]:[]),...campaign.attributes],
    target:{label:guide.target,method:guide.method,reason:guide.reason},contentType:campaign.contentType,specificationContract:specificationContract(p),
    specifications:dimensionAxes(p.productProfile).map(axis=>({axis:axis==='width'&&p.productProfile.specType==='cylindrical'?'diameter':axis,value:p.dimensions[axis],unit:'mm'})),
    output:{format:p.format,width:format.width,height:format.height,locale:p.locale,showDimensions:p.dimensions.visible&&dimensionAxes(p.productProfile).length>0,showDimensionLines:p.dimensions.visible&&p.dimensions.lines&&dimensionAxes(p.productProfile).length>0},
    claims:{sameProduct:!creative&&!appearanceEdit&&!service&&!!p.product&&!boxProjectionActive(p),exactGeometry:false},
  };
}
