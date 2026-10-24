import {createMarketingPlan,type MarketingPlan} from './marketing-plan.ts';

// Display-only derivation. Never rewrite the saved plan, ad locale or request hash.
export function marketingPresentation(plan:MarketingPlan,language:'ko'|'en'){
 const explanation=createMarketingPlan({...plan.input,locale:language});
 // Search phrases follow the ad's audience language, not the app controls.
 // Clothing has too few baseline nouns; add relevant nouns, never filler sentences.
 const extra=plan.input.category==='fashion'?(plan.input.locale==='ko'
  ?['의류','패션의류','의류쇼핑','패션쇼핑','의류매장','의류브랜드']
  :['clothing','fashion clothing','clothing shopping','fashion apparel','clothing stores','clothing brands']):[];
 const seen=new Set<string>();
 const keywords=[...plan.keywords,...extra].filter(word=>{const key=word.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');if(seen.has(key))return false;seen.add(key);return true;}).slice(0,6);
 return {...explanation,keywords};
}
