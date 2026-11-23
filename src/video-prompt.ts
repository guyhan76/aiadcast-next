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
  const ko=language==='ko';
  const subject=b.title || (b.kind==='product'?(ko?'첨부 상품':'the pictured product'):(ko?'서비스':'the service'));
  const detail=[b.highlight,b.description].find(value=>value.trim()&&value.length<=600);
  const focus=detail?(ko?' 강조할 내용은 “'+detail+'”.':' Focus on “'+detail+'”.'):'';
  const opening=b.style==='unboxing'?(ko?'첫 사진 속 닫힌 패키지 전체를 보여준다.':'Frame the whole closed package from the first photo.')
    :b.style==='presenter'?(ko?subject+' 소개를 눈높이 구도로 시작한다.':'Introduce '+subject+' at eye level.')
    :b.kind==='service'?(ko?subject+' 이용을 시작하는 순간을 한 장면으로 보여준다.':'Open on a scene introducing '+subject+'.')
    :(ko?subject+' 전체가 한눈에 보이도록 구도를 잡고 천천히 다가간다.':'Show the whole '+subject+' and slowly move closer.');
  const middle=b.style==='unboxing'?(ko?'다음 사진으로 이어서 개봉 후 실제 구성품을 보여준다.':'Cut to the next photo and reveal the supplied contents.')
    :b.kind==='service'?(ko?'상세설명에 있는 이용 과정 한 단계를 가까이 보여준다.':'Move in on one step from the service description.')
    :(ko?'사진에 보이는 특징 한 곳을 가까이 잡고 색상과 형태를 유지한다.':'Move closer to one visible detail, preserving its color and shape.');
  return [opening,middle+focus,ko?'마지막에는 '+subject+'이 한눈에 들어오는 정지 구도를 잡고 자막 자리를 남긴다.':'Finish on a steady view of '+subject+' with room for the closing caption.'];
}

export function timedShots(shots:VideoShots,seconds:number){
  const stops=sceneStops(seconds);
  return shots.map((shot,i)=>stops[i]+'–'+stops[i+1]+'s · '+shot).join('\n');
}

export type VideoAudioIdea = {musicMood:string; narration:string; recommendVoice:boolean};
export type VideoPlanIdea = {shots:VideoShots; audio?:VideoAudioIdea};
export function validVideoAudio(value:unknown):value is VideoAudioIdea {
  if (!value || typeof value!=='object') return false;
  const audio=value as Partial<VideoAudioIdea>;
  return typeof audio.musicMood==='string' && !!audio.musicMood.trim() && audio.musicMood.length<=140 &&
    typeof audio.narration==='string' && audio.narration.length<=600 && typeof audio.recommendVoice==='boolean';
}
