import {useState} from 'react';
import type {Project} from './model';
import {industryLabel,type IndustryKind} from './industry';
import {findAdField,formatIndustryDetail} from './ad-fields';
import {withCategory} from './product';
import {useUiLanguage} from './ui-language';
import {AdIndustryFields} from './AdIndustryFields';

type Props = {id:string; project:Project; chosen:boolean; kind?:IndustryKind; onKind:(kind:IndustryKind)=>void;
  onChosen:(chosen:boolean)=>void; change:(update:(p:Project)=>Project)=>void};

const legacyLine = /^(?:업종|Industry): ([^\r\n]+)(?:\r?\n|$)/;

export function AdFieldPicker({id, project, chosen, kind, onKind, onChosen, change}:Props) {
  const {text} = useUiLanguage();
  const profile = project.productProfile;
  const saved = chosen ? findAdField(profile.category, profile.industryDetail) : undefined;
  const [fieldId,setFieldId] = useState(saved?.field.id ?? '');
  const legacy=chosen&&!saved ? legacyLine.exec(profile.material)?.[1]??text(industryLabel(profile.category)) : '';
  return <AdIndustryFields id={id} kind={kind} saved={saved} fieldId={fieldId} legacy={legacy}
    onKind={next=>{onKind(next);setFieldId('');onChosen(false);}}
    onField={next=>{setFieldId(next);onChosen(false);}}
    onItem={(item,custom)=>{
      change(p=>{
        const base=withCategory(p,item.category);
        return {...base,productProfile:{...base.productProfile,industryDetail:formatIndustryDetail(item,custom)}};
      });
      onChosen(true);
    }}/>;
}
