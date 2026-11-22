import {useUiLanguage} from './ui-language';
import type {VideoBrief} from './video-brief';

export function VideoBriefFields({value,disabled,change}:{value:VideoBrief;disabled:boolean;change:(v:VideoBrief)=>void}){
  const {t}=useUiLanguage();
  const service=value.kind==='service';
  const description=service
    ? t('춤을 처음 배우는 직장인을 위한 퇴근 후 댄스 수업이에요. 매주 수요일 저녁 7시, 6명 정원으로 기본 스텝부터 50분 동안 배워요.', 'An after-work dance class for complete beginners. On Wednesdays at 7 pm, up to six people spend 50 minutes learning the basic steps.')
    : t('겨울 출퇴근용 블랙 롱패딩이에요. 무릎까지 내려오는 길이에 후드와 양옆 지퍼 주머니가 있어요. 판매가는 285,000원이고 무료배송이에요.', 'A black long coat for winter commutes. It reaches the knees and has a hood and two zippered side pockets. The price is KRW 285,000 with free shipping.');
  const highlight=service
    ? t('춤이 처음인 분도 함께하는 6명 소그룹 · 수요일 입문반 예약하기', 'Six beginners per class · Book your spot for Wednesday.')
    : t('무릎까지 덮는 출근길 롱패딩 · 285,000원 · 무료배송', 'Knee-length coverage for the commute · KRW 285,000 · Free shipping.');
  const example=t('예) ', 'e.g. ');
  return <fieldset className="vd-brief" disabled={disabled}>
    <label>{service?t('서비스명','Service name'):t('상품명','Product name')}
      <input maxLength={100} value={value.title} onChange={e=>change({...value,title:e.target.value})}/></label>
    <label>{t('상세설명','Description')}
      <textarea rows={4} maxLength={2000} value={value.description} placeholder={example+description}
        onChange={e=>change({...value,description:e.target.value})}/></label>
    <label>{t('강조할 점 (선택)','Highlight (optional)')}
      <textarea rows={3} maxLength={600} value={value.emphasis} placeholder={example+highlight}
        onChange={e=>change({...value,emphasis:e.target.value})}/></label>
    <details className="input-example-guide">
      <summary>{t('더 좋은 결과를 위한 예시 가이드','Example guide for better results')}</summary>
      <div className="input-example-content">
        <p><strong>{service?t('댄스 입문반 예시','Beginner dance class example'):t('겨울 롱패딩 예시','Winter coat example')}</strong></p>
        <p>{service?t('상세설명에는 누가 이용하는지, 무엇을 제공하는지, 이용 시간과 예약 조건을 적어주세요.', 'Describe who the service is for, what is included, when it runs and how to book.'):t('상세설명에는 누가 언제 쓰는지, 사진에서 확인할 수 있는 특징과 실제 판매 조건을 적어주세요.', 'Describe who uses the product, when they use it, its visible features and the actual terms of sale.')}</p>
        <blockquote>{description}</blockquote>
        <p>{t('강조할 점에는 고객이 기억할 특징 하나를 적어주세요. 구매나 예약을 유도한다면 실제 가격·적용 조건 또는 예약 문구도 함께 쓰세요.', 'Choose one feature viewers should remember. For a purchase or booking, add the actual price and terms or a short invitation to book.')}</p>
        <blockquote>{highlight}</blockquote>
        <p className="input-example-note">{t('가상 예시입니다. 실제 광고에는 확인한 정보만 입력해 주세요.', 'This is a fictional example. Use the verified details of your own offer.')}</p>
      </div>
    </details>
  </fieldset>;
}
