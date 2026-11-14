import {useState} from 'react';
import type {Project} from './model';
import {industryKindFor, industryLabel, type IndustryKind} from './industry';
import {adFields, findAdField, type IndustryChoice} from './ad-fields';
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
  const fields = adFields.filter(field => field.kind === kind);
  const field = fields.find(entry => entry.id === fieldId);
  const legacy = chosen && !saved ? legacyLine.exec(profile.material)?.[1] ?? text(industryLabel(profile.category)) : '';
  function changeKind(next:IndustryKind) {
    if (next === kind) return;
    setKind(next);
    setFieldId('');
    onChosen(false);
  }
  function selectItem(item:IndustryChoice) {
    change(p => {
      const base = withCategory(p,item.category);
      return {...base, productProfile:{...base.productProfile, industryDetail:item.ko,
        material:base.productProfile.material.replace(legacyLine,'')}};
    });
    onChosen(true);
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
      <select aria-label={t('분야','Field')} value={fieldId} onChange={event=>{setFieldId(event.target.value);onChosen(false);}}>
        <option value="" disabled>{t('분야 선택','Choose a field')}</option>
        {fields.map(entry=><option key={entry.id} value={entry.id}>{t(entry.ko,entry.en)}</option>)}
      </select>
    </label>}
    {field && <label className="field">{t('세부 업종','Industry')}
      <select aria-label={t('세부 업종','Industry')} value={chosen && saved?.field.id===field.id ? saved.item.id : ''} onChange={event=>{
        const item = field.items.find(entry=>entry.id===event.target.value);
        if(item) selectItem(item);
      }}>
        <option value="" disabled>{t('세부 업종 선택','Choose an industry')}</option>
        {field.items.map(item=><option key={item.id} value={item.id}>{t(item.ko,item.en)}</option>)}
      </select>
    </label>}
    {legacy && <p className="help">{t('기존 업종','Saved industry')} · {legacy}</p>}
  </div>;
}
