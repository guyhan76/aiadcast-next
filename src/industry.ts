// Stable leaf IDs keep saved projects compatible while the UI groups choices visually.
export const productCategories = [
  ['packaging', '기타'], ['food', '식품·음료'], ['beauty', '뷰티·생활용품'],
  ['electronics', '전자제품'], ['fashion', '의류·패션'], ['home', '가구·인테리어'],
  ['industrial', '산업용 부품·장비'], ['automotive', '자동차·모빌리티'],
  ['education', '교육·강의'], ['insurance', '보험'], ['services', '서비스 업종'], ['other', '기타 실물 상품'],
  ['restaurant', '음식점'], ['cafe', '카페·디저트'], ['lodging', '호텔·숙박'], ['travel', '여행'],
  ['fitness', '헬스'], ['yoga', '요가'], ['pilates', '필라테스'], ['swimming', '수영'],
  ['tennis', '테니스'], ['golf', '골프'], ['sports', '기타 스포츠'],
  ['hospital', '병원·의료'], ['biotech', '바이오'], ['realestate', '부동산'],
  ['securities', '증권'], ['stocks', '주식'], ['crypto', '코인·디지털 자산'],
  ['finance', '금융'], ['banking', '은행'], ['lease', '리스'], ['rental', '렌탈'],
  ['logistics', '물류·배송'], ['delivery', '배달 서비스'],
  ['corporate', '기업 홍보'], ['brand', '브랜드·업체'],
  ['tarot', '타로'], ['astrology', '별자리'], ['myeongri', '명리학'], ['sinjeom', '신점'],
  ['bags', '가방'], ['shoes', '신발'], ['jewelry', '주얼리'], ['accessories', '패션잡화'],
  ['boxes', '박스'], ['shoppingbags', '쇼핑백'], ['labels', '라벨'], ['containers', '용기'], ['plasticfilm', '비닐'], ['pouches', '파우치'],
] as const;

export type ProductCategory = typeof productCategories[number][0];
const legacyCategories:Readonly<Record<string,ProductCategory>>={saju:'myeongri',fortunehouse:'myeongri',divination:'sinjeom'};

export function resolveIndustryCategory(value:unknown):ProductCategory|undefined {
  const category=typeof value==='string'?(legacyCategories[value]??value):undefined;
  return productCategories.find(([id])=>id===category)?.[0];
}

export type IndustryKind = 'product'|'service';
export const industryKinds:readonly {id:IndustryKind;label:string;description:string;defaultCategory:ProductCategory}[] = [
  {id:'product',label:'상품',description:'전자기기 · 패션 · 포장재 · 식품 등',defaultCategory:'other'},
  {id:'service',label:'서비스',description:'음식점 · 교육 · 여행 · 금융 등',defaultCategory:'services'},
];

export type IndustryGroupId = 'packaging'|'products'|'fashion'|'electronics'|'industrial'|'food'|'beauty'|'home'|'automotive'|'dining'|'travel'|'learning'|'sports'|'health'|'property'|'finance'|'mobility'|'logistics'|'corporate'|'brand'|'fortune'|'business';
export type IndustryGroup = {id:IndustryGroupId;kind:IndustryKind;label:string;description:string;categoryIds:readonly ProductCategory[]};

