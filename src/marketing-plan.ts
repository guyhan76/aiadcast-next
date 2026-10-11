import {industryAudience,industryGroupFor,industryLabel,resolveIndustryCategory} from './industry.ts';
import {dimensionAxes,isServiceCategory} from './product.ts';
import type {Project} from './model.ts';
import {uiEnglish} from './ui-translations.ts';

export const SEARCH_PHRASE_COUNT=6;
export const marketingChannels=['instagram','blog','shortform','website','lookbook'] as const;
export type MarketingChannel=typeof marketingChannels[number];
export type MarketingInput={
 name:string;category:string;subjectType:'physical-product'|'service';locale:'ko'|'en';
 mode:'original'|'creative';sourceHash:string|null;brand:string;goal:string;contentType:'card'|'poster';
 attributes:{name:string;value:string}[];
 specifications:{axis:string;value:string;unit:'mm'}[];
};
export type MarketingPlan={
 version:1;method:'category-spec-rules-v2';input:MarketingInput;
 target:{label:string;segment:'procurement'|'spec-fit'|'general';reason:string};
 intent:string;channels:MarketingChannel[];keywords:string[];keywordCount:6;
 normalizedRatios:{axis:string;ratio:number}[];geometryVerified:false;
};
const phraseKey=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
function uniquePhrases(values:string[]){
 const seen=new Set<string>();
 return values.map(v=>v.trim()).filter(v=>{
  const key=phraseKey(v);
  if(!key||v.length>80||/[\n\r@<>]|https?:|www\.|\d{2,4}[- ]\d{3,4}[- ]\d{4}/i.test(v)||seen.has(key))return false;
  seen.add(key);return true;
 });
}
// Shared by the browser and server. Recommendations are disclosed rules, not market research.
export function createMarketingPlan(raw:MarketingInput):MarketingPlan{
 const input:MarketingInput={name:raw.name,category:raw.category,subjectType:raw.subjectType,locale:raw.locale,mode:raw.mode,sourceHash:raw.sourceHash,brand:raw.brand,goal:raw.goal,contentType:raw.contentType,attributes:raw.attributes.map(({name,value})=>({name,value})),specifications:raw.specifications.map(({axis,value,unit})=>({axis,value,unit}))};
 const ko=input.locale==='ko',t=(a:string,b:string)=>ko?a:b;
 const category=resolveIndustryCategory(input.category)??'other',group=industryGroupFor(category).id;
 const label=ko?industryLabel(category):(uiEnglish[industryLabel(category)]??'Products');
 const service=input.subjectType==='service';
 if(service)input.specifications=[];
 const specs=input.specifications;
 const values=Object.fromEntries(specs.map(s=>[s.axis,Number(s.value)]));
 const volume=['width','depth','height'].every(a=>values[a]>0)?values.width*values.depth*values.height/1e6:null;
 const quantityValue=input.attributes.find(a=>/^(수량|quantity)$/i.test(a.name))?.value??'';
 const quantity=/^\d+(?:\.\d+)?$/.test(quantityValue)?Number(quantityValue):0;
 const wholesale=group==='industrial'||(group==='packaging'&&volume!==null&&volume>=20&&quantity>=100);
 const segment:MarketingPlan['target']['segment']=wholesale?'procurement':!service&&specs.length?'spec-fit':'general';
 const dimensions=specs.map(s=>`${({width:t('가로','width'),depth:t('세로','depth'),height:t('높이','height'),diameter:t('지름','diameter')} as Record<string,string>)[s.axis]} ${s.value} mm`).join(' · ');
 const base=ko?industryAudience(category):`Customers considering ${label.toLowerCase()}`;
 const target={segment,label:wholesale?t('구매·유통 담당자','Purchasing and distribution teams'):segment==='spec-fit'?`${base} — ${dimensions}${t(' 조건을 확인하는 고객',' fit requirements')}`:base,
  reason:wholesale?(group==='industrial'?t('산업재 분류에 따른 초기 제안입니다.','Initial suggestion based on the industrial category.'):t('포장재 분류, 입력 부피 20 L 이상과 수량 100 이상을 기준으로 제안했습니다.','Suggested for packaging with a supplied volume of at least 20 L and quantity of at least 100.')):segment==='spec-fit'?t('상품 분류와 입력 규격을 함께 사용해 크기 조건을 비교하는 고객으로 좁혔습니다. 실측·수요 조사 결과는 아닙니다.','Category and supplied dimensions identify customers comparing fit requirements; this is not a measurement or demand survey.'):service?t('서비스 업종과 광고 목적을 기준으로 제안했습니다.','Suggested from the service category and campaign goal.'):t('규격이 없어 상품 분류를 기준으로 제안했습니다.','No dimensions supplied; the suggestion uses the product category.')};
 let channels:MarketingChannel[];
 if(wholesale||['packaging','industrial','business'].includes(group))channels=['website','blog'];
 else if(group==='fashion')channels=['instagram','lookbook'];
 else if(input.goal==='inquiry'||['learning','health','finance','property','mobility'].includes(group))channels=['blog','website'];
 else if(segment==='spec-fit')channels=['website','instagram'];
 else channels=['instagram','shortform'];
 const places=input.attributes.filter(a=>/^(지역|제공 지역|서비스 지역|도시|location|city|service area)$/i.test(a.name)).map(a=>a.value);
 const material=input.attributes.filter(a=>/^(소재|재질|material)$/i.test(a.name)&&a.value.length<=24).map(a=>a.value);
 const keywords=uniquePhrases([input.name,input.brand,label,...places.map(p=>`${p} ${label}`),...material.map(m=>`${m} ${label}`),
  ...t('소개,선택 가이드,상세 정보,이용 안내,비교 기준,문의 안내,종류,특징','overview,selection guide,details,guide,comparison,inquiries,types,features').split(',').map(s=>`${label} ${s}`)]).slice(0,SEARCH_PHRASE_COUNT);
 const goal=input.goal==='inquiry'?t('문의·상담에 필요한 정보','information for an inquiry'):input.goal==='launch'?t('새 상품·서비스의 소개','a new offer'):t('상품·브랜드의 특징','product and brand details');
 const intent=t(`${input.name||label}의 ${goal}를 ${target.label}에게 전하는 ${input.contentType==='card'?'카드형 광고 1장':'포스터'} 기획입니다.`, `A ${input.contentType==='card'?'single card ad':'poster'} for ${input.name||label}, presenting ${goal} to ${target.label}.`)+
  (input.mode==='original'?t(' 원본 사진을 유지하고 배경을 생성합니다.',' The original photo is retained with a generated backdrop.'):t(' 사진과 입력 정보를 함께 참고해 장면·조명·소재 표현을 연출합니다.',' References and supplied details guide the scene, lighting and material treatment.'));
 const maximum=Math.max(0,...specs.map(s=>Number(s.value)));
 return {version:1,method:'category-spec-rules-v2',input,target,intent,channels,keywords,keywordCount:6,normalizedRatios:specs.map(s=>({axis:s.axis,ratio:Number(s.value)/maximum})),geometryVerified:false};
}
export function marketingPlanForProject(p:Project):MarketingPlan{
 return createMarketingPlan({name:p.productName,category:p.productProfile.category,subjectType:isServiceCategory(p.productProfile.category)?'service':'physical-product',locale:p.locale,mode:p.generation.mode,sourceHash:p.product?.sha256??null,brand:p.copy[p.locale].company,goal:p.campaign?.goal??'awareness',contentType:p.campaign?.contentType??'poster',
  attributes:[...(p.productProfile.material?[{name:'소재',value:p.productProfile.material}]:[]),...(p.campaign?.attributes??[])],
  specifications:dimensionAxes(p.productProfile).filter(a=>Number(p.dimensions[a])>0&&Number(p.dimensions[a])<=100000).map(a=>({axis:a==='width'&&p.productProfile.specType==='cylindrical'?'diameter':a,value:p.dimensions[a],unit:'mm'}))});
}
// Imported metadata is bounded and recomputed from its snapshot, never trusted as executable instructions.
export function parseMarketingPlan(raw:unknown):MarketingPlan|undefined{
 if(raw===undefined)return undefined;
 const p=raw as MarketingPlan,i=p?.input;
 const str=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v);
 if(!p||p.version!==1||p.method!=='category-spec-rules-v2'||!i||!str(i.name,100)||!str(i.category,80)||!str(i.brand,3000)||!['ko','en'].includes(i.locale)||!['original','creative'].includes(i.mode)||!['physical-product','service'].includes(i.subjectType)||!['awareness','launch','inquiry'].includes(i.goal)||!['card','poster'].includes(i.contentType)||(i.sourceHash!==null&&!/^[a-f0-9]{64}$/.test(i.sourceHash))||!Array.isArray(i.attributes)||i.attributes.length>9||i.attributes.some(a=>!a||!str(a.name,40)||!str(a.value,2000))||!Array.isArray(i.specifications)||i.specifications.length>3||i.specifications.some(s=>!s||!['width','depth','height','diameter'].includes(s.axis)||s.unit!=='mm'||!str(s.value,20)||!/^\d+(\.\d{1,8})?$/.test(s.value)||!(Number(s.value)>0&&Number(s.value)<=100000))||new Set(i.specifications.map(s=>s.axis)).size!==i.specifications.length)throw Error('광고 기획 저장 정보를 확인해주세요.');
 return createMarketingPlan(i);
}
