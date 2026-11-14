import type {IndustryKind, ProductCategory} from './industry.ts';

export type IndustryChoice = {id: string; category: ProductCategory; ko: string; en: string};
export type AdField = {id: string; kind: IndustryKind; ko: string; en: string; items: IndustryChoice[]};
export const adFields: AdField[] = [
  {id:'fashion', kind:'product', ko:'패션·잡화', en:'Fashion & accessories', items:[
    {id:'fashion', category:'fashion', ko:'의류', en:'Apparel'},
    {id:'shoes', category:'shoes', ko:'신발', en:'Shoes'},
    {id:'bags', category:'bags', ko:'가방', en:'Bags'},
    {id:'accessories', category:'accessories', ko:'패션잡화', en:'Fashion accessories'},
    {id:'jewelry', category:'jewelry', ko:'주얼리', en:'Jewelry'},
  ]},
  {id:'beauty', kind:'product', ko:'뷰티·건강', en:'Beauty & wellness', items:[
    {id:'skincare', category:'beauty', ko:'화장품·스킨케어', en:'Cosmetics & skincare'},
    {id:'hair', category:'beauty', ko:'헤어·바디용품', en:'Hair & body care'},
    {id:'supplements', category:'food', ko:'건강기능식품', en:'Dietary supplements'},
  ]},
  {id:'food', kind:'product', ko:'식품·음료', en:'Food & beverages', items:[
    {id:'fresh', category:'food', ko:'농축수산물', en:'Fresh produce, meat & seafood'},
    {id:'meals', category:'food', ko:'가공식품·밀키트', en:'Prepared foods & meal kits'},
    {id:'drinks', category:'food', ko:'음료·커피·차', en:'Drinks, coffee & tea'},
    {id:'snacks', category:'food', ko:'간식·제과', en:'Snacks & confectionery'},
  ]},
  {id:'electronics', kind:'product', ko:'전자기기·가전', en:'Electronics & appliances', items:[
    {id:'small-appliance', category:'electronics', ko:'소형가전', en:'Small appliances'},
    {id:'large-appliance', category:'electronics', ko:'대형가전', en:'Major appliances'},
    {id:'digital', category:'electronics', ko:'컴퓨터·모바일·디지털기기', en:'Computers, mobile & digital devices'},
  ]},
  {id:'home', kind:'product', ko:'가구·생활', en:'Home & household', items:[
    {id:'furniture', category:'home', ko:'가구·인테리어 소품', en:'Furniture & home decor'},
    {id:'kitchen', category:'other', ko:'주방용품', en:'Kitchenware'},
    {id:'household', category:'other', ko:'생활·청소용품', en:'Household & cleaning supplies'},
    {id:'baby', category:'other', ko:'출산·유아동용품', en:'Baby & kids'},
    {id:'pet-goods', category:'other', ko:'반려동물용품', en:'Pet supplies'},
  ]},
  {id:'leisure', kind:'product', ko:'문화·취미·스포츠용품', en:'Culture, hobbies & sports goods', items:[
    {id:'books', category:'other', ko:'도서·음반·영상물', en:'Books, music & movies'},
    {id:'instruments', category:'other', ko:'악기', en:'Musical instruments'},
    {id:'toys', category:'other', ko:'완구·취미·공예용품', en:'Toys, hobbies & craft supplies'},
    {id:'office', category:'other', ko:'문구·사무용품', en:'Stationery & office supplies'},
    {id:'golf-goods', category:'other', ko:'골프용품', en:'Golf equipment'},
    {id:'outdoors', category:'other', ko:'스포츠·캠핑용품', en:'Sports & camping gear'},
  ]},
  {id:'packaging', kind:'product', ko:'포장재', en:'Packaging', items:[
    {id:'boxes', category:'boxes', ko:'박스', en:'Boxes'},
    {id:'shoppingbags', category:'shoppingbags', ko:'쇼핑백', en:'Shopping bags'},
    {id:'labels', category:'labels', ko:'라벨·스티커', en:'Labels & stickers'},
    {id:'containers', category:'containers', ko:'용기', en:'Containers'},
    {id:'plasticfilm', category:'plasticfilm', ko:'비닐·필름', en:'Plastic film'},
    {id:'pouches', category:'pouches', ko:'파우치', en:'Pouches'},
    {id:'cushion', category:'packaging', ko:'완충재', en:'Protective packaging'},
    {id:'packaging', category:'packaging', ko:'기타 포장재', en:'Other packaging'},
  ]},
  {id:'industrial', kind:'product', ko:'산업재·자동차', en:'Industrial & automotive', items:[
    {id:'equipment', category:'industrial', ko:'산업 기계·설비', en:'Industrial machinery'},
    {id:'parts', category:'industrial', ko:'부품·공구·자재', en:'Parts, tools & materials'},
    {id:'vehicles', category:'automotive', ko:'자동차·이륜차 판매', en:'Vehicle sales'},
    {id:'car-goods', category:'automotive', ko:'자동차용품', en:'Vehicle accessories'},
  ]},
  {id:'other-product', kind:'product', ko:'기타 상품', en:'Other products', items:[
    {id:'other', category:'other', ko:'기타 실물 상품', en:'Other physical products'},
  ]},
  {id:'home-services', kind:'service', ko:'생활·시공 서비스', en:'Home & personal services', items:[
    {id:'cleaning', category:'services', ko:'청소', en:'Cleaning'},
    {id:'moving', category:'services', ko:'이사', en:'Moving'},
    {id:'construction', category:'services', ko:'인테리어 시공', en:'Interior construction'},
    {id:'repair', category:'services', ko:'수리·설치', en:'Repair & installation'},
    {id:'pet-care', category:'services', ko:'반려동물 돌봄·미용', en:'Pet care & grooming'},
    {id:'beauty-care', category:'services', ko:'미용실·피부관리·네일', en:'Hair, skin & nail services'},
  ]},
  {id:'dining', kind:'service', ko:'음식·카페', en:'Dining & cafes', items:[
    {id:'restaurant', category:'restaurant', ko:'음식점', en:'Restaurants'},
    {id:'cafe', category:'cafe', ko:'카페·디저트 매장', en:'Cafes & dessert shops'},
  ]},
  {id:'travel', kind:'service', ko:'여행·숙박·문화', en:'Travel, stays & culture', items:[
    {id:'lodging', category:'lodging', ko:'호텔·숙박', en:'Hotels & accommodation'},
    {id:'tour', category:'travel', ko:'여행·투어', en:'Travel & tours'},
    {id:'flights', category:'travel', ko:'항공권', en:'Flights'},
    {id:'tickets', category:'services', ko:'공연·전시 티켓', en:'Show & exhibition tickets'},
  ]},
  {id:'education', kind:'service', ko:'교육·강의', en:'Education', items:[
    {id:'language', category:'education', ko:'어학', en:'Language classes'},
    {id:'career', category:'education', ko:'직무 교육', en:'Professional training'},
    {id:'music', category:'education', ko:'악기 레슨', en:'Music lessons'},
    {id:'craft', category:'education', ko:'공예 클래스', en:'Craft classes'},
    {id:'education', category:'education', ko:'학원·기타 교육', en:'Academies & other education'},
  ]},
  {id:'sports', kind:'service', ko:'스포츠·운동', en:'Sports & fitness', items:[
    {id:'fitness', category:'fitness', ko:'헬스·PT', en:'Gyms & personal training'},
    {id:'yoga', category:'yoga', ko:'요가', en:'Yoga'},
    {id:'pilates', category:'pilates', ko:'필라테스', en:'Pilates'},
    {id:'swimming', category:'swimming', ko:'수영', en:'Swimming'},
    {id:'tennis', category:'tennis', ko:'테니스', en:'Tennis'},
    {id:'golf', category:'golf', ko:'골프 레슨·연습장', en:'Golf lessons & ranges'},
    {id:'sports', category:'sports', ko:'기타 스포츠 수업', en:'Other sports lessons'},
  ]},
  {id:'health', kind:'service', ko:'의료·바이오', en:'Healthcare & biotech', items:[
    {id:'hospital', category:'hospital', ko:'병원·의원', en:'Hospitals & clinics'},
    {id:'biotech', category:'biotech', ko:'바이오 연구·기술 서비스', en:'Biotech research & services'},
  ]},
  {id:'property', kind:'service', ko:'부동산 서비스', en:'Real estate services', items:[
    {id:'new-property', category:'realestate', ko:'분양', en:'New property sales'},
    {id:'brokerage', category:'realestate', ko:'중개', en:'Brokerage'},
    {id:'property-rental', category:'realestate', ko:'임대·임대관리', en:'Rental housing & management'},
    {id:'offices', category:'realestate', ko:'상가·사무실', en:'Retail & office space'},
    {id:'land', category:'realestate', ko:'토지·개발', en:'Land & development'},
    {id:'auctions', category:'realestate', ko:'경매·공매', en:'Auctions'},
    {id:'property-advice', category:'realestate', ko:'부동산 컨설팅', en:'Real estate consulting'},
    {id:'facility', category:'realestate', ko:'건물·시설 관리', en:'Property management'},
    {id:'realestate', category:'realestate', ko:'기타 부동산', en:'Other real estate'},
  ]},
  {id:'finance', kind:'service', ko:'금융·보험', en:'Finance & insurance', items:[
    {id:'insurance', category:'insurance', ko:'보험', en:'Insurance'},
    {id:'securities', category:'securities', ko:'증권', en:'Securities'},
    {id:'stocks', category:'stocks', ko:'주식 정보', en:'Stock information'},
    {id:'crypto', category:'crypto', ko:'디지털 자산 서비스', en:'Digital asset services'},
    {id:'banking', category:'banking', ko:'은행', en:'Banking'},
    {id:'finance', category:'finance', ko:'기타 금융 서비스', en:'Other financial services'},
  ]},
  {id:'lease-rental', kind:'service', ko:'리스·렌탈', en:'Leasing & rentals', items:[
    {id:'auto-lease', category:'lease', ko:'자동차 리스', en:'Vehicle leasing'},
    {id:'equipment-lease', category:'lease', ko:'산업기계·장비 리스', en:'Equipment leasing'},
    {id:'car-rental', category:'rental', ko:'렌터카·장기렌터카', en:'Short- & long-term car rental'},
    {id:'appliance-rental', category:'rental', ko:'생활가전 렌탈', en:'Appliance rental'},
    {id:'gear-rental', category:'rental', ko:'장비·용품 대여', en:'Equipment rental'},
    {id:'space-rental', category:'rental', ko:'공간 대여', en:'Space rental'},
  ]},
  {id:'logistics', kind:'service', ko:'물류·배송·배달', en:'Logistics, shipping & delivery', items:[
    {id:'freight', category:'logistics', ko:'화물운송·주선', en:'Freight & forwarding'},
    {id:'warehouse', category:'logistics', ko:'보관·풀필먼트', en:'Warehousing & fulfillment'},
    {id:'parcel', category:'logistics', ko:'택배·퀵배송', en:'Parcel & courier services'},
    {id:'international', category:'logistics', ko:'국제물류·해외배송', en:'International shipping'},
    {id:'food-delivery', category:'delivery', ko:'음식 배달·배달대행', en:'Food delivery & dispatch'},
  ]},
  {id:'brand-pr', kind:'service', ko:'기업·브랜드 홍보', en:'Company & brand promotion', items:[
    {id:'company-intro', category:'corporate', ko:'기업·사업 소개', en:'Company & business introduction'},
    {id:'recruiting', category:'corporate', ko:'채용 홍보', en:'Recruitment campaigns'},
    {id:'company-event', category:'corporate', ko:'기업 행사 홍보', en:'Corporate event promotion'},
    {id:'brand-story', category:'brand', ko:'브랜드 스토리', en:'Brand storytelling'},
    {id:'brand-campaign', category:'brand', ko:'브랜드 캠페인', en:'Brand campaigns'},
  ]},
  {id:'professional', kind:'service', ko:'비즈니스·전문 서비스', en:'Business & professional services', items:[
    {id:'design', category:'services', ko:'디자인', en:'Design'},
    {id:'development', category:'services', ko:'IT·프로그래밍', en:'IT & programming'},
    {id:'marketing', category:'services', ko:'광고·마케팅 대행', en:'Advertising & marketing agencies'},
    {id:'translation', category:'services', ko:'번역·통역', en:'Translation & interpreting'},
    {id:'accounting', category:'services', ko:'회계', en:'Accounting'},
    {id:'tax', category:'services', ko:'세무', en:'Tax'},
    {id:'legal', category:'services', ko:'법무', en:'Legal'},
    {id:'consulting', category:'services', ko:'컨설팅', en:'Consulting'},
  ]},
  {id:'digital', kind:'service', ko:'디지털·구독 서비스', en:'Digital & subscription services', items:[
    {id:'streaming', category:'services', ko:'OTT·영상 구독', en:'Video streaming'},
    {id:'ebooks', category:'services', ko:'전자책 구독', en:'E-book subscriptions'},
    {id:'music-streaming', category:'services', ko:'음원 스트리밍', en:'Music streaming'},
    {id:'membership', category:'services', ko:'멤버십', en:'Memberships'},
    {id:'saas', category:'services', ko:'소프트웨어 구독', en:'Software subscriptions'},
  ]},
  {id:'fortune', kind:'service', ko:'사주·운세', en:'Fortune telling', items:[
    {id:'tarot', category:'tarot', ko:'타로', en:'Tarot'},
    {id:'astrology', category:'astrology', ko:'별자리', en:'Astrology'},
    {id:'myeongri', category:'myeongri', ko:'명리학', en:'Four pillars'},
    {id:'sinjeom', category:'sinjeom', ko:'신점', en:'Shamanic readings'},
  ]},
  {id:'other-service', kind:'service', ko:'기타 서비스', en:'Other services', items:[
    {id:'services', category:'services', ko:'기타 서비스', en:'Other services'},
  ]},
];

export function findAdField(category: ProductCategory, detail?: string) {
  for (const field of adFields) {
    const item = field.items.find(entry => entry.category === category && entry.ko === detail);
    if (item) return {field, item};
  }
}
