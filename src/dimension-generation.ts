export type DimensionPlan={version:1;sourceHash:string;variantLabel:string;basis:'outer-body'|'inner-body'|'body'|'garment-flat';specType:'rectangular'|'flat'|'frontal'|'cylindrical';measurements:{axis:string;meaning:string;value:string;unit:'mm'}[]};
export function makeDimensionPlan({sourceHash,variantLabel='',basis='outer-body',specType,specifications}:{sourceHash:string;variantLabel?:string;basis?:string;specType:string;specifications:{axis:string;value:string;unit:string}[]}):DimensionPlan{
 const axes=specType==='frontal'?['width','height']:specType==='flat'?['width','depth']:specType==='cylindrical'?['diameter','height']:specType==='rectangular'?['width','depth','height']:[];
 if(!/^[a-f0-9]{64}$/.test(sourceHash)||typeof variantLabel!=='string'||variantLabel.length>80||!['outer-body','inner-body','body','garment-flat'].includes(basis)||basis==='garment-flat'&&specType!=='flat'||!axes.length||specifications.length!==axes.length||specifications.some((s,i)=>s.axis!==axes[i]||s.unit!=='mm'||typeof s.value!=='string'||!/^\d+(\.\d{1,8})?$/.test(s.value)||!(Number(s.value)>0&&Number(s.value)<=100000)))throw Error('INVALID_DIMENSION_PLAN');
 return {version:1,sourceHash,variantLabel,basis:basis as DimensionPlan['basis'],specType:specType as DimensionPlan['specType'],measurements:specifications.map(s=>({...s,unit:'mm',meaning:basis==='garment-flat'?(s.axis==='width'?'flat-chest-width':'garment-length'):s.axis}))};
}
export function parseDimensionPlan(value:unknown):DimensionPlan|undefined{
 if(value===undefined)return undefined;const r=value as DimensionPlan;if(!r||r.version!==1||!Array.isArray(r.measurements))throw Error('INVALID_DIMENSION_PLAN');
 const expected=makeDimensionPlan({...r,specifications:r.measurements});if(r.measurements.some((m,i)=>m.meaning!==expected.measurements[i].meaning))throw Error('INVALID_DIMENSION_PLAN');return expected;
}
