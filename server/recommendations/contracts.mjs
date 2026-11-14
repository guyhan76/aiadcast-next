import {createHash} from 'node:crypto';
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function snapshotOf(record,ownerId){
 if(!record||record.ownerId!==ownerId||record.media!=='image'||record.persisted!==true||!Buffer.isBuffer(record.imageBytes)||record.imageBytes.length>10_000_000||!record.imageBytes.length||hash(record.imageBytes)!==record.artifactHash)throw Error('OWNED_PERSISTED_IMAGE_REQUIRED');
 const s=record.snapshot;
 if(!s||!text(s.productName,300)||!['ko','en'].includes(s.adLanguage)||!text(s.purpose,300)||!text(s.format,30)||!Array.isArray(s.facts)||s.facts.length>30||s.facts.some(x=>!text(x.name,100)||!text(x.value,2000))||typeof s.directions!=='string'||s.directions.length>3000||!Array.isArray(s.confirmedCopy)||s.confirmedCopy.length>10||s.confirmedCopy.some(x=>!text(x,1000)))throw Error('INVALID_SNAPSHOT');
 // Allowlist: contacts, source images, credentials and mutable project state excluded.
 return canonical({productName:s.productName,facts:s.facts.map(({name,value})=>({name,value})),directions:s.directions,confirmedCopy:s.confirmedCopy,adLanguage:s.adLanguage,purpose:s.purpose,format:s.format});
}
export function validateOutput(raw,provenance='mock-ai'){
 if(!raw||!['mock-ai','openai'].includes(provenance)||raw.provenance!==provenance||!Array.isArray(raw.channels)||raw.channels.length<1||raw.channels.length>3||!Array.isArray(raw.keywords)||raw.keywords.length<1||raw.keywords.length>6)throw Error('INVALID_RECOMMENDATION');
 const channels=raw.channels.map(c=>{if(!['instagram','website','blog','lookbook','brochure'].includes(c.channel)||!text(c.reason,300)||!text(c.usage,300)||!Array.isArray(c.evidence)||!c.evidence.length||c.evidence.some(x=>!['productName','facts','directions','confirmedCopy','adLanguage','purpose','format','artifact'].includes(x)))throw Error('INVALID_RECOMMENDATION');return {channel:c.channel,reason:c.reason,usage:c.usage,evidence:c.evidence};});
 if(new Set(channels.map(c=>c.channel)).size!==channels.length||raw.keywords.some(k=>!text(k,100))||new Set(raw.keywords.map(k=>k.trim().toLowerCase())).size!==raw.keywords.length)throw Error('INVALID_RECOMMENDATION');
 return {provenance,channels,keywords:raw.keywords,confidence:'unverified',searchVolumeVerified:false};
}

// Only a persisted server request enters here; never a mutable client draft.
export function savedRequestSnapshot(request){
 const input=request.marketingPlan?.input,attributes=request.attributes??input?.attributes??[];
 const facts=[...attributes,...(request.productProfile?.category?[{name:'category',value:request.productProfile.category}]:[]),...(request.productProfile?.material&&!attributes.some(x=>x.value===request.productProfile.material)?[{name:'description',value:request.productProfile.material}]:[]),...(request.specifications??[]).map(x=>({name:x.axis,value:x.value+' '+x.unit}))];
 return {productName:request.productName,facts,directions:[request.brief,request.creativeDirection?.additionalInstructions].filter(x=>typeof x==='string'&&x.trim()).filter((x,i,a)=>a.indexOf(x)===i).join('\n'),confirmedCopy:Object.values(request.copy??{}).filter(x=>typeof x==='string'&&x.trim()),adLanguage:request.output.locale,purpose:input?.goal??'product introduction',format:request.output.format};
}
