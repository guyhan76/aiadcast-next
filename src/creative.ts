import type {Project} from './model.ts';
import {defaultCampaign} from './campaign.ts';
import {industryDirections,industryGroupFor,industryLabel} from './industry.ts';

export const creativeLooks=[
 {id:'editorial',label:'에디토리얼',description:'넓은 여백과 선명한 타이포',color:'#f8f7f4',ink:'dark',accent:'#a27853'},
 {id:'signature',label:'시그니처',description:'깊은 차콜과 절제된 골드',color:'#191d1f',ink:'light',accent:'#c6a775'},
 {id:'natural',label:'내추럴',description:'따뜻한 톤과 편안한 분위기',color:'#eee9de',ink:'dark',accent:'#71806b'},
 {id:'precision',label:'모던 테크',description:'차분한 네이비와 정제된 구성',color:'#132235',ink:'light',accent:'#8baec6'},
] as const;
export type CreativeLook=typeof creativeLooks[number]['id'];
export type CreativeSettings={directionId:'brand'|'offer'|'trust';look:CreativeLook;note:string};
export const defaultCreative=():CreativeSettings=>({directionId:'brand',look:'editorial',note:''});
export function parseCreative(raw:unknown):CreativeSettings{
 if(raw===undefined)return defaultCreative();const c=raw as CreativeSettings;
 if(!c||!['brand','offer','trust'].includes(c.directionId)||!creativeLooks.some(x=>x.id===c.look)||typeof c.note!=='string'||c.note.length>600)throw Error('광고 방향과 스타일을 확인해주세요.');
 return {directionId:c.directionId,look:c.look,note:c.note};
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
 if(p.locale==='en')return {title:name||'Your brand, in focus',description:(p.productProfile.material.trim().length<=80?p.productProfile.material.trim():'')||({brand:'Discover what we offer.',offer:'Explore the details. Get in touch to learn more.',trust:'Get to know our business and services.'}[settings.directionId])};
 return {title:name?`${name}\n${direction.headline}`:direction.headline,description:(p.productProfile.material.trim().length<=80?p.productProfile.material.trim():'')||direction.cta};
}
export function creativeContract(p:Project){
 const settings=creativeSettings(p),category=p.productProfile.category,group=industryGroupFor(category),direction=industryDirections(category).find(d=>d.id===settings.directionId)!,look=creativeLooks.find(x=>x.id===settings.look)!;
 return {version:1,industry:{id:category,label:industryLabel(category),groupId:group.id,groupLabel:group.label},direction:{id:direction.id,label:direction.label,description:direction.description,callToAction:direction.cta},visual:{id:look.id,label:look.label,styleReference:{description:look.description,palette:look.color},approvedSceneOverridesStyle:true,backgroundColor:p.background.color,ink:p.ink,accent:look.accent,composition:'Generous whitespace, clear typographic hierarchy, restrained palette, one focal subject. Keep confirmed copy in separate editable text layers. Approved scene colors and existing assets take precedence over the style reference.'},additionalInstructions:settings.note,
  factPolicy:'Use only supplied or confirmed business facts. Do not invent prices, performance, returns, medical outcomes, certifications, testimonials or eligibility. Ask for missing facts when needed.',
  status:'direction-prepared',providerStatus:'not-connected'};
}
