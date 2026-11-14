import {useState} from 'react';
import type {Project} from './model';
import {industryKindFor, industryLabel, type IndustryKind} from './industry';
import {adFields, customIndustryLimit, findAdField, formatIndustryDetail, matchesSport, sportGroups, type IndustryChoice} from './ad-fields';
import {withCategory} from './product';
import {useUiLanguage} from './ui-language';
import './ad-field-picker.css';

type Props = {id:string; project:Project; chosen:boolean; initialKind?:IndustryKind;
  onChosen:(chosen:boolean)=>void; change:(update:(p:Project)=>Project)=>void};

const legacyLine = /^(?:업종|Industry): ([^\r\n]+)(?:\r?\n|$)/;

export function AdFieldPicker({id, project, chosen, initialKind, onChosen, change}:Props) {
  const {t,text} = useUiLanguage();
  const profile = project.productProfile;
  const saved = chosen ? findAdField(profile.category, profile.industryDetail) : undefined;
  const [kind,setKind] = useState<IndustryKind|undefined>(() => chosen ? industryKindFor(profile.category) : initialKind);
  const [fieldId,setFieldId] = useState(saved?.field.id ?? '');
  const [sportQuery,setSportQuery] = useState('');
  const fields = adFields.filter(field => field.kind === kind);
  const field = fields.find(entry => entry.id === fieldId);
  const selected = saved && saved.field.id===fieldId ? saved : undefined;
  const sports = field?.id==='sports';
  const matchingSports = sports ? field.items.filter(item=>!item.other && matchesSport(item,sportQuery)) : [];
  const legacy = chosen && !saved ? legacyLine.exec(profile.material)?.[1] ?? text(industryLabel(profile.category)) : '';
  function changeKind(next:IndustryKind) {
    if (next === kind) return;
    setKind(next);
    setFieldId('');
    setSportQuery('');
    onChosen(false);
  }
  function selectItem(item:IndustryChoice, custom='') {
    change(p => {
      const base = withCategory(p,item.category);
      return {...base, productProfile:{...base.productProfile, industryDetail:formatIndustryDetail(item,custom),
        material:base.productProfile.material.replace(legacyLine,'')}};
    });
    onChosen(true);
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
      <select aria-label={t('분야','Field')} value={fieldId} onChange={event=>{setFieldId(event.target.value);setSportQuery('');onChosen(false);}}>
        <option value="" disabled>{t('분야 선택','Choose a field')}</option>
        {fields.map(entry=><option key={entry.id} value={entry.id}>{t(entry.ko,entry.en)}</option>)}
      </select>
    </label>}
    {sports && <label className="field">{t('종목 검색','Search sports')}
      <input type="search" value={sportQuery} placeholder={t('예: 러닝, 태권도','e.g. running, taekwondo')}
        onChange={event=>setSportQuery(event.target.value)}/>
    </label>}
    {sports && sportQuery.trim() && matchingSports.length===0 && <p className="help" role="status">
      {t('찾는 종목이 없으면 기타를 선택해 입력하세요.','Choose Other to enter an unlisted sport.')}
    </p>}
    {field && <label className="field">{t('세부 업종','Industry')}
      <select aria-label={t('세부 업종','Industry')} value={selected?.item.id ?? ''} onChange={event=>{
        const item = field.items.find(entry=>entry.id===event.target.value);
        if(item) { selectItem(item); setSportQuery(''); }
      }}>
        <option value="" disabled>{sports ? t('종목 선택','Choose a sport') : t('세부 업종 선택','Choose an industry')}</option>
        {sports ? <>
          {sportGroups.map(group=>{
            const items=field.items.filter(item=>item.group===group.id && (matchingSports.includes(item) || item===selected?.item));
            return items.length>0 && <optgroup key={group.id} label={t(group.ko,group.en)}>{items.map(option)}</optgroup>;
          })}
          {field.items.filter(item=>item.other).map(option)}
        </> : field.items.map(option)}
      </select>
    </label>}
    {selected?.item.other && <label className="field">{t('세부 항목 직접 입력 (선택)','Specify the industry (optional)')}
      <input type="text" value={selected.custom} maxLength={customIndustryLimit}
        onChange={event=>selectItem(selected.item,event.target.value)}/>
    </label>}
    {legacy && <p className="help">{t('기존 업종','Saved industry')} · {legacy}</p>}
  </div>;
}
