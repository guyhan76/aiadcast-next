import {useUiLanguage} from './ui-language';
import type {VideoBrief} from './video-brief';

export function VideoBriefFields({value,disabled,change}:{value:VideoBrief;disabled:boolean;change:(v:VideoBrief)=>void}){
  const {t}=useUiLanguage();
  return <fieldset className="vd-brief" disabled={disabled}>
    <label>{value.kind==='product'?t('상품명','Product name'):t('서비스명','Service name')}
      <input maxLength={100} value={value.title} onChange={e=>change({...value,title:e.target.value})}/></label>
    <label>{t('상세설명','Description')}
      <textarea rows={2} maxLength={2000} value={value.description} placeholder={t('누구에게 어떤 상품이나 서비스를 소개하나요?','Who is it for, and what do you offer?')}
        onChange={e=>change({...value,description:e.target.value})}/></label>
    <label>{t('강조할 점 (선택)','Highlight (optional)')}
      <input maxLength={600} value={value.emphasis} placeholder={value.kind==='product'?t('예: 이번 주말 무료 배송','e.g. Free shipping this weekend'):t('예: 한 달 최대 369만 원','e.g. Up to $500 per month')}
        onChange={e=>change({...value,emphasis:e.target.value})}/></label>
  </fieldset>;
}
