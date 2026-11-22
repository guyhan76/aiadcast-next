import {useId,useState} from 'react';
import {useUiLanguage} from './ui-language';
import {sceneStops} from './video-style';
import {manualPromptLimit,type VideoPromptMode,shotLimit,timedShots,validVideoShots,type PromptBrief,type VideoShots} from './video-prompt';
import type {VideoSource} from './video-duration';

export type VideoReview={shots:VideoShots;briefKey:string;sources:VideoSource[];fromAi:boolean};
type Props={mode:VideoPromptMode;manualText:string;onMode:(mode:VideoPromptMode)=>void;onManual:(value:string)=>void;
  brief:PromptBrief;review?:VideoReview;ready:boolean;busy:boolean;planning:boolean;stale:boolean;online:boolean;
  onBuild:()=>void;onChange:(shots:VideoShots)=>void;error:string};
export function VideoPromptReview({mode,manualText,onMode,onManual,brief,review,ready,busy,planning,stale,online,onBuild,onChange,error}:Props){
  const {t}=useUiLanguage(), [copyMessage,setCopyMessage]=useState('');
  const modeGroup=useId();
  const labels=[t('첫 장면','Opening shot'),t('중간 장면','Middle shot'),t('마지막 장면','Closing shot')];
  const times=sceneStops(brief.seconds);
  async function copy(){
    if(!review)return;
    const settings=[brief.title,[brief.field,brief.industry].filter(Boolean).join(' · '),brief.style+' · '+brief.ratio+' · '+brief.seconds+'s',
      brief.description,brief.highlight,timedShots(review.shots,brief.seconds),brief.caption,brief.contact,
      brief.music?(brief.musicStyle||t('배경음악 사용','Include music')):t('배경음악 없음','No music'),
      brief.voice?([brief.narration,brief.voiceStyle].filter(Boolean).join(' · ')||t('한국어 내레이션','Korean narration')):t('내레이션 없음','No narration')];
    try{await navigator.clipboard.writeText(settings.filter(Boolean).join('\n'));setCopyMessage(t('복사했어요.','Copied.'));}
    catch{setCopyMessage(t('장면 문구를 선택해 복사해 주세요.','Select the shot text to copy it.'));}
  }
  return <section className="vd-prompt" aria-label={t('영상 프롬프트','Video prompt')}>
    <h2>{t('영상 프롬프트','Video prompt')}</h2>
    <div className="vd-prompt-modes" role="radiogroup" aria-label={t('프롬프트 작성 방식','Prompt mode')}>
      {(['auto','manual'] as const).map(value=><label key={value}>
        <input type="radio" name={modeGroup} value={value} checked={value===mode} disabled={busy}
          onChange={()=>{setCopyMessage('');onMode(value);}}/>
        {value==='auto'?t('자동 작성','Auto draft'):t('직접 입력','Enter manually')}
      </label>)}
    </div>
    {mode==='manual'?<>
      <label>{t('내 프롬프트','Your prompt')}
        <textarea rows={6} value={manualText} disabled={busy} aria-invalid={manualText.length>manualPromptLimit}
          placeholder={t('직접 작성하거나 ChatGPT, Claude, Gemini에서 만든 프롬프트를 붙여넣으세요.','Write your prompt or paste one from ChatGPT, Claude or Gemini.')}
          onChange={e=>onManual(e.target.value)}/></label>
      {manualText.length>manualPromptLimit&&<p role="alert">{t('프롬프트를 8,000자 이내로 줄여 주세요.','Keep your prompt within 8,000 characters.')}</p>}
    </>:<>
      <p>{online?t('입력한 정보와 참조 사진으로 장면별 연출을 작성해요.','Draft shot directions from your brief and reference photos.'):
        t('입력한 정보로 기본 초안을 작성해요. 사진 분석은 AI 연결 시 사용할 수 있어요.','Draft from your brief. Photo analysis is available with the AI assistant.')}</p>
      {(!review||stale||(online&&!review.fromAi))&&<button type="button" className="vd-primary" disabled={busy||!ready} onClick={()=>{setCopyMessage('');onBuild();}}>
        {planning?t('프롬프트 작성 중…','Drafting…'):review&&!stale?t('사진을 반영해 AI 초안 만들기','Create AI draft with photos'):review?t('변경된 정보로 초안 교체','Replace draft from updated inputs'):t('프롬프트 만들기','Create prompt')}</button>}
      {error&&<p role="alert">{error}</p>}
      {review&&<>
        {stale&&<p role="status">{t('제작 정보가 바뀌었어요. 새 초안으로 교체하기 전까지 수정한 문구를 보관해요.','Inputs changed. Your edits are kept until you replace the draft.')}</p>}
        <small>{review.fromAi?t('AI 연출안 · 장면별 수정 가능','AI shot directions · Editable'):t('기본 연출안 · 장면별 수정 가능','Basic shot directions · Editable')}</small>
        {review.shots.map((shot,i)=><label key={i}>{labels[i]}{!stale&&' · '+times[i]+'–'+times[i+1]+t('초','s')}
          <textarea rows={3} maxLength={shotLimit} value={shot} disabled={busy||stale} onChange={e=>{const next:VideoShots=[...review.shots];next[i]=e.target.value;setCopyMessage('');onChange(next);}}/></label>)}
        <div><button type="button" className="vd-library" disabled={busy||stale||!validVideoShots(review.shots)} onClick={()=>void copy()}>{t('프롬프트 복사','Copy prompt')}</button>
        {copyMessage&&<small role="status">{copyMessage}</small>}</div>
      </>}
    </>}
  </section>;
}
