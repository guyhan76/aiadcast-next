import {useUiLanguage} from './ui-language';
import {useEffect,useId,useRef,useState} from 'react';
import {ArrowRight,BriefcaseBusiness,Building2,Car,Check,ChevronDown,Dumbbell,Factory,GraduationCap,HeartPulse,Landmark,Monitor,Package,Plane,Search,Shapes,Shirt,Sofa,Sparkles,UtensilsCrossed,Wheat,X} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {industryGroupsFor,industryGroupFor,industryKindFor,industryKinds,industryLabel,productCategories} from './industry';
import type {IndustryGroup,IndustryKind} from './industry';
import type {ProductCategory} from './product';
import './industry-picker.css';

export const industryGroupIcons:Record<string,LucideIcon>={electronics:Monitor,packaging:Package,products:Shapes,fashion:Shirt,industrial:Factory,food:Wheat,beauty:Sparkles,home:Sofa,automotive:Car,dining:UtensilsCrossed,travel:Plane,learning:GraduationCap,sports:Dumbbell,health:HeartPulse,property:Building2,finance:Landmark,mobility:Car,fortune:Sparkles,business:BriefcaseBusiness};
export function IndustryIcon({groupId,size=22}:{groupId:string;size?:number}){const Icon=industryGroupIcons[groupId]??BriefcaseBusiness;return <Icon size={size} strokeWidth={1.5} aria-hidden="true"/>;}
type Props={value?:ProductCategory;onChange:(category:ProductCategory)=>void;compact?:boolean;initialKind?:IndustryKind;onClearSelection?:()=>void};
const normalize=(text:string)=>text.toLocaleLowerCase().replace(/[\s·・,\-]/g,'');

