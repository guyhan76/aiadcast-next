// Prices are supplied facts, never inferred from a product/category.
export function splitAdOffer(description:string):{description:string;offer:string}{
 const matches=[...description.matchAll(/(?<![\d,.])(?:\d+\s*(?:개|매|장|세트|박스)\s*(?:에|[:·])?\s*)?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*원|\$\s*\d+(?:,\d{3})*(?:\.\d{1,2})?/g)];
 // Multiple prices need their context (e.g. original/sale price); keep the copy intact.
 if(matches.length!==1)return {description,offer:''};
 const match=matches[0],offer=match[0];
 return {description:(description.slice(0,match.index)+description.slice(match.index!+offer.length)).replace(/[ \t]+/g,' ').replace(/^[\s·|,]+|[\s·|,]+$/g,'').trim(),offer};
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
