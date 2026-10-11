import {validMillimeters} from './dimension-units.ts';
import {dimensionAxes,parseProfile} from './product.ts';
import type {Asset,Project} from './model.ts';

export type GeneratedAsset = {
 jobId:string;mode:'original'|'creative';sourceHash:string|null;asset:Asset;
 role:'background'|'creative';model:string;createdAt:string;specificationKey:string;
};

// This is a local reuse key, not proof of provider origin or payment acceptance.
// Keep editable copy, aspect ratio, label visibility, anchors and brief out of it.
export function generatedCompatibilityKey(p:Project):string {
 return JSON.stringify({
  sourceHash:p.product?.sha256??null,
  ...(p.references?.length?{referenceHashes:p.references.map(a=>a.sha256)}:{}),
  mode:p.generation.mode,
  productProfile:{category:p.productProfile.category,specType:p.productProfile.specType,material:p.productProfile.material},
  specifications:dimensionAxes(p.productProfile).map(axis=>({axis,value:p.dimensions[axis],unit:'mm'})),
 });
}
export function hasUsableCreative(p:Project):boolean {
 const result=p.generated;
 return !!result&&p.generation.mode==='creative'&&result.mode==='creative'&&result.role==='creative'
  &&result.sourceHash===(p.product?.sha256??null)&&result.specificationKey===generatedCompatibilityKey(p)
  &&!!result.asset;
}
export function visualAsset(p:Project):Asset|null {
 return hasUsableCreative(p)?p.generated!.asset:p.product;
}

function metadataString(value:unknown,max:number):string {
 if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f]/.test(value))throw Error('생성 결과 정보를 확인해주세요.');
 return value;
}
function validHash(value:unknown):value is string|null {return value===null||(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value));}
export async function parseGenerated(value:unknown,readAsset:(value:unknown)=>Promise<Asset|null>):Promise<GeneratedAsset|undefined> {
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('생성 결과 형식이 올바르지 않습니다.');
 const r=value as GeneratedAsset;
 const jobId=metadataString(r.jobId,128),model=metadataString(r.model,160),createdAt=metadataString(r.createdAt,40),specificationKey=metadataString(r.specificationKey,4096);
 if(!/^[A-Za-z0-9_-]+$/.test(jobId)||!/^[A-Za-z0-9._:/-]+$/.test(model)||!['original','creative'].includes(r.mode)||!validHash(r.sourceHash)
  ||r.role!==(r.mode==='original'?'background':'creative')||!Number.isFinite(Date.parse(createdAt))||new Date(createdAt).toISOString()!==createdAt)throw Error('생성 결과의 제작 정보가 올바르지 않습니다.');
 // Reject malformed metadata before decoding any imported data URL.
 let key:unknown;try{key=JSON.parse(specificationKey);}catch{throw Error('생성 결과의 규격 정보를 확인해주세요.');}
 if(!key||typeof key!=='object'||Array.isArray(key))throw Error('생성 결과의 규격 정보를 확인해주세요.');
 const details=key as {sourceHash:unknown;mode:unknown;productProfile:unknown;specifications:unknown};
 if(details.sourceHash!==r.sourceHash||details.mode!==r.mode||!Array.isArray(details.specifications))throw Error('생성 결과의 원본·규격 정보가 일치하지 않습니다.');
 if(!details.productProfile||typeof details.productProfile!=='object'||Array.isArray(details.productProfile))throw Error('생성 결과의 상품 정보를 확인해주세요.');
 const profile=parseProfile(details.productProfile),axes=dimensionAxes(profile);
 if(details.specifications.length!==axes.length||details.specifications.some((entry,index)=>!entry||typeof entry!=='object'||entry.axis!==axes[index]||entry.unit!=='mm'||typeof entry.value!=='string'||!validMillimeters(entry.value)))throw Error('생성 결과의 규격 정보를 확인해주세요.');
 const asset=await readAsset(r.asset);
 if(!asset)throw Error('생성 결과 이미지가 누락되었습니다.');
 return {jobId,mode:r.mode,sourceHash:r.sourceHash,asset,role:r.role,model,createdAt,specificationKey};
}
