import {useUiLanguage} from './ui-language';

function ExampleParagraphs({text}:{text:string}){
 return <>{text.split(/(?<=\.) /).map((sentence,index)=><p className="input-example-sentence" key={index}>{index>0?' ':''}{sentence.split(/(KRW [0-9,]+|[0-9,]+만?원)/g).map((part,i)=>/^(KRW [0-9,]+|[0-9,]+만?원)$/.test(part)?<span className="input-example-price" key={i}>{part}</span>:part)}</p>)}</>;
}

export function InputExampleGuide({kind,service}:{kind:'facts'|'headline'|'copy';service:boolean}){
 const {t}=useUiLanguage();
 const label=kind==='facts'?t('상세설명','Description'):kind==='headline'?t('광고 제목','Ad headline'):t('광고 설명','Ad supporting copy');
 const title=t('더 좋은 결과를 위한 예시 가이드','Example guide for better results');
 return <details className="input-example-guide" data-guide={kind}>
  <summary aria-label={`${label}: ${title}`}>{title}</summary>
  <div className="input-example-content">
   {kind==='facts'?<>
    <p>{t('상품 정보는 정확하게, 원하는 연출은 구체적으로.', 'Keep product facts accurate and creative directions specific.')}</p>
    <p><strong>{service?t('여행상품 예시 · 가상 상품','Travel package example · Fictional offer'):t('화장품 예시 · 가상 상품','Cosmetics example · Fictional offer')}</strong></p>
    <p><strong>{t('상세설명','Description')}</strong></p>
    <blockquote><ExampleParagraphs text={service?t('바쁜 직장인 커플을 위한 제주 2박 3일 휴식 여행이에요. 호텔 2박과 조식이 포함되며 항공권은 별도예요. 가격은 1인 39만원부터이고 출발일에 따라 달라져요.', 'A relaxing 3-day, 2-night Jeju trip for busy working couples. Includes two hotel nights and breakfast; flights are extra. From KRW 390,000 per person, depending on departure date.'):t('건조한 피부를 위한 보습 크림 50ml로, 가볍게 발리고 끈적임이 적어요. 바쁜 20~30대가 매일 쓰기 좋은 제품이에요. 가격은 29,000원이에요.', 'A 50 ml moisturizer for dry skin with a lightweight, non-sticky feel. For busy people in their 20s and 30s looking for daily hydration. Price: KRW 29,000.')}/>{!service&&<p className="input-example-sentence" data-example-delivery>{t('당일로켓배송','Same-day Rocket delivery')}</p>}</blockquote>
    <p><strong>{t('추가 요청','Additional requests')}</strong></p>
    <blockquote><ExampleParagraphs text={service?t('푸른 바다와 맑은 햇살로 여유로운 분위기를 표현해주세요. 여행사명과 일정·시작 가격을 강조하고, ‘지금 예약하세요’ 같은 예약 유도 문구를 넣어주세요. 호텔·조식 포함, 항공권 별도, 출발일별 가격 변동 조건도 분명히 표시해주세요.', 'Create a relaxed mood with blue ocean scenery and clear sunlight. Highlight the travel company name, trip duration and starting price, and include a call to action such as “Book now”. Clearly state that hotel and breakfast are included, flights are extra, and prices vary by departure date.'):t('밝은 베이지 배경과 부드러운 자연광으로 제품을 중앙에 크게 배치해주세요. 브랜드명과 가격을 눈에 띄게 강조하고, ‘지금 만나보세요’ 같은 구매 유도 문구를 넣어주세요.', 'Use a light beige background and soft natural light, with the product large and centered. Make the brand name and price stand out, and include a shopping call to action such as “Shop now”.')}/></blockquote>
    <p>{t('정보·가격·포함 사항은 실제 상품에 맞게 바꿔주세요.', 'Replace the facts, prices and inclusions with your actual offer.')}</p>
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
