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
  {id:'corporate',kind:'service',label:'기업·브랜드 홍보',description:'기업과 브랜드의 가치',categoryIds:['corporate','brand','services']},
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
  // 이 아래로는 기존 카테고리들...
  packaging:{placeholder:'예: 기타 포장재 이름',audience:'포장 방식과 발주 조건을 비교하는 고객',directions:[
    ['브랜드 소개','소재와 브랜드의 분위기','제품을 담는 브랜드의 방식','제품 보기'],
    ['제품 안내','규격과 사용 목적 소개','필요한 포장을 만나보세요','제품 문의'],
    ['디테일 소개','제공한 소재·구조 정보','선택에 필요한 포장 정보','상세 정보 보기'],
  ]},
  // ... (기존 모든 카테고리 content 그대로)
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