export function IndustryPicker({value,onChange,compact=false,initialKind,onClearSelection}:Props){
 const {t,text}=useUiLanguage();
 const id=useId(),[expanded,setExpanded]=useState(!compact),[query,setQuery]=useState('');
 const [kind,setKind]=useState<IndustryKind|undefined>(()=>value?industryKindFor(value):initialKind);
 const [groupId,setGroupId]=useState<string|undefined>(()=>value?industryGroupFor(value).id:undefined);
 const toggleRef=useRef<HTMLButtonElement>(null),searchRef=useRef<HTMLInputElement>(null),returnFocus=useRef(false);
 const detailRef=useRef<HTMLDivElement>(null),revealDetail=useRef(false);
 const committedGroup=value?industryGroupFor(value):undefined;
 const groups=kind?industryGroupsFor(kind):[],group=groups.find(item=>item.id===groupId),term=normalize(query);
 const results=term?productCategories.filter(([category,label])=>industryKindFor(category)===kind&&normalize(`${text(label)} ${text(label)} ${text(industryGroupFor(category).label)} ${text(industryGroupFor(category).label)}`).includes(term)):[];
 useEffect(()=>{if(value){setKind(industryKindFor(value));setGroupId(industryGroupFor(value).id);}},[value]);
 useEffect(()=>{if(!expanded&&returnFocus.current){toggleRef.current?.focus();returnFocus.current=false;}},[expanded]);
 useEffect(()=>{if(revealDetail.current&&detailRef.current){detailRef.current.scrollIntoView({block:'nearest'});revealDetail.current=false;}},[groupId]);
 function select(category:ProductCategory){
  setKind(industryKindFor(category));setGroupId(industryGroupFor(category).id);onChange(category);setQuery('');
  if(compact){returnFocus.current=true;setExpanded(false);}else if(term)searchRef.current?.focus();
 }
 function chooseKind(next:IndustryKind){
  if(next===kind)return;
  revealDetail.current=false;setKind(next);setGroupId(undefined);setQuery('');onClearSelection?.();
 }
 function chooseGroup(item:IndustryGroup){
  if(item.categoryIds.length===1){select(item.categoryIds[0]);return;}
  if(groupId===item.id){detailRef.current?.scrollIntoView({block:'nearest'});}else{revealDetail.current=true;setGroupId(item.id);}
  if(committedGroup?.id!==item.id)onClearSelection?.();
 }
 function toggle(){
  if(!expanded){setKind(value?industryKindFor(value):initialKind);setGroupId(committedGroup?.id);setQuery('');}
  setExpanded(!expanded);
 }
 return <section className={`industry-picker${compact?' industry-picker-compact':''}${!kind?' industry-picker-unselected':''}`} role="group" aria-label={text("업종 선택")}>
  {compact?<button type="button" ref={toggleRef} className="industry-picker-toggle" aria-expanded={expanded} aria-controls={`${id}-choices`} onClick={toggle}><span className="industry-selected-icon"><IndustryIcon groupId={committedGroup?.id??'products'} size={19}/></span><span><small>{text("업종 변경")}</small><strong>{value?text(industryLabel(value)):text('광고 대상 선택')}</strong></span><ChevronDown size={17} aria-hidden="true"/></button>:<div className="industry-picker-heading"><strong>{text("무엇을 광고하고 싶으세요?")}</strong><span>{text("상품과 서비스 중 먼저 골라주세요.")}</span></div>}
  {(!compact||expanded)&&<div id={`${id}-choices`} className="industry-picker-choices">
   <div className="industry-kind-options" role="group" aria-label={text("상품 또는 서비스 선택")}>{industryKinds.map(item=><button type="button" key={item.id} className="industry-kind-card" aria-label={text(item.label)} aria-pressed={kind===item.id} onClick={()=>chooseKind(item.id)}><span className="industry-kind-icon">{item.id==='product'?<Package size={22} strokeWidth={1.5} aria-hidden="true"/>:<BriefcaseBusiness size={22} strokeWidth={1.5} aria-hidden="true"/>}</span><span><strong>{text(item.label)}</strong><small>{text(item.description)}</small></span>{kind===item.id?<Check size={16} aria-hidden="true"/>:<ArrowRight size={16} aria-hidden="true"/>}</button>)}</div>
   {kind&&<div className="industry-branch">
    <div className="industry-branch-heading"><strong>{kind==='product'?t('상품 카테고리','Product categories'):t('서비스 카테고리','Service categories')}</strong><span>{text("가까운 분야를 선택하세요.")}</span></div>
    <div className="industry-search"><Search size={17} aria-hidden="true"/><label className="sr-only" htmlFor={`${id}-search`}>{text("업종 찾기")}</label><input ref={searchRef} id={`${id}-search`} type="search" placeholder={kind==='product'?text('상품 업종 찾기'):text('서비스 업종 찾기')} value={query} onChange={e=>setQuery(e.target.value)} autoComplete="off"/>{query&&<button type="button" aria-label={text("업종 검색 지우기")} onClick={()=>{setQuery('');searchRef.current?.focus();}}><X size={15} aria-hidden="true"/></button>}</div>
    {term?<div className="industry-search-results"><p aria-live="polite">{results.length?t(`검색 결과 ${results.length}개`,`${results.length} results`):text('일치하는 업종이 없습니다.')}</p>{results.length?<div className="industry-result-list" role="group" aria-label={text("업종 검색 결과")}>{results.slice(0,8).map(([category,label])=><button type="button" key={category} aria-label={text(industryLabel(category))} aria-pressed={value===category} onClick={()=>select(category)}><span><strong>{text(label)}</strong><small>{text(industryGroupFor(category).label)}</small></span>{value===category?<Check size={16} aria-hidden="true"/>:<ArrowRight size={16} aria-hidden="true"/>}</button>)}</div>:<div className="industry-search-empty"><span>{text("다른 검색어를 입력하거나")}<br/>{kind==='product'?text('기타 상품으로'):text('기타 서비스로')}{text(" 시작할 수 있어요.")}</span><button type="button" onClick={()=>select(kind==='product'?'other':'services')}>{kind==='product'?text('기타 상품 선택'):text('기타 서비스 선택')}<ArrowRight size={15} aria-hidden="true"/></button></div>}{results.length>8&&<small className="industry-search-more">{text("가까운 결과 8개를 표시했습니다. 조금 더 자세히 검색해보세요.")}</small>}</div>:<>
     <div className="industry-group-grid" role="group" aria-label={text("업종 그룹")}>{groups.map(item=><button type="button" key={item.id} className="industry-group-card" aria-label={`${text(item.label)} ${t('업종 그룹','categories')}`} aria-pressed={groupId===item.id} onClick={()=>chooseGroup(item)}><span className="industry-card-icon"><IndustryIcon groupId={item.id}/>{groupId===item.id&&<Check size={13} className="industry-card-check" aria-hidden="true"/>}</span><strong>{text(item.label)}</strong><small>{text(item.description)}</small></button>)}</div>
     {group&&<div ref={detailRef} className="industry-detail"><div className="industry-detail-heading"><span>{text(group.label)}</span><small>{group.categoryIds.length===1?text('선택한 업종'):text('세부 업종 선택')}</small></div><div className="industry-detail-options" role="group" aria-label={`${text(group.label)} ${t('세부 업종','types')}`}>{group.categoryIds.map(category=><button type="button" key={category} aria-label={text(industryLabel(category))} aria-pressed={value===category} onClick={()=>select(category)}>{value===category&&<Check size={13} aria-hidden="true"/>}{text(industryLabel(category))}</button>)}</div></div>}
    </>}
   </div>}
  </div>}
 </section>;
}
