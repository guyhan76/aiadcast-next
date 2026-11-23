import {useEffect,useRef} from 'react';
import {useUiLanguage} from './ui-language';
import type {VideoPromptMode} from './video-prompt';
import type {VideoRatio} from './video-formats';
import {videoStyles,type VideoStyle} from './video-style';

export function VideoCostDialog({style,ratio,seconds,credits,admin,provider,promptMode,onCancel,onConfirm}:{
  style:VideoStyle;ratio:VideoRatio;seconds:number;credits:number;admin?:boolean;provider?:string;promptMode:VideoPromptMode;onCancel:()=>void;onConfirm:()=>void;
}){
  const {t}=useUiLanguage(),dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog className="vd-picker vd-confirm" ref={dialog} aria-label={t('제작 전 확인','Confirm video creation')} onCancel={onCancel}>
    <h2>{t('제작 전 확인','Confirm video creation')}</h2>
    <dl><div><dt>{t('영상 형식','Video style')}</dt><dd>{t(videoStyles[style].label[0],videoStyles[style].label[1])}</dd></div>
      <div><dt>{t('영상 규격','Video format')}</dt><dd>{ratio} · {seconds}{t('초','s')}</dd></div>
      <div><dt>{t('적용할 프롬프트','Selected prompt')}</dt><dd>{promptMode==='manual'?t('직접 입력','Enter manually'):t('자동 작성','Auto draft')}</dd></div>
      <div><dt>{t('제작 방식','Production')}</dt><dd>{admin?t('AI 관리자 테스트','AI admin trial'):t('AI 영상 생성','AI video generation')}</dd></div>
      {admin&&provider&&<div><dt>{t('공급사 과금','Provider billing')}</dt><dd>{provider==='topview'?'TOPVIEW · T1':provider==='higgsfield'?'Higgsfield · Seedance 2.5':'BytePlus'}<br/>{t('공급사 API 사용료 별도','Provider API usage is billed separately')}</dd></div>}
      <div><dt>{t('이용권 차감','Credits deducted')}</dt><dd>{credits}{t('크레딧',' credits')}</dd></div></dl>
    {provider==='topview'&&<p>{t('검수한 프롬프트와 참조 이미지를 TOPVIEW로 전송합니다.','Your reviewed prompt and reference images are sent to TOPVIEW.')} <a href="/video-privacy.html" target="_blank" rel="noreferrer">{t('영상 자료 처리 안내','Video data policy')}</a></p>}
    <footer><button type="button" className="vd-library" autoFocus onClick={onCancel}>{t('취소','Cancel')}</button>
      <button type="button" className="vd-primary" onClick={onConfirm}>{t('제작 시작','Start creation')}</button></footer>
  </dialog>;
}
