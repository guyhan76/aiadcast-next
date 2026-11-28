// Prices are supplied facts, never inferred from a product/category.
export function splitAdOffer(description:string):{description:string;offer:string}{
 const matches=[...description.matchAll(/(?<![\d,.])(?:\d+\s*(?:개|매|장|세트|박스)\s*(?:에|[:·])?\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*원|\$\s*\d+(?:,\d{3})*(?:\.\d{1,2})?/g)];
 // Multiple prices need their context (e.g. original/sale price); keep the copy intact.
 if(matches.length!==1)return {description,offer:''};
 const match=matches[0];let start=match.index!,end=start+match[0].length;
 const qualifier=description.slice(0,start).match(/(?:매월|월|회당|판매가|정가|할인가|총액|최저|최대|최소|약|보증금|계약금)\s*[:·]?\s*$/);
 if(qualifier)start-=qualifier[0].length;
 const condition=description.slice(end).match(/^\s*(?:부터|이상|이하|\/\s*월|\/\s*회|per month|per visit)/i);
 if(condition)end+=condition[0].length;
 const offer=description.slice(start,end);
 return {description:(description.slice(0,start)+description.slice(end)).replace(/[ \t]+/g,' ').replace(/^[\s·|,]+|[\s·|,]+$/g,'').trim(),offer};
}
export function compactAdDescription(value:string):string{
 const normalized=value.trim().replace(/\s+/g,' ');
 if(normalized.length<=160)return normalized;
 const {description,offer}=splitAdOffer(normalized);
 // Do not truncate a comparison of multiple prices and lose its financial context.
 if(!offer&&/(?:\d[\d,.]*\s*원|\$\s*\d)/.test(normalized))return normalized;
 const limit=160-(offer?offer.length+3:0);
 const prefix=description.slice(0,limit),boundary=Math.max(prefix.lastIndexOf(' '),prefix.lastIndexOf('.'),prefix.lastIndexOf('。'));
 const excerpt=(boundary>limit*.6?prefix.slice(0,boundary):prefix).trim();
 return [excerpt,offer].filter(Boolean).join(' · ');
}

// Separate supplied facts for a readable ad, without adding fulfilment promises,
// prices or product benefits. Edited copy remains the only public fact source.
export function adDetails(value:string){
 const {description,offer}=splitAdOffer(value);
 const parts=description.split(/\n+|\s*[·;。]\s*|\.\s+(?!\d)/).map(s=>s.trim().replace(/\.$/,'')).filter(Boolean);
 let delivery='';
 const facts=parts.filter(part=>{if(!delivery&&/^(?:빠른\s*배송|신속한\s*배송|당일\s*배송|무료\s*배송|로켓\s*배송|fast shipping|free shipping)$/i.test(part)){delivery=part;return false;}return true;});
 // A material label followed by its explanation belongs in the same feature.
 if(facts.length>3&&facts[0].length<24&&/(?:골|재질|소재|크라프트|material)/i.test(facts[0]))facts.splice(0,2,facts.slice(0,2).join(' · '));
 if(facts.length<2)return {lead:facts.join(' '),features:[] as string[],offer,delivery};
 return {lead:facts.slice(3).join('. '),features:facts.slice(0,3),offer,delivery};
}
