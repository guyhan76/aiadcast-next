import {createMarketingPlan,type MarketingPlan} from './marketing-plan.ts';

// Display-only derivation. Never rewrite the saved plan, ad locale or request hash.
export function marketingPresentation(plan:MarketingPlan,language:'ko'|'en'){
 const explanation=createMarketingPlan({...plan.input,locale:language});
 // Search phrases follow the ad's audience language, not the app controls.
 // Presentation-only product family; never pad a sparse result with generic filler.
 const hoodie=plan.input.category==='fashion'&&/후드|hoodie|hooded/i.test(plan.input.name);
 const zip=/집업|zip[ -]?up/i.test(plan.input.name);
 const related=hoodie?(plan.input.locale==='ko'?(zip?['후드티','후드집업','집업 후드티','캐주얼 후드집업','후드 아우터']:['후드티','후드 상의','후드 스웨트셔츠','캐주얼 후드티','후드 의류']):(zip?['hoodie','zip-up hoodie','hooded sweatshirt','casual zip-up hoodie','hooded outerwear']:['hoodie','hooded top','hooded sweatshirt','casual hoodie','hooded clothing'])):null;
 const candidates=related?[plan.input.name,...related]:plan.keywords;
 const seen=new Set<string>();
 const keywords=candidates.filter(word=>{const key=word.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,6);
 return {...explanation,keywords};
}