export const industryGroups:readonly IndustryGroup[] = [
  {id:'electronics',kind:'product',label:'전자기기·가전',description:'기능과 일상의 편리함',categoryIds:['electronics']},
  {id:'fashion',kind:'product',label:'패션·스타일',description:'의류부터 주얼리까지',categoryIds:['fashion','bags','shoes','jewelry','accessories']},
  {id:'packaging',kind:'product',label:'포장재',description:'박스부터 파우치까지',categoryIds:['boxes','shoppingbags','labels','containers','plasticfilm','pouches','packaging']},
  {id:'industrial',kind:'product',label:'산업재',description:'부품·장비와 기술',categoryIds:['industrial']},
  {id:'food',kind:'product',label:'식품·음료',description:'식탁에 전하는 제품',categoryIds:['food']},
  {id:'beauty',kind:'product',label:'뷰티·생활용품',description:'일상을 위한 제품',categoryIds:['beauty']},
  {id:'home',kind:'product',label:'가구·인테리어',description:'공간을 채우는 취향',categoryIds:['home']},
  {id:'automotive',kind:'product',label:'자동차·모빌리티',description:'차량과 이동의 가치',categoryIds:['automotive']},
  {id:'products',kind:'product',label:'기타 상품',description:'그 밖의 다양한 제품',categoryIds:['other']},
  {id:'dining',kind:'service',label:'음식·매장',description:'메뉴와 공간의 매력',categoryIds:['restaurant','cafe']},
  {id:'travel',kind:'service',label:'숙박·여행',description:'머무름과 여행의 경험',categoryIds:['lodging','travel']},
  {id:'learning',kind:'service',label:'교육',description:'배움과 성장의 기회',categoryIds:['education']},
  {id:'sports',kind:'service',label:'스포츠·운동',description:'운동과 레슨의 경험',categoryIds:['fitness','yoga','pilates','swimming','tennis','golf','sports']},
  {id:'health',kind:'service',label:'의료·바이오',description:'의료 서비스와 연구 분야',categoryIds:['hospital','biotech']},
  {id:'property',kind:'service',label:'부동산',description:'다음 공간을 위한 선택',categoryIds:['realestate']},
  {id:'finance',kind:'service',label:'금융·보험',description:'조건을 이해하는 금융',categoryIds:['insurance','securities','stocks','crypto','finance','banking']},
  {id:'mobility',kind:'service',label:'리스·렌탈',description:'필요에 맞는 이용 방식',categoryIds:['lease','rental']},
  {id:'logistics',kind:'service',label:'물류·배송·배달',description:'배송과 배달 서비스',categoryIds:['logistics','delivery']},
  {id:'corporate',kind:'service',label:'기업·브랜드 홍보',description:'기업과 브랜드의 가치',categoryIds:['corporate','brand']},
  {id:'business',kind:'service',label:'기타 서비스',description:'그 밖의 서비스',categoryIds:['services']},
  {id:'fortune',kind:'service',label:'사주·운세',description:'나에게 맞는 상담의 시작',categoryIds:['tarot','astrology','myeongri','sinjeom']},
];

const physicalCategories:readonly ProductCategory[] = ['packaging','food','beauty','electronics','fashion','home','industrial','other','automotive','bags','shoes','jewelry','accessories','boxes','shoppingbags','labels','containers','plasticfilm','pouches'];
export const isPhysicalCategory = (category:ProductCategory) => physicalCategories.includes(category);

export function industryGroupFor(category:ProductCategory):IndustryGroup {
  return industryGroups.find(group=>group.categoryIds.includes(category))!;
}
export function industryKindFor(category:ProductCategory):IndustryKind {return industryGroupFor(category).kind;}
export function industryGroupsFor(kind:IndustryKind):readonly IndustryGroup[] {return industryGroups.filter(group=>group.kind===kind);}
export function industryLabel(category:ProductCategory):string {
  return productCategories.find(([id])=>id===category)![1];
}

export type IndustryDirection = {id:'brand'|'offer'|'trust';label:string;description:string;headline:string;cta:string};
type DirectionCopy = readonly [label:string,description:string,headline:string,cta:string];
type IndustryContent = {placeholder:string;audience:string;directions:readonly [DirectionCopy,DirectionCopy,DirectionCopy]};

