import type {Project} from './model.ts';
import {parseCreative} from './creative.ts';
import type {CreativeSettings} from './creative.ts';
import {industryAudience} from './industry.ts';
import {dimensionAxes,productCategories,isServiceCategory} from './product.ts';
export type Campaign = {goal:'awareness'|'launch'|'inquiry';contentType:'card'|'poster';tone:'minimal'|'warm'|'bold';attributes:{name:string;value:string}[];creative?:CreativeSettings};
export const defaultCampaign=():Campaign=>({goal:'awareness',contentType:'poster',tone:'minimal',attributes:[]});
export function parseCampaign(raw:unknown):Campaign {
 if(raw===undefined)return defaultCampaign();
 const c=raw as Campaign;
 if(!c||!['awareness','launch','inquiry'].includes(c.goal)||!['card','poster'].includes(c.contentType)||!['minimal','warm','bold'].includes(c.tone)||!Array.isArray(c.attributes)||c.attributes.length>8)throw Error('광고 기획 정보를 확인해주세요.');
 const attributes=c.attributes.map(a=>{if(!a||typeof a.name!=='string'||typeof a.value!=='string'||!a.name.trim()||!a.value.trim()||a.name.length>40||a.value.length>160)throw Error('추가 속성의 항목명과 값을 확인해주세요.');return {name:a.name.trim(),value:a.value.trim()};});
 if(new Set(attributes.map(a=>a.name.toLowerCase())).size!==attributes.length)throw Error('추가 속성의 항목명이 중복되었습니다.');
 return {goal:c.goal,contentType:c.contentType,tone:c.tone,attributes,...(c.creative===undefined?{}:{creative:parseCreative(c.creative)})};
}
// Explainable first-pass suggestions, not AI inference or conversion predictions.
export function campaignGuide(p:Project){
 const campaign=p.campaign??defaultCampaign(),category=p.productProfile.category;
 const label=productCategories.find(([id])=>id===category)?.[1]??'상품';
 const axes=dimensionAxes(p.productProfile);
 const valid=axes.every(a=>Number(p.dimensions[a])>0&&Number.isFinite(Number(p.dimensions[a])));
 const volume=axes.length===3&&valid?Number(p.dimensions.width)*Number(p.dimensions.depth)*Number(p.dimensions.height)/1e6:null;
 const quantity=Number(campaign.attributes.find(a=>['수량','quantity'].includes(a.name.toLowerCase()))?.value);
 const wholesale=category==='industrial'||(category==='packaging'&&volume!==null&&volume>=20&&quantity>=100);
 const target=wholesale?'구매·유통 담당자':industryAudience(category);
 const reason=wholesale?(category==='industrial'?'산업용 상품 분류를 기준으로 제안했습니다.':'입력 부피 20 L 이상·수량 100 이상을 기준으로 제안했습니다.'):isServiceCategory(category)?'서비스 업종을 기준으로 제안했습니다. 규격은 필요하지 않습니다.':`${label} 분류${volume!==null?`와 입력 부피 ${Number(volume.toFixed(3))} L`:''}를 참고한 초기 제안입니다.`;
 const channels=wholesale?[
  {name:'상품 상세·제안서',format:'3:4' as const,reason:'규격·소재·발주 정보를 한눈에 정리하세요.'},
  {name:'기업 블로그',format:'16:9' as const,reason:'사용 환경과 도입 조건을 함께 설명하세요.'},
 ]:isServiceCategory(category)?[
  {name:'인스타그램 피드',format:'4:5' as const,reason:'서비스와 이용 방법을 짧고 분명하게 알리세요.'},
  {name:'블로그·웹 배너',format:'16:9' as const,reason:'조건과 상담 방법을 자세히 연결하세요.'},
 ]:[
  {name:'인스타그램 피드',format:'4:5' as const,reason:'실제 제품의 특징을 사진과 함께 소개하세요.'},
  {name:'상품 상세페이지',format:'3:4' as const,reason:'규격과 구매에 필요한 정보를 정리하세요.'},
 ];
 const candidates=[p.productName,label,...campaign.attributes.map(a=>a.value),p.productProfile.material,campaign.goal==='inquiry'?'상담 안내':'상품 소개',isServiceCategory(category)?'서비스 안내':'제품 정보'].map(s=>s.trim()).filter(s=>s.length>0&&s.length<=24&&!/[\n.!?。]/.test(s));
 const seen=new Set<string>();const keywords=candidates.filter(s=>{const key=s.toLocaleLowerCase();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,7);
 return {method:'rules-v1',target,reason,channels,keywords,intent:`${p.productName||label}의 ${campaign.goal==='inquiry'?'문의·상담':'특징과 가치'}를 ${target}에게 전달하는 ${campaign.contentType==='poster'?'포스터':'카드형 광고'}입니다. ${axes.length?'입력 규격은 별도로 보관하고 표시 여부를 선택합니다.':'규격 없이 광고 내용과 사진으로 구성합니다.'}`};
}
