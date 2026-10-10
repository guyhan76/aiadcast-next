import {localizedCampaignGuide} from './ui-campaign';
import {useUiLanguage} from './ui-language';
import {useState} from 'react';
import {Plus,X} from 'lucide-react';
import {defaultCampaign} from './campaign';
import type {Campaign} from './campaign';
import {buildGenerationRequest} from './generation';
import {PublishingPanel} from './PublishingPanel';
import type {PublishingImageTarget} from './PublishingPanel';
import {currentDraft,publishingChannels} from './publishing';
import type {Project} from './model';
type Props={project:Project;change:(fn:(p:Project)=>Project)=>void;message:(text:string)=>void};
export function CampaignFields({project,change}:Pick<Props,'project'|'change'>){
 const {t,text}=useUiLanguage();
 const c=project.campaign??defaultCampaign();const [name,setName]=useState(''),[value,setValue]=useState(''),[error,setError]=useState('');
 return <details className="campaign-fields"><summary>{text("광고 목적과 추가 정보")}</summary><div className="campaign-field-grid"><label className="field">{text("광고 목적")}<select value={c.goal} onChange={e=>change(p=>({...p,campaign:{...(p.campaign??defaultCampaign()),goal:e.target.value as Campaign['goal']}}))}><option value="awareness">{text("브랜드·상품 알리기")}</option><option value="launch">{text("신제품·새 서비스 소개")}</option><option value="inquiry">{text("문의·상담 유도")}</option></select></label><label className="field">{text("콘텐츠 형식")}<select value={c.contentType} onChange={e=>change(p=>({...p,campaign:{...(p.campaign??defaultCampaign()),contentType:e.target.value as Campaign['contentType']}}))}><option value="poster">{text("포스터")}</option><option value="card">{text("카드형 광고")}</option></select></label></div><p className="help small">{text("소재·색상·수량·서비스 제공 지역 등 필요한 정보만 추가하세요.")}</p>{c.attributes.map(a=><div className="attribute-row" key={a.name}><span><b>{a.name}</b>{a.value}</span><button type="button" aria-label={t(`${a.name} 속성 삭제`,`Remove ${a.name}`)} onClick={()=>change(p=>({...p,campaign:{...(p.campaign??defaultCampaign()),attributes:c.attributes.filter(item=>item.name!==a.name)}}))}><X size={15}/></button></div>)}<div className="attribute-inputs"><input aria-label={text("추가 속성 항목명")} placeholder={text("항목명")} maxLength={40} value={name} onChange={e=>setName(e.target.value)}/><input aria-label={text("추가 속성 값")} placeholder={text("값")} maxLength={160} value={value} onChange={e=>setValue(e.target.value)}/><button type="button" aria-label={text("속성 추가")} disabled={c.attributes.length>=8} onClick={()=>{if(!name.trim()||!value.trim()){setError(text('항목명과 값을 함께 입력해주세요.'));return;}if(c.attributes.some(a=>a.name.toLowerCase()===name.trim().toLowerCase())){setError(text('이미 추가한 항목입니다.'));return;}change(p=>({...p,campaign:{...(p.campaign??defaultCampaign()),attributes:[...c.attributes,{name:name.trim(),value:value.trim()}]}}));setName('');setValue('');setError('');}}><Plus size={17}/></button></div>{error&&<p className="help" role="alert">{error}</p>}</details>;
}
export function CampaignPanel({project,change,message,onExportImage,imageDisabled}:Props&{onExportImage:(target:PublishingImageTarget)=>Promise<string|null>;imageDisabled:boolean}){
 const {language,text}=useUiLanguage();
 const guide=localizedCampaignGuide(project,language,text);
 function exportBrief(){try{const request=buildGenerationRequest(project);const blob=new Blob([JSON.stringify({status:'planning-only',request,guide,publishing:publishingChannels.map(channel=>currentDraft(project,channel))},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='aiadcast-campaign-brief.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);message(text('광고 기획과 생성 요청 정보를 저장했습니다. AI 생성은 실행하지 않았습니다.'));}catch(e){message(e instanceof Error?text(e.message):text('광고 정보를 확인해주세요.'));}}
 return <PublishingPanel project={project} change={change} direction={{target:guide.target,intent:guide.intent}} onExportBrief={exportBrief} onExportImage={onExportImage} imageDisabled={imageDisabled}/>;
}
