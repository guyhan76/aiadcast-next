import {omniBudget} from './video-omni';
import {useEffect,useRef} from 'react';
import {useUiLanguage} from './ui-language';
import type {VideoPromptMode} from './video-prompt';
import type {VideoRatio} from './video-formats';
import {videoStyles,type VideoStyle} from './video-style';

export function VideoCostDialog({style,ratio,seconds,credits,admin,provider,promptMode,onCancel,onConfirm}:{
  style:VideoStyle;ratio:VideoRatio;seconds:number;credits:number;admin?:boolean;provider?:string;promptMode:VideoPromptMode;onCancel:()=>void;onConfirm:()=>void;
}){
  const {t}=useUiLanguage(),dialog=useRef<HTMLDialogElement>(null);
  const omni=omniBudget(seconds);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog className="vd-picker vd-confirm" ref={dialog} aria-label={t('제작 전 확인','Confirm video creation')} onCancel={onCancel}>
    <h2>{t('제작 전 확인','Confirm video creation')}</h2>
    <dl>
      <div className="vd-credit-summary">
        <dt>{t('이번 제작에 사용할 크레딧','Credits for this video')}{admin&&<small>{t('관리자 테스트','Admin test')}</small>}</dt>
        <dd>{credits.toLocaleString()}{t('크레딧',' credits')}</dd>
      </div>
      <div><dt>{t('영상 형식','Video style')}</dt><dd>{t(videoStyles[style].label[0],videoStyles[style].label[1])}</dd></div>
      <div><dt>{t('영상 규격','Video format')}</dt><dd>{ratio} · {seconds}{t('초','s')}</dd></div>
      <div><dt>{t('적용할 프롬프트','Selected prompt')}</dt><dd>{promptMode==='manual'?t('직접 입력','Enter manually'):t('자동 작성','Auto draft')}</dd></div>
    </dl>
    {provider==='gemini'&&<p>{t(`Google 유료 요청 ${omni.calls}회 · ${seconds}초. 각 단계의 전체 출력 기준 약 ${omni.outputEstimateUsd.toFixed(2)}이며 입력 비용은 별도입니다. 선택한 자료와 프롬프트를 Google에 전송합니다.`,`${omni.calls} paid Google request(s) for ${seconds}s. Estimated output ${omni.outputEstimateUsd.toFixed(2)} counting each full result, plus input. Your references and prompt go to Google.`)}</p>}
    {['topview','gemini'].includes(provider??'')&&<p className="vd-data-policy"><a href="/video-privacy.html" target="_blank" rel="noreferrer">{t('영상 자료 처리 안내','Video data policy')}</a></p>}
    <footer><button type="button" className="vd-library" autoFocus onClick={onCancel}>{t('취소','Cancel')}</button>
      <button type="button" className="vd-primary" onClick={onConfirm}>{t('제작 시작','Start creation')}</button></footer>
  </dialog>;
}
