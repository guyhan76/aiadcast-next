import {useUiLanguage} from './ui-language';
import {useId,useState} from 'react';
import {ArrowLeft,ArrowRight,Check} from 'lucide-react';
import {newProject} from './model';
import type {Project} from './model';
import {axisLabel,dimensionAxes,specTypes,withCategory,isServiceCategory} from './product';
import type {SpecType} from './product';
import {defaultCampaign} from './campaign';
import {generationIssues} from './generation';
import {imageFormats} from './formats';
import {IndustryPicker} from './IndustryPicker';
import type {IndustryKind,ProductCategory} from './industry';
import {CreativeOptions} from './CreativeOptions';
import {defaultCreative,creativeCopy} from './creative';
import {ReferencePhotos} from './ReferencePhotos';
import {BrandFooter} from './BrandFooter';
import './create-campaign.css';

export function starterProject(category:ProductCategory='other'):Project{
 const p=withCategory(newProject(),category);return {...p,name:'',format:'4:5',presentation:'campaign',generation:{mode:'creative',brief:''},background:{...p.background,color:'#f8f7f4'},productProfile:{...p.productProfile,specType:'none'},dimensions:{...p.dimensions,width:'',depth:'',height:'',visible:false,lines:false},campaign:{...defaultCampaign(),creative:defaultCreative()},footer:{company:true,contact:true,email:true,website:true},copy:{ko:{...p.copy.ko,company:''},en:{...p.copy.en,company:''}}};
}
export function CreateCampaign({initialKind,onReady}:{initialKind?:IndustryKind;onReady:(p:Project)=>Promise<void>}){
 const {language,t,text}=useUiLanguage();
 const fieldsId=useId();
 const [project,setProject]=useState(()=>({...starterProject(initialKind==='service'?'services':'other'),locale:language}));
 const [step,setStep]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const axes=dimensionAxes(project.productProfile),service=isServiceCategory(project.productProfile.category);
 function change(fn:(p:Project)=>Project){setProject(fn);setError('');}
 async function next(){
  if(step===0){
   if(!project.productName.trim()){setError(t('상품·서비스 이름을 입력해주세요.','Enter your product or service name.'));return;}
   const issues=generationIssues(project);if(issues.length){setError(issues.map(text).join(' '));return;}
  }
  if(step<1){setStep(step+1);window.scrollTo(0,0);return;}
  setBusy(true);
  try{await onReady({...project,name:project.productName+t(' 광고',' ad'),updatedAt:new Date().toISOString(),copy:{...project.copy,[project.locale]:{...project.copy[project.locale],...creativeCopy(project)}}});}
  catch{setError(t('저장하지 못했습니다. 입력 내용은 유지됩니다. 기기 저장 공간을 확인해주세요.','Could not save. Your input is kept here. Check device storage.'));}
  finally{setBusy(false);}
 }
 return <div className="create-page">
  <div className="create-heading"><h1>{t('광고 만들기','Create an ad')}</h1></div>
  <ol className="create-steps" aria-label={t('제작 단계','Creation steps')}>
   {[t('광고 정보','Ad details'),t('크기·연락처','Size & contact')].map((label,i)=><li key={label} aria-current={step===i?'step':undefined} className={i<=step?'current':''}><span>{i<step?<Check size={14} aria-hidden="true"/>:i+1}</span>{label}</li>)}
  </ol>
  <div className="create-card">
   {step===0&&<>
    <fieldset className="ad-subject-kind"><legend>{t('광고 대상','Ad subject')}</legend><div>{(['product','service'] as const).map(kind=><button type="button" key={kind} aria-pressed={service===(kind==='service')} onClick={()=>change(p=>isServiceCategory(p.productProfile.category)===(kind==='service')?p:withCategory(p,kind==='service'?'services':'other'))}>{kind==='product'?t('상품','Product'):t('서비스','Service')}</button>)}</div></fieldset>
    <ReferencePhotos project={project} change={change} onBusyChange={setBusy}/>
    <div className="field create-name-field"><label htmlFor={`${fieldsId}-name`}>{service?t('서비스명','Service name'):t('상품명','Product name')}</label><textarea id={`${fieldsId}-name`} rows={2} value={project.productName} maxLength={100} placeholder={service?t('예: 제주 감성 숙소','Example: Jeju boutique stay'):t('예: 바이탈 골드 콜라겐 토너 150ml 2개','Example: Vital Gold Collagen Toner 150ml, 2 bottles')} onChange={e=>change(p=>({...p,productName:e.target.value}))}/></div>
    <div className="field"><label htmlFor={`${fieldsId}-description`}>{service?t('서비스 소개','Service description'):t('상품 설명','Product description')}</label><textarea id={`${fieldsId}-description`} rows={3} maxLength={2000} value={project.productProfile.material} placeholder={t('특징과 장점을 알려주세요.','Describe the features and benefits.')} onChange={e=>change(p=>({...p,productProfile:{...p.productProfile,material:e.target.value}}))}/></div>
    <details className="quiet-details create-industry-settings"><summary>{t('업종·규격','Category & dimensions')}<span>{t('선택','Optional')}</span></summary>
     <IndustryPicker simple value={project.productProfile.category} onChange={category=>change(p=>withCategory(p,category))}/>
     {!service&&<>
      <label className="field">{t('상품 크기','Product dimensions')}<select aria-label={t('규격 형식','Dimension type')} value={project.productProfile.specType} onChange={e=>change(p=>({...p,productProfile:{...p.productProfile,specType:e.target.value as SpecType},dimensions:{...p.dimensions,visible:e.target.value!=='none',lines:false}}))}>{specTypes.map(([id,label])=><option key={id} value={id}>{text(label)}</option>)}</select></label>
      {!!axes.length&&<div className="dimension-inputs">{axes.map(axis=><label className="field" key={axis}>{axisLabel(axis,language,project.productProfile)} (mm)<input inputMode="decimal" value={project.dimensions[axis]} maxLength={12} onChange={e=>change(p=>({...p,dimensions:{...p.dimensions,[axis]:e.target.value}}))}/></label>)}</div>}
      <p className="help">{t('규격이 중요한 상품만 입력하세요.','Add dimensions when they matter.')}</p>
     </>}
    </details>
    <CreativeOptions project={project} change={change}/>
   </>}
   {step===1&&<>
    <fieldset className="delivery-formats"><legend>{t('이미지 비율','Image ratio')}</legend>{(['1:1','4:5','9:16'] as const).map((id,i)=><button type="button" key={id} aria-pressed={project.format===id} onClick={()=>change(p=>({...p,format:id}))}><i style={{aspectRatio:id.replace(':','/')}} aria-hidden="true"/><strong>{id}</strong><span>{[t('정사각형','Square'),t('세로형','Portrait'),t('긴 세로형','Tall portrait')][i]}</span></button>)}</fieldset>
    <details className="quiet-details create-other-ratios"><summary>{t('다른 비율 보기','More ratios')}</summary><label className="field">{t('출력 비율','Output ratio')}<select aria-label={t('출력 비율','Output ratio')} value={project.format} onChange={e=>change(p=>({...p,format:e.target.value as Project['format']}))}>{imageFormats.map(f=><option key={f.id} value={f.id}>{f.id} · {text(f.use)}</option>)}</select></label></details>
    <p className="help create-ratio-help">{t('인스타그램·블로그·홈페이지·매장 홍보·브로셔·숏폼 이미지에 활용하세요.','Use images for Instagram, blogs, websites, store promotions, brochures and short-form content.')}</p>
    <BrandFooter project={project} change={change}/>
    <details className="quiet-details"><summary>{t('추가 설정','Additional settings')}</summary>
     <label className="field">{t('광고 문구 언어','Ad copy language')}<select aria-label={t('광고 문구 언어','Ad copy language')} value={project.locale} onChange={e=>change(p=>({...p,locale:e.target.value as 'ko'|'en'}))}><option value="ko">한국어</option><option value="en">English</option></select></label>
     <label className="field">{t('제작 방식','Creation mode')}<select aria-label={t('제작 방식','Creation mode')} value={project.generation.mode} onChange={e=>change(p=>({...p,generation:{...p.generation,mode:e.target.value as 'original'|'creative'}}))}><option value="creative">{t('AI 광고 연출','AI art direction')}</option><option value="original">{t('원본 사진 그대로 합성','Compose with original photo')}</option></select></label>
    </details>
   </>}
  </div>
  {error&&<p className="wizard-error" role="alert">{error}</p>}
  <div className="wizard-actions">
   {step>0&&<button disabled={busy} onClick={()=>{setStep(step-1);setError('');window.scrollTo(0,0);}}><ArrowLeft size={17} aria-hidden="true"/>{t('이전','Back')}</button>}
   <button className="primary-action" disabled={busy} onClick={()=>void next()}>{busy?t('준비 중…','Preparing…'):step===1?t('광고 만들기','Create ad'):t('다음','Continue')}<ArrowRight size={17} aria-hidden="true"/></button>
  </div>
 </div>;
}
