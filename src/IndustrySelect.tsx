import {useState} from 'react';
import {Search,X} from 'lucide-react';
import {productCategories,industryGroupFor,type ProductCategory} from './industry';
import {useUiLanguage} from './ui-language';

// Search changes only the visible choices. Stable IDs and explicit selection
// preserve saved projects and the product/service generation rules.
const aliases:Partial<Record<ProductCategory,string>>={
 shoes:'운동화 스니커즈 구두 sneakers trainers footwear',
 boxes:'택배박스 골판지 상자 carton shipping box',
 beauty:'화장품 스킨케어 메이크업 cosmetics skincare makeup',
 cafe:'커피 베이커리 빵 coffee bakery',lodging:'숙소 펜션 호텔 hotel stay accommodation',
 labels:'스티커 sticker',pouches:'연포장 flexible packaging',
 containers:'병 플라스틱 bottle jar',plasticfilm:'비닐봉투 필름 film bag',
 electronics:'가전 노트북 컴퓨터 laptop appliance',
 education:'학원 과외 수업 academy tuition class',
 fitness:'헬스장 피트니스 gym',hospital:'의원 치과 클리닉 clinic dental',
 realestate:'아파트 주택 apartment property',rental:'렌탈 렌트 대여 rent',
};
const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase().replace(/[\s·ㆍ._-]+/g,'');

export function IndustrySelect({id,value,onChange}:{id:string;value:ProductCategory|'';onChange:(value:ProductCategory)=>void}){
 const {language,t,text}=useUiLanguage();
 const [query,setQuery]=useState('');
 const options=productCategories.map(([category,label])=>({id:category,label:category==='packaging'?t('기타 포장재','Other packaging'):category==='other'?t('기타 제품','Other products'):category==='services'?t('기타 업종','Other industries'):text(label),search:normalize([category,label,text(label),industryGroupFor(category).label,aliases[category]??''].join(' '))})).sort((a,b)=>a.label.localeCompare(b.label,language));
 const needle=normalize(query),matches=options.filter(option=>!needle||option.search.includes(needle));
 // Retain a non-matching current option so typing cannot silently change the
 // native select's display or submit a different category.
 const visible=options.filter(option=>option.id===value||matches.some(match=>match.id===option.id));
 return <div className="industry-search-select">
  <div className="industry-search field">
   <Search size={18} aria-hidden="true"/>
   <input type="search" aria-label={t('분야 검색','Search categories')} placeholder={t('분야 검색 · 예: 신발, 카페, 박스','Search · shoes, cafe, boxes')} value={query} maxLength={100} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')event.preventDefault();}} aria-controls={id} autoComplete="off"/>
   {query&&<button type="button" aria-label={t('검색 지우기','Clear search')} onClick={()=>setQuery('')}><X size={18} aria-hidden="true"/></button>}
  </div>
  <label className="field industry-choice" htmlFor={id}><span className="industry-select-label">{t('산업 선택','Choose an industry')}</span><select id={id} value={value} onChange={event=>{if(!event.target.value)return;onChange(event.target.value as ProductCategory);setQuery('');}}><option value="">{t('분야를 선택해주세요','Select a category')}</option>{visible.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
  {needle&&<p className="help" role="status">{matches.length?t(`검색 결과 ${matches.length}개`,`Found ${matches.length} categories`):t('검색 결과가 없습니다. 다른 단어로 검색해주세요.','No matches. Try another word.')}</p>}
 </div>;
}
