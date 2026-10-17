import {useEffect,useRef,useState} from 'react';
import {axisLabel,dimensionAxes} from './product';
import type {Project} from './model';
import {dimensionUnit,dimensionUnits,fromMillimeters,toMillimeters,type DimensionUnit} from './dimension-units';
import {useUiLanguage} from './ui-language';
function DimensionField({label,value,unit,onChange}:{label:string;value:string;unit:DimensionUnit;onChange:(mm:string)=>void}){
 const [draft,setDraft]=useState(()=>fromMillimeters(value,unit));
 const last=useRef({value,unit});
 useEffect(()=>{if(last.current.value!==value||last.current.unit!==unit)setDraft(fromMillimeters(value,unit));last.current={value,unit};},[value,unit]);
 return <label className="field">{label} ({unit})<input aria-label={`${label} ${unit}`} inputMode="decimal" maxLength={18} value={draft} onChange={e=>{
  const next=e.target.value;
  const mm=toMillimeters(next,unit);last.current={value:mm,unit};setDraft(next);onChange(mm);
 }}/></label>;
}
export function DimensionInputs({project,change}:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {language,t}=useUiLanguage(),axes=dimensionAxes(project.productProfile),unit=dimensionUnit(project.dimensions.displayUnit);
 if(!axes.length)return null;
 return <div className="dimension-fields"><label className="field dimension-unit-select">{t('단위','Unit')}<select aria-label={t('규격 단위','Dimension unit')} value={unit} onChange={e=>change(p=>({...p,dimensions:{...p.dimensions,displayUnit:e.target.value as DimensionUnit}}))}>{dimensionUnits.map(u=><option key={u} value={u}>{u}</option>)}</select></label><div className="dimension-inputs">{axes.map(axis=><DimensionField key={project.id+axis} label={project.generation.dimensionBased&&project.generation.dimensionBasis==='garment-flat'?(axis==='width'?t('가슴 단면','Flat chest width'):t('총장','Garment length')):axisLabel(axis,language,project.productProfile)} unit={unit} value={project.dimensions[axis]} onChange={mm=>change(p=>({...p,dimensions:{...p.dimensions,[axis]:mm}}))}/>)}</div></div>;
}
