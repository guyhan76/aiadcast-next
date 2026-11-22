import {useEffect,useRef} from 'react';
import {useUiLanguage} from './ui-language';
import type {VideoPromptMode} from './video-prompt';
import type {VideoRatio} from './video-formats';
import {videoStyles,type VideoStyle} from './video-style';

export function VideoCostDialog({style,ratio,seconds,ai,higgsfield,promptMode,onCancel,onConfirm}:{
  style:VideoStyle;ratio:VideoRatio;seconds:number;ai:boolean;higgsfield?:boolean;promptMode:VideoPromptMode;onCancel:()=>void;onConfirm:()=>void;
}){
  const {t}=useUiLanguage(),dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal();},[]);
  return <dialog className="vd-picker vd-confirm" ref={dialog} aria-label={t('제작 전 확인','Confirm video creation')} onCancel={onCancel}>
    <h2>{t('제작 전 확인','Confirm video creation')}</h2>
    <dl><div><dt>{t('영상 형식','Video style')}</dt><dd>{t(videoStyles[style].label[0],videoStyles[style].label[1])}</dd></div>
      <div><dt>{t('영상 규격','Video format')}</dt><dd>{ratio} · {seconds}{t('초','s')}</dd></div>
      {ai&&<div><dt>{t('적용할 프롬프트','Selected prompt')}</dt><dd>{promptMode==='manual'?t('직접 입력','Enter manually'):t('자동 작성','Auto draft')}</dd></div>}
      <div><dt>{t('제작 방식','Production')}</dt><dd>{ai?t('AI 관리자 테스트','AI admin trial'):t('기기 편집','Device editing')}</dd></div>
      {ai&&higgsfield&&<div><dt>{t('공급사 과금','Provider billing')}</dt><dd>Higgsfield · Seedance 2.5<br/>{t('일반형 API 사용료 별도','Standard API usage is billed separately')}</dd></div>}
      <div><dt>{t('이용권 차감','Credits deducted')}</dt><dd>{t('0크레딧','0 credits')}</dd></div></dl>
    <footer><button type="button" className="vd-library" autoFocus onClick={onCancel}>{t('취소','Cancel')}</button>
      <button type="button" className="vd-primary" onClick={onConfirm}>{t('제작 시작','Start creation')}</button></footer>
  </dialog>;
}
