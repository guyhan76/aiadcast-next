import type {Project} from './model.ts';
import {defaultCampaign} from './campaign.ts';
import {industryDirections,industryGroupFor,industryLabel} from './industry.ts';
import {artDirectionFor,requestedCallToAction} from './art-direction.ts';
import {compactAdDescription} from './ad-copy.ts';
import {referenceDimensionGuidance} from './specification.ts';

export const creativeLooks=[
 {id:'editorial',label:'에디토리얼',description:'넓은 여백과 선명한 타이포',color:'#f8f7f4',ink:'dark',accent:'#a27853'},
 {id:'signature',label:'시그니처',description:'깊은 차콜과 절제된 골드',color:'#191d1f',ink:'light',accent:'#c6a775'},
 {id:'natural',label:'내추럴',description:'따뜻한 톤과 편안한 분위기',color:'#eee9de',ink:'dark',accent:'#71806b'},
 {id:'precision',label:'모던 테크',description:'차분한 네이비와 정제된 구성',color:'#132235',ink:'light',accent:'#8baec6'},
] as const;
export type CreativeLook=typeof creativeLooks[number]['id'];
export type CreativeSettings={directionId:'brand'|'offer'|'trust';look:CreativeLook|'auto';note:string;copyMode?:'ai'|'manual'};
export const defaultCreative=():CreativeSettings=>({directionId:'brand',look:'auto',note:'',copyMode:'ai'});
export function parseCreative(raw:unknown):CreativeSettings{
 if(raw===undefined)return defaultCreative();const c=raw as CreativeSettings;
 if(!c||!['brand','offer','trust'].includes(c.directionId)||(c.look!=='auto'&&!creativeLooks.some(x=>x.id===c.look))||typeof c.note!=='string'||c.note.length>600||(c.copyMode!==undefined&&!['ai','manual'].includes(c.copyMode)))throw Error('광고 목적과 요청사항을 확인해주세요.');
 return {directionId:c.directionId,look:c.look,note:c.note,...(c.copyMode?{copyMode:c.copyMode}:{})};
}
export function creativeSettings(p:Project):CreativeSettings{return parseCreative(p.campaign?.creative);}
export function withCreative(p:Project,patch:Partial<CreativeSettings>):Project{
 const creative=parseCreative({...creativeSettings(p),...patch});
 return {...p,campaign:{...(p.campaign??defaultCampaign()),...(patch.directionId?{goal:patch.directionId==='offer'?'inquiry' as const:'awareness' as const}:{}),creative}};
}
export function chooseCreativeLook(p:Project,id:CreativeLook):Project{
 const look=creativeLooks.find(x=>x.id===id);if(!look)throw Error('광고 스타일을 확인해주세요.');
 const next=withCreative(p,{look:id});
 return {...next,background:{...p.background,color:look.color},ink:look.ink,campaign:{...next.campaign!,tone:id==='natural'?'warm':look.ink==='light'?'bold':'minimal'}};
}
export function creativeCopy(p:Project):{title:string;description:string}{
 const settings=creativeSettings(p),direction=industryDirections(p.productProfile.category).find(d=>d.id===settings.directionId)!;
 const name=p.productName.trim();
 const requested=requestedCallToAction(settings.note);
 const cta=requested==='requested'?direction.cta:requested;
 const description=compactAdDescription(p.productProfile.material);
 const action=p.locale==='en'&&requested==='requested'?'Get in touch.':cta;
 const base=description||(p.locale==='en'?{brand:'A distinctive everyday presence.',offer:'Details that make the difference.',trust:'Thoughtfully prepared for your everyday.'}[settings.directionId]:direction.description);
 if(p.locale==='en')return {title:name||'Your brand, in focus',description:[base,action].filter(Boolean).join(' ')};
 // The initial title describes the offer; purpose labels never imply an unsolicited CTA.
 const packagingTrust=(industryGroupFor(p.productProfile.category).id==='packaging'||/박스/.test(name))&&/튼튼|내구성|든든/.test(description);
 return {title:name?(packagingTrust?`${name}\n배송의 시작,\n든든하게.`:name):'일상에 더하는 새로운 가치',description:[base,action].filter(Boolean).join(' ')};
}
export function creativeContract(p:Project){
 const settings=creativeSettings(p),category=p.productProfile.category,group=industryGroupFor(category),direction=industryDirections(category).find(d=>d.id===settings.directionId)!;
 const requested=requestedCallToAction(settings.note);
 return {version:1,copyMode:settings.copyMode??'manual',industry:{id:category,label:p.productProfile.industryName??industryLabel(category),groupId:group.id,groupLabel:group.label},direction:{id:direction.id,label:direction.label,description:direction.description,callToAction:requested==='requested'?direction.cta:requested},artDirection:artDirectionFor(category,p.format,settings.note),ctaPolicy:requested?'customer-requested':'omit',visual:{id:'auto',label:'상품에 맞춘 AI 연출',approvedSceneOverridesStyle:true,backgroundColor:p.background.color,ink:p.ink,composition:'Produce a finished one-page campaign including a prominent reference-based hero, readable marketing copy, supplied benefits and offer, optional dimension labels and visible contacts. Choose useful detail views only when supported by facts and references. Preserve exact material and product construction. No giant empty copy area or saved mood preset. Generated typography is part of the finished bitmap and must be reviewed.'},additionalInstructions:[p.productProfile.industryName?'Advertised industry (subject context, not advertising copy): '+p.productProfile.industryName:'',settings.note].filter(Boolean).join('\n'),
  referenceGeometry:referenceDimensionGuidance(p),factPolicy:'Use only supplied or confirmed business facts. Do not invent prices, performance, returns, medical outcomes, certifications, testimonials or eligibility. Ask for missing facts when needed.',
  status:'direction-prepared',providerStatus:'not-connected'};
}



