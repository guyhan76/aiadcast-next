import {useUiLanguage} from './ui-language';

export function InputExampleGuide({kind,service}:{kind:'facts'|'headline'|'copy';service:boolean}){
 const {t}=useUiLanguage();
 const label=kind==='facts'?t('상세설명','Description'):kind==='headline'?t('광고 제목','Ad headline'):t('광고 설명','Ad supporting copy');
 const title=t('더 좋은 결과를 위한 예시 가이드','Example guide for better results');
 return <details className="input-example-guide" data-guide={kind}>
  <summary aria-label={`${label}: ${title}`}>{title}</summary>
  <div className="input-example-content">
   {kind==='facts'?<>
    <p><strong>{t('상세설명','Description')}</strong>{t(': 소재·특징·가격 등 확인된 상품·서비스 정보.', ': Confirmed product or service facts, such as materials, features and price.')}</p>
    <blockquote>{service?t('2인 숙소 · 우드 가구 · 큰 창과 테이블', 'A stay for two · Wooden furniture · Large window and table'):t('450mL 스테인리스 텀블러 · 뚜껑 포함 · 아이보리·검정', '450 mL stainless-steel tumbler · Lid included · Ivory or black')}</blockquote>
    <p><strong>{t('추가 요청','Additional requests')}</strong>{t(': 원하는 배경·분위기·강조점.', ': Your preferred background, mood and emphasis.')}</p>
    <blockquote>{t('밝은 야외 배경, 가격 강조, 문구는 짧게.', 'Bright outdoor background, highlight the price, keep the copy short.')}</blockquote>
    <p>{t('실제 사진을 첨부하고, 생성 후 상품과 문구를 확인해주세요.', 'Attach actual photos, then check the product and copy after generation.')}</p>
   </>:<>
    <p>{kind==='headline'?t('이미지에 실제로 보일 짧은 제목을 적어주세요. 한 가지 메시지에 집중하고, 배경이나 촬영 지시는 ‘추가 요청’에 적어주세요.','Write the short headline that should appear on the image. Focus on one message; put background or photography directions in “Additional requests”.'):t('제목 아래에 실제로 보일 설명을 적어주세요. 특징·구성·가격 중 필요한 정보만 간결하게 쓰고, 가격이나 혜택에는 적용 조건도 함께 적어주세요.','Write the supporting copy that should appear below the headline. Keep features, contents or prices concise and include any conditions for prices or offers.')}</p>
    <p><strong>{service?t('숙소 광고 문구 예시','Stay ad copy example'):t('텀블러 광고 문구 예시','Tumbler ad copy example')}</strong></p>
    <blockquote>{kind==='headline'?(service?t('둘만의 쉼을 위한 하루','A day to unwind together'):t('출근길, 나의 한 잔','Your drink for the morning commute')):(service?t('우드 가구와 큰 창이 있는 2인 객실','A room for two with wooden furniture and a large window'):t('450mL 스테인리스 · 아이보리와 검정','450 mL stainless steel · Ivory and black'))}</blockquote>
    <p>{t('‘직접 입력’은 이 문구를 그대로 쓰도록 요청합니다. ‘AI가 만들기’는 상세설명을 바탕으로 문구를 작성합니다. 어느 방식이든 생성 후 글자와 사실을 확인해주세요.','“Write my own” requests your exact wording. “Let AI write it” drafts copy from the description. Check the lettering and facts after generation in either mode.')}</p>
   </>}
   <p className="input-example-note">{kind==='facts'?t('가상 예시입니다. 입력칸에 자동 추가되지 않습니다.','Fictional examples. Nothing is added to your fields automatically.'):t('이 예시는 입력 방법을 설명하기 위한 가상 내용입니다. 실제 상품·서비스에 맞는 사실만 사용하세요. 입력칸에는 자동으로 추가되지 않습니다.','These fictional examples explain how to write your input. Use only facts that apply to your offer. Nothing is added to your fields automatically.')}</p>
  </div>
 </details>;
}
