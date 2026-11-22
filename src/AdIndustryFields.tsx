import {useState} from 'react';
import {adFields,customIndustryLimit,matchesSport,searchSportSections,sportGroups,type IndustryChoice,type findAdField} from './ad-fields';
import type {IndustryKind} from './industry';
import {useUiLanguage} from './ui-language';
import './ad-field-picker.css';

type Props={id:string;kind?:IndustryKind;fieldId:string;saved?:ReturnType<typeof findAdField>;legacy?:string;
  onKind:(kind:IndustryKind)=>void;onField:(id:string)=>void;onItem:(item:IndustryChoice,custom?:string)=>void};

export function AdIndustryFields({id,kind,fieldId,saved,legacy,onKind,onField,onItem}:Props){
  const {t}=useUiLanguage();
  const [sportQuery,setSportQuery] = useState('');
  const fields = adFields.filter(field => field.kind === kind);
  const field = fields.find(entry => entry.id === fieldId);
  const selected = saved && saved.field.id===fieldId ? saved : undefined;
  const primary = selected?.parent ?? selected?.item;
  const sports = field?.id==='sports';
  const matchingSports = sports ? field.items.filter(item=>!item.other && matchesSport(item,sportQuery)) : [];
  const sectionMatches = sports && sportQuery.trim() ? field.items.flatMap(item=>searchSportSections(item,sportQuery)) : [];
  function changeKind(next:IndustryKind) {
    if(next===kind)return;
    setSportQuery('');
    onKind(next);
  }
  function option(item:IndustryChoice) {
    return <option key={item.id} value={item.id}>{item.other ? t('기타','Other') : t(item.ko,item.en)}</option>;
  }
  return <div className="ad-field-picker">
    <div className="ad-field-kinds" role="group" aria-label={t('광고 유형','Ad type')}>
      {(['product','service'] as const).map((option,index) =>
        <button key={option} id={index===0 ? id : undefined} type="button"
          aria-pressed={kind===option} onClick={()=>changeKind(option)}>
          {option==='product' ? t('상품','Product') : t('서비스','Service')}
        </button>)}
    </div>
    {kind && <label className="field">{t('분야','Field')}
      <select aria-label={t('분야','Field')} value={fieldId} onChange={event=>{onField(event.target.value);setSportQuery('');}}>
        <option value="" disabled>{t('분야 선택','Choose a field')}</option>
        {fields.map(entry=><option key={entry.id} value={entry.id}>{t(entry.ko,entry.en)}</option>)}
      </select>
    </label>}
    {sports && <label className="field">{t('종목 검색','Search sports')}
      <input type="search" value={sportQuery} placeholder={t('예: 러닝, 태권도','e.g. running, taekwondo')}
        onChange={event=>setSportQuery(event.target.value)}/>
    </label>}
    {sports && sportQuery.trim() && matchingSports.length===0 && sectionMatches.length===0 && <p className="help" role="status">
      {t('찾는 종목이 없으면 기타를 선택해 입력하세요.','Choose Other to enter an unlisted sport.')}
    </p>}
    {field && <label className="field">{t('세부 업종','Industry')}
      <select aria-label={t('세부 업종','Industry')} value={primary?.id ?? ''} onChange={event=>{
        const id=event.target.value;
        const item=field.items.find(entry=>entry.id===id) ?? sectionMatches.flatMap(section=>section.items).find(entry=>entry.id===id);
        if(item) { onItem(item); setSportQuery(''); }
      }}>
        <option value="" disabled>{sports ? t('종목 선택','Choose a sport') : t('세부 업종 선택','Choose an industry')}</option>
        {sports ? <>
          {sportGroups.map(group=>{
            const items=field.items.filter(item=>item.group===group.id && (matchingSports.includes(item) || item===primary));
            return items.length>0 && <optgroup key={group.id} label={t(group.ko,group.en)}>{items.map(option)}</optgroup>;
          })}
          {sectionMatches.map(section=><optgroup key={section.en} label={t('댄스스포츠 · '+section.ko,'Dancesport · '+section.en)}>
            {section.items.map(option)}
          </optgroup>)}
          {field.items.filter(item=>item.other).map(option)}
        </> : field.items.map(option)}
      </select>
    </label>}
    {primary?.sections && <label className="field">{t('댄스스포츠 세부 종목','Dancesport discipline')}
      <select aria-label={t('댄스스포츠 세부 종목','Dancesport discipline')} value={selected?.item.id} onChange={event=>{
        const item=primary.sections?.flatMap(section=>section.items).find(entry=>entry.id===event.target.value);
        onItem(item ?? primary);
        setSportQuery('');
      }}>
        <option value={primary.id}>{t('댄스스포츠 전체','General dancesport')}</option>
        {primary.sections.map(section=>section.ko
          ? <optgroup key={section.en} label={t(section.ko,section.en)}>{section.items.map(option)}</optgroup>
          : section.items.map(option))}
      </select>
    </label>}
    {selected?.item.other && <label className="field">{t('세부 항목 직접 입력 (선택)','Specify the industry (optional)')}
      <input type="text" value={selected.custom} maxLength={customIndustryLimit}
        onChange={event=>onItem(selected.item,event.target.value)}/>
    </label>}
    {legacy && <p className="help">{t('기존 업종','Saved industry')} · {legacy}</p>}
  </div>;
}
