import {resolveIndustryCategory} from './industry.ts';
import {recommendSeoKeywords} from './seo-keywords.ts';
import {createMarketingPlan,type MarketingPlan} from './marketing-plan.ts';

// Display-only derivation. Never rewrite the saved plan, ad locale or request hash.
export function marketingPresentation(plan:MarketingPlan,language:'ko'|'en'){
 const explanation=createMarketingPlan({...plan.input,locale:language});
 // Search phrases follow the ad's audience language, not the app controls.
 // Presentation-only product family; never pad a sparse result with generic filler.
 const hoodie=plan.input.category==='fashion'&&/후드|hoodie|hooded/i.test(plan.input.name);
 const zip=/집업|zip[ -]?up/i.test(plan.input.name);
 const related=hoodie?(plan.input.locale==='ko'?(zip?['후드티','후드집업','집업 후드티','캐주얼 후드집업','후드 아우터']:['후드티','후드 상의','후드 스웨트셔츠','캐주얼 후드티','후드 의류']):(zip?['hoodie','zip-up hoodie','hooded sweatshirt','casual zip-up hoodie','hooded outerwear']:['hoodie','hooded top','hooded sweatshirt','casual hoodie','hooded clothing'])):null;
 // Electronics is a broad catalog, not evidence that the product is an appliance.
 const electronicTypes=[[/노트북|laptop|notebook/i,'노트북','laptop'],[/태블릿|tablet/i,'태블릿','tablet'],[/스마트폰|smartphone/i,'스마트폰','smartphone'],[/모니터|monitor/i,'모니터','monitor'],[/프린터|printer/i,'프린터','printer'],[/카메라|camera/i,'카메라','camera'],[/공기\s*청정기|air\s*purifier/i,'공기청정기','air purifier'],[/청소기|vacuum/i,'청소기','vacuum cleaner']] as const;
 const matched=electronicTypes.find(([pattern])=>pattern.test(plan.input.name));
 const electronic=plan.input.category==='electronics'?[plan.input.name,...(matched?[matched[plan.input.locale==='ko'?1:2]]:[])]:null;
 const candidates=electronic??(related?[plan.input.name,...related]:recommendSeoKeywords({...plan.input,category:resolveIndustryCategory(plan.input.category)??'other'},6,true));
 const seen=new Set<string>();
 const keywords=candidates.filter(word=>{const key=word.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,6);
 return {...explanation,keywords};
}
