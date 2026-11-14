import './result-set.css';
import {BatchConfirmation} from './BatchConfirmation';
import {batchPrice,type BatchPrice,batchCounts as imageCounts} from './batch-price';
import {offlineDemo} from './demo-mode';
import './ad-batch.css';
import {apiRequest,type ApiStatus} from './generation-client';
import {DimensionDisplayChoice} from './DimensionDisplayChoice';
import {isTextExample} from './generation-input';
import {InputExampleGuide} from './InputExampleGuide';
import {DimensionControlChoice} from './DimensionControlChoice';
import type {WizardDraft} from './workspace-draft';
import {DimensionInputs} from './DimensionInputs';
import {useUiLanguage} from './ui-language';
import {useId,useState,useLayoutEffect,useRef,useEffect} from 'react';
import {Sparkles} from 'lucide-react';
import type {Project,FooterField} from './model';
import {dimensionAxes,isServiceCategory} from './product';
import type {SpecType} from './product';
import {newGenerationIssues,photoGenerationDraft} from './generation';
import {imageFormats} from './formats';
import {AdFieldPicker} from './AdFieldPicker';
import type {IndustryKind} from './industry';
import {creativeSettings,withCreative} from './creative';
import {ReferencePhotos} from './ReferencePhotos';
import {PhotoUsage} from './PhotoUsage';
import {betaSession} from './beta-session';
import './create-campaign.css';

