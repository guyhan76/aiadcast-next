import {productCategories,industryGroupFor,industryKindFor,type ProductCategory,type IndustryKind} from './industry.ts';

export type IndustryOption={key:string;category:ProductCategory;name?:string;ko:string;en?:string;kind:IndustryKind;group:string;aliases:string};
export const browseGroups:Record<IndustryKind,readonly (readonly [string,string,string])[]>={
 product:[['fashion','패션·잡화','Fashion'],['beauty','뷰티·생활','Beauty & daily life'],['food','식품·농수산','Food & agriculture'],['home','가구·가전','Home & electronics'],['leisure','취미·반려동물','Hobbies & pets'],['packaging','포장·인쇄','Packaging & print'],['industry','산업·자동차','Industry & vehicles'],['other','그 밖의 상품','Other products']],
 service:[['dining','음식·숙박·여행','Dining & travel'],['care','미용·생활·돌봄','Beauty & daily care'],['learning','교육·운동','Learning & fitness'],['health','의료·건강','Healthcare'],['finance','금융·보험','Finance & insurance'],['property','부동산·건설','Property & construction'],['business','기업·IT·전문직','Business & technology'],['culture','문화·행사·상담','Culture & events'],['mobility','운송·리스·렌탈','Transport & rental'],['other','그 밖의 서비스','Other services']],
};
const groups:Record<string,string>={electronics:'home',fashion:'fashion',packaging:'packaging',industrial:'industry',food:'food',beauty:'beauty',home:'home',automotive:'industry',products:'other',dining:'dining',travel:'dining',learning:'learning',sports:'learning',health:'health',property:'property',finance:'finance',mobility:'mobility',fortune:'culture',business:'business'};
const aliases:Partial<Record<ProductCategory,string>>={
 shoes:'운동화 스니커즈 구두 sneakers trainers footwear',boxes:'택배박스 골판지 상자 carton shipping box',beauty:'화장품 스킨케어 메이크업 세제 cosmetics skincare makeup',cafe:'커피 베이커리 빵 coffee bakery',lodging:'숙소 펜션 호텔 리조트 hotel stay accommodation',labels:'스티커 sticker',pouches:'연포장 flexible packaging',containers:'병 플라스틱 bottle jar',plasticfilm:'비닐봉투 필름 film bag',electronics:'가전 노트북 컴퓨터 laptop appliance',education:'학원 과외 수업 academy tuition class',fitness:'헬스장 피트니스 gym',hospital:'의원 치과 클리닉 한의원 clinic dental',realestate:'아파트 주택 apartment property',rental:'렌탈 렌트 대여 rent',fashion:'옷 의류 코트 티셔츠 clothing apparel',food:'식품 음료 건강식품 과일 채소 food beverage produce',industrial:'기계 부품 공구 제조 equipment manufacturing',myeongri:'사주 궁합 철학관 fortune',corporate:'회사 기업 B2B company business',
};
const overrides:Partial<Record<ProductCategory,readonly [string,string]>>={packaging:['기타 포장재','Other packaging'],other:['기타 상품','Other products'],services:['기타 서비스','Other services']};
// Broader names reuse stable generation families. Exact names are persisted and
// sent to the generation brief, not represented as new specialized AI engines.
const additions:readonly (readonly [string,string,ProductCategory,string,string])[]=[
 ['반려동물 용품','Pet supplies','other','leisure','강아지 고양이 사료 장난감 dog cat pet'],
 ['스포츠·캠핑 용품','Sports & camping gear','other','leisure','캠핑 텐트 낚시 자전거 등산 outdoor camping bicycle'],
 ['도서·문구·완구','Books, stationery & toys','other','leisure','책 문구 장난감 완구 book toy stationery'],
 ['꽃·식물·원예','Flowers & gardening','other','leisure','화분 꽃집 화훼 꽃다발 flower garden plant'],
 ['농산물·수산물·축산물','Farm & seafood products','food','food','농업 어업 축산 쌀 과일 채소 생선 농장 farm fish produce'],
 ['유아·출산 용품','Baby & maternity products','other','beauty','아기 기저귀 유모차 육아 baby maternity'],
 ['인쇄물·간판','Print & signage','other','packaging','명함 전단지 현수막 인쇄 printing signage'],
 ['건축자재·원자재','Building materials','industrial','industry','목재 철강 금속 석재 시멘트 광업 자원 wood steel material'],
 ['에너지·친환경 설비','Energy & environmental equipment','industrial','industry','태양광 전기 배터리 재활용 solar energy battery recycling'],
 ['미용실·네일·피부관리','Hair, nails & skincare','services','care','헤어 이발 뷰티샵 에스테틱 salon nail spa beauty'],
 ['청소·세탁·수리','Cleaning, laundry & repair','services','care','홈케어 가사 세탁소 에어컨 수선 cleaning laundry repair'],
 ['돌봄·요양·복지','Care & welfare','services','care','간병 육아 아이돌봄 산후 요양원 복지 caregiver childcare nursing'],
 ['반려동물 돌봄·미용','Pet care & grooming','services','care','애견미용 강아지 호텔 펫시터 pet grooming sitting'],
 ['건설·인테리어 시공','Construction & renovation','services','property','건축 리모델링 도배 타일 설비 plumbing construction renovation'],
 ['IT·소프트웨어','IT & software','services','business','앱 어플 플랫폼 SaaS 인공지능 AI 개발 웹사이트 software app technology'],
 ['광고·마케팅·디자인','Marketing & design','services','business','광고대행 콘텐츠 패키지디자인 홍보 marketing advertising design'],
 ['법률·세무·회계','Legal, tax & accounting','services','business','변호사 법무사 노무사 세무사 회계사 lawyer tax accountant'],
 ['컨설팅·채용','Consulting & recruitment','services','business','경영 인사 취업 구인 채용 consultant recruitment'],
 ['공공기관·협회·단체','Public & nonprofit organizations','services','business','공공행정 지자체 협회 비영리 조합 charity government association'],
 ['환경·폐기물 처리','Environmental services','services','business','폐기물 재활용 방역 정화 환경관리 waste recycling environment'],
 ['공연·전시·행사','Performances, exhibitions & events','services','culture','축제 콘서트 갤러리 박람회 공연 전시 event concert exhibition'],
 ['사진·영상·스튜디오','Photography & video','services','culture','촬영 사진관 영상제작 스튜디오 photography video studio'],
 ['웨딩·장례','Weddings & ceremonies','services','culture','결혼 예식 장례 상조 wedding funeral ceremony'],
 ['운송·물류·이사','Transport, logistics & moving','services','mobility','택배 배송 화물 이사 창고 운수 delivery logistics moving'],
 ['자동차 정비·세차','Auto repair & car wash','services','mobility','정비소 카센터 세차 자동차수리 car wash mechanic'],
];
export const industryOptions:IndustryOption[]=[
 ...productCategories.map(([category,label])=>({key:category,category,ko:overrides[category]?.[0]??label,en:overrides[category]?.[1],kind:industryKindFor(category),group:category==='services'?'other':groups[industryGroupFor(category).id],aliases:aliases[category]??''})),
 ...additions.map(([ko,en,category,group,aliases],i)=>({key:`extended-${i}`,category,name:ko,ko,en,kind:industryKindFor(category),group,aliases})),
];
export const normalizeIndustrySearch=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/[\s·ㆍ._-]+/g,'');
export function searchIndustries(query:string,label:(option:IndustryOption)=>string){
 const needle=normalizeIndustrySearch(query);
 return industryOptions.filter(o=>normalizeIndustrySearch([o.ko,o.en,label(o),o.aliases,o.key].join(' ')).includes(needle));
}