// These are editable starting directions, not inferred facts about a business.
// Prices, outcomes, clinical effects and investment returns are never fabricated.
const content:Record<ProductCategory,IndustryContent> = {
  logistics:{placeholder:'예: 택배·물류 서비스 이름',audience:'배송 서비스·요금·배송 지역을 비교하는 고객',directions:[
    ['서비스 소개','물류·배송 서비스 소개','안전한 배송을 만나보세요','서비스 보기'],
    ['배송 안내','서비스와 요금 안내','필요한 배송 서비스를 찾아보세요','배송 문의'],
    ['서비스 정보','제공한 배송 지역·시간 정보','이용 전에 살펴보는 서비스 안내','상세 정보 보기'],
  ]},
  delivery:{placeholder:'예: 음식 배달 서비스 이름',audience:'배달 메뉴·배달 시간·배달료를 비교하는 고객',directions:[
    ['서비스 소개','배달 서비스 소개','신속한 배달을 만나보세요','서비스 보기'],
    ['배달 안내','이용 방법과 요금 안내','필요한 배달을 주문해보세요','배달 주문'],
    ['서비스 정보','제공한 배달 지역·시간 정보','주문 전에 살펴보는 배달 안내','상세 정보 보기'],
  ]},
  corporate:{placeholder:'예: 기업명 또는 브랜드명',audience:'기업·브랜드의 사업 분야와 가치를 살펴보는 고객·파트너',directions:[
    ['기업·브랜드 소개','기업·브랜드의 방향과 가치','우리가 만드는 가치를 소개합니다','기업 소개 보기'],
    ['사업·협력 안내','사업 분야와 문의 방법','함께 만들어갈 기회를 만나보세요','협력 문의'],
    ['사업 정보','제공한 사업과 보유 역량','협력 전에 살펴보는 기업 이야기','사업 분야 보기'],
  ]},
  brand:{placeholder:'예: 브랜드명',audience:'브랜드의 정체성과 가치를 살펴보는 고객',directions:[
    ['브랜드 소개','브랜드의 방향과 정체성','우리 브랜드의 이야기를 알아보세요','브랜드 보기'],
    ['브랜드 가치','브랜드가 전하는 이야기','브랜드와 함께하는 경험을 만나보세요','더 알아보기'],
    ['브랜드 정보','제공한 브랜드와 보유 이야기','브랜드를 더 깊게 알아보기','브랜드 스토리 보기'],
  ]},
  packaging:{placeholder:'예: 기타 포장재 이름',audience:'포장 방식과 발주 조건을 비교하는 고객',directions:[
    ['브랜드 소개','소재와 브랜드의 분위기','제품을 담는 브랜드의 방식','제품 보기'],
    ['제품 안내','규격과 사용 목적 소개','필요한 포장을 만나보세요','제품 문의'],
    ['디테일 소개','제공한 소재·구조 정보','선택에 필요한 포장 정보','상세 정보 보기'],
  ]},
  boxes:{placeholder:'예: 크라프트 택배박스',audience:'박스의 형태·규격·인쇄와 발주 조건을 비교하는 고객',directions:[
    ['브랜드 소개','박스와 브랜드의 분위기','제품을 담는 우리 브랜드의 방식','박스 보기'],
    ['제품·제작 안내','박스의 용도와 제작 옵션','제품에 어울리는 박스를 만나보세요','제작 문의'],
    ['규격·소재 안내','제공한 크기·소재·인쇄 정보','발주 전에 살펴보는 박스 정보','제품 정보 보기'],
  ]},
  shoppingbags:{placeholder:'예: 로고 인쇄 종이 쇼핑백',audience:'쇼핑백의 소재·크기·인쇄와 제작 조건을 비교하는 고객',directions:[
    ['브랜드 소개','쇼핑백과 브랜드의 분위기','브랜드의 이야기를 담아 전하세요','쇼핑백 보기'],
    ['제품·제작 안내','쇼핑백의 사용 장면과 제작 옵션','우리 브랜드에 어울리는 쇼핑백','제작 문의'],
    ['규격·소재 안내','제공한 크기·소재·손잡이 정보','선택 전에 살펴보는 쇼핑백 디테일','상세 정보 보기'],
  ]},
  labels:{placeholder:'예: 브랜드 로고 스티커 라벨',audience:'라벨의 형태·소재·인쇄와 부착 용도를 비교하는 고객',directions:[
    ['브랜드 소개','라벨 디자인과 브랜드의 분위기','작은 라벨에 담는 브랜드의 인상','라벨 보기'],
    ['제품·제작 안내','라벨의 사용 목적과 인쇄 옵션','제품에 어울리는 라벨을 만나보세요','제작 문의'],
    ['규격·소재 안내','제공한 크기·소재·부착 정보','제작 전에 살펴보는 라벨 정보','제작 정보 보기'],
  ]},
  containers:{placeholder:'예: 브랜드 유리 용기',audience:'용기의 형태·소재·규격과 사용 목적을 비교하는 고객',directions:[
    ['브랜드 소개','용기와 제품의 분위기','담는 방식에서 시작하는 브랜드','용기 보기'],
    ['제품 안내','용기의 사용 장면과 구성','제품에 맞는 용기를 만나보세요','제품 문의'],
    ['규격·소재 안내','제공한 치수·소재·용량 정보','선택 전에 살펴보는 용기 디테일','제품 정보 보기'],
  ]},
  plasticfilm:{placeholder:'예: 제품 포장용 비닐',audience:'비닐의 소재·크기·두께와 인쇄 조건을 비교하는 고객',directions:[
    ['브랜드 소개','비닐 포장과 브랜드의 분위기','제품을 전하는 포장의 한 가지 방식','비닐 포장재 보기'],
    ['제품·제작 안내','포장 용도와 제작 옵션','용도에 맞는 비닐 포장을 만나보세요','제작 문의'],
    ['규격·소재 안내','제공한 크기·소재·두께 정보','발주 전에 살펴보는 비닐 포장 정보','상세 정보 보기'],
  ]},
  pouches:{placeholder:'예: 지퍼형 스탠딩 파우치',audience:'파우치의 형태·소재·크기와 마감 방식을 비교하는 고객',directions:[
    ['브랜드 소개','파우치와 브랜드의 분위기','제품의 인상을 담는 파우치','파우치 보기'],
    ['제품·제작 안내','파우치의 사용 장면과 제작 옵션','제품에 어울리는 파우치를 만나보세요','제작 문의'],
    ['규격·소재 안내','제공한 크기·소재·마감 정보','선택 전에 살펴보는 파우치 디테일','제품 정보 보기'],
  ]},
  food:{placeholder:'예: 브랜드 그래놀라',audience:'원재료와 제품 정보를 확인하는 식품 구매 고객',directions:[
    ['브랜드 소개','제품과 식탁의 분위기','식탁에 더하는 새로운 선택','브랜드 보기'],
    ['제품 안내','제품과 즐기는 방법','오늘의 식탁에서 만나보세요','제품 보기'],
    ['원재료 소개','확인된 원재료·구성 정보','알고 고르는 식품 이야기','제품 정보 보기'],
  ]},
  beauty:{placeholder:'예: 브랜드 핸드크림',audience:'성분과 사용 방법을 비교하는 뷰티·생활용품 고객',directions:[
    ['브랜드 소개','감각적인 일상의 장면','일상에 담는 나만의 취향','브랜드 보기'],
    ['제품 안내','제품과 사용 장면','일상의 루틴을 만나보세요','제품 보기'],
    ['성분·소재 소개','확인된 성분과 사용 정보','선택 전에 살펴보는 제품 정보','상세 정보 보기'],
  ]},
  electronics:{placeholder:'예: 무선 헤드폰',audience:'기능과 사용 환경을 비교하는 전자제품 고객',directions:[
    ['브랜드 소개','디자인과 사용 경험','기술이 만나는 일상의 장면','브랜드 보기'],
    ['제품 안내','입력한 기능과 사용 목적','내 일상에 맞는 기술을 만나보세요','제품 보기'],
    ['기능·사양 소개','확인된 기능과 호환 정보','사용 전에 확인하는 제품 사양','사양 보기'],
  ]},
  fashion:{placeholder:'예: 브랜드 울 재킷',audience:'디자인과 소재·사이즈를 비교하는 패션 고객',directions:[
    ['컬렉션 소개','브랜드의 스타일과 분위기','취향을 표현하는 한 가지 선택','컬렉션 보기'],
    ['제품·스타일링','제품과 함께하는 일상의 장면','오늘의 스타일을 만나보세요','제품 보기'],
    ['소재·사이즈 안내','제공한 소재와 사이즈 정보','디테일로 살펴보는 나의 선택','상세 정보 보기'],
  ]},
  bags:{placeholder:'예: 브랜드 레더 숄더백',audience:'가방의 디자인·소재·수납 구성을 비교하는 고객',directions:[
    ['컬렉션 소개','가방과 브랜드의 분위기','나의 취향을 담는 가방','컬렉션 보기'],
    ['제품·스타일링','가방과 어울리는 스타일','오늘의 스타일에 더하는 한 가지','가방 보기'],
    ['소재·디테일 안내','제공한 소재·크기·수납 정보','선택 전에 살펴보는 가방의 디테일','제품 정보 보기'],
  ]},
  shoes:{placeholder:'예: 브랜드 레더 스니커즈',audience:'신발의 디자인·소재·사이즈를 비교하는 고객',directions:[
    ['컬렉션 소개','신발과 브랜드의 분위기','발끝에서 시작하는 나의 스타일','컬렉션 보기'],
    ['제품·스타일링','신발과 일상의 스타일링','오늘의 옷차림에 어울리는 선택','신발 보기'],
    ['소재·사이즈 안내','제공한 소재·사이즈·관리 정보','구매 전에 살펴보는 신발 정보','사이즈 안내 보기'],
  ]},
  jewelry:{placeholder:'예: 브랜드 실버 링',audience:'주얼리의 디자인·소재·사이즈를 살펴보는 고객',directions:[
    ['컬렉션 소개','주얼리의 형태와 브랜드 분위기','작은 디테일에 담는 나의 취향','컬렉션 보기'],
    ['제품·스타일링','주얼리와 함께하는 스타일','일상에 더하는 하나의 포인트','주얼리 보기'],
    ['소재·디테일 안내','제공한 소재·크기·관리 정보','선택 전에 살펴보는 주얼리 정보','상세 정보 보기'],
  ]},
  accessories:{placeholder:'예: 브랜드 실크 스카프',audience:'모자·벨트·스카프 등 패션잡화를 비교하는 고객',directions:[
    ['컬렉션 소개','잡화와 브랜드의 스타일','취향을 완성하는 작은 선택','컬렉션 보기'],
    ['제품·스타일링','잡화와 어울리는 옷차림','오늘의 스타일에 포인트를 더하세요','제품 보기'],
    ['소재·디테일 안내','제공한 소재·크기·관리 정보','디테일로 살펴보는 패션잡화','상세 정보 보기'],
  ]},
  home:{placeholder:'예: 원목 라운지 체어',audience:'공간과 제품의 어울림을 비교하는 고객',directions:[
    ['공간 제안','취향이 담긴 공간의 분위기','내 취향으로 채우는 공간','컬렉션 보기'],
    ['제품 안내','가구와 생활 속 사용 장면','나의 공간에 어울리는 선택','제품 보기'],
    ['소재·규격 소개','제공한 소재와 크기 정보','공간에 맞춰 살펴보는 디테일','제품 문의'],
  ]},
  industrial:{placeholder:'예: 산업용 센서 모듈',audience:'사양과 도입 조건을 검토하는 구매·기술 담당자',directions:[
    ['기업·기술 소개','기업과 기술 분야 소개','현장을 위한 기술을 소개합니다','기업 소개 보기'],
    ['제품 안내','제품의 용도와 적용 분야','현장에 필요한 제품을 살펴보세요','도입 문의'],
    ['기술 정보','확인된 사양과 적용 조건','도입 전에 확인하는 기술 정보','사양 보기'],
  ]},
  automotive:{placeholder:'예: 전기 SUV 모델',audience:'차량의 사양과 구매 조건을 비교하는 고객',directions:[
    ['브랜드 소개','차량과 라이프스타일의 분위기','이동의 순간에 담는 나의 취향','모델 보기'],
    ['차량 안내','제공한 차량과 이용 정보','나의 일상에 맞는 차를 만나보세요','차량 상담'],
    ['사양·조건 안내','확인된 사양과 계약 조건','선택 전에 살펴보는 차량 정보','상세 정보 보기'],
  ]},
  education:{placeholder:'예: 성인 영어 회화 수업',audience:'수업 내용과 수강 조건을 비교하는 예비 수강생',directions:[
    ['교육 소개','배움의 방향과 수업 분위기','나의 배움을 시작하는 곳','교육 소개 보기'],
    ['수강 안내','과정과 신청 방법 안내','관심 있는 수업을 만나보세요','수강 문의'],
    ['과정·강사 소개','확인된 과정과 강사 정보','수강 전에 살펴보는 수업 이야기','과정 보기'],
  ]},
  insurance:{placeholder:'예: 보험 상담 서비스',audience:'보장 내용과 가입 조건을 확인하려는 고객',directions:[
    ['서비스 소개','상담 방향과 서비스 소개','내 생활에 필요한 보장을 살펴보세요','서비스 보기'],
    ['상담 안내','가입 조건을 확인하는 상담','나에게 필요한 보장 상담','상담 문의'],
    ['보장·조건 안내','확인된 보장과 제외 조건','가입 전에 살펴보는 보장 정보','조건 확인'],
  ]},
  services:{placeholder:'예: 홈클리닝 서비스',audience:'서비스 내용과 이용 조건을 비교하는 잠재 고객',directions:[
    ['서비스 소개','서비스의 역할과 분위기','일상에 필요한 서비스를 만나보세요','서비스 보기'],
    ['이용 안내','이용 과정과 문의 방법','내게 맞는 이용 방법을 찾아보세요','이용 문의'],
    ['과정·정보 안내','확인된 제공 범위와 절차','이용 전에 살펴보는 서비스 정보','상세 정보 보기'],
  ]},
  other:{placeholder:'예: 광고할 상품 이름',audience:'제품 특징과 구매 정보를 비교하는 고객',directions:[
    ['브랜드 소개','브랜드와 제품의 분위기','취향을 담은 제품을 만나보세요','브랜드 보기'],
    ['제품 안내','제품과 사용하는 장면','일상에 더하는 새로운 선택','제품 보기'],
    ['디테일 소개','확인된 제품 정보','선택 전에 살펴보는 제품 이야기','상세 정보 보기'],
  ]},
  restaurant:{placeholder:'예: 한식 다이닝 온담',audience:'메뉴와 매장 분위기를 살펴보는 방문 고객',directions:[
    ['매장 소개','음식과 공간의 분위기','한 끼에 담는 우리만의 이야기','매장 보기'],
    ['방문·예약 안내','메뉴와 방문 방법 소개','오늘의 식사 자리를 만나보세요','예약 문의'],
    ['메뉴 이야기','제공한 메뉴·재료 정보','메뉴에 담긴 이야기를 살펴보세요','메뉴 보기'],
  ]},
  cafe:{placeholder:'예: 로스터리 카페 모먼트',audience:'음료와 공간의 분위기를 비교하는 카페 방문 고객',directions:[
    ['카페 소개','커피와 공간의 분위기','잠시 머무는 시간의 취향','카페 보기'],
    ['메뉴·방문 안내','음료와 디저트 소개','오늘의 한 잔을 만나보세요','메뉴 보기'],
    ['메뉴 이야기','제공한 원두·메뉴 정보','한 잔에 담긴 이야기를 전합니다','매장 정보 보기'],
  ]},
  lodging:{placeholder:'예: 해안가 부티크 호텔',audience:'객실과 숙박 조건을 비교하는 여행 고객',directions:[
    ['숙소 소개','공간과 휴식의 분위기','머무는 시간에 담는 취향','숙소 보기'],
    ['객실·예약 안내','객실과 예약 방법 소개','다음 여행의 머무를 곳','예약 문의'],
    ['이용 정보','확인된 시설과 이용 조건','예약 전에 살펴보는 숙소 정보','이용 정보 보기'],
  ]},
  travel:{placeholder:'예: 제주 로컬 여행 프로그램',audience:'여행 일정과 포함 사항을 비교하는 여행 고객',directions:[
    ['여행 소개','여행지와 경험의 분위기','다음 여행의 장면을 만나보세요','여행 보기'],
    ['일정·예약 안내','여행 일정과 신청 방법','가보고 싶은 여정을 찾아보세요','여행 문의'],
    ['여행 정보','확인된 일정과 포함 사항','떠나기 전에 살펴보는 여행 정보','일정 확인'],
  ]},
  fitness:{placeholder:'예: 웰니스 피트니스 센터',audience:'운동 시설과 프로그램을 비교하는 예비 회원',directions:[
    ['센터 소개','운동 공간과 분위기','나의 운동 루틴이 시작되는 곳','센터 보기'],
    ['상담·체험 안내','운동 프로그램과 이용 방법','나에게 맞는 운동을 찾아보세요','체험 문의'],
    ['프로그램 소개','제공한 수업·시설 정보','시작 전에 살펴보는 운동 프로그램','프로그램 보기'],
  ]},
  yoga:{placeholder:'예: 요가 스튜디오 숨',audience:'수업 방식과 시간을 비교하는 요가 수강 고객',directions:[
    ['스튜디오 소개','요가 공간과 수업 분위기','나를 위한 움직임의 시간','스튜디오 보기'],
    ['수업·체험 안내','수업과 참여 방법','나에게 맞는 요가를 만나보세요','체험 문의'],
    ['수업 소개','제공한 수업·강사 정보','시작 전에 살펴보는 요가 수업','수업 보기'],
  ]},
  pilates:{placeholder:'예: 필라테스 스튜디오',audience:'수업 구성과 이용 조건을 비교하는 필라테스 고객',directions:[
    ['스튜디오 소개','움직임과 공간의 분위기','나의 움직임에 집중하는 시간','스튜디오 보기'],
    ['수업·체험 안내','수업과 상담 방법','나에게 맞는 수업을 찾아보세요','체험 문의'],
    ['프로그램 소개','제공한 수업·기구 정보','시작 전에 살펴보는 필라테스 수업','프로그램 보기'],
  ]},
  swimming:{placeholder:'예: 성인 수영 클래스',audience:'수준별 수업과 시설을 비교하는 수영 수강 고객',directions:[
    ['클래스 소개','수영 공간과 수업 분위기','물속에서 시작하는 나의 시간','클래스 보기'],
    ['수강·체험 안내','수업 일정과 신청 방법','나에게 맞는 수영 수업','수강 문의'],
    ['수업·시설 안내','제공한 수업과 시설 정보','시작 전에 살펴보는 수영 정보','수업 보기'],
  ]},
  tennis:{placeholder:'예: 테니스 아카데미',audience:'레슨과 코트 이용 방법을 비교하는 테니스 고객',directions:[
    ['아카데미 소개','코트와 레슨의 분위기','코트에서 만나는 나의 시간','아카데미 보기'],
    ['레슨·체험 안내','레슨과 참여 방법','나에게 맞는 테니스 레슨','레슨 문의'],
    ['레슨 정보','제공한 코치·수업 정보','시작 전에 살펴보는 레슨 안내','레슨 보기'],
  ]},
  golf:{placeholder:'예: 골프 레슨 스튜디오',audience:'레슨 구성과 시설을 비교하는 골프 고객',directions:[
    ['스튜디오 소개','골프 공간과 레슨 분위기','스윙에 집중하는 나만의 시간','스튜디오 보기'],
    ['레슨·체험 안내','레슨과 예약 방법','나에게 맞는 골프 레슨','레슨 문의'],
    ['레슨 정보','제공한 코치·시설 정보','시작 전에 살펴보는 골프 레슨','레슨 보기'],
  ]},
  sports:{placeholder:'예: 배드민턴 스포츠 클럽',audience:'종목별 프로그램과 참여 조건을 비교하는 고객',directions:[
    ['클럽 소개','스포츠와 활동의 분위기','함께 움직이는 새로운 시간','클럽 보기'],
    ['참여·체험 안내','프로그램과 신청 방법','나에게 맞는 스포츠를 찾아보세요','참여 문의'],
    ['프로그램 소개','제공한 활동과 시설 정보','시작 전에 살펴보는 활동 안내','프로그램 보기'],
  ]},
  hospital:{placeholder:'예: 병원·의원 이름',audience:'진료 분야와 예약 방법을 확인하려는 방문 고객',directions:[
    ['병원 소개','병원과 진료 분야 소개','진료를 위한 공간을 소개합니다','병원 소개 보기'],
    ['진료·예약 안내','진료 시간과 예약 방법','방문 전에 진료 정보를 확인하세요','예약 문의'],
    ['의료진·시설 안내','확인된 의료진과 시설 정보','진료 전에 살펴보는 병원 정보','진료 정보 보기'],
  ]},
  biotech:{placeholder:'예: 바이오 연구 기업',audience:'기술 분야와 협력 정보를 검토하는 기업·연구 담당자',directions:[
    ['기업·연구 소개','기업과 연구 분야 소개','연구의 방향을 소개합니다','기업 소개 보기'],
    ['협력 안내','사업 분야와 협력 방법','함께 논의할 협력의 가능성','협력 문의'],
    ['기술 정보','제공한 연구와 기술 정보','검토에 필요한 기술 이야기','기술 정보 보기'],
  ]},
  realestate:{placeholder:'예: 부동산 중개 서비스',audience:'공간 정보와 계약 조건을 비교하는 부동산 고객',directions:[
    ['공간·서비스 소개','공간 또는 중개 서비스 소개','나의 다음 공간을 찾아보세요','서비스 보기'],
    ['방문·상담 안내','확인된 매물과 상담 방법','관심 있는 공간을 살펴보세요','방문 문의'],
    ['공간·조건 안내','제공한 위치와 계약 정보','결정 전에 살펴보는 공간 정보','상세 정보 보기'],
  ]},
  securities:{placeholder:'예: 증권 서비스 이름',audience:'증권 서비스의 기능과 이용 조건을 확인하는 고객',directions:[
    ['서비스 소개','증권 서비스와 이용 환경','투자를 위한 서비스를 살펴보세요','서비스 보기'],
    ['이용·상담 안내','계좌와 서비스 이용 방법','필요한 증권 서비스를 찾아보세요','이용 문의'],
    ['이용 조건 안내','확인된 비용과 위험 정보','이용 전에 살펴보는 증권 정보','조건 확인'],
  ]},
  stocks:{placeholder:'예: 주식 정보 서비스',audience:'주식 관련 정보와 서비스 이용 조건을 검토하는 고객',directions:[
    ['서비스 소개','주식 관련 서비스 소개','주식 정보를 살펴보는 새로운 방식','서비스 보기'],
    ['정보·이용 안내','제공하는 정보와 이용 방법','필요한 주식 정보를 찾아보세요','서비스 문의'],
    ['정보 기준 안내','제공한 정보 출처와 이용 조건','판단 전에 살펴보는 정보의 기준','정보 확인'],
  ]},
  crypto:{placeholder:'예: 디지털 자산 정보 서비스',audience:'디지털 자산 서비스와 위험 정보를 검토하는 고객',directions:[
    ['서비스 소개','디지털 자산 서비스 소개','디지털 자산 정보를 살펴보세요','서비스 보기'],
    ['이용 안내','서비스 내용과 이용 방법','필요한 서비스 정보를 찾아보세요','이용 문의'],
    ['조건·위험 안내','확인된 이용 조건과 위험 정보','이용 전에 살펴보는 주요 정보','조건 확인'],
  ]},
  finance:{placeholder:'예: 금융 상담 서비스',audience:'금융 서비스의 조건과 비용을 비교하는 고객',directions:[
    ['서비스 소개','금융 서비스와 상담 방향','나의 생활에 필요한 금융 정보','서비스 보기'],
    ['상담 안내','이용 조건을 확인하는 상담','필요한 금융 상담을 찾아보세요','상담 문의'],
    ['조건·비용 안내','확인된 이용 조건과 비용','결정 전에 살펴보는 금융 정보','조건 확인'],
  ]},
  banking:{placeholder:'예: 은행 서비스 이름',audience:'은행 상품과 이용 방법을 비교하는 고객',directions:[
    ['은행·서비스 소개','은행 서비스와 이용 장면','일상에 필요한 은행 서비스','서비스 보기'],
    ['이용·상담 안내','서비스 이용 방법과 상담','내게 맞는 이용 방법을 찾아보세요','상담 문의'],
    ['상품·조건 안내','확인된 금리·비용·이용 조건','선택 전에 살펴보는 상품 정보','조건 확인'],
  ]},
  lease:{placeholder:'예: 자동차 리스 상담',audience:'리스 대상과 계약 조건을 비교하는 고객',directions:[
    ['서비스 소개','리스 서비스와 이용 장면','내게 맞는 이용 방식을 찾아보세요','서비스 보기'],
    ['리스 상담','대상 상품과 상담 방법','필요한 리스 조건을 살펴보세요','리스 문의'],
    ['계약 조건 안내','확인된 기간과 비용 조건','계약 전에 살펴보는 리스 정보','조건 확인'],
  ]},
  rental:{placeholder:'예: 생활가전 렌탈 서비스',audience:'렌탈 품목과 이용 조건을 비교하는 고객',directions:[
    ['서비스 소개','렌탈 서비스와 생활 장면','필요한 순간에 만나는 이용 방식','서비스 보기'],
    ['렌탈 상담','품목과 이용 방법 소개','나에게 필요한 렌탈을 찾아보세요','렌탈 문의'],
    ['이용 조건 안내','확인된 기간과 관리 조건','선택 전에 살펴보는 렌탈 정보','조건 확인'],
  ]},
  tarot:{placeholder:'예: 타로 상담소 이름',audience:'타로 상담 주제와 예약 방법을 살펴보는 고객',directions:[
    ['타로 상담 소개','카드와 상담 공간의 분위기','카드와 함께 나누는 나의 이야기','타로 상담 보기'],
    ['상담·예약 안내','상담 주제와 예약 방법','궁금한 주제로 타로 상담을 시작하세요','타로 예약 문의'],
    ['이용 정보','제공한 상담 방식·시간·비용','상담 전에 살펴보는 타로 이용 안내','이용 정보 보기'],
  ]},
  astrology:{placeholder:'예: 별자리 상담 서비스 이름',audience:'별자리 상담 내용과 이용 방법을 살펴보는 고객',directions:[
    ['별자리 상담 소개','별과 상담 브랜드의 분위기','별자리를 주제로 나누는 이야기','별자리 상담 보기'],
    ['상담·예약 안내','상담 주제와 신청 방법','관심 있는 별자리 상담을 만나보세요','별자리 상담 문의'],
    ['이용 정보','제공한 상담 과정과 이용 조건','시작 전에 살펴보는 별자리 상담 안내','이용 안내 보기'],
  ]},
  myeongri:{placeholder:'예: 명리학 상담소·철학관 이름',audience:'명리학·사주·궁합 상담 분야와 방문 방법을 살펴보는 고객',directions:[
    ['명리학 상담 소개','명리학 상담 공간과 분야','사주와 궁합, 차분히 이야기해보세요','명리학 상담 보기'],
    ['상담·예약 안내','상담 주제와 방문 예약','궁금한 이야기를 나눌 시간을 예약하세요','명리학 예약 문의'],
    ['상담 분야 안내','제공한 분야·상담 방식·이용 정보','방문 전에 알아보는 명리학 상담 분야','상담 분야 보기'],
  ]},
  sinjeom:{placeholder:'예: 신점 상담소 이름',audience:'신점 상담 방식과 예약 정보를 확인하는 고객',directions:[
    ['신점 상담 소개','공간과 상담 방식 소개','나의 이야기를 나누는 신점 상담','신점 상담 보기'],
    ['상담·예약 안내','상담 일정과 문의 방법','신점 상담 일정과 예약 방법을 만나보세요','신점 예약 문의'],
    ['이용 정보','제공한 상담 절차와 비용','상담 전에 살펴보는 신점 이용 안내','이용 안내 보기'],
  ]},
};

export const industryPlaceholder = (category:ProductCategory):string => content[category].placeholder;
export const industryAudience = (category:ProductCategory):string => content[category].audience;
export function industryDirections(category:ProductCategory):readonly IndustryDirection[] {
  const [d1,d2,d3]=content[category].directions;
  return [
    {id:'brand',label:d1[0],description:d1[1],headline:d1[2],cta:d1[3]},
    {id:'offer',label:d2[0],description:d2[1],headline:d2[2],cta:d2[3]},
    {id:'trust',label:d3[0],description:d3[1],headline:d3[2],cta:d3[3]}
  ] as const;
}