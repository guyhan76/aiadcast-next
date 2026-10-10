import {useUiLanguage} from './ui-language';
import {useId,useState} from 'react';
import type {CSSProperties} from 'react';
import {ArrowRight,Check,ChevronDown,Palette,Sparkles} from 'lucide-react';
import type {Project} from './model';
import {industryDirections,industryLabel} from './industry';
import {chooseCreativeLook,creativeCopy,creativeLooks,creativeSettings,withCreative} from './creative';
import './creative-options.css';

type Props={project:Project;change:(fn:(p:Project)=>Project)=>void;compact?:boolean};

export function CreativeOptions({project,change,compact=false}:Props){
 const {language,text}=useUiLanguage();
 const noteId=useId(),previewId=useId();
 const [applied,setApplied]=useState(false);
 const settings=creativeSettings(project),directions=industryDirections(project.productProfile.category).map(item=>language==='ko'?item:{...item,label:({brand:'Introduce your brand',offer:'Promote your offering',trust:'Share the details'}[item.id]),description:({brand:'The story and feel of your business',offer:'What you offer and how to get in touch',trust:'Confirmed facts that help customers choose'}[item.id])});
 const direction=directions.find(d=>d.id===settings.directionId)||directions[0];
 const look=creativeLooks.find(l=>l.id===settings.look)||creativeLooks[0];
 const recommended=creativeCopy(project);
 function applyCopy(){
  change(p=>{const copy=creativeCopy(p);return {...p,copy:{...p.copy,[p.locale]:{...p.copy[p.locale],title:copy.title,description:copy.description}}};});
  setApplied(true);
 }
 const content=<div className="creative-options-body">
  {!compact&&<div className="creative-options-intro"><span className="creative-options-kicker">YOUR BRAND, YOUR DIRECTION</span><h2>{text("어떤 인상을 전할까요?")}</h2><p>{text("마음에 드는 방향을 고르세요. 어려운 요청문은 필요 없어요.")}</p></div>}
  <fieldset className="creative-direction-choices">
   <legend><span>01</span>{text("광고의 목적")}</legend>
   <div className="creative-direction-grid">{directions.map((item,index)=><button type="button" className="creative-purpose-card" key={item.id} aria-pressed={settings.directionId===item.id} onClick={()=>{change(p=>withCreative(p,{directionId:item.id}));setApplied(false);}}>
    <span className="creative-purpose-top"><span className="creative-purpose-number">0{index+1}</span><span className="creative-card-check" aria-hidden="true">{settings.directionId===item.id&&<Check size={13}/>}</span></span>
    <strong>{text(item.label)}</strong><small>{text(item.description)}</small>
   </button>)}</div>
  </fieldset>
  <fieldset className="creative-look-choices">
   <legend><span>02</span>{text("브랜드의 분위기")}<small>{text("스타일 참고")}</small></legend>
   <div className="creative-look-grid">{creativeLooks.map(item=><button type="button" className="creative-look-card" key={item.id} aria-pressed={settings.look===item.id} onClick={()=>{change(p=>chooseCreativeLook(p,item.id));setApplied(false);}}>
    <span className={`creative-look-art creative-look-${item.id}`} style={{'--look-bg':item.color,'--look-ink':item.ink==='dark'?'#242522':'#f5f2e9','--look-accent':item.accent} as CSSProperties} aria-hidden="true">
     <span className="look-art-top">AIADCAST<span>STUDIO</span></span>
     <span className="look-art-orbit"/>
     <span className="look-art-type">{item.id==='editorial'?<>FORM<span>&amp; FEEL.</span></>:item.id==='signature'?<>The<span>signature.</span></>:item.id==='natural'?<>In your<span>element.</span></>:<>A NEW<span>STANDARD.</span></>}</span>
     <span className="look-art-line"/><span className="look-art-caption">A DISTINCTIVE PERSPECTIVE</span>
     <span className="look-art-stamp">{item.id==='precision'?'01 / 04':item.id==='signature'?'DESIGN STUDY':'YOUR BRAND'}</span>
    </span>
    <span className="creative-look-title"><strong>{text(item.label)}</strong><span className="creative-card-check" aria-hidden="true">{settings.look===item.id&&<Check size={13}/>}</span></span>
    <small>{text(item.description)}</small>
   </button>)}</div>
  </fieldset>
  <div className="creative-extra-note"><label htmlFor={noteId}>{text("더 담고 싶은 내용")}<span>{text("선택")}</span></label><textarea id={noteId} maxLength={600} rows={3} value={settings.note} placeholder={text("예: 따뜻한 공간에서 편안하게 쉬는 느낌. 예약 안내도 넣고 싶어요.")} onChange={e=>{const note=e.target.value;change(p=>withCreative(p,{note}));setApplied(false);}}/><div><span>{text("비워두어도 괜찮아요. 선택한 방향으로 준비할게요.")}</span><span>{settings.note.length} / 600</span></div></div>
  <div className="creative-selection-summary"><Palette size={16} aria-hidden="true"/><p><strong>{text(industryLabel(project.productProfile.category))}</strong><span>{direction.label} · {text(look.label)}</span></p><Check size={15} aria-hidden="true"/></div>
  {compact&&<div className="creative-copy-suggestion" aria-labelledby={previewId}><div><Sparkles size={15} aria-hidden="true"/><h3 id={previewId}>{text("이 방향에 어울리는 문구")}</h3></div><p className="creative-copy-title">{recommended.title}</p><p className="creative-copy-description">{recommended.description}</p><button type="button" onClick={applyCopy}>{text("추천 문구 적용")}<ArrowRight size={15}/></button>{applied&&<p className="creative-copy-applied" role="status">{text("현재 언어의 제목과 설명에 적용했습니다. 사진과 규격은 유지합니다.")}</p>}</div>}
  <p className="creative-options-footnote">{text("방향과 스타일은 편집·생성 요청에 함께 저장됩니다.")}</p>
 </div>;
 if(compact)return <details className="creative-options creative-options-compact"><summary><span><Palette size={18} aria-hidden="true"/><strong>{text("광고 방향과 스타일")}</strong></span><span>{text(look.label)}<ChevronDown size={16} aria-hidden="true"/></span></summary>{content}</details>;
 return <section className="creative-options" aria-label={text("광고 방향과 스타일")}>{content}</section>;
}
