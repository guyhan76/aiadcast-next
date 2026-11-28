import type {SceneCue} from './video-omni.ts';
import {excludesPour,finishedLatte} from './video-commercial-direction.ts';
import {framingRule,lattePreparation} from './video-subject-framing.ts';
import {formatBeats} from './video-format-direction.ts';
import {productDirection} from './video-product-direction.ts';
import {adFields} from './ad-fields.ts';
import {industryLabel} from './industry.ts';
import {sceneStops,styleForBrief} from './video-style.ts';
import type {VideoDraft} from './VideoDurationEditor';
import type {VideoDuration} from './video-duration';

export type VideoPromptMode='auto'|'manual';
export const manualPromptLimit=8000;
export function validManualPrompt(value:unknown):value is string {
  return typeof value==='string' && value.length<=manualPromptLimit && value.trim().length>0;
}

export type VideoShots = [string,string,string];
export const shotLimit=900;
export function validVideoShots(value:unknown):value is VideoShots {
  return Array.isArray(value) && value.length===3 && value.every(s=>typeof s==='string' && s.trim().length>0 && s.length<=shotLimit);
}

export function promptBrief(draft:VideoDraft,seconds:VideoDuration) {
  const {brief}=draft;
  return {kind:brief.kind,style:styleForBrief(brief),field:adFields.find(f=>f.id===brief.fieldId)?.ko??'',
    industry:brief.industryDetail||(brief.category?industryLabel(brief.category):''),
    title:brief.title,description:brief.description,highlight:brief.emphasis,ratio:draft.ratio,seconds,
    caption:draft.caption,contact:brief.contact,music:draft.aiMusic,voice:draft.aiVoice,musicStyle:draft.aiMusic?draft.musicStyle:'',
    voiceStyle:draft.aiVoice?draft.voiceStyle:'',narration:draft.aiVoice?draft.voiceText:''};
}
export type PromptBrief=ReturnType<typeof promptBrief>;

export function basicVideoShots(b:PromptBrief,language:'ko'|'en'):VideoShots {
  const beats = formatBeats(b,language);
  const context = [b.field, b.industry, b.title].filter(Boolean).join(' · ');
  const specific = (excludesPour(b) ? undefined : lattePreparation(b,language)) ?? finishedLatte(b,language) ?? (b.kind === 'product' && b.style === 'product' ? productDirection(b,language) : undefined);
  const framing = framingRule(b,language);
  const description = (b.description || '').trim();
  // Keep a complete sentence when the description is too long for one editable shot.
  const setting = description.length <= 330 ? description : description.split(/(?<=[.!?。])\s+|\n+/u).find(line=>line.length<=330);
  const highlight = (b.highlight || '').trim();
  const opening = [beats[0], specific?.[0], framing, context].filter(Boolean).join(' · ').slice(0,shotLimit);
  const hookCue = highlight.split(/(?<=[.!?。])\s+|\n+/u)[0];
  return [
    hookCue && opening.length + hookCue.length + 1 <= shotLimit ? opening+' '+hookCue : opening,
    [beats[1], specific?.[1], setting].filter(Boolean).join(' '),
    [beats[2], specific?.[2], highlight].filter(Boolean).join(' ').slice(0,shotLimit),
  ];
}

export function timedShots(shots:VideoShots,seconds:number,stops=sceneStops(seconds)){
  return shots.map((shot,i)=>stops[i]+'–'+stops[i+1]+'s · '+shot).join('\n');
}

export type VideoAudioIdea = {musicMood:string; narration:string; recommendVoice:boolean};
export type PhotoFrameLayout = {
  mode:'original'|'crop'|'layers'; source:number; regions:{x:number;y:number}[][];
};
export type VideoPlanIdea = {shots:VideoShots;sceneCues?:SceneCue[];frameLayout?:PhotoFrameLayout; audio?:VideoAudioIdea};
export function validVideoAudio(value:unknown):value is VideoAudioIdea {
  if (!value || typeof value!=='object') return false;
  const audio=value as Partial<VideoAudioIdea>;
  return typeof audio.musicMood==='string' && !!audio.musicMood.trim() && audio.musicMood.length<=140 &&
    typeof audio.narration==='string' && audio.narration.length<=600 && typeof audio.recommendVoice==='boolean';
}
