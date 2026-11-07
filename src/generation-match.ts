// Same selection for request and server-normalized snapshots. Excludes derived
// recommendations, provider prices, IDs and client verification claims.
const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
export function generationMatchKey(r:any):string{
 const d=r.dimensionDisplay,o=r.output??{};
 return JSON.stringify(canonical({...(r.selectiveEdit?{selectiveEdit:r.selectiveEdit}:{}),version:1,mode:r.mode,subjectType:r.subjectType,inputMode:r.inputMode==='text-example'?'text-example':null,productName:r.productName,productProfile:r.productProfile??{},brief:r.brief,campaign:r.campaign,direction:r.direction??{},creativeDirection:r.creativeDirection??null,scene:r.scene??{},specifications:r.specifications??[],copy:r.copy??{},source:r.source??null,references:r.references??[],dimensionDisplay:d?{method:d.method,layout:d.layout}:null,dimensionPlan:r.dimensionPlan??null,proportionControl:r.proportionControl??null,output:{format:o.format,locale:o.locale,displayUnit:o.displayUnit??'mm',compositionKey:o.compositionKey,showDimensions:o.showDimensions===true,showDimensionLines:o.showDimensions===true&&o.showDimensionLines===true,manualDimensionBase:o.manualDimensionBase===true}}));
}