export {starterProject,prepareCampaign} from './consumer-campaign';
import {starterProject,prepareCampaign,automaticDimensionDraft} from './consumer-campaign';
export function CreateCampaign({initialKind,onReady,draft,onDraft,active=true}:{active?:boolean;initialKind?:IndustryKind;onReady:(p:Project,price?:BatchPrice)=>Promise<void>;draft?:WizardDraft;onDraft?:(draft:WizardDraft)=>void}){
 const {language,t,text}=useUiLanguage(),id=useId();
 const [project,setProject]=useState(()=>automaticDimensionDraft(photoGenerationDraft(draft?.project??({...starterProject(initialKind==='service'?'services':'other'),locale:language}))));
 const submitting=useRef(false);
 const [confirmation,setConfirmation]=useState<{project:Project;price:BatchPrice;token:string|undefined}>();
 const live=useRef(active);live.current=active;
 useEffect(()=>{setConfirmation(undefined);},[active,betaSession()?.token]);
 const [creditStatus,setCreditStatus]=useState<ApiStatus|null>(null),sessionToken=betaSession()?.token;
 useEffect(()=>{if(!active){setCreditStatus(null);return;}let live=true;const controller=new AbortController();apiRequest<ApiStatus>('/api/status',undefined,controller.signal).then(s=>{if(live)setCreditStatus(s);}).catch(()=>{if(live)setCreditStatus(null);});return()=>{live=false;controller.abort();};},[sessionToken,active]);
 const [chosen,setChosen]=useState(draft?.industryChosen ?? !!draft),[error,setError]=useState(''),[busy,setBusy]=useState(false),[photoImportIssue,setPhotoImportIssue]=useState('');
 useLayoutEffect(()=>{onDraft?.({project,step:0,industryChosen:chosen});},[project,chosen,onDraft]);
 const example=isTextExample(project);
 const service=isServiceCategory(project.productProfile.category),axes=dimensionAxes(project.productProfile),settings=creativeSettings(project),copy=project.copy[project.locale];
 const copyMode=settings.copyMode??'ai';
 function change(fn:(p:Project)=>Project){setProject(fn);setError('');}
 function setCopy(field:'title'|'description'|FooterField,value:string){change(p=>({...p,copy:{...p.copy,[p.locale]:{...p.copy[p.locale],[field]:value}}}));}
 async function submit(){
  if(!active||busy||submitting.current)return;
  if(!chosen){setError(t('광고할 분야을 선택해주세요.','Choose your industry.'));document.getElementById(id+'-industry')?.focus();return;}
  if(!project.productName.trim()||!project.productProfile.material.trim()){setError(t('상품·서비스 이름과 상세설명을 입력해주세요.','Enter the name and description.'));return;}
  if(copyMode==='manual'&&!copy.title.trim()){setError(t('직접 사용할 광고 제목을 입력해주세요.','Enter your advertising headline.'));return;}
  const prepared=prepareCampaign(photoGenerationDraft(withCreative(project,{copyMode}))),issues=newGenerationIssues(prepared);
  if(issues.length){setError(!service&&!prepared.product&&photoImportIssue?photoImportIssue:issues.map(text).join(' '));if(!prepared.product)document.getElementById(id+'-photos')?.focus();return;}
  submitting.current=true;setBusy(true);setError('');
  const token=betaSession()?.token;
  try{
   if(prepared.dimensionControl||offlineDemo()){await onReady(prepared);return;}
   const status=await apiRequest<ApiStatus>('/api/status');
   if(token!==betaSession()?.token||!live.current)return;
   if(status.generation.batchVersion!==1)throw Error('BATCH_UNAVAILABLE');
   if(!status.generation.enabled&&status.generation.reason!=='NO_TEST_CREDITS')throw Error(status.generation.reason??'GENERATION_DISABLED');
   setCreditStatus(status);
   setConfirmation({project:prepared,price:batchPrice(status.wallet,prepared.requestedImageCount??1),token});
  }catch(e){showError(e);}finally{submitting.current=false;setBusy(false);}
 }
 function showError(e:unknown){
  const code=e instanceof Error?e.message:'';
  const message:Record<string,[string,string]>={
   BUDGET_NOT_AVAILABLE:['생성 예산이 부족합니다. 관리자에게 확인해주세요. 추가 결제로 해결되지 않습니다.','Generation budget is unavailable. Contact your administrator.'],
   CREDIT_QUOTE_CHANGED:['잔액이 변경되었습니다. 광고 생성을 다시 눌러 최신 금액을 확인해주세요.','Your balance changed. Check the updated amount before generating.'],
   GENERATION_ALREADY_RUNNING:['다른 광고를 생성 중입니다. 완료 후 다시 시도해주세요.','Another generation is running. Try again when it finishes.'],
   STORAGE_CAPACITY_UNAVAILABLE:['이미지를 저장할 서버 공간이 부족합니다. 관리자에게 문의해주세요.','Server storage is full. Contact your administrator.'],
   NO_TEST_CREDITS:['잔여 크레딧이 부족합니다.','Insufficient credits.'],
   BATCH_UNAVAILABLE:['서버가 아직 일괄 생성을 지원하지 않습니다.','The server does not yet support batch generation.'],
   AUTH_REQUIRED:['이미지를 생성하려면 로그인해주세요.','Sign in to generate images.'],
   PROPORTION_MISMATCH:['입력 규격과 사진 비례를 확인해주세요.','Check the dimensions and photograph proportions.']
  };
  setError(t(...(message[code]??['접수 상태를 확인하지 못했습니다. 같은 입력으로 다시 확인해주세요.','Could not confirm submission. Retry with the same details.'] as [string,string])));
 }
 async function confirm(){
  if(!active||!confirmation||submitting.current||confirmation.token!==betaSession()?.token||confirmation.price.creditsAfter<0)return;
  submitting.current=true;setBusy(true);setError('');
  try{await onReady(confirmation.project,confirmation.price);}catch(e){showError(e);}
  finally{setConfirmation(undefined);submitting.current=false;setBusy(false);}
 }
 const companyFields:[FooterField,string,string][]=[['company',t('회사명','Company'),'셀업랩스'],['contact',t('연락처','Phone'),'010-0000-0000'],['email',t('이메일 주소','Email'),'hello@brand.com'],['website',t('홈페이지','Website'),'https://www.brand.com']];
 return <div className="create-page consumer-create">
  <div className="create-heading"><h1>{t('광고 만들기','Create an ad')}</h1><p>{t('사진과 정보로 만드는 광고','Create ads with photos and details')}</p></div>
  <form onSubmit={e=>{e.preventDefault();void submit();}}>
   <section className="creation-section" data-order="1"><h2><span>1</span>{t('광고할 분야','Your industry')}</h2>
    <AdFieldPicker id={id+'-industry'} initialKind={initialKind} project={project} chosen={chosen} onChosen={setChosen} change={change}/>
   </section>
   <section className="creation-section" data-order="2"><details className="optional-block"><summary><span className="section-title"><b>2</b>{t('회사 정보','Company details')}</span><small>{t('선택','Optional')}</small></summary><p className="help">{t('입력한 정보만 광고에 표시합니다.','Only the details you enter will appear on the ad.')}</p><div className="company-fields">{companyFields.map(([field,label,placeholder])=><div className="field company-field" key={field}><label htmlFor={id+'-'+field}>{label}</label><input id={id+'-'+field} type={field==='email'?'email':field==='contact'?'tel':'text'} maxLength={field==='company'?80:field==='website'?200:100} placeholder={placeholder} value={copy[field]??''} onChange={e=>setCopy(field,e.target.value)}/><label className="company-visible"><input type="checkbox" aria-label={label+t(' 광고에 표시',' shown on ad')} checked={project.footer?.[field]??true} onChange={e=>change(p=>({...p,footer:{company:p.footer?.company??true,contact:p.footer?.contact??true,email:p.footer?.email??true,website:p.footer?.website??true,[field]:e.target.checked}}))}/>{t('광고에 표시','Show on ad')}</label></div>)}</div></details></section>
   <section className="creation-section" data-order="3" id={id+'-photos'} tabIndex={-1}><h2><span>3</span>{t('사진 첨부','Add photos')}{isServiceCategory(project.productProfile.category)&&<small>{t('선택','Optional')}</small>}</h2><div hidden={example}><PhotoUsage project={project} change={change}/><ReferencePhotos project={project} change={change} onBusyChange={setBusy} onIssueChange={setPhotoImportIssue}/></div></section>
   <section className="creation-section" data-order="4"><h2><span>4</span>{t('상품 규격','Product dimensions')}<small>{t('선택','Optional')}</small></h2>
    {service?<p className="help">{t('서비스 광고는 규격 없이 만듭니다.','Service ads do not need product dimensions.')}</p>:<><div className="simple-choice" role="group" aria-label={t('규격 입력 여부','Use dimensions')}>{[false,true].map(on=><button type="button" key={String(on)} aria-pressed={!!axes.length===on} onClick={()=>change(p=>({...p,productProfile:{...p.productProfile,specType:on?'rectangular':'none'},generation:{...p.generation,dimensionBased:false,planarSourceHash:undefined},dimensions:{...p.dimensions,visible:on,lines:false},...(!on?{dimensionControl:undefined}:{}),...(!on&&p.dimensionAnnotation?{dimensionAnnotation:{...p.dimensionAnnotation,mode:'none' as const}}:{})}))}>{on?t('규격 넣기','Add dimensions'):t('규격 없이','No dimensions')}</button>)}</div>{!!axes.length&&<div className="dimension-form"><label className="field">{t('상품 형태','Product shape')}<select aria-label={t('규격 형식','Dimension type')} value={project.productProfile.specType} onChange={e=>change(p=>({...p,productProfile:{...p.productProfile,specType:e.target.value as SpecType},generation:{...p.generation,planarSourceHash:undefined,dimensionBasis:'outer-body'}}))}><option value="rectangular">{t('가로 · 세로 · 높이','Width · Depth · Height')}</option><option value="flat">{t('가로 · 세로','Width · Depth')}</option><option value="cylindrical">{t('지름 · 높이','Diameter · Height')}</option></select></label><DimensionInputs project={project} change={change}/>{!project.dimensionControl&&project.generation.mode==='creative'&&<DimensionDisplayChoice project={project} change={change} disabled={example}/>}{!example&&project.generation.mode==='creative'&&(new URLSearchParams(location.search).get('dimensionProof')==='1'||project.dimensionControl)&&<DimensionControlChoice project={project} change={change}/>}{!project.dimensionControl&&<label className="check-field"><input type="checkbox" checked={project.dimensions.visible} onChange={e=>change(p=>({...p,dimensions:{...p.dimensions,visible:e.target.checked},...(!e.target.checked&&p.dimensionAnnotation?{dimensionAnnotation:{...p.dimensionAnnotation,mode:'none' as const}}:{})}))}/>{t('광고에 규격 표시','Show dimensions on ad')}</label>}<p className="help">{t('입력 규격은 숫자·치수선 표시에 사용하며 사진 속 상품의 형태를 변경하는 기준으로 사용하지 않습니다. 수치와 치수선 위치는 결과에서 직접 확인해주세요.','Dimensions are for numeric labels and arrows, not for reshaping the photographed product. Review values and arrow placement in the result.')}</p></div>}</>}
   </section>
   <section className="creation-section" data-order="5"><h2><span>5</span>{t('상품·서비스 상세설명','Product or service details')}</h2><label className="field">{service?t('서비스명','Service name'):t('상품명','Product name')}<input id={id+'-name'} maxLength={100} value={project.productName} placeholder={service?t('예: 제주 감성 숙소','Example: Jeju boutique stay'):t('예: 탄력케어 리프팅 3종세트','Example: Firming lift care 3-piece set')} onChange={e=>change(p=>({...p,productName:e.target.value}))}/></label><label className="field">{t('상세설명','Description')}<textarea id={id+'-description'} rows={4} maxLength={2000} value={project.productProfile.material} placeholder={t('재질, 특징, 장점, 가격, 배송 등 광고에 담을 정보를 적어주세요.','Describe the material, features, benefits, price and delivery information.')} onChange={e=>change(p=>({...p,productProfile:{...p.productProfile,material:e.target.value}}))}/></label><label className="field">{t('추가 요청','Additional requests')}<textarea rows={2} maxLength={600} value={settings.note} placeholder={t('원하는 연출이나 강조할 내용을 적어주세요 (선택)','Describe the look or details you want to highlight (optional)')} onChange={e=>change(p=>withCreative(p,{note:e.target.value}))}/></label><InputExampleGuide kind="facts" service={service}/></section>
   <section className="creation-section" data-order="6"><h2><span>6</span>{t('광고 문구','Advertising copy')}</h2><div className="simple-choice" role="group" aria-label={t('광고 문구 작성 방식','Copy mode')}>{(['ai','manual'] as const).map(mode=><button type="button" key={mode} aria-pressed={copyMode===mode} onClick={()=>change(p=>withCreative(p,{copyMode:mode}))}>{mode==='ai'?(project.dimensionControl?t('문구 초안 사용','Use draft copy'):t('AI가 만들기','Let AI write it')):t('직접 입력','Write my own')}</button>)}</div>{copyMode==='ai'?<p className="help">{project.dimensionControl?t('입력 내용의 문구 초안을 검증용 화면에 사용합니다. AI 문구 생성은 실행하지 않습니다.','Use a draft from your inputs for the proof. AI copy generation is not executed.'):t('상세설명을 바탕으로 AI가 광고 제목과 문구를 함께 만듭니다.','AI writes the headline and supporting copy from your description.')}</p>:<><label className="field">{t('광고 제목','Ad headline')}<textarea rows={2} maxLength={400} value={copy.title} onChange={e=>setCopy('title',e.target.value)}/></label><InputExampleGuide kind="headline" service={service}/><label className="field">{t('광고 설명','Ad supporting copy')}<textarea rows={3} maxLength={400} value={copy.description} onChange={e=>setCopy('description',e.target.value)}/></label><InputExampleGuide kind="copy" service={service}/></>}</section>
   <section className="creation-section" data-order="7"><h2><span>7</span>{t('광고 목적','Ad purpose')}<small>{t('선택','Optional')}</small></h2><label className="field">{t('목적 선택','Choose a purpose')}<select value={settings.directionId} onChange={e=>change(p=>withCreative(p,{directionId:e.target.value as 'brand'|'offer'|'trust'}))}><option value="brand">{t('AI가 정하기','Let AI decide')}</option><option value="offer">{t('상품·서비스 홍보','Promote the offer')}</option><option value="trust">{t('브랜드·신뢰 강조','Build brand trust')}</option></select></label></section>
   <section className="creation-section" data-order="8"><h2><span>8</span>{t('광고 이미지 비율','Image ratio')}<small>{t('선택','Optional')}</small></h2><label className="field">{t('출력 비율','Output ratio')}<select value={project.format} onChange={e=>change(p=>({...p,format:e.target.value as Project['format']}))}>{imageFormats.map(f=><option key={f.id} value={f.id}>{f.id} · {text(f.use)}</option>)}</select></label><label className="field">{t('광고 문구 언어','Ad copy language')}<select value={project.locale} onChange={e=>change(p=>({...p,locale:e.target.value as 'ko'|'en'}))}><option value="ko">한국어</option><option value="en">English</option></select></label></section>
   {!project.dimensionControl&&<section className="creation-section" data-order="9"><h2><span>9</span><strong>{t('생성 장수','Number of images')}</strong></h2><div className="image-count-options" role="group" aria-label={t('생성 장수','Number of images')}>{imageCounts.map(count=><button type="button" key={count} aria-pressed={(project.requestedImageCount??1)===count} onClick={()=>change(p=>({...p,requestedImageCount:count}))}>{count}</button>)}</div></section>}
   {error&&<p className={'wizard-error'+(photoImportIssue&&error===photoImportIssue?' photo-upload-error':'')} role="alert">{error}</p>}
   <div className="wizard-actions"><button className="primary-action" type="submit" disabled={busy}><Sparkles size={18}/>{busy?t('준비 중…','Preparing…'):project.dimensionControl?t('기하 검증 이미지 만들기','Create geometry proof'):t('광고 생성','Generate ad')}</button></div>{!project.dimensionControl&&creditStatus?.wallet.unlimited&&<p className="help submit-help">{t('관리자 테스트 · 차감 없음','Administrator test · no charge')}</p>}
  </form>
  {confirmation&&active&&<BatchConfirmation price={confirmation.price} busy={busy} onConfirm={()=>void confirm()} onClose={()=>setConfirmation(undefined)}/>}
 </div>;
}
