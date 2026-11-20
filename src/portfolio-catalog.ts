// Public, reviewed display metadata only. Never source entries from private account history.
export const portfolioIndustries=[
 ['packaging','패키지·포장','Packaging'],['food','식품·농수산물','Food & produce'],
 ['beauty','뷰티','Beauty'],['fashion','패션','Fashion'],['jewelry','주얼리','Jewelry'],
 ['home','생활·가전','Home & appliances'],['travel','여행·숙박','Travel & stays'],
 ['dining','외식','Dining'],['medical','의료','Healthcare'],['insurance','보험','Insurance'],
 ['automotive','자동차','Automotive'],['industrial','산업재','Industrial supplies'],
] as const;
export type PortfolioIndustry=typeof portfolioIndustries[number][0];
type PublicEntry={id:string;campaignKey:string;industry:PortfolioIndustry;style:readonly[string,string];ratio:string;orientation:'square'|'portrait'|'landscape'};
// Adding an app result requires audited public source evidence; a UI flag alone is not verification.
export type PortfolioEntry=PublicEntry&({source:'concept'}|{source:'app-result';publicEvidenceRef:string;originalSha256:string;publicationApproved:true});
export const portfolioEntries:readonly PortfolioEntry[]=[
 ['beauty','beauty','텍스처 중심','Texture-focused'],['luxury','fashion','소재 디테일','Material details'],
 ['fashion','fashion','패션 에디토리얼','Fashion editorial'],['jewelry','jewelry','보석 매크로','Jewelry macro'],
 ['appliance','home','제품 히어로','Product hero'],['travel','travel','여행 풍경','Destination landscape'],
 ['hotel','travel','공간 분위기','Interior atmosphere'],['insurance','insurance','가상 서비스','Fictional service'],
 ['hospital','medical','가상 서비스','Fictional service'],['mobility','automotive','차량 디테일','Vehicle details'],
].map(([key,industry,ko,en])=>({id:`concept-${key}`,campaignKey:key,industry:industry as PortfolioIndustry,style:[ko,en],ratio:'9:16',orientation:'portrait',source:'concept'}));
