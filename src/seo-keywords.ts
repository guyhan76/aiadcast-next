import type {ProductCategory} from './industry.ts';

type Terms={ko:string;en:string};
type SeoInput={name:string;category:ProductCategory;locale:'ko'|'en';attributes:{name:string;value:string}[]};
const terms=(ko:string,en:string):Terms=>({ko,en});
// Related product/service nouns, not manufactured article headings or search-volume claims.
const categories:Record<ProductCategory,Terms>={
 packaging:terms('포장재|포장용품|제품포장|포장자재|포장재제작','packaging materials|packaging supplies|product packaging|packaging supplier|custom packaging'),
 boxes:terms('택배박스|포장박스|골판지박스|종이박스|이사박스','shipping boxes|packaging boxes|corrugated boxes|cardboard boxes|moving boxes'),
 shoppingbags:terms('쇼핑백|종이쇼핑백|쇼핑백제작|쇼핑백인쇄|선물쇼핑백','shopping bags|paper shopping bags|custom shopping bags|printed shopping bags|gift bags'),
 labels:terms('라벨|제품라벨|라벨제작|라벨인쇄|포장라벨','product labels|packaging labels|custom labels|label printing|printed labels'),
 containers:terms('포장용기|제품용기|용기제작|포장용기제작|용기공급','packaging containers|product containers|custom containers|container supplier|container packaging'),
 plasticfilm:terms('포장비닐|비닐포장|포장필름|비닐제작|연포장','packaging film|plastic packaging|flexible packaging|custom packaging film|film supplier'),
 pouches:terms('포장파우치|파우치포장|파우치제작|파우치인쇄|연포장파우치','packaging pouches|pouch packaging|custom pouches|printed pouches|flexible pouches'),
 food:terms('식품|식품구매|식품주문','food products|food shopping|food delivery'),
 beauty:terms('생활용품|뷰티제품','beauty products|household products'),
 electronics:terms('가전제품|생활가전|소형가전','home appliances|household appliances|small appliances'),
 fashion:terms('의류|패션의류|의류쇼핑','clothing|fashion clothing|clothing shopping'),
 bags:terms('가방|데일리가방|패션가방|가방쇼핑','bags|everyday bags|fashion bags|bag shopping'),
 shoes:terms('신발|데일리슈즈|신발쇼핑','shoes|everyday shoes|shoe shopping'),
 jewelry:terms('주얼리|쥬얼리|액세서리|주얼리쇼핑','jewelry|jewellery|jewelry accessories|jewelry shopping'),
 accessories:terms('패션잡화|패션소품|액세서리|패션액세서리','fashion accessories|style accessories|accessories shopping|everyday accessories'),
 home:terms('가구|인테리어가구|생활가구|홈인테리어','furniture|home furniture|interior furniture|home interiors'),
 industrial:terms('산업용품|산업용부품|산업장비|산업자재|산업재공급','industrial supplies|industrial parts|industrial equipment|industrial materials|industrial supplier'),
 automotive:terms('자동차|차량구매|자동차상담|차량상담','cars|car buying|car consultation|vehicle purchase'),
 other:terms('',''),
 restaurant:terms('음식점|식당|식사예약|음식점예약|식당예약','restaurant|dining|dining reservations|restaurant booking|restaurant menu'),
 cafe:terms('카페|커피|카페메뉴|디저트|카페음료','cafe|coffee|cafe menu|desserts|cafe drinks'),
 lodging:terms('숙소|숙박|숙소예약|숙박예약|여행숙소','accommodation|lodging|accommodation booking|room reservations|travel accommodation'),
 travel:terms('여행|여행상품|여행예약|여행상담|여행일정','travel|travel packages|travel booking|travel planning|travel itineraries'),
 education:terms('교육과정|강의|수강신청|교육프로그램|교육상담','courses|classes|course enrollment|education programs|course consultation'),
 fitness:terms('헬스장|피트니스|헬스장등록|운동프로그램|피트니스센터','gym|fitness|gym membership|fitness programs|fitness center'),
 yoga:terms('요가|요가수업|요가원|요가스튜디오|요가등록','yoga|yoga classes|yoga studio|yoga lessons|yoga membership'),
 pilates:terms('필라테스|필라테스수업|필라테스센터|필라테스등록|필라테스상담','pilates|pilates classes|pilates studio|pilates membership|pilates consultation'),
 swimming:terms('수영|수영강습|수영수업|수영장|수영등록','swimming|swimming lessons|swimming classes|swimming pool|swimming enrollment'),
 tennis:terms('테니스|테니스레슨|테니스강습|테니스수업|테니스아카데미','tennis|tennis lessons|tennis coaching|tennis classes|tennis academy'),
 golf:terms('골프|골프레슨|골프강습|골프수업|골프아카데미','golf|golf lessons|golf coaching|golf classes|golf academy'),
 sports:terms('스포츠강습|운동수업|스포츠클럽|스포츠레슨','sports lessons|exercise classes|sports club|sports coaching'),
 hospital:terms('병원|의원|진료예약|병원예약|의료상담','hospital|medical clinic|medical appointments|clinic booking|medical consultation'),
 biotech:terms('바이오기업|바이오기술|바이오연구|바이오사업|바이오협력','biotechnology company|biotechnology|biotech research|biotech business|biotech partnership'),
 realestate:terms('부동산|부동산중개|매물정보|부동산상담|부동산매물','real estate|property brokerage|property listings|property consultation|properties'),
 insurance:terms('보험상담|보험상품|보장내용|보험료비교|보험가입','insurance consultation|insurance products|insurance coverage|insurance comparison|insurance enrollment'),
 securities:terms('증권서비스|증권계좌|증권정보|증권상품|투자정보','securities services|brokerage account|securities information|securities products|investment information'),
 stocks:terms('주식정보|주식분석|주식투자|증시정보|투자정보','stock information|stock analysis|stock investing|stock market information|investment information'),
 crypto:terms('디지털자산|가상자산|코인정보|암호화폐|가상자산정보','digital assets|crypto assets|cryptocurrency information|cryptocurrency|digital asset information'),
 finance:terms('금융서비스|금융상품|금융상담|금융정보|금융상품비교','financial services|financial products|financial consultation|financial information|financial product comparison'),
 banking:terms('은행상품|은행서비스|금융상품|은행상담|금융상담','banking products|banking services|financial products|bank consultation|financial consultation'),
 lease:terms('자동차리스|차량리스|리스견적|자동차리스견적|리스상담','car leasing|vehicle leasing|lease quote|car lease quotes|lease consultation'),
 rental:terms('렌탈|렌탈서비스|렌탈가격|렌탈견적|렌탈상담','rental services|rentals|rental prices|rental quotes|rental consultation'),
 corporate:terms('기업서비스|기업솔루션|기업협력|사업제휴|기업상담','business services|business solutions|business partnership|business collaboration|business consultation'),
 services:terms('서비스상담|서비스신청|서비스예약','service consultation|service booking|service reservations'),
 tarot:terms('타로|타로상담|타로점|타로예약|타로상담예약','tarot|tarot reading|tarot consultation|tarot booking|tarot appointment'),
 astrology:terms('별자리|별자리상담|점성술|점성술상담|별자리운세','astrology|astrology consultation|horoscope|astrology reading|horoscope reading'),
 myeongri:terms('사주|사주상담|명리학|사주풀이|사주예약','saju|saju consultation|four pillars reading|saju reading|saju appointment'),
 sinjeom:terms('신점|신점상담|신점예약|신점상담예약|점집','sinjeom|sinjeom consultation|sinjeom booking|spiritual consultation|spiritual reading'),
};
type Family={categories:readonly ProductCategory[];match:RegExp;terms:Terms};
const families:readonly Family[]=[
 {categories:['boxes','packaging'],match:/우체국|korea\s*post|postal\s*box/i,terms:terms('우체국박스|택배박스|포장박스|종이박스|이사박스','postal boxes|shipping boxes|packaging boxes|cardboard boxes|moving boxes')},
 {categories:['boxes','packaging'],match:/선물|싸바리|gift\s*box|rigid\s*box/i,terms:terms('선물박스|선물상자|선물포장박스|선물포장|선물패키지','gift boxes|gift packaging|gift packaging boxes|gift cartons|gift package')},
 {categories:['boxes','packaging'],match:/이사|moving\s*box/i,terms:terms('이사박스|이사용박스|포장박스|종이박스|골판지박스','moving boxes|removal boxes|packing boxes|cardboard boxes|corrugated boxes')},
 {categories:['cafe','food'],match:/라떼|latte/i,terms:terms('라떼|카페라떼|라떼메뉴|카페음료|커피메뉴','latte|cafe latte|latte drinks|cafe drinks|coffee menu')},
 {categories:['cafe','food'],match:/커피|coffee|로스터리/i,terms:terms('커피|카페|커피메뉴|커피전문점|카페음료','coffee|cafe|coffee menu|coffee shop|cafe drinks')},
 {categories:['electronics'],match:/공기\s*청정기|air\s*purifier/i,terms:terms('공기청정기|가정용공기청정기|공기청정기가격|공기청정기비교|공기청정기구매','air purifier|home air purifier|air purifier price|air purifier comparison|buy air purifier')},
 {categories:['electronics'],match:/청소기|vacuum/i,terms:terms('청소기|가정용청소기|청소기가격|청소기비교|청소기구매','vacuum cleaner|home vacuum cleaner|vacuum cleaner price|vacuum comparison|buy vacuum cleaner')},
 {categories:['electronics'],match:/선풍기|\bfan\b/i,terms:terms('선풍기|가정용선풍기|선풍기가격|선풍기비교|선풍기구매','electric fan|home fan|fan prices|fan comparison|buy electric fan')},
 {categories:['beauty'],match:/세럼|에센스|serum|essence/i,terms:terms('세럼|스킨케어|기초화장품|페이스세럼|화장품','face serum|skincare|facial skincare|skin serum|beauty products')},
 {categories:['beauty'],match:/크림|cream/i,terms:terms('페이스크림|스킨케어|기초화장품|크림화장품|화장품','face cream|skincare|facial skincare|skin cream|beauty products')},
 {categories:['fashion','shoes'],match:/운동화|런닝화|러닝화|sneakers|running\s*shoes/i,terms:terms('운동화|러닝화|런닝화|스포츠신발|운동화구매','sneakers|running shoes|sports shoes|athletic shoes|buy sneakers')},
 {categories:['fashion','bags'],match:/백팩|backpack/i,terms:terms('백팩|배낭|데일리백팩|백팩가방|백팩구매','backpack|rucksack|everyday backpack|backpack bag|buy backpack')},
 {categories:['fashion','bags'],match:/토트|tote/i,terms:terms('토트백|토트가방|데일리가방|핸드백|가방','tote bag|tote handbag|everyday bag|handbag|bags')},
 {categories:['jewelry','accessories'],match:/목걸이|necklace/i,terms:terms('목걸이|패션목걸이|목걸이주얼리|주얼리|목걸이구매','necklace|fashion necklace|necklace jewelry|jewelry|buy necklace')},
 {categories:['lodging'],match:/호텔|hotel/i,terms:terms('호텔|호텔예약|호텔숙박|호텔객실|숙박예약','hotel|hotel booking|hotel accommodation|hotel rooms|room reservations')},
 {categories:['education'],match:/영어|english/i,terms:terms('영어수업|영어강의|영어교육|영어학습|영어수강','English classes|English courses|English learning|English lessons|English enrollment')},
 {categories:['education'],match:/코딩|프로그래밍|coding|programming/i,terms:terms('코딩교육|코딩수업|프로그래밍강의|코딩강의|프로그래밍교육','coding classes|coding courses|programming courses|coding lessons|programming education')},
 {categories:['lease','rental','automotive'],match:/렌트|렌터|rental\s*car|car\s*rental/i,terms:terms('렌터카|자동차렌트|차량렌트|렌터카견적|렌트카','rental car|car rental|vehicle rental|car rental quote|rental cars')},
 {categories:['services','corporate'],match:/청소|클리닝|cleaning/i,terms:terms('청소서비스|클리닝서비스|청소업체|청소견적|청소예약','cleaning service|cleaning company|cleaning services|cleaning quote|cleaning booking')},
 {categories:['services','corporate'],match:/소프트웨어|saas|software/i,terms:terms('소프트웨어|업무소프트웨어|기업소프트웨어|소프트웨어서비스|업무솔루션','software|business software|enterprise software|software services|business solutions')},
];
const key=(value:string)=>value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
const broad=new Set(['박스','상품','제품','서비스','기타','기타실물상품','기타스포츠','products','product','services','service','other']);
function usable(value:string){
 return value.length>1&&value.length<=60&&!broad.has(key(value))&&!/[\n\r@<>]|https?:|www\.|\d{2,4}[- ]\d{3,4}[- ]\d{4}|\d[\d,]*\s*(?:원|만원|달러)|[$₩]/i.test(value)
  &&!/(?:소개|선택\s*가이드|상세\s*정보|이용\s*안내|문의\s*안내| overview| selection guide| details)$/i.test(value);
}
export function recommendSeoKeywords(input:SeoInput,limit=6,evidenceOnly=false):string[]{
 const name=input.name.trim();
 const matches=families.filter(f=>f.categories.includes(input.category));
 const family=matches.find(f=>f.match.test(name));
 // Infer the actual product from its name first. A description is only a fallback for a broad name.
 const description=input.attributes.filter(a=>/^(소재|재질|상세설명|material|description)$/i.test(a.name)).map(a=>a.value).join(' ');
 const evidenceFamily=family??(!usable(name)?matches.find(f=>f.match.test(description)):undefined);
 const related=evidenceFamily?.terms??categories[input.category];
 const nouns=related[input.locale].split('|').filter(Boolean).filter(word=>!evidenceOnly||!!evidenceFamily||key(name+' '+description).includes(key(word)));
 const places=input.attributes.filter(a=>/^(지역|제공 지역|서비스 지역|도시|location|city|service area)$/i.test(a.name)&&a.value.length<=24&&usable(a.value.trim())).map(a=>a.value.trim());
 const local=places.map(place=>`${place} ${nouns[0]??name}`);
 const materials=input.attributes.filter(a=>/^(소재|재질|material)$/i.test(a.name)&&a.value.length<=16&&usable(a.value.trim())).map(a=>`${a.value.trim()} ${nouns[0]??name}`);
 const seen=new Set<string>();
 return [name,...local,...nouns,...materials].filter(value=>{
  if(!usable(value)||seen.has(key(value)))return false;
  seen.add(key(value));return true;
 }).slice(0,limit);
}
