import {PrecisionEditAction} from './PrecisionEditAction';
import type {OpeningStill} from './video-opening-still';
import {useId,useState} from 'react';
import {useUiLanguage} from './ui-language';
import {omniSceneTiming,type SceneCue} from './video-omni';
import {sceneStops} from './video-style';
import {manualPromptLimit,type PhotoFrameLayout,type VideoPromptMode,shotLimit,timedShots,type VideoShots} from './video-prompt';
import type {VideoSource} from './video-duration';

export type VideoReview={
  musicMood:string; narration:string;
  shots:VideoShots; captions:VideoShots; showCaptions:boolean; music:boolean; voice:boolean; contact:string;
  briefKey:string; sources:VideoSource[]; sceneCues?:SceneCue[]; frameLayout?:PhotoFrameLayout; openingStill?:OpeningStill;
};
type Props={
  mode:VideoPromptMode;manualText:string;onMode:(mode:VideoPromptMode)=>void;onManual:(value:string)=>void;
  seconds:number;ratio:string;review?:VideoReview;ready:boolean;busy:boolean;planning:boolean;stale:boolean;
  onBuild:()=>void;onChange:(patch:Partial<VideoReview>)=>void;error:string
};
export function VideoPromptReview({mode,manualText,onMode,onManual,seconds,ratio,review,ready,busy,planning,stale,onBuild,onChange,error}:Props){
  const {t}=useUiLanguage(), [copyMessage,setCopyMessage]=useState('');
  const modeGroup=useId();
  const labels=[t('첫 장면','Opening shot'),t('중간 장면','Middle shot'),t('마지막 장면','Closing shot')];
  const timing=omniSceneTiming(seconds);
  const cueLabels={dialogue:t('인물 대사','Character dialogue'),sound:t('현장음','Location sound'),endFrame:t('마지막 화면','End frame')};
  const times=review?.sceneCues?timing.stops:sceneStops(seconds);
  function editCue(index:number,field:keyof SceneCue,value:string){
    if(review?.sceneCues)onChange({sceneCues:review.sceneCues.map((cue,i)=>i===index?{...cue,[field]:value}:cue)});
  }
  function turnLabel(i:number){
    const group=timing.groups.findIndex(indices=>indices[0]===i);
    if(group<0)return '';
    const indices=timing.groups[group],last=indices[indices.length-1];
    return t('Gemini '+(group+1)+'차','Gemini part '+(group+1))+' · '+times[i]+'–'+times[last+1]+t('초','s');
  }
  function editScene(field:'shots'|'captions',index:number,value:string){
    if(!review)return;
    const updated:VideoShots=[...review[field]];
    updated[index]=value;
    onChange({[field]:updated,...(field==='shots'&&index===0?{frameLayout:undefined,openingStill:review.openingStill?{...review.openingStill,active:false}:undefined}:{})});
  }
  async function copy(){
    if(!review)return;
    const lines=review.sceneCues?[ratio,...review.shots.flatMap((shot,i)=>{
      const cue=review.sceneCues![i];return [turnLabel(i),times[i]+'–'+times[i+1]+'s · '+shot,cue.dialogue,cue.sound,cue.endFrame];
    })]:[ratio,timedShots(review.shots,seconds)];
    if(review.showCaptions)lines.push(...review.captions,review.contact);
    lines.push(review.music?review.musicMood:t('배경음악 없음','No music'));
    lines.push(review.voice?review.narration:t('내레이션 없음','No narration'));
    try{await navigator.clipboard.writeText(lines.filter(Boolean).join('\n'));setCopyMessage(t('복사했어요.','Copied.'));}
    catch{setCopyMessage(t('구성안의 내용을 선택해 복사해 주세요.','Select the plan text to copy it.'));}
  }
  return <section className="vd-prompt" aria-label={t('영상 구성안','Video plan')}>
    <h2>{t('영상 구성안','Video plan')}</h2>
    <div className="vd-prompt-modes" role="radiogroup" aria-label={t('프롬프트 작성 방식','Prompt mode')}>
      {(['auto','manual'] as const).map(value=><label key={value}>
        <input type="radio" name={modeGroup} value={value} checked={value===mode} disabled={busy}
          onChange={()=>{setCopyMessage('');onMode(value);}}/>
        {value==='auto'?t('자동 작성','Auto draft'):t('내 프롬프트 사용','Use my prompt')}
      </label>)}
    </div>
    {mode==='manual'?<>
      <label>{t('내 프롬프트','Your prompt')}
        <textarea rows={6} aria-label={t('내 프롬프트','Your prompt')} value={manualText} disabled={busy} aria-invalid={manualText.length>manualPromptLimit}
          placeholder={t('장면과 소리까지 원하는 연출을 적거나 준비한 프롬프트를 붙여넣으세요.','Describe the shots and sound, or paste your prepared prompt.')}
          onChange={e=>onManual(e.target.value)}/></label>
      {manualText.length>manualPromptLimit&&<p role="alert">{t('프롬프트를 8,000자 이내로 줄여 주세요.','Keep your prompt within 8,000 characters.')}</p>}
    </>:<>
      {(!review||stale)&&<button type="button" className="vd-primary" disabled={busy||!ready} onClick={()=>{setCopyMessage('');onBuild();}}>
        {planning?t('영상 프롬프트 작성 중…','Drafting video prompt…'):review?t('영상 프롬프트 다시 만들기','Rebuild video prompt'):t('영상 프롬프트 만들기','Create video prompt')}</button>}
      {error&&<p role="alert">{error}</p>}
      {review&&<>
        {stale&&<p role="status">{t('입력 정보가 바뀌었어요. 새 구성안을 확인한 뒤 제작해 주세요.','Your inputs changed. Update the plan before creating the video.')}</p>}
        <fieldset className="vd-review-fields" disabled={busy||stale}>
          <legend>{t('구성안 확인','Review your plan')} · {ratio} · {seconds}{t('초','s')}</legend>
          <label className="vd-plan-toggle"><input type="checkbox" checked={review.showCaptions} onChange={e=>onChange({showCaptions:e.target.checked})}/>{t('자막 넣기','Include captions')}</label>
          {review.shots.map((shot,i)=><div className="vd-review-scene" key={i}>
            {review.sceneCues&&turnLabel(i)&&<strong>{turnLabel(i)}</strong>}
            <h3>{labels[i]} <small>{times[i]}–{times[i+1]}{t('초','s')}</small></h3>
            {i===0&&review.openingStill&&<div className="vd-opening-still">
              <img src={review.openingStill.data} alt={review.openingStill.referenceOnly?t('제품·장소 참고 사진','Appearance reference'):t('첫 장면 이미지 시안','Opening still preview')}/>
              <label className="vd-plan-toggle"><input type="checkbox" checked={review.openingStill.active}
                onChange={e=>onChange({openingStill:{...review.openingStill!,active:e.target.checked}})}/>
                {t('이 이미지로 시작','Use this opening image')}</label>
              {review.openingStill.referenceOnly&&!review.openingStill.active&&<small>{t('사진은 외형만 참고하고 첫 장면은 대본대로 연출해요.','Use the photo for appearance and stage the scripted opening.')}</small>}
              <PrecisionEditAction disabled={busy||stale} label={t('첫 장면 AI 편집','Edit opening image with AI')}
                getInput={()=>({data:review.openingStill!.data,name:'opening.png'})}
                initialPrompt={[t('광고 영상의 첫 순간을 사진 한 장으로 연출하세요. 화면에 실제로 보일 첫 행동을 포착하세요. 원본 상품의 형태와 색상, 토핑과 인쇄 로고를 보존하고 앱 버튼과 안내 글씨는 제거하세요.','Stage the first visible action as one photographic frame. Preserve the product geometry, colors, toppings and printed branding. Remove interface controls and overlay text.'),shot].join('\n')}
                onUseImage={asset=>{onChange({openingStill:{...review.openingStill!,data:asset.data,active:true,referenceOnly:false}});window.dispatchEvent(new Event('aiadcast-opening-image-accepted'));}}/>
            </div>}
            <label>{t('장면 연출','Shot direction')}
              <textarea rows={2} aria-label={labels[i]+' '+t('연출','direction')} maxLength={shotLimit} value={shot} onChange={e=>editScene('shots',i,e.target.value)}/></label>
            {review.sceneCues&&<details className="vd-details"><summary>{t('대사·현장음·마지막 화면','Dialogue, sound and end frame')}</summary>
              {(['dialogue','sound','endFrame'] as const).map((key,k)=><label key={key}>{cueLabels[key]}
                <textarea rows={2} aria-label={labels[i]+' '+cueLabels[key]} maxLength={[180,140,200][k]} value={review.sceneCues![i][key]} onChange={e=>editCue(i,key,e.target.value)}/></label>)}
            </details>}
            {review.showCaptions&&<label>{t('자막','Caption')}<textarea rows={2} maxLength={1000} value={review.captions[i]} aria-label={labels[i]+' '+t('자막','caption')}
              onChange={e=>editScene('captions',i,e.target.value)}/></label>}
          </div>)}
          {review.showCaptions&&<details className="vd-details"><summary>{t('마지막 화면 연락처 (선택)','End card contact (optional)')}</summary>
            <label>{t('연락처','Contact details')}<textarea rows={2} maxLength={340} value={review.contact} onChange={e=>onChange({contact:e.target.value})}/></label></details>}
          <details className="vd-details"><summary>{t('배경음악','Background music')}<small>{review.music?review.musicMood:t('없음','Off')}</small></summary>
            <label className="vd-plan-toggle"><input type="checkbox" checked={review.music} onChange={e=>onChange({music:e.target.checked})}/>{t('음악 넣기','Include music')}</label>
            {review.music&&<label>{t('음악 분위기','Music mood')}<input maxLength={140} value={review.musicMood} onChange={e=>onChange({musicMood:e.target.value})}/></label>}
          </details>
          <details className="vd-details"><summary>{t('내레이션','Narration')}<small>{review.voice?t('대본 보기','View script'):t('없음','Off')}</small></summary>
            <label className="vd-plan-toggle"><input type="checkbox" checked={review.voice} onChange={e=>onChange({voice:e.target.checked})}/>{t('한국어 내레이션 넣기','Include Korean narration')}</label>
            {review.voice&&<label>{t('읽을 문장','Narration script')}<textarea rows={3} maxLength={600} value={review.narration} onChange={e=>onChange({narration:e.target.value})}/></label>}
          </details>
          <button type="button" className="vd-library" onClick={()=>void copy()}>{t('영상 프롬프트 복사','Copy video prompt')}</button>
          {copyMessage&&<small role="status">{copyMessage}</small>}
        </fieldset>
      </>}
    </>}
  </section>;
}
