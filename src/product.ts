import {dimensionUnit,fromMillimeters,type DimensionUnit} from './dimension-units.ts';
import type {Project} from './model.ts';
import {isPhysicalCategory,resolveIndustryCategory} from './industry.ts';
import type {ProductCategory} from './industry.ts';
export {productCategories} from './industry.ts';
export type {ProductCategory} from './industry.ts';
export type SpecType = 'rectangular' | 'flat' | 'cylindrical' | 'none';
export type ProductProfile = {category: ProductCategory; specType: SpecType; material: string};
export const specTypes = [['rectangular','가로 × 세로 × 높이'],['flat','가로 × 세로'],['cylindrical','지름 × 높이'],['none','규격 정보 없음']] as const;
export const defaultProfile = ():ProductProfile => ({category:'other',specType:'rectangular',material:''});
export const isServiceCategory = (category:ProductCategory) => !isPhysicalCategory(category);
export function withCategory(p:Project,category:ProductCategory):Project {
  if(p.productProfile.category===category)return p;
  const noSpecsByDefault=isServiceCategory(category)||category==='automotive';
  return {...p,productProfile:{...p.productProfile,category,specType:noSpecsByDefault?'none':p.productProfile.specType},dimensions:noSpecsByDefault?{...p.dimensions,visible:false,lines:false}:p.dimensions};
}
export function parseProfile(value:unknown):ProductProfile {
  if(value===undefined)return defaultProfile(); // Earlier project files remain compatible.
  if(!value||typeof value!=='object')throw Error('상품 정보 형식이 올바르지 않습니다.');
  const p=value as ProductProfile;
  const category=resolveIndustryCategory(p.category);
  if(!category||!specTypes.some(([key])=>key===p.specType)||typeof p.material!=='string'||p.material.length>2000)throw Error('상품 분류 또는 규격 형식을 확인해주세요.');
  return {category,specType:p.specType,material:p.material};
}
export function dimensionAxes(profile?:ProductProfile):('width'|'depth'|'height')[] {
  if(profile?.specType==='none')return [];
  if(profile?.specType==='flat')return ['width','depth'];
  if(profile?.specType==='cylindrical')return ['width','height'];
  return ['width','depth','height'];
}
export function axisLabel(axis:'width'|'depth'|'height',locale:'ko'|'en',profile?:ProductProfile) {
  if(axis==='width'&&profile?.specType==='cylindrical')return locale==='ko'?'지름':'Diameter';
  return ({ko:{width:'가로',depth:'세로',height:'높이'},en:{width:'Width',depth:'Depth',height:'Height'}})[locale][axis];
}
export function specSummary(values:Record<'width'|'depth'|'height',string>&{displayUnit?:DimensionUnit},profile?:ProductProfile) {
  if(!dimensionAxes(profile).length)return '';
  return (profile?.specType==='cylindrical'?'Ø ':'')+dimensionAxes(profile).map(axis=>fromMillimeters(values[axis],dimensionUnit(values.displayUnit))).join(' × ')+' '+dimensionUnit(values.displayUnit);
}
