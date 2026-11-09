import {useRef,useState} from 'react';
import {Search,X,Check,ChevronRight,ArrowLeft} from 'lucide-react';
import {industryKindFor,type ProductCategory,type IndustryKind} from './industry';
import {browseGroups,industryOptions,searchIndustries,type IndustryOption} from './industry-catalog';
import {useUiLanguage} from './ui-language';

export function IndustrySelect({id,value,name,initialKind='product',onChange}:{id:string;value:ProductCategory|'';name?:string;initialKind?:IndustryKind;onChange:(value:ProductCategory,name?:string)=>void}){
 const {t,text,language}=useUiLanguage();
 const [kind,setKind]=useState<IndustryKind>(value?industryKindFor(value):initialKind);
 const [query,setQuery]=useState(''),[open,setOpen]=useState(!value),[group,setGroup]=useState(''),[active,setActive]=useState(-1);
 const input=useRef<HTMLInputElement>(null);
 const label=(o:IndustryOption)=>language==='ko'?o.ko:o.en??text(o.ko);
 const current=industryOptions.find(o=>o.category===value&&(o.name??'')===(name??''));
 const searching=!!query.trim(),matches=searching?searchIndustries(query,label):industryOptions.filter(o=>o.kind===kind&&o.group===group);
 const select=(category:ProductCategory,industryName?:string)=>{onChange(category,industryName);setKind(industryKindFor(category));setQuery('');setOpen(false);setActive(-1);input.current?.focus();};
 const selected=(o:IndustryOption)=>o.category===value&&(o.name??'')===(name??'');
 const listOpen=open&&(searching||!!group);
 return <div className="industry-search-select">
  <div className="industry-kind-tabs" role="group" aria-label={t('상품 또는 서비스','Products or services')}>
   {(['product','service'] as const).map(k=><button type="button" key={k} aria-pressed={kind===k} onClick={()=>{setKind(k);setQuery('');setGroup('');setOpen(true);setActive(-1);}}>{k==='product'?t('상품','Products'):t('서비스','Services')}</button>)}
  </div>
  <div className="industry-search">
   <Search size={19} aria-hidden="true"/>
   <input ref={input} id={id} type="search" role="combobox" aria-label={t('분야 검색','Search categories')} placeholder={t('전체 분야 검색 · 예: 신발, 카페, 박스','Search all · shoes, cafe, boxes')} value={query} maxLength={80} aria-expanded={listOpen} aria-controls={listOpen?id+'-results':undefined} aria-autocomplete="list" aria-activedescendant={listOpen&&active>=0?id+'-option-'+active:undefined} autoComplete="off"
    onChange={event=>{setQuery(event.target.value);setOpen(true);setActive(-1);}}
    onKeyDown={event=>{
     if(event.nativeEvent.isComposing||event.keyCode===229){if(event.key==='Enter')event.preventDefault();return;}
     if(event.key==='Enter'){event.preventDefault();if(listOpen&&active>=0&&matches[active])select(matches[active].category,matches[active].name);}
     if(event.key==='Escape'){setOpen(false);setQuery('');setActive(-1);}
     if((event.key==='ArrowDown'||event.key==='ArrowUp')&&matches.length){event.preventDefault();setOpen(true);const next=event.key==='ArrowDown'?(active+1)%matches.length:(active<=0?matches.length-1:active-1);setActive(next);document.getElementById(id+'-option-'+next)?.scrollIntoView({block:'nearest'});}
    }}/>
   {query&&<button type="button" aria-label={t('검색 지우기','Clear search')} onClick={()=>{setQuery('');setGroup('');setActive(-1);input.current?.focus();}}><X size={18} aria-hidden="true"/></button>}
  </div>
  {value&&<div className="industry-selected"><Check size={18} aria-hidden="true"/><span><small>{industryKindFor(value)==='product'?t('상품','Product'):t('서비스','Service')}</small><strong>{current?label(current):name}</strong></span><button type="button" aria-expanded={open} onClick={()=>{setOpen(!open);setGroup('');setQuery('');setActive(-1);}}>{open?t('닫기','Close'):t('변경','Change')}</button></div>}
  {open&&!searching&&<>
   {group?<button type="button" className="industry-back" onClick={()=>{setGroup('');setActive(-1);}}><ArrowLeft size={16} aria-hidden="true"/>{kind==='product'?t('상품 분야','Product categories'):t('서비스 분야','Service categories')}</button>:<div className="industry-group-grid" aria-label={kind==='product'?t('상품 분야','Product categories'):t('서비스 분야','Service categories')}>{browseGroups[kind].map(([key,ko,en])=><button type="button" key={key} onClick={()=>{setGroup(key);setActive(-1);}}>{t(ko,en)}<ChevronRight size={16} aria-hidden="true"/></button>)}</div>}
  </>}
  {open&&searching&&<p className="industry-result-count" role="status">{matches.length?t(`검색 결과 ${matches.length}개`,`Found ${matches.length} categories`):t('검색 결과가 없습니다. 아래에서 직접 선택할 수 있어요.','No matches. You can use your own category below.')}</p>}
  {listOpen&&<div className="industry-results" id={id+'-results'} role="listbox" aria-label={t('분야 검색 결과','Category results')}>
   {matches.map((o,i)=><button type="button" role="option" id={id+'-option-'+i} data-industry-key={o.key} key={o.key} aria-selected={selected(o)} className={active===i?'is-active':''} onClick={()=>select(o.category,o.name)}><span>{label(o)}</span>{searching&&<small>{o.kind==='product'?t('상품','Product'):t('서비스','Service')}</small>}{selected(o)?<Check size={18} aria-hidden="true"/>:<ChevronRight size={16} aria-hidden="true"/>}</button>)}
  </div>}
  {open&&searching&&!matches.some(o=>label(o)===query.trim())&&<div className="industry-custom"><p>{t(`“${query.trim()}” 직접 입력`,`Use “${query.trim()}”`)}</p><div><button type="button" onClick={()=>select('other',query.trim())}>{t('상품으로 선택','Use as product')}</button><button type="button" onClick={()=>select('services',query.trim())}>{t('서비스로 선택','Use as service')}</button></div></div>}
  {open&&!searching&&<p className="industry-hint">{t('찾는 분야가 없으면 검색창에 직접 입력해주세요.','Can’t find your category? Type it in the search box.')}</p>}
 </div>;
}

