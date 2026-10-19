import {useUiLanguage} from './ui-language';

export function InputExampleGuide({kind,service}:{kind:'facts'|'headline'|'copy';service:boolean}){
 const {t}=useUiLanguage();
 const label=kind==='facts'?t('상세설명','Description'):kind==='headline'?t('광고 제목','Ad headline'):t('광고 설명','Ad supporting copy');
 const title=t('더 좋은 결과를 위한 예시 가이드','Example guide for better results');
 return <details className="input-example-guide" data-guide={kind}>
  <summary aria-label={`${label}: ${title}`}>{title}</summary>
  <div className="input-example-content">
   {kind==='facts'?<>
    <p>{t('무엇을 제공하는지, 실제 특징과 이용 대상부터 적어주세요. 가격·구성·기간·조건은 확인된 내용만 함께 적으면 광고의 핵심을 정하는 데 도움이 됩니다.','Start with what you offer, its actual features and who it is for. Include prices, contents, dates and conditions only when confirmed.')}</p>
    <p><strong>{service?t('숙소 서비스 상세설명 예시','Stay description example'):t('텀블러 상세설명 예시','Tumbler description example')}</strong></p>
    <blockquote>{service?t('두 사람이 머무는 우드 가구의 객실입니다. 객실 사진에 보이는 큰 창과 테이블이 특징입니다. 조용히 쉬고 싶은 커플에게 소개하고 싶습니다.','A room for two with wooden furniture. The large window and table shown in the room photos are its main features. We want to introduce it to couples looking for a quiet stay.'):t('450mL 스테인리스 텀블러입니다. 뚜껑이 있고 손잡이는 없으며, 아이보리와 검정 두 색상입니다. 출퇴근 때 음료를 챙기는 직장인에게 소개하고 싶습니다.','A 450 mL stainless-steel tumbler with a lid and no handle, available in ivory and black. We want to introduce it to commuters who carry a drink to work.')}</blockquote>
    <p>{t('배경·조명·글자 배치 같은 연출은 아래 ‘추가 요청 → 요청사항’에 따로 적어주세요. 예: “밝은 자연광 분위기, 제목은 위쪽에 크게”.','Put background, lighting and text-placement preferences in “Additional requests → Your requests” below. Example: “Bright natural light, with a large headline at the top.”')}</p>
    <p>{t('광고에 참고할 실제 상품·공간 사진을 첨부해주세요. 생성된 형태·색상·인쇄와 문구는 사진 및 입력 내용과 비교해 확인해주세요.','Attach actual product or space photos for the ad. Compare the generated shape, colors, printing and copy with your photos and supplied facts.')}</p>
   </>:<>
    <p>{kind==='headline'?t('이미지에 실제로 보일 짧은 제목을 적어주세요. 한 가지 메시지에 집중하고, 배경이나 촬영 지시는 ‘추가 요청’에 적어주세요.','Write the short headline that should appear on the image. Focus on one message; put background or photography directions in “Additional requests”.'):t('제목 아래에 실제로 보일 설명을 적어주세요. 특징·구성·가격 중 필요한 정보만 간결하게 쓰고, 가격이나 혜택에는 적용 조건도 함께 적어주세요.','Write the supporting copy that should appear below the headline. Keep features, contents or prices concise and include any conditions for prices or offers.')}</p>
    <p><strong>{service?t('숙소 광고 문구 예시','Stay ad copy example'):t('텀블러 광고 문구 예시','Tumbler ad copy example')}</strong></p>
    <blockquote>{kind==='headline'?(service?t('둘만의 쉼을 위한 하루','A day to unwind together'):t('출근길, 나의 한 잔','Your drink for the morning commute')):(service?t('우드 가구와 큰 창이 있는 2인 객실','A room for two with wooden furniture and a large window'):t('450mL 스테인리스 · 아이보리와 검정','450 mL stainless steel · Ivory and black'))}</blockquote>
    <p>{t('‘직접 입력’은 이 문구를 그대로 쓰도록 요청합니다. ‘AI가 만들기’는 상세설명을 바탕으로 문구를 작성합니다. 어느 방식이든 생성 후 글자와 사실을 확인해주세요.','“Write my own” requests your exact wording. “Let AI write it” drafts copy from the description. Check the lettering and facts after generation in either mode.')}</p>
   </>}
   <p className="input-example-note">{t('이 예시는 입력 방법을 설명하기 위한 가상 내용입니다. 실제 상품·서비스에 맞는 사실만 사용하세요. 입력칸에는 자동으로 추가되지 않습니다.','These fictional examples explain how to write your input. Use only facts that apply to your offer. Nothing is added to your fields automatically.')}</p>
  </div>
 </details>;
}
