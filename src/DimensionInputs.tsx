import {useEffect,useRef,useState,useId} from 'react';
import {axisLabel,dimensionAxes} from './product';
import type {Project} from './model';
import {dimensionUnit,dimensionUnits,fromMillimeters,toMillimeters,validMillimeters,normalizeDimensionDecimal,type DimensionUnit} from './dimension-units';
import {useUiLanguage} from './ui-language';
function DimensionField({label,value,unit,onChange,onInvalid}:{label:string;value:string;unit:DimensionUnit;onChange:(mm:string)=>void;onInvalid:(invalid:boolean)=>void}){
 const {t}=useUiLanguage(),errorId=useId();
 const [draft,setDraft]=useState(()=>fromMillimeters(value,unit));
 const last=useRef({value,unit});
 useEffect(()=>{if(last.current.value!==value||last.current.unit!==unit)setDraft(fromMillimeters(value,unit));last.current={value,unit};},[value,unit]);
 const converted=toMillimeters(draft,unit),invalid=!!draft.trim()&&!validMillimeters(converted);
 useEffect(()=>onInvalid(invalid),[invalid,onInvalid]);
 const error=invalid?(converted===''?t('숫자와 소수점(.)만 입력해주세요. 예: 30.23','Use digits and a decimal point (.), e.g. 30.23.'):t('0보다 크고 100,000 mm 이하로 입력해주세요.','Enter a value greater than 0 and at most 100,000 mm.')):'';
 return <label className="field">{label} ({unit})<input aria-label={`${label} ${unit}`} inputMode="decimal" aria-invalid={invalid} aria-describedby={error?errorId:undefined} onBlur={()=>{if(converted!=='')setDraft(normalizeDimensionDecimal(draft));}} maxLength={18} value={draft} onChange={e=>{
  const next=e.target.value;
  // Keep invalid drafts visible and durable; strict request validation rejects them.
  // Unit switching stays disabled until corrected, so raw text is never reinterpreted.
  const mm=toMillimeters(next,unit),stored=mm||next;last.current={value:stored,unit};setDraft(next);onChange(stored);
 }}/>{error&&<span id={errorId} role="status">{label}: {error}</span>}</label>;
}
export function DimensionInputs({project,change}:{project:Project;change:(fn:(p:Project)=>Project)=>void}){
 const {language,t}=useUiLanguage(),axes=dimensionAxes(project.productProfile),unit=dimensionUnit(project.dimensions.displayUnit);
 const [invalidFields,setInvalidFields]=useState<Record<string,boolean>>({});
 if(!axes.length)return null;
 return <div className="dimension-fields"><label className="field dimension-unit-select">{t('단위','Unit')}<select aria-label={t('규격 단위','Dimension unit')} disabled={axes.some(axis=>invalidFields[axis])} value={unit} onChange={e=>change(p=>({...p,dimensions:{...p.dimensions,displayUnit:e.target.value as DimensionUnit}}))}>{dimensionUnits.map(u=><option key={u} value={u}>{u}</option>)}</select></label><div className="dimension-inputs">{axes.map(axis=><DimensionField key={project.id+axis} label={project.generation.dimensionBased&&project.generation.dimensionBasis==='garment-flat'?(axis==='width'?t('가슴 단면','Flat chest width'):t('총장','Garment length')):axisLabel(axis,language,project.productProfile)} unit={unit} value={project.dimensions[axis]} onInvalid={invalid=>setInvalidFields(old=>old[axis]===invalid?old:{...old,[axis]:invalid})} onChange={mm=>change(p=>({...p,dimensions:{...p.dimensions,[axis]:mm}}))}/>)}</div></div>;
}
