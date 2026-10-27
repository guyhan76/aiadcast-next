// Only explicit input strings. Never infer a brand or a price from a category/image.
export type ExactAdText={version:1;company:string;product:string;offers:string[]};
export function exactAdText(input:{productName:string;copy?:{company?:string;description?:string}}):ExactAdText{
 const company=(input.copy?.company??'').trim(),product=input.productName.trim();
 if(company.length>100||product.length>100||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(company+product))throw Error('INVALID_EXACT_TEXT');
 // Preserve the WHOLE price/conditions line. A number embedded in prose is ambiguous.
 const lines=(input.copy?.description??'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const price=/^(?:(?:가격|판매가|정가|할인가|총액|보증금|계약금|월|매월|1인|Price|From|Per person|Monthly)\s*[:：]?\s*)?(?:[₩$€£]\s*\d[\d,.]*|\d[\d,.]*\s*(?:원|만원|KRW|USD|EUR|GBP))(?:\s*(?:부터|이상|이하|\/월|\/회|per month|per person))?$/i;
 const offers=lines.filter(s=>price.test(s));
 // Multiple unlabeled figures could be a comparison/discount; don't separate them.
 return {version:1,company,product,offers:offers.length===1?offers:[]};
}
export function exactTextSnapshot(p:{exactTextVersion?:1;productName:string;copy:Record<string,{company:string;description:string}>;locale:string;footer?:{company?:boolean}}){
 return p.exactTextVersion===1?exactAdText({productName:p.productName,copy:{...p.copy[p.locale],company:p.footer?.company===false?'':p.copy[p.locale].company}}):undefined;
}
