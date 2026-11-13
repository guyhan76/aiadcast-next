import {useEffect,useId,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import type {Project} from './model';
import {industryGroups,industryLabel} from './industry';
import type {ProductCategory} from './industry';
import {withCategory} from './product';
import {useUiLanguage} from './ui-language';

// ───────── 업종 분류 ─────────
// category: 실제로 저장되는 기존 업종입니다. 서버와 같이 쓰는 값이라 기존 목록 안에서만 고릅니다.
// exact: 기존 업종과 뜻이 같으면 true. 아니면 선택할 때 상세설명 첫 줄에 '업종: 그룹 > 항목'을 넣어 AI에 알려줍니다.
// keywords: 검색어입니다. 띄어쓰기로 구분해 자유롭게 추가하면 됩니다.
type CatalogItem={ko:string;en:string;category:ProductCategory;exact?:boolean;keywords:string};
type CatalogSection={ko:string;en:string;items:CatalogItem[]};

const catalog:CatalogSection[]=[
 {ko:'상품',en:'Products',items:[
  {ko:'패션의류',en:'Fashion apparel',category:'fashion',exact:true,keywords:'옷 의류 패션 티셔츠 셔츠 블라우스 원피스 바지 청바지 니트 코트 패딩 속옷 잠옷 clothing apparel'},
  {ko:'패션잡화',en:'Fashion accessories',category:'accessories',exact:true,keywords:'잡화 모자 벨트 스카프 양말 장갑 선글라스 안경 시계 지갑 우산 accessories'},
  {ko:'뷰티',en:'Beauty',category:'beauty',exact:true,keywords:'화장품 코스메틱 스킨케어 기초 메이크업 색조 립스틱 선크림 향수 네일 헤어 샴푸 바디 cosmetics skincare makeup'},
  {ko:'출산/유아동',en:'Baby & kids',category:'other',keywords:'출산 유아 아기 베이비 육아 신생아 기저귀 분유 젖병 이유식 유모차 카시트 아동복 키즈 임산부 baby kids'},
  {ko:'식품',en:'Food',category:'food',exact:true,keywords:'음식 간식 과자 음료 커피 원두 차 밀키트 반찬 소스 농산물 수산물 축산물 과일 쌀 food snack drink'},
  {ko:'주방용품',en:'Kitchenware',category:'other',keywords:'주방 냄비 프라이팬 칼 도마 식기 그릇 접시 컵 텀블러 수저 밀폐용기 조리도구 kitchen cookware'},
  {ko:'생활용품',en:'Household goods',category:'beauty',keywords:'생활 세제 세탁 휴지 화장지 물티슈 수건 욕실 청소용품 방향제 수납 household'},
  {ko:'골프용품',en:'Golf equipment',category:'other',keywords:'골프 골프채 드라이버 아이언 퍼터 골프공 골프웨어 골프화 골프백 golf'},
  {ko:'홈인테리어',en:'Home interior',category:'home',exact:true,keywords:'인테리어 가구 침대 소파 의자 책상 수납장 조명 커튼 러그 침구 이불 소품 furniture interior'},
  {ko:'가전디지털',en:'Electronics & digital',category:'electronics',exact:true,keywords:'가전 디지털 tv 냉장고 세탁기 에어컨 청소기 휴대폰 스마트폰 노트북 태블릿 이어폰 카메라 컴퓨터 electronics'},
  {ko:'스포츠/레저',en:'Sports & leisure',category:'other',keywords:'스포츠 레저 캠핑 등산 낚시 자전거 운동기구 헬스기구 요가매트 수영복 스포츠웨어 outdoor sports'},
  {ko:'자동차용품',en:'Car accessories',category:'automotive',keywords:'자동차 차량 차량용 블랙박스 내비게이션 세차 타이어 시트커버 방향제 거치대 car'},
  {ko:'도서/음반/DVD',en:'Books, music & DVD',category:'other',keywords:'도서 책 서적 잡지 음반 앨범 cd lp dvd 블루레이 book music'},
  {ko:'완구/취미',en:'Toys & hobbies',category:'other',keywords:'완구 장난감 취미 피규어 프라모델 레고 퍼즐 보드게임 드론 toy hobby'},
  {ko:'문구/오피스',en:'Stationery & office',category:'other',keywords:'문구 오피스 필기구 펜 노트 다이어리 사무용품 프린터 복사용지 stationery office'},
  {ko:'반려동물용품',en:'Pet supplies',category:'other',keywords:'반려동물 애견 애묘 강아지 고양이 반려견 반려묘 사료 간식 펫 pet dog cat'},
  {ko:'헬스/건강식품',en:'Health supplements',category:'food',keywords:'헬스 건강식품 건강기능식품 영양제 비타민 홍삼 유산균 프로바이오틱스 단백질 프로틴 다이어트 supplement'},
  {ko:'악기',en:'Musical instruments',category:'other',keywords:'악기 피아노 기타 드럼 바이올린 우쿨렐레 키보드 instrument'},
  {ko:'아트/공예',en:'Art & crafts',category:'other',keywords:'아트 미술 그림 미술용품 물감 공예 수공예 핸드메이드 도자기 캔들 art craft'},
  {ko:'산업 기계/부품',en:'Industrial machinery & parts',category:'industrial',exact:true,keywords:'산업 기계 부품 장비 설비 공구 제조 자동화 센서 모터 베어링 machinery industrial parts equipment'},
  {ko:'포장재',en:'Packaging materials',category:'packaging',exact:true,keywords:'포장 포장재 박스 상자 쇼핑백 라벨 용기 비닐 파우치 완충재 packaging box pouch'},
]},
 {ko:'생활/홈 서비스',en:'Home services',items:[
  {ko:'청소',en:'Cleaning',category:'services',keywords:'청소 입주청소 이사청소 홈클리닝 에어컨청소 cleaning'},
  {ko:'이사',en:'Moving',category:'services',keywords:'이사 포장이사 용달 이삿짐 moving'},
  {ko:'인테리어 시공',en:'Interior construction',category:'services',keywords:'시공 리모델링 도배 장판 타일 욕실 interior'},
  {ko:'수리',en:'Repair',category:'services',keywords:'수리 설치 집수리 가전수리 누수 보일러 repair'},
  {ko:'펫시터',en:'Pet sitting',category:'services',keywords:'펫시터 반려동물 강아지 고양이 돌봄 산책 펫호텔 pet dog cat'},
 ]},
 {ko:'비즈니스/전문직 서비스',en:'Business & professional services',items:[
  {ko:'디자인',en:'Design',category:'services',keywords:'디자인 로고 브랜딩 상세페이지 웹디자인 편집디자인 패키지디자인 일러스트 영상편집 design'},
  {ko:'IT·프로그래밍',en:'IT & programming',category:'services',keywords:'개발 프로그래밍 코딩 앱개발 웹개발 홈페이지제작 쇼핑몰제작 유지보수 programming developer'},
  {ko:'마케팅',en:'Marketing',category:'services',keywords:'마케팅 광고대행 광고 홍보 sns 인스타그램 블로그 바이럴 검색광고 marketing'},
  {ko:'번역',en:'Translation',category:'services',keywords:'번역 통역 영어 일본어 중국어 translation'},
  {ko:'회계',en:'Accounting',category:'services',keywords:'회계 기장 재무 결산 회계사 accounting'},
  {ko:'세무',en:'Tax',category:'services',keywords:'세무 세금 세무사 종합소득세 부가세 연말정산 절세 tax'},
  {ko:'법무',en:'Legal',category:'services',keywords:'법무 법률 변호사 법률상담 계약서 소송 특허 상표 법무사 행정사 legal law'},
  {ko:'컨설팅',en:'Consulting',category:'services',keywords:'컨설팅 경영 창업 사업계획 자문 코칭 consulting'},
  {ko:'의료',en:'Medical',category:'hospital',exact:true,keywords:'의료 병원 의원 치과 한의원 피부과 성형외과 안과 검진 clinic medical'},
  {ko:'바이오',en:'Biotech',category:'biotech',exact:true,keywords:'바이오 제약 신약 연구 임상 biotech'},
 ]},
 {ko:'교육·레슨·취미',en:'Education, lessons & hobbies',items:[
  {ko:'어학',en:'Languages',category:'education',keywords:'어학 외국어 영어 영어회화 일본어 중국어 토익 토플 language english'},
  {ko:'직무 교육',en:'Job skills training',category:'education',keywords:'직무 실무 자격증 취업 코딩교육 엑셀 기업교육 training'},
  {ko:'운동·PT',en:'Fitness & PT',category:'fitness',keywords:'운동 퍼스널트레이닝 헬스 피트니스 홈트 다이어트 gym fitness'},
  {ko:'악기 레슨',en:'Music lessons',category:'education',keywords:'악기 레슨 피아노 기타 드럼 바이올린 보컬 노래 음악 music lesson'},
  {ko:'공예 클래스',en:'Craft classes',category:'education',keywords:'공예 클래스 원데이클래스 도자기 캔들 가죽공예 플라워 꽃꽂이 베이킹 미술 craft class'},
 ]},
 {ko:'여행·티켓·렌탈',en:'Travel, tickets & rentals',items:[
  {ko:'숙박 예약',en:'Accommodation',category:'lodging',exact:true,keywords:'숙박 숙소 호텔 펜션 리조트 게스트하우스 풀빌라 hotel stay'},
  {ko:'항공권',en:'Flights',category:'travel',keywords:'항공권 항공 비행기 해외여행 국내여행 여행사 flight'},
  {ko:'공연·전시 티켓',en:'Show & exhibition tickets',category:'services',keywords:'공연 전시 티켓 콘서트 뮤지컬 연극 전시회 페스티벌 ticket concert'},
  {ko:'공간 대여',en:'Space rental',category:'rental',keywords:'공간대여 대관 파티룸 스튜디오 회의실 연습실 공유오피스 space'},
  {ko:'장비 렌탈',en:'Equipment rental',category:'rental',keywords:'장비 렌탈 렌트 대여 카메라 캠핑장비 음향장비 equipment rental'},
  {ko:'리스',en:'Leasing',category:'lease',exact:true,keywords:'리스 장비리스 자동차리스 차량리스 운용리스 금융리스 장기렌트 lease leasing'},
 ]},
 {ko:'부동산 서비스',en:'Real estate services',items:[
  {ko:'분양',en:'New property sales',category:'realestate',keywords:'부동산 분양 신규분양 아파트분양 오피스텔분양 상가분양 지식산업센터 타운하우스 모델하우스 견본주택 청약 presale'},
  {ko:'중개',en:'Brokerage',category:'realestate',keywords:'부동산 중개 공인중개사 중개사무소 매매 전세 월세 원룸 투룸 아파트 빌라 broker realtor'},
  {ko:'임대·임대관리',en:'Rental housing & management',category:'realestate',keywords:'부동산 임대 임대관리 주택임대 임대사업 셰어하우스 쉐어하우스 고시원 레지던스 landlord'},
  {ko:'상가·사무실',en:'Retail & office space',category:'realestate',keywords:'부동산 상가 사무실 오피스 빌딩 공장 창고 점포 commercial office'},
  {ko:'토지·개발',en:'Land & development',category:'realestate',keywords:'부동산 토지 땅 개발 시행 재개발 재건축 전원주택 land'},
  {ko:'경매·공매',en:'Auctions',category:'realestate',keywords:'부동산 경매 공매 법원경매 낙찰 auction'},
  {ko:'부동산 컨설팅',en:'Real estate consulting',category:'realestate',keywords:'부동산 컨설팅 투자 자산관리 상권분석 consulting'},
  {ko:'건물·시설 관리',en:'Property management',category:'realestate',keywords:'부동산 건물관리 시설관리 빌딩관리 관리사무소 property management'},
  {ko:'기타 부동산',en:'Other real estate',category:'realestate',exact:true,keywords:'부동산 기타 real estate'},
 ]},
 {ko:'디지털·구독 서비스',en:'Digital & subscriptions',items:[
  {ko:'OTT',en:'OTT streaming',category:'services',keywords:'영상 동영상 스트리밍 드라마 영화 video streaming'},
  {ko:'전자책',en:'E-books',category:'services',keywords:'전자책 이북 ebook 웹툰 웹소설 오디오북'},
  {ko:'음원 스트리밍',en:'Music streaming',category:'services',keywords:'음원 음악 스트리밍 music streaming'},
  {ko:'멤버십',en:'Memberships',category:'services',keywords:'멤버십 구독 정기결제 정기구독 회원권 정기배송 membership subscription'},
  {ko:'SaaS(소프트웨어)',en:'SaaS (software)',category:'services',keywords:'소프트웨어 프로그램 앱 솔루션 클라우드 구독형 software app'},
 ]},
];

// 위 분류와 뜻이 같은 기존 업종은 검색 결과에 두 번 나오지 않게 뺍니다.
const covered=new Set(catalog.flatMap(s=>s.items.filter(i=>i.exact).map(i=>i.category)));
const industryLine=/^(?:업종|Industry): (.*)(?:\r?\n|$)/;
const wordSplit=/[\s·&\/(),>.]+/;
const wrap:CSSProperties={display:'flex',flexWrap:'wrap',gap:6,listStyle:'none',padding:0,margin:0};
const chip:CSSProperties={padding:'6px 12px',border:'1px solid #d4d4d8',borderRadius:999,background:'#fff',cursor:'pointer',fontSize:'0.9rem',maxWidth:'100%',overflowWrap:'anywhere',textAlign:'left'};
type Option={key:string;label:string;group:string;category:ProductCategory;line:string|null;haystack:string;words:string[]};
const option=(key:string,label:string,group:string,category:ProductCategory,line:string|null,search:string[]):Option=>{const haystack=search.join(' ').toLowerCase();return {key,label,group,category,line,haystack,words:haystack.split(wordSplit)};};
// 영어·숫자 검색어는 단어 앞부분으로, 한글은 포함 여부로 찾습니다.
const hit=(o:Option,w:string)=>/^[a-z0-9]+$/.test(w)?o.words.some(x=>x.startsWith(w)):o.haystack.includes(w);

export function IndustrySearch({project,chosen,onChosen,change}:{project:Project;chosen:boolean;onChosen:()=>void;change:(fn:(p:Project)=>Project)=>void}){
 const {t,text}=useUiLanguage(),id=useId();
 const tr=(s:string)=>String(text(s));
 const [query,setQuery]=useState('');
 const browse=useRef<HTMLDetailsElement>(null);
 const category=project.productProfile.category;
 const previous=useRef(category),expected=useRef<ProductCategory|null>(null);
 // 아래 콤보박스로 업종을 바꾸면 검색어와 '업종:' 줄을 지웁니다. 이 검색창에서 고른 경우는 그대로 둡니다.
 useEffect(()=>{
  if(previous.current===category)return;
  previous.current=category;
  const own=expected.current===category;expected.current=null;setQuery('');
  if(!own)change(p=>industryLine.test(p.productProfile.material)?{...p,productProfile:{...p.productProfile,material:p.productProfile.material.replace(industryLine,'')}}:p);
 },[category]);

 const lineOf=(s:CatalogSection,item:CatalogItem)=>item.exact?null:`${t(s.ko,s.en)} > ${t(item.ko,item.en)}`;
 const options:Option[]=[
  ...catalog.flatMap((s,si)=>s.items.map((item,ii)=>option(`c${si}-${ii}`,t(item.ko,item.en),t(s.ko,s.en),item.category,lineOf(s,item),[item.ko,item.en,item.keywords]))),
  ...industryGroups.flatMap(g=>g.categoryIds.filter(c=>!covered.has(c)).map(c=>option('i-'+c,tr(industryLabel(c)),tr(g.label),c,null,[industryLabel(c),tr(industryLabel(c)),g.label,tr(g.label)]))),
 ];
 const name=query.trim().slice(0,40),tokens=name.toLowerCase().split(/\s+/).filter(Boolean);
 const matches=tokens.length?options.filter(o=>tokens.every(w=>hit(o,w))):[];
 const current=chosen?industryLine.exec(project.productProfile.material)?.[1]:undefined;

 function pick(next:ProductCategory,line:string|null){
  onChosen();setQuery('');if(browse.current)browse.current.open=false;
  expected.current=next!==category?next:null;
  change(p=>{const body=p.productProfile.material.replace(industryLine,''),base=withCategory(p,next);return {...base,productProfile:{...base.productProfile,material:(line?`${t('업종','Industry')}: ${line}\n${body}`:body).slice(0,2000)}};});
 }

 return <div className="field industry-search">
  <label htmlFor={id}>{t('업종 검색','Search industries')}</label>
  <input id={id} type="search" maxLength={40} autoComplete="off" value={query} placeholder={t('상품명·서비스명으로 검색 (예: 패션, 식품, 교육, 부동산)','e.g. cosmetics, real estate, dog food')} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key!=='Enter')return;e.preventDefault();const only=matches.length===1?matches[0]:undefined;if(only)pick(only.category,only.line);}}/>
  {tokens.length>0&&<div style={{display:'grid',gap:8,marginTop:6}}>
   {matches.length>0&&<ul aria-label={t('검색 결과','Search results')} style={wrap}>{matches.slice(0,12).map(o=><li key={o.key}><button type="button" style={chip} onClick={()=>pick(o.category,o.line)}>{o.label} <small style={{color:'#6b7280'}}>{o.group}</small></button></li>)}</ul>}
   <div style={{padding:'10px 12px',background:'#f4f4f5',borderRadius:8}}>
    <p style={{margin:'0 0 6px',fontSize:'0.9rem'}}>{matches.length?t('찾는 업종이 없으면 직접 입력하세요.','Not listed? Use your own.'):t('목록에 없는 업종입니다. 직접 입력해서 사용하세요.','Not in the list. Use it as your own industry.')}</p>
    <div style={wrap}>
     <button type="button" style={chip} onClick={()=>pick('other',name)}>{t(`'${name}' 상품으로 입력`,`Use '${name}' as a product`)}</button>
     <button type="button" style={chip} onClick={()=>pick('services',name)}>{t(`'${name}' 서비스로 입력`,`Use '${name}' as a service`)}</button>
    </div>
   </div>
  </div>}
  <details ref={browse} style={{marginTop:6}}>
   <summary style={{cursor:'pointer',fontSize:'0.9rem'}}>{t('업종 분류 전체 보기','Browse all industry types')}</summary>
   {catalog.map((s,si)=><div key={si} style={{marginTop:10}}>
    <p style={{margin:'0 0 6px',fontWeight:700,fontSize:'0.9rem'}}>{t(s.ko,s.en)}</p>
    <div style={wrap}>{s.items.map((item,ii)=><button key={ii} type="button" style={chip} onClick={()=>pick(item.category,lineOf(s,item))}>{t(item.ko,item.en)}</button>)}</div>
   </div>)}
  </details>
  {!tokens.length&&current&&<p className="help">{t('선택한 업종','Selected industry')}: {current} · {t('상세설명 첫 줄에서 고칠 수 있습니다.','You can edit it in the first line of the description.')}</p>}
 </div>;
}
