import {findAdField} from './ad-fields.ts';
import {restoreDraftProfile} from './product.ts';
import {industryKindFor, type ProductCategory, type IndustryKind} from './industry.ts';
import type {Project} from './model.ts';

import {sceneStops,type VideoStyle} from './video-style.ts';

export type VideoBrief = {kind:IndustryKind; style?:VideoStyle; fieldId?:string; category?:ProductCategory; industryDetail?:string; title:string; description:string; emphasis:string; contact:string; savedCaption?:string};
export const emptyVideoBrief:VideoBrief = {kind:'product',title:'',description:'',emphasis:'',contact:''};

export function projectVideoBrief(project?:Project, name=''):VideoBrief {
  if(!project)return {...emptyVideoBrief,title:name};
  const copy=project.copy[project.locale];
  const profile=restoreDraftProfile(project.productProfile);
  const saved=findAdField(profile.category,profile.industryDetail);
  const classified=saved||!['other','services'].includes(profile.category);
  const contact=([ 'company','contact','email','website' ] as const)
    .filter(key=>project.footer?.[key]!==false).map(key=>copy[key]?.trim()).filter(Boolean).join('\n');
  return {
    kind:saved?.field.kind??industryKindFor(profile.category),
    ...(classified?{category:profile.category}:{}),
    ...(saved?{fieldId:saved.field.id,industryDetail:profile.industryDetail}:{}), title:project.productName||project.name||name,
    description:profile.material||copy.description,
    emphasis:project.campaign?.creative?.note||'', contact,
    ...(copy.title?.trim()||copy.description?.trim()?{savedCaption:[copy.title,copy.description].filter(Boolean).join('\n')}:{})
  };
}

export function videoPlan(brief:VideoBrief, manualCaption:string, narration:string) {
  // Keep complete user-provided phrases, including qualifiers attached to prices and offers.
  const phrases=(text:string)=>text.trim().split(/\n+|(?<=[.!?。])\s+/u).map(s=>s.trim()).filter(Boolean);
  const facts=phrases(brief.description);
  const highlight=brief.emphasis.trim();
  // Prefer a short complete fact. Never abbreviate a long sentence by dropping its qualifications.
  const primary=facts.find(line=>line.length<=110)??'';
  const displayHighlight=highlight.length<=110 && !/(보여\s*줘|강조해|넣어\s*줘|보이게|강조하고|크게 표시)/.test(highlight)?highlight:'';
  const captions=manualCaption.trim() ? phrases(manualCaption) :
    [...new Set([brief.title.trim(),primary,displayHighlight].filter(Boolean))];
  const lines=brief.contact.trim() ? [...captions,brief.contact] : captions;
  const voice=narration.trim() || captions.join(' ');
  return {captions:lines,voice};
}
export function captionAt(captions:readonly string[],fraction:number){
  return captions[Math.min(captions.length-1,Math.max(0,Math.floor(fraction*captions.length)))]??'';
}

// Keep customer copy and qualifiers together, including approved multiline captions.
export function sceneCaptions(brief:VideoBrief, approved:string):[string,string,string] {
  if(approved.trim()){
    const [opening='',detail='',...closing]=approved.trim().split(/\n+/);
    return [opening,detail,closing.join('\n')];
  }
  const lines=videoPlan({...brief,contact:''},'','').captions;
  return [brief.title.trim(),lines.find(line=>line!==brief.title.trim()&&line!==brief.emphasis.trim())??'',lines.includes(brief.emphasis.trim())?brief.emphasis.trim():''];
}

export function sceneCaptionAt(captions:readonly string[], time:number, seconds:number){
  const [,middle,end]=sceneStops(seconds);
  return captions[time<middle?0:time<end?1:2]??'';
}
