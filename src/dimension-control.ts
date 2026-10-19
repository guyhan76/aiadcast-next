import type {Project} from './model.ts';
import {validMillimeters} from './dimension-units.ts';
export type DimensionControl={version:1;shape:'open-carton'|'cylinder';annotation:'none'|'direct'|'inset';acceptedKey?:string};
export type SemanticMeasurement={id:string;valueMm:string;basis:'body-exterior'|'laid-flat';excludes:string[]};
export function semanticMeasurements(p:Project):SemanticMeasurement[]{
 const m=(id:string,valueMm:string,excludes:string[]=[],basis:SemanticMeasurement['basis']='body-exterior')=>({id,valueMm,basis,excludes});
 if(p.productProfile.specType==='none')return [];
 if(p.productProfile.specType==='cylindrical')return [m('body.diameter',p.dimensions.width),m('body.height',p.dimensions.height,['cap','shoulder'])];
 if(p.generation.dimensionBasis==='garment-flat')return [m('garment.chestFlatWidth',p.dimensions.width,[],'laid-flat'),m('garment.totalLength',p.dimensions.depth,[],'laid-flat')];
 if(p.productProfile.specType==='frontal')return [m('body.width',p.dimensions.width),m('body.height',p.dimensions.height,['stand','attachments'])];
 if(p.productProfile.specType==='flat')return [m('plane.width',p.dimensions.width),m('plane.height',p.dimensions.depth)];
 return [m('body.width',p.dimensions.width),m('body.depth',p.dimensions.depth),m('body.height',p.dimensions.height,p.productProfile.category==='boxes'?['flaps']:['handles','attachments'])];
}
export function availableControlShape(p:Project):DimensionControl['shape']|null{
 if(p.generation.mode!=='creative')return null;
 if(p.productProfile.specType==='rectangular'&&p.productProfile.category==='boxes')return 'open-carton';
 if(p.productProfile.specType==='cylindrical')return 'cylinder';
 return null;
}
export function parseDimensionControl(raw:unknown):DimensionControl|undefined{
 if(raw===undefined)return;const r=raw as DimensionControl;
 if(!r||r.version!==1||!['open-carton','cylinder'].includes(r.shape)||!['none','direct','inset'].includes(r.annotation)||r.acceptedKey!==undefined&&(typeof r.acceptedKey!=='string'||r.acceptedKey.length>20000))throw Error('INVALID_DIMENSION_CONTROL');
 return{version:1,shape:r.shape,annotation:r.annotation,...(r.acceptedKey?{acceptedKey:r.acceptedKey}:{})};
}
export function dimensionControlErrors(p:Project):string[]{
 if(!p.dimensionControl)return [];
 const ko=p.locale==='ko',errors:string[]=[];
 if(availableControlShape(p)!==p.dimensionControl.shape)errors.push(ko?'현재 상품 형태는 규격 제어 구성에서 지원하지 않습니다. 사진 모드를 유지하거나 지원 형태를 확인해주세요.':'This shape is not supported by dimension-controlled composition. Keep the photo mode or check the shape.');
 if(!p.product)errors.push(ko?'색상을 참고할 상품 사진을 추가해주세요.':'Add a reference photo for color.');
 if(semanticMeasurements(p).some(m=>!validMillimeters(m.valueMm)))errors.push(ko?'제품 형상의 모든 필수 규격을 확인해주세요.':'Check every required product measurement.');
 return errors;
}
export function dimensionControlKey(p:Project){return JSON.stringify({version:1,shape:p.dimensionControl?.shape,annotation:p.dimensionControl?.annotation,measurements:semanticMeasurements(p),source:p.product?.sha256,format:p.format,locale:p.locale,unit:p.dimensions.displayUnit,copy:p.copy[p.locale],footer:p.footer});}
