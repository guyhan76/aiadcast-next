import {useEffect,useId,useRef,useState} from 'react';
import {ArrowRight,BriefcaseBusiness,Building2,Car,Check,ChevronDown,Dumbbell,GraduationCap,HeartPulse,Landmark,Package,Plane,Search,Shapes,Shirt,Sparkles,UtensilsCrossed,X} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {industryGroups,industryGroupFor,industryLabel,productCategories} from './industry';
import type {ProductCategory} from './product';
import './industry-picker.css';

export const industryGroupIcons:Record<string,LucideIcon>={packaging:Package,products:Shapes,fashion:Shirt,dining:UtensilsCrossed,travel:Plane,learning:GraduationCap,sports:Dumbbell,health:HeartPulse,property:Building2,finance:Landmark,mobility:Car,fortune:Sparkles,business:BriefcaseBusiness};
export function IndustryIcon({groupId,size=22}:{groupId:string;size?:number}){const Icon=industryGroupIcons[groupId]??BriefcaseBusiness;return <Icon size={size} strokeWidth={1.5} aria-hidden="true"/>;}
type Props={value:ProductCategory;onChange:(category:ProductCategory)=>void;compact?:boolean};
const normalize=(text:string)=>text.toLocaleLowerCase().replace(/[\s·・,\-]/g,'');

export function IndustryPicker({value,onChange,compact=false}:Props){
 const id=useId(),[expanded,setExpanded]=useState(!compact),[query,setQuery]=useState('');
 const toggleRef=useRef<HTMLButtonElement>(null),searchRef=useRef<HTMLInputElement>(null),returnFocus=useRef(false);
 const group=industryGroupFor(value),term=normalize(query);
 const results=term?productCategories.filter(([category,label])=>normalize(`${label} ${industryGroupFor(category).label}`).includes(term)):[];
 useEffect(()=>{if(!expanded&&returnFocus.current){toggleRef.current?.focus();returnFocus.current=false;}},[expanded]);
 function select(category:ProductCategory){
  onChange(category);setQuery('');
  if(compact){returnFocus.current=true;setExpanded(false);}else if(term)searchRef.current?.focus();
 }
 return <section className={`industry-picker${compact?' industry-picker-compact':''}`} role="group" aria-label="업종 선택">
  {compact?<button type="button" ref={toggleRef} className="industry-picker-toggle" aria-expanded={expanded} aria-controls={`${id}-choices`} onClick={()=>setExpanded(!expanded)}><span className="industry-selected-icon"><IndustryIcon groupId={group.id} size={19}/></span><span><small>업종 변경</small><strong>{industryLabel(value)}</strong></span><ChevronDown size={17} aria-hidden="true"/></button>:<div className="industry-picker-heading"><strong>어떤 업종을 광고하나요?</strong><span>가까운 업종을 골라주세요.</span></div>}
  {(!compact||expanded)&&<div id={`${id}-choices`} className="industry-picker-choices">
   <div className="industry-search"><Search size={17} aria-hidden="true"/><label className="sr-only" htmlFor={`${id}-search`}>업종 찾기</label><input ref={searchRef} id={`${id}-search`} type="search" placeholder="업종 찾기" value={query} onChange={e=>setQuery(e.target.value)} autoComplete="off"/>{query&&<button type="button" aria-label="업종 검색 지우기" onClick={()=>{setQuery('');searchRef.current?.focus();}}><X size={15} aria-hidden="true"/></button>}</div>
   {term?<div className="industry-search-results"><p aria-live="polite">{results.length?`검색 결과 ${results.length}개`:'일치하는 업종이 없습니다.'}</p>{results.length?<div className="industry-result-list" role="group" aria-label="업종 검색 결과">{results.slice(0,8).map(([category,label])=><button type="button" key={category} aria-label={industryLabel(category)} aria-pressed={value===category} onClick={()=>select(category)}><span><strong>{label}</strong><small>{industryGroupFor(category).label}</small></span>{value===category?<Check size={16} aria-hidden="true"/>:<ArrowRight size={16} aria-hidden="true"/>}</button>)}</div>:<div className="industry-search-empty"><span>다른 검색어를 입력하거나<br/>기타 서비스로 시작할 수 있어요.</span><button type="button" onClick={()=>select('services')}>기타 서비스 선택<ArrowRight size={15} aria-hidden="true"/></button></div>}{results.length>8&&<small className="industry-search-more">가까운 결과 8개를 표시했습니다. 조금 더 자세히 검색해보세요.</small>}</div>:<>
    <div className="industry-group-grid" role="group" aria-label="업종 그룹">{industryGroups.map(item=><button type="button" key={item.id} className="industry-group-card" aria-label={`${item.label} 업종 그룹`} aria-pressed={group.id===item.id} onClick={()=>{if(group.id!==item.id)onChange(item.categoryIds[0]);}}><span className="industry-card-icon"><IndustryIcon groupId={item.id}/>{group.id===item.id&&<Check size={13} className="industry-card-check" aria-hidden="true"/>}</span><strong>{item.label}</strong><small>{item.description}</small></button>)}</div>
    <div className="industry-detail"><div className="industry-detail-heading"><span>{group.label}</span><small>세부 업종 선택</small></div><div className="industry-detail-options" role="group" aria-label={`${group.label} 세부 업종`}>{group.categoryIds.map(category=><button type="button" key={category} aria-label={industryLabel(category)} aria-pressed={value===category} onClick={()=>select(category)}>{value===category&&<Check size={13} aria-hidden="true"/>}{industryLabel(category)}</button>)}</div></div>
   </>}
  </div>}
 </section>;
}
