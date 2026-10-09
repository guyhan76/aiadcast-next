import type {Project} from './model.ts';
import {dimensionAxes} from './product.ts';
export type ReferenceCheck={view:'perspective'|'front';confirmedSourceHash:string|null};
export const defaultReferenceCheck=():ReferenceCheck=>({view:'perspective',confirmedSourceHash:null});
export function parseReferenceCheck(value:unknown):ReferenceCheck{
 if(value===undefined)return defaultReferenceCheck();const r=value as ReferenceCheck;
 if(!r||!['perspective','front'].includes(r.view)||(r.confirmedSourceHash!==null&&(typeof r.confirmedSourceHash!=='string'||!/^[a-f0-9]{64}$/.test(r.confirmedSourceHash))))throw Error('사진 비례 점검 정보를 확인해주세요.');
 return {view:r.view,confirmedSourceHash:r.confirmedSourceHash};
}
export function assessReference(p:Project){
 const axes=dimensionAxes(p.productProfile),check=p.referenceCheck??defaultReferenceCheck();
 if(!axes.length)return {status:'not-applicable',message:'규격 없이 만드는 광고입니다.',relativeError:null};
 if(!p.product)return {status:'unverified',message:'원본 사진을 추가하면 규격과 함께 확인할 수 있습니다.',relativeError:null};
 if(check.view!=='front'||check.confirmedSourceHash!==p.product.sha256)return {status:'unverified',message:'사선 사진은 원근의 영향을 받습니다. 정면 사진의 두 변을 확인하기 전에는 비례 일치로 판정하지 않습니다.',relativeError:null};
 const vertical=p.productProfile.specType==='flat'?'depth':'height';
 const length=(axis:'width'|'depth'|'height')=>{const [a,b]=p.dimensions.anchors[axis];return Math.hypot((a.x-b.x)*p.product!.width,(a.y-b.y)*p.product!.height);};
 const w=length('width'),h=length(vertical),expected=Number(p.dimensions.width)/Number(p.dimensions[vertical]);
 if(!Number.isFinite(expected)||expected<=0||w<2||h<2)return {status:'invalid',message:'입력 규격과 사진의 두 변을 확인해주세요.',relativeError:null};
 const relativeError=Math.abs(w/h-expected)/expected;
 return relativeError>.1?{status:'mismatch',message:'사진의 두 변과 입력 규격의 비례가 다릅니다. 치수·사진·치수선 위치를 다시 확인해주세요.',relativeError}:{status:'consistent-in-plane',message:'선택한 두 변의 비례가 허용 오차 10% 안에 있습니다. 실물 치수·깊이·3D 형상의 검증은 별도로 필요합니다.',relativeError};
}
export function specificationContract(p:Project){
 const axes=dimensionAxes(p.productProfile);
 const values=axes.map(axis=>({axis:axis==='width'&&p.productProfile.specType==='cylindrical'?'diameter':axis,value:Number(p.dimensions[axis]),unit:'mm'}));
 if(values.some(s=>!Number.isFinite(s.value)||s.value<=0||s.value>100000))throw Error('생성 요청의 규격을 확인해주세요.');
 const basis=values[0]?.value;
 return {values,normalizedRatios:values.map(s=>({axis:s.axis,ratio:s.value/basis!})),sourceHash:p.product?.sha256??null,referenceAssessment:assessReference(p),preservation:p.generation.mode==='original'?'protected-source-layer':'creative-reference',geometryVerified:false};
}
