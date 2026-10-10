import {useUiLanguage} from './ui-language';
import {useId,useState} from 'react';
import {ArrowRight,Check,ChevronDown,Palette,Sparkles} from 'lucide-react';
import type {Project} from './model';
import {industryDirections,industryLabel} from './industry';
import {creativeCopy,creativeSettings,withCreative} from './creative';
import './creative-options.css';

type Props={project:Project;change:(fn:(p:Project)=>Project)=>void;compact?:boolean};

export function CreativeOptions({project,change,compact=false}:Props){
 const {language,text,t}=useUiLanguage();
 const noteId=useId(),previewId=useId();
 const [applied,setApplied]=useState(false);
 const settings=creativeSettings(project),directions=industryDirections(project.productProfile.category).map(item=>language==='ko'?item:{...item,label:({brand:'Introduce your brand',offer:'Promote your offering',trust:'Share the details'}[item.id]),description:({brand:'The story and feel of your business',offer:'What you offer and how to get in touch',trust:'Confirmed facts that help customers choose'}[item.id])});
 const direction=directions.find(d=>d.id===settings.directionId)||directions[0];
 const recommended=creativeCopy(project);
 function applyCopy(){
  change(p=>{const copy=creativeCopy(p);return {...p,copy:{...p.copy,[p.locale]:{...p.copy[p.locale],title:copy.title,description:copy.description}}};});
  setApplied(true);
 }
 const content=<div className="creative-options-body">
  <details className="quiet-details"><summary>{text("광고의 목적")}</summary><fieldset className="creative-direction-choices">
   <legend><span>01</span>{text("광고의 목적")}</legend>
   <div className="creative-direction-grid">{directions.map((item,index)=><button type="button" className="creative-purpose-card" key={item.id} aria-pressed={settings.directionId===item.id} onClick={()=>{change(p=>withCreative(p,{directionId:item.id}));setApplied(false);}}>
    <span className="creative-purpose-top"><span className="creative-purpose-number">0{index+1}</span><span className="creative-card-check" aria-hidden="true">{settings.directionId===item.id&&<Check size={13}/>}</span></span>
    <strong>{text(item.label)}</strong><small>{text(item.description)}</small>
   </button>)}</div>
  </fieldset>
  </details>
  <div className="creative-extra-note"><label htmlFor={noteId}>{t("요청사항","Your requests")}<span>{text("선택")}</span></label><textarea id={noteId} maxLength={600} rows={3} value={settings.note} placeholder={text("예: 따뜻한 공간에서 편안하게 쉬는 느낌. 예약 안내도 넣고 싶어요.")} onChange={e=>{const note=e.target.value;change(p=>withCreative(p,{note}));setApplied(false);}}/><div><span>{t("선택 사항입니다. 상품의 특징에 맞춰 AI가 연출을 판단합니다.","Optional. AI chooses the art direction based on your product.")}</span><span>{settings.note.length} / 600</span></div></div>
  <div className="creative-selection-summary"><Palette size={16} aria-hidden="true"/><p><strong>{text(industryLabel(project.productProfile.category))}</strong><span>{direction.label}</span></p><Check size={15} aria-hidden="true"/></div>
  {compact&&<div className="creative-copy-suggestion" aria-labelledby={previewId}><div><Sparkles size={15} aria-hidden="true"/><h3 id={previewId}>{text("이 방향에 어울리는 문구")}</h3></div><p className="creative-copy-title">{recommended.title}</p><p className="creative-copy-description">{recommended.description}</p><button type="button" onClick={applyCopy}>{text("추천 문구 적용")}<ArrowRight size={15}/></button>{applied&&<p className="creative-copy-applied" role="status">{text("현재 언어의 제목과 설명에 적용했습니다. 사진과 규격은 유지합니다.")}</p>}</div>}
  <p className="creative-options-footnote">{t("결과를 보고 바꾸고 싶은 부분을 요청할 수 있습니다.","Review the result and request the changes you need.")}</p>
 </div>;
 if(compact)return <details className="creative-options creative-options-compact"><summary><span><Palette size={18} aria-hidden="true"/><strong>{t("광고 목적과 요청사항","Ad purpose & requests")}</strong></span><span><ChevronDown size={16} aria-hidden="true"/></span></summary>{content}</details>;
 return <section className="creative-options" aria-label={t("광고 목적과 요청사항","Ad purpose & requests")}>{content}</section>;
}